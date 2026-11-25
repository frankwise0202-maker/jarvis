// Home base (v7.5, SPEC §23): the Jarvis Core on the owner's Alienware, reached over Tailscale. A
// fake Core (core-fakes.mjs: real-format JSON from the Core's own fixture server) answers at
// https://alienware.tail4e5f6a.ts.net/. Set-up from Settings, the tile's states (ok, warn, alert,
// GPU without its driver, unreachable, the Core down, refused) on an iPhone, on the desktop rail and on a
// 1280×720 laptop, the ask box,
// and "how's the home base" typed in the chat and said in Voice Mode, all free (no Claude request).

import { tid } from '../harness.mjs';
import { CORE_URL, coreFixtures } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';

const LINKED = { settings: { homeBaseUrl: CORE_URL } };
// A failed poll is logged by the browser ("Failed to load resource: … 403", net::ERR_…, and a CORS
// error for Tailscale's unreadable 502 while the Core is down).
const NETWORK_NOISE = [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /Access-Control-Allow-Origin|CORS policy/];
const UNREACHABLE = 'Can’t reach the home base. Is Tailscale switched on here, and is the Alienware on?';
const DOWN = 'The Alienware answered, but Jarvis Core isn’t responding. It restarts by itself; if this lasts, run jarvis-core restart on the Alienware.';

function tile(t, variant = 'home') {
  return t.page.locator(tid('homebase-tile', { 'data-variant': variant }));
}

/** Wait for a tile's phase. It polls only while on screen, so it is scrolled into view first. */
async function phase(t, variant, wanted, timeout = 15000) {
  const el = tile(t, variant);
  await el.waitFor({ state: 'visible', timeout });
  await el.scrollIntoViewIfNeeded();
  await t.waitFor(async () => (await el.getAttribute('data-phase')) === wanted, {
    timeout,
    message: async () => `the ${variant} tile to be "${wanted}" (it is "${await el.getAttribute('data-phase')}": ${await t.text(el)})`,
  });
  return el;
}

async function cell(el, key) {
  return ((await el.locator(tid(`homebase-${key}`)).textContent()) || '').trim();
}

const answerOf = (scenario, q) => coreFixtures().ask[scenario][q].answer;

export default [
  {
    name: 'homebase-setup',
    title: 'Home base on an iPhone: "not set up" on the home; Settings → Home base refuses http and other hosts, drops a pasted path, saves, and Test shows the host, version and health; the tile goes online with the Core’s real readings; the ask box answers free; Remove unlinks it',
    device: 'iphone13',
    fakeCore: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('empty-state');
      const home = tile(t);

      await t.step('not set up', async () => {
        await home.waitFor({ state: 'visible', timeout: 10000 });
        await phase(t, 'home', 'unset');
        t.assert(/NOT SET UP/.test(await t.text(home.locator(tid('homebase-status')))), 'the status says NOT SET UP');
        t.assert(await home.locator(tid('homebase-setup')).isVisible(), 'a Set up button');
        t.assert(!(await home.locator(tid('homebase-stats')).isVisible()), 'no readings (none are invented)');
        t.assert(t.core.requests.length === 0, `nothing is asked while no home base is linked (${t.core.requests.join(', ')})`);
        await t.page.waitForFunction(() => !document.querySelector('.presence-home.is-booting'), null, { timeout: 5000 });
        await home.scrollIntoViewIfNeeded();
        await t.screenshot('1-not-set-up');
      });

      await t.step('Settings → Home base: the address is checked and normalized', async () => {
        await home.locator(tid('homebase-setup')).click();
        await t.visible('settings-sheet');
        const input = await t.visible('homebase-url');
        const result = t.locator('homebase-result');
        const tryAddress = async (value, re, what) => {
          await input.fill(value);
          await t.locator('homebase-save').click();
          await t.waitFor(async () => re.test(await t.text(result)), { timeout: 5000, message: async () => `${what} (got "${await t.text(result)}")` });
        };
        await tryAddress('http://alienware.tail4e5f6a.ts.net/', /https:\/\//, 'http to be refused');
        await tryAddress('https://example.com/', /\.ts\.net/, 'a host outside .ts.net to be refused');
        t.assert(!(await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}').homeBaseUrl)), 'nothing saved yet');
        // Pasted without https:// and with a path: normalized to the Core's root.
        await input.fill('alienware.tail4e5f6a.ts.net/api/status');
        await t.locator('homebase-save').click();
        await t.waitFor(async () => (await input.inputValue()) === CORE_URL, { timeout: 5000, message: async () => `the field to show ${CORE_URL} (got ${await input.inputValue()})` });
        t.assert((await t.text(t.locator('homebase-current'))) === CORE_URL, 'saved, normalized');
        await t.waitFor(async () => /Connected to alienware · Jarvis Core 1\.0\.0 · health OK: All systems normal/.test(await t.text(result)), {
          timeout: 10000,
          message: async () => `Test to show the host, the version and the health (got "${await t.text(result)}")`,
        });
        t.assert(t.core.requests.includes('GET /api/info'), `Test calls api/info (${t.core.requests.join(', ')})`);
        const stored = await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}').homeBaseUrl);
        t.assert(stored === CORE_URL, `stored like the other settings (${stored})`);
        await t.screenshot('2-settings');
        await t.locator('settings-close').click();
      });

      await t.step('the tile goes online with the Core’s readings', async () => {
        await phase(t, 'home', 'online');
        t.assert((await home.getAttribute('data-level')) === 'ok', 'level ok');
        t.assert((await t.text(home.locator(tid('homebase-status')))) === 'ONLINE', 'ONLINE');
        t.assert((await t.text(home.locator(tid('homebase-level')))) === 'OK', 'the level word');
        t.assert((await t.text(home.locator(tid('homebase-summary')))) === 'All systems normal', 'the Core’s one-line summary');
        const got = { cpu: await cell(home, 'cpu'), gpu: await cell(home, 'gpu'), ram: await cell(home, 'ram'), disk: await cell(home, 'disk') };
        t.assert(got.cpu === '5%' && got.gpu === '40 °C' && got.ram === '33%' && got.disk === '492 GB', `the readings (${JSON.stringify(got)})`);
        await home.scrollIntoViewIfNeeded();
        await t.screenshot('3-online');
      });

      await t.step('Ask the home base: tap to open, the Core answers, free', async () => {
        const body = home.locator('.hb-ask__body');
        t.assert(!(await body.isVisible()), 'the ask box is folded on an iPhone');
        await home.locator(tid('homebase-ask-toggle')).click();
        const input = home.locator(tid('homebase-ask-input'));
        await input.waitFor({ state: 'visible', timeout: 3000 });
        await input.fill('How are you?');
        await home.locator(tid('homebase-ask-send')).click();
        const answer = home.locator(tid('homebase-answer'));
        await t.waitFor(async () => (await t.text(answer)) === answerOf('ok', 'How are you?'), { timeout: 8000, message: async () => `the Core’s answer (got "${await t.text(answer)}")` });
        t.assert(t.core.asks.includes('How are you?'), 'POST api/ask {q}');
        t.assert(t.requests('lead').length === 0, 'free: no Claude request');
        await home.scrollIntoViewIfNeeded();
        await t.screenshot('4-ask');
      });

      await t.step('Remove unlinks it', async () => {
        await t.locator('settings-button').click();
        await t.visible('settings-sheet');
        await (await t.visible('homebase-remove')).click();
        await t.waitFor(async () => /No home base linked/.test(await t.text(t.page.locator('#settings-homebase'))), { timeout: 5000, message: 'the card to say no home base is linked' });
        await t.locator('settings-close').click();
        await phase(t, 'home', 'unset');
        const stored = await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}').homeBaseUrl);
        t.assert(stored === '', `removed from the settings (${JSON.stringify(stored)})`);
      });
      await t.checkNoHorizontalOverflow('home with the tile');
    },
  },

  {
    name: 'homebase-states',
    title: 'Home base tile on an iPhone, each state from the Core’s real answers: warn, alert, GPU driver not loaded (words, never a number), unreachable ("Is Tailscale switched on here, and is the Alienware on?"), the Core down behind Tailscale (an unreadable 502: CORE DOWN, jarvis-core restart, no Set up), refused (a readable 403) and starting; Try again shows CHECKING… and re-checks',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 150000,
    async run(t) {
      await t.newPage();
      const show = async (mode, wanted) => {
        t.core.mode = mode;
        await t.reload();
        await t.visible('empty-state');
        const el = await phase(t, 'home', wanted);
        await el.scrollIntoViewIfNeeded();
        return el;
      };
      await t.goto('/');

      await t.step('warn', async () => {
        const el = await show('warn', 'online');
        t.assert((await el.getAttribute('data-level')) === 'warn', 'level warn');
        t.assert((await t.text(el.locator(tid('homebase-level')))) === 'WARNING', 'WARNING');
        t.assert((await t.text(el.locator(tid('homebase-summary')))) === coreFixtures().status.warn.health.summary, 'the Core’s summary, as it said it');
        t.assert((await cell(el, 'disk')) === '108 GB', `disk free (${await cell(el, 'disk')})`);
        await t.screenshot('1-warn');
      });

      await t.step('alert', async () => {
        const el = await show('alert', 'online');
        t.assert((await el.getAttribute('data-level')) === 'alert', 'level alert');
        t.assert((await t.text(el.locator(tid('homebase-level')))) === 'ALERT', 'ALERT');
        const got = { cpu: await cell(el, 'cpu'), gpu: await cell(el, 'gpu'), ram: await cell(el, 'ram'), disk: await cell(el, 'disk') };
        t.assert(got.cpu === '85%' && got.gpu === '85 °C' && got.ram === '96%' && got.disk === '35 GB', `the alert readings (${JSON.stringify(got)})`);
        await t.screenshot('2-alert');
      });

      await t.step('the GPU without its driver', async () => {
        const el = await show('nogpu', 'online');
        t.assert((await cell(el, 'gpu')) === 'driver not loaded', `GPU: driver not loaded (got "${await cell(el, 'gpu')}")`);
        t.assert((await t.text(el.locator(tid('homebase-level')))) === 'WARNING', 'a warning');
        await t.screenshot('3-nogpu');
      });

      await t.step('unreachable', async () => {
        const el = await show('unreachable', 'unreachable');
        t.assert((await t.text(el.locator(tid('homebase-status')))) === 'OFFLINE', 'OFFLINE');
        t.assert((await t.text(el.locator(tid('homebase-message')))) === UNREACHABLE, `the message (${await t.text(el.locator(tid('homebase-message')))})`);
        t.assert(!(await el.locator(tid('homebase-stats')).isVisible()), 'no readings (none are invented)');
        await t.screenshot('4-unreachable');
        // Back online: Try again re-checks at once.
        t.core.mode = 'ok';
        await el.locator(tid('homebase-retry')).click();
        await phase(t, 'home', 'online');
      });

      await t.step('the Core down behind Tailscale serve (an unreadable 502), and Try again', async () => {
        const el = await show('down', 'down');
        t.assert((await t.text(el.locator(tid('homebase-status')))) === 'CORE DOWN', `CORE DOWN (got "${await t.text(el.locator(tid('homebase-status')))}")`);
        t.assert((await t.text(el.locator(tid('homebase-message')))) === DOWN, `the message points at the Alienware (got "${await t.text(el.locator(tid('homebase-message')))}")`);
        t.assert(await el.locator(tid('homebase-retry')).isVisible(), 'Try again is offered');
        t.assert(!(await el.locator(tid('homebase-setup')).isVisible()), 'no Set up: the address is fine, the fix is on the Alienware');
        t.assert(t.core.requests.includes('GET /api/ping'), `the no-cors ping told it from no answer (${t.core.requests.join(', ')})`);
        await t.screenshot('5-down');
        // Try again: CHECKING… at once, the button busy, until the (slow) answer; then the time it was checked.
        t.core.delayMs = 1500;
        const retry = el.locator(tid('homebase-retry'));
        await retry.click();
        await t.waitFor(async () => (await t.text(el.locator(tid('homebase-status')))) === 'CHECKING…', { timeout: 1000, message: async () => `CHECKING… right after the tap (got "${await t.text(el.locator(tid('homebase-status')))}")` });
        t.assert(await retry.isDisabled(), 'Try again is busy while it checks');
        t.assert(/Checking/.test(await t.text(retry)), `the button says it is checking (${await t.text(retry)})`);
        await t.waitFor(async () => (await el.getAttribute('data-checking')) === 'false', { timeout: 10000, message: 'the check to finish' });
        t.core.delayMs = 0;
        t.assert((await t.text(el.locator(tid('homebase-status')))) === 'CORE DOWN', 'still down');
        t.assert(/alienware · checked \d/.test(await t.text(el.locator(tid('homebase-foot')))), `the foot says when it was checked (${await t.text(el.locator(tid('homebase-foot')))})`);
        t.assert(!(await retry.isDisabled()), 'Try again is back');
      });

      await t.step('refused', async () => {
        const el = await show('refused', 'refused');
        t.assert((await t.text(el.locator(tid('homebase-status')))) === 'REFUSED', 'REFUSED');
        t.assert(/refused the connection/.test(await t.text(el.locator(tid('homebase-message')))), 'the message says it refused');
        t.assert(/It said: requests from other devices must come through Tailscale serve/.test(await t.text(el.locator(tid('homebase-message')))), 'and why (the Core’s readable 403)');
        t.assert(await el.locator(tid('homebase-setup')).isVisible(), 'Set up (check the address) is offered');
        await t.screenshot('5-refused');
      });

      await t.step('starting', async () => {
        const el = await show('starting', 'starting');
        t.assert(/starting up/.test(await t.text(el.locator(tid('homebase-message')))), 'starting up');
      });

      await t.step('one poll per load, no stream', async () => {
        t.core.mode = 'ok';
        t.core.requests.length = 0;
        await t.reload();
        await phase(t, 'home', 'online');
        await t.page.waitForTimeout(1500);
        const polls = t.core.requests.filter((r) => r === 'GET /api/status').length;
        t.assert(polls === 1, `one status request, not one per tile (${t.core.requests.join(', ')})`);
        t.assert(!t.core.requests.some((r) => /stream/.test(r)), 'no live stream');
      });
    },
  },

  {
    name: 'homebase-desktop',
    title: 'Home base on the desktop: the tile lives in the awareness rail (the home’s copy steps aside) with the ask box open; the Systems glance and the CORE reading follow it; alert shows red',
    device: 'desktop',
    seed: LINKED,
    fakeCore: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('empty-state');
      const rail = tile(t, 'rail');

      await t.step('ok in the rail', async () => {
        await phase(t, 'rail', 'online');
        t.assert(!(await tile(t, 'home').isVisible()), 'the home’s tile steps aside on the desktop');
        t.assert((await t.text(rail.locator(tid('homebase-summary')))) === 'All systems normal', 'the summary');
        const row = t.page.locator(`${tid('rail-systems')} .glance__row[data-id="core"] .glance__value`);
        await t.waitFor(async () => /OK · online/i.test(await t.text(row)), { timeout: 5000, message: async () => `the Systems glance's Jarvis Core row (got "${await t.text(row)}")` });
        t.assert(await rail.locator(tid('homebase-ask-input')).isVisible(), 'the ask box is open in the rail');
        await rail.locator(tid('homebase-ask-input')).fill('Anything wrong?');
        await rail.locator(tid('homebase-ask-input')).press('Enter');
        const answer = rail.locator(tid('homebase-answer'));
        await t.waitFor(async () => (await t.text(answer)) === answerOf('ok', 'Anything wrong?'), { timeout: 8000, message: async () => `the answer (got "${await t.text(answer)}")` });
        t.assert(t.requests('lead').length === 0, 'free: no Claude request');
        await t.screenshot('1-rail-ok');
      });

      await t.step('alert in the rail', async () => {
        t.core.mode = 'alert';
        await t.reload();
        await phase(t, 'rail', 'online');
        await t.waitFor(async () => (await rail.getAttribute('data-level')) === 'alert', { timeout: 5000, message: 'level alert' });
        t.assert((await t.text(rail.locator(tid('homebase-level')))) === 'ALERT', 'ALERT');
        await t.screenshot('2-rail-alert');
      });
      await t.checkNoHorizontalOverflow('desktop with the rail tile');
    },
  },

  {
    name: 'homebase-laptop',
    title: 'Home base on a 1280×720 laptop: the rail’s tile sits below the rail’s fold, yet the CORE reading and the Systems glance are live (the tape and the glance keep it polling), without scrolling the rail',
    device: 'desktop',
    seed: LINKED,
    fakeCore: true,
    timeout: 90000,
    async run(t) {
      await t.newPage();
      await t.page.setViewportSize({ width: 1280, height: 720 });
      await t.goto('/');
      await t.visible('empty-state');
      await t.step('CORE and Systems are live with the tile out of sight', async () => {
        const value = t.page.locator(`${tid('sensor-tape')} .hud-tape__item[data-id="core"] .hud-tape__value`);
        await t.waitFor(async () => (await t.text(value)) === 'OK', { timeout: 10000, message: async () => `the tape's CORE reading (got "${await t.text(value)}"; requests: ${t.core.requests.join(', ') || 'none'})` });
        const row = t.page.locator(`${tid('rail-systems')} .glance__row[data-id="core"] .glance__value`);
        t.assert(/OK · online/i.test(await t.text(row)), `the Systems glance's Jarvis Core row (got "${await t.text(row)}")`);
        t.assert(t.core.requests.includes('GET /api/status'), 'polled');
        // The case that used to stall: the rail's tile is below what the rail shows (nothing scrolled).
        const box = await t.page.evaluate(() => {
          const rail = document.querySelector('[data-testid="awareness-rail"]').getBoundingClientRect();
          const tileEl = document.querySelector('[data-testid="homebase-tile"][data-variant="rail"]').getBoundingClientRect();
          return { railBottom: rail.bottom, tileTop: tileEl.top, scrolled: document.querySelector('[data-testid="awareness-rail"]').scrollTop };
        });
        t.assert(box.tileTop >= box.railBottom && box.scrolled === 0, `the rail's tile is out of sight (${JSON.stringify(box)})`);
        await t.screenshot('1-laptop');
      });
      await t.checkNoHorizontalOverflow('a 1280×720 laptop');
    },
  },

  {
    name: 'homebase-chat',
    title: '"How’s the home base?" typed in the chat is a free local exchange with the Core’s answer ("Free · Home base"); "Home base status." said in Voice Mode is answered out loud, also without a Claude request',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: true,
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['Home base status.'];
      });
      await t.goto('/');

      await t.step('typed in the chat', async () => {
        const turn = await t.send('How’s the home base?');
        await t.waitFor(async () => (await t.text(turn.locator(tid('segment-text')))) === answerOf('ok', 'How are you?'), {
          timeout: 8000,
          message: async () => `the Core's answer in the chat (got "${await t.text(turn)}")`,
        });
        t.assert(/Free · Home base/.test(await t.text(turn.locator(tid('turn-stats')))), 'the footer says it was free');
        t.assert(t.requests('lead').length === 0, 'free: no Claude request');
        await t.screenshot('1-chat');
      });

      await t.step('said in Voice Mode', async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        const want = answerOf('ok', 'home base status');
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes(want), {
          timeout: 15000,
          message: async () => `Jarvis to say the Core's answer (said: ${await t.page.evaluate(() => window.__voice.said.join(' | '))})`,
        });
        t.assert(t.requests('lead').length === 0, 'free: no Claude request');
        await t.screenshot('2-voice');
        await (await t.visible('voice-close')).click();
      });
    },
  },
];
