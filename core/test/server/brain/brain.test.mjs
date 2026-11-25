// node --test: the home base brain against a local fake Claude API (no real API, no internet).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startFakeClaude, text, search, toolUse, cite, thinking } from './fake-claude.mjs';
import { makeBrain, until, tmp, filesUnder, KEY, TZ, MORNING } from './helpers.mjs';
import { responseCost, tokenCost } from '../../../server/brain/prices.mjs';
import { createManualClock } from '../../../server/clock.mjs';

const okKey = (brain) => brain.setKey({ key: KEY });

function researchAnswer(extra = '') {
  return {
    blocks: [
      thinking(),
      ...search('lg 27gp850 price', [{ url: 'https://www.example-shop.com/lg-27gp850', title: 'LG 27GP850 at Example Shop' }]),
      text(`Summary: The LG 27GP850 is $279 at Example Shop today.${extra}\n\n## Findings\n- Price $279 [Example Shop](https://www.example-shop.com/lg-27gp850)`, [cite('https://www.example-shop.com/lg-27gp850', 'LG 27GP850 at Example Shop')]),
    ],
    stop: 'end_turn',
    usage: { input_tokens: 10_000, output_tokens: 2_000 },
  };
}

test('cost math: the app\'s price table, cache, web searches, refusal fallbacks', () => {
  // Opus 5.5: $4 in, $20 out per million; Sonnet 5.5: $2 / $10; web search $0.01.
  assert.equal(tokenCost('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 24);
  assert.equal(tokenCost('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 }), 3);
  assert.equal(tokenCost('claude-haiku-5-5', { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 0.6);
  const cached = tokenCost('claude-sonnet-5-5', { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 });
  assert.equal(cached, 2.5 + 0.1);
  assert.equal(responseCost('claude-sonnet-5-5', { input_tokens: 10_000, output_tokens: 2_000, server_tool_use: { web_search_requests: 3 } }), 0.02 + 0.02 + 0.03);
  // After a server-side fallback each attempt is priced at its own model.
  const usage = {
    input_tokens: 1000,
    output_tokens: 100,
    server_tool_use: { web_search_requests: 1 },
    iterations: [
      { type: 'message', input_tokens: 1000, output_tokens: 50 },
      { type: 'fallback_message', model: 'claude-opus-4-8', input_tokens: 1000, output_tokens: 100 },
    ],
  };
  const expected = (1000 * 4 + 50 * 20) / 1e6 + (1000 * 5 + 100 * 25) / 1e6 + 0.01;
  assert.ok(Math.abs(responseCost('claude-opus-5-5', usage) - expected) < 1e-12);
  assert.equal(responseCost('claude-opus-5-5', null), 0);
  // Unknown models are priced as Opus 5.5 (never as free).
  assert.equal(tokenCost('claude-mystery', { input_tokens: 1_000_000 }), 4);
});

test('key vault: verified with GET /v1/models, stored 600 in a 700 folder, only a hint comes back, DELETE removes it', async () => {
  const fake = await startFakeClaude({ script: () => researchAnswer(), validKeys: [KEY] });
  const secrets = path.join(tmp(), 'secrets');
  const { brain, logs } = makeBrain({ fake, secretsDir: secrets });
  try {
    const r = await okKey(brain);
    assert.deepEqual(r, { ok: true, hint: '…Ab3D', verified: true });
    const file = path.join(secrets, 'anthropic.key');
    assert.equal(fs.readFileSync(file, 'utf8').trim(), KEY);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(secrets).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(secrets, 'anthropic.json')).mode & 0o777, 0o600);
    assert.ok(!fs.readFileSync(path.join(secrets, 'anthropic.json'), 'utf8').includes(KEY));
    const info = brain.info();
    assert.equal(info.key.set, true);
    assert.equal(info.key.hint, '…Ab3D');
    assert.equal(info.key.verified, true);
    assert.ok(!JSON.stringify(info).includes(KEY));
    assert.equal(fake.requests[0].path, '/v1/models');
    assert.equal(fake.requests[0].key, KEY);
    // A rejected key is refused and not stored.
    await assert.rejects(brain.setKey({ key: 'sk-ant-api03-WRONGWRONGWRONGWRONGWRONG' }), (e) => e.status === 400 && e.code === 'bad_key' && !e.message.includes('WRONG'));
    assert.equal(fs.readFileSync(file, 'utf8').trim(), KEY);
    await assert.rejects(brain.setKey({ key: 'not a key' }), (e) => e.code === 'bad_key');
    await assert.rejects(brain.setKey({}), (e) => e.code === 'bad_key');
    brain.deleteKey();
    assert.equal(fs.existsSync(file), false);
    assert.equal(brain.info().key.set, false);
    assert.ok(logs.every((l) => !l.includes(KEY) && !l.includes('WRONGWRONG')), 'no key in the logs');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('key vault offline: the key is stored with verified false', async () => {
  const { brain } = makeBrain({ fake: { url: 'http://127.0.0.1:9' } }); // nothing listens on port 9
  try {
    const r = await okKey(brain);
    assert.deepEqual(r, { ok: true, hint: '…Ab3D', verified: false });
    assert.equal(brain.info().key.set, true);
    assert.equal(brain.info().key.verified, false);
  } finally {
    await brain.stop();
  }
});

test('research: streamed with the SDK, web tools at the 20260209 versions, adaptive thinking, result with sources, cost, push', async () => {
  const fake = await startFakeClaude({ script: () => researchAnswer() });
  const { brain, push } = makeBrain({ fake });
  const events = [];
  brain.on('job', (j) => events.push(j));
  const spendEvents = [];
  brain.on('spend', (s) => spendEvents.push(s));
  try {
    await okKey(brain);
    const job = brain.createJob({ kind: 'research', prompt: 'What does the LG 27GP850 cost today?', depth: 'quick' });
    assert.equal(job.status, 'queued');
    assert.match(job.id, /^j_[a-z0-9]{12}$/);
    const done = await until(() => (brain.getJob(job.id).status === 'done' ? brain.getJob(job.id) : null), { what: 'job done' });
    assert.equal(done.summary, 'The LG 27GP850 is $279 at Example Shop today.');
    assert.match(done.result.markdown, /## Findings/);
    assert.ok(!done.result.markdown.includes('Summary:'));
    assert.deepEqual(done.result.sources, [{ title: 'LG 27GP850 at Example Shop', url: 'https://www.example-shop.com/lg-27gp850' }]);
    // 10k in + 2k out on Sonnet 5.5 + one search = 0.02 + 0.02 + 0.01
    assert.equal(done.costUsd, 0.05);
    assert.equal(brain.info().spend.todayUsd, 0.05);
    assert.ok(spendEvents.length >= 1);
    const req = fake.messageRequests[0];
    assert.equal(req.body.model, 'claude-sonnet-5-5');
    assert.deepEqual(req.body.thinking, { type: 'adaptive' });
    assert.equal(req.body.output_config.effort, 'medium');
    assert.deepEqual(req.body.tools.map((t) => t.type), ['web_search_20260209', 'web_fetch_20260209']);
    assert.equal(req.body.fallbacks, 'default');
    assert.match(String(req.headers['anthropic-beta']), /server-side-fallback-2026-07-01/);
    assert.match(req.body.system[0].text, /data, not instructions/);
    assert.match(req.body.messages[0].content[0].text, /<question>\nWhat does the LG 27GP850 cost today\?\n<\/question>/);
    assert.deepEqual(fake.violations, []);
    // Notification for the finished job, with the deep link.
    await until(() => push.sent.length === 1, { what: 'push' });
    assert.equal(push.sent[0].url, `https://frankwise0202-maker.github.io/jarvis/?homebase=job:${job.id}`);
    assert.equal(push.sent[0].tag, `job:${job.id}`);
    assert.match(push.sent[0].title, /Research ready/);
    // The list leaves the result out; events are compact.
    assert.equal(brain.listJobs({})[0].result, undefined);
    assert.ok(events.some((e) => e.status === 'running') && events.some((e) => e.status === 'done'));
    assert.ok(events.every((e) => e.result === undefined));
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('deep research uses Opus 5.5 at high effort; refusal, max_tokens and API errors are handled', async () => {
  let mode = 'ok';
  const fake = await startFakeClaude({
    script: (body) => {
      if (mode === 'refuse') return { blocks: [text('I')], stop: 'refusal', category: 'cyber' };
      if (mode === 'long') return { blocks: [text('Summary: Partial answer.\n\nSome text that was cut')], stop: 'max_tokens' };
      if (mode === 'error') return { status: 400, errorType: 'invalid_request_error', message: `bad thing near ${KEY}` };
      assert.equal(body.model, 'claude-opus-5-5');
      assert.equal(body.output_config.effort, 'high');
      return researchAnswer();
    },
  });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    const a = brain.createJob({ prompt: 'deep question', depth: 'deep' });
    await until(() => brain.getJob(a.id).status === 'done', { what: 'deep done' });
    mode = 'refuse';
    const b = brain.createJob({ prompt: 'refused question' });
    const fb = await until(() => (brain.getJob(b.id).status === 'failed' ? brain.getJob(b.id) : null), { what: 'refusal' });
    assert.equal(fb.error.code, 'refused');
    mode = 'long';
    const c = brain.createJob({ prompt: 'long question' });
    const fc = await until(() => (brain.getJob(c.id).status === 'done' ? brain.getJob(c.id) : null), { what: 'truncated' });
    assert.match(fc.result.markdown, /cut short/);
    mode = 'error';
    const d = brain.createJob({ prompt: 'error question' });
    const fd = await until(() => (brain.getJob(d.id).status === 'failed' ? brain.getJob(d.id) : null), { what: 'api error' });
    assert.equal(fd.error.code, 'bad_request');
    assert.ok(!JSON.stringify(fd).includes(KEY), 'the key never appears in a job error');
    assert.match(fd.error.message, /sk-ant-…/);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('pause_turn: the continuation resends the conversation with the paused content appended (and the container)', async () => {
  const fake = await startFakeClaude({
    script: (body, n) => {
      if (n === 0) return { blocks: [...search('first', [{ url: 'https://a.example/1', title: 'A' }])], stop: 'pause_turn', container: 'cntr_123', usage: { input_tokens: 5000, output_tokens: 100 } };
      return researchAnswer();
    },
  });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    const job = brain.createJob({ prompt: 'paused question' });
    const done = await until(() => (brain.getJob(job.id).status === 'done' ? brain.getJob(job.id) : null), { what: 'done after pause' });
    const [first, second] = fake.messageRequests;
    assert.equal(fake.messageRequests.length, 2);
    assert.equal(second.body.messages.length, 2);
    assert.equal(second.body.messages[1].role, 'assistant');
    assert.deepEqual(second.body.messages[1].content.map((b) => b.type), ['server_tool_use', 'web_search_tool_result']);
    assert.deepEqual(second.body.messages[0], first.body.messages[0]);
    assert.equal(second.body.container, 'cntr_123');
    assert.deepEqual(fake.violations, []);
    // Both responses are charged: (5000*2 + 100*10)/1e6 + 0.01 search + 0.05 for the answer.
    assert.equal(done.costUsd, 0.071);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('caps: a job over the daily cap is refused (402), a running job stops at the cap with what it has, queued ones are blocked', async () => {
  let slow = false;
  const fake = await startFakeClaude({
    script: () => {
      if (!slow) return researchAnswer();
      // A long answer whose live estimate crosses the cap mid-stream.
      return { blocks: [text(`Summary: Partial findings so far.\n\n${'Lots of detail. '.repeat(4000)}`)], stop: 'end_turn', usage: { input_tokens: 2000, output_tokens: 20_000 }, slowMs: 1 };
    },
  });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    await brain.putSettings({ limits: { dailyUsd: 0.2 } });
    const a = brain.createJob({ prompt: 'first' });
    await until(() => brain.getJob(a.id).status === 'done', { what: 'first job' });
    assert.equal(brain.info().spend.todayUsd, 0.05);
    slow = true;
    const b = brain.createJob({ prompt: 'second, long' });
    const c = brain.createJob({ prompt: 'third, queued behind' });
    const fb = await until(() => (['done', 'failed', 'blocked'].includes(brain.getJob(b.id).status) ? brain.getJob(b.id) : null), { what: 'stopped job' });
    assert.equal(fb.status, 'done');
    assert.equal(fb.stoppedEarly, 'daily');
    assert.match(fb.result.markdown, /today's spending limit/);
    assert.equal(fb.summary, 'Partial findings so far.');
    // The second request was sent with only what the $0.15 left can pay for.
    assert.ok(fake.messageRequests[1].body.max_tokens < 16_000, `max_tokens ${fake.messageRequests[1].body.max_tokens}`);
    assert.ok(brain.info().spend.todayUsd <= 0.2 + 0.002, `spent ${brain.info().spend.todayUsd}`);
    const fc = await until(() => (brain.getJob(c.id).status === 'blocked' ? brain.getJob(c.id) : null), { what: 'blocked job' });
    assert.equal(fc.error.code, 'spend_cap');
    assert.equal(brain.info().spend.capReached, 'daily');
    assert.throws(() => brain.createJob({ prompt: 'fourth' }), (e) => e.status === 402 && e.code === 'spend_cap');
    // The monthly cap is named first when both are reached.
    await brain.putSettings({ limits: { dailyUsd: 50, monthlyUsd: 0.01 } });
    assert.equal(brain.info().spend.capReached, 'monthly');
    // A cap of 0 means no background spending at all.
    await brain.putSettings({ limits: { dailyUsd: 0, monthlyUsd: 50 } });
    assert.throws(() => brain.createJob({ prompt: 'fifth' }), (e) => e.code === 'spend_cap');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

const finished = (j) => ['done', 'failed', 'blocked', 'cancelled'].includes(j?.status);

test('caps: a reply that is mostly thinking (no text on the stream) still stays under the cap: max_tokens fits the room', async () => {
  const fake = await startFakeClaude({
    script: (body) => ({
      // Opus 5.5 thinks with display "omitted": an empty thinking block, billed in full as output.
      blocks: [thinking(''), text('Summary: The answer, briefly.\n\nFindings.')],
      stop: 'end_turn',
      usage: { input_tokens: Math.ceil(JSON.stringify(body).length / 4), output_tokens: 32_000 },
    }),
  });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    await brain.putSettings({ limits: { dailyUsd: 0.25 } });
    const a = brain.createJob({ prompt: 'deep question', depth: 'deep' });
    const ja = await until(() => (finished(brain.getJob(a.id)) ? brain.getJob(a.id) : null), { what: 'deep job' });
    const sent = fake.messageRequests[0].body.max_tokens;
    assert.ok(sent >= 2000 && sent < 32_000, `max_tokens ${sent} is what the $0.25 left can pay for`);
    assert.ok(brain.info().spend.todayUsd <= 0.25, `spent ${brain.info().spend.todayUsd} of the $0.25 cap`);
    assert.equal(ja.status, 'done');
    assert.equal(ja.stoppedEarly, 'daily');
    assert.match(ja.result.markdown, /today's spending limit/);
    // Less room left than a useful request: nothing is sent and the job is blocked.
    const b = brain.createJob({ prompt: 'another deep question', depth: 'deep' });
    const jb = await until(() => (finished(brain.getJob(b.id)) ? brain.getJob(b.id) : null), { what: 'second job' });
    assert.equal(jb.status, 'blocked');
    assert.equal(jb.error.code, 'spend_cap');
    assert.equal(fake.messageRequests.length, 1);
    assert.deepEqual(fake.violations, []);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('caps: an input far larger than estimated stops the request before it writes; it is sent again to fit the cap', async () => {
  const fake = await startFakeClaude({
    script: () => ({
      blocks: [thinking(''), text('Summary: The answer, briefly.\n\nFindings.')],
      stop: 'end_turn',
      usage: { input_tokens: 20_000, output_tokens: 32_000 },
      slowMs: 5,
    }),
  });
  const { brain, logs } = makeBrain({ fake });
  try {
    await okKey(brain);
    await brain.putSettings({ limits: { dailyUsd: 0.25 } });
    const job = brain.createJob({ prompt: 'deep question', depth: 'deep' });
    const done = await until(() => (finished(brain.getJob(job.id)) ? brain.getJob(job.id) : null), { what: 'deep job' });
    const [first, second] = fake.messageRequests.map((r) => r.body.max_tokens);
    assert.equal(fake.messageRequests.length, 2);
    assert.ok(second < first, `sent again with a smaller max_tokens (${first} → ${second})`);
    assert.ok(brain.info().spend.todayUsd <= 0.25 + 0.001, `spent ${brain.info().spend.todayUsd} of the $0.25 cap`);
    assert.equal(done.status, 'done');
    assert.equal(done.stoppedEarly, 'daily');
    assert.ok(logs.some((l) => /more than estimated/.test(l)));
    assert.deepEqual(fake.violations, []);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('caps: the estimate grows while the model thinks in silence, and a timer stops the request at the cap', async () => {
  const fake = await startFakeClaude({
    script: () => ({
      blocks: [text('Summary: Early findings.\n\nThe first source says yes.'), ...search('more', [{ url: 'https://c.example/', title: 'C' }]), thinking('', { pauseMs: 4000 }), text('\n\nA long-thought conclusion.')],
      stop: 'end_turn',
      usage: { input_tokens: 1000, output_tokens: 9000 },
    }),
  });
  // 20,000 tokens a second stands in for a long silent think at 200 a second; checked every 50 ms.
  const { brain } = makeBrain({ fake, claudeTuning: { outputTokensPerSecond: 20_000, checkEveryMs: 50 } });
  try {
    await okKey(brain);
    await brain.putSettings({ limits: { dailyUsd: 0.1 } });
    const t0 = Date.now();
    const job = brain.createJob({ prompt: 'think hard about this' });
    const done = await until(() => (finished(brain.getJob(job.id)) ? brain.getJob(job.id) : null), { what: 'stopped while thinking', timeoutMs: 10_000 });
    assert.ok(Date.now() - t0 < 3000, `stopped during the 4 s think, not after it (${Date.now() - t0} ms)`);
    assert.equal(done.status, 'done');
    assert.equal(done.stoppedEarly, 'daily');
    assert.equal(done.summary, 'Early findings.');
    assert.ok(!done.result.markdown.includes('long-thought conclusion'));
    assert.ok(brain.info().spend.todayUsd <= 0.1 + 0.015, `spent ${brain.info().spend.todayUsd}`);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('caps: every server-tool round reads the conversation again; the request stops before the round that would cross', async () => {
  const hit = (q) => [{ url: `https://d.example/${q}`, title: `D ${q}` }];
  const fake = await startFakeClaude({
    script: () => ({
      blocks: [text('Summary: What the first searches found.\n\nDetails.'), ...search('one', hit(1)), ...search('two', hit(2)), ...search('three', hit(3)), ...search('four', hit(4)), text('\n\nThe end of the answer.')],
      stop: 'end_turn',
      // Five rounds, each reading the prompt and every result before it again: what the API bills.
      usage: { input_tokens: 5 * 3000 + 10 * 10_000, output_tokens: 1500 },
      startInputTokens: 3000,
      slowMs: 5,
    }),
  });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    await brain.putSettings({ limits: { dailyUsd: 0.15 } });
    const job = brain.createJob({ prompt: 'search a lot' });
    const done = await until(() => (finished(brain.getJob(job.id)) ? brain.getJob(job.id) : null), { what: 'stopped between rounds' });
    assert.equal(done.status, 'done');
    assert.equal(done.stoppedEarly, 'daily');
    assert.ok(!done.result.markdown.includes('The end of the answer'));
    assert.ok(brain.info().spend.todayUsd <= 0.15, `spent ${brain.info().spend.todayUsd} of the $0.15 cap`);
    assert.ok(brain.info().spend.todayUsd >= 0.05, 'the rounds that ran are counted');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('per-job budget: a quick research job never spends more than its budget', async () => {
  const fake = await startFakeClaude({
    script: () => ({ blocks: [...search('q', [{ url: 'https://b.example/', title: 'B' }])], stop: 'pause_turn', usage: { input_tokens: 150_000, output_tokens: 1000 } }),
  });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    const job = brain.createJob({ prompt: 'endless' });
    const done = await until(() => (['done', 'failed'].includes(brain.getJob(job.id).status) ? brain.getJob(job.id) : null), { what: 'budget stop' });
    // Each paused response costs 0.30 + 0.01 + 0.01; the budget ($0.75) stops it after the third.
    assert.ok(done.costUsd <= 0.75 + 0.33, `cost ${done.costUsd}`);
    assert.ok(fake.messageRequests.length <= 3);
    assert.equal(done.status, 'failed');
    assert.equal(done.error.code, 'budget');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('cancel: DELETE cancels a queued or running job (the stream is aborted), and removes a finished one', async () => {
  const fake = await startFakeClaude({ script: () => ({ ...researchAnswer(' '.repeat(2000)), slowMs: 20 }) });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    const a = brain.createJob({ prompt: 'running one' });
    const b = brain.createJob({ prompt: 'queued one' });
    await until(() => brain.getJob(a.id).status === 'running', { what: 'running' });
    const rb = brain.deleteJob(b.id);
    assert.equal(rb.cancelled, true);
    assert.equal(brain.getJob(b.id).status, 'cancelled');
    const ra = brain.deleteJob(a.id);
    assert.equal(ra.cancelled, true);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(brain.getJob(a.id).status, 'cancelled');
    const rr = brain.deleteJob(a.id);
    assert.equal(rr.removed, true);
    assert.equal(brain.getJob(a.id), null);
    assert.throws(() => brain.deleteJob('j_doesnotexist0'), (e) => e.status === 404);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('restart survival: queued and interrupted jobs come back after a restart and finish', async () => {
  let slow = true;
  const fake = await startFakeClaude({ script: () => (slow ? { ...researchAnswer('x'.repeat(3000)), slowMs: 30 } : researchAnswer()) });
  const data = tmp();
  const secrets = path.join(data, 'secrets');
  const first = makeBrain({ fake, dataDir: data, secretsDir: secrets });
  await okKey(first.brain);
  const watcher = first.brain.createWatcher({ what: 'a watcher that survives', every: '12h' });
  const a = first.brain.createJob({ prompt: 'interrupted by a restart' });
  const b = first.brain.createJob({ prompt: 'waiting in the queue' });
  await until(() => first.brain.getJob(a.id).status === 'running', { what: 'running' });
  await first.brain.stop();
  const saved = JSON.parse(fs.readFileSync(path.join(data, 'brain', 'jobs-v1.json'), 'utf8'));
  assert.equal(saved.jobs.find((j) => j.id === a.id).status, 'running');
  assert.equal(saved.jobs.find((j) => j.id === b.id).status, 'queued');
  for (const f of filesUnder(data)) assert.equal(fs.statSync(f).mode & 0o777, 0o600, `${f} is 600`);
  for (const f of filesUnder(data)) if (!f.endsWith('anthropic.key')) assert.ok(!fs.readFileSync(f, 'utf8').includes(KEY), `no key in ${f}`);
  slow = false;
  const second = makeBrain({ fake, dataDir: data, secretsDir: secrets });
  try {
    assert.equal(second.brain.info().key.set, true);
    assert.equal(second.brain.getJob(a.id).status, 'queued');
    assert.deepEqual(second.brain.listWatchers().map((w) => [w.id, w.what, w.every, w.status]), [[watcher.id, 'a watcher that survives', '12h', 'watching']]);
    second.brain.start();
    await until(() => second.brain.getJob(a.id).status === 'done' && second.brain.getJob(b.id).status === 'done', { what: 'both done after restart' });
  } finally {
    await second.brain.stop();
    await fake.close();
  }
});

test('watchers: not met keeps watching (next check 24 h ± jitter), met notifies once and stops', async () => {
  let met = false;
  const fake = await startFakeClaude({
    script: (body) => {
      assert.equal(body.model, 'claude-sonnet-5-5');
      assert.equal(body.output_config.effort, 'low');
      const report = body.tools.find((t) => t.name === 'report_check');
      assert.equal(report.eager_input_streaming, true);
      return {
        blocks: [...search('lg 27gp850 price', [{ url: 'https://shop.example/lg', title: 'Shop' }]), toolUse('report_check', { met, summary: met ? 'Now $289 at Shop.' : 'Still $329 at Shop.', sources: [{ title: 'Shop', url: 'https://shop.example/lg' }] })],
        stop: 'tool_use',
        usage: { input_tokens: 3000, output_tokens: 200 },
      };
    },
  });
  const clock = createManualClock(MORNING);
  const { brain, push } = makeBrain({ fake, clock });
  const events = [];
  brain.on('watcher', (w) => events.push(w));
  try {
    await okKey(brain);
    await brain.putSettings({ briefing: { enabled: false } }); // 07:00: keep the morning briefing out of this test
    const w = brain.createWatcher({ what: 'Tell me when the LG 27GP850 drops under $300', every: '24h' });
    assert.equal(w.status, 'watching');
    assert.match(w.id, /^w_[a-z0-9]{12}$/);
    clock.advance(31_000);
    brain.tick();
    await until(() => brain.listWatchers()[0].lastResult, { what: 'first check' });
    let cur = brain.listWatchers()[0];
    assert.equal(cur.status, 'watching');
    assert.deepEqual(cur.lastResult, { met: false, summary: 'Still $329 at Shop.', sources: [{ title: 'Shop', url: 'https://shop.example/lg' }] });
    const next = Date.parse(cur.nextCheckAt) - clock.now();
    assert.ok(next >= 24 * 3600_000 - 20 * 60_000 && next <= 24 * 3600_000 + 20 * 60_000, `next in ${next}`);
    assert.equal(push.sent.length, 0);
    // Not due yet: no new check.
    clock.advance(3600_000);
    brain.tick();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fake.messageRequests.length, 1, JSON.stringify(fake.violations));
    // Due: met this time.
    met = true;
    clock.set(Date.parse(cur.nextCheckAt) + 1000);
    brain.tick();
    await until(() => brain.listWatchers()[0].status === 'met', { what: 'met' });
    cur = brain.listWatchers()[0];
    assert.equal(cur.nextCheckAt, null);
    assert.equal(cur.checks, 2);
    assert.ok(cur.costUsd > 0);
    await until(() => push.sent.length === 1, { what: 'push' });
    assert.equal(push.sent[0].url, `https://frankwise0202-maker.github.io/jarvis/?homebase=watch:${w.id}`);
    assert.match(push.sent[0].body, /Now \$289/);
    assert.match(push.sent[0].title, /^Watcher: Tell me when the LG 27GP850 drops under \$300/);
    // A met watcher is not checked again.
    clock.advance(48 * 3600_000);
    brain.tick();
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(fake.messageRequests.length, 2);
    assert.ok(events.some((e) => e.status === 'met'));
    // Check now, validation, removal.
    assert.throws(() => brain.createWatcher({ what: '', every: '24h' }), (e) => e.code === 'bad_what');
    assert.throws(() => brain.createWatcher({ what: 'x', every: '3h' }), (e) => e.code === 'bad_every');
    assert.throws(() => brain.createWatcher({ what: 'y'.repeat(301), every: '6h' }), (e) => e.code === 'what_too_long');
    brain.deleteWatcher(w.id);
    assert.equal(brain.listWatchers().length, 0);
    assert.deepEqual(fake.violations, []);
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('watchers without a key are paused; over a cap they are blocked; max 20', async () => {
  const fake = await startFakeClaude({ script: () => ({ blocks: [toolUse('report_check', { met: false, summary: 'No.', sources: [] })], stop: 'tool_use' }) });
  const clock = createManualClock(MORNING);
  const { brain } = makeBrain({ fake, clock });
  try {
    await okKey(brain);
    await brain.putSettings({ briefing: { enabled: false } });
    const w = brain.createWatcher({ what: 'a price drop', every: '6h' });
    brain.deleteKey();
    clock.advance(60_000);
    brain.tick();
    assert.equal(brain.listWatchers()[0].status, 'paused');
    await okKey(brain);
    assert.equal(brain.listWatchers()[0].status, 'watching');
    await brain.putSettings({ limits: { dailyUsd: 0 } });
    clock.advance(60_000);
    brain.tick();
    assert.equal(brain.listWatchers()[0].status, 'blocked');
    assert.throws(() => brain.checkWatcherNow(w.id), (e) => e.status === 402);
    await brain.putSettings({ limits: { dailyUsd: 5 } });
    brain.tick();
    assert.equal(brain.listWatchers()[0].status, 'watching');
    const r = brain.checkWatcherNow(w.id);
    assert.equal(r.job.kind, 'watch-check');
    assert.throws(() => brain.checkWatcherNow(w.id), (e) => e.code === 'check_pending');
    for (let i = 1; i < 20; i += 1) brain.createWatcher({ what: `thing ${i}`, every: '24h' });
    assert.throws(() => brain.createWatcher({ what: 'one too many', every: '24h' }), (e) => e.code === 'too_many_watchers');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('network fetches time out instead of hanging', async () => {
  const { fetchText } = await import('../../../server/brain/util.mjs');
  const hang = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const t0 = Date.now();
  const r = await fetchText(hang, 'https://api.open-meteo.com/v1/forecast?x=1', { timeoutMs: 80 });
  assert.deepEqual(r, { ok: false, error: 'timeout' });
  assert.ok(Date.now() - t0 < 1000);
  const big = await fetchText(async () => new Response('x'.repeat(5000)), 'https://feeds.example/', { maxBytes: 1000 });
  assert.equal(big.ok, false);
  assert.equal(big.error, 'too_large');
});

test('a watcher check cut short (max_tokens) never counts as met, even if the half-written answer says so', async () => {
  const fake = await startFakeClaude({ script: () => ({ blocks: [toolUse('report_check', { met: true, summary: 'Now $2', sources: [] })], stop: 'max_tokens' }) });
  const clock = createManualClock(MORNING);
  const { brain, push } = makeBrain({ fake, clock });
  try {
    await okKey(brain);
    await brain.putSettings({ briefing: { enabled: false } });
    const w = brain.createWatcher({ what: 'a price under $300', every: '6h' });
    brain.checkWatcherNow(w.id);
    await until(() => brain.listJobs({ kind: 'watch-check' })[0]?.status === 'failed', { what: 'failed check' });
    const cur = brain.listWatchers()[0];
    assert.equal(cur.status, 'watching');
    assert.equal(cur.lastResult, null);
    assert.equal(push.sent.length, 0);
    assert.equal(brain.listJobs({ kind: 'watch-check' })[0].error.code, 'unclear');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('passing API problems: an output-tokens-per-minute 429 caps max_tokens; an overload is tried again later', async () => {
  let n = 0;
  const fake = await startFakeClaude({
    script: (body) => {
      n += 1;
      if (body.max_tokens > 9000) return { status: 429, errorType: 'rate_limit_error', message: 'This request would exceed the rate limit for your organization of 10,000 output tokens per minute.' };
      if (n <= 6) return { status: 529, errorType: "overloaded_error", message: "Overloaded" }; // 3 OTPM 429s (the SDK retries twice), then 3 overloads
      return researchAnswer();
    },
  });
  const clock = createManualClock(MORNING);
  const { brain, logs } = makeBrain({ fake, clock });
  try {
    await okKey(brain);
    await brain.putSettings({ briefing: { enabled: false } });
    const job = brain.createJob({ prompt: 'otpm question', depth: 'deep' });
    await until(() => brain.getJob(job.id).status === 'queued' && brain.getJob(job.id).retryAt, { what: 'queued for a retry' });
    const capped = fake.messageRequests.filter((r) => r.body.max_tokens === 9000);
    assert.ok(capped.length >= 1, 'max_tokens capped to 90% of the limit');
    assert.ok(logs.some((l) => /10000 output tokens a minute/.test(l)));
    assert.match(brain.getJob(job.id).summary, /Trying again soon/);
    clock.advance(61_000);
    brain.tick();
    await until(() => brain.getJob(job.id).status === 'done', { what: 'done on the retry' });
    assert.equal(fake.messageRequests.at(-1).body.max_tokens, 9000, 'the cap is remembered');
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('unreadable brain files are moved aside and the brain starts fresh', async () => {
  const data = tmp();
  fs.mkdirSync(path.join(data, 'brain'), { recursive: true });
  for (const f of ['jobs-v1.json', 'watchers-v1.json', 'spend-v1.json', 'settings-v1.json', 'briefing-v1.json']) fs.writeFileSync(path.join(data, 'brain', f), '{ not json');
  const logs = [];
  const { brain } = makeBrain({ dataDir: data, logs });
  try {
    assert.deepEqual(brain.listJobs({}), []);
    assert.deepEqual(brain.listWatchers(), []);
    assert.equal(brain.info().limits.dailyUsd, 5);
    assert.equal(brain.latestBriefing(), null);
    const aside = fs.readdirSync(path.join(data, 'brain')).filter((f) => f.includes('.corrupt-'));
    assert.equal(aside.length, 5);
    assert.ok(logs.some((l) => /moved it to/.test(l)));
  } finally {
    await brain.stop();
  }
});

test('a key pasted into a question or a watcher is never stored or returned', async () => {
  const fake = await startFakeClaude({ script: () => researchAnswer() });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    const job = brain.createJob({ prompt: `is ${KEY} a valid key?`, title: `about ${KEY}` });
    assert.ok(!JSON.stringify(job).includes(KEY));
    assert.match(job.prompt, /sk-ant-…/);
    await brain.putSettings({ briefing: { enabled: false } });
    const w = brain.createWatcher({ what: `tell me if ${KEY} leaks`, every: '24h' });
    assert.ok(!JSON.stringify(w).includes(KEY));
    await until(() => brain.getJob(job.id).status === 'done', { what: 'done' });
    assert.ok(!JSON.stringify(brain.getJob(job.id)).includes(KEY));
  } finally {
    await brain.stop();
    await fake.close();
  }
});

test('removing the key stops a running job at once', async () => {
  const fake = await startFakeClaude({ script: () => ({ ...researchAnswer('y'.repeat(4000)), slowMs: 20 }) });
  const { brain } = makeBrain({ fake });
  try {
    await okKey(brain);
    const job = brain.createJob({ prompt: 'long one' });
    await until(() => brain.getJob(job.id).status === 'running', { what: 'running' });
    brain.deleteKey();
    const j = brain.getJob(job.id);
    assert.equal(j.status, 'failed');
    assert.equal(j.error.code, 'no_key');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(brain.getJob(job.id).status, 'failed', 'the aborted request does not change it afterwards');
    assert.equal(brain.info().jobs.running, 0);
  } finally {
    await brain.stop();
    await fake.close();
  }
});
