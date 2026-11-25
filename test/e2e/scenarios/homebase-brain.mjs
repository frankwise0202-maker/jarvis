// The home base's brain (v7.6, SPEC §24): Jarvis Core 1.1 working for the owner in the background.
// A fake Core (core-fakes.mjs: the brain's API as the handoff fixes it) answers at
// https://alienware.tail4e5f6a.ts.net/. Settings → Home base (the key handed over once and never
// shown, limits, the morning briefing with this iPhone's location rounded, notifications through a
// stand-in push service), the Home base sheet (Briefing, Research with live status and a result
// rendered safely, Watching, Spending) on an iPhone and on the desktop, its states (no key, over the
// limit, a 1.0 Core, unreachable), deep links and a notification's link, the morning card, and the
// free chat and voice commands ("research … in the background", "what did the home base find?",
// "watch for …", "brief me", the wake routine's briefing). No Claude request from this device.

import { tid } from '../harness.mjs';
import { CORE_URL, fakeBriefing } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { MOCK_API_KEY } from '../../server.mjs';
import * as S from '../../unit/wake.signals.mjs';

const LINKED = { settings: { homeBaseUrl: CORE_URL } };
const NETWORK_NOISE = [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /Access-Control-Allow-Origin|CORS policy/];
const SPOKEN = fakeBriefing().spoken;
const SHOTS = '/tmp/claude-0/-home-user-jarvis/aa519e1c-700d-5a0c-b92e-8ae78b238fc5/scratchpad/core-shots/app76';

/** A stand-in push service: the browser's PushManager answers with a fake subscription (headless Chromium has none). */
function installFakePush() {
  const state = { subscribed: null, subscribes: 0, unsubscribes: 0, permissionAsks: 0 };
  window.__push = state;
  const sub = () => ({
    endpoint: 'https://push.example.com/send/fake-device-1',
    options: { applicationServerKey: state.key },
    toJSON: () => ({ endpoint: 'https://push.example.com/send/fake-device-1', expirationTime: null, keys: { p256dh: 'BPk-fake-p256dh-key', auth: 'fake-auth' } }),
    unsubscribe: async () => {
      state.unsubscribes += 1;
      state.subscribed = null;
      return true;
    },
  });
  if (window.PushManager) {
    window.PushManager.prototype.subscribe = async function subscribe(opts) {
      state.subscribes += 1;
      state.key = opts && opts.applicationServerKey;
      state.subscribed = sub();
      return state.subscribed;
    };
    window.PushManager.prototype.getSubscription = async function getSubscription() {
      return state.subscribed;
    };
  }
  let permission = 'default';
  try {
    Object.defineProperty(window.Notification, 'permission', { get: () => permission, configurable: true });
    window.Notification.requestPermission = async () => {
      state.permissionAsks += 1;
      permission = 'granted';
      return permission;
    };
  } catch {
    /* no Notification */
  }
}

async function openSheet(t, variant = 'home') {
  const tile = t.page.locator(tid('homebase-tile', { 'data-variant': variant }));
  await tile.waitFor({ state: 'visible', timeout: 15000 });
  await tile.scrollIntoViewIfNeeded();
  await t.waitFor(async () => (await tile.getAttribute('data-phase')) === 'online', { timeout: 15000, message: 'the tile to be online' });
  await tile.locator(tid('homebase-open')).click();
  return t.visible('brain-sheet');
}

async function tab(t, id) {
  await t.locator(`brain-tab-${id}`).click();
  await t.visible(`brain-panel-${id}`);
}

async function shot(t, name) {
  const file = await t.screenshot(name);
  // Copies for the lead's review.
  try {
    const { mkdir, copyFile } = await import('node:fs/promises');
    await mkdir(SHOTS, { recursive: true });
    await copyFile(file, `${SHOTS}/${t.scenario.name}-${name}.png`);
  } catch {
    /* only a copy */
  }
}

async function settingsHomeBase(t) {
  await (await t.visible('settings-button')).click();
  await t.visible('settings-sheet');
  await t.page.evaluate(() => document.querySelector('#settings-homebase')?.scrollIntoView());
  return t.visible('brain-settings');
}

export default [
  {
    name: 'brain-settings',
    title: 'Settings → Home base on an iPhone: one tap hands this device’s key to the home base (sent once, never shown), Remove; the limits; the morning briefing on/off, its time, “Use this iPhone’s location” rounded to 2 decimals, or a city; notifications turned on from a tap, the subscription sent with the Core’s key, a test, off',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: {} },
    // The Core's answer to an unknown city (400), on purpose.
    allowConsole: [/Failed to load resource: the server responded with a status of 400/],
    timeout: 150000,
    async run(t) {
      await t.newPage();
      const ctx = t.page.context();
      await ctx.grantPermissions(['geolocation']);
      await ctx.setGeolocation({ latitude: 51.507351, longitude: -0.127758 });
      await t.page.addInitScript(installFakePush);
      const logged = [];
      t.page.on('console', (m) => logged.push(m.text()));
      await t.goto('/');
      const card = await settingsHomeBase(t);

      await t.step('the key: explained, then one tap', async () => {
        await t.waitFor(async () => /no key yet/.test(await t.text(card.locator(tid('brain-key-state')))), { timeout: 10000, message: 'the key state' });
        const explain = await t.text(card.locator(tid('brain-key-explain')));
        t.assert(/while your phone is locked/.test(explain) && /\$5\.00 a day/.test(explain), `explained (${explain})`);
        await card.locator(tid('brain-key')).scrollIntoViewIfNeeded();
        await shot(t, '1-key-offer');
        await card.locator(tid('brain-key-send')).click();
        await t.waitFor(async () => /The home base has your key/.test(await t.text(card.locator(tid('brain-key-state')))), { timeout: 10000, message: 'the key to be on the home base' });
        t.assert(t.core.brain.keys.length === 1 && t.core.brain.keys[0] === MOCK_API_KEY, `this device’s key, sent once (${t.core.brain.keys.length})`);
        const hint = await t.text(card.locator(tid('brain-key-hint')));
        t.assert(/^…mnop/.test(hint), `only the hint shows (${hint})`);
        const page = await t.page.evaluate(() => document.body.innerText);
        t.assert(!page.includes(MOCK_API_KEY), 'the key never appears on the page');
        t.assert(!logged.some((l) => l.includes(MOCK_API_KEY)), 'nor in the console');
        await card.locator(tid('brain-key')).scrollIntoViewIfNeeded();
        await shot(t, '2-key-given');
      });

      await t.step('limits', async () => {
        await card.locator(tid('brain-limit-daily')).fill('7.5');
        await card.locator(tid('brain-limits-save')).click();
        await t.waitFor(async () => /Saved: \$7\.50 a day, \$50 a month/.test(await t.text(card.locator(tid('brain-limits-result')))), { timeout: 8000, message: 'the limits saved' });
        t.assert(t.core.brain.limits.dailyUsd === 7.5, `the Core’s daily limit (${t.core.brain.limits.dailyUsd})`);
        await card.locator(tid('brain-limit-daily')).fill('80');
        await card.locator(tid('brain-limits-save')).click();
        await t.waitFor(async () => /\$0 to \$50/.test(await t.text(card.locator(tid('brain-limits-result')))), { timeout: 5000, message: 'an out-of-range limit refused here' });
        t.assert(t.core.brain.limits.dailyUsd === 7.5, 'not sent');
      });

      await t.step('the morning briefing: off and on, the time, this iPhone’s location (rounded), a city', async () => {
        const b = card.locator(tid('brain-briefing-settings'));
        await b.scrollIntoViewIfNeeded();
        await b.locator(tid('brain-briefing-on')).click();
        await t.waitFor(() => t.core.brain.briefingSettings.enabled === false, { timeout: 5000, message: 'off on the Core' });
        await b.locator(tid('brain-briefing-on')).click();
        await t.waitFor(() => t.core.brain.briefingSettings.enabled === true, { timeout: 5000, message: 'on again' });
        await b.locator(tid('brain-briefing-time')).fill('06:45');
        await b.locator(tid('brain-briefing-time')).dispatchEvent('change');
        await t.waitFor(() => t.core.brain.briefingSettings.time === '06:45', { timeout: 5000, message: `the time on the Core (${t.core.brain.briefingSettings.time})` });
        t.assert(/Use this iPhone’s location/.test(await t.text(b.locator(tid('brain-loc-device')))), 'the button names the device');
        await b.locator(tid('brain-loc-device')).click();
        await t.waitFor(() => !!t.core.brain.briefingSettings.location, { timeout: 8000, message: 'the location on the Core' });
        const put = t.core.brain.settingsPuts.find((p) => p.briefing && p.briefing.location && 'lat' in p.briefing.location);
        t.assert(put && put.briefing.location.lat === 51.51 && put.briefing.location.lon === -0.13, `rounded to 2 decimals before it left the phone (${JSON.stringify(put && put.briefing.location)})`);
        await t.waitFor(async () => /Your location \(51\.51, -0\.13\)/.test(await t.text(b.locator(tid('brain-location')))), { timeout: 5000, message: 'shown' });
        await b.locator(tid('brain-city')).fill('Nowhere Special');
        await b.locator(tid('brain-city-save')).click();
        await t.waitFor(async () => /couldn't find a place called "Nowhere Special"/.test(await t.text(b.locator(tid('brain-briefing-result')))), { timeout: 5000, message: 'an unknown city said so, in the Core’s words' });
        await b.locator(tid('brain-city')).fill('Springfield');
        await b.locator(tid('brain-city-save')).click();
        await t.waitFor(async () => (await t.text(b.locator(tid('brain-location')))) === 'Springfield', { timeout: 5000, message: 'the city shown' });
        await shot(t, '3-briefing-settings');
      });

      await t.step('notifications: from a tap, with the Core’s key; a test; off', async () => {
        const p = card.locator(tid('brain-push'));
        await p.scrollIntoViewIfNeeded();
        t.assert((await t.page.evaluate(() => window.__push.permissionAsks)) === 0, 'never asked before the tap');
        await p.locator(tid('brain-push-on')).click();
        await t.waitFor(() => t.core.brain.subs.length === 1, { timeout: 10000, message: 'the subscription on the Core' });
        const sub = t.core.brain.subs[0];
        t.assert(sub.endpoint === 'https://push.example.com/send/fake-device-1' && sub.keys.auth === 'fake-auth' && sub.label === 'iPhone', `sent (${JSON.stringify(sub)})`);
        const keyLen = await t.page.evaluate(() => (window.__push.key ? new Uint8Array(window.__push.key).length : 0));
        t.assert(keyLen === 65, `subscribed with the Core’s VAPID key (${keyLen} bytes)`);
        await t.waitFor(async () => /Notifications are on for this iPhone/.test(await t.text(p.locator(tid('brain-push-state')))), { timeout: 5000, message: 'on' });
        await p.locator(tid('brain-push-test')).click();
        await t.waitFor(async () => /Sent to one device/.test(await t.text(p.locator(tid('brain-push-result')))), { timeout: 5000, message: 'the test sent' });
        t.assert(t.core.brain.pushTests === 1, 'POST api/push/test');
        await shot(t, '4-notifications');
        await p.locator(tid('brain-push-off')).click();
        await t.waitFor(() => t.core.brain.subs.length === 0, { timeout: 5000, message: 'removed from the Core' });
        t.assert((await t.page.evaluate(() => window.__push.unsubscribes)) === 1, 'and unsubscribed here');
      });

      await t.step('Remove the key', async () => {
        await card.locator(tid('brain-key')).scrollIntoViewIfNeeded();
        await card.locator(tid('brain-key-remove')).click();
        await t.waitFor(async () => /no key yet/.test(await t.text(card.locator(tid('brain-key-state')))), { timeout: 8000, message: 'no key' });
        t.assert(t.core.brain.key === null, 'gone from the Core');
      });
      t.assert(t.requests('lead').length === 0, 'no Claude request from this device');
      await t.checkNoHorizontalOverflow('Settings → Home base');
    },
  },

  {
    name: 'brain-sheet',
    title: 'The Home base sheet on an iPhone: the morning card after a new briefing; Briefing (headlines linked only from safe addresses); Research: quick or deep, live status while open, a result rendered safely with its sources, Cancel; Watching: add, check now, remove; Spending against the limits',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: { key: true, briefing: true, jobSteps: 1 } },
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.goto('/');

      await t.step('the morning card', async () => {
        const card = await t.visible('morning-card', { timeout: 10000, message: 'the morning card after a new briefing' });
        t.assert((await t.text(card.locator(tid('morning-greeting')))) === 'Good morning, Tony.', 'the greeting');
        t.assert(/41°F, partly cloudy/.test(await t.text(card.locator(tid('morning-weather')))), 'the weather');
        t.assert((await card.locator(`${tid('morning-headlines')} li`).count()) === 3, 'three headlines');
        await t.page.waitForFunction(() => !document.querySelector('.presence-home.is-booting'), null, { timeout: 5000 }).catch(() => {});
        await shot(t, '1-morning-card');
      });

      await t.step('Briefing', async () => {
        await t.locator('morning-open').click();
        await t.visible('brain-sheet');
        const panel = await t.visible('brain-panel-briefing');
        await t.waitFor(async () => (await t.text(panel.locator(tid('brain-briefing-greeting')))) === 'Good morning, Tony.', { timeout: 8000, message: 'the briefing' });
        t.assert((await panel.locator('a[href^="javascript"]').count()) === 0, 'no javascript: link');
        t.assert((await panel.locator('script').count()) === 0, 'no script element');
        t.assert(/<script>alert\(1\)<\/script>/.test(await t.text(panel)), 'the odd headline reads as its words');
        t.assert((await panel.locator('a[href="https://news.example.com/markets"]').count()) === 1, 'a real headline is a link');
        t.assert(!(await t.page.locator(tid('morning-card')).isVisible()), 'the card goes once the briefing is read');
        await shot(t, '2-briefing');
      });

      await t.step('Research: start, live status, open the result', async () => {
        await tab(t, 'research');
        await t.locator('brain-research-input').fill('Best espresso machines under $500');
        await t.locator('brain-depth-deep').check();
        await t.locator('brain-research-start').click();
        await t.waitFor(async () => /Started/.test(await t.text(t.locator('brain-research-msg'))), { timeout: 8000, message: 'started' });
        const job = t.core.brain.jobs[0];
        t.assert(job && job.prompt === 'Best espresso machines under $500' && job.depth === 'deep', `the job on the Core (${JSON.stringify(job && { prompt: job.prompt, depth: job.depth })})`);
        const row = t.page.locator(`${tid('brain-job')}[data-id="${job.id}"]`);
        await row.waitFor({ state: 'visible', timeout: 5000 });
        await shot(t, '3-research-started');
        await t.waitFor(async () => (await row.getAttribute('data-status')) === 'done', { timeout: 20000, message: async () => `the job to finish while the sheet is open (status ${await row.getAttribute('data-status')})` });
        await row.locator(tid('brain-job-open')).click();
        const body = await t.visible('brain-result-body');
        await t.waitFor(async () => /The short answer/.test(await t.text(body)), { timeout: 8000, message: 'the result' });
        t.assert((await body.locator('strong').first().textContent()) === 'Breville Bambino Plus', 'Markdown, rendered');
        t.assert((await body.locator('img').count()) === 0 && (await body.locator('script').count()) === 0, 'no HTML from the result');
        t.assert((await body.locator('a[href^="javascript"]').count()) === 0, 'no javascript: link');
        t.assert((await t.page.evaluate(() => window.__pwned)) === undefined, 'nothing ran');
        const sources = t.locator('brain-result-sources');
        t.assert((await sources.locator('a').count()) === 2, 'two sources (the javascript: one dropped)');
        await shot(t, '4-result');
        await t.locator('brain-result-back').click();
      });

      await t.step('Research: Enter (the iPhone keyboard’s send key) starts it; cancel', async () => {
        t.core.brain.jobSteps = 100;
        const input = t.locator('brain-research-input');
        await input.fill('Heat pumps for an old house');
        await input.press('Enter');
        await t.waitFor(() => t.core.brain.jobs.length === 2, { timeout: 5000, message: async () => `the second job, started by Enter (the box holds ${JSON.stringify(await input.inputValue())})` });
        t.assert(!/\n/.test(await input.inputValue()), 'Enter added no line break');
        const job = t.core.brain.jobs[0];
        const row = t.page.locator(`${tid('brain-job')}[data-id="${job.id}"]`);
        await row.locator(tid('brain-job-cancel')).click();
        await t.waitFor(async () => (await row.getAttribute('data-status')) === 'cancelled', { timeout: 8000, message: 'cancelled' });
        t.assert(job.status === 'cancelled', 'on the Core too');
      });

      await t.step('Watching: add, check now, remove', async () => {
        await tab(t, 'watching');
        await t.locator('brain-watch-input').fill('the LG 27GP850 drops under $300');
        await t.locator('brain-watch-every').selectOption('12h');
        await t.locator('brain-watch-add').click();
        await t.waitFor(() => t.core.brain.watchers.length === 1, { timeout: 5000, message: 'the watcher on the Core' });
        t.assert(t.core.brain.watchers[0].every === '12h', 'every 12 hours');
        const row = t.page.locator(tid('brain-watcher')).first();
        await row.locator(tid('brain-watcher-check')).click();
        await t.waitFor(async () => /Still \$329/.test(await t.text(row)), { timeout: 15000, message: async () => `the check’s answer (${await t.text(row)})` });
        await shot(t, '5-watching');
        await row.locator(tid('brain-watcher-remove')).click();
        await t.page.waitForTimeout(300);
        t.assert(t.core.brain.watchers.length === 1, 'one tap only asks (“Stop?”)');
        t.assert(/Stop\?/.test(await t.text(row.locator(tid('brain-watcher-remove')))), 'it asks');
        await row.locator(tid('brain-watcher-remove')).click();
        await t.waitFor(() => t.core.brain.watchers.length === 0, { timeout: 5000, message: 'removed' });
        await t.visible('brain-watchers-empty');
      });

      await t.step('Spending', async () => {
        await tab(t, 'spending');
        const today = t.locator('brain-spend-today');
        await t.waitFor(async () => /of \$5\.00/.test(await t.text(today)), { timeout: 5000, message: async () => `today against the limit (${await t.text(today)})` });
        t.assert(/This month\s*\$3\.10 of \$50/.test(await t.text(t.locator('brain-spend-month'))), `the month (${await t.text(t.locator('brain-spend-month'))})`);
        await t.waitFor(async () => (await t.locator('brain-spend-days').locator('li').count()) === 3, { timeout: 5000, message: 'the days with spending' });
        await shot(t, '6-spending');
      });
      t.assert(t.requests('lead').length === 0, 'no Claude request from this device');
      await t.checkNoHorizontalOverflow('the Home base sheet');
    },
  },

  {
    name: 'brain-states',
    title: 'The Home base sheet’s states on an iPhone: no key (free features, one “Give the home base your key” that opens Settings → Home base), over the limit (402 said plainly), a Jarvis Core 1.0 (needs an update), unreachable',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: {} },
    allowConsole: NETWORK_NOISE,
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');

      await t.step('no key', async () => {
        await openSheet(t);
        const banner = await t.visible('brain-banner');
        await t.waitFor(async () => (await banner.getAttribute('data-state')) === 'nokey', { timeout: 8000, message: 'the no-key state' });
        t.assert(/Give the home base your key/.test(await t.text(t.locator('brain-banner-action'))), 'one clear call to action');
        await tab(t, 'research');
        await t.locator('brain-research-input').fill('Anything');
        await t.locator('brain-research-start').click();
        await t.waitFor(async () => /needs your Claude key/.test(await t.text(t.locator('brain-research-msg'))), { timeout: 5000, message: 'the 409 said plainly' });
        await shot(t, '1-no-key');
        await t.locator('brain-banner-action').click();
        await t.visible('settings-sheet');
        await t.visible('brain-key-send', { message: 'Settings → Home base, at the key' });
        await (await t.visible('settings-close')).click();
      });

      await t.step('over the limit', async () => {
        t.core.brain.key = { hint: '…mnop', setAt: new Date().toISOString(), verified: true };
        t.core.brain.spend.capReached = 'daily';
        t.core.brain.spend.todayUsd = 5;
        await t.reload();
        await openSheet(t);
        const banner = await t.visible('brain-banner');
        await t.waitFor(async () => (await banner.getAttribute('data-state')) === 'cap', { timeout: 8000, message: 'the over-the-limit state' });
        t.assert(/\$5\.00 a day/.test(await t.text(banner)), 'says the limit');
        await tab(t, 'research');
        await t.locator('brain-research-input').fill('Anything');
        await t.locator('brain-research-start').click();
        await t.waitFor(async () => /reached its spending limit/.test(await t.text(t.locator('brain-research-msg'))), { timeout: 5000, message: 'the 402 said plainly' });
        await tab(t, 'spending');
        await t.waitFor(async () => (await t.locator('brain-spend-today').getAttribute('data-reached')) === 'true', { timeout: 5000, message: 'the bar shows it' });
        await shot(t, '2-over-limit');
        await (await t.visible('brain-close')).click();
      });

      await t.step('a Jarvis Core 1.0: needs an update', async () => {
        t.core.brain.enabled = false;
        await t.reload();
        await openSheet(t);
        const banner = await t.visible('brain-banner');
        await t.waitFor(async () => (await banner.getAttribute('data-state')) === 'old', { timeout: 8000, message: 'the old-Core state' });
        t.assert(/jarvis-core update/.test(await t.text(banner)), 'says how to update');
        await t.waitFor(async () => !(await t.page.locator(tid('brain-briefing-run')).isVisible()), { timeout: 8000, message: 'no “Make a new one now” that can only fail' });
        const tabText = await t.text(t.locator('brain-panel-briefing'));
        t.assert(!/jarvis-core update/.test(tabText), `the banner says it once, not the tab too (${tabText})`);
        await shot(t, '3-old-core');
        await (await t.visible('brain-close')).click();
        t.core.brain.enabled = true;
      });

      await t.step('unreachable', async () => {
        await openSheet(t);
        t.core.mode = 'unreachable';
        await (await t.visible('brain-tab-briefing')).click();
        await t.locator('brain-tab-research').click();
        await t.waitFor(async () => /Can’t reach the home base/.test(await t.text(t.locator('brain-panel-research'))) || /Can’t reach the home base/.test(await t.text(t.locator('brain-banner'))), { timeout: 15000, message: 'the unreachable words' });
        await shot(t, '4-unreachable');
        t.core.mode = 'ok';
      });
      t.assert(t.requests('lead').length === 0, 'no Claude request');
    },
  },

  {
    name: 'brain-desktop',
    title: 'The Home base on the desktop: the rail’s tile opens the sheet; ?homebase=job:<id> opens that result, ?homebase=briefing the briefing, ?homebase=watch:<id> the watcher; a tapped notification (the service worker’s HOMEBASE_LINK) opens it in an open Jarvis',
    device: 'desktop',
    seed: LINKED,
    fakeCore: { brain: { key: true, briefing: true, jobs: [{ id: 'j_done1', status: 'done', title: 'Best espresso machines under $500', summary: 'The Bambino Plus.', finishedAt: new Date().toISOString(), costUsd: 0.12, result: { markdown: '## The short answer\n\nThe **Bambino Plus**.', sources: [{ title: 'Review', url: 'https://review.example.com/espresso' }] } }] } },
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');

      await t.step('the rail’s briefing suggestion opens the home base’s new briefing (free), not a paid one', async () => {
        await t.page.locator(tid('morning-card')).waitFor({ state: 'visible', timeout: 10000 });
        await shot(t, '1-desktop-morning');
        const suggestion = t.page.locator(tid('rail-suggestion'));
        if (await suggestion.isVisible()) {
          await suggestion.click();
        } else {
          // The suggestion comes and goes with the time of day: the home's Brief me key does the same.
          await (await t.visible('quick-key-brief')).click();
        }
        await t.visible('brain-panel-briefing', { timeout: 8000, message: 'the Home base sheet’s Briefing' });
        await t.waitFor(async () => /Good morning, Tony\./.test(await t.text(t.locator('brain-panel-briefing'))), { timeout: 8000, message: 'the briefing' });
        t.assert(t.requests('lead').length === 0, 'no paid briefing protocol');
        await (await t.visible('brain-close')).click();
      });

      await t.step('from the rail', async () => {
        await openSheet(t, 'rail');
        await t.visible('brain-panel-briefing');
        await t.waitFor(async () => /Good morning, Tony\./.test(await t.text(t.locator('brain-panel-briefing'))), { timeout: 8000, message: 'the briefing' });
        await tab(t, 'research');
        await t.page.locator(`${tid('brain-job')}[data-id="j_done1"]`).waitFor({ state: 'visible', timeout: 8000 });
        await shot(t, '2-desktop-sheet');
        await (await t.visible('brain-close')).click();
      });

      await t.step('?homebase=job:<id>', async () => {
        await t.goto('/?homebase=job:j_done1');
        const body = await t.visible('brain-result-body', { timeout: 10000, message: 'the result opens' });
        await t.waitFor(async () => /The short answer/.test(await t.text(body)), { timeout: 8000, message: 'its words' });
        t.assert(!(await t.page.evaluate(() => location.search.includes('homebase'))), 'the link leaves the address');
        await shot(t, '3-deep-link-job');
        await (await t.visible('brain-close')).click();
      });

      await t.step('?homebase=briefing and ?homebase=watch:<id>', async () => {
        await t.goto('/?homebase=briefing');
        await t.visible('brain-panel-briefing', { timeout: 10000 });
        await (await t.visible('brain-close')).click();
        t.core.brain.watchers.push({ id: 'w_link', what: 'the PS6 is announced', every: '24h', status: 'met', createdAt: new Date().toISOString(), lastCheckAt: new Date().toISOString(), nextCheckAt: null, lastResult: { met: true, summary: 'Announced this morning.', sources: [] }, costUsd: 0.04, pending: false });
        await t.goto('/?homebase=watch:w_link');
        const row = t.page.locator(`${tid('brain-watcher')}[data-id="w_link"]`);
        await row.waitFor({ state: 'visible', timeout: 10000 });
        t.assert(/It happened/.test(await t.text(row)), 'the watcher that fired');
        await (await t.visible('brain-close')).click();
      });

      await t.step('a tapped notification while Jarvis is open', async () => {
        await t.page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'HOMEBASE_LINK', link: 'job:j_done1' } })));
        await t.visible('brain-result-body', { timeout: 10000, message: 'the result opens from the notification' });
        await (await t.visible('brain-close')).click();
        await t.page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'HOMEBASE_LINK', link: 'javascript:alert(1)' } })));
        await t.page.waitForTimeout(400);
        t.assert(!(await t.page.locator(tid('brain-sheet')).isVisible()), 'a forged link opens nothing');
      });
      t.assert(t.requests('lead').length === 0, 'no Claude request');
      await t.checkNoHorizontalOverflow('desktop with the Home base sheet');
    },
  },

  {
    name: 'brain-chat',
    title: 'Free chat commands with a home base linked: “research … in the background” starts a job, “what did the home base find?”, “watch for …” adds a watcher, “brief me” shows the Core’s briefing (headlines linked safely); said in Voice Mode, “brief me” is the Core’s briefing out loud; dismissed, the morning card stays away after a reload; no Claude request',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: { key: true, briefing: true, jobs: [{ id: 'j_old', status: 'done', title: 'Solar batteries for a small house', summary: 'Two good options under $8,000.', finishedAt: new Date().toISOString() }] } },
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['Brief me.'];
      });
      await t.goto('/');

      await t.step('the morning card, dismissed, stays away', async () => {
        await t.visible('morning-card', { timeout: 10000 });
        await t.locator('morning-dismiss').click();
        await t.page.locator(tid('morning-card')).waitFor({ state: 'hidden', timeout: 3000 });
        await t.reload();
        await t.page.waitForTimeout(2500);
        t.assert(!(await t.page.locator(tid('morning-card')).isVisible()), 'not offered again');
      });

      await t.step('research in the background', async () => {
        const turn = await t.send('Research the best espresso machines under $500 in the background');
        await t.waitFor(async () => /The home base is researching it/.test(await t.text(turn)), { timeout: 8000, message: async () => `the local answer (${await t.text(turn)})` });
        t.assert(t.core.brain.jobs.some((j) => j.prompt === 'the best espresso machines under $500' && j.depth === 'quick'), 'the job on the Core');
        t.assert(/Free · Home base/.test(await t.text(turn.locator(tid('turn-stats')))), 'free');
      });

      await t.step('what did the home base find', async () => {
        const turn = await t.send('What did the home base find?');
        await t.waitFor(async () => /Solar batteries for a small house/.test(await t.text(turn)), { timeout: 8000, message: async () => `the results (${await t.text(turn)})` });
      });

      await t.step('watch for', async () => {
        const turn = await t.send('Tell me when the LG 27GP850 drops under $300');
        await t.waitFor(async () => /The home base is watching for it/.test(await t.text(turn)), { timeout: 8000, message: async () => `the local answer (${await t.text(turn)})` });
        t.assert(t.core.brain.watchers.some((w) => w.what === 'When the LG 27GP850 drops under $300'), `the watcher (${t.core.brain.watchers.map((w) => w.what).join(', ')})`);
      });

      await t.step('brief me', async () => {
        const turn = await t.send('Brief me');
        await t.waitFor(async () => /Good morning, Tony\./.test(await t.text(turn)), { timeout: 8000, message: async () => `the briefing (${await t.text(turn)})` });
        t.assert((await turn.locator('a[href="https://news.example.com/markets"]').count()) === 1, 'a headline linked');
        t.assert((await turn.locator('a[href^="javascript"]').count()) === 0, 'no javascript: link');
        await turn.scrollIntoViewIfNeeded();
        await shot(t, '1-chat');
      });

      await t.step('said in Voice Mode', async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes(SPOKEN), {
          timeout: 15000,
          message: async () => `Jarvis to say the Core's briefing (said: ${await t.page.evaluate(() => window.__voice.said.join(' | '))})`,
        });
        await shot(t, '2-voice');
        await (await t.visible('voice-close')).click();
      });
      t.assert(t.requests('lead').length === 0, 'no Claude request from this device');
    },
  },

  {
    name: 'brain-chat-questions',
    title: 'Everyday questions that only look like a command go to Jarvis as before: with a home base linked (“Tell me if …”, “Let me know if …”, a past release, a colon) no watcher is made; with none linked nothing new answers at all',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: { key: true, briefing: true } },
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const ask = async (q) => {
        const before = t.requests('lead').length;
        const turn = await t.send(q);
        await t.waitForTurn(turn, ['done'], { timeout: 45000 });
        t.assert(t.requests('lead').length > before, `“${q}” reached Jarvis (Claude)`);
        t.assert(!/Free · Home base/.test(await t.text(turn)), `“${q}” was not a home base command`);
      };
      await t.step('linked: questions stay questions', async () => {
        await ask('Tell me if this email sounds less than professional: Hi Bob, send me the report now.');
        await ask('Let me know if it’s cheaper to fly or drive from Atlanta to Boston.');
        await ask('Tell me when Python 3.12 was released');
        await ask('Keep an eye on my grammar while I write this cover letter');
        t.assert(t.core.brain.watchers.length === 0, `no watcher on the home base (${t.core.brain.watchers.map((w) => w.what).join(' | ')})`);
        t.assert(t.core.brain.jobs.length === 0, 'no research job');
      });
      await t.step('not linked: nothing new answers, everything goes to Jarvis', async () => {
        await (await t.visible('settings-button')).click();
        await t.visible('settings-sheet');
        await (await t.visible('homebase-remove')).click();
        await t.waitFor(async () => /No home base linked/.test(await t.text(t.page.locator('#settings-homebase'))), { timeout: 5000, message: 'unlinked' });
        await (await t.visible('settings-close')).click();
        await ask('Tell me if there is a cheaper alternative to Photoshop');
        await ask('Watch for the LG 27GP850 dropping under $300');
        t.assert(t.core.brain.watchers.length === 0, 'no watcher');
      });
    },
  },

  {
    name: 'brain-brief-unreachable',
    title: '“Brief me” typed with the home base out of reach (Tailscale off on the phone): asked of Jarvis as before v7.6, one ordinary turn, no dead end',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { mode: 'unreachable' },
    allowConsole: NETWORK_NOISE,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('Brief me');
      await t.waitFor(() => t.requests('lead').length >= 1, { timeout: 20000, message: async () => `a Claude request (the turn says ${await t.text(turn)})` });
      await t.waitForTurn(t.page.locator(tid('turn-jarvis')).last(), ['done'], { timeout: 45000 });
      t.assert((await t.count('turn-user')) === 1, 'one “Brief me” in the chat');
      t.assert((await t.count('turn-jarvis')) === 1, 'one answer: the waiting line went');
      t.assert(!/Can’t reach the home base/.test(await t.text(t.page.locator(tid('turn-jarvis')).last())), 'no dead end');
      const msgs = t.requests('lead')[0].body?.messages || [];
      t.assert(/Brief me/.test(JSON.stringify(msgs)), 'the owner’s words were asked');
    },
  },

  {
    name: 'brain-wake',
    title: 'Standby & wake with a home base linked: two claps, “brief me”, and Jarvis says the home base’s briefing (free: no Claude request, no paid protocol)',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { brain: { key: true, briefing: true } },
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 900 });
      await t.page.addInitScript(installFakeMic, { wakeLock: true });
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await t.step('a notification tapped while Standby is on screen: Standby makes way for the briefing', async () => {
        await (await t.visible('quick-key-standby')).click();
        await t.visible('standby');
        await t.waitFor(async () => (await t.page.evaluate(() => document.querySelector('[data-testid="standby"]')?.dataset.listening)) === 'live', { timeout: 15000, message: 'Standby listening' });
        await t.page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'HOMEBASE_LINK', link: 'briefing' } })));
        await t.page.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
        const panel = await t.visible('brain-panel-briefing', { timeout: 8000, message: 'the briefing in front' });
        await t.waitFor(async () => /Good morning, Tony\./.test(await t.text(panel)), { timeout: 8000, message: 'the briefing' });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__fakeMic.live)) === 0, { timeout: 5000, message: 'Standby’s microphone released' });
        await (await t.visible('brain-close')).click();
      });
      await t.step('wake, then "brief me"', async () => {
        await (await t.visible('quick-key-standby')).click();
        await t.visible('standby');
        await t.waitFor(async () => (await t.page.evaluate(() => document.querySelector('[data-testid="standby"]')?.dataset.listening)) === 'live', { timeout: 15000, message: 'Standby listening' });
        const pad = (x) => S.concat(S.silence(0.4), x, S.silence(0.9));
        await t.page.evaluate((x) => window.__fakeMic.play(x), Array.from(pad(S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10 }))));
        await t.visible('voice-mode', { timeout: 8000 });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes('Shall I'), { timeout: 15000, message: 'the offer' });
        await t.waitFor(async () => (await t.page.evaluate(() => document.querySelector('[data-testid="voice-mode"]')?.getAttribute('data-state'))) === 'listening', { timeout: 15000, message: 'listening for the answer' });
        await t.page.evaluate(() => window.__voice.say('Brief me.'));
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes(SPOKEN), {
          timeout: 15000,
          message: async () => `the Core’s briefing said (said: ${await t.page.evaluate(() => window.__voice.said.join(' | '))})`,
        });
        await shot(t, '1-wake-briefing');
      });
      t.assert(t.requests('lead').length === 0, 'free: no Claude request, no paid briefing protocol');
    },
  },
];
