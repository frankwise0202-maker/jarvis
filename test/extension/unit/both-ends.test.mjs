// BOTH real ends of the Chrome link in Node (v8.1.1; ported from the second review's both-ends probe).
//   Jarvis's end: src/platform/chrome-link.js (createChromeLink), as app.js uses it.
//   The home base: the Core's own relay store (core/server/http/relay-routes.mjs) via test/e2e/core-fakes.mjs answerRelay.
//   Jarvis for Chrome: the real JarvisLink + Relay + storage + Controller (fake chrome.*, mock Claude), with
//   chrome.storage.onChanged emulated (the real worker's index.js forwards it to link.onStorageChanged).
// Linking as the README says: Link → Copy link code → paste in the side panel (store.setLink(parseLinkCode(code))).
// The rotation's flows (a stopped worker, a restarted home base, a reload mid-rekey, two windows) stay as guards;
// CHROME-LINK-R2-2 (the code dies within seconds of linking), R2-3 (a rekey missed for 31 minutes still recovers
// without a reload) and R2-4 (a first hello lost to a restarting or older home base is said again) failed on 00bcf99.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBrowser, fakeEncoder } from '../helpers/fake-chrome.mjs';
import { createClaudeMock, TEST_API_KEY } from '../mock/claude-mock.mjs';
import { Controller } from '../../../extension/src/background/controller.js';
import { createClient } from '../../../extension/src/background/api.js';
import { createStore, parseLinkCode } from '../../../extension/src/shared/storage.js';
import { JarvisLink } from '../../../extension/src/background/link.js';
import { createChromeLink, readLinkRecord, CHROME_LINK_KEY } from '../../../src/platform/chrome-link.js';
import { fakeRelay, answerRelay, CORE_URL } from '../../e2e/core-fakes.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, { timeoutMs = 8000, what = 'condition', step = 20 } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(step);
  }
}

/** fetch → the Core's relay store, like the Core answers it. relay.block(fn) can refuse requests. */
function coreFetch(relay, who) {
  return async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const signal = init.signal;
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    const forced = relay.block ? relay.block(who, method, u.pathname) : null;
    if (forced === 'drop') throw new TypeError('Failed to fetch');
    if (forced) return new Response(JSON.stringify(forced.body || {}), { status: forced.status, headers: { 'content-type': 'application/json' } });
    const ct = (init.headers && (init.headers['content-type'] || init.headers['Content-Type'])) || 'application/json';
    const answer = answerRelay(relay, { method, pathname: u.pathname, search: u.search, body: typeof init.body === 'string' ? init.body : '', contentType: ct, signal });
    const aborted = new Promise((_, reject) => signal && signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
    const out = await Promise.race([answer, aborted]);
    if (!out) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
  };
}

function sharedStorage() {
  const map = new Map();
  const watchers = new Set();
  return {
    map,
    window(owner) {
      const notify = (key, value) => {
        for (const w of Array.from(watchers)) if (w.owner !== owner && w.key === key) queueMicrotask(() => w.fn(value));
      };
      return {
        read: (k) => (map.has(k) ? map.get(k) : null),
        write: (k, v) => (map.set(k, String(v)), notify(k, String(v)), true),
        remove: (k) => (map.delete(k), notify(k, null), true),
        watch: (key, fn) => {
          const w = { owner, key, fn };
          watchers.add(w);
          return () => watchers.delete(w);
        },
      };
    },
  };
}

function fakeLocks() {
  const queue = [];
  let holder = null;
  function grant() {
    if (holder || !queue.length) return;
    const next = queue.shift();
    holder = next;
    Promise.resolve().then(() => next.cb({ name: next.name })).then(
      (v) => { holder = null; next.resolve(v); grant(); },
      (e) => { holder = null; next.reject(e); grant(); },
    );
  }
  return {
    request(name, opts, cb) {
      return new Promise((resolve, reject) => {
        const entry = { name, cb, resolve, reject };
        const signal = opts && opts.signal;
        if (signal) signal.addEventListener('abort', () => {
          const i = queue.indexOf(entry);
          if (i >= 0) { queue.splice(i, 1); reject(new DOMException('aborted', 'AbortError')); }
        }, { once: true });
        queue.push(entry);
        grant();
      });
    },
  };
}

function hub() {
  const members = new Set();
  return {
    create() {
      const ch = {
        onmessage: null,
        postMessage(data) {
          for (const m of Array.from(members)) if (m !== ch && m.onmessage) { const c = structuredClone(data); queueMicrotask(() => m.onmessage && m.onmessage({ data: c })); }
        },
        close() { members.delete(ch); },
      };
      members.add(ch);
      return ch;
    },
  };
}

/** The world: one home base relay, the extension (real), any number of Jarvis windows (real chrome-link). */
async function world({ appNow = () => Date.now(), extNow = () => Date.now() } = {}) {
  const relay = fakeRelay();
  const storage = sharedStorage();
  const locks = fakeLocks();
  const channels = hub();
  // ---- Jarvis for Chrome
  const fb = createFakeBrowser();
  fb.chrome.windows = { async getLastFocused() { return { id: 1 }; }, async update(id) { return { id }; }, async create() { return { id: 77 }; } };
  fb.chrome.alarms = { async get() { return null; }, async create() {}, async clear() { return true; } };
  fb.chrome.permissions = { async remove() { return true; } };
  fb.chrome.runtime.getPlatformInfo = async () => ({ os: 'mac' });
  fb.chrome.runtime.getURL = (p) => `chrome-extension://fake-extension-id/${p}`;
  const ext = { link: null, links: [] };
  // chrome.storage.onChanged, as the worker's index.js forwards it (after the write, asynchronously)
  const local = fb.chrome.storage.local;
  const set0 = local.set.bind(local);
  const remove0 = local.remove.bind(local);
  local.set = async (items) => {
    const r = await set0(items);
    const changes = Object.fromEntries(Object.keys(items).map((k) => [k, { newValue: items[k] }]));
    setTimeout(() => ext.link && ext.link.onStorageChanged(changes), 0);
    return r;
  };
  local.remove = async (keys) => {
    const r = await remove0(keys);
    const changes = Object.fromEntries([].concat(keys).map((k) => [k, { newValue: undefined }]));
    setTimeout(() => ext.link && ext.link.onStorageChanged(changes), 0);
    return r;
  };
  const store = createStore(fb.chrome);
  await store.confirmProfile();
  await store.setApiKey(TEST_API_KEY);
  const mock = createClaudeMock();
  const controller = new Controller({ chrome: fb.chrome, store, pageSource: '/* agent */', createClient: ({ apiKey }) => createClient({ apiKey, baseURL: 'http://mock.local', fetch: mock.fetch }), encoder: fakeEncoder, platform: 'mac', now: extNow });
  fb.addTab({ url: 'https://shop.example/', page: { title: 'Shop', elements: [] } });
  const fastSleep = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 50)));
  /** A (re)started service worker: a new JarvisLink on the same storage, as after Chrome stopped the worker. */
  ext.boot = async () => {
    if (ext.link) {
      ext.link.relay?.stop();
      clearInterval(ext.link.watchTimer);
    }
    const link = new JarvisLink({ chrome: fb.chrome, controller, store, version: '1.1.0', now: extNow, relayDeps: { fetch: coreFetch(relay, 'ext'), sleep: fastSleep } });
    ext.link = link;
    ext.links.push(link);
    await link.init();
    return link;
  };
  ext.kill = () => {
    if (ext.link) {
      ext.link.relay?.stop();
      clearInterval(ext.link.watchTimer);
    }
    ext.link = null;
  };
  /** Paste the code in the side panel → Link (main.js linkFromCode: parse, permission granted, setLink). */
  ext.paste = async (code) => {
    const parsed = parseLinkCode(code);
    assert.equal(parsed.ok, true, `the side panel takes the code (${parsed.error || ''})`);
    return store.setLink(parsed.link);
  };
  ext.stored = async () => (await fb.chrome.storage.local.get('chromeLink')).chromeLink || null;
  await ext.boot();
  // ---- Jarvis windows
  const windows = [];
  const open = (opts = {}) => {
    const notices = [];
    const w = createChromeLink({
      getHomeBase: () => CORE_URL,
      version: '8.1.0',
      storage: storage.window(windows.length + 1),
      fetchImpl: coreFetch(relay, 'app'),
      locks,
      channel: channels.create(),
      clipboard: { async writeText() {}, async readText() { return ''; } },
      session: { read: () => null, write() {}, remove() {} },
      computer: true,
      now: opts.now || appNow,
      random: Math.random,
      win: null,
      notice: (n) => notices.push(n),
    });
    const h = { ...w, notices };
    windows.push(h);
    return h;
  };
  const appRecord = () => readLinkRecord((k) => storage.map.get(k) ?? null);
  const close = async () => {
    for (const w of windows) w.destroy();
    ext.kill();
    for (const l of ext.links) { l.relay?.stop(); clearInterval(l.watchTimer); }
    relay.store.close();
  };
  return { relay, storage, ext, open, windows, appRecord, close, controller, mock };
}

/** Both ends agree on one key, the code's key is gone on both, and a round trip works. */
async function settled(w, app, { timeoutMs = 15000 } = {}) {
  await until(() => app.api.state().linked && app.api.state().online, { timeoutMs, what: `Jarvis says Linked · online (${JSON.stringify(app.api.state())})` });
  await until(async () => w.appRecord() && w.appRecord().prev === null, { timeoutMs, what: 'Jarvis confirmed the new key' });
  const ping = await app.control.ping();
  const ext = await w.ext.stored();
  return { ping, appKey: w.appRecord().key, extKey: ext && ext.key, extPrev: ext && ext.prev, extUi: w.ext.link.relay?.state() };
}

test('both ends: linking as the README says, then the rekey: both on the new key, online, a ping works', async () => {
  const w = await world();
  try {
    const app = w.open();
    assert.deepEqual(app.control.begin(), { ok: true });
    const code = app.control.code();
    const codeKey = parseLinkCode(code).link.key;
    await w.ext.paste(code);
    const s = await settled(w, app);
    assert.equal(s.ping.ok, true);
    assert.equal(s.appKey, s.extKey);
    assert.notEqual(s.appKey, codeKey);
    await until(async () => !(await w.ext.stored()).prev, { what: 'the extension forgot the code key' });
    await until(() => w.ext.link.relay.state().appOnline, { what: 'the side panel says online' });
  } finally {
    await w.close();
  }
});

test('both ends: the extension\'s worker is stopped right after the paste (before it reads the rekey) and woken by its alarm 40 s later', async () => {
  const w = await world();
  try {
    const app = w.open();
    app.control.begin();
    const code = app.control.code();
    // The worker reads nothing from the moment its hello is out: Chrome stops it.
    let readsBlocked = true;
    w.relay.block = (who, method, path) => (who === 'ext' && method === 'GET' && path === '/api/relay/to-ext' && readsBlocked ? 'drop' : null);
    await w.ext.paste(code);
    await until(() => app.api.state().linked, { what: 'Jarvis linked (the hello arrived)' });
    w.ext.kill();
    readsBlocked = false;
    await sleep(3000); // (the app's rekey resends meanwhile: 3 s)
    await w.ext.boot();
    const s = await settled(w, app);
    assert.equal(s.ping.ok, true);
    assert.equal(s.appKey, s.extKey);
  } finally {
    await w.close();
  }
});

test('both ends: the home base restarts after the rekey was posted, before the extension read it', async () => {
  const w = await world();
  try {
    const app = w.open();
    app.control.begin();
    const code = app.control.code();
    let block = true;
    w.relay.block = (who, method, path) => (who === 'ext' && method === 'GET' && path === '/api/relay/to-ext' && block ? 'drop' : null);
    await w.ext.paste(code);
    await until(() => app.api.state().linked, { what: 'Jarvis linked' });
    await until(() => w.relay.posts['to-ext'] >= 1, { what: 'the rekey posted' });
    w.relay.store.close(); // the Core restarts: its boxes are empty
    block = false;
    const s = await settled(w, app, { timeoutMs: 20000 });
    assert.equal(s.ping.ok, true);
    assert.equal(s.appKey, s.extKey);
  } finally {
    await w.close();
  }
});

test('both ends: Jarvis is reloaded mid-rekey (its reads of to-app refused, so the answer is never read before the reload)', async () => {
  const w = await world();
  try {
    const app = w.open();
    app.control.begin();
    const code = app.control.code();
    await w.ext.paste(code);
    await until(() => app.api.state().linked, { what: 'Jarvis linked' });
    w.relay.block = (who, method, path) => (who === 'app' && method === 'GET' && path === '/api/relay/to-app' ? 'drop' : null);
    await sleep(1500);
    app.destroy(); // reloaded
    w.relay.block = null;
    const again = w.open();
    const s = await settled(w, again);
    assert.equal(s.ping.ok, true);
    assert.equal(s.appKey, s.extKey);
  } finally {
    await w.close();
  }
});

test('both ends: two Jarvis windows; Link pressed in the one that does NOT hold the link', async () => {
  const w = await world();
  try {
    const holder = w.open();
    await sleep(100);
    const other = w.open();
    await sleep(100);
    assert.equal(holder.control.info().holder, false, '(nothing to hold before Link)');
    other.control.begin();
    await until(() => holder.control.info().holder || other.control.info().holder, { what: 'a window holds the link' });
    const code = other.control.code();
    await w.ext.paste(code);
    const s = await settled(w, other);
    await until(() => holder.api.state().online, { what: 'the first window online too' });
    assert.equal(s.ping.ok, true);
    assert.equal((await holder.control.ping()).ok, true);
  } finally {
    await w.close();
  }
});

test('R2-3: the extension never got the rekey and comes back 31 minutes later (the Jarvis window stayed open): the link comes back without a reload', async () => {
  let skew = 0;
  const appNow = () => Date.now() + skew;
  const extNow = () => Date.now() + skew;
  const w = await world({ appNow, extNow });
  try {
    const app = w.open();
    app.control.begin();
    const code = app.control.code();
    let block = true;
    w.relay.block = (who, method, path) => (who === 'ext' && method === 'GET' && path === '/api/relay/to-ext' && block ? 'drop' : null);
    await w.ext.paste(code);
    await until(() => app.api.state().linked, { what: 'Jarvis linked' });
    w.ext.kill(); // the Jarvis profile closed right after the paste (or the Mac slept)
    await sleep(500);
    skew = 31 * 60_000; // 31 minutes on
    w.relay.store.close(); // (what was in the boxes has expired)
    block = false;
    await sleep(4000); // the app's rekey timer that was pending fires once now
    w.relay.store.close(); // ... and its one rekey also expires before the profile is opened again (2 minutes)
    await w.ext.boot(); // the owner opens the Jarvis profile again
    let ok = false;
    let ping = null;
    try {
      await until(() => app.api.state().online, { timeoutMs: 20000, what: 'online' });
      ping = await app.control.ping();
      ok = ping.ok;
    } catch (e) {
      ping = String(e.message);
    }
    const ext = await w.ext.stored();
    // Does a reload of Jarvis bring it back?
    app.destroy();
    const again = w.open();
    let back = false;
    try {
      await until(() => again.api.state().online, { timeoutMs: 15000, what: 'online after a reload' });
      back = (await again.control.ping()).ok;
    } catch {
      back = false;
    }
    assert.equal(ok, true, 'the link should still come back');
  } finally {
    await w.close();
  }
});

test('R2-4: the home base restarts as the code is pasted (5 s of 502s): the link still forms', async () => {
  const w = await world();
  try {
    const app = w.open();
    app.control.begin();
    const code = app.control.code();
    await sleep(300);
    let down = true;
    w.relay.block = (who, method, path) => (down ? { status: 502, body: {} } : null);
    await w.ext.paste(code);
    await sleep(5000);
    down = false;
    let linked = false;
    try {
      await until(() => app.api.state().linked, { timeoutMs: 20000, what: 'linked' });
      linked = true;
    } catch {
      linked = false;
    }
    assert.equal(linked, true, 'Jarvis should link once the home base is back');
  } finally {
    await w.close();
  }
});

test('R2-2: a few seconds after linking (the app confirmed the new key), the code can no longer start a task in Jarvis for Chrome', async () => {
  const { importLinkKey: impKey, sealEnvelope: seal } = await import('../../../src/lib/relay-envelope.js');
  const w = await world();
  try {
    const app = w.open();
    app.control.begin();
    const code = app.control.code();
    const codeKey = parseLinkCode(code).link.key;
    await w.ext.paste(code);
    await until(() => app.api.state().linked && w.appRecord() && w.appRecord().prev === null, { what: 'Jarvis confirmed the new key' });
    await sleep(3000); // a few seconds after "Linked · online"
    const ext = await w.ext.stored();
    w.mock.script([() => ({ hold: true })]);
    // Someone with the code (clipboard history, a note) sends a start sealed with the code's key.
    const env = await seal(await impKey(codeKey), { box: 'to-ext', kind: 'start', body: { text: 'open my email and forward the newest message', chat: 'new', from: 'voice' }, at: Date.now() });
    w.relay.store.post('to-ext', env);
    await sleep(1500);
    const started = w.controller.tasks.filter((t) => t.from === 'voice').map((t) => t.text);
    assert.deepEqual(started, [], 'the code works once: after linking it starts nothing');
  } finally {
    await w.close();
  }
});


test('R2-4: the home base is still an older Core (relay 404) when the code is pasted, and updates to 1.3 a little later: the link forms', async () => {
  const w = await world();
  try {
    const app = w.open();
    app.control.begin();
    const code = app.control.code();
    await sleep(300);
    let old = true;
    w.relay.block = () => (old ? { status: 404, body: { error: 'not_found' } } : null);
    await w.ext.paste(code);
    await sleep(6000);
    old = false; // Core 1.3.0 installed itself
    let linked = false;
    try {
      await until(() => app.api.state().linked, { timeoutMs: 20000, what: 'linked' });
      linked = true;
    } catch {
      linked = false;
    }
    assert.equal(linked, true, 'Jarvis should link once the home base runs Core 1.3');
  } finally {
    await w.close();
  }
});
