// Local wall-clock time in the Core's time zone (America/New_York on the Alienware), done with Intl so
// daylight saving time is handled: "07:00 every day" is 12:00 UTC in winter and 11:00 UTC in summer, and
// the day the clocks change still gets exactly one briefing.

const partsCache = new Map();

function formatter(timeZone) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    if (partsCache.size > 20) partsCache.clear();
    partsCache.set(timeZone, f);
  }
  return f;
}

/** { year, month, day, hour, minute, second, weekday } of epoch ms in a time zone. */
export function zonedParts(ms, timeZone) {
  const out = {};
  for (const p of formatter(timeZone).formatToParts(ms)) {
    if (p.type === 'weekday') out.weekday = p.value;
    else if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  if (out.hour === 24) out.hour = 0;
  return out;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** "2026-11-25": the local calendar day. */
export function dayKey(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "2026-11": the local calendar month. */
export function monthKey(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}`;
}

/** The zone's offset from UTC at epoch ms, in ms (New York in winter: -5 h). */
export function tzOffsetMs(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/**
 * Epoch ms of a local wall-clock time. A time that does not exist (inside the spring-forward gap) moves
 * forward by the gap; a time that happens twice (the fall-back hour) is the first one.
 */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const o1 = tzOffsetMs(guess, timeZone);
  let t = guess - o1;
  const o2 = tzOffsetMs(t, timeZone);
  if (o2 !== o1) {
    const t2 = guess - o2;
    // Ambiguous or skipped: prefer the earlier valid instant that still shows the asked-for hour.
    t = tzOffsetMs(t2, timeZone) === o2 ? Math.min(t, t2) : t;
  }
  return t;
}

/** "07:00" → { hour: 7, minute: 0 }, or null. */
export function parseHm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  return hour < 24 && minute < 60 ? { hour, minute } : null;
}

/** The next time strictly after fromMs at which the local clock shows hh:mm. */
export function nextDailyAt(hm, timeZone, fromMs) {
  const want = typeof hm === 'string' ? parseHm(hm) : hm;
  if (!want) return null;
  const p = zonedParts(fromMs, timeZone);
  for (let add = 0; add < 3; add += 1) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day + add));
    const t = zonedTimeToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: want.hour, minute: want.minute }, timeZone);
    if (t > fromMs) return t;
  }
  return null;
}

/** The most recent time at or before fromMs at which the local clock showed hh:mm. */
export function lastDailyAt(hm, timeZone, fromMs) {
  const want = typeof hm === 'string' ? parseHm(hm) : hm;
  if (!want) return null;
  const p = zonedParts(fromMs, timeZone);
  for (let sub = 0; sub < 3; sub += 1) {
    const d = new Date(Date.UTC(p.year, p.month - 1, p.day - sub));
    const t = zonedTimeToUtc({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: want.hour, minute: want.minute }, timeZone);
    if (t <= fromMs) return t;
  }
  return null;
}

/** Local midnight that starts the day of `ms`. */
export function startOfLocalDay(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: 0, minute: 0 }, timeZone);
}

export const EVERY_MS = Object.freeze({ '6h': 6 * 3600_000, '12h': 12 * 3600_000, '24h': 24 * 3600_000 });

/**
 * An interval with jitter: ±5 % (at most ±20 minutes), so watchers created together spread out and never
 * hit the API at the same moment every day. rand() in [0, 1).
 */
export function jittered(intervalMs, rand = Math.random) {
  const span = Math.min(intervalMs * 0.05, 20 * 60_000);
  return Math.round(intervalMs + (rand() * 2 - 1) * span);
}

/** The time zone this process runs in (TZ, else the system's). */
export function systemTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}
