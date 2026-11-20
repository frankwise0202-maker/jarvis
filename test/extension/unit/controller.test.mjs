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
void Approvals;

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
  assert.match(p.body, /Click "Place order" \(a button\) on shop\.example\. This looks like a purchase or payment/);
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

test('JS dialogs: alerts are accepted, prompt() and "Leave site?" never; every confirm() is answered Cancel at once and put to the owner (RT2-A07, RT3-09)', async () => {
  const { controller, mock, store, lastTask, waitFor } = await setup();
  await store.allowSiteAlways('shop.example');
  assert.equal(controller.dialogPolicy('tab-1', { type: 'confirm', message: 'Are you sure?' }), false, 'no task: dismissed');
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ hold: true })]);
  const running = controller.start({ text: 'Hold on', windowId: 1 });
  await waitFor(() => mock.requests.length === 2);
  const run = controller.run;
  assert.equal(controller.dialogPolicy('tab-1', { type: 'alert', message: 'Saved.' }), true);
  assert.equal(controller.dialogPolicy('tab-1', { type: 'prompt', message: 'Name?' }), false);
  assert.equal(controller.dialogPolicy('tab-1', { type: 'beforeunload', message: '' }), false);
  // A stored request_confirmation approval is never used up by a page's question (it used to be
  // for a confirm() whose text Jarvis did not recognise: an approved post deleted an account).
  const t = controller.driver.get('tab-1');
  run.approvals.grant({ category: 'post', site: 'shop.example', tabId: 'tab-1', url: t.url, doc: t.docSeq, targetId: 5, ctx: '', selection: '0|', text: 'Post the status' });
  const ask = async (message, choice) => {
    // The page is never held waiting for the owner (its own dialog would freeze Jarvis's bar and
    // Esc): Cancel at once, and the owner is asked once the step is done (the executor).
    const answer = controller.dialogPolicy('tab-1', { type: 'confirm', message });
    assert.deepEqual(answer, { accept: false, deferred: true }, 'answered Cancel at once, left for the owner');
    const asked = controller.askDialog(run, { toolId: 'tab-1', message }, { doing: 'Clicking "Remove"', rerun: true });
    const p = await waitFor(() => lastTask()?.prompt);
    controller.decide(p.id, choice);
    return { ok: await asked, p };
  };
  const a = await ask('Are you sure?', 'cancel');
  assert.equal(a.ok, false, 'Cancel answers Cancel');
  assert.equal(a.p.kind, 'confirm');
  assert.match(a.p.body, /^The page shop\.example asks: “Are you sure\?” \(as Jarvis was clicking "Remove"\)/);
  assert.equal(run.approvals.live().length, 1, 'the approval was not used up');
  const b = await ask('Place your order for $279.99?', 'approve');
  assert.equal(b.ok, true, 'Approve answers OK');
  assert.equal(b.p.category, 'purchase');
  // The owner's OK stands for that same question on that tab, once (Jarvis does the step again).
  controller.policy(run).preApproveDialog({ toolId: 'tab-1', message: 'Place your order for $279.99?' });
  assert.deepEqual(controller.dialogPolicy('tab-1', { type: 'confirm', message: 'Place your order for $9,999?' }), { accept: false, deferred: true }, 'another question is not covered');
  assert.deepEqual(controller.dialogPolicy('tab-1', { type: 'confirm', message: 'Place your order for $279.99?' }), { accept: true, asked: true });
  assert.deepEqual(controller.dialogPolicy('tab-1', { type: 'confirm', message: 'Place your order for $279.99?' }), { accept: false, deferred: true }, 'once');
  // Declined kinds are refused without asking again.
  const c = await ask('Delete this file?', 'cancel');
  assert.equal(c.ok, false);
  assert.equal(controller.dialogPolicy('tab-1', { type: 'confirm', message: 'Delete everything?' }), false, 'declined: no second question');
  assert.equal(run.approvals.live().length, 1, 'the approval was never used up');
  await controller.stop('panel');
  await running;
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
  assert.match(prompts[0], /Click "Buy now" \(a button\) on shop\.example\/product\/dell\. This looks like a purchase or payment/);
  // 2. request_confirmation for the Dell's Buy now, then Buy now on the LG: asked again.
  fb.orders = [];
  prompts.length = 0;
  mock.script([
    open('dell'),
    (ctx) => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Buy the Dell S2721QS for $279.99 with Buy now', category: 'purchase', target: { type: 'ref', ref: ctx.ref(/Buy now/) } } }] }),
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
    () => ({ calls: [{ name: 'request_confirmation', custom: true, input: { action: 'Sign you up for the free weekly deals newsletter', category: 'purchase', target: { type: 'ref', ref: 'ref_1' } } }] }),
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

// ---------------------------------------------------------------------------------------------
// Second review: downloads (RT2-A02/T7), one prompt at a time, page loads while Jarvis acts
// (RT2-A14/A15), Stop that never unwinds (T11)

test('RT2-A02/T7: a download a page starts while a task runs is held until the owner decides; Cancel and Stop cancel it', async () => {
  const { controller, mock, store, lastTask, waitFor, fb } = await setup();
  const cancelled = [];
  fb.chrome.downloads = { cancel: async (id) => void cancelled.push(id) };
  await store.allowSiteAlways('shop.example');
  // No task: the owner's own downloads are left alone (Chrome is not held).
  assert.equal(controller.holdDownload({ id: 1, url: 'https://shop.example/a.pdf', filename: 'a.pdf' }, () => assert.fail('suggest')), false);
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ hold: true })]);
  const running = controller.start({ text: 'Hold on', windowId: 1 });
  await waitFor(() => mock.requests.length === 2);
  const answered = [];
  const hold = (item) => controller.holdDownload(item, () => answered.push(item.id));
  assert.equal(hold({ id: 7, url: 'https://dl.example/get/mac', finalUrl: 'https://dl.example/files/JarvisHelper.dmg', filename: 'JarvisHelper.dmg', totalBytes: 4096 }), true, 'held: Chrome writes nothing yet');
  let p = await waitFor(() => lastTask()?.prompt);
  assert.deepEqual([p.kind, p.category, p.title, p.consequential], ['confirm', 'download', 'Save this download?', true]);
  assert.match(p.body, /^Save the file “JarvisHelper\.dmg” \(a \.dmg file, 4 KB\) from dl\.example\?/);
  assert.match(p.body, /A \.dmg file can run programs on your Mac\./);
  assert.deepEqual(answered, []);
  controller.decide(p.id, 'cancel');
  await waitFor(() => answered.length === 1);
  assert.deepEqual(cancelled, [7], 'Cancel: the download is cancelled, nothing saved');
  hold({ id: 8, url: 'https://dl.example/files/report.pdf', filename: 'report.pdf', totalBytes: 2 * 1024 * 1024 });
  p = await waitFor(() => lastTask()?.prompt);
  assert.match(p.body, /“report\.pdf” \(a PDF document, 2\.0 MB\)/);
  controller.decide(p.id, 'approve');
  await waitFor(() => answered.length === 2);
  assert.deepEqual(cancelled, [7], 'Approve: saved');
  hold({ id: 9, url: 'https://dl.example/files/x.zip', filename: 'x.zip' });
  await waitFor(() => lastTask()?.prompt);
  await controller.stop('panel');
  await running;
  await waitFor(() => answered.length === 3);
  assert.deepEqual(cancelled, [7, 9], 'Stop: the held download is cancelled');
  const notes = lastTask().steps.filter((s) => s.kind === 'notice').map((s) => s.label);
  assert.ok(notes.some((l) => /did not save “JarvisHelper\.dmg”/.test(l)));
  assert.ok(notes.some((l) => /Saved “report\.pdf”/.test(l)));
  assert.equal(hold({ id: 10, url: 'https://x.example/y.pdf' }), false, 'after the task: left alone');
});

test('RT2-A02: a download the owner approved a moment ago (its link or address) is not asked about twice', async () => {
  const { controller, mock, store, lastTask, waitFor, fb } = await setup();
  fb.chrome.downloads = { cancel: async () => {} };
  await store.allowSiteAlways('shop.example');
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ hold: true })]);
  const running = controller.start({ text: 'Hold on', windowId: 1 });
  await waitFor(() => mock.requests.length === 2);
  controller.run.policy.allowDownload({ url: 'https://dl.example/files/Setup.dmg', site: 'dl.example' });
  let answered = 0;
  assert.equal(controller.holdDownload({ id: 3, url: 'https://dl.example/files/Setup.dmg', filename: 'Setup.dmg' }, () => answered++), true);
  await waitFor(() => answered === 1);
  assert.equal(lastTask().prompt, null, 'no second question');
  // Used up: the next one asks.
  controller.holdDownload({ id: 4, url: 'https://dl.example/files/Setup.dmg', filename: 'Setup.dmg' }, () => answered++);
  const p = await waitFor(() => lastTask()?.prompt);
  assert.equal(p.category, 'download');
  await controller.stop('panel');
  await running;
});

test('prompts come one at a time: a download that starts while the owner decides something else is asked after', async () => {
  const { controller, mock, store, lastTask, waitFor, fb } = await setup();
  fb.chrome.downloads = { cancel: async () => {} };
  await store.allowSiteAlways('shop.example');
  mock.script([
    () => ({ calls: [{ name: 'read_page', input: {} }] }),
    (ctx) => ({ calls: [{ name: 'left_click', input: { target: { type: 'ref', ref: ctx.ref(/Place order/) } } }] }),
    () => ({ hold: true }),
  ]);
  const running = controller.start({ text: 'Order it', windowId: 1 });
  const first = await waitFor(() => lastTask()?.prompt);
  assert.match(first.body, /Place order/);
  let answered = 0;
  controller.holdDownload({ id: 5, url: 'https://shop.example/invoice.pdf', filename: 'invoice.pdf' }, () => answered++);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(lastTask().prompt.id, first.id, 'the first question stays on screen');
  controller.decide(first.id, 'cancel');
  const second = await waitFor(() => (lastTask()?.prompt?.id !== first.id ? lastTask()?.prompt : null));
  assert.equal(second.category, 'download');
  controller.decide(second.id, 'cancel');
  await waitFor(() => answered === 1);
  await controller.stop('panel');
  await running;
});

test('RT2-A14/A15: while Jarvis acts, its tab cannot load an address the owner declined or a denied site; a new site is asked first', async () => {
  const { controller, mock, store, lastTask, waitFor, fb, tab } = await setup();
  await store.allowSiteAlways('shop.example');
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ hold: true })]);
  const running = controller.start({ text: 'Hold on', windowId: 1 });
  await waitFor(() => mock.requests.length === 2);
  const run = controller.run;
  assert.equal(await controller.navigationPolicy('tab-1', 'https://shop.example/cart'), true, 'an allowed site loads');
  run.approvals.decline('delete', 'shop.example', { href: 'https://shop.example/act/delete?id=1' });
  // (A load the driver stops is { allow: false, notice }.)
  const allowed = (v) => v === true || v?.allow === true;
  assert.equal(allowed(await controller.navigationPolicy('tab-1', 'https://shop.example/act/delete?id=1')), false, 'a declined address does not');
  run.sitesDenied.add('bank.example');
  assert.equal(allowed(await controller.navigationPolicy('tab-1', 'https://bank.example/act/transfer?to=x')), false, 'a denied site does not');
  const asking = controller.navigationPolicy('tab-1', 'https://news.example/story');
  const p = await waitFor(() => lastTask()?.prompt);
  assert.deepEqual([p.kind, p.site], ['site', 'news.example']);
  controller.decide(p.id, 'deny');
  assert.equal(allowed(await asking), false);
  // The same check on the tab's own document loads (Fetch interception), end to end.
  const before = fb.calls.length;
  fb.emit(tab, 'Fetch.requestPaused', { requestId: 'r1', frameId: `F${tab.id}`, resourceType: 'Document', request: { url: 'https://bank.example/act/transfer?to=x' } });
  fb.emit(tab, 'Fetch.requestPaused', { requestId: 'r2', frameId: `F${tab.id}`, resourceType: 'Document', request: { url: 'https://shop.example/cart' } });
  await waitFor(() => fb.calls.slice(before).filter((c) => /^Fetch\.(fail|continue)Request$/.test(c.method)).length === 2);
  const answers = Object.fromEntries(fb.calls.slice(before).filter((c) => /^Fetch\./.test(c.method)).map((c) => [c.params.requestId, c.method]));
  assert.deepEqual(answers, { r1: 'Fetch.failRequest', r2: 'Fetch.continueRequest' });
  await controller.stop('panel');
  await running;
});

test('T11: Stop ends a task stuck in a call that never returns; the next task starts', async () => {
  const { controller, mock, store, lastTask, waitFor, fb } = await setup();
  await store.allowSiteAlways('shop.example');
  const approveAll = setInterval(() => {
    const p = lastTask()?.prompt;
    if (p && p.kind === 'confirm') controller.decide(p.id, 'approve');
  }, 10);
  try {
    // 1. Chrome never finishes closing a tab that asked "Leave site?".
    let removing = 0;
    fb.chrome.tabs.remove = () => (removing++, new Promise(() => {}));
    mock.script([() => ({ calls: [{ name: 'list_tabs', input: {} }] }), () => ({ calls: [{ name: 'close_tab', input: { tab_id: 'tab-1' } }] }), () => ({ answer: 'Closed.' })]);
    const running = controller.start({ text: 'Close it', windowId: 1 });
    await waitFor(() => removing === 1, 6000);
    await controller.stop('panel');
    await waitFor(() => controller.run === null, 1500);
    assert.equal(lastTask().status, 'stopped');
    // 2. A call that ignores Stop altogether.
    mock.script([() => ({ calls: [{ name: 'close_tab', input: { tab_id: 'tab-1' } }] }), () => ({ answer: 'Closed.' })]);
    const hung = controller.driver.closeTab;
    let stuck = 0;
    controller.driver.closeTab = () => (stuck++, new Promise(() => {}));
    const second = controller.start({ text: 'Close it again', windowId: 1 });
    await waitFor(() => stuck === 1, 4000);
    const t0 = Date.now();
    await controller.stop('panel');
    assert.ok(Date.now() - t0 < 2500, 'Stop returns');
    assert.equal(controller.run, null, 'Jarvis is free');
    assert.equal(lastTask().status, 'stopped');
    controller.driver.closeTab = hung;
    void second;
    void running;
    mock.script([() => ({ answer: 'Hello again.' })]);
    await controller.start({ text: 'Say hello', windowId: 1 });
    assert.equal(lastTask().status, 'done', 'the next task runs (its request carries a result for the stuck call)');
    assert.equal(lastTask().answer, 'Hello again.');
  } finally {
    clearInterval(approveAll);
  }
});
