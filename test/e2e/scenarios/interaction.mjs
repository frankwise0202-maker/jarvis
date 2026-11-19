// Interaction robustness: Send and Stop share one spot (R1: a double tap must not cancel the
// message just sent), keyboard focus follows Send → Stop → message box (A11Y-2), and the
// composer keeps the conversation in view on short screens (UX-5).

import { tid } from '../harness.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const activeTestId = (page) => page.evaluate(() => (document.activeElement === document.body ? 'BODY' : document.activeElement?.getAttribute('data-testid') || document.activeElement?.tagName));

/** Fake iOS keyboard: the visual viewport shrinks by `height`, the layout viewport doesn't. */
function installFakeKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  let kb = 0;
  const proto = Object.getPrototypeOf(vv);
  const hDesc = Object.getOwnPropertyDescriptor(proto, 'height');
  Object.defineProperty(vv, 'height', { configurable: true, get: () => hDesc.get.call(vv) - kb });
  window.__keyboard = (height) => {
    kb = height;
    vv.dispatchEvent(new Event('resize'));
  };
}

async function box(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
  }, selector);
}

export default [
  {
    name: 'double-send',
    title: 'A double tap, double-click or double key press on Send never stops the message it sent; focus goes Send → Stop → message box',
    device: 'iphone13',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');

      await t.step('phone: two taps 150 ms apart', async () => {
        await (await t.visible('composer-input')).fill('[[slow]] Double tap: what is the capital of France?');
        const b = await t.page.locator(tid('composer-send')).boundingBox();
        await t.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await sleep(150);
        await t.page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
        await t.waitForTurn(t.page.locator(tid('turn-jarvis')).first(), ['done'], { timeout: 60000 });
      });

      const d = await t.newPage({ device: 'desktop' });
      await t.goto('/', { page: d });

      await t.step('desktop: double-click', async () => {
        await d.locator(tid('composer-input')).fill('[[slow]] Double-click: what is the capital of Spain?');
        await d.locator(tid('composer-send')).dblclick();
        await t.waitForTurn(d.locator(tid('turn-jarvis')).last(), ['done'], { timeout: 60000 });
      });

      await t.step('keyboard: Space twice on Send; focus moves to Stop once it is armed, then back to the box', async () => {
        const before = await d.locator(tid('turn-jarvis')).count();
        await d.locator(tid('composer-input')).fill('[[slow]] Keyboard: what is the capital of Italy?');
        await d.locator(tid('composer-send')).focus();
        await d.keyboard.press('Space');
        await sleep(150);
        await d.keyboard.press('Space');
        const turn = d.locator(tid('turn-jarvis')).nth(before);
        await t.waitFor(async () => (await activeTestId(d)) === 'composer-stop', { timeout: 3000, message: async () => `focus on Stop once it is armed (focus is on ${await activeTestId(d)})` });
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        await t.waitFor(async () => (await activeTestId(d)) === 'composer-input', { timeout: 3000, message: async () => `focus back in the message box when Stop goes away (focus is on ${await activeTestId(d)})` });
      });

      await t.step('Stop still stops (by keyboard, once armed), and focus lands in the message box', async () => {
        const before = await d.locator(tid('turn-jarvis')).count();
        await d.locator(tid('composer-input')).fill('[[slow]] Stop me: what is the capital of Portugal?');
        await d.locator(tid('composer-send')).focus();
        await d.keyboard.press('Enter');
        const turn = d.locator(tid('turn-jarvis')).nth(before);
        await t.waitFor(async () => (await activeTestId(d)) === 'composer-stop', { timeout: 3000, message: 'focus on the armed Stop button' });
        await d.keyboard.press('Enter');
        await t.waitForTurn(turn, ['stopped'], { timeout: 15000 });
        await t.waitFor(async () => (await activeTestId(d)) === 'composer-input', { timeout: 3000, message: async () => `focus in the message box after Stop (focus is on ${await activeTestId(d)})` });
      });
    },
  },

  {
    name: 'reopen-after-kill',
    title: 'The app is closed mid-swarm: on reopening, the mission card shows Interrupted (no stale RUNNING) next to Resume',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:3]] [[slow]] Research tidal power');
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 30000 });
      await t.waitFor(async () => (await card.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).some((s) => ['starting', 'thinking', 'searching', 'reading', 'writing'].includes(s)), { timeout: 45000, message: 'an agent at work' });
      await sleep(2500); // a throttled save has written the running state
      const context = t.page.context();
      await t.page.close();
      const page = await context.newPage();
      t.attachPageGuards(page);
      t.page = page;
      await t.goto('/');
      const reopened = page.locator(tid('turn-jarvis')).last();
      await t.waitFor(async () => (await reopened.getAttribute('data-status')) === 'interrupted', { timeout: 10000, message: 'the reopened turn to show as interrupted' });
      const card2 = page.locator(tid('mission-card')).first();
      t.assert((await card2.getAttribute('data-status')) !== 'running', `The mission card is not stuck on RUNNING (got ${await card2.getAttribute('data-status')})`);
      const chips = await card2.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')));
      t.assert(!chips.some((s) => ['starting', 'thinking', 'searching', 'reading', 'writing'].includes(s)), `No agent chip still looks busy: ${chips.join(', ')}`);
      await t.visible('resume-button', { message: 'Resume is offered' });
      await t.screenshot('1-reopened');
    },
  },

  {
    name: 'short-screens',
    title: 'Keyboard up on short screens: the message box stops growing at ~22% of the view, landscape keeps Send visible and a usable conversation',
    device: 'iphone13',
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeKeyboard);
      await t.goto('/');
      await t.send('What is the capital of France?').then((turn) => t.waitForTurn(turn, ['done']));

      await t.step('portrait, keyboard up, seven lines typed', async () => {
        await t.page.focus(tid('composer-input'));
        await t.page.evaluate(() => window.__keyboard(336));
        await t.page.fill(tid('composer-input'), 'one\ntwo\nthree\nfour\nfive\nsix\nseven');
        await sleep(200);
        const input = await box(t.page, tid('composer-input'));
        const chat = await box(t.page, '.chat-scroll');
        t.assert(input.height <= Math.ceil((844 - 336) * 0.22) + 1, `The message box stays within ~22% of the visible height (got ${input.height}px)`);
        t.assert(chat.height >= 150, `The conversation keeps room above the composer (got ${chat.height}px)`);
        await t.screenshot('1-portrait-keyboard');
        await t.page.evaluate(() => window.__keyboard(0));
        await t.page.fill(tid('composer-input'), '');
      });

      const l = await t.newPage({ device: 'iphone13' });
      await l.setViewportSize({ width: 750, height: 342 });
      await l.addInitScript(installFakeKeyboard);
      await t.goto('/', { page: l });

      await t.step('landscape Safari, keyboard up (133 px left)', async () => {
        await l.focus(tid('composer-input'));
        await l.evaluate(() => window.__keyboard(209));
        await l.fill(tid('composer-input'), 'Hello');
        await sleep(300);
        const limit = 342 - 209;
        const send = await box(l, tid('composer-send'));
        t.assert(send.visible && send.bottom <= limit + 1, `Send stays above the keyboard (bottom ${send.bottom}px, keyboard at ${limit}px)`);
        const header = await box(l, '.header');
        t.assert(!header || !header.visible, 'The header steps aside while typing on a short screen');
        const chat = await box(l, '.chat-scroll');
        t.assert(chat.height >= 40, `Some conversation stays visible (got ${chat.height}px)`);
        await t.screenshot('2-landscape-keyboard', l);
        await l.evaluate(() => window.__keyboard(0));
        await sleep(200);
        t.assert((await box(l, '.header')).visible, 'The header comes back when the keyboard closes');
        t.assert((await box(l, tid('mode-auto'))).visible, 'The modes come back when the keyboard closes');
      });
    },
  },
];
