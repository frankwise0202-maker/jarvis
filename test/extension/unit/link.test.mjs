// Voice from Jarvis, end to end in Node: the real controller (fake browser, mock Claude API), the
// link and the relay loop against a fake home base relay, and Jarvis's end played by a peer that
// speaks the envelope. open, start, stop, answer, prompts, task and done, the daily cap, the switch,
// replays, the back-off, the pause when the relay is gone, and the approval window.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBrowser, fakeEncoder } from '../helpers/fake-chrome.mjs';
import { createAppPeer, createFakeRelay, newLinkKey } from '../helpers/fake-relay.mjs';
import { createClaudeMock, TEST_API_KEY } from '../mock/claude-mock.mjs';
import { Controller } from '../../../extension/src/background/controller.js';
import { createClient } from '../../../extension/src/background/api.js';
import { createStore, VOICE_TASKS_PER_DAY, localDay, parseLinkCode, homeBaseOrigin } from '../../../extension/src/shared/storage.js';
import { PORT_NAME } from '../../../extension/src/shared/protocol.js';
import { JarvisLink, cleanRect, doneStatus, namedSites, openVerdict } from '../../../extension/src/background/link.js';
import { Relay, UNREACHABLE_MS, backoffMs } from '../../../extension/src/background/relay.js';
import { CLICK_ONLY, MIN_PROMPT_AGE_MS, promptHash } from '../../../extension/src/background/voice-policy.js';

const CORE = 'https://alienware.tail4e5f6a.ts.net';
const PAGE = {
  title: 'Shop',
  elements: [
    { role: 'button', name: 'Add to cart', x: 10, y: 10, w: 100, h: 30, desc: { tag: 'button' } },
    { role: 'button', name: 'Place order', x: 10, y: 60, w: 100, h: 30, desc: { tag: 'button' } },
  ],
};
const fast = (ms) => new Promise((r) => setTimeout(r, Math.min(ms, 5)));

async function setup({ approvalsAvailable = false, voice = null, panel = true, linked = true } = {}) {
  const clock = { offset: 0 };
  const now = () => Date.now() + clock.offset;
  const fb = createFakeBrowser();
  const calls = { windows: [], alarms: [], permissions: [] };
  fb.chrome.windows = {
    async getLastFocused() {
      return { id: 1 };
    },
    async update(id, props) {
      calls.windows.push({ op: 'update', id, props });
      return { id };
    },
    async create(props) {
      calls.windows.push({ op: 'create', props });
      return { id: 77 };
    },
  };
  fb.chrome.alarms = {
    async get() {
      return calls.alarms.some((a) => a.op === 'create') ? { name: 'jarvis-relay' } : null;
    },
    async create(name, opts) {
      calls.alarms.push({ op: 'create', name, opts });
    },
    async clear(name) {
      calls.alarms.push({ op: 'clear', name });
      return true;
    },
  };
  fb.chrome.permissions = {
    async remove(p) {
      calls.permissions.push(p);
      return true;
    },
  };
  fb.chrome.runtime.getPlatformInfo = async () => ({ os: 'mac' });
  fb.chrome.runtime.getURL = (p) => `chrome-extension://fake-extension-id/${p}`;
  const store = createStore(fb.chrome);
  await store.confirmProfile();
  await store.setApiKey(TEST_API_KEY);
  const mock = createClaudeMock();
  const controller = new Controller({
    chrome: fb.chrome,
    store,
    pageSource: '/* agent */',
    createClient: ({ apiKey }) => createClient({ apiKey, baseURL: 'http://mock.local', fetch: mock.fetch }),
    encoder: fakeEncoder,
    platform: 'mac',
    now,
  });
  fb.onCdpEvent = (tabId, m, p) => controller.driver.onCdpEvent(tabId, m, p);
  fb.chrome.tabs.onCreated.addListener((t) => controller.driver.onTabCreated(t));
  fb.chrome.tabs.onRemoved.addListener((id) => controller.driver.onTabRemoved(id));
  const tab = fb.addTab({ url: 'https://shop.example/', page: PAGE });
  const received = [];
  if (panel) {
    controller.connect({ name: PORT_NAME, postMessage: (m) => received.push(m), onDisconnect: { addListener() {} }, onMessage: { addListener() {} } });
  }
  const relay = createFakeRelay({ waitScaleMs: 5 });
  const key = newLinkKey();
  if (linked) await store.setLink({ core: CORE, key });
  if (voice) await store.setVoice(voice);
  const link = new JarvisLink({ chrome: fb.chrome, controller, store, version: '1.1.0', now, approvalsAvailable, relayDeps: { fetch: relay.fetch, sleep: fast } });
  await link.init();
  const app = await createAppPeer({ relay, key, now });
  const lastTask = () => controller.tasks.at(-1);
  const waitFor = async (fn, ms = 5000, what = 'condition') => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  const done = async () => {
    link.relay?.stop();
    app.stop();
    clearInterval(link.watchTimer);
    if (controller.run) await controller.stop('panel');
  };
  return { fb, calls, store, mock, controller, tab, received, relay, key, link, app, clock, now, lastTask, waitFor, done };
}

// ---------------------------------------------------------------------------------------------
// Pure parts

test('the link code: a Tailscale home base only (a local relay in development builds), a 32-byte key', () => {
  const code = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const key = newLinkKey();
  assert.deepEqual(parseLinkCode(code({ v: 1, core: CORE, key })), { ok: true, link: { v: 1, core: CORE, key } });
  assert.deepEqual(parseLinkCode(` ${code({ v: 1, core: `${CORE}/`, key })}\n`).link?.core, CORE, 'spaces and a trailing slash');
  for (const core of ['http://alienware.tail4e5f6a.ts.net', 'https://evil.example', 'https://ts.net', 'https://a.ts.net', `${CORE}:8443`, `${CORE}/api`, 'https://user@alienware.tail4e5f6a.ts.net', 'http://127.0.0.1:8080']) {
    assert.equal(parseLinkCode(code({ v: 1, core, key })).ok, false, core);
  }
  assert.equal(homeBaseOrigin('http://127.0.0.1:8080', { dev: true }), 'http://127.0.0.1:8080');
  assert.equal(homeBaseOrigin('http://127.0.0.1:8080', { dev: false }), '');
  for (const bad of ['', 'hello', code({ v: 2, core: CORE, key }), code({ v: 1, core: CORE, key: 'short' }), code({ v: 1, core: CORE }), code([1])]) assert.equal(parseLinkCode(bad).ok, false, bad);
});

test('open: blocked, needs a click, or opens (the extension’s own address checks)', () => {
  assert.deepEqual(openVerdict('https://www.bestbuy.com/site/monitors'), { ok: true, url: 'https://www.bestbuy.com/site/monitors', site: 'bestbuy.com' });
  for (const url of ['chrome://settings', 'chrome-extension://abc/x.html', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hi', 'about:blank', 'https://user:pw@shop.example/', 'https://chromewebstore.google.com/detail/x', `https://shop.example/${'a'.repeat(2100)}`]) {
    assert.equal(openVerdict(url).reason, 'blocked', url);
  }
  for (const url of ['https://shop.example/cart?add-to-cart=42', 'https://shop.example/act/delete?id=7', 'https://shop.example/orders/7/cancel', 'https://shop.example/%64elete', 'https://shop.example/%61bout', 'https://shop.example/files/setup.dmg', 'https://shop.example/a​b']) {
    const v = openVerdict(url);
    assert.equal(v.reason, 'needs-click', url);
    assert.ok(v.detail, 'says why');
  }
  for (const bad of [undefined, 42, '', 'not an address', 'shop.example/x']) assert.equal(openVerdict(bad).reason, 'bad', String(bad));
});

test('sites named in the words: as addresses only (no guessing from "best buy")', () => {
  assert.deepEqual([...namedSites('Find a 4K monitor on bestbuy.com under $300')], ['bestbuy.com']);
  assert.deepEqual([...namedSites('open www.amazon.co.uk and nike dot com')], ['amazon.co.uk', 'nike.com']);
  assert.deepEqual([...namedSites('find a monitor on best buy')], []);
});

test('a window’s place from Jarvis: whole numbers in sane ranges, else none', () => {
  assert.deepEqual(cleanRect({ left: 10.4, top: 20, width: 800, height: 600 }), { left: 10, top: 20, width: 800, height: 600 });
  for (const r of [null, {}, { left: 0, top: 0, width: 99, height: 600 }, { left: 'a', top: 0, width: 800, height: 600 }, { left: 0, top: 0, width: 800, height: Infinity }, { left: 200000, top: 0, width: 800, height: 600 }]) assert.equal(cleanRect(r), null);
  assert.deepEqual(cleanRect({ left: -40, top: 0, width: 100, height: 100 }), { left: -40, top: 0, width: 100, height: 100 });
});

test('done: limits are told apart from a Stop', () => {
  assert.equal(doneStatus({ status: 'done' }), 'done');
  assert.equal(doneStatus({ status: 'stopped', error: 'Stopped at your budget.' }), 'limit');
  assert.equal(doneStatus({ status: 'stopped', error: 'Stopped at the step limit.' }), 'limit');
  assert.equal(doneStatus({ status: 'stopped', stoppedVia: 'jarvis' }), 'stopped');
  assert.equal(doneStatus({ status: 'error' }), 'failed');
  assert.equal(doneStatus({ status: 'interrupted' }), 'failed');
});

test('the relay loop backs off while the home base can’t be reached, and starts again when it answers', async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map((n) => backoffMs(n)), [1000, 2000, 5000, 10000, 20000, 30000, 30000]);
  assert.equal(backoffMs(1, 45), 45000, 'a 429 asks for longer');
  const relay = createFakeRelay({ waitScaleMs: 1 });
  relay.down = true;
  const slept = [];
  const store = createStore(createFakeBrowser().chrome);
  const r = new Relay({ chrome: { runtime: {} }, link: { core: CORE, key: newLinkKey() }, store, onMessage() {}, fetch: relay.fetch, sleep: async (ms) => {
    slept.push(ms);
    if (slept.length === 4) relay.down = false;
    await new Promise((res) => setTimeout(res, 1));
  } });
  r.start();
  const end = Date.now() + 3000;
  while (!(r.lastOkAt > 0) && Date.now() < end) await new Promise((res) => setTimeout(res, 5));
  r.stop();
  assert.deepEqual(slept.slice(0, 4), [1000, 2000, 5000, 10000]);
  assert.ok(r.lastOkAt > 0 && r.failures === 0, 'answered again');
  assert.ok(relay.requests.some((q) => q.path === '/api/relay/to-ext' && q.query.wait === '20'), 'a 20-s long poll');
});

// ---------------------------------------------------------------------------------------------
// The link

test('linked: hello and the status go to Jarvis; the alarm is set; ping answers with the status', async (t) => {
  const s = await setup();
  t.after(s.done);
  const hello = await s.app.waitFor((m) => m.kind === 'hello');
  assert.deepEqual(hello.body, { ext: 'jarvis-for-chrome', version: '1.1.0' });
  const status = await s.app.waitFor((m) => m.kind === 'status');
  assert.deepEqual(status.body, { online: true, tasksFromJarvis: true, voiceApprovals: false, task: null });
  assert.ok(s.calls.alarms.some((a) => a.op === 'create' && a.name === 'jarvis-relay' && a.opts.periodInMinutes === 0.5));
  const pong = await s.app.request('ping');
  assert.equal(pong.ok, true);
  assert.deepEqual(pong.status, { online: true, tasksFromJarvis: true, voiceApprovals: false, task: null });
  // Jarvis's hello is answered with a reply, a hello and the status.
  const n = s.app.of('hello').length;
  assert.equal((await s.app.request('hello', { app: 'jarvis', version: '8.1' })).ok, true);
  await s.app.waitFor(() => s.app.of('hello').length > n);
  assert.equal((await s.app.request('nonsense')).reason, 'bad', 'an unknown request is refused, still with one reply');
});

test('open: a tab in the Jarvis window, no debugger; with a place, the window goes there unfocused', async (t) => {
  const s = await setup();
  t.after(s.done);
  const before = s.fb.tabs.size;
  const r = await s.app.request('open', { url: 'https://www.bestbuy.com/site/monitors', rect: { left: 900, top: 40, width: 700, height: 800 }, focus: false });
  assert.deepEqual(r, { re: r.re, ok: true, url: 'https://www.bestbuy.com/site/monitors', site: 'bestbuy.com' });
  const opened = [...s.fb.tabs.values()].find((x) => x.url === 'https://www.bestbuy.com/site/monitors');
  assert.ok(opened && s.fb.tabs.size === before + 1, 'a new tab');
  assert.equal(opened.attached, false, 'no debugger');
  const update = s.calls.windows.find((c) => c.op === 'update');
  assert.deepEqual(update.props, { state: 'normal', left: 900, top: 40, width: 700, height: 800 });
  assert.ok(!s.calls.windows.some((c) => c.props?.focused === true), 'not focused with a place');
  // Without a place: focused.
  await s.app.request('open', { url: 'https://www.bestbuy.com/', rect: null, focus: true });
  assert.ok(s.calls.windows.some((c) => c.op === 'update' && c.props.focused === true));
  // Refused addresses open nothing.
  const n = s.fb.tabs.size;
  for (const url of ['chrome://settings', 'https://user:pw@shop.example/', 'file:///etc/hosts']) assert.equal((await s.app.request('open', { url, rect: null, focus: true })).reason, 'blocked', url);
  assert.equal(s.fb.tabs.size, n);
});

test('open: an address that acts waits for a click on its card; the card opens exactly it', async (t) => {
  const s = await setup();
  t.after(s.done);
  const url = 'https://shop.example/cart?add-to-cart=42';
  const n = s.fb.tabs.size;
  const r = await s.app.request('open', { url, rect: null, focus: true });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'needs-click');
  assert.equal(s.fb.tabs.size, n, 'nothing opened');
  const cards = s.received.filter((m) => m.type === 'cards').at(-1).cards;
  assert.equal(cards.length, 1);
  assert.equal(cards[0].shown, url, 'the whole address on the card');
  await s.link.onPanelMessage({ type: 'open-card', cardId: cards[0].id, choice: 'open' });
  assert.ok([...s.fb.tabs.values()].some((x) => x.url === url && !x.attached), 'opened after the click');
  assert.equal(s.link.cards.length, 0);
  // Dismissed: nothing opens.
  await s.app.request('open', { url: 'https://shop.example/act/delete?id=7', rect: null, focus: true });
  const card = s.link.cards[0];
  await s.link.onPanelMessage({ type: 'open-card', cardId: card.id, choice: 'dismiss' });
  assert.ok(![...s.fb.tabs.values()].some((x) => /act\/delete/.test(x.url)));
});

test('start: refused when Tasks from Jarvis is off, at 30 a day, while a task runs, or empty', async (t) => {
  const s = await setup();
  t.after(s.done);
  await s.store.setVoice({ tasksFromJarvis: false });
  assert.equal((await s.app.request('start', { text: 'Find a monitor', chat: 'new', from: 'voice' })).reason, 'off');
  await s.store.setVoice({ tasksFromJarvis: true });
  assert.equal((await s.app.request('start', { text: '   ', chat: 'new', from: 'voice' })).reason, 'bad');
  assert.equal((await s.app.request('start', { text: 'x'.repeat(2001), chat: 'new', from: 'voice' })).reason, 'bad');
  await s.fb.chrome.storage.local.set({ 'jarvis.voiceTasks': { day: localDay(s.now()), count: VOICE_TASKS_PER_DAY } });
  const cap = await s.app.request('start', { text: 'Find a monitor', chat: 'new', from: 'voice' });
  assert.equal(cap.reason, 'cap');
  assert.match(cap.why, /30 tasks from Jarvis today/);
  await s.fb.chrome.storage.local.set({ 'jarvis.voiceTasks': { day: '2000-01-01', count: 99 } });
  // A task from the side panel runs: busy.
  s.mock.script([() => ({ hold: true })]);
  const panelTask = s.controller.start({ text: 'Typed in the panel', windowId: 1 });
  await s.waitFor(() => s.controller.run);
  assert.equal((await s.app.request('start', { text: 'Find a monitor', chat: 'new', from: 'voice' })).reason, 'busy');
  await s.controller.stop('panel');
  await panelTask;
  assert.equal(await s.store.voiceTasksToday(s.now()), 0, 'refusals don’t count');
});

test('a task from Jarvis: marked, counted, task and done go back (no pictures), the status says it runs', async (t) => {
  const s = await setup();
  t.after(s.done);
  await s.store.allowSiteAlways('shop.example');
  s.mock.script([() => ({ update: 'Looking at the shop.', calls: [{ name: 'read_page', input: {} }, { name: 'screenshot', input: {} }] }), () => ({ answer: 'The Dell is $279.99.' })]);
  const r = await s.app.request('start', { text: 'What does the Dell cost on shop.example?', chat: 'new', from: 'voice' });
  assert.equal(r.ok, true);
  assert.match(r.id, /^task_/);
  const done = await s.app.waitFor((m) => m.kind === 'done', { timeoutMs: 8000 });
  assert.deepEqual(done.body, { id: r.id, status: 'done', answer: 'The Dell is $279.99.', costUsd: done.body.costUsd });
  assert.ok(done.body.costUsd > 0);
  const task = s.controller.tasks.find((x) => x.id === r.id);
  assert.equal(task.from, 'voice', 'marked From Jarvis (voice)');
  assert.equal(await s.store.voiceTasksToday(s.now()), 1);
  const updates = s.app.of('task');
  assert.ok(updates.length >= 1 && updates.every((m) => m.body.id === r.id && m.body.from === 'voice'));
  for (const m of updates) {
    assert.deepEqual(Object.keys(m.body).sort(), ['costUsd', 'from', 'id', 'lastStep', 'limitUsd', 'narration', 'status', 'text']);
    assert.ok(!JSON.stringify(m.body).includes('data:image'), 'no pictures');
  }
  assert.ok(s.app.of('status').some((m) => m.body.task?.id === r.id), 'the status names the running task');
  assert.equal(s.app.of('done').length, 1, 'done once');
});

test('a panel task’s prompts go to Jarvis, but its task and done don’t', async (t) => {
  const s = await setup();
  t.after(s.done);
  s.mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ answer: 'ok' })]);
  const running = s.controller.start({ text: 'Typed in the panel', windowId: 1 });
  const p = await s.app.waitFor((m) => m.kind === 'prompt');
  assert.equal(p.body.kind, 'site');
  s.controller.decide(p.body.promptId, 'once');
  await running;
  const closed = await s.app.waitFor((m) => m.kind === 'prompt-closed');
  assert.deepEqual(closed.body, { promptId: p.body.promptId, how: 'clicked' });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(s.app.of('task').length + s.app.of('done').length, 0);
});

/** A task from Jarvis that reaches a guard prompt for `button` on shop.example (set to Always). */
async function untilStepPrompt(s, button = 'Add to cart') {
  await s.store.allowSiteAlways('shop.example');
  s.mock.script([
    () => ({ calls: [{ name: 'read_page', input: {} }] }),
    (ctx) => ({ calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: ctx.ref(new RegExp(button)) } } }] }),
    (ctx) => ({ answer: ctx.results[0]?.isError ? `Not done: ${ctx.results[0].text}` : 'Done.' }),
  ]);
  const r = await s.app.request('start', { text: `Press ${button} on shop.example`, chat: 'new', from: 'voice' });
  assert.equal(r.ok, true);
  const prompt = await s.app.waitFor((m) => m.kind === 'prompt' && m.body.kind === 'confirm', { timeoutMs: 8000 });
  return { id: r.id, prompt: prompt.body };
}

test('prompts: the extension’s own spoken words, its hash, and whether voice may answer', async (t) => {
  const s = await setup();
  t.after(s.done);
  const { prompt } = await untilStepPrompt(s);
  assert.equal(prompt.category, 'change');
  assert.equal(prompt.consequential, false);
  assert.equal(prompt.site, 'shop.example');
  assert.equal(prompt.spoken, 'Jarvis for Chrome wants to click on shop.example. The button says “Add to cart”.');
  assert.deepEqual(prompt.choices, [{ id: 'approve', label: 'Approve' }, { id: 'cancel', label: 'Cancel' }]);
  assert.deepEqual(prompt.voice, { allowed: false, why: CLICK_ONLY }, 'every approval is a click until the red-team round');
  assert.equal(prompt.hash, await promptHash(s.controller.run.task.prompt));
});

test('answer: a cancel by voice is taken at once; the step list says so; prompt-closed says how', async (t) => {
  const s = await setup();
  t.after(s.done);
  const { id, prompt } = await untilStepPrompt(s);
  const r = await s.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'cancel', via: 'voice' });
  assert.deepEqual(r, { re: r.re, ok: true, promptId: prompt.promptId });
  const closed = await s.app.waitFor((m) => m.kind === 'prompt-closed' && m.body.promptId === prompt.promptId);
  assert.equal(closed.body.how, 'voice');
  await s.app.waitFor((m) => m.kind === 'done');
  const task = s.controller.tasks.find((x) => x.id === id);
  assert.ok(task.steps.some((st) => st.label === 'Answered by voice from Jarvis: “Cancel” (page step on shop.example).'), task.steps.map((x) => x.label).join(' | '));
  assert.ok(!s.fb.activations.some((a) => a.name === 'Add to cart'), 'not clicked');
});

test('answer: every approval is a click (the switch is off): refused, the prompt stays open; the panel’s click works', async (t) => {
  const s = await setup({ voice: { tasksFromJarvis: true, approvals: true } });
  t.after(s.done);
  const { prompt } = await untilStepPrompt(s);
  s.clock.offset += MIN_PROMPT_AGE_MS + 100;
  const r = await s.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'voice' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'refused');
  assert.equal(r.why, CLICK_ONLY);
  assert.equal(s.controller.run.task.prompt?.id, prompt.promptId, 'still open');
  s.controller.decide(prompt.promptId, 'approve');
  await s.app.waitFor((m) => m.kind === 'done');
  assert.ok(s.fb.activations.some((a) => a.name === 'Add to cart'), 'the click went through');
});

test('answer, with voice approvals available and on: a page step on an Always site is approved by voice, once', async (t) => {
  const s = await setup({ approvalsAvailable: true, voice: { tasksFromJarvis: true, approvals: true } });
  t.after(s.done);
  const { id, prompt } = await untilStepPrompt(s);
  assert.deepEqual(prompt.voice, { allowed: true, why: '' });
  // Too soon: refused, still open.
  const soon = await s.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'voice' });
  assert.equal(soon.reason, 'refused');
  assert.match(soon.why, /only just appeared/);
  assert.equal(s.controller.run.task.prompt?.id, prompt.promptId);
  s.clock.offset += MIN_PROMPT_AGE_MS + 100;
  // Another hash (the prompt as it isn't): refused.
  assert.equal((await s.app.request('answer', { promptId: prompt.promptId, hash: 'AAAAAAAAAAAAAAAAAAAAAA', choice: 'approve', via: 'voice' })).reason, 'refused');
  const r = await s.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'voice' });
  assert.equal(r.ok, true);
  await s.app.waitFor((m) => m.kind === 'done');
  const task = s.controller.tasks.find((x) => x.id === id);
  assert.ok(task.steps.some((st) => st.label === 'Approved by voice from Jarvis: “Approve” (page step on shop.example).'));
  assert.equal(s.fb.activations.filter((a) => a.name === 'Add to cart').length, 1, 'one click, once');
  // The same decision again: the prompt is gone.
  assert.equal((await s.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'voice' })).reason, 'gone');
});

test('answer, with voice approvals on: a purchase is refused by voice and stays open', async (t) => {
  const s = await setup({ approvalsAvailable: true, voice: { tasksFromJarvis: true, approvals: true } });
  t.after(s.done);
  const { prompt } = await untilStepPrompt(s, 'Place order');
  assert.equal(prompt.consequential, true);
  assert.equal(prompt.category, 'purchase');
  assert.deepEqual(prompt.voice, { allowed: false, why: CLICK_ONLY });
  s.clock.offset += MIN_PROMPT_AGE_MS + 100;
  const r = await s.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'card' });
  assert.equal(r.reason, 'refused');
  assert.equal(r.why, CLICK_ONLY);
  assert.equal(s.controller.run.task.prompt?.id, prompt.promptId, 'still open');
  assert.ok(!s.fb.activations.some((a) => a.name === 'Place order'));
  s.controller.decide(prompt.promptId, 'cancel');
  await s.app.waitFor((m) => m.kind === 'done');
});

test('a replayed decision is dropped: no second reply, nothing decided twice', async (t) => {
  const s = await setup();
  t.after(s.done);
  const { prompt } = await untilStepPrompt(s);
  const msg = await s.app.post('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'cancel', via: 'voice' });
  await s.app.waitFor((m) => m.kind === 'reply' && m.body.re === msg.id);
  s.relay.put('to-ext', { id: msg.id, iv: msg.iv, ct: msg.ct });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(s.app.received.filter((m) => m.kind === 'reply' && m.body.re === msg.id).length, 1);
  // Nor after a restart of the worker: what was read is kept.
  const again = new JarvisLink({ chrome: s.fb.chrome, controller: s.controller, store: s.store, version: '1.1.0', relayDeps: { fetch: s.relay.fetch, sleep: fast } });
  s.link.relay.stop();
  await again.init();
  s.relay.put('to-ext', { id: msg.id, iv: msg.iv, ct: msg.ct });
  await new Promise((r) => setTimeout(r, 300));
  again.relay.stop();
  assert.equal(s.app.received.filter((m) => m.kind === 'reply' && m.body.re === msg.id).length, 1);
});

test('a message sealed with another key, or too old, gets no answer at all', async (t) => {
  const s = await setup();
  t.after(s.done);
  const stranger = await createAppPeer({ relay: s.relay, key: newLinkKey() });
  const m1 = await stranger.post('start', { text: 'Buy everything', chat: 'new', from: 'voice' });
  const m2 = await s.app.post('start', { text: 'Buy everything', chat: 'new', from: 'voice' }, { at: s.now() - 121_000 });
  await new Promise((r) => setTimeout(r, 300));
  await s.app.poll();
  assert.ok(!s.app.received.some((m) => m.kind === 'reply' && (m.body.re === m1.id || m.body.re === m2.id)));
  assert.equal(s.controller.tasks.length, 0);
});

test('stop from Jarvis stops the task; the step list says so', async (t) => {
  const s = await setup();
  t.after(s.done);
  const { id } = await untilStepPrompt(s);
  const r = await s.app.request('stop');
  assert.equal(r.ok, true);
  const done = await s.app.waitFor((m) => m.kind === 'done');
  assert.equal(done.body.status, 'stopped');
  const task = s.controller.tasks.find((x) => x.id === id);
  assert.ok(task.steps.some((st) => st.label === 'Stopped by voice from Jarvis.'));
  assert.equal((await s.app.request('stop')).reason, 'gone', 'nothing left to stop');
});

test('a task from Jarvis pauses when the relay has been unreachable for 20 s (once per outage); the panel’s Stop still works', async (t) => {
  const s = await setup();
  t.after(s.done);
  await untilStepPrompt(s);
  const run = s.controller.run;
  s.link.checkRelay();
  assert.equal(run.takeover, false, 'reachable: goes on');
  s.relay.down = true;
  s.clock.offset += UNREACHABLE_MS - 1000;
  s.link.checkRelay();
  assert.equal(run.takeover, false, 'not yet');
  s.clock.offset += 1500;
  s.link.checkRelay();
  assert.equal(run.takeover, true, 'paused as Take over does');
  assert.ok(run.task.steps.some((st) => /^Paused: Jarvis for Chrome couldn’t reach your home base for 20 seconds/.test(st.label)));
  // The owner presses Continue in the panel: it goes on, and isn't paused again for this outage.
  s.controller.resume();
  s.clock.offset += 30_000;
  s.link.checkRelay();
  assert.equal(run.takeover, false);
  await s.controller.stop('panel');
  assert.equal(run.task.status, 'stopped');
});

test('a task from the side panel never pauses for the relay', async (t) => {
  const s = await setup();
  t.after(s.done);
  s.mock.script([() => ({ hold: true })]);
  const running = s.controller.start({ text: 'Typed in the panel', windowId: 1 });
  await s.waitFor(() => s.controller.run);
  s.relay.down = true;
  s.clock.offset += 60_000;
  s.link.checkRelay();
  assert.equal(s.controller.run.takeover, false);
  await s.controller.stop('panel');
  await running;
});

test('no side panel open: a question that needs a click opens the approval window (once), and so does a card', async (t) => {
  const s = await setup({ panel: false });
  t.after(s.done);
  await untilStepPrompt(s);
  await s.waitFor(() => s.calls.windows.some((c) => c.op === 'create'));
  const created = s.calls.windows.filter((c) => c.op === 'create');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0].props, { url: 'chrome-extension://fake-extension-id/approve.html', type: 'popup', focused: true, width: 420, height: 620 });
  await s.app.request('open', { url: 'https://shop.example/cart?add-to-cart=1', rect: null, focus: true });
  await s.waitFor(() => s.calls.windows.some((c) => c.op === 'update' && c.id === 77 && c.props.focused === true), 2000, 'the window focused again');
  assert.equal(s.calls.windows.filter((c) => c.op === 'create').length, 1, 'not a second window');
});

test('unlink: from the panel, Jarvis is told first; from Jarvis, the link goes; the key is forgotten', async (t) => {
  const s = await setup();
  t.after(s.done);
  await s.app.waitFor((m) => m.kind === 'hello');
  await s.link.onPanelMessage({ type: 'unlink' });
  await s.app.waitFor((m) => m.kind === 'unlinked');
  assert.equal(await s.store.getLink(), null);
  assert.ok(s.calls.alarms.some((a) => a.op === 'clear'));
  assert.deepEqual(s.calls.permissions.at(-1), { origins: [`${CORE}/*`] });
  assert.equal(s.link.relay, null);

  const s2 = await setup();
  t.after(s2.done);
  const r = await s2.app.request('unlinked');
  assert.equal(r.ok, true);
  await s2.waitFor(async () => (await s2.store.getLink()) === null);
  assert.equal(s2.link.relay, null);
  await new Promise((res) => setTimeout(res, 100));
  assert.deepEqual(await s2.store.getRelayState(), { after: '', seen: [] }, 'nothing of the link is kept');
});
