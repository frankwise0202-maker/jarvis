// Small shared helpers for the Core server. No dependencies.

/** True for a finite number. */
export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Round to `d` decimals; anything that is not a finite number becomes null. */
export function round(v, d = 1) {
  if (!isNum(v)) return null;
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** part / whole as a percentage, or null when either is missing or whole is not positive. */
export function pct(part, whole) {
  return isNum(part) && isNum(whole) && whole > 0 ? (part / whole) * 100 : null;
}

/**
 * Call onValue with the result of `value`, which is either a plain value (the fixture simulator answers
 * synchronously) or a promise (the live machine). Returns true when the work went asynchronous.
 * A rejected promise calls onValue(undefined, error).
 */
export function settle(value, onValue) {
  if (value && typeof value.then === 'function') {
    value.then(
      (v) => onValue(v, null),
      (err) => onValue(undefined, err || new Error('failed')),
    );
    return true;
  }
  onValue(value, null);
  return false;
}

/** Split text into lines, tolerating CRLF and a missing final newline. */
export const lines = (text) => (typeof text === 'string' ? text.split(/\r?\n/) : []);

/** Drop a trailing dot from a DNS name ("alienware.tail1234.ts.net." → "alienware.tail1234.ts.net"). */
export const trimDot = (name) => (typeof name === 'string' && name ? name.replace(/\.$/, '') : null);

/** A Go time string, with the zero time ("0001-01-01T00:00:00Z") meaning "not set", to epoch ms or null. */
export function parseGoTime(s) {
  if (typeof s !== 'string' || !s || s.startsWith('0001-01-01')) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Shallow-check a plain object. */
export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Deep-merge plain objects (arrays and other values replace). Returns a new object. */
export function deepMerge(base, over) {
  if (!isObj(base) || !isObj(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    out[k] = isObj(v) && isObj(base[k]) ? deepMerge(base[k], v) : v;
  }
  return out;
}

/** "HH:MM" → minutes after midnight, or null. */
export function parseHm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
}
