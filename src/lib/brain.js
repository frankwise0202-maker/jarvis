// The home base's brain (v7.6, SPEC §24): what the Jarvis Core 1.1 does for the owner in the
// background (research "missions", watchers, the morning briefing, spending caps, push). Pure
// helpers: no DOM, no network, no storage.
//
//   brainView(GET api/brain)        -> what Settings and the sheet show (null: not a brain answer)
//   jobView(job) · watcherView(w) · briefingView(b) · spendDaysView(GET api/spend)
//   brainProblem(failure)           -> { state, message } for a request that failed (no key, over cap, old Core…)
//   parseHomeBaseLink(value)        -> 'job:j_1' | 'briefing' | 'watch:w_1' (?homebase=…) -> { kind, id? } | null
//   homeBaseLinkOf(url)             -> the ?homebase= link of a notification's url (any origin), or ''
//   matchBrainCommand(text)         -> { kind: 'research' | 'results' | 'watch' | 'brief', … } | null (the whole sentence)
//   briefingMarkdown(view) · briefingSpeech(view) · resultsMarkdown(jobs) · watchingMarkdown(watchers)
//   roundCoord(v) · formatUsd(v) · deviceLabel(os)
//
// Everything the Core says is cleaned to plain text here (cleanLine); the chat gets it as Markdown with
// every punctuation character escaped (escapeMarkdown), so nothing in it becomes a link or formatting,
// except the links this module makes itself from checked https addresses (headlines, sources).

import { cleanLine, escapeMarkdown } from './homebase.js';

export const APP_URL = 'https://frankwise0202-maker.github.io/jarvis/';
export const JOB_PROMPT_MAX = 2000;
export const WATCH_WHAT_MAX = 300;
export const WATCH_EVERY = Object.freeze(['6h', '12h', '24h']);
export const JOB_DEPTHS = Object.freeze(['quick', 'deep']);
export const LIMIT_RANGES = Object.freeze({ dailyUsd: { min: 0, max: 50 }, monthlyUsd: { min: 0, max: 500 } });
export const DEFAULT_LIMITS = Object.freeze({ dailyUsd: 5, monthlyUsd: 50 });
/** A briefing younger than this is "current" ("brief me" shows it; older: a fresh one is made). */
export const FRESH_BRIEFING_MS = 3 * 60 * 60 * 1000;
/** The morning card shows a briefing for this long after it was made (a new one replaces it). */
export const MORNING_CARD_MS = 14 * 60 * 60 * 1000;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const bool = (v) => v === true;
const str = (v, max) => cleanLine(v, max);
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);

/** An ISO date (or epoch ms) -> epoch ms, or 0. */
export function timeOf(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v !== 'string' || !v) return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

/** A web address from the Core (a headline, a source): absolute http(s) only, else ''. */
export function safeUrl(v) {
  if (typeof v !== 'string' || !v || v.length > 2048) return '';
  try {
    const u = new URL(v.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    if (u.username || u.password) return '';
    return u.href;
  } catch {
    return '';
  }
}

/** An Apple Music link (the briefing's music suggestion): music.apple.com over https only. */
export function appleMusicUrl(v) {
  const u = safeUrl(v);
  if (!u) return '';
  const { protocol, hostname } = new URL(u);
  return protocol === 'https:' && (hostname === 'music.apple.com' || hostname === 'itunes.apple.com') ? u : '';
}

/** Coordinates as the Core stores them: 2 decimals (about 1 km), never more. */
export function roundCoord(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** "$0.42", "$3.10", "$50" (whole dollars at $10 and above when exact). */
export function formatUsd(v) {
  const n = num(v);
  if (n === null || n < 0) return '—';
  if (n >= 10 && Math.abs(n - Math.round(n)) < 0.005) return `$${Math.round(n)}`;
  return `$${n.toFixed(2)}`;
}

/** The name this device gives itself to the Core ("iPhone", "Mac", …). */
export function deviceLabel(os) {
  switch (os) {
    case 'ios':
      return 'iPhone';
    case 'ipados':
      return 'iPad';
    case 'mac':
      return 'Mac';
    case 'windows':
      return 'Windows PC';
    case 'android':
      return 'Android phone';
    default:
      return 'Browser';
  }
}

// ---- views of the Core's answers ------------------------------------------------------------------

/** The key's hint ("…Ab3D"): a few characters only. Anything longer is never shown (it isn't a hint). */
function keyHint(v) {
  const s = str(v, 16);
  return /^…?[A-Za-z0-9_-]{2,6}$/.test(s) ? (s.startsWith('…') ? s : `…${s}`) : '';
}

/**
 * GET api/brain -> { version, key, sdk, limits, spend, push, briefing, jobs, watchers, owner } with
 * every field checked (missing numbers are null, never 0), or null when it isn't a brain answer.
 */
export function brainView(b) {
  if (!isObj(b) || typeof b.version !== 'string' || !isObj(b.limits)) return null;
  const key = isObj(b.key) ? b.key : {};
  const spend = isObj(b.spend) ? b.spend : {};
  const push = isObj(b.push) ? b.push : {};
  const br = isObj(b.briefing) ? b.briefing : {};
  const loc = isObj(br.location) ? br.location : null;
  const lat = loc ? num(loc.lat) : null;
  const lon = loc ? num(loc.lon) : null;
  const vapid = typeof push.vapidPublicKey === 'string' && /^[A-Za-z0-9_-]{40,200}={0,2}$/.test(push.vapidPublicKey) ? push.vapidPublicKey : '';
  return {
    version: str(b.version, 24),
    key: { set: bool(key.set), hint: key.set ? keyHint(key.hint) : '', setAt: timeOf(key.setAt), verified: key.verified === true ? true : key.verified === false ? false : null },
    sdk: !(isObj(b.sdk) && b.sdk.installed === false),
    limits: { dailyUsd: num(b.limits.dailyUsd), monthlyUsd: num(b.limits.monthlyUsd) },
    spend: {
      day: str(spend.day, 10),
      todayUsd: num(spend.todayUsd),
      month: str(spend.month, 7),
      monthUsd: num(spend.monthUsd),
      capReached: spend.capReached === 'daily' || spend.capReached === 'monthly' ? spend.capReached : null,
    },
    push: {
      vapidPublicKey: vapid,
      devices: (Array.isArray(push.devices) ? push.devices : [])
        .filter(isObj)
        .slice(0, 20)
        .map((d) => ({ id: str(d.id, 64), label: str(d.label, 40) || 'A device', addedAt: timeOf(d.addedAt) })),
    },
    briefing: {
      enabled: br.enabled !== false,
      time: typeof br.time === 'string' && /^\d{2}:\d{2}$/.test(br.time) ? br.time : '07:00',
      units: br.units === 'C' ? 'C' : 'F',
      location: loc && (lat !== null || str(loc.label, 80)) ? { label: str(loc.label, 80) || 'Your location', lat, lon } : null,
      lastAt: timeOf(br.lastAt),
      nextAt: timeOf(br.nextAt),
    },
    jobs: { running: num(isObj(b.jobs) ? b.jobs.running : null) || 0, queued: num(isObj(b.jobs) ? b.jobs.queued : null) || 0 },
    watchers: { active: num(isObj(b.watchers) ? b.watchers.active : null) || 0 },
    owner: { name: str(isObj(b.owner) ? b.owner.name : '', 40) },
  };
}

export const JOB_STATUS_WORDS = Object.freeze({
  queued: 'Waiting',
  running: 'Working',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
  blocked: 'Over the limit',
});
const JOB_STATUSES = Object.keys(JOB_STATUS_WORDS);

function sourcesOf(list, max = 40) {
  const out = [];
  const seen = new Set();
  for (const s of Array.isArray(list) ? list : []) {
    if (!isObj(s)) continue;
    const url = safeUrl(s.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: str(s.title, 160) || new URL(url).hostname, url });
    if (out.length >= max) break;
  }
  return out;
}

function errorOf(e) {
  if (!isObj(e)) return null;
  const code = str(e.code, 40);
  const message = str(e.message, 300);
  return code || message ? { code, message } : null;
}

/** A job (GET api/jobs, api/jobs/<id>) -> a checked view, or null. */
export function jobView(job) {
  if (!isObj(job) || typeof job.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(job.id)) return null;
  const status = pick(job.status, JOB_STATUSES, 'queued');
  const r = isObj(job.result) ? job.result : null;
  const prompt = str(job.prompt, JOB_PROMPT_MAX);
  return {
    id: job.id,
    kind: pick(job.kind, ['research', 'watch-check', 'briefing'], 'research'),
    title: str(job.title, 120) || str(prompt, 80) || 'Research',
    prompt,
    depth: pick(job.depth, JOB_DEPTHS, 'quick'),
    status,
    statusWord: JOB_STATUS_WORDS[status],
    active: status === 'queued' || status === 'running',
    createdAt: timeOf(job.createdAt),
    startedAt: timeOf(job.startedAt),
    finishedAt: timeOf(job.finishedAt),
    costUsd: num(job.costUsd),
    summary: str(job.summary, 300),
    error: errorOf(job.error),
    result: r ? { markdown: typeof r.markdown === 'string' ? r.markdown.slice(0, 200000) : '', sources: sourcesOf(r.sources) } : null,
  };
}

export const WATCH_STATUS_WORDS = Object.freeze({ watching: 'Watching', met: 'It happened', paused: 'Paused', blocked: 'Over the limit' });
const WATCH_STATUSES = Object.keys(WATCH_STATUS_WORDS);

/** A watcher -> a checked view, or null. */
export function watcherView(w) {
  if (!isObj(w) || typeof w.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(w.id)) return null;
  const status = pick(w.status, WATCH_STATUSES, 'watching');
  const lr = isObj(w.lastResult) ? w.lastResult : null;
  return {
    id: w.id,
    what: str(w.what, WATCH_WHAT_MAX) || 'Something',
    every: pick(w.every, WATCH_EVERY, '24h'),
    status,
    statusWord: WATCH_STATUS_WORDS[status],
    createdAt: timeOf(w.createdAt),
    lastCheckAt: timeOf(w.lastCheckAt),
    nextCheckAt: timeOf(w.nextCheckAt),
    lastResult: lr ? { met: lr.met === true, summary: str(lr.summary, 300), sources: sourcesOf(lr.sources, 10) } : null,
    costUsd: num(w.costUsd),
  };
}

/** GET api/briefing (or POST api/briefing/run) -> a checked view, or null. */
export function briefingView(b) {
  if (!isObj(b) || (typeof b.generatedAt !== 'string' && typeof b.date !== 'string')) return null;
  const wx = isObj(b.weather) ? b.weather : null;
  const now = wx && isObj(wx.now) ? wx.now : {};
  const today = wx && isObj(wx.today) ? wx.today : {};
  const hb = isObj(b.homebase) ? b.homebase : null;
  const music = isObj(b.music) ? b.music : null;
  const musicUrl = music ? appleMusicUrl(music.appleMusicUrl) : '';
  const list = (v, max) => (Array.isArray(v) ? v.filter(isObj).slice(0, max) : []);
  return {
    date: typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : '',
    generatedAt: timeOf(b.generatedAt),
    kind: b.kind === 'full' ? 'full' : 'free',
    greeting: str(b.greeting, 120) || 'Good morning.',
    weather: wx
      ? {
          label: str(wx.label, 80),
          units: wx.units === 'C' ? 'C' : 'F',
          temp: num(now.temp),
          now: str(now.summary, 80),
          high: num(today.high),
          low: num(today.low),
          rainChancePct: num(today.rainChancePct),
          summary: str(today.summary, 200),
        }
      : null,
    headlines: list(b.headlines, 8)
      .map((x) => ({ title: str(x.title, 200), source: str(x.source, 60), url: safeUrl(x.url) }))
      .filter((x) => x.title),
    homebase: hb ? { level: pick(hb.level, ['ok', 'warn', 'alert'], 'unknown'), summary: str(hb.summary, 220), notes: (Array.isArray(hb.notes) ? hb.notes : []).map((n) => str(n, 160)).filter(Boolean).slice(0, 6) } : null,
    jobs: list(b.jobs, 10).map((j) => ({ id: typeof j.id === 'string' ? j.id.slice(0, 80) : '', title: str(j.title, 120), status: pick(j.status, JOB_STATUSES, 'done'), summary: str(j.summary, 300) })).filter((j) => j.title || j.summary),
    watchers: list(b.watchers, 10).map((w) => ({ id: typeof w.id === 'string' ? w.id.slice(0, 80) : '', what: str(w.what, WATCH_WHAT_MAX), status: pick(w.status, WATCH_STATUSES, 'watching'), summary: str(w.summary, 300) })).filter((w) => w.what || w.summary),
    whatsNew: list(b.whatsNew, 6).map((x) => ({ title: str(x.title, 120), detail: str(x.detail, 240) })).filter((x) => x.title),
    music: music && (str(music.suggestion, 120) || musicUrl) ? { suggestion: str(music.suggestion, 120), url: musicUrl } : null,
    markdown: typeof b.markdown === 'string' ? b.markdown.slice(0, 20000) : '',
    spoken: str(b.spoken, 2000),
  };
}

/** GET api/spend?days=30 -> { days: [{ day, usd, calls }] (newest first), month: { month, usd } }. */
export function spendDaysView(s) {
  if (!isObj(s)) return { days: [], month: null };
  const days = (Array.isArray(s.days) ? s.days : [])
    .filter(isObj)
    .map((d) => ({ day: typeof d.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.day) ? d.day : '', usd: num(d.usd), calls: num(d.calls) }))
    .filter((d) => d.day && d.usd !== null)
    .sort((a, b) => (a.day < b.day ? 1 : -1))
    .slice(0, 62);
  const m = isObj(s.month) ? s.month : null;
  return { days, month: m ? { month: str(m.month, 7), usd: num(m.usd) } : null };
}

/** The weather in one line: "41°F, partly cloudy · high 52°, low 38° · 20% chance of rain". */
export function weatherLine(w) {
  if (!w) return '';
  const parts = [];
  const unit = `°${w.units === 'C' ? 'C' : 'F'}`;
  if (w.temp !== null) parts.push(`${Math.round(w.temp)}${unit}${w.now ? `, ${w.now.toLowerCase()}` : ''}`);
  else if (w.now) parts.push(w.now);
  if (w.high !== null && w.low !== null) parts.push(`high ${Math.round(w.high)}°, low ${Math.round(w.low)}°`);
  if (w.rainChancePct !== null) parts.push(`${Math.round(w.rainChancePct)}% chance of rain`);
  return parts.join(' · ');
}

/** The local date of `ms` as YYYY-MM-DD. */
export function localDay(ms = Date.now()) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Is this briefing recent enough to show as is ("brief me")? */
export function isFreshBriefing(view, now = Date.now()) {
  return !!view && view.generatedAt > 0 && now - view.generatedAt >= -5 * 60 * 1000 && now - view.generatedAt < FRESH_BRIEFING_MS;
}

/**
 * The morning card: a briefing the owner hasn't seen or dismissed (`seenAt`: the generatedAt of the
 * last one seen), made in the last 14 hours.
 */
export function shouldShowMorning(view, seenAt, now = Date.now()) {
  if (!view || !view.generatedAt) return false;
  if (Number(seenAt) >= view.generatedAt) return false;
  return now - view.generatedAt < MORNING_CARD_MS && view.generatedAt - now < 5 * 60 * 1000;
}

// ---- failures ----------------------------------------------------------------------------------

export const NO_KEY_MESSAGE = 'The home base needs your Claude key for this. Give it the key in Settings → Home base (free features keep working without it).';
export const OLD_CORE_MESSAGE = 'Your home base needs Jarvis Core 1.1 for this. On the Alienware, run jarvis-core update (or wait for it to update itself).';

/**
 * A failed brain request (platform/brain.js) -> { state, message }:
 *   old      the Core answered 404 not_found: Jarvis Core 1.0, before the brain
 *   nokey    409 no_key: research and watchers need the key on the home base
 *   cap      402 spend_cap: today's (or this month's) limit is reached
 *   badkey   400 bad_key: Anthropic refused the key
 *   none     404 none_yet: no briefing yet
 *   rate     429
 *   offline  the home base can't be reached, or the Core is down (the tile's words)
 *   error    anything else
 */
export function brainProblem(f, { limits } = {}) {
  const r = isObj(f) ? f : {};
  const said = str(r.message, 200);
  if (r.kind === 'http' && r.status === 404 && r.code === 'none_yet') return { state: 'none', message: 'No briefing yet. The first one comes at the briefing time; you can make one now.' };
  if (r.kind === 'http' && r.status === 404 && (r.code === 'not_found' || !r.code)) return { state: 'old', message: OLD_CORE_MESSAGE };
  if (r.kind === 'http' && r.status === 409 && r.code === 'no_key') return { state: 'nokey', message: NO_KEY_MESSAGE };
  if (r.kind === 'http' && r.status === 402) {
    const daily = limits && limits.dailyUsd !== null && limits.dailyUsd !== undefined ? ` (${formatUsd(limits.dailyUsd)} a day)` : '';
    return { state: 'cap', message: `The home base has reached its spending limit${daily}, so it won’t start anything new until tomorrow. You can raise the limit in Settings → Home base.` };
  }
  if (r.kind === 'http' && r.status === 400 && r.code === 'bad_key') return { state: 'badkey', message: 'Anthropic didn’t accept that key. Check the key in Settings → API key, then try again.' };
  if (r.kind === 'rate') return { state: 'rate', message: said ? `The home base asked to slow down: ${said}` : 'The home base asked to slow down. Try again in a little while.' };
  if (r.kind === 'unreachable') return { state: 'offline', message: 'Can’t reach the home base. Is Tailscale switched on here, and is the Alienware on?' };
  if (r.kind === 'down') return { state: 'offline', message: 'The Alienware answered, but Jarvis Core isn’t responding. It restarts by itself; if this lasts, run jarvis-core restart on the Alienware.' };
  if (r.kind === 'starting') return { state: 'offline', message: 'The home base is starting up. Try again in a moment.' };
  if (r.kind === 'refused') return { state: 'error', message: `The home base refused the connection${said ? ` (It said: ${said})` : '.'}` };
  if (r.kind === 'unset') return { state: 'unset', message: 'Link your home base first: Settings → Home base.' };
  if (r.kind === 'notcore') return { state: 'error', message: 'The home base gave an answer Jarvis couldn’t read.' };
  // The Core words its other refusals for the owner (a city it couldn't find, a full queue, its
  // Claude software missing): say them as they are.
  if (r.kind === 'http' && said && r.code && r.code !== 'internal' && r.status >= 400 && r.status < 600) return { state: 'said', message: said.replace(/^./, (c) => c.toUpperCase()) };
  const code = num(r.status);
  return { state: 'error', message: `The home base answered with an error${code ? ` (${code})` : ''}${said ? `: ${said}` : '.'}` };
}

// ---- deep links ------------------------------------------------------------------------------

const LINK_ID = /^[A-Za-z0-9_-]{1,80}$/;

/** ?homebase=job:<id> | briefing | watch:<id> -> { kind: 'job' | 'briefing' | 'watch', id? } or null. */
export function parseHomeBaseLink(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v === 'briefing') return { kind: 'briefing' };
  const m = /^(job|watch):(.+)$/.exec(v);
  if (!m || !LINK_ID.test(m[2])) return null;
  return { kind: m[1], id: m[2] };
}

/** The ?homebase= link inside a notification's url (whatever its origin), or ''. */
export function homeBaseLinkOf(url) {
  if (typeof url !== 'string' || !url || url.length > 2048) return '';
  try {
    const u = new URL(url, APP_URL);
    const v = u.searchParams.get('homebase') || '';
    return parseHomeBaseLink(v) ? v : '';
  } catch {
    return '';
  }
}

// ---- chat commands -----------------------------------------------------------------------------

const HOME = "(?:(?:the|my|our) )?(?:home ?base|home-base|jarvis core|alien ?ware)";

/** Light clean-up that keeps the owner's words (case, numbers, "$300") for what they ask about. */
function prep(text) {
  let s = String(text)
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/^(?:(?:hey|ok|okay)[, ]+)?jarvis(?! core\b)[,:]?\s+/i, '');
  s = s.replace(/^(?:please|(?:can|could|would|will) you(?: please)?)[, ]+/i, '');
  s = s.replace(/[\s.!?…]+$/u, '').replace(/,? (?:please|thanks|thank you|jarvis)$/i, '').replace(/[\s.!?…,]+$/u, '');
  return s.trim();
}

/** The words with punctuation dropped, lowercase (for the fixed sentences). */
function flat(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9' -]+/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const RESEARCH_VERB = '(?:research|look into|find out about|find out|dig into|investigate|read up on)';
const BACKGROUND = "(?:in the background|on (?:the |my )?home ?base|on the alien ?ware|overnight|while i(?:'m| am) (?:away|asleep|out|sleeping|at work)|while i sleep)";
const RESEARCH = [
  new RegExp(`^(?:(?:do )?(?:some |a )?(deep|quick) research (?:(?:on|into|about) )?|${RESEARCH_VERB} )(.+?) ${BACKGROUND}$`, 'i'),
  new RegExp(`^${BACKGROUND}[,:]? (?:(?:do )?(?:some |a )?(deep|quick) research (?:(?:on|into|about) )?|${RESEARCH_VERB} )(.+)$`, 'i'),
  new RegExp(`^${HOME}[,:]? (?:(?:do )?(?:some |a )?(deep|quick) research (?:(?:on|into|about) )?|${RESEARCH_VERB} )(.+)$`, 'i'),
  new RegExp(`^(?:have|get|ask|tell|let) ${HOME} (?:to )?(?:(?:do )?(?:some |a )?(deep|quick) research (?:(?:on|into|about) )?|${RESEARCH_VERB} )(.+)$`, 'i'),
];

const WATCH_VERB = '(?:watch for|watch out for|keep an eye out for|keep watch for|keep an eye on|monitor)';
// [pattern, bare]: a bare "tell me when …" (no home base named) must name a change (CHANGE).
const WATCH = [
  [new RegExp(`^(?:${HOME}[,:]? )?${WATCH_VERB} ()(.+)$`, 'i'), false],
  [new RegExp(`^(?:have|get|ask|tell) ${HOME} (?:to )?${WATCH_VERB} ()(.+)$`, 'i'), false],
  [new RegExp(`^${HOME}[,:]? (?:tell|let) me (?:know )?(when|if) (.+)$`, 'i'), false],
  [new RegExp(`^(?:tell|let) me (?:know )?(when|if) (.+)$`, 'i'), true],
];
// "Tell me when …" is a watch only for a change worth waiting for ("drops under $300", "is back in
// stock", "comes out"), not a question ("tell me when the next full moon is").
const CHANGE = /\b(?:drops?|dropped|falls?|goes (?:on sale|down|up|under|below|over|above|back)|gets? (?:cheaper|announced|released)|is (?:back|on sale|available|in stock|announced|released|out|cheaper|under|below|over|above)|are (?:back|on sale|available|in stock|announced|released|out|cheaper|under|below)|comes? (?:out|back)|back in stock|in stock|on sale|under \$?\d|below \$?\d|over \$?\d|above \$?\d|less than|more than|cheaper|launch(?:es)?|ships?|announc(?:es|ed)|releases?|released|reach(?:es)?|hits?|passes|crosses|opens? (?:up|for)|becomes? available|available)\b/i;
const VAGUE = /^(?:it|this|that|them|changes|anything|something|everything|me|you|done|ready|finished)$/i;

const RESULTS = [
  /^(?:whats|what is|what) (?:did|has|have) (?:the |my )?(?:home ?base|jarvis core|alien ?ware) (?:find|found|come up with|turned up|turn up|got|get|learn|learned|dig up|dug up)(?: out)?(?: for me)?(?: so far| yet| overnight| today| last night)?$/,
  /^(?:any |show me |show |get |open |read me )?(?:the |my )?(?:research |background )?(?:results|findings|research) (?:from|on) (?:the |my )?(?:home ?base|jarvis core|alien ?ware)$/,
  /^(?:the |my )?(?:home ?base|jarvis core) (?:results|findings|research|research results)$/,
  /^(?:what did you find|what have you found|any results|anything found|what did it find)(?: in the background| on the home ?base| overnight)$/,
  /^(?:is|are) (?:my |the )?(?:background )?research (?:done|finished|ready)(?: yet)?$/,
  /^(?:show me |show |open |any )?(?:my |the )?background research(?: results)?$/,
  /^(?:show me |show |open |any )?(?:my |the )?research results$/,
];

const BRIEF = [
  /^brief me(?: (?:now|for today|on today|on the day|this morning))?$/,
  /^(?:give me |read me |read |show me |play |run |start |get me |do )?(?:the |my |todays |this mornings |a )?(?:morning |daily |todays )?briefing(?: for today| please)?$/,
  /^(?:whats|what is) (?:in )?(?:my |the |todays )?(?:morning )?briefing$/,
  /^(?:good morning[, ]+)?(?:whats|what is) (?:the|my) morning briefing$/,
];

/**
 * A free, local home base command typed or said in the chat (v7.6), the whole sentence:
 *   { kind: 'research', prompt, depth: 'quick' | 'deep' }   "research X in the background", "home base, research X"
 *   { kind: 'results' }                                     "what did the home base find?"
 *   { kind: 'watch', what }                                 "watch for X", "tell me when X drops under $300"
 *   { kind: 'brief' }                                       "brief me", "morning briefing"
 * or null (anything else goes on as usual). The v7.5 status questions ("how's the home base?") are
 * matchHomeBaseCommand()'s.
 */
export function matchBrainCommand(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > JOB_PROMPT_MAX + 200) return null;
  const s = prep(text);
  if (!s) return null;
  const f = flat(s);
  if (f.length <= 80) {
    if (BRIEF.some((re) => re.test(f))) return { kind: 'brief' };
    if (RESULTS.some((re) => re.test(f))) return { kind: 'results' };
  }
  for (const re of RESEARCH) {
    const m = re.exec(s);
    if (!m) continue;
    let prompt = m[2].trim().replace(/^(?:about|on|into) /i, '');
    let depth = m[1] ? m[1].toLowerCase() : 'quick';
    const deepTail = / (?:in depth|in detail|thoroughly|deeply)$/i;
    if (deepTail.test(prompt)) {
      depth = 'deep';
      prompt = prompt.replace(deepTail, '');
    }
    if (/^(?:deeply|thoroughly) /i.test(prompt)) {
      depth = 'deep';
      prompt = prompt.replace(/^(?:deeply|thoroughly) /i, '');
    }
    prompt = prompt.replace(/[\s,;:]+$/, '').trim();
    if (prompt.length < 3 || VAGUE.test(prompt)) return null;
    return { kind: 'research', prompt: prompt.slice(0, JOB_PROMPT_MAX), depth };
  }
  for (const [re, bare] of WATCH) {
    const m = re.exec(s);
    if (!m) continue;
    const what = m[2].trim().replace(/[\s,;:]+$/, '');
    if (what.length < 4 || VAGUE.test(what) || what.split(' ').length < 2) return null;
    // A bare "tell me when / let me know if …" must name a change worth watching for, and not be a
    // question ("tell me when the next full moon is").
    if (bare && (!CHANGE.test(what) || / (?:is|was|are|will be|happens|happened)$/i.test(what))) return null;
    const lead = m[1] ? `${m[1].toLowerCase() === 'if' ? 'If' : 'When'} ` : '';
    return { kind: 'watch', what: `${lead}${what}`.slice(0, WATCH_WHAT_MAX) };
  }
  return null;
}

// ---- what the chat shows and Jarvis says --------------------------------------------------------

const md = (v) => escapeMarkdown(v);
/** A Markdown link made here, from a checked address (its text escaped, its URL kept to safe characters). */
function mdLink(text, url) {
  const u = safeUrl(url);
  if (!u || /[\s<>()[\]\\]/.test(u)) return md(text);
  return `[${md(text)}](${u})`;
}

/** The briefing as the chat shows it (a local turn): Markdown built here, the Core's words escaped. */
export function briefingMarkdown(v) {
  if (!v) return '';
  const out = [`**${md(v.greeting)}**`];
  const wx = weatherLine(v.weather);
  if (wx) out.push(`${v.weather.label ? `${md(v.weather.label)}: ` : ''}${md(wx)}.${v.weather.summary ? ` ${md(v.weather.summary)}` : ''}`);
  if (v.headlines.length) {
    out.push('**Headlines**');
    out.push(v.headlines.map((x) => `- ${x.url ? mdLink(x.title, x.url) : md(x.title)}${x.source ? ` · ${md(x.source)}` : ''}`).join('\n'));
  }
  if (v.homebase && (v.homebase.summary || v.homebase.notes.length)) {
    out.push(`**Overnight at the home base:** ${md(v.homebase.summary || '')}`.trim());
    if (v.homebase.notes.length) out.push(v.homebase.notes.map((n) => `- ${md(n)}`).join('\n'));
  }
  const done = v.jobs.filter((j) => j.title || j.summary);
  if (done.length) {
    out.push('**Research**');
    out.push(done.map((j) => `- ${md(j.title || 'Research')}${j.summary ? `: ${md(j.summary)}` : ''}`).join('\n'));
  }
  if (v.watchers.length) {
    out.push('**Watching**');
    out.push(v.watchers.map((w) => `- ${md(w.what)}${w.summary ? `: ${md(w.summary)}` : ''}`).join('\n'));
  }
  if (v.whatsNew.length) {
    out.push('**What’s new**');
    out.push(v.whatsNew.map((x) => `- ${md(x.title)}${x.detail ? `: ${md(x.detail)}` : ''}`).join('\n'));
  }
  if (v.music) out.push(`**Music:** ${v.music.url ? mdLink(v.music.suggestion || 'Open in Apple Music', v.music.url) : md(v.music.suggestion)}`);
  return out.join('\n\n');
}

/** What Jarvis says for the briefing (Voice Mode): the Core's own spoken text, else made from it. */
export function briefingSpeech(v) {
  if (!v) return '';
  if (v.spoken) return v.spoken;
  const parts = [v.greeting];
  const w = v.weather;
  if (w && w.temp !== null) parts.push(`It’s ${Math.round(w.temp)} degrees${w.now ? ` and ${w.now.toLowerCase()}` : ''}${w.high !== null ? `, with a high of ${Math.round(w.high)}` : ''}.`);
  if (v.headlines.length) parts.push(`In the news: ${v.headlines.slice(0, 3).map((x) => x.title).join('; ')}.`);
  if (v.homebase && v.homebase.summary) parts.push(`The home base: ${v.homebase.summary}`);
  const done = v.jobs.filter((j) => j.status === 'done');
  if (done.length) parts.push(`${done.length === 1 ? 'One piece of research' : `${done.length} pieces of research`} finished overnight.`);
  const met = v.watchers.filter((x) => x.status === 'met');
  if (met.length) parts.push(`${met.length === 1 ? 'Something you asked me to watch for has happened' : `${met.length} things you asked me to watch for have happened`}.`);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/** "What did the home base find?": the finished research, newest first, as chat Markdown. */
export function resultsMarkdown(jobs, { max = 5 } = {}) {
  const list = (Array.isArray(jobs) ? jobs : []).filter((j) => j && j.kind === 'research');
  const active = list.filter((j) => j.active);
  const done = list.filter((j) => j.status === 'done').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const out = [];
  if (!done.length) out.push(active.length ? `Nothing has finished yet. ${active.length === 1 ? 'One research job is' : `${active.length} research jobs are`} still going.` : 'The home base hasn’t finished any research yet. Say “research … in the background” to start some.');
  else {
    out.push(`**${done.length === 1 ? 'The home base finished one piece of research' : `The home base finished ${done.length} pieces of research`}**`);
    out.push(done.slice(0, max).map((j) => `- **${md(j.title)}**${j.summary ? `: ${md(j.summary)}` : ''}`).join('\n'));
    if (active.length) out.push(`${active.length === 1 ? 'One more is' : `${active.length} more are`} still going.`);
    out.push('Open Home base → Research to read them.');
  }
  return out.join('\n\n');
}

/** The same, said (Voice Mode). */
export function resultsSpeech(jobs) {
  const list = (Array.isArray(jobs) ? jobs : []).filter((j) => j && j.kind === 'research');
  const done = list.filter((j) => j.status === 'done').sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0));
  const active = list.filter((j) => j.active).length;
  if (!done.length) return active ? 'Nothing has finished yet; the research is still going.' : 'The home base hasn’t finished any research yet.';
  const first = done[0];
  const lead = done.length === 1 ? 'The home base finished one piece of research.' : `The home base finished ${done.length} pieces of research.`;
  return `${lead} The latest: ${first.title}.${first.summary ? ` ${first.summary}` : ''}`.replace(/\s+/g, ' ').trim();
}
