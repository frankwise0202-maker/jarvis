// app.chromeLink (v8.1, src/platform/chrome-link.js, contract (f), SPEC §32.1) in Node: the Core's own relay store
// behind a fake fetch (test/e2e/core-fakes.mjs answerRelay), the E2E's fake Jarvis for Chrome as the other end,
// and fake Web Locks, BroadcastChannel, storage (with other windows' storage events) and clipboard. Linking with
// the code; open/start/stop/answer and their replies; what comes back is checked and cut to size; drops are
// silent and replays never come twice (a reload included); offline and the 10-second give-up; unlinking from
// either side; one window holds the link; back-off and an old Core; phones never poll.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createChromeLink, cleanPrompt, cleanOpenUrl, cleanRect, cleanText, readLinkRecord, CHROME_LINK_KEY, CHROME_LINK_INBOX_KEY, REPLY_TIMEOUT_MS, PENDING_MS, ONLINE_MS } from '../../src/platform/chrome-link.js';
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
    allow: true,
    async writeText(text) {
      if (!c.allow) throw new DOMException('Document is not focused.', 'NotAllowedError');
      c.writes.push(text);
    },
  };
  return c;
}

function fakeWindow() {
  const listeners = new Map();
  return {
    focused: true,
    document: { hasFocus: () => this?.focused ?? true },
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
        computer: opts.computer ?? true,
        now: opts.now || (() => Date.now()),
        setTimer: opts.setTimer || ((fn, ms) => setTimeout(fn, ms)),
        random: () => 0.5,
        win,
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

test('the clipboard: cleared only if this window copied the code, and only when it can (on focus)', async () => {
  const w = world();
  try {
    const win = fakeWindow();
    const clipboard = fakeClipboard();
    const app = w.open({ win, clipboard });
    app.control.begin();
    await app.control.copyCode();
    clipboard.allow = false; // the owner is in the Jarvis window: this page isn't focused
    w.peer.start();
    await w.peer.link(app.control.code());
    await until(() => app.api.state().linked, { what: 'linked' });
    await sleep(50);
    assert.deepEqual(clipboard.writes.length, 1, 'not cleared while it can\'t be');
    clipboard.allow = true;
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
    await app.api.stopTask(); // goes out all the same, and gives up after the timeout
    assert.equal(w.relay.posts['to-ext'], before + 1, 'stop is sent even offline');
    // Online by the status (it reads its box), but it never answers: the request gives up.
    w.peer.setOnline(true);
    w.peer.start();
    w.peer.answer('open', null);
    await until(async () => (await app.control.refresh()).online, { what: 'online by the status' });
    const t0 = Date.now();
    assert.deepEqual(await app.api.open('https://www.example.com/'), { ok: false, reason: 'offline' });
    assert.ok(Date.now() - t0 >= 250);
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
    w.relay.mode = 'ok';
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
