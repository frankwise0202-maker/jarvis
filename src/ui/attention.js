// Attention (SPEC 14.3): let the owner know when a long mission or reply finishes while
// Jarvis is in the background: a system notification (through the service worker when one
// is active, so it also works in installed iOS/Android apps), an app-icon badge and a "(1)"
// marker in the tab title. All three clear as soon as the page is visible again.
//
//   initAttention(getSettings)                  // once at boot
//   const info = describeFinishedTurn(turn, conversation)   // { title, summary } or null
//   if (info) missionFinished(info)             // on the TurnRun 'end' event
//   await requestNotifyPermission()             // ONLY from a tap/click handler
//   notifyPermission(), explainNotifyPermission(state)       // for the Settings UI
//
// Reads settings.notifyOnFinish (default true) through the injected getter. Never throws.

const TAG = 'jarvis-finished';
const SW_READY_TIMEOUT_MS = 3000;

let getSettingsFn = null;
let inited = false;
let unseen = 0;
let titleMark = null; // { base, marked } while the tab title carries our "(n) " marker
const fallbackNotes = new Set(); // Notifications made with the constructor (no service worker)
let warned = false;

// ---- public API ---------------------------------------------------------------------------------

/** Remember the settings getter and clear attention whenever the page becomes visible. */
export function initAttention(getSettings) {
  if (typeof getSettings === 'function') getSettingsFn = getSettings;
  if (inited || typeof window === 'undefined' || typeof document === 'undefined') return;
  inited = true;
  const onSeen = () => {
    if (!isHidden()) clearAttention();
  };
  document.addEventListener('visibilitychange', onSeen);
  window.addEventListener('focus', onSeen);
  window.addEventListener('pageshow', onSeen);
  // A badge or notification left over from a previous session (e.g. the app was reopened
  // from its badged icon) is stale once the owner is looking at Jarvis.
  if (!isHidden()) clearAttention();
}

/**
 * A mission or long reply finished. If the page is hidden and settings.notifyOnFinish is on:
 * bumps the app badge and the tab-title marker and, when notification permission is
 * granted, shows a system notification ({ title, summary } become its title and body).
 * Returns true if a system notification was requested (it is delivered asynchronously).
 */
export function missionFinished({ title, summary } = {}) {
  try {
    if (!notifyEnabled() || !isHidden()) return false;
    unseen += 1;
    setBadge(unseen);
    markTitle(unseen);
    if (notifyPermission() !== 'granted') return false;
    const heading = plainText(title, 80) || 'Jarvis';
    const body = plainText(summary, 180) || 'Your mission is complete.';
    showNotification(heading, body).catch((err) => warnOnce('notification failed', err));
    return true;
  } catch (err) {
    warnOnce('missionFinished failed', err);
    return false;
  }
}

/** Clear the badge, the title marker and any notification Jarvis is still showing. */
export function clearAttention() {
  unseen = 0;
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.clearAppBadge === 'function') nav.clearAppBadge().catch(() => {});
    else if (nav && typeof nav.setAppBadge === 'function') nav.setAppBadge(0).catch(() => {});
  } catch {
    /* unsupported */
  }
  unmarkTitle();
  for (const n of fallbackNotes) {
    try {
      n.close();
    } catch {
      /* ignore */
    }
  }
  fallbackNotes.clear();
  closeServiceWorkerNotifications();
}

/**
 * Ask for notification permission. Call it ONLY from a user gesture (e.g. the "Notify when
 * finished" switch): browsers ignore or permanently deny prompts that aren't. Resolves to
 * 'granted' | 'denied' | 'default' (dismissed, or not called from a gesture) | 'unsupported'
 * (e.g. iPhone Safari before Jarvis is added to the Home Screen). Never prompts twice.
 */
export async function requestNotifyPermission() {
  try {
    const state = notifyPermission();
    if (state !== 'default') return state;
    const activation = typeof navigator !== 'undefined' ? navigator.userActivation : null;
    if (activation && !activation.isActive) return 'default'; // not in a gesture: don't burn the prompt
    const answer = await new Promise((resolve) => {
      let settled = false;
      const done = (value) => {
        if (!settled) {
          settled = true;
          resolve(value);
        }
      };
      try {
        const pending = Notification.requestPermission(done); // callback form for older Safari
        if (pending && typeof pending.then === 'function') pending.then(done, () => done(Notification.permission));
      } catch {
        done(Notification.permission);
      }
    });
    return answer === 'granted' || answer === 'denied' ? answer : 'default';
  } catch {
    return notifyPermission();
  }
}

/** Current notification permission without prompting: 'granted' | 'denied' | 'default' | 'unsupported'. */
export function notifyPermission() {
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || window.isSecureContext === false) return 'unsupported';
    const p = window.Notification.permission;
    return p === 'granted' || p === 'denied' ? p : 'default';
  } catch {
    return 'unsupported';
  }
}

/** One plain sentence explaining a permission state, for the Settings UI. */
export function explainNotifyPermission(state = notifyPermission()) {
  const ios = isIOS();
  switch (state) {
    case 'granted':
      return 'Jarvis will notify you when a mission finishes while it is in the background.';
    case 'denied':
      return ios
        ? 'Notifications are off for Jarvis. Turn them on in iPhone Settings → Notifications → Jarvis.'
        : 'Notifications are blocked for this site. Allow them in your browser’s site settings, then try again.';
    case 'unsupported':
      return ios && !isStandalone()
        ? 'On iPhone, add Jarvis to your Home Screen first (Share → Add to Home Screen), then turn this on in the installed app.'
        : 'This browser can’t show notifications. Jarvis will still badge its icon and tab when work finishes.';
    default:
      return 'Allow notifications so Jarvis can tell you when a long mission finishes while you are away.';
  }
}

/**
 * Decide whether a finished Jarvis turn deserves a ping and word it. Returns
 * { title, summary } for a turn that ran agents or took at least `minDurationMs`, finished
 * as 'done' or 'error'; null otherwise ('stopped' means the owner was there to press Stop).
 * The summary leads with what happened, then the answer's first (spoken-summary) paragraph.
 */
export function describeFinishedTurn(turn, conversation, { minDurationMs = 20000 } = {}) {
  try {
    if (!turn || typeof turn !== 'object' || (turn.status !== 'done' && turn.status !== 'error')) return null;
    const missions = Object.values(turn.missions || {})
      .filter((m) => m && typeof m === 'object')
      .sort((a, b) => (a.wave || 0) - (b.wave || 0) || (a.createdAt || 0) - (b.createdAt || 0));
    const stats = turn.stats || {};
    const duration = Number(stats.durationMs) || (turn.endedAt && turn.createdAt ? turn.endedAt - turn.createdAt : 0);
    if (!missions.length && !(duration >= minDurationMs)) return null;

    const mission = missions[missions.length - 1];
    const title = plainText((mission && mission.title) || (conversation && conversation.title) || '', 80) || 'Jarvis';
    if (turn.status === 'error') {
      const why = turn.error && turn.error.message ? plainText(turn.error.message, 120) : '';
      return { title, summary: why ? `Jarvis ran into a problem: ${why}` : 'Jarvis ran into a problem.' };
    }
    const agents = Number(stats.agents) || missions.reduce((n, m) => n + (Array.isArray(m.agents) ? m.agents.length : 0), 0);
    const lead = missions.length ? `Mission complete${agents ? ` · ${agents} agent${agents === 1 ? '' : 's'}` : ''}.` : 'Reply ready.';
    const answer = plainText(firstParagraph(finalAnswer(turn)), 150);
    return { title, summary: answer ? `${lead} ${answer}` : lead };
  } catch {
    return null;
  }
}

// ---- internals ----------------------------------------------------------------------------------

function notifyEnabled() {
  let s = null;
  try {
    s = getSettingsFn ? getSettingsFn() : null;
  } catch {
    s = null;
  }
  return !(s && typeof s === 'object' && s.notifyOnFinish === false);
}

const isHidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  try {
    return (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator.standalone === true);
  } catch {
    return false;
  }
}

function setBadge(count) {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    if (nav && typeof nav.setAppBadge === 'function') nav.setAppBadge(count).catch(() => {});
  } catch {
    /* unsupported (or not allowed, e.g. iOS without notification permission) */
  }
}

function markTitle(count) {
  if (typeof document === 'undefined') return;
  const current = document.title;
  // Keep the app's own title as the base even if it changed while we were marking it.
  const base = titleMark && current === titleMark.marked ? titleMark.base : current;
  const marked = `(${count}) ${base}`;
  titleMark = { base, marked };
  document.title = marked;
}

function unmarkTitle() {
  if (!titleMark || typeof document === 'undefined') return;
  if (document.title === titleMark.marked) document.title = titleMark.base;
  titleMark = null; // if the app retitled the page meanwhile, its title stands
}

function appBase() {
  try {
    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest && manifest.href) return new URL('./', manifest.href).href;
  } catch {
    /* fall through */
  }
  return typeof document !== 'undefined' ? document.baseURI : '';
}

async function serviceWorkerRegistration() {
  const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
  if (!sw || (typeof window !== 'undefined' && window.isSecureContext === false)) return null;
  let timer = 0;
  try {
    // No registration at all (e.g. a dev build): use the Notification constructor right away.
    if (typeof sw.getRegistration === 'function' && !(await sw.getRegistration())) return null;
    // `ready` waits for the worker to activate; never wait on it forever.
    return await Promise.race([sw.ready, new Promise((resolve) => (timer = setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS)))]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function showNotification(title, body) {
  const reg = await serviceWorkerRegistration();
  const base = (reg && reg.scope) || appBase();
  const options = {
    body,
    tag: TAG,
    renotify: true, // a newer finish replaces the old notification but still alerts
    icon: new URL('icons/icon-192.png', base).href,
    data: { url: base },
    timestamp: Date.now(),
  };
  if (!isHidden()) return false; // the owner came back while we waited for the worker
  if (reg && typeof reg.showNotification === 'function') {
    try {
      await reg.showNotification(title, options);
      return true;
    } catch {
      /* fall back to the constructor */
    }
  }
  if (typeof Notification !== 'function') return false;
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      n.close();
    };
    n.onclose = () => fallbackNotes.delete(n);
    fallbackNotes.add(n);
    return true;
  } catch {
    return false; // e.g. Android Chrome only allows notifications from a service worker
  }
}

function closeServiceWorkerNotifications() {
  try {
    const sw = typeof navigator !== 'undefined' ? navigator.serviceWorker : null;
    if (!sw || typeof sw.getRegistration !== 'function') return;
    sw.getRegistration()
      .then((reg) => (reg && typeof reg.getNotifications === 'function' ? reg.getNotifications({ tag: TAG }) : []))
      .then((list) => {
        for (const n of list || []) n.close();
      })
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** The final answer: the text segments of the last lead request that produced text. */
function finalAnswer(turn) {
  const texts = (Array.isArray(turn.segments) ? turn.segments : []).filter((s) => s && s.kind === 'text' && typeof s.text === 'string' && s.text.trim());
  if (!texts.length) return '';
  const lastReq = Math.max(...texts.map((s) => (Number.isFinite(s.req) ? s.req : 0)));
  return texts
    .filter((s) => (Number.isFinite(s.req) ? s.req : 0) === lastReq)
    .map((s) => s.text)
    .join('\n\n');
}

function firstParagraph(md) {
  for (const block of String(md || '').split(/\n\s*\n/)) {
    const line = block.trim();
    if (!line || /^(#{1,6}\s|```|~~~|\||[-*_]{3,}$)/.test(line)) continue; // skip headings, code, tables, rules
    return line;
  }
  return '';
}

/** Markdown-ish text to one plain line (no links/URLs), cut to `max` characters. */
function plainText(value, max) {
  if (typeof value !== 'string') return '';
  let s = value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images -> alt
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> text
    .replace(/<(https?:|mailto:)[^>]*>/gi, '') // autolinks
    .replace(/https?:\/\/\S+/gi, '') // bare URLs
    .replace(/`+/g, '')
    .replace(/(\*\*|__|~~)(?=\S)([^\n]*?\S)\1/g, '$2') // bold, strikethrough
    .replace(/(^|[\s(])[*_](?=\S)([^*_\n]*?\S)[*_](?=[\s).,!?;:]|$)/g, '$1$2') // italics (not snake_case)
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '') // block markers
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (max > 0 && s.length > max) {
    const cut = Array.from(s).slice(0, max - 1).join('');
    const space = cut.lastIndexOf(' ');
    s = (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
  }
  return s;
}

function warnOnce(message, err) {
  if (warned) return;
  warned = true;
  try {
    console.warn(`[jarvis] attention: ${message}`, err);
  } catch {
    /* ignore */
  }
}
