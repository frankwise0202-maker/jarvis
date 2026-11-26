// The relay's envelope (wire v1): the extension's own copy. Round trips, and every message a
// receiver must drop: a changed byte, the wrong box, a wrong inner id or version, too old, too far
// ahead, a replay, too big. The shared vectors (test/fixtures/relay-vectors.json, the app's and
// Core's too) are read when they are there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BOX_TO_APP,
  BOX_TO_EXT,
  MAX_PLAINTEXT,
  SeenIds,
  fromB64u,
  importLinkKey,
  plaintextOf,
  randomB64u,
  seal,
  sealBytes,
  toB64u,
  unseal,
} from '../../../extension/src/background/envelope.js';

const KEY = toB64u(new Uint8Array(32).map((_, i) => i + 1));
const NOW = 1_800_000_000_000;

test('base64url: no padding, its own alphabet only, one way to write each value', () => {
  const bytes = Uint8Array.from([0xfb, 0xff, 0x00, 0x3e, 0x3f]);
  const s = toB64u(bytes);
  assert.equal(s, '-_8APj8');
  assert.deepEqual([...fromB64u(s)], [...bytes]);
  for (const bad of ['-_8APj8=', '+/8APj8', 'a b', 'A', '-_8APj9', 'é']) assert.equal(fromB64u(bad), null, bad);
  assert.equal(randomB64u(16).length, 22);
  assert.equal(randomB64u(12).length, 16);
});

test('the link key must be 32 bytes', async () => {
  await importLinkKey(KEY);
  await assert.rejects(() => importLinkKey(toB64u(new Uint8Array(16))));
  await assert.rejects(() => importLinkKey('not a key'));
});

test('a round trip, both boxes; the plaintext is exactly { v, kind, id, at, body }', async () => {
  const key = await importLinkKey(KEY);
  for (const box of [BOX_TO_EXT, BOX_TO_APP]) {
    const msg = await seal(key, { box, kind: 'open', body: { url: 'https://shop.example/', rect: null, focus: true }, at: NOW });
    assert.deepEqual(Object.keys(msg).sort(), ['ct', 'id', 'iv']);
    assert.equal(fromB64u(msg.id).length, 16);
    assert.equal(fromB64u(msg.iv).length, 12);
    const out = await unseal(key, { box, msg, now: NOW + 1000, seen: new SeenIds() });
    assert.deepEqual(out, { ok: true, message: { kind: 'open', id: msg.id, at: NOW, body: { url: 'https://shop.example/', rect: null, focus: true } } });
  }
  assert.equal(plaintextOf({ kind: 'ping', id: 'x', at: 5, body: {} }), '{"v":1,"kind":"ping","id":"x","at":5,"body":{}}');
});

test('dropped: a changed byte anywhere, the other box, another key', async () => {
  const key = await importLinkKey(KEY);
  const other = await importLinkKey(toB64u(new Uint8Array(32).fill(9)));
  const msg = await seal(key, { box: BOX_TO_EXT, kind: 'ping', body: {}, at: NOW });
  const ct = fromB64u(msg.ct);
  for (let i = 0; i < ct.length; i += 7) {
    const bent = Uint8Array.from(ct);
    bent[i] ^= 0x01;
    assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { ...msg, ct: toB64u(bent) }, now: NOW })).reason, 'tag', `byte ${i}`);
  }
  const iv = fromB64u(msg.iv);
  iv[0] ^= 1;
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { ...msg, iv: toB64u(iv) }, now: NOW })).reason, 'tag');
  // The id is in the additional data: another id (even one the receiver hasn't seen) fails the tag.
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { ...msg, id: randomB64u(16) }, now: NOW })).reason, 'tag');
  // Sealed for the app's box, read from the extension's: fails.
  const forApp = await seal(key, { box: BOX_TO_APP, kind: 'ping', body: {}, at: NOW });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: forApp, now: NOW })).reason, 'tag');
  assert.equal((await unseal(other, { box: BOX_TO_EXT, msg, now: NOW })).reason, 'tag');
});

test('dropped: the wrong inner id, another version, a missing body, bad shapes', async () => {
  const key = await importLinkKey(KEY);
  const id = randomB64u(16);
  const iv = randomB64u(12);
  const raw = (obj) => sealBytes(key, { box: BOX_TO_EXT, id, iv, plaintext: new TextEncoder().encode(JSON.stringify(obj)) });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await raw({ v: 1, kind: 'ping', id: randomB64u(16), at: NOW, body: {} }), now: NOW })).reason, 'id');
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await raw({ v: 2, kind: 'ping', id, at: NOW, body: {} }), now: NOW })).reason, 'version');
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await raw({ v: 1, kind: 'ping', id, at: NOW }), now: NOW })).reason, 'shape');
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await raw({ v: 1, kind: 'ping', id, at: String(NOW), body: {} }), now: NOW })).reason, 'clock');
  const notJson = await sealBytes(key, { box: BOX_TO_EXT, id, iv, plaintext: new TextEncoder().encode('{"v":1,') });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: notJson, now: NOW })).reason, 'json');
  for (const msg of [null, 'x', [], { id, iv }, { id, iv, ct: 'AAAA' }, { id: id.slice(1), iv, ct: toB64u(new Uint8Array(40)) }, { id, iv: iv.slice(2), ct: toB64u(new Uint8Array(40)) }]) {
    assert.equal((await unseal(key, { box: BOX_TO_EXT, msg, now: NOW })).reason, 'shape', JSON.stringify(msg));
  }
});

test('dropped: more than 120 s old or more than 30 s ahead; accepted just inside both', async () => {
  const key = await importLinkKey(KEY);
  const at = (t) => seal(key, { box: BOX_TO_EXT, kind: 'ping', body: {}, at: t });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await at(NOW - 120_001), now: NOW })).reason, 'old');
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await at(NOW + 30_001), now: NOW })).reason, 'ahead');
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await at(NOW - 120_000), now: NOW })).ok, true);
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: await at(NOW + 30_000), now: NOW })).ok, true);
});

test('dropped: an id seen before (the last 500 are kept)', async () => {
  const key = await importLinkKey(KEY);
  const seen = new SeenIds();
  const msg = await seal(key, { box: BOX_TO_EXT, kind: 'answer', body: { promptId: 'p', hash: 'h', choice: 'cancel', via: 'voice' }, at: NOW });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg, now: NOW, seen })).ok, true);
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg, now: NOW + 5, seen })).reason, 'replay');
  // A message that fails is not counted as seen (a forgery can't use up an id).
  const fresh = await seal(key, { box: BOX_TO_EXT, kind: 'ping', body: {}, at: NOW });
  const bent = fromB64u(fresh.ct);
  bent[3] ^= 4;
  await unseal(key, { box: BOX_TO_EXT, msg: { ...fresh, ct: toB64u(bent) }, now: NOW, seen });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: fresh, now: NOW, seen })).ok, true);
  const ring = new SeenIds();
  for (let i = 0; i < 501; i++) ring.add(`id${i}`);
  assert.equal(ring.toJSON().length, 500);
  assert.equal(ring.has('id0'), false);
  assert.equal(ring.has('id500'), true);
  assert.equal(new SeenIds(ring.toJSON()).has('id1'), true, 'kept across a restart');
});

test('LINK-10: the lengths are checked on the strings before anything is decoded: a huge field costs nothing', async () => {
  const key = await importLinkKey(KEY);
  const realAtob = globalThis.atob;
  let decoded = 0;
  globalThis.atob = (...a) => {
    decoded += 1;
    return realAtob(...a);
  };
  try {
    const t0 = Date.now();
    const huge = 'A'.repeat(1024 * 1024);
    assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { id: randomB64u(16), iv: randomB64u(12), ct: huge }, now: NOW })).reason, 'size');
    assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { id: huge, iv: randomB64u(12), ct: 'A'.repeat(96) }, now: NOW })).reason, 'shape');
    assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { id: randomB64u(16), iv: huge, ct: 'A'.repeat(96) }, now: NOW })).reason, 'shape');
    assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { id: randomB64u(16), iv: randomB64u(12), ct: 'A'.repeat(97) }, now: NOW })).reason, 'shape', 'a length base64url never has');
    assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: { id: randomB64u(16), iv: randomB64u(12), ct: 'A'.repeat(23) }, now: NOW })).reason, 'shape', 'too short for a tag');
    assert.equal(decoded, 0, 'nothing was decoded');
    assert.ok(Date.now() - t0 < 1000, `at once (${Date.now() - t0} ms)`);
  } finally {
    globalThis.atob = realAtob;
  }
});

test('dropped: a plaintext over 16,384 bytes; sealing one refuses too', async () => {
  const key = await importLinkKey(KEY);
  const id = randomB64u(16);
  const pad = (n) => JSON.stringify({ v: 1, kind: 'task', id, at: NOW, body: { text: '' } }).length + n;
  const fill = (len) => 'x'.repeat(len - pad(0));
  const at16k = await sealBytes(key, { box: BOX_TO_EXT, id, iv: randomB64u(12), plaintext: new TextEncoder().encode(JSON.stringify({ v: 1, kind: 'task', id, at: NOW, body: { text: fill(MAX_PLAINTEXT) } })) });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: at16k, now: NOW })).ok, true, 'exactly 16,384 bytes is fine');
  const over = await sealBytes(key, { box: BOX_TO_EXT, id: randomB64u(16), iv: randomB64u(12), plaintext: new Uint8Array(MAX_PLAINTEXT + 1).fill(32) });
  assert.equal((await unseal(key, { box: BOX_TO_EXT, msg: over, now: NOW })).reason, 'size');
  await assert.rejects(() => seal(key, { box: BOX_TO_APP, kind: 'task', body: { text: 'x'.repeat(MAX_PLAINTEXT) }, at: NOW }));
});

// ---------------------------------------------------------------------------------------------
// The shared vectors (chrome-relay writes them; the app, the extension and Core all read them).

const VECTORS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/relay-vectors.json');

test('the shared vectors (test/fixtures/relay-vectors.json): every valid case seals to its ct and opens to its message', async () => {
  assert.ok(existsSync(VECTORS), 'the shared vectors are in the repository');
  const v = JSON.parse(readFileSync(VECTORS, 'utf8'));
  assert.equal(v.wire, 1);
  const key = await importLinkKey(v.key);
  assert.ok(v.valid.length >= 5, 'valid cases');
  for (const c of v.valid) {
    const sealed = await sealBytes(key, { box: c.box, id: c.id, iv: c.iv, plaintext: new TextEncoder().encode(c.plaintext) });
    assert.equal(sealed.ct, c.ct, `${c.name}: the same ct`);
    const out = await unseal(key, { box: c.box, msg: { id: c.id, iv: c.iv, ct: c.ct }, now: v.now, seen: new SeenIds() });
    assert.equal(out.ok, true, `${c.name}: opens (${out.reason})`);
    assert.deepEqual(out.message, { kind: c.message.kind, id: c.message.id, at: c.message.at, body: c.message.body }, `${c.name}: its message`);
    // What this extension writes is the same bytes (key order included).
    assert.equal(plaintextOf(c.message), c.plaintext, `${c.name}: the plaintext as written`);
  }
});

test('the shared vectors: every must-drop case is dropped, and so is the replay', async () => {
  const v = JSON.parse(readFileSync(VECTORS, 'utf8'));
  const key = await importLinkKey(v.key);
  assert.ok(v.drop.length >= 10, 'drop cases');
  for (const c of v.drop) {
    const out = await unseal(key, { box: c.box, msg: c.envelope, now: v.now, seen: new SeenIds() });
    assert.equal(out.ok, false, `${c.name}: dropped`);
  }
  const seen = new SeenIds();
  assert.equal((await unseal(key, { box: v.replay.box, msg: v.replay.envelope, now: v.now, seen })).ok, true, 'the first time');
  assert.equal((await unseal(key, { box: v.replay.box, msg: v.replay.envelope, now: v.now, seen })).reason, 'replay', 'the second time');
});
