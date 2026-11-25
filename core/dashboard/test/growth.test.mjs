// Unit tests for the long-run verdict (test/growth.mjs): flat series pass, slow leaks fail, the
// periodic ups and downs of the long run (scenario changes, outages, a transcript that clears)
// do not count as growth.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { judgeGrowth, LIMITS, slope } from './growth.mjs';

/** 49 hourly samples (a 48-hour window) from a generator. */
function series(gen) {
  const out = [];
  for (let h = 0; h <= 48; h++) out.push({ hour: h, ...gen(h) });
  return out;
}
const flat = (h) => ({ liveNodes: 1149, nodes: 1190, jsDataMB: 2.1, heapMB: 3.6, codeMB: 1.5, listeners: 41 });

test('slope is the least-squares growth per x', () => {
  assert.equal(slope([0, 1, 2, 3], [5, 7, 9, 11]), 2);
  assert.equal(slope([0, 1, 2], [3, 3, 3]), 0);
  assert.equal(slope([1], [4]), 0);
});

test('a flat window passes', () => {
  const v = judgeGrowth(series(flat));
  assert.equal(v.pass, true, v.failures.join('; '));
  assert.equal(v.hours, 48);
  for (const name of Object.keys(LIMITS)) assert.equal(v.metrics[name].slopePerDay, 0);
});

test('periodic swings that repeat every 8 h and 6 h are not growth', () => {
  const v = judgeGrowth(
    series((h) => ({
      // The transcript clears after each outage (every 6 h) and refills; the scenario changes every 2 h.
      liveNodes: 1149 - (h % 6 === 0 ? 32 : 0),
      nodes: 1190 + [0, 6, -4, 10][Math.floor(h / 2) % 4] - (h % 6 === 0 ? 32 : 0),
      jsDataMB: 2.1 + [0, 0.12, -0.05, 0.2][Math.floor(h / 2) % 4],
      listeners: 41,
    })),
  );
  assert.equal(v.pass, true, v.failures.join('; '));
});

test('one detached node per question (the old undo-history leak) fails', () => {
  // A question every 2 real seconds at 200x is ~18 an hour.
  const v = judgeGrowth(series((h) => ({ ...flat(h), nodes: 1190 + 18 * h })));
  assert.equal(v.pass, false);
  assert.equal(v.metrics.nodes.pass, false);
  assert.equal(v.metrics.liveNodes.pass, true);
  assert.match(v.failures.join(), /nodes: grows 432 nodes\/day/);
});

test('a slow heap leak fails even under noise', () => {
  let seed = 7;
  const noise = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647 - 0.5) * 0.3; // ±0.15 MB
  };
  const v = judgeGrowth(series((h) => ({ ...flat(h), jsDataMB: 2.1 + (0.3 / 24) * h + noise() })));
  assert.equal(v.metrics.jsDataMB.pass, false, JSON.stringify(v.metrics.jsDataMB));
  const ok = judgeGrowth(series((h) => ({ ...flat(h), jsDataMB: 2.1 + noise() })));
  assert.equal(ok.metrics.jsDataMB.pass, true, JSON.stringify(ok.metrics.jsDataMB));
});

test('a listener added every few hours fails; shrinking passes', () => {
  const grows = judgeGrowth(series((h) => ({ ...flat(h), listeners: 41 + Math.floor(h / 4) })));
  assert.equal(grows.metrics.listeners.pass, false);
  const shrinks = judgeGrowth(series((h) => ({ ...flat(h), jsDataMB: 2.5 - h * 0.01, nodes: 1300 - h })));
  assert.equal(shrinks.pass, true, shrinks.failures.join('; '));
});

test('too few samples cannot pass', () => {
  const v = judgeGrowth([{ hour: 0, ...flat(0) }, { hour: 1, ...flat(1) }]);
  assert.equal(v.pass, false);
  assert.match(v.failures[0], /too few samples/);
});

test('compiled code that levels off is reported, not judged; data that grows is', () => {
  // The JIT optimizing functions as they get hot: code climbs 0.4 MB over the first day, then stays.
  const warm = (h) => ({ ...flat(h), codeMB: 1.5 + 0.4 * Math.min(1, h / 24), heapMB: 3.6 + 0.4 * Math.min(1, h / 24) });
  const v = judgeGrowth(series(warm));
  assert.equal(v.pass, true, v.failures.join('; '));
  assert.equal(v.metrics.heapMB.judged, false);
  assert.ok(v.metrics.codeMB.slopePerDay > 0.1);
  const leak = judgeGrowth(series((h) => ({ ...warm(h), jsDataMB: 2.1 + 0.02 * h })));
  assert.equal(leak.pass, false);
  assert.match(leak.failures.join(), /jsDataMB: grows/);
});
