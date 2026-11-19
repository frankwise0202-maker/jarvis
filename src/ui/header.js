// App header: mini core orb mirroring Jarvis's state, the wordmark, a status readout,
// and the History / Settings buttons (plus a New chat shortcut once a chat has started).

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
 * @param {{ onHistory: () => void, onSettings: () => void, onNewChat: () => void, demo?: boolean }} o
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
  const statusText = h('span', { class: 'status-text', text: 'Online' });
  const status = h('div', { class: 'brand-status', dataset: { tone: 'ok' } }, statusDot, statusText);

  const brand = h(
    'div',
    { class: 'brand' },
    coreWrap,
    h(
      'div',
      { class: 'brand-text' },
      h('div', { class: 'brand-row' }, h('span', { class: 'brand-word', text: 'JARVIS' }), o.demo ? h('span', { class: 'brand-badge', text: 'Demo', attrs: { title: 'Demo mode: nothing is sent to the API' } }) : null),
      status,
    ),
  );

  const newBtn = h(
    'button',
    { class: 'icon-btn header-new', type: 'button', hidden: true, attrs: { 'aria-label': 'New chat', 'data-testid': 'header-new-chat', title: 'New chat (Ctrl/⌘ K)' }, on: { click: () => o.onNewChat() } },
    icon('add-square', { size: 22 }),
  );
  const historyBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', attrs: { 'aria-label': 'History', 'data-testid': 'history-button', 'aria-expanded': 'false', title: 'History' }, on: { click: () => o.onHistory() } },
    icon('history', { size: 22 }),
  );
  const settingsBtn = h(
    'button',
    { class: 'icon-btn', type: 'button', attrs: { 'aria-label': 'Settings', 'data-testid': 'settings-button', title: 'Settings' }, on: { click: () => o.onSettings() } },
    icon('settings', { size: 22 }),
  );

  const el = h('header', { class: 'header' }, h('div', { class: 'header-inner' }, brand, h('div', { class: 'header-actions' }, newBtn, historyBtn, settingsBtn)));

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
      setText(statusText, text);
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
        core && core.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
