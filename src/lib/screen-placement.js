// Screens (v7): where a screen goes, decided from what the browser can do. Pure logic (no DOM
// writes); the browser objects are passed in, so tests use stubs.
//
//   const env = detectScreenEnv(window)
//     { windowManagement, pip, popups, mobile, ios, safari, standalone, extended }
//   planPlacement({ where, kind, env, permission, details, screen, target })
//     -> { mode: 'screen' | 'pip' | 'window' | 'inapp' | 'ask' | 'tab', … }
//   pickTargetScreen(details, { screen, target })  -> { screen, number, label, same } | null
//   orderScreens(screens)                          -> primary first, then left to right
//   screenWindowFeatures(rect, { fullscreen })     -> 'popup=1,left=…,top=…,width=…,height=…'
//   rightHalf(screenLike)                          -> { left, top, width, height }
//
// Modes:
//   screen  a window maximized on another monitor (Window Management API: getScreenDetails)
//   pip     a floating, always-on-top HUD panel (Document Picture-in-Picture)
//   window  a popup window on the right half of the current screen
//   inapp   the app's own full-screen viewer (phones and tablets: one screen, no popups)
//   tab     a new tab (a web link on a phone)
//   ask     the Window Management permission has not been asked yet: explain, then ask
// `note` says why a fallback was used, for the message to the owner (see placementNote).

export const PIP_SIZES = Object.freeze({
  hologram: [640, 480],
  blueprint: [640, 480],
  photo: [560, 420],
  camera: [560, 420],
  mission: [440, 500],
  answer: [460, 540],
  link: [420, 260],
});

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

/** What this browser can do for screens. `win` is a window (or a stub with the same shape). */
export function detectScreenEnv(win = globalThis) {
  const nav = (win && win.navigator) || {};
  const ua = String(nav.userAgent || '');
  const platform = String(nav.platform || '');
  const touch = num(nav.maxTouchPoints) > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touch) || (/Macintosh/.test(ua) && touch && !/Chrome|CriOS|Firefox/.test(ua));
  const android = /Android/.test(ua);
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|CriOS\/|Edg\/|OPR\/|Firefox\/|FxiOS\//.test(ua);
  let standalone = false;
  try {
    standalone = !!((win.matchMedia && win.matchMedia('(display-mode: standalone)').matches) || nav.standalone === true);
  } catch {
    standalone = false;
  }
  const mobile = ios || android || /Mobi/.test(ua);
  const scr = win && win.screen;
  return {
    windowManagement: typeof (win && win.getScreenDetails) === 'function' && !mobile,
    pip: !!(win && win.documentPictureInPicture && typeof win.documentPictureInPicture.requestWindow === 'function') && !mobile,
    popups: !mobile && typeof (win && win.open) === 'function',
    mobile,
    ios,
    safari,
    standalone,
    // Chrome tells, without asking, whether more than one screen is connected.
    extended: scr && typeof scr.isExtended === 'boolean' ? scr.isExtended : null,
  };
}

function sameScreen(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  return num(a.left) === num(b.left) && num(a.top) === num(b.top) && num(a.width) === num(b.width) && num(a.height) === num(b.height);
}

/** Screens in the order people number them: the primary one first, then left to right, top to bottom. */
export function orderScreens(screens) {
  const list = Array.isArray(screens) ? screens.filter((s) => s && typeof s === 'object') : [];
  return list
    .map((s, i) => ({ s, i }))
    .sort((a, b) => Number(!!b.s.isPrimary) - Number(!!a.s.isPrimary) || num(a.s.left) - num(b.s.left) || num(a.s.top) - num(b.s.top) || a.i - b.i)
    .map((x) => x.s);
}

/**
 * The monitor to use. `screen`: a number the owner said ("screen 2"); `target`: 'internal' (the
 * laptop's own screen) or 'primary'. Otherwise the other screen: an external one when the app is
 * on the laptop, else the biggest one that is not the app's. Never the app's own screen unless that
 * is all there is ({ same: true }). null when there are no screens.
 */
export function pickTargetScreen(details, { screen = null, target = null } = {}) {
  const ordered = orderScreens(details && details.screens);
  if (!ordered.length) return null;
  const current = (details && details.currentScreen) || null;
  const isCurrent = (s) => sameScreen(s, current);
  const result = (s) => {
    const n = ordered.indexOf(s) + 1;
    return { screen: s, number: n, label: `SCREEN ${n}`, same: isCurrent(s), internal: !!s.isInternal, name: typeof s.label === 'string' ? s.label : '' };
  };
  const others = ordered.filter((s) => !isCurrent(s));
  let pick = null;
  if (Number.isInteger(screen) && screen >= 1 && screen <= ordered.length) {
    pick = ordered[screen - 1];
    // "Screen 2" said while the app is already on it: the owner means the other one.
    if (isCurrent(pick) && others.length) pick = others[0];
  } else if (target === 'internal') {
    pick = ordered.find((s) => s.isInternal) || null;
  } else if (target === 'primary') {
    pick = ordered.find((s) => s.isPrimary) || ordered[0];
  }
  if (!pick && others.length) {
    const cur = current || ordered[0];
    const external = others.filter((s) => !s.isInternal);
    const pool = cur && cur.isInternal && external.length ? external : others;
    pick = pool.slice().sort((a, b) => num(b.width) * num(b.height) - num(a.width) * num(a.height))[0];
  }
  return result(pick || ordered[0]);
}

/** The usable area of a screen (ScreenDetailed, or window.screen). */
export function availRect(s) {
  if (!s) return { left: 0, top: 0, width: 1280, height: 800 };
  const width = num(s.availWidth, num(s.width, 1280));
  const height = num(s.availHeight, num(s.height, 800));
  const left = num(s.availLeft, num(s.left, 0));
  const top = num(s.availTop, num(s.top, 0));
  return { left, top, width, height };
}

/** The right half of a screen's usable area ("open it in a window": beside what is on the left). */
export function rightHalf(s) {
  const a = availRect(s);
  const width = Math.max(420, Math.floor(a.width / 2));
  return { left: a.left + a.width - width, top: a.top, width, height: a.height };
}

/** window.open features for a popup at `rect` (fullscreen: Chrome's fullscreen popups, where supported). */
export function screenWindowFeatures(rect, { fullscreen = false } = {}) {
  const r = rect || {};
  const parts = ['popup=1', `left=${Math.round(num(r.left))}`, `top=${Math.round(num(r.top))}`, `width=${Math.max(320, Math.round(num(r.width, 960)))}`, `height=${Math.max(240, Math.round(num(r.height, 720)))}`];
  if (fullscreen) parts.push('fullscreen=1');
  return parts.join(',');
}

/**
 * Decide the placement.
 *   where: 'other' | 'beside' | 'window'; kind: what is shown (a 'link' never floats: a web page
 *   can't live in a Jarvis panel); env: detectScreenEnv(); permission: 'granted' | 'prompt' |
 *   'denied' | null (Window Management); details: getScreenDetails() result when granted;
 *   currentScreen: window.screen (for the right half); screen/target: from the command.
 */
export function planPlacement({ where, kind = 'answer', env = {}, permission = null, details = null, currentScreen = null, screen = null, target = null, fullscreen = false } = {}) {
  const isLink = kind === 'link';
  if (env.mobile || !env.popups) {
    if (isLink) return { mode: 'tab', label: 'TAB', note: 'phone' };
    return { mode: 'inapp', label: 'SCREEN', note: 'phone' };
  }
  const windowPlan = (note, label = 'WINDOW') => ({ mode: 'window', rect: rightHalf(currentScreen), features: screenWindowFeatures(rightHalf(currentScreen)), label, note: note || null });
  const besidePlan = (note) => {
    if (env.pip && !isLink) {
      const [width, height] = PIP_SIZES[kind] || PIP_SIZES.answer;
      return { mode: 'pip', width, height, label: 'FLOAT', note: note || null };
    }
    return windowPlan(note || (isLink ? null : 'no-pip'), 'WINDOW');
  };
  if (where === 'window') return windowPlan(null);
  if (where === 'beside') return besidePlan(null);
  // where === 'other'
  if (!env.windowManagement) {
    // Safari, Firefox: no way to choose a screen. A window the owner can drag across.
    if (env.extended === false) return besidePlan('single-screen');
    return windowPlan('no-wm');
  }
  if (permission === 'denied') {
    if (env.extended === false) return besidePlan('single-screen');
    return windowPlan('wm-denied');
  }
  if (permission !== 'granted' || !details) {
    if (env.extended === false) return besidePlan('single-screen');
    return { mode: 'ask', label: 'SCREEN', note: 'needs-permission' };
  }
  const screens = Array.isArray(details.screens) ? details.screens : [];
  if (screens.length < 2) return besidePlan('single-screen');
  const pick = pickTargetScreen(details, { screen, target });
  if (!pick) return besidePlan('single-screen');
  if (pick.same) return { ...windowPlan('same-screen'), label: pick.label };
  const rect = availRect(pick.screen);
  return { mode: 'screen', rect, features: screenWindowFeatures(rect, { fullscreen }), label: pick.label, number: pick.number, screenName: pick.name, internal: pick.internal, fullscreen: !!fullscreen, note: Number.isInteger(screen) && screen > screens.length ? 'no-such-screen' : null };
}

/** A short line for the owner about a fallback ('' when nothing needs saying). */
export function placementNote(note, { label = '' } = {}) {
  switch (note) {
    case 'single-screen':
      return 'Only one screen is connected, so it’s floating beside you instead.';
    case 'no-wm':
      return 'This browser can’t choose a screen, so it opened in a new window. Drag it to your other screen.';
    case 'wm-denied':
      return 'Window placement is blocked for Jarvis in this browser’s site settings, so it opened in a new window. Drag it to your other screen, or allow “Window management” for Jarvis.';
    case 'no-pip':
      return 'This browser has no floating panels, so it opened in a window beside you.';
    case 'phone':
      return 'This device has one screen, so it’s open full screen here.';
    case 'same-screen':
      return `Jarvis is already on ${label ? label.toLowerCase() : 'that screen'}, so it opened in a window there.`;
    case 'no-such-screen':
      return `There’s no monitor with that number, so it went to ${label ? label.toLowerCase() : 'your other screen'}.`;
    default:
      return '';
  }
}
