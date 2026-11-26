// Jarvis for Chrome's relay envelope (v8.1, wire v1, SPEC §32.1: src/lib/relay-envelope.js) on the shared vectors
// (test/fixtures/relay-vectors.json, which Jarvis for Chrome's own copy and the Core's relay tests read too): each
// valid case seals to exactly its ct and opens to its message; each must-drop case is dropped; a replay is dropped;
// shapes are refused on their lengths before anything is decoded; the link code; nothing leaks the key.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../../src/lib/relay-envelope.js';

const VECTORS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'relay-vectors.json');
const V = JSON.parse(readFileSync(VECTORS_FILE, 'utf8'));
const CORE = 'https://alienware.tail4e5f6a.ts.net';
const utf8 = (s) => new TextEncoder().encode(s);

test('vectors: the file is wire 1, with a key, valid cases, must-drop cases and a replay', () => {
  assert.equal(V.wire, 1);
  assert.equal(E.isLinkKey(V.key), true);
  assert.ok(Number.isSafeInteger(V.now));
  assert.ok(V.valid.length >= 7 && V.drop.length >= 15);
  for (const c of V.valid) {
    assert.ok(E.RELAY_BOXES.includes(c.box), c.name);
    for (const k of ['id', 'iv', 'plaintext', 'ct']) assert.equal(typeof c[k], 'string', `${c.name}: ${k}`);
  }
  const names = V.drop.map((c) => c.name).join(' | ');
  for (const needed of ['changed byte in the ciphertext', 'wrong box', 'wrong inner id', 'too old', 'too far ahead', 'too big']) assert.match(names, new RegExp(needed), needed);
});

test('vectors: each valid case seals to exactly its ct (same key, id, iv, plaintext) and opens to its message', async () => {
  const key = await E.importLinkKey(V.key);
  for (const c of V.valid) {
    const m = JSON.parse(c.plaintext);
    assert.deepEqual(Object.keys(m), ['v', 'kind', 'id', 'at', 'body'], `${c.name}: the plaintext's field order`);
    const sealed = await E.sealEnvelope(key, { box: c.box, kind: m.kind, body: m.body, at: m.at, id: c.id, iv: c.iv });
    assert.deepEqual(sealed, { id: c.id, iv: c.iv, ct: c.ct }, `${c.name}: sealed`);
    // The ct is the ciphertext then the 16-byte tag, of exactly the plaintext's UTF-8 bytes.
    assert.equal(E.fromB64url(c.ct).length, utf8(c.plaintext).length + E.TAG_BYTES, `${c.name}: ct length`);
    const opened = await E.openEnvelope(key, { id: c.id, iv: c.iv, ct: c.ct }, { box: c.box, now: V.now });
    assert.equal(opened.ok, true, `${c.name}: ${opened.reason}`);
    assert.deepEqual(opened.message, c.message, c.name);
  }
  const largest = V.valid.find((c) => /largest/.test(c.name));
  assert.equal(utf8(largest.plaintext).length, E.MAX_PLAINTEXT_BYTES, 'the boundary case is exactly 16,384 bytes');
  assert.equal(largest.ct.length, E.CT_MAX_CHARS);
});

test('vectors: every must-drop case is dropped, for its reason', async () => {
  const key = await E.importLinkKey(V.key);
  for (const c of V.drop) {
    const r = await E.openEnvelope(key, c.envelope, { box: c.box, now: V.now, seen: E.createSeenIds() });
    assert.deepEqual(r, { ok: false, reason: c.reason }, c.name);
  }
});

test('vectors: a replayed message is dropped the second time; the replay window keeps the last 500 ids', async () => {
  const key = await E.importLinkKey(V.key);
  const seen = E.createSeenIds();
  const first = await E.openEnvelope(key, V.replay.envelope, { box: V.replay.box, now: V.now, seen });
  assert.equal(first.ok, true);
  assert.deepEqual(await E.openEnvelope(key, V.replay.envelope, { box: V.replay.box, now: V.now, seen }), { ok: false, reason: 'replay' });
  // A dropped message never enters the window (only opened ones do).
  const tampered = V.drop.find((c) => /changed byte in the ciphertext/.test(c.name));
  await E.openEnvelope(key, tampered.envelope, { box: tampered.box, now: V.now, seen });
  assert.equal(seen.has(tampered.envelope.id), false);
  // 500 kept, oldest first out; a saved list restores it.
  const w = E.createSeenIds();
  const ids = Array.from({ length: 501 }, () => E.newMessageId());
  for (const id of ids) w.add(id);
  assert.equal(w.size, 500);
  assert.equal(w.has(ids[0]), false);
  assert.equal(w.has(ids[500]), true);
  const restored = E.createSeenIds({ ids: [...w.list(), 'junk', 42, null] });
  assert.equal(restored.size, 500);
  assert.equal(restored.has(ids[1]), true);
});

test('round trip: fresh ids and ivs every time; the box is bound; the clock window is 120 s back and 30 s ahead', async () => {
  const keyText = E.newLinkKey();
  assert.equal(keyText.length, 43);
  assert.notEqual(E.newLinkKey(), keyText);
  const key = await E.importLinkKey(keyText);
  const now = Date.parse('2026-11-26T09:00:00Z');
  const a = await E.sealEnvelope(key, { box: 'to-ext', kind: 'start', body: { text: 'find a 4K monitor under $300', chat: 'new', from: 'voice' }, at: now });
  const b = await E.sealEnvelope(key, { box: 'to-ext', kind: 'start', body: { text: 'find a 4K monitor under $300', chat: 'new', from: 'voice' }, at: now });
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
  assert.equal(E.isEnvelopeShape(a), true);
  const seen = E.createSeenIds();
  const ok = await E.openEnvelope(key, a, { box: 'to-ext', now: now + 1000, seen });
  assert.deepEqual(ok.message, { v: 1, kind: 'start', id: a.id, at: now, body: { text: 'find a 4K monitor under $300', chat: 'new', from: 'voice' } });
  assert.equal((await E.openEnvelope(key, b, { box: 'to-app', now })).reason, 'tag', 'a message for the extension never opens as one for the app');
  assert.equal((await E.openEnvelope(key, b, { box: 'to-ext', now: now + 120_000 })).ok, true);
  assert.equal((await E.openEnvelope(key, b, { box: 'to-ext', now: now + 120_001 })).reason, 'old');
  assert.equal((await E.openEnvelope(key, b, { box: 'to-ext', now: now - 30_000 })).ok, true);
  assert.equal((await E.openEnvelope(key, b, { box: 'to-ext', now: now - 30_001 })).reason, 'ahead');
  const other = await E.importLinkKey(E.newLinkKey());
  assert.equal((await E.openEnvelope(other, b, { box: 'to-ext', now })).reason, 'tag');
});

test('sealing: kinds, bodies, times and sizes are checked; 16,384 bytes of plaintext at most', async () => {
  const key = await E.importLinkKey(E.newLinkKey());
  const at = Date.parse('2026-11-26T09:00:00Z');
  await assert.rejects(E.sealEnvelope(key, { box: 'to-nowhere', kind: 'ping', body: {}, at }), TypeError);
  await assert.rejects(E.sealEnvelope(key, { box: 'to-ext', kind: 'Ping!', body: {}, at }), TypeError);
  await assert.rejects(E.sealEnvelope(key, { box: 'to-ext', kind: 'ping', body: [], at }), TypeError);
  await assert.rejects(E.sealEnvelope(key, { box: 'to-ext', kind: 'ping', body: {}, at: 1.5 }), TypeError);
  await assert.rejects(E.sealEnvelope(key, { box: 'to-ext', kind: 'ping', body: {}, at, id: 'short' }), TypeError);
  const base = JSON.stringify({ v: 1, kind: 'ping', id: 'A'.repeat(22), at, body: { pad: '' } });
  const fits = 'x'.repeat(E.MAX_PLAINTEXT_BYTES - utf8(base).length);
  const big = await E.sealEnvelope(key, { box: 'to-ext', kind: 'ping', body: { pad: fits }, at });
  assert.equal(big.ct.length, E.CT_MAX_CHARS);
  assert.equal((await E.openEnvelope(key, big, { box: 'to-ext', now: at })).ok, true);
  await assert.rejects(E.sealEnvelope(key, { box: 'to-ext', kind: 'ping', body: { pad: `${fits}x` }, at }), RangeError);
});

test('shapes: refused on their lengths and alphabet before any decoding, whatever their size', () => {
  const good = { id: 'A'.repeat(22), iv: 'B'.repeat(16), ct: 'C'.repeat(100) };
  assert.equal(E.isEnvelopeShape(good), true);
  const huge = 'A'.repeat(8 * 1024 * 1024);
  const bad = [
    null, 'text', [], { ...good, ct: huge }, { ...good, id: huge }, { ...good, iv: huge },
    { id: good.id, iv: good.iv }, { ...good, extra: 1 }, { ...good, id: 42 }, { ...good, ct: 'C'.repeat(23) },
    { ...good, ct: `${'C'.repeat(99)}=` }, { ...good, ct: 'C'.repeat(E.CT_MAX_CHARS + 1) }, { ...good, ct: 'C'.repeat(101) /* length 1 mod 4 */ },
    Object.assign(Object.create({ id: good.id }), { iv: good.iv, ct: good.ct, x: 1 }),
  ];
  const t0 = process.hrtime.bigint();
  const results = bad.map((v) => E.isEnvelopeShape(v));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  results.forEach((r, i) => assert.equal(r, false, `case ${i}`));
  assert.ok(ms < 100, `refusing a huge value costs nothing: its length is checked first (${ms.toFixed(2)} ms for ${bad.length})`);
});

test('base64url: canonical, no padding, nothing outside the alphabet', () => {
  for (let n = 0; n < 50; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    const text = E.b64url(bytes);
    assert.equal(text, Buffer.from(bytes).toString('base64url'));
    assert.deepEqual(E.fromB64url(text), bytes);
  }
  for (const bad of ['A', 'AB=', 'A+B/', 'AB C', 'AR', 'AAB', 'é', 42, null]) assert.equal(E.fromB64url(bad), null, String(bad));
  assert.deepEqual(E.fromB64url('AQ'), new Uint8Array([1]));
});

test('the link code: { v: 1, core, key } in base64url; only a home base origin and a 32-byte key', () => {
  const key = E.newLinkKey();
  const code = E.makeLinkCode({ core: CORE, key });
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(JSON.parse(Buffer.from(code, 'base64url').toString('utf8')), { v: 1, core: CORE, key });
  assert.deepEqual(E.parseLinkCode(`  ${code}\n`), { ok: true, link: { v: 1, core: CORE, key } });
  for (const core of ['http://alienware.tail4e5f6a.ts.net', 'https://alienware.tail4e5f6a.ts.net/', 'https://alienware.tail4e5f6a.ts.net:8443', 'https://evil.example', 'https://tail4e5f6a.ts.net', 'https://ALIENWARE.tail4e5f6a.ts.net']) {
    assert.throws(() => E.makeLinkCode({ core, key }), TypeError, core);
    const forged = Buffer.from(JSON.stringify({ v: 1, core, key })).toString('base64url');
    assert.deepEqual(E.parseLinkCode(forged), { ok: false, reason: 'code' }, core);
  }
  assert.throws(() => E.makeLinkCode({ core: CORE, key: 'short' }), TypeError);
  assert.deepEqual(E.parseLinkCode(''), { ok: false, reason: 'empty' });
  assert.deepEqual(E.parseLinkCode('not a code!'), { ok: false, reason: 'code' });
  assert.deepEqual(E.parseLinkCode('A'.repeat(600)), { ok: false, reason: 'code' });
  assert.deepEqual(E.parseLinkCode(Buffer.from(JSON.stringify({ v: 2, core: CORE, key })).toString('base64url')), { ok: false, reason: 'version' });
  assert.deepEqual(E.parseLinkCode(Buffer.from('[1,2]').toString('base64url')), { ok: false, reason: 'code' });
  assert.equal(E.isCoreOrigin(CORE), true);
});

test('nothing leaks: errors about keys never contain them', async () => {
  const secret = 'sk-ant-api03-' + 'Z'.repeat(30);
  for (const bad of [secret, `${E.newLinkKey()}x`, '']) {
    await assert.rejects(E.importLinkKey(bad), (err) => {
      assert.ok(!String(err.message).includes(secret) && !String(err.stack).includes(secret));
      return true;
    });
  }
  const key = E.newLinkKey();
  assert.throws(() => E.makeLinkCode({ core: 'https://evil.example', key }), (err) => !String(err.message).includes(key));
});
