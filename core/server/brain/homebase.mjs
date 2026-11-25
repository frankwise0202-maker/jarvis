// The home base's overnight report for the morning briefing, from the Core's own history and event log:
// how it is now, the night's peaks, and anything that happened. Local and free.

import { fmtClock } from '../format.mjs';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function peak(q, name, from) {
  const vals = q.series?.[name] ?? [];
  let best = null;
  for (let i = 0; i < vals.length; i += 1) {
    const v = vals[i];
    const t = q.t[i];
    if (!isNum(v) || t < from) continue;
    if (!best || v > best.v) best = { v, t };
  }
  return best;
}

/** { level, summary, notes } for the night from `fromMs` to `now`. */
export function overnightReport({ core, now, fromMs, timeZone }) {
  try {
    const snap = core?.snapshot ?? null;
    const level = snap?.health?.level ?? 'unknown';
    const notes = [];
    let q = null;
    try {
      q = core.history.query({ range: '24h', series: ['cpu', 'cpuTemp', 'gpuTemp', 'ram'], agg: 'max', now });
    } catch {
      q = null;
    }
    if (q) {
      const cpu = peak(q, 'cpu', fromMs);
      if (cpu) notes.push(`CPU peaked at ${Math.round(cpu.v)}% at ${fmtClock(cpu.t, timeZone)}`);
      const temp = peak(q, 'cpuTemp', fromMs);
      if (temp) notes.push(`Warmest CPU reading ${Math.round(temp.v)} °C at ${fmtClock(temp.t, timeZone)}`);
      const gpu = peak(q, 'gpuTemp', fromMs);
      if (gpu) notes.push(`Graphics card peaked at ${Math.round(gpu.v)} °C`);
    }
    const events = (core?.events?.between?.(fromMs, now) ?? []).filter((e) => e.level === 'warn' || e.level === 'alert' || e.rule === 'core.crash' || e.rule === 'machine.boot');
    const problems = events.filter((e) => e.kind === 'health' && (e.level === 'warn' || e.level === 'alert'));
    const restarts = events.filter((e) => e.rule === 'core.crash' || e.rule === 'machine.boot');
    for (const e of [...restarts, ...problems].slice(0, 3)) notes.push(`${fmtClock(e.t, timeZone)}: ${e.message}`);
    if (!restarts.length) notes.push('No restarts overnight');
    let summary;
    if (level === 'unknown') summary = 'The home base report is not available yet.';
    else if (level === 'ok' && !problems.length && !restarts.length) summary = 'All systems normal overnight.';
    else if (level === 'ok') summary = `All clear now, after ${problems.length + restarts.length === 1 ? 'one thing' : `${problems.length + restarts.length} things`} overnight.`;
    else summary = `Needs a look: ${snap?.health?.summary ?? 'something is not right'}.`;
    return { level, summary, notes: notes.slice(0, 6) };
  } catch {
    return { level: 'unknown', summary: 'The home base report is not available.', notes: [] };
  }
}
