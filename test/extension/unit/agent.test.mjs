// The agent loop with the real SDK (@anthropic-ai/sdk) streaming from the in-process mock API,
// and a fake executor. The mock validates every request like the API, including append-only
// history and thinking blocks replayed unchanged after the same prefix.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClaudeMock, TEST_API_KEY, HALT_TEXT } from '../mock/claude-mock.mjs';
import { runTask, STOPPED_TEXT, TAKEOVER_TEXT, CUTOFF_TEXT, TAKEOVER_NOTE } from '../../../extension/src/background/agent.js';
import { createClient, buildParams, BETA_FALLBACK, BETA_UPDATES } from '../../../extension/src/background/api.js';
import { Conversation } from '../../../extension/src/background/history.js';
import { Limits } from '../../../extension/src/background/limits.js';
import { Approvals } from '../../../extension/src/background/guard.js';
import { memberResult } from '../../../extension/src/background/executor.js';
import { systemPrompt, taskMessage, tools } from '../../../extension/src/background/prompts.js';

function fakeExecutor(behaviour = {}) {
  const calls = [];
  return {
    calls,
    async run(block, ctx) {
      calls.push(block.name);
      const fn = behaviour[block.name];
      const out = fn ? await fn(block, ctx) : { ok: true, text: `Did ${block.name}.` };
      if (ctx.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      const st = { type: 'browser_state', tabs: [{ tab_id: 'tab-1', title: 'Shop', url: 'https://shop.example/', active: true }] };
      const tabOp = ['new_tab', 'list_tabs', 'switch_tab', 'close_tab'].includes(block.name);
      const content = out.ok ? (tabOp ? [st] : [{ type: 'text', text: out.text }, st]) : out.text;
      return { ok: out.ok, result: memberResult(block.id, content, !out.ok), label: block.name, error: out.ok ? undefined : out.text };
    },
  };
}

function setup({ mock = createClaudeMock(), executor = fakeExecutor(), limits = {}, ask, confirm, conversation } = {}) {
  const steps = [];
  const removed = [];
  const injections = [];
  const control = { takeover: false, epoch: 0, resume: null, ac: new AbortController() };
  const env = {
    client: createClient({ apiKey: TEST_API_KEY, baseURL: 'http://mock.local', fetch: mock.fetch }),
    model: 'claude-sonnet-5-5',
    system: systemPrompt({ platform: 'mac' }),
    tools: tools(),
    conversation: conversation || new Conversation({ id: 'c1' }),
    executor,
    limits: new Limits(limits),
    features: {},
    get signal() {
      return control.ac.signal;
    },
    approvals: new Approvals(),
    ask: ask || (async () => 'continue'),
    confirm: confirm || (async () => true),
    site: () => 'shop.example',
    takeoverRequested: () => control.takeover,
    takeoverEpoch: () => control.epoch,
    waitForResume: () => (control.takeover ? new Promise((r) => (control.resume = r)) : Promise.resolve()),
    emit: {
      step: (s) => {
        const id = `st${steps.length}`;
        steps.push({ ...s, id });
        return id;
      },
      update: (id, patch) => Object.assign(steps.find((s) => s.id === id) || {}, patch),
      remove: (id) => removed.push(id),
      narration: () => {},
      usage: () => {},
      injection: (i) => injections.push(i),
      notice: (text) => steps.push({ kind: 'notice', label: text }),
    },
  };
  return { mock, env, steps, removed, injections, control, executor };
}

const task = (text) => taskMessage(text, { now: new Date('2026-11-19T12:00:00Z'), startTab: { toolId: 'tab-1', title: 'Shop', url: 'https://shop.example/' } });
const noViolations = (mock) => assert.deepEqual(mock.violations.filter((v) => v.status !== 0).map((v) => v.message), []);

test('a task runs to its answer; every request extends the last one (append-only)', async () => {
  const { mock, env, executor } = setup();
  mock.script([() => ({ update: 'Reading.', calls: [{ name: 'read_page', input: { filter: 'interactive' } }] }), () => ({ calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: 'ref_1' } } }] }), () => ({ answer: 'All done.' })]);
  const out = await runTask(env, task('Do the thing'));
  assert.equal(out.status, 'done');
  assert.equal(out.answer, 'All done.');
  assert.deepEqual(executor.calls, ['read_page', 'left_click']);
  assert.deepEqual(env.conversation.messages.map((m) => m.role), ['user', 'assistant', 'user', 'assistant', 'user', 'assistant']);
  assert.equal(mock.requests.length, 3);
  noViolations(mock);
  // The thinking blocks went back unchanged.
  const firstAssistant = env.conversation.messages[1].content;
  assert.equal(firstAssistant[0].type, 'thinking');
  assert.match(firstAssistant[0].signature, /^sig_/);
});

test('request shape: adaptive thinking, caching, betas, no sampling parameters or forced tools', () => {
  const p = buildParams({ model: 'claude-sonnet-5-5', system: 'S', tools: tools(), messages: [] });
  assert.deepEqual(p.thinking, { type: 'adaptive', display: 'updates' });
  assert.deepEqual(p.cache_control, { type: 'ephemeral' });
  assert.deepEqual(p.system, [{ type: 'text', text: 'S', cache_control: { type: 'ephemeral' } }]);
  assert.deepEqual(p.betas.sort(), [BETA_FALLBACK, BETA_UPDATES].sort());
  assert.equal(p.fallbacks, 'default');
  assert.equal(p.output_config.effort, 'medium');
  for (const k of ['temperature', 'top_p', 'top_k', 'tool_choice']) assert.ok(!(k in p), k);
  const haiku = buildParams({ model: 'claude-haiku-5-5', system: 'S', tools: tools(), messages: [] });
  assert.equal(haiku.thinking.display, 'omitted');
  assert.equal(haiku.betas, undefined);
  const off = buildParams({ model: 'claude-opus-5-5', system: 'S', tools: tools(), messages: [], features: { updates: false, fallbacks: false } });
  assert.equal(off.betas, undefined);
  assert.equal(off.thinking.display, 'omitted');
});

test('the system prompt and tools stay byte-identical across tasks (cached prefix)', () => {
  assert.equal(systemPrompt({ platform: 'mac' }), systemPrompt({ platform: 'mac' }));
  assert.equal(JSON.stringify(tools()), JSON.stringify(tools()));
  assert.doesNotMatch(systemPrompt(), /\d{4}-\d\d-\d\d|today/i, 'no date in the system prompt');
  const t = tools();
  assert.equal(t[0].type, 'browser_toolset_20260801');
  assert.ok(t.slice(1).every((x) => x.strict === true && x.input_schema.additionalProperties === false));
});

test('pause_turn: the paused content is sent back and appended once, with its continuation', async () => {
  const { mock, env } = setup();
  mock.script([() => ({ say: 'Working on it.', stop: 'pause_turn' }), () => ({ answer: 'Finished.' })]);
  const out = await runTask(env, task('Long job'));
  assert.equal(out.answer, 'Finished.');
  const second = mock.requests[1].body.messages;
  assert.equal(second.at(-1).role, 'assistant', 'the paused turn is the last message of the continuation');
  assert.deepEqual(env.conversation.messages.map((m) => m.role), ['user', 'assistant', 'assistant']);
  noViolations(mock);
});

test('refusal: nothing is appended and the task ends with an error', async () => {
  const { mock, env } = setup();
  mock.script([() => ({ say: 'Partial', stop: 'refusal' })]);
  const out = await runTask(env, task('Something odd'));
  assert.equal(out.status, 'error');
  assert.match(out.error, /declined to continue/);
  assert.equal(env.conversation.length, 1);
});

test('a failed call stops the batch; later calls get the exact halt text and never run', async () => {
  const executor = fakeExecutor({ left_click: () => ({ ok: false, text: 'Error: ref_3 is stale or not found on the current page. Re-read the page to get fresh references.' }) });
  const { mock, env } = setup({ executor });
  let seen;
  mock.script([
    () => ({ calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: 'ref_3' } } }, { name: 'type', input: { text: 'x' } }, { name: 'key', input: { text: 'Enter' } }] }),
    (ctx) => {
      seen = ctx.results;
      return { answer: 'ok' };
    },
  ]);
  await runTask(env, task('Click'));
  assert.deepEqual(executor.calls, ['left_click']);
  assert.deepEqual(seen.map((r) => [r.isError, r.text.slice(0, 30)]), [
    [true, 'Error: ref_3 is stale or not f'],
    [true, HALT_TEXT.slice(0, 30)],
    [true, HALT_TEXT.slice(0, 30)],
  ]);
  noViolations(mock);
});

test('Stop during a batch answers every call; the next task continues from a valid history', async () => {
  let control;
  const executor = fakeExecutor({
    type: async () => {
      control.ac.abort();
      return { ok: true, text: 'typed' };
    },
  });
  const s = setup({ executor });
  control = s.control;
  s.mock.script([() => ({ calls: [{ name: 'left_click', input: { target: { type: 'coordinate', x: 1, y: 1 } } }, { name: 'type', input: { text: 'x' } }, { name: 'key', input: { text: 'Enter' } }] })]);
  await assert.rejects(runTask(s.env, task('Go')), (e) => e.name === 'AbortError');
  const last = s.env.conversation.last();
  assert.equal(last.role, 'user');
  assert.deepEqual(last.content.map((b) => b.content === HALT_TEXT ? 'HALT' : b.content === STOPPED_TEXT ? 'STOPPED' : 'ok'), ['ok', 'STOPPED', 'HALT']);
  // A follow-up task on the same conversation is accepted by the (strict) mock.
  control.ac = new AbortController();
  s.mock.script([() => ({ answer: 'Still here.' })]);
  const out = await runTask(s.env, task('Are you there?'));
  assert.equal(out.answer, 'Still here.');
  noViolations(s.mock);
});

test('max_tokens in the middle of a tool call: the call is answered, never run, and Claude carries on', async () => {
  const { mock, env, executor } = setup();
  let seen;
  mock.script([
    () => ({ calls: [{ name: 'left_click', input: { target: { type: 'coordinate', x: 5, y: 5 } } }], stop: 'max_tokens' }),
    (ctx) => {
      seen = ctx.results;
      return { answer: 'Recovered.' };
    },
  ]);
  const out = await runTask(env, task('Click'));
  assert.equal(out.answer, 'Recovered.');
  assert.deepEqual(executor.calls, []);
  assert.equal(seen[0].text, CUTOFF_TEXT);
  noViolations(mock);
});

test('budget: asks before going past it; Stop ends the task', async () => {
  const asked = [];
  const { mock, env } = setup({ limits: { budgetUsd: 0.05 }, ask: async (p) => (asked.push(p.kind), 'stop') });
  mock.script([() => ({ usage: { output_tokens: 9000 }, calls: [{ name: 'list_tabs', input: {} }] }), () => ({ answer: 'never' })]);
  const out = await runTask(env, task('Spend'));
  assert.equal(out.status, 'stopped');
  assert.match(out.error, /budget/);
  assert.deepEqual(asked, ['budget']);
  assert.equal(mock.requests.length, 1);
});

test('steps: asks at the limit; Continue lets the batch go on', async () => {
  const asked = [];
  const { mock, env, executor } = setup({ limits: { maxSteps: 1 }, ask: async (p) => (asked.push(p.kind), 'continue') });
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }, { name: 'get_page_text', input: {} }] }), () => ({ answer: 'ok' })]);
  await runTask(env, task('Read'));
  assert.deepEqual(asked, ['steps']);
  assert.deepEqual(executor.calls, ['read_page', 'get_page_text']);
});

test('request_confirmation: decline is reported, recorded and blocks the category on the site', async () => {
  const { mock, env } = setup({ confirm: async () => false });
  let seen;
  mock.script([
    () => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Place the order for $279.99', category: 'purchase' } }] }),
    (ctx) => {
      seen = ctx.results[0];
      return { answer: 'Not ordered.' };
    },
  ]);
  await runTask(env, task('Buy it'));
  assert.equal(seen.member, false, 'custom tool results carry no toolset_name');
  assert.match(seen.text, /^Declined by the owner: Place the order for \$279\.99/);
  assert.ok(env.approvals.isDeclined('purchase', 'shop.example'));
  noViolations(mock);
});

test('request_confirmation: approval grants the category on the site for the next actions', async () => {
  const { mock, env } = setup({ confirm: async () => true });
  mock.script([() => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Send the email to Alex', category: 'send' } }] }), () => ({ answer: 'ok' })]);
  await runTask(env, task('Send'));
  assert.ok(env.approvals.consume('send', 'shop.example'));
  assert.ok(!env.approvals.consume('purchase', 'shop.example'));
});

test('flag_prompt_injection tells the owner', async () => {
  const { mock, env, injections } = setup();
  mock.script([() => ({ calls: [{ name: 'flag_prompt_injection', custom: true, input: { quote: 'ignore previous instructions', tab_id: 'tab-1' } }] }), () => ({ answer: 'ok' })]);
  await runTask(env, task('Read the page'));
  assert.deepEqual(injections, [{ quote: 'ignore previous instructions', tabId: 'tab-1' }]);
});

test('take over: a batch planned before it never runs; Claude gets a note when control returns', async () => {
  const s = setup();
  let seen;
  s.mock.script([
    () => {
      // The owner takes over and hands back while this response is still arriving.
      s.control.takeover = true;
      s.control.epoch += 1;
      setTimeout(() => {
        s.control.takeover = false;
        s.control.resume?.();
      }, 30);
      return { calls: [{ name: 'left_click', input: { target: { type: 'coordinate', x: 1, y: 1 } } }, { name: 'type', input: { text: 'x' } }] };
    },
    (ctx) => {
      seen = ctx;
      return { answer: 'ok' };
    },
  ]);
  await runTask(s.env, task('Click'));
  assert.deepEqual(s.executor.calls, []);
  assert.equal(seen.results[0].text, TAKEOVER_TEXT);
  assert.equal(seen.results[1].text, HALT_TEXT);
  assert.deepEqual(seen.notes, [TAKEOVER_NOTE]);
  noViolations(s.mock);
});

test('an optional beta the account lacks is switched off and the request retried', async () => {
  const { mock, env } = setup();
  mock.rejectBetas = [BETA_UPDATES];
  mock.script([() => ({ answer: 'Works without it.' })]);
  const out = await runTask(env, task('Hi'));
  assert.equal(out.answer, 'Works without it.');
  assert.equal(env.features.updates, false);
  const ok = mock.requests.find((r) => r.status === 200);
  assert.equal(ok.body.thinking.display, 'omitted');
});

test('API errors end the task with a message for the owner', async () => {
  const { mock, env } = setup();
  mock.script([() => ({ error: { status: 401, type: 'authentication_error', message: 'invalid x-api-key' } })]);
  const out = await runTask(env, task('Hi'));
  assert.equal(out.status, 'error');
  assert.match(out.error, /API key was rejected/);
});

test('progress notes become steps; text of the final answer is not left as a note', async () => {
  const { mock, env, steps, removed } = setup();
  mock.script([() => ({ update: 'Checking the cart.', calls: [{ name: 'list_tabs', input: {} }] }), () => ({ answer: 'Your cart has one item.' })]);
  await runTask(env, task('Check the cart'));
  const notes = steps.filter((s) => s.kind === 'note');
  assert.ok(notes.some((n) => n.label === 'Checking the cart.'));
  const answerNote = notes.find((n) => /one item/.test(n.label));
  assert.ok(answerNote && removed.includes(answerNote.id), 'the answer’s live note is removed');
});

// ---------------------------------------------------------------------------------------------
// Review fixes (function review F2, F6, F9, F12; safety review S3, S9)

test('F2: Cancel on request_confirmation stops the batch: nothing after it runs', async () => {
  const { mock, env, executor } = setup({ confirm: async () => false });
  let seen;
  mock.script([
    () => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Buy the Dell for $279.99 with Get it now', category: 'purchase' } }, { name: 'left_click', input: { target: { type: 'ref', ref: 'ref_1' } } }, { name: 'key', input: { text: 'Enter' } }] }),
    (ctx) => {
      seen = ctx.results;
      return { answer: 'Not bought.' };
    },
  ]);
  await runTask(env, task('Buy it'));
  assert.deepEqual(executor.calls, [], 'the batched click and key never ran');
  assert.match(seen[0].text, /^Declined by the owner/);
  assert.deepEqual(seen.slice(1).map((r) => [r.isError, r.text]), [[true, HALT_TEXT], [true, HALT_TEXT]]);
  noViolations(mock);
});

test('S3/S9: an approval is for one action on the page Jarvis is on; none is asked while no site is open', async () => {
  const asked = [];
  const { mock, env } = setup({ confirm: async (q) => (asked.push(q), true) });
  env.scope = () => ({ site: 'shop.example', url: 'https://shop.example/product/dell', tabId: 'tab-1' });
  let seen;
  mock.script([
    () => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Buy the Dell S2721QS for $279.99 with Buy now', category: 'purchase' } }] }),
    (ctx) => {
      seen = ctx.results[0];
      return { answer: 'ok' };
    },
  ]);
  await runTask(env, task('Buy'));
  assert.match(seen.text, /^Approved by the owner: .*Go ahead with exactly this one action, on this page, now\. The approval covers only this action/);
  assert.doesNotMatch(seen.text, /two minutes|next couple of minutes/);
  assert.equal(asked[0].site, 'shop.example', 'the site is read before asking');
  assert.equal(env.approvals.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/lg', label: 'Buy now' }), false, 'not on another product page');
  assert.equal(env.approvals.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/dell', label: 'Buy now' }), true);
  assert.equal(env.approvals.consume('purchase', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/product/dell', label: 'Buy now' }), false, 'once');

  // From a blank tab: an error for Claude, no prompt for the owner, nothing granted.
  const blank = setup({ confirm: async (q) => (asked.push(q), true) });
  blank.env.scope = () => ({ site: '', url: '', tabId: '' });
  let err;
  blank.mock.script([
    () => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Sign up for the free newsletter', category: 'purchase' } }] }),
    (ctx) => {
      err = ctx.results[0];
      return { answer: 'ok' };
    },
  ]);
  await runTask(blank.env, task('Sign me up'));
  assert.equal(err.isError, true);
  assert.match(err.text, /no website is open/);
  assert.equal(asked.length, 1, 'the owner was not asked');
  assert.equal(blank.env.approvals.live().length, 0);
});

test('F6: a reply cut off in its thinking continues in a new user turn (never a prefill), with more room', async () => {
  const { mock, env } = setup();
  mock.script([() => ({ stop: 'max_tokens' }), () => ({ answer: 'Recovered.' })]);
  const out = await runTask(env, task('Think hard'));
  assert.equal(out.status, 'done');
  assert.equal(out.answer, 'Recovered.');
  const second = mock.requests[1].body;
  assert.equal(second.messages.at(-1).role, 'user', 'the request ends with a user message');
  assert.match(second.messages.at(-1).content[0].text, /hit the output limit/);
  assert.ok(second.max_tokens > mock.requests[0].body.max_tokens, 'with a larger output cap');
  noViolations(mock);
});

test('F6: a text reply cut off at the output limit is continued, and never reported as a clean answer', async () => {
  const { mock, env } = setup();
  mock.script([() => ({ answer: 'I will now click the Add to cart button and then', stop: 'max_tokens' }), () => ({ answer: 'check the cart total.' })]);
  const out = await runTask(env, task('Add it'));
  assert.equal(out.status, 'done');
  assert.equal(out.answer, 'I will now click the Add to cart button and then check the cart total.');
  noViolations(mock);
  const again = setup();
  again.mock.script([() => ({ answer: 'Part one and', stop: 'max_tokens' }), () => ({ answer: 'part two and', stop: 'max_tokens' })]);
  const cut = await runTask(again.env, task('Long answer'));
  assert.notEqual(cut.status, 'done');
  assert.match(cut.error, /cut off/);
  assert.equal(cut.answer, 'Part one and part two and');
});

test('F9: retry notices say what happens without telling the owner to press Retry, and honour retry-after', async () => {
  const { mock, env, steps } = setup();
  env.retryDelaysMs = [5, 5, 5];
  let n = 0;
  mock.script(() => (n++ === 0 ? { error: { status: 429, type: 'rate_limit_error', message: 'Number of request tokens has exceeded your per-minute rate limit', retryAfter: 1 } } : { answer: 'Fine now.' }));
  const t0 = Date.now();
  const out = await runTask(env, task('Hi'));
  assert.equal(out.answer, 'Fine now.');
  assert.ok(Date.now() - t0 >= 950, `waited for retry-after (${Date.now() - t0} ms)`);
  const notes = steps.filter((s) => s.kind === 'notice').map((s) => s.label);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /rate limit was reached\. Jarvis tries again in 1 s/);
  assert.doesNotMatch(notes[0], /press Retry/i);
  assert.equal(mock.requests.length, 2, 'the SDK does not retry silently on its own');
});

test('F12: a request cut short by Stop still counts what it was billed for', async () => {
  const { mock, env, control } = setup();
  mock.script([() => ({ calls: [{ name: 'list_tabs', input: {} }] }), () => ({ hold: true })]);
  const running = runTask(env, task('Go'));
  while (mock.requests.length < 2) await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 50));
  const afterFirst = env.limits.cost;
  control.ac.abort();
  await assert.rejects(running, (e) => e.name === 'AbortError');
  assert.ok(env.limits.cost > afterFirst, `the second request's input is counted (${afterFirst} -> ${env.limits.cost})`);
});

test('F6: a model that allows less output than Jarvis asks for gets the cap it names', async () => {
  const { mock, env } = setup();
  mock.script((ctx) => (ctx.body.max_tokens > 16000 ? { error: { status: 400, type: 'invalid_request_error', message: `max_tokens: ${ctx.body.max_tokens} > 16000, which is the maximum allowed number of output tokens for claude-sonnet-5-5` } } : { answer: 'Fits.' }));
  const out = await runTask(env, task('Hi'));
  assert.equal(out.answer, 'Fits.');
  assert.equal(mock.requests.at(-1).body.max_tokens, 16000);
});
