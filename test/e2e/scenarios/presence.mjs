// Presence (SPEC 2.4): the home screen as a situation display, the Needs-you ledger end to end, the
// core legend, the privacy pill, the desktop awareness rail and the Calm / Full HUD density, plus
// the home-screen acceptance checks of SPEC 2.4.21 (the fold at 390×844 with a Needs-you card; no
// sideways scroll at 320×568).

import { tid } from '../harness.mjs';

/** A recognizer that listens until stopped (headless Chromium has no speech service). */
function installListeningSpeech() {
  class FakeRecognition {
    constructor() {
      this.lang = 'en-US';
      this.onresult = this.onerror = this.onend = this.onstart = null;
      this.done = false;
    }
    start() {
      setTimeout(() => this.onstart && this.onstart({ type: 'start' }), 20);
    }
    stop() {
      if (this.done) return;
      this.done = true;
      setTimeout(() => this.onend && this.onend({ type: 'end' }), 20);
    }
    abort() {
      this.stop();
    }
  }
  window.SpeechRecognition = FakeRecognition;
  window.webkitSpeechRecognition = FakeRecognition;
}

async function box(t, selector) {
  return t.page.locator(selector).first().boundingBox();
}

export default [
  {
    name: 'presence-home',
    title: 'Presence home: state word, situation line, quick keys; a mission that ends in another chat becomes a Needs-you card (bead, header dot), View opens it; the legend; the fold and 320px checks',
    device: 'iphone13',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('empty-state');

      await t.step('the home is a situation display', async () => {
        await t.waitFor(async () => (await t.text(t.locator('state-word'))) === 'STANDING BY', { message: 'the state word STANDING BY' });
        t.assert((await t.text(t.locator('situation'))) === 'Nothing needs you.', 'The situation line says nothing needs the owner');
        for (const key of ['look', 'talk', 'brief']) await t.visible(`quick-key-${key}`, { message: `The quick key "${key}" shows` });
        t.assert((await t.count('quick-key-call')) === 0, 'No call key (no phone calls)');
        t.assert(/STANDING BY/.test(await t.text(t.locator('header-state'))), 'The header status is the state word');
        t.assert(!(await t.locator('needs-you').isVisible()), 'Needs-you is hidden while empty');
        await t.screenshot('1-home');
      });

      await t.step('a mission that finishes while the owner is in another chat needs them', async () => {
        const turn = await t.send('[[swarm:3]] Compare the best robot vacuums for pet hair');
        await turn.locator(tid('mission-card')).first().waitFor({ state: 'visible', timeout: 30000 });
        await t.locator('header-new-chat').click();
        await t.visible('empty-state');
        await t.waitFor(async () => /WORKING|THINKING/.test(await t.text(t.locator('state-word'))), { message: 'the state word to show the work in progress' });
        t.assert(/working|Working/.test(await t.text(t.locator('situation'))), `The situation line mentions the live work (got "${await t.text(t.locator('situation'))}")`);
        const card = await t.visible('needs-card', { timeout: 90000, message: 'A Needs-you card when the mission finishes elsewhere' });
        t.assert(/DONE · 3 AGENTS/.test(await t.text(card)), `The card says what finished (got "${await t.text(card)}")`);
        t.assert((await t.text(t.locator('situation'))) === 'One thing needs you.', 'The situation line counts it');
        t.assert((await t.page.locator('.header-core').getAttribute('data-alert')) === '1', 'The header orb carries the count');
        // SPEC 2.4.21: on 390×844 with one Needs-you card, the core to the quick keys sit above the composer.
        const core = await box(t, tid('hero-core'));
        const keys = await box(t, '.quick-keys');
        const composer = await box(t, '.composer');
        t.assert(core && core.y >= 56, 'The hero core is below the header');
        t.assert(keys.y + keys.height <= composer.y, `Quick keys end above the composer (${Math.round(keys.y + keys.height)} vs ${Math.round(composer.y)})`);
        await t.screenshot('2-needs-you');
        await card.locator(tid('needs-action')).click();
        await t.visible('turn-jarvis', { message: 'View opens the finished conversation' });
        await t.locator('header-new-chat').click();
        await t.visible('empty-state');
        await t.waitFor(async () => (await t.count('needs-card')) === 0 || !(await t.locator('needs-you').isVisible()), { message: 'the item to clear once seen' });
      });

      await t.step('long-press the core: what the rings mean (Voice Mode stays closed)', async () => {
        const b = await box(t, tid('hero-talk'));
        await t.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await t.page.mouse.down();
        await t.page.waitForTimeout(700);
        await t.page.mouse.up();
        const legend = await t.visible('core-legend');
        t.assert(/SPEND/.test(await t.text(legend)) && /AGENTS/.test(await t.text(legend)), 'The legend explains the gauges with live numbers');
        t.assert((await t.count('voice-mode')) === 0, 'A long-press does not open Voice Mode');
        await t.page.keyboard.press('Escape');
        await t.waitFor(async () => !(await t.locator('core-legend').isVisible()), { message: 'Escape to close the legend' });
      });

      await t.step('320×568: no sideways scroll, the keys fit in one row', async () => {
        await t.page.setViewportSize({ width: 320, height: 568 });
        await t.page.waitForTimeout(400);
        await t.checkNoHorizontalOverflow('Presence home at 320×568');
        const ys = await t.page.locator('.quick-key').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
        t.assert(new Set(ys).size === 1, `The quick keys share one row (${ys.join(', ')})`);
        await t.screenshot('3-320');
      });
    },
  },

  {
    name: 'presence-mic-pill',
    title: 'Privacy pill: dictating shows a MIC pill (and a live MIC bead) the whole time; one tap stops the mic',
    device: 'iphone13',
    timeout: 60000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installListeningSpeech);
      await t.goto('/');
      await t.visible('empty-state');
      t.assert((await t.count('live-pill')) === 0, 'No pill while nothing is live');
      await (await t.visible('composer-mic')).click();
      const pill = await t.visible('live-pill', { message: 'A LIVE pill while the mic listens' });
      t.assert((await pill.getAttribute('data-kind')) === 'mic' && /MIC/.test(await t.text(pill)), 'The pill names the mic');
      t.assert((await pill.getAttribute('aria-label')) === 'Microphone is on. Turn it off', 'The pill says how to stop it');
      const h = (await pill.boundingBox()).height;
      t.assert(Math.round(h) === 28, `The pill is 28px tall (${h})`);
      await t.screenshot('1-mic-pill');
      await pill.click();
      await t.waitFor(async () => (await t.count('live-pill')) === 0, { message: 'the pill to go when the mic stops' });
      t.assert((await t.page.locator(tid('composer-mic')).getAttribute('aria-pressed')) === 'false', 'The tap stopped listening');
    },
  },

  {
    name: 'presence-desktop',
    title: 'Desktop awareness rail replaces the empty Mission Control; a mission takes the rail; the sensor tape; Full HUD from Settings',
    device: 'desktop',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.visible('empty-state');
      await t.visible('awareness-rail', { message: 'The awareness rail shows on desktop' });
      await t.visible('rail-chronometer');
      const systems = await t.visible('rail-systems');
      t.assert(/Network/.test(await t.text(systems)) && /Not paired/i.test(await t.text(systems)), 'The Systems glance lists real readings');
      t.assert(!(await t.page.locator(tid('mission-control')).first().isVisible()), 'The empty Mission Control is gone');
      const tape = await t.visible('sensor-tape', { message: 'The sensor tape shows on wide windows' });
      t.assert(/NET\s*ONLINE/.test(await t.text(tape)), 'The tape reads the network');
      t.assert((await t.page.locator('aside.panel').getAttribute('aria-label')) === 'Awareness', 'The panel is labelled by what it shows');
      await t.screenshot('1-rail');

      const turn = await t.send('[[swarm:3]] Compare three espresso machines');
      await t.visible('mission-control', { timeout: 30000, message: 'A mission takes the rail' });
      t.assert(!(await t.locator('awareness-rail').isVisible()), 'The awareness rail steps aside for the mission');
      await t.waitForTurn(turn, ['done'], { timeout: 90000 });

      await t.locator('settings-button').click();
      const density = await t.visible('setting-hudDensity');
      await density.selectOption('full');
      await t.waitFor(async () => (await t.page.locator(tid('app')).getAttribute('data-density')) === 'full', { message: 'Full HUD to apply at once' });
      await t.page.keyboard.press('Escape');
      await t.locator('header-new-chat').click();
      await t.visible('core-readouts', { message: 'Full HUD shows the gauge labels around the core' });
      await t.screenshot('2-full-hud');
    },
  },
];
