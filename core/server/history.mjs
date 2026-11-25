// History: two fixed-size ring buffers in typed arrays, so memory never grows however long the Core runs.
//
//   fine    1 hour at 1-second resolution (3600 points)
//   coarse  7 days at 1-minute resolution (10080 points), each minute keeping the average and the maximum
//
// Missing values are NaN inside and null in JSON. Gaps (the Core was stopped) are simply absent points:
// every point carries its own timestamp. query() returns raw points, or `points` equal time buckets.

import { isNum } from './util.mjs';

/** Series kept in history, with their units. */
export const SERIES = [
  ['cpu', '%'],
  ['cpuTemp', '°C'],
  ['load1', ''],
  ['gpu', '%'],
  ['gpuTemp', '°C'],
  ['gpuMem', '%'],
  ['gpuPower', 'W'],
  ['ram', '%'],
  ['swap', '%'],
  ['disk', '%'],
  ['diskRead', 'B/s'],
  ['diskWrite', 'B/s'],
  ['netRx', 'B/s'],
  ['netTx', 'B/s'],
  ['internetMs', 'ms'],
  ['apiMs', 'ms'],
];
export const SERIES_NAMES = SERIES.map(([n]) => n);
export const UNITS = Object.fromEntries(SERIES);
const INDEX = new Map(SERIES_NAMES.map((n, i) => [n, i]));

export const RANGES = {
  '15m': { ring: 'fine', ms: 15 * 60_000 },
  '1h': { ring: 'fine', ms: 3600_000 },
  '6h': { ring: 'coarse', ms: 6 * 3600_000 },
  '24h': { ring: 'coarse', ms: 24 * 3600_000 },
  '7d': { ring: 'coarse', ms: 7 * 24 * 3600_000 },
};

class Ring {
  constructor(capacity, width, withMax) {
    this.capacity = capacity;
    this.width = width;
    this.t = new Float64Array(capacity);
    this.avg = new Float32Array(capacity * width).fill(NaN);
    this.max = withMax ? new Float32Array(capacity * width).fill(NaN) : null;
    this.head = 0; // next write slot
    this.size = 0;
  }

  push(t, avg, max) {
    const i = this.head;
    this.t[i] = t;
    const o = i * this.width;
    for (let k = 0; k < this.width; k += 1) {
      this.avg[o + k] = avg[k];
      if (this.max) this.max[o + k] = max ? max[k] : avg[k];
    }
    this.head = (i + 1) % this.capacity;
    if (this.size < this.capacity) this.size += 1;
  }

  /** Physical slot of the n-th oldest point. */
  slot(n) {
    return (this.head - this.size + n + this.capacity) % this.capacity;
  }

  lastT() {
    return this.size ? this.t[this.slot(this.size - 1)] : null;
  }

  /** First logical index with t >= from (binary search: timestamps only grow). */
  lowerBound(from) {
    let lo = 0;
    let hi = this.size;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.t[this.slot(mid)] < from) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  /** Forget the newest points with t >= from (a clock that was ahead and got corrected). */
  dropFrom(from) {
    while (this.size && this.t[this.slot(this.size - 1)] >= from) {
      this.head = (this.head - 1 + this.capacity) % this.capacity;
      this.size -= 1;
    }
  }

  clear() {
    this.head = 0;
    this.size = 0;
  }
}

/** A step back in wall time bigger than this is a clock correction, not jitter. */
const CLOCK_STEP_MS = 120_000;

export function createHistory({ fineCapacity = 3600, coarseCapacity = 10080 } = {}) {
  const W = SERIES.length;
  const fine = new Ring(fineCapacity, W, false);
  const coarse = new Ring(coarseCapacity, W, true);
  // The minute being accumulated for the coarse ring.
  let minute = null;
  let clockSteps = 0;
  const sum = new Float64Array(W);
  const cnt = new Uint32Array(W);
  const mx = new Float64Array(W).fill(-Infinity);
  const row = new Float32Array(W);
  const rowMax = new Float32Array(W);

  function flushMinute() {
    if (minute === null) return;
    let any = false;
    for (let k = 0; k < W; k += 1) {
      row[k] = cnt[k] ? sum[k] / cnt[k] : NaN;
      rowMax[k] = cnt[k] ? mx[k] : NaN;
      if (cnt[k]) any = true;
    }
    if (any) coarse.push(minute, row, rowMax);
    sum.fill(0);
    cnt.fill(0);
    mx.fill(-Infinity);
    minute = null;
  }

  /** Add one sample: values is { cpu: 9.1, cpuTemp: 45, ... } (missing or null → NaN). */
  function push(t, values) {
    const lastFine = fine.lastT();
    if (lastFine !== null && t <= lastFine) {
      // Small steps back are dropped. A big one means the clock was ahead and has been corrected (an RTC
      // set wrong, then NTP): forget the "future" points so recording carries on instead of stalling.
      if (lastFine - t < CLOCK_STEP_MS) return false;
      fine.dropFrom(t);
      coarse.dropFrom(Math.floor(t / 60_000) * 60_000);
      minute = null;
      sum.fill(0);
      cnt.fill(0);
      mx.fill(-Infinity);
      clockSteps += 1;
    }
    for (let k = 0; k < W; k += 1) {
      const v = values[SERIES_NAMES[k]];
      row[k] = isNum(v) ? v : NaN;
    }
    fine.push(t, row, null);
    const m = Math.floor(t / 60_000) * 60_000;
    if (minute !== null && m !== minute) flushMinute();
    if (minute === null) minute = m;
    for (let k = 0; k < W; k += 1) {
      const v = row[k];
      if (Number.isNaN(v)) continue;
      sum[k] += v;
      cnt[k] += 1;
      if (v > mx[k]) mx[k] = v;
    }
    return true;
  }

  /** Add one already-aggregated minute straight to the coarse ring (pre-filling fixture history). */
  function pushMinute(t, avgValues, maxValues = avgValues) {
    const m = Math.floor(t / 60_000) * 60_000;
    const last = coarse.lastT();
    if (last !== null && m <= last) return false;
    for (let k = 0; k < W; k += 1) {
      const n = SERIES_NAMES[k];
      row[k] = isNum(avgValues[n]) ? avgValues[n] : NaN;
      rowMax[k] = isNum(maxValues[n]) ? maxValues[n] : row[k];
    }
    coarse.push(m, row, rowMax);
    return true;
  }

  function pick(ring, n, k, agg) {
    const s = ring.slot(n);
    const arr = agg === 'max' && ring.max ? ring.max : ring.avg;
    return arr[s * ring.width + k];
  }

  /**
   * query({ range, series, points, agg, now }) → { range, resolutionSec, from, to, count, t, series, units }
   * Raw points unless `points` asks for that many equal time buckets (averaged, or max with agg=max).
   */
  function query({ range = '1h', series = SERIES_NAMES, points = null, agg = 'avg', now = Date.now() } = {}) {
    const r = RANGES[range];
    if (!r) throw new Error(`unknown range "${range}"`);
    const names = series.filter((n) => INDEX.has(n));
    const ring = r.ring === 'fine' ? fine : coarse;
    const to = now;
    const from = now - r.ms;
    const start = ring.lowerBound(from);
    const out = { range, agg, resolutionSec: r.ring === 'fine' ? 1 : 60, from, to, count: 0, t: [], series: {}, units: {} };
    for (const n of names) {
      out.series[n] = [];
      out.units[n] = UNITS[n];
    }
    const fix = (v) => (Number.isNaN(v) ? null : Math.round(v * 100) / 100);
    if (!points) {
      for (let n = start; n < ring.size; n += 1) {
        const tt = ring.t[ring.slot(n)];
        if (tt > to) break;
        out.t.push(tt);
        for (const name of names) out.series[name].push(fix(pick(ring, n, INDEX.get(name), agg)));
      }
    } else {
      const buckets = Math.max(1, Math.min(10080, Math.floor(points)));
      const step = (to - from) / buckets;
      const acc = names.map(() => ({ s: new Float64Array(buckets), c: new Uint32Array(buckets), m: new Float64Array(buckets).fill(-Infinity) }));
      for (let n = start; n < ring.size; n += 1) {
        const tt = ring.t[ring.slot(n)];
        if (tt > to) break;
        const b = Math.min(buckets - 1, Math.floor((tt - from) / step));
        names.forEach((name, j) => {
          const v = pick(ring, n, INDEX.get(name), agg);
          if (Number.isNaN(v)) return;
          acc[j].s[b] += v;
          acc[j].c[b] += 1;
          if (v > acc[j].m[b]) acc[j].m[b] = v;
        });
      }
      for (let b = 0; b < buckets; b += 1) out.t.push(Math.round(from + b * step));
      names.forEach((name, j) => {
        const a = acc[j];
        for (let b = 0; b < buckets; b += 1) {
          out.series[name].push(a.c[b] ? fix(agg === 'max' ? a.m[b] : a.s[b] / a.c[b]) : null);
        }
      });
      out.resolutionSec = Math.round(step / 1000);
    }
    out.count = out.t.length;
    return out;
  }

  /**
   * Statistics of one series over [from, to] from the coarse ring (plus the fine ring for the current,
   * unflushed minute): { avg, min, max, count }.
   */
  function stats(name, { from, to }) {
    const k = INDEX.get(name);
    if (k === undefined) return null;
    let s = 0;
    let c = 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (let n = coarse.lowerBound(from); n < coarse.size; n += 1) {
      const tt = coarse.t[coarse.slot(n)];
      if (tt > to) break;
      const v = pick(coarse, n, k, 'avg');
      const vmax = pick(coarse, n, k, 'max');
      if (Number.isNaN(v)) continue;
      s += v;
      c += 1;
      if (v < lo) lo = v;
      if (vmax > hi) hi = vmax;
    }
    if (!c) return { avg: null, min: null, max: null, count: 0 };
    return { avg: s / c, min: lo, max: hi, count: c };
  }

  /** Average of one series over the last `seconds` of the fine ring. */
  function recent(name, seconds, now) {
    const k = INDEX.get(name);
    if (k === undefined) return null;
    let s = 0;
    let c = 0;
    for (let n = fine.lowerBound(now - seconds * 1000); n < fine.size; n += 1) {
      const v = pick(fine, n, k, 'avg');
      if (Number.isNaN(v)) continue;
      s += v;
      c += 1;
    }
    return c ? s / c : null;
  }

  // ---------------------------------------------------------------------------------------------- persistence

  const b64 = (typed) => Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength).toString('base64');
  const fromB64 = (s, Type) => {
    const buf = Buffer.from(s, 'base64');
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    return new Type(copy.buffer);
  };

  function dumpRing(ring) {
    const n = ring.size;
    const t = new Float64Array(n);
    const avg = new Float32Array(n * ring.width);
    const max = ring.max ? new Float32Array(n * ring.width) : null;
    for (let i = 0; i < n; i += 1) {
      const s = ring.slot(i);
      t[i] = ring.t[s];
      avg.set(ring.avg.subarray(s * ring.width, (s + 1) * ring.width), i * ring.width);
      if (max) max.set(ring.max.subarray(s * ring.width, (s + 1) * ring.width), i * ring.width);
    }
    return { size: n, t: b64(t), avg: b64(avg), max: max ? b64(max) : null };
  }

  function loadRing(ring, d, width, keepFrom) {
    if (!d || !Number.isInteger(d.size) || d.size < 0) return 0;
    const t = fromB64(d.t, Float64Array);
    const avg = fromB64(d.avg, Float32Array);
    const max = d.max ? fromB64(d.max, Float32Array) : null;
    if (t.length !== d.size || avg.length !== d.size * width || (max && max.length !== d.size * width)) throw new Error('history arrays have the wrong length');
    ring.clear();
    let loaded = 0;
    for (let i = 0; i < d.size; i += 1) {
      if (t[i] < keepFrom || (ring.size && t[i] <= ring.lastT())) continue;
      ring.push(t[i], avg.subarray(i * width, (i + 1) * width), max ? max.subarray(i * width, (i + 1) * width) : null);
      loaded += 1;
    }
    return loaded;
  }

  /** A plain object for saving: series names (so a later version can map columns), then both rings. */
  function serialize() {
    return { v: 1, series: SERIES_NAMES, fine: dumpRing(fine), coarse: dumpRing(coarse), minute: minuteState() };
  }

  // Saving must not disturb the minute being accumulated, so its running sums are saved as they are.
  function minuteState() {
    return minute === null ? null : { t: minute, sum: Array.from(sum), cnt: Array.from(cnt), max: Array.from(mx, (v) => (v === -Infinity ? null : v)) };
  }

  /** Restore from serialize() output, dropping points older than the rings cover. Returns counts. */
  function restore(obj, now = Date.now()) {
    if (!obj || obj.v !== 1 || !Array.isArray(obj.series)) throw new Error('not a jarvis-core history file');
    if (obj.series.join(',') !== SERIES_NAMES.join(',')) {
      // Columns changed between versions: start fresh rather than mix them up.
      return { fine: 0, coarse: 0, skipped: 'series changed' };
    }
    const f = loadRing(fine, obj.fine, W, now - fineCapacity * 1000);
    const c = loadRing(coarse, obj.coarse, W, now - coarseCapacity * 60_000);
    const ms = obj.minute;
    if (ms && Number.isFinite(ms.t) && ms.t > (coarse.lastT() ?? -Infinity) && ms.t >= now - 120_000) {
      minute = ms.t;
      for (let k = 0; k < W; k += 1) {
        sum[k] = Number(ms.sum?.[k]) || 0;
        cnt[k] = Number(ms.cnt?.[k]) || 0;
        mx[k] = isNum(ms.max?.[k]) ? ms.max[k] : -Infinity;
      }
    }
    return { fine: f, coarse: c };
  }

  function clear() {
    fine.clear();
    coarse.clear();
    minute = null;
    sum.fill(0);
    cnt.fill(0);
    mx.fill(-Infinity);
  }

  return {
    push,
    pushMinute,
    query,
    stats,
    recent,
    serialize,
    restore,
    clear,
    get sizes() {
      return { fine: fine.size, coarse: coarse.size, fineCapacity, coarseCapacity, clockSteps };
    },
    get lastT() {
      return fine.lastT();
    },
  };
}
