// Service worker registration, update flow and install prompts (SPEC §9.3, §9.4).
//
//   registerServiceWorker({ onUpdateReady }) -> Promise<ServiceWorkerRegistration | null>
//       Registers ./sw.js (secure contexts only). When a new version has been downloaded and is
//       waiting, calls onUpdateReady(apply); apply() tells the waiting worker to take over
//       ({ type: 'SKIP_WAITING' }) and reloads the page once it controls it. Also checks for a
//       new version whenever the app returns to the foreground (at most every 30 minutes).
//   getInstallContext() -> { platform: 'ios'|'android'|'desktop',
//                            browser: 'safari'|'chrome'|'edge'|'firefox'|'samsung'|'other',
//                            standalone, canPrompt }
//   onInstallAvailable(fn)  fn(context) when the browser offers installation
//                           (beforeinstallprompt; called at once if it already happened).
//   promptInstall() -> Promise<'accepted'|'dismissed'|'unavailable'>
//   onInstalled(fn)         fn() after the app was installed (appinstalled).
//
// The beforeinstallprompt listener is attached when this module is first imported, so the
// event is captured even if it fires before the UI subscribes.

import { isStandalone, parseUserAgent } from './env.js';
import { createEmitter, reportWarning } from './util.js';

const UPDATE_CHECK_MS = 30 * 60 * 1000;
const RELOAD_FALLBACK_MS = 4000;

let deferredPrompt = null;
const available = createEmitter('install available');
const installed = createEmitter('installed');

(function captureInstallEvents() {
  try {
    if (typeof globalThis.addEventListener !== 'function') return;
    globalThis.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault(); // we show our own Install button instead of the mini-infobar
      deferredPrompt = event;
      available.emit(getInstallContext());
    });
    globalThis.addEventListener('appinstalled', () => {
      deferredPrompt = null;
      installed.emit();
    });
  } catch {
    /* not a window */
  }
})();

export function getInstallContext() {
  let ua = '';
  let touch = 0;
  try {
    ua = globalThis.navigator.userAgent || '';
    touch = globalThis.navigator.maxTouchPoints || 0;
  } catch {
    /* ignore */
  }
  const info = parseUserAgent(ua, touch);
  return {
    platform: info.os === 'ios' ? 'ios' : info.os === 'android' ? 'android' : 'desktop',
    browser: info.browser,
    standalone: isStandalone(),
    canPrompt: !!deferredPrompt,
  };
}

/** fn(context) when installation becomes available. Returns unsubscribe. */
export function onInstallAvailable(fn) {
  if (typeof fn !== 'function') return () => {};
  const off = available.on(fn);
  if (deferredPrompt) {
    queueMicrotask(() => {
      if (deferredPrompt) {
        try {
          fn(getInstallContext());
        } catch (err) {
          reportWarning('install listener failed', err);
        }
      }
    });
  }
  return off;
}

/** fn() after the app is installed. Returns unsubscribe. */
export function onInstalled(fn) {
  return installed.on(fn);
}

/** Show the browser's install dialog (Chrome/Edge/Samsung on Android and desktop). */
export async function promptInstall() {
  const event = deferredPrompt;
  if (!event || typeof event.prompt !== 'function') return 'unavailable';
  deferredPrompt = null; // a prompt event can be used only once
  try {
    await event.prompt();
    const choice = await event.userChoice;
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}

let applying = false;
let watchingForUpdates = false;

/** Register ./sw.js. Resolves the registration, or null when unsupported or it failed. */
export async function registerServiceWorker({ onUpdateReady } = {}) {
  let sw = null;
  try {
    sw = globalThis.navigator && globalThis.navigator.serviceWorker;
  } catch {
    sw = null;
  }
  if (!sw || globalThis.isSecureContext === false) return null;
  let reg;
  try {
    reg = await sw.register('./sw.js', { scope: './', updateViaCache: 'none' });
  } catch (err) {
    reportWarning('Service worker registration failed; offline mode is unavailable.', err && err.message);
    return null;
  }

  const announced = new WeakSet();
  const announce = (worker) => {
    if (!worker || announced.has(worker) || typeof onUpdateReady !== 'function') return;
    announced.add(worker);
    try {
      onUpdateReady(() => applyUpdate(reg));
    } catch (err) {
      reportWarning('onUpdateReady failed', err);
    }
  };
  // An update downloaded earlier may already be waiting. (Without a controller this is the
  // first install, which activates by itself.)
  if (reg.waiting && sw.controller) announce(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && sw.controller) announce(reg.waiting || worker);
    });
  });

  // Installed apps can stay open for days: look for a new version when brought to the front.
  if (!watchingForUpdates) {
    watchingForUpdates = true;
    let lastCheck = Date.now();
    try {
      globalThis.document.addEventListener('visibilitychange', () => {
        if (globalThis.document.visibilityState !== 'visible' || Date.now() - lastCheck < UPDATE_CHECK_MS) return;
        lastCheck = Date.now();
        reg.update().catch(() => {});
      });
    } catch {
      /* ignore */
    }
  }
  return reg;
}

function applyUpdate(reg) {
  if (applying) return;
  applying = true;
  const sw = globalThis.navigator.serviceWorker;
  const reload = () => {
    try {
      globalThis.location.reload();
    } catch {
      /* ignore */
    }
  };
  let done = false;
  const once = () => {
    if (done) return;
    done = true;
    reload();
  };
  sw.addEventListener('controllerchange', once);
  const waiting = reg.waiting;
  if (!waiting) {
    once(); // nothing waiting any more (another tab already updated): just reload
    return;
  }
  waiting.postMessage({ type: 'SKIP_WAITING' });
  // Safety net: never leave the owner looking at a stale page if the switch is not reported.
  setTimeout(once, RELOAD_FALLBACK_MS);
}
