// The two copies of the relay's envelope speak to each other: what the extension seals, Jarvis's own
// src/lib/relay-envelope.js opens, and the other way round, for both boxes; each refuses what the
// other sealed for the wrong box; and both make and read the same link code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as ext from '../../../extension/src/background/envelope.js';
import * as app from '../../../src/lib/relay-envelope.js';
import { parseLinkCode as extParseLinkCode } from '../../../extension/src/shared/storage.js';

const NOW = 1_800_000_000_000;

test('the extension seals, Jarvis opens; Jarvis seals, the extension opens (both boxes)', async () => {
  const key = app.newLinkKey();
  const ek = await ext.importLinkKey(key);
  const ak = await app.importLinkKey(key);
  const body = { url: 'https://www.example.com/a?b=c', text: 'Größe 27″ — ¥30,000', nested: { list: [1, 'two', null] } };
  for (const box of ['to-ext', 'to-app']) {
    const fromExt = await ext.seal(ek, { box, kind: 'prompt-closed', body, at: NOW });
    const opened = await app.openEnvelope(ak, fromExt, { box, now: NOW + 500, seen: app.createSeenIds() });
    assert.equal(opened.ok, true, `${box}: Jarvis opens the extension's (${opened.reason})`);
    assert.deepEqual(opened.message.body, body);
    assert.equal(opened.message.kind, 'prompt-closed');
    const fromApp = await app.sealEnvelope(ak, { box, kind: 'answer', body, at: NOW });
    const back = await ext.unseal(ek, { box, msg: fromApp, now: NOW + 500, seen: new ext.SeenIds() });
    assert.equal(back.ok, true, `${box}: the extension opens Jarvis's (${back.reason})`);
    assert.deepEqual(back.message, { kind: 'answer', id: fromApp.id, at: NOW, body });
  }
});

test('each refuses what the other sealed for the other box, or with another key', async () => {
  const key = app.newLinkKey();
  const ek = await ext.importLinkKey(key);
  const ak = await app.importLinkKey(key);
  const toExt = await app.sealEnvelope(ak, { box: 'to-ext', kind: 'start', body: { text: 'x' }, at: NOW });
  assert.equal((await ext.unseal(ek, { box: 'to-app', msg: toExt, now: NOW })).ok, false);
  const toApp = await ext.seal(ek, { box: 'to-app', kind: 'reply', body: { re: toExt.id, ok: true }, at: NOW });
  assert.equal((await app.openEnvelope(ak, toApp, { box: 'to-ext', now: NOW })).ok, false);
  const other = await ext.importLinkKey(app.newLinkKey());
  assert.equal((await ext.unseal(other, { box: 'to-ext', msg: toExt, now: NOW })).ok, false);
});

test('the same link code on both sides', () => {
  const key = app.newLinkKey();
  const code = app.makeLinkCode({ core: 'https://alienware.tail4e5f6a.ts.net', key });
  assert.deepEqual(extParseLinkCode(code), { ok: true, link: { v: 1, core: 'https://alienware.tail4e5f6a.ts.net', key } });
  assert.equal(app.parseLinkCode(code).ok, true);
});
