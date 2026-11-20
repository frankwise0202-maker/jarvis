// Estimated API spend (SPEC §5), in localStorage['jarvis.spend.v1'] as
// { month: 'YYYY-MM', monthUsd, totalUsd }. The month rolls over by the local date.
// Amounts are estimates from token counts; the UI always labels them as such.
// Today's total of every source (replies, Watch frames, follow-up suggestions) is kept beside it in
// localStorage['jarvis.spend.day.v1'] as { day: 'YYYY-MM-DD', usd } (getTodaySpend), so the "SPEND
// TODAY" readouts agree with the month figure.

import { readItem, writeItem, removeItem, watchItem } from './storage.js';
import { createEmitter, isPlainObject, parseJson } from './util.js';

export const SPEND_KEY = 'jarvis.spend.v1';
export const SPEND_DAY_KEY = 'jarvis.spend.day.v1';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const changes = createEmitter('spend');
let state = null; // { month, monthUsd, totalUsd } as stored (month may be stale)

/** 'YYYY-MM' for a Date (local time). */
export function monthKey(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const money = (n) => (Number.isFinite(n) && n > 0 ? Math.round(n * 1e6) / 1e6 : 0);

/** 'YYYY-MM-DD' for a Date (local time). */
export function spendDayKey(date = new Date()) {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's estimated spend from every source (USD; 0 on a new day). */
export function getTodaySpend(now = new Date()) {
  const raw = parseJson(readItem(SPEND_DAY_KEY), null);
  return isPlainObject(raw) && raw.day === spendDayKey(now) ? money(raw.usd) : 0;
}

function load() {
  const raw = parseJson(readItem(SPEND_KEY), null);
  if (!isPlainObject(raw)) return { month: monthKey(), monthUsd: 0, totalUsd: 0 };
  const month = typeof raw.month === 'string' && MONTH_RE.test(raw.month) ? raw.month : '';
  // A month figure without a valid month is meaningless; the total is still worth keeping.
  const monthUsd = month ? money(raw.monthUsd) : 0;
  return { month: month || monthKey(), monthUsd, totalUsd: Math.max(money(raw.totalUsd), monthUsd) };
}

function ensure() {
  if (!state) {
    state = load();
    watchItem(SPEND_KEY, () => {
      state = load();
      changes.emit(getSpend());
    });
  }
  return state;
}

/** Current spend: { month, monthUsd, totalUsd } (monthUsd is 0 once the month has changed). */
export function getSpend(now = new Date()) {
  const s = ensure();
  const month = monthKey(now);
  return Object.freeze({ month, monthUsd: s.month === month ? s.monthUsd : 0, totalUsd: s.totalUsd });
}

/** Add an estimated cost in USD (ignored unless a positive finite number). Returns the new spend. */
export function addSpend(usd, now = new Date()) {
  const amount = typeof usd === 'number' && Number.isFinite(usd) && usd > 0 ? usd : 0;
  if (!amount) return getSpend(now);
  const s = ensure();
  const month = monthKey(now);
  const monthUsd = money((s.month === month ? s.monthUsd : 0) + amount);
  state = { month, monthUsd, totalUsd: money(s.totalUsd + amount) };
  writeItem(SPEND_KEY, JSON.stringify(state));
  const day = spendDayKey(now);
  writeItem(SPEND_DAY_KEY, JSON.stringify({ day, usd: money(getTodaySpend(now) + amount) }));
  const result = getSpend(now);
  changes.emit(result);
  return result;
}

/** fn(spend) after every change (including other tabs). Returns unsubscribe. */
export function onSpendChange(fn) {
  ensure();
  return changes.on(fn);
}

/** Forget all recorded spend (used by resetApp). */
export function resetSpend() {
  state = { month: monthKey(), monthUsd: 0, totalUsd: 0 };
  removeItem(SPEND_KEY);
  removeItem(SPEND_DAY_KEY);
  changes.emit(getSpend());
}
