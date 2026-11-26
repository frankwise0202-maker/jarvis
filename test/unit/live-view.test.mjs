// Live view (v8.0), the pure part: src/lib/live-view.js. The $1-an-hour budget (never above the
// cap, a rolling 60 minutes, kept in storage, shared by two budgets on one storage, corrupt or
// failing storage), the estimate of one look, the cadence (a look a second, one every 5 s from 90
// cents on, back-off after a 429/529), the speak gate and the meter. The clock and the storage are
// fakes; nothing here touches the network or a DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_DEFAULTS,
  LIVE_PROMPT_CHARS,
  LIVE_RETRY_AFTER_MAX_MS,
  LIVE_SPEND_KEY,
  canSpeakLive,
  createLiveBudget,
  estimateLiveLookUsd,
  liveBackoff,
  liveMeterText,
  liveResumeShownAt,
  liveSpentText,
  nextLiveDelay,
} from '../../src/lib/live-view.js';
import { LIVE_SCHEMA, LIVE_SYSTEM, runLiveLook } from '../../src/engine/live.js';
import { estimateWatchCost, imageTokens } from '../../src/lib/optics.js';
import { fakeJpeg } from './optics.support.mjs';

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const T0 = Date.UTC(2026, 10, 25, 14, 0, 0); // a Wednesday, 2 PM UTC

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
    map,
  };
}

function fakeClock(start = T0) {
  const clock = { t: start };
  clock.now = () => clock.t;
  return clock;
}

const storedList = (storage) => JSON.parse(storage.getItem(LIVE_SPEND_KEY));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

/** A small deterministic random source (mulberry32). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- the numbers --------------------------------------------------------------------------------

test('LIVE_DEFAULTS: the contract’s numbers', () => {
  assert.deepEqual(LIVE_DEFAULTS, {
    model: 'claude-haiku-5-5',
    maxEdge: 640,
    quality: 0.75,
    intervalMs: 1000,
    slowIntervalMs: 5000,
    slowFromUsd: 0.9,
    capUsd: 1,
    windowMs: 3600000,
    sessionMs: 3600000,
    speakGapMs: 15000,
    saidKept: 5,
    backoffStartMs: 2000,
    backoffMaxMs: 30000,
  });
  assert.ok(Object.isFrozen(LIVE_DEFAULTS));
  assert.equal(LIVE_SPEND_KEY, 'jarvis.liveView.spend');
});

// ---- the estimate ---------------------------------------------------------------------------------

test('estimateLiveLookUsd: about 0.014¢ a look on Claude Haiku 5.5, about 51¢ for an hour of a look a second', () => {
  const usd = estimateLiveLookUsd();
  assert.ok(usd > 0.00012 && usd < 0.00016, String(usd));
  assert.equal(estimateLiveLookUsd({ model: 'claude-haiku-5-5', width: 640, height: 360, summaryChars: 0, saidChars: 0 }), usd);
  const hour = usd * 3600;
  assert.ok(hour > 0.3 && hour < 0.55, `an hour: $${hour.toFixed(3)}`);
  // The same ballpark as the Watch estimator on the same model (a different prompt, a smaller reply).
  const watch = estimateWatchCost({ model: 'claude-haiku-5-5' }).usd;
  assert.ok(Math.abs(usd - watch) / watch < 0.2, `${usd} vs ${watch}`);
});

test('estimateLiveLookUsd: more text and a bigger frame cost more; other models at their prices', () => {
  const base = estimateLiveLookUsd();
  const more = estimateLiveLookUsd({ summaryChars: 160, saidChars: 600 });
  // About one token per 3 characters at $0.10 per million.
  assert.ok(near(more - base, (Math.ceil((LIVE_PROMPT_CHARS + 760) / 3) - Math.ceil(LIVE_PROMPT_CHARS / 3)) * 0.1e-6, 1e-12), String(more - base));
  const big = estimateLiveLookUsd({ width: 1280, height: 720 });
  assert.equal(imageTokens(640, 360), 299);
  assert.ok(near(big - base, (imageTokens(1280, 720) - 299) * 0.1e-6, 1e-12));
  assert.ok(estimateLiveLookUsd({ model: 'claude-sonnet-5-5' }) > base * 15);
  assert.ok(estimateLiveLookUsd({ model: 'claude-not-a-model' }) > base * 30, 'an unknown model is priced as Opus 5.5');
  for (const junk of [{ summaryChars: -5 }, { saidChars: Number.NaN }, { summaryChars: '12' }, {}]) assert.equal(estimateLiveLookUsd(junk), base, JSON.stringify(junk));
  assert.equal(estimateLiveLookUsd(undefined), base);
});

test('estimateLiveLookUsd assumes at least the prompt that is really sent (system, schema and the request’s words)', async () => {
  const texts = [];
  const fetch = async (url, init) => {
    texts.push(JSON.parse(init.body).messages[0].content[1].text);
    return new Response(JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', content: [{ type: 'text', text: '{"summary":"A desk.","worth_saying":false,"line":""}' }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const summary = 's'.repeat(160);
  const said = ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(120));
  await runLiveLook({ apiKey: 'sk-ant-test-0123456789abcdefghij', apiBase: 'http://127.0.0.1:8642', fetch, frame: { data: fakeJpeg(640, 360) }, summary: '', said: [] });
  await runLiveLook({ apiKey: 'sk-ant-test-0123456789abcdefghij', apiBase: 'http://127.0.0.1:8642', fetch, frame: { data: fakeJpeg(640, 360) }, summary, said });
  const framing = Math.max(texts[0].length, texts[1].length - summary.length - said.join('').length);
  const needed = LIVE_SYSTEM.length + JSON.stringify(LIVE_SCHEMA).length + framing;
  assert.ok(LIVE_PROMPT_CHARS >= needed, `LIVE_PROMPT_CHARS ${LIVE_PROMPT_CHARS} < ${needed}`);
  assert.ok(LIVE_PROMPT_CHARS <= needed * 1.25, 'but not far above it (the estimate stays honest)');
});

// ---- the budget -----------------------------------------------------------------------------------

test('budget: starts empty; spending is recorded, kept in storage and survives a reload', () => {
  const clock = fakeClock();
  const storage = memoryStorage();
  const budget = createLiveBudget({ now: clock.now, storage });
  assert.equal(budget.key, LIVE_SPEND_KEY);
  assert.equal(budget.capUsd, 1);
  assert.equal(budget.windowMs, HOUR);
  assert.equal(budget.spent(), 0);
  assert.equal(budget.canSpend(1), true, 'the whole dollar is allowed');
  assert.equal(budget.canSpend(1.000000001), false);
  assert.equal(budget.resumeAt(0.5), T0, 'now');
  assert.equal(storage.getItem(LIVE_SPEND_KEY), null, 'reading writes nothing');

  assert.equal(budget.add(0.25), 0.25);
  assert.equal(budget.spent(), 0.25);
  const list = storedList(storage);
  assert.equal(list.length, 1);
  assert.equal(list[0].t, T0);
  assert.equal(list[0].usd, 0.25);
  assert.equal(typeof list[0].id, 'string');

  // A reload (or the app opened again) is a new budget on the same storage: the spending stays.
  clock.t += 5 * SEC;
  const again = createLiveBudget({ now: clock.now, storage });
  assert.equal(again.spent(), 0.25);
  assert.equal(again.canSpend(0.75), true);
  assert.equal(again.canSpend(0.76), false);
});

test('budget: never above the cap: a look that would pass $1.00 is refused, to the nano-dollar', () => {
  const clock = fakeClock();
  const budget = createLiveBudget({ now: clock.now, storage: memoryStorage(), coalesceMs: 0 });
  for (let i = 0; i < 10; i++) {
    assert.equal(budget.canSpend(0.1), true, `look ${i + 1}`);
    budget.add(0.1);
    clock.t += SEC;
  }
  assert.equal(budget.spent(), 1, 'ten dimes are exactly a dollar');
  assert.equal(budget.canSpend(0), true);
  assert.equal(budget.canSpend(1e-9), false);
  assert.equal(budget.canSpend(0.0001), false);
  // Real money is always recorded, even past the cap (a Look's cost after the fact).
  budget.add(0.026);
  assert.ok(near(budget.spent(), 1.026));
  assert.equal(budget.canSpend(0), false);
});

test('budget: three hours of gated looks and questions never pass the cap', () => {
  const clock = fakeClock();
  const storage = memoryStorage();
  const budget = createLiveBudget({ now: clock.now, storage });
  const other = createLiveBudget({ now: clock.now, storage }); // a second window, asking questions
  const est = estimateLiveLookUsd();
  const random = seeded(42);
  let last = 0;
  let refused = 0;
  let max = 0;
  for (let s = 0; s < 3 * 3600; s++) {
    // A look: reserve the estimate (or the last real cost if higher), spend at most that.
    const reserve = Math.max(est, last);
    if (budget.canSpend(reserve)) {
      last = reserve * (0.5 + 0.5 * random());
      budget.add(last);
    } else {
      refused += 1;
    }
    // Now and then a question in the other window (about 2.6¢), asked only if it fits.
    if (random() < 0.02 && other.canSpend(0.03)) other.add(0.026);
    const spent = budget.spent();
    assert.ok(spent <= 1, `at ${s} s: $${spent}`);
    assert.equal(other.spent(), spent, 'both windows agree');
    max = Math.max(max, spent);
    clock.t += SEC;
  }
  assert.ok(refused > 0, 'the cap was reached');
  assert.ok(max > 0.97, `and the hour got close to it ($${max})`);
});

test('budget: a rolling 60 minutes: spending leaves the window an hour after it happened', () => {
  const clock = fakeClock();
  const storage = memoryStorage();
  const budget = createLiveBudget({ now: clock.now, storage, coalesceMs: 0 });
  budget.add(0.6);
  clock.t = T0 + 30 * MIN;
  budget.add(0.3);
  clock.t = T0 + 50 * MIN;
  assert.equal(budget.spent(), 0.9);
  assert.equal(budget.canSpend(0.2), false);
  assert.equal(budget.resumeAt(0.2), T0 + HOUR, 'when the first 60 cents leave the window');
  assert.equal(budget.resumeAt(0.05), T0 + 50 * MIN, 'a nickel fits now');
  assert.equal(budget.resumeAt(0.75), T0 + 90 * MIN, 'everything has to go for 75 cents more... almost');
  clock.t = T0 + HOUR - 1;
  assert.equal(budget.canSpend(0.2), false);
  assert.equal(budget.spent(), 0.9);
  clock.t = T0 + HOUR;
  assert.equal(budget.canSpend(0.2), true);
  assert.equal(budget.spent(), 0.3);
  clock.t = T0 + 90 * MIN;
  assert.equal(budget.spent(), 0);
  budget.add(0.01);
  assert.deepEqual(storedList(storage).map((e) => e.usd), [0.01], 'spending that left the window is dropped from storage');
});

test('budget: resumeAt is exactly when canSpend becomes true (and Infinity when it never will)', () => {
  const clock = fakeClock();
  const storage = memoryStorage();
  const writer = createLiveBudget({ now: clock.now, storage, coalesceMs: 0 });
  const random = seeded(7);
  for (let i = 0; i < 40; i++) {
    writer.add(0.01 + random() * 0.05);
    clock.t += Math.floor(random() * 90 * SEC);
  }
  for (const usd of [0, 0.0001, 0.05, 0.2, 0.5, 0.99, 1]) {
    // A fresh budget for each: one that moved its clock past an entry has dropped it.
    const at = createLiveBudget({ now: clock.now, storage }).resumeAt(usd);
    assert.ok(Number.isFinite(at) && at >= clock.t, `${usd}: ${at}`);
    if (at > clock.t) {
      const before = fakeClock(at - 1);
      assert.equal(createLiveBudget({ now: before.now, storage }).canSpend(usd), false, `${usd}: not 1 ms before`);
    }
    const then = fakeClock(at);
    assert.equal(createLiveBudget({ now: then.now, storage }).canSpend(usd), true, `${usd}: from then on`);
  }
  assert.equal(writer.resumeAt(1.01), Infinity, 'more than the cap: never');
  assert.equal(createLiveBudget({ now: clock.now, storage: memoryStorage(), capUsd: 0.5 }).resumeAt(0.6), Infinity);
});

test('budget: two budgets on one storage (two tabs or windows) see each other’s spending', () => {
  const clock = fakeClock();
  const storage = memoryStorage();
  const a = createLiveBudget({ now: clock.now, storage });
  const b = createLiveBudget({ now: clock.now, storage });
  a.add(0.4);
  assert.equal(b.spent(), 0.4);
  clock.t += SEC;
  b.add(0.5);
  assert.equal(a.spent(), 0.9);
  assert.equal(a.canSpend(0.2), false);
  assert.equal(b.canSpend(0.1), true);
  clock.t += SEC;
  a.add(0.05);
  assert.equal(b.spent(), 0.95);
  assert.equal(storedList(storage).length, 2, 'one entry per window (adds within 10 s share one)');
  assert.equal(a.reload(), 0.95);
});

test('budget: spending another tab’s stale write dropped is written back by the tab that spent it (reload on the storage event)', () => {
  const clock = fakeClock();
  const storage = memoryStorage();
  const a = createLiveBudget({ now: clock.now, storage, coalesceMs: 0 });
  const b = createLiveBudget({ now: clock.now, storage, coalesceMs: 0 });
  b.add(0.1);
  const stale = storage.getItem(LIVE_SPEND_KEY); // what the other tab's copy of localStorage still holds
  clock.t += SEC;
  a.add(0.5);
  // The other tab writes from its stale copy, adding its own new spending: A's 50 cents are lost.
  clock.t += SEC;
  storage.setItem(LIVE_SPEND_KEY, JSON.stringify([...JSON.parse(stale), { t: clock.t, usd: 0.2, id: 'tab-b.9' }]));
  assert.ok(near(createLiveBudget({ now: clock.now, storage }).spent(), 0.3), 'storage alone lost them');
  assert.ok(near(a.spent(), 0.8), 'A never forgets what it spent');
  assert.ok(near(b.spent(), 0.3), 'B never saw them');
  a.reload(); // the window's storage event
  assert.ok(near(createLiveBudget({ now: clock.now, storage }).spent(), 0.8), 'written back');
  assert.ok(near(b.spent(), 0.8), 'and B sees them now');
  assert.equal(storedList(storage).length, 3);
});

test('budget: unreadable storage reads as empty and is replaced by valid entries on the next add', () => {
  for (const raw of ['not json{', '{"foo":1}', '42', 'null', '"text"', '[]', '', '{"entries":"x"}']) {
    const clock = fakeClock();
    const storage = memoryStorage({ [LIVE_SPEND_KEY]: raw });
    const budget = createLiveBudget({ now: clock.now, storage });
    assert.equal(budget.spent(), 0, JSON.stringify(raw));
    assert.equal(budget.canSpend(1), true);
    budget.add(0.1);
    assert.deepEqual(storedList(storage).map((e) => e.usd), [0.1], JSON.stringify(raw));
  }
});

test('budget: corrupt entries are skipped, but every entry that can be read counts (never more allowed)', () => {
  const clock = fakeClock();
  const list = [
    { t: T0 - MIN, usd: 0.4 },
    'junk',
    null,
    7,
    [T0, 0.5],
    { t: 'abc', usd: 1 },
    { t: T0, usd: -5 },
    { t: T0, usd: 0 },
    { t: T0, usd: 'NaN' },
    { t: T0, usd: true },
    { t: T0, usd: '0.2' },
    { usd: 0.3 },
    { t: T0 - 2 * HOUR, usd: 0.5 },
    { t: String(T0 - 10 * MIN), usd: 0.1, id: 42 },
  ];
  for (const raw of [JSON.stringify(list), JSON.stringify({ entries: list })]) {
    const storage = memoryStorage({ [LIVE_SPEND_KEY]: raw });
    const budget = createLiveBudget({ now: clock.now, storage });
    assert.ok(near(budget.spent(), 0.7), String(budget.spent())); // 0.4 + 0.2 + 0.1
    assert.equal(budget.canSpend(0.3), true);
    assert.equal(budget.canSpend(0.31), false);
  }
});

test('budget: a time in the future counts from now (and still leaves the window); an absurd amount blocks for an hour only', () => {
  const clock = fakeClock();
  const future = memoryStorage({ [LIVE_SPEND_KEY]: JSON.stringify([{ t: T0 + 10 * 365 * 24 * HOUR, usd: 0.5, id: 'x.1' }]) });
  const a = createLiveBudget({ now: clock.now, storage: future });
  assert.equal(a.spent(), 0.5);
  assert.equal(a.resumeAt(0.6), T0 + HOUR);
  clock.t = T0 + 30 * MIN;
  a.add(0.01); // the list is written back, the future entry with the time it counts from
  assert.equal(storedList(future).find((e) => e.id === 'x.1').t, T0);
  clock.t = T0 + HOUR;
  assert.equal(createLiveBudget({ now: clock.now, storage: future }).spent(), 0.01, 'gone an hour later');

  // Read once, the time it counts from is written back: a window opened later does not stretch it.
  const lateOpen = memoryStorage({ [LIVE_SPEND_KEY]: JSON.stringify([{ t: T0 + 5 * HOUR, usd: 0.5, id: 'y.1' }]) });
  const clock3 = fakeClock();
  assert.equal(createLiveBudget({ now: clock3.now, storage: lateOpen }).spent(), 0.5);
  assert.equal(storedList(lateOpen)[0].t, T0, 'fixed on the first read');
  clock3.t = T0 + 50 * MIN;
  assert.equal(createLiveBudget({ now: clock3.now, storage: lateOpen }).resumeAt(0.6), T0 + HOUR, 'not 50 minutes later');

  const huge = memoryStorage({ [LIVE_SPEND_KEY]: JSON.stringify([{ t: T0, usd: 1e300 }]) });
  const clock2 = fakeClock();
  const b = createLiveBudget({ now: clock2.now, storage: huge });
  assert.equal(b.spent(), 1000, 'counted as $1,000');
  assert.equal(b.canSpend(0), false);
  assert.equal(b.resumeAt(0.001), T0 + HOUR);
  clock2.t = T0 + HOUR;
  assert.equal(b.canSpend(0.001), true);
  assert.equal(b.spent(), 0);
});

test('budget: entries without ids count once each, in every budget, also after one of them rewrites the list', () => {
  const clock = fakeClock();
  const storage = memoryStorage({ [LIVE_SPEND_KEY]: JSON.stringify([{ t: T0, usd: 0.3 }, { t: T0, usd: 0.3 }]) });
  const a = createLiveBudget({ now: clock.now, storage });
  const b = createLiveBudget({ now: clock.now, storage });
  assert.ok(near(a.spent(), 0.6));
  assert.ok(near(b.spent(), 0.6));
  clock.t += SEC;
  a.add(0.1);
  assert.ok(near(b.spent(), 0.7), String(b.spent()));
  assert.ok(near(createLiveBudget({ now: clock.now, storage }).spent(), 0.7));
});

test('budget: without storage, or with storage that throws, it still works for this page', () => {
  const throwing = { getItem: () => { throw new Error('SecurityError'); }, setItem: () => { throw new Error('SecurityError'); } };
  for (const storage of [null, throwing, {}, { getItem: () => null }]) {
    const clock = fakeClock();
    const budget = createLiveBudget({ now: clock.now, storage });
    assert.equal(budget.spent(), 0);
    budget.add(0.7);
    assert.ok(near(budget.spent(), 0.7));
    assert.equal(budget.canSpend(0.4), false);
    assert.equal(budget.resumeAt(0.4), T0 + HOUR);
    assert.ok(near(budget.reload(), 0.7));
  }
});

test('budget: a full storage keeps the spending in memory and writes it all once it can', () => {
  const clock = fakeClock();
  const inner = memoryStorage();
  let full = true;
  const storage = { getItem: (k) => inner.getItem(k), setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); inner.setItem(k, v); } };
  const budget = createLiveBudget({ now: clock.now, storage, coalesceMs: 0 });
  budget.add(0.2);
  assert.ok(near(budget.spent(), 0.2));
  assert.equal(inner.getItem(LIVE_SPEND_KEY), null);
  full = false;
  clock.t += SEC;
  budget.add(0.1);
  assert.ok(near(createLiveBudget({ now: clock.now, storage: inner }).spent(), 0.3));
});

test('budget: an hour of a look a second stays a short list; a shared entry counts until an hour after its last add', () => {
  const clock = fakeClock();
  const storage = memoryStorage();
  const budget = createLiveBudget({ now: clock.now, storage });
  const est = estimateLiveLookUsd();
  for (let i = 0; i < 3600; i++) {
    budget.add(est);
    clock.t += SEC;
  }
  const list = storedList(storage);
  assert.ok(list.length >= 359 && list.length <= 361, String(list.length));
  assert.equal(list[0].t, T0 + 9 * SEC, 'the first ten seconds share an entry, timed at its last add');
  assert.ok(near(list[0].usd, 10 * est, 1e-9));
  assert.ok(near(budget.spent(), 3600 * est, 1e-6), String(budget.spent()));
  assert.ok(storage.getItem(LIVE_SPEND_KEY).length < 25_000, 'small enough to write every second');
  clock.t = T0 + HOUR + 9 * SEC - 1;
  assert.ok(near(budget.spent(), 3600 * est, 1e-6), 'nothing leaves early');
  clock.t = T0 + HOUR + 9 * SEC;
  assert.ok(near(budget.spent(), 3590 * est, 1e-6));
  clock.t = T0 + 2 * HOUR + 10 * SEC;
  assert.equal(budget.spent(), 0);
  // Without sharing: one entry per add.
  const each = memoryStorage();
  const single = createLiveBudget({ now: clock.now, storage: each, coalesceMs: 0 });
  for (let i = 0; i < 5; i++) single.add(est);
  assert.equal(storedList(each).length, 5);
});

test('budget: the clock, the cap and the window can be set (shorter times for tests)', () => {
  const clock = fakeClock();
  const budget = createLiveBudget({ now: clock.now, storage: memoryStorage(), capUsd: 0.05, windowMs: 10 * SEC });
  assert.equal(budget.capUsd, 0.05);
  budget.add(0.04);
  assert.equal(budget.canSpend(0.02), false);
  assert.equal(budget.resumeAt(0.02), T0 + 10 * SEC);
  clock.t += 10 * SEC;
  assert.equal(budget.canSpend(0.02), true);
  // Nonsense settings fall back to the defaults.
  const fallback = createLiveBudget({ now: clock.now, storage: memoryStorage(), capUsd: -1, windowMs: Number.NaN });
  assert.equal(fallback.capUsd, 1);
  assert.equal(fallback.windowMs, HOUR);
  // Amounts that are not money are ignored.
  for (const junk of [0, -1, Number.NaN, null, undefined, 'abc', {}]) fallback.add(junk);
  assert.equal(fallback.spent(), 0);
});

// ---- cadence ----------------------------------------------------------------------------------------

test('nextLiveDelay: a look a second, at once when the last one took longer, the first look now', () => {
  assert.equal(nextLiveDelay({ lastStartAt: null, now: 5000 }), 0);
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1300 }), 700, 'one second after the last one started');
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 2000 }), 0);
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 2600 }), 0, 'it took longer: at once');
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1300, spentUsd: 0.8999 }), 700);
});

test('nextLiveDelay: one look every 5 s from 90 cents on', () => {
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1300, spentUsd: 0.9 }), 4700);
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 7000, spentUsd: 0.95 }), 0);
});

test('nextLiveDelay: never before a back-off ends', () => {
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1300, backoffUntil: 4300 }), 3000);
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1300, backoffUntil: 1500 }), 700, 'a back-off already over');
  assert.equal(nextLiveDelay({ lastStartAt: null, now: 1300, backoffUntil: 31300 }), 30000);
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1300, spentUsd: 0.95, backoffUntil: 2000 }), 4700);
});

test('nextLiveDelay: shorter times for tests; a clock that went back or junk never stalls it', () => {
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1030, intervalMs: 100, slowIntervalMs: 500, slowFromUsd: 0.5 }), 70);
  assert.equal(nextLiveDelay({ lastStartAt: 1000, now: 1030, spentUsd: 0.5, intervalMs: 100, slowIntervalMs: 500, slowFromUsd: 0.5 }), 470);
  assert.equal(nextLiveDelay({ lastStartAt: 50 * HOUR, now: 1000 }), 1000, 'the clock went back: at most one interval');
  assert.equal(nextLiveDelay({ lastStartAt: null, now: 1000, backoffUntil: 1000 + 5 * HOUR }), LIVE_RETRY_AFTER_MAX_MS, 'at most 10 minutes');
  assert.equal(nextLiveDelay({ lastStartAt: 'x', now: 1000, backoffUntil: Number.NaN, spentUsd: 'lots' }), 0);
  assert.equal(nextLiveDelay(), 0);
  assert.equal(nextLiveDelay({ lastStartAt: 1000.2, now: 1300 }), 701, 'whole milliseconds, rounded up');
});

test('liveBackoff: 2 s, doubling up to 30 s, without a retry-after', () => {
  const waits = [];
  let prev = 0;
  for (let i = 0; i < 7; i++) {
    prev = liveBackoff(prev);
    waits.push(prev);
  }
  assert.deepEqual(waits, [2000, 4000, 8000, 16000, 30000, 30000, 30000]);
  assert.equal(liveBackoff(null, undefined), 2000);
  assert.equal(liveBackoff(500), 2000, 'never under 2 s');
  assert.equal(liveBackoff(120000), 30000, 'a long retry-after before does not stretch the doubling');
  assert.equal(liveBackoff(0, undefined, { backoffStartMs: 50, backoffMaxMs: 200 }), 50);
  assert.equal(liveBackoff(150, undefined, { backoffStartMs: 50, backoffMaxMs: 200 }), 200);
});

test('liveBackoff: the API’s retry-after wins (up to 10 minutes)', () => {
  assert.equal(liveBackoff(16000, 3000), 3000);
  assert.equal(liveBackoff(0, 45000), 45000, 'longer than 30 s is waited in full');
  assert.equal(liveBackoff(0, 0), 0);
  assert.equal(liveBackoff(0, 1500.4), 1501);
  assert.equal(liveBackoff(0, 3_600_000), LIVE_RETRY_AFTER_MAX_MS);
  assert.equal(LIVE_RETRY_AFTER_MAX_MS, 600000);
  for (const junk of [null, undefined, Number.NaN, -1, '5', Infinity, {}]) assert.equal(liveBackoff(4000, junk), 8000, String(junk));
});

test('the pieces together: a look a second, slower replies, 5 s from 90 cents, backing off after 429s', () => {
  // A driver like the UI's loop: one look in flight; it starts, its reply comes `latency` ms later,
  // then the next start waits nextLiveDelay().
  function run({ seconds, latency, spentUsd = 0, reply = () => 'ok' }) {
    let t = 0;
    let lastStartAt = null;
    let backoffMs = 0;
    let backoffUntil = 0;
    const starts = [];
    for (let n = 0; ; n++) {
      t += nextLiveDelay({ lastStartAt, now: t, spentUsd, backoffUntil });
      if (t >= seconds * SEC) break;
      lastStartAt = t;
      starts.push(t);
      t += latency;
      if (reply(n) === '429') {
        backoffMs = liveBackoff(backoffMs, undefined);
        backoffUntil = t + backoffMs;
      } else {
        backoffMs = 0;
      }
    }
    return starts;
  }
  const gaps = (starts) => starts.slice(1).map((s, i) => s - starts[i]);
  const fast = run({ seconds: 60, latency: 300 });
  assert.equal(fast.length, 60);
  assert.ok(gaps(fast).every((g) => g === 1000));
  const slowReplies = run({ seconds: 60, latency: 1500 });
  assert.equal(slowReplies.length, 40);
  assert.ok(gaps(slowReplies).every((g) => g === 1500), 'the next starts as soon as the last returns');
  const ninetyCents = run({ seconds: 60, latency: 300, spentUsd: 0.9 });
  assert.equal(ninetyCents.length, 12);
  assert.ok(gaps(ninetyCents).every((g) => g === 5000));
  const limited = run({ seconds: 60, latency: 300, reply: (n) => (n >= 2 && n <= 4 ? '429' : 'ok') });
  assert.deepEqual(limited.slice(0, 7), [0, 1000, 2000, 4300, 8600, 16900, 17900], '2 s, 4 s, 8 s after each 429, then a second again');
});

// ---- speaking and the meter -------------------------------------------------------------------------

test('canSpeakLive: at most one spoken line every 15 s, never over the owner or over Jarvis', () => {
  assert.equal(canSpeakLive({ now: 1000 }), true, 'nothing said yet');
  assert.equal(canSpeakLive({ lastSpokenAt: null, now: 1000 }), true);
  assert.equal(canSpeakLive({ lastSpokenAt: 1000, now: 15999 }), false);
  assert.equal(canSpeakLive({ lastSpokenAt: 1000, now: 16000 }), true);
  assert.equal(canSpeakLive({ lastSpokenAt: null, now: 1000, ownerSpeaking: true }), false);
  assert.equal(canSpeakLive({ lastSpokenAt: null, now: 1000, jarvisSpeaking: true }), false);
  assert.equal(canSpeakLive({ lastSpokenAt: 1000, now: 60000, ownerSpeaking: true, jarvisSpeaking: false }), false);
  assert.equal(canSpeakLive({ lastSpokenAt: 50000, now: 1000 }), true, 'a clock that went back does not hold speech up');
  assert.equal(canSpeakLive({ lastSpokenAt: 1000, now: 1500, speakGapMs: 500 }), true);
  assert.equal(canSpeakLive(), true);
});

test('liveMeterText: "LIVE VIEW · 12 min · 9¢ this hour · limit $1"', () => {
  assert.equal(liveMeterText({ elapsedMs: 12 * MIN + 59 * SEC, spentUsd: 0.09, capUsd: 1 }), 'LIVE VIEW · 12 min · 9¢ this hour · limit $1');
  assert.equal(liveMeterText({ elapsedMs: 0, spentUsd: 0 }), 'LIVE VIEW · 0 min · 0¢ this hour · limit $1');
  assert.equal(liveMeterText({ elapsedMs: 59 * SEC, spentUsd: 0.0004 }), 'LIVE VIEW · 0 min · <0.1¢ this hour · limit $1');
  assert.equal(liveMeterText({ elapsedMs: 3 * MIN, spentUsd: 0.0123 }), 'LIVE VIEW · 3 min · 1.2¢ this hour · limit $1');
  assert.equal(liveMeterText({ elapsedMs: HOUR, spentUsd: 0.47 }), 'LIVE VIEW · 60 min · 47¢ this hour · limit $1');
  assert.equal(liveMeterText({ elapsedMs: 40 * MIN, spentUsd: 1.02 }), 'LIVE VIEW · 40 min · $1.02 this hour · limit $1', 'a Look after the cap');
  assert.equal(liveMeterText({ elapsedMs: MIN, spentUsd: 0.1, capUsd: 0.5 }), 'LIVE VIEW · 1 min · 10¢ this hour · limit 50¢');
  assert.equal(liveMeterText({ elapsedMs: MIN, spentUsd: 0.1, capUsd: 2 }), 'LIVE VIEW · 1 min · 10¢ this hour · limit $2');
  assert.equal(liveMeterText({ elapsedMs: MIN, spentUsd: 0.1, capUsd: 2.5 }), 'LIVE VIEW · 1 min · 10¢ this hour · limit $2.50');
  assert.equal(liveMeterText({ elapsedMs: -5, spentUsd: Number.NaN }), 'LIVE VIEW · 0 min · 0¢ this hour · limit $1');
  assert.equal(liveMeterText(), 'LIVE VIEW · 0 min · 0¢ this hour · limit $1');
});

test('liveMeterText at the limit: "$1.00" from 99.5¢ (never "100¢ this hour · limit $1"), 99¢ below it', () => {
  // Paused at the limit the hour is between about 99.986¢ and $1: formatUsd alone would say "100¢".
  for (const spentUsd of [0.995, 0.9996, 0.99986, 0.99999, 1]) {
    assert.equal(liveMeterText({ elapsedMs: 5 * MIN, spentUsd, capUsd: 1 }), 'LIVE VIEW · 5 min · $1.00 this hour · limit $1', String(spentUsd));
    assert.equal(liveSpentText(spentUsd), '$1.00', String(spentUsd));
  }
  assert.equal(liveSpentText(0.994), '99¢');
  assert.equal(liveSpentText(0.99), '99¢');
  assert.equal(liveSpentText(1.0812), '$1.08', 'a question answered at the limit');
  assert.equal(liveSpentText(0.09), '9¢');
  assert.equal(liveSpentText(0), '0¢');
  assert.equal(liveSpentText(Number.NaN), '0¢');
});

test('liveResumeShownAt: the time named in "It can go on at 2:41 PM" is rounded up, so Resume works at the minute named', () => {
  const at = Date.UTC(2026, 10, 25, 14, 40, 30); // 2:40:30 PM UTC
  assert.equal(liveResumeShownAt(at), Date.UTC(2026, 10, 25, 14, 41, 0), 'never "2:40" while Resume still waits 30 s');
  assert.equal(liveResumeShownAt(Date.UTC(2026, 10, 25, 14, 41, 0)), Date.UTC(2026, 10, 25, 14, 41, 0), 'a whole minute stays');
  assert.equal(liveResumeShownAt(Date.UTC(2026, 10, 25, 14, 41, 0) + 1), Date.UTC(2026, 10, 25, 14, 42, 0), '1 ms past a minute: the next one');
  assert.equal(liveResumeShownAt(Date.UTC(2026, 10, 25, 23, 59, 30)), Date.UTC(2026, 10, 26, 0, 0, 0), 'over midnight');
  assert.equal(liveResumeShownAt(Infinity), Infinity, 'never: no time is named');
  assert.ok(Number.isNaN(liveResumeShownAt(Number.NaN)));
  assert.equal(liveResumeShownAt(undefined), undefined);
  // With the budget: from the minute named on (and at resumeAt itself), Resume works.
  const clock = fakeClock(T0 + 12.5 * SEC);
  const storage = memoryStorage();
  const budget = createLiveBudget({ now: clock.now, storage, coalesceMs: 0 });
  budget.add(0.95);
  clock.t = T0 + 30 * SEC;
  budget.add(0.049);
  const reserve = 0.002;
  assert.equal(budget.canSpend(reserve), false, 'at the limit');
  const exact = budget.resumeAt(reserve);
  const named = liveResumeShownAt(exact);
  assert.equal(exact, T0 + 12.5 * SEC + HOUR, 'the 95¢ leaves the hour');
  assert.equal(named, T0 + HOUR + MIN, 'named: the next whole minute');
  assert.equal(named % MIN, 0, 'a whole minute');
  for (const t of [exact, named]) assert.equal(createLiveBudget({ now: fakeClock(t).now, storage }).canSpend(reserve), true, `Resume works at ${t - T0} ms`);
});
