// HUD preferences (SPEC 2.4.12 Settings → HUD, 2.4.19 Calm and Full HUD), kept apart from the
// platform settings so they never change the settings schema: localStorage['jarvis.hud.v1'] as
// { density, motion, boot }. Validated like settings (an invalid value falls back to its default),
// shared across tabs (storage events), and carried in backups as a registered part.
//
//   getHud()            -> { density: 'calm' | 'full', motion: 'full' | 'reduced' | 'still',
//                            boot: 'session' | 'launch' | 'never' }   (frozen)
//   saveHud(patch)      -> merge, validate, persist, notify; returns the new prefs
//   onHudChange(fn)     -> fn(prefs) after every change (this tab or another); returns unsubscribe
//   exportHud() / importHud(data)  -> backup part (undefined when nothing was ever saved)
//
// boot: 'session' plays the 1.6 s boot once per browser session (the default), 'launch' on every
// launch (each page load), 'never' not at all. Never throws.

export const HUD_KEY = 'jarvis.hud.v1';

export const HUD_DEFAULTS = Object.freeze({ density: 'calm', motion: 'full', boot: 'session' });

export const HUD_OPTIONS = Object.freeze({
  density: Object.freeze(['calm', 'full']),
  motion: Object.freeze(['full', 'reduced', 'still']),
  boot: Object.freeze(['session', 'launch', 'never']),
});

const listeners = new Set();
let current = null;
let watching = false;

function storage() {
  try {
    const s = globalThis.localStorage;
    return s && typeof s.getItem === 'function' ? s : null;
  } catch {
    return null;
  }
}

/** A complete, valid, frozen prefs object from anything (unknown keys dropped). */
export function normalizeHud(input, base = HUD_DEFAULTS) {
  const src = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const out = {};
  for (const key of Object.keys(HUD_DEFAULTS)) {
    const v = src[key];
    out[key] = typeof v === 'string' && HUD_OPTIONS[key].includes(v) ? v : base[key];
  }
  return Object.freeze(out);
}

function read() {
  const s = storage();
  let raw = null;
  try {
    raw = s ? JSON.parse(s.getItem(HUD_KEY) || 'null') : null;
  } catch {
    raw = null;
  }
  return normalizeHud(raw);
}

function same(a, b) {
  return Object.keys(HUD_DEFAULTS).every((k) => a[k] === b[k]);
}

function emit(prefs) {
  for (const fn of Array.from(listeners)) {
    try {
      fn(prefs);
    } catch (err) {
      try {
        console.error('[jarvis] hud listener failed:', err);
      } catch {
        /* ignore */
      }
    }
  }
}

function watch() {
  if (watching || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  watching = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== HUD_KEY && e.key !== null) return;
    const next = read();
    if (current && same(current, next)) return;
    current = next;
    emit(next);
  });
}

export function getHud() {
  if (!current) {
    current = read();
    watch();
  }
  return current;
}

export function saveHud(patch) {
  const prev = getHud();
  if (!patch || typeof patch !== 'object') return prev;
  const next = normalizeHud({ ...prev, ...patch }, prev);
  if (same(prev, next)) return prev;
  current = next;
  const s = storage();
  try {
    if (s) s.setItem(HUD_KEY, JSON.stringify(next));
  } catch {
    /* private mode or full storage: this session only */
  }
  emit(next);
  return next;
}

export function onHudChange(fn) {
  getHud();
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Backup part: the saved prefs, or undefined when the owner never changed them. */
export function exportHud() {
  const s = storage();
  let saved = null;
  try {
    saved = s ? s.getItem(HUD_KEY) : null;
  } catch {
    saved = null;
  }
  return saved ? { ...getHud() } : undefined;
}

/** Backup part: adopt imported prefs (validated). Returns 1 when something changed, else 0. */
export function importHud(data) {
  if (!data || typeof data !== 'object') return 0;
  const before = getHud();
  const after = saveHud(normalizeHud(data, before));
  return same(before, after) ? 0 : 1;
}

/** Test hook: forget the cached prefs (the next getHud() reads storage again). */
export function resetHudCache() {
  current = null;
}
