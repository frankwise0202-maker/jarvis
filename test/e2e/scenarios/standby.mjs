// Standby & wake (v7.4, SPEC §22): the ambient Standby screen, two claps (or "Hey Jarvis") waking
// Jarvis, and the wake routine in Voice Mode: the greeting, the Apple Music card and the briefing
// offered, "yes" / "brief me" / "go back to sleep", and Standby again afterwards. A fake microphone
// (test/e2e/fake-mic.mjs) feeds the app's real capture path (its AudioWorklet, resampler and clap
// detector) with synthetic sounds from test/unit/wake.signals.mjs; the "Hey Jarvis" path runs the
// real openWakeWord models in the real worker on a synthetic voice (Kokoro), and once with the
// localhost stand-in. Apple Music is faked (fakeMusic), speech by installFakeSpeech.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { setHidden } from './optics.mjs';
import * as S from '../../unit/wake.signals.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'unit', 'fixtures', 'wake');
const pad = (x, before = 0.4, after = 0.9) => S.concat(S.silence(before), x, S.silence(after));
const DOUBLE_CLAP = Array.from(pad(S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10 })));
const SINGLE_CLAP = Array.from(pad(S.clap({ peakDb: -10 })));
const HEY_JARVIS = () => Array.from(pad(S.readWav(readFileSync(path.join(FIX, 'hey-jarvis-george.wav'))).samples, 0.6, 1.2));

const play = (t, samples, page = t.page) => page.evaluate((x) => window.__fakeMic.play(x), samples);
// live: the Standby listener's own tracks (raw sound); all: every live track (Voice Mode's mic bands too).
const mic = (t, page = t.page) => page.evaluate(() => ({ gets: window.__fakeMic.gets, live: window.__fakeMic.standby, all: window.__fakeMic.live, stops: window.__fakeMic.stops, overlaps: window.__fakeMic.overlaps, constraints: window.__fakeMic.constraints, locks: { ...window.__fakeMic.locks } }));
const said = (t, page = t.page) => page.evaluate(() => window.__voice.said.slice());
const leadCount = (t) => t.requests('lead').length;

/** Standby's listening state (data-listening) and pill. */
async function standbyState(t, page = t.page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="standby"]');
    if (!el || el.hidden) return null;
    return { listening: el.dataset.listening, word: el.dataset.word, clap: el.dataset.clap, dim: el.dataset.dim, pill: (el.querySelector('[data-testid="standby-pill"]')?.textContent || '').trim(), hint: (el.querySelector('[data-testid="standby-hint"]')?.textContent || '').trim() };
  });
}

async function waitListening(t, page = t.page, timeout = 15000) {
  await t.waitFor(async () => (await standbyState(t, page))?.listening === 'live', { timeout, message: async () => `Standby to listen (${JSON.stringify(await standbyState(t, page))})` });
}

/** The greeting this page's clock gives (the routine follows the time of day). */
async function expectedGreeting(t, name = 'Tony') {
  const h = await t.page.evaluate(() => new Date().getHours());
  const part = h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : 'evening';
  const brief = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return { hello: `Good ${part}, ${name}.`, brief: `${brief} briefing` };
}

async function setup(t, { speech = {}, micOptions = {}, settings = {}, device } = {}) {
  await t.newPage({ device, settings });
  await t.page.addInitScript(installFakeSpeech, speech);
  await t.page.addInitScript(installFakeMic, { wakeLock: true, ...micOptions });
  await t.page.addInitScript(() => {
    window.__voice.queue = [];
  });
  await t.goto('/');
}

async function enterStandby(t) {
  await (await t.visible('quick-key-standby', { message: 'Home offers Standby' })).click();
  await t.visible('standby', { message: 'Standby opens' });
  await waitListening(t);
}

async function wakeByClaps(t) {
  await play(t, DOUBLE_CLAP);
  await t.visible('voice-mode', { timeout: 8000, message: 'two claps wake Jarvis (Voice Mode opens)' });
}

/** Wait until the fake voice has said something matching `re`; returns everything said. */
async function waitSaid(t, re, { timeout = 15000, page = t.page } = {}) {
  await t.waitFor(async () => (await said(t, page)).some((x) => re.test(x)), { timeout, message: async () => `Jarvis to say ${re} (said: ${JSON.stringify(await said(t, page))})` });
  return said(t, page);
}

async function voiceState(t, page = t.page) {
  return page.evaluate(() => document.querySelector('[data-testid="voice-mode"]')?.getAttribute('data-state') || null);
}

/** Voice Mode closed and Standby back, listening again. */
async function backInStandby(t, page = t.page) {
  await page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 10000 });
  await t.visible('standby', { page, message: 'Standby comes back' });
  await waitListening(t, page);
}

export default [
  {
    name: 'standby-screen',
    title: 'Standby from the Home key: the time, the date, the slow core, a truthful LISTENING pill, the screen kept awake; a tap leaves and releases the microphone; the core menu and Settings open it too; iPhone portrait and landscape',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await setup(t);
      await t.step('the Home key opens Standby, which listens for two claps on this device', async () => {
        await enterStandby(t);
        const st = await standbyState(t);
        t.assert(/^LISTENING ON THIS DEVICE · TWO CLAPS$/.test(st.pill), `The pill says what it listens for (${st.pill})`);
        t.assert(/Clap twice to wake Jarvis/.test(st.hint), `The hint says how to wake him (${st.hint})`);
        t.assert(/\d{1,2}:\d{2}/.test(await t.text(t.locator('standby-time'))), 'The time shows');
        t.assert((await t.text(t.locator('standby-date'))).length > 5, 'The date shows');
        t.assert(/Nothing needs you\./.test(await t.text(t.locator('standby-status'))), 'One status line from Presence');
        const m = await mic(t);
        t.assert(m.gets === 1 && m.live === 1, `One microphone capture (${JSON.stringify(m)})`);
        const a = m.constraints && m.constraints.audio;
        t.assert(a && a.echoCancellation === false && a.noiseSuppression === false && a.autoGainControl === false, `Raw sound asked for (${JSON.stringify(a)})`);
        t.assert(m.locks.held === 1, `The screen is kept awake (${JSON.stringify(m.locks)})`);
        t.assert(leadCount(t) === 0, 'Nothing was sent to Claude');
        await t.checkNoHorizontalOverflow('standby portrait');
        await t.screenshot('1-standby-portrait');
      });
      await t.step('landscape (an iPhone on its side on a charger)', async () => {
        await t.page.setViewportSize({ width: 844, height: 390 });
        await t.page.waitForTimeout(400);
        const box = await t.page.evaluate(() => {
          const r = (id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect();
          return { core: r('standby-core'), time: r('standby-time'), pill: r('standby-pill'), vh: innerHeight, vw: innerWidth };
        });
        t.assert(box.core.right <= box.time.left + 4, `The core sits beside the time (${Math.round(box.core.right)} ≤ ${Math.round(box.time.left)})`);
        t.assert(box.pill.bottom <= box.vh && box.time.bottom <= box.vh, 'Everything fits on screen');
        await t.checkNoHorizontalOverflow('standby landscape');
        await t.screenshot('2-standby-landscape');
        await t.page.setViewportSize({ width: 390, height: 844 });
      });
      await t.step('a tap leaves Standby and releases the microphone and the screen', async () => {
        await t.locator('standby').click({ position: { x: 30, y: 300 } });
        await t.page.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
        await t.waitFor(async () => (await mic(t)).live === 0, { timeout: 3000, message: 'the microphone to be released' });
        const m = await mic(t);
        t.assert(m.locks.held === 0, `The screen may sleep again (${JSON.stringify(m.locks)})`);
        await t.visible('composer-input', { message: 'The app is back' });
      });
      await t.step('the core menu (long-press the core) has Standby', async () => {
        await t.page.locator(tid('hero-core')).click({ button: 'right' });
        await (await t.visible('core-legend-standby', { message: 'The core menu offers Standby' })).click();
        await t.visible('standby');
        await waitListening(t);
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
      });
      await t.step('Settings → Voice → Wake Jarvis → Go to Standby', async () => {
        await (await t.visible('settings-button')).click();
        const card = await t.visible('settings-wake', { message: 'Settings → Voice has Wake Jarvis' });
        await card.scrollIntoViewIfNeeded();
        await t.screenshot('3-settings-wake');
        await (await t.visible('settings-standby')).click();
        await t.visible('standby');
        await waitListening(t);
        t.assert((await mic(t)).live === 1, 'One capture again');
      });
      await t.step('a small phone (320×568) and a desktop window', async () => {
        await t.page.setViewportSize({ width: 320, height: 568 });
        await t.page.waitForTimeout(300);
        await t.checkNoHorizontalOverflow('standby 320');
        const fits = await t.page.evaluate(() => {
          const pill = document.querySelector('[data-testid="standby-pill"]').getBoundingClientRect();
          const time = document.querySelector('[data-testid="standby-time"]').getBoundingClientRect();
          return pill.bottom <= innerHeight && time.top >= 0 && pill.right <= innerWidth;
        });
        t.assert(fits, 'The time and the pill fit a 320×568 phone');
        await t.screenshot('4-standby-320');
        await t.page.setViewportSize({ width: 1440, height: 900 });
        await t.page.waitForTimeout(300);
        await t.screenshot('5-standby-desktop');
      });
    },
  },
  {
    name: 'standby-double-clap',
    title: 'Two claps wake Jarvis, one does not: the microphone is released before Voice Mode listens; the greeting by the time of day with the Apple Music card and the briefing offered, no Claude request; "yes" shows the card to tap; Exit goes back to Standby',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await t.step('one clap does not wake him', async () => {
        await play(t, SINGLE_CLAP);
        await t.page.waitForTimeout(1500);
        t.assert(!(await t.page.locator(tid('voice-mode')).count()), 'Voice Mode stays closed');
        t.assert((await standbyState(t))?.listening === 'live', 'Standby still listens');
      });
      const before = leadCount(t);
      const g = await expectedGreeting(t);
      await t.step('two claps wake him: the microphone is handed over, then the greeting and the offer', async () => {
        await wakeByClaps(t);
        t.assert(!(await t.page.locator(tid('standby')).count()), 'Standby steps aside');
        const all = await waitSaid(t, /Shall I put on some AC\/DC\?/);
        const line = all.find((x) => /Shall I put on some/.test(x));
        t.assert(line.startsWith(g.hello), `The greeting follows the time of day: "${line}" (expected "${g.hello}")`);
        t.assert(line.includes(`Or I can run your ${g.brief}.`), `The briefing for this time of day is offered: "${line}"`);
        const card = t.page.locator(tid('voice-music-card')).last();
        await t.waitFor(async () => (await card.getAttribute('data-status').catch(() => null)) === 'done', { message: 'the Music card to be shown' });
        t.assert((await t.text(card.locator(tid('music-title')))) === 'Back In Black', 'Back in Black by AC/DC (nothing played lately)');
        const m = await mic(t);
        t.assert(m.overlaps === 0, `Speech recognition never started while Standby's microphone was live (${m.overlaps})`);
        t.assert(m.live === 0, 'Standby released the microphone');
        t.assert(leadCount(t) === before, 'The wake routine asked Claude nothing');
        t.assert(t.music.searches.some((u) => /back\+in\+black|back%20in%20black/i.test(u)), 'Apple Music was searched (free)');
        await t.screenshot('1-greeting');
      });
      await t.step('"yes" shows the Music card to tap (Open in Apple Music, Preview)', async () => {
        await t.waitFor(async () => (await voiceState(t)) === 'listening', { message: 'Jarvis to listen for the answer' });
        await t.page.evaluate(() => window.__voice.say('Yes, please.'));
        await waitSaid(t, /Here.s Back In Black by AC\/DC\. Tap Open in Apple Music to play it\./);
        await t.waitFor(async () => (await voiceState(t)) === 'idle', { message: 'Jarvis to wait for a tap' });
        await t.visible('music-open', { message: 'Open in Apple Music is there to tap' });
        t.assert(leadCount(t) === before, 'Still no Claude request');
        await t.screenshot('2-music');
      });
      await t.step('Exit: back to Standby (Return to standby after a conversation)', async () => {
        await (await t.visible('voice-close')).click();
        await backInStandby(t);
        const m = await mic(t);
        t.assert(m.live === 1 && m.overlaps === 0, `One capture again (${JSON.stringify(m)})`);
        t.assert(m.locks.held === 1, 'The screen is kept awake again');
      });
    },
  },
  {
    name: 'standby-welcome-home',
    title: '"Wake up, daddy\'s home" right after the claps: "Welcome home, Tony." with the offer; "no thanks" → "Very good, Tony." and Standby again, listening',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await t.step('the claps, then "wake up, daddy\'s home"', async () => {
        await t.page.evaluate(() => window.__voice.queue.push({ parts: [{ at: 300, text: 'Wake up,' }, { at: 900, text: "daddy's home." }] }));
        await wakeByClaps(t);
        const all = await waitSaid(t, /Welcome home, Tony\./);
        const line = all.find((x) => /Welcome home/.test(x));
        t.assert(/^Welcome home, Tony\. Shall I put on some AC\/DC\? Or I can run your (morning|afternoon|evening) briefing\.$/.test(line), `"${line}"`);
        t.assert(leadCount(t) === 0, 'No Claude request');
        await t.screenshot('1-welcome-home');
      });
      await t.step('"no thanks": back to sleep', async () => {
        await t.waitFor(async () => (await voiceState(t)) === 'listening', { message: 'Jarvis to listen for the answer' });
        await t.page.evaluate(() => window.__voice.say('No thanks.'));
        await waitSaid(t, /^Very good, Tony\.$/);
        await backInStandby(t);
        const m = await mic(t);
        t.assert(m.overlaps === 0, 'Never two captures at once');
        t.assert(leadCount(t) === 0, 'Still no Claude request');
        await t.screenshot('2-back-to-sleep');
      });
    },
  },
  {
    name: 'standby-brief-me',
    title: '"Brief me" after waking runs the briefing protocol in a new chat as a spoken Voice Mode turn (the first paid request); when the conversation goes quiet Jarvis returns to Standby',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t, { speech: { noSpeechMs: 900 } });
      await enterStandby(t);
      await t.step('wake, then "brief me"', async () => {
        await wakeByClaps(t);
        await waitSaid(t, /Shall I put on some/);
        await t.waitFor(async () => (await voiceState(t)) === 'listening', { message: 'Jarvis to listen for the answer' });
        t.assert(leadCount(t) === 0, 'Nothing paid yet');
        await t.page.evaluate(() => window.__voice.say('Brief me.'));
        await t.waitFor(() => leadCount(t) >= 1, { timeout: 15000, message: 'the briefing request' });
        const req = t.requests('lead')[0];
        const msgs = req.body?.messages || [];
        const text = JSON.stringify(msgs);
        t.assert(/Brief me like a crisp butler/.test(text), 'The briefing protocol was sent');
        t.assert(msgs.filter((m) => m.role === 'user').length === 1, 'In a chat of its own');
        t.assert(/spoken|ear|out loud/i.test(text), 'As a spoken Voice Mode turn');
        await t.screenshot('1-briefing');
      });
      await t.step('the reply is spoken; then silence: back to Standby', async () => {
        const turn = t.page.locator(tid('turn-jarvis')).first();
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        await backInStandby(t);
        t.assert((await mic(t)).overlaps === 0, 'Never two captures at once');
      });
    },
  },
  {
    name: 'standby-go-to-sleep',
    title: '"Jarvis, standby" in Voice Mode (opened with Talk) and "standby" typed in the chat open Standby, free',
    device: 'mac',
    timeout: 120000,
    async run(t) {
      await setup(t);
      await t.step('"Jarvis, standby" in Voice Mode', async () => {
        await t.page.evaluate(() => window.__voice.queue.push('Jarvis, standby.'));
        await (await t.visible('voice-open')).click();
        await waitSaid(t, /^Very good, Tony\.$/);
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 10000 });
        await t.visible('standby');
        await waitListening(t);
        t.assert(leadCount(t) === 0, 'No Claude request');
        await t.page.keyboard.press('Escape');
        await t.page.locator(tid('standby')).waitFor({ state: 'detached', timeout: 5000 });
        t.assert((await mic(t)).live === 0, 'Leaving releases the microphone');
      });
      await t.step('"standby" typed in the chat', async () => {
        const box = await t.visible('composer-input');
        await box.fill('standby');
        await box.press('Enter');
        await t.visible('standby');
        await waitListening(t);
        t.assert(leadCount(t) === 0, 'No Claude request');
        t.assert(!(await t.page.locator(tid('turn-user')).count()), 'Nothing went into the chat');
      });
    },
  },
  {
    name: 'standby-hey-jarvis',
    title: '"Hey Jarvis" with the real openWakeWord models in the real worker (onnxruntime-web, downloaded once from the app, checked by SHA-256): a synthetic voice saying it through the fake microphone wakes Jarvis on a Mac; Standby shows the download and then the wake word in its pill',
    device: 'mac',
    fakeMusic: true,
    timeout: 180000,
    async run(t) {
      await setup(t, { settings: { wakeWord: true } });
      await t.step('Standby downloads and readies "Hey Jarvis" (two claps work meanwhile)', async () => {
        await (await t.visible('quick-key-standby')).click();
        await t.visible('standby');
        await t.waitFor(async () => (await standbyState(t))?.word === 'ready', { timeout: 90000, message: async () => `the wake word to be ready (${JSON.stringify(await standbyState(t))})` });
        const st = await standbyState(t);
        t.assert(st.pill === 'LISTENING ON THIS DEVICE · TWO CLAPS · “HEY JARVIS”', `The pill names both (${st.pill})`);
        t.assert(/Clap twice or say “Hey Jarvis” to wake Jarvis\./.test(st.hint), `The hint (${st.hint})`);
        await t.screenshot('1-standby-word');
      });
      await t.step('a voice saying "Hey Jarvis" wakes him', async () => {
        await t.page.waitForTimeout(1500); // the pipeline's first 1.28 s of context
        await play(t, HEY_JARVIS());
        await t.visible('voice-mode', { timeout: 10000, message: '"Hey Jarvis" wakes Jarvis' });
        await waitSaid(t, /Shall I put on some/);
        const m = await mic(t);
        t.assert(m.overlaps === 0, `Never two captures at once (${JSON.stringify({ ...m, log: await t.page.evaluate(() => window.__fakeMic.log) })})`);
        await t.screenshot('2-woken-by-word');
      });
    },
  },
  {
    name: 'standby-hey-jarvis-stub',
    title: 'The "Hey Jarvis" path on an iPhone with the localhost stand-in worker: Standby listens for both, the word wakes him, and Standby comes back with the word still ready (no second download)',
    device: 'iphone13',
    fakeMusic: true,
    timeout: 120000,
    async run(t) {
      await setup(t, { settings: { wakeWord: true } });
      await t.page.evaluate(() => {
        localStorage.setItem('jarvis.dev.wakeWord', 'stub');
      });
      await t.reload();
      await t.step('Standby with the stand-in: both in the pill', async () => {
        await (await t.visible('quick-key-standby')).click();
        await t.waitFor(async () => (await standbyState(t))?.word === 'ready', { timeout: 15000, message: 'the stand-in to be ready' });
        t.assert((await standbyState(t)).pill.includes('“HEY JARVIS”'), 'The pill names the wake word');
      });
      await t.step('the word wakes him; "go back to sleep" returns, the word still ready', async () => {
        await t.page.waitForTimeout(500);
        t.assert(await t.page.evaluate(() => window.__jarvisWake.frames() > 0), 'Frames reach the worker');
        t.assert(await t.page.evaluate(() => window.__jarvisWake.say()), 'The stand-in heard it');
        await t.visible('voice-mode', { timeout: 8000 });
        await waitSaid(t, /Shall I put on some/);
        await t.waitFor(async () => (await voiceState(t)) === 'listening', { message: 'Jarvis to listen for the answer' });
        await t.page.evaluate(() => window.__voice.say('Go back to sleep.'));
        await backInStandby(t);
        await t.waitFor(async () => (await standbyState(t))?.word === 'ready', { timeout: 10000, message: 'the word ready again' });
        t.assert((await mic(t)).overlaps === 0, 'Never two captures at once');
      });
    },
  },
  {
    name: 'standby-background',
    title: 'Mac: Standby keeps listening while Jarvis is in a background tab; two claps wake him there (the wake sound and the greeting are heard), and once he is on screen he listens for the answer. iPhone: hidden pauses the microphone, shown resumes it',
    device: 'mac',
    fakeMusic: true,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await t.step('a background tab keeps listening on a Mac', async () => {
        await setHidden(t.page, true);
        await t.page.waitForTimeout(500);
        t.assert((await standbyState(t))?.listening === 'live', 'Still listening');
        t.assert((await mic(t)).live === 1, 'The microphone stays on (the browser shows it on the tab)');
      });
      await t.step('two claps in the background: the greeting is said; shown again, he listens', async () => {
        await play(t, DOUBLE_CLAP);
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
        await waitSaid(t, /Shall I put on some/, { timeout: 15000 });
        t.assert((await voiceState(t)) !== 'listening', 'No listening while Jarvis is not on screen');
        await setHidden(t.page, false);
        await t.waitFor(async () => (await voiceState(t)) === 'listening', { message: 'Jarvis to listen once on screen' });
        await t.page.evaluate(() => window.__voice.say('Go back to sleep.'));
        await backInStandby(t);
      });
      await t.step('an iPhone pauses when hidden and resumes when shown', async () => {
        const page = await t.newPage({ device: 'iphone13' });
        await page.addInitScript(installFakeSpeech, {});
        await page.addInitScript(installFakeMic, { wakeLock: true });
        await t.goto('/', { page });
        await (await t.visible('quick-key-standby', { page })).click();
        await waitListening(t, page);
        await setHidden(page, true);
        await t.waitFor(async () => (await mic(t, page)).live === 0, { timeout: 3000, message: 'the microphone to be released when hidden' });
        t.assert((await standbyState(t, page)).pill === 'MICROPHONE PAUSED', 'The pill says so');
        await setHidden(page, false);
        await waitListening(t, page);
        t.assert((await mic(t, page)).live === 1, 'Listening again');
      });
    },
  },
  {
    name: 'standby-denied',
    title: 'Microphone blocked: Standby still opens (a clock), says truthfully that it is not listening and why',
    device: 'iphone13',
    timeout: 60000,
    async run(t) {
      await setup(t, { micOptions: { deny: true } });
      await (await t.visible('quick-key-standby')).click();
      await t.visible('standby');
      await t.waitFor(async () => (await standbyState(t))?.listening === 'denied', { message: 'Standby to report the blocked microphone' });
      const st = await standbyState(t);
      t.assert(st.pill === 'MICROPHONE BLOCKED · NOT LISTENING', st.pill);
      t.assert(/Allow the microphone/.test(st.hint), st.hint);
      await t.screenshot('1-denied');
    },
  },
];
