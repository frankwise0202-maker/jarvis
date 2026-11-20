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

// Characters that show nothing on screen (or only a blank), so text can carry what a reader can't
// see: controls, format characters (zero-width, bidi, the "tag" letters U+E0000…E007F), private-use,
// unassigned and lone surrogate code points, line and paragraph separators, every default-ignorable
// one (variation selectors, fillers, U+034F, U+00AD), and the blank-looking letters (braille blank,
// Hangul fillers).
const HIDDEN = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}⠀ㅤﾠᅟᅠ]/u;
// Letters of scripts with look-alikes of Latin letters ("а" Cyrillic, "ο" Greek): inside a Latin
// word, one of them reads as its Latin twin.
const LOOKALIKE = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}\p{Script=Coptic}\p{Script=Lisu}]/u;
const LATIN = /\p{Script=Latin}/u;
const WORDISH = /[\p{L}\p{M}\p{N}]/u;
const TOKEN_NAMES = { '\t': 'TAB', '\n': 'new line', '\r': 'CR', ' ': 'NBSP', '­': 'SHY', '​': 'ZWSP', '‌': 'ZWNJ', '‍': 'ZWJ', '⁠': 'WJ', '﻿': 'BOM', ' ': 'NNBSP', '　': 'wide space' };
const codeName = (c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;

/** Code point indexes (in [...text]) of look-alike letters inside words that are otherwise Latin. */
function lookalikes(chars) {
  const out = new Set();
  let i = 0;
  while (i < chars.length) {
    if (!WORDISH.test(chars[i])) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < chars.length && WORDISH.test(chars[j])) j += 1;
    const word = chars.slice(i, j);
    if (word.some((c) => LATIN.test(c)) && word.some((c) => LOOKALIKE.test(c))) for (let k = i; k < j; k++) if (LOOKALIKE.test(chars[k])) out.add(k);
    i = j;
  }
  return out;
}

/**
 * Text Claude chose (typed text, a form value, a decoded address) as the owner's card shows it:
 * nothing removed, everything that would not show made visible. Characters that show nothing (see
 * HIDDEN) and every whitespace but a plain space become a token ("[ZWSP]", "[NBSP]", "[new line]",
 * "[U+E0034]"), a run of spaces says how many ("[5 spaces]"), and a look-alike letter inside a
 * Latin word ("pаypal" with a Cyrillic "а") shows its code. Never shortened.
 */
export function revealText(text) {
  const chars = [...String(text ?? '')];
  const odd = lookalikes(chars);
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (c === ' ') {
      let j = i;
      while (j < chars.length && chars[j] === ' ') j += 1;
      out += j - i > 1 ? `[${j - i} spaces]` : ' ';
      i = j - 1;
      continue;
    }
    if (HIDDEN.test(c) || /\s/u.test(c)) out += `[${TOKEN_NAMES[c] || codeName(c)}]`;
    else if (odd.has(i)) out += `[${codeName(c)} ${c}]`;
    else out += c;
  }
  return out;
}

/**
 * What in text Claude chose could carry something the owner would not see on a card, in words
 * ("an invisible or control character", "2 or more spaces in a row"), or '' when nothing. Line
 * breaks don't count with `newlines` (typed text presses Enter for them).
 */
export function hiddenText(text, { newlines = true } = {}) {
  const s = String(text ?? '');
  const chars = [...s];
  if (chars.some((c) => HIDDEN.test(c) && !(newlines && c === '\n'))) return 'an invisible or control character';
  if (chars.some((c) => /\s/u.test(c) && c !== ' ' && !(newlines && c === '\n'))) return 'a special space (a tab, a no-break space or similar)';
  if (/ {2}/.test(s)) return '2 or more spaces in a row';
  if (lookalikes(chars).size) return 'a letter from another alphabet that looks like a Latin one';
  return '';
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
