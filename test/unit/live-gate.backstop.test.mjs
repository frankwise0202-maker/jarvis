// The live view's $1 an hour holds for what a request does inside itself (v8.1 fixes MONEY-1 and
// MONEY-2). A lead request's server tools add to its cost while it runs: each web search, each result
// and each fetched page is read again by every later round. While the live view is on:
//   - a turn is asked to keep to 2 web searches and no page fetches (its turn context), and its
//     requests reserve that budget's worst case, or all that is left of the hour when that still
//     covers the input and a useful answer (max_tokens then comes down to fit);
//   - a meter follows each request's stream and stops it before it could pass its reservation (a
//     page it starts to fetch, a search round that would not fit), so no request sent while the live
//     view is on can settle the hour above $1;
//   - gated requests go out without server-side fallbacks or compaction (an extra attempt each).
// A turn asked while the live view was off is never shortened, refused or counted (MONEY-2).
// The engine runs in-process against a scripted API (engine.support) or the strict mock.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createJarvis } from '../../src/engine/index.js';
import { DEPTHS, costOf } from '../../src/engine/models.js';
import { createLiveBudget } from '../../src/lib/live-view.js';
import { GATE_LIMITS, LIVE_WEB, createLiveGate, createRequestMeter, createTurnGate, gateNote, requestWorstUsd } from '../../src/lib/live-gate.js';
import { createMockFetch } from '../mock/anthropic-mock.mjs';
import { DEFAULT_TEST_SETTINGS, KEY, blk, createFakeLibrary, createHarness, createMemory } from './engine.support.test.mjs';

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** The live view's budget and gate (one window), the hour already at `spent`. */
function liveHour(spent = 0) {
  const storage = memoryStorage();
  const budget = createLiveBudget({ storage });
  if (spent > 0) budget.add(spent);
  return { budget, gate: createLiveGate({ budget, storage }) };
}

const LEAD = 'claude-opus-5-5';
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const leads = (api) => api.requests.filter((r) => r.kind === 'lead');

/** A search result of about `tokens` tokens (its snippets come encrypted). */
const searchResult = (id, tokens) => ({
  type: 'web_search_tool_result',
  tool_use_id: id,
  content: [{ type: 'web_search_result', url: `https://shop.example/${id}`, title: 'A charger', page_age: null, encrypted_content: 'e'.repeat(tokens * 3) }],
});
/** A fetched page of about `tokens` tokens (the lead tools' cap is 12,000). */
const fetchedPage = (id, tokens) => ({
  type: 'web_fetch_tool_result',
  tool_use_id: id,
  content: {
    type: 'web_fetch_result',
    url: `https://review.example/${id}`,
    retrieved_at: '2026-11-26T08:00:00Z',
    content: { type: 'document', source: { type: 'text', media_type: 'text/plain', data: 'word '.repeat(tokens) }, title: 'A review', citations: null },
  },
});

/**
 * The usage the API reports for one request whose server-tool loop ran a round per result, billed
 * as the API bills server tools: the prompt (cold: written to the cache), then each later round reads
 * everything before it from the cache and writes what is new (a cache write after the tool results).
 * `startUsage` is what message_start reports (the first round), `usage` the whole message.
 */
function billRounds({ prompt, results, written = 300, searches = 0, fetches = 0 }) {
  const startUsage = { input_tokens: 8, cache_creation_input_tokens: prompt, cache_read_input_tokens: 0 };
  let creation = prompt;
  let read = 0;
  let prefix = prompt + 8;
  for (const r of results) {
    read += prefix;
    creation += written + r;
    prefix += written + r;
  }
  const usage = {
    input_tokens: 8,
    cache_creation_input_tokens: creation,
    cache_read_input_tokens: read,
    output_tokens: written * (results.length + 1),
    server_tool_use: { web_search_requests: searches, web_fetch_requests: fetches },
  };
  return { startUsage, usage };
}

/** The research answer of the review: 3 searches, then 2 pages fetched at the 12,000-token cap. */
function researchReply() {
  const results = [5000, 5000, 5000, 12000, 12000];
  return {
    content: [
      blk.thinking('Let me look this charger up.'),
      blk.search('srvtoolu_s1', '65W USB-C charger'),
      searchResult('srvtoolu_s1', 5000),
      blk.search('srvtoolu_s2', '65W USB-C charger review'),
      searchResult('srvtoolu_s2', 5000),
      blk.search('srvtoolu_s3', '65W USB-C charger price'),
      searchResult('srvtoolu_s3', 5000),
      blk.fetch('srvtoolu_f1', 'https://review.example/srvtoolu_f1'),
      fetchedPage('srvtoolu_f1', 12000),
      blk.fetch('srvtoolu_f2', 'https://review.example/srvtoolu_f2'),
      fetchedPage('srvtoolu_f2', 12000),
      blk.text('It is a 65-watt GaN charger, about $39, well reviewed for its size.'),
    ],
    stop: 'end_turn',
    ...billRounds({ prompt: 15000, results, searches: 3, fetches: 2 }),
  };
}

function scripted(reply) {
  return createHarness({ handler: (req) => (req.kind === 'lead' ? reply() : { content: [blk.text('ok')], stop: 'end_turn' }) });
}

const quickResearch = (h, conv, turnGate) => h.jarvis.startTurn(conv, { text: 'Research this 65-watt USB-C charger with a web search.', mode: 'quick', gate: turnGate }).done;

test('MONEY-1: at 70¢, a research answer that searches and fetches pages never settles the hour above $1', async () => {
  const reply = researchReply();
  const wouldCost = costOf(LEAD, reply.usage);
  const h = scripted(() => reply);
  const { budget, gate } = liveHour(0.7);
  const conv = h.jarvis.newConversation();
  const turn = await quickResearch(h, conv, createTurnGate({ gate, isOn: () => true }));
  assert.ok(wouldCost > 0.3, `run to the end, that request would cost ${wouldCost.toFixed(4)}: more than the 30¢ left`);
  assert.equal(leads(h.api).length, 1, 'one request, not retried');
  assert.ok(budget.spent() <= 1 + 1e-9, `the hour ends at ${budget.spent().toFixed(4)}`);
  assert.equal(turn.status, 'error');
  assert.equal(turn.error.kind, 'live_cap', 'stopped before its first page was fetched, with the gate\'s line');
  assert.match(turn.error.message, /^That would take the live view past its dollar this hour\./);
  assert.equal(gate.reserved(), 0, 'its reservation counted as spent, nothing left held');
});

test('MONEY-1: a gated turn is told its web budget; its request goes out without fallbacks or compaction, and an answer within the budget completes', async () => {
  const results = [4000, 4000];
  const reply = {
    content: [blk.search('srvtoolu_a', 'charger'), searchResult('srvtoolu_a', 4000), blk.search('srvtoolu_b', 'charger price'), searchResult('srvtoolu_b', 4000), blk.text('About $39.')],
    stop: 'end_turn',
    ...billRounds({ prompt: 15000, results, searches: 2 }),
  };
  const h = scripted(() => reply);
  const { budget, gate } = liveHour(0.7);
  const conv = h.jarvis.newConversation();
  const turn = await quickResearch(h, conv, createTurnGate({ gate, isOn: () => true }));
  assert.equal(turn.status, 'done');
  const [req] = leads(h.api);
  assert.equal(req.body.max_tokens, GATE_LIMITS.firstMaxTokens);
  assert.equal(req.body.fallbacks, undefined, 'no server-side fallback: it would be a second attempt');
  assert.equal(req.body.context_management, undefined, 'no compaction: it would be another attempt');
  assert.ok(!String(req.headers['anthropic-beta'] || '').includes('server-side-fallback'));
  const context = req.body.messages.at(-1).content[0].text;
  assert.ok(context.includes(gateNote), 'the turn context asks for the budget');
  assert.deepEqual(req.body.tools, conv.tools, 'the conversation\'s tools are sent as they are (its history and cache stay valid)');
  assert.ok(near(budget.spent(), 0.7 + costOf(LEAD, reply.usage)), 'settled at its real cost');
  assert.ok(budget.spent() <= 1);
  assert.equal(gate.reserved(), 0);
  // A turn asked with the live view off: its context says nothing of it, and it goes out as before.
  const other = h.jarvis.newConversation();
  await h.jarvis.startTurn(other, { text: 'And another?', mode: 'quick', gate: createTurnGate({ gate, isOn: () => false }) }).done;
  const plain = leads(h.api).at(-1);
  assert.ok(!plain.body.messages.at(-1).content[0].text.includes('Live view:'));
  assert.equal(plain.body.fallbacks, 'default');
});

test('MONEY-1: searches beyond the budget are stopped by what they cost, before a round that would not fit', async () => {
  const sizes = [15000, 15000, 15000, 15000, 15000, 15000];
  const content = [];
  sizes.forEach((tokens, i) => content.push(blk.search(`srvtoolu_${i}`, `query ${i}`), searchResult(`srvtoolu_${i}`, tokens)));
  content.push(blk.text('Here is what I found.'));
  const reply = { content, stop: 'end_turn', ...billRounds({ prompt: 15000, results: sizes, searches: sizes.length }) };
  const wouldCost = costOf(LEAD, reply.usage);
  const h = scripted(() => reply);
  const { budget, gate } = liveHour(0.7);
  const turn = await quickResearch(h, h.jarvis.newConversation(), createTurnGate({ gate, isOn: () => true }));
  assert.ok(0.7 + wouldCost > 1, `run to the end: ${(0.7 + wouldCost).toFixed(4)}`);
  assert.equal(turn.error && turn.error.kind, 'live_cap');
  assert.ok(budget.spent() <= 1 + 1e-9, `the hour ends at ${budget.spent().toFixed(4)}`);
  assert.equal(gate.reserved(), 0);
});

test('MONEY-1 (b): with less room than the worst case but enough for the input and a useful answer, the question goes out with max_tokens to fit; with less, it is refused', async () => {
  const reply = { content: [blk.text('It is a USB-C charger.')], stop: 'end_turn', usage: { input_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 15000, output_tokens: 120 } };
  {
    const h = scripted(() => reply);
    const { budget, gate } = liveHour(0.85);
    const conv = h.jarvis.newConversation();
    const turn = await h.jarvis.startTurn(conv, { text: 'What is this?', mode: 'quick', gate: createTurnGate({ gate, isOn: () => true }) }).done;
    assert.equal(turn.status, 'done', 'answered: 15¢ left covers the question and a useful answer');
    const [req] = leads(h.api);
    assert.ok(req.body.max_tokens >= GATE_LIMITS.usefulTokens && req.body.max_tokens < GATE_LIMITS.firstMaxTokens, `max_tokens ${req.body.max_tokens}`);
    assert.ok(budget.spent() <= 1);
    assert.equal(gate.reserved(), 0);
  }
  {
    const h = scripted(() => reply);
    const { budget, gate } = liveHour(0.95);
    const turn = await h.jarvis.startTurn(h.jarvis.newConversation(), { text: 'What is this?', mode: 'quick', gate: createTurnGate({ gate, isOn: () => true }) }).done;
    assert.equal(turn.error && turn.error.kind, 'live_cap', '5¢ left: not even the input fits');
    assert.equal(leads(h.api).length, 0, 'nothing sent');
    assert.ok(near(budget.spent(), 0.95));
  }
});

test('MONEY-1: the meter, on its own: the prompt as billed, all of max_tokens, each search and round; a page fetch beyond the budget stops it before it runs', () => {
  const meter = createRequestMeter({ model: LEAD, maxTokens: 4000, limitUsd: 0.2, web: LIVE_WEB, tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8, max_content_tokens: 12000 }] });
  assert.equal(meter.onEvent({ type: 'message_start', message: { usage: { input_tokens: 8, cache_creation_input_tokens: 0, cache_read_input_tokens: 15000 } } }), false);
  assert.ok(near(meter.spent(), (8 * 4 + 15000 * 0.2 + 4000 * 20) / 1e6), 'a warm prompt and all of max_tokens');
  assert.equal(meter.onEvent({ type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} } }), false);
  assert.equal(meter.onEvent({ type: 'content_block_stop', index: 0 }), false);
  assert.ok(meter.committed() > meter.spent(), 'the round the search starts is counted ahead');
  assert.equal(meter.onEvent({ type: 'content_block_start', index: 1, content_block: searchResult('s1', 4000) }), false);
  assert.equal(meter.tripped, null);
  assert.equal(meter.onEvent({ type: 'content_block_start', index: 2, content_block: { type: 'server_tool_use', id: 'f1', name: 'web_fetch', input: {} } }), true);
  assert.equal(meter.tripped, 'fetch');
  // A round that would pass the limit stops it as the tool starts, before the round.
  const tight = createRequestMeter({ model: LEAD, maxTokens: 1000, limitUsd: 0.065, web: LIVE_WEB, tools: [] });
  tight.onEvent({ type: 'message_start', message: { usage: { input_tokens: 8, cache_creation_input_tokens: 6000, cache_read_input_tokens: 0 } } });
  tight.onEvent({ type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 's1', name: 'web_search', input: {} } });
  assert.equal(tight.tripped, null);
  assert.equal(tight.onEvent({ type: 'content_block_stop', index: 0 }), true, `${tight.committed().toFixed(4)} committed against 6.5¢`);
  assert.equal(tight.tripped, 'cost');
});

test('MONEY-1: the worst case counts each search\'s results, each page and every later round reading the rest again', () => {
  const tools = [
    { type: 'web_search_20260209', name: 'web_search', max_uses: 10 },
    { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8, max_content_tokens: 12000 },
  ];
  const params = { model: LEAD, max_tokens: 4000, system: 'x'.repeat(57000), tools, messages: [{ role: 'user', content: 'Research this.' }] };
  const full = requestWorstUsd(params);
  const live = requestWorstUsd(params, { web: LIVE_WEB });
  const searchesOnly = requestWorstUsd(params, { web: { searches: 10, fetches: 0 } });
  assert.ok(full - searchesOnly > 8 * 12000 * 5e-6, 'eight 12,000-token pages: more than 48¢ of page text');
  assert.ok(live > 0.2 && live < 0.32, `a question during the live view holds ${live.toFixed(4)}`);
  assert.ok(full > 0.9, `with the tools' own budget, a request could cost ${full.toFixed(4)}`);
});

test('MONEY-2: a swarm turn asked with the live view off keeps its limits when the live view starts mid-mission, and is never refused or counted', async () => {
  for (const spent of [0, 0.8]) {
    const fetch = createMockFetch({ timeScale: 0.02 });
    const jarvis = createJarvis({
      getSettings: () => DEFAULT_TEST_SETTINGS,
      getApiKey: () => KEY,
      fetch,
      memory: createMemory(),
      library: createFakeLibrary(),
      persist: async (conv) => structuredClone(conv),
      clientOptions: { maxRetries: 0 },
      retryBaseMs: 20,
      workerStaggerMs: 5,
      maxRetryWaitMs: 200,
    });
    const { budget, gate } = liveHour(spent);
    const live = { on: false };
    const turnGate = createTurnGate({ gate, isOn: () => live.on }); // made when the turn starts, as send() does
    const conv = jarvis.newConversation();
    const run = jarvis.startTurn(conv, { text: 'Compare the options [[swarm:3]]', mode: 'swarm', gate: turnGate });
    const off = run.on('agent', () => {
      live.on = true; // the owner starts the live view while the agents work
      off();
    });
    const turn = await run.done;
    assert.equal(live.on, true, 'the live view started mid-mission');
    assert.equal(turn.status, 'done', `hour at ${spent}: the summary after the paid agents is sent`);
    const leadMax = fetch.mock.requests.filter((r) => r.kind === 'lead').map((r) => r.body.max_tokens);
    const normal = DEPTHS[DEFAULT_TEST_SETTINGS.depth || 'balanced'].visualLeadMaxTokens;
    assert.ok(leadMax.length >= 2 && leadMax.every((m) => m === normal), `every lead request at its normal max_tokens (${leadMax})`);
    assert.ok(near(budget.spent(), spent), 'nothing counted in the live view\'s hour');
    assert.equal(turnGate.active, false);
    assert.equal(gate.reserved(), 0);
    assert.deepEqual(fetch.mock.violations, []);
  }
});

test('MONEY-6: with no chat yet, a quick answer is priced as the new chat\'s real first request; whenever it would be offered, the gate sends it with its web search', async () => {
  const { LEAD_SYSTEM_LATEST, leadToolsLatest } = await import('../../src/engine/prompts.js');
  const text = 'Research this with a web search: a black USB-C charger.';
  const probe = scripted(() => ({ content: [blk.text('ok')], stop: 'end_turn' }));
  const preview = probe.jarvis.previewRequest(null, { text, mode: 'quick', lines: [gateNote] });
  assert.equal(preview.system[0].text, LEAD_SYSTEM_LATEST, 'a new chat\'s system prompt');
  assert.deepEqual(preview.tools, leadToolsLatest(), 'and its tools');
  const said = preview.messages.at(-1).content.map((b) => b.text).join('\n');
  assert.ok(said.includes('<turn_context>') && said.includes(gateNote) && said.includes(text), 'the turn context the engine adds, with the gate\'s line');
  // What the offer checks (app.js quickAnswerFits): its input, a useful answer and one web search.
  const quickUsd = requestWorstUsd({ ...preview, max_tokens: GATE_LIMITS.usefulTokens }, { web: { searches: 1, fetches: 0 } });
  assert.ok(quickUsd > 0.1, `a new chat's quick answer needs ${quickUsd.toFixed(4)} (the system prompt and tools alone are about 19,000 tokens)`);
  for (const spent of [0.75, 0.85, 0.9]) {
    const { gate } = liveHour(spent);
    const offered = gate.room() >= quickUsd;
    const h = scripted(() => ({ content: [blk.text('About $39.')], stop: 'end_turn' }));
    let ticket = null;
    const turnGate = createTurnGate({ gate, isOn: () => true });
    const watching = { ...turnGate, maxTokens: turnGate.maxTokens, reserve: async (args) => (ticket = await turnGate.reserve(args)), active: true, turnNote: turnGate.turnNote };
    const turn = await h.jarvis.startTurn(h.jarvis.newConversation(), { text, mode: 'quick', gate: watching }).done;
    if (offered) {
      assert.equal(turn.status, 'done', `offered at ${spent}: sent`);
      assert.ok(ticket && ticket.web.searches >= 1, `with its web search (${JSON.stringify(ticket && ticket.web)})`);
    }
    if (spent === 0.9) assert.equal(offered, false, 'at 90¢ a new chat\'s quick answer is not offered');
  }
});
