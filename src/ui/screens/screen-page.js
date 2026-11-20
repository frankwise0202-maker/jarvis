// Screens (v7): "screen mode", the app page that runs in a window on another monitor (or in its own
// window): the HUD frame plus ONE panel, no chat. The URL says what to show:
//
//   ?screen=hologram&id=lib_…            a saved hologram (IndexedDB library)
//   ?screen=hologram&c=<conv>&t=<turn>&seg=<segment>   a hologram still building in a reply
//   ?screen=blueprint&id=lib_…  (or c/t/seg)
//   ?screen=mission&c=<conv>&t=<turn>&id=<mission>
//   ?screen=answer&c=<conv>&t=<turn>
//   ?screen=photo&src=https://upload.wikimedia.org/…&title=…   (a photo the owner sent comes over the channel)
//   ?screen=link&url=https://…&title=…
//   ?screen=camera
//   plus s=<screen id>, w=other|window|beside, n=<monitor number> (the header says "SCREEN 2")
//
// A camera screen turns the camera on by itself only when the main window has just opened it for the
// owner (v7.1): the controller arms a one-time nonce (armCameraGo: localStorage plus #go=<nonce>), and
// the page starts the camera only for a fresh navigation ('navigate'), with an opener, whose nonce
// matches and is under 30 s old (takeCameraGo; the key is removed and the hash dropped either way).
// A reload ('reload'), Chrome restoring the window after a relaunch or a crash ('back_forward', no
// opener) or a load from history opens on "Camera off · Turn on camera". A 'show' message turns it on
// only with start: true (the owner's own command, or a camera that was on moving here).
//
// Saved things come from IndexedDB (library and conversations), so the window works on its own and
// after a reload. Live things (a running mission, a streaming answer, a hologram's live build) follow
// the main window over BroadcastChannel('jarvis-screens'):
//   screen -> main  { t: 'hello', screen, kind, ref }   ask for the latest content
//                   { t: 'back', screen, kind, ref, state }   "Bring back" (then the window closes)
//                   { t: 'closed', screen, kind, ref, state } the window is going away (hand back)
//                   { t: 'here', screen, kind, ref, where, label }  answer to { t: 'who' }
//   main -> screen  { t: 'content', screen, kind, data, title, report }  the content (live or not)
//                   { t: 'show', screen, kind, ref, title, report }  show something else here
//                   { t: 'close', screen }  close yourself ('*' = every screen)
//                   { t: 'who' }  the main window (re)started: say what you show
// Test hooks: [data-testid="screen"] has data-kind, data-state (loading|ready|missing|error),
// data-where, data-live; each panel has its own data-* (see panels.js).

import { h } from '../dom.js';
import { applyTheme } from '../themes.js';
import { getSettings } from '../../platform/settings.js';
import { getConversation } from '../../platform/db.js';
import { getLibraryItem } from '../../platform/library.js';
import { answerMarkdownOf, lookSnapshot, missionSnapshot } from '../../lib/screen-targets.js';
import { createScreenFrame } from './frame.js';
import { createScreenPanel, isSafeLink, isSafePhotoSrc } from './panels.js';
import { loadHologramRenderer } from '../hologram/viewer.js';
import { loadBlueprintModule } from '../blueprint/open.js';

export const SCREEN_CHANNEL = 'jarvis-screens';
export const CAMERA_GO_KEY = 'jarvis.screens.camgo';
export const CAMERA_GO_MS = 30000;
const KINDS = new Set(['hologram', 'blueprint', 'mission', 'answer', 'photo', 'link', 'camera', 'look']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : '');

function safeOpener() {
  try {
    return window.opener || null;
  } catch {
    return null;
  }
}

/** True when this page load is a screen (the URL has ?screen=<kind>). */
export function isScreenMode(loc = globalThis.location) {
  try {
    return !!new URLSearchParams(loc.search).get('screen');
  } catch {
    return false;
  }
}

/** The screen's description from its URL. */
export function parseScreenParams(search) {
  const p = new URLSearchParams(search || '');
  const kind = KINDS.has(p.get('screen')) ? p.get('screen') : null;
  const where = ['other', 'window', 'beside', 'inapp'].includes(p.get('w')) ? p.get('w') : 'window';
  const n = Number(p.get('n'));
  return {
    kind,
    where,
    number: Number.isInteger(n) && n > 0 && n < 10 ? n : null,
    screenId: (p.get('s') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || `s${Math.random().toString(36).slice(2, 8)}`,
    ref: {
      libraryId: /^lib_[a-z0-9]{6,16}$/.test(p.get('id') || '') ? p.get('id') : null,
      missionId: kind === 'mission' ? (p.get('id') || '').slice(0, 80) || null : null,
      frameId: kind === 'look' && /^f[1-9]\d{0,3}$/.test(p.get('id') || '') ? p.get('id') : null,
      conversationId: (p.get('c') || '').slice(0, 80) || null,
      turnId: (p.get('t') || '').slice(0, 80) || null,
      segmentId: (p.get('seg') || '').slice(0, 80) || null,
      url: kind === 'link' && isSafeLink(p.get('url')) ? p.get('url') : null,
      src: kind === 'photo' && isSafePhotoSrc(p.get('src')) ? p.get('src') : null,
      title: (p.get('title') || '').slice(0, 160),
    },
  };
}

/**
 * The main window, about to open a camera screen for the owner: a one-time nonce for that screen,
 * stored for the new window to check (see takeCameraGo). Returns the nonce, or '' without storage.
 */
export function armCameraGo(screenId, { storage = globalThis.localStorage, now = Date.now(), nonce = makeNonce() } = {}) {
  if (!/^[a-z0-9]{8,40}$/.test(nonce)) return '';
  try {
    storage.setItem(CAMERA_GO_KEY, JSON.stringify({ s: screenId, n: nonce, at: now }));
    return nonce;
  } catch {
    return '';
  }
}

/**
 * A camera screen page, as it loads: may it turn the camera on by itself? Only when the main window
 * has just opened it (armCameraGo): a fresh navigation, an opener, and this screen's nonce in the
 * hash, under CAMERA_GO_MS old. The stored nonce is removed either way (one use).
 */
export function takeCameraGo({ screenId, hash = '', opener = null, navigationType = '', storage = globalThis.localStorage, now = Date.now() } = {}) {
  let stored = null;
  try {
    stored = JSON.parse(storage.getItem(CAMERA_GO_KEY) || 'null');
  } catch {
    stored = null;
  }
  try {
    storage.removeItem(CAMERA_GO_KEY);
  } catch {
    /* storage blocked */
  }
  const m = /(?:^#|[#&])go=([a-z0-9]{8,40})(?:&|$)/.exec(String(hash || ''));
  if (!m || !isObj(stored) || stored.s !== screenId || stored.n !== m[1]) return false;
  const age = now - Number(stored.at);
  return Number.isFinite(age) && age >= 0 && age < CAMERA_GO_MS && !!opener && navigationType === 'navigate';
}

/** 24 random characters [0-9a-z] (crypto when there is one). */
function makeNonce() {
  const words = new Uint32Array(4);
  try {
    globalThis.crypto.getRandomValues(words);
  } catch {
    for (let i = 0; i < words.length; i++) words[i] = Math.floor(Math.random() * 2 ** 32);
  }
  return Array.from(words, (n) => n.toString(36).padStart(7, '0')).join('').slice(0, 24);
}

/** How this page was loaded: 'navigate' | 'reload' | 'back_forward' | 'prerender' | '' (unknown). */
function navigationType() {
  try {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav && typeof nav.type === 'string' ? nav.type : '';
  } catch {
    return '';
  }
}

export function screenLabel(where, number) {
  if (where === 'other') return number ? `SCREEN ${number}` : 'SCREEN 2';
  if (where === 'beside') return 'FLOAT';
  if (where === 'inapp') return 'SCREEN';
  return 'WINDOW';
}

/** Read what a ref points at from storage: { data, title, report } or null. */
export async function loadScreenContent(kind, ref) {
  if (kind === 'hologram' || kind === 'blueprint') {
    if (ref.libraryId) {
      const item = await getLibraryItem(ref.libraryId).catch(() => null);
      if (isObj(item) && item.kind === kind && isObj(item.spec)) return { data: { spec: item.spec, status: 'done' }, title: txt(item.title) || txt(item.spec.title) };
    }
    if (ref.conversationId && ref.turnId && ref.segmentId) {
      const conv = await getConversation(ref.conversationId, { track: false }).catch(() => null);
      const turn = conv && Array.isArray(conv.turns) ? conv.turns.find((t) => isObj(t) && t.id === ref.turnId) : null;
      const seg = turn && Array.isArray(turn.segments) ? turn.segments.find((s) => isObj(s) && s.id === ref.segmentId) : null;
      if (seg && isObj(seg.spec)) return { data: { spec: seg.spec, status: seg.status }, title: txt(seg.title) || txt(seg.spec.title) };
    }
    return null;
  }
  if (kind === 'mission' || kind === 'answer') {
    if (!ref.conversationId || !ref.turnId) return null;
    const conv = await getConversation(ref.conversationId, { track: false }).catch(() => null);
    const turns = conv && Array.isArray(conv.turns) ? conv.turns : [];
    const turn = turns.find((t) => isObj(t) && t.id === ref.turnId);
    if (!turn) return null;
    if (kind === 'answer') {
      const at = turns.indexOf(turn);
      const user = turns.slice(0, at).reverse().find((t) => isObj(t) && t.role === 'user');
      const report = isObj(turn.missions) && Object.keys(turn.missions).length > 0;
      return { data: { markdown: answerMarkdownOf(turn), status: txt(turn.status) || 'done', report }, title: user ? txt(user.text).split('\n')[0].slice(0, 120) : '', report };
    }
    const snap = missionSnapshot(turn, ref.missionId);
    if (!snap) return null;
    const mission = Object.values(snap.missions)[0];
    return { data: { turn: snap, missionId: mission.id }, title: txt(mission.title) };
  }
  if (kind === 'photo') return ref.src ? { data: { src: ref.src, title: ref.title, credit: '' }, title: ref.title || 'Photo' } : null;
  if (kind === 'link') return ref.url ? { data: { url: ref.url, title: ref.title }, title: ref.title } : null;
  if (kind === 'camera') return { data: {}, title: 'Optics' };
  if (kind === 'look') {
    if (!ref.conversationId || !ref.frameId) return null;
    const conv = await getConversation(ref.conversationId, { track: false }).catch(() => null);
    return conv ? lookSnapshot(conv, ref.frameId) : null;
  }
  return null;
}

/** The panel dependencies (lazy chunks), shared with the floating panels of the main window. */
export const panelDeps = {
  loadHologram: () => loadHologramRenderer(),
  loadBlueprint: () => loadBlueprintModule(),
};

/**
 * Start screen mode in `root` (the #app element). Returns { frame, show(kind, ref), close() }.
 */
export async function startScreenPage(root, { search = location.search } = {}) {
  const params = parseScreenParams(search);
  try {
    applyTheme(getSettings().theme);
  } catch {
    /* default theme */
  }
  document.documentElement.classList.add('is-screen-mode');
  root.classList.add('app', 'app--screen');
  root.removeAttribute('aria-busy');

  let kind = params.kind || 'answer';
  let ref = params.ref;
  // Opened just now by the main window for the owner (see the header): only then does a camera
  // screen turn the camera on by itself. The nonce is used up, and the hash dropped from the URL, so
  // a reload or a restored window never counts.
  const fresh = takeCameraGo({ screenId: params.screenId, hash: location.hash, opener: safeOpener(), navigationType: navigationType() });
  if (location.hash) {
    try {
      history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    } catch {
      /* not allowed */
    }
  }
  let channel = null;
  let closing = false;
  let panel = null;
  let gotLive = false;

  const post = (msg) => {
    try {
      if (channel) channel.postMessage({ ...msg, screen: params.screenId });
    } catch {
      /* closed */
    }
  };
  // A camera screen's state again after hello/here: the main window adopts a screen it did not know
  // (it was reloaded, restored, or the main window restarted) only on those, so a state said before
  // them (a camera that waits, 'off') would be lost and the OPTICS indicator would guess "on".
  const sayCamera = () => {
    if (kind !== 'camera' || !panel) return;
    const state = viewState().camera;
    if (typeof state === 'string' && state) post({ t: 'camera', state });
  };
  const viewState = () => {
    try {
      return panel ? panel.getState() : {};
    } catch {
      return {};
    }
  };

  const frame = createScreenFrame({
    win: window,
    label: screenLabel(params.where, params.number),
    kind,
    where: params.where,
    compact: false,
    onFullscreen: document.fullscreenEnabled ? () => toggleFullscreen() : null,
    onBack: () => {
      post({ t: 'back', kind, ref, state: viewState() });
      closeSelf();
    },
    onClose: () => closeSelf(),
  });
  root.replaceChildren(frame.el);

  function toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    } catch {
      /* not allowed */
    }
  }

  function closeSelf() {
    if (closing) return;
    closing = true;
    post({ t: 'closed', kind, ref, state: viewState() });
    try {
      window.close();
    } catch {
      /* not script-closable */
    }
    // Not closable (opened by hand): show that it is done instead of a dead window.
    setTimeout(() => {
      if (!window.closed) {
        closing = false;
        frame.setState('closed');
        if (panel) panel.destroy();
        panel = null;
        frame.body.replaceChildren(h('div', { class: 'scr-msg' }, h('p', { class: 'scr-msg__main', text: 'This screen is closed.' }), h('p', { class: 'scr-msg__sub', text: 'You can close this window.' })));
      }
    }, 300);
  }

  function mount(nextKind, nextRef, { title = '', report = false, autoStart = false } = {}) {
    if (panel) panel.destroy();
    panel = null;
    kind = nextKind;
    ref = nextRef || {};
    gotLive = false;
    frame.body.replaceChildren();
    frame.deck.replaceChildren();
    frame.showDeck(false);
    frame.setKind(kind, { report });
    frame.setTitle(title || ref.title || '');
    frame.setDetail('');
    frame.setStatus('', 'idle');
    frame.setState('loading');
    // A camera screen tells the main window whether its camera runs (the OPTICS indicator there).
    panel = createScreenPanel(kind, { win: window, frame, compact: false, autoStart, deps: kind === 'camera' ? { ...panelDeps, onCameraState: (state) => post({ t: 'camera', state }) } : panelDeps });
    frame.body.append(panel.el);
    frame.scan();
  }

  async function load() {
    const myKind = kind;
    const myRef = ref;
    const content = await loadScreenContent(myKind, myRef).catch((err) => {
      console.error('[jarvis] screen content failed:', err);
      return null;
    });
    if (myKind !== kind || myRef !== ref) return; // replaced meanwhile
    if (gotLive) {
      // The live copy came first: keep it, but take the stored title when it had none.
      if (content && content.title && !frame.el.querySelector('[data-testid="screen-title"]').textContent) frame.setTitle(content.title);
      return;
    }
    if (!content) {
      // Live content may still come from the main window; give it a moment.
      setTimeout(() => {
        if (!gotLive && myKind === kind && myRef === ref) {
          frame.setState('missing');
          frame.body.replaceChildren(h('div', { class: 'scr-msg', attrs: { role: 'status', 'data-testid': 'screen-missing' } }, h('p', { class: 'scr-msg__main', text: 'This isn’t available any more.' }), h('p', { class: 'scr-msg__sub', text: 'It may have been deleted, or the main Jarvis window is closed.' })));
        }
      }, 2500);
      return;
    }
    if (content.title) frame.setTitle(content.title);
    if (content.report) frame.setKind(kind, { report: true });
    panel.update(content.data);
    frame.setState(panel.el.dataset.state === 'missing' ? 'missing' : 'ready');
    // Stored as still running: the main window says how it is going; when it doesn't (it was closed
    // mid-reply), say the reply was interrupted rather than "writing" forever.
    if (content.data && content.data.status === 'running') {
      setTimeout(() => {
        if (!gotLive && myKind === kind && myRef === ref && panel) panel.update({ ...content.data, status: 'interrupted' });
      }, 3000);
    }
  }

  try {
    channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(SCREEN_CHANNEL) : null;
  } catch {
    channel = null;
  }
  if (channel) {
    channel.onmessage = (e) => {
      const m = e && e.data;
      if (!isObj(m)) return;
      if (m.t === 'who') {
        post({ t: 'here', kind, ref, where: params.where, label: screenLabel(params.where, params.number) });
        sayCamera();
        return;
      }
      if (m.screen !== params.screenId && m.screen !== '*') return;
      if (m.t === 'close') closeSelf();
      else if (m.t === 'show' && typeof m.kind === 'string' && KINDS.has(m.kind)) {
        mount(m.kind, isObj(m.ref) ? m.ref : {}, { title: txt(m.title), report: !!m.report, autoStart: m.start === true });
        load();
        post({ t: 'hello', kind, ref });
        sayCamera();
      } else if (m.t === 'content' && m.kind === kind && isObj(m.data)) {
        gotLive = true;
        if (m.title) frame.setTitle(txt(m.title));
        if (m.report) frame.setKind(kind, { report: true });
        if (isObj(m.ref)) ref = { ...ref, ...m.ref };
        if (panel) panel.update(m.data);
        frame.setState(panel && panel.el.dataset.state === 'missing' ? 'missing' : 'ready');
      }
    };
  }

  window.addEventListener('pagehide', () => {
    if (!closing) post({ t: 'closed', kind, ref, state: viewState() });
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey && document.fullscreenEnabled && !/^(INPUT|TEXTAREA)$/.test((e.target && e.target.tagName) || '')) toggleFullscreen();
  });

  mount(kind, ref, { title: ref.title, autoStart: fresh });
  post({ t: 'hello', kind, ref });
  sayCamera();
  await load();
  root.dataset.ready = 'true';
  return {
    frame,
    show: (k, r, o) => {
      mount(k, r, o);
      return load();
    },
    close: () => closeSelf(),
  };
}
