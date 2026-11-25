// Formatting for the Core dashboard. Pure functions (no DOM, no clock): every value that is not
// known comes back as null so the caller can say so in words ("not checked", "driver not loaded")
// instead of printing an invented number.
//
// Units, chosen for a non-technical owner and to match what Ubuntu shows him:
//   memory and VRAM   binary, written "GB" (15.6 GB for a 16 GB kit, like GNOME System Monitor)
//   disks             decimal, written "GB"/"TB" (a 1 TB drive reads 1.0 TB, like GNOME Files)
//   network           bits per second (Mb/s, like an internet plan)
//   disk activity     bytes per second (MB/s)

export const NBSP = ' ';
const THIN = ' ';

/**
 * A sentence from the Core ("back to normal (64 °C)", "35 GB free", "6 percent") with a no-break
 * space between each number and its unit, so a wrapped line never ends on the number and starts
 * the next with the unit. Anything that is not a string comes back as it was.
 */
const UNIT_GAP = /(\d) (?=(?:°C|°F|%|percent\b|[kMGT]?B\b|[kMG]?b\/s|ms\b|s\b|min\b|h\b|W\b|[MG]Hz\b))/g;
export function keepUnits(text) {
  return typeof text === 'string' ? text.replace(UNIT_GAP, `$1${NBSP}`) : text;
}

/** A finite number, or null. Accepts numbers and numeric strings ("41", "41.5"); rejects "", "N/A", NaN, objects. */
export function num(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Clamp to [lo, hi]; null stays null. */
export function clamp(v, lo, hi) {
  const n = num(v);
  if (n === null) return null;
  return n < lo ? lo : n > hi ? hi : n;
}

/** "9%", "100%", "<1%" for a small non-zero share; null when unknown. */
export function fmtPct(v) {
  const n = num(v);
  if (n === null) return null;
  if (n > 0 && n < 0.5) return '<1%';
  return `${Math.round(Math.max(0, n))}%`;
}

/** The number part of a percentage ("9"), for big figures with the unit set apart. */
export function pctNumber(v) {
  const n = num(v);
  if (n === null) return null;
  if (n > 0 && n < 0.5) return '<1';
  return String(Math.round(Math.max(0, n)));
}

function trimFixed(n, digits) {
  return n.toFixed(digits);
}

/** One decimal below `below` (10 by default), none above: "4.2", "42", "420". */
function sig(n, below = 10) {
  const a = Math.abs(n);
  if (a === 0) return '0';
  if (a < below) return trimFixed(n, 1);
  return String(Math.round(n));
}

const BIN = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
const DEC = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'];

/** Binary sizes (memory, VRAM), labelled GB like the OS does: 16710000000 → "15.6 GB", 412 MiB → "412 MB". */
export function fmtMem(bytes) {
  const n = num(bytes);
  if (n === null || n < 0) return null;
  if (n < 1024) return `${Math.round(n)}${NBSP}B`;
  let v = n;
  let i = 0;
  while (v >= 1024 && i < BIN.length - 1) {
    v /= 1024;
    i++;
  }
  // Round first, then promote: 1023.96 MB reads "1.0 GB", never "1024 MB".
  if (v >= 999.5 && i < BIN.length - 1) {
    v /= 1024;
    i++;
  }
  return `${sig(v, 100)}${NBSP}${BIN[i]}`;
}

/** Installed memory the way it was bought: 15.57 GiB of usable RAM reads "16 GB". */
export function fmtMemInstalled(bytes) {
  const n = num(bytes);
  if (n === null || n <= 0) return null;
  const gib = n / 1024 ** 3;
  if (gib < 1) return fmtMem(n);
  return `${Math.round(gib)}${NBSP}GB`;
}

/** Decimal sizes (disks): 1000204886016 → "1.0 TB", 212000000000 → "212 GB". */
export function fmtDisk(bytes) {
  const n = num(bytes);
  if (n === null || n < 0) return null;
  if (n < 1000) return `${Math.round(n)}${NBSP}B`;
  let v = n;
  let i = 0;
  while (v >= 1000 && i < DEC.length - 1) {
    v /= 1000;
    i++;
  }
  if (v >= 999.5 && i < DEC.length - 1) {
    v /= 1000;
    i++;
  }
  return `${sig(v)}${NBSP}${DEC[i]}`;
}

/** Bytes per second → bits per second, like an internet plan: "0 b/s", "180 kb/s", "2.4 Mb/s". */
export function fmtBits(bytesPerSec) {
  const n = num(bytesPerSec);
  if (n === null || n < 0) return null;
  let v = n * 8;
  const units = ['b/s', 'kb/s', 'Mb/s', 'Gb/s'];
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  if (v >= 999.5 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${i === 0 ? Math.round(v) : sig(v)}${NBSP}${units[i]}`;
}

/** Bytes per second for disk activity: "0 B/s", "120 kB/s", "48 MB/s". */
export function fmtRate(bytesPerSec) {
  const n = num(bytesPerSec);
  if (n === null || n < 0) return null;
  const s = fmtDisk(n);
  return s === null ? null : `${s}/s`;
}

/** "41 °C" (whole degrees); null when unknown. */
export function fmtTemp(c) {
  const n = num(c);
  if (n === null) return null;
  return `${Math.round(n)}${NBSP}°C`;
}

/** "18 ms", "1.2 s"; null when unknown. */
export function fmtLatency(ms) {
  const n = num(ms);
  if (n === null || n < 0) return null;
  if (n < 1) return `<1${NBSP}ms`;
  if (n < 1000) return `${Math.round(n)}${NBSP}ms`;
  return `${(n / 1000).toFixed(1)}${NBSP}s`;
}

/** "3.40 GHz", "800 MHz"; null when unknown. */
export function fmtFreq(mhz) {
  const n = num(mhz);
  if (n === null || n <= 0) return null;
  if (n >= 1000) return `${(n / 1000).toFixed(2)}${NBSP}GHz`;
  return `${Math.round(n)}${NBSP}MHz`;
}

/** "18 W", "163 W"; null when unknown. */
export function fmtWatts(w) {
  const n = num(w);
  if (n === null || n < 0) return null;
  return `${n < 10 ? n.toFixed(1) : Math.round(n)}${NBSP}W`;
}

const pad2 = (n) => (n < 10 ? '0' : '') + n;

/**
 * Uptime for the top bar: "4h 12m", "3d 04h", "12m", "45s". Seconds in, null when unknown.
 * Long uptimes stay short: "214d 07h".
 */
export function fmtUptime(seconds) {
  const n = num(seconds);
  if (n === null || n < 0) return null;
  const s = Math.floor(n);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60) % 60;
  const h = Math.floor(s / 3600) % 24;
  const d = Math.floor(s / 86400);
  if (d > 0) return `${d}d ${pad2(h)}h`;
  if (h > 0) return `${h}h ${pad2(m)}m`;
  return `${m}m`;
}

/** "just now", "42 s ago", "5 min ago", "3 h ago", "2 days ago" between two epoch-ms times. */
export function fmtAgo(thenMs, nowMs) {
  const t = num(thenMs);
  const now = num(nowMs);
  if (t === null || now === null) return null;
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}${NBSP}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}${NBSP}min ago`;
  const h = Math.round(s / 3600);
  if (h < 48) return `${h}${NBSP}h ago`;
  return `${Math.round(s / 86400)} days ago`;
}

/** Load averages "0.42 · 0.38 · 0.31"; null when unknown. */
export function fmtLoad(load) {
  if (!Array.isArray(load) || load.length < 3) return null;
  const parts = load.slice(0, 3).map(num);
  if (parts.some((p) => p === null)) return null;
  return parts.map((p) => p.toFixed(2)).join(` ${THIN}·${THIN} `);
}

/** Thousands separators without Intl (tests run anywhere): 1234567 → "1,234,567". */
export function fmtInt(v) {
  const n = num(v);
  if (n === null) return null;
  const s = String(Math.round(Math.abs(n)));
  const out = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return n < 0 ? `-${out}` : out;
}

/** "used / total" pair with one unit when both share it: "6.2 / 15.6 GB". */
export function fmtPair(a, b, fmt = fmtMem) {
  const sa = fmt(a);
  const sb = fmt(b);
  if (sa === null || sb === null) return null;
  const ua = sa.split(NBSP)[1];
  const ub = sb.split(NBSP)[1];
  if (ua && ua === ub) return `${sa.split(NBSP)[0]} / ${sb}`;
  return `${sa} / ${sb}`;
}

// ---- clock ---------------------------------------------------------------------------------

const fmtCache = new Map();
function dtf(locale, options) {
  const key = `${locale || ''}|${JSON.stringify(options)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale || undefined, options);
    fmtCache.set(key, f);
  }
  return f;
}

/**
 * The clock split for display: { time: "9:47", period: "PM" } in a 12-hour locale,
 * { time: "21:47", period: "" } in a 24-hour one. `opts.hour12` forces either.
 */
export function clockParts(date, locale, opts = {}) {
  const o = { hour: 'numeric', minute: '2-digit' };
  if (typeof opts.hour12 === 'boolean') o.hour12 = opts.hour12;
  if (opts.timeZone) o.timeZone = opts.timeZone;
  const parts = dtf(locale, o).formatToParts(date);
  let time = '';
  let period = '';
  for (const p of parts) {
    if (p.type === 'dayPeriod') period = p.value.toUpperCase();
    else if (p.type === 'hour' || p.type === 'minute') time += p.value;
    else if (p.type === 'literal' && time && !period && /[:.]/.test(p.value)) time += p.value.trim();
  }
  return { time, period };
}

/** "Tuesday 25 November" / "Tuesday, November 25" by locale. */
export function fmtDate(date, locale, timeZone) {
  const o = { weekday: 'long', month: 'long', day: 'numeric' };
  if (timeZone) o.timeZone = timeZone;
  return dtf(locale, o).format(date);
}

/**
 * An event's time, short enough for the log's time column: "9:47:03 PM" today, "Sat 9:47 PM" in the
 * last six days, "Nov 14" before that ("Nov 21, 10:36 PM" did not fit).
 */
export function fmtEventTime(ms, nowMs, locale, timeZone) {
  const t = num(ms);
  if (t === null) return '';
  const d = new Date(t);
  const now = num(nowMs) ?? t;
  let o;
  if (dayKey(t, timeZone) === dayKey(now, timeZone)) o = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
  else if (Math.abs(now - t) < 6 * 86400000) o = { weekday: 'short', hour: 'numeric', minute: '2-digit' };
  else o = { month: 'short', day: 'numeric' };
  if (timeZone) o.timeZone = timeZone;
  return dtf(locale, o).format(d);
}

function dayKey(ms, timeZone) {
  const o = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (timeZone) o.timeZone = timeZone;
  return dtf('en-CA', o).format(new Date(ms));
}

/** Minutes since local midnight for a Date (uses the runtime's time zone unless given). */
export function minutesOfDay(date, timeZone) {
  if (!timeZone) return date.getHours() * 60 + date.getMinutes();
  const parts = dtf('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).formatToParts(date);
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === 'hour') h = Number(p.value) % 24;
    else if (p.type === 'minute') m = Number(p.value);
  }
  return h * 60 + m;
}
