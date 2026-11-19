// Engine hardening from the Claude API review: code-execution containers (P1), visible paced
// retries, moderate max_tokens and output-tokens-per-minute pacing (P2), web_fetch page caps (P3),
// mid-stream worker errors (P4), history-check recovery (P5), fallback pricing (P6), refusals
// leaving the history (P7), shape-based feature detection (P8) and Haiku tool versions (P9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestError, InternalServerError, RateLimitError } from '@anthropic-ai/sdk';
import { createJarvis } from '../../src/engine/index.js';
import { LOW_LIMITS_NOTICE } from '../../src/engine/jarvis.js';
import { DEPTHS, PRICES, costOf } from '../../src/engine/models.js';
import { LEAD_SYSTEM_V1, leadToolsV1, leadToolsLatest } from '../../src/engine/prompts.js';
import { responseCost, usageDelta } from '../../src/engine/stream.js';
import { isContainerError, isThinkingMismatch, outputTokensLimit, retryAfterMs, unsupportedFeature } from '../../src/engine/client.js';
import { RETRY_ATTEMPTS, retryDelayMs, shouldRetry } from '../../src/engine/retry.js';
import { createLimiter } from '../../src/engine/limiter.js';
import {
  DEFAULT_TEST_SETTINGS,
  KEY,
  blk,
  createHarness,
  createMemory,
  deployInput,
  isLeadBody,
  missionsOf,
  runTurn,
  segmentsOf,
  trailingToolResults,
  workerReply,
  workerTaskNo,
} from './engine.support.test.mjs';

const answer = (text) => ({ content: [blk.thinking('Thinking.'), blk.text(text)], stop: 'end_turn' });
const deploy = (n, title = 'Mission') => ({ content: [blk.text('Deploying.'), blk.deploy('toolu_h1', deployInput(n, title))], stop: 'tool_use' });
const swarm = ({ lead, worker }) => (req) => (isLeadBody(req.body) ? lead(req) : worker(req));
const headers = (h = {}) => new Headers({ 'request-id': 'req_1', ...h });
const apiErr = (Cls, status, type, message, h) => new Cls(status, { type: 'error', error: { type, message } }, undefined, headers(h));
const searchBlocks = (id) => [blk.search(id, 'q'), blk.searchResult(id, [['https://www.example.com/r', 'R']])];
const inOneHour = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------------------------
// P1: code-execution containers

test('P1 lead: the container a response ran in is sent on every later request until it expires', async () => {
  let n = 0;
  const h = createHarness({
    handler: () => {
      n += 1;
      if (n === 1) return { content: [...searchBlocks('srvtoolu_c1'), blk.text('Found it.')], stop: 'end_turn', container: { id: 'container_A', expires_at: inOneHour() } };
      return answer(`Turn ${n}`);
    },
  });
  const conv = h.jarvis.newConversation();
  await runTurn(h.jarvis, conv, 'Search something');
  assert.equal('container' in h.api.requests[0].body, false, 'the first request has no container yet');
  assert.equal(conv.container.id, 'container_A');
  assert.ok(conv.container.expiresAt > Date.now());
  await runTurn(h.jarvis, conv, 'Follow-up');
  assert.equal(h.api.requests[1].body.container, 'container_A');
  assert.deepEqual(structuredClone(conv).container, conv.container, 'persisted with the conversation');

  conv.container.expiresAt = Date.now() + 30 * 1000; // inside the safety margin: treated as gone
  await runTurn(h.jarvis, conv, 'Much later');
  assert.equal('container' in h.api.requests[2].body, false);
  assert.equal(conv.container, null);
});

test('P1 lead: a pause_turn continuation names the container; a rejected container is dropped and retried once', async () => {
  let n = 0;
  const h = createHarness({
    handler: (req) => {
      n += 1;
      if (n === 1) return { content: [blk.text('Searching.'), blk.search('srvtoolu_p1', 'long')], stop: 'pause_turn', container: { id: 'container_P', expires_at: inOneHour() } };
      if (n === 2) return { content: [blk.searchResult('srvtoolu_p1', [['https://www.example.com/p', 'P']]), blk.text('Done.')], stop: 'end_turn' };
      if (req.body.container) return { error: { status: 400, type: 'invalid_request_error', message: 'container: container `container_P` has expired' } };
      return answer('Fresh container.');
    },
  });
  const conv = h.jarvis.newConversation();
  await runTurn(h.jarvis, conv, 'Research a lot');
  assert.equal(h.api.requests[1].body.container, 'container_P', 'the continuation runs in the paused container');
  const { turn } = await runTurn(h.jarvis, conv, 'And more');
  assert.equal(turn.status, 'done');
  assert.equal(h.api.requests[2].body.container, 'container_P');
  assert.equal('container' in h.api.requests[3].body, false, 'retried once without the dead container');
  assert.equal(conv.container, null);
  assert.equal(isContainerError(apiErr(BadRequestError, 400, 'invalid_request_error', 'container: not found')), true);
  assert.equal(isContainerError(apiErr(BadRequestError, 400, 'invalid_request_error', 'messages.0: bad')), false);
});

test('P1 worker: a paused agent continues in its container; each new attempt starts without one', async () => {
  let workerCalls = 0;
  const h = createHarness({
    handler: swarm({
      lead: (req) => (trailingToolResults(req.body).length ? answer('Synthesis.') : deploy(1)),
      worker: () => {
        workerCalls += 1;
        if (workerCalls === 1) return { content: [blk.thinking('Plan'), blk.search('srvtoolu_w1', 'q')], stop: 'pause_turn', container: { id: 'container_W', expires_at: inOneHour() } };
        return workerReply('W');
      },
    }),
  });
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Go', 'swarm');
  assert.equal(turn.status, 'done');
  const [first, second] = h.api.byKind('worker');
  assert.equal('container' in first.body, false);
  assert.equal(second.body.container, 'container_W');
  assert.equal(missionsOf(turn)[0].agents[0].status, 'done');
});

// ---------------------------------------------------------------------------------------------
// P2: visible, paced retries; moderate max_tokens; output-tokens-per-minute pacing; stagger

test('P2c: moderate max_tokens per depth for the lead and the agents', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(DEPTHS).map(([k, d]) => [k, [d.leadMaxTokens, d.workerMaxTokens]])), {
    fast: [12000, 8000],
    balanced: [16000, 12000],
    deep: [32000, 16000],
  });
});

test('P2b worker: rate limits wait with a live countdown, slow the bucket once per episode, then recover', async () => {
  let failures = 0;
  const activities = [];
  const h = createHarness({
    settings: { maxParallel: 4 },
    maxRetryWaitMs: 2400,
    handler: swarm({
      lead: (req) => (trailingToolResults(req.body).length ? answer('Synthesis.') : deploy(4, 'Busy')),
      worker: (req) => {
        if (failures < 4) {
          failures += 1;
          return { error: { status: 429, type: 'rate_limit_error', message: 'Number of requests has exceeded your rate limit.', headers: { 'retry-after': '2' } } };
        }
        return workerReply(`R${workerTaskNo(req.body)}`);
      },
    }),
  });
  const notices = [];
  const started = Date.now();
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Go', 'swarm', {
    onRun: (run) => {
      run.on('notice', (e) => notices.push(e.message));
      run.on('agent', (e) => activities.push(e.agent.activity));
    },
  });
  assert.equal(turn.status, 'done');
  assert.ok(Date.now() - started >= 1900, 'the retry-after of 2 s was honoured');
  assert.deepEqual(missionsOf(turn)[0].agents.map((a) => [a.status, a.attempts]), [['done', 2], ['done', 2], ['done', 2], ['done', 2]]);
  // Four agents rejected together are one episode: one slot fewer, one notice.
  assert.deepEqual(notices, ['Rate limit reached — slowing to 3 agents at once']);
  const countdown = activities.filter((a) => /^Rate limited — retrying in \d+s$/.test(a)).map((a) => Number(/(\d+)s$/.exec(a)[1]));
  assert.ok(countdown.includes(2) && countdown.includes(1), `a live countdown on the agent cards (saw ${[...new Set(countdown)]})`);
  assert.equal(h.api.byKind('worker').length, 8, 'no SDK retry storm: one request per attempt');
});

test('P2b lead: a rate-limited lead request waits visibly (notice + countdown segment) and succeeds', async () => {
  let n = 0;
  const h = createHarness({
    maxRetryWaitMs: 2200,
    handler: () => (++n === 1 ? { error: { status: 429, type: 'rate_limit_error', message: 'Rate limited', headers: { 'retry-after': '2' } } } : answer('Worth the wait.')),
  });
  const notices = [];
  const seen = [];
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Hello', 'auto', {
    onRun: (run) => {
      run.on('notice', (e) => notices.push(e.message));
      run.on('segment', (e) => e.segment.kind === 'notice' && seen.push(e.segment.text));
    },
  });
  assert.equal(turn.status, 'done');
  assert.equal(notices.length, 1);
  assert.match(notices[0], /^Rate limited — retrying in [23]s$/);
  assert.ok(seen.some((t) => /^Rate limited — retrying in 2s$/.test(t)) && seen.some((t) => /^Rate limited — retrying in 1s$/.test(t)), `countdown: ${[...new Set(seen)]}`);
  assert.equal(segmentsOf(turn, 'notice').length, 0, 'the countdown leaves the transcript when the wait ends');
  assert.equal(h.api.requests.length, 2);
});

test('P2c: an output-tokens-per-minute 429 caps max_tokens for the session, with one clear notice', async () => {
  const limit = 8000;
  const otpm = (body) => body.max_tokens > limit && { error: { status: 429, type: 'rate_limit_error', message: `This request would exceed your organization's rate limit of ${limit.toLocaleString('en-US')} output tokens per minute (model: ${body.model}).`, headers: { 'anthropic-ratelimit-output-tokens-limit': String(limit), 'retry-after': '30' } } };
  const h = createHarness({
    settings: { depth: 'deep' },
    handler: swarm({
      lead: (req) => otpm(req.body) || (trailingToolResults(req.body).length ? answer('Synthesis.') : deploy(2)),
      worker: (req) => otpm(req.body) || workerReply('W'),
    }),
  });
  const notices = [];
  const conv = h.jarvis.newConversation();
  const { turn } = await runTurn(h.jarvis, conv, 'Go deep', 'swarm', { onRun: (run) => run.on('notice', (e) => notices.push(e.message)) });
  assert.equal(turn.status, 'done');
  const lead = h.api.byKind('lead');
  assert.deepEqual(lead.map((r) => r.body.max_tokens), [32000, 7200, 7200], 'capped to 90% of the limit, retried at once');
  const workers = h.api.byKind('worker').map((r) => r.body.max_tokens);
  assert.ok(workers.every((m) => m === 16000 || m === 7200) && workers.filter((m) => m === 7200).length === 2, `workers: ${workers}`);
  assert.deepEqual(notices, [LOW_LIMITS_NOTICE]);
  // The cap lasts for the session.
  await runTurn(h.jarvis, conv, 'Another', 'quick');
  assert.equal(h.api.requests.at(-1).body.max_tokens, 7200);
  assert.equal(outputTokensLimit(apiErr(RateLimitError, 429, 'rate_limit_error', 'rate limit of 4,000 output tokens per minute')), 4000);
  assert.equal(outputTokensLimit(apiErr(RateLimitError, 429, 'rate_limit_error', 'requests per minute', { 'anthropic-ratelimit-output-tokens-limit': '9000' })), 9000);
  assert.equal(outputTokensLimit(apiErr(RateLimitError, 429, 'rate_limit_error', 'slow down')), null);
});

test('P2d: agents start staggered', async () => {
  const h = createHarness({
    workerStaggerMs: 60,
    settings: { maxParallel: 4 },
    handler: swarm({ lead: (req) => (trailingToolResults(req.body).length ? answer('Synthesis.') : deploy(4)), worker: () => workerReply('W') }),
  });
  await runTurn(h.jarvis, h.jarvis.newConversation(), 'Go', 'swarm');
  const times = h.api.byKind('worker').map((r) => r.at).sort((a, b) => a - b);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.ok(gaps.every((g) => g >= 45), `first requests are spread out (gaps ${gaps} ms)`);
});

test('P2: retry policy and limiter units', () => {
  assert.deepEqual(RETRY_ATTEMPTS, { rate_limit: 5, overloaded: 5, server: 3, network: 3 });
  assert.equal(shouldRetry({}, { kind: 'rate_limit' }, 4), true);
  assert.equal(shouldRetry({}, { kind: 'rate_limit' }, 5), false);
  assert.equal(shouldRetry({ jarvisStarted: false }, { kind: 'network' }, 1), true);
  assert.equal(shouldRetry({ jarvisStarted: true }, { kind: 'network' }, 1), false, 'a mid-stream cut is an interruption');
  assert.equal(shouldRetry({}, { kind: 'bad_request' }, 1), false);
  const e = (h) => apiErr(RateLimitError, 429, 'rate_limit_error', 'x', h);
  assert.equal(retryAfterMs(e({ 'retry-after': '7' })), 7000);
  assert.equal(retryAfterMs(e({ 'retry-after-ms': '250' })), 250);
  assert.equal(retryAfterMs(e({})), null);
  assert.equal(retryDelayMs(e({ 'retry-after': '90' }), 1, { baseMs: 5000, maxWaitMs: 60000, random: () => 0 }), 60000, 'capped at 60 s');
  assert.equal(retryDelayMs(e({}), 3, { baseMs: 5000, maxWaitMs: 60000, random: () => 0 }), 15000, '5 s × attempt');
  assert.equal(retryDelayMs(e({}), 1, { baseMs: 5000, maxWaitMs: 60000, random: () => 1 }), 7000, 'plus up to 2 s of jitter');

  const lim = createLimiter(4);
  assert.deepEqual(lim.penalize({ now: 1000 }), { reduced: true, capacity: 3 });
  assert.deepEqual(lim.penalize({ now: 5000 }), { reduced: false, capacity: 3 }, 'same episode');
  assert.deepEqual(lim.penalize({ now: 12000 }), { reduced: true, capacity: 2 });
  lim.succeed();
  assert.equal(lim.capacity, 2);
  lim.succeed();
  assert.equal(lim.capacity, 3, 'one slot back every two successes');
  lim.succeed();
  lim.succeed();
  lim.succeed();
  lim.succeed();
  assert.equal(lim.capacity, 4, 'never above the configured capacity');
  assert.equal(lim.target, 4);
});

// ---------------------------------------------------------------------------------------------
// P3, P4

test('P3: new conversations cap web_fetch page text; old conversations keep their frozen tools', async () => {
  const h = createHarness({ handler: () => answer('ok') });
  const fresh = h.jarvis.newConversation();
  assert.deepEqual(fresh.tools, leadToolsLatest());
  assert.equal(fresh.tools.find((t) => t.name === 'web_fetch').max_content_tokens, 12000);
  const old = h.jarvis.newConversation();
  old.system = LEAD_SYSTEM_V1;
  old.tools = leadToolsV1();
  await runTurn(h.jarvis, old, 'Hi');
  assert.deepEqual(h.api.requests[0].body.tools, leadToolsV1());
});

test('P4: a worker stream that fails mid-way with a server error is retried without slowing the team', async () => {
  let workerCalls = 0;
  const h = createHarness({
    settings: { maxParallel: 3 },
    handler: swarm({
      lead: (req) => (trailingToolResults(req.body).length ? answer('Synthesis.') : deploy(1)),
      worker: () => (++workerCalls === 1 ? { content: [blk.thinking('w'), blk.text('x')], sseError: { type: 'api_error', message: 'Internal server error' } } : workerReply('W')),
    }),
  });
  const notices = [];
  const { turn } = await runTurn(h.jarvis, h.jarvis.newConversation(), 'Go', 'swarm', { onRun: (run) => run.on('notice', (e) => notices.push(e)) });
  const agent = missionsOf(turn)[0].agents[0];
  assert.deepEqual([agent.status, agent.attempts], ['done', 2]);
  assert.deepEqual(notices, [], 'no slow-down notice for a transient server error');
  assert.equal(h.jarvis.isBusy(), false);
});

// ---------------------------------------------------------------------------------------------
// P5: history-check recovery

test('P5: a thinking-block history mismatch is retried with drop_block, and the conversation keeps sending it', async () => {
  let n = 0;
  const mismatch = 'messages.1.content.0: Invalid `signature` in `thinking` block. The block is bound to a different conversation. Remove the block, or set `thinking.block_binding.prefix_mismatch_behavior` to "drop_block".';
  const h = createHarness({
    handler: (req) => {
      n += 1;
      if (n === 2 && !req.body.thinking.block_binding) return { error: { status: 400, type: 'invalid_request_error', message: mismatch } };
      return answer(`Answer ${n}`);
    },
  });
  const conv = h.jarvis.newConversation();
  await runTurn(h.jarvis, conv, 'One');
  const { turn } = await runTurn(h.jarvis, conv, 'Two');
  assert.equal(turn.status, 'done');
  const [, rejected, retried] = h.api.requests;
  assert.equal(rejected.body.thinking.block_binding, undefined);
  assert.deepEqual(retried.body.thinking, { type: 'adaptive', display: 'summarized', block_binding: { prefix_mismatch_behavior: 'drop_block' } });
  assert.match(retried.headers['anthropic-beta'], /thinking-binding-controls-2026-08-01/);
  assert.equal(conv.dropMismatchedThinking, true);
  await runTurn(h.jarvis, conv, 'Three');
  assert.deepEqual(h.api.requests.at(-1).body.thinking.block_binding, { prefix_mismatch_behavior: 'drop_block' });
  assert.equal(isThinkingMismatch(apiErr(BadRequestError, 400, 'invalid_request_error', mismatch)), true);
  assert.equal(isThinkingMismatch(apiErr(BadRequestError, 400, 'invalid_request_error', 'messages.0.content.0.text: empty')), false);
});

// ---------------------------------------------------------------------------------------------
// P6: fallback pricing

test('P6: after a refusal fallback each attempt is priced at its own model', () => {
  assert.deepEqual(['claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-5'].map((m) => [PRICES[m].inPerM, PRICES[m].outPerM, PRICES[m].cacheReadPerM, PRICES[m].cacheWrite5mPerM]), [
    [5, 25, 0.5, 6.25],
    [5, 25, 0.5, 6.25],
    [2, 10, 0.2, 2.5],
  ]);
  const usage = {
    input_tokens: 1000, // top level: only the attempt that produced the message (the fallback)
    output_tokens: 500,
    server_tool_use: { web_search_requests: 2 },
    iterations: [
      { type: 'message', model: null, input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      { type: 'fallback_message', model: 'claude-opus-5', input_tokens: 1000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
    ],
  };
  const expected = costOf('claude-opus-5-5', { input_tokens: 1000, output_tokens: 100 }) + costOf('claude-opus-5', { input_tokens: 1000, output_tokens: 500 }) + 2 * 0.01;
  assert.ok(Math.abs(responseCost('claude-opus-5', usage, 'claude-opus-5-5') - expected) < 1e-12);
  assert.deepEqual(usageDelta(usage), { input: 2000, output: 600, cacheWrite: 0, cacheRead: 0, searches: 2, fetches: 0 });
  // Without fallback entries the top level is the whole response, as before.
  const plain = { input_tokens: 10, output_tokens: 5, iterations: [{ type: 'message', model: 'claude-opus-5-5', input_tokens: 10, output_tokens: 5 }] };
  assert.equal(responseCost('claude-opus-5-5', plain), costOf('claude-opus-5-5', plain));
});

// ---------------------------------------------------------------------------------------------
// P7: refusals leave the history

test('P7: a turn refused after a swarm leaves the history entirely; the next turn is valid', async () => {
  const h = createHarness({
    handler: swarm({
      lead: (req) => {
        const text = req.body.messages.at(-1).content.find?.((b) => b.type === 'text' && !b.text.startsWith('<turn_context>'))?.text || '';
        if (trailingToolResults(req.body).length) return { content: [blk.text('Partial synthesis that gets')], stop: 'refusal', stopDetails: { type: 'refusal', category: 'cyber', explanation: null } };
        if (/REFUSE-AFTER-SWARM/.test(text)) return deploy(1, 'Doomed');
        return answer('Fine.');
      },
      worker: () => workerReply('W'),
    }),
  });
  const conv = h.jarvis.newConversation();
  await runTurn(h.jarvis, conv, 'A harmless question');
  const before = structuredClone(conv.apiMessages);
  const { turn } = await runTurn(h.jarvis, conv, 'REFUSE-AFTER-SWARM go', 'swarm');
  assert.equal(turn.status, 'error');
  assert.equal(turn.error.kind, 'refusal');
  assert.deepEqual(conv.apiMessages, before, 'the refused request, its tool round and partial output are gone');
  assert.equal(missionsOf(turn)[0].status, 'done', 'the transcript keeps the mission');
  const next = await runTurn(h.jarvis, conv, 'Another harmless one');
  assert.equal(next.turn.status, 'done');
  assert.ok(!JSON.stringify(h.api.requests.at(-1).body.messages).includes('REFUSE-AFTER-SWARM'));
});

// ---------------------------------------------------------------------------------------------
// P8: feature auto-disable from the error's shape

test('P8: optional features are switched off only for errors about them, not for a matching word', () => {
  const e400 = (message) => apiErr(BadRequestError, 400, 'invalid_request_error', message);
  const both = { fallbacks: 'default', context_management: { edits: [] } };
  assert.equal(unsupportedFeature(e400('fallbacks: Extra inputs are not permitted'), both), 'fallbacks');
  assert.equal(unsupportedFeature(e400('fallbacks: this organization is not allowed to use server-side fallback'), both), 'fallbacks');
  assert.equal(unsupportedFeature(e400('Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header.'), both), 'fallbacks');
  assert.equal(unsupportedFeature(e400('Unexpected value(s) `compact-2026-01-12` for the `anthropic-beta` header.'), both), 'compaction');
  assert.equal(unsupportedFeature(e400('context_management.edits.0: Input tag found'), both), 'compaction');
  // A message that merely contains the words is about something else.
  assert.equal(unsupportedFeature(e400('messages.2.content.0.text: please compact this fallback plan'), both), null);
  assert.equal(unsupportedFeature(e400('max_tokens: the fallback model needs fewer tokens'), both), null);
  assert.equal(unsupportedFeature(e400('Unexpected value(s) `made-up-2030-01-01` for the `anthropic-beta` header.'), both), null);
  assert.equal(unsupportedFeature(e400('fallbacks: Extra inputs are not permitted'), {}), null, 'only when the feature was sent');
  assert.equal(unsupportedFeature(apiErr(InternalServerError, 500, 'api_error', 'fallbacks: boom'), both), null);
});

// ---------------------------------------------------------------------------------------------
// P1–P9 against the strict mock (it requires the container, honours drop_block, OTPM, Haiku tools)

let createMockFetch = null;
try {
  ({ createMockFetch } = await import('../mock/anthropic-mock.mjs'));
} catch {
  createMockFetch = null;
}
const skip = typeof createMockFetch !== 'function' ? 'test/mock/anthropic-mock.mjs is not available' : false;

function mockJarvis(settings = {}, extra = {}) {
  const fetch = createMockFetch({ timeScale: 0.02 });
  const jarvis = createJarvis({
    getSettings: () => ({ ...DEFAULT_TEST_SETTINGS, ...settings }),
    getApiKey: () => KEY,
    fetch,
    memory: createMemory(),
    persist: async (conv) => structuredClone(conv),
    clientOptions: { maxRetries: 0 },
    retryBaseMs: 20,
    workerStaggerMs: 5,
    maxRetryWaitMs: 150,
    ...extra,
  });
  return { jarvis, mock: fetch.mock };
}

test('strict mock: containers carried across turns and continuations; OTPM pacing; retry-after; Haiku agents', { skip }, async () => {
  const { jarvis, mock } = mockJarvis({ workerModel: 'claude-haiku-5-5', leadModel: 'claude-haiku-5-5' });
  const conv = jarvis.newConversation();
  const turn = (text, mode = 'auto') => jarvis.startTurn(conv, { text, mode }).done;
  assert.equal((await turn('Latest news [[search]]')).status, 'done');
  assert.match(conv.container.id, /^container_/);
  assert.equal((await turn('Long research [[pause]]')).status, 'done');
  assert.equal((await turn('Thanks, and a follow-up')).status, 'done');
  const leads = mock.requests.filter((r) => r.kind === 'lead');
  assert.ok(leads.slice(1).every((r) => typeof r.body.container === 'string'), 'every later lead request names the container');
  assert.ok(leads.every((r) => r.body.model === 'claude-sonnet-5-5'), 'a Haiku lead setting runs on Sonnet 5.5');

  const swarmTurn = await turn('Agents that pause [[swarm:2]] [[workerpause]] [[ratelimit:2:1]]', 'swarm');
  assert.equal(swarmTurn.status, 'done');
  assert.deepEqual(missionsOf(swarmTurn)[0].agents.map((a) => a.status), ['done', 'done']);
  const workers = mock.requests.filter((r) => r.kind === 'worker' && r.status === 200);
  assert.ok(workers.every((r) => r.body.model === 'claude-haiku-5-5' && r.body.tools[0].type === 'web_search_20250305' && r.body.tools[1].type === 'web_fetch_20250910'), 'Haiku agents use the basic tool versions');
  assert.ok(workers.some((r) => typeof r.body.container === 'string'), 'a paused agent continued in its container');

  const capped = await turn('Low-tier account [[otpm:6000]] [[swarm:2]]', 'swarm');
  assert.equal(capped.status, 'done');
  const okLeads = mock.requests.filter((r) => r.kind === 'lead' && r.status === 200);
  assert.equal(okLeads.at(-1).body.max_tokens, 5400);
  assert.deepEqual(mock.violations, []);
});

test('strict mock: an edited history recovers through drop_block; a refused turn leaves the history', { skip }, async () => {
  const { jarvis, mock } = mockJarvis();
  const conv = jarvis.newConversation();
  assert.equal((await jarvis.startTurn(conv, { text: 'What is the capital of France?' }).done).status, 'done');
  conv.apiMessages[0].content[1].text = 'What is the capital of Italy?'; // e.g. a scrubbed or merged backup
  const recovered = await jarvis.startTurn(conv, { text: 'And Germany?' }).done;
  assert.equal(recovered.status, 'done');
  assert.equal(conv.dropMismatchedThinking, true);
  assert.equal(mock.violations.filter((v) => v.code === 'thinking_prefix_mismatch').length, 1, 'one rejection, then drop_block');

  const before = conv.apiMessages.length;
  const refused = await jarvis.startTurn(conv, { text: 'Not allowed [[refuse]]' }).done;
  assert.equal(refused.status, 'error');
  assert.equal(conv.apiMessages.length, before);
  assert.equal((await jarvis.startTurn(conv, { text: 'Something harmless' }).done).status, 'done');
  assert.equal(mock.violations.length, 1);
});
