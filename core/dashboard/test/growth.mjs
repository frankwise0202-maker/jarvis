// The long-run verdict (pure, unit tested): given samples taken after a forced garbage collection
// once everything bounded is full, does anything still grow?
//
// Two measures per metric, both over the measured window only (the warm-up is excluded):
//   - slope: least-squares growth per simulated day;
//   - drift: the mean of the window's second half minus the mean of its first half. With a 48-hour
//     window each half holds whole cycles of the long run's scenario changes (every 2 h, 8-h
//     period) and outages (every 6 h), so their effects cancel out.
// A metric passes when both are within its limit. Shrinking always passes.

export const LIMITS = Object.freeze({
  liveNodes: { slopePerDay: 1, drift: 4, unit: 'nodes' }, // nodes in the live document (tree walk)
  nodes: { slopePerDay: 4, drift: 12, unit: 'nodes' }, // every DOM node alive in the renderer (CDP)
  heapMB: { slopePerDay: 0.1, drift: 0.25, unit: 'MB' }, // JS heap used (CDP Runtime.getHeapUsage)
  listeners: { slopePerDay: 0.5, drift: 1, unit: 'listeners' }, // JS event listeners (CDP)
});

/** Least-squares slope of ys over xs (per unit of x); 0 for fewer than two points. */
export function slope(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den ? num / den : 0;
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const round = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : v);

/**
 * @param {Array<{ hour: number } & Record<string, number>>} samples  the measured window, `hour` =
 *   simulated hours since the warm-up ended
 * @param {object} [limits]
 * @returns {{ pass: boolean, hours: number, metrics: Record<string, object>, failures: string[] }}
 */
export function judgeGrowth(samples, limits = LIMITS) {
  const failures = [];
  const metrics = {};
  const hours = samples.length ? samples[samples.length - 1].hour - samples[0].hour : 0;
  const midpoint = samples.length ? samples[0].hour + hours / 2 : 0;
  for (const [name, limit] of Object.entries(limits)) {
    const pts = samples.filter((s) => Number.isFinite(s[name]));
    if (pts.length < 4) {
      failures.push(`${name}: too few samples (${pts.length})`);
      metrics[name] = { samples: pts.length, pass: false };
      continue;
    }
    const xs = pts.map((s) => s.hour);
    const ys = pts.map((s) => s[name]);
    const perDay = slope(xs, ys) * 24;
    const firstHalf = pts.filter((s) => s.hour < midpoint).map((s) => s[name]);
    const secondHalf = pts.filter((s) => s.hour >= midpoint).map((s) => s[name]);
    const drift = mean(secondHalf) - mean(firstHalf);
    const pass = perDay <= limit.slopePerDay && drift <= limit.drift;
    metrics[name] = {
      first: ys[0],
      last: ys[ys.length - 1],
      min: Math.min(...ys),
      max: Math.max(...ys),
      slopePerDay: round(perDay),
      drift: round(drift),
      limits: { slopePerDay: limit.slopePerDay, drift: limit.drift },
      unit: limit.unit,
      pass,
    };
    if (!pass) failures.push(`${name}: grows ${round(perDay)} ${limit.unit}/day (limit ${limit.slopePerDay}), second half ${round(drift)} above the first (limit ${limit.drift})`);
  }
  return { pass: failures.length === 0, hours, metrics, failures };
}
