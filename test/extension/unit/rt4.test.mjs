// The round-4 review (RT4-01 … RT4-04, RT4C-01 … RT4C-05): the real Driver + Executor over the
// fake CDP/tabs layer (helpers/fake-chrome.mjs), the pure action rules, and the controller's
// page-load, cross-site and control-bar policies. Each test fails on the code before the fixes,
// for the reason its finding names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBrowser, fakeEncoder } from '../helpers/fake-chrome.mjs';
import { createClaudeMock, TEST_API_KEY } from '../mock/claude-mock.mjs';
import { Driver } from '../../../extension/src/background/driver.js';
import { Executor } from '../../../extension/src/background/executor.js';
import { Controller, fileKind, shortFileName } from '../../../extension/src/background/controller.js';
import { createClient } from '../../../extension/src/background/api.js';
import { createStore } from '../../../extension/src/shared/storage.js';
import { PORT_NAME } from '../../../extension/src/shared/protocol.js';
import { assessClick, formSubmission, keyDestination, plainLinkDestination, targetElsewhere } from '../../../extension/src/background/actions.js';
import { parseKeys } from '../../../extension/src/background/keys.js';
import { siteOf } from '../../../extension/src/background/sites.js';
import { stepLabel } from '../../../extension/src/background/labels.js';
import { textHost } from '../../../extension/src/sidepanel/markdown.js';

const text = (r) => (typeof r.result.content === 'string' ? r.result.content : r.result.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
const ref = (n) => ({ type: 'ref', ref: `ref_${n}` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The executor over the fake browser; `site(url)` decides site permission, `guard(c)` the owner's answer to a step. */
function setup({ url = 'https://blog.example/news', page, site = () => null, guard = () => null, extra = {} } = {}) {
  const fb = createFakeBrowser();
  const tab = fb.addTab({ url, page });
  const driver = new Driver({ chrome: fb.chrome, pageSource: '/* page agent */' });
  fb.onCdpEvent = (tabId, method, params, sessionId) => driver.onCdpEvent(tabId, method, params, sessionId);
  driver.enable();
  driver.activeToolId = driver.register({ id: tab.id, url, title: tab.title, windowId: 1 });
  const asked = [];
  const blocked = [];
  const policy = {
    checkSite: async (u) => {
      asked.push(['site', u]);
      return site(u);
    },
    confirmGuard: async (c) => {
      asked.push(['guard', c]);
      return guard(c);
    },
    onBlocked: (t) => blocked.push(t),
    ...extra,
  };
  const ex = new Executor({ driver, encoder: fakeEncoder, policy });
  let n = 0;
  const call = (name, input = {}) => ex.run({ type: 'tool_use', id: `toolu_${++n}`, name, toolset_name: 'browser', input }, { signal: new AbortController().signal, stepId: `s${n}` });
  /** A frame from another site with its own session (as Chrome's auto-attach reports it). */
  const frame = (frameId, frameUrl, sessionId = 'S1') => {
    tab.childFrames = [...(tab.childFrames || []), { sessionId, url: frameUrl }];
    fb.emit(tab, 'Target.attachedToTarget', { sessionId, targetInfo: { targetId: frameId, type: 'iframe', url: frameUrl } });
  };
  const presses = () => fb.calls.filter((c) => c.method === 'Input.dispatchMouseEvent' && c.params.type === 'mousePressed');
  return { fb, tab, driver, ex, call, asked, blocked, frame, presses, guards: () => asked.filter((a) => a[0] === 'guard').map((a) => a[1]), sites: () => asked.filter((a) => a[0] === 'site').map((a) => a[1]) };
}

// ---------------------------------------------------------------------------------------------
// RT4-01: a frame at the press point is a box from another site, whatever element holds it

test('RT4-01: a plain same-site link the browser hit-tests into another site\'s frame is a step into that box: its site is asked for (denied: nothing is pressed), and the owner approves the box', async () => {
  const page = { elements: [{ role: 'link', name: 'Read the full story', x: 0, y: 0, w: 320, h: 48, desc: { tag: 'a', href: 'https://blog.example/article/2' }, frameAt: 'FR1' }] };
  // The owner denies the box's site: nothing is pressed.
  const a = setup({ page, site: (u) => (siteOf(u) === 'shop.example' ? 'Error: the owner did not allow Jarvis to work on shop.example.' : null) });
  await a.call('read_page', {});
  a.frame('FR1', 'https://shop.example/buybox');
  const r = await a.call('left_click', { target: ref(1) });
  assert.equal(r.result.is_error, true);
  assert.match(text(r), /did not allow Jarvis to work on shop\.example/);
  assert.equal(a.sites().map(siteOf).at(-1), 'shop.example', 'the box\'s own site was asked for');
  assert.equal(a.presses().length, 0, 'nothing was pressed');
  // The owner allows it: the step is asked as a box from that site (never as a plain link).
  const b = setup({ page });
  await b.call('read_page', {});
  b.frame('FR1', 'https://shop.example/buybox');
  const r2 = await b.call('left_click', { target: ref(1) });
  assert.ok(!r2.result.is_error, text(r2));
  assert.deepEqual(b.guards().map((g) => [g.category, g.label]), [['frame', 'a box from shop.example']]);
  assert.deepEqual(b.fb.framePresses, ['Read the full story'], 'the approved press went into the box');
});

test('RT4-01: a press the page never sees reach the element (it went where Jarvis cannot check) fails the step, and the owner is told', async () => {
  const page = { elements: [{ role: 'link', name: 'Read the full story', x: 0, y: 0, w: 320, h: 48, desc: { tag: 'a', href: 'https://blog.example/article/2' }, swallow: true }] };
  const s = setup({ page });
  await s.call('read_page', {});
  const r = await s.call('left_click', { target: ref(1) });
  assert.equal(r.result.is_error, true);
  assert.match(text(r), /the press never reached the element Jarvis checked/);
  assert.ok(s.blocked.some((t) => /could not confirm where its click landed/.test(t)), JSON.stringify(s.blocked));
});

test('RT4-01/02: a link or button that holds a frame is never a plain link or an everyday step', () => {
  const link = { tag: 'a', role: 'link', name: 'Read the full story', href: 'https://blog.example/article/2' };
  assert.equal(plainLinkDestination(link, 'https://blog.example/news'), 'https://blog.example/article/2', 'an ordinary link is plain');
  assert.equal(plainLinkDestination({ ...link, containsFrame: true }, 'https://blog.example/news'), '');
  assert.equal(assessClick({ desc: { ...link, containsFrame: true }, pageUrl: 'https://blog.example/news' }).verdict, 'ask');
  const more = { tag: 'button', role: 'button', name: 'Show more', inPagination: true };
  assert.equal(assessClick({ desc: more, pageUrl: 'https://blog.example/news', everyday: true }).verdict, 'allow', 'an everyday "Show more"');
  assert.equal(assessClick({ desc: { ...more, containsFrame: true }, pageUrl: 'https://blog.example/news', everyday: true }).verdict, 'ask');
  assert.equal(assessClick({ desc: { tag: 'object', role: 'button', name: 'Next', inPagination: true, iframe: { src: 'https://shop.example/buybox', tag: 'object' }, crossOrigin: true }, pageUrl: 'https://blog.example/news', everyday: true }).verdict, 'ask');
});

// ---------------------------------------------------------------------------------------------
// RT4-02: <object> and <embed> showing a page are frames, wherever the driver looks

test('RT4-02: the driver follows <object> and <embed> frames by their frame id (a point in one, the focus in one), not by tag', async () => {
  const page = {
    elements: [
      { role: 'iframe', name: 'Offer', x: 0, y: 0, w: 300, h: 60, focusable: true, desc: { tag: 'object', iframe: { src: 'https://shop.example/buybox', tag: 'object' }, crossOrigin: true, frameId: 'FO' } },
      { role: 'iframe', name: 'Widget', x: 0, y: 100, w: 300, h: 60, focusable: true, desc: { tag: 'embed', iframe: { src: 'https://pay.example/w', tag: 'embed' }, crossOrigin: true, frameId: 'FE' } },
    ],
  };
  const s = setup({ page });
  await s.call('read_page', {});
  s.frame('FO', 'https://shop.example/buybox', 'S1');
  s.frame('FE', 'https://pay.example/w', 'S2');
  const t = s.driver.get('tab-1');
  const at = await s.driver.frameChainAt(t, 10, 10);
  assert.deepEqual(at.map((f) => [f.frameId, f.site]), [['FO', 'shop.example']]);
  s.tab.page.focus = s.tab.page.elements[1];
  const focus = await s.driver.focusedFrameChain(t);
  assert.deepEqual(focus.map((f) => [f.frameId, f.site]), [['FE', 'pay.example']]);
  // A click on the <object> is a step into that box (its site, the owner's OK naming it).
  const r = await s.call('left_click', { target: { type: 'coordinate', x: 10, y: 10 } });
  assert.ok(!r.result.is_error, text(r));
  assert.deepEqual(s.sites().map(siteOf).slice(-1), ['shop.example']);
  assert.deepEqual(s.guards().map((g) => g.label), ['a box from shop.example']);
  // Keys with the focus in the <embed> ask naming its site; typing there is refused.
  const typed = await s.call('type', { text: 'hello' });
  assert.match(text(typed), /^Refused: the keyboard focus is inside a box embedded from another site/);
});

// ---------------------------------------------------------------------------------------------
// RT4-03: typing keeps the focus on its field

test('RT4-03: a page that moves the keyboard focus when the text arrives gets no Enter: the step fails and the owner is told', async () => {
  const page = { elements: [{ role: 'searchbox', name: 'Search articles', x: 0, y: 0, w: 300, h: 30, desc: { tag: 'input', type: 'search', form: { isSearch: true, method: 'get', actionUrl: 'https://blog.example/search' } } }] };
  const s = setup({ page });
  await s.call('read_page', {});
  await s.call('left_click', { target: ref(1) });
  s.tab.page.moveFocusOnInput = true;
  const r = await s.call('type', { text: '4k monitor\n' });
  assert.equal(r.result.is_error, true);
  assert.match(text(r), /moved the keyboard focus away from the field/);
  const enters = s.fb.calls.filter((c) => c.method === 'Input.dispatchKeyEvent' && c.params.key === 'Enter');
  assert.equal(enters.length, 0, 'no Enter was sent after the move');
  assert.ok(s.blocked.some((b) => /Jarvis stopped typing/.test(b)), JSON.stringify(s.blocked));
});

// ---------------------------------------------------------------------------------------------
// RT4-04: where a link or form really opens (<base target>, "_self ")

test('RT4-04: a target is compared as Chrome does (not trimmed); a link opening elsewhere is never plain; a form\'s inherited target counts', () => {
  assert.equal(targetElsewhere('_self '), true, '"_self " is a new window named "_self "');
  assert.equal(targetElsewhere('_SELF'), false);
  assert.equal(targetElsewhere(''), false);
  assert.equal(targetElsewhere('_blank'), true);
  const link = { tag: 'a', role: 'link', name: 'Read the full story', href: 'https://blog.example/go?to=x' };
  // (The page agent reports a <base target="_blank"> link as targetBlank, with its effective target.)
  assert.equal(plainLinkDestination({ ...link, targetBlank: true, target: '_blank' }, 'https://blog.example/'), '');
  assert.equal(plainLinkDestination({ ...link, target: '_self ' }, 'https://blog.example/'), '');
  const enter = parseKeys('Enter')[0];
  assert.equal(keyDestination(enter, { ...link, targetBlank: true, target: '_blank' }, 'https://blog.example/').target, '_blank');
  const field = { tag: 'input', type: 'search', form: { isSearch: true, method: 'get', actionUrl: 'https://blog.example/search', target: '_blank', submitTarget: '' } };
  assert.equal(formSubmission(field, 'https://blog.example/').target, '_blank', 'the form\'s target (its own or <base>\'s)');
  assert.equal(formSubmission({ ...field, form: { ...field.form, target: '', submitTarget: '_self ' } }, 'https://blog.example/').target, '_self ');
});

// ---------------------------------------------------------------------------------------------
// RT4C-01: a page load waiting for the owner never goes out when Jarvis lets go

test('RT4C-01: a page load still waiting for the decision is failed before the debugger detaches (Stop, Take over, the end of the task), in its own session; the notice says it was stopped', async () => {
  const fb = createFakeBrowser();
  const tab = fb.addTab({ url: 'https://shop.example/processing' });
  const stopped = [];
  const asked = [];
  const driver = new Driver({ chrome: fb.chrome, pageSource: '', onNavigationRequest: (toolId, url, req) => (asked.push({ url, ...req }), new Promise(() => {})) });
  driver.onLoadStopped = (id, info) => stopped.push(info);
  fb.onCdpEvent = (tabId, m, p, sid) => driver.onCdpEvent(tabId, m, p, sid);
  driver.enable();
  const id = driver.register({ id: tab.id, url: tab.url, windowId: 1 });
  const t = driver.get(id);
  await driver.page(t, 'viewport', {}); // attached
  // The order form the page posts by itself, and a form posted inside another site's box.
  fb.emit(tab, 'Fetch.requestPaused', { requestId: 'r1', frameId: `F${tab.id}`, resourceType: 'Document', request: { url: 'https://shop.example/order', method: 'POST' } });
  tab.childFrames = [{ sessionId: 'S1', url: 'https://ads.example/box' }];
  fb.emit(tab, 'Fetch.requestPaused', { requestId: 'r2', frameId: 'FX', resourceType: 'Document', request: { url: 'https://ads.example/api/order', method: 'POST' } }, 'S1');
  await sleep(10);
  assert.deepEqual(asked.map((a) => [a.url, a.method, a.main, a.sessionId]), [['https://shop.example/order', 'POST', true, null], ['https://ads.example/api/order', 'POST', false, 'S1']]);
  let failedBeforeDetach = null;
  const detach = fb.chrome.debugger.detach;
  fb.chrome.debugger.detach = async (target) => {
    failedBeforeDetach = fb.calls.filter((c) => c.method === 'Fetch.failRequest').map((c) => [c.params.requestId, c.sessionId || null]);
    return detach(target);
  };
  await driver.releaseAll();
  assert.deepEqual(failedBeforeDetach, [['r1', null], ['r2', 'S1']], 'both loads were failed, each in its own session, before letting go');
  assert.deepEqual(stopped.map((s) => [s.url, s.ok, s.released]), [['https://shop.example/order', true, true], ['https://ads.example/api/order', true, true]]);
});

async function controllerSetup() {
  const fb = createFakeBrowser();
  const store = createStore(fb.chrome);
  await store.setApiKey(TEST_API_KEY);
  const mock = createClaudeMock();
  const controller = new Controller({ chrome: fb.chrome, store, pageSource: '/* agent */', createClient: ({ apiKey }) => createClient({ apiKey, baseURL: 'http://mock.local', fetch: mock.fetch }), encoder: fakeEncoder, platform: 'mac' });
  fb.onCdpEvent = (tabId, m, p, sid) => controller.driver.onCdpEvent(tabId, m, p, sid);
  fb.chrome.tabs.onCreated.addListener((t) => controller.driver.onTabCreated(t));
  fb.chrome.tabs.onRemoved.addListener((id) => controller.driver.onTabRemoved(id));
  const tab = fb.addTab({ url: 'https://shop.example/home', page: { title: 'Shop', elements: [] } });
  controller.connect({ name: PORT_NAME, postMessage() {}, onDisconnect: { addListener() {} }, onMessage: { addListener() {} } });
  const lastTask = () => controller.tasks.at(-1);
  const waitFor = async (fn, ms = 4000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(10);
    }
    throw new Error('timed out');
  };
  await store.allowSiteAlways('shop.example');
  mock.script([() => ({ calls: [{ name: 'read_page', input: {} }] }), () => ({ hold: true })]);
  const running = controller.start({ text: 'Look around', windowId: 1 });
  await waitFor(() => mock.requests.length === 2);
  const done = async (fn) => {
    try {
      await fn();
    } finally {
      await controller.stop('panel');
      await running;
    }
  };
  return { fb, controller, tab, lastTask, waitFor, done, mock };
}

test('RT4C-01: Take over withdraws an unanswered "Approve this page load?" as Cancel (no Approve left that could no longer work)', async () => {
  const { controller, lastTask, waitFor, done } = await controllerSetup();
  await done(async () => {
    const decision = controller.navigationPolicy('tab-1', 'https://shop.example/order', { method: 'POST', main: true });
    const p = await waitFor(() => lastTask().prompt);
    assert.equal(p.title, 'Approve this page load?');
    await controller.takeover();
    const v = await decision;
    assert.equal(v === true || v?.allow === true, false, 'the load is stopped');
    assert.match(v.notice, /waiting for your answer when Jarvis let go of the tab/);
    assert.equal(lastTask().prompt, null, 'the prompt is gone');
  });
});

test('RT4C-01: a step approved on the page never covers what another site\'s box sends by itself; an approved step in that box does', () => {
  const fb = createFakeBrowser();
  const tab = fb.addTab({ url: 'https://blog.example/' });
  const driver = new Driver({ chrome: fb.chrome });
  const id = driver.register({ id: tab.id, url: tab.url, windowId: 1 });
  const t = driver.get(id);
  driver.markApproved(t);
  assert.equal(driver.approvedInput(id), true, 'the page\'s own loads');
  assert.equal(driver.approvedInput(id, { sessionId: 'S1', frameId: 'FX' }), false, 'another site\'s box');
  driver.markApproved(t, undefined, { frames: [{ frameId: 'FX', sessionId: 'S1' }] });
  assert.equal(driver.approvedInput(id, { sessionId: 'S1' }), true, 'the box the owner approved acting in');
  assert.equal(driver.approvedInput(id, { sessionId: 'S2' }), false);
});

// ---------------------------------------------------------------------------------------------
// RT4C-02: what Claude read on one site does not reach another unasked

test('RT4C-02: after reading one site, acting on another asks once; an address carrying text Claude chose asks every time, showing it whole; Cancel blocks that site', async () => {
  const { controller, lastTask, waitFor, done } = await controllerSetup();
  await done(async () => {
    const policy = controller.run.policy;
    policy.noteRead('mail.example');
    // Going on to the blog: asked once.
    let pending = policy.crossSite('blog.example', {});
    let p = await waitFor(() => lastTask().prompt);
    assert.equal(p.title, 'Carry on to blog.example?');
    assert.match(p.body, /read .*mail\.example/);
    controller.decide(p.id, 'approve');
    assert.equal(await pending, null);
    assert.equal(await policy.crossSite('blog.example', {}), null, 'not again for what was read before');
    // An address there with the code in it: asked again, showing all of it.
    pending = policy.crossSite('blog.example', { url: 'https://blog.example/collect?c=482913&t=rst-7f3a' });
    p = await waitFor(() => lastTask().prompt);
    assert.equal(p.title, 'Send this address to blog.example?');
    assert.ok(p.body.includes('blog.example/collect?c=482913&t=rst-7f3a'), p.body);
    controller.decide(p.id, 'cancel');
    assert.match(await pending, /^Blocked: the owner did not let Jarvis carry on to blog\.example/);
    assert.match(await policy.crossSite('blog.example', {}), /^Blocked/, 'that site stays blocked for this task');
    // A link seen on a page Jarvis read is not text Claude chose; reading a new site asks again.
    policy.noteRead('news.example');
    policy.noteLinks(['https://shop.example/product/7?ref=news']);
    pending = policy.crossSite('shop.example', { url: 'https://shop.example/product/7?ref=news' });
    p = await waitFor(() => lastTask().prompt);
    assert.equal(p.title, 'Carry on to shop.example?', 'only the site switch is asked about, not the seen link\'s address');
    controller.decide(p.id, 'approve');
    assert.equal(await pending, null);
  });
});

test('RT4C-02: hover, mouse_move and scroll point at the middle of the element there, never at a spot Claude chose', async () => {
  const page = { elements: [{ role: 'img', name: 'Photo wall', x: 0, y: 100, w: 1000, h: 400, desc: { tag: 'div' } }] };
  const s = setup({ page });
  await s.call('screenshot', {});
  for (const [name, input] of [['hover', { target: { type: 'coordinate', x: 482, y: 300 } }], ['mouse_move', { target: { type: 'coordinate', x: 913, y: 300 } }], ['scroll', { target: { type: 'coordinate', x: 333, y: 444 }, scroll_direction: 'down', scroll_amount: 1 }]]) {
    const r = await s.call(name, input);
    assert.ok(!r.result.is_error, `${name}: ${text(r)}`);
  }
  const moves = s.fb.calls.filter((c) => c.method === 'Input.dispatchMouseEvent' && (c.params.type === 'mouseMoved' || c.params.type === 'mouseWheel')).map((c) => [c.params.x, c.params.y]);
  assert.ok(moves.length >= 4, JSON.stringify(moves));
  for (const [x, y] of moves) assert.deepEqual([x, y], [500, 300], 'the middle of the element');
});

test('RT4C-02: before acting on a site, the executor runs the cross-site check (and reads are counted)', async () => {
  const flow = [];
  const reads = [];
  const page = { elements: [{ role: 'button', name: 'Post', x: 0, y: 0, w: 80, h: 30, desc: { tag: 'button' } }] };
  const s = setup({ page, extra: { noteRead: (site) => reads.push(site), crossSite: async (site, o) => (flow.push([site, o.url || '']), site === 'blog.example' ? 'Blocked: the owner did not let Jarvis carry on to blog.example.' : null) } });
  await s.call('read_page', {});
  // (Counted for each part of the page that reached Claude: its text, its tab's title; RT5C-04.)
  assert.deepEqual([...new Set(reads)], ['blog.example']);
  const r = await s.call('left_click', { target: ref(1) });
  assert.match(text(r), /^Blocked: the owner did not let Jarvis carry on to blog\.example/);
  assert.equal(s.presses().length, 0);
  const n = await s.call('navigate', { url: 'https://shop.example/collect?c=482913' });
  assert.ok(flow.some(([site, u]) => site === 'shop.example' && u === 'https://shop.example/collect?c=482913'), JSON.stringify(flow));
  assert.ok(!n.result.is_error || /collect/.test(text(n)));
});

test('RT4C-02: a navigate step\'s label shows the whole address, query included', () => {
  assert.equal(stepLabel('navigate', { url: 'https://blog.example/collect?c=482913&t=rst-7f3a' }, { url: 'https://blog.example/collect?c=482913&t=rst-7f3a' }), 'Opened blog.example/collect?c=482913&t=rst-7f3a');
  assert.equal(stepLabel('navigate', { url: 'https://www.bestbuy.com/' }, { url: 'https://www.bestbuy.com/' }), 'Opened bestbuy.com');
});

// ---------------------------------------------------------------------------------------------
// RT4C-03: no control bar on a page: input there waits for the owner

test('RT4C-03: on a page where the control bar cannot be shown, input waits for the owner\'s OK (Cancel: nothing is pressed)', async () => {
  const page = { elements: [{ role: 'button', name: 'Book this room', x: 0, y: 0, w: 200, h: 40, desc: { tag: 'button' } }] };
  const checks = [];
  const s = setup({ page, extra: { barCheck: async (info) => (checks.push(info), 'Blocked: Jarvis can\'t show its control bar on blog.example, and the owner did not let it act there without the bar.') } });
  s.tab.page.noBar = true;
  s.driver.mode = 'acting';
  await s.call('read_page', {});
  const r = await s.call('left_click', { target: ref(1) });
  assert.match(text(r), /^Blocked: Jarvis can't show its control bar/);
  assert.equal(checks.length, 1);
  assert.equal(s.presses().length, 0);
});

// ---------------------------------------------------------------------------------------------
// RT4C-04 / RT4C-05 (low)

test('RT4C-04: the address a link\'s text names is told apart from where it goes', () => {
  assert.equal(textHost('https://shop.localhost/orders/1042'), 'shop.localhost');
  assert.equal(textHost('shop.localhost/account'), 'shop.localhost');
  assert.equal(textHost('www.Example.com'), 'example.com');
  assert.equal(textHost('Track your order'), '');
});

test('RT4C-05: a download\'s card keeps the end of a long name (its real extension) and says what kind of file it is', () => {
  const name = 'Acme-Bank-Statement-November-2026-Checking-Account-Summary-For-Your-Review-.pdf.html';
  const shown = shortFileName(name, 80);
  assert.ok(shown.length <= 80, shown);
  assert.ok(shown.endsWith('Review-.pdf.html'), shown);
  assert.equal(shortFileName('report.pdf', 80), 'report.pdf');
  const k = fileKind(name);
  assert.equal(k.kind, 'a web page (.html)');
  assert.match(k.warn, /Careful: its name ends in “\.pdf\.html”, so it is a \.html file, not a \.pdf one\./);
  assert.match(fileKind('Invoice.pdf.command').warn, /can run programs on your Mac/);
  assert.deepEqual(fileKind('report.pdf'), { kind: 'a PDF document', warn: '' });
});

test('RT4-04: a window a page opened that then goes on to a denied site (a redirect) is closed, and the owner told the request may have reached it', async () => {
  const { fb, controller, lastTask, done } = await controllerSetup();
  await done(async () => {
    controller.run.sitesDenied.add('deny.example');
    // The page opens a window to an address on its own site (allowed); it redirects to the denied site.
    const popup = fb.addTab({ url: 'https://shop.example/go?to=deny', active: false, opener: [...fb.tabs.values()][0].id });
    controller.driver.onTabCreated({ id: popup.id, windowId: 1, url: popup.url, openerTabId: popup.openerTabId });
    controller.driver.onTabUpdated(popup.id, { url: 'https://deny.example/hit' }, { id: popup.id, url: 'https://deny.example/hit' });
    await sleep(20);
    assert.equal(fb.tabs.has(popup.id), false, 'closed');
    assert.ok(lastTask().steps.some((s) => /went on to deny\.example, which you denied; Jarvis closed it, but that site may have received the request/.test(s.label)), JSON.stringify(lastTask().steps.map((s) => s.label)));
  });
});

test('RT4C-01/RT4-03: a form another site\'s box sends by itself asks the owner even while a step approved on the page is in flight', async () => {
  const { controller, lastTask, waitFor, done } = await controllerSetup();
  await done(async () => {
    controller.driver.markApproved(controller.driver.get('tab-1'));
    const decision = controller.navigationPolicy('tab-1', 'https://ads.example/api/place-order', { method: 'POST', main: false, sessionId: 'S1', frameId: 'FX' });
    const p = await waitFor(() => lastTask().prompt);
    assert.equal(p.title, 'Approve this page load?');
    assert.match(p.body, /wants to send a form to https:\/\/ads\.example\/api\/place-order \(from inside a box from another site\)/);
    controller.decide(p.id, 'cancel');
    const v = await decision;
    assert.equal(v === true || v?.allow === true, false);
  });
});

test('RT4C-02: a new site\'s own prompt says what the task read; the address Jarvis would open there is then shown whole on its own card (RT5C-02: never folded into the site question)', async () => {
  const { controller, lastTask, waitFor, done } = await controllerSetup();
  await done(async () => {
    const policy = controller.run.policy;
    policy.noteRead('mail.example');
    const url = 'https://new.example/collect?c=482913';
    const asking = policy.checkSite(url, {}, { address: true });
    const p = await waitFor(() => lastTask().prompt);
    assert.equal(p.kind, 'site');
    assert.match(p.body, /read .*mail\.example/);
    controller.decide(p.id, 'once');
    assert.equal(await asking, null);
    const sending = policy.crossSite('new.example', { url });
    const card = await waitFor(() => lastTask().prompt);
    assert.equal(card.title, 'Send this address to new.example?');
    assert.ok(card.body.includes('https://new.example/collect?c=482913') && card.address === 'https://new.example/collect?c=482913', card.body);
    controller.decide(card.id, 'approve');
    assert.equal(await sending, null);
    assert.equal(await policy.crossSite('new.example', { url }), null, 'not again for the same address');
    assert.equal(lastTask().prompt, null);
  });
});
