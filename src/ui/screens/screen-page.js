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
import { answerMarkdownOf, missionSnapshot } from '../../lib/screen-targets.js';
import { createScreenFrame } from './frame.js';
import { createScreenPanel, isSafeLink, isSafePhotoSrc } from './panels.js';
import { loadHologramRenderer } from '../hologram/viewer.js';
import { loadBlueprintModule } from '../blueprint/open.js';

export const SCREEN_CHANNEL = 'jarvis-screens';
const KINDS = new Set(['hologram', 'blueprint', 'mission', 'answer', 'photo', 'link', 'camera']);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const txt = (v) => (typeof v === 'string' ? v : '');

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
      conversationId: (p.get('c') || '').slice(0, 80) || null,
      turnId: (p.get('t') || '').slice(0, 80) || null,
      segmentId: (p.get('seg') || '').slice(0, 80) || null,
      url: kind === 'link' && isSafeLink(p.get('url')) ? p.get('url') : null,
      src: kind === 'photo' && isSafePhotoSrc(p.get('src')) ? p.get('src') : null,
      title: (p.get('title') || '').slice(0, 160),
    },
  };
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

  function mount(nextKind, nextRef, { title = '', report = false } = {}) {
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
    panel = createScreenPanel(kind, { win: window, frame, compact: false, deps: panelDeps });
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
        return;
      }
      if (m.screen !== params.screenId && m.screen !== '*') return;
      if (m.t === 'close') closeSelf();
      else if (m.t === 'show' && typeof m.kind === 'string' && KINDS.has(m.kind)) {
        mount(m.kind, isObj(m.ref) ? m.ref : {}, { title: txt(m.title), report: !!m.report });
        load();
        post({ t: 'hello', kind, ref });
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

  mount(kind, ref, { title: ref.title });
  post({ t: 'hello', kind, ref });
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
