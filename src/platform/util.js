// Small shared helpers for the platform modules (internal; not part of the SPEC contract).

/** True for a non-null, non-array object (e.g. parsed JSON object). */
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Clamp a number into [min, max]. */
export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n;
}

/**
 * Coerce a finite number or a plain numeric string ("7", " 1.25 ") to a number.
 * Returns null for anything else (NaN, Infinity, "", "abc", booleans, objects).
 */
export function toFiniteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^\s*[-+]?(?:\d+\.?\d*|\.\d+)\s*$/.test(value)) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// C0/C1 control characters, plus invisible bidi controls that can visually
// reorder text (they have no business in names, facts or locations).
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/g;

/**
 * Normalize user-ish text to one clean line: strip control characters, collapse
 * whitespace, trim, and cut to `max` code points (never splitting a surrogate pair).
 */
export function cleanLine(value, max) {
  if (typeof value !== 'string') return '';
  let s = value.replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim();
  if (max > 0 && s.length > max) s = truncate(s, max);
  return s;
}

/**
 * Cut `s` to at most `max` code points. With `ellipsis`, a cut string ends in "…"
 * (the result still has at most `max` code points).
 */
export function truncate(s, max, ellipsis = false) {
  if (s.length <= max) return s;
  const points = Array.from(s);
  if (points.length <= max) return s;
  if (!ellipsis) return points.slice(0, max).join('').trimEnd();
  return points.slice(0, Math.max(0, max - 1)).join('').trimEnd() + '…';
}

/** Random id: crypto.randomUUID() when available, else a random base36 string. */
export function newId() {
  const c = globalThis.crypto;
  try {
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* randomUUID throws outside secure contexts in some browsers */
  }
  try {
    if (c && typeof c.getRandomValues === 'function') {
      const a = new Uint32Array(4);
      c.getRandomValues(a);
      return Array.from(a, (n) => n.toString(36).padStart(7, '0')).join('');
    }
  } catch {
    /* fall through */
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * A tiny listener set. emit() calls every listener with the payload; a throwing
 * listener is reported and never stops the others (or the caller).
 */
export function createEmitter(label) {
  const listeners = new Set();
  return {
    on(fn) {
      if (typeof fn !== 'function') return () => {};
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    emit(payload) {
      for (const fn of Array.from(listeners)) {
        try {
          fn(payload);
        } catch (err) {
          reportError(`${label} listener failed`, err);
        }
      }
    },
    get size() {
      return listeners.size;
    },
  };
}

/** console.error that can never throw (console may be missing in odd embeds). */
export function reportError(message, err) {
  try {
    console.error(`[jarvis] ${message}:`, err);
  } catch {
    /* ignore */
  }
}

/** console.warn that can never throw. */
export function reportWarning(message, detail) {
  try {
    if (detail === undefined) console.warn(`[jarvis] ${message}`);
    else console.warn(`[jarvis] ${message}`, detail);
  } catch {
    /* ignore */
  }
}

/** JSON.parse that returns `fallback` instead of throwing. */
export function parseJson(text, fallback = null) {
  if (typeof text !== 'string' || !text) return fallback;
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}
