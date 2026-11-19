// App header: mini core orb mirroring Jarvis's state, the wordmark, a status readout,
// and the History / Settings buttons (plus a New chat shortcut once a chat has started).
// In demo mode the DEMO badge beside the wordmark is an "Exit demo" button.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { createCore } from './hud/core.js';

const STATE_TONE = {
  idle: 'ok',
  listening: 'active',
  thinking: 'active',
  working: 'active',
  speaking: 'active',
  error: 'err',
  offline: 'warn',
};

/**
 * @param {{ onHistory: () => void, onSettings: () => void, onNewChat: () => void, demo?: boolean,
 *           voice?: boolean, onVoice?: () => void, onLibrary?: () => void }} o   voice: show the Voice
 *           Mode button; onLibrary: show the Blueprints library button (saved holograms and blueprints)
 */
export function createHeader(o) {
  const canvas = h('canvas', { class: 'header-core-canvas', attrs: { 'data-testid': 'header-core', 'aria-hidden': 'true' } });
  const coreWrap = h('div', { class: 'header-core' }, canvas);
  let core = null;
  try {
    core = createCore(canvas, { size: 32, mode: 'mini' });
  } catch (err) {
    console.error('[jarvis] header core failed:', err);
  }

  const statusDot = h('span', { class: 'status-dot', attrs: { 'aria-hidden': 'true' } });
  // "Working · 4 agents" = label + detail; narrow phones show only the detail (see app.css).
  const statusLabel = h('span', { class: 'status-label', text: 'Online' });
  const statusDetail = h('span', { class: 'status-detail' });
  const statusText = h('span', { class: 'status-text' }, statusLabel, statusDetail);
  const status = h('div', { class: 'brand-status', dataset: { tone: 'ok' } }, statusDot, statusText);

  // Demo mode: the DEMO badge is also the way out — the installed app has no address bar to
  // remove ?demo=1 from. It reloads the real app (./), like Settings → About → Leave demo.
  const demoExit = o.demo
    ? h(
        'button',
        {
          class: 'brand-demo-exit',
          type: 'button',
          attrs: { 'data-testid': 'demo-exit', 'aria-label': 'Exit demo', title: 'Demo mode: nothing is sent to the API. Tap to exit the demo.' },
          // A 44px hit area around the small badge that doesn't change the header's layout
          // (positioned, so it sits above the status line; the header buttons still win).
          style: { position: 'relative', display: 'inline-flex', alignItems: 'center', padding: '14px 8px', margin: '-14px -8px', borderRadius: 'var(--r-pill)' },
          on: { click: () => exitDemo() },
        },
        h('span', { class: 'brand-badge', text: 'Demo' }),
      )
    : null;

  const word = h('span', { class: 'brand-word', text: 'JARVIS' });
  const brand = h('div', { class: 'brand' }, coreWrap, h('div', { class: 'brand-text' }, h('div', { class: 'brand-row' }, word, demoExit), status));
  // The narrowest phones can't fit the wordmark, the DEMO button and four header buttons:
  // drop the wordmark (the orb still says "Jarvis") so DEMO never slides under New chat.
  let narrowMq = null;
  const fitDemo = () => {
    word.hidden = !!(narrowMq && narrowMq.matches);
  };
  if (o.demo) {
    try {
      narrowMq = window.matchMedia('(max-width: 359px)');
      if (narrowMq.addEventListener) narrowMq.addEventListener('change', fitDemo);
      else if (narrowMq.addListener) narrowMq.addListener(fitDemo);
    } catch {
      narrowMq = null;
    }
    fitDemo();
  }

  const newBtn = h(
    'button',
    { class: 'icon-btn header-new', type: 'button', hidden: true, attrs: { 'aria-label': 'New chat', 'data-testid': 'header-new-chat', title: 'New chat (Ctrl/⌘ K)' }, on: { click: () => o.onNewChat() } },
    icon('add-square', { size: 22 }),
  );
  // Voice Mode (SPEC §14.1). Opened synchronously from the click: iOS only starts the mic and
  // speech inside a user gesture.
  const voiceBtn = h(
    'button',
    { class: 'icon-btn header-voice', type: 'button', hidden: !o.voice, attrs: { 'aria-label': 'Voice mode', 'data-testid': 'voice-open', title: 'Talk to Jarvis (voice mode)' }, on: { click: () => o.onVoice && o.onVoice() } },
    icon('wave', { size: 22 }),
  );
  const historyBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', attrs: { 'aria-label': 'History', 'data-testid': 'history-button', 'aria-expanded': 'false', title: 'History' }, on: { click: () => o.onHistory() } },
    icon('history', { size: 22 }),
  );
  // Saved holograms and blueprints (on the narrowest phones it lives in History instead, see
  // library.css). Not in the demo: it has no saved items, and the DEMO button needs the room.
  const libraryBtn = o.onLibrary && !o.demo
    ? h(
        'button',
        { class: 'icon-btn header-library', type: 'button', attrs: { 'aria-label': 'Blueprints library', 'data-testid': 'library-button', title: 'Blueprints: saved holograms and blueprints' }, on: { click: () => o.onLibrary() } },
        icon('blueprint', { size: 22 }),
      )
    : null;
  const settingsBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', attrs: { 'aria-label': 'Settings', 'data-testid': 'settings-button', title: 'Settings' }, on: { click: () => o.onSettings() } },
    icon('settings', { size: 22 }),
  );

  const el = h('header', { class: 'header' }, h('div', { class: 'header-inner' }, brand, h('div', { class: 'header-actions' }, newBtn, voiceBtn, libraryBtn, historyBtn, settingsBtn)));

  let lastState = '';
  return {
    el,
    core,
    historyBtn,
    settingsBtn,
    /** Mirror Jarvis's state on the orb and in the status readout. */
    setState(state, text) {
      if (state !== lastState) {
        lastState = state;
        status.dataset.tone = STATE_TONE[state] || 'ok';
        status.dataset.state = state;
        try {
          core && core.setState(state);
        } catch (err) {
          console.error('[jarvis] core.setState failed:', err);
        }
      }
      const [label, ...rest] = String(text || '').split(' · ');
      setText(statusLabel, label);
      setText(statusDetail, rest.join(' · '));
      statusText.classList.toggle('has-detail', rest.length > 0);
    },
    setLevel(level) {
      try {
        core && core.setLevel(level);
      } catch {
        /* optional */
      }
    },
    setHistoryExpanded(expanded) {
      historyBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    },
    setNewChatVisible(visible) {
      newBtn.hidden = !visible;
    },
    destroy() {
      try {
        if (narrowMq && narrowMq.removeEventListener) narrowMq.removeEventListener('change', fitDemo);
        else if (narrowMq && narrowMq.removeListener) narrowMq.removeListener(fitDemo);
      } catch {
        /* ignore */
      }
      try {
        core && core.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Leave demo mode: load the app without ?demo=1 (and without any other query or hash). */
function exitDemo() {
  try {
    location.assign(new URL('./', location.href).href);
  } catch {
    location.href = './';
  }
}
