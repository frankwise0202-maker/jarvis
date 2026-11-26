// app.chromeLink (v8.1, src/platform/chrome-link.js, contract (f), SPEC §32.1) in Node: the Core's own relay store
// behind a fake fetch (test/e2e/core-fakes.mjs answerRelay), the E2E's fake Jarvis for Chrome as the other end,
// and fake Web Locks, BroadcastChannel, storage (with other windows' storage events) and clipboard. Linking with
// the code; open/start/stop/answer and their replies; what comes back is checked and cut to size; drops are
// silent and replays never come twice (a reload included); offline and the 10-second give-up; unlinking from
// either side; one window holds the link; back-off and an old Core; phones never poll.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createChromeLink, cleanPrompt, cleanOpenUrl, cleanRect, cleanText, readLinkRecord, CHROME_LINK_KEY, CHROME_LINK_INBOX_KEY, REPLY_TIMEOUT_MS, PENDING_MS, ONLINE_MS, LATE_START_LINE } from '../../src/platform/chrome-link.js';
import { fakeRelay, answerRelay, createFakeChromePeer, chromeLinkRecord, CHROME_TEST_KEY, CORE_ORIGIN, CORE_URL } from '../e2e/core-fakes.mjs';
import { importLinkKey, sealEnvelope, newLinkKey, parseLinkCode } from '../../src/lib/relay-envelope.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(fn, { timeoutMs = 5000, what = 'condition' } = {}) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(15);
  }
}

/** localStorage shared by "windows": each window's writes reach the others' watchers (the storage event). */
function sharedStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const watchers = new Set();
  const notify = (owner, key, value) => {
    for (const w of Array.from(watchers)) if (w.owner !== owner && w.key === key) queueMicrotask(() => w.fn(value));
  };
  return {
    map,
    window(owner) {
      return {
        read: (k) => (map.has(k) ? map.get(k) : null),
        write: (k, v) => {
          map.set(k, String(v));
          notify(owner, k, String(v));
          return true;
        },
        remove: (k) => {
          map.delete(k);
          notify(owner, k, null);
          return true;
        },
        watch: (key, fn) => {
          const w = { owner, key, fn };
          watchers.add(w);
          return () => watchers.delete(w);
        },
      };
    },
  };
}

/** Web Locks: one exclusive lock, granted in turn; an aborted request that wasn't granted yet is refused. */
function fakeLocks() {
  const queue = [];
  const state = { holder: null };
  function grant() {
    if (state.holder || !queue.length) return;
    const next = queue.shift();
    state.holder = next;
    Promise.resolve()
      .then(() => next.cb({ name: next.name }))
      .then(
        (v) => {
          state.holder = null;
          next.resolve(v);
          grant();
        },
        (e) => {
          state.holder = null;
          next.reject(e);
          grant();
        },
      );
  }
  return {
    state,
    request(name, opts, cb) {
      return new Promise((resolve, reject) => {
        const entry = { name, cb, resolve, reject, owner: opts.owner };
        const signal = opts && opts.signal;
        if (signal && signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
        if (signal) {
          signal.addEventListener('abort', () => {
            const i = queue.indexOf(entry);
            if (i >= 0) {
              queue.splice(i, 1);
              reject(new DOMException('aborted', 'AbortError'));
            }
          }, { once: true });
        }
        queue.push(entry);
        grant();
      });
    },
  };
}

function channelHub() {
  const members = new Set();
  return {
    create() {
      const ch = {
        onmessage: null,
        posted: [],
        postMessage(data) {
          ch.posted.push(data);
          for (const m of Array.from(members)) {
            if (m === ch || !m.onmessage) continue;
            const copy = structuredClone(data);
            queueMicrotask(() => m.onmessage && m.onmessage({ data: copy }));
          }
        },
        close() {
          members.delete(ch);
        },
      };
      members.add(ch);
      return ch;
    },
  };
}

/** fetch for the relay routes, answered like the Core (an abort rejects, like a browser's). */
function relayFetch(relay, log) {
  return async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    log.push(`${method} ${u.pathname}`);
    const signal = init.signal;
    if (signal && signal.aborted) throw new DOMException('aborted', 'AbortError');
    // A test may answer a request itself first (a 429, a dropped connection): relay.intercept(method, path).
    const forced = typeof relay.intercept === 'function' ? relay.intercept(method, u.pathname) : null;
    if (forced === 'drop') throw new TypeError('Failed to fetch');
    if (forced) return new Response(JSON.stringify(forced.body || {}), { status: forced.status, headers: { 'content-type': 'application/json', ...(forced.headers || {}) } });
    const answer = answerRelay(relay, { method, pathname: u.pathname, search: u.search, body: typeof init.body === 'string' ? init.body : '', contentType: (init.headers && init.headers['Content-Type']) || '', signal });
    const aborted = new Promise((_, reject) => signal && signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true }));
    const out = await Promise.race([answer, aborted]);
    if (!out) throw new TypeError('Failed to fetch');
    return new Response(JSON.stringify(out.body), { status: out.status, headers: { 'content-type': 'application/json' } });
  };
}

function fakeClipboard() {
  const c = {
    writes: [],
    text: '', // what the clipboard holds now
    allow: true, // false: the page isn't focused (both calls refused)
    readDenied: false, // the owner refused Jarvis reading the clipboard
    async writeText(text) {
      if (!c.allow) throw new DOMException('Document is not focused.', 'NotAllowedError');
      c.writes.push(text);
      c.text = text;
    },
    async readText() {
      if (!c.allow || c.readDenied) throw new DOMException('Read permission denied.', 'NotAllowedError');
      return c.text;
    },
  };
  return c;
}

/** sessionStorage: one per tab (a reload keeps it; another window has its own). */
function tabSession() {
  const map = new Map();
  return { map, read: (k) => (map.has(k) ? map.get(k) : null), write: (k, v) => map.set(k, String(v)), remove: (k) => map.delete(k) };
}

function fakeWindow() {
  const listeners = new Map();
  const w = {
    focused: true,
    document: { hasFocus: () => w.focused },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    fire(type) {
      for (const fn of Array.from(listeners.get(type) || [])) {
        listeners.get(type).delete(fn);
        fn();
      }
    },
  };
  return w;
}

/** One home base, its relay, a fake Jarvis for Chrome and any number of Jarvis windows. */
function world({ linked = false, peer: peerOpts = {}, storage: initial = null } = {}) {
  const relay = fakeRelay();
  const storage = sharedStorage(initial ?? (linked ? { [CHROME_LINK_KEY]: JSON.stringify(chromeLinkRecord()) } : {}));
  const locks = fakeLocks();
  const hub = channelHub();
  const peer = createFakeChromePeer(relay, { key: linked ? CHROME_TEST_KEY : null, ...peerOpts });
  const windows = [];
  const w = {
    relay,
    storage,
    locks,
    peer,
    windows,
    open(opts = {}) {
      const log = [];
      const clipboard = opts.clipboard || fakeClipboard();
      const win = opts.win || fakeWindow();
      const link = createChromeLink({
        getHomeBase: () => (opts.homeBase === undefined ? CORE_URL : opts.homeBase),
        version: '8.1.0',
        storage: storage.window(windows.length + 1),
        fetchImpl: relayFetch(relay, log),
        locks: opts.locks === undefined ? locks : opts.locks,
        channel: hub.create(),
        clipboard,
        session: opts.session || tabSession(),
        computer: opts.computer ?? true,
        now: opts.now || (() => Date.now()),
        setTimer: opts.setTimer || ((fn, ms) => setTimeout(fn, ms)),
        random: () => 0.5,
        win,
        ...(opts.notice ? { notice: opts.notice } : {}),
      });
      const handle = { ...link, log, clipboard, win, reads: () => log.filter((l) => l === 'GET /api/relay/to-app').length };
      windows.push(handle);
      return handle;
    },
    async close() {
      for (const x of windows) x.destroy();
      await peer.stop();
      relay.store.close();
    },
  };
  return w;
}

const online = (app) => until(() => app.api.state().online, { what: 'the extension online' });

// ---- pure parts ---------------------------------------------------------------------------------------------

test('what comes back is checked: page text cut and cleaned, unsafe defaults on the safe side, bad prompts dropped', () => {
  const p = cleanPrompt({
    promptId: 'p-1', hash: 'A'.repeat(22), kind: 'step', category: 'change', site: 'www.example.com',
    title: `Add${String.fromCharCode(0x202e)} to cart\n\n`, spoken: 'x'.repeat(900), body: 'Line one\n\n\n\nLine two\u0007', address: 'https://www.example.com/a',
    choices: [{ id: 'approve', label: 'Approve' }, { id: 'bad id!', label: 'X' }, { id: 'deny', label: '' }, 'junk', { id: 'Deny_2', label: 'Deny' }],
  });
  assert.equal(p.title, 'Add  to cart'.replace('  ', ' '));
  assert.equal(p.spoken.length, 400);
  assert.equal(p.body, 'Line one\n\nLine two');
  assert.equal(p.consequential, true, 'no consequential field: treated as consequential');
  assert.deepEqual(p.voice, { allowed: false, why: '' }, 'no voice field: not allowed by voice');
  assert.deepEqual(p.choices.map((c) => c.id), ['approve', 'Deny_2']);
  assert.equal(cleanPrompt({ promptId: 'p', hash: 'A'.repeat(22), kind: 'step', choices: [] }), null, 'no choices: dropped');
  assert.equal(cleanPrompt({ promptId: 'p', hash: 'short', kind: 'step', choices: [{ id: 'a', label: 'A' }] }), null, 'a bad hash: dropped');
  assert.equal(cleanText(`a${String.fromCharCode(0x2028)}b\u0000c`, 10), 'a b c');
});

test('open: only http(s) addresses without a user name; the window\'s rectangle checked', () => {
  assert.equal(cleanOpenUrl('https://www.example.com/a?b=1'), 'https://www.example.com/a?b=1');
  for (const bad of ['javascript:alert(1)', 'chrome://settings', 'file:///etc/passwd', 'https://user:pw@example.com/', 'not a url', '', 'https://x.example/' + 'a'.repeat(2100), 42]) assert.equal(cleanOpenUrl(bad), null, String(bad).slice(0, 40));
  assert.deepEqual(cleanRect({ left: 760.4, top: -0.2, width: 680, height: 900 }), { left: 760, top: 0, width: 680, height: 900 });
  for (const bad of [null, { left: 0, top: 0, width: 50, height: 900 }, { left: NaN, top: 0, width: 600, height: 600 }, { left: 1e9, top: 0, width: 600, height: 600 }, [1, 2, 3, 4]]) assert.equal(cleanRect(bad), null, JSON.stringify(bad));
});

// ---- linking ---------------------------------------------------------------------------------------------

test('Link: a key made here, the code copied, Jarvis for Chrome pastes it and says hello; linked, the clipboard cleared, hello back', async () => {
  const w = world();
  try {
    const app = w.open();
    assert.deepEqual(app.api.state(), { linked: false, online: false, voiceApprovals: false, task: null });
    assert.equal(app.control.code(), null);
    assert.equal(app.log.length, 0, 'nothing asked while not linked');
    assert.deepEqual(app.control.begin(), { ok: true });
    assert.equal(app.control.info().phase, 'pending');
    const code = app.control.code();
    const parsed = parseLinkCode(code);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.link.core, CORE_ORIGIN);
    const stored = JSON.parse(w.storage.map.get(CHROME_LINK_KEY));
    assert.equal(stored.key, parsed.link.key, 'the key is kept in its own storage entry');
    assert.equal(stored.linkedAt, null);
    assert.deepEqual(await app.control.copyCode(), { ok: true });
    assert.deepEqual(app.clipboard.writes, [code]);
    // Waiting for Jarvis for Chrome: the window holds the link and reads its box.
    await until(() => app.reads() >= 1, { what: 'the first read of to-app' });
    w.peer.start();
    await w.peer.link(code);
    await until(() => app.api.state().linked, { what: 'linked' });
    assert.equal(app.api.state().online, true, 'a message from it just now: online');
    assert.ok(readLinkRecord((k) => w.storage.map.get(k) ?? null).linkedAt > 0);
    await until(() => app.clipboard.writes.length === 2, { what: 'the clipboard cleared' });
    assert.equal(app.clipboard.writes[1], '', 'the code is gone from the clipboard once linked (critique L9)');
    const hello = await w.peer.waitFor('hello');
    assert.deepEqual(hello.body, { app: 'jarvis', version: '8.1.0' });
    assert.equal(app.control.info().extVersion, '1.1.0');
    const ping = await app.control.ping();
    assert.equal(ping.ok, true, 'Settings → Test: a round trip');
    assert.equal(ping.status.tasksFromJarvis, true);
    assert.deepEqual(app.control.begin(), { ok: false, reason: 'linked' });
  } finally {
    await w.close();
  }
});

test('Link: needs a home base and a computer; an unused code is forgotten after 30 minutes; Cancel forgets it', async () => {
  const w = world();
  try {
    assert.deepEqual(w.open({ homeBase: '' }).control.begin(), { ok: false, reason: 'no-home-base' });
    assert.deepEqual(w.open({ homeBase: 'https://example.com/' }).control.begin(), { ok: false, reason: 'no-home-base' });
    const phone = w.open({ computer: false });
    assert.deepEqual(phone.control.begin(), { ok: false, reason: 'phone' });
    const app = w.open();
    app.control.begin();
    assert.ok(w.storage.map.has(CHROME_LINK_KEY));
    app.control.cancel();
    assert.equal(w.storage.map.has(CHROME_LINK_KEY), false);
    assert.equal(app.control.info().phase, 'off');
  } finally {
    await w.close();
  }
  const old = { [CHROME_LINK_KEY]: JSON.stringify({ v: 1, core: CORE_ORIGIN, key: newLinkKey(), linkedAt: null, extSeenAt: null, madeAt: Date.now() - PENDING_MS - 1000 }) };
  const w2 = world({ storage: old });
  try {
    const app = w2.open();
    assert.equal(app.control.info().phase, 'off');
    assert.equal(app.control.info().note, 'expired');
    assert.equal(w2.storage.map.has(CHROME_LINK_KEY), false, 'the unused key is gone');
  } finally {
    await w2.close();
  }
});

test('LINK-4 / PRIVACY-6: the clipboard is cleared once linked for the code\'s whole life (copied 11 minutes before), also after a reload', async () => {
  const w = world();
  try {
    const session = tabSession();
    const clipboard = fakeClipboard();
    const first = w.open({ session, clipboard });
    first.control.begin();
    const code = first.control.code();
    await first.control.copyCode();
    assert.ok(session.map.size >= 1, 'the copy is noted in the tab\'s session');
    assert.ok(!JSON.stringify(Array.from(session.map.values())).includes(code), 'but not the code itself');
    first.destroy(); // the tab reloads while the owner updates Jarvis for Chrome (D6)
    for (const [k, v] of session.map) session.map.set(k, JSON.stringify({ ...JSON.parse(v), at: Date.now() - 11 * 60_000 })); // 11 minutes ago
    const again = w.open({ session, clipboard });
    w.peer.start();
    await w.peer.link(code);
    await until(() => again.api.state().linked, { what: 'linked' });
    await until(() => clipboard.writes.length === 2, { what: 'cleared' });
    assert.deepEqual(clipboard.writes, [code, ''], 'the code is gone from the clipboard (critique L9)');
    assert.equal(again.control.info().clipboard, 'cleared');
  } finally {
    await w.close();
  }
});

test('PRIVACY-6: only the code is cleared: something copied since stays; a clipboard Jarvis may not read is left, and the card is told', async () => {
  const w = world();
  try {
    const clipboard = fakeClipboard();
    const app = w.open({ clipboard });
    app.control.begin();
    const code = app.control.code();
    await app.control.copyCode();
    clipboard.text = 'my grocery list'; // the owner copied something else meanwhile
    w.peer.start();
    await w.peer.link(code);
    await until(() => app.api.state().linked, { what: 'linked' });
    await sleep(100);
    assert.deepEqual(clipboard.writes, [code], 'nothing wiped');
    assert.equal(clipboard.text, 'my grocery list');
  } finally {
    await w.close();
  }
  const w2 = world();
  try {
    const clipboard = fakeClipboard();
    const app = w2.open({ clipboard });
    app.control.begin();
    const code = app.control.code();
    await app.control.copyCode();
    clipboard.readDenied = true;
    w2.peer.start();
    await w2.peer.link(code);
    await until(() => app.api.state().linked, { what: 'linked' });
    await until(() => app.control.info().clipboard === 'unchecked', { what: 'the card told' });
    assert.deepEqual(clipboard.writes, [code], 'not wiped blindly');
  } finally {
    await w2.close();
  }
});

test('the clipboard: cleared only if this window copied the code, and only when it can (on focus)', async () => {
  const w = world();
  try {
    const win = fakeWindow();
    const clipboard = fakeClipboard();
    const app = w.open({ win, clipboard });
    app.control.begin();
    await app.control.copyCode();
    clipboard.allow = false; // the owner is in the Jarvis window: this page isn't focused
    win.focused = false;
    w.peer.start();
    await w.peer.link(app.control.code());
    await until(() => app.api.state().linked, { what: 'linked' });
    await sleep(50);
    assert.deepEqual(clipboard.writes.length, 1, 'not cleared while it can\'t be');
    clipboard.allow = true;
    win.focused = true;
    win.fire('focus');
    await until(() => clipboard.writes.length === 2, { what: 'cleared on focus' });
    assert.equal(clipboard.writes[1], '');
  } finally {
    await w.close();
  }
});

// ---- requests ---------------------------------------------------------------------------------------------

test('open: the open message with the url, the rectangle and focus; its reply; refusals and why', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const app = w.open();
    await online(app);
    const r = await app.api.open('https://www.example.com/monitors?size=27', { rect: { left: 760, top: 0, width: 680, height: 900 } });
    assert.deepEqual(r, { ok: true, site: 'www.example.com' });
    const sent = await w.peer.waitFor('open');
    assert.deepEqual(sent.body, { url: 'https://www.example.com/monitors?size=27', rect: { left: 760, top: 0, width: 680, height: 900 }, focus: false }, 'beside Jarvis: not focused');
    await app.api.open('https://www.example.com/b');
    assert.deepEqual((await w.peer.waitFor('open')).body, { url: 'https://www.example.com/b', rect: null, focus: true });
    w.peer.answer('open', { ok: false, reason: 'needs-click', why: 'It adds something to a cart.' });
    assert.deepEqual(await app.api.open('https://www.example.com/cart?add=42'), { ok: false, reason: 'needs-click', why: 'It adds something to a cart.' });
    w.peer.answer('open', { ok: false, reason: 'made-up' });
    assert.deepEqual(await app.api.open('https://www.example.com/c'), { ok: false, reason: 'bad' }, 'an unknown reason is "bad"');
    const posts = w.relay.posts['to-ext'];
    assert.deepEqual(await app.api.open('javascript:alert(1)'), { ok: false, reason: 'bad' });
    assert.equal(w.relay.posts['to-ext'], posts, 'a bad address is never sent');
  } finally {
    await w.close();
  }
});

test('startTask, stopTask, answer: replies matched by re; refusals pass through; bad input never sent', async () => {
  const w = world({ linked: true, peer: { autoTask: true } });
  try {
    w.peer.start();
    const app = w.open();
    await online(app);
    const started = await app.api.startTask({ text: '  find a 4K monitor under $300   and add it to the cart ', chat: 'new' });
    assert.deepEqual(started, { ok: true, id: 'task-1' });
    assert.deepEqual((await w.peer.waitFor('start')).body, { text: 'find a 4K monitor under $300 and add it to the cart', chat: 'new', from: 'voice' });
    await until(() => app.api.state().task, { what: 'the task' });
    assert.equal(app.api.state().task.id, 'task-1');
    for (const reason of ['busy', 'off', 'cap']) {
      w.peer.answer('start', { ok: false, reason });
      assert.deepEqual(await app.api.startTask({ text: 'another one' }), { ok: false, reason });
    }
    assert.deepEqual(await app.api.startTask({ text: '   ' }), { ok: false, reason: 'bad' });
    const long = await (w.peer.answer('start', undefined), app.api.startTask({ text: 'x'.repeat(5000), chat: 'same' }));
    assert.equal(long.ok, true);
    const longSent = await w.peer.waitFor('start', { where: (m) => m.body.chat === 'same' });
    assert.equal(longSent.body.text.length, 2000, 'cut to 2,000 characters');
    // A prompt, and its answer.
    const prompts = [];
    app.api.onPrompt((p) => prompts.push(p));
    const body = await w.peer.prompt({ voice: { allowed: true, why: '' } });
    await until(() => prompts.length === 1, { what: 'the prompt' });
    assert.equal(prompts[0].promptId, body.promptId);
    assert.equal(prompts[0].voice.allowed, true);
    assert.deepEqual(await app.api.answer({ promptId: body.promptId, hash: body.hash, choice: 'approve', via: 'voice' }), { ok: true });
    assert.deepEqual((await w.peer.waitFor('answer')).body, { promptId: body.promptId, hash: body.hash, choice: 'approve', via: 'voice' });
    w.peer.answer('answer', { ok: false, reason: 'refused', why: 'That needs a click in the Jarvis window.' });
    assert.deepEqual(await app.api.answer({ promptId: body.promptId, hash: body.hash, choice: 'approve' }), { ok: false, reason: 'refused', why: 'That needs a click in the Jarvis window.' });
    assert.deepEqual(await app.api.answer({ promptId: body.promptId, hash: 'nope', choice: 'approve' }), { ok: false, reason: 'bad' });
    // Stop: done 'stopped' comes back, the task is gone.
    const done = [];
    app.api.onDone((d) => done.push(d));
    await app.api.stopTask();
    await w.peer.waitFor('stop');
    await until(() => done.length === 1, { what: 'done' });
    assert.equal(done[0].status, 'stopped');
    assert.equal(app.api.state().task, null);
  } finally {
    await w.close();
  }
});

test('incoming: task, status, done, prompt and prompt-closed reach the listeners, cleaned', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const app = w.open();
    await online(app);
    const seen = { states: [], done: [], closed: [] };
    app.api.subscribe((s) => seen.states.push(s));
    app.api.onDone((d) => seen.done.push(d));
    app.api.onPromptClosed((id, how) => seen.closed.push([id, how]));
    await w.peer.status({ voiceApprovals: true });
    await until(() => app.api.state().voiceApprovals, { what: 'voiceApprovals' });
    await w.peer.task({ id: 'task-9', narration: `Looking${String.fromCharCode(0x202e)} at monitors`, costUsd: 0.04, limitUsd: 1, picture: 'data:image/png;base64,AAAA' });
    await until(() => app.api.state().task, { what: 'the task' });
    assert.deepEqual(app.api.state().task, { id: 'task-9', status: 'running', text: 'find a 4K monitor under $300 and add it to the cart', narration: 'Looking at monitors', lastStep: '', costUsd: 0.04, limitUsd: 1 }, 'no pictures, nothing else');
    await w.peer.promptClosed('p-77', 'voice');
    await w.peer.promptClosed('p-78', 'sneaky');
    await until(() => seen.closed.length === 2, { what: 'prompt-closed' });
    assert.deepEqual(seen.closed, [['p-77', { how: 'voice' }], ['p-78', { how: 'clicked' }]]);
    await w.peer.done({ id: 'task-9', status: 'done', answer: 'y'.repeat(3000), costUsd: 0.31 });
    await until(() => seen.done.length === 1, { what: 'done' });
    assert.equal(seen.done[0].answer.length, 2000);
    assert.equal(seen.done[0].costUsd, 0.31);
    assert.equal(app.api.state().task, null);
    assert.ok(seen.states.length >= 3, 'subscribers told of each change');
    // A message of a kind this version doesn't know: nothing happens.
    await w.peer.send('teleport', { where: 'mars' });
    await sleep(100);
    assert.equal(app.api.state().linked, true);
  } finally {
    await w.close();
  }
});

test('drops: another key, a tampered message and a replay are dropped silently; a reload never takes a message twice', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const app = w.open();
    await online(app);
    const prompts = [];
    app.api.onPrompt((p) => prompts.push(p.promptId));
    // Sealed with another key, or tampered: dropped.
    const other = await importLinkKey(newLinkKey());
    w.relay.store.post('to-app', await sealEnvelope(other, { box: 'to-app', kind: 'prompt', body: { promptId: 'p-evil', hash: 'A'.repeat(22), kind: 'step', choices: [{ id: 'approve', label: 'Approve' }] } }));
    const good = await sealEnvelope(await importLinkKey(CHROME_TEST_KEY), { box: 'to-app', kind: 'prompt', body: { promptId: 'p-1', hash: 'B'.repeat(22), kind: 'step', choices: [{ id: 'approve', label: 'Approve' }] } });
    const tampered = { ...good, id: good.id.replace(/^./, (c) => (c === 'A' ? 'B' : 'A')) };
    w.relay.store.post('to-app', tampered);
    // For the wrong box (to-ext's), posted to to-app: dropped.
    const wrongBox = await sealEnvelope(await importLinkKey(CHROME_TEST_KEY), { box: 'to-ext', kind: 'prompt', body: { promptId: 'p-box', hash: 'C'.repeat(22), kind: 'step', choices: [{ id: 'approve', label: 'Approve' }] } });
    w.relay.store.post('to-app', wrongBox);
    w.relay.store.post('to-app', good);
    await until(() => prompts.length === 1, { what: 'the good prompt' });
    await sleep(100);
    assert.deepEqual(prompts, ['p-1']);
    // A reload: the inbox remembers where it read up to and what it opened.
    const inbox = JSON.parse(w.storage.map.get(CHROME_LINK_INBOX_KEY));
    assert.ok(inbox.seen.includes(good.id));
    app.destroy();
    // Even when the relay no longer knows the cursor (so it sends everything it holds), nothing comes twice.
    w.storage.map.set(CHROME_LINK_INBOX_KEY, JSON.stringify({ ...inbox, cursor: null }));
    const again = w.open();
    const prompts2 = [];
    again.api.onPrompt((p) => prompts2.push(p.promptId));
    await until(() => again.reads() >= 1, { what: 'the new window reading' });
    await sleep(150);
    assert.deepEqual(prompts2, [], 'the prompt already taken is not taken again');
    assert.ok(!JSON.stringify(Array.from(w.storage.map)).includes(CHROME_TEST_KEY.slice(0, 20)) || w.storage.map.get(CHROME_LINK_KEY).includes(CHROME_TEST_KEY), 'the key only in its own entry');
  } finally {
    await w.close();
  }
});

test('offline: nothing sent while Jarvis for Chrome is away (stop excepted); no reply in 10 s is "offline"', async () => {
  const fast = (fn, ms) => setTimeout(fn, ms === REPLY_TIMEOUT_MS ? 300 : ms);
  const w = world({ linked: true });
  try {
    const app = w.open({ setTimer: fast });
    // Not reading its box, last seen 5 minutes ago, no message from it: offline.
    w.peer.setOnline(false, { seenAgoMs: 5 * 60_000 });
    await until(() => w.relay.posts['to-ext'] === 1, { what: 'the hello a window says when it starts linked' });
    await app.control.refresh();
    assert.deepEqual(app.api.state(), { linked: true, online: false, voiceApprovals: false, task: null });
    const before = w.relay.posts['to-ext'];
    assert.deepEqual(await app.api.open('https://www.example.com/'), { ok: false, reason: 'offline' });
    assert.deepEqual(await app.api.startTask({ text: 'buy it' }), { ok: false, reason: 'offline' });
    assert.equal(w.relay.posts['to-ext'], before, 'nothing went out');
    const stopping = app.api.stopTask(); // goes out all the same, and is sent again until confirmed (LINK-1)
    await until(() => w.relay.posts['to-ext'] === before + 1, { what: 'the stop sent' });
    assert.equal(w.relay.posts['to-ext'], before + 1, 'stop is sent even offline');
    assert.deepEqual(await app.control.ping(), { ok: false, reason: 'offline' }, 'Settings → Test asks anyway, and says when nothing answers');
    assert.equal(w.relay.posts['to-ext'] >= before + 2, true);
    // Online by the status (it reads its box), but it never answers: the request gives up.
    w.peer.setOnline(true);
    w.peer.start();
    assert.deepEqual(await stopping, { ok: true }, 'the stop is confirmed once Jarvis for Chrome reads it');
    w.peer.answer('open', null);
    await until(async () => (await app.control.refresh()).online, { what: 'online by the status' });
    const t0 = Date.now();
    assert.deepEqual(await app.api.open('https://www.example.com/'), { ok: false, reason: 'offline' });
    assert.ok(Date.now() - t0 >= 250);
  } finally {
    await w.close();
  }
});

test('fresh requests only (D5): a late ok for a start given up on is stopped at once and said; a late refusal does nothing; a late open is only noted', async () => {
  const fast = (fn, ms) => setTimeout(fn, ms === REPLY_TIMEOUT_MS ? 300 : ms);
  const w = world({ linked: true });
  try {
    w.peer.start();
    const notices = [];
    const app = w.open({ setTimer: fast, notice: (n) => notices.push(n) });
    await online(app);
    const stops = () => w.peer.received.filter((m) => m.kind === 'stop').length;
    // No reply in time: the owner hears "offline"; then the extension's ok comes after all.
    w.peer.answer('start', null);
    assert.deepEqual(await app.api.startTask({ text: 'find a 4K monitor' }), { ok: false, reason: 'offline' });
    const start = await w.peer.waitFor('start');
    await w.peer.send('reply', { re: start.id, ok: true, id: 'task-late' });
    await w.peer.waitFor('stop');
    await until(() => notices.length === 1, { what: 'the notice' });
    assert.deepEqual(notices, [{ kind: 'late-start', line: LATE_START_LINE }]);
    assert.equal(LATE_START_LINE, 'Chrome started late, so I stopped it.');
    // The extension refused it as too late (its side of D5): nothing more.
    assert.deepEqual(await app.api.startTask({ text: 'again' }), { ok: false, reason: 'offline' });
    const start2 = await w.peer.waitFor('start');
    await w.peer.send('reply', { re: start2.id, ok: false, reason: 'gone', why: 'too late' });
    // A late ok for an open: only noted.
    w.peer.answer('open', null);
    assert.deepEqual(await app.api.open('https://www.example.com/'), { ok: false, reason: 'offline' });
    const open = await w.peer.waitFor('open');
    await w.peer.send('reply', { re: open.id, ok: true, url: 'https://www.example.com/', site: 'www.example.com' });
    await until(() => app.control.info().late === 1, { what: 'the late open noted' });
    await sleep(100);
    assert.equal(stops(), 1, 'one stop: for the late start only');
    assert.equal(notices.length, 1);
    // The same late reply twice (a replay can't get through the envelope, but the map forgets it anyway).
    await w.peer.send('reply', { re: start.id, ok: true, id: 'task-late' });
    await sleep(150);
    assert.equal(stops(), 1);
  } finally {
    await w.close();
  }
});

// ---- stop is confirmed and sent again (REDTEAM-LINK-1) -------------------------------------------------------

/** Timers 20 times faster (a stop's 2-s resends, its 2 minutes, the poll's pauses). */
const quick = (fn, ms) => setTimeout(fn, Math.max(1, ms / 20));

test('stop (LINK-1): a stop whose POST is refused (429) is sent again until Jarvis for Chrome confirms it; stopTask says so', async () => {
  const w = world({ linked: true, peer: { autoTask: true } });
  try {
    w.peer.start();
    const app = w.open({ setTimer: quick });
    await online(app);
    assert.deepEqual(await app.api.startTask({ text: 'find a 4K monitor' }), { ok: true, id: 'task-1' });
    await until(() => app.api.state().task, { what: 'the task' });
    let refused = 0;
    w.relay.intercept = (method, path) => (method === 'POST' && path === '/api/relay/to-ext' && refused++ === 0 ? { status: 429, body: { error: 'rate_limited' }, headers: { 'retry-after': '1' } } : null);
    const r = await app.api.stopTask();
    assert.deepEqual(r, { ok: true }, 'confirmed by Jarvis for Chrome');
    assert.equal(refused >= 2, true, 'the first POST was refused, a later one went through');
    assert.equal(w.peer.received.filter((m) => m.kind === 'stop').length >= 1, true, 'the extension got the stop');
    assert.ok(w.peer.sent.some((m) => m.kind === 'done' && m.body.status === 'stopped'), 'and the task stopped');
  } finally {
    await w.close();
  }
});

test('stop (LINK-1): a stop the relay lost (a restart before the extension read it) is sent again; the extension stops', async () => {
  const w = world({ linked: true, peer: { autoTask: true } });
  try {
    w.peer.start();
    const app = w.open({ setTimer: quick });
    await online(app);
    await app.api.startTask({ text: 'find a 4K monitor' });
    await until(() => app.api.state().task, { what: 'the task' });
    w.peer.setOnline(false); // between two reads
    const posts = w.relay.posts['to-ext'];
    const stopping = app.api.stopTask();
    await until(() => w.relay.posts['to-ext'] > posts, { what: 'the stop posted' });
    w.relay.store.close(); // the home base restarts: its boxes are empty
    w.peer.setOnline(true);
    assert.deepEqual(await stopping, { ok: true });
    assert.equal(w.peer.received.filter((m) => m.kind === 'stop').length >= 1, true, 'a stop sent again reached it');
    assert.ok(w.peer.sent.some((m) => m.kind === 'done' && m.body.status === 'stopped'), 'and the task stopped');
  } finally {
    await w.close();
  }
});

test('stop (LINK-1): one pending stop, resent with back-off; a done or a status without the task confirms it; unlinked and 2 minutes say so', async () => {
  const w = world({ linked: true, peer: { autoTask: true } });
  try {
    w.peer.start();
    const app = w.open({ setTimer: quick });
    await online(app);
    await app.api.startTask({ text: 'find a 4K monitor' });
    await until(() => app.api.state().task, { what: 'the task' });
    // Jarvis for Chrome reads but never answers the stop; its status then shows no task: confirmed.
    w.peer.answer('stop', null);
    const t0 = w.relay.posts['to-ext'];
    const a = app.api.stopTask();
    const b = app.api.stopTask(); // a second "stop": the same pending stop, sent again now
    await until(() => w.relay.posts['to-ext'] >= t0 + 3, { what: 'resent' });
    await w.peer.status({ task: null });
    assert.deepEqual(await a, { ok: true });
    assert.deepEqual(await b, { ok: true });
    const sent = w.relay.posts['to-ext'] - t0;
    await sleep(400);
    assert.equal(w.relay.posts['to-ext'] - t0, sent, 'no more resends once confirmed');
    // A done for the task confirms it too.
    w.peer.answer('start', undefined);
    await app.api.startTask({ text: 'another' });
    await until(() => app.api.state().task && app.api.state().task.id === 'task-2', { what: 'task-2' });
    const c = app.api.stopTask();
    await sleep(30);
    await w.peer.done({ id: 'task-2', status: 'stopped' });
    assert.deepEqual(await c, { ok: true });
    // Nobody reads: resent with back-off, then offline after 2 minutes (scaled).
    w.peer.setOnline(false);
    const t1 = w.relay.posts['to-ext'];
    const started = Date.now();
    const d = await app.api.stopTask();
    assert.deepEqual(d, { ok: false, reason: 'offline' });
    const tries = w.relay.posts['to-ext'] - t1;
    assert.ok(tries >= 5 && tries <= 15, `sent again with back-off (${tries} sends in 2 minutes)`);
    assert.ok(Date.now() - started >= (2 * 60_000) / 20 - 50, 'it kept trying for 2 minutes');
    // Not linked: said at once.
    await app.control.unlink();
    assert.deepEqual(await app.api.stopTask(), { ok: false, reason: 'unlinked' });
  } finally {
    await w.close();
  }
});

test('fresh requests only (D5) with LINK-1: the late start\'s stop is sent again until confirmed, and only then is the owner told', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const notices = [];
    const app = w.open({ setTimer: quick, notice: (n) => notices.push(n) });
    await online(app);
    w.peer.answer('start', null);
    assert.deepEqual(await app.api.startTask({ text: 'find a 4K monitor' }), { ok: false, reason: 'offline' });
    const start = await w.peer.waitFor('start');
    // The late ok comes, but the first stop's POST is refused.
    let refused = 0;
    w.relay.intercept = (method, path) => (method === 'POST' && path === '/api/relay/to-ext' && refused++ === 0 ? { status: 502, body: {} } : null);
    await w.peer.send('reply', { re: start.id, ok: true, id: 'task-late' });
    await sleep(60);
    assert.deepEqual(notices, [], 'not said before the stop is confirmed');
    await w.peer.waitFor('stop');
    await until(() => notices.length === 1, { what: 'the notice' });
    assert.deepEqual(notices[0], { kind: 'late-start', line: LATE_START_LINE });
    // Never confirmed: after 10 s the owner hears that it couldn't be stopped.
    w.relay.intercept = null;
    w.peer.answer('start', null);
    await app.api.startTask({ text: 'again' });
    const start2 = await w.peer.waitFor('start');
    w.peer.answer('stop', null);
    w.peer.setOnline(false);
    await w.peer.send('reply', { re: start2.id, ok: true, id: 'task-late-2' });
    await until(() => notices.length === 2, { timeoutMs: 8000, what: 'the unconfirmed notice' });
    assert.equal(notices[1].kind, 'late-start-unconfirmed');
    assert.match(notices[1].line, /couldn’t reach it to stop it\. Press Stop in its side panel/);
  } finally {
    await w.close();
  }
});

// ---- the code works once (REDTEAM-LINK-4) ---------------------------------------------------------------------

/** Link a fresh app window with the fake extension through the code; returns { app, code, codeKey }. */
async function linkWithCode(w, opts = {}) {
  const app = w.open({ setTimer: quick, ...opts });
  app.control.begin();
  const code = app.control.code();
  const codeKey = parseLinkCode(code).link.key;
  await until(() => app.reads() >= 1, { what: 'the first read of to-app' });
  w.peer.start();
  await w.peer.link(code);
  await until(() => app.api.state().linked, { what: 'linked' });
  return { app, code, codeKey };
}

test('LINK-4: linking replaces the code\'s key: rekey sealed with it, Jarvis for Chrome switches and answers under the new key; both forget the code\'s', async () => {
  const w = world();
  try {
    const { app, codeKey } = await linkWithCode(w);
    const rekey = await w.peer.waitFor('rekey');
    const stored = () => readLinkRecord((k) => w.storage.map.get(k) ?? null);
    assert.equal(rekey.body.key, stored().key, 'the new key, sent in a rekey');
    assert.notEqual(stored().key, codeKey, 'the code\'s key is no longer the link\'s');
    assert.equal(w.peer.key, stored().key, 'Jarvis for Chrome switched');
    await until(() => stored().prev === null, { what: 'the app forgets the code\'s key once the new one is heard' });
    assert.equal(JSON.stringify(Array.from(w.storage.map.values())).includes(codeKey), false, 'the code\'s key is nowhere in storage');
    // The app's next request is sealed with the new key: Jarvis for Chrome forgets the code's too.
    assert.equal((await app.control.ping()).ok, true);
    await until(() => w.peer.prevKey === null, { what: 'the extension forgets the code\'s key' });
  } finally {
    await w.close();
  }
});

test('LINK-4: an old code is useless once linked: its holder reads nothing and its forged prompt is dropped', async () => {
  const w = world({ peer: { autoTask: true } });
  try {
    const { app, codeKey } = await linkWithCode(w);
    await until(() => readLinkRecord((k) => w.storage.map.get(k) ?? null).prev === null, { what: 'the rotation confirmed' });
    // Later: someone finds the code (clipboard history, a note) and reads Jarvis for Chrome's box with it.
    const thief = createFakeChromePeer(w.relay, { key: codeKey });
    w.relay.store.close(); // (it comes later: what was sent at linking has left the relay, 2 minutes on)
    const before = w.peer.received.length;
    thief.start();
    try {
      assert.deepEqual(await app.api.startTask({ text: 'open my email and summarize the newest message' }), { ok: true, id: 'task-1' });
      await until(() => w.peer.received.length > before, { what: 'the real extension got the start' });
      await sleep(200);
      assert.equal(thief.received.filter((m) => m.kind === 'start').length, 0, 'the old code opens nothing the app sends now');
      assert.ok(thief.dropped >= 1, 'it saw the start, sealed, and couldn\'t open it');
      // A prompt forged with the old code is dropped.
      const prompts = [];
      app.api.onPrompt((p) => prompts.push(p));
      await thief.prompt({ spoken: 'Your bank needs your card number. Read it out now.' });
      await sleep(300);
      assert.deepEqual(prompts, [], 'the forged prompt never reaches Jarvis');
    } finally {
      await thief.stop();
    }
  } finally {
    await w.close();
  }
});

test('LINK-4: a lost rekey, or its lost answer, still ends with both on the new key (the code\'s key taken meanwhile)', async () => {
  // The rekey's POST is refused once: it is sent again.
  const w = world();
  try {
    let refused = 0;
    w.relay.intercept = (method, path) => (method === 'POST' && path === '/api/relay/to-ext' && refused++ === 0 ? { status: 502, body: {} } : null);
    const { app } = await linkWithCode(w);
    await until(() => readLinkRecord((k) => w.storage.map.get(k) ?? null).prev === null, { timeoutMs: 8000, what: 'confirmed after a lost rekey' });
    assert.ok(refused >= 2);
    assert.equal(w.peer.key, readLinkRecord((k) => w.storage.map.get(k) ?? null).key);
    assert.equal((await app.control.ping()).ok, true, 'and the link works');
  } finally {
    await w.close();
  }
  // Jarvis for Chrome's answer to the rekey is lost: it has switched; the app still seals with the code's key (taken
  // in the grace) until the extension's next message, under the new key, confirms it.
  const w2 = world();
  try {
    w2.peer.answer('rekey', null);
    w2.peer.answer('hello', null);
    const { app } = await linkWithCode(w2);
    await w2.peer.waitFor('rekey');
    // A request meanwhile is sealed with the code's key (taken in the grace); its answer, under the new key,
    // confirms the rotation.
    assert.equal((await app.control.ping()).ok, true);
    await until(() => readLinkRecord((k) => w2.storage.map.get(k) ?? null).prev === null, { what: 'confirmed by its next message' });
    assert.equal((await app.control.ping()).ok, true);
  } finally {
    await w2.close();
  }
});

// ---- a start whose reply was lost (MISSED-LINK-A) -------------------------------------------------------------

test('MISSED-LINK-A: the reply to a start is lost but the task runs: its news after the start gave up is a late start, stopped and said', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const notices = [];
    const app = w.open({ setTimer: quick, notice: (n) => notices.push(n) });
    await online(app);
    // Jarvis for Chrome starts the task, but its reply never arrives; the task's news does.
    w.peer.answer('start', null);
    const starting = app.api.startTask({ text: 'find a 4K monitor' });
    await w.peer.waitFor('start');
    await w.peer.task({ id: 'task-lost', status: 'running', narration: 'Looking.' });
    assert.deepEqual(await starting, { ok: false, reason: 'offline' }, 'the owner was told it didn\'t start');
    await w.peer.waitFor('stop', { timeoutMs: 5000 });
    await until(() => notices.length === 1, { what: 'the notice' });
    assert.deepEqual(notices[0], { kind: 'late-start', line: LATE_START_LINE });
    assert.ok(w.peer.sent.some((m) => m.kind === 'done' && m.body.id === 'task-lost' && m.body.status === 'stopped'), 'the task was stopped');
    // News that comes only after the give-up (a status naming a voice task) counts the same way.
    w.peer.answer('start', null);
    assert.deepEqual(await app.api.startTask({ text: 'again' }), { ok: false, reason: 'offline' });
    await w.peer.status({ task: { id: 'task-lost-2', status: 'running', from: 'voice' } });
    await until(() => notices.length === 2, { what: 'the second notice' });
    assert.equal(w.peer.received.filter((m) => m.kind === 'stop').length, 2);
  } finally {
    await w.close();
  }
});

test('MISSED-LINK-A: the window that gave up reloads before the late ok: the new window stops the task and says so', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const notices1 = [];
    const first = w.open({ setTimer: quick, notice: (n) => notices1.push(n) });
    await online(first);
    w.peer.answer('start', null);
    assert.deepEqual(await first.api.startTask({ text: 'find a 4K monitor' }), { ok: false, reason: 'offline' });
    const start = await w.peer.waitFor('start');
    first.destroy(); // reloaded (or closed): its memory is gone
    const notices2 = [];
    const second = w.open({ setTimer: quick, notice: (n) => notices2.push(n) });
    await until(() => second.control.info().holder, { what: 'the new window holds the link' });
    w.peer.answer('stop', undefined);
    await w.peer.send('reply', { re: start.id, ok: true, id: 'task-late' });
    await w.peer.waitFor('stop', { timeoutMs: 5000 });
    await until(() => notices2.length === 1, { what: 'the new window tells' });
    assert.deepEqual(notices2[0], { kind: 'late-start', line: LATE_START_LINE });
    assert.equal(notices1.length, 0);
  } finally {
    await w.close();
  }
});

test('MISSED-LINK-A: no false alarm: a task whose start was answered, a task from the side panel, news with no start given up', async () => {
  const w = world({ linked: true, peer: { autoTask: true } });
  try {
    w.peer.start();
    const notices = [];
    const app = w.open({ setTimer: quick, notice: (n) => notices.push(n) });
    await online(app);
    // A voice task that started normally, then a start given up on while it runs: its news is not a late start.
    assert.deepEqual(await app.api.startTask({ text: 'find a 4K monitor' }), { ok: true, id: 'task-1' });
    w.peer.answer('start', null);
    assert.deepEqual(await app.api.startTask({ text: 'another' }), { ok: false, reason: 'offline' });
    await w.peer.task({ id: 'task-1', status: 'running', narration: 'Still going.' });
    // A task typed in the side panel shows only in the status, as from the panel.
    await w.peer.status({ task: { id: 'task-panel', status: 'running', from: 'panel' } });
    await sleep(300);
    assert.equal(w.peer.received.filter((m) => m.kind === 'stop').length, 0, 'nothing stopped');
    assert.deepEqual(notices, []);
  } finally {
    await w.close();
  }
});

test('fresh requests only (D5) across windows: a late ok for another window\'s start reaches it through the holder', async () => {
  const fast = (fn, ms) => setTimeout(fn, ms === REPLY_TIMEOUT_MS ? 300 : ms);
  const w = world({ linked: true });
  try {
    w.peer.start();
    const noticesA = [];
    const noticesB = [];
    const a = w.open({ setTimer: fast, notice: (n) => noticesA.push(n) });
    await online(a);
    const b = w.open({ setTimer: fast, notice: (n) => noticesB.push(n) });
    await until(() => b.api.state().online, { what: 'b online' });
    w.peer.answer('start', null);
    assert.deepEqual(await b.api.startTask({ text: 'from the other window' }), { ok: false, reason: 'offline' });
    const start = await w.peer.waitFor('start');
    await w.peer.send('reply', { re: start.id, ok: true, id: 'task-late-b' });
    await w.peer.waitFor('stop');
    await until(() => noticesB.length === 1, { what: 'b told' });
    assert.equal(noticesA.length, 0, 'only the window that gave up says it');
  } finally {
    await w.close();
  }
});

test('online follows the last 60 seconds: by a message, or by the relay\'s status; an impossible future time is not believed', async () => {
  let skew = 0;
  const now = () => Date.now() + skew;
  const w = world({ linked: true });
  try {
    w.peer.start();
    const app = w.open({ now });
    await online(app);
    skew = ONLINE_MS + 1000;
    w.peer.setOnline(false, { seenAgoMs: 10 * 60_000 });
    await app.control.refresh();
    assert.equal(app.api.state().online, false, 'nothing for over a minute: offline');
    w.relay.extSeenOverride = Date.now() + skew - 5000; // the relay: it read its box 5 s ago
    await app.control.refresh();
    assert.equal(app.api.state().online, true, 'the status says it reads its box');
    w.relay.extSeenOverride = Date.now() + skew + 10 * 60_000; // a clock far ahead
    skew += ONLINE_MS + 1000;
    await app.control.refresh();
    assert.equal(app.api.state().online, false);
  } finally {
    await w.close();
  }
});

// ---- unlinking ------------------------------------------------------------------------------------------------

test('Unlink here: Jarvis for Chrome is told first, then the key is forgotten; a waiting request ends', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const app = w.open();
    await online(app);
    w.peer.answer('start', null);
    const waiting = app.api.startTask({ text: 'something long' });
    await w.peer.waitFor('start');
    await app.control.unlink();
    assert.equal((await w.peer.waitFor('unlinked')).kind, 'unlinked');
    assert.equal(w.peer.linked, false);
    assert.equal(w.storage.map.has(CHROME_LINK_KEY), false);
    assert.equal(w.storage.map.has(CHROME_LINK_INBOX_KEY), false);
    assert.deepEqual(await waiting, { ok: false, reason: 'unlinked' });
    assert.deepEqual(app.api.state(), { linked: false, online: false, voiceApprovals: false, task: null });
    const reads = app.reads();
    await sleep(200);
    assert.equal(app.reads(), reads, 'no more reading once unlinked');
  } finally {
    await w.close();
  }
});

test('Unlinked from Jarvis for Chrome: the key is forgotten here and Settings says so', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const app = w.open();
    await online(app);
    await w.peer.unlink();
    await until(() => !app.api.state().linked, { what: 'unlinked' });
    assert.equal(app.control.info().note, 'ext-unlinked');
    assert.equal(w.storage.map.has(CHROME_LINK_KEY), false);
  } finally {
    await w.close();
  }
});

// ---- windows, back-off, phones ----------------------------------------------------------------------------------

test('one window holds the link: only it reads and hears prompts; another window\'s request is answered through it; the next takes over', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const a = w.open();
    await online(a);
    const b = w.open();
    await until(() => b.api.state().online, { what: 'b sees online (from a)' });
    assert.equal(a.control.info().holder, true);
    assert.equal(b.control.info().holder, false);
    const promptsA = [];
    const promptsB = [];
    a.api.onPrompt((p) => promptsA.push(p.promptId));
    b.api.onPrompt((p) => promptsB.push(p.promptId));
    const p = await w.peer.prompt();
    await until(() => promptsA.length === 1, { what: 'the prompt in a' });
    await sleep(100);
    assert.deepEqual([promptsA, promptsB], [[p.promptId], []], 'one window speaks each prompt');
    assert.equal(b.reads(), 0, 'b never reads to-app');
    // b sends; the reply reaches b through a.
    assert.deepEqual(await b.api.open('https://www.example.com/'), { ok: true, site: 'www.example.com' });
    // b sees the task a heard about.
    await w.peer.task({ id: 'task-3' });
    await until(() => b.api.state().task && b.api.state().task.id === 'task-3', { what: 'b sees the task' });
    // a closes: b holds the link and reads.
    a.destroy();
    await until(() => b.control.info().holder, { what: 'b takes over' });
    await until(() => b.reads() >= 1, { what: 'b reading' });
    const p2 = await w.peer.prompt();
    await until(() => promptsB.length === 1, { what: 'the next prompt in b' });
    assert.deepEqual(promptsB, [p2.promptId]);
  } finally {
    await w.close();
  }
});

test('back-off while the home base can\'t be reached; an old Core (404) waits 5 minutes; both clear when it answers', async () => {
  const scaled = (fn, ms) => setTimeout(fn, Math.max(1, ms / 100));
  const w = world({ linked: true });
  try {
    w.relay.mode = 'unreachable';
    const app = w.open({ setTimer: scaled });
    await until(() => app.control.info().problem === 'unreachable', { what: 'unreachable' });
    const n = app.log.length;
    await sleep(300);
    const tries = app.log.length - n;
    assert.ok(tries >= 1 && tries <= 15, `backing off, not hammering (${tries} tries in 300 ms at 100× speed)`);
    w.relay.mode = 'old';
    await until(() => app.control.info().problem === 'old-core', { what: 'old-core' });
    const m = app.log.length;
    await sleep(500); // 5 minutes at 100× is 3 s: at most one more try
    assert.ok(app.log.length - m <= 2, 'an old Core is asked again only every 5 minutes');
    // The Core is updated: the next status check that works ends the wait at once.
    w.relay.mode = 'ok';
    const k = app.log.length;
    await app.control.refresh();
    await until(() => app.log.slice(k).includes('GET /api/relay/to-app'), { timeoutMs: 1000, what: 'reading again right after the status answered' });
    assert.equal(app.control.info().problem, null);
  } finally {
    await w.close();
  }
});

test('phones never link or read, whatever is stored; computers only', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const phone = w.open({ computer: false });
    await sleep(200);
    assert.deepEqual(phone.log, [], 'not a single request');
    assert.deepEqual(phone.api.state(), { linked: false, online: false, voiceApprovals: false, task: null });
    assert.deepEqual(await phone.api.open('https://www.example.com/'), { ok: false, reason: 'unlinked' });
  } finally {
    await w.close();
  }
});

test('Web Locks missing: the window holds the link by itself', async () => {
  const w = world({ linked: true });
  try {
    w.peer.start();
    const app = w.open({ locks: null });
    await online(app);
    assert.equal(app.control.info().holder, true);
  } finally {
    await w.close();
  }
});
