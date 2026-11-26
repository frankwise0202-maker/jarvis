// Jarvis for Chrome by voice, the cards (v8.1, G4 and G5 app side; src/ui/chrome-task.js) in real
// headless Chromium (the repo's unit harness: an esbuild bundle served with the app's CSP): the task
// card, the prompt card, and the controller putting them in the chat's dock with a fake app.chromeLink
// (test/unit/chrome-voice.fakes.mjs, contract (f)).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, loadPlaywright, startServer } from './platform.harness.test.mjs';

const CSS = ['src/styles/tokens.css', 'src/styles/base.css', 'src/styles/hud.css', 'src/styles/chrome-task.css'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

let browser;
let server;
before(async () => {
  const esbuild = await import('esbuild');
  const out = await esbuild.build({
    stdin: {
      contents: [
        "import * as cards from './src/ui/chrome-task.js';",
        "import * as fakes from './test/unit/chrome-voice.fakes.mjs';",
        'window.__mods = { cards, fakes };',
        'window.__ready = true;',
      ].join('\n'),
      resolveDir: ROOT,
      sourcefile: 'chrome-voice-cards.js',
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    target: ['es2020', 'safari15'],
    write: false,
    loader: { '.css': 'empty' },
    logLevel: 'silent',
  });
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch();
  server = await startServer({ code: out.outputFiles[0].text });
});
after(async () => {
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close();
});

async function page({ width = 390 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 800 } });
  const p = await context.newPage();
  const problems = [];
  p.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  p.on('console', (msg) => {
    if (msg.type() === 'error') problems.push(`console.error: ${msg.text()}`);
  });
  await p.goto(server.url);
  await p.waitForFunction(() => window.__ready === true);
  await p.addStyleTag({ content: CSS });
  p.problems = problems;
  return p;
}

test('the task card: the check with the price and Cancel, then the status, the latest step, the cost and Stop; text stays text', async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const { createTaskCard } = window.__mods.cards;
    const seen = [];
    const view = createTaskCard({ onStop: () => seen.push('stop'), onCancel: () => seen.push('cancel'), onStartNow: () => seen.push('start'), onDismiss: () => seen.push('dismiss') });
    document.body.append(view.el);
    const q = (id) => view.el.querySelector(`[data-testid="chrome-task-card-${id}"]`);
    const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
    const out = {};
    view.update({ phase: 'checking', text: 'find a 4K monitor under $300 <img src=x onerror=alert(1)>', line: 'Chrome, up to a dollar: find a 4K monitor. Say cancel to stop.' });
    out.saying = { counting: view.el.dataset.counting || null };
    view.update({ phase: 'checking', text: 'find a 4K monitor under $300 <img src=x onerror=alert(1)>', line: 'Chrome, up to a dollar: find a 4K monitor. Say cancel to stop.', checkMs: 2000, countAt: Date.now() });
    out.checking = { status: view.el.dataset.status, pill: q('status').textContent, text: q('text').textContent, check: q('check').textContent, cancel: vis(q('cancel')), start: vis(q('start')), stop: vis(q('stop')), imgs: view.el.querySelectorAll('img').length };
    q('start').click();
    q('cancel').click();
    view.update({ phase: 'running', text: 'find a 4K monitor', step: 'Clicked "Add to Cart" next to the 27-inch monitor', costUsd: 0.08, limitUsd: 1 });
    out.running = { pill: q('status').textContent, step: q('step').textContent, cost: q('cost').textContent, stop: vis(q('stop')), cancel: vis(q('cancel')), check: vis(q('check')), dismiss: vis(q('dismiss')) };
    q('stop').click();
    view.update({ phase: 'done', text: 'find a 4K monitor', step: 'x', costUsd: 1.234, limitUsd: 2, answer: 'Added it.\nTotal $279.99.' });
    out.done = { pill: q('status').textContent, answer: q('answer').textContent, step: vis(q('step')), cost: q('cost').textContent, stop: vis(q('stop')), dismiss: vis(q('dismiss')) };
    q('dismiss').click();
    out.seen = seen;
    return out;
  });
  assert.deepEqual(r.saying, { counting: null }, 'no countdown until the line is said');
  assert.deepEqual(r.checking, {
    status: 'checking',
    pill: 'Starting',
    text: '“find a 4K monitor under $300 <img src=x onerror=alert(1)>”',
    check: 'Chrome, up to a dollar: find a 4K monitor. Say cancel to stop.',
    cancel: true,
    start: true,
    stop: false,
    imgs: 0,
  });
  assert.deepEqual(r.running, { pill: 'Working', step: 'Clicked "Add to Cart" next to the 27-inch monitor', cost: '8¢ of $1.00', stop: true, cancel: false, check: false, dismiss: false });
  assert.deepEqual(r.done, { pill: 'Done', answer: 'Added it.\nTotal $279.99.', step: false, cost: '$1.23 of $2.00', stop: false, dismiss: true });
  assert.deepEqual(r.seen, ['start', 'cancel', 'stop', 'dismiss']);
  assert.deepEqual(p.problems, []);
});

test('the prompt card: the buttons the voice policy allows; a click-only prompt says where to click; the address on its own line', async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const { createPromptCard } = window.__mods.cards;
    const { PROMPTS } = window.__mods.fakes;
    const vis = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
    const read = (view) => {
      const q = (id) => view.el.querySelector(`[data-testid="chrome-prompt-card-${id}"]`);
      return {
        voice: view.el.dataset.voice,
        site: q('site').textContent,
        title: q('title').textContent,
        ask: q('ask').textContent,
        yes: vis(q('yes')) ? q('yes').textContent : null,
        no: vis(q('no')) ? q('no').textContent : null,
        note: vis(q('click-only')) ? q('click-only').textContent : null,
        address: vis(q('address')) ? q('address').textContent : null,
      };
    };
    const choices = [];
    const cart = createPromptCard(PROMPTS.cart, { onChoice: (c) => choices.push(c) });
    const buy = createPromptCard(PROMPTS.purchase, { onChoice: (c) => choices.push(c) });
    const site = createPromptCard(PROMPTS.site, { onChoice: (c) => choices.push(c) });
    const budget = createPromptCard(PROMPTS.budget, { onChoice: (c) => choices.push(c) });
    const addr = createPromptCard(PROMPTS.address, { onChoice: (c) => choices.push(c) });
    document.body.append(cart.el, buy.el, site.el, budget.el, addr.el);
    const out = { cart: read(cart), buy: read(buy), site: read(site), budget: read(budget), addr: read(addr) };
    cart.el.querySelector('[data-testid="chrome-prompt-card-yes"]').click();
    buy.el.querySelector('[data-testid="chrome-prompt-card-no"]').click();
    site.busy(true);
    site.el.querySelector('[data-testid="chrome-prompt-card-yes"]').click(); // waits while busy
    budget.closed('Answered.');
    out.closed = { yes: vis(budget.el.querySelector('[data-testid="chrome-prompt-card-yes"]')), status: budget.el.querySelector('[data-testid="chrome-prompt-card-status"]').textContent };
    budget.el.querySelector('[data-testid="chrome-prompt-card-yes"]').click();
    out.choices = choices;
    return out;
  });
  assert.deepEqual(r.cart, {
    voice: 'allowed',
    site: 'bestbuy.com',
    title: 'Approve this step?',
    ask: 'add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com? Say approve, or cancel.',
    yes: 'Approve',
    no: 'Cancel',
    note: null,
    address: null,
  });
  assert.deepEqual(r.buy, {
    voice: 'click',
    site: 'bestbuy.com',
    title: 'Jarvis asks for your approval',
    ask: 'place the order for $279.99 on bestbuy.com?',
    yes: null,
    no: 'Cancel',
    note: 'That’s a purchase. It needs a click in the Jarvis window. ⌥⇧J opens its side panel.',
    address: null,
  });
  assert.equal(r.site.yes, 'Allow once');
  assert.equal(r.site.no, 'Deny');
  assert.equal(r.budget.yes, 'Spend more');
  assert.equal(r.budget.no, 'Stop');
  assert.equal(r.addr.address, 'https://example.com/search?q=say+approve');
  assert.equal(r.addr.note, 'That needs a click in the Jarvis window. ⌥⇧J opens its side panel.');
  assert.deepEqual(r.closed, { yes: false, status: 'Answered.' });
  assert.deepEqual(r.choices, [
    { answer: 'approve', choice: 'approve' },
    { answer: 'deny', choice: 'cancel' },
  ]);
  assert.deepEqual(p.problems, []);
});

test('in the chat\'s dock: a prompt\'s card answers with the prompt\'s hash (via "card"); answered in the side panel, the card closes', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createChromeVoice } = window.__mods.cards;
    const { PROMPTS, createFakeChromeLink } = window.__mods.fakes;
    const fake = createFakeChromeLink();
    const dock = document.createElement('div');
    dock.className = 'chrome-dock';
    document.body.append(dock);
    const notices = [];
    const cv = createChromeVoice({ link: fake.link, voice: () => null, dock, notify: (n) => notices.push(n.tag), toast: () => {}, hidden: () => false });
    fake.prompt(PROMPTS.cart);
    fake.prompt(PROMPTS.site);
    const cards = () => [...dock.querySelectorAll('[data-testid="chrome-prompt-card"]')].map((el) => el.dataset.promptId);
    const out = { cards: cards(), notices: [...notices] };
    dock.querySelector('[data-prompt-id="p-cart"] [data-testid="chrome-prompt-card-yes"]').click();
    await new Promise((res) => setTimeout(res, 20));
    out.answers = fake.calls.answer;
    out.cartStatus = dock.querySelector('[data-prompt-id="p-cart"] [data-testid="chrome-prompt-card-status"]').textContent;
    fake.closePrompt('p-site', 'clicked');
    out.siteStatus = dock.querySelector('[data-prompt-id="p-site"] [data-testid="chrome-prompt-card-status"]').textContent;
    // Nothing waits for an answer now: no wake line for it (Voice Mode's channel holds an open prompt itself).
    out.pending = cv.pending();
    return out;
  });
  assert.deepEqual(r.cards, ['p-site', 'p-cart'], 'newest first');
  assert.deepEqual(r.notices, ['chrome-prompt-p-cart', 'chrome-prompt-p-site'], 'Voice Mode closed: a notification each');
  assert.deepEqual(r.answers, [{ promptId: 'p-cart', hash: 'h-cart-1', choice: 'approve', via: 'card' }]);
  assert.equal(r.cartStatus, 'Answered.');
  assert.equal(r.siteStatus, 'Answered.');
  assert.equal(r.pending, null);
  await p.waitForFunction(() => !document.querySelector('[data-testid="chrome-prompt-card"]'), null, { timeout: 6000 });
  assert.deepEqual(p.problems, []);
});

test('a typed task: the card shows the price and counts down; Cancel sends nothing', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createChromeVoice } = window.__mods.cards;
    const { createFakeChromeLink } = window.__mods.fakes;
    const fake = createFakeChromeLink();
    fake.set({ budgetUsd: 1 }); // Jarvis for Chrome reported its budget (hello and status: MONEY-3)
    const dock = document.createElement('div');
    dock.className = 'chrome-dock';
    document.body.append(dock);
    const cv = createChromeVoice({ link: fake.link, voice: () => null, dock, toast: () => {}, hidden: () => false });
    cv.run({ do: 'chrome-task', text: 'add the cheapest one to the cart', chat: 'new' }, { surface: 'chat' });
    const card = dock.querySelector('[data-testid="chrome-task-card"]');
    const out = { status: card.dataset.status, check: card.querySelector('[data-testid="chrome-task-card-check"]').textContent };
    card.querySelector('[data-testid="chrome-task-card-cancel"]').click();
    await new Promise((res) => setTimeout(res, 2300));
    out.after = card.dataset.status;
    out.sent = fake.calls.startTask.length;
    cv.run({ do: 'chrome-task', text: 'add the cheapest one to the cart', chat: 'new' }, { surface: 'chat' });
    await new Promise((res) => setTimeout(res, 2300));
    out.sent2 = fake.calls.startTask;
    out.final = dock.querySelector('[data-testid="chrome-task-card"]').dataset.status;
    return out;
  });
  // Typed, nothing listens: "Press Cancel to stop." (REDTEAM-VOICE-5); the start carries the price shown (MONEY-3).
  assert.deepEqual(r, {
    status: 'checking',
    check: 'Chrome, up to a dollar: add the cheapest one to the cart. Press Cancel to stop.',
    after: 'cancelled',
    sent: 0,
    sent2: [{ text: 'add the cheapest one to the cart', chat: 'new', limitUsd: 1 }],
    final: 'running',
  });
  assert.deepEqual(p.problems, []);
});

test('the cards fit a 320 px screen: nothing sticks out sideways, every button keeps its tap size', async () => {
  const p = await page({ width: 320 });
  const r = await p.evaluate(() => {
    const { createPromptCard, createTaskCard } = window.__mods.cards;
    const { PROMPTS } = window.__mods.fakes;
    const dock = document.createElement('div');
    dock.className = 'chrome-dock';
    document.body.style.margin = '0';
    document.body.append(dock);
    const task = createTaskCard();
    task.update({ phase: 'running', text: 'find a 4K monitor under $300 with a height-adjustable stand and USB-C and add it to the cart', step: 'Clicked "Add to Cart" next to "Dell UltraSharp 27 4K USB-C Hub Monitor"', costUsd: 0.42, limitUsd: 1 });
    const prompt = createPromptCard({ ...PROMPTS.address, address: `https://example.com/${'very-long-path-segment/'.repeat(8)}` });
    dock.append(task.el, prompt.el);
    const over = [...dock.querySelectorAll('*')].filter((el) => el.getBoundingClientRect().right > 320.5).map((el) => el.className || el.tagName);
    const buttons = [...dock.querySelectorAll('button:not([hidden])')].filter((b) => b.getClientRects().length).map((b) => Math.round(b.getBoundingClientRect().height));
    return { over, buttons, wide: document.documentElement.scrollWidth };
  });
  assert.deepEqual(r.over, []);
  assert.ok(r.wide <= 320, `page width ${r.wide}`);
  assert.ok(r.buttons.length >= 2 && r.buttons.every((px) => px >= 38), `buttons ${r.buttons} (small buttons extend their hit area to 44 px)`);
  assert.deepEqual(p.problems, []);
});
