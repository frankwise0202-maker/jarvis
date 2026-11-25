// Spending: every Claude call's cost, per local day and month (the Core's time zone), against the
// owner's caps (default $5 a day, $50 a month). Persisted in brain/spend-v1.json.
//
//   { v: 1, days: { "2026-11-25": { usd, calls, briefingUsd } }, months: { "2026-11": { usd, calls } } }

import { dayKey, monthKey } from './schedule.mjs';
import { usd } from './util.mjs';

const KEEP_DAYS = 400;
const KEEP_MONTHS = 36;

export function createSpend({ file, timeZone, now, limits, log = () => {} }) {
  let state = { v: 1, days: {}, months: {} };
  const loaded = file.load();
  if (loaded && loaded.v === 1 && loaded.days && typeof loaded.days === 'object') {
    for (const [d, e] of Object.entries(loaded.days)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && e && Number.isFinite(e.usd)) state.days[d] = { usd: Math.max(0, e.usd), calls: Math.max(0, Math.floor(e.calls) || 0), briefingUsd: Math.max(0, Number(e.briefingUsd) || 0) };
    }
    for (const [m, e] of Object.entries(loaded.months ?? {})) {
      if (/^\d{4}-\d{2}$/.test(m) && e && Number.isFinite(e.usd)) state.months[m] = { usd: Math.max(0, e.usd), calls: Math.max(0, Math.floor(e.calls) || 0) };
    }
  }
  let saveTimer = null;

  function prune() {
    const days = Object.keys(state.days).sort();
    for (const d of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) delete state.days[d];
    const months = Object.keys(state.months).sort();
    for (const m of months.slice(0, Math.max(0, months.length - KEEP_MONTHS))) delete state.months[m];
  }

  function scheduleSave() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      file.save(state);
    }, 250);
    saveTimer.unref?.();
  }

  const today = () => dayKey(now(), timeZone);
  const thisMonth = () => monthKey(now(), timeZone);

  function totals() {
    const d = today();
    const m = thisMonth();
    return { day: d, todayUsd: state.days[d]?.usd ?? 0, month: m, monthUsd: state.months[m]?.usd ?? 0, briefingTodayUsd: state.days[d]?.briefingUsd ?? 0 };
  }

  /** null | 'daily' | 'monthly' (the monthly cap is named first: it blocks for longer). */
  function capReached(extraUsd = 0) {
    const t = totals();
    const l = limits();
    if (t.monthUsd + extraUsd >= l.monthlyUsd) return 'monthly';
    if (t.todayUsd + extraUsd >= l.dailyUsd) return 'daily';
    return null;
  }

  /** What may still be spent before a cap, counting `extraUsd` not recorded yet: { usd, reason: 'daily' | 'monthly' }. */
  function headroom(extraUsd = 0) {
    const t = totals();
    const l = limits();
    const monthly = l.monthlyUsd - t.monthUsd - extraUsd;
    const daily = l.dailyUsd - t.todayUsd - extraUsd;
    return monthly <= daily ? { usd: monthly, reason: 'monthly' } : { usd: daily, reason: 'daily' };
  }

  /** Record one call's cost (`calls` 0 for a top-up of a call already counted). */
  function add(amount, { calls = 1, briefing = false } = {}) {
    const v = Number.isFinite(amount) && amount > 0 ? amount : 0;
    const d = today();
    const m = thisMonth();
    const day = (state.days[d] ??= { usd: 0, calls: 0, briefingUsd: 0 });
    const month = (state.months[m] ??= { usd: 0, calls: 0 });
    day.usd += v;
    day.calls += calls;
    month.usd += v;
    month.calls += calls;
    if (briefing) day.briefingUsd += v;
    prune();
    scheduleSave();
  }

  /** The compact form (GET /api/brain's `spend` and the SSE `spend` event). */
  function summary() {
    const t = totals();
    return { day: t.day, todayUsd: usd(t.todayUsd), month: t.month, monthUsd: usd(t.monthUsd), capReached: capReached() };
  }

  /** GET /api/spend?days=N: the last N local days, newest first (days without calls included). */
  function report(daysWanted = 30) {
    const count = Math.max(1, Math.min(366, Math.floor(daysWanted) || 30));
    const out = [];
    let t = now();
    const seen = new Set();
    for (let i = 0; out.length < count && i < count * 2 + 2; i += 1) {
      const d = dayKey(t, timeZone);
      if (!seen.has(d)) {
        seen.add(d);
        const e = state.days[d];
        out.push({ day: d, usd: usd(e?.usd ?? 0), calls: e?.calls ?? 0 });
      }
      t -= 12 * 3600_000; // half-day steps: never skips a day, DST included
    }
    const m = thisMonth();
    return { days: out, month: { month: m, usd: usd(state.months[m]?.usd ?? 0) }, limits: { ...limits() } };
  }

  return {
    add,
    totals,
    capReached,
    headroom,
    summary,
    report,
    flush() {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      try {
        file.saveSync(state);
      } catch (err) {
        log(`saving spend failed: ${err?.message ?? err}`);
      }
    },
  };
}
