// Voice from Jarvis (v1.1): the real extension linked to a fake home base relay (the test server's
// /api/relay/*, as Core 1.3.0 answers), with Jarvis's end of the link played from Node
// (helpers/fake-relay.mjs: the same envelope, the same wire).
//
//   relay-open             Link from the panel; open beside Jarvis (placed, not focused, no
//                          debugger); an address that acts waits for a click on its card
//   relay-task-voice       a task from Jarvis runs, marked; refused with the switch off and at the
//                          daily cap; paused after 20 s without the relay
//   relay-approve-voice    a page step approved through the relay (voice approvals on, dev build)
//   relay-approve-refused  an approval for a purchase from Jarvis: refused, still open; the panel's
//                          click works
//   relay-replay           a replayed message (a start, a decision) is dropped
//   relay-approve-window   no side panel open: the question opens a small approval window

import { assert, tid, waitFor } from './harness.mjs';
import { createAppPeer, linkCode, newLinkKey } from '../helpers/fake-relay.mjs';

const read = { name: 'read_page', input: { filter: 'interactive' } };
const ref = (ctx, pattern) => ({ type: 'ref', ref: ctx.ref(pattern) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The task cards' "From Jarvis (voice)" chips, and the step labels of the last card. */
async function lastCardFrom(run) {
  return run.lastCard().locator(tid('task-from')).isVisible();
}

/** Every chrome.windows.update the service worker makes from now on (to check focus and bounds). */
async function recordWindowUpdates(run) {
  await run.sw.evaluate(() => {
    globalThis.__windowUpdates = [];
    const original = chrome.windows.update.bind(chrome.windows);
    chrome.windows.update = (id, props) => {
      globalThis.__windowUpdates.push({ id, props });
      return original(id, props);
    };
  });
  return () => run.sw.evaluate(() => globalThis.__windowUpdates);
}

const today = (run) => run.sw.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
});

// ---------------------------------------------------------------------------------------------

const relayOpen = {
  name: 'relay-open',
  title: 'Voice from Jarvis: Link in Settings; open beside Jarvis (placed, not focused, no debugger); an address that acts waits for a click',
  async run(run) {
    const p = run.panel;
    const { sites } = run.server;
    // Settings → Voice from Jarvis: a wrong code is refused; the link code links.
    await p.click(tid('open-settings'));
    const section = p.locator(tid('voice-from-jarvis'));
    await section.locator(tid('link-code')).waitFor();
    assert((await section.locator(tid('link-steps')).textContent()).includes('Settings → Jarvis for Chrome → Link → Copy link code'), 'the steps');
    await section.locator(tid('link-code')).fill('not a code');
    await section.locator(tid('link-button')).click();
    assert(/isn’t a link code from Jarvis/.test(await section.locator(tid('link-error')).textContent()), 'a wrong code is refused');
    const key = newLinkKey();
    await section.locator(tid('link-code')).fill(linkCode({ core: run.server.apiBase, key }));
    await section.locator(tid('link-button')).click();
    const app = await createAppPeer({ relay: run.server.relay, key });
    const hello = await app.waitFor((m) => m.kind === 'hello', { timeoutMs: 15000 });
    assert(hello.body.ext === 'jarvis-for-chrome' && hello.body.version === '1.1.0', JSON.stringify(hello.body));
    const stored = await run.sw.evaluate(() => chrome.storage.local.get(['chromeLink', 'jarvis.voice']));
    assert(stored.chromeLink?.key === key && stored.chromeLink.core === run.server.apiBase && stored.chromeLink.v === 1, 'the key in chrome.storage.local');
    assert(stored['jarvis.voice']?.tasksFromJarvis === true, 'Link turns Tasks from Jarvis on');
    assert((await app.request('ping')).ok === true, 'ping');
    await waitFor(async () => (await section.locator(tid('link-status')).textContent()) === 'Linked · online', { message: async () => `“Linked · online” (is “${await section.locator(tid('link-status')).textContent()}”)` });
    assert((await section.locator(tid('voice-approvals')).count()) === 0, 'Approve everyday steps by voice is hidden until its red-team round');
    await run.shot('1-linked');
    await p.click(tid('sheet-back'));

    // Open with a place (Optics or a tour on screen): the window goes there, isn't focused; no debugger.
    const updates = await recordWindowUpdates(run);
    const url = run.server.siteUrl('shop', '/product/dell-s2721qs');
    const rect = { left: 60, top: 40, width: 640, height: 480 };
    const r = await app.request('open', { url, rect, focus: false });
    assert(r.ok === true && r.url === url && r.site === 'shop.localhost', `opened (${JSON.stringify(r)})`);
    const tabs = await run.sw.evaluate(async (u) => (await chrome.tabs.query({})).filter((t) => (t.pendingUrl || t.url) === u).map((t) => ({ id: t.id, windowId: t.windowId })), url);
    assert(tabs.length === 1, `one tab for it (${JSON.stringify(tabs)})`);
    assert((await run.attachedTabs()).length === 0, 'no debugger on it');
    const u1 = await updates();
    assert(u1.some((x) => x.props.left === 60 && x.props.top === 40 && x.props.width === 640 && x.props.height === 480 && x.props.state === 'normal'), `placed (${JSON.stringify(u1)})`);
    assert(!u1.some((x) => x.props.focused === true), 'not focused with a place');
    const win = await run.sw.evaluate((id) => chrome.windows.get(id), tabs[0].windowId);
    assert(Math.abs(win.width - 640) <= 16 && Math.abs(win.height - 480) <= 16, `the window's size (${win.width}x${win.height})`);
    // Without a place it is focused.
    await app.request('open', { url: run.server.siteUrl('shop', '/'), rect: null, focus: true });
    assert((await updates()).some((x) => x.props.focused === true), 'focused without a place');
    // Refused: Chrome's pages, a user name in the address.
    for (const bad of ['chrome://settings', 'http://user:pw@shop.localhost/']) {
      const no = await app.request('open', { url: bad, rect: null, focus: true });
      assert(no.ok === false && no.reason === 'blocked' && no.why, `${bad}: ${JSON.stringify(no)}`);
    }

    // An address that does something: nothing is sent to it until the owner clicks its card.
    const acting = run.server.siteUrl('evil', '/orders/7/cancel');
    const hits = () => sites.state.hits['evil.localhost'] || 0;
    const wait = await app.request('open', { url: acting, rect: null, focus: true });
    assert(wait.ok === false && wait.reason === 'needs-click', JSON.stringify(wait));
    const card = p.locator(tid('open-card'));
    await card.waitFor();
    assert((await card.locator(tid('open-card-address')).textContent()) === acting, 'the whole address on the card');
    await sleep(500);
    assert(hits() === 0, 'nothing sent before the click');
    await run.shot('2-card');
    await card.locator(tid('open-card-choice', '[data-choice="open"]')).click();
    await waitFor(() => hits() > 0, { message: 'opened after the click' });
    await card.waitFor({ state: 'detached' });
    assert((await run.attachedTabs()).length === 0, 'still no debugger');
  },
};

// ---------------------------------------------------------------------------------------------

const relayTaskVoice = {
  name: 'relay-task-voice',
  title: 'Voice from Jarvis: a task from Jarvis runs, marked; refused when off and at 30 a day; paused after 20 s without the relay',
  start: { link: {} },
  async run(run) {
    const { mock, relay } = run.server;
    const app = run.app;
    mock.script([() => ({ update: 'Reading the shop.', calls: [read] }), () => ({ answer: 'The Dell S2721QS is **$279.99**.' })]);
    const r = await app.request('start', { text: 'What does the Dell monitor cost on shop.localhost?', chat: 'new', from: 'voice' });
    assert(r.ok === true && /^task_/.test(r.id), JSON.stringify(r));
    await run.decide('site', 'once');
    const done = await app.waitFor((m) => m.kind === 'done', { timeoutMs: 30000 });
    assert(done.body.id === r.id && done.body.status === 'done' && /\$279\.99/.test(done.body.answer), JSON.stringify(done.body));
    await run.waitStatus('done');
    assert(await lastCardFrom(run), 'the card says From Jarvis (voice)');
    assert(app.of('task').length >= 1 && app.of('task').every((m) => m.body.id === r.id && !JSON.stringify(m.body).includes('data:image')), 'task updates, no pictures');
    assert(app.of('prompt').some((m) => m.body.kind === 'site' && m.body.spoken === 'Jarvis for Chrome asks to work on shop.localhost.'), 'the site question went to Jarvis with its spoken line');
    await run.shot('1-done');

    // Tasks from Jarvis off (the panel's switch): refused.
    await run.panel.click(tid('open-settings'));
    await run.panel.locator(tid('voice-tasks')).waitFor();
    await run.panel.locator(tid('voice-from-jarvis')).locator('label.toggle').first().click();
    await waitFor(async () => (await run.sw.evaluate(() => chrome.storage.local.get('jarvis.voice')))['jarvis.voice']?.tasksFromJarvis === false, { message: 'the switch saved' });
    const off = await app.request('start', { text: 'Find a monitor', chat: 'new', from: 'voice' });
    assert(off.ok === false && off.reason === 'off', JSON.stringify(off));
    await run.panel.locator(tid('voice-from-jarvis')).locator('label.toggle').first().click();
    await run.panel.click(tid('sheet-back'));

    // At the daily cap: refused.
    const day = await today(run);
    await run.sw.evaluate((d) => chrome.storage.local.set({ 'jarvis.voiceTasks': { day: d, count: 30 } }), day);
    const cap = await app.request('start', { text: 'Find a monitor', chat: 'new', from: 'voice' });
    assert(cap.ok === false && cap.reason === 'cap', JSON.stringify(cap));
    await run.sw.evaluate((d) => chrome.storage.local.set({ 'jarvis.voiceTasks': { day: d, count: 1 } }), day);

    // The relay goes away during a task from Jarvis: within about 20 s it pauses (as Take over).
    mock.script([() => ({ hold: true })]);
    const r2 = await app.request('start', { text: 'Keep looking at shop.localhost', chat: 'same', from: 'voice' });
    assert(r2.ok === true, JSON.stringify(r2));
    await run.waitStatus('running');
    relay.down = true;
    const t0 = Date.now();
    await run.waitStatus('paused', 45000);
    // (20 s after the last answer from the home base: the poll in flight then was up to 10 s old.)
    const took = Date.now() - t0;
    assert(took >= 8000, `paused only after the relay was gone a while (${took} ms)`);
    const steps = await run.steps();
    assert(steps.some((s) => /^Paused: Jarvis for Chrome couldn’t reach your home base for 20 seconds/.test(s.label)), steps.map((s) => s.label).join(' | '));
    await run.shot('2-paused');
    // The panel's Stop always works.
    await run.panel.click(tid('stop'));
    await run.waitStatus('stopped');
    relay.down = false;
  },
};

// ---------------------------------------------------------------------------------------------

/** A task from Jarvis on shop.localhost (set to Always) that comes to a click on `button`. */
async function startStep(run, button) {
  const { mock } = run.server;
  const product = run.server.siteUrl('shop', '/product/dell-s2721qs');
  mock.script([
    () => ({ calls: [{ name: 'navigate', input: { url: product } }, read] }),
    (ctx) => ({ calls: [{ name: 'left_click', input: { target: ref(ctx, new RegExp(`button "${button}"`)) } }] }),
    (ctx) => ({ answer: ctx.results[0]?.isError ? 'It was not done.' : 'Done.' }),
  ]);
  const r = await run.app.request('start', { text: `${button} the Dell monitor on shop.localhost`, chat: 'new', from: 'voice' });
  assert(r.ok === true, JSON.stringify(r));
  const prompt = await run.app.waitFor((m) => m.kind === 'prompt' && m.body.kind === 'confirm', { timeoutMs: 30000, what: 'the step’s prompt' });
  await run.lastCard().locator(tid('prompt')).waitFor();
  return { id: r.id, prompt: prompt.body };
}

const relayApproveVoice = {
  name: 'relay-approve-voice',
  title: 'Voice from Jarvis: an everyday page step on an Always site approved through the relay; once; the step list says so',
  start: { link: { approvals: true }, always: ['shop.localhost'], approveSteps: false },
  async run(run) {
    const { sites } = run.server;
    const { prompt } = await startStep(run, 'Add to cart');
    assert(prompt.category === 'change' && prompt.consequential === false, JSON.stringify(prompt));
    assert(prompt.voice.allowed === true, `voice may answer it (${JSON.stringify(prompt.voice)})`);
    assert(prompt.spoken === 'Jarvis for Chrome wants to click on shop.localhost. The button says “Add to cart”.', prompt.spoken);
    const status = app => app.of('status').at(-1)?.body;
    assert(status(run.app)?.voiceApprovals === true, 'the status says voice approvals are on');
    // At once: too soon (the prompt stays).
    const soon = await run.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'voice' });
    assert(soon.ok === false && soon.reason === 'refused', JSON.stringify(soon));
    assert(await run.lastCard().locator(tid('prompt')).isVisible(), 'still open');
    await sleep(1600);
    const yes = await run.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'voice' });
    assert(yes.ok === true && yes.promptId === prompt.promptId, JSON.stringify(yes));
    await run.app.waitFor((m) => m.kind === 'prompt-closed' && m.body.promptId === prompt.promptId && m.body.how === 'voice');
    await run.app.waitFor((m) => m.kind === 'done', { timeoutMs: 30000 });
    assert(sites.state.cart.length === 1 && sites.state.cart[0] === 'dell-s2721qs', `in the cart once (${JSON.stringify(sites.state.cart)})`);
    const steps = await run.steps();
    assert(steps.some((s) => s.label === 'Approved by voice from Jarvis: “Approve” (page step on shop.localhost).'), steps.map((s) => s.label).join(' | '));
    assert(steps.some((s) => /^Clicked "Add to cart"/.test(s.label)), 'the click');
    await run.shot('done');
    // The same decision again finds nothing open.
    const again = await run.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via: 'voice' });
    assert(again.ok === false && again.reason === 'gone', JSON.stringify(again));
  },
};

const relayApproveRefused = {
  name: 'relay-approve-refused',
  title: 'Voice from Jarvis: approving a purchase from Jarvis is refused and the card stays; the panel’s click works',
  start: { link: { approvals: true }, always: ['shop.localhost'], approveSteps: false },
  async run(run) {
    const { sites } = run.server;
    const { prompt } = await startStep(run, 'Buy now');
    assert(prompt.consequential === true && prompt.category === 'purchase', JSON.stringify(prompt));
    assert(prompt.voice.allowed === false && prompt.voice.why === 'That needs a click in the Jarvis window.', JSON.stringify(prompt.voice));
    await sleep(1600);
    for (const via of ['voice', 'card']) {
      const no = await run.app.request('answer', { promptId: prompt.promptId, hash: prompt.hash, choice: 'approve', via });
      assert(no.ok === false && no.reason === 'refused' && no.why === 'That needs a click in the Jarvis window.', JSON.stringify(no));
    }
    await sleep(300);
    const card = run.lastCard().locator(tid('prompt'));
    assert(await card.isVisible(), 'the card is still open');
    assert((await card.getAttribute('data-prompt-id')) === prompt.promptId, 'the same card');
    assert(sites.state.orders.length === 0, 'no order');
    await run.shot('refused');
    await run.decide('confirm', 'approve');
    await run.app.waitFor((m) => m.kind === 'prompt-closed' && m.body.promptId === prompt.promptId && m.body.how === 'clicked');
    await run.app.waitFor((m) => m.kind === 'done', { timeoutMs: 30000 });
    assert(sites.state.orders.length === 1, `the click placed the order (${sites.state.orders.length})`);
  },
};

// ---------------------------------------------------------------------------------------------

const relayReplay = {
  name: 'relay-replay',
  title: 'Voice from Jarvis: a replayed start or decision, or a stale one, is dropped without a word',
  start: { link: {}, approveSteps: false },
  async run(run) {
    const { mock, relay } = run.server;
    const app = run.app;
    mock.script([() => ({ hold: true })]);
    const start = await app.post('start', { text: 'Look around shop.localhost', chat: 'new', from: 'voice' });
    await app.waitFor((m) => m.kind === 'reply' && m.body.re === start.id);
    await run.waitStatus('running');
    // The same envelope again: dropped (no reply, no second task).
    relay.put('to-ext', { id: start.id, iv: start.iv, ct: start.ct });
    await sleep(1500);
    await app.poll();
    assert(app.received.filter((m) => m.kind === 'reply' && m.body.re === start.id).length === 1, 'one reply');
    assert((await run.panel.locator(tid('task-card')).count()) === 1, 'one task');
    // A stop, replayed after a new task started, must not stop it.
    const stop = await app.post('stop', {});
    await app.waitFor((m) => m.kind === 'reply' && m.body.re === stop.id && m.body.ok === true);
    await run.waitStatus('stopped');
    mock.script([() => ({ hold: true })]);
    const r = await app.request('start', { text: 'Look again', chat: 'same', from: 'voice' });
    assert(r.ok === true, JSON.stringify(r));
    await run.waitStatus(['running', 'waiting']);
    relay.put('to-ext', { id: stop.id, iv: stop.iv, ct: stop.ct });
    await sleep(1500);
    assert(['running', 'waiting'].includes(await run.status()), `the replayed stop did nothing (${await run.status()})`);
    // Too old (sent more than 120 s ago): dropped.
    const old = await app.post('stop', {}, { at: Date.now() - 125000 });
    await sleep(1500);
    await app.poll();
    assert(!app.received.some((m) => m.kind === 'reply' && m.body.re === old.id), 'no reply to a stale message');
    assert(['running', 'waiting'].includes(await run.status()), 'still running');
    await run.panel.click(tid('stop'));
    await run.waitStatus('stopped');
  },
};

// ---------------------------------------------------------------------------------------------

const relayApproveWindow = {
  name: 'relay-approve-window',
  title: 'Voice from Jarvis: with no side panel open, a question that needs a click opens a small approval window; its answer works',
  start: { link: {}, approveSteps: false },
  async run(run) {
    const { mock } = run.server;
    // No side panel: the owner is across the room, Jarvis is in the other profile.
    await run.panel.close();
    run.panel = null;
    mock.script([() => ({ calls: [read] }), () => ({ answer: 'Looked.' })]);
    const opened = run.context.waitForEvent('page', { predicate: (pg) => pg.url().includes('approve.html'), timeout: 20000 });
    const r = await run.app.request('start', { text: 'Look at shop.localhost', chat: 'new', from: 'voice' });
    assert(r.ok === true, JSON.stringify(r));
    const win = await opened;
    run.watchPage(win, 'panel');
    await win.locator(tid('prompt')).waitFor();
    assert((await win.locator(tid('prompt')).getAttribute('data-kind')) === 'site', 'the site question');
    assert((await win.locator(tid('approve-task')).textContent()) === 'Look at shop.localhost', 'names the task');
    const type = await run.sw.evaluate(async () => (await chrome.windows.getAll({ populate: true })).find((w) => w.tabs.some((t) => /approve\.html/.test(t.url || '')))?.type);
    assert(type === 'popup', `a small window of its own (${type})`);
    await run.shot('window', win);
    await win.locator(tid('prompt-choice', '[data-choice="once"]')).click();
    const done = await run.app.waitFor((m) => m.kind === 'done', { timeoutMs: 30000 });
    assert(done.body.status === 'done', JSON.stringify(done.body));
    // Nothing waits any more: the window goes by itself.
    await waitFor(() => win.isClosed(), { timeout: 10000, message: 'the approval window closed' });
  },
};

export const RELAY_SCENARIOS = [relayOpen, relayTaskVoice, relayApproveVoice, relayApproveRefused, relayReplay, relayApproveWindow];
