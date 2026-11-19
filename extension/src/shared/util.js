// Small helpers shared by the service worker and the side panel. No chrome.* or DOM access here.

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** An Error that looks like a DOM AbortError (what fetch and the SDK throw on abort). */
export function abortError(message = 'Stopped.') {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

export function isAbort(err) {
  return !!err && (err.name === 'AbortError' || err.name === 'APIUserAbortError' || err.jarvisAbort === true);
}

/** Resolves after `ms`, or rejects with an AbortError as soon as `signal` aborts. */
export function abortableSleep(ms, signal) {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, Math.max(0, ms));
    function done() {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    function onAbort() {
      clearTimeout(timer);
      reject(abortError());
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Races `promise` against `signal`: rejects with an AbortError the moment the signal aborts. */
export function untilAborted(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** Rejects with `message` after `ms` unless `promise` settles first. */
export function withTimeout(promise, ms, message = 'Timed out') {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]);
}

let counter = 0;
/** Short unique id (time + counter + randomness). */
export function uid(prefix = '') {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Deep copy of plain JSON data (drops undefined, functions and class identity). */
export function jsonCopy(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

// Invisible and direction-changing characters a page can use to make text read differently than
// it is (bidi overrides, zero-width joiners, BOM). Stripped from anything shown to the owner.
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
// C0/C1 controls and the Unicode line/paragraph separators (the API rejects them in tab state).
const CONTROL = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g;

/** One line of display text: invisible characters removed, whitespace collapsed. */
export function singleLine(text) {
  return String(text ?? '')
    .replace(INVISIBLE, '')
    .replace(CONTROL, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Text safe to show to the owner: invisible/bidi characters removed, newlines kept. */
export function displayText(text) {
  return String(text ?? '')
    .replace(INVISIBLE, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    .replace(/\r\n?/g, '\n');
}

export function truncate(text, max) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** "$0.04", "$1.27", "<$0.01" for tiny non-zero amounts. */
export function formatUsd(amount) {
  const n = Number(amount) || 0;
  if (n > 0 && n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

/** Elapsed time as "8s", "1m 05s". */
export function formatDuration(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Escape every character outside printable ASCII (for showing page-derived values in prompts). */
export function asciiEscape(text) {
  return String(text ?? '').replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}
