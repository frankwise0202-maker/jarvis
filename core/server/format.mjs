// Human formatting shared by the health messages and the status assistant.
// Disks use decimal units (as the drive's label and Ubuntu's Files app do: "1 TB"); memory uses binary
// units with the everyday label ("16 GB" for 16 GiB). Temperatures are Celsius. Times use a 24-hour clock,
// like the rest of Jarvis.

import { isNum } from './util.mjs';

const DEC = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

function scaled(value, base) {
  let v = value;
  let i = 0;
  while (Math.abs(v) >= base && i < DEC.length - 1) {
    v /= base;
    i += 1;
  }
  return [v, DEC[i]];
}

function trimNum(v) {
  const digits = Math.abs(v) >= 10 || Number.isInteger(v) ? 0 : 1;
  let s = v.toFixed(digits);
  if (s.endsWith('.0')) s = s.slice(0, -2);
  return s;
}

/** 446_000_000_000 → "446 GB"; 5_100_000_000 → "5.1 GB". `binary: true` divides by 1024 (memory). */
export function fmtBytes(bytes, { binary = false } = {}) {
  if (!isNum(bytes)) return null;
  const [v, unit] = scaled(bytes, binary ? 1024 : 1000);
  return `${trimNum(v)} ${unit}`;
}

/** Bytes per second → "1.2 MB/s". */
export function fmtRate(bps) {
  if (!isNum(bps)) return null;
  if (bps < 1000) return `${Math.round(bps)} B/s`;
  return `${fmtBytes(bps)}/s`;
}

/**
 * Bytes per second → bits per second, like an internet plan and the dashboard's Network panel:
 * 22_687 → "181 kb/s", 300_000 → "2.4 Mb/s". The same steps and rounding as fmtBits in
 * dashboard/app/format.js, with a plain space (the dashboard keeps number and unit together itself).
 */
export function fmtBits(bytesPerSec) {
  if (!isNum(bytesPerSec) || bytesPerSec < 0) return null;
  const units = ['b/s', 'kb/s', 'Mb/s', 'Gb/s'];
  let v = bytesPerSec * 8;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  if (v >= 999.5 && i < units.length - 1) {
    v /= 1000;
    i += 1;
  }
  const n = i === 0 ? String(Math.round(v)) : v === 0 ? '0' : Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v));
  return `${n} ${units[i]}`;
}

/** 41.2 → "41 °C". */
export const fmtTemp = (c) => (isNum(c) ? `${Math.round(c)} °C` : null);

/** 9.4 → "9 percent"; 0.4 → "under 1 percent". */
export function fmtPercentWords(p) {
  if (!isNum(p)) return null;
  if (p > 0 && p < 1) return 'under 1 percent';
  return `${Math.round(p)} percent`;
}

/** 9.4 → "9%". */
export const fmtPct = (p) => (isNum(p) ? `${p > 0 && p < 1 ? '<1' : Math.round(p)}%` : null);

/** 87.6 → "88 ms"; 1534 → "1.5 s". */
export function fmtMs(ms) {
  if (!isNum(ms)) return null;
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace(/\.0$/, '')} s` : `${Math.round(ms)} ms`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 273_600 → "3 days, 4 hours"; 75 → "1 minute"; 40 → "40 seconds". */
export function fmtDuration(sec, { parts = 2 } = {}) {
  if (!isNum(sec) || sec < 0) return null;
  const s = Math.floor(sec);
  if (s < 60) return plural(s, 'second');
  const units = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  const out = [];
  let rest = s;
  for (const [name, size] of units) {
    const n = Math.floor(rest / size);
    rest -= n * size;
    if (n > 0 || out.length) {
      if (n > 0) out.push(plural(n, name));
      if (out.length >= parts) break;
    }
  }
  return out.slice(0, parts).join(', ');
}

/** Two-digit 24-hour clock for epoch ms: "14:05". */
export function fmtClock(ms, timeZone) {
  if (!isNum(ms)) return null;
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(ms);
}

/** "Wednesday 25 November". */
export function fmtDate(ms, timeZone) {
  if (!isNum(ms)) return null;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(ms);
}

/** Local hour (0-23) of epoch ms. */
export function localHour(ms, timeZone) {
  const h = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone }).format(ms);
  return Number(h);
}

/** Calendar-day key "2026-11-25" in local time, for "today"/"yesterday" decisions. */
function dayKey(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(ms);
}

/** "14:05 today", "14:05 yesterday", "Monday at 14:05", or "12 November at 14:05". */
export function fmtWhen(ms, now, timeZone) {
  if (!isNum(ms)) return null;
  const clock = fmtClock(ms, timeZone);
  if (dayKey(ms, timeZone) === dayKey(now, timeZone)) return `${clock} today`;
  if (dayKey(ms, timeZone) === dayKey(now - 86_400_000, timeZone)) return `${clock} yesterday`;
  if (now - ms < 6 * 86_400_000) {
    const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(ms);
    return `${wd} at ${clock}`;
  }
  const d = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone }).format(ms);
  return `${d} at ${clock}`;
}

/** "just now", "40 seconds ago", "12 minutes ago", "3 hours ago", "2 days ago". */
export function fmtAgo(ms, now) {
  if (!isNum(ms) || !isNum(now)) return null;
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s} seconds ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${plural(m, 'minute')} ago`;
  const h = Math.round(s / 3600);
  if (h < 48) return `${plural(h, 'hour')} ago`;
  return `${plural(Math.round(s / 86400), 'day')} ago`;
}

/** Join a list in plain English: "a", "a and b", "a, b and c". */
export function joinWords(items) {
  const list = items.filter(Boolean);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`;
}

/** Capitalise the first letter. */
export const cap = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1) : s);
