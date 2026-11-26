// Live view (Optics, v8.0): the pure part (no DOM, no network; the clock and the storage are
// injected), shared by the UI and the tests. The request itself is src/engine/live.js.
//
//   LIVE_DEFAULTS          the numbers: Claude Haiku 5.5; 640 px frames at JPEG quality 0.75; one look a
//                          second (one every 5 s from 90 cents on); at most $1 in any 60 minutes;
//                          sessions of at most an hour; a spoken line at most every 15 s; the last 5
//                          lines kept; back-off from 2 s, doubling up to 30 s
//   createLiveBudget       the $1-an-hour limit over a rolling 60 minutes, kept in localStorage so a
//                          reload or a second window can't reset it, shared by every tab and window
//   estimateLiveLookUsd    about what one look costs, before it is sent
//   nextLiveDelay          when the next look may start
//   liveBackoff            how long to wait after a 429 or 529 (or a network or server error)
//   canSpeakLive           whether a worth-saying line may be spoken now
//   liveMeterText          "LIVE VIEW · 12 min · 9¢ this hour · limit $1"
//   liveSpentText          the hour's spending as the meter shows it ("9¢", "$1.00" from 99.5¢)
//   liveResumeShownAt      the time to name in "It can go on at 2:41 PM" (rounded up to the minute)

import { priceOf } from '../engine/models.js';
import { formatUsd, imageTokens } from './optics.js';

export const LIVE_DEFAULTS = Object.freeze({
  model: 'claude-haiku-5-5',
  maxEdge: 640,
  quality: 0.75,
  intervalMs: 1000,
  slowIntervalMs: 5000,
  slowFromUsd: 0.9,
  capUsd: 1,
  windowMs: 3600000,
  sessionMs: 3600000,
  speakGapMs: 15000,
  saidKept: 5,
  backoffStartMs: 2000,
  backoffMaxMs: 30000,
});

/** The localStorage key of the hour's spending (shared by every Jarvis tab and window). */
export const LIVE_SPEND_KEY = 'jarvis.liveView.spend';

/** A retry-after longer than this (a bogus header or a far date) is not waited for in full. */
export const LIVE_RETRY_AFTER_MAX_MS = 10 * 60 * 1000;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// ---------------------------------------------------------------------------------------------
// The budget: what Live view spent in the last 60 minutes (its looks, and the Looks asked during it)

// Money is counted in whole nano-dollars, so sums are exact whatever their order: canSpend() and
// resumeAt() always agree, and $0.10 ten times is exactly the $1 cap.
const NANO = 1e9;
const MAX_ENTRY_USD = 1000; // one entry above this is corrupt: counted as $1,000 (still far above any cap)

/** USD (a number, or a numeric string from storage) → whole nano-dollars, rounded up; 0 when not a cost. */
function nanoOf(usd) {
  const v = isNum(usd) ? usd : typeof usd === 'string' && usd.trim() ? Number(usd) : Number.NaN;
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.max(0, Math.ceil(Math.min(v, MAX_ENTRY_USD) * NANO - 1e-6));
}

const timeOf = (t) => (isNum(t) ? t : typeof t === 'string' && t.trim() ? Number(t) : Number.NaN);

/**
 * Entries from the stored JSON: [{ t, usd, id? }] (or { entries: [...] }). Anything that isn't one is
 * skipped, and unreadable JSON reads as no entries, but every entry that can be read counts: a
 * time in the future counts from now (so it still expires; `clamped` says the list should be written
 * back with that time), an amount above $1,000 counts as $1,000, an entry without an id gets one from
 * its content (two budgets reading the same list agree). Returns { list, clamped }.
 */
function parseEntries(raw, now) {
  const none = { list: [], clamped: false };
  if (typeof raw !== 'string' || !raw) return none;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return none;
  }
  const list = Array.isArray(data) ? data : Array.isArray(data?.entries) ? data.entries : [];
  const byId = new Map();
  const seen = new Map();
  let clamped = false;
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const t = timeOf(item.t);
    const nano = nanoOf(item.usd);
    if (!Number.isFinite(t) || nano <= 0) continue;
    let id = typeof item.id === 'string' && item.id ? item.id.slice(0, 64) : '';
    if (!id) {
      const base = `~${t}:${nano}`;
      const k = seen.get(base) || 0;
      seen.set(base, k + 1);
      id = `${base}:${k}`;
    }
    if (t > now) clamped = true;
    const entry = { id, t: Math.min(t, now), nano };
    const cur = byId.get(id);
    if (!cur || entry.nano > cur.nano || (entry.nano === cur.nano && entry.t > cur.t)) byId.set(id, entry);
  }
  return { list: [...byId.values()], clamped };
}

function defaultStorage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' && typeof s.setItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

const randomTag = () => Math.random().toString(36).slice(2, 8).padEnd(6, '0');

/**
 * The hour's spending, over a rolling `windowMs`, kept in `storage` (localStorage) under `key`.
 *
 *   spent()          USD spent in the window now (every tab's spending: re-read from storage)
 *   canSpend(usd)    whether spending `usd` more now keeps the window at or under `capUsd`
 *   add(usd)         records `usd` spent now (real money, so always recorded, even above the cap);
 *                    returns spent()
 *   resumeAt(usd)    the time (ms, the injected clock's) from which canSpend(usd) is true if nothing
 *                    more is spent: now when it already is, Infinity when `usd` alone is above the cap
 *   reload()         re-reads storage now (call it on the window's `storage` event for `key`, or a
 *                    BroadcastChannel message) and writes back any of this budget's spending that
 *                    another tab's write dropped; returns spent()
 *
 * Every method reads storage first, so a reload, a second budget or another tab sees the same
 * spending. Entries are [{ t, usd, id }] pruned to the window; this budget's adds within
 * `coalesceMs` of each other share one entry (time: the latest add), which keeps the list short
 * (about 360 entries for an hour at a look a second) and only ever counts spending a little longer.
 * Without storage (or when it throws) the budget still works, for this page only.
 */
export function createLiveBudget({ capUsd = LIVE_DEFAULTS.capUsd, windowMs = LIVE_DEFAULTS.windowMs, now = Date.now, storage = defaultStorage(), key = LIVE_SPEND_KEY, coalesceMs } = {}) {
  const cap = isNum(capUsd) && capUsd >= 0 ? capUsd : LIVE_DEFAULTS.capUsd;
  const capNano = Math.floor(Math.min(cap, MAX_ENTRY_USD) * NANO + 1e-6);
  const win = isNum(windowMs) && windowMs > 0 ? windowMs : LIVE_DEFAULTS.windowMs;
  const bucketMs = isNum(coalesceMs) && coalesceMs >= 0 ? coalesceMs : Math.min(10_000, Math.floor(win / 360));
  const clock = typeof now === 'function' ? now : Date.now;
  const store = storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function' ? storage : null;
  const instance = randomTag();
  let seq = 0;

  const entries = new Map(); // id → { id, t, nano }: everything this budget knows of (its own and others')
  let lastRaw; // the string last read from or written to storage (undefined: never)
  let stored = new Map(); // id → { t, nano }: the entries as storage holds them (as of lastRaw)
  let open = null; // { id, startedAt }: this budget's newest entry, which adds within bucketMs join

  const time = () => {
    const v = Number(clock());
    return Number.isFinite(v) ? v : Date.now();
  };

  function read() {
    if (!store) return undefined;
    try {
      const v = store.getItem(key);
      return typeof v === 'string' ? v : null;
    } catch {
      return undefined;
    }
  }

  function write() {
    if (!store) return;
    const list = [...entries.values()].sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    const json = JSON.stringify(list.map((e) => ({ t: e.t, usd: e.nano / NANO, id: e.id })));
    try {
      store.setItem(key, json);
      lastRaw = json;
      stored = new Map(list.map((e) => [e.id, { t: e.t, nano: e.nano }]));
    } catch {
      /* quota or blocked storage: kept in memory, written again with the next add or reload */
    }
  }

  function merge(e) {
    const cur = entries.get(e.id);
    if (!cur || e.nano > cur.nano || (e.nano === cur.nano && e.t > cur.t)) entries.set(e.id, { ...e });
  }

  function prune(t) {
    for (const [id, e] of entries) if (t - e.t >= win) entries.delete(id);
  }

  function missingFromStorage() {
    for (const e of entries.values()) {
      const s = stored.get(e.id);
      if (!s || s.nano < e.nano || (s.nano === e.nano && s.t < e.t)) return true;
    }
    return false;
  }

  // Reads storage when it changed (always with `force`). Writes only to repair: a time from the
  // future it counted from now (any read), or this budget's spending missing there (`repair`).
  function sync(t, { force = false, repair = false } = {}) {
    const raw = read();
    let clamped = false;
    if (raw !== undefined && (force || raw !== lastRaw)) {
      lastRaw = raw;
      const incoming = parseEntries(raw, t);
      stored = new Map(incoming.list.map((e) => [e.id, { t: e.t, nano: e.nano }]));
      for (const e of incoming.list) merge(e);
      clamped = incoming.clamped;
    }
    prune(t);
    if (raw !== undefined && (clamped || (repair && missingFromStorage()))) write();
  }

  function spentNano(t) {
    let sum = 0;
    for (const e of entries.values()) if (t - e.t < win) sum += e.nano;
    return sum;
  }

  return {
    key,
    capUsd: cap,
    windowMs: win,
    spent() {
      const t = time();
      sync(t);
      return spentNano(t) / NANO;
    },
    canSpend(usd) {
      const t = time();
      sync(t);
      return spentNano(t) + nanoOf(usd) <= capNano;
    },
    add(usd) {
      const t = time();
      sync(t);
      const nano = nanoOf(usd);
      if (nano > 0) {
        const cur = open ? entries.get(open.id) : null;
        if (cur && t - open.startedAt < bucketMs && t >= cur.t) {
          cur.nano += nano;
          cur.t = t;
        } else {
          seq += 1;
          const id = `${instance}.${seq}`;
          entries.set(id, { id, t, nano });
          open = { id, startedAt: t };
        }
        write();
      } else if (missingFromStorage()) {
        write();
      }
      return spentNano(t) / NANO;
    },
    resumeAt(usd) {
      const t = time();
      sync(t);
      const need = nanoOf(usd);
      if (need > capNano) return Infinity;
      let remaining = spentNano(t);
      if (remaining + need <= capNano) return t;
      const live = [...entries.values()].filter((e) => t - e.t < win).sort((a, b) => a.t - b.t);
      for (const e of live) {
        remaining -= e.nano;
        if (remaining + need <= capNano) return e.t + win;
      }
      return Infinity;
    },
    reload() {
      const t = time();
      sync(t, { force: true, repair: true });
      return spentNano(t) / NANO;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// About what one look costs

/**
 * Characters of text every look sends besides the summary and the lines: the system prompt (about
 * 1,200), the JSON schema (about 400) and the request's own words (about 90). The tests check it
 * against src/engine/live.js.
 */
export const LIVE_PROMPT_CHARS = 1800;
const CHARS_PER_TOKEN = 3; // Claude Haiku 5.5's tokenizer counts text about 30% higher than ~4 characters a token
const MESSAGE_TOKENS = 10;
const REPLY_TOKENS = 100; // a full reply: a summary of up to 160 characters, a line of up to 120, the JSON keys

const count = (v) => (isNum(v) && v > 0 ? v : 0);

/**
 * USD for one look before it is sent: the frame (about one token per 28 × 28 pixels: 299 at
 * 640 × 360), the prompt, the summary and the lines said (`summaryChars`, `saidChars`), and a full
 * reply; nothing is cached, thinking is off. About 0.014¢ on Claude Haiku 5.5 (about 51¢ for an
 * hour at a look a second; real looks usually cost less, about 30-50¢ an hour). An unknown model is
 * priced as Claude Opus 5.5.
 */
export function estimateLiveLookUsd({ model = LIVE_DEFAULTS.model, width = 640, height = 360, summaryChars = 0, saidChars = 0 } = {}) {
  const p = priceOf(model);
  const text = Math.ceil((LIVE_PROMPT_CHARS + count(summaryChars) + count(saidChars)) / CHARS_PER_TOKEN);
  const input = text + imageTokens(width, height) + MESSAGE_TOKENS;
  return (input * p.inPerM + REPLY_TOKENS * p.outPerM) / 1e6;
}

// ---------------------------------------------------------------------------------------------
// Cadence, back-off, speaking, the meter

/**
 * Milliseconds until the next look may start (0: now). One look in flight at a time: the next
 * starts `intervalMs` after the previous one started, or as soon as it returned if it took longer;
 * from `slowFromUsd` spent in the hour on, `slowIntervalMs` instead; never before `backoffUntil`
 * (after a 429/529). `lastStartAt` null (no look yet) means now. Times are the caller's clock (ms).
 * A clock that went back counts the last look as started now, and no wait is ever longer than
 * LIVE_RETRY_AFTER_MAX_MS (or the interval, if longer).
 */
export function nextLiveDelay({
  lastStartAt,
  now,
  spentUsd = 0,
  backoffUntil = 0,
  intervalMs = LIVE_DEFAULTS.intervalMs,
  slowIntervalMs = LIVE_DEFAULTS.slowIntervalMs,
  slowFromUsd = LIVE_DEFAULTS.slowFromUsd,
} = {}) {
  const t = isNum(now) ? now : Date.now();
  const gap = isNum(spentUsd) && spentUsd >= slowFromUsd ? slowIntervalMs : intervalMs;
  let at = t;
  if (isNum(lastStartAt)) at = Math.max(at, Math.min(lastStartAt, t) + gap);
  if (isNum(backoffUntil)) at = Math.max(at, backoffUntil);
  return Math.min(Math.max(0, Math.ceil(at - t)), Math.max(gap, LIVE_RETRY_AFTER_MAX_MS));
}

/**
 * Milliseconds to wait after a 429 or 529: the API's retry-after when it gave one (capped at 10
 * minutes), else `backoffStartMs` (2 s) the first time and double the previous wait after that, up
 * to `backoffMaxMs` (30 s). `prevMs`: the previous wait of this run of errors (0 or null: none).
 */
export function liveBackoff(prevMs, retryAfterMs, { backoffStartMs = LIVE_DEFAULTS.backoffStartMs, backoffMaxMs = LIVE_DEFAULTS.backoffMaxMs } = {}) {
  if (isNum(retryAfterMs) && retryAfterMs >= 0) return Math.min(Math.ceil(retryAfterMs), LIVE_RETRY_AFTER_MAX_MS);
  if (!isNum(prevMs) || prevMs <= 0) return backoffStartMs;
  return Math.max(backoffStartMs, Math.min(prevMs * 2, backoffMaxMs));
}

/**
 * Whether a worth-saying line may be spoken now: never while the owner is talking or Jarvis is
 * already speaking, and at most one spoken line every `speakGapMs` (15 s). (Whether Jarvis may speak
 * at all, Voice Mode open or replies read aloud, is the caller's to check.) A clock that went back
 * does not hold speech up.
 */
export function canSpeakLive({ lastSpokenAt, now, ownerSpeaking = false, jarvisSpeaking = false, speakGapMs = LIVE_DEFAULTS.speakGapMs } = {}) {
  if (ownerSpeaking || jarvisSpeaking) return false;
  if (!isNum(lastSpokenAt)) return true;
  const since = (isNum(now) ? now : Date.now()) - lastSpokenAt;
  return since < 0 || since >= speakGapMs;
}

/** "$1" for whole dollars, else as formatUsd ("50¢", "$2.50"). */
function capText(usd) {
  if (isNum(usd) && usd >= 1 && Number.isInteger(usd)) return `$${usd}`;
  return formatUsd(usd);
}

/**
 * The hour's spending as the meter shows it: formatUsd, except that from 99.5¢ to $1 it reads
 * "$1.00" (formatUsd rounds to whole cents there and would show "100¢" next to "limit $1", just
 * when the live view pauses at the limit).
 */
export function liveSpentText(usd) {
  if (isNum(usd) && usd >= 0.995 && usd < 1) return '$1.00';
  return formatUsd(usd);
}

/** The meter shown while Live view is on: "LIVE VIEW · 12 min · 9¢ this hour · limit $1". */
export function liveMeterText({ elapsedMs = 0, spentUsd = 0, capUsd = LIVE_DEFAULTS.capUsd } = {}) {
  const minutes = isNum(elapsedMs) && elapsedMs > 0 ? Math.floor(elapsedMs / 60000) : 0;
  return `LIVE VIEW · ${minutes} min · ${liveSpentText(spentUsd)} this hour · limit ${capText(capUsd)}`;
}

/**
 * The time to name in "Live view paused: … It can go on at 2:41 PM." for a `resumeAt(usd)` result:
 * rounded UP to the whole minute, because a clock shows minutes (2:41:30 would read "2:41" while
 * Resume still waits 30 s); so Resume always works at the minute named. Infinity, NaN and other
 * junk come back unchanged (the caller then names no time).
 */
export function liveResumeShownAt(at) {
  return isNum(at) ? Math.ceil(at / 60000) * 60000 : at;
}
