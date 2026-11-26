// Screens (v7) in the main window: "open this on my other screen", "float it", "open it in a
// window", "bring it back", from words (typed, spoken, or Jarvis's open_screen tool).
//
//   const screens = createScreens(deps)
//   screens.command(text, { source: 'typed' | 'voice' | 'viewer' })
//       -> null (not a screen command: send it to Jarvis) | { handled: true, done: Promise<outcome> }
//   screens.openFromTool({ what, where, screen, url, id }, { signal })   -> Promise<outcome>  (engine
//       deps.screens.open; a stopped turn's signal drops a placement still under way)
//   screens.onRunEvent(entry, evt) / screens.onRunDone(entry)  live content follows the run
//   screens.list()  screens.closeAll()
//   screenMessage(outcome) / screenAck(outcome)               what to show / say about an outcome
//
// Several windows (v8.1, SPEC §31): each "in a window" / "in another window" opens one more, named by
// what it shows ("the camera window"), at most MAX_WINDOWS (a fifth takes the oldest one's place, and
// Jarvis says so); windows beside Jarvis share his screen without covering all of him (layoutRects:
// a strip of his window stays in view, or macOS would count him hidden). Pages opened in a window
// are tracked too. "Bring the hologram back" and "close the camera window" act on that one only;
// without a name, on the window that has focus, else the newest one.
//   screens.runCommand(cmd, { source })  a screen command already matched (matchScreenCommand's)
//   screens.windowCommand({ op, which, layout, a, b }, { source })  -> Promise<outcome>
//       op 'close' | 'close-all' | 'arrange' | 'here' | 'focus' (window-commands.js)
//   screens.commandIn(kind, command)   a viewer command ("explode it") for the window showing `kind`:
//       { handled: true, … } or null (no window shows it: the app opens it in the main window)
//   screens.shown(kind)                the window showing `kind`: { id, label, mode, parts, selected } | null
//   screens.openPage(url, { title, rect, button }, { source })  a web page in a window placed at rect
//   screens.noteRecent(target)         what "it" is now (a page just opened in Chrome)
//
// Placement (lib/screen-placement.js): another monitor with the Window Management API (asked once,
// after a short explanation), a floating always-on-top panel (Document Picture-in-Picture), a
// window on the right half of the screen, or, on phones, the app's own full-screen view. Popups and
// floating panels need a user gesture: a spoken command or Jarvis's tool that gets blocked shows a
// one-tap "Open on screen 2" button instead (and, once, a tip to allow pop-ups for Jarvis). A screen
// already open is reused without a gesture: the new content is sent to it.
//
// Content: a window on another monitor runs the app in screen mode (screen-page.js) and reads saved
// things itself; live content (a running mission, a streaming answer, a hologram's live build)
// follows over BroadcastChannel('jarvis-screens'). The floating panel is rendered here, into the
// PiP document. Moving something out closes the in-app viewer that showed it; closing the screen
// (or "bring it back") hands it back to the main window.
//
// deps:
//   getConversation()                  the open conversation (or null)
//   getLiveTurn(conversationId, turnId) the running turn object, if a run has it
//   describeOpen()                     the open in-app viewer: { kind, ref, title, live } | null
//   closeInApp(target) -> boolean      close the in-app viewer showing that content (move out)
//   showInApp(target, { reason })      show content in the main window ('handback' | 'inapp')
//   getLibraryItem(id)                 a saved hologram or blueprint
//   snapshot(spec, { width, height })  a hologram image (the floating panel's WebGL fallback)
//   toast(message, opts)               optional
//   onChange()                         optional: a screen opened, closed, shows something else, or
//                                      its camera went on or off
//   cameraLive() -> boolean            optional: Optics' camera is on in this window
//
// The camera and Jarvis's tool: a tool call never turns a camera on. open_screen may move the
// camera to a screen while it is on (in Optics, or on a camera screen); with the camera off the owner
// gets a "Turn on camera" button instead (needs_tap, note 'camera-off'), and "back" from the tool
// hands a camera screen back to Optics only while its camera is on. Camera screens report their
// camera's state (live | starting | paused | off | error): a floating panel directly, a screen window
// over the channel ({ t: 'camera', state }); cameraOn() says whether one may be running.

import { h } from '../dom.js';
import { icon } from '../icons.js';
import { openOverlay } from '../overlay.js';
import { matchScreenCommand } from '../../lib/screen-commands.js';
import { MAX_WINDOWS, detectScreenEnv, layoutArea, layoutRects, planPlacement, placementNote, rightHalf, screenWindowFeatures, windowRect } from '../../lib/screen-placement.js';
import { windowName } from '../../lib/window-commands.js';
import { answerMarkdownOf, hostOf, lookSnapshot, missionSnapshot, questionTitle, resolveScreenTarget, screenKindName } from '../../lib/screen-targets.js';
import { createScreenFrame } from './frame.js';
import { createScreenPanel } from './panels.js';
import { SCREEN_CHANNEL, armCameraGo, loadScreenContent, panelDeps, screenLabel } from './screen-page.js';
import { currentPipWindow, openPipWindow, pipSupported } from './pip.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : '');
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const PUSH_GAP = { hologram: 120, blueprint: 250, answer: 160, mission: 300, look: 200 };
const CAMERA_ON = new Set(['live', 'starting']);
// The viewer's commands a hologram in a window or floating panel runs itself (panels.js command()).
// The rest (photos, blueprint, the parts list) need the main window's viewer.
export const WINDOW_HOLOGRAM_ACTIONS = Object.freeze(['explode', 'collapse', 'rotate', 'stop', 'labels-on', 'labels-off', 'reset', 'view', 'zoom-in', 'zoom-out', 'select', 'focus', 'isolate', 'show-all', 'deselect']);
const HOLO_ACTIONS = new Set(WINDOW_HOLOGRAM_ACTIONS);
const PROMPT_MS = 60000;
const PREFS_KEY = 'jarvis.screens.v1';

function loadPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return isObj(v) ? v : {};
  } catch {
    return {};
  }
}
function savePrefs(patch) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...loadPrefs(), ...patch }));
  } catch {
    /* private mode */
  }
}

/** Is there a user gesture right now (a click or key press within the last few seconds)? */
function hasGesture(source) {
  try {
    if (navigator.userActivation) return !!navigator.userActivation.isActive;
  } catch {
    /* fall through */
  }
  return source !== 'voice' && source !== 'tool';
}

/** The window-management permission ('granted' | 'prompt' | 'denied'). */
async function wmPermission() {
  for (const name of ['window-management', 'window-placement']) {
    try {
      const st = await navigator.permissions.query({ name });
      if (st && typeof st.state === 'string') return st.state;
    } catch {
      /* unknown name in this browser */
    }
  }
  return 'prompt';
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** 'Camera on the left, hologram on the right.' / 'Side by side.' (a layout, said and shown). */
function arrangedLine(o) {
  const names = Array.isArray(o.names) ? o.names : [];
  const there = o.screen === 'other' ? ' on your other screen' : '';
  if (o.layout === 'left-right' && names.length === 2) return `${cap(windowName(names[0]).replace(/^the | window$/g, ''))} on the left, ${windowName(names[1]).replace(/^the | window$/g, '')} on the right${there}.`;
  if (o.count === 1) return o.screen === 'other' ? `${cap(windowName(names[0]))} fills your other screen.` : 'Side by side with me.';
  if (o.count === 2) return `Side by side${there}.`;
  return `${o.count} windows, in a grid${there}.`;
}

/** What to tell the owner (a toast for typed commands). */
export function screenMessage(o) {
  if (!isObj(o)) return '';
  const name = screenKindName(o.kind, { report: !!o.report });
  const Name = cap(name);
  const note = o.note ? placementNote(o.note, { label: o.label }) : '';
  const replaced = isObj(o.replaced) ? ` ${MAX_WINDOWS} windows are open, so it took the place of ${windowName(o.replaced.kind, { report: !!o.replaced.report })}.` : '';
  switch (o.status) {
    case 'opened':
      if (o.mode === 'screen') return `${Name} is on ${txt(o.label).toLowerCase() || 'your other screen'}.${note ? ` ${note}` : ''}${replaced}`;
      if (o.mode === 'pip') return note || `${Name} is floating beside you.`;
      if (o.mode === 'window') return o.already ? `${Name} is already in its own window.` : note || `${Name} is open in its own window.${replaced}`;
      if (o.mode === 'tab') return 'The link is open in a new tab.';
      return note || `${Name} is open full screen.`;
    case 'needs_tap':
      return `Tap “${o.button}” to put ${name} there.`;
    case 'needs_permission':
      return 'Allow window placement once, and Jarvis can use your other monitor.';
    case 'closed':
      if (o.which && !o.count) return `There’s no ${windowName(o.which).replace(/^the /, '')} open.`;
      if (o.which && o.count === 1 && !o.back) return `Closed ${windowName(o.kind, { report: !!o.report })}.`;
      return o.count ? (o.back ? `${Name} is back here.` : `Closed ${o.count === 1 ? txt(o.label).toLowerCase() || 'the screen' : `${o.count} screens`}.`) : 'Nothing is on another screen right now.';
    case 'arranged':
      return arrangedLine(o);
    case 'here':
      if (o.where === 'window') return o.moved ? `${Name} is here, in ${windowName(o.windowKind, { report: !!o.windowReport })}.` : `Working in ${windowName(o.kind, { report: !!o.report })}.`;
      return o.moved ? `${Name} is back in the main window.` : 'Working in the main window.';
    case 'focused':
      return `${cap(windowName(o.kind, { report: !!o.report }))} is in front.`;
    default:
      return txt(o.message) || 'That screen couldn’t open.';
  }
}

/** What Jarvis says after a spoken screen command (short, in his manner). */
export function screenAck(o) {
  if (!isObj(o)) return '';
  switch (o.status) {
    case 'opened':
      if (isObj(o.replaced)) return `That's ${MAX_WINDOWS} windows, so it took the place of ${windowName(o.replaced.kind, { report: !!o.replaced.report })}.`;
      if (o.mode === 'screen') return o.note === 'no-such-screen' ? `There's no such screen, so it's on ${txt(o.label).toLowerCase()}.` : `It's on ${txt(o.label).toLowerCase() || 'your other screen'}.`;
      if (o.mode === 'pip') return o.note === 'single-screen' ? "Only one screen is connected, so it's floating beside you." : 'Floating beside you.';
      if (o.mode === 'window') return o.already ? "It's already in its own window." : o.note === 'no-wm' || o.note === 'wm-denied' ? "It's in its own window. Drag it to your other screen." : "It's in its own window.";
      if (o.mode === 'tab') return "It's open in a new tab.";
      return 'Here it is, full screen.';
    case 'needs_tap':
      return `Tap ${o.button}, and it'll appear.`;
    case 'needs_permission':
      return 'Chrome needs your permission once. Tap Allow, and I can use your other monitor.';
    case 'closed':
      if (o.which && !o.count) return `There's no ${windowName(o.which).replace(/^the /, '')}.`;
      if (o.which && o.count === 1 && !o.back) return `Closed ${windowName(o.kind, { report: !!o.report })}.`;
      return o.count ? (o.back ? 'Brought it back.' : 'Closed.') : "There's nothing on another screen.";
    case 'arranged':
      return arrangedLine(o);
    case 'here':
      if (o.where === 'window') return o.moved ? `Here, in ${windowName(o.windowKind, { report: !!o.windowReport })}.` : `In ${windowName(o.kind, { report: !!o.report })}.`;
      return o.moved ? "It's back here, in the main window." : 'Here, in the main window.';
    case 'focused':
      return `Here's ${windowName(o.kind, { report: !!o.report })}.`;
    default:
      return txt(o.message) || "I couldn't open that screen.";
  }
}

export function createScreens(deps = {}) {
  const screens = new Map(); // id -> entry (see register)
  let prompt = null; // the one-tap button or the permission explainer
  let recent = null; // { target, at }: what was last put on a screen ("float it", then "put it on screen 2")
  const RECENT_MS = 10 * 60 * 1000;
  let channel = null;
  let details = null; // ScreenDetails (Window Management), once granted
  let working = null; // the window "we'll do this in this window" picked (its id), v8.1
  const prefs = loadPrefs();

  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(SCREEN_CHANNEL) : null;
  } catch {
    channel = null;
  }
  const post = (msg) => {
    try {
      if (channel) channel.postMessage(msg);
    } catch {
      /* closed */
    }
  };

  const newId = () => `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const changed = () => {
    if (typeof deps.onChange === 'function') safe(() => deps.onChange());
  };
  const toast = (msg, opts) => {
    if (msg && typeof deps.toast === 'function') safe(() => deps.toast(msg, opts));
  };

  // ---- targets --------------------------------------------------------------------------------

  async function resolve(cmd) {
    const conv = safe(() => (typeof deps.getConversation === 'function' ? deps.getConversation() : null), null);
    const open = safe(() => (typeof deps.describeOpen === 'function' ? deps.describeOpen() : null), null);
    const fresh = recent && Date.now() - recent.at < RECENT_MS ? recent : null;
    let target = resolveScreenTarget({ what: cmd.what || 'this', ordinal: cmd.ordinal, open, recent: fresh, conv, url: cmd.url, id: cmd.id });
    if (target && target.kind === 'library') {
      const item = await Promise.resolve(safe(() => deps.getLibraryItem(target.ref.libraryId), null)).catch(() => null);
      if (!isObj(item) || (item.kind !== 'hologram' && item.kind !== 'blueprint')) return { error: 'nothing', message: `No saved item has the id ${target.ref.libraryId}.` };
      target = { kind: item.kind, ref: { libraryId: item.id, conversationId: item.conversationId || null, turnId: item.turnId || null, segmentId: item.segmentId || null }, title: txt(item.title) || txt(item.spec && item.spec.title), live: false };
    }
    if (target && !target.error && cmd.what && cmd.what !== 'this' && cmd.what !== target.kind && !(cmd.what === 'camera' && target.kind === 'camera')) {
      // e.g. "open the link" but the open viewer is a hologram: resolve without the viewer.
      target = resolveScreenTarget({ what: cmd.what, ordinal: cmd.ordinal, open: null, conv, url: cmd.url });
    }
    return target;
  }

  function liveTurn(ref) {
    if (!ref || !ref.conversationId || !ref.turnId) return null;
    const live = safe(() => (typeof deps.getLiveTurn === 'function' ? deps.getLiveTurn(ref.conversationId, ref.turnId) : null), null);
    if (live) return live;
    const conv = safe(() => deps.getConversation(), null);
    if (conv && conv.id === ref.conversationId && Array.isArray(conv.turns)) return conv.turns.find((t) => isObj(t) && t.id === ref.turnId) || null;
    return null;
  }

  /** The content to show for an entry now: { data, title, report, ref } or null (the screen reads storage). */
  async function contentOf(entry) {
    const ref = entry.ref || {};
    const kind = entry.kind;
    if (kind === 'hologram' || kind === 'blueprint') {
      const turn = ref.segmentId ? liveTurn(ref) : null;
      const seg = turn && Array.isArray(turn.segments) ? turn.segments.find((s) => isObj(s) && s.id === ref.segmentId) : null;
      if (seg && isObj(seg.spec)) {
        if (typeof seg.libraryId === 'string') entry.ref = { ...ref, libraryId: seg.libraryId };
        return { data: { spec: seg.spec, status: seg.status }, title: txt(seg.title) || txt(seg.spec.title) || entry.title, ref: entry.ref };
      }
      if (ref.libraryId && typeof deps.getLibraryItem === 'function') {
        const item = await Promise.resolve(safe(() => deps.getLibraryItem(ref.libraryId), null)).catch(() => null);
        if (isObj(item) && isObj(item.spec)) return { data: { spec: item.spec, status: 'done' }, title: txt(item.title) || entry.title, ref };
      }
      return null;
    }
    if (kind === 'answer') {
      const turn = liveTurn(ref);
      if (!turn) return null;
      if (!entry.title) {
        const conv = safe(() => deps.getConversation(), null);
        entry.title = conv && conv.id === ref.conversationId ? questionTitle(conv, turn) : '';
      }
      const report = !!ref.report || (isObj(turn.missions) && Object.keys(turn.missions).length > 0);
      return { data: { markdown: answerMarkdownOf(turn), status: txt(turn.status) || 'done', report }, title: entry.title, report, ref };
    }
    if (kind === 'mission') {
      const turn = liveTurn(ref);
      const snap = turn ? missionSnapshot(turn, ref.missionId) : null;
      if (!snap) return null;
      const mission = Object.values(snap.missions)[0];
      return { data: { turn: snap, missionId: mission.id }, title: txt(mission.title) || entry.title, ref };
    }
    if (kind === 'photo') return ref.src ? { data: { src: ref.src, title: ref.title || entry.title, credit: ref.credit || '' }, title: entry.title, ref: { title: ref.title } } : null;
    if (kind === 'link') return ref.url ? { data: { url: ref.url, title: ref.title || entry.title }, title: entry.title, ref } : null;
    if (kind === 'camera') return { data: {}, title: 'Optics', ref };
    if (kind === 'look') {
      // A Look (Optics' frozen frame, its labels and its answer), from the conversation in memory.
      const conv = safe(() => deps.getConversation(), null);
      const snap = conv && conv.id === ref.conversationId ? lookSnapshot(conv, ref.frameId) : null;
      return snap ? { data: snap.data, title: snap.title || entry.title, ref } : null;
    }
    return null;
  }

  async function push(entry) {
    if (!screens.has(entry.id) || entry.external) return;
    let c = await contentOf(entry).catch(() => null);
    // A panel drawn here (floating, or in the app) reads storage itself when nothing is in memory
    // (a reply in another conversation); a screen window does that on its own.
    if (!c && entry.view) c = await loadScreenContent(entry.kind, entry.ref || {}).catch(() => null);
    if (!c || !screens.has(entry.id)) return;
    // A hologram's parts, for its commands said here ("show the battery" acts in its window).
    if (entry.kind === 'hologram' && c.data && isObj(c.data.spec)) entry.parts = partsOf(c.data.spec);
    if (entry.view) {
      if (c.title) entry.view.frame.setTitle(c.title);
      safe(() => entry.view.panel.update(c.data));
      entry.view.frame.setState('ready');
      return;
    }
    // Photos the owner sent are data: URLs: they go over the channel, never in a URL.
    post({ t: 'content', screen: entry.id, kind: entry.kind, data: c.data, title: c.title, report: !!c.report, ref: c.ref && entry.kind !== 'photo' ? c.ref : undefined });
  }

  function schedulePush(entry, force = false) {
    const now = performance.now();
    const gap = PUSH_GAP[entry.kind] || 200;
    if (force || now - (entry.lastPush || 0) >= gap) {
      clearTimeout(entry.pushTimer);
      entry.pushTimer = 0;
      entry.lastPush = now;
      push(entry);
    } else if (!entry.pushTimer) {
      entry.pushTimer = setTimeout(() => {
        entry.pushTimer = 0;
        entry.lastPush = performance.now();
        push(entry);
      }, gap - (now - (entry.lastPush || 0)));
    }
  }

  // ---- screens ----------------------------------------------------------------------------------

  function register(fields) {
    // view: { frame, panel } rendered here (a floating panel, or full screen in the app on a phone)
    // at: when it opened or last took new content (the newest one is "it"); external: a web page
    // (another site: no channel, can't be moved or shown anything else); rect: where Jarvis put it.
    const entry = { id: fields.id || newId(), mode: 'window', label: 'WINDOW', number: null, win: null, kind: 'answer', ref: {}, title: '', report: false, takenFrom: null, view: null, overlay: null, lastPush: 0, pushTimer: 0, at: Date.now(), focusAt: 0, external: false, rect: null, parts: null, selected: null, ...fields };
    screens.set(entry.id, entry);
    changed();
    return entry;
  }

  // ---- which window: named, focused, newest (v8.1) -------------------------------------------------

  const alive = (e) => !e.win || !e.win.closed;
  /** Windows Jarvis opened (a popup on this screen or another monitor, a page included): at most MAX_WINDOWS. */
  const popups = () => [...screens.values()].filter((e) => (e.mode === 'window' || e.mode === 'screen') && alive(e));
  /** Does this window have the focus right now? (Our own pages only: a web page can't be asked.) */
  function hasFocus(e) {
    if (!e || !e.win || e.external || e.mode === 'inapp') return false;
    return safe(() => e.win.document.hasFocus() === true, false);
  }
  function focusedEntry() {
    const list = [...screens.values()].filter(hasFocus);
    return list.sort((a, b) => (b.focusAt || 0) - (a.focusAt || 0))[0] || null;
  }
  const newest = (list) => list.slice().sort((a, b) => (b.at || 0) - (a.at || 0))[0] || null;
  /** Of `list`: the one with the focus, else the one "we'll do this in this window" picked, else the newest. */
  function pickOf(list) {
    if (!list.length) return null;
    return list.find(hasFocus) || (working && list.find((e) => e.id === working)) || newest(list);
  }
  const targetOf = (e) => ({ kind: e.kind, ref: { ...(e.ref || {}) }, title: e.title, live: !!e.live });
  /** The visual's part list ({ id, name, aka }) for a hologram's commands in another window. */
  function partsOf(spec) {
    const parts = isObj(spec) && Array.isArray(spec.parts) ? spec.parts : [];
    return parts.filter(isObj).map((p) => ({ id: p.id, name: p.name, aka: Array.isArray(p.aka) ? p.aka : [] }));
  }
  function moveEntry(e, r) {
    if (!e.win || e.external || e.mode === 'pip' || !r) return false;
    const ok = safe(() => {
      e.win.moveTo(r.left, r.top);
      e.win.resizeTo(r.width, r.height);
      return true;
    }, false);
    if (ok) e.rect = { ...r };
    return ok;
  }
  /** The screens to lay windows out on: every monitor when Window Management is allowed, else this one. */
  async function layoutScreens() {
    if (!details && (await wmPermission()) === 'granted' && typeof window.getScreenDetails === 'function') {
      details = await Promise.resolve(window.getScreenDetails()).catch(() => null);
    }
    const list = details && Array.isArray(details.screens) && details.screens.length ? details.screens : [window.screen];
    return { screens: list, current: (details && details.currentScreen) || window.screen };
  }

  function screenUrl(target, { id, where, number }) {
    const u = new URL(location.href);
    u.hash = '';
    u.search = '';
    const p = u.searchParams;
    p.set('screen', target.kind);
    p.set('s', id);
    p.set('w', where);
    if (number) p.set('n', String(number));
    const r = target.ref || {};
    if (target.kind === 'hologram' || target.kind === 'blueprint') {
      if (r.libraryId && !target.live) p.set('id', r.libraryId);
      else {
        if (r.conversationId) p.set('c', r.conversationId);
        if (r.turnId) p.set('t', r.turnId);
        if (r.segmentId) p.set('seg', r.segmentId);
        if (r.libraryId) p.set('id', r.libraryId);
      }
    } else if (target.kind === 'mission' || target.kind === 'answer') {
      if (r.conversationId) p.set('c', r.conversationId);
      if (r.turnId) p.set('t', r.turnId);
      if (target.kind === 'mission' && r.missionId) p.set('id', r.missionId);
    } else if (target.kind === 'look') {
      if (r.conversationId) p.set('c', r.conversationId);
      if (r.frameId) p.set('id', r.frameId);
    } else if (target.kind === 'photo' && /^https:\/\/upload\.wikimedia\.org\//.test(r.src || '')) {
      p.set('src', r.src);
    } else if (target.kind === 'link' && r.url) {
      p.set('url', r.url);
    }
    if (target.title) p.set('title', target.title.slice(0, 120));
    return u.href;
  }

  /** Is this entry showing that target? */
  function shows(entry, target) {
    if (!entry || !target || entry.kind !== target.kind) return false;
    const a = entry.ref || {};
    const b = target.ref || {};
    const same = (x, y) => !!x && x === y;
    if (entry.kind === 'hologram' || entry.kind === 'blueprint') return same(a.libraryId, b.libraryId) || same(a.segmentId, b.segmentId);
    if (entry.kind === 'mission') return same(a.turnId, b.turnId) && (!a.missionId || !b.missionId || a.missionId === b.missionId);
    if (entry.kind === 'answer') return same(a.turnId, b.turnId);
    if (entry.kind === 'photo') return same(a.src, b.src);
    if (entry.kind === 'link') return same(a.url, b.url);
    if (entry.kind === 'look') return same(a.frameId, b.frameId) && same(a.conversationId, b.conversationId);
    return entry.kind === 'camera';
  }

  /**
   * Move out: the in-app viewer that showed this closes (one live WebGL context at a time), and so
   * does another screen showing the same thing ("float it", then "put it on my other screen").
   * True when it came from an in-app viewer (closing the screen later hands it back there).
   */
  function takeFromApp(target, keep = null) {
    let fromViewer = false;
    for (const other of [...screens.values()]) {
      if (other === keep || !shows(other, target)) continue;
      if (other.takenFrom === 'viewer') fromViewer = true;
      other.takenFrom = null; // it moves on: no hand back from there
      closeEntry(other);
    }
    if (target.fromViewer && typeof deps.closeInApp === 'function' && safe(() => deps.closeInApp(target), false)) fromViewer = true;
    return fromViewer;
  }

  function outcome(status, target, extra = {}) {
    return { status, kind: target ? target.kind : null, title: target ? target.title : '', report: !!(target && target.ref && target.ref.report), ...extra };
  }

  function showIn(entry, target, takenFrom) {
    if (entry.kind !== target.kind) entry.cameraState = undefined; // the new panel reports its own
    if (!shows(entry, target)) {
      entry.parts = null;
      entry.selected = null;
    }
    entry.at = Date.now(); // the newest thing put on a screen
    entry.kind = target.kind;
    entry.ref = { ...(target.ref || {}) };
    entry.title = target.title || '';
    entry.report = !!(target.ref && target.ref.report);
    entry.live = !!target.live;
    entry.takenFrom = takenFrom ? 'viewer' : entry.takenFrom && entry.kind === target.kind ? entry.takenFrom : null;
    if (entry.mode === 'pip') mountPip(entry);
    else if (entry.mode === 'inapp') mountInapp(entry);
    // start: the camera turns on there at once (every showIn is the owner's request, or Jarvis moving a
    // camera that is on); a camera screen that is reloaded or restored waits for a tap (screen-page.js).
    else post({ t: 'show', screen: entry.id, kind: entry.kind, ref: entry.kind === 'photo' ? { title: entry.ref.title } : entry.ref, title: entry.title, report: entry.report, start: entry.kind === 'camera' });
    schedulePush(entry, true);
    changed();
  }

  /** The window to reuse for this placement, or null for a new one ({ entry, replaced } when it takes the oldest one's place). */
  function reuseFor(target, plan) {
    const ours = popups().filter((s) => !s.external);
    // One window per monitor; a window standing in for a float or a monitor (a fallback) is reused.
    if (plan.mode === 'screen' || plan.note) {
      const existing = ours.find((s) => s.mode === plan.mode && (plan.mode === 'window' || s.label === plan.label));
      return existing ? { entry: existing } : null;
    }
    // "In a window", "in another window" (v8.1): a window of its own, unless one shows it already.
    const same = ours.find((s) => s.mode === 'window' && shows(s, target));
    if (same) return { entry: same, already: true };
    const open = popups();
    if (open.length < MAX_WINDOWS) return null;
    const oldest = open.slice().sort((a, b) => (a.at || 0) - (b.at || 0))[0];
    const replaced = { kind: oldest.kind, report: !!oldest.report, title: oldest.title };
    // A page can't show Jarvis's things: once the new window is open, the page closes.
    if (oldest.external) return { entry: null, replaced, close: oldest };
    return { entry: oldest, replaced };
  }

  /**
   * Room for one more window beside Jarvis (v8.1): the windows on his screen and the new one are laid
   * out side by side or in a grid, a strip of his own window kept in view (layoutRects). The first
   * window keeps today's place (the right half). -> { plan, moves: [[entry, rect]] } (the others move
   * once the new window has opened).
   */
  function placeAmong(plan, skip = null) {
    const others = popups()
      .filter((s) => s.mode === 'window' && !s.external && s !== skip)
      .sort((a, b) => (a.at || 0) - (b.at || 0));
    if (!others.length || plan.mode !== 'window' || plan.note) return { plan, moves: [] };
    const keep = others.slice(-(MAX_WINDOWS - 1));
    const rects = layoutRects({ screens: [window.screen], current: window.screen, main: windowRect(window), count: keep.length + 1, layout: 'side-by-side' });
    const rect = rects[rects.length - 1];
    return { plan: { ...plan, rect, features: screenWindowFeatures(rect) }, moves: keep.map((e, i) => [e, rects[i]]) };
  }

  async function openWindow(target, plan, cmd, gesture) {
    const where = plan.mode === 'screen' ? 'other' : 'window';
    if (target.kind === 'link') return openLink(target, plan, cmd, gesture);
    // A window already open there takes the new content (no gesture needed).
    const reuse = reuseFor(target, plan);
    if (reuse && reuse.entry) {
      const existing = reuse.entry;
      if (!reuse.already) {
        const taken = takeFromApp(target, existing);
        showIn(existing, target, taken);
      }
      safe(() => existing.win && existing.win.focus());
      dismissPrompt();
      return outcome('opened', target, { mode: existing.mode, label: existing.label, note: plan.note, screenName: plan.screenName, internal: plan.internal, reused: true, already: !!reuse.already, replaced: reuse.replaced || null });
    }
    const room = cmd.rect ? { plan, moves: [] } : placeAmong(plan, reuse && reuse.close);
    plan = room.plan;
    const id = newId();
    let url = screenUrl(target, { id, where, number: plan.number });
    // A camera window turns the camera on by itself only on this first load (a one-time nonce): a
    // reload, or Chrome restoring the window later, shows "Turn on camera" instead.
    if (target.kind === 'camera') {
      const go = armCameraGo(id);
      if (go) url = `${url}#go=${go}`;
    }
    const w = safe(() => window.open(url, `jarvis-${id}`, plan.features), null);
    if (!w) return needsTap(target, plan, cmd);
    dismissPrompt();
    if (reuse && reuse.close) closeEntry(reuse.close);
    for (const [e, r] of room.moves) moveEntry(e, r);
    const taken = takeFromApp(target);
    const entry = register({ id, mode: plan.mode, label: plan.label, number: plan.number || null, win: w, kind: target.kind, ref: { ...(target.ref || {}) }, title: target.title, report: !!(target.ref && target.ref.report), live: !!target.live, takenFrom: taken ? 'viewer' : null, rect: plan.rect || null });
    safe(() => w.focus());
    watchClosed(entry);
    return outcome('opened', target, { mode: plan.mode, label: plan.label, note: plan.note, screenName: plan.screenName, internal: plan.internal, replaced: (reuse && reuse.replaced) || null });
  }

  /**
   * A web page in its own window (placed like a screen); the page never gets a handle on Jarvis.
   * Tracked like Jarvis's own windows (v8.1): "close that window" closes it; being another site's
   * page, it can't be moved or shown anything else.
   */
  function openLink(target, plan, cmd) {
    const url = target.ref && target.ref.url;
    if (!url) return outcome('error', target, { message: 'That link can’t be opened.' });
    // The same page in a window already: raised, not opened twice.
    const same = popups().find((s) => s.external && shows(s, target));
    if (same) {
      safe(() => same.win.focus());
      dismissPrompt();
      return outcome('opened', target, { mode: same.mode, label: same.label, note: plan.note, reused: true, already: true });
    }
    const reuse = plan.mode === 'window' && !plan.note && popups().length >= MAX_WINDOWS ? popups().sort((a, b) => (a.at || 0) - (b.at || 0))[0] : null;
    const room = cmd.rect || plan.mode !== 'window' ? { plan, moves: [] } : placeAmong(plan, reuse);
    const id = newId();
    const w = safe(() => window.open('about:blank', `jarvis-link-${id}`, room.plan.features), null);
    if (!w) return needsTap(target, room.plan, cmd);
    dismissPrompt();
    safe(() => {
      w.opener = null;
    });
    safe(() => {
      w.location.replace(url);
    });
    const replaced = reuse ? { kind: reuse.kind, report: !!reuse.report, title: reuse.title } : null;
    if (reuse) closeEntry(reuse);
    for (const [e, r] of room.moves) moveEntry(e, r);
    const entry = register({ id, mode: room.plan.mode, label: room.plan.label, number: room.plan.number || null, win: w, kind: 'link', ref: { ...(target.ref || {}) }, title: target.title, external: true, rect: room.plan.rect || null });
    watchClosed(entry);
    return outcome('opened', target, { mode: room.plan.mode, label: room.plan.label, note: room.plan.note, screenName: room.plan.screenName, internal: room.plan.internal, replaced });
  }

  function watchClosed(entry) {
    // A screen that is closed with the window's own close button tells us over the channel; this
    // also covers a crash or a browser without BroadcastChannel.
    const timer = setInterval(() => {
      if (!screens.has(entry.id)) return clearInterval(timer);
      if (entry.win && entry.win.closed) {
        clearInterval(timer);
        gone(entry, { back: false });
      }
    }, 1500);
  }

  // ---- the floating panel ----------------------------------------------------------------------

  function mountPip(entry) {
    const pipWin = entry.win;
    if (entry.view) {
      safe(() => entry.view.panel.destroy());
      safe(() => entry.view.frame.destroy());
    }
    const frame = createScreenFrame({
      win: pipWin,
      label: 'FLOAT',
      kind: entry.kind,
      report: entry.report,
      title: entry.title,
      where: 'beside',
      compact: true,
      onBack: () => backFrom(entry),
      onClose: () => safe(() => pipWin.close()),
    });
    pipWin.document.body.replaceChildren(frame.el);
    // Mounted inside the owner's request (a command, a tap, or a camera that is on moving here): a
    // camera turns on at once.
    const panel = createScreenPanel(entry.kind, {
      win: pipWin,
      frame,
      compact: true,
      autoStart: true,
      deps: { ...panelDeps, snapshot: typeof deps.snapshot === 'function' ? (spec, size) => deps.snapshot(spec, size) : null, onCameraState: (st) => setCameraState(entry, st), onState: (st) => noteState(entry, st) },
    });
    frame.body.append(panel.el);
    entry.view = { frame, panel };
  }

  /** A hologram panel's parts and selection (its commands are said in the main window). */
  function noteState(entry, st) {
    if (!isObj(st)) return;
    if (Array.isArray(st.parts)) entry.parts = st.parts;
    if ('selected' in st) entry.selected = st.selected || null;
  }

  /** Phones and tablets: one screen, no popups. The screen opens full screen inside the app. */
  function mountInapp(entry) {
    if (entry.view) {
      safe(() => entry.view.panel.destroy());
      safe(() => entry.view.frame.destroy());
    }
    const compact = window.innerWidth < 700;
    const frame = createScreenFrame({ win: window, label: 'SCREEN', kind: entry.kind, report: entry.report, title: entry.title, where: 'inapp', compact, setDocumentTitle: false, onClose: () => closeEntry(entry) });
    const panel = createScreenPanel(entry.kind, { win: window, frame, compact, autoStart: true, deps: { ...panelDeps, onCameraState: (st) => setCameraState(entry, st) } });
    frame.body.append(panel.el);
    if (!entry.overlay) {
      const host = h('div', { class: 'scr-inapp', attrs: { 'data-testid': 'screen-inapp' } });
      entry.overlay = openOverlay({ el: host, label: 'Screen', onEscape: () => closeEntry(entry), initialFocus: () => host.querySelector('[data-testid="screen-close"]') });
      entry.host = host;
    }
    entry.host.replaceChildren(frame.el);
    entry.view = { frame, panel };
  }

  function openInapp(target, plan) {
    const open = [...screens.values()].find((s) => s.mode === 'inapp');
    if (open) {
      showIn(open, target, false);
      return outcome('opened', target, { mode: 'inapp', label: 'SCREEN', note: plan.note, reused: true });
    }
    const entry = register({ mode: 'inapp', label: 'SCREEN', kind: target.kind, ref: { ...(target.ref || {}) }, title: target.title, report: !!(target.ref && target.ref.report), live: !!target.live });
    mountInapp(entry);
    schedulePush(entry, true);
    return outcome('opened', target, { mode: 'inapp', label: 'SCREEN', note: plan.note });
  }

  async function openPip(target, plan, cmd, gesture) {
    const open = [...screens.values()].find((s) => s.mode === 'pip' && s.win && !s.win.closed);
    if (open) {
      const taken = takeFromApp(target, open);
      showIn(open, target, taken);
      dismissPrompt();
      return outcome('opened', target, { mode: 'pip', label: 'FLOAT', note: plan.note, reused: true });
    }
    const stray = currentPipWindow();
    if (stray) safe(() => stray.close());
    if (!gesture) return needsTap(target, plan, cmd);
    let pipWin;
    try {
      pipWin = await openPipWindow({ width: plan.width, height: plan.height });
    } catch (err) {
      if (err && err.name === 'NotAllowedError') return needsTap(target, plan, cmd);
      console.warn('[jarvis] floating panel failed, using a window:', err && err.message);
      const fallback = { mode: 'window', rect: rightHalf(window.screen), features: screenWindowFeatures(rightHalf(window.screen)), label: 'WINDOW', note: 'no-pip' };
      return openWindow(target, fallback, cmd, gesture);
    }
    dismissPrompt();
    const taken = takeFromApp(target);
    const entry = register({ mode: 'pip', label: 'FLOAT', win: pipWin, kind: target.kind, ref: { ...(target.ref || {}) }, title: target.title, report: !!(target.ref && target.ref.report), live: !!target.live, takenFrom: taken ? 'viewer' : null });
    mountPip(entry);
    pipWin.addEventListener('focus', () => {
      entry.focusAt = Date.now();
    });
    // Closed by Chrome's "back to tab" button, the app's tab gets the focus: hand it back there.
    pipWin.addEventListener(
      'pagehide',
      () => {
        const back = !!entry.backing;
        setTimeout(() => gone(entry, { back: back || safe(() => document.hasFocus(), false) }), 250);
      },
      { once: true },
    );
    schedulePush(entry, true);
    return outcome('opened', target, { mode: 'pip', label: 'FLOAT', note: plan.note });
  }

  // ---- the camera on screens ---------------------------------------------------------------------

  function setCameraState(entry, st) {
    const next = typeof st === 'string' ? st : undefined;
    if (entry.cameraState === next) return;
    entry.cameraState = next;
    if (screens.has(entry.id)) changed();
  }

  /**
   * A camera screen whose camera runs or is starting. `unknownIsOn`: also one that has not said yet
   * (a screen window still loading): the indicator errs on the side of LIVE; a tool call does not.
   */
  function cameraScreenOn({ unknownIsOn = false } = {}) {
    return [...screens.values()].some((s) => s.kind === 'camera' && (CAMERA_ON.has(s.cameraState) || (unknownIsOn && s.cameraState === undefined)));
  }

  /** Is a camera on right now: Optics' in this window, or a camera screen's? */
  function cameraIsOn() {
    return safe(() => typeof deps.cameraLive === 'function' && deps.cameraLive() === true, false) || cameraScreenOn();
  }

  /**
   * Jarvis's open_screen asked for the camera while it is off. A tool call never turns a camera on:
   * the owner gets "Turn on camera" (the tap is also the gesture a window or a floating panel needs).
   */
  function cameraTap(target, cmd) {
    const go = h(
      'button',
      {
        class: 'scr-btn scr-btn--primary',
        type: 'button',
        attrs: { 'data-testid': 'screens-camera-on' },
        on: {
          click: () => {
            dismissPrompt();
            Promise.resolve(place(target, cmd, { gesture: true }))
              .then((o) => {
                if (o && o.status !== 'opened') toast(screenMessage(o), { level: 'warn', id: 'screens' });
              })
              .catch((err) => console.error('[jarvis] screen failed:', err));
          },
        },
      },
      icon('camera', { size: 18 }),
      h('span', { text: 'Turn on camera' }),
    );
    const no = h('button', { class: 'scr-btn', type: 'button', attrs: { 'data-testid': 'screens-camera-not-now' }, on: { click: () => dismissPrompt() } }, h('span', { text: 'Not now' }));
    showPrompt({ testid: 'screens-camera-tap', label: 'Screens · camera', title: 'Turn on the camera?', text: 'Jarvis asked to show your camera. It stays off until you turn it on.', actions: [go, no] });
    return outcome('needs_tap', target, { button: 'Turn on camera', note: 'camera-off' });
  }

  // ---- placement --------------------------------------------------------------------------------

  async function place(target, cmd, { gesture = false, stopped = () => false } = {}) {
    const env = detectScreenEnv(window);
    let permission = null;
    if (cmd.where === 'other' && env.windowManagement) {
      permission = await wmPermission();
      if (permission === 'granted' && !details) {
        details = await Promise.resolve(window.getScreenDetails()).catch(() => null);
        if (details && typeof details.addEventListener === 'function') safe(() => details.addEventListener('screenschange', () => {}));
      }
    }
    // The turn that asked was stopped while the browser answered: nothing opens, no button.
    if (stopped()) return outcome('nothing', target, { message: 'Stopped.' });
    let plan = planPlacement({ where: cmd.where, kind: target.kind, env, permission, details, currentScreen: window.screen, screen: cmd.screen, target: cmd.target, fullscreen: !!cmd.fullscreen });
    // A place chosen already (a page beside Jarvis, v8.1): a window there.
    if (cmd.rect && plan.mode !== 'inapp' && plan.mode !== 'tab') plan = { mode: 'window', rect: cmd.rect, features: screenWindowFeatures(cmd.rect), label: 'WINDOW', note: null };
    if (plan.mode === 'inapp') {
      // The app's own full-screen viewers where it has them (the camera: Optics); the screen frame
      // for the rest.
      if (target.kind === 'hologram' || target.kind === 'blueprint' || target.kind === 'mission' || target.kind === 'camera' || target.kind === 'look') {
        safe(() => deps.showInApp(target, { reason: 'inapp' }));
        return outcome('opened', target, { mode: 'inapp', label: 'SCREEN', note: plan.note });
      }
      return openInapp(target, plan);
    }
    if (plan.mode === 'tab') {
      const w = safe(() => window.open(target.ref.url, '_blank', 'noopener,noreferrer'), null);
      void w;
      return outcome('opened', target, { mode: 'tab', label: 'TAB', note: plan.note });
    }
    if (plan.mode === 'ask') return explain(target, cmd);
    if (plan.mode === 'pip') return openPip(target, plan, cmd, gesture);
    return openWindow(target, plan, cmd, gesture);
  }

  // ---- prompts: the one-tap button and the permission explainer ------------------------------------

  function dismissPrompt() {
    if (!prompt) return;
    const p = prompt;
    prompt = null;
    clearTimeout(p.timer);
    p.el.remove();
  }

  function showPrompt({ testid, label, title, text, actions, tip }) {
    dismissPrompt();
    const close = h('button', { class: 'scr-prompt__close', type: 'button', attrs: { 'aria-label': 'Dismiss', 'data-testid': `${testid}-dismiss` }, on: { click: () => dismissPrompt() } }, icon('close', { size: 18 }));
    const el = h(
      'section',
      { class: 'scr-prompt', attrs: { 'data-testid': testid, role: 'dialog', 'aria-label': title } },
      close,
      h('p', { class: 'scr-prompt__label', text: label }),
      h('h2', { class: 'scr-prompt__title', text: title }),
      text ? h('p', { class: 'scr-prompt__text', text }) : null,
      h('div', { class: 'scr-prompt__actions' }, actions),
      tip || null,
    );
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        dismissPrompt();
      }
    });
    document.body.appendChild(el);
    const entry = { el, timer: setTimeout(() => prompt && prompt.el === el && dismissPrompt(), PROMPT_MS) };
    prompt = entry;
    return el;
  }

  function buttonLabel(plan) {
    if (plan.mode === 'screen') return `Open on ${plan.label.toLowerCase()}`;
    if (plan.mode === 'pip') return 'Float it';
    return 'Open window';
  }

  function needsTap(target, plan, cmd) {
    const button = (cmd && typeof cmd.button === 'string' && cmd.button) || buttonLabel(plan);
    const name = screenKindName(target.kind, { report: !!(target.ref && target.ref.report) });
    let tip = null;
    if (!prefs.tipShown && plan.mode !== 'pip') {
      prefs.tipShown = true;
      savePrefs({ tipShown: true });
      tip = h(
        'p',
        { class: 'scr-prompt__tip', attrs: { 'data-testid': 'screens-tip' } },
        h('b', { text: 'Tip: ' }),
        'so spoken commands can open screens without a tap, let Jarvis open pop-ups. In Chrome, click the blocked pop-up icon at the right of the address bar and choose “Always allow pop-ups and redirects” for this site. Floating panels always need one tap.',
      );
    }
    const go = h(
      'button',
      {
        class: 'scr-btn scr-btn--primary',
        type: 'button',
        attrs: { 'data-testid': 'screens-tap-button' },
        on: {
          click: () => {
            dismissPrompt();
            Promise.resolve(place(target, cmd, { gesture: true }))
              .then((o) => {
                if (o && o.status !== 'opened') toast(screenMessage(o), { level: 'warn', id: 'screens' });
              })
              .catch((err) => console.error('[jarvis] screen failed:', err));
          },
        },
      },
      icon(plan.mode === 'pip' ? 'layers' : 'external', { size: 18 }),
      h('span', { text: button }),
    );
    showPrompt({ testid: 'screens-tap', label: 'Screens · one tap', title: `${name.charAt(0).toUpperCase()}${name.slice(1)} is ready`, text: 'The browser needs one tap before Jarvis can open a new window.', actions: [go], tip });
    return outcome('needs_tap', target, { mode: plan.mode, label: plan.label, button, note: plan.note });
  }

  function explain(target, cmd) {
    const allow = h(
      'button',
      {
        class: 'scr-btn scr-btn--primary',
        type: 'button',
        attrs: { 'data-testid': 'screens-allow' },
        on: {
          click: async () => {
            dismissPrompt();
            try {
              details = await window.getScreenDetails();
            } catch {
              details = null;
            }
            const o = await place(target, cmd, { gesture: hasGesture('typed') });
            if (o && o.status !== 'opened' && o.status !== 'needs_tap') toast(screenMessage(o), { level: 'warn', id: 'screens' });
            else if (o && o.status === 'opened') toast(screenMessage(o), { level: 'success', id: 'screens' });
          },
        },
      },
      icon('laptop', { size: 18 }),
      h('span', { text: 'Allow screen placement' }),
    );
    const float = h(
      'button',
      {
        class: 'scr-btn',
        type: 'button',
        attrs: { 'data-testid': 'screens-float-instead' },
        on: {
          click: () => {
            dismissPrompt();
            Promise.resolve(place(target, { ...cmd, where: 'beside' }, { gesture: true })).then((o) => toast(screenMessage(o), { level: o && o.status === 'opened' ? 'success' : 'warn', id: 'screens' }));
          },
        },
      },
      h('span', { text: 'Float it beside me' }),
    );
    showPrompt({
      testid: 'screens-explainer',
      label: 'Screens · second monitor',
      title: 'Use your other monitor?',
      text: 'Chrome will ask once to let Jarvis manage windows, so it can put screens on your other monitor. Jarvis only places its own windows, and only when you ask.',
      actions: [allow, float],
    });
    return outcome('needs_permission', target, { mode: 'screen', label: 'SCREEN', button: 'Allow screen placement' });
  }

  // ---- closing and handing back ------------------------------------------------------------------

  function gone(entry, { back }) {
    if (!screens.has(entry.id)) return;
    screens.delete(entry.id);
    changed();
    clearTimeout(entry.pushTimer);
    if (entry.view) {
      safe(() => entry.view.panel.destroy());
      safe(() => entry.view.frame.destroy());
      entry.view = null;
    }
    if (entry.overlay) {
      safe(() => entry.overlay.close());
      entry.overlay = null;
    }
    if (entry.mode === 'inapp') return; // it was already in the app
    if (back || entry.takenFrom === 'viewer') {
      const target = { kind: entry.kind, ref: entry.ref, title: entry.title, live: entry.live };
      safe(() => deps.showInApp(target, { reason: 'handback', back: !!back }));
    }
  }

  function closeEntry(entry, { back = false } = {}) {
    entry.backing = back;
    if (entry.mode === 'inapp') {
      gone(entry, { back: false });
      return;
    }
    if (entry.mode === 'pip' && entry.win) {
      safe(() => entry.win.close());
      gone(entry, { back });
      return;
    }
    post({ t: 'close', screen: entry.id });
    if (entry.win) safe(() => entry.win.close());
    gone(entry, { back });
  }

  function backFrom(entry) {
    closeEntry(entry, { back: true });
  }

  /**
   * Close windows (v8.1: only the ones meant). all: every one; screen: that monitor's; where 'beside':
   * the floating panel; where 'other': the other monitor's (all of them, or the one with the focus,
   * else the newest); which: the one showing that kind; otherwise the one with the focus, else the
   * newest. back: the one closed comes back to the main window (with `all`, the newest one).
   */
  function closeScreens({ where = null, screen = null, back = false, tool = false, all = false, which = null } = {}) {
    const every = [...screens.values()];
    let list = every;
    if (all) list = every;
    else if (screen) list = every.filter((s) => s.number === screen || s.label === `SCREEN ${screen}`);
    else if (where === 'beside') list = every.filter((s) => s.mode === 'pip');
    else if (which) {
      const one = pickOf(every.filter((s) => s.kind === which));
      if (!one) return { status: 'closed', count: 0, which, kind: which, label: '', back: false };
      list = [one];
    } else if (where === 'other') {
      const others = every.filter((s) => s.mode === 'screen');
      list = others.length ? [pickOf(others)] : [];
    } else {
      const one = pickOf(every);
      list = one ? [one] : [];
    }
    list = list.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    const last = list[list.length - 1] || null;
    // Handed back to the main window: the newest one. From Jarvis's tool, a camera only while it is
    // on (Optics would turn it on again): a camera screen whose camera is off just closes.
    const handBack = (s) => back && s === last && !(tool && s.kind === 'camera' && !CAMERA_ON.has(s.cameraState));
    const backLast = !!last && handBack(last);
    for (const s of list) closeEntry(s, { back: handBack(s) });
    if (working && !screens.has(working)) working = null;
    const plain = !screen && where !== 'other' && !which;
    // A floating panel opened before a reload (no entry here).
    if (!list.length && (where === 'beside' || plain)) {
      const stray = currentPipWindow();
      if (stray) {
        safe(() => stray.close());
        return { status: 'closed', count: 1, label: 'FLOAT', kind: null, back: false };
      }
    }
    if (!list.length && plain && where !== 'beside') post({ t: 'close', screen: '*' });
    return { status: 'closed', count: list.length, label: last ? last.label : '', kind: last ? last.kind : null, title: last ? last.title : '', report: !!(last && last.report), back: backLast, which: which || null };
  }

  // ---- channel: screens saying hello, closing, handing back ------------------------------------------

  if (channel) {
    channel.onmessage = (e) => {
      const m = e && e.data;
      if (!isObj(m) || typeof m.screen !== 'string') return;
      let entry = screens.get(m.screen);
      if (m.t === 'hello' || m.t === 'here') {
        // A screen this window doesn't know (it was opened before a reload): adopt it.
        if (!entry && typeof m.kind === 'string') {
          const where = m.where || 'window';
          entry = register({ id: m.screen, mode: where === 'other' ? 'screen' : 'window', label: txt(m.label) || screenLabel(where, null), kind: m.kind, ref: isObj(m.ref) ? m.ref : {} });
        } else if (entry && typeof m.kind === 'string') {
          entry.kind = m.kind;
          if (isObj(m.ref)) entry.ref = { ...entry.ref, ...m.ref };
        }
        if (entry && m.t === 'hello') schedulePush(entry, true);
        return;
      }
      if (!entry) return;
      if (m.t === 'camera') setCameraState(entry, txt(m.state) || undefined);
      else if (m.t === 'back') gone(entry, { back: true });
      else if (m.t === 'closed') gone(entry, { back: false });
      else if (m.t === 'focus') entry.focusAt = Date.now();
      else if (m.t === 'state') {
        // A hologram's parts and selection there, for its commands said here (v8.1).
        if (Array.isArray(m.parts)) entry.parts = m.parts.filter(isObj).slice(0, 200).map((p) => ({ id: txt(p.id), name: txt(p.name), aka: Array.isArray(p.aka) ? p.aka.filter((x) => typeof x === 'string') : [] }));
        if (m.selected === null || typeof m.selected === 'string') entry.selected = m.selected || null;
      }
    };
    post({ t: 'who' });
  }

  // ---- several windows (v8.1): layouts, "this window", the front, commands inside ----------------------

  /**
   * "Side by side", "camera on the left, hologram on the right", "split the screen": the windows
   * Jarvis opened, laid out (layoutRects): on the other monitor when there is one (Window Management
   * allowed), else beside Jarvis with a strip of him kept in view. Named things not yet in a window
   * open in one first. Floating panels and pages from the web can't be moved by script: they stay.
   */
  async function arrange({ layout = 'side-by-side', a = null, b = null } = {}, { source = 'voice', gesture } = {}) {
    const g = gesture === undefined ? hasGesture(source) : gesture;
    for (const kind of [a, b]) {
      if (!kind || popups().some((e) => e.kind === kind && !e.external)) continue;
      const o = await run({ action: 'open', what: kind, where: 'window', screen: null, target: null, ordinal: null, fullscreen: false }, { source, gesture: g });
      if (!o || o.status !== 'opened') return o;
    }
    const movable = popups().filter((e) => !e.external);
    const pick = (k) => (k ? pickOf(movable.filter((e) => e.kind === k)) : null);
    const ea = pick(a);
    const eb = pick(b);
    const rest = movable.filter((e) => e !== ea && e !== eb).sort((x, y) => (x.at || 0) - (y.at || 0));
    if (!ea && !eb && !rest.length) return { status: 'nothing', message: popups().length ? 'Pages from the web can’t be moved, only Jarvis’s own windows.' : 'There’s nothing in a window to arrange yet.' };
    // Left to right: the one named for the left, the one named for the right, then the rest.
    let list;
    let side = null;
    if (ea && eb) list = [ea, eb, ...rest];
    else if (ea) list = [ea, ...rest];
    else if (eb) list = rest.length ? [rest[0], eb, ...rest.slice(1)] : [eb];
    else list = rest;
    list = list.slice(0, MAX_WINDOWS);
    if (list.length === 1 && (ea || eb)) side = ea ? 'left' : 'right'; // one window, on the side named
    const where = await layoutScreens();
    const opts = { ...where, main: windowRect(window), count: list.length, layout, side };
    const rects = layoutRects(opts);
    let moved = 0;
    list.forEach((e, i) => {
      if (moveEntry(e, rects[i])) moved += 1;
    });
    if (!moved) return { status: 'nothing', message: 'Those windows can’t be moved.' };
    const named = (a ? 1 : 0) + (b ? 1 : 0);
    return { status: 'arranged', layout: named && list.length <= 2 ? 'left-right' : layout, count: list.length, names: list.map((e) => e.kind), screen: layoutArea(opts).screen, side };
  }

  /**
   * "Do this in this window", "show it here" (D4): the window that has the focus, else the main one,
   * and Jarvis says which. A window picked this way is where "it" lives from now on (its content is
   * "this", and its viewer commands go there). "Show the report here": the report comes to it.
   */
  async function here({ which = null } = {}) {
    const win = focusedEntry();
    if (win) {
      working = win.id;
      if (which && which !== win.kind && !win.external && win.mode !== 'inapp') {
        const target = await resolve({ what: which });
        if (!target || target.error) return { status: 'nothing', message: (target && target.message) || 'There’s nothing to show yet.', kind: which };
        showIn(win, target, takeFromApp(target, win));
        recent = { target: targetOf(win), at: Date.now() };
        const report = !!(target.ref && target.ref.report);
        return { status: 'here', where: 'window', moved: true, kind: target.kind, report, windowKind: target.kind, windowReport: report };
      }
      recent = { target: targetOf(win), at: Date.now() };
      return { status: 'here', where: 'window', moved: false, kind: win.kind, report: !!win.report, label: win.label };
    }
    // The main window: what was named, or the window "we" were working in, comes back here.
    const was = working;
    working = null;
    const list = [...screens.values()].filter((e) => e.mode !== 'inapp' && !e.external);
    const there = which ? pickOf(list.filter((e) => e.kind === which)) : list.find((e) => e.id === was) || null;
    if (there) {
      closeEntry(there, { back: true });
      return { status: 'here', where: 'main', moved: true, kind: there.kind, report: !!there.report };
    }
    return { status: 'here', where: 'main', moved: false, kind: which || null };
  }

  /** "Show me the hologram window": brought to the front (a page or a floating panel too). */
  function focusWindow({ which = null } = {}) {
    const e = pickOf([...screens.values()].filter((s) => s.kind === which && s.mode !== 'inapp'));
    if (!e) return { status: 'closed', count: 0, which, kind: which };
    safe(() => e.win && e.win.focus());
    return { status: 'focused', kind: e.kind, report: !!e.report, label: e.label };
  }

  /**
   * A viewer command for the window showing `kind` (D3: "explode it" while the hologram is in a
   * window acts there). A floating panel runs it here; a screen window gets it over the channel.
   * null when no window shows it, or the command needs the main window's viewer, or there is no
   * channel: the app opens it in the main window, as before.
   */
  function commandIn(kind, command) {
    if (!isObj(command) || typeof command.action !== 'string') return null;
    const list = [...screens.values()].filter((e) => e.kind === kind && !e.external && e.mode !== 'inapp' && alive(e));
    const e = pickOf(list);
    if (!e) return null;
    if (command.action === 'close') {
      closeEntry(e);
      return { handled: true, command, label: e.label, kind: e.kind, closed: true };
    }
    if (kind !== 'hologram' || !HOLO_ACTIONS.has(command.action)) return null;
    const cmd = { ...command, partId: command.partId || (command.action === 'isolate' || command.action === 'focus' ? e.selected : undefined) };
    if (e.mode === 'pip') {
      const panel = e.view && e.view.panel;
      if (!panel || typeof panel.command !== 'function') return null;
      const word = safe(() => panel.command(cmd), '');
      return { handled: true, command: cmd, label: e.label, kind: e.kind, word: txt(word) };
    }
    if (!channel) return null;
    post({ t: 'command', screen: e.id, command: cmd });
    return { handled: true, command: cmd, label: e.label, kind: e.kind };
  }

  // ---- entry points -------------------------------------------------------------------------------

  async function run(cmd, { source = 'typed', gesture, signal = null } = {}) {
    // Jarvis's turn was stopped (signal, the tool's): nothing more is placed or offered (v7.1).
    const stopped = () => !!(signal && signal.aborted);
    if (stopped()) return { status: 'nothing', message: 'Stopped.', kind: cmd.what };
    if (cmd.action === 'back') {
      if (!screens.size && !currentPipWindow()) return { status: 'closed', count: 0 };
      // v8.1: "bring the hologram back" brings that one; "bring it back" the focused or newest one;
      // "bring everything back" closes them all (the newest comes back).
      const which = cmd.what && cmd.what !== 'this' ? cmd.what : null;
      return closeScreens({ back: true, tool: source === 'tool', all: !!cmd.all, which });
    }
    if (cmd.action === 'close') return closeScreens({ where: cmd.where, screen: cmd.screen, all: !!cmd.all, which: cmd.which || null });
    const target = await resolve(cmd);
    if (stopped()) return { status: 'nothing', message: 'Stopped.', kind: cmd.what };
    if (!target || target.error) return { status: 'nothing', message: (target && target.message) || 'There’s nothing to put on a screen yet.', kind: cmd.what };
    // A tool call never turns the camera on: it may move a camera that is on, else the owner taps.
    if (source === 'tool' && target.kind === 'camera' && !cameraIsOn()) {
      const { fromViewer, ...rest } = target;
      void fromViewer;
      recent = { target: rest, at: Date.now() };
      return cameraTap(target, cmd);
    }
    const o = await place(target, cmd, { gesture: gesture === undefined ? hasGesture(source) : gesture, stopped });
    if (o && (o.status === 'opened' || o.status === 'needs_tap' || o.status === 'needs_permission')) {
      const { fromViewer, ...rest } = target;
      void fromViewer;
      recent = { target: rest, at: Date.now() };
    }
    return o;
  }

  return {
    /**
     * A typed or spoken command: null when the words are not a screen command (they go to Jarvis),
     * else { handled: true, command, done: Promise<outcome> }. Call it inside the click or key press
     * that sent the words: popups and floating panels need that gesture.
     */
    command(text, { source = 'typed' } = {}) {
      const cmd = matchScreenCommand(text);
      if (!cmd) return null;
      if (cmd.action === 'close' && cmd.ambiguous && !screens.size && !currentPipWindow()) return null;
      const gesture = hasGesture(source);
      const done = run(cmd, { source, gesture }).catch((err) => {
        console.error('[jarvis] screen command failed:', err);
        return { status: 'error', message: 'That screen couldn’t open.' };
      });
      return { handled: true, command: cmd, done };
    },
    /**
     * The open_screen tool (engine deps.screens.open): never has a gesture. `signal`: the turn's;
     * once it aborts (Stop), a placement still under way is dropped (no window, no button).
     */
    openFromTool(input = {}, { signal = null } = {}) {
      const where = input.where === 'back' ? null : input.where;
      const cmd = { action: input.where === 'back' ? 'back' : 'open', what: input.what || 'this', where, screen: input.screen || null, url: input.url || null, id: input.id || null, ordinal: null, target: null, fullscreen: false };
      return run(cmd, { source: 'tool', gesture: false, signal }).catch((err) => ({ status: 'error', message: String((err && err.message) || err) }));
    },
    onRunEvent(runEntry, evt) {
      if (!screens.size || !evt || !runEntry || !runEntry.conv) return;
      const convId = runEntry.conv.id;
      const turnId = evt.turn && evt.turn.id;
      for (const s of screens.values()) {
        const r = s.ref || {};
        if (r.conversationId !== convId || (turnId && r.turnId && r.turnId !== turnId)) continue;
        if (s.kind === 'hologram' || s.kind === 'blueprint') {
          if (evt.type !== 'segment' && evt.type !== 'end') continue;
          if (evt.type === 'segment' && (!evt.segment || evt.segment.id !== r.segmentId)) continue;
        } else if (s.kind === 'answer' || s.kind === 'look') {
          // A Look follows its answer and its labels as they stream (any turn of its conversation).
          if (evt.type !== 'segment' && evt.type !== 'turn' && evt.type !== 'end') continue;
        } else if (s.kind === 'mission') {
          if (evt.type !== 'mission' && evt.type !== 'agent' && evt.type !== 'turn' && evt.type !== 'end') continue;
        } else continue;
        schedulePush(s, evt.type === 'end' || (evt.type === 'segment' && evt.segment && evt.segment.status !== 'building'));
      }
    },
    onRunDone(runEntry) {
      if (!runEntry || !runEntry.conv) return;
      for (const s of screens.values()) if (s.ref && s.ref.conversationId === runEntry.conv.id) schedulePush(s, true);
    },
    /**
     * A screen command already matched (matchScreenCommand's), for the router: Promise<outcome>.
     * `gesture` defaults to whether there is one now.
     */
    runCommand(cmd, { source = 'voice', gesture } = {}) {
      if (!isObj(cmd)) return Promise.resolve({ status: 'nothing', message: 'That isn’t a screen command.' });
      return run(cmd, { source, gesture: gesture === undefined ? hasGesture(source) : gesture }).catch((err) => {
        console.error('[jarvis] screen command failed:', err);
        return { status: 'error', message: 'That screen couldn’t open.' };
      });
    },
    /**
     * A window command (window-commands.js: close, close-all, arrange, here, focus) ->
     * Promise<outcome>. 'close-all' closes the windows; the app closes its viewers (outcome.viewers).
     */
    windowCommand(action = {}, { source = 'voice', gesture } = {}) {
      const a = isObj(action) ? action : {};
      const go = async () => {
        switch (a.op) {
          case 'close':
            return closeScreens({ which: a.which || null });
          case 'close-all':
            return { ...closeScreens({ all: true }), viewers: !!a.viewers };
          case 'arrange':
            return arrange(a, { source, gesture });
          case 'here':
            return here(a);
          case 'focus':
            return focusWindow(a);
          default:
            return { status: 'nothing', message: 'I can’t do that with windows yet.' };
        }
      };
      return go().catch((err) => {
        console.error('[jarvis] window command failed:', err);
        return { status: 'error', message: 'That didn’t work.' };
      });
    },
    commandIn,
    /** The window showing `kind` (the focused, picked or newest one): { id, label, mode, kind, title, parts, selected } | null. */
    shown(kind) {
      const e = pickOf([...screens.values()].filter((s) => s.kind === kind && !s.external && s.mode !== 'inapp' && alive(s)));
      return e ? { id: e.id, label: e.label, mode: e.mode, kind: e.kind, title: e.title, parts: e.parts ? e.parts.slice() : null, selected: e.selected || null } : null;
    },
    /**
     * A web page in a window (v8.1: "pull this up in Chrome" beside Jarvis): placed at `rect`, or
     * like any window. The address must already be checked (chrome-commands.js safeAddress). Blocked
     * pop-ups: the one-tap `button`. -> Promise<outcome>
     */
    openPage(url, { title = '', rect = null, button = '' } = {}, { source = 'voice', gesture } = {}) {
      const target = { kind: 'link', ref: { url, title: txt(title) || hostOf(url) }, title: txt(title) || hostOf(url), live: false };
      const cmd = { action: 'open', what: 'link', where: 'window', screen: null, target: null, ordinal: null, fullscreen: false, rect: isObj(rect) ? rect : null, button: txt(button) };
      return place(target, cmd, { gesture: gesture === undefined ? hasGesture(source) : gesture })
        .then((o) => {
          if (o && (o.status === 'opened' || o.status === 'needs_tap')) recent = { target, at: Date.now() };
          return o;
        })
        .catch((err) => {
          console.error('[jarvis] page window failed:', err);
          return { status: 'error', message: 'That page couldn’t open.' };
        });
    },
    /**
     * Where a page goes beside Jarvis (a rect in screen coordinates): the other monitor when Window
     * Management is allowed, else the far side of his screen with a strip of him kept in view.
     */
    async besideRect() {
      const where = await layoutScreens().catch(() => ({ screens: [window.screen], current: window.screen }));
      return layoutRects({ ...where, main: windowRect(window), count: 1, layout: 'beside' })[0] || null;
    },
    /** What "it" is now (a page just opened in Chrome: "open it in a window" puts it beside Jarvis). */
    noteRecent(target) {
      if (isObj(target) && typeof target.kind === 'string') recent = { target: { ...target, ref: { ...(target.ref || {}) } }, at: Date.now() };
    },
    list: () => [...screens.values()].map((s) => ({ id: s.id, mode: s.mode, label: s.label, kind: s.kind, title: s.title, focused: hasFocus(s), external: !!s.external })),
    /** Which screen shows a target (for "this": a screen in the app counts as an open viewer). */
    inappTarget() {
      const e = [...screens.values()].find((s) => s.mode === 'inapp');
      return e ? { kind: e.kind, ref: e.ref, title: e.title } : null;
    },
    isOpen: () => screens.size > 0,
    /** A camera screen whose camera may be running (one still loading counts): the OPTICS indicator. */
    cameraOn: () => cameraScreenOn({ unknownIsOn: true }),
    closeAll: () => closeScreens({ all: true }),
    /** Closes every screen showing that kind (the OPTICS pill stops a camera on another screen). */
    closeKind(kind) {
      const list = [...screens.values()].filter((s) => s.kind === kind);
      for (const s of list) closeEntry(s);
      return list.length;
    },
    dismissPrompt,
    pipSupported: () => pipSupported(window),
  };
}
