// The round-5 review (RT5B-01 … RT5B-04, RT5C-01 … RT5C-05): the real Driver + Executor over the
// fake CDP/tabs layer (helpers/fake-chrome.mjs), with the real Controller's policy where the
// finding is about it (its approvals, page questions and cross-site check), and the pure helpers.
// Each test fails on the code before the fixes, for the reason its finding names.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeBrowser, fakeEncoder } from '../helpers/fake-chrome.mjs';
import { createClaudeMock, TEST_API_KEY } from '../mock/claude-mock.mjs';
import { Driver } from '../../../extension/src/background/driver.js';
import { Executor, inputKey } from '../../../extension/src/background/executor.js';
import { Controller } from '../../../extension/src/background/controller.js';
import { Approvals } from '../../../extension/src/background/guard.js';
import { createClient } from '../../../extension/src/background/api.js';
import { createStore } from '../../../extension/src/shared/storage.js';
import { PORT_NAME } from '../../../extension/src/shared/protocol.js';
import { addressConcern, cardAddress, normalizeNavigateUrl, siteOf } from '../../../extension/src/background/sites.js';
import { hiddenText, revealText } from '../../../extension/src/shared/util.js';
import { namesAddress, shownAddress } from '../../../extension/src/sidepanel/markdown.js';
import { stepLabel } from '../../../extension/src/background/labels.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (r) => (typeof r.result.content === 'string' ? r.result.content : r.result.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n'));
const ref = (n) => ({ type: 'ref', ref: `ref_${n}` });
const at = (x, y) => ({ type: 'coordinate', x, y });
const TAG = (s) => [...s].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
const CODE = '482913';

/**
 * The real Controller with a task running (its first API request held), and an Executor on the
 * controller's own driver and policy, so the tests drive member calls through the real approvals,
 * page questions and cross-site check. `owner(prompt)` answers every prompt ('approve', 'cancel',
 * 'once'…); `always`: sites allowed for good.
 */
async function rig({ url = 'https://notes.example/notes', page, owner = () => 'approve', always = [siteOf(url)] } = {}) {
  const fb = createFakeBrowser();
  const store = createStore(fb.chrome);
  await store.setApiKey(TEST_API_KEY);
  for (const s of always) await store.allowSiteAlways(s);
  const mock = createClaudeMock();
  const controller = new Controller({ chrome: fb.chrome, store, pageSource: '/* agent */', createClient: ({ apiKey }) => createClient({ apiKey, baseURL: 'http://mock.local', fetch: mock.fetch }), encoder: fakeEncoder, platform: 'mac' });
  fb.onCdpEvent = (tabId, m, p, sid) => controller.driver.onCdpEvent(tabId, m, p, sid);
  fb.chrome.tabs.onCreated.addListener((t) => controller.driver.onTabCreated(t));
  fb.chrome.tabs.onRemoved.addListener((id) => controller.driver.onTabRemoved(id));
  fb.chrome.tabs.onActivated.addListener((i) => controller.driver.onTabActivated(i));
  fb.chrome.tabs.onUpdated.addListener((id, info, t) => controller.driver.onTabUpdated(id, info, t));
  const tab = fb.addTab({ url, page });
  controller.connect({ name: PORT_NAME, postMessage() {}, onDisconnect: { addListener() {} }, onMessage: { addListener() {} } });
  mock.script([() => ({ hold: true })]);
  const running = controller.start({ text: 'Do the task', windowId: 1 });
  for (let i = 0; i < 400 && mock.requests.length < 1; i++) await sleep(5);
  const run = controller.run;
  const prompts = [];
  let on = true;
  (async () => {
    while (on) {
      const p = run.task.prompt;
      if (p && !prompts.some((q) => q.id === p.id)) {
        prompts.push(p);
        const choice = await owner(p);
        if (choice) controller.decide(p.id, choice);
      }
      await sleep(3);
    }
  })();
  const ex = new Executor({ driver: controller.driver, encoder: fakeEncoder, policy: run.policy, hooks: {} });
  let n = 0;
  const call = (name, input = {}) => ex.run({ type: 'tool_use', id: `toolu_${++n}`, name, toolset_name: 'browser', input }, { signal: run.abort.signal, stepId: `s${n}` });
  const done = async () => {
    on = false;
    await controller.stop('panel');
    await running;
  };
  return { fb, tab, controller, run, ex, call, prompts, done, store, steps: () => run.task.steps.map((s) => s.label) };
}

/** request_confirmation as the agent loop does it (agent.js confirmation): the facts, then the grant. */
async function grantFor(r, target, category, action = 'An action') {
  const facts = await r.ex.describeTarget(target, { signal: r.run.abort.signal });
  assert.ok(!facts.error, facts.error);
  const b = facts.bind || {};
  return r.run.approvals.grant({ category, site: facts.site, tabId: facts.toolId, url: facts.url, doc: b.doc, targetId: b.targetId, ctx: b.ctx, selection: b.selection, text: action, kind: b.kind, verdict: b.verdict });
}

// ---------------------------------------------------------------------------------------------
// RT5B-01: a request_confirmation approval covers one plain click, read as the card showed it

const COMPOSE = () => ({
  title: 'Compose',
  elements: [
    { role: 'textbox', name: 'Message', x: 0, y: 0, w: 500, h: 120, desc: { tag: 'textarea', multiline: true, nearbyButtons: ['Send', 'Save draft'] } },
    { role: 'button', name: 'Send', x: 0, y: 140, w: 80, h: 30, desc: { tag: 'button' } },
  ],
});

test('RT5B-01: an approval is used only by a plain click read as the owner\'s card showed it: never by a key, never by another verdict or kind of action', () => {
  const a = new Approvals();
  const box = { site: 'mail.example', tabId: 'tab-1', url: 'https://mail.example/compose', doc: 1, targetId: 3, ctx: 'Message | ', selection: '0|' };
  const shown = { consequential: false, category: 'change', label: 'Message' };
  assert.equal(a.grant({ category: 'post', ...box, text: 'Save as a draft' }), false, 'a grant says which input it covers and what the card showed');
  assert.equal(a.grant({ category: 'post', ...box, text: 'Save as a draft', kind: 'click', verdict: shown }), true);
  assert.equal(a.consume({ ...box, kind: 'key', verdict: shown }), null, 'a key in the text box');
  assert.equal(a.consume({ ...box, verdict: shown }), null, 'an input that does not say what it is');
  assert.equal(a.consume({ ...box, kind: 'click', verdict: { consequential: true, category: 'send', label: 'Message' } }), null, 'a click the guard reads as sending');
  assert.equal(a.consume({ ...box, kind: 'click', verdict: { consequential: false, category: 'change', label: 'Draft' } }), null, 'another label');
  assert.ok(a.consume({ ...box, kind: 'click', verdict: shown }), 'the click the owner was shown');
  // A consequential verdict must be the kind of action Claude named.
  const send = { ...box, targetId: 4, ctx: 'Send | ' };
  const v = { consequential: true, category: 'send', label: 'Send' };
  a.grant({ category: 'post', ...send, kind: 'click', verdict: v });
  assert.equal(a.consume({ ...send, kind: 'click', verdict: v }), null, 'Claude said "post", the guard says "send"');
  a.grant({ category: 'send', ...send, kind: 'click', verdict: v });
  assert.ok(a.consume({ ...send, kind: 'click', verdict: v }));
});

test('RT5B-01: a request_confirmation on the message box ("save as a draft") never covers Ctrl+Enter there: the guard\'s own card asks (sending), and Cancel sends nothing', async () => {
  const r = await rig({ url: 'https://mail.example/compose', page: COMPOSE(), owner: (p) => (p.title === 'Approve this step?' && p.consequential ? 'cancel' : 'approve') });
  try {
    r.tab.page.onKey = (pg, fb, tab, k) => {
      if (k.key === 'Enter' && k.modifiers & 2) fb.sent = (fb.sent || 0) + 1;
    };
    await r.call('read_page', {});
    r.tab.page.focus = r.tab.page.elements[0];
    assert.equal(await grantFor(r, ref(1), 'post', 'Save your reply to Bob as a draft. It will not be sent.'), true);
    const before = r.prompts.length;
    const k = await r.call('key', { text: 'ctrl+Enter' });
    assert.match(text(k), /^Blocked: the owner declined this step/);
    const card = r.prompts.slice(before).find((p) => p.kind === 'confirm');
    assert.ok(card, 'the guard asked');
    assert.match(card.body, /^Press Ctrl\+Enter in "Message"/);
    assert.match(card.body, /This looks like sending a message or email/);
    assert.equal(card.category, 'send');
    assert.equal(r.fb.sent, undefined, 'nothing was sent');
    assert.equal(r.run.approvals.live().length, 1, 'the click approval is still there, unused');
  } finally {
    await r.done();
  }
});

test('RT5B-01: a request_confirmation on a checkout form\'s note field never covers Enter there (it would place the order): the guard asks', async () => {
  const page = {
    title: 'Checkout',
    elements: [{ role: 'textbox', name: 'Delivery note', x: 0, y: 0, w: 300, h: 24, desc: { tag: 'input', type: 'text', form: { isSearch: false, submitLabel: 'Place order — $1,299', method: 'post' } }, onEnter: (pg, fb) => (fb.ordered = (fb.ordered || 0) + 1) }],
  };
  const r = await rig({ url: 'https://shop.example/checkout', page, owner: (p) => (p.title === 'Approve this step?' && p.consequential ? 'cancel' : 'approve') });
  try {
    await r.call('read_page', {});
    r.tab.page.focus = r.tab.page.elements[0];
    assert.equal(await grantFor(r, ref(1), 'purchase', 'Add a delivery note. Nothing is ordered yet.'), true);
    const before = r.prompts.length;
    const k = await r.call('key', { text: 'Enter' });
    assert.match(text(k), /^Blocked/);
    const card = r.prompts.slice(before).find((p) => p.kind === 'confirm');
    assert.ok(card && card.category === 'purchase', JSON.stringify(card));
    assert.match(card.body, /Press Enter in "Delivery note"/);
    assert.equal(r.fb.ordered, undefined, 'no order');
  } finally {
    await r.done();
  }
});

test('RT5B-01: the honest flow still works: request_confirmation on "Buy now", then one left_click there, covered once; a second click asks', async () => {
  const page = { title: 'Dell', elements: [{ role: 'button', name: 'Buy now', x: 0, y: 0, w: 120, h: 40, ctx: 'Dell S2721QS — $279.99', desc: { tag: 'button' }, onClick: (pg, fb) => (fb.orders = (fb.orders || 0) + 1) }] };
  const r = await rig({ url: 'https://shop.example/dell', page, owner: (p) => (p.consequential ? 'cancel' : 'approve') });
  try {
    await r.call('read_page', {});
    assert.equal(await grantFor(r, ref(1), 'purchase', 'Buy the Dell for $279.99'), true);
    const before = r.prompts.length;
    const c = await r.call('left_click', { target: ref(1) });
    assert.ok(!c.result.is_error, text(c));
    assert.equal(r.prompts.length, before, 'covered by the approval: no card');
    assert.equal(r.fb.orders, 1);
    const again = await r.call('left_click', { target: ref(1) });
    assert.match(text(again), /^Blocked/, 'a second click asks (and the owner cancels)');
    assert.equal(r.fb.orders, 1);
  } finally {
    await r.done();
  }
});

// ---------------------------------------------------------------------------------------------
// RT5B-02: the owner's OK to a page question stands for that one step done again, nothing else

const NOTES = () => ({
  title: 'Notes',
  elements: [
    { role: 'textbox', name: 'Notebook title', x: 0, y: 0, w: 300, h: 24, desc: { tag: 'input', type: 'text', form: { isSearch: false, submitLabel: 'Rename', method: 'get' } }, onEnter: (pg, fb, tab) => (fb.dialog(tab, 'confirm', 'Are you sure?') ? (fb.renamed = [...(fb.renamed || []), pg.elements[0].value]) : null) },
    { role: 'link', name: '×', x: 320, y: 40, w: 20, h: 20, ctx: 'Tax documents 2025', desc: { tag: 'a', href: 'https://notes.example/notes/7' }, onClick: (pg, fb, tab) => (fb.dialog(tab, 'confirm', 'Are you sure?') ? (fb.deleted = [...(fb.deleted || []), 7]) : null) },
    { role: 'button', name: '×', x: 320, y: 80, w: 20, h: 20, ctx: 'Passport scans', desc: { tag: 'button' }, onClick: (pg, fb, tab) => (fb.dialog(tab, 'confirm', 'Are you sure?') ? (fb.deleted = [...(fb.deleted || []), 8]) : null) },
    { role: 'button', name: 'Rename', x: 0, y: 120, w: 80, h: 24, desc: { tag: 'button' }, onClick: (pg, fb, tab) => (fb.dialog(tab, 'confirm', 'Are you sure?') ? (fb.renamed = [...(fb.renamed || []), 'button']) : null) },
  ],
});

/** The owner: approves ordinary steps, and the page's question only when it is about typing in the title. */
const renameOwner = (p) => (p.title === 'The page asks you' ? (/typing|Type/.test(p.body) ? 'approve' : 'cancel') : 'approve');

test('RT5B-02: OK to the question a typed Enter raised has Jarvis press that Enter again (renamed once); the same "Are you sure?" from a plain link or a button afterwards goes to the owner (Cancel: nothing deleted)', async () => {
  const r = await rig({ page: NOTES(), owner: renameOwner });
  try {
    await r.call('read_page', {});
    await r.call('left_click', { target: ref(1) });
    const typed = await r.call('type', { text: 'Work\n' });
    assert.ok(!typed.result.is_error, text(typed));
    assert.deepEqual(r.fb.renamed, ['Work'], 'renamed once, with the text typed once');
    assert.match(text(typed), /Jarvis pressed Enter in that field again and answered OK to that question this time/);
    assert.match(text(typed), /Jarvis answered OK, as the owner approved for this step/);
    assert.doesNotMatch(text(typed), /the owner answered OK/, 'never "the owner answered" for a dialog the owner never saw');
    const asked = r.prompts.filter((p) => p.title === 'The page asks you');
    assert.equal(asked.length, 1);
    assert.match(asked[0].body, /Approve: Jarvis presses Enter in that field again and answers OK to this question then, once/);
    assert.ok(r.steps().some((l) => /Jarvis answered OK to the page's question “Are you sure\?”, as you approved for that step/.test(l)), JSON.stringify(r.steps()));
    // The same text from a plain link (no card of its own), then from a button: asked, cancelled.
    const link = await r.call('left_click', { target: ref(2) });
    assert.match(text(link), /the owner answered Cancel too/);
    const button = await r.call('left_click', { target: ref(3) });
    assert.match(text(button), /the owner answered Cancel too/);
    assert.equal(r.fb.deleted, undefined, 'nothing deleted');
    const later = r.prompts.filter((p) => p.title === 'The page asks you').slice(1);
    assert.equal(later.length, 2, 'both questions went to the owner');
    assert.match(later[0].body, /as Jarvis was clicking "×"/);
  } finally {
    await r.done();
  }
});

test('RT5B-02: an OK for a step Jarvis cannot redo itself stands only for that same call next (any other call drops it: a link, a new page); nothing else in its batch runs', async () => {
  const page = NOTES();
  // A double-click on "Rename" asks the page's question (not something Jarvis does again by itself).
  page.elements[3].onClick = null;
  page.elements[3].onDouble = true;
  const r = await rig({ page, owner: (p) => (p.title === 'The page asks you' ? (/double-clicking "Rename"/i.test(p.body) ? 'approve' : 'cancel') : 'approve') });
  try {
    r.tab.page.elements[3].onClick = (pg, fb, tab) => (fb.dialog(tab, 'confirm', 'Are you sure?') ? (fb.renamed = [...(fb.renamed || []), 'double']) : null);
    await r.call('read_page', {});
    const dbl = await r.call('double_click', { target: ref(4) });
    assert.equal(dbl.halt, true, 'the rest of the batch does not run');
    assert.match(text(dbl), /make your very next call exactly this double_click call again, with the same input/);
    // Something else first: the OK is dropped, and the link's question is asked.
    const link = await r.call('left_click', { target: ref(2) });
    assert.match(text(link), /the owner answered Cancel too/);
    assert.equal(r.fb.deleted, undefined);
    // A new page of the same site: nothing armed either.
    const again = await r.call('double_click', { target: ref(4) });
    assert.equal(again.halt, true, 'the double-click asks again (and is approved again)');
    await r.fb.navigateTab(r.tab, 'https://notes.example/notes', { title: 'Notes' });
    r.tab.page = { ...r.tab.page, ...NOTES() };
    await r.call('read_page', {});
    const nav = await r.call('left_click', { target: ref(2) });
    assert.doesNotMatch(text(nav), /Jarvis answered OK/);
    assert.equal(r.fb.deleted, undefined);
  } finally {
    await r.done();
  }
});

test('RT5B-02 (controller): the OK is deferred unless armed for that very call; another call, another document, other elements or the end of the call drop it', async () => {
  const r = await rig({ page: NOTES() });
  try {
    const pol = r.run.policy;
    const t = r.controller.driver.get('tab-1');
    const q = { toolId: 'tab-1', message: 'Are you sure?', doc: t.docSeq };
    const bind = { member: 'left_click', inputKey: inputKey({ target: ref(3) }), elements: ['tab-1|1|9'] };
    const ask = () => r.controller.dialogPolicy('tab-1', { type: 'confirm', message: 'Are you sure?' });
    pol.preApproveDialog(q, bind);
    assert.deepEqual(ask(), { accept: false, deferred: true }, 'nothing armed');
    assert.equal(pol.armDialog({ member: 'left_click', inputKey: inputKey({ target: ref(2) }), toolId: 'tab-1', doc: t.docSeq, actedOn: () => [] }), null, 'another call (another element)');
    assert.equal(r.run.dialogOk, null, 'and that call dropped it');
    pol.preApproveDialog(q, bind);
    assert.equal(pol.armDialog({ member: 'left_click', inputKey: bind.inputKey, toolId: 'tab-1', doc: t.docSeq + 1, actedOn: () => bind.elements }), null, 'another document');
    pol.preApproveDialog(q, bind);
    const b = pol.armDialog({ member: 'left_click', inputKey: bind.inputKey, toolId: 'tab-1', doc: t.docSeq, actedOn: () => ['tab-1|1|10'] });
    assert.ok(b);
    assert.deepEqual(ask(), { accept: false, deferred: true }, 'the call is on other elements than the owner approved');
    pol.disarmDialog(b);
    assert.equal(r.run.dialogOk, null, 'the call ended: gone');
    pol.preApproveDialog(q, bind);
    const c = pol.armDialog({ member: 'left_click', inputKey: bind.inputKey, toolId: 'tab-1', doc: t.docSeq, actedOn: () => bind.elements });
    t.docSeq += 1; // the page moved on meanwhile
    assert.deepEqual(ask(), { accept: false, deferred: true }, 'after a navigation');
    t.docSeq -= 1;
    assert.deepEqual(ask(), { accept: true, preApproved: true }, 'that very call, in that document, on those elements');
    assert.equal(c.used, true);
    assert.deepEqual(ask(), { accept: false, deferred: true }, 'once');
    pol.preApproveDialog(q, bind);
    await r.controller.takeover();
    assert.equal(r.run.dialogOk, null, 'Take over drops it');
    r.controller.resume();
  } finally {
    await r.done();
  }
});

test('RT5B-02: a redo Jarvis does itself that fails (the button re-rendered) leaves nothing armed: the next "Are you sure?" is asked', async () => {
  const page = NOTES();
  const r = await rig({ page, owner: (p) => (p.title === 'The page asks you' ? (/clicking "Rename"/.test(p.body) ? 'approve' : 'cancel') : 'approve') });
  try {
    r.tab.page.elements[3].onClick = (pg, fb, tab) => {
      fb.dialog(tab, 'confirm', 'Are you sure?');
      // After Cancel the page draws the button anew: the ref Jarvis had is stale.
      const old = pg.elements[3];
      pg.elements[3] = { ...old };
      pg.refs.delete('ref_4');
    };
    await r.call('read_page', {});
    const c = await r.call('left_click', { target: ref(4) });
    assert.equal(c.result.is_error, true, 'the redo failed');
    assert.equal(r.run.dialogOk, null, 'nothing left armed');
    const link = await r.call('left_click', { target: ref(2) });
    assert.match(text(link), /the owner answered Cancel too/);
    assert.equal(r.fb.deleted, undefined);
  } finally {
    await r.done();
  }
});

test('RT5B-02: the OK binds to the element the step went to, asked about or not: a plain link clicked at a spot that now holds another "×" is not covered', async () => {
  const page = NOTES();
  const r = await rig({ page, owner: (p) => (p.title === 'The page asks you' ? 'approve' : 'approve') });
  try {
    // After its question (answered Cancel), the page puts another note's "×" at that same spot.
    r.tab.page.elements[1].onClick = (pg, fb, tab) => {
      fb.dialog(tab, 'confirm', 'Are you sure?');
      pg.elements[1] = { role: 'link', name: '×', x: 320, y: 40, w: 20, h: 20, ctx: 'Passport scans', desc: { tag: 'a', href: 'https://notes.example/notes/8' }, onClick: (pg2, fb2, tab2) => (fb2.dialog(tab2, 'confirm', 'Are you sure?') ? (fb2.deleted = [...(fb2.deleted || []), 8]) : null) };
    };
    await r.call('screenshot', {});
    const c = await r.call('left_click', { target: at(330, 50) });
    assert.match(text(c), /the page asked that question again, but about something else than the owner approved \(the page had changed\), so Jarvis answered Cancel/);
    assert.match(text(c), /Jarvis answered Cancel/);
    assert.equal(r.fb.deleted, undefined, 'the other note was not deleted');
  } finally {
    await r.done();
  }
});

// ---------------------------------------------------------------------------------------------
// RT5B-03 / RT5B-04: a held mouse button: nothing moves until it is released where it was pressed

function exec({ url = 'https://bank.example/limits', page, guard = () => null } = {}) {
  const fb = createFakeBrowser();
  const tab = fb.addTab({ url, page });
  const driver = new Driver({ chrome: fb.chrome, pageSource: '/* page agent */', onDialog: (id, d) => d.type === 'alert' });
  fb.onCdpEvent = (tabId, method, params, sessionId) => driver.onCdpEvent(tabId, method, params, sessionId);
  driver.enable();
  driver.activeToolId = driver.register({ id: tab.id, url, title: tab.title, windowId: 1 });
  const asked = [];
  const policy = {
    checkSite: async () => null,
    confirmGuard: async (c) => {
      asked.push(c);
      return guard(c);
    },
    onBlocked: () => {},
  };
  const ex = new Executor({ driver, encoder: fakeEncoder, policy });
  let n = 0;
  const call = (name, input = {}) => ex.run({ type: 'tool_use', id: `toolu_${++n}`, name, toolset_name: 'browser', input }, { signal: new AbortController().signal, stepId: `s${n}` });
  const mouse = () => fb.calls.filter((c) => c.method === 'Input.dispatchMouseEvent');
  return { fb, tab, driver, ex, call, asked, mouse };
}

const LIMITS = () => ({
  title: 'Card settings',
  elements: [
    { role: 'slider', name: 'Daily spending limit', x: 16, y: 84, w: 32, h: 32, desc: { tag: 'div', role: 'slider' } },
    { role: 'generic', name: '(spacer)', x: 420, y: 300, w: 400, h: 60, desc: { tag: 'div' } },
    { role: 'slider', name: 'Round-up amount', x: 20, y: 200, w: 600, h: 20, desc: { tag: 'input', type: 'range' } },
    { role: 'textbox', name: 'Note', x: 20, y: 400, w: 200, h: 24, desc: { tag: 'input', type: 'text' } },
  ],
});

test('RT5B-03: after an approved press, moving the pointer, scrolling, clicking or typing is refused before anything is sent; the release covered is only at the press point', async () => {
  const s = exec({ page: LIMITS() });
  await s.call('screenshot', {});
  await s.call('read_page', {});
  const down = await s.call('left_mouse_down', { target: at(32, 100) });
  assert.ok(!down.result.is_error, text(down));
  assert.equal(s.asked.length, 1);
  assert.equal(s.asked[0].verb, 'Press the mouse on');
  const sent = s.mouse().length;
  for (const [name, input] of [['mouse_move', { target: at(620, 330) }], ['hover', { target: ref(2) }], ['scroll', { target: at(620, 330), scroll_direction: 'down' }], ['scroll_to', { target: ref(2) }], ['left_click', { target: ref(2) }], ['left_click_drag', { from: at(32, 100), target: at(620, 330) }], ['left_mouse_down', { target: at(32, 100) }], ['type', { text: 'x' }], ['key', { text: 'Tab' }], ['form_input', { target: ref(4), value: 'x' }]]) {
    const r = await s.call(name, input);
    assert.equal(r.result.is_error, true, name);
    assert.match(text(r), /the left mouse button is still held down on this page, from left_mouse_down at \(32, 100\)/, name);
  }
  assert.equal(s.mouse().length, sent, 'no mouse event went out');
  assert.equal(s.asked.length, 1, 'and nothing was asked');
  // The release at the press point: covered, and the pointer does not move.
  const up = await s.call('left_mouse_up', { target: at(32, 100) });
  assert.ok(!up.result.is_error, text(up));
  assert.equal(s.asked.length, 1, 'one prompt for the press and its release');
  const after = s.mouse().slice(sent);
  assert.deepEqual(after.map((c) => [c.params.type, c.params.x, c.params.y]), [['mouseMoved', 32, 100], ['mouseReleased', 32, 100]]);
  // Released: the pointer moves again.
  assert.ok(!(await s.call('mouse_move', { target: at(620, 330) })).result.is_error);
});

test('RT5B-03: a release anywhere else drags what was pressed: asked as a drag naming both ends (Cancel: the button stays held, nothing moves)', async () => {
  const s = exec({ page: LIMITS(), guard: (c) => (c.verb === 'Drag' ? 'Blocked: the owner declined this step.' : null) });
  await s.call('screenshot', {});
  await s.call('left_mouse_down', { target: at(32, 100) });
  const sent = s.mouse().length;
  const up = await s.call('left_mouse_up', { target: at(620, 330) });
  assert.match(text(up), /^Blocked/);
  const drag = s.asked.at(-1);
  assert.equal(drag.verb, 'Drag');
  assert.match(drag.detail, /from "Daily spending limit" to "\(spacer\)"/);
  assert.match(drag.detail, /on a slider that moves it to that point and sets its value/);
  assert.equal(s.mouse().length, sent, 'nothing moved');
  assert.match(text(await s.call('mouse_move', { target: at(620, 330) })), /still held down/, 'still held');
  // Approved, it is sent as the drag the owner saw: from the press point to the release point.
  const t = s.exec2 = exec({ page: LIMITS() });
  await t.call('screenshot', {});
  await t.call('left_mouse_down', { target: at(32, 100) });
  const n = t.mouse().length;
  const ok = await t.call('left_mouse_up', { target: at(620, 330) });
  assert.ok(!ok.result.is_error, text(ok));
  const ev = t.mouse().slice(n);
  assert.deepEqual([ev[0].params.type, ev[0].params.x, ev[0].params.y, ev[0].params.buttons], ['mouseMoved', 32, 100, 1], 'starts at the press point, button held');
  assert.deepEqual([ev.at(-1).params.type, ev.at(-1).params.x, ev.at(-1).params.y], ['mouseReleased', 620, 330]);
});

test('RT5B-03: Take over, Stop or the end of a task leave the button held (nothing moves) but its release then asks', async () => {
  const s = exec({ page: LIMITS() });
  await s.call('screenshot', {});
  await s.call('left_mouse_down', { target: at(32, 100) });
  s.driver.uncoverPresses();
  assert.match(text(await s.call('hover', { target: ref(2) })), /still held down/);
  const asked = s.asked.length;
  const up = await s.call('left_mouse_up', { target: at(32, 100) });
  assert.ok(!up.result.is_error, text(up));
  assert.equal(s.asked.length, asked + 1, 'the release asked');
  assert.equal(s.asked.at(-1).verb, 'Release the mouse on');
});

test('RT5B-04: a range input and a role=slider are "a slider" on the card, and a press on one says it sets the value there', async () => {
  const s = exec({ page: LIMITS() });
  await s.call('screenshot', {});
  await s.call('left_mouse_down', { target: at(320, 210) });
  const c = s.asked[0];
  assert.equal(c.role, 'a slider');
  assert.match(c.detail, /pressing on a slider sets it to the value at that point/);
  await s.call('left_mouse_up', { target: at(320, 210) });
  const k = exec({ page: LIMITS() });
  await k.call('read_page', {});
  await k.call('left_click', { target: ref(3) });
  assert.equal(k.asked[0].role, 'a slider');
  assert.match(k.asked[0].detail, /clicking a slider sets it to the value at that point/);
});

// ---------------------------------------------------------------------------------------------
// RT5C-01 / RT5C-02: addresses are matched exactly and shown whole

test('RT5C-01: after reading another site, every address that is not exactly a seen link asks "Send this address", showing it; the exact seen link does not', async () => {
  const r = await rig({ url: 'https://s.example/blog', page: { title: 'Blog', elements: [] }, owner: (p) => (p.title.startsWith('Send this address') ? 'cancel' : 'approve') });
  try {
    const pol = r.run.policy;
    pol.noteRead('mail.example', 'https://mail.example/inbox');
    pol.noteRead('s.example', 'https://s.example/blog');
    pol.noteLinks(['https://s.example/article/2', 'https://s.example/about?lang=en&v=1']);
    // Going on to the blog after the mail: asked once (a plain carry-on).
    assert.equal(await pol.crossSite('s.example', { url: 'https://s.example/article/2' }), null);
    assert.equal(r.prompts.at(-1).title, 'Carry on to s.example?');
    const n = r.prompts.length;
    assert.equal(await pol.crossSite('s.example', { url: 'https://s.example/article/2' }), null, 'the exact seen link: nothing more');
    assert.equal(r.prompts.length, n);
    const variants = [
      'https://s.example/article/2;c=1', 'https://s.example/ARTICLE/2', 'https://s.example/article/1%2F..%2F2', 'https://s.example/article////2', 'https://s.example/%61rticle/2',
      'https://s.example/article/2/', 'https://s.example/about?v=1&lang=en', 'https://s.example/about?lang=EN&v=1', 'https://c1.s.example/', 'https://s.example:48291/', 'https://s.example/#c=1', 'https://s.example/?',
    ];
    for (const url of variants) {
      const before = r.prompts.length;
      // (Each one is a new decision: the site stays denied after a Cancel, so clear that first.)
      r.run.flow.denied.clear();
      const res = await pol.crossSite('s.example', { url });
      const p = r.prompts[before];
      assert.ok(p, `${url}: asked`);
      assert.equal(p.title, 'Send this address to s.example?', url);
      assert.ok(p.body.includes(new URL(url).href) && p.address.includes(new URL(url).href), `${url}: shown as it is sent (${p.body})`);
      assert.match(res, /^Blocked/, url);
    }
    // A port is text only when the task has not seen it: a new site's root on a port seen on
    // another page asks nothing more than going on to that site; another port shows the address.
    r.run.flow.denied.clear();
    pol.noteRead('box.example', 'http://box.example:4100/inbox');
    let before = r.prompts.length;
    assert.equal(await pol.crossSite('t.example', { url: 'http://t.example:4100/' }), null);
    assert.equal(r.prompts.slice(before).map((p) => p.title).join(), 'Carry on to t.example?');
    before = r.prompts.length;
    assert.match(await pol.crossSite('t.example', { url: 'http://t.example:4101/' }), /^Blocked/);
    assert.equal(r.prompts[before]?.title, 'Send this address to t.example?');
  } finally {
    await r.done();
  }
});

test('RT5C-02: the card shows the #fragment, the port and the host; addresses with user:password@ and over-long ones are refused; nothing is shortened', async () => {
  assert.equal(cardAddress('https://blog.example/#c=482913'), 'https://blog.example/#c=482913');
  assert.equal(cardAddress('http://www.blog.example:7319/x'), 'http://www.blog.example:7319/x');
  assert.equal(cardAddress(`https://blog.example/search?q=desk${encodeURIComponent(TAG('48'))}`), `https://blog.example/search?q=desk%F3%A0%80%B4%F3%A0%80%B8 (reads as: https://blog.example/search?q=desk[U+E0034][U+E0038])`);
  const long = `https://blog.example/${'a'.repeat(450)}?c=482913`;
  assert.ok(cardAddress(long).endsWith('?c=482913'), 'shown whole');
  assert.match(normalizeNavigateUrl('https://u482913:pw@blog.example/members').error, /user name or password/);
  assert.match(normalizeNavigateUrl(`https://blog.example/${'a'.repeat(2100)}`).error, /at most 2000 characters/);
  // Refused before the cross-site check or any load, also when /members is a seen link.
  const r = await rig({ url: 'https://blog.example/', page: { title: 'Blog', elements: [] } });
  try {
    r.run.policy.noteRead('mail.example', 'https://mail.example/');
    r.run.policy.noteLinks(['https://blog.example/members']);
    const nav = await r.call('navigate', { url: 'https://u482913:pw@blog.example/members' });
    assert.match(text(nav), /user name or password/);
    assert.equal(r.fb.calls.filter((c) => c.method === 'Page.navigate').length, 0);
    assert.equal(r.prompts.filter((p) => p.kind === 'confirm').length, 0);
    // A port asks, and shows it.
    const port = r.run.policy.crossSite('blog.example', { url: 'https://blog.example:7319/' });
    for (let i = 0; i < 200 && !r.prompts.some((p) => p.title.startsWith('Send this address')); i++) await sleep(5);
    const card = r.prompts.find((p) => p.title.startsWith('Send this address'));
    assert.ok(card && card.address === 'https://blog.example:7319/', JSON.stringify(r.prompts.map((p) => p.title)));
    await port;
  } finally {
    await r.done();
  }
});

// ---------------------------------------------------------------------------------------------
// RT5C-03: what Claude types or sets is shown whole, nothing hidden; refused after a read elsewhere

test('RT5C-03: revealText makes everything that would not show visible (tag letters, variation selectors, zero-width, no-break spaces, runs of spaces, blank letters, look-alikes)', () => {
  assert.equal(revealText(`desk lamp${TAG('48')}`), 'desk lamp[U+E0034][U+E0038]');
  assert.equal(revealText('a​b‌c‍'), 'a[ZWSP]b[ZWNJ]c[ZWJ]');
  assert.equal(revealText('desk     lamp  ideas'), 'desk[5 spaces]lamp[NBSP][NBSP]ideas');
  assert.equal(revealText('x️y⠀zㅤ'), 'x[U+FE0F]y[U+2800]z[U+3164]');
  assert.equal(revealText('a­b͏c'), 'a[SHY]b[U+034F]c');
  assert.equal(revealText('pаypal'), 'p[U+0430 а]ypal', 'a Cyrillic letter inside a Latin word');
  assert.equal(revealText('Москва iPhone用ケース café'), 'Москва iPhone用ケース café', 'ordinary words in other scripts stay as they are');
  assert.equal(revealText('line\nnext'), 'line[new line]next');
  assert.equal(hiddenText('best desk lamp for home office reviews'), '');
  assert.equal(hiddenText('desk     lamp'), '2 or more spaces in a row');
  assert.match(hiddenText(`desk${TAG('1')}`), /invisible/);
  assert.equal(hiddenText('one\ntwo'), '', 'a line break is Enter, not hidden');
  // The step list shows it too.
  assert.match(stepLabel('type', { text: `desk lamp${TAG('4')}` }, {}), /desk lamp\[U\+E0034\]/);
});

const SEARCH = () => ({ title: 'Search', elements: [{ role: 'searchbox', name: 'Search articles', x: 0, y: 0, w: 300, h: 24, desc: { tag: 'input', type: 'search', form: { isSearch: true, submitLabel: 'Search' } } }] });

test('RT5C-03: the type and form_input cards show the text whole with hidden characters made visible; after a read on another site such text is refused (nothing typed or set), and form_input on a search box is never an everyday step then', async () => {
  const guards = [];
  const s = exec({ url: 'https://blog.example/search', page: SEARCH(), guard: (c) => (guards.push(c), null) });
  let elsewhere = false;
  s.ex.policy.readElsewhere = () => elsewhere;
  s.ex.policy.everyday = () => true;
  await s.call('read_page', {});
  s.tab.page.focus = s.tab.page.elements[0];
  // Before reading another site: typed as asked, the card showing everything.
  const long = `best desk lamp ${'for the home office '.repeat(10)}${CODE}`;
  const ok = await s.call('form_input', { target: ref(1), value: long });
  assert.ok(!ok.result.is_error, text(ok));
  // After reading another site: refused, nothing reaches the field.
  elsewhere = true;
  s.tab.page.elements[0].value = '';
  for (const t of [`desk lamp${TAG(CODE)}`, 'best  desk     lamp', 'desk lamp', 'pаypal login']) {
    const r = await s.call('type', { text: t });
    assert.match(text(r), /^Refused: the text holds/, t);
    const f = await s.call('form_input', { target: ref(1), value: t });
    assert.match(text(f), /^Refused: the text holds/, t);
  }
  assert.equal(s.tab.page.elements[0].value, '', 'nothing was typed or set');
  // A plain search after the read: asked (never everyday), the card showing it whole.
  const plain = await s.call('form_input', { target: ref(1), value: 'desk lamp' });
  assert.ok(!plain.result.is_error, text(plain));
  assert.equal(guards.at(-1).detail, 'to "desk lamp"', 'asked, not an everyday step');
  // Too long to show: refused.
  assert.match(text(await s.call('type', { text: 'a'.repeat(1001) })), /at most 1000 characters/);
  // The card for typing shows what would not show (before any read elsewhere).
  elsewhere = false;
  s.ex.policy.everyday = () => false;
  await s.call('type', { text: 'desk  lamp​' });
  assert.match(guards.at(-1).verb, /^Type "desk\[2 spaces\]lamp\[ZWSP\]"/);
});

test('RT5C-03: after a read on another site, an address Claude wrote with a hidden character or a letter written as a code is refused before anything is asked or opened; a seen link is not', async () => {
  const r = await rig({ url: 'https://blog.example/', page: { title: 'Blog', elements: [] } });
  try {
    r.run.policy.noteRead('mail.example', 'https://mail.example/');
    for (const url of [`https://blog.example/search?q=desk${encodeURIComponent(TAG('48'))}`, 'https://blog.example/%61rticle/2', 'https://blog.example/search?q=desk%20%20lamp', 'https://blog.example/a%2fb']) {
      const nav = await r.call('navigate', { url });
      assert.match(text(nav), /^Refused: that address holds/, url);
    }
    assert.equal(r.fb.calls.filter((c) => c.method === 'Page.navigate').length, 0, 'nothing opened');
    assert.equal(r.prompts.length, 0, 'nothing asked');
    assert.equal(addressConcern('https://blog.example/search?q=desk+lamp'), '');
    assert.equal(addressConcern('https://blog.example/search?q=caf%C3%A9'), '');
  } finally {
    await r.done();
  }
});

// ---------------------------------------------------------------------------------------------
// RT5C-04: a tab's title and address shown to Claude count as reading its site

test('RT5C-04: browser_state titles and addresses, and a navigate\'s final address, count as reads: the code in a mail tab\'s title then needs the "Send this address" card (Cancel: nothing opened)', async () => {
  const r = await rig({ url: 'https://blog.example/post', page: { title: 'Desk tips', elements: [] }, always: ['blog.example', 'mail.example'], owner: (p) => (p.title.startsWith('Send this address') || p.title.startsWith('Carry on') ? (p.body.includes(CODE) ? 'cancel' : 'approve') : 'once') });
  try {
    r.fb.routes['https://mail.example/message/42'] = { title: `${CODE} is your sign-in code - Mail` };
    const nt = await r.call('new_tab', {});
    assert.ok(!nt.result.is_error, text(nt));
    const opened = await r.call('navigate', { url: 'https://mail.example/message/42' });
    assert.match(JSON.stringify(opened.result.content), new RegExp(`${CODE} is your sign-in code`), 'the title reached Claude');
    assert.ok(r.run.flow.reads.has('mail.example'), 'and counts as reading the mail site');
    await r.call('switch_tab', { tab_id: 'tab-1' });
    const leak = await r.call('navigate', { url: `https://blog.example/article/1?ref=${CODE}` });
    assert.match(text(leak), /^Blocked: the owner did not let Jarvis carry on to blog\.example/);
    const card = r.prompts.find((p) => p.title === 'Send this address to blog.example?');
    assert.ok(card && card.body.includes(`ref=${CODE}`), JSON.stringify(r.prompts.map((p) => [p.title, p.body])));
    assert.equal(r.fb.calls.filter((c) => c.method === 'Page.navigate' && c.params.url.includes(CODE)).length, 0, 'nothing reached the blog');
  } finally {
    await r.done();
  }
});

test('RT5C-04: a dialog\'s text and a page label quoted in a result count as reads of that page\'s site', async () => {
  const reads = [];
  const s = exec({ url: 'https://mail.example/inbox', page: { title: 'Inbox', elements: [{ role: 'button', name: 'Show', x: 0, y: 0, w: 80, h: 30, desc: { tag: 'button' }, onClick: (pg, fb, tab) => fb.dialog(tab, 'alert', `Your code is ${CODE}`) }] } });
  s.ex.policy.noteRead = (site, url) => reads.push([site, url]);
  s.ex.browserState = () => ({ type: 'browser_state', tabs: [] }); // (the dialog alone)
  await s.call('find', { query: 'Show' });
  reads.length = 0;
  await s.call('left_click', { target: ref(1) });
  assert.ok(reads.some(([site]) => site === 'mail.example'), JSON.stringify(reads));
});

test('RT5C-04: only what reaches Claude counts: an approved step card never makes the page in the tab "read" (a navigate away from a start page Claude never saw asks no cross-site question)', async () => {
  const r = await rig({ url: 'https://shop.example/start', page: { title: 'Start', elements: [] }, always: ['safe.example'] });
  try {
    r.fb.routes['https://safe.example/act/confirm-plan'] = { title: 'Plan' };
    const nav = await r.call('navigate', { url: 'https://safe.example/act/confirm-plan' });
    assert.ok(!nav.result.is_error, text(nav));
    assert.ok(r.prompts.some((p) => /^Open this address/.test(p.body)), 'the address that acts was asked about');
    assert.equal(r.run.flow.reads.has('shop.example'), false, 'the start page was never read');
    assert.equal(r.prompts.filter((p) => /^(Carry on|Send this address)/.test(p.title)).length, 0);
  } finally {
    await r.done();
  }
});

// ---------------------------------------------------------------------------------------------
// RT5C-05 (low): an answer link whose text names the same host but another address

test('RT5C-05: link text is kept only when it names exactly the address the link opens; otherwise the real one is shown whole', () => {
  const real = `http://x5blog.localhost:41234/track?c=${CODE}`;
  assert.equal(namesAddress('x5blog.localhost/track', real), false, 'same host, another port and query');
  assert.equal(namesAddress('x5blog.localhost:41234/track', real), false, 'another query');
  assert.equal(namesAddress(`x5blog.localhost:41234/track?c=${CODE}`, real), true);
  assert.equal(namesAddress('https://www.shop.example/orders/1042', 'https://shop.example/orders/1042'), true, '"www." aside');
  assert.equal(namesAddress('shop.example', 'https://shop.example/account'), false);
  assert.equal(shownAddress(real), real);
  assert.equal(shownAddress(`https://a.example/q?x=${encodeURIComponent(TAG('4'))}`), 'https://a.example/q?x=[U+E0034]');
});
