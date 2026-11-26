// The relay's envelope (wire v1, SPEC §32). Jarvis (the web app, in the owner's usual Chrome
// profile) and Jarvis for Chrome (this extension, in the Jarvis profile) can't talk directly: they
// leave messages for each other at the owner's home base, sealed with the link key, so the home
// base carries what it can't read.
//
//   HTTP body   { id, iv, ct }, each base64url without padding: id 16 random bytes, iv 12 random
//               bytes, ct the AES-GCM-256 output (ciphertext, then the 16-byte tag) with the link
//               key and the additional data `${box}|${id}` (box: 'to-ext' or 'to-app').
//   plaintext   the UTF-8 JSON { v: 1, kind, id, at, body }: id is the outer id, at the sender's
//               clock in ms.
//
// A receiver drops a message, silently, when the tag doesn't verify (also when it was sealed for
// the other box), the inner id differs from the outer one or v isn't 1, `at` is more than 120 s old
// or more than 30 s ahead of its clock, it has seen the id before (the last 500 are kept), or the
// plaintext is over 16,384 bytes.
//
// This is the extension's own copy (the app has src/lib/relay-envelope.js); both pass the shared
// vectors in test/fixtures/relay-vectors.json. Pure: no chrome.* access; WebCrypto only.

export const WIRE_VERSION = 1;
export const BOX_TO_EXT = 'to-ext';
export const BOX_TO_APP = 'to-app';
export const MAX_PLAINTEXT = 16384;
export const MAX_AGE_MS = 120 * 1000;
export const MAX_AHEAD_MS = 30 * 1000;
export const SEEN_MAX = 500;

const KEY_BYTES = 32;
const ID_BYTES = 16;
const KIND = /^[a-z][a-z-]{0,23}$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;
// The fields' lengths as base64url without padding: checked on the strings before anything is decoded
// (REDTEAM-LINK-10: a huge field must cost nothing), as the app's isEnvelopeShape does.
const ID_CHARS = 22;
const IV_CHARS = 16;
const CT_MIN_CHARS = 24; // a tag and a little
export const CT_MAX_CHARS = 21867; // a plaintext of MAX_PLAINTEXT bytes and its tag

const subtle = () => globalThis.crypto.subtle;
const utf8 = new TextEncoder();

/** Bytes as base64url without padding. */
export function toB64u(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64url without padding as bytes, or null: only its own alphabet, written the one way it encodes. */
export function fromB64u(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  let bin;
  try {
    bin = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4));
  } catch {
    return null;
  }
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return toB64u(bytes) === text ? bytes : null;
}

export function randomB64u(n) {
  return toB64u(globalThis.crypto.getRandomValues(new Uint8Array(n)));
}

/** The link key (32 bytes, base64url) as a WebCrypto AES-GCM key; throws on anything else. */
export async function importLinkKey(keyText) {
  const raw = fromB64u(keyText);
  if (!raw || raw.length !== KEY_BYTES) throw new Error('The link key must be 32 bytes.');
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const aad = (box, id) => utf8.encode(`${box}|${id}`);

/** Seals `plaintext` (bytes) for `box` with the given id and iv (both base64url). */
export async function sealBytes(key, { box, id, iv, plaintext }) {
  const ivBytes = fromB64u(iv);
  if (!ivBytes || ivBytes.length !== IV_BYTES) throw new Error('bad iv');
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv: ivBytes, additionalData: aad(box, id), tagLength: TAG_BYTES * 8 }, key, plaintext);
  return { id, iv, ct: toB64u(new Uint8Array(ct)) };
}

/** The plaintext of a message, as the wire writes it: { v: 1, kind, id, at, body }. */
export function plaintextOf({ kind, id, at, body }) {
  return JSON.stringify({ v: WIRE_VERSION, kind, id, at, body });
}

/** A message for `box`: { id, iv, ct }. `id`, `iv` and `at` are fresh unless given (the tests). */
export async function seal(key, { box, kind, body = {}, at = Date.now(), id = randomB64u(ID_BYTES), iv = randomB64u(IV_BYTES) }) {
  const plaintext = utf8.encode(plaintextOf({ kind, id, at, body }));
  if (plaintext.length > MAX_PLAINTEXT) throw new Error('message too big');
  return sealBytes(key, { box, id, iv, plaintext });
}

/** The ids a receiver has seen (the last SEEN_MAX), oldest first. */
export class SeenIds {
  constructor(list = [], max = SEEN_MAX) {
    this.max = max;
    this.list = (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string').slice(-max);
    this.set = new Set(this.list);
  }

  has(id) {
    return this.set.has(id);
  }

  add(id) {
    if (this.set.has(id)) return;
    this.list.push(id);
    this.set.add(id);
    while (this.list.length > this.max) this.set.delete(this.list.shift());
  }

  toJSON() {
    return [...this.list];
  }
}

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

/**
 * Opens a message from the box `box` (this receiver's own). Returns { ok: true, message: { kind,
 * id, at, body } } or { ok: false, reason } (the caller drops it without a word). A message that
 * passes is added to `seen`.
 */
export async function unseal(key, { box, msg, now = Date.now(), seen = null }) {
  const drop = (reason) => ({ ok: false, reason });
  // Exactly { id, iv, ct }: nothing else rides along.
  if (!isPlainObject(msg) || Object.keys(msg).length !== 3 || typeof msg.id !== 'string' || typeof msg.iv !== 'string' || typeof msg.ct !== 'string') return drop('shape');
  // Lengths first, on the strings: nothing too long is ever decoded (REDTEAM-LINK-10).
  if (msg.id.length !== ID_CHARS || msg.iv.length !== IV_CHARS) return drop('shape');
  if (msg.ct.length > CT_MAX_CHARS) return drop('size');
  if (msg.ct.length < CT_MIN_CHARS || msg.ct.length % 4 === 1) return drop('shape');
  const id = fromB64u(msg.id);
  const iv = fromB64u(msg.iv);
  const ct = fromB64u(msg.ct);
  if (!id || id.length !== ID_BYTES || !iv || iv.length !== IV_BYTES || !ct || ct.length < TAG_BYTES) return drop('shape');
  if (ct.length - TAG_BYTES > MAX_PLAINTEXT) return drop('size');
  let plain;
  try {
    plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: aad(box, msg.id), tagLength: TAG_BYTES * 8 }, key, ct));
  } catch {
    return drop('tag');
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  } catch {
    return drop('json');
  }
  if (!isPlainObject(data) || data.v !== WIRE_VERSION) return drop('version');
  if (data.id !== msg.id) return drop('id');
  if (typeof data.kind !== 'string' || !KIND.test(data.kind) || !isPlainObject(data.body)) return drop('shape');
  if (!Number.isSafeInteger(data.at) || data.at <= 0) return drop('clock');
  if (data.at < now - MAX_AGE_MS) return drop('old');
  if (data.at > now + MAX_AHEAD_MS) return drop('ahead');
  if (seen?.has(msg.id)) return drop('replay');
  seen?.add(msg.id);
  return { ok: true, message: { kind: data.kind, id: data.id, at: data.at, body: data.body } };
}
