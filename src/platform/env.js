// Environment facts for the UI (SPEC §9.3). All functions are safe to call anywhere (they never
// throw; outside a browser they return neutral answers).
//
//   isOnline() / onOnlineChange(fn)          navigator.onLine + online/offline events
//   prefersReducedMotion() / onReducedMotionChange(fn)
//   isTouch()        the primary pointer is a finger (phones, tablets without a trackpad);
//                    the composer uses it to make Enter insert a newline instead of sending
//   isStandalone()   running as an installed app (home-screen / desktop PWA window)
//   isIOS()          iPhone/iPod/iPad, including iPadOS which reports a desktop Mac user agent
//   isAndroid()
//   parseUserAgent(ua, maxTouchPoints) -> { os, browser, mobile }   (pure; exported for tests)

function nav() {
  try {
    return globalThis.navigator || null;
  } catch {
    return null;
  }
}

function media(query) {
  try {
    return typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia(query) : null;
  } catch {
    return null;
  }
}

function matches(query) {
  const m = media(query);
  return !!(m && m.matches);
}

/** Subscribe to a media query; fn(matches). Returns unsubscribe. */
function watchMedia(query, fn) {
  const m = media(query);
  if (!m || typeof fn !== 'function') return () => {};
  const handler = (e) => fn(!!e.matches);
  if (typeof m.addEventListener === 'function') {
    m.addEventListener('change', handler);
    return () => m.removeEventListener('change', handler);
  }
  if (typeof m.addListener === 'function') {
    m.addListener(handler); // Safari < 14
    return () => m.removeListener(handler);
  }
  return () => {};
}

/** True unless the browser says it is offline. */
export function isOnline() {
  const n = nav();
  return !n || n.onLine !== false;
}

/** fn(online: boolean) on every online/offline change. Returns unsubscribe. */
export function onOnlineChange(fn) {
  if (typeof fn !== 'function' || typeof globalThis.addEventListener !== 'function') return () => {};
  const online = () => fn(true);
  const offline = () => fn(false);
  globalThis.addEventListener('online', online);
  globalThis.addEventListener('offline', offline);
  return () => {
    globalThis.removeEventListener('online', online);
    globalThis.removeEventListener('offline', offline);
  };
}

export function prefersReducedMotion() {
  return matches('(prefers-reduced-motion: reduce)');
}

/** fn(reduced: boolean) when the reduced-motion preference changes. Returns unsubscribe. */
export function onReducedMotionChange(fn) {
  return watchMedia('(prefers-reduced-motion: reduce)', fn);
}

export function isTouch() {
  if (media('(pointer: coarse)')) return matches('(pointer: coarse)');
  const n = nav();
  return !!((n && n.maxTouchPoints > 0) || 'ontouchstart' in globalThis);
}

export function isStandalone() {
  const n = nav();
  if (n && n.standalone === true) return true; // iOS home-screen app
  return (
    matches('(display-mode: standalone)') ||
    matches('(display-mode: fullscreen)') ||
    matches('(display-mode: minimal-ui)') ||
    matches('(display-mode: window-controls-overlay)')
  );
}

export function isIOS() {
  return current().os === 'ios';
}

export function isAndroid() {
  return current().os === 'android';
}

function current() {
  const n = nav();
  return parseUserAgent(n ? n.userAgent : '', n ? n.maxTouchPoints : 0);
}

/**
 * Pure user-agent classification.
 *   os:      'ios' | 'android' | 'mac' | 'windows' | 'chromeos' | 'linux' | 'other'
 *   browser: 'safari' | 'chrome' | 'edge' | 'firefox' | 'samsung' | 'other'
 *            ('other' includes in-app browsers such as Instagram or Facebook, and Opera)
 *   mobile:  phone or tablet
 */
export function parseUserAgent(ua, maxTouchPoints = 0) {
  const s = typeof ua === 'string' ? ua : '';
  let os = 'other';
  if (/iPhone|iPad|iPod/.test(s)) os = 'ios';
  else if (/Macintosh/.test(s) && Number(maxTouchPoints) > 1) os = 'ios'; // iPadOS "desktop" UA
  else if (/Android/i.test(s)) os = 'android';
  else if (/CrOS/.test(s)) os = 'chromeos';
  else if (/Macintosh|Mac OS X/.test(s)) os = 'mac';
  else if (/Windows/.test(s)) os = 'windows';
  else if (/Linux|X11/.test(s)) os = 'linux';

  let browser = 'other';
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|GSA\/|Snapchat|Twitter|LinkedInApp|; wv\)/.test(s);
  if (inApp) browser = 'other';
  else if (/SamsungBrowser\//.test(s)) browser = 'samsung';
  else if (/Edg(?:e|A|iOS)?\//.test(s)) browser = 'edge';
  else if (/OPR\/|Opera|OPT\/|YaBrowser|UCBrowser/.test(s)) browser = 'other';
  else if (/Firefox\/|FxiOS\//.test(s)) browser = 'firefox';
  else if (/CriOS\/|Chrome\/|Chromium\//.test(s)) browser = 'chrome';
  else if (/Safari\//.test(s) && /Version\//.test(s)) browser = 'safari';

  const mobile = os === 'ios' || os === 'android' || /Mobi/.test(s);
  return { os, browser, mobile };
}
