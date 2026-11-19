// Small helpers shared by the mock Claude API modules (test-only, Node).

import { createHash, randomBytes } from 'node:crypto';

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Random base62 string (crypto-random: ids must be unique across requests). */
export function randomId(prefix, length = 24) {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += BASE62[bytes[i] % 62];
  return prefix + out;
}

export const newMessageId = () => randomId('msg_01');
export const newToolUseId = () => randomId('toolu_01');
export const newServerToolUseId = () => randomId('srvtoolu_01');
export const newRequestId = () => randomId('req_011C');

export function sha256Hex(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Canonical JSON: object keys sorted recursively, object properties whose value is null or
 * undefined dropped, and any key in `omitKeys` dropped (cache_control is cache metadata, not
 * conversation content, so moving a cache breakpoint is not a history edit). Array elements are
 * kept in place (a null element stays null) so indices never shift.
 */
export function canonicalJson(value, omitKeys = DEFAULT_OMIT) {
  return JSON.stringify(normalize(value, omitKeys));
}
const DEFAULT_OMIT = new Set(['cache_control']);

function normalize(value, omitKeys) {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : normalize(v, omitKeys)));
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v === null || v === undefined || omitKeys.has(key)) continue;
      out[key] = normalize(v, omitKeys);
    }
    return out;
  }
  return value;
}

/** Deterministic PRNG (mulberry32) seeded from any string. */
export function seededRandom(seedText) {
  let a = parseInt(sha256Hex(String(seedText)).slice(0, 8), 16) >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: (list) => list[Math.floor(next() * list.length)],
    chance: (p) => next() < p,
    shuffle(list) {
      const copy = list.slice();
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

/**
 * Split text into chunks of roughly `size` characters (varying ±40% with the PRNG), never inside a
 * UTF-16 surrogate pair. Always returns at least one chunk (possibly the empty string).
 */
export function chunkText(text, size, rng) {
  const s = String(text);
  if (s.length === 0) return [''];
  const out = [];
  let i = 0;
  while (i < s.length) {
    const jitter = rng ? 0.6 + rng.next() * 0.8 : 1;
    let end = Math.min(s.length, i + Math.max(1, Math.round(size * jitter)));
    const code = s.charCodeAt(end - 1);
    if (end < s.length && code >= 0xd800 && code <= 0xdbff) end += 1; // keep surrogate pairs together
    out.push(s.slice(i, end));
    i = end;
  }
  return out;
}

/** Rough token estimate (≈ 4 characters per token), never below 1. */
export function estimateTokens(value) {
  if (value === undefined || value === null) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.max(1, Math.ceil(text.length / 4));
}

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    if (!(ms > 0)) return resolve();
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function abortError() {
  // Matches what fetch implementations throw, so SDK code recognizes it as an abort.
  return new DOMException('This operation was aborted', 'AbortError');
}

export const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function truncate(text, max) {
  const s = String(text ?? '');
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function slugify(text, max = 48) {
  const slug = String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
  return slug || 'topic';
}

export function titleCase(text) {
  return String(text ?? '').replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function base64(text) {
  return Buffer.from(String(text), 'utf8').toString('base64');
}
