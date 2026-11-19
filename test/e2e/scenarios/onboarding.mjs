// Onboarding, bad API key, demo mode.

import { BAD_API_KEY, tid } from '../harness.mjs';
import { MOCK_API_KEY } from '../../server.mjs';

async function waitStep(t, onboarding, step, timeout = 10000) {
  await t.waitFor(async () => (await onboarding.getAttribute('data-step')) === step, { timeout, message: `onboarding step "${step}"` });
}

export default [
  {
    name: 'onboarding',
    title: 'Fresh install: welcome → name → key (rejected, then accepted) → ready → greeting with the name',
    device: 'iphone13',
    seed: 'fresh', // only jarvis.dev.apiBase: no key, not onboarded
    allowConsole: [/status of 401/],
    expectViolations: [{ type: 'authentication_error' }],
    async run(t) {
      await t.newPage();
      await t.goto('/', { waitReady: false });
      const ob = await t.visible('onboarding', { timeout: 20000, message: 'Onboarding should open on a fresh install' });
      await waitStep(t, ob, 'welcome');
      await t.screenshot('1-welcome');

      await (await t.visible('onboarding-next')).click();
      await waitStep(t, ob, 'name');
      await (await t.visible('onboarding-name')).fill('Tony');
      await (await t.visible('onboarding-next')).click();
      await waitStep(t, ob, 'key');

      await t.step('a rejected key shows an inline error', async () => {
        const key = await t.visible('onboarding-key');
        await key.fill(BAD_API_KEY);
        await (await t.visible('onboarding-connect')).click();
        const err = await t.visible('onboarding-error', { timeout: 20000, message: 'A rejected key should show onboarding-error' });
        t.assert((await t.text(err)).length > 0, 'onboarding-error should explain why the key was rejected');
        await t.screenshot('2-key-rejected');
      });

      await t.step('a good key connects', async () => {
        await (await t.visible('onboarding-key')).fill(MOCK_API_KEY);
        await (await t.visible('onboarding-connect')).click();
        await waitStep(t, ob, 'ready', 20000);
        await t.screenshot('3-ready');
      });

      await (await t.visible('onboarding-next')).click();
      await ob.waitFor({ state: 'hidden', timeout: 10000 });
      await t.waitReady();
      const empty = await t.visible('empty-state');
      t.assert((await t.text(empty)).includes('Tony'), `The greeting should address the owner by name ("Tony"); got: "${(await t.text(empty)).slice(0, 120)}"`);
      await t.screenshot('4-greeting');

      const keyTests = t.requests('keytest');
      t.assert(keyTests.some((r) => r.status === 200), 'The key test (non-streaming claude-haiku-5-5) should reach the mock and succeed');
      t.assert(keyTests.every((r) => r.body?.model === 'claude-haiku-5-5' && r.body?.stream !== true), 'The key test must be a non-streaming claude-haiku-5-5 request (SPEC §8.8)');
      const stored = await t.page.evaluate(() => localStorage.getItem('jarvis.apiKey'));
      t.assert(stored === MOCK_API_KEY, 'The key should be saved in localStorage["jarvis.apiKey"]');
      const bodyText = await t.page.evaluate(() => document.body.innerText);
      t.assert(!bodyText.includes(MOCK_API_KEY), 'The full API key must never be shown after entry');

      await t.reload();
      t.assert(!(await t.page.locator(tid('onboarding')).isVisible()), 'Onboarding should not come back after a reload');
    },
  },

  {
    name: 'bad-key',
    title: 'A rejected API key produces an auth error segment',
    device: 'iphone13',
    seed: { apiKey: BAD_API_KEY },
    allowConsole: [/status of 401/],
    expectViolations: [{ type: 'authentication_error' }],
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('What is the capital of France?');
      await t.waitForTurn(turn, ['error'], { timeout: 30000 });
      const err = turn.locator(tid('segment-error')).first();
      await err.waitFor({ state: 'visible', timeout: 5000 });
      const text = await t.text(err);
      t.assert(/key/i.test(text), `The error should point at the API key; got: "${text.slice(0, 160)}"`);
      await t.screenshot('auth-error');
      t.assert(t.requests('lead').every((r) => r.status === 401), 'Every lead request should have been rejected with 401');
    },
  },

  {
    name: 'demo',
    title: 'Demo mode (?demo=1) renders a scripted showcase without a key or any API call',
    device: 'iphone13',
    seed: 'empty',
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.goto('/?demo=1');
      await t.visible('turn-jarvis', { timeout: 20000, message: 'Demo mode should show a Jarvis turn' });
      await t.visible('mission-card', { timeout: 30000, message: 'The demo showcase should show a mission card' });
      t.assert(!(await t.page.locator(tid('onboarding')).isVisible()), 'Demo mode should not ask for onboarding or a key');
      await t.page.waitForTimeout(1500);
      await t.screenshot('showcase');
      t.assert(t.requests().length === 0, `Demo mode must not call the API (mock saw ${t.requests().length} requests)`);
    },
  },
];
