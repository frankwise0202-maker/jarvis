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

const NEAR_MS = 10 * 60_000;

/**
 * { level, summary, notes } for the night from `fromMs` to `now`. The night's events come first (an
 * automatic update that went back, unexpected stops and reboots, warnings, updates, restarts), then the
 * peaks. A rollback counts as something to look at; an update or a planned restart does not.
 */
export function overnightReport({ core, now, fromMs, timeZone }) {
  try {
    const snap = core?.snapshot ?? null;
    const level = snap?.health?.level ?? 'unknown';
    const all = core?.events?.between?.(fromMs, now) ?? [];
    const problems = all.filter((e) => e.kind === 'health' && (e.level === 'warn' || e.level === 'alert'));
    const rollbacks = all.filter((e) => e.rule === 'core.rollback');
    const restarts = all.filter((e) => e.rule === 'core.crash' || e.rule === 'machine.boot');
    const updates = all.filter((e) => e.rule === 'core.update');
    // A start that goes with an update, a rollback or a reboot is part of it; any other is a planned restart.
    const explained = [...updates, ...rollbacks, ...restarts];
    const starts = all.filter((e) => e.rule === 'core.start' && !explained.some((x) => Math.abs(x.t - e.t) <= NEAR_MS));
    const notes = [...rollbacks, ...restarts, ...problems, ...updates, ...starts]
      .slice(0, 3)
      .sort((a, b) => a.t - b.t)
      .map((e) => `${fmtClock(e.t, timeZone)}: ${e.message}`);
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
    if (!restarts.length && !starts.length && !updates.length && !rollbacks.length) notes.push('No restarts overnight');
    const things = problems.length + restarts.length + rollbacks.length;
    let summary;
    if (level === 'unknown') summary = 'The home base report is not available yet.';
    else if (level === 'ok' && !things) summary = 'All systems normal overnight.';
    else if (level === 'ok') summary = `All clear now, after ${things === 1 ? 'one thing' : `${things} things`} overnight.`;
    else summary = `Needs a look: ${snap?.health?.summary ?? 'something is not right'}.`;
    return { level, summary, notes: notes.slice(0, 6) };
  } catch {
    return { level: 'unknown', summary: 'The home base report is not available.', notes: [] };
  }
}
