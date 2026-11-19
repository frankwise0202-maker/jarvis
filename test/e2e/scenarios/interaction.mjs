// Interaction robustness: Send and Stop share one spot (R1: a double tap must not cancel the
// message just sent), keyboard focus follows Send → Stop → message box (A11Y-2), and the
// composer keeps the conversation in view on short screens (UX-5).

import { tid } from '../harness.mjs';
import { makePng } from '../../mock/fixtures.mjs';

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
        // Stopped before Jarvis wrote anything: the engine withdraws the message, and the app puts
        // it back in the box to edit or send again.
        await t.waitFor(async () => (await d.locator(tid('composer-input')).inputValue()) === '[[slow]] Stop me: what is the capital of Portugal?', {
          timeout: 5000,
          message: async () => `the withdrawn message back in the composer (got "${await d.locator(tid('composer-input')).inputValue()}")`,
        });
        await d.locator(tid('toast')).filter({ hasText: 'Your message is back in the box' }).first().waitFor({ state: 'visible', timeout: 5000 });
        // And it can simply be sent again; the history the API sees stays valid.
        await d.locator(tid('composer-input')).fill('What is the capital of Portugal?');
        await d.locator(tid('composer-send')).click();
        await t.waitForTurn(d.locator(tid('turn-jarvis')).nth(before + 1), ['done'], { timeout: 30000 });
        t.assertAppendOnly();
      });

      await t.step('a photo comes back too, and is sent once', async () => {
        const before = await d.locator(tid('turn-jarvis')).count();
        await d.locator(tid('attach-input')).setInputFiles({ name: 'desk.png', mimeType: 'image/png', buffer: makePng(320, 240) });
        await t.waitFor(async () => (await d.locator(tid('attachment-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).join() === 'ready', { timeout: 15000, message: 'the photo to be ready' });
        await d.locator(tid('composer-input')).fill('[[slow]] What is on my desk?');
        await d.locator(tid('composer-send')).click();
        await t.waitFor(async () => (await d.locator(tid('composer-stop')).getAttribute('class')).includes('is-arming') === false, { timeout: 3000, message: 'Stop to arm' });
        await d.locator(tid('composer-stop')).click();
        await t.waitForTurn(d.locator(tid('turn-jarvis')).nth(before), ['stopped'], { timeout: 15000 });
        await t.waitFor(async () => (await d.locator(tid('attachment-chip')).count()) === 1, { timeout: 5000, message: 'the photo back in the composer' });
        await d.locator(tid('composer-input')).fill('What is on my desk?');
        await d.locator(tid('composer-send')).click();
        await t.waitForTurn(d.locator(tid('turn-jarvis')).nth(before + 1), ['done'], { timeout: 30000 });
        const messages = t.requests('lead').at(-1).body.messages;
        const images = messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === 'image').length;
        t.assert(images === 1, `The conversation carries the photo once (got ${images} image blocks)`);
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
    name: 'a11y-basics',
    title: 'Screen-reader announcements are queued, not dropped; focus rings show on New chat and steppers; settings chips are 44 px',
    device: 'desktop',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(() => {
        window.__announced = [];
        new MutationObserver(() => {
          const live = document.querySelector('[data-testid="live-region"]');
          const text = live && live.textContent.trim();
          if (text && window.__announced[window.__announced.length - 1] !== text) window.__announced.push(text);
        }).observe(document, { subtree: true, childList: true, characterData: true });
      });
      await t.goto('/');

      await t.step('"Mission complete" and "Reply ready" are both announced', async () => {
        const turn = await t.send('[[swarm:2]] Compare two kettles');
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        await t.waitFor(async () => {
          const said = await t.page.evaluate(() => window.__announced);
          return said.includes('Mission complete') && said.includes('Reply ready');
        }, { timeout: 10000, message: async () => `both announcements (heard: ${JSON.stringify(await t.page.evaluate(() => window.__announced))})` });
      });

      await t.step('focus rings', async () => {
        await t.page.locator(tid('new-chat')).focus();
        await t.page.keyboard.press('Shift+Tab');
        await t.page.keyboard.press('Tab');
        const ring = await t.page.evaluate(() => getComputedStyle(document.activeElement).boxShadow);
        t.assert(await t.page.evaluate(() => document.activeElement?.getAttribute('data-testid') === 'new-chat'), 'Keyboard focus is on New chat');
        t.assert(ring && ring !== 'none', `New chat shows a focus ring (box-shadow: ${ring})`);
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        const input = t.page.locator('.stepper-input').first();
        await input.scrollIntoViewIfNeeded();
        await input.focus();
        const stepperRing = await input.evaluate((el) => getComputedStyle(el.closest('.stepper')).boxShadow);
        t.assert(stepperRing && stepperRing !== 'none', `The focused stepper shows a ring (box-shadow: ${stepperRing})`);
      });

      await t.step('settings section chips are 44 px tall', async () => {
        const heights = await t.page.locator('.set-nav-btn').evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)));
        t.assert(heights.length && heights.every((hgt) => hgt >= 44), `Section chips: ${heights.join(', ')} px`);
      });
    },
  },

  {
    name: 'history-swipe',
    title: 'Phone: a left swipe that starts on a History row closes the drawer and does not open that row',
    device: 'iphone13',
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.waitForTurn(await t.send('What is the capital of France?'), ['done']);
      const newChat = t.page.locator(tid('header-new-chat'));
      if (await newChat.isVisible()) await newChat.click();
      else await t.page.keyboard.press('Control+k');
      await t.visible('empty-state');
      await (await t.visible('history-button')).click();
      const row = await t.visible('history-item', { message: 'The conversation is listed' });
      const b = await t.waitFor(async () => {
        const bb = await row.boundingBox();
        return bb && bb.x >= 0 ? bb : null;
      }, { timeout: 3000, message: 'the drawer to finish opening' });
      await sleep(150);
      const y = b.y + b.height / 2;
      const cdp = await t.page.context().newCDPSession(t.page);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x + b.width - 30, y }] });
      for (let i = 1; i <= 12; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b.x + b.width - 30 - i * 22, y: y + i }] });
        await sleep(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await t.page.locator(tid('history-drawer')).waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {
        throw new Error('A left swipe on a row should close the History drawer');
      });
      await sleep(300);
      t.assert(await t.page.locator(tid('empty-state')).isVisible(), 'The swipe did not open the conversation it started on');
    },
  },

  {
    name: 'two-windows',
    title: 'A second window on a conversation another window is running: no Resume (no double run), no sending into it, and it catches up when the run ends',
    device: 'desktop',
    timeout: 120000,
    async run(t) {
      const a = await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:2]] [[slow]] Research tidal power');
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 30000 });
      await t.waitFor(async () => (await card.locator(tid('agent-chip')).evaluateAll((els) => els.map((e) => e.getAttribute('data-status')))).some((s) => ['starting', 'thinking', 'searching', 'reading', 'writing'].includes(s)), { timeout: 45000, message: 'an agent at work' });
      await sleep(1500); // a throttled save has written the running state

      const b = await a.context().newPage(); // same browser profile: shared storage, like a second tab
      t.attachPageGuards(b);
      await t.goto('/', { page: b });
      const other = b.locator(tid('turn-jarvis')).last();
      await other.waitFor({ state: 'attached', timeout: 10000 });
      await t.visible('running-elsewhere', { page: b, message: 'The second window says the reply runs elsewhere' });
      t.assert((await b.locator(tid('resume-button')).count()) === 0, 'No Resume in the second window (it would run the swarm twice)');
      const leadCount = t.requests('lead').length;
      await b.locator(tid('composer-input')).fill('Meanwhile, a different question');
      await b.locator(tid('composer-send')).click();
      await b.locator(tid('toast')).filter({ hasText: 'another window' }).first().waitFor({ state: 'visible', timeout: 5000 });
      t.assert((await b.locator(tid('turn-jarvis')).count()) === 1, 'Nothing is sent into a conversation running elsewhere');
      await t.screenshot('1-second-window', b);

      await t.waitForTurn(turn, ['done'], { timeout: 90000 });
      await t.waitFor(async () => (await other.getAttribute('data-status')) === 'done' || (await b.locator(tid('turn-jarvis')).last().getAttribute('data-status')) === 'done', { timeout: 10000, message: 'the second window to catch up when the run ends' });
      await b.locator(tid('running-elsewhere')).waitFor({ state: 'detached', timeout: 5000 });
      t.assert(t.requests('lead').length <= leadCount + 1, `At most the first window's synthesis followed (lead requests: ${leadCount} → ${t.requests('lead').length})`);
    },
  },

  {
    name: 'storage-full',
    title: 'The device runs out of storage mid-chat: one clear warning (with Export), and History says why nothing is saved',
    device: 'iphone13',
    timeout: 60000,
    allowConsole: [/quota|QuotaExceeded|storage/i],
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(() => {
        const put = IDBObjectStore.prototype.put;
        let n = 0;
        IDBObjectStore.prototype.put = function (value, key) {
          if (this.name === 'conversations' && ++n > 1) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
          return put.call(this, value, key);
        };
      });
      await t.goto('/');
      const turn = await t.send('What is the capital of France?');
      await t.waitForTurn(turn, ['done']);
      const toast = t.page.locator(tid('toast')).filter({ hasText: 'out of storage' });
      await toast.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
        throw new Error('A "your device is out of storage" warning should appear');
      });
      t.assert((await toast.count()) === 1, 'The warning is shown once');
      t.assert(/Export/.test(await t.text(toast.first())), 'The warning offers Export');
      const second = await t.send('And of Spain?');
      await t.waitForTurn(second, ['done']);
      t.assert((await t.page.locator(tid('toast')).filter({ hasText: 'out of storage' }).count()) <= 1, 'No repeated warnings');
      await (await t.visible('history-button')).click();
      const foot = t.page.locator('.history-foot');
      await t.waitFor(async () => /Out of storage/.test(await t.text(foot)), { timeout: 5000, message: async () => `the History footer to explain (got "${await t.text(foot)}")` });
      await t.screenshot('1-history');
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
