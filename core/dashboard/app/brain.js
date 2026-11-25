// The home base brain (Jarvis Core 1.1.0 and later): pure helpers, no DOM and no clock of their own.
// They turn the Core's brain JSON (GET api/brain, api/jobs, api/watchers, api/briefing and the
// stream's `job`, `watcher`, `spend` and `briefing` frames) into what the panels and morning mode
// show, and decide when morning mode is on. A Core without a brain (1.0.0: api/brain answers 404)
// gives `null` everywhere, and then no brain UI shows at all.

import { minutesOfDay, num } from './format.js';
import { inWindow, parseClock } from './kiosk.js';

export const DEFAULT_BRIEFING_MIN = 7 * 60; // 07:00 when the Core does not say
export const MORNING_END_MIN = 10 * 60; // morning mode ends at 10:00
export const MORNING_IDLE_MS = 10 * 60 * 1000; // back after 10 minutes without a key or the mouse
export const MAX_JOBS = 30;
export const MAX_WATCHERS = 20;
export const MISSION_ROWS = 6;

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);

/** Epoch ms from the brain's ISO strings (or epoch ms); null when unknown. */
export function timeOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

export function normSpend(s) {
  const o = obj(s) || {};
  const cap = o.capReached === 'daily' || o.capReached === 'monthly' ? o.capReached : null;
  return { day: str(o.day), todayUsd: num(o.todayUsd), month: str(o.month), monthUsd: num(o.monthUsd), capReached: cap };
}

/** GET api/brain → the brain, or null when the body is not one (an old Core, an error page). */
export function normBrain(body) {
  const b = obj(body);
  if (!b || (!obj(b.key) && !obj(b.limits) && !obj(b.briefing) && !str(b.version))) return null;
  const key = obj(b.key) || {};
  const limits = obj(b.limits) || {};
  const br = obj(b.briefing) || {};
  const loc = obj(br.location);
  return {
    version: str(b.version),
    key: { set: key.set === true, hint: str(key.hint), verified: key.verified === true ? true : key.verified === false ? false : null },
    sdk: { installed: !(obj(b.sdk) && b.sdk.installed === false) },
    limits: { dailyUsd: num(limits.dailyUsd), monthlyUsd: num(limits.monthlyUsd) },
    spend: normSpend(b.spend),
    briefing: {
      enabled: br.enabled !== false,
      time: str(br.time),
      location: loc && (num(loc.lat) !== null || str(loc.label)) ? { label: str(loc.label) } : null,
      lastAt: timeOf(br.lastAt),
      nextAt: timeOf(br.nextAt),
    },
    jobs: { running: num(obj(b.jobs)?.running) ?? 0, queued: num(obj(b.jobs)?.queued) ?? 0 },
    watchers: { active: num(obj(b.watchers)?.active) },
    owner: { name: str(obj(b.owner)?.name) },
  };
}

export function normJob(j) {
  const o = obj(j);
  if (!o || !str(o.id)) return null;
  return {
    id: o.id,
    kind: str(o.kind) || 'research',
    title: str(o.title) || str(o.prompt) || 'Research',
    status: str(o.status) || 'queued',
    createdAt: timeOf(o.createdAt),
    startedAt: timeOf(o.startedAt),
    finishedAt: timeOf(o.finishedAt),
    summary: str(o.summary),
    error: obj(o.error) ? { code: str(o.error.code), message: str(o.error.message) } : null,
    costUsd: num(o.costUsd),
  };
}

export function normWatcher(w) {
  const o = obj(w);
  if (!o || !str(o.id)) return null;
  const r = obj(o.lastResult);
  return {
    id: o.id,
    what: str(o.what) || 'Watcher',
    every: str(o.every),
    status: str(o.status) || 'watching',
    createdAt: timeOf(o.createdAt),
    lastCheckAt: timeOf(o.lastCheckAt),
    lastResult: r ? { met: r.met === true, summary: str(r.summary) } : null,
  };
}

/** A list body ({jobs: [...]}, {watchers: [...]}) or a bare array → normalized items. */
export function normList(body, key, norm) {
  const list = Array.isArray(body) ? body : arr(obj(body)?.[key]);
  const out = [];
  for (const x of list) {
    const n = norm(x);
    if (n) out.push(n);
  }
  return out;
}

/** One item from the stream merged into a list by id (replacing the old copy), bounded. */
export function upsert(list, item, max) {
  if (!item) return list;
  const out = list.filter((x) => x.id !== item.id);
  out.unshift(item);
  return out.length > max ? out.slice(0, max) : out;
}

/** GET api/briefing → the briefing, or null (none yet, or not a briefing). */
export function normBriefing(body) {
  const b = obj(body);
  if (!b || !str(b.date)) return null;
  const w = obj(b.weather);
  const now = obj(w?.now) || {};
  const today = obj(w?.today) || {};
  const hb = obj(b.homebase);
  const music = obj(b.music);
  const url = str(music?.appleMusicUrl);
  return {
    date: b.date,
    generatedAt: timeOf(b.generatedAt),
    kind: b.kind === 'full' ? 'full' : 'free',
    greeting: str(b.greeting),
    weather: w
      ? {
          label: str(w.label),
          units: w.units === 'C' ? 'C' : 'F',
          temp: num(now.temp),
          summary: str(now.summary),
          code: num(now.code),
          high: num(today.high),
          low: num(today.low),
          rainPct: num(today.rainChancePct),
          todaySummary: str(today.summary),
        }
      : null,
    headlines: arr(b.headlines)
      .map((h) => ({ title: str(h?.title), source: str(h?.source), url: safeUrl(h?.url) }))
      .filter((h) => h.title)
      .slice(0, 6),
    homebase: hb ? { level: ['ok', 'warn', 'alert'].includes(hb.level) ? hb.level : 'unknown', summary: str(hb.summary), notes: arr(hb.notes).map(str).filter(Boolean).slice(0, 4) } : null,
    jobs: arr(b.jobs)
      .map((j) => ({ id: str(j?.id), title: str(j?.title) || 'Research', status: str(j?.status) || 'done', summary: str(j?.summary) }))
      .slice(0, 5),
    watchers: arr(b.watchers)
      .map((x) => ({ id: str(x?.id), what: str(x?.what) || 'Watcher', status: str(x?.status) || 'watching', summary: str(x?.summary) }))
      .slice(0, 5),
    whatsNew: arr(b.whatsNew)
      .map((n) => ({ title: str(n?.title), detail: str(n?.detail) }))
      .filter((n) => n.title)
      .slice(0, 4),
    music: music && str(music.suggestion) ? { suggestion: music.suggestion.trim(), url: url && /^https:\/\/(music|itunes)\.apple\.com\//.test(url) ? url : null } : null,
    spoken: str(b.spoken),
  };
}

/** Only https links leave the page (headlines come from public RSS feeds). */
function safeUrl(u) {
  const s = str(u);
  return s && /^https:\/\//i.test(s) ? s : null;
}

// --- what the panels show ---------------------------------------------------------------------

const JOB_STATUS = {
  queued: { word: 'QUEUED', level: 'unknown' },
  running: { word: 'RUNNING', level: 'ok' },
  done: { word: 'DONE', level: 'ok' },
  failed: { word: 'FAILED', level: 'alert' },
  cancelled: { word: 'CANCELLED', level: 'unknown' },
  blocked: { word: 'BLOCKED', level: 'warn' },
};

export function jobStatus(status) {
  return JOB_STATUS[status] || { word: String(status || 'unknown').toUpperCase(), level: 'unknown' };
}

/**
 * The missions list: research jobs (not the watchers' checks or the briefing's own call), the
 * running and queued ones first, then the finished ones, newest first.
 */
export function missionRows(jobs, max = MISSION_ROWS) {
  const list = arr(jobs).filter((j) => j && j.kind !== 'watch-check' && j.kind !== 'briefing');
  const active = (j) => j.status === 'running' || j.status === 'queued';
  const when = (j) => j.finishedAt ?? j.startedAt ?? j.createdAt ?? 0;
  list.sort((a, b) => (active(b) ? 1 : 0) - (active(a) ? 1 : 0) || (a.status === 'running' ? -1 : 0) - (b.status === 'running' ? -1 : 0) || when(b) - when(a));
  return list.slice(0, max).map((j) => ({ ...j, ...jobStatus(j.status), when: when(j) || null }));
}

/**
 * The key's line: the SDK missing beats everything (nothing can run), then no key, then a key that
 * could not be checked yet (the Core was offline when it arrived), then a working key.
 */
export function keyState(brain) {
  if (!brain) return null;
  if (!brain.sdk.installed) return { state: 'sdk', level: 'warn', word: 'NOT READY', text: 'Run jarvis-core update' };
  if (!brain.key.set) return { state: 'none', level: 'unknown', word: 'NO KEY', text: 'Add your key from Jarvis on your phone' };
  const hint = brain.key.hint || '';
  if (brain.key.verified === false) return { state: 'unverified', level: 'ok', word: 'KEY SAVED', text: `${hint ? `${hint} · ` : ''}checked when online`.trim() };
  return { state: 'set', level: 'ok', word: 'KEY SET', text: hint };
}

/** "$0.42", "$5", "$12.50"; null when unknown. */
export function fmtUsd(v) {
  const n = num(v);
  if (n === null) return null;
  if (n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  return Number.isInteger(n) && n >= 1 ? `$${n}` : `$${n.toFixed(2)}`;
}

function spendBar(used, cap, reached) {
  const u = num(used);
  const c = num(cap);
  const frac = u === null || c === null ? null : c <= 0 ? (u > 0 ? 1 : 0) : Math.max(0, u / c);
  let level = 'ok';
  if (reached || (frac !== null && frac >= 1)) level = 'alert';
  else if (frac !== null && frac >= 0.8) level = 'warn';
  return { used: u, cap: c, frac, level, text: u === null ? null : c === null ? fmtUsd(u) : `${fmtUsd(u)} of ${fmtUsd(c)}` };
}

/** Spend today and this month against the caps, with the bar's level (80 % warn, the cap alert). */
export function spendState(brain) {
  if (!brain) return null;
  const s = brain.spend;
  const today = spendBar(s.todayUsd, brain.limits.dailyUsd, s.capReached === 'daily');
  const month = spendBar(s.monthUsd, brain.limits.monthlyUsd, s.capReached === 'monthly');
  const level = today.level === 'alert' || month.level === 'alert' ? 'alert' : today.level === 'warn' || month.level === 'warn' ? 'warn' : 'ok';
  const capWords = s.capReached === 'monthly' ? 'Monthly cap reached: background research waits for next month.' : s.capReached === 'daily' ? 'Daily cap reached: background research waits for tomorrow.' : null;
  return { today, month, level, capReached: s.capReached, capWords };
}

/** Active watchers and the latest one whose condition was met. */
export function watcherState(brain, watchers) {
  if (!brain) return null;
  const list = arr(watchers);
  const counted = list.filter((w) => w.status === 'watching').length;
  const active = brain.watchers.active ?? counted;
  let latest = null;
  for (const w of list) {
    if (w.status !== 'met' && !(w.lastResult && w.lastResult.met)) continue;
    if (!latest || (w.lastCheckAt ?? 0) > (latest.lastCheckAt ?? 0)) latest = w;
  }
  return { active, total: list.length, latestMet: latest ? { what: latest.what, summary: latest.lastResult?.summary ?? null, at: latest.lastCheckAt } : null };
}

// --- morning mode -------------------------------------------------------------------------------

/**
 * The morning window from the Core's briefing time to 10:00, in minutes since local midnight, or
 * null: no brain (an old Core), the briefing turned off, or a briefing time at or after 10:00.
 */
export function morningWindow(brain) {
  if (!brain || !brain.briefing || brain.briefing.enabled === false) return null;
  const start = parseClock(brain.briefing.time) ?? DEFAULT_BRIEFING_MIN;
  if (start >= MORNING_END_MIN) return null;
  return { start, end: MORNING_END_MIN };
}

/** Is it morning on the Core's clock, in the Core's time zone (wall-clock minutes, so DST just works)? */
export function inMorning(nowMs, timeZone, win) {
  if (!win || !Number.isFinite(nowMs)) return false;
  return inWindow(minutesOfDay(new Date(nowMs), timeZone), win);
}

/**
 * Should the full-screen morning show? Only on the kiosk, inside the window, and not within
 * MORNING_IDLE_MS of the last key press or mouse move made during the window.
 */
export function morningOn({ kiosk, win, nowMs, timeZone, lastInputAt = null, idleMs = MORNING_IDLE_MS }) {
  if (!kiosk || !inMorning(nowMs, timeZone, win)) return false;
  return lastInputAt === null || nowMs - lastInputAt >= idleMs;
}

/** "2026-11-25" for a moment in a time zone (the briefing's `date`). */
export function dayKeyOf(ms, timeZone) {
  const o = { year: 'numeric', month: '2-digit', day: '2-digit' };
  if (timeZone) o.timeZone = timeZone;
  try {
    return new Intl.DateTimeFormat('en-CA', o).format(new Date(ms));
  } catch {
    return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  }
}

/** The briefing only counts for this morning when it is today's on the Core's clock. */
export function todaysBriefing(briefing, nowMs, timeZone) {
  return briefing && briefing.date === dayKeyOf(nowMs, timeZone) ? briefing : null;
}

/** "Good morning, Frank." with the owner's name from the brain (or the Core's info). */
export function greetingFor(name) {
  const n = str(name);
  return n ? `Good morning, ${n}.` : 'Good morning.';
}

/** The lead paragraph of a full briefing: its spoken text without the greeting it starts with. */
export function briefingLead(briefing) {
  if (!briefing || briefing.kind !== 'full' || !briefing.spoken) return null;
  let s = briefing.spoken.replace(/\s+/g, ' ').trim();
  s = s.replace(/^good (morning|afternoon|evening)[^.!]*[.!]\s*/i, '');
  if (s.length > 320) s = `${s.slice(0, 317).replace(/\s+\S*$/, '')}…`;
  return s || null;
}

/** "41°F", "−3°C"; null when unknown. */
export function fmtDegrees(v, units = 'F') {
  const n = num(v);
  if (n === null) return null;
  return `${Math.round(n)}°${units === 'C' ? 'C' : 'F'}`;
}
