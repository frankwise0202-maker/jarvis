// v8.1.1 fix MONEY-R3-1 (the third review of the live view's $1 an hour for answers). Ported from the skeptic's
// engine-level probes (review3/money-v-422af45/test/unit/money-v3/edge-engine and edge-again): the real
// startTurn, leadRequest, meter, settleFailedTicket and the gate's settleAtMost, against the scripted API.
// A gated quick answer in a new chat (a cold 19,000-token prompt) makes one web search whose result is far
// larger than the 8,000 tokens the meter counts ahead, at an hour that can't grow the hold. The meter puts the
// round that result starts in its figure when the result arrives (the round has begun on Anthropic's side), so:
//   - the hour counts the meter's figure, at least up to all the room the hour still had: no room the round may
//     already have used stays on offer to later questions and the live view's looks, and the record never
//     passes $1;
//   - the stop's line is built once that is counted, so it names when the hour really has room again;
//   - asked again, the question is refused before it is sent (nothing left), not sent to trip a second time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveBudget } from '../../src/lib/live-view.js';
import * as G from '../../src/lib/live-gate.js';
import { blk, createHarness } from './engine.support.test.mjs';

const CAP = /^That would take the live view past its dollar this hour\./;
const COLD = { input_tokens: 8, cache_creation_input_tokens: 19000, cache_read_input_tokens: 0 };
const WARM = { input_tokens: 8, cache_creation_input_tokens: 60, cache_read_input_tokens: 19000 };

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

/** A search result of about `tokens` tokens (3 characters a token), over `n` results. */
const searchResult = (id, tokens, n = 8) => ({
  type: 'web_search_tool_result',
  tool_use_id: id,
  content: Array.from({ length: n }, (_, k) => ({ type: 'web_search_result', url: `https://x.example/${id}/${k}`, title: 'X', page_age: null, encrypted_content: 'e'.repeat(Math.round((tokens * 3) / n)) })),
});

/** The answer: a line, one search, its (large) result, the answer. */
const reply = (n, tokens, startUsage) => ({
  content: [blk.text('Let me look that up.'), blk.search(`s${n}`, 'anker 715'), searchResult(`s${n}`, tokens), blk.text('It is the Anker 715, about $39.')],
  stop: 'end_turn',
  startUsage,
  usage: { ...startUsage, output_tokens: 300 },
});

/** The engine's turn gate, keeping each request's meter (to read its figure afterwards). */
function spyGate(turnGate, meters) {
  return {
    get active() {
      return turnGate.active;
    },
    get turnNote() {
      return turnGate.turnNote;
    },
    get counting() {
      return turnGate.counting;
    },
    maxTokens: (first) => turnGate.maxTokens(first),
    async reserve(args) {
      const ticket = await turnGate.reserve(args);
      if (!ticket || ticket.refused || typeof ticket.meter !== 'function') return ticket;
      const meter = ticket.meter;
      return {
        ...ticket,
        meter: (o) => {
          const m = meter(o);
          meters.push({ m, held: ticket.usd, maxTokens: ticket.maxTokens });
          return m;
        },
      };
    },
  };
}

function liveHour(spent) {
  const storage = memoryStorage();
  const budget = createLiveBudget({ storage });
  if (spent > 0) budget.add(spent);
  return { budget, gate: G.createLiveGate({ budget, storage }) };
}

const ask = (h, conv, gate, meters) => h.jarvis.startTurn(conv, { text: 'What is this charger and what does it cost? Search the web.', mode: 'quick', gate: spyGate(G.createTurnGate({ gate, isOn: () => true }), meters) }).done;
const leads = (h) => h.api.requests.filter((r) => r.kind === 'lead');

/** The line names the current minute (or the next): what a line built before the stop is counted says. */
const namesNow = (line) => [Date.now(), Date.now() + 60000].some((t) => line === G.capLine(t));

for (const [spent, tokens] of [
  [0.6, 60000],
  [0.7, 45000],
  [0.7, 30000],
  [0.74, 45000],
]) {
  test(`MONEY-R3-1: hour at ${spent * 100}¢, a new chat, one search measured at ${tokens.toLocaleString('en-US')} tokens: the hour counts the meter's figure up to all its room, and the line names when it has room again`, async () => {
    const { budget, gate } = liveHour(spent);
    const h = createHarness({ handler: (req) => (req.kind === 'lead' ? reply(1, tokens, COLD) : { content: [blk.text('ok')], stop: 'end_turn' }) });
    const meters = [];
    const turn = await ask(h, h.jarvis.newConversation(), gate, meters);
    assert.equal(meters.length, 1, 'the question was sent');
    const { m, held } = meters[0];
    assert.equal(m.tripped, 'cost', 'stopped by the hour, at the result');
    assert.equal(turn.status, 'error');
    assert.equal(turn.error.kind, 'live_cap');
    assert.match(turn.error.message, CAP);
    const figure = m.committed();
    const room = 1 - spent;
    assert.ok(figure > held + 1e-6, `the meter's figure ($${figure.toFixed(4)}) passed what was held ($${held.toFixed(4)})`);
    const counted = budget.spent() - spent;
    assert.ok(counted >= Math.min(figure, room) - 1e-9, `counted $${counted.toFixed(4)}: at least the meter's figure up to the hour's room ($${Math.min(figure, room).toFixed(4)})`);
    assert.ok(budget.spent() <= 1 + 1e-9, `the record never passes $1 ($${budget.spent().toFixed(4)})`);
    assert.ok(gate.room() < 1e-9 && !gate.fits(0.0001), `no room the round may already have used stays on offer ($${gate.room().toFixed(4)})`);
    assert.equal(gate.reserved(), 0);
    assert.ok(!namesNow(turn.error.message), `the line names when the hour has room again, not now: ${turn.error.message}`);
  });
}

test('MONEY-R3-1 control: at an empty hour the hold grows for the same large result and the answer completes at its real cost', async () => {
  const { budget, gate } = liveHour(0);
  const h = createHarness({ handler: (req) => (req.kind === 'lead' ? reply(1, 45000, COLD) : { content: [blk.text('ok')], stop: 'end_turn' }) });
  const turn = await ask(h, h.jarvis.newConversation(), gate, []);
  assert.equal(turn.status, 'done', `${turn.status} ${turn.error ? turn.error.message : ''}`);
  assert.ok(Math.abs(budget.spent() - turn.costUsd) < 1e-6, 'counted at its real cost');
  assert.equal(gate.reserved(), 0);
});

test('MONEY-R3-1: asked again after that stop, as the line invites, the question is refused before it is sent: the room the round used is not offered twice', async () => {
  const { budget, gate } = liveHour(0.6);
  let n = 0;
  const h = createHarness({
    handler: (req) => {
      if (req.kind !== 'lead') return { content: [blk.text('ok')], stop: 'end_turn' };
      n += 1;
      // Asked again in the same chat: its prompt is read from the cache, the question written.
      return reply(n, 60000, n === 1 ? COLD : WARM);
    },
  });
  const conv = h.jarvis.newConversation();
  const meters = [];
  const first = await ask(h, conv, gate, meters);
  assert.equal(first.status, 'error');
  assert.equal(meters.length, 1);
  const afterFirst = budget.spent();
  for (const k of [2, 3]) {
    const again = await ask(h, conv, gate, meters);
    assert.equal(again.status, 'error', `ask ${k}`);
    assert.equal(again.error.kind, 'live_cap');
    assert.match(again.error.message, CAP);
    assert.ok(!namesNow(again.error.message), `ask ${k}: the line names when the hour has room again: ${again.error.message}`);
  }
  assert.equal(leads(h).length, 1, 'only the first question was sent');
  assert.equal(meters.length, 1, 'no second request tripped at the result');
  assert.ok(Math.abs(budget.spent() - afterFirst) < 1e-9, 'nothing more counted');
  assert.ok(budget.spent() <= 1 + 1e-9, `the record never passes $1 ($${budget.spent().toFixed(4)})`);
  assert.equal(gate.reserved(), 0);
});
