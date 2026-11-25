// node --test: history ring buffers (1 h at 1 s, 7 days at 1 min), queries, statistics and persistence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, SERIES_NAMES, UNITS } from '../../server/history.mjs';

const T0 = Date.parse('2026-11-25T12:00:00Z');

test('raw query of the last hour: one point per second, nulls for missing values', () => {
  const h = createHistory();
  for (let i = 0; i < 120; i += 1) h.push(T0 + i * 1000, { cpu: i, cpuTemp: i % 2 ? null : 40, gpu: Number.NaN });
  const q = h.query({ range: '1h', series: ['cpu', 'cpuTemp', 'gpu'], now: T0 + 119_000 });
  assert.equal(q.count, 120);
  assert.equal(q.resolutionSec, 1);
  assert.equal(q.t[0], T0);
  assert.equal(q.series.cpu[119], 119);
  assert.equal(q.series.cpuTemp[1], null);
  assert.equal(q.series.gpu[0], null);
  assert.deepEqual(q.units, { cpu: '%', cpuTemp: '°C', gpu: '%' });
  assert.equal(SERIES_NAMES.length, 16);
  assert.equal(UNITS.netRx, 'B/s');
});

test('time never goes backwards in the ring', () => {
  const h = createHistory();
  assert.equal(h.push(T0, { cpu: 1 }), true);
  assert.equal(h.push(T0, { cpu: 2 }), false);
  assert.equal(h.push(T0 - 1000, { cpu: 3 }), false);
  assert.equal(h.query({ range: '1h', series: ['cpu'], now: T0 }).count, 1);
});

test('bucketed query: averages, maxima, empty buckets are null', () => {
  const h = createHistory();
  for (let i = 0; i < 60; i += 1) h.push(T0 + i * 1000, { cpu: i < 30 ? 10 : 30 });
  const q = h.query({ range: '15m', series: ['cpu'], points: 15, now: T0 + 15 * 60_000 - 1 });
  assert.equal(q.count, 15);
  assert.equal(q.series.cpu[0], 20); // the first minute: half at 10, half at 30
  assert.equal(q.series.cpu[1], null); // nothing after the first minute
  const m = h.query({ range: '15m', series: ['cpu'], points: 15, agg: 'max', now: T0 + 15 * 60_000 - 1 });
  assert.equal(m.series.cpu[0], 30);
});

test('the fine ring holds exactly one hour; minutes go to the 7-day ring with avg and max', () => {
  const h = createHistory();
  const N = 3600 + 600; // 70 minutes of seconds
  for (let i = 0; i < N; i += 1) h.push(T0 + i * 1000, { cpu: (i % 60) < 30 ? 0 : 100, cpuTemp: 40 + (i % 60 === 59 ? 20 : 0) });
  assert.equal(h.sizes.fine, 3600);
  assert.equal(h.sizes.coarse, 69); // 69 complete minutes; the 70th is still being collected
  const day = h.query({ range: '24h', series: ['cpu', 'cpuTemp'], now: T0 + N * 1000 });
  assert.equal(day.resolutionSec, 60);
  assert.equal(day.series.cpu[0], 50);
  assert.equal(day.series.cpuTemp[0], 40.33); // average of 59 × 40 and 1 × 60
  const dayMax = h.query({ range: '24h', series: ['cpuTemp'], agg: 'max', now: T0 + N * 1000 });
  assert.equal(dayMax.series.cpuTemp[0], 60);
  const hour = h.query({ range: '1h', series: ['cpu'], now: T0 + N * 1000 });
  assert.equal(hour.t[0], T0 + (N - 3600) * 1000);
});

test('7-day ring wraps at 10080 minutes and memory stays fixed', () => {
  const h = createHistory({ fineCapacity: 10, coarseCapacity: 100 });
  for (let m = 0; m < 250; m += 1) h.pushMinute(T0 + m * 60_000, { cpu: m });
  assert.equal(h.sizes.coarse, 100);
  const q = h.query({ range: '7d', series: ['cpu'], now: T0 + 250 * 60_000 });
  assert.equal(q.count, 100);
  assert.equal(q.series.cpu[0], 150);
  assert.equal(q.series.cpu[99], 249);
  assert.equal(h.pushMinute(T0, { cpu: 1 }), false); // older than the last minute
});

test('stats over the 7-day ring and the recent average', () => {
  const h = createHistory();
  for (let m = 0; m < 600; m += 1) h.pushMinute(T0 + m * 60_000, { cpuTemp: m < 300 ? 40 : 50 }, { cpuTemp: m < 300 ? 45 : 70 });
  const st = h.stats('cpuTemp', { from: T0, to: T0 + 600 * 60_000 });
  assert.deepEqual(st, { avg: 45, min: 40, max: 70, count: 600 });
  assert.deepEqual(h.stats('cpuTemp', { from: T0 - 99e9, to: T0 - 1 }), { avg: null, min: null, max: null, count: 0 });
  assert.equal(h.stats('nope', { from: 0, to: 1 }), null);
  for (let i = 0; i < 300; i += 1) h.push(T0 + 600 * 60_000 + i * 1000, { cpu: i < 240 ? 0 : 60 });
  assert.equal(h.recent('cpu', 59, T0 + 600 * 60_000 + 299_000), 60); // the window includes its first second
  assert.ok(Math.abs(h.recent('cpu', 60, T0 + 600 * 60_000 + 299_000) - 3600 / 61) < 1e-6);
});

test('serialize and restore round trip; old points are dropped; changed columns start fresh', () => {
  const h = createHistory();
  for (let m = 0; m < 50; m += 1) h.pushMinute(T0 - (60 - m) * 60_000, { cpu: m });
  for (let i = 0; i < 200; i += 1) h.push(T0 + i * 1000, { cpu: i, netRx: i * 1000 });
  const saved = JSON.parse(JSON.stringify(h.serialize()));
  const r = createHistory();
  const counts = r.restore(saved, T0 + 200_000);
  assert.equal(counts.fine, 200);
  assert.ok(counts.coarse >= 50);
  const q = r.query({ range: '1h', series: ['cpu', 'netRx'], now: T0 + 199_000 });
  assert.equal(q.series.netRx[199], 199000);
  // restoring a day later keeps the minutes but not the seconds
  const later = createHistory();
  assert.equal(later.restore(saved, T0 + 86_400_000).fine, 0);
  // a future version with other columns: nothing restored, no crash
  assert.equal(createHistory().restore({ ...saved, series: ['x'] }, T0).skipped, 'series changed');
  assert.throws(() => createHistory().restore({ v: 2 }, T0));
  assert.throws(() => createHistory().restore({ ...saved, fine: { ...saved.fine, size: 3 } }, T0 + 200_000));
});

test('unknown range and series are refused by query', () => {
  const h = createHistory();
  assert.throws(() => h.query({ range: '2y' }));
  assert.deepEqual(Object.keys(h.query({ range: '1h', series: ['cpu', 'bogus'], now: T0 }).series), ['cpu']);
});
