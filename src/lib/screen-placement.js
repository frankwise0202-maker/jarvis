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
//   layoutRects({ screens, current, main, count, layout })  -> [{ left, top, width, height }, …]
//   layoutArea({ screens, current, main, count, layout })   -> { area, region, screen, strip }
//   windowRect(win)                                -> a window's own rect (screenX/Y, outer size)
//   resizedRect(rect, 'bigger' | 'smaller' | 'fill', bounds), screenAt(screens, rect)   (D5)
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
  jarvis: [300, 260], // v8.1 D6: Jarvis himself, floating
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

// ---- layouts (v8.1): several windows at once -------------------------------------------------------

/**
 * How much of Jarvis's own window stays uncovered when windows share its screen. macOS counts a
 * window that is fully covered as hidden, and hidden stops the camera, a walkthrough and (without
 * background listening) Voice Mode. A strip of it keeps Jarvis on screen.
 */
export const KEEP_STRIP_PX = 320;
/** A column narrower than this would be cramped: windows overlap Jarvis (the strip kept) instead. */
export const MIN_COLUMN_PX = 480;
export const LAYOUTS = Object.freeze(['side-by-side', 'left-right', 'grid', 'beside']);
export const MAX_WINDOWS = 4;

/** A window's own rect on the desktop (screenX/Y and its outer size), or null. */
export function windowRect(win) {
  if (!win) return null;
  const left = Number(win.screenX ?? win.screenLeft);
  const top = Number(win.screenY ?? win.screenTop);
  const width = Number(win.outerWidth);
  const height = Number(win.outerHeight);
  if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  return { left, top, width, height };
}

/** The other monitor for a layout: like pickTargetScreen without a number (never the current one). */
function otherScreen(screens, current) {
  const ordered = orderScreens(screens);
  const others = ordered.filter((s) => !sameScreen(s, current));
  if (!others.length) return null;
  const external = others.filter((s) => !s.isInternal);
  const pool = current && current.isInternal && external.length ? external : others;
  return pool.slice().sort((a, b) => num(b.width) * num(b.height) - num(a.width) * num(a.height))[0];
}

/**
 * Where a layout goes. The other monitor first (all of its usable area: Jarvis stays in full view
 * on his own). On Jarvis's screen alone, the windows take the side of his window with more room (or
 * `side`, when the owner named one), and never cover all of it: `strip` is the part of his window
 * that stays uncovered (at least KEEP_STRIP_PX wide, or all of it when there is room beside it).
 *   -> { area, region, screen: 'other' | 'current', strip: { left, top, width, height } | null, side }
 */
export function layoutArea({ screens = [], current = null, main = null, count = 1, keep = KEEP_STRIP_PX, side: prefer = null } = {}) {
  const list = Array.isArray(screens) ? screens.filter((s) => s && typeof s === 'object') : [];
  const cur = current || orderScreens(list)[0] || null;
  const other = list.length > 1 ? otherScreen(list, cur) : null;
  if (other) {
    const area = availRect(other);
    return { area, region: area, screen: 'other', strip: null, side: 'right' };
  }
  const area = availRect(cur);
  const right = area.left + area.width;
  // Jarvis's window, clipped to his screen (a missing rect: he fills it).
  const m = main && Number.isFinite(main.left) && Number.isFinite(main.width) ? main : area;
  const jl = Math.max(area.left, Math.min(right, num(m.left)));
  const jr = Math.max(jl, Math.min(right, num(m.left) + num(m.width)));
  const n = Math.max(1, Math.min(MAX_WINDOWS, Math.floor(num(count, 1)) || 1));
  const columns = n === 1 ? 1 : 2;
  const need = columns * MIN_COLUMN_PX;
  const roomLeft = jl - area.left;
  const roomRight = right - jr;
  // The side with more room, unless the owner named one ("the camera on the left").
  const side = prefer === 'left' || prefer === 'right' ? prefer : roomRight >= roomLeft ? 'right' : 'left';
  let lo;
  let hi;
  if (side === 'right') {
    // Room enough beside Jarvis: don't cover him at all. Else cover all but his left strip.
    lo = roomRight >= need ? jr : Math.min(jr, jl + keep);
    hi = right;
  } else {
    lo = area.left;
    hi = roomLeft >= need ? jl : Math.max(jl, jr - keep);
  }
  const region = { left: lo, top: area.top, width: Math.max(0, hi - lo), height: area.height };
  const kept = side === 'right' ? { left: jl, width: Math.max(0, lo - jl) } : { left: hi, width: Math.max(0, jr - hi) };
  const strip = jr > jl ? { left: kept.left, top: area.top, width: Math.min(kept.width, jr - jl), height: area.height } : null;
  return { area, region, screen: 'current', strip, side };
}

/**
 * One rect per window for a layout ('side-by-side' and 'left-right': columns, left to right; 'grid':
 * two columns, two rows for 3-4; 'beside': one window beside Jarvis). The other monitor first; on
 * Jarvis's screen alone a strip of his window stays uncovered (layoutArea). One window on his screen
 * takes at most half of it, so most of Jarvis stays in view. Rects are whole pixels, in screen
 * coordinates (window.open's left/top and moveTo use them), left to right then top to bottom.
 */
export function layoutRects(opts = {}) {
  const n = Math.max(1, Math.min(MAX_WINDOWS, Math.floor(num(opts.count, 1)) || 1));
  const { area, region, screen, side } = layoutArea({ ...opts, count: n });
  const r = { left: Math.round(region.left), top: Math.round(region.top), width: Math.floor(region.width), height: Math.floor(region.height) };
  if (n === 1) {
    if (screen === 'other') return [r];
    // Beside Jarvis: half his screen at most, at the far side from him.
    const width = Math.min(r.width, Math.max(Math.min(MIN_COLUMN_PX, r.width), Math.floor(area.width / 2)));
    return [{ left: side === 'right' ? r.left + r.width - width : r.left, top: r.top, width, height: r.height }];
  }
  const cols = 2;
  const rows = n <= 2 ? 1 : 2;
  const colW = Math.floor(r.width / cols);
  const rowH = Math.floor(r.height / rows);
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols);
    const col = i % cols;
    // Three windows: the third one spans the bottom row.
    const span = n === 3 && i === 2;
    out.push({ left: r.left + (span ? 0 : col * colW), top: r.top + row * rowH, width: span ? colW * 2 : colW, height: rowH });
  }
  return out;
}

/**
 * A new place for a window (D5): 'bigger' / 'smaller' (by a quarter, around its centre) or 'fill',
 * inside `bounds` (the usable area of its monitor, or beside Jarvis with his strip kept), never
 * smaller than 320×240. -> { left, top, width, height } in whole pixels
 */
export function resizedRect(rect, size, bounds) {
  const b = { left: num(bounds && bounds.left), top: num(bounds && bounds.top), width: Math.max(320, num(bounds && bounds.width, 1280)), height: Math.max(240, num(bounds && bounds.height, 800)) };
  if (size === 'fill' || !rect) return { left: Math.round(b.left), top: Math.round(b.top), width: Math.floor(b.width), height: Math.floor(b.height) };
  const k = size === 'bigger' ? 1.25 : 0.8;
  const width = Math.round(Math.min(b.width, Math.max(320, num(rect.width) * k)));
  const height = Math.round(Math.min(b.height, Math.max(240, num(rect.height) * k)));
  const cx = num(rect.left) + num(rect.width) / 2;
  const cy = num(rect.top) + num(rect.height) / 2;
  const left = Math.round(Math.min(b.left + b.width - width, Math.max(b.left, cx - width / 2)));
  const top = Math.round(Math.min(b.top + b.height - height, Math.max(b.top, cy - height / 2)));
  return { left, top, width, height };
}

/** The monitor whose area holds the centre of `rect` (ScreenDetailed or window.screen objects), or null. */
export function screenAt(screens, rect) {
  if (!rect || !Array.isArray(screens)) return null;
  const cx = num(rect.left) + num(rect.width) / 2;
  const cy = num(rect.top) + num(rect.height) / 2;
  return (
    screens.find((s) => {
      if (!s || typeof s !== 'object') return false;
      const left = num(s.left, num(s.availLeft));
      const top = num(s.top, num(s.availTop));
      return cx >= left && cx < left + num(s.width, num(s.availWidth)) && cy >= top && cy < top + num(s.height, num(s.availHeight));
    }) || null
  );
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
