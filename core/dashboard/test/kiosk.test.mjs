// Unit tests for app/kiosk.js (night window, pixel shift, settings, daily refresh) and the
// sparkline ring buffer in app/spark.js.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULTS, inWindow, parseClock, parseWindow, readSettings, shiftOffset, shouldRefresh } from '../app/kiosk.js';
import { TimeRing } from '../app/spark.js';

test('clock times parse; nonsense does not', () => {
  assert.equal(parseClock('23:00'), 1380);
  assert.equal(parseClock('7:05'), 425);
  assert.equal(parseClock('7'), 420);
  assert.equal(parseClock('24:00'), 0);
  for (const bad of ['25:00', '12:60', 'noon', '', null]) assert.equal(parseClock(bad), null, String(bad));
});

test('night windows, including the one that wraps midnight', () => {
  const win = parseWindow('23:00-07:00');
  assert.deepEqual(win, { start: 1380, end: 420 });
  assert.equal(inWindow(23 * 60, win), true);
  assert.equal(inWindow(2 * 60, win), true);
  assert.equal(inWindow(6 * 60 + 59, win), true);
  assert.equal(inWindow(7 * 60, win), false);
  assert.equal(inWindow(22 * 60 + 59, win), false);
  const day = parseWindow('13:00 to 14:30');
  assert.equal(inWindow(13 * 60 + 10, day), true);
  assert.equal(inWindow(14 * 60 + 30, day), false);
  assert.equal(parseWindow('off'), null);
  assert.equal(inWindow(100, null), false);
  assert.equal(inWindow(100, { start: 60, end: 60 }), false, 'an empty window never dims');
  assert.deepEqual(parseWindow('garbage'), DEFAULTS.dim);
  assert.deepEqual(parseWindow({ start: '22:30', end: '6:00' }), { start: 1350, end: 360 });
});

test('pixel shift: small, deterministic, cycling through eight positions', () => {
  const seen = new Set();
  for (let m = 0; m < 8 * 3; m += 3) {
    const s = shiftOffset(m * 60000);
    assert.ok(Math.abs(s.x) <= 3 && Math.abs(s.y) <= 3);
    seen.add(`${s.x},${s.y}`);
  }
  assert.equal(seen.size, 8);
  assert.deepEqual(shiftOffset(0), shiftOffset(2 * 60000), 'it holds still between steps');
  assert.notDeepEqual(shiftOffset(0), shiftOffset(3 * 60000));
  assert.deepEqual(shiftOffset(5 * 3600000), shiftOffset(5 * 3600000));
});

test('settings from the address beat the Core config, with safe limits', () => {
  const p = (q) => new URLSearchParams(q);
  const d = readSettings(p(''));
  assert.deepEqual(d.dim, DEFAULTS.dim);
  assert.equal(d.dimLevel, DEFAULTS.dimLevel);
  assert.equal(d.shift, true);
  assert.equal(d.refreshAt, DEFAULTS.refreshAt);
  assert.equal(d.hideCursor, true);
  const s = readSettings(p('dim=22:00-06:30&dimlevel=0.95&shift=off&refresh=off&cursor=show'), { nightDim: '21:00-05:00' });
  assert.deepEqual(s.dim, { start: 1320, end: 390 });
  assert.equal(s.dimLevel, 0.85, 'never fully black');
  assert.equal(s.shift, false);
  assert.equal(s.refreshAt, null);
  assert.equal(s.hideCursor, false);
  const c = readSettings(p(''), { nightDim: { start: '21:00', end: '05:00' }, dimLevel: 0.1, dailyRefresh: '03:30' });
  assert.deepEqual(c.dim, { start: 1260, end: 300 });
  assert.equal(c.dimLevel, 0.2);
  assert.equal(c.refreshAt, 210);
  assert.equal(readSettings(p('dim=off')).dim, null);
});

test('the daily refresh happens once, at its minute, only while the Core answers', () => {
  const opened = 0;
  const base = { minutes: 240, refreshAt: 240, openedMs: opened, nowMs: 2 * 3600000, coreLive: true };
  assert.equal(shouldRefresh(base), true);
  assert.equal(shouldRefresh({ ...base, minutes: 241 }), false);
  assert.equal(shouldRefresh({ ...base, coreLive: false }), false, 'never reload into an error page');
  assert.equal(shouldRefresh({ ...base, nowMs: 30 * 60000 }), false, 'a freshly loaded page does not reload again');
  assert.equal(shouldRefresh({ ...base, refreshAt: null }), false);
});

test('the sparkline ring: one slot a second, gaps stay gaps, never grows', () => {
  const r = new TimeRing(5);
  r.push(1000, 1);
  r.push(2000, 2);
  r.push(2500, 2.5); // the same second again replaces the newest value
  assert.equal(r.size, 2);
  assert.equal(r.latest(), 2.5);
  r.push(5000, 5); // 3 and 4 never arrived
  assert.equal(r.size, 5);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => r.at(i)), [1, 2.5, NaN, NaN, 5]);
  r.push(6000, null);
  assert.ok(Number.isNaN(r.latest()), 'unknown values are gaps');
  assert.equal(r.max(), 5);
  r.advanceTo(9000); // three silent seconds: the 5 is still in view
  assert.equal(r.max(), 5);
  r.advanceTo(12000);
  assert.equal(r.size, 5);
  assert.ok(Number.isNaN(r.max()), 'only gaps left');
  r.push(1e9, 7); // a long outage: the ring fills with gaps, bounded by its capacity
  assert.equal(r.size, 5);
  assert.equal(r.buf.length, 5);
  assert.equal(r.latest(), 7);
  r.push(1e9 - 60000, 3); // a clock step backwards: replace, never go back in time
  assert.equal(r.latest(), 3);
  r.clear();
  assert.equal(r.size, 0);
  assert.ok(Number.isNaN(r.latest()));
});
