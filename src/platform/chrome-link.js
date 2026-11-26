// Jarvis for Chrome, linked through the home base (v8.1, SPEC §32.1, wire v1). This makes app.chromeLink
// (contract (f)), which "pull this up in Chrome" (windows) and Chrome tasks and prompts by voice (chrome-voice) use.
//
// The web app (the owner's usual Chrome profile) and Jarvis for Chrome (its own "Jarvis" profile) can't talk
// directly, so they leave sealed messages for each other on the home base (Jarvis Core 1.3, /api/relay/*;
// src/lib/relay-envelope.js seals and opens them). Linking: Settings → Jarvis for Chrome → Link makes a key here
// (32 random bytes); the owner copies the link code ({ v: 1, core, key }) and pastes it into Jarvis for Chrome;
// its first message proves it has the key, and the link is made. The key lives only in localStorage
// `jarvis.chromeLink.v1` ({ v: 1, core, key, linkedAt, extSeenAt, madeAt }): never in Settings, an export, a
// backup or a sync upload (none of them reads that entry), so it never reaches the home base that carries the
// messages. `jarvis.chromeLink.inbox.v1` keeps where this device has read up to and the last 500 ids it opened
// (no secret: the relay sees both), so a reload never takes a message twice.
//
//   const link = createChromeLink({ getHomeBase, version, ... })   (installChromeLink in app.js)
//   link.api = app.chromeLink, exactly contract (f):
//     state() → { linked, online, voiceApprovals, task: null | { id, status, text, narration, lastStep, costUsd, limitUsd },
//                 budgetUsd?, maxSteps? }   (the extension's task budget and step limit, once its hello or status said them:
//                                           MONEY-3, so the check says what will be enforced)
//     subscribe(fn) → unsubscribe                     fn(state()) after each change
//     open(url, { rect, focus }) → Promise<{ ok: true, site } | { ok: false, reason, why? }>
//     startTask({ text, chat, limitUsd? }) → Promise<{ ok: true, id } | { ok: false, reason: 'unlinked'|'offline'|'off'|'busy'|'cap'|… }>
//                                                      limitUsd: the budget the owner heard; the extension keeps the task
//                                                      within it, never above its own (MONEY-3)
//     stopTask() → Promise<{ ok: true } | { ok: false, reason: 'unlinked' | 'offline' }>
//                                                      sent whenever linked (stopping is the safe direction), and
//                                                      sent again until Jarvis for Chrome confirms it (REDTEAM-LINK-1)
//     answer({ promptId, hash, choice, via }) → Promise<{ ok: true } | { ok: false, reason, why? }>
//     onPrompt(fn) · onPromptClosed(fn /* promptId, { how } */) · onDone(fn /* { id, status, answer, costUsd } */) → unsubscribe
//   link.control: what Settings → Jarvis for Chrome needs (info(), onChange(fn), begin(), code(), copyCode(),
//     cancel(), unlink(), refresh()); link.destroy().
//
// Where it runs: on computers only (never on an iPhone), while Jarvis is open (hidden too: hands-free on the Mac).
// One window per device holds the link (the Web Lock `jarvis-chrome-link`, critique M6): only it long-polls
// to-app (a 20-second wait; backing off from 2 s to a minute while the home base is unreachable, and 5 minutes on
// a Core older than 1.3), checks /api/relay/status every 30 s, says hello when it starts, and passes prompts,
// task news and results to its listeners, so one window speaks each prompt. Any window can send; the holder
// hands replies meant for another window over BroadcastChannel `jarvis-chrome-link`, with the task and online
// state.
//
// Every request carries an id; the extension answers it with one `reply` whose `re` is that id. A request gets
// no reply after 10 s → { ok: false, reason: 'offline' }. A stop is different (REDTEAM-LINK-1): one is pending at a
// time, sent again (a fresh envelope each time) after 2, 2, 4, 8, 15, then every 30 s until Jarvis for Chrome
// confirms it (its reply, ok or 'gone'; a `done` for the task; a status or task news showing the task no longer
// runs), for up to 2 minutes; stopTask() resolves when it is confirmed, or 'offline' after those 2 minutes.
// Fresh requests only (wire-v1, decision D5): Jarvis for Chrome refuses an open, start or answer more than 8 s old;
// if an `ok` still comes back for a start this app gave up on, it stops that task (sent again until confirmed) and
// tells the owner once the stop is confirmed ("Chrome started late, so I stopped it.", or after 10 s unconfirmed
// that it couldn't be stopped); a late ok for an open or an answer is only noted. The extension counts as online while /api/relay/status
// says it read its box in the last 60 s, or a message from it arrived in the last 60 s. Nothing is sent while
// it is offline, except stop. Everything that comes back is information, never orders: each field is checked
// and cut to size here (page text included), and nothing in it starts anything.
//
// Nothing here logs; no error carries the key, a code or a message body.

import { readItem, writeItem, removeItem, watchItem } from './storage.js';
import { requestHomeBase } from './homebase.js';
import { isIOS, isAndroid } from './env.js';
import { normalizeHomeBaseUrl } from '../lib/homebase.js';
import { importLinkKey, newLinkKey, sealEnvelope, openEnvelope, createSeenIds, makeLinkCode, isLinkKey, isCoreOrigin, ID_CHARS, ID_BYTES, b64url } from '../lib/relay-envelope.js';

export const CHROME_LINK_KEY = 'jarvis.chromeLink.v1';
export const CHROME_LINK_INBOX_KEY = 'jarvis.chromeLink.inbox.v1';
// Starts this device sent and hasn't had an answer to, and the voice tasks it knows it started (MISSED-LINK-A):
// { v: 1, starts: [{ env, sentAt, gaveUpAt, until, win }], known: [taskId] }. Nothing secret (envelope ids and task
// ids, which the relay or the status show anyway). localStorage, so every window of this device and a reloaded one
// see it: the window that holds the link reads the late answer or the task's news, and the window that gave up may
// be gone.
export const CHROME_LINK_STARTS_KEY = 'jarvis.chromeLink.starts.v1';
export const CHROME_LINK_LOCK = 'jarvis-chrome-link';
export const CHROME_LINK_CHANNEL = 'jarvis-chrome-link';
export const REPLY_TIMEOUT_MS = 10_000;
export const ONLINE_MS = 60_000;
export const POLL_WAIT_S = 20;
export const STATUS_EVERY_MS = 30_000;
export const PENDING_MS = 30 * 60_000; // an unused link code is forgotten after half an hour
// The code is cleared from the clipboard once linked, if this tab copied it during its life (PENDING_MS), and only if
// the clipboard still holds it (REDTEAM-LINK-4, PRIVACY-6). The tab's sessionStorage keeps that it was copied (a hash
// of the code, never the code), so a reload while the owner sets up Jarvis for Chrome doesn't forget it.
export const CHROME_LINK_COPIED_KEY = 'jarvis.chromeLink.copied.v1';
export const BACKOFF_MS = Object.freeze([2_000, 4_000, 8_000, 15_000, 30_000, 60_000]);
export const OLD_CORE_RETRY_MS = 5 * 60_000;
export const TEXT_MAX = 2000; // a task's words, and what comes back about it
export const REPLY_REASONS = Object.freeze(['off', 'busy', 'cap', 'blocked', 'needs-click', 'refused', 'gone', 'bad']);
export const LATE_WATCH_MS = 2 * 60_000; // a reply can still come while the relay holds the request (D5)
// The code works once (REDTEAM-LINK-4): on the first message sealed with the code's key, a new key replaces it, sent
// to Jarvis for Chrome in a `rekey` sealed with the code's key and sent again until confirmed by a message under the
// new key (then the code's key is forgotten here). Until then this side still opens messages under the code's key
// (at most PENDING_MS after the rekey) and seals with it for REKEY_GRACE_MS (Jarvis for Chrome takes it that long
// after it switched), or while Jarvis for Chrome is still heard using it.
export const REKEY_GRACE_MS = 10 * 60_000;
export const REKEY_RESEND_MS = Object.freeze([3_000, 6_000, 12_000, 30_000]);
const PREV_HEARD_MS = 2 * 60_000; // Jarvis for Chrome used the code's key this recently: it hasn't switched
export const LATE_START_LINE = 'Chrome started late, so I stopped it.';
// Stop (REDTEAM-LINK-1): one pending stop at a time, sent again (a fresh envelope each time) until Jarvis for
// Chrome confirms it: its reply (ok, or 'gone': nothing runs), a `done` for the task, or a status or task news
// showing that task no longer runs. After STOP_FOR_MS unconfirmed it gives up. The owner is told after
// STOP_CONFIRM_MS without a confirmation (chrome-voice for a spoken stop; this file for D5's late start).
export const STOP_RESEND_MS = Object.freeze([2_000, 2_000, 4_000, 8_000, 15_000, 30_000]);
export const STOP_FOR_MS = 2 * 60_000; // the relay keeps a message 2 minutes: so long a stop is worth sending
export const STOP_CONFIRM_MS = 10_000;
export const LATE_START_UNCONFIRMED = Object.freeze({
  line: 'Chrome started a task late, and I couldn’t reach it to stop it. Press Stop in its side panel, or Command-Shift-Period.',
  show: 'Chrome started a task late, and I couldn’t reach it to stop it. Press Stop in its side panel, or ⌘⇧. in Chrome.',
});
const OVER_STATUSES = new Set(['done', 'stopped', 'failed', 'limit', 'error', 'interrupted']);
const MIN_POLL_MS = 1500; // an answer that came back at once with nothing in it is not asked again sooner
const AFTER_BATCH_MS = 250; // a little time for more of the same burst before the next read
const READ_MAX_CHARS = 2 * 1024 * 1024; // 50 messages of up to 22 KB
const SEEN_SAVE_MS = 15_000; // extSeenAt in the stored record: at most this often (other windows read it)

const ID_RE = new RegExp(`^[A-Za-z0-9_-]{${ID_CHARS}}$`);
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const WORD_RE = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/; // kinds, categories, statuses and choice ids
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const posInt = (v) => (Number.isSafeInteger(v) && v > 0 ? v : null);
const money = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e6 ? Math.round(v * 10000) / 10000 : null);

// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

/** Text from the extension (page text included): no control or bidi characters, at most `max` characters. */
export function cleanText(value, max, { lines = false } = {}) {
  if (typeof value !== 'string') return '';
  let s = value.replace(CONTROL_RE, ' ');
  s = lines ? s.replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (s.length > max) s = `${Array.from(s).slice(0, max - 1).join('').trimEnd()}…`;
  return s;
}

const token = (v, re = TOKEN_RE) => (typeof v === 'string' && re.test(v) ? v : '');

/** A reply from the extension, checked: { re, ok, reason?, why?, url?, site?, id?, promptId?, status? }. */
export function cleanReply(body) {
  if (!isObj(body) || !ID_RE.test(body.re || '') || typeof body.ok !== 'boolean') return null;
  const out = { re: body.re, ok: body.ok };
  if (!body.ok) {
    out.reason = REPLY_REASONS.includes(body.reason) ? body.reason : 'bad';
    const why = cleanText(body.why, 200);
    if (why) out.why = why;
    return out;
  }
  const url = cleanText(body.url, 2048);
  if (url) out.url = url;
  const site = cleanText(body.site, 253);
  if (site) out.site = site;
  const id = token(body.id);
  if (id) out.id = id;
  const promptId = token(body.promptId);
  if (promptId) out.promptId = promptId;
  if (isObj(body.status)) out.status = cleanStatus(body.status);
  return out;
}

/** A task budget the extension reports ($0.05-$50 in its settings), or null. */
const budgetOf = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= 1000 ? Math.round(v * 100) / 100 : null);
const stepsOf = (v) => (Number.isSafeInteger(v) && v > 0 && v <= 10_000 ? v : null);

/** status { online, tasksFromJarvis, voiceApprovals, task: null | { id, status, from? }, budgetUsd?, maxSteps? }. */
export function cleanStatus(body) {
  const b = isObj(body) ? body : {};
  // (`from`: 'voice' for a task from Jarvis, 'panel' for one typed in the side panel; since the review.)
  const t = isObj(b.task) ? { id: token(b.task.id), status: token(b.task.status, WORD_RE), ...(token(b.task.from, WORD_RE) ? { from: token(b.task.from, WORD_RE) } : {}) } : null;
  const out = { online: b.online === true, tasksFromJarvis: b.tasksFromJarvis === true, voiceApprovals: b.voiceApprovals === true, task: t && t.id ? t : null };
  if (budgetOf(b.budgetUsd) !== null) out.budgetUsd = budgetOf(b.budgetUsd);
  if (stepsOf(b.maxSteps) !== null) out.maxSteps = stepsOf(b.maxSteps);
  return out;
}

/** task { id, status, text, narration, lastStep, costUsd, limitUsd } (no pictures). */
export function cleanTask(body) {
  if (!isObj(body)) return null;
  const id = token(body.id);
  if (!id) return null;
  return {
    id,
    status: token(body.status, WORD_RE) || 'running',
    text: cleanText(body.text, TEXT_MAX),
    narration: cleanText(body.narration, TEXT_MAX),
    lastStep: cleanText(body.lastStep, 500),
    costUsd: money(body.costUsd),
    limitUsd: money(body.limitUsd),
  };
}

const DONE_STATUSES = ['done', 'stopped', 'failed', 'limit'];
/** done { id, status, answer (2,000 characters at most), costUsd }. */
export function cleanDone(body) {
  if (!isObj(body)) return null;
  const id = token(body.id);
  if (!id) return null;
  return { id, status: DONE_STATUSES.includes(body.status) ? body.status : 'failed', answer: cleanText(body.answer, TEXT_MAX, { lines: true }), costUsd: money(body.costUsd) };
}

/**
 * prompt { promptId, hash, kind, category, consequential, site, title, spoken, body, address, choices, voice }.
 * Unknown or missing safety fields fall to the safe side: consequential unless it says false, voice not allowed
 * unless it says true (the extension decides again when the answer comes).
 */
export function cleanPrompt(body) {
  if (!isObj(body)) return null;
  const promptId = token(body.promptId);
  const hash = ID_RE.test(body.hash || '') ? body.hash : '';
  const kind = token(body.kind, WORD_RE);
  const choices = (Array.isArray(body.choices) ? body.choices.slice(0, 8) : [])
    .map((c) => (isObj(c) ? { id: token(c.id, WORD_RE), label: cleanText(c.label, 60) } : null))
    .filter((c) => c && c.id && c.label);
  if (!promptId || !hash || !kind || !choices.length) return null;
  const voice = isObj(body.voice) ? body.voice : {};
  return {
    promptId,
    hash,
    kind,
    category: token(body.category, WORD_RE),
    consequential: body.consequential !== false,
    site: cleanText(body.site, 253),
    title: cleanText(body.title, 200),
    spoken: cleanText(body.spoken, 400),
    body: cleanText(body.body, 1000, { lines: true }),
    address: cleanText(body.address, 2048),
    choices,
    voice: { allowed: voice.allowed === true, why: cleanText(voice.why, 200) },
  };
}

/** A page address the extension may be asked to open: http(s), no user name or password, 2,048 characters at most. */
export function cleanOpenUrl(url) {
  if (typeof url !== 'string' || !url || url.length > 2048) return null;
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || !u.hostname) return null;
  return u.href;
}

/** Where the Jarvis window should go: { left, top, width, height } in whole screen pixels, or null. */
export function cleanRect(rect) {
  if (!isObj(rect)) return null;
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) || 0 : null);
  const left = n(rect.left);
  const top = n(rect.top);
  const width = n(rect.width);
  const height = n(rect.height);
  if ([left, top, width, height].some((v) => v === null)) return null;
  if (Math.abs(left) > 100_000 || Math.abs(top) > 100_000 || width < 100 || height < 100 || width > 100_000 || height > 100_000) return null;
  return { left, top, width, height };
}

function readJson(read, key) {
  try {
    const text = read(key);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/**
 * The stored link, checked: { v, core, key, linkedAt, extSeenAt, madeAt, prev, rekeyAt, prevSeenAt } or null. `prev` is
 * the code's key while the new one isn't confirmed yet (REDTEAM-LINK-4), else null.
 */
export function readLinkRecord(read = readItem) {
  const raw = readJson(read, CHROME_LINK_KEY);
  if (!isObj(raw) || raw.v !== 1 || !isCoreOrigin(raw.core) || !isLinkKey(raw.key)) return null;
  const prev = isLinkKey(raw.prev) && raw.prev !== raw.key && posInt(raw.linkedAt) ? raw.prev : null;
  return {
    v: 1,
    core: raw.core,
    key: raw.key,
    linkedAt: posInt(raw.linkedAt),
    extSeenAt: posInt(raw.extSeenAt),
    madeAt: posInt(raw.madeAt),
    prev,
    rekeyAt: prev ? posInt(raw.rekeyAt) : null,
    prevSeenAt: prev ? posInt(raw.prevSeenAt) : null,
  };
}

/** The same link, a rekey apart (REDTEAM-LINK-4): a new key replacing the code's is not a new link. */
export function sameLink(a, b) {
  if (!a || !b || a.core !== b.core) return false;
  return a.key === b.key || (!!b.prev && a.key === b.prev) || (!!a.prev && a.prev === b.key);
}

function defaultComputer() {
  try {
    return !(isIOS() || isAndroid());
  } catch {
    return true;
  }
}

function defaultVersion() {
  try {
    const m = document.querySelector('meta[name="jarvis-version"]');
    const v = m && m.getAttribute('content');
    return v && !v.startsWith('__') ? cleanText(v, 24) : 'dev';
  } catch {
    return 'dev';
  }
}

function defaultChannel() {
  try {
    return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHROME_LINK_CHANNEL) : null;
  } catch {
    return null;
  }
}

function defaultLocks() {
  try {
    const l = globalThis.navigator && globalThis.navigator.locks;
    return l && typeof l.request === 'function' ? l : null;
  } catch {
    return null;
  }
}

/** This tab's sessionStorage (a reload keeps it; other windows have their own), or a memory stand-in. */
function defaultSession() {
  const memory = new Map();
  const store = () => {
    try {
      const s = globalThis.sessionStorage;
      return s && typeof s.getItem === 'function' ? s : null;
    } catch {
      return null;
    }
  };
  return {
    read(k) {
      try {
        const s = store();
        return s ? s.getItem(k) : memory.has(k) ? memory.get(k) : null;
      } catch {
        return memory.has(k) ? memory.get(k) : null;
      }
    },
    write(k, v) {
      try {
        const s = store();
        if (s) s.setItem(k, String(v));
        else memory.set(k, String(v));
      } catch {
        memory.set(k, String(v));
      }
    },
    remove(k) {
      memory.delete(k);
      try {
        store()?.removeItem(k);
      } catch {
        /* ignore */
      }
    },
  };
}

function defaultClipboard() {
  try {
    const c = globalThis.navigator && globalThis.navigator.clipboard;
    return c && typeof c.writeText === 'function' ? c : null;
  } catch {
    return null;
  }
}

const problemOf = (r) => {
  if (r.kind === 'http' && r.status === 404) return 'old-core';
  if (r.kind === 'refused') return 'refused';
  if (r.kind === 'down') return 'down';
  if (r.kind === 'rate') return 'rate';
  if (r.kind === 'unreachable' || r.kind === 'starting') return 'unreachable';
  return 'error';
};

/**
 * createChromeLink(deps) → { api, control, destroy() }. Every dependency can be replaced (tests):
 *   getHomeBase()  this device's home base address (settings.homeBaseUrl: 'https://<host>.ts.net/' or '')
 *   version        this app's version, for hello
 *   storage        { read, write, remove, watch } (platform/storage.js)
 *   fetchImpl, locks (navigator.locks), channel (a BroadcastChannel or null), clipboard ({ writeText })
 *   computer       true on a computer (default: not an iPhone, iPad or Android device)
 *   now, setTimer, clearTimer, random, win (focus events for clearing the clipboard)
 *   notice({ kind, line })  what the owner should hear or see that no request is waiting for: 'late-start' (D5)
 */
export function createChromeLink({
  getHomeBase = () => '',
  version = defaultVersion(),
  storage = { read: readItem, write: writeItem, remove: removeItem, watch: watchItem },
  fetchImpl,
  locks = defaultLocks(),
  channel = defaultChannel(),
  clipboard = defaultClipboard(),
  session = defaultSession(),
  computer = defaultComputer(),
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (t) => clearTimeout(t),
  random = Math.random,
  win = typeof window !== 'undefined' ? window : null,
  notice = () => {},
} = {}) {
  let destroyed = false;
  let record = null; // the stored link (checked)
  let holding = null; // { abort, release } while this window holds the link
  let lockCtl = null; // the lock request in flight or held
  let problem = null; // 'unreachable' | 'down' | 'refused' | 'old-core' | 'rate' | 'error' | null
  let note = null; // 'ext-unlinked' | 'expired' | null: shown once by Settings
  let heard = 0; // the last authenticated message from the extension (ms)
  let statusSeen = 0; // the relay's extSeenAt (ms)
  let savedSeen = 0; // the extSeenAt last written to storage
  let voiceApprovals = false;
  let budget = null; // { budgetUsd, maxSteps } from the extension's hello or status (MONEY-3)
  let task = null;
  let extVersion = '';
  let clearedAt = 0;
  let clipState = null; // 'cleared' | 'unchecked' (it couldn't be read, so it was left) | null
  const cryptoKeys = new Map(); // key text → CryptoKey (the link's key, and the code's while a rekey is unconfirmed)
  let rekeyTimer = null;
  let rekeySends = 0;
  let rekeyLastAt = 0;
  let seen = createSeenIds();
  let cursor = null;
  let onlineTimer = null;
  let pendingTimer = null;
  let pollWake = null; // ends the long poll's back-off early (the home base answered the status again)
  let lastSig = '';
  const pending = new Map(); // envelope id → { kind, resolve }
  const late = new Map(); // envelope id → { kind, until }: opens and answers given up on whose reply may still come (D5)
  const winId = Math.floor(random() * 2 ** 48).toString(36) + Math.floor(Math.random() * 2 ** 30).toString(36); // this window
  const candidates = new Map(); // voice task id → when first seen while one of this window's starts waited (MISSED-LINK-A)
  let lateNoted = 0; // late ok replies to an open or an answer (only noted)
  let stopper = null; // the pending stop (LINK-1): { taskId, ids: Set of envelope ids, rec, started, sends, timer, over, promise, resolve }
  const listeners = new Set();
  const controlListeners = new Set();
  const promptListeners = new Set();
  const closedListeners = new Set();
  const doneListeners = new Set();
  const timers = new Set();

  const later = (fn, ms) => {
    const t = setTimer(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };
  const cancelLater = (t) => {
    if (t === null || t === undefined) return;
    timers.delete(t);
    clearTimer(t);
  };
  const sleep = (ms, ctl) =>
    new Promise((resolve) => {
      const t = later(resolve, ms);
      if (ctl) ctl.abort.signal.addEventListener('abort', () => {
        cancelLater(t);
        resolve();
      }, { once: true });
    });
  const call = (set, ...args) => {
    for (const fn of Array.from(set)) {
      try {
        fn(...args);
      } catch {
        /* a listener's trouble is its own */
      }
    }
  };

  // ---- the stored link --------------------------------------------------------------------------------
  const phaseOf = (rec) => (!rec ? 'off' : rec.linkedAt ? 'linked' : 'pending');
  const phase = () => phaseOf(record);
  const baseOf = (core) => `${core}/`;

  function load() {
    let rec = readLinkRecord(storage.read);
    if (rec && !rec.linkedAt && (!rec.madeAt || now() - rec.madeAt > PENDING_MS)) {
      // An unused link code is forgotten (and the key with it).
      storage.remove(CHROME_LINK_KEY);
      storage.remove(CHROME_LINK_INBOX_KEY);
      rec = null;
      note = 'expired';
    }
    return rec;
  }

  function save(rec) {
    const rotating = rec.prev ? { prev: rec.prev, rekeyAt: rec.rekeyAt, prevSeenAt: rec.prevSeenAt } : {};
    storage.write(CHROME_LINK_KEY, JSON.stringify({ v: 1, core: rec.core, key: rec.key, linkedAt: rec.linkedAt, extSeenAt: rec.extSeenAt, madeAt: rec.madeAt, ...rotating }));
  }

  function loadInbox() {
    const raw = readJson(storage.read, CHROME_LINK_INBOX_KEY);
    const ok = isObj(raw) && record && raw.core === record.core;
    cursor = ok && ID_RE.test(raw.cursor || '') ? raw.cursor : null;
    seen = createSeenIds({ ids: ok && Array.isArray(raw.seen) ? raw.seen : [] });
  }

  function saveInbox() {
    if (!record) return;
    storage.write(CHROME_LINK_INBOX_KEY, JSON.stringify({ core: record.core, cursor, seen: seen.list() }));
  }

  /** Read the stored link again (another window changed it, or this one did). */
  function reload() {
    const before = record;
    record = load();
    const keyChanged = !before || !record || !sameLink(before, record);
    if (keyChanged) {
      cryptoKeys.clear();
      cancelLater(rekeyTimer);
      rekeyTimer = null;
      cursor = null;
      seen = createSeenIds();
      if (holding && record) loadInbox();
      heard = 0;
      statusSeen = 0;
      savedSeen = record ? record.extSeenAt || 0 : 0;
      task = null;
      voiceApprovals = false;
      budget = null;
      extVersion = '';
      for (const [, entry] of Array.from(pending)) entry.resolve({ ok: false, reason: 'unlinked' });
      endStop(stopper, { ok: false, reason: 'unlinked' });
    }
    if (record && record.extSeenAt) savedSeen = Math.max(savedSeen, record.extSeenAt);
    if (record && record.linkedAt && (!before || !before.linkedAt)) maybeClearClipboard();
    // A link code nobody used is forgotten after half an hour, even in a window left open.
    cancelLater(pendingTimer);
    pendingTimer = record && !record.linkedAt ? later(reload, Math.max(1000, record.madeAt + PENDING_MS - now() + 1000)) : null;
    syncLock();
    changed();
  }

  function forget(why = null) {
    storage.remove(CHROME_LINK_KEY);
    storage.remove(CHROME_LINK_INBOX_KEY);
    storage.remove(CHROME_LINK_STARTS_KEY);
    note = why;
    problem = null;
    reload();
  }

  async function keyOf(text) {
    if (cryptoKeys.has(text)) return cryptoKeys.get(text);
    const value = await importLinkKey(text);
    if (cryptoKeys.size > 3) cryptoKeys.clear();
    cryptoKeys.set(text, value);
    return value;
  }

  /**
   * The key a message to Jarvis for Chrome is sealed with (REDTEAM-LINK-4): the link's own, or while the new key
   * isn't confirmed, the code's (Jarvis for Chrome takes it for REKEY_GRACE_MS after it switched, and needs it before).
   */
  function sealKeyText(rec) {
    if (!rec.prev) return rec.key;
    const t = now();
    if (t - (rec.rekeyAt || 0) < REKEY_GRACE_MS) return rec.prev;
    if (rec.prevSeenAt && t - rec.prevSeenAt < PREV_HEARD_MS) return rec.prev;
    return rec.key;
  }

  /** Whether a message under the code's key is still taken (only before the new key is confirmed, half an hour at most). */
  const prevOpen = (rec) => !!rec.prev && now() - (rec.rekeyAt || 0) < PENDING_MS;

  /** Send the new key, sealed with the code's (again until confirmed: on a schedule, and when the old key is heard). */
  function sendRekey({ force = false } = {}) {
    const rec = record;
    if (!rec || !rec.prev || !rec.linkedAt) return Promise.resolve(false);
    const t = now();
    if (!force && t - rekeyLastAt < 2000) return Promise.resolve(false);
    rekeyLastAt = t;
    const sent = tell('rekey', { key: rec.key }, rec, rec.prev);
    cancelLater(rekeyTimer);
    rekeyTimer = null;
    if (holding && t - (rec.rekeyAt || 0) < REKEY_GRACE_MS) {
      const wait = REKEY_RESEND_MS[Math.min(rekeySends, REKEY_RESEND_MS.length - 1)];
      rekeySends += 1;
      rekeyTimer = later(() => sendRekey({ force: true }), wait);
    }
    return sent;
  }

  /** A message under the new key: Jarvis for Chrome has switched. The code's key is forgotten here. */
  function rekeyConfirmed() {
    if (!record || !record.prev) return;
    cryptoKeys.delete(record.prev);
    record = { ...record, prev: null, rekeyAt: null, prevSeenAt: null };
    save(record);
    cancelLater(rekeyTimer);
    rekeyTimer = null;
  }

  // ---- state and changes --------------------------------------------------------------------------------
  /** The newest sign of life from the extension; a time far ahead of this clock is not believed. */
  function seenAt() {
    const t = now();
    let best = 0;
    for (const v of [heard, statusSeen, record ? record.extSeenAt || 0 : 0]) if (v && v - t < ONLINE_MS && v > best) best = v;
    return best;
  }

  const isLinked = () => computer && !destroyed && phase() === 'linked';
  const isOnlineNow = () => isLinked() && now() - seenAt() < ONLINE_MS;

  function state() {
    const linked = isLinked();
    const out = { linked, online: linked && isOnlineNow(), voiceApprovals: linked && voiceApprovals, task: linked && task ? { ...task } : null };
    if (linked && budget) Object.assign(out, budget);
    return out;
  }

  function noteBudget(body) {
    const usd = budgetOf(body && body.budgetUsd);
    if (usd === null) return;
    const steps = stepsOf(body.maxSteps);
    budget = { budgetUsd: usd, ...(steps !== null ? { maxSteps: steps } : budget && budget.maxSteps ? { maxSteps: budget.maxSteps } : {}) };
  }

  function info() {
    return {
      computer,
      phase: computer ? phase() : 'off',
      homeBase: !!homeBaseCore(),
      core: record ? record.core : null,
      linkedAt: record ? record.linkedAt : null,
      online: isOnlineNow(),
      seenAt: seenAt() || null,
      holder: !!holding,
      problem,
      note,
      extVersion,
      late: lateNoted,
      copied: !!readCopied(),
      clearedAt: clearedAt || null,
      clipboard: clipState,
    };
  }

  function changed() {
    cancelLater(onlineTimer);
    onlineTimer = null;
    if (isOnlineNow()) onlineTimer = later(changed, Math.max(50, seenAt() + ONLINE_MS - now() + 50));
    const s = state();
    const sig = JSON.stringify(s);
    if (sig !== lastSig) {
      lastSig = sig;
      call(listeners, s);
    }
    call(controlListeners, info());
  }

  function noteHeard({ viaPrev = false } = {}) {
    heard = now();
    if (record && !record.linkedAt) {
      // The first message sealed with this key: Jarvis for Chrome has the code. Linked. A new key replaces the
      // code's at once, so the code works once (REDTEAM-LINK-4): sent sealed with the code's key, and again until
      // a message under the new one confirms it.
      record = { ...record, key: newLinkKey(), prev: record.key, rekeyAt: heard, prevSeenAt: heard, linkedAt: heard, extSeenAt: heard };
      savedSeen = heard;
      rekeySends = 0;
      save(record);
      maybeClearClipboard();
      sendRekey({ force: true }).finally(() => sendHello()); // the rekey first: it is read before anything else
      return;
    }
    if (record && record.prev) {
      if (!viaPrev) rekeyConfirmed();
      else {
        // Still the code's key: it hasn't switched (the rekey or its answer was lost). Sent again.
        if (heard - (record.prevSeenAt || 0) >= 5000) {
          record = { ...record, prevSeenAt: heard };
          save(record);
        }
        sendRekey();
      }
    }
    if (record && heard - savedSeen >= SEEN_SAVE_MS) {
      record = { ...record, extSeenAt: heard };
      savedSeen = heard;
      save(record);
    }
  }

  function broadcast(message) {
    if (!channel) return;
    try {
      channel.postMessage(message);
    } catch {
      /* closed */
    }
  }

  const shareState = (ev = null) => broadcast({ t: 'state', task, voiceApprovals, heard, extVersion, budget, ...(ev ? { ev } : {}) });

  // ---- what comes in ------------------------------------------------------------------------------------
  function handle(message, { viaPrev = false } = {}) {
    const { kind, body } = message;
    noteHeard({ viaPrev });
    let ev = null; // what this message says about a pending stop (other windows hear it with the state)
    switch (kind) {
      case 'reply': {
        const reply = cleanReply(body);
        if (!reply) break;
        if (stopEvidence({ reply })) break; // this window's stop, confirmed (or refused: sent again)
        const entry = pending.get(reply.re);
        if (entry) {
          if (entry.kind === 'start') resolveStart(reply.re, reply);
          entry.resolve(interpret(entry.kind, reply));
        } else if (!lateReply(reply)) broadcast({ t: 'reply', reply }); // another window's request
        break;
      }
      case 'hello':
        if (body.ext === 'jarvis-for-chrome') {
          extVersion = cleanText(body.version, 24);
          noteBudget(body);
        }
        break;
      case 'status': {
        const s = cleanStatus(body);
        voiceApprovals = s.voiceApprovals;
        noteBudget(s);
        if (!s.task) task = null;
        else if (!task || task.id !== s.task.id) task = { id: s.task.id, status: s.task.status || 'running', text: '', narration: '', lastStep: '', costUsd: null, limitUsd: null };
        else task = { ...task, status: s.task.status || task.status };
        ev = { status: { task: s.task } };
        if (s.task && s.task.from === 'voice') voiceTaskSeen(s.task.id);
        break;
      }
      case 'task': {
        const t = cleanTask(body);
        if (t) {
          task = t;
          ev = { task: { id: t.id, status: t.status } };
          voiceTaskSeen(t.id); // (task news is sent for tasks from Jarvis only)
        }
        break;
      }
      case 'done': {
        const d = cleanDone(body);
        if (!d) break;
        if (task && task.id === d.id) task = null;
        ev = { done: { id: d.id } };
        call(doneListeners, d);
        break;
      }
      case 'prompt': {
        const p = cleanPrompt(body);
        if (p) call(promptListeners, p);
        break;
      }
      case 'prompt-closed': {
        const promptId = token(body.promptId);
        const how = ['clicked', 'voice', 'stopped', 'expired'].includes(body.how) ? body.how : 'clicked';
        if (promptId) call(closedListeners, promptId, { how });
        break;
      }
      case 'unlinked':
        forget('ext-unlinked');
        return;
      default:
        break; // a kind this version doesn't know: nothing
    }
    if (ev) stopEvidence(ev);
    shareState(ev);
    changed();
  }

  async function receive(rec, data) {
    if (!isObj(data) || !Array.isArray(data.messages)) return 0;
    let opened = 0;
    for (const env of data.messages.slice(0, 64)) {
      if (!record || !sameLink(record, rec)) return opened; // unlinked meanwhile
      const cur = record; // (the key may have been replaced by the message before: REDTEAM-LINK-4)
      let r = await openEnvelope(await keyOf(cur.key), env, { box: 'to-app', now: now(), seen });
      let viaPrev = false;
      if (!r.ok && r.reason === 'tag' && prevOpen(cur)) {
        r = await openEnvelope(await keyOf(cur.prev), env, { box: 'to-app', now: now(), seen });
        viaPrev = r.ok;
      }
      if (!r.ok) continue; // dropped, silently
      opened += 1;
      handle(r.message, { viaPrev });
    }
    if (typeof data.last === 'string' && ID_RE.test(data.last)) cursor = data.last;
    saveInbox();
    return opened;
  }

  // ---- what goes out -------------------------------------------------------------------------------------
  function post(rec, envelope, signal) {
    return requestHomeBase(baseOf(rec.core), 'relay/to-ext', { method: 'POST', body: envelope, timeoutMs: REPLY_TIMEOUT_MS, fetchImpl, signal, probe: false });
  }

  async function sealFor(rec, kind, body, keyText = sealKeyText(rec)) {
    return sealEnvelope(await keyOf(keyText), { box: 'to-ext', kind, body, at: now() });
  }

  /** A message that wants no reply (hello, unlinked, rekey). Resolves when the home base took it (or didn't). */
  async function tell(kind, body = {}, rec = record, keyText = undefined) {
    if (!rec) return false;
    try {
      const r = await post(rec, await sealFor(rec, kind, body, keyText));
      return !!r.ok;
    } catch {
      return false;
    }
  }

  function sendHello() {
    if (record && record.linkedAt) tell('hello', { app: 'jarvis', version: cleanText(version, 24) || 'dev' });
  }

  /** A request: one reply whose `re` is its id, or { ok: false, reason: 'offline' } after 10 s. */
  async function request(kind, body, { needOnline = true } = {}) {
    const rec = record;
    if (!isLinked() || !rec) return { ok: false, reason: 'unlinked' };
    if (needOnline && !isOnlineNow()) return { ok: false, reason: 'offline' };
    let envelope;
    try {
      envelope = await sealFor(rec, kind, body);
    } catch {
      return { ok: false, reason: 'bad' };
    }
    return new Promise((resolve) => {
      const entry = {
        kind,
        resolve(value) {
          if (pending.get(envelope.id) !== entry) return;
          pending.delete(envelope.id);
          cancelLater(entry.timer);
          resolve(value);
        },
      };
      // Given up on: its reply may still come (the relay keeps the request for 2 minutes), so it is remembered.
      const giveUp = () => {
        if (pending.get(envelope.id) !== entry) return;
        if (kind === 'start') giveUpStart(envelope.id);
        else gaveUp(envelope.id, kind);
        entry.resolve({ ok: false, reason: 'offline' });
      };
      entry.timer = later(giveUp, REPLY_TIMEOUT_MS);
      pending.set(envelope.id, entry);
      if (kind === 'start') noteStartSent(envelope.id);
      post(rec, envelope).then(
        (r) => {
          if (!r.ok) giveUp();
        },
        () => giveUp(),
      );
    });
  }

  function gaveUp(id, kind) {
    if (kind !== 'start' && kind !== 'open' && kind !== 'answer') return;
    const t = now();
    for (const [k, v] of Array.from(late)) if (v.until <= t) late.delete(k);
    late.set(id, { kind, until: t + LATE_WATCH_MS });
    while (late.size > 64) late.delete(late.keys().next().value);
  }

  /**
   * A reply to a request this window gave up on (D5): true when it was one. A late ok for a start means a task
   * runs that the owner was told never started: it is stopped (sent again until confirmed, LINK-1) and the owner
   * is told once the stop is confirmed. A late ok for an open or an answer is only noted; a late refusal changes
   * nothing.
   */
  function lateReply(reply) {
    if (lateStartReply(reply)) return true;
    const entry = late.get(reply.re);
    if (!entry) return false;
    late.delete(reply.re);
    if (entry.until <= now() || !reply.ok) return true;
    if (entry.kind === 'start') stopLateStart(reply.id || null);
    else lateNoted += 1;
    changed();
    return true;
  }

  // ---- starts whose answer never came (MISSED-LINK-A) -----------------------------------------------------
  // A start's reply can be lost while the task runs: the owner hears it didn't start. So every start is noted (in
  // this device's localStorage, for all its windows); a late ok for it, or news of a task from Jarvis that this
  // device never started, coming after the start was given up, is a late start (D5): stopped, and said once the
  // stop is confirmed. The window that gave up handles it; if it is gone, the window holding the link does.

  function readStarts() {
    const raw = readJson(storage.read, CHROME_LINK_STARTS_KEY);
    const t = now();
    const starts = (isObj(raw) && Array.isArray(raw.starts) ? raw.starts : [])
      .filter((e) => isObj(e) && ID_RE.test(e.env || '') && posInt(e.sentAt))
      .map((e) => {
        const out = { env: e.env, sentAt: e.sentAt, gaveUpAt: posInt(e.gaveUpAt), until: posInt(e.until), win: typeof e.win === 'string' ? e.win : null };
        // Unanswered past its 10 s and never given up: its window went away without a word.
        if (!out.gaveUpAt && t > out.sentAt + REPLY_TIMEOUT_MS + 2000) {
          out.gaveUpAt = out.sentAt + REPLY_TIMEOUT_MS;
          out.until = out.gaveUpAt + LATE_WATCH_MS;
          out.win = null;
        }
        return out;
      })
      .filter((e) => !e.until || e.until > t)
      .slice(-16);
    const known = (isObj(raw) && Array.isArray(raw.known) ? raw.known : []).map((x) => token(x)).filter(Boolean).slice(-20);
    return { starts, known };
  }

  function writeStarts(data) {
    storage.write(CHROME_LINK_STARTS_KEY, JSON.stringify({ v: 1, starts: data.starts.slice(-16), known: data.known.slice(-20) }));
  }

  const isLateEntry = (e, t) => !!e.gaveUpAt && t >= e.gaveUpAt && (!e.until || t < e.until);
  const mayHandle = (e) => e.win === winId || (e.win === null && !!holding);

  function addKnown(data, taskId) {
    if (taskId && !data.known.includes(taskId)) data.known.push(taskId);
    candidates.delete(taskId);
  }

  function noteStartSent(env) {
    const data = readStarts();
    data.starts.push({ env, sentAt: now(), gaveUpAt: null, until: null, win: winId });
    writeStarts(data);
  }

  /** A reply to this window's start came in time: it is no longer waited on (its task, if any, is known). */
  function resolveStart(env, reply) {
    const data = readStarts();
    data.starts = data.starts.filter((e) => e.env !== env);
    if (reply.ok && reply.id) addKnown(data, reply.id);
    writeStarts(data);
  }

  /** This window gave up on its start: a task seen while it waited is that start's, and stopped. */
  function giveUpStart(env) {
    const data = readStarts();
    const e = data.starts.find((x) => x.env === env);
    if (!e) return;
    const t = now();
    e.gaveUpAt = t;
    e.until = t + LATE_WATCH_MS;
    const hit = Array.from(candidates).find(([taskId, seenAt]) => seenAt >= e.sentAt && !data.known.includes(taskId));
    if (!hit) {
      writeStarts(data);
      return;
    }
    claimLate(data, e, hit[0]);
  }

  function claimLate(data, e, taskId) {
    data.starts = data.starts.filter((x) => x.env !== e.env);
    if (taskId && data.known.includes(taskId)) {
      writeStarts(data);
      return;
    }
    addKnown(data, taskId);
    writeStarts(data);
    stopLateStart(taskId || null);
    changed();
  }

  /** A late reply to a start (this window's, or one whose window is gone): true when it was one. */
  function lateStartReply(reply) {
    const data = readStarts();
    const e = data.starts.find((x) => x.env === reply.re);
    if (!e || !mayHandle(e)) return false;
    if (!reply.ok || !isLateEntry(e, now())) {
      // A refusal, or an ok in time for a start whose window went away: nothing runs that the owner wasn't told of.
      data.starts = data.starts.filter((x) => x !== e);
      if (reply.ok && reply.id) addKnown(data, reply.id);
      writeStarts(data);
      return true;
    }
    claimLate(data, e, reply.id || null);
    return true;
  }

  /**
   * News of a task from Jarvis (a `task` message, or a status naming one from voice). One this device never started,
   * after a start was given up, is a late start; while a start waits, it is remembered until that start is answered
   * or given up. With no start waiting anywhere, it is a task this device already knew of.
   */
  function voiceTaskSeen(taskId) {
    if (!taskId) return;
    const data = readStarts();
    if (data.known.includes(taskId)) return;
    const t = now();
    if (!data.starts.length) {
      addKnown(data, taskId);
      writeStarts(data);
      return;
    }
    const e = data.starts.find((x) => isLateEntry(x, t) && mayHandle(x));
    if (e) {
      claimLate(data, e, taskId);
      return;
    }
    if (data.starts.some((x) => x.win === winId && !isLateEntry(x, t)) && !candidates.has(taskId)) candidates.set(taskId, t);
  }

  /** This window is going away: its starts are left to whichever window holds the link. */
  function orphanStarts() {
    let data;
    try {
      data = readStarts();
    } catch {
      return;
    }
    let touched = false;
    for (const e of data.starts) {
      if (e.win !== winId) continue;
      e.win = null;
      if (!e.gaveUpAt) {
        e.gaveUpAt = e.sentAt + REPLY_TIMEOUT_MS;
        e.until = e.gaveUpAt + LATE_WATCH_MS;
      }
      touched = true;
    }
    if (touched) writeStarts(data);
  }

  function tellOwner(n) {
    try {
      notice(n);
    } catch {
      /* the app's own trouble */
    }
  }

  /** A task the owner was told never started: stopped, and the owner told once that is confirmed (D5). */
  function stopLateStart(taskId) {
    let settled = false;
    const warn = later(() => {
      if (!settled) tellOwner({ kind: 'late-start-unconfirmed', ...LATE_START_UNCONFIRMED });
    }, STOP_CONFIRM_MS);
    return stopChrome(taskId).then((r) => {
      settled = true;
      cancelLater(warn);
      if (r.ok) tellOwner({ kind: 'late-start', line: LATE_START_LINE });
      return r;
    });
  }

  // ---- stop: sent again until confirmed (REDTEAM-LINK-1) ----------------------------------------------------

  /**
   * Stop the running task: Promise<{ ok: true } | { ok: false, reason: 'unlinked' | 'offline' }>. One stop is
   * pending at a time; asking again joins it and sends it again now. `taskId`: the task it is for, when known
   * (its done or a status without it confirms the stop).
   */
  function stopChrome(taskId = null) {
    const id = taskId || (task && task.id) || null;
    if (stopper && !stopper.over && record && sameLink(stopper.rec, record)) {
      if (id && !stopper.taskId) stopper.taskId = id;
      sendStop(stopper, { now: true });
      return stopper.promise;
    }
    const rec = record;
    if (!isLinked() || !rec) return Promise.resolve({ ok: false, reason: 'unlinked' });
    const s = { taskId: id, ids: new Set(), rec, started: now(), sends: 0, waited: 0, timer: null, over: false };
    s.promise = new Promise((resolve) => {
      s.resolve = resolve;
    });
    stopper = s;
    sendStop(s);
    return s.promise;
  }

  function sendStop(s, { now: soon = false } = {}) {
    if (s.over) return;
    cancelLater(s.timer);
    s.timer = null;
    const n = s.sends;
    s.sends += 1;
    // A fresh envelope each time (Jarvis for Chrome takes a stop whatever its age within the envelope's 120 s),
    // sealed as the link stands now (a rotated key, REDTEAM-LINK-4).
    const rec = record && sameLink(record, s.rec) ? record : s.rec;
    sealFor(rec, 'stop', {})
      .then((env) => {
        if (s.over) return null;
        s.ids.add(env.id);
        return post(rec, env);
      })
      .catch(() => null);
    // The 2 minutes are counted in the waits between sends (a throttled timer only stretches them).
    const wait = soon ? STOP_RESEND_MS[0] : STOP_RESEND_MS[Math.min(n, STOP_RESEND_MS.length - 1)];
    const left = STOP_FOR_MS - s.waited;
    if (left <= wait) {
      s.timer = later(() => endStop(s, { ok: false, reason: 'offline' }), Math.max(0, left));
      return;
    }
    s.waited += wait;
    s.timer = later(() => sendStop(s), wait);
  }

  function endStop(s, result) {
    if (!s || s.over) return;
    s.over = true;
    cancelLater(s.timer);
    s.timer = null;
    if (stopper === s) stopper = null;
    s.resolve(result);
  }

  /**
   * What came back may confirm the pending stop: its reply (ok, or 'gone': nothing runs), a `done` for its task,
   * a status without its task, or task news saying it is over. ev: { reply } | { done } | { status } | { task }.
   */
  function stopEvidence(ev) {
    const s = stopper;
    if (!s || s.over || !ev) return false;
    if (ev.reply) {
      if (!s.ids.has(ev.reply.re)) return false;
      if (ev.reply.ok || ev.reply.reason === 'gone') endStop(s, { ok: true });
      return true; // (another refusal: sent again on its schedule)
    }
    if (ev.done) {
      if (!s.taskId || ev.done.id === s.taskId) endStop(s, { ok: true });
      return false;
    }
    if (ev.status) {
      const t = ev.status.task;
      if (!t || (s.taskId && t.id !== s.taskId)) endStop(s, { ok: true });
      return false;
    }
    if (ev.task && s.taskId && ev.task.id === s.taskId && OVER_STATUSES.has(ev.task.status)) endStop(s, { ok: true });
    return false;
  }

  function interpret(kind, reply) {
    if (!reply.ok) return { ok: false, reason: reply.reason, ...(reply.why ? { why: reply.why } : {}) };
    if (kind === 'open') {
      let site = reply.site || '';
      if (!site && reply.url) {
        try {
          site = new URL(reply.url).hostname;
        } catch {
          site = '';
        }
      }
      return { ok: true, site };
    }
    if (kind === 'start') return reply.id ? { ok: true, id: reply.id } : { ok: false, reason: 'bad' };
    if (kind === 'ping') {
      if (reply.status) {
        voiceApprovals = reply.status.voiceApprovals;
        noteBudget(reply.status);
      }
      return { ok: true, status: reply.status || null };
    }
    return { ok: true };
  }

  // ---- holding the link: the long poll and the status ------------------------------------------------------
  function backoff(failures, r) {
    if (r && r.kind === 'http' && r.status === 404) return OLD_CORE_RETRY_MS;
    const base = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] || BACKOFF_MS[0];
    return Math.round(base * (0.8 + 0.4 * random()));
  }

  function setProblem(p) {
    if (problem === p) return;
    problem = p;
    changed();
  }

  async function pollLoop(ctl) {
    let failures = 0;
    while (holding === ctl && !destroyed && record) {
      const rec = record;
      const q = [`wait=${POLL_WAIT_S}`];
      if (cursor) q.push(`after=${cursor}`);
      const started = now();
      let r;
      try {
        r = await requestHomeBase(baseOf(rec.core), `relay/to-app?${q.join('&')}`, { timeoutMs: (POLL_WAIT_S + 15) * 1000, fetchImpl, signal: ctl.abort.signal, probe: false, maxChars: READ_MAX_CHARS });
      } catch {
        r = { ok: false, kind: 'unreachable' };
      }
      if (holding !== ctl || destroyed) break;
      if (r.ok) {
        failures = 0;
        setProblem(null);
        let opened = 0;
        try {
          opened = await receive(rec, r.data);
        } catch {
          opened = 0;
        }
        if (opened) await sleep(AFTER_BATCH_MS, ctl);
        else if (now() - started < MIN_POLL_MS) await sleep(MIN_POLL_MS, ctl);
        continue;
      }
      if (r.kind === 'aborted') break;
      failures += 1;
      setProblem(problemOf(r));
      await new Promise((resolve) => {
        pollWake = resolve;
        sleep(backoff(failures, r), ctl).then(resolve);
      });
      pollWake = null;
    }
  }

  async function checkStatus(signal) {
    const rec = record;
    if (!rec) return;
    let r;
    try {
      r = await requestHomeBase(baseOf(rec.core), 'relay/status', { timeoutMs: REPLY_TIMEOUT_MS, fetchImpl, signal, probe: false });
    } catch {
      r = { ok: false, kind: 'unreachable' };
    }
    if (record !== rec || destroyed) return;
    if (!r.ok) {
      if (r.kind !== 'aborted') setProblem(problemOf(r));
      return;
    }
    const ext = posInt(r.data.extSeenAt);
    if (ext && ext > statusSeen) statusSeen = ext;
    if (problem === 'old-core' || problem === 'unreachable' || problem === 'down') problem = null;
    if (pollWake) pollWake(); // the relay answers again (a Core just updated to 1.3, say): read now, not in 5 minutes
    if (record.linkedAt && statusSeen - savedSeen >= SEEN_SAVE_MS && statusSeen - now() < ONLINE_MS) {
      record = { ...record, extSeenAt: Math.min(statusSeen, now()) };
      savedSeen = record.extSeenAt;
      save(record);
    }
    shareState();
    changed();
  }

  async function statusLoop(ctl) {
    while (holding === ctl && !destroyed && record) {
      if (record.linkedAt) await checkStatus(ctl.abort.signal);
      if (holding !== ctl || destroyed) break;
      await sleep(STATUS_EVERY_MS, ctl);
    }
  }

  function hold(ctl) {
    if (lockCtl !== ctl || destroyed) {
      if (ctl.release) ctl.release();
      return;
    }
    holding = ctl;
    loadInbox();
    if (record && record.prev) sendRekey({ force: true }); // a rotation not yet confirmed goes on here
    if (record && record.linkedAt) sendHello();
    pollLoop(ctl);
    statusLoop(ctl);
    changed();
  }

  function wantLock() {
    return computer && !destroyed && !!record;
  }

  function syncLock() {
    if (wantLock()) {
      if (!lockCtl) acquire();
    } else if (lockCtl) {
      release();
    }
  }

  function acquire() {
    const ctl = { abort: new AbortController(), release: null };
    lockCtl = ctl;
    if (!locks) {
      hold(ctl);
      return;
    }
    let request;
    try {
      request = locks.request(CHROME_LINK_LOCK, { signal: ctl.abort.signal }, () =>
        new Promise((resolve) => {
          ctl.release = resolve;
          hold(ctl);
        }),
      );
    } catch {
      hold(ctl);
      return;
    }
    if (request && typeof request.catch === 'function') request.catch(() => {}); // aborted before it was granted
  }

  function release() {
    const ctl = lockCtl;
    lockCtl = null;
    if (!ctl) return;
    if (holding === ctl) holding = null;
    ctl.abort.abort();
    if (ctl.release) ctl.release();
    changed();
  }

  // ---- the clipboard ----------------------------------------------------------------------------------------
  /** What this tab copied: { at, hash } (the hash of the code, never the code), or null. */
  function readCopied() {
    let raw = null;
    try {
      raw = JSON.parse(session.read(CHROME_LINK_COPIED_KEY) || 'null');
    } catch {
      raw = null;
    }
    if (!isObj(raw) || !posInt(raw.at) || typeof raw.hash !== 'string' || !ID_RE.test(raw.hash)) return null;
    if (now() - raw.at > PENDING_MS + 60_000) return null; // the code it was is dead
    return { at: raw.at, hash: raw.hash };
  }

  function forgetCopied() {
    try {
      session.remove(CHROME_LINK_COPIED_KEY);
    } catch {
      /* no session storage */
    }
  }

  async function codeHash(text) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text).trim()));
    return b64url(new Uint8Array(digest).slice(0, ID_BYTES));
  }

  /**
   * Linked: if this tab copied the code (during its 30-minute life, a reload included), the clipboard is cleared,
   * but only while it still holds the code: it is read first, so whatever the owner copied since stays. Not allowed
   * now (another window has the focus): tried again when this one gets it. Not allowed at all (reading refused):
   * left as it is, and Settings says so (`clipboard: 'unchecked'`).
   */
  function maybeClearClipboard() {
    const copied = readCopied();
    if (!copied || !clipboard) {
      if (!readCopied()) forgetCopied();
      return;
    }
    let tries = 0;
    const clear = async () => {
      const mine = readCopied();
      if (!mine) return;
      tries += 1;
      let text;
      try {
        if (typeof clipboard.readText !== 'function') throw new Error('no reading');
        text = await clipboard.readText();
      } catch {
        const focused = (() => {
          try {
            return !win || !win.document || typeof win.document.hasFocus !== 'function' || win.document.hasFocus();
          } catch {
            return true;
          }
        })();
        if (!focused && tries < 3 && win && typeof win.addEventListener === 'function') {
          win.addEventListener('focus', () => clear(), { once: true }); // not now: when this window gets the focus
          return;
        }
        forgetCopied();
        clipState = 'unchecked';
        changed();
        return;
      }
      if ((await codeHash(text)) !== mine.hash) {
        forgetCopied(); // something else is on the clipboard now: nothing to clear
        changed();
        return;
      }
      try {
        await clipboard.writeText('');
      } catch {
        if (tries < 3 && win && typeof win.addEventListener === 'function') win.addEventListener('focus', () => clear(), { once: true });
        return;
      }
      forgetCopied();
      clearedAt = now();
      clipState = 'cleared';
      changed();
    };
    clear();
  }

  // ---- other windows ------------------------------------------------------------------------------------------
  function onChannel(event) {
    const m = event && event.data;
    if (!isObj(m) || destroyed) return;
    if (m.t === 'reply') {
      const reply = cleanReply(m.reply);
      if (reply && stopEvidence({ reply })) return;
      const entry = reply && pending.get(reply.re);
      if (entry) {
        if (entry.kind === 'start') resolveStart(reply.re, reply);
        entry.resolve(interpret(entry.kind, reply));
      } else if (reply) lateReply(reply);
    } else if (m.t === 'state' && !holding) {
      task = isObj(m.task) ? cleanTask(m.task) : null;
      voiceApprovals = m.voiceApprovals === true;
      if (posInt(m.heard) && m.heard > heard) heard = m.heard;
      extVersion = cleanText(m.extVersion, 24);
      if (isObj(m.budget)) noteBudget(m.budget);
      // What the holder just heard, for a stop this window sent (LINK-1).
      if (isObj(m.ev)) {
        const e = m.ev;
        if (isObj(e.done)) stopEvidence({ done: { id: token(e.done.id) } });
        else if (isObj(e.status)) {
          const st = isObj(e.status.task) && token(e.status.task.id) ? { id: token(e.status.task.id), from: token(e.status.task.from, WORD_RE) } : null;
          stopEvidence({ status: { task: st } });
          if (st && st.from === 'voice') voiceTaskSeen(st.id);
        } else if (isObj(e.task)) {
          stopEvidence({ task: { id: token(e.task.id), status: token(e.task.status, WORD_RE) } });
          voiceTaskSeen(token(e.task.id));
        }
      }
      changed();
    } else if (m.t === 'ask' && holding) {
      shareState();
    }
  }

  // ---- Settings → Jarvis for Chrome -------------------------------------------------------------------------
  function homeBaseCore() {
    const base = (() => {
      try {
        return getHomeBase() || '';
      } catch {
        return '';
      }
    })();
    const r = base ? normalizeHomeBaseUrl(base) : null;
    return r && r.ok ? r.url.replace(/\/$/, '') : null;
  }

  const control = {
    info,
    onChange(fn) {
      if (typeof fn !== 'function') return () => {};
      controlListeners.add(fn);
      return () => controlListeners.delete(fn);
    },
    /** Link: a new key (kept here only) and a link code to copy. */
    begin() {
      if (!computer) return { ok: false, reason: 'phone' };
      if (record) return record.linkedAt ? { ok: false, reason: 'linked' } : { ok: true };
      const core = homeBaseCore();
      if (!core || !isCoreOrigin(core)) return { ok: false, reason: 'no-home-base' };
      note = null;
      clearedAt = 0;
      clipState = null;
      storage.remove(CHROME_LINK_INBOX_KEY);
      storage.remove(CHROME_LINK_STARTS_KEY);
      save({ v: 1, core, key: newLinkKey(), linkedAt: null, extSeenAt: null, madeAt: now() });
      reload();
      return record ? { ok: true } : { ok: false, reason: 'storage' };
    },
    /** The link code while a link waits for Jarvis for Chrome (null otherwise). */
    code() {
      return record && !record.linkedAt ? makeLinkCode({ core: record.core, key: record.key }) : null;
    },
    /** Put the link code on the clipboard; it is cleared once linked, if it is still there (LINK-4, PRIVACY-6). */
    async copyCode() {
      const code = control.code();
      if (!code) return { ok: false, reason: 'no-code' };
      if (!clipboard) return { ok: false, reason: 'clipboard' };
      try {
        await clipboard.writeText(code);
      } catch {
        return { ok: false, reason: 'clipboard' };
      }
      try {
        session.write(CHROME_LINK_COPIED_KEY, JSON.stringify({ at: now(), hash: await codeHash(code) }));
      } catch {
        /* no session storage: cleared only if linked before this tab reloads (by memory, below) */
      }
      changed();
      return { ok: true };
    },
    /** Stop waiting for Jarvis for Chrome: the unused key is forgotten. */
    cancel() {
      if (record && !record.linkedAt) forget(null);
    },
    /** Unlink: tell Jarvis for Chrome if it can be reached (5 s at most), then forget the key here. */
    async unlink() {
      const rec = record;
      if (!rec) return;
      if (rec.linkedAt) {
        await Promise.race([tell('unlinked', {}, rec), new Promise((r) => later(r, 5000))]);
      }
      if (record && record.key === rec.key) forget(null);
    },
    /** Ask the home base now whether Jarvis for Chrome is reading its box (Settings opened). */
    async refresh() {
      if (!isLinked()) return info();
      await checkStatus(null);
      return info();
    },
    /** A round trip to Jarvis for Chrome (Settings → Test): { ok: true, status } or { ok: false, reason }. Sent even
     *  when the status says offline (it may be out of date); a ping does nothing there. */
    ping() {
      return request('ping', {}, { needOnline: false });
    },
    dismissNote() {
      note = null;
      changed();
    },
  };

  // ---- app.chromeLink (contract (f)) ---------------------------------------------------------------------------
  const api = {
    state,
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    open(url, { rect = null, focus } = {}) {
      const href = cleanOpenUrl(url);
      if (!href) return Promise.resolve({ ok: false, reason: 'bad' });
      const where = cleanRect(rect);
      return request('open', { url: href, rect: where, focus: typeof focus === 'boolean' ? focus : !where });
    },
    startTask({ text, chat = 'new', limitUsd } = {}) {
      const words = cleanText(text, TEXT_MAX);
      if (!words) return Promise.resolve({ ok: false, reason: 'bad' });
      // The budget the owner heard in the check: the extension keeps the task within it (MONEY-3).
      const limit = budgetOf(limitUsd);
      return request('start', { text: words, chat: chat === 'same' ? 'same' : 'new', from: 'voice', ...(limit !== null ? { limitUsd: limit } : {}) });
    },
    /**
     * Stop goes out even when the extension seems offline (the safe direction), and is sent again until Jarvis for
     * Chrome confirms it (LINK-1): { ok: true } once confirmed; { ok: false, reason: 'unlinked' } at once when
     * not linked; { ok: false, reason: 'offline' } when 2 minutes pass unconfirmed. Callers tell the owner
     * themselves when it takes long (chrome-voice: after 10 s).
     */
    stopTask() {
      return stopChrome();
    },
    answer({ promptId, hash, choice, via = 'voice' } = {}) {
      const p = token(promptId);
      const c = token(choice, WORD_RE);
      if (!p || !ID_RE.test(hash || '') || !c) return Promise.resolve({ ok: false, reason: 'bad' });
      return request('answer', { promptId: p, hash, choice: c, via: via === 'card' ? 'card' : 'voice' }).then((r) => (r.ok ? { ok: true } : r));
    },
    onPrompt(fn) {
      if (typeof fn !== 'function') return () => {};
      promptListeners.add(fn);
      return () => promptListeners.delete(fn);
    },
    onPromptClosed(fn) {
      if (typeof fn !== 'function') return () => {};
      closedListeners.add(fn);
      return () => closedListeners.delete(fn);
    },
    onDone(fn) {
      if (typeof fn !== 'function') return () => {};
      doneListeners.add(fn);
      return () => doneListeners.delete(fn);
    },
  };

  // ---- start ------------------------------------------------------------------------------------------------
  const unwatch = storage.watch ? storage.watch(CHROME_LINK_KEY, () => reload()) : () => {};
  // A reload or a closed window: its unanswered starts are left to the window that holds the link (MISSED-LINK-A).
  if (win && typeof win.addEventListener === 'function') {
    try {
      win.addEventListener('pagehide', () => orphanStarts());
    } catch {
      /* not a window */
    }
  }
  if (channel) {
    try {
      channel.onmessage = onChannel;
    } catch {
      /* ignore */
    }
  }
  record = computer ? load() : null;
  if (record && record.extSeenAt) savedSeen = record.extSeenAt;
  syncLock();
  broadcast({ t: 'ask' });
  changed();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    try {
      unwatch();
    } catch {
      /* ignore */
    }
    orphanStarts(); // (before release(): another window may take the link over and must find them)
    release();
    for (const [, entry] of Array.from(pending)) entry.resolve({ ok: false, reason: 'offline' });
    endStop(stopper, { ok: false, reason: 'offline' });
    for (const t of Array.from(timers)) cancelLater(t);
    if (channel) {
      try {
        channel.close();
      } catch {
        /* ignore */
      }
    }
    listeners.clear();
    controlListeners.clear();
    promptListeners.clear();
    closedListeners.clear();
    doneListeners.clear();
  }

  return { api, control, destroy };
}

/**
 * app.js: one call. Returns { api: app.chromeLink, control: for Settings, destroy }.
 *   getSettings: platform/settings.js getSettings (the home base's address); notice({ kind, line }): see above.
 */
export function installChromeLink({ getSettings, version, notice } = {}) {
  return createChromeLink({
    ...(typeof notice === 'function' ? { notice } : {}),
    getHomeBase: () => {
      try {
        return (getSettings && getSettings().homeBaseUrl) || '';
      } catch {
        return '';
      }
    },
    ...(version ? { version } : {}),
  });
}
