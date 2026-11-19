// The controller with the fake browser and the in-process mock API: site permission prompts,
// approvals, Stop, and what is kept.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBrowser, fakeEncoder } from '../helpers/fake-chrome.mjs';
import { createClaudeMock, TEST_API_KEY } from '../mock/claude-mock.mjs';
import { Controller } from '../../../extension/src/background/controller.js';
import { createClient } from '../../../extension/src/background/api.js';
import { createStore } from '../../../extension/src/shared/storage.js';
import { PORT_NAME } from '../../../extension/src/shared/protocol.js';
import { Approvals } from '../../../extension/src/background/guard.js';

const PAGE = {
  title: 'Shop',
  elements: [
    { role: 'button', name: 'Add to cart', x: 10, y: 10, w: 100, h: 30, desc: { tag: 'button' } },
    { role: 'button', name: 'Place order', x: 10, y: 60, w: 100, h: 30, desc: { tag: 'button' } },
  ],
};

async function setup({ key = TEST_API_KEY } = {}) {
  const fb = createFakeBrowser();
  const store = createStore(fb.chrome);
  if (key) await store.setApiKey(key);
  const mock = createClaudeMock();
  const controller = new Controller({
    chrome: fb.chrome,
    store,
    pageSource: '/* agent */',
    createClient: ({ apiKey }) => createClient({ apiKey, baseURL: 'http://mock.local', fetch: mock.fetch }),
    encoder: fakeEncoder,
    platform: 'mac',
  });
  fb.onCdpEvent = (tabId, m, p) => controller.driver.onCdpEvent(tabId, m, p);
  fb.chrome.tabs.onCreated.addListener((t) => controller.driver.onTabCreated(t));
  fb.chrome.tabs.onRemoved.addListener((id) => controller.driver.onTabRemoved(id));
  const tab = fb.addTab({ url: 'https://shop.example/', page: PAGE });
  // A panel port that records what the worker sends.
  const received = [];
  const listeners = [];
  const port = {
    name: PORT_NAME,
    postMessage: (m) => received.push(m),
    onDisconnect: { addListener() {} },
    onMessage: { addListener: (fn) => listeners.push(fn) },
  };
  controller.connect(port);
  const lastTask = () => controller.tasks.at(-1);
  const waitFor = async (fn, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error('timed out');
  };
  const prompt = () => waitFor(() => lastTask()?.prompt);
  return { fb, store, mock, controller, tab, received, lastTask, waitFor, prompt };
}

test('without a key the task explains what to do', async () => {
  const { controller, lastTask } = await setup({ key: null });
  await controller.start({ text: 'Hi', windowId: 1 });
  assert.equal(lastTask().status, 'error');
  assert.match(lastTask().error, /API key/);
});

test('site permission: asked once per site per task; "Always" is remembered; Deny refuses', async () => {
  const { controller, mock, store, lastTask, prompt, waitFor } = await setup();
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ calls: [{ name: 'get_page_text', input: {} }] }), () => ({ answer: 'ok' })]);
  const running = controller.start({ text: 'Look', windowId: 1 });
  const p = await prompt();
  assert.equal(p.kind, 'site');
  assert.equal(p.site, 'shop.example');
  assert.deepEqual(p.choices.map((c) => c.id), ['once', 'always', 'deny']);
  controller.decide(p.id, 'always');
  await running;
  assert.equal(lastTask().status, 'done');
  assert.deepEqual(await store.getSites(), { 'shop.example': 'always' });
  // Next task: no prompt for shop.example.
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ answer: 'ok' })]);
  await controller.start({ text: 'Again', windowId: 1 });
  assert.equal(lastTask().status, 'done');
  // Deny on a new site.
  await store.forgetSite('shop.example');
  let seen;
  mock.script([
    () => ({ calls: [{ name: 'read_page', input: {} }] }),
    (ctx) => {
      seen = ctx.results[0];
      return { answer: 'ok' };
    },
  ]);
  const third = controller.start({ text: 'Third', windowId: 1 });
  const q = await prompt();
  controller.decide(q.id, 'deny');
  await third;
  assert.ok(seen.isError && /did not allow Jarvis to work on shop\.example/.test(seen.text));
  void waitFor;
});

test('the guard asks before "Place order"; Cancel blocks it; the decision is final for the task', async () => {
  const { controller, mock, store, prompt, fb, tab } = await setup();
  await store.allowSiteAlways('shop.example');
  const results = [];
  mock.script([
    () => ({ calls: [{ name: 'read_page', input: {} }] }),
    (ctx) => ({ calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: ctx.ref(/Place order/) } } }] }),
    (ctx) => {
      results.push(ctx.results[0]);
      return { calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: ctx.ref(/Place order/) } } }] };
    },
    (ctx) => {
      results.push(ctx.results[0]);
      return { answer: 'Not ordered.' };
    },
  ]);
  const running = controller.start({ text: 'Order it', windowId: 1 });
  const p = await prompt();
  assert.equal(p.kind, 'confirm');
  assert.match(p.body, /Click "Place order" on shop\.example — this looks like a purchase or payment/);
  controller.decide(p.id, 'cancel');
  await running;
  assert.match(results[0].text, /^Blocked: the owner declined/);
  assert.match(results[1].text, /^Blocked: the owner already declined/, 'no second prompt in the same task');
  const presses = fb.calls.filter((c) => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mousePressed');
  assert.equal(presses.length, 0);
  void tab;
});

test('Stop: aborts at once, releases the tab and keeps the card', async () => {
  const { controller, mock, store, lastTask, waitFor, fb, tab } = await setup();
  await store.allowSiteAlways('shop.example');
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ hold: true })]);
  const running = controller.start({ text: 'Hold on', windowId: 1 });
  await waitFor(() => mock.requests.length === 2);
  assert.equal(tab.attached, true);
  const t0 = Date.now();
  await controller.stop('panel');
  assert.ok(Date.now() - t0 < 500);
  assert.equal(lastTask().status, 'stopped');
  assert.equal(tab.attached, false);
  await running;
  assert.equal(lastTask().status, 'stopped');
  assert.equal(controller.run, null);
  void fb;
});

test('finished tasks go to history (unless incognito)', async () => {
  const { controller, mock, store } = await setup();
  mock.script([() => ({ answer: 'Hello!' })]);
  await controller.start({ text: 'Say hello', windowId: 1 });
  const h = await store.getHistory();
  assert.equal(h.length, 1);
  assert.equal(h[0].answer, 'Hello!');
  await store.setSettings({ incognito: true });
  mock.script([() => ({ answer: 'Quiet.' })]);
  await controller.start({ text: 'Quietly', windowId: 1 });
  assert.equal((await store.getHistory()).length, 1);
});

test('JS dialogs: alerts are accepted; confirm() only for the action the owner approved; prompt() never', async () => {
  const { controller } = await setup();
  let now = 1000;
  const approvals = new Approvals(() => now);
  controller.run = { approvals };
  controller.driver.register({ id: 999, url: 'https://shop.example/x' });
  const t = controller.driver.get('tab-1');
  const confirm = (message) => controller.dialogPolicy('tab-1', { type: 'confirm', message });
  assert.equal(controller.dialogPolicy('tab-1', { type: 'alert', message: 'Saved.' }), true);
  assert.equal(controller.dialogPolicy('tab-1', { type: 'prompt', message: 'Name?' }), false);
  assert.equal(confirm('Place your order for $279.99?'), false, 'no approval: dismissed');
  // The approved "Place order" click in this call: its own confirm is accepted, once.
  controller.driver.armDialog(t, { category: 'purchase', site: 'shop.example' });
  assert.equal(confirm('Permanently delete your account? This cannot be undone.'), false, 'a dialog about something else is not covered');
  assert.equal(confirm('Place your order for $279.99?'), true);
  assert.equal(confirm('Place your order for $279.99?'), false, 'once');
  controller.driver.disarmDialog(t);
  // A request_confirmation approval on this page and tab covers one confirm() of its kind.
  approvals.grant('delete', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/x', text: 'Remove the saved address 1 Main St' });
  assert.equal(confirm('Place your order for $279.99?'), false, 'other category');
  assert.equal(confirm('Are you sure?'), true, 'an unclassified confirm after the approved removal');
  assert.equal(confirm('Are you sure?'), false, 'used up');
  // Declined categories are never accepted.
  approvals.grant('delete', 'shop.example', { tabId: 'tab-1', url: 'https://shop.example/x', text: 'Delete it' });
  approvals.decline('delete', 'shop.example');
  assert.equal(confirm('Delete this file?'), false);
  controller.run = null;
});

// ---------------------------------------------------------------------------------------------
// Review fixes (safety review S3, S7, S9, S12; function review F1, F4, F5, F7)

const product = (id) => ({ title: `${id} — Shop`, elements: [{ role: 'button', name: 'Buy now', x: 10, y: 60, w: 100, h: 30, desc: { tag: 'button' }, onClick: (pg, fb) => (fb.orders = [...(fb.orders || []), id]) }] });

test('S3/F1: approving one purchase covers that click only; the next product asks again', async () => {
  const { controller, mock, store, fb, lastTask, waitFor } = await setup();
  await store.allowSiteAlways('shop.example');
  for (const id of ['dell', 'lg']) fb.routes[`https://shop.example/product/${id}`] = product(id);
  const buy = (ctx) => ({ calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: ctx.ref(/Buy now/) } } }] });
  const open = (id) => () => ({ calls: [{ name: 'navigate', input: { url: `https://shop.example/product/${id}` } }, { name: 'read_page', input: {} }] });
  const prompts = [];
  const answer = (choice) => async () => {
    const p = await waitFor(() => lastTask()?.prompt);
    prompts.push(p.body);
    controller.decide(p.id, choice);
  };
  // 1. The guard's own prompt: Approve buys the Dell; the LG's Buy now asks again (Cancel).
  mock.script([open('dell'), buy, open('lg'), buy, () => ({ answer: 'ok' })]);
  let running = controller.start({ text: 'Buy the Dell', windowId: 1 });
  await answer('approve')();
  await answer('cancel')();
  await running;
  assert.deepEqual(fb.orders, ['dell']);
  assert.equal(prompts.length, 2, 'a second prompt for the second purchase');
  assert.match(prompts[0], /Click "Buy now" on shop\.example\/product\/dell — this looks like a purchase or payment/);
  // 2. request_confirmation for the Dell, then Buy now on the LG: asked again.
  fb.orders = [];
  prompts.length = 0;
  mock.script([
    open('dell'),
    () => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Buy the Dell S2721QS for $279.99 with Buy now', category: 'purchase' } }] }),
    open('lg'),
    buy,
    () => ({ answer: 'ok' }),
  ]);
  running = controller.start({ text: 'Buy the Dell again', windowId: 1 });
  await answer('approve')();
  await answer('cancel')();
  await running;
  assert.deepEqual(fb.orders, [], 'the LG was not bought on the Dell approval');
  assert.equal(prompts.length, 2);
});

test('S9: request_confirmation from a blank tab asks nothing and grants nothing', async () => {
  const { controller, mock, lastTask, fb } = await setup();
  for (const t of fb.tabs.values()) t.url = 'about:blank';
  let seen;
  mock.script([
    () => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Sign you up for the free weekly deals newsletter', category: 'purchase' } }] }),
    (ctx) => {
      seen = ctx.results[0];
      return { answer: 'ok' };
    },
  ]);
  await controller.start({ text: 'Sign me up', windowId: 1 });
  assert.equal(lastTask().status, 'done');
  assert.ok(seen.isError && /no website is open/.test(seen.text), seen.text);
  assert.ok(!lastTask().steps.some((s) => s.kind === 'ask'), 'the owner was never asked');
});

test('F4: Take over while a page is loading pauses the task (it does not stop it); Continue finishes it', async () => {
  const { controller, mock, store, fb, lastTask, waitFor } = await setup();
  await store.allowSiteAlways('shop.example');
  fb.routes['https://shop.example/slow'] = { title: 'Slow', delayMs: 3000 };
  let resumed;
  mock.script([
    () => ({ calls: [{ name: 'navigate', input: { url: 'https://shop.example/slow' } }] }),
    (ctx) => {
      resumed = ctx;
      return { answer: 'Carried on.' };
    },
  ]);
  const running = controller.start({ text: 'Open the slow page', windowId: 1 });
  await waitFor(() => [...controller.driver.tabs.values()].some((t) => t.waiters.size > 0));
  await controller.takeover();
  await waitFor(() => lastTask().status === 'paused');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(lastTask().status, 'paused', 'still paused, not stopped');
  assert.ok(controller.run, 'the task is still there');
  controller.resume();
  await running;
  assert.equal(lastTask().status, 'done');
  assert.match(resumed.results[0].text, /^Not executed: the owner took over/);
  assert.ok(resumed.notes.some((n) => /took over the browser/.test(n)));
});

test('F5: Retry after a temporary error carries on in the same conversation (follow-up context kept)', async () => {
  const { controller, mock, store, lastTask } = await setup();
  await store.allowSiteAlways('shop.example');
  controller.retryDelaysMs = [1, 1, 1];
  mock.script([() => ({ answer: 'The Dell S2721QS is the cheapest 4K monitor, at $279.99.' })]);
  await controller.start({ text: 'Find 4K monitors under $300', windowId: 1 });
  mock.script(() => ({ error: { status: 429, type: 'rate_limit_error', message: 'Number of request tokens has exceeded your per-minute rate limit', retryAfter: 0 } }));
  await controller.start({ text: 'Add the cheapest one to the cart', windowId: 1 });
  const failed = lastTask();
  assert.equal(failed.status, 'error');
  assert.match(failed.error, /rate limit/);
  const before = mock.requests.length;
  mock.script(() => ({ answer: 'Added the Dell.' }));
  await controller.retry(failed.id, 1);
  assert.equal(lastTask().status, 'done');
  const body = mock.requests[before].body;
  assert.equal(body.messages.length, 3, 'the earlier task and the follow-up are both there');
  assert.match(JSON.stringify(body.messages[1]), /Dell S2721QS/);
  assert.match(JSON.stringify(body.messages[2]), /Add the cheapest one to the cart/);
  assert.equal(lastTask().contextReset, false, 'not a fresh start');
  // A finished task's Retry still runs it again from the start.
  mock.script(() => ({ answer: 'Again.' }));
  const n = mock.requests.length;
  await controller.retry(lastTask().id, 1);
  assert.equal(mock.requests[n].body.messages.length, 1);
});

test('F7: "Leave site?" is never accepted for the owner (their unsaved work stays)', async () => {
  const { controller } = await setup();
  controller.run = { approvals: new Approvals() };
  controller.driver.register({ id: 999, url: 'https://notes.example/draft' });
  assert.equal(controller.dialogPolicy('tab-1', { type: 'beforeunload', message: '' }), false);
  controller.run = null;
});

test('S12: when a page keeps hiding the control bar, the owner is told once', async () => {
  const { controller, mock, store, lastTask, waitFor } = await setup();
  await store.allowSiteAlways('shop.example');
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ hold: true })]);
  const running = controller.start({ text: 'Hold on', windowId: 1 });
  await waitFor(() => mock.requests.length === 2);
  controller.driver.onTamper('tab-1');
  controller.driver.onTamper('tab-1');
  const warns = lastTask().steps.filter((s) => s.kind === 'notice' && /hiding Jarvis's control bar/.test(s.label));
  assert.equal(warns.length, 1);
  await controller.stop('panel');
  await running;
});
