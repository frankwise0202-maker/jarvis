// Install guide: per-platform steps (iPhone/iPad Safari, Android Chrome, desktop
// Chrome/Edge/Safari/Firefox) with a one-tap Install button where the browser offers
// one. Tabs let the owner read the phone steps while on the computer, and vice versa.

import { h, setText } from './dom.js';
import { icon } from './icons.js';
import { getInstallContext, promptInstall, onInstallAvailable } from '../platform/pwa.js';

const TABS = [
  { id: 'ios', label: 'iPhone / iPad', icon: 'phone' },
  { id: 'android', label: 'Android', icon: 'phone' },
  { id: 'desktop', label: 'Computer', icon: 'laptop' },
];

function ctxSafe() {
  try {
    return getInstallContext() || {};
  } catch {
    return {};
  }
}

/**
 * @param {{ toast: (msg: string, opts?: object) => void, onInstalled?: () => void }} o
 */
export function createInstallGuide(o) {
  let ctx = ctxSafe();
  let tab = TABS.some((t) => t.id === ctx.platform) ? ctx.platform : 'desktop';
  const cleanups = [];

  const tabButtons = TABS.map((t) =>
    h(
      'button',
      {
        class: 'seg-btn',
        type: 'button',
        attrs: { role: 'tab', 'aria-selected': t.id === tab ? 'true' : 'false', 'data-tab': t.id },
        on: {
          click: () => {
            tab = t.id;
            render();
          },
        },
      },
      icon(t.icon, { size: 16 }),
      h('span', { text: t.label }),
    ),
  );
  const tabsEl = h('div', { class: 'seg-control install-tabs', attrs: { role: 'tablist', 'aria-label': 'Platform' } }, tabButtons);
  const body = h('div', { class: 'install-body', attrs: { role: 'tabpanel' } });
  const status = h('div', { class: 'install-status' });
  const el = h('div', { class: 'install-guide-content' }, status, tabsEl, body);

  function step(n, iconName, title, text) {
    return h(
      'li',
      { class: 'install-step' },
      h('span', { class: 'install-step-num mono', text: String(n) }),
      h('div', { class: 'install-step-text' }, h('strong', null, title, iconName ? h('span', { class: 'install-inline-icon' }, icon(iconName, { size: 16 })) : null), text ? h('span', { text }) : null),
    );
  }

  function installButton(label) {
    const btn = h(
      'button',
      {
        class: 'btn btn-primary btn-lg install-now',
        type: 'button',
        attrs: { 'data-testid': 'install-now' },
        on: {
          click: async () => {
            btn.disabled = true;
            let result = 'unavailable';
            try {
              result = await promptInstall();
            } catch (err) {
              console.error('[jarvis] promptInstall failed:', err);
            }
            btn.disabled = false;
            if (result === 'accepted') {
              o.toast('Installing Jarvis…', { level: 'success' });
              if (o.onInstalled) o.onInstalled();
            } else if (result === 'unavailable') {
              o.toast('Your browser didn’t offer an install prompt. Use the steps below.', { level: 'info' });
            }
            ctx = ctxSafe();
            render();
          },
        },
      },
      icon('download', { size: 18 }),
      h('span', { text: label }),
    );
    return btn;
  }

  function iosSteps() {
    const notSafari = ctx.platform === 'ios' && ctx.browser && ctx.browser !== 'safari';
    return [
      notSafari ? h('p', { class: 'install-note' }, icon('info', { size: 16 }), h('span', { text: 'Safari works best for installing. Other browsers on iOS 16.4+ can also use Share → Add to Home Screen.' })) : null,
      h(
        'ol',
        { class: 'install-steps' },
        step(1, 'share', 'Tap Share', 'The square with an arrow, in Safari’s toolbar (at the bottom on iPhone, top on iPad).'),
        step(2, 'add-square', 'Tap “Add to Home Screen”', 'Scroll down the share sheet if you don’t see it.'),
        step(3, null, 'Tap “Add”', 'Jarvis appears on your Home Screen and opens full-screen, like an app.'),
      ),
      h('p', { class: 'install-foot', text: 'Open Jarvis from the Home Screen icon from now on. Your key and history live in the installed app.' }),
    ];
  }

  function androidSteps() {
    const canPrompt = ctx.platform === 'android' && ctx.canPrompt;
    return [
      canPrompt ? installButton('Install Jarvis') : null,
      h(
        'ol',
        { class: 'install-steps' },
        step(1, 'more', 'Open Chrome’s menu', 'The three dots at the top right.'),
        step(2, 'download', 'Tap “Install app”', 'On some phones it says “Add to Home screen”.'),
        step(3, null, 'Confirm “Install”', 'Jarvis appears with your other apps and opens full-screen.'),
      ),
      ctx.browser === 'samsung' ? h('p', { class: 'install-note' }, icon('info', { size: 16 }), h('span', { text: 'Samsung Internet: tap the menu, then “Add page to” → “Home screen”.' })) : null,
    ];
  }

  function desktopSteps() {
    const here = ctx.platform === 'desktop';
    const canPrompt = here && ctx.canPrompt;
    const browser = here ? ctx.browser : '';
    const items = [];
    if (canPrompt) items.push(installButton('Install Jarvis'));
    if (browser === 'safari') {
      items.push(h('ol', { class: 'install-steps' }, step(1, null, 'Open the File menu', 'In Safari’s menu bar (macOS Sonoma or later).'), step(2, null, 'Choose “Add to Dock…”', 'Then click Add. Jarvis opens in its own window from the Dock.')));
    } else if (browser === 'firefox') {
      items.push(h('p', { class: 'install-note' }, icon('info', { size: 16 }), h('span', { text: 'Firefox doesn’t install web apps. Use Chrome, Edge or Safari to install Jarvis — or simply bookmark this page.' })));
    } else {
      items.push(
        h(
          'ol',
          { class: 'install-steps' },
          step(1, 'download', 'Click the install icon', 'At the right end of the address bar (a monitor with an arrow).'),
          step(2, null, 'Or use the browser menu', browser === 'edge' ? 'Edge: … → Apps → Install this site as an app.' : 'Chrome: ⋮ → Cast, save and share → Install page as app.'),
          step(3, null, 'Click “Install”', 'Jarvis opens in its own window and can be pinned to your taskbar or Dock.'),
        ),
      );
      items.push(h('p', { class: 'install-foot', text: 'On a Mac with Safari: File → Add to Dock.' }));
    }
    return items;
  }

  function render() {
    for (const b of tabButtons) {
      const on = b.dataset.tab === tab;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.classList.toggle('is-active', on);
    }
    if (ctx.standalone) {
      status.hidden = false;
      status.replaceChildren(h('span', { class: 'pill pill--ok' }, icon('check', { size: 14 }), h('span', { text: 'Installed' })), h('span', { text: 'You’re using the installed app.' }));
    } else {
      status.hidden = false;
      const where = ctx.platform === 'ios' ? 'iPhone or iPad' : ctx.platform === 'android' ? 'Android phone' : 'computer';
      status.replaceChildren(h('span', { class: 'install-status-icon' }, icon(ctx.platform === 'desktop' ? 'laptop' : 'phone', { size: 18 })), h('span', { text: `Install Jarvis on this ${where} for a full-screen app that opens instantly and works offline.` }));
    }
    body.replaceChildren(...(tab === 'ios' ? iosSteps() : tab === 'android' ? androidSteps() : desktopSteps()).filter(Boolean));
    if (tab !== ctx.platform) {
      const url = `${location.origin}${location.pathname}`;
      const urlEl = h('code', { class: 'install-url mono' });
      setText(urlEl, url);
      body.appendChild(h('p', { class: 'install-foot' }, h('span', { text: 'Open this address on that device: ' }), urlEl));
    }
  }

  try {
    const off = onInstallAvailable(() => {
      ctx = ctxSafe();
      render();
    });
    if (typeof off === 'function') cleanups.push(off);
  } catch {
    /* optional */
  }

  render();

  return {
    el,
    destroy() {
      for (const fn of cleanups) {
        try {
          fn();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
