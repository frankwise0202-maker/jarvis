// Screens (v7) in the main window: "open this on my other screen", "float it", "open it in a
// window", "bring it back", from words (typed, spoken, or Jarvis's open_screen tool).
//
//   const screens = createScreens(deps)
//   screens.command(text, { source: 'typed' | 'voice' | 'viewer' })
//       -> null (not a screen command: send it to Jarvis) | { handled: true, done: Promise<outcome> }
//   screens.openFromTool({ what, where, screen, url, id })   -> Promise<outcome>  (engine deps.screens.open)
//   screens.onRunEvent(entry, evt) / screens.onRunDone(entry)  live content follows the run
//   screens.list()  screens.closeAll()
//   screenMessage(outcome) / screenAck(outcome)               what to show / say about an outcome
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
import { detectScreenEnv, planPlacement, placementNote, rightHalf, screenWindowFeatures } from '../../lib/screen-placement.js';
import { answerMarkdownOf, lookSnapshot, missionSnapshot, questionTitle, resolveScreenTarget, screenKindName } from '../../lib/screen-targets.js';
import { createScreenFrame } from './frame.js';
import { createScreenPanel } from './panels.js';
import { SCREEN_CHANNEL, loadScreenContent, panelDeps, screenLabel } from './screen-page.js';
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

/** What to tell the owner (a toast for typed commands). */
export function screenMessage(o) {
  if (!isObj(o)) return '';
  const name = screenKindName(o.kind, { report: !!o.report });
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const note = o.note ? placementNote(o.note, { label: o.label }) : '';
  switch (o.status) {
    case 'opened':
      if (o.mode === 'screen') return `${Name} is on ${txt(o.label).toLowerCase() || 'your other screen'}.${note ? ` ${note}` : ''}`;
      if (o.mode === 'pip') return note || `${Name} is floating beside you.`;
      if (o.mode === 'window') return note || `${Name} is open in its own window.`;
      if (o.mode === 'tab') return 'The link is open in a new tab.';
      return note || `${Name} is open full screen.`;
    case 'needs_tap':
      return `Tap “${o.button}” to put ${name} there.`;
    case 'needs_permission':
      return 'Allow window placement once, and Jarvis can use your other monitor.';
    case 'closed':
      return o.count ? (o.back ? `${Name} is back here.` : `Closed ${o.count === 1 ? txt(o.label).toLowerCase() || 'the screen' : `${o.count} screens`}.`) : 'Nothing is on another screen right now.';
    default:
      return txt(o.message) || 'That screen couldn’t open.';
  }
}

/** What Jarvis says after a spoken screen command (short, in his manner). */
export function screenAck(o) {
  if (!isObj(o)) return '';
  switch (o.status) {
    case 'opened':
      if (o.mode === 'screen') return o.note === 'no-such-screen' ? `There's no such screen, so it's on ${txt(o.label).toLowerCase()}.` : `It's on ${txt(o.label).toLowerCase() || 'your other screen'}.`;
      if (o.mode === 'pip') return o.note === 'single-screen' ? "Only one screen is connected, so it's floating beside you." : 'Floating beside you.';
      if (o.mode === 'window') return o.note === 'no-wm' || o.note === 'wm-denied' ? "It's in its own window. Drag it to your other screen." : "It's in its own window.";
      if (o.mode === 'tab') return "It's open in a new tab.";
      return 'Here it is, full screen.';
    case 'needs_tap':
      return `Tap ${o.button}, and it'll appear.`;
    case 'needs_permission':
      return 'Chrome needs your permission once. Tap Allow, and I can use your other monitor.';
    case 'closed':
      return o.count ? (o.back ? 'Brought it back.' : 'Closed.') : "There's nothing on another screen.";
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
    if (!screens.has(entry.id)) return;
    let c = await contentOf(entry).catch(() => null);
    // A panel drawn here (floating, or in the app) reads storage itself when nothing is in memory
    // (a reply in another conversation); a screen window does that on its own.
    if (!c && entry.view) c = await loadScreenContent(entry.kind, entry.ref || {}).catch(() => null);
    if (!c || !screens.has(entry.id)) return;
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
    const entry = { id: fields.id || newId(), mode: 'window', label: 'WINDOW', number: null, win: null, kind: 'answer', ref: {}, title: '', report: false, takenFrom: null, view: null, overlay: null, lastPush: 0, pushTimer: 0, ...fields };
    screens.set(entry.id, entry);
    changed();
    return entry;
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
    entry.kind = target.kind;
    entry.ref = { ...(target.ref || {}) };
    entry.title = target.title || '';
    entry.report = !!(target.ref && target.ref.report);
    entry.live = !!target.live;
    entry.takenFrom = takenFrom ? 'viewer' : entry.takenFrom && entry.kind === target.kind ? entry.takenFrom : null;
    if (entry.mode === 'pip') mountPip(entry);
    else if (entry.mode === 'inapp') mountInapp(entry);
    else post({ t: 'show', screen: entry.id, kind: entry.kind, ref: entry.kind === 'photo' ? { title: entry.ref.title } : entry.ref, title: entry.title, report: entry.report });
    schedulePush(entry, true);
    changed();
  }

  async function openWindow(target, plan, cmd, gesture) {
    const where = plan.mode === 'screen' ? 'other' : 'window';
    if (target.kind === 'link') return openLink(target, plan, cmd, gesture);
    // A screen already open in that place takes the new content (no gesture needed).
    const existing = [...screens.values()].find((s) => s.mode === plan.mode && (plan.mode === 'window' || s.label === plan.label) && (!s.win || !s.win.closed));
    if (existing) {
      const taken = takeFromApp(target, existing);
      showIn(existing, target, taken);
      safe(() => existing.win && existing.win.focus());
      dismissPrompt();
      return outcome('opened', target, { mode: plan.mode, label: existing.label, note: plan.note, screenName: plan.screenName, internal: plan.internal, reused: true });
    }
    const id = newId();
    const url = screenUrl(target, { id, where, number: plan.number });
    const w = safe(() => window.open(url, `jarvis-${id}`, plan.features), null);
    if (!w) return needsTap(target, plan, cmd);
    dismissPrompt();
    const taken = takeFromApp(target);
    const entry = register({ id, mode: plan.mode, label: plan.label, number: plan.number || null, win: w, kind: target.kind, ref: { ...(target.ref || {}) }, title: target.title, report: !!(target.ref && target.ref.report), live: !!target.live, takenFrom: taken ? 'viewer' : null });
    safe(() => w.focus());
    watchClosed(entry);
    return outcome('opened', target, { mode: plan.mode, label: plan.label, note: plan.note, screenName: plan.screenName, internal: plan.internal });
  }

  /** A web page in its own window (placed like a screen); the page never gets a handle on Jarvis. */
  function openLink(target, plan, cmd) {
    const url = target.ref && target.ref.url;
    if (!url) return outcome('error', target, { message: 'That link can’t be opened.' });
    const w = safe(() => window.open('about:blank', `jarvis-link-${newId()}`, plan.features), null);
    if (!w) return needsTap(target, plan, cmd);
    dismissPrompt();
    safe(() => {
      w.opener = null;
    });
    safe(() => {
      w.location.replace(url);
    });
    return outcome('opened', target, { mode: plan.mode, label: plan.label, note: plan.note, screenName: plan.screenName, internal: plan.internal });
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
    const panel = createScreenPanel(entry.kind, {
      win: pipWin,
      frame,
      compact: true,
      deps: { ...panelDeps, snapshot: typeof deps.snapshot === 'function' ? (spec, size) => deps.snapshot(spec, size) : null, onCameraState: (st) => setCameraState(entry, st) },
    });
    frame.body.append(panel.el);
    entry.view = { frame, panel };
  }

  /** Phones and tablets: one screen, no popups. The screen opens full screen inside the app. */
  function mountInapp(entry) {
    if (entry.view) {
      safe(() => entry.view.panel.destroy());
      safe(() => entry.view.frame.destroy());
    }
    const compact = window.innerWidth < 700;
    const frame = createScreenFrame({ win: window, label: 'SCREEN', kind: entry.kind, report: entry.report, title: entry.title, where: 'inapp', compact, setDocumentTitle: false, onClose: () => closeEntry(entry) });
    const panel = createScreenPanel(entry.kind, { win: window, frame, compact, deps: { ...panelDeps, onCameraState: (st) => setCameraState(entry, st) } });
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

  async function place(target, cmd, { gesture = false } = {}) {
    const env = detectScreenEnv(window);
    let permission = null;
    if (cmd.where === 'other' && env.windowManagement) {
      permission = await wmPermission();
      if (permission === 'granted' && !details) {
        details = await Promise.resolve(window.getScreenDetails()).catch(() => null);
        if (details && typeof details.addEventListener === 'function') safe(() => details.addEventListener('screenschange', () => {}));
      }
    }
    const plan = planPlacement({ where: cmd.where, kind: target.kind, env, permission, details, currentScreen: window.screen, screen: cmd.screen, target: cmd.target, fullscreen: !!cmd.fullscreen });
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
    const button = buttonLabel(plan);
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

  function closeScreens({ where = null, screen = null, back = false, tool = false } = {}) {
    let list = [...screens.values()];
    if (where === 'beside') list = list.filter((s) => s.mode === 'pip');
    if (screen) list = list.filter((s) => s.number === screen || s.label === `SCREEN ${screen}`);
    const last = list[list.length - 1] || null;
    // Handed back to the main window: the newest one. From Jarvis's tool, a camera only while it is
    // on (Optics would turn it on again): a camera screen whose camera is off just closes.
    const handBack = (s) => back && s === last && !(tool && s.kind === 'camera' && !CAMERA_ON.has(s.cameraState));
    const backLast = !!last && handBack(last);
    for (const s of list) closeEntry(s, { back: handBack(s) });
    // A floating panel opened before a reload (no entry here).
    if (!list.length && (where === 'beside' || !screen)) {
      const stray = currentPipWindow();
      if (stray) {
        safe(() => stray.close());
        return { status: 'closed', count: 1, label: 'FLOAT', kind: null, back: false };
      }
    }
    if (!list.length && !screen) post({ t: 'close', screen: '*' });
    return { status: 'closed', count: list.length, label: last ? last.label : '', kind: last ? last.kind : null, title: last ? last.title : '', report: !!(last && last.report), back: backLast };
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
    };
    post({ t: 'who' });
  }

  // ---- entry points -------------------------------------------------------------------------------

  async function run(cmd, { source = 'typed', gesture } = {}) {
    if (cmd.action === 'back') {
      if (!screens.size && !currentPipWindow()) return { status: 'closed', count: 0 };
      return closeScreens({ back: true, tool: source === 'tool' });
    }
    if (cmd.action === 'close') return closeScreens({ where: cmd.where, screen: cmd.screen });
    const target = await resolve(cmd);
    if (!target || target.error) return { status: 'nothing', message: (target && target.message) || 'There’s nothing to put on a screen yet.', kind: cmd.what };
    // A tool call never turns the camera on: it may move a camera that is on, else the owner taps.
    if (source === 'tool' && target.kind === 'camera' && !cameraIsOn()) {
      const { fromViewer, ...rest } = target;
      void fromViewer;
      recent = { target: rest, at: Date.now() };
      return cameraTap(target, cmd);
    }
    const o = await place(target, cmd, { gesture: gesture === undefined ? hasGesture(source) : gesture });
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
    /** The open_screen tool (engine deps.screens.open): never has a gesture. */
    openFromTool(input = {}) {
      const where = input.where === 'back' ? null : input.where;
      const cmd = { action: input.where === 'back' ? 'back' : 'open', what: input.what || 'this', where, screen: input.screen || null, url: input.url || null, id: input.id || null, ordinal: null, target: null, fullscreen: false };
      return run(cmd, { source: 'tool', gesture: false }).catch((err) => ({ status: 'error', message: String((err && err.message) || err) }));
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
    list: () => [...screens.values()].map((s) => ({ id: s.id, mode: s.mode, label: s.label, kind: s.kind, title: s.title })),
    /** Which screen shows a target (for "this": a screen in the app counts as an open viewer). */
    inappTarget() {
      const e = [...screens.values()].find((s) => s.mode === 'inapp');
      return e ? { kind: e.kind, ref: e.ref, title: e.title } : null;
    },
    isOpen: () => screens.size > 0,
    /** A camera screen whose camera may be running (one still loading counts): the OPTICS indicator. */
    cameraOn: () => cameraScreenOn({ unknownIsOn: true }),
    closeAll: () => closeScreens({}),
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
