// The live view's gate for answers (v8.1, E0): src/lib/live-gate.js. Reserve before a main-model
// request sent while the live view is on, settle with the real cost, release a request that failed
// before it was billed, keep one stopped after it was sent, refuse at the edge of the $1, and two
// windows on one storage (each sees the other's reservations and spending; a lock lets only one take
// the last room). Also the worst case of one request and the line Jarvis says at the edge. The clock
// and the storage are fakes; nothing here touches the network or a DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLiveBudget, LIVE_SPEND_KEY } from '../../src/lib/live-view.js';
import {
  GATE_LIMITS,
  LIVE_RESERVED_PREFIX,
  LIVE_WEB,
  allowedSearches,
  capLine,
  createLiveGate,
  createTurnGate,
  estimateInputTokens,
  gateMaxTokens,
  requestWorstUsd,
} from '../../src/lib/live-gate.js';
import { imageTokens } from '../../src/lib/optics.js';
import { MODELS } from '../../src/engine/models.js';
import { LEAD_SYSTEM_LATEST, leadToolsLatest } from '../../src/engine/prompts.js';
import { fakeJpeg } from './optics.support.mjs';

const SEC = 1000;
const MIN = 60 * SEC;
const T0 = Date.UTC(2026, 10, 25, 14, 0, 0);

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
    map,
  };
}

function fakeClock(start = T0) {
  const clock = { t: start };
  clock.now = () => clock.t;
  return clock;
}

/** One Jarvis window: its own budget and gate over the shared storage and clock. */
function windowOn(storage, clock, extra = {}) {
  const budget = createLiveBudget({ now: clock.now, storage });
  return { budget, gate: createLiveGate({ budget, storage, now: clock.now, ...extra }) };
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const reservedKeys = (storage) => [...storage.map.keys()].filter((k) => k.startsWith(LIVE_RESERVED_PREFIX));

test('reserve, then settle: the real cost replaces the reservation', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const { budget, gate } = windowOn(storage, clock);
  const r = await gate.reserve(0.25);
  assert.equal(r.ok, true);
  assert.ok(near(gate.reserved(), 0.25), 'held while the request runs');
  assert.equal(budget.spent(), 0, 'nothing spent yet');
  assert.equal(reservedKeys(storage).length, 1, 'kept in storage for the other windows');
  clock.t += 8 * SEC;
  assert.equal(await gate.settle(r.id, 0.031), true);
  assert.equal(gate.reserved(), 0);
  assert.ok(near(budget.spent(), 0.031), 'the real cost is in the hour');
  assert.equal(reservedKeys(storage).length, 0, 'an empty list is not kept');
  assert.equal(await gate.settle(r.id, 0.031), false, 'settled once: never counted twice');
  assert.ok(near(budget.spent(), 0.031));
});

test('release: a request that failed before it was billed (a 429, a 529, a 400) costs nothing', async () => {
  const storage = memoryStorage();
  const { budget, gate } = windowOn(storage, fakeClock());
  const r = await gate.reserve(0.2);
  assert.equal(await gate.release(r.id), true);
  assert.equal(gate.reserved(), 0);
  assert.equal(budget.spent(), 0);
  assert.equal(await gate.release(r.id), false);
  assert.equal(await gate.keep(r.id), false, 'released: nothing to keep');
  assert.equal(budget.spent(), 0);
});

test('keep: a request stopped after it was sent may have been billed, so its whole reservation counts', async () => {
  const storage = memoryStorage();
  const { budget, gate } = windowOn(storage, fakeClock());
  const r = await gate.reserve(0.18);
  assert.equal(await gate.keep(r.id), true);
  assert.equal(gate.reserved(), 0);
  assert.ok(near(budget.spent(), 0.18));
});

test('refuse at the edge: the hour\'s spending, every reservation and this request may not pass $1', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const { budget, gate } = windowOn(storage, clock);
  budget.add(0.5); // the live view's looks, at 2:00 PM
  clock.t += 10 * MIN;
  budget.add(0.47); // and more by 2:10 PM: 97¢ in the hour
  const big = await gate.reserve(0.2);
  assert.equal(big.ok, false, 'a Look reserving 20¢ does not fit at 97¢');
  // It fits again once the 2:00 PM spending leaves the hour: 3:00 PM.
  assert.equal(big.resumeAt, T0 + 60 * MIN);
  const exact = await gate.reserve(0.03);
  assert.equal(exact.ok, true, 'exactly $1.00 is within the cap');
  const more = await gate.reserve(0.000001);
  assert.equal(more.ok, false, 'nothing more while it is held');
  await gate.release(exact.id);
  assert.equal((await gate.reserve(0.000001)).ok, true, 'released: the room is back');
  // The live view's own looks see the reservations too.
  const g2 = windowOn(storage, clock).gate;
  assert.equal(g2.fits(0.0001), true);
  await gate.reserve(0.0299);
  assert.equal(g2.fits(0.0002), false, 'a look of 0.02¢ no longer fits beside the held 3¢');
  assert.equal(g2.resumeAt(0.0002), T0 + 60 * MIN);
  // A request worth more than the whole cap can never go this hour.
  assert.equal((await gate.reserve(1.5)).resumeAt, Infinity);
});

test('two windows on one storage: each sees the other\'s reservations and spending', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const a = windowOn(storage, clock);
  const b = windowOn(storage, clock);
  a.budget.add(0.3);
  const ra = await a.gate.reserve(0.6);
  assert.equal(ra.ok, true);
  assert.ok(near(b.gate.reserved(), 0.6), 'B sees A\'s reservation');
  assert.ok(near(b.budget.spent(), 0.3), 'and A\'s spending');
  const rb = await b.gate.reserve(0.2);
  assert.equal(rb.ok, false, '30¢ spent + 60¢ held + 20¢ > $1');
  await a.gate.settle(ra.id, 0.05);
  assert.ok(near(b.gate.reserved(), 0), 'settled in A: gone in B');
  assert.ok(near(b.budget.spent(), 0.35));
  const rb2 = await b.gate.reserve(0.2);
  assert.equal(rb2.ok, true);
  assert.ok(near(a.gate.reserved(), 0.2), 'and A sees B\'s');
  assert.equal(reservedKeys(storage).length, 1, 'one key per window that holds a reservation');
  await b.gate.settle(rb2.id, 0.04);
  assert.ok(near(a.budget.spent(), 0.39));
  assert.ok(near(JSON.parse(storage.getItem(LIVE_SPEND_KEY)).reduce((s, e) => s + e.usd, 0), 0.39), 'one hour\'s spending in v8.0\'s key');
});

test('two windows asking for the last room at the same moment: through the lock, only one gets it', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  // A Web Lock stand-in: callbacks run one after another, across both windows.
  let chain = Promise.resolve();
  const order = [];
  const lock = (fn) => {
    const next = chain.then(() => fn());
    chain = next.catch(() => {});
    return next;
  };
  const a = windowOn(storage, clock, { lock });
  const b = windowOn(storage, clock, { lock });
  a.budget.add(0.7);
  const [ra, rb] = await Promise.all([a.gate.reserve(0.2).then((r) => (order.push('a'), r)), b.gate.reserve(0.2).then((r) => (order.push('b'), r))]);
  assert.deepEqual([ra.ok, rb.ok], [true, false], '70¢ + 20¢ fits once, not twice');
  assert.deepEqual(order, ['a', 'b']);
  assert.ok(near(a.gate.reserved(), 0.2));
});

test('a window closed in the middle of a request: its reservation counts for the rest of the hour, then it is cleared', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const gone = windowOn(storage, clock);
  await gone.gate.reserve(0.22); // the window closes before the answer: never settled
  const other = windowOn(storage, clock);
  clock.t += 59 * MIN;
  assert.ok(near(other.gate.reserved(), 0.22), 'the worst is assumed: it may have been billed');
  clock.t += 1 * MIN;
  assert.equal(other.gate.reserved(), 0, 'an hour later it no longer counts');
  assert.equal(reservedKeys(storage).length, 0, 'and its key is cleared');
});

test('unreadable storage reads as no reservations; storage that throws or is missing still gates this window', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  storage.setItem(`${LIVE_RESERVED_PREFIX}junk`, '{not json');
  storage.setItem(`${LIVE_RESERVED_PREFIX}mixed`, JSON.stringify([{ id: 'x', t: T0, usd: 0.1 }, { t: 'soon', usd: 1 }, null, { t: T0, usd: -3 }, { t: T0 + HOURISH(), usd: '0.05' }]));
  const { gate } = windowOn(storage, clock);
  assert.ok(near(gate.reserved(), 0.15), 'every entry that can be read counts (a future time from now)');
  assert.equal(storage.getItem(`${LIVE_RESERVED_PREFIX}junk`), null, 'an unreadable key is cleared');

  const throwing = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    },
    removeItem() {
      throw new Error('blocked');
    },
    key() {
      throw new Error('blocked');
    },
    length: 3,
  };
  const budget = createLiveBudget({ now: clock.now, storage: throwing });
  const g = createLiveGate({ budget, storage: throwing, now: clock.now });
  const r = await g.reserve(0.9);
  assert.equal(r.ok, true);
  assert.equal((await g.reserve(0.2)).ok, false, 'its own reservations still count');
  await g.settle(r.id, 0.4);
  assert.ok(near(budget.spent(), 0.4));
  const none = createLiveGate({ budget: createLiveBudget({ now: clock.now, storage: null }), storage: null, now: clock.now });
  assert.equal((await none.reserve(0.5)).ok, true);
  assert.equal((await none.reserve(0.6)).ok, false);
  assert.throws(() => createLiveGate({}), /budget is required/);
});

function HOURISH() {
  return 5 * MIN; // a time in the future: counted from now
}

// ---- the worst case of one request -------------------------------------------------------------

test('max_tokens while the live view is on: 4,000 for a turn\'s first request, 1,000 after', () => {
  assert.equal(gateMaxTokens(true), 4000);
  assert.equal(gateMaxTokens(false), 1000);
  assert.equal(GATE_LIMITS.searchUsd, 0.01);
});

test('a request\'s input in tokens: text at 3 characters a token, pictures from their real size, a PDF by its size', () => {
  const jpeg = fakeJpeg(1280, 720).toString('base64');
  const look = {
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    system: [{ type: 'text', text: 'x'.repeat(3000) }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'y'.repeat(300) }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg } }, { type: 'text', text: 'What is this?' }] }],
  };
  assert.equal(estimateInputTokens(look), 1000 + 5 + 100 + imageTokens(1280, 720) + 5, 'the picture counts 1,196 tokens, never its base64 length');
  const noHeader = { messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://example.com/a.png' } }] }] };
  assert.equal(estimateInputTokens(noHeader), 5 + 4784, 'a picture of unknown size: the high-resolution cap');
  const pdf = { messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'A'.repeat(400000) } }] }] };
  assert.equal(estimateInputTokens(pdf), 5 + 15000, '300 KB: about 15,000 tokens');
  const history = {
    messages: [
      { role: 'user', content: 'a'.repeat(30) },
      { role: 'assistant', content: [{ type: 'thinking', thinking: 'b'.repeat(60), signature: 'c'.repeat(30) }, { type: 'tool_use', id: 't1', name: 'pin_labels', input: { frame: 'f1', labels: [] } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'd'.repeat(90) }] },
    ],
  };
  const toolUse = Math.ceil(JSON.stringify({ type: 'tool_use', id: 't1', name: 'pin_labels', input: { frame: 'f1', labels: [] } }).length / 3);
  assert.equal(estimateInputTokens(history), 5 + 10 + 5 + 30 + toolUse + 5 + 30 + 10);
  assert.equal(estimateInputTokens(null), 0);
  assert.equal(estimateInputTokens({ system: 'abc' }), 1);
});

// Changed on purpose (MONEY-1): the worst case now also counts what a request's own server tools add
// (each search's results, each fetched page, and every later round reading the rest again), and a
// question during the live view reserves its turn's web budget (LIVE_WEB), not the tools' own.
test('the worst case: the input at the cache-write price, max_tokens at the output price, and each web search with its results and the rounds that read them again', () => {
  const tools = leadToolsLatest();
  assert.equal(allowedSearches(tools), 10, 'the lead may search 10 times a request');
  assert.equal(allowedSearches([{ name: 'update_memory' }]), 0);
  assert.equal(allowedSearches(undefined), 0);
  const params = {
    model: 'claude-opus-5-5',
    max_tokens: 4000,
    system: [{ type: 'text', text: LEAD_SYSTEM_LATEST }],
    tools,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: fakeJpeg(1280, 720).toString('base64') } }, { type: 'text', text: 'What am I looking at?' }] }],
  };
  const input = estimateInputTokens(params);
  const lead = MODELS['claude-opus-5-5'];
  // Without web tools: all of the input at the cache-write price and max_tokens at the output price.
  const bare = { ...params, tools: [] };
  assert.ok(near(requestWorstUsd(bare), (estimateInputTokens(bare) * lead.cacheWrite5mPerM + 4000 * lead.outPerM) / 1e6));
  // With them, during the live view: each of its 2 searches 1¢, its results (4,000 tokens) written to
  // the cache, and every later round reading what came before again (the output written once).
  const S = LIVE_WEB.searches;
  const results = S * GATE_LIMITS.searchTokens;
  const usd = requestWorstUsd(params, { web: LIVE_WEB });
  const expected = (input * lead.cacheWrite5mPerM + results * lead.cacheWrite5mPerM + S * (input + results) * lead.cacheReadPerM + 4000 * (lead.outPerM + lead.cacheWrite5mPerM + S * lead.cacheReadPerM)) / 1e6 + S * 0.01;
  assert.ok(near(usd, expected), `${usd} vs ${expected}`);
  // A Look's first request, in a new chat, during the live view: between 20¢ and 35¢ held (a Look
  // really costs about 3¢: the hour keeps its room for the worst case only while it runs).
  assert.ok(usd > 0.2 && usd < 0.35, `a Look's first request reserves ${usd}`);
  const later = requestWorstUsd({ ...params, max_tokens: 1000 }, { web: LIVE_WEB });
  assert.ok(near(usd - later, (3000 * (lead.outPerM + lead.cacheWrite5mPerM + S * lead.cacheReadPerM)) / 1e6), 'max_tokens 1,000: about 7.5¢ less');
  const small = requestWorstUsd(params, { model: 'claude-haiku-5-5', web: LIVE_WEB });
  assert.ok(small - S * 0.01 < (usd - S * 0.01) / 20, 'priced at the model it goes to (the searches cost the same)');
  assert.ok(near(requestWorstUsd({ model: 'claude-opus-5-5', max_tokens: 0, messages: [] }), 0));
  // With the tools' own budget (10 searches, 8 pages of 12,000 tokens) one request could cost a dollar.
  assert.ok(requestWorstUsd(params) > 0.9, String(requestWorstUsd(params)));
});

test('the line at the edge names the minute it can go on (rounded up), or says to stop the live view', () => {
  const at = Date.UTC(2026, 10, 25, 14, 40, 30);
  const shown = [];
  const fmt = (t) => {
    shown.push(t);
    return '2:41 PM';
  };
  assert.equal(capLine(at, { formatTime: fmt }), "That would take the live view past its dollar this hour. It can go on at 2:41 PM, or say 'stop live view' and ask again.");
  assert.deepEqual(shown, [at]);
  assert.equal(capLine(Infinity), "That would take the live view past its dollar this hour. Say 'stop live view' and ask again.");
  assert.equal(capLine(Number.NaN), "That would take the live view past its dollar this hour. Say 'stop live view' and ask again.");
  assert.match(capLine(at), /It can go on at \d{1,2}:\d{2}/, 'the device\'s own clock style');
});

// Changed on purpose (MONEY-2): the turn gate is decided when the turn starts. One made while the live
// view was off stays as today for the whole turn, even after the live view starts; a turn asked while
// it is on is capped and reserves. And (MONEY-1 b) a request reserves all that is left when that still
// covers its input and a useful answer, with max_tokens to fit; with less, it is refused.
test('the engine\'s side: a turn asked with the live view off is left alone, even once it starts; asked while it is on, max_tokens is capped and each request reserves, once', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const { budget, gate } = windowOn(storage, clock);
  let on = false;
  const asked = createTurnGate({ gate, isOn: () => on });
  const params = { model: 'claude-opus-5-5', max_tokens: 4000, system: 'hello', messages: [{ role: 'user', content: 'What is this?' }] };
  assert.equal(asked.active, false);
  assert.equal(asked.turnNote, '');
  assert.equal(asked.maxTokens(true), null, 'the live view off: as today');
  assert.equal(await asked.reserve({ params }), null);
  on = true;
  assert.equal(asked.maxTokens(true), null, 'the live view started during the turn: still as today');
  assert.equal(await asked.reserve({ params }), null);
  const turnGate = createTurnGate({ gate, isOn: () => on });
  assert.equal(turnGate.active, true);
  assert.match(turnGate.turnNote, /^Live view: .*at most 2 web searches, and do not use web_fetch\.$/);
  assert.equal(turnGate.maxTokens(true), 4000);
  assert.equal(turnGate.maxTokens(false), 1000);
  const ticket = await turnGate.reserve({ params, model: 'claude-opus-5-5' });
  assert.ok(ticket && !ticket.refused);
  assert.ok(near(gate.reserved(), ticket.usd));
  await ticket.settle(0.026);
  await ticket.keep();
  await ticket.release();
  assert.ok(near(budget.spent(), 0.026), 'one outcome per ticket');
  assert.equal(gate.reserved(), 0);
  // A ticket whose request failed before it was billed gives its room back.
  const failed = await turnGate.reserve({ params });
  await failed.release();
  assert.equal(gate.reserved(), 0);
  assert.ok(near(budget.spent(), 0.026));
  // At 97¢ this small request still fits its input and a useful answer: all that is left is held,
  // and its max_tokens comes down to fit it.
  budget.add(0.944);
  const fitted = await turnGate.reserve({ params });
  assert.ok(fitted && !fitted.refused);
  assert.ok(fitted.usd <= 0.03 + 1e-9 && fitted.usd > 0.029, `held ${fitted.usd}`);
  assert.ok(fitted.maxTokens >= 1000 && fitted.maxTokens < 4000, `max_tokens ${fitted.maxTokens}`);
  assert.ok(requestWorstUsd({ ...params, max_tokens: fitted.maxTokens }, { web: fitted.web }) <= fitted.usd + 1e-9);
  await fitted.release();
  // At 99¢ not even that: refused with the line, and nothing is held.
  budget.add(0.02);
  const refused = await turnGate.reserve({ params });
  assert.equal(refused.refused, true);
  assert.match(refused.message, /^That would take the live view past its dollar this hour\./);
  assert.equal(gate.reserved(), 0);
  const throwingIsOn = createTurnGate({
    gate,
    isOn: () => {
      throw new Error('gone');
    },
  });
  assert.equal(throwingIsOn.maxTokens(true), null, 'an isOn that throws counts as off');
});

test('one turn gate per turn: a turn that went through the live view keeps counting after it stops; one that never did is left alone', async () => {
  const storage = memoryStorage();
  const clock = fakeClock();
  const { budget, gate } = windowOn(storage, clock);
  let on = true;
  const params = { model: 'claude-opus-5-5', max_tokens: 4000, system: 'hello', messages: [{ role: 'user', content: 'What is this?' }] };
  const asked = createTurnGate({ gate, isOn: () => on });
  const first = await asked.reserve({ params });
  assert.ok(first.usd > 0 && asked.counting);
  await first.settle(0.03);
  on = false;
  assert.equal(asked.maxTokens(false), null, 'off: as usual');
  const later = await asked.reserve({ params });
  assert.equal(later.usd, 0, 'nothing reserved: nothing to refuse');
  await later.settle(0.012);
  await later.settle(0.5);
  assert.ok(near(budget.spent(), 0.042), 'but its real cost counts, once');
  const cut = await asked.reserve({ params });
  await cut.keep(0.004);
  assert.ok(near(budget.spent(), 0.046), 'a request cut after it was sent counts what it already cost');
  const failed = await asked.reserve({ params });
  await failed.release();
  assert.ok(near(budget.spent(), 0.046), 'one turned down before billing costs nothing');
  const other = createTurnGate({ gate, isOn: () => on });
  assert.equal(await other.reserve({ params }), null, 'a turn asked with the live view off never counts');
  assert.equal(other.counting, false);
  assert.equal(gate.reserved(), 0);
});
