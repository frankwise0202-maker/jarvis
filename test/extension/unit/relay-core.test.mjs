// The extension's relay loop against the real home base: Jarvis Core 1.3.0's own HTTP server and
// relay routes (core/server/http), not the tests' fake. The extension's Relay long-polls `to-ext`
// and posts to `to-app` exactly as it does in Chrome; Jarvis's end posts and reads over HTTP too.
// What the wire promises both ends: messages pass sealed and in order, an extension's poll waits
// and wakes on a message, `last` and `after` keep the place, the status tells when each side read.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApiServer } from '../../../core/server/http/server.mjs';
import { fixtureCore } from '../../../core/test/server/helpers.mjs';
import { Relay } from '../../../extension/src/background/relay.js';
import { BOX_TO_APP, BOX_TO_EXT, SeenIds, importLinkKey, seal, unseal } from '../../../extension/src/background/envelope.js';
import { createStore } from '../../../extension/src/shared/storage.js';
import { createFakeBrowser } from '../helpers/fake-chrome.mjs';
import { newLinkKey } from '../helpers/fake-relay.mjs';

let api;
let core;
const EXT_ORIGIN = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';

before(async () => {
  const fixture = fixtureCore('ok', { warmupSec: 5 });
  fixture.config.limits = { ...fixture.config.limits, apiBurst: 100_000, apiPerSecond: 100_000 };
  api = createApiServer({ getCore: () => fixture.core, config: fixture.config, ask: () => ({ answer: 'ok' }), info: () => ({ name: 'jarvis-core' }) });
  const { port } = await api.listen(0, '127.0.0.1');
  core = `http://127.0.0.1:${port}`;
});

after(async () => {
  await api.close();
});

/** fetch as the extension's service worker sends it (its origin; the home base checks it for these routes). */
const extFetch = (url, init = {}) => fetch(url, { ...init, headers: { ...(init.headers || {}), origin: EXT_ORIGIN } });

test('the extension’s relay loop and Jarvis’s end, through Core’s own relay: both ways, in order, sealed', async () => {
  const key = newLinkKey();
  const cryptoKey = await importLinkKey(key);
  const got = [];
  const store = createStore(createFakeBrowser().chrome);
  const relay = new Relay({ chrome: { runtime: {} }, link: { core, key }, store, onMessage: (m) => got.push(m), fetch: extFetch });
  relay.start();
  try {
    // Jarvis posts three requests; the extension's long poll wakes on the first and reads them in order.
    for (const kind of ['hello', 'ping', 'open']) {
      const msg = await seal(cryptoKey, { box: BOX_TO_EXT, kind, body: kind === 'open' ? { url: 'https://www.example.com/', rect: null, focus: true } : {} });
      const res = await fetch(`${core}/api/relay/to-ext`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msg) });
      assert.equal(res.status, 200);
    }
    const end = Date.now() + 8000;
    while (got.length < 3 && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
    assert.deepEqual(got.map((m) => m.kind), ['hello', 'ping', 'open']);
    assert.ok(relay.lastOkAt > 0 && relay.failures === 0);
    assert.ok((await store.getRelayState()).seen.length === 3, 'what was read is kept');
    // The extension answers; Jarvis reads it from its box and opens it.
    assert.equal(await relay.send('reply', { re: got[1].id, ok: true, status: { online: true } }), true);
    const res = await fetch(`${core}/api/relay/to-app`);
    const box = await res.json();
    assert.equal(box.messages.length, 1);
    const opened = await unseal(cryptoKey, { box: BOX_TO_APP, msg: box.messages[0], seen: new SeenIds() });
    assert.equal(opened.ok, true);
    assert.deepEqual(opened.message.body, { re: got[1].id, ok: true, status: { online: true } });
    // The status: the extension has read its box (its poll is waiting right now).
    const status = await (await fetch(`${core}/api/relay/status`)).json();
    assert.ok(status.extSeenAt > 0, JSON.stringify(status));
  } finally {
    relay.stop();
  }
});
