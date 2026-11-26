// Jarvis for Chrome's relay envelope (v8.1, wire v1, SPEC §32.1). Pure: WebCrypto (crypto.subtle), TextEncoder
// and TextDecoder only, so the app, the E2E's fake Jarvis for Chrome and the tests share it. Jarvis for Chrome
// keeps its own copy (extension/), held to the same vectors (test/fixtures/relay-vectors.json).
//
// The web app (the owner's usual Chrome profile) and Jarvis for Chrome (its own "Jarvis" profile) can't talk
// directly, so they pass messages through two boxes on the home base (Jarvis Core 1.3: /api/relay/to-ext and
// /api/relay/to-app). The home base only holds them: every message is sealed with the link key, which only the
// two ends have (the link code the owner copies from Jarvis and pastes into Jarvis for Chrome), never the home
// base.
//
//   HTTP body (both boxes): { id, iv, ct }, each base64url without padding
//     id   16 random bytes (22 characters)
//     iv   12 random bytes (16 characters)
//     ct   AES-GCM-256(key, iv, plaintext, additional data = the UTF-8 bytes of `${box}|${id}`):
//          the ciphertext, then the 16-byte tag
//   plaintext: the UTF-8 JSON { v: 1, kind, id, at, body }   (id = the outer id; at = ms since 1970 at the sender)
//
// A receiver drops a message, silently, when:
//   - its shape is wrong: checked on the strings' lengths and alphabet before anything is decoded, decrypted or
//     parsed (a plaintext over 16,384 bytes is a ct over 21,867 characters, so it never reaches the decryption);
//   - it has seen the id before (the last 500 ids are kept);
//   - the tag doesn't verify: a changed byte, another key, or a message sealed for the other box;
//   - the plaintext isn't a JSON object, `v` isn't 1, the inner id differs from the outer one, or `kind` or `body`
//     is malformed;
//   - `at` is more than 120 s old or more than 30 s ahead of the receiver's clock.
//
//   newLinkKey()                       → a new link key: 32 bytes from crypto.getRandomValues, base64url (43 chars)
//   isLinkKey(text)                    → true for a key in that form
//   importLinkKey(key)                 → Promise<CryptoKey> (AES-GCM, not extractable); rejects with a plain
//                                        Error that never contains the key
//   sealEnvelope(cryptoKey, { box, kind, body, at, id?, iv? })  → Promise<{ id, iv, ct }>
//   openEnvelope(cryptoKey, envelope, { box, now, seen })        → Promise<{ ok: true, message } | { ok: false, reason }>
//                                        reason: 'shape' | 'replay' | 'tag' | 'plaintext' | 'version' | 'inner' |
//                                        'kind' | 'body' | 'time' | 'old' | 'ahead' (for tests; a receiver says nothing)
//   isEnvelopeShape(value)             → true for exactly { id, iv, ct } of the right lengths and alphabet
//   createSeenIds({ limit, ids })      → { has(id), add(id), list() }: the replay window (the last 500 ids)
//   makeLinkCode({ core, key })        → the link code: base64url of the JSON { v: 1, core, key }
//   parseLinkCode(code)                → { ok: true, link: { v, core, key } } | { ok: false, reason }
//   isCoreOrigin(text)                 → true for a home base origin as the link code carries it
//                                        ('https://<machine>.<tailnet>.ts.net': no path, no port)
//   b64url(bytes) / fromB64url(text)   → strict, canonical base64url without padding (null when malformed)
//
// Nothing here logs, and no error it throws carries the key, a plaintext or a body.

export const RELAY_WIRE = 1;
export const RELAY_BOXES = Object.freeze(['to-ext', 'to-app']);

export const KEY_BYTES = 32;
export const ID_BYTES = 16;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const MAX_PLAINTEXT_BYTES = 16384;
export const MAX_AGE_MS = 120_000;
export const MAX_AHEAD_MS = 30_000;
export const SEEN_LIMIT = 500;

/** base64url characters (no padding) for n bytes. */
export const b64Chars = (n) => Math.ceil((n * 4) / 3);
export const KEY_CHARS = b64Chars(KEY_BYTES); // 43
export const ID_CHARS = b64Chars(ID_BYTES); // 22
export const IV_CHARS = b64Chars(IV_BYTES); // 16
// The smallest plaintext a sender makes is far above 2 bytes; anything shorter can't be a message.
export const CT_MIN_CHARS = b64Chars(TAG_BYTES + 2); // 24
export const CT_MAX_CHARS = b64Chars(MAX_PLAINTEXT_BYTES + TAG_BYTES); // 21867
export const LINK_CODE_MAX_CHARS = 512;

const KIND_RE = /^[a-z][a-z-]{0,23}$/;
const B64URL_RE = /^[A-Za-z0-9_-]*$/;
const CORE_RE = /^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}ts\.net$/;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const LOOKUP = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function subtle() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new Error('WebCrypto is not available here');
  return s;
}

function randomBytes(n) {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

const utf8 = (text) => new TextEncoder().encode(text);

/** Bytes → base64url without padding. */
export function b64url(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let out = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) {
    const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2];
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63] + ALPHABET[(n >>> 6) & 63] + ALPHABET[n & 63];
  }
  const rest = b.length - i;
  if (rest === 1) {
    const n = b[i] << 16;
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63];
  } else if (rest === 2) {
    const n = (b[i] << 16) | (b[i + 1] << 8);
    out += ALPHABET[(n >>> 18) & 63] + ALPHABET[(n >>> 12) & 63] + ALPHABET[(n >>> 6) & 63];
  }
  return out;
}

/**
 * base64url without padding → bytes, or null: any other character, padding, an impossible length, or a
 * non-canonical last character (unused bits set) is refused, so one byte string has exactly one spelling.
 */
export function fromB64url(text) {
  if (typeof text !== 'string' || text.length % 4 === 1) return null;
  const full = Math.floor(text.length / 4) * 4;
  const rest = text.length - full;
  const out = new Uint8Array((full / 4) * 3 + (rest === 2 ? 1 : rest === 3 ? 2 : 0));
  const at = (i) => {
    const c = text.charCodeAt(i);
    return c < 128 ? LOOKUP[c] : -1;
  };
  let o = 0;
  for (let i = 0; i < full; i += 4) {
    const a = at(i);
    const b = at(i + 1);
    const c = at(i + 2);
    const d = at(i + 3);
    if ((a | b | c | d) < 0) return null;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    out[o++] = (n >>> 16) & 255;
    out[o++] = (n >>> 8) & 255;
    out[o++] = n & 255;
  }
  if (rest === 2) {
    const a = at(full);
    const b = at(full + 1);
    if ((a | b) < 0 || (b & 15) !== 0) return null;
    out[o] = ((a << 2) | (b >>> 4)) & 255;
  } else if (rest === 3) {
    const a = at(full);
    const b = at(full + 1);
    const c = at(full + 2);
    if ((a | b | c) < 0 || (c & 3) !== 0) return null;
    const n = (a << 18) | (b << 12) | (c << 6);
    out[o++] = (n >>> 16) & 255;
    out[o] = (n >>> 8) & 255;
  }
  return out;
}

/** A base64url string of exactly `chars` characters that decodes canonically (no decoding of anything longer). */
function isB64Exact(v, chars) {
  return typeof v === 'string' && v.length === chars && B64URL_RE.test(v) && fromB64url(v) !== null;
}

/** A new link key: 32 random bytes, base64url (43 characters). */
export function newLinkKey() {
  return b64url(randomBytes(KEY_BYTES));
}

export function isLinkKey(text) {
  return isB64Exact(text, KEY_CHARS);
}

/** A new random message id (16 bytes, 22 characters). */
export function newMessageId() {
  return b64url(randomBytes(ID_BYTES));
}

/** The link key as a CryptoKey for AES-GCM (not extractable). The error never names the key. */
export async function importLinkKey(key) {
  if (!isLinkKey(key)) throw new Error('not a link key');
  try {
    return await subtle().importKey('raw', fromB64url(key), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  } catch {
    throw new Error('the link key could not be used');
  }
}

/**
 * Exactly { id, iv, ct }: id 22 and iv 16 base64url characters, ct 24-21,867. Checked on the strings' lengths
 * and alphabet before anything is decoded, so a huge or odd value costs nothing.
 */
export function isEnvelopeShape(value) {
  if (!isObj(value)) return false;
  const own = (k) => Object.prototype.hasOwnProperty.call(value, k);
  if (Object.keys(value).length !== 3 || !own('id') || !own('iv') || !own('ct')) return false;
  const { id, iv, ct } = value;
  if (typeof ct !== 'string' || ct.length < CT_MIN_CHARS || ct.length > CT_MAX_CHARS || ct.length % 4 === 1) return false;
  if (!isB64Exact(id, ID_CHARS) || !isB64Exact(iv, IV_CHARS)) return false;
  return B64URL_RE.test(ct);
}

const additionalData = (box, id) => utf8(`${box}|${id}`);

function checkBox(box) {
  if (!RELAY_BOXES.includes(box)) throw new TypeError('box must be to-ext or to-app');
}

/**
 * Seal one message for `box`: { id, iv, ct }. `at` defaults to now; `id` and `iv` to fresh random values
 * (the vectors pass fixed ones). Throws a RangeError for a plaintext over 16,384 bytes.
 */
export async function sealEnvelope(cryptoKey, { box, kind, body = {}, at = Date.now(), id = newMessageId(), iv = b64url(randomBytes(IV_BYTES)) } = {}) {
  checkBox(box);
  if (typeof kind !== 'string' || !KIND_RE.test(kind)) throw new TypeError('kind must be a short lower-case word');
  if (!isObj(body)) throw new TypeError('body must be an object');
  if (!Number.isSafeInteger(at) || at <= 0) throw new TypeError('at must be a time in milliseconds');
  if (!isB64Exact(id, ID_CHARS) || !isB64Exact(iv, IV_CHARS)) throw new TypeError('id or iv is malformed');
  const plaintext = utf8(JSON.stringify({ v: RELAY_WIRE, kind, id, at, body }));
  if (plaintext.length > MAX_PLAINTEXT_BYTES) throw new RangeError('the message is too big for the relay');
  let sealed;
  try {
    sealed = await subtle().encrypt({ name: 'AES-GCM', iv: fromB64url(iv), additionalData: additionalData(box, id), tagLength: TAG_BYTES * 8 }, cryptoKey, plaintext);
  } catch {
    throw new Error('the message could not be sealed');
  }
  return { id, iv, ct: b64url(new Uint8Array(sealed)) };
}

const drop = (reason) => ({ ok: false, reason });

/**
 * Open one envelope read from `box`. { ok: true, message: { v, kind, id, at, body } } or { ok: false, reason }.
 * `seen` (createSeenIds) is the replay window: an opened message's id is added to it. `now` is the receiver's
 * clock (ms).
 */
export async function openEnvelope(cryptoKey, envelope, { box, now = Date.now(), seen = null } = {}) {
  checkBox(box);
  if (!isEnvelopeShape(envelope)) return drop('shape');
  const { id, iv, ct } = envelope;
  if (seen && seen.has(id)) return drop('replay');
  let plain;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: fromB64url(iv), additionalData: additionalData(box, id), tagLength: TAG_BYTES * 8 }, cryptoKey, fromB64url(ct)));
  } catch {
    return drop('tag');
  }
  if (plain.length > MAX_PLAINTEXT_BYTES) return drop('shape'); // unreachable after the length check; kept as the rule
  let message;
  try {
    message = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  } catch {
    return drop('plaintext');
  }
  if (!isObj(message)) return drop('plaintext');
  if (message.v !== RELAY_WIRE) return drop('version');
  if (message.id !== id) return drop('inner');
  if (typeof message.kind !== 'string' || !KIND_RE.test(message.kind)) return drop('kind');
  if (!isObj(message.body)) return drop('body');
  const at = message.at;
  if (!Number.isSafeInteger(at) || at <= 0) return drop('time');
  if (now - at > MAX_AGE_MS) return drop('old');
  if (at - now > MAX_AHEAD_MS) return drop('ahead');
  if (seen) seen.add(id);
  return { ok: true, message: { v: message.v, kind: message.kind, id, at, body: message.body } };
}

/**
 * The replay window: the last `limit` ids opened (500 by the wire). `ids` restores a saved list (oldest
 * first); anything malformed in it is ignored.
 */
export function createSeenIds({ limit = SEEN_LIMIT, ids = [] } = {}) {
  const set = new Set();
  const add = (id) => {
    if (!isB64Exact(id, ID_CHARS)) return;
    set.delete(id);
    set.add(id);
    while (set.size > limit) set.delete(set.values().next().value);
  };
  if (Array.isArray(ids)) for (const id of ids.slice(-2 * limit)) add(id); // malformed entries are skipped; the newest `limit` stay
  return {
    has: (id) => set.has(id),
    add,
    list: () => Array.from(set),
    get size() {
      return set.size;
    },
  };
}

/** A home base origin as the link code carries it: 'https://<machine>.<tailnet>.ts.net' (no path, no port). */
export function isCoreOrigin(text) {
  return typeof text === 'string' && text.length <= 261 && CORE_RE.test(text);
}

/** The link code the owner copies: base64url of the UTF-8 JSON { v: 1, core, key }. */
export function makeLinkCode({ core, key } = {}) {
  if (!isCoreOrigin(core)) throw new TypeError('core must be the home base’s https://….ts.net origin');
  if (!isLinkKey(key)) throw new TypeError('not a link key');
  return b64url(utf8(JSON.stringify({ v: RELAY_WIRE, core, key })));
}

/** A pasted link code → { ok: true, link: { v, core, key } } or { ok: false, reason: 'empty' | 'code' | 'version' }. */
export function parseLinkCode(code) {
  const text = typeof code === 'string' ? code.trim() : '';
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > LINK_CODE_MAX_CHARS || !B64URL_RE.test(text)) return { ok: false, reason: 'code' };
  const bytes = fromB64url(text);
  if (!bytes) return { ok: false, reason: 'code' };
  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return { ok: false, reason: 'code' };
  }
  if (!isObj(data)) return { ok: false, reason: 'code' };
  if (data.v !== RELAY_WIRE) return { ok: false, reason: 'version' };
  if (!isCoreOrigin(data.core) || !isLinkKey(data.key)) return { ok: false, reason: 'code' };
  return { ok: true, link: { v: RELAY_WIRE, core: data.core, key: data.key } };
}
