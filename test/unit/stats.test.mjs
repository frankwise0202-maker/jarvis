// Records pack: statistics aggregation (src/ui/stats.js) against a fake localStorage.
// Run: node --test test/unit/stats.test.mjs
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { recordTurn, getStats, resetStats, onStatsChange, lastDays, dayKey, fmtBytes, estimateStorage, STATS_KEY } from '../../src/ui/stats.js';

process.env.TZ = 'UTC'; // local days == UTC days, so expectations are deterministic

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 19, 18, 0, 0); // Thu 19 Nov 2026, 18:00
const at = (iso) => Date.parse(iso);

// ---------------------------------------------------------------------------------------------
// Fake localStorage

class FakeStorage {
  constructor() {
    this.map = new Map();
    this.failWrites = false;
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    if (this.failWrites) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

let store;
function installStorage(value) {
  Object.defineProperty(globalThis, 'localStorage', { value, configurable: true, writable: true });
}
function raw() {
  return JSON.parse(store.getItem(STATS_KEY));
}

beforeEach(() => {
  store = new FakeStorage();
  installStorage(store);
  resetStats();
});
afterEach(() => {
  delete globalThis.localStorage;
});

// ---------------------------------------------------------------------------------------------
// Realistic turns (SPEC 6 shapes)

let n = 0;
function agent(role, status = 'done', extra = {}) {
  n += 1;
  return {
    id: `agent-${n}`,
    codename: `Agent${n}`,
    role,
    task: 'Research',
    web: true,
    model: 'claude-sonnet-5-5',
    status,
    report: status === 'done' ? '## Key findings\n- x' : '',
    sources: status === 'done' ? [{ url: `https://example.com/${n}/a`, title: 'A' }, { url: `https://example.com/${n}/b`, title: 'B' }] : [],
    searches: ['q1', 'q2'],
    fetches: ['https://example.com'],
    usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: 2, fetches: 1 },
    costUsd: 0.05,
    attempts: status === 'queued' ? 0 : 1,
    startedAt: status === 'queued' ? null : NOW - 60_000,
    endedAt: status === 'queued' ? null : NOW - 1000,
    error: status === 'error' ? { kind: 'rate_limit', message: 'Rate limit reached.', retryable: true } : null,
    ...extra,
  };
}

function swarmTurn(id, endedAt, waves, extra = {}) {
  const missions = {};
  const segments = [{ id: `${id}-s0`, kind: 'text', text: 'Deploying.', req: 0, citations: [] }];
  waves.forEach((agents, i) => {
    const mid = `${id}-m${i + 1}`;
    missions[mid] = { id: mid, wave: i + 1, title: `Wave ${i + 1}`, createdAt: endedAt - 120_000, startedAt: endedAt - 110_000, endedAt: endedAt - 5000, status: 'done', agents };
    segments.push({ id: `${id}-seg-m${i}`, kind: 'mission', missionId: mid, req: i });
  });
  segments.push({ id: `${id}-final`, kind: 'text', text: 'Answer.', req: waves.length, citations: [] });
  const all = waves.flat();
  const deployed = all.filter((a) => a.status !== 'queued');
  return {
    id,
    role: 'jarvis',
    createdAt: endedAt - 130_000,
    endedAt,
    status: 'done',
    mode: 'swarm',
    leadModel: 'claude-opus-5-5',
    workerModel: 'claude-sonnet-5-5',
    depth: 'balanced',
    segments,
    missions,
    usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: deployed.length * 2, fetches: deployed.length },
    costUsd: 0.1 + deployed.length * 0.05,
    stats: { agents: deployed.length, searches: deployed.length * 2, sources: deployed.filter((a) => a.status === 'done').length * 2, waves: waves.length, durationMs: 130_000 },
    error: null,
    ...extra,
  };
}

function quickTurn(id, endedAt, extra = {}) {
  return {
    id,
    role: 'jarvis',
    createdAt: endedAt - 9000,
    endedAt,
    status: 'done',
    mode: 'quick',
    segments: [
      { id: `${id}-t`, kind: 'tool', tool: 'web_search', query: 'weather', status: 'done', results: [{ url: 'https://weather.example/x', title: 'Weather' }], req: 0 },
      { id: `${id}-x`, kind: 'text', text: 'Sunny.', req: 0, citations: [{ url: 'https://weather.example/x', title: 'Weather' }] },
    ],
    missions: {},
    usage: { input: 1, output: 1, cacheWrite: 0, cacheRead: 0, searches: 1, fetches: 0 },
    costUsd: 0.031,
    stats: { agents: 0, searches: 1, sources: 1, waves: 0, durationMs: 9000 },
    ...extra,
  };
}

// ---------------------------------------------------------------------------------------------

describe('recordTurn / getStats', () => {
  test('aggregates totals, local-day buckets and roles across multi-wave turns with failures', () => {
    const big = swarmTurn('t1', at('2026-11-19T10:00:00Z'), [
      [agent('Battery chemistry analyst'), agent('Market analyst'), agent('Supply chain analyst', 'error'), agent('Policy researcher')],
      [agent('Fact checker'), agent('market analyst')],
    ]);
    assert.equal(recordTurn(big, { now: NOW }), true);
    assert.equal(recordTurn(quickTurn('t2', at('2026-11-19T12:00:00Z')), { now: NOW }), true);
    assert.equal(recordTurn(swarmTurn('t3', at('2026-11-18T20:00:00Z'), [[agent('Travel scout'), agent('Market Analyst'), agent('Local guide', 'queued')]]), { now: NOW }), true);

    const s = getStats({ now: NOW });
    assert.deepEqual(s.totals, {
      turns: 3,
      missions: 3,
      agents: 8, // 6 + 0 + 2 (the queued agent never ran)
      agentsOk: 7,
      searches: 12 + 1 + 4,
      fetches: 6 + 0 + 2,
      sources: 10 + 1 + 4,
      costUsd: 0.4 + 0.031 + 0.2,
      durationMs: 130_000 + 9000 + 130_000,
    });
    assert.deepEqual(Object.keys(s.byDay), ['2026-11-18', '2026-11-19']);
    assert.deepEqual(s.byDay['2026-11-19'], { turns: 2, missions: 2, agents: 6, searches: 13, sources: 11, costUsd: 0.431 });
    assert.deepEqual(s.byDay['2026-11-18'], { turns: 1, missions: 1, agents: 2, searches: 4, sources: 4, costUsd: 0.2 });
    assert.deepEqual(s.topRoles[0], ['Market analyst', 3], 'case-insensitive role counting');
    assert.equal(s.topRoles.length, 6);
    assert.ok(!s.topRoles.some(([r]) => r === 'Local guide'), 'agents that never started are not counted');
    assert.equal(s.since, at('2026-11-18T20:00:00Z'));
    assert.equal(s.updatedAt, NOW);
  });

  test('idempotent by turn id', () => {
    const t = swarmTurn('same', NOW - 1000, [[agent('Analyst'), agent('Scout')]]);
    assert.equal(recordTurn(t, { now: NOW }), true);
    const before = getStats({ now: NOW });
    assert.equal(recordTurn(t, { now: NOW }), false);
    assert.equal(recordTurn(structuredClone(t), { now: NOW + 5000 }), false, 'a copy of the same turn is the same turn');
    assert.deepEqual(getStats({ now: NOW }), before);
  });

  test('a resumed turn adds only what is new (no double counting), attributed to the day it ended', () => {
    const a1 = agent('Battery chemistry analyst');
    const a2 = agent('Market analyst');
    const a3 = agent('Supply chain analyst', 'interrupted', { report: '', sources: [], costUsd: 0.01, usage: { searches: 1, fetches: 0 }, searches: ['q'] });
    const t = swarmTurn('resume-me', at('2026-11-18T23:50:00Z'), [[a1, a2, a3]], { status: 'interrupted' });
    t.stats = { agents: 3, searches: 5, sources: 4, waves: 1, durationMs: 60_000 };
    t.costUsd = 0.3;
    assert.equal(recordTurn(t, { now: NOW }), true);
    const mid = getStats({ now: NOW });
    assert.equal(mid.totals.agents, 3);

    // Resume finished the interrupted agent and launched a second wave just after midnight.
    a3.status = 'done';
    a3.sources = [{ url: 'https://example.com/a3', title: 'x' }];
    const wave2 = [agent('Fact checker'), agent('Historian')];
    t.missions['resume-me-m2'] = { id: 'resume-me-m2', wave: 2, title: 'More', status: 'done', agents: wave2 };
    t.segments.push({ id: 'seg-m2', kind: 'mission', missionId: 'resume-me-m2', req: 2 });
    t.status = 'done';
    t.endedAt = at('2026-11-19T00:10:00Z');
    t.stats = { agents: 5, searches: 9, sources: 9, waves: 2, durationMs: 1_260_000 };
    t.costUsd = 0.55;
    assert.equal(recordTurn(t, { now: NOW }), true);

    const s = getStats({ now: NOW });
    assert.equal(s.totals.turns, 1, 'still one turn');
    assert.equal(s.totals.agents, 5);
    assert.equal(s.totals.agentsOk, 5);
    assert.equal(s.totals.missions, 2);
    assert.equal(s.totals.searches, 9);
    assert.equal(s.totals.sources, 9);
    assert.equal(s.totals.costUsd, 0.55);
    assert.deepEqual(s.byDay['2026-11-18'], { turns: 1, missions: 1, agents: 3, searches: 5, sources: 4, costUsd: 0.3 });
    assert.deepEqual(s.byDay['2026-11-19'], { turns: 0, missions: 1, agents: 2, searches: 4, sources: 5, costUsd: 0.25 });
    const roles = Object.fromEntries(s.topRoles);
    assert.deepEqual(roles, { 'Battery chemistry analyst': 1, 'Market analyst': 1, 'Supply chain analyst': 1, 'Fact checker': 1, Historian: 1 }, 'roles of re-run agents are not counted twice');
    assert.equal(recordTurn(t, { now: NOW }), false, 'and recording the finished turn again is a no-op');
  });

  test('day rollover at local midnight and the 60-day window', () => {
    recordTurn(quickTurn('late', at('2026-11-19T23:59:30Z')), { now: at('2026-11-20T00:01:00Z') });
    recordTurn(quickTurn('early', at('2026-11-20T00:00:30Z')), { now: at('2026-11-20T00:01:00Z') });
    let s = getStats({ now: at('2026-11-20T00:01:00Z') });
    assert.equal(s.byDay['2026-11-19'].turns, 1);
    assert.equal(s.byDay['2026-11-20'].turns, 1);

    // A turn that ended long ago still counts toward the totals but gets no day bucket.
    recordTurn(quickTurn('ancient', at('2026-11-20T00:00:00Z') - 70 * DAY), { now: at('2026-11-20T00:01:00Z') });
    s = getStats({ now: at('2026-11-20T00:01:00Z') });
    assert.equal(s.totals.turns, 3);
    assert.deepEqual(Object.keys(s.byDay), ['2026-11-19', '2026-11-20']);

    // 59 days later both days are still inside the window; 61 days later the 19th has aged out.
    assert.deepEqual(Object.keys(getStats({ now: at('2027-01-17T12:00:00Z') }).byDay), ['2026-11-19', '2026-11-20']);
    assert.deepEqual(Object.keys(getStats({ now: at('2027-01-19T12:00:00Z') }).byDay), ['2026-11-20']);

    // Recording prunes stored buckets that fell out of the window.
    recordTurn(quickTurn('later', at('2027-01-19T12:00:00Z')), { now: at('2027-01-19T12:00:00Z') });
    assert.deepEqual(Object.keys(raw().byDay).sort(), ['2026-11-20', '2027-01-19']);
    assert.equal(getStats({ now: at('2027-01-19T12:00:00Z') }).totals.turns, 4);
  });

  test('top roles: normalized case, whitespace and punctuation; ranked; at most 20', () => {
    const names = ['Market analyst', 'market ANALYST', '  Market   analyst. ', '"Market analyst"', 'TECH REVIEWER', 'ev market analyst', 'EV market analyst'];
    recordTurn(swarmTurn('roles', NOW - 1000, [names.map((r) => agent(r))]), { now: NOW });
    const top = getStats({ now: NOW }).topRoles;
    assert.deepEqual(top[0], ['Market analyst', 4]);
    assert.deepEqual(top.find(([r]) => /^ev market/i.test(r)), ['EV market analyst', 2], 'a later, properly capitalized spelling wins');
    assert.deepEqual(top.find(([r]) => /tech reviewer/i.test(r)), ['Tech reviewer', 1], 'shouted roles are tamed');

    // Thirty more distinct roles with different counts: only 20 are reported, best first.
    let id = 0;
    for (let i = 0; i < 30; i++) {
      const agents = Array.from({ length: (i % 5) + 1 }, () => agent(`Specialist ${i}`));
      recordTurn(swarmTurn(`r${id++}`, NOW - 1000, [agents]), { now: NOW });
    }
    const s = getStats({ now: NOW });
    assert.equal(s.topRoles.length, 20);
    for (let i = 1; i < s.topRoles.length; i++) assert.ok(s.topRoles[i - 1][1] >= s.topRoles[i][1], 'sorted by count');
    assert.deepEqual(s.topRoles[0], ['Specialist 29', 5].map((v, k) => (k === 0 ? s.topRoles[0][0] : v)), 'top count is 5');
    assert.ok(s.topRoles.some(([r]) => r === 'Market analyst'), 'strong early role survives candidate pruning');

    // Many one-off roles cannot evict a strong role.
    for (let i = 0; i < 80; i++) recordTurn(swarmTurn(`one${i}`, NOW - 1000, [[agent(`One-off ${i}`)]]), { now: NOW });
    assert.ok(getStats({ now: NOW }).topRoles.some(([r, c]) => r === 'Market analyst' && c === 4));
    assert.ok(raw().roles.length <= 60, 'role candidates are bounded');
  });

  test('the set of recorded ids is bounded', () => {
    for (let i = 0; i < 300; i++) recordTurn(quickTurn(`q${i}`, NOW - 1000), { now: NOW });
    assert.equal(raw().seen.length, 250);
    assert.equal(raw().seen.at(-1)[0], 'q299');
    assert.equal(recordTurn(quickTurn('q299', NOW - 1000), { now: NOW }), false, 'recent ids are remembered');
    assert.equal(getStats({ now: NOW }).totals.turns, 300);
  });

  test('missing and malformed input', () => {
    for (const bad of [null, undefined, 0, 'turn', [], {}, { id: '' }, { id: {} }, { id: 'u', role: 'user', text: 'hi' }]) assert.equal(recordTurn(bad, { now: NOW }), false);
    assert.equal(getStats({ now: NOW }).totals.turns, 0);

    assert.equal(recordTurn({ id: 'bare' }, { now: NOW }), true, 'a bare turn still counts as a request');
    assert.equal(recordTurn({ id: 7, missions: 'x', segments: {}, stats: { agents: 'many', searches: -4 }, costUsd: NaN, endedAt: 'soon' }, { now: NOW }), true);
    assert.equal(recordTurn({ id: 'weird', missions: { m: { agents: [null, 3, { status: 'done', role: 42 }] } } }, { now: NOW }), true);
    const s = getStats({ now: NOW });
    assert.equal(s.totals.turns, 3);
    assert.equal(s.totals.agents, 1);
    assert.equal(s.totals.costUsd, 0);
    for (const v of Object.values(s.totals)) assert.ok(Number.isFinite(v));
    assert.deepEqual(s.byDay[dayKey(NOW)].turns, 3, 'turns without timestamps land on today');
    assert.deepEqual(s.topRoles, []);
  });

  test('getStats returns copies', () => {
    recordTurn(quickTurn('copy', NOW - 1000), { now: NOW });
    const s = getStats({ now: NOW });
    s.totals.turns = 999;
    s.byDay[dayKey(NOW)].turns = 999;
    s.topRoles.push(['x', 1]);
    const again = getStats({ now: NOW });
    assert.equal(again.totals.turns, 1);
    assert.equal(again.byDay[dayKey(NOW)].turns, 1);
    assert.deepEqual(again.topRoles, []);
  });
});

describe('storage resilience', () => {
  test('works in memory when localStorage throws (Safari private mode, blocked site data)', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('denied', 'SecurityError');
      },
    });
    assert.equal(recordTurn(quickTurn('mem', NOW - 1000), { now: NOW }), true);
    assert.equal(getStats({ now: NOW }).totals.turns, 1);
    assert.equal(recordTurn(quickTurn('mem', NOW - 1000), { now: NOW }), false, 'still idempotent in memory');
  });

  test('keeps the newest data in memory when a write fails (quota)', () => {
    recordTurn(quickTurn('a', NOW - 2000), { now: NOW });
    store.failWrites = true;
    assert.equal(recordTurn(quickTurn('b', NOW - 1000), { now: NOW }), true);
    assert.equal(getStats({ now: NOW }).totals.turns, 2, 'reads prefer the unsaved in-memory copy');
    assert.equal(raw().totals.turns, 1, 'storage still holds the last good copy');
    store.failWrites = false;
    recordTurn(quickTurn('c', NOW - 500), { now: NOW });
    assert.equal(raw().totals.turns, 3, 'the next successful write persists everything');
  });

  test('corrupted or foreign data is ignored, then replaced', () => {
    store.setItem(STATS_KEY, '{not json');
    assert.equal(getStats({ now: NOW }).totals.turns, 0);
    store.setItem(STATS_KEY, JSON.stringify({ totals: { turns: 'x', agents: -5, costUsd: 'free' }, byDay: { bogus: {}, '2026-11-19': { turns: 2, agents: 'x' } }, roles: [['a'], 'b', ['k', 'K', 2, 0]], seen: 'no' }));
    const s = getStats({ now: NOW });
    assert.equal(s.totals.turns, 0);
    assert.equal(s.totals.agents, 0);
    assert.deepEqual(s.byDay, { '2026-11-19': { turns: 2, missions: 0, agents: 0, searches: 0, sources: 0, costUsd: 0 } });
    assert.deepEqual(s.topRoles, [['K', 2]]);
    assert.equal(recordTurn(quickTurn('fresh', NOW - 1000), { now: NOW }), true);
    assert.equal(raw().totals.turns, 1);
  });

  test('a reset elsewhere (key removed) reads as empty', () => {
    recordTurn(quickTurn('x', NOW - 1000), { now: NOW });
    store.removeItem(STATS_KEY);
    assert.equal(getStats({ now: NOW }).totals.turns, 0);
  });

  test('onStatsChange fires on record and reset; unsubscribe stops it', () => {
    let calls = 0;
    const off = onStatsChange(() => calls++);
    recordTurn(quickTurn('n1', NOW - 1000), { now: NOW });
    recordTurn(quickTurn('n1', NOW - 1000), { now: NOW }); // no-op: no event
    resetStats();
    assert.equal(calls, 2);
    off();
    recordTurn(quickTurn('n2', NOW - 1000), { now: NOW });
    assert.equal(calls, 2);
    assert.equal(typeof onStatsChange(null), 'function');
  });
});

describe('helpers', () => {
  test('lastDays: 14 zero-filled local days, oldest first, ending today', () => {
    recordTurn(quickTurn('d1', at('2026-11-19T09:00:00Z')), { now: NOW });
    recordTurn(swarmTurn('d2', at('2026-11-10T09:00:00Z'), [[agent('Scout'), agent('Analyst')]]), { now: NOW });
    const days = lastDays(getStats({ now: NOW }), 14, NOW);
    assert.equal(days.length, 14);
    assert.equal(days[0].key, '2026-11-06');
    assert.equal(days[13].key, '2026-11-19');
    assert.equal(days[13].turns, 1);
    assert.equal(days[4].key, '2026-11-10');
    assert.equal(days[4].agents, 2);
    assert.equal(days.reduce((acc, d) => acc + d.turns, 0), 2);
    assert.deepEqual(lastDays(null, 3, NOW).map((d) => d.turns), [0, 0, 0]);
  });

  test('fmtBytes', () => {
    assert.equal(fmtBytes(0), '0 KB');
    assert.equal(fmtBytes(512), '< 1 KB');
    assert.equal(fmtBytes(1500), '1.5 KB');
    assert.equal(fmtBytes(3_100_000), '3.1 MB');
    assert.equal(fmtBytes(42_000_000), '42 MB');
    assert.equal(fmtBytes(1.9e9), '1.9 GB');
    assert.equal(fmtBytes(NaN), '0 KB');
  });

  test('estimateStorage', async () => {
    const real = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { estimate: async () => ({ usage: 3_100_000, quota: 2e9 }), persisted: async () => true } } });
      assert.deepEqual(await estimateStorage(), { usage: 3_100_000, quota: 2e9, persisted: true });
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
          storage: {
            estimate: async () => ({ usage: 10 }),
            persisted: async () => {
              throw new Error('nope');
            },
          },
        },
      });
      assert.deepEqual(await estimateStorage(), { usage: 10, quota: 0, persisted: null });
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { estimate: async () => Promise.reject(new Error('x')) } } });
      assert.equal(await estimateStorage(), null);
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
      assert.equal(await estimateStorage(), null);
    } finally {
      if (real) Object.defineProperty(globalThis, 'navigator', real);
    }
  });
});
