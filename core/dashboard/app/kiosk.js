// Kiosk behaviour for the 24/7 screen: the cursor hides after 3 s, the whole stage moves a few
// pixels every few minutes (burn-in), night dim between two local times (23:00–07:00 by default),
// a gentle daily refresh at a quiet hour, and reduced motion. Everything that depends on the time
// of day is derived from the clock on each tick, never from long timers, so it survives sleep,
// clock changes and weeks of uptime.
//
// Only the Alienware's own screen is a kiosk: the page loaded from this computer (localhost,
// 127.0.0.1, [::1]). The same page on the owner's iPhone or Mac (https://<machine>.<tailnet>.ts.net/)
// is a remote viewer: it never dims at night, never shifts, never hides the cursor, never reloads
// itself, and typing on it does not start a question (screenFeatures below).
//
// Settings come from the page address (the autostart can pass them) or the Core's /api/info
// `config`, the address winning:
//   ?dim=23:00-07:00   night dim window (local time); ?dim=off never dims
//   ?dimlevel=0.6      how much darker at night (0.2–0.85; default 0.55)
//   ?shift=off         no pixel shift
//   ?refresh=04:00     daily refresh time; ?refresh=off never refreshes
//   ?cursor=show       never hide the cursor

import { minutesOfDay } from './format.js';

export const DEFAULTS = Object.freeze({
  dim: { start: 23 * 60, end: 7 * 60 },
  dimLevel: 0.55,
  shift: true,
  shiftEveryMin: 3,
  shiftRadiusPx: 3,
  refreshAt: 4 * 60,
  cursorIdleMs: 3000,
  wakeMs: 2 * 60 * 1000, // touching the mouse or keyboard at night lifts the dim this long
});

/**
 * Is the page on the Alienware's own screen? The kiosk Chrome opens http://localhost:8788/; the Core
 * only answers a Host of localhost, 127.0.0.1 or [::1] directly (anything else comes through
 * Tailscale), so those names mean this computer and every other name a remote viewer.
 */
export function isKioskHost(hostname) {
  const h = String(hostname ?? '').trim().toLowerCase().replace(/\.$/, '');
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

/**
 * What the page does on this screen. Every kiosk behaviour is on for the Alienware's own screen
 * and off for a remote viewer (the iPhone or the Mac through Tailscale): no night dim, no pixel
 * shift, no hidden cursor, no daily refresh, no reload when the Core is updated (a notice instead),
 * and keys typed on the page stay where they are typed.
 */
export function screenFeatures(hostname) {
  const kiosk = isKioskHost(hostname);
  return Object.freeze({
    kiosk,
    view: kiosk ? 'kiosk' : 'remote',
    nightDim: kiosk,
    pixelShift: kiosk,
    hideCursor: kiosk,
    dailyRefresh: kiosk,
    reloadOnUpdate: kiosk,
    typeAnywhere: kiosk,
  });
}

/** "23:00" → 1380, "7:05" → 425; null when not a time. */
export function parseClock(s) {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(String(s ?? ''));
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2] === undefined ? 0 : Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min > 0)) return null;
  return (h % 24) * 60 + min;
}

/** "23:00-07:00" → { start, end }; "off" → null; anything unparsable → the fallback. */
export function parseWindow(s, fallback = DEFAULTS.dim) {
  if (s === undefined || s === null || s === '') return fallback;
  if (typeof s === 'object') {
    const start = parseClock(s.start);
    const end = parseClock(s.end);
    return start === null || end === null ? fallback : { start, end };
  }
  const text = String(s).trim().toLowerCase();
  if (text === 'off' || text === 'none' || text === 'never' || text === '0' || text === 'false') return null;
  const m = /^(.+?)\s*(?:-|–|to)\s*(.+)$/.exec(text);
  if (!m) return fallback;
  const start = parseClock(m[1]);
  const end = parseClock(m[2]);
  return start === null || end === null ? fallback : { start, end };
}

/** Is `minutes` (since local midnight) inside the window? Windows may wrap midnight. */
export function inWindow(minutes, win) {
  if (!win || win.start === win.end) return false;
  if (win.start < win.end) return minutes >= win.start && minutes < win.end;
  return minutes >= win.start || minutes < win.end;
}

/**
 * Pixel-shift offset for a moment: 8 positions on a small circle, one step every
 * `everyMin` minutes, derived from the epoch time (no state, the same on every reload).
 */
export function shiftOffset(epochMs, everyMin = DEFAULTS.shiftEveryMin, radius = DEFAULTS.shiftRadiusPx) {
  const step = Math.floor(epochMs / (everyMin * 60000));
  const k = ((step % 8) + 8) % 8;
  const a = (k * Math.PI) / 4;
  return { x: Math.round(Math.cos(a) * radius), y: Math.round(Math.sin(a) * radius), step: k };
}

/** Read the kiosk settings from URLSearchParams and an optional server config object. */
export function readSettings(params, serverConfig = {}) {
  const get = (k) => (params && params.has(k) ? params.get(k) : undefined);
  const cfg = serverConfig && typeof serverConfig === 'object' ? serverConfig : {};
  const dimSrc = get('dim') ?? cfg.nightDim ?? cfg.dim;
  const dim = parseWindow(dimSrc, DEFAULTS.dim);
  let dimLevel = Number(get('dimlevel') ?? cfg.dimLevel ?? DEFAULTS.dimLevel);
  if (!Number.isFinite(dimLevel)) dimLevel = DEFAULTS.dimLevel;
  dimLevel = Math.min(0.85, Math.max(0.2, dimLevel));
  const shiftSrc = String(get('shift') ?? cfg.pixelShift ?? 'on').toLowerCase();
  const shift = !['off', 'false', '0', 'no'].includes(shiftSrc);
  const refreshSrc = get('refresh') ?? cfg.dailyRefresh;
  let refreshAt = DEFAULTS.refreshAt;
  if (refreshSrc !== undefined && refreshSrc !== null) {
    const t = String(refreshSrc).trim().toLowerCase();
    refreshAt = ['off', 'false', '0', 'no', 'never'].includes(t) ? null : parseClock(t) ?? DEFAULTS.refreshAt;
  }
  const cursorSrc = String(get('cursor') ?? 'hide').toLowerCase();
  return { dim, dimLevel, shift, refreshAt, hideCursor: cursorSrc !== 'show' };
}

/**
 * Should the page refresh now? Only at the configured minute, only when it has been open at
 * least an hour (so the fresh page never refreshes again) and only while the Core answers.
 */
export function shouldRefresh({ minutes, refreshAt, openedMs, nowMs, coreLive }) {
  if (refreshAt === null || refreshAt === undefined) return false;
  if (!coreLive) return false;
  if (nowMs - openedMs < 60 * 60 * 1000) return false;
  return minutes === refreshAt;
}

/**
 * The live controller. `root` is <html>, `stage` the element that moves. Returns
 * { tick(nowMs), isNight(), isWoken(), destroy() }; main.js calls tick once a second.
 * `kiosk: false` (a remote viewer) turns every kiosk behaviour off: the page never dims, never
 * moves, keeps its cursor and never refreshes itself.
 */
export function createKiosk({ root, stage, veil, settings, onNightChange, onRefresh, isCoreLive, timeZone, kiosk = true }) {
  const zone = typeof timeZone === 'function' ? timeZone : () => timeZone;
  const on = kiosk !== false;
  let night = null;
  let wokeUntil = 0;
  let lastShift = -1;
  let cursorTimer = 0;
  const openedMs = Date.now();
  let destroyed = false;

  root.style.setProperty('--night-dim', String(settings.dimLevel));

  function showCursor() {
    root.classList.remove('cursor-hidden');
    if (!on || !settings.hideCursor) return;
    if (cursorTimer) clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      cursorTimer = 0;
      root.classList.add('cursor-hidden');
    }, DEFAULTS.cursorIdleMs);
  }

  let lastNow = Date.now();
  function wake() {
    if (night) {
      wokeUntil = lastNow + DEFAULTS.wakeMs;
      apply(lastNow);
    }
  }

  let lastMove = 0;
  function onPointer() {
    const t = Date.now();
    if (t - lastMove < 200) return; // mousemove fires a lot; once per 200 ms is plenty
    lastMove = t;
    showCursor();
    wake();
  }
  function onKey() {
    wake();
  }

  if (on) {
    window.addEventListener('mousemove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });
    window.addEventListener('keydown', onKey, true);
    if (settings.hideCursor) showCursor();
  }

  function apply(nowMs) {
    lastNow = nowMs;
    const minutes = minutesOfDay(new Date(nowMs), zone());
    const isNight = on && inWindow(minutes, settings.dim);
    const dimmed = isNight && nowMs >= wokeUntil;
    if (dimmed !== night) {
      night = dimmed;
      root.dataset.night = dimmed ? 'on' : 'off';
      if (veil) veil.hidden = false;
      if (onNightChange) onNightChange(dimmed);
    }
    return minutes;
  }

  /**
   * nowMs: the Core's clock (the same as the wall clock on the real machine; the simulated clock in
   * fixture mode, so night dim follows a pinned or accelerated time). The daily refresh always
   * uses the real wall clock.
   */
  function tick(nowMs) {
    if (destroyed) return;
    apply(nowMs);
    if (!on) return;
    if (settings.shift && stage) {
      const s = shiftOffset(nowMs);
      if (s.step !== lastShift) {
        lastShift = s.step;
        stage.style.setProperty('--shift-x', `${s.x}px`);
        stage.style.setProperty('--shift-y', `${s.y}px`);
      }
    }
    const wall = Date.now();
    const wallMinutes = minutesOfDay(new Date(wall), zone());
    if (onRefresh && shouldRefresh({ minutes: wallMinutes, refreshAt: settings.refreshAt, openedMs, nowMs: wall, coreLive: isCoreLive ? isCoreLive() : false })) {
      onRefresh();
    }
  }

  function destroy() {
    destroyed = true;
    if (cursorTimer) clearTimeout(cursorTimer);
    if (!on) return;
    window.removeEventListener('mousemove', onPointer);
    window.removeEventListener('pointerdown', onPointer);
    window.removeEventListener('keydown', onKey, true);
  }

  /** New settings (the Core's config arrived): the next tick applies them. */
  function updateSettings(next) {
    settings = next;
    root.style.setProperty('--night-dim', String(settings.dimLevel));
    if (on && !settings.shift && stage) {
      stage.style.setProperty('--shift-x', '0px');
      stage.style.setProperty('--shift-y', '0px');
      lastShift = -1;
    }
    if (!settings.hideCursor) root.classList.remove('cursor-hidden');
    night = null; // re-evaluate on the next tick
  }

  return {
    tick,
    isNight: () => night === true,
    wake,
    updateSettings,
    destroy,
  };
}
