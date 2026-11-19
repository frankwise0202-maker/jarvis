// First run on a phone (UX-1, UX-2, UX-4): onboarding fields stay visible above the on-screen
// keyboard, iPhone Safari is told to install first (a key entered in Safari doesn't reach the
// Home Screen app), the installed app never offers to install itself, and demo mode is easy
// to leave from the header.

import { tid } from '../harness.mjs';
import { MOCK_API_KEY } from '../../server.mjs';

/** Fake iOS keyboard: shrinks visualViewport.height (the layout viewport stays) and fires resize. */
function installFakeKeyboard() {
  const vv = window.visualViewport;
  if (!vv) return;
  let kb = 0;
  const proto = Object.getPrototypeOf(vv);
  const hDesc = Object.getOwnPropertyDescriptor(proto, 'height');
  Object.defineProperty(vv, 'height', { configurable: true, get: () => hDesc.get.call(vv) - kb });
  window.__e2eKeyboard = (height) => {
    kb = height;
    vv.dispatchEvent(new Event('resize'));
  };
}

/** Pretend to be the installed iOS app (navigator.standalone). */
function emulateStandalone() {
  try {
    Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
  } catch {
    /* ignore */
  }
}

/** Visible px of `sel` above the keyboard and not hidden behind the onboarding action bar. */
function fieldVisiblePx(page, sel, kb) {
  return page.evaluate(
    ({ sel, kb }) => {
      const i = document.querySelector(sel).getBoundingClientRect();
      const a = document.querySelector('.ob-actions').getBoundingClientRect();
      const bottom = Math.min(i.bottom, a.top, window.innerHeight - kb);
      return { visible: Math.max(0, Math.round(bottom - Math.max(i.top, 0))), height: Math.round(i.height) };
    },
    { sel, kb },
  );
}

async function waitStep(t, page, step) {
  await t.waitFor(async () => (await page.locator(tid('onboarding')).getAttribute('data-step')) === step, { timeout: 10000, message: `onboarding step "${step}"` });
}

export default [
  {
    name: 'onboarding-keyboard',
    title: 'Onboarding: the name and key fields stay fully visible above the on-screen keyboard (portrait, Safari tab, 320px, landscape)',
    device: 'iphone13',
    seed: 'fresh',
    timeout: 90000,
    async run(t) {
      const cases = [
        { label: 'installed 390×844', w: 390, h: 844, kb: 336 },
        { label: 'Safari 390×664', w: 390, h: 664, kb: 336 },
        { label: 'small 320×568', w: 320, h: 568, kb: 253 },
        { label: 'landscape 844×390', w: 844, h: 390, kb: 209 },
      ];
      for (const c of cases) {
        await t.step(c.label, async () => {
          const page = await t.newPage();
          await page.addInitScript(installFakeKeyboard);
          await page.setViewportSize({ width: c.w, height: c.h });
          await t.goto('/', { page, waitReady: false });
          await t.visible('onboarding', { page, timeout: 20000 });
          await (await t.visible('onboarding-next', { page })).click();
          await waitStep(t, page, 'name');
          await page.focus(tid('onboarding-name'));
          await page.evaluate((kb) => window.__e2eKeyboard(kb), c.kb);
          await page.waitForSelector('.app[data-keyboard="open"]', { state: 'attached', timeout: 5000 });
          await page.waitForTimeout(500);
          const name = await fieldVisiblePx(page, tid('onboarding-name'), c.kb);
          t.assert(name.visible >= name.height, `${c.label}: the name field should be fully visible above the keyboard (${name.visible}/${name.height}px)`);
          t.assert(!(await page.locator('.ob-hero').isVisible()), `${c.label}: the hero should make room while the keyboard is open`);
          await page.fill(tid('onboarding-name'), 'Tony');
          await page.keyboard.press('Enter');
          await waitStep(t, page, 'key');
          await page.focus(tid('onboarding-key'));
          await page.waitForTimeout(400);
          const key = await fieldVisiblePx(page, tid('onboarding-key'), c.kb);
          t.assert(key.visible >= key.height, `${c.label}: the API key field should be fully visible above the keyboard (${key.visible}/${key.height}px)`);
          await t.screenshot(`kb-${c.w}x${c.h}`, page);
          // Keyboard closed again: the action bar is back and the focused field isn't under it.
          await page.evaluate(() => window.__e2eKeyboard(0));
          await page.waitForSelector('.app[data-keyboard="closed"]', { state: 'attached', timeout: 5000 });
          await page.focus(tid('onboarding-connect'));
          await page.focus(tid('onboarding-key'));
          await page.waitForTimeout(400);
          const open = await fieldVisiblePx(page, tid('onboarding-key'), 0);
          t.assert(open.visible >= open.height, `${c.label}: without the keyboard the focused key field should not be hidden by the action bar (${open.visible}/${open.height}px)`);
          await t.checkNoHorizontalOverflow(`onboarding key step ${c.label}`, page);
          await page.context().close();
        });
      }
    },
  },

  {
    name: 'onboarding-install-first',
    title: 'iPhone Safari: Welcome and Key steps say to install first, "How to install" opens the guide, continuing still works',
    device: 'iphone13', // iPhone user agent, not standalone
    seed: 'fresh',
    async run(t) {
      await t.newPage();
      await t.goto('/', { waitReady: false });
      await t.visible('onboarding', { timeout: 20000 });
      const note = await t.visible('onboarding-install-first', { message: 'iPhone Safari should show the install-first note on Welcome' });
      const text = await t.text(note);
      t.assert(/Home Screen/.test(text) && /won.t carry over/.test(text), `The note should explain that a key entered here won't carry over; got "${text}"`);
      await t.screenshot('welcome');
      await (await t.visible('onboarding-how-install')).click();
      const guide = await t.visible('install-guide', { message: '"How to install" should open the install guide' });
      t.assert(/Add to Home Screen/.test(await t.text(guide)), 'The guide should show the iPhone steps');
      t.assert((await t.page.locator(`${tid('install-guide')} [role="tab"][aria-selected="true"]`).getAttribute('data-tab')) === 'ios', 'The guide should open on the iPhone / iPad tab');
      await t.screenshot('guide');
      await t.page.locator(`${tid('install-guide')} ${tid('sheet-close')}`).click();
      await guide.waitFor({ state: 'hidden', timeout: 5000 });
      await waitStep(t, t.page, 'welcome');
      // Continue anyway.
      await (await t.visible('onboarding-next')).click();
      await waitStep(t, t.page, 'name');
      await (await t.visible('onboarding-next')).click();
      await waitStep(t, t.page, 'key');
      await t.visible('onboarding-install-first', { message: 'The Key step should repeat the install-first note' });
      await (await t.visible('onboarding-key')).fill(MOCK_API_KEY);
      await (await t.visible('onboarding-connect')).click();
      await waitStep(t, t.page, 'ready');
      await t.visible('onboarding-install', { message: 'Safari should still offer to install on the Ready step' });
    },
  },

  {
    name: 'onboarding-installed-app',
    title: 'Installed app (navigator.standalone): no install-first note and no "Install" offer anywhere in onboarding',
    device: 'iphone13',
    seed: 'fresh',
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(emulateStandalone);
      await t.goto('/', { waitReady: false });
      await t.visible('onboarding', { timeout: 20000 });
      t.assert(!(await t.page.locator(tid('onboarding-install-first')).isVisible()), 'The installed app should not ask to install first');
      await (await t.visible('onboarding-next')).click();
      await waitStep(t, t.page, 'name');
      await (await t.visible('onboarding-next')).click();
      await waitStep(t, t.page, 'key');
      t.assert(!(await t.page.locator(tid('onboarding-install-first')).isVisible()), 'The installed app should not ask to install first on the Key step');
      await (await t.visible('onboarding-key')).fill(MOCK_API_KEY);
      await (await t.visible('onboarding-connect')).click();
      await waitStep(t, t.page, 'ready');
      t.assert(!(await t.page.locator(tid('onboarding-install')).isVisible()), 'The Ready step must not offer "Install" inside the installed app');
      const text = await t.page.locator(tid('onboarding')).innerText();
      t.assert(!/install/i.test(text), `Nothing in the installed app's onboarding should mention installing; got "${text.replace(/\s+/g, ' ').slice(0, 200)}"`);
      await t.screenshot('ready');
    },
  },

  {
    name: 'demo-exit',
    title: 'Demo mode: the header DEMO badge is an "Exit demo" button (44px target) that leaves ?demo=1, and the demo says how to leave',
    device: 'iphone13',
    seed: 'fresh',
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.goto('/?demo=1&speed=20');
      const exit = await t.visible('demo-exit', { message: 'Demo mode should show the DEMO exit button in the header' });
      t.assert((await exit.getAttribute('aria-label')) === 'Exit demo', 'The DEMO badge should be labelled "Exit demo"');
      const hit = await t.page.evaluate(() => {
        const b = document.querySelector('[data-testid="demo-exit"]');
        const r = b.querySelector('.brand-badge').getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2);
        const cy = Math.round(r.top + r.height / 2);
        const hits = (x, y) => {
          const el = document.elementFromPoint(x, y);
          return el && (el === b || b.contains(el));
        };
        let w = 1;
        let hgt = 1;
        for (let d = 1; d < 40 && hits(cx - d, cy); d++) w++;
        for (let d = 1; d < 40 && hits(cx + d, cy); d++) w++;
        for (let d = 1; d < 40 && hits(cx, cy - d); d++) hgt++;
        for (let d = 1; d < 40 && hits(cx, cy + d); d++) hgt++;
        return { w, h: hgt };
      });
      t.assert(hit.w >= 44 && hit.h >= 44, `The DEMO button needs a 44px tap target; got ${hit.w}×${hit.h}`);
      // The scripted showcase runs first; then a typed message gets the "how to leave" reply.
      await t.waitFor(async () => !(await t.page.locator(tid('composer-stop')).isVisible()), { timeout: 60000, message: 'the demo showcase to finish' });
      const turn = await t.send('How do I use my own key?');
      await t.waitForTurn(turn, ['done'], { timeout: 60000 });
      const reply = await t.text(turn.locator(tid('segment-text')).first());
      t.assert(/tap DEMO at the top/.test(reply) && !reply.includes('?demo=1'), `The demo reply should say to tap DEMO (no ?demo=1 code); got "${reply.slice(0, 240)}"`);
      await t.screenshot('reply');
      await exit.click();
      await t.waitFor(async () => !new URL(t.page.url()).searchParams.has('demo'), { timeout: 10000, message: 'the URL to drop ?demo=1' });
      await t.waitReady();
      t.assert((await t.count('demo-exit')) === 0, 'After leaving the demo the DEMO button should be gone');
      await t.visible('onboarding', { message: 'Leaving the demo on a fresh install should start onboarding' });
      t.assert(t.requests().length === 0, `Demo mode and leaving it must not call the API (mock saw ${t.requests().length} requests)`);
    },
  },
];
