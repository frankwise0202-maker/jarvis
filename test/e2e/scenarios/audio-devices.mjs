// v8.1 Microphone and speaker (SPEC §28.2-§28.3): Settings → Voice → Microphone and speaker on a Mac in Chrome
// with a Bluetooth speakerphone, faked (test/e2e/audio-fakes.mjs: the devices, their tracks, setSinkId and
// recognition.start(track)) on top of the fake microphone (fake-mic.mjs: the app's real capture path and
// clap detector) and the fake recognizer and voice (installFakeSpeech). George speaks from a fake home base
// where a scenario needs him (core-fakes.mjs).
//   audio-devices-card        the lists (only "Default" and Show my devices before the microphone is allowed),
//                             the Bluetooth facts and the three setups, Custom by hand, the notes, every test
//                             only inside a tap, and the hands-free Test's results kept on this computer
//   audio-devices-routing     Standby on the chosen microphone with the setup's constraints, the recognizer
//                             given that microphone's track, George's context, the chimes and music on the
//                             chosen speaker; setup 3 listens to questions on the speakerphone
//   audio-devices-old-chrome  a Chrome without recognition.start(track): no track, and the card says to set
//                             Chrome's own microphone (the address to copy)
//   audio-devices-hotplug     the speakerphone dropping and coming back during Standby: the default at once
//                             and the pill says so, back by itself; one missed enumeration changes nothing;
//                             the speaker gone: George's sink goes to the default
//   standby-retry-backoff     Standby's capture fails twice, then works (2 s, then 5 s); a track that ends is
//                             tried again in the background on a Mac
//   standby-muted             (A12, SHOULD) the microphone's mute button: 10 s of exact digital silence makes
//                             the pill ask "MICROPHONE MUTED?"; the first sound puts it back

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { installAudioFakes } from '../audio-fakes.mjs';
import { setHidden } from './optics.mjs';
import * as S from '../../unit/wake.signals.mjs';

const pad = (x, before = 0.4, after = 0.9) => S.concat(S.silence(before), x, S.silence(after));
const DOUBLE_CLAP = Array.from(pad(S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10 })));
const TALK = Array.from(S.speechLike({ seconds: 1.2, peakDb: -12 })); // for the level bar

const SETUP1 = { audioSetup: 'speaker-mac-mic', audioInputId: 'mac-mic', audioInputLabel: 'MacBook Pro Microphone (Built-in)', audioOutputId: 'sp-out', audioOutputLabel: 'Desk Speakerphone (Bluetooth)' };
const SETUP2 = { audioSetup: 'speakerphone-both', audioInputId: 'sp-mic', audioInputLabel: 'Desk Speakerphone (Bluetooth)', audioOutputId: 'sp-out', audioOutputLabel: 'Desk Speakerphone (Bluetooth)' };
const SETUP3 = { ...SETUP2, audioSetup: 'switch' };
const GEORGE = { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'owner' };

const A = (t, page = t.page) => page.evaluate(() => ({ gets: window.__audio.gets.slice(), sinks: window.__audio.sinks.slice(), recStarts: window.__audio.recStarts.slice(), enumerations: window.__audio.enumerations }));
const micState = (t, page = t.page) => page.evaluate(() => ({ live: window.__fakeMic.live, standby: window.__fakeMic.standby, gets: window.__fakeMic.gets }));
const stored = (t) => t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}'));
const play = (t, samples) => t.page.evaluate((x) => window.__fakeMic.play(x), samples);

async function standbyState(t) {
  return t.page.evaluate(() => {
    const el = document.querySelector('[data-testid="standby"]');
    if (!el || el.hidden) return null;
    const tip = el.querySelector('[data-testid="standby-tip"]');
    return { listening: el.dataset.listening, pill: (el.querySelector('[data-testid="standby-pill"]')?.textContent || '').trim(), hint: (el.querySelector('[data-testid="standby-hint"]')?.textContent || '').trim(), tip: tip && !tip.hidden ? tip.textContent.trim() : '' };
  });
}

async function setup(t, { audio = {}, settings = {}, speech = { noSpeechMs: 8000 } } = {}) {
  await t.newPage({ device: 'mac', settings });
  await t.page.addInitScript(installFakeSpeech, speech);
  await t.page.addInitScript(installFakeMic, { wakeLock: true });
  await t.page.addInitScript(installAudioFakes, audio);
  await t.page.addInitScript(() => {
    window.__voice.queue = [];
  });
  await t.goto('/');
}

async function openCard(t) {
  await (await t.visible('settings-button')).click();
  const card = await t.visible('audio-devices', { message: 'Settings → Voice has Microphone and speaker' });
  await card.scrollIntoViewIfNeeded();
  return card;
}

const options = (t, id) => t.page.evaluate((id) => Array.from(document.querySelector(`[data-testid="${id}"]`).options).map((o) => o.textContent), id);

async function enterStandby(t) {
  await (await t.visible('quick-key-standby', { message: 'Home offers Standby' })).click();
  await t.visible('standby', { message: 'Standby opens' });
  await t.waitFor(async () => (await standbyState(t))?.listening === 'live', { timeout: 15000, message: async () => `Standby to listen (${JSON.stringify(await standbyState(t))})` });
}

async function pillIs(t, re, timeout = 15000) {
  await t.waitFor(async () => re.test((await standbyState(t))?.pill || ''), { timeout, message: async () => `the pill to match ${re} (${JSON.stringify(await standbyState(t))})` });
}

export default [
  {
    name: 'audio-devices-card',
    title: 'Mac, Settings → Voice → Microphone and speaker: only “Default” and Show my devices until the microphone is allowed; the names and connections; a Bluetooth speaker brings the facts and the three setups (the recommended one marked); Custom by hand; a setup stores its devices; the notes and the address to copy; Test microphone hears words and claps, only inside the tap; Test hands-free keeps its results on this computer',
    device: 'mac',
    seed: { settings: GEORGE },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 180000,
    async run(t) {
      await setup(t, { audio: { permission: 'prompt' } });
      await t.step('before the microphone is allowed: only “Default”, and Show my devices; nothing opened a microphone', async () => {
        await openCard(t);
        t.assert((await options(t, 'audio-input')).join('|') === 'Default', `Microphone: Default only (${await options(t, 'audio-input')})`);
        t.assert((await options(t, 'audio-output')).join('|') === 'Default', 'Speaker: Default only');
        await t.visible('audio-devices-show', { message: 'Show my devices' });
        t.assert((await A(t)).gets.length === 0, 'No microphone was opened by Settings');
        t.assert(!(await t.locator('audio-devices-setups').isVisible()), 'No setups yet (no Bluetooth device known)');
        await t.screenshot('1-card-no-permission');
      });
      await t.step('Show my devices: the microphone opens inside the tap and is let go at once; names and connections appear', async () => {
        await t.locator('audio-devices-show').click();
        await t.waitFor(async () => (await options(t, 'audio-input')).length >= 3, { timeout: 8000, message: 'the microphones listed' });
        const a = await A(t);
        t.assert(a.gets.length === 1 && a.gets[0].deviceId === '', `One request, the default microphone (${JSON.stringify(a.gets)})`);
        await t.waitFor(async () => (await micState(t)).live === 0, { timeout: 3000, message: 'the microphone let go' });
        const ins = await options(t, 'audio-input');
        const outs = await options(t, 'audio-output');
        t.assert(ins[0] === 'Default (MacBook Pro Microphone · Built-in)' && ins.includes('MacBook Pro Microphone · Built-in') && ins.includes('Desk Speakerphone · Bluetooth'), `Microphones by name and connection (${ins.join(' | ')})`);
        t.assert(outs.includes('MacBook Pro Speakers · Built-in') && outs.includes('Desk Speakerphone · Bluetooth'), `Speakers (${outs.join(' | ')})`);
        t.assert(!(await t.locator('audio-devices-show').isVisible()), 'Show my devices is gone once allowed');
      });
      await t.step('the speakerphone picked by hand: Custom, the Bluetooth facts and the three setups, the recommended one marked', async () => {
        await t.locator('audio-output').selectOption('sp-out');
        await t.visible('audio-devices-facts', { message: 'the Bluetooth facts' });
        const s = await stored(t);
        t.assert(s.audioSetup === '' && s.audioOutputId === 'sp-out' && s.audioOutputLabel === 'Desk Speakerphone (Bluetooth)', `Stored by id and label, no setup (${JSON.stringify(s)})`);
        await t.visible('audio-setup-custom', { message: 'Custom' });
        const facts = await t.text(t.locator('audio-devices-facts'));
        t.assert(/macOS switches it to its phone-call mode/.test(facts) && /Standby keeps Jarvis’s microphone open all the time/.test(facts), `The facts in those words (${facts})`);
        const setups = await t.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="audio-setup"]')).map((i) => ({ id: i.dataset.setup, text: i.closest('label').textContent })));
        t.assert(setups.length === 4, `Three setups and Follow the Mac (${setups.length})`);
        t.assert(/Speakerphone speaks, Mac listens\s*Recommended/.test(setups[0].text), `Setup 1 is recommended (${setups[0].text})`);
        t.assert(/Speakerphone for both/.test(setups[1].text) && /Switch\s*Experimental/.test(setups[2].text), 'Setups 2 and 3');
        t.assert((await A(t)).gets.length === 1, 'Choosing opened no microphone');
        await t.screenshot('2-card-custom');
      });
      await t.step('“Speakerphone speaks, Mac listens”: the Mac’s microphone and the speakerphone’s speaker, stored', async () => {
        await t.page.locator(tid('audio-setup', { 'data-setup': 'speaker-mac-mic' })).check();
        await t.waitFor(async () => (await stored(t)).audioSetup === 'speaker-mac-mic', { timeout: 3000, message: 'the setup saved' });
        const s = await stored(t);
        t.assert(s.audioInputId === 'mac-mic' && s.audioOutputId === 'sp-out', `Its devices (${JSON.stringify(s)})`);
        t.assert(!(await t.locator('audio-setup-custom').isVisible()), 'No longer Custom');
        t.assert((await t.locator('audio-input').inputValue()) === 'mac-mic', 'Microphone ▾ shows the Mac’s');
        const notes = await t.text(t.locator('audio-devices-notes'));
        t.assert(/Mac’s own voice uses the Mac’s sound output: System Settings → Sound/.test(notes) && /needs the lid open/.test(notes) && /chrome:\/\/settings\/content\/microphone/.test(notes), `The notes (${notes})`);
        await t.visible('audio-chrome-copy', { message: 'a Copy button' });
        await t.screenshot('3-card-setup1');
      });
      await t.step('Test microphone (inside the tap): the level, the words the recognizer heard, two claps through Standby’s detector; then everything let go', async () => {
        const before = (await A(t)).gets.length;
        await t.page.evaluate(() => window.__voice.queue.push('testing one two'));
        await t.locator('audio-test-mic').click();
        await t.waitFor(async () => /Heard: testing one two/.test(await t.text(t.locator('audio-heard'))), { timeout: 8000, message: async () => `the words (${await t.text(t.locator('audio-heard'))})` });
        await play(t, TALK);
        await play(t, DOUBLE_CLAP);
        await t.waitFor(async () => /Two claps heard/.test(await t.text(t.locator('audio-claps'))), { timeout: 8000, message: 'the claps' });
        const a = await A(t);
        const mine = a.gets.slice(before);
        t.assert(mine.length >= 2 && mine.every((g) => g.deviceId === 'mac-mic'), `Every microphone opened on the chosen one (${JSON.stringify(mine)})`);
        t.assert(a.recStarts.length >= 1 && a.recStarts[a.recStarts.length - 1].track && a.recStarts[a.recStarts.length - 1].device === 'mac-mic', `The recognizer heard its track (${JSON.stringify(a.recStarts)})`);
        await t.waitFor(async () => (await micState(t)).live === 0, { timeout: 9000, message: 'every microphone let go after 5 s' });
        const peak = Number(await t.page.locator(tid('audio-level')).getAttribute('data-peak'));
        t.assert(peak > 0, `The level moved (${peak})`);
        await t.screenshot('4-test-mic');
      });
      await t.step('Test hands-free: words heard while Jarvis is hidden, George saying “Jarvis” wakes nothing, “Yes” from the speakerphone; kept on this computer', async () => {
        await t.locator('audio-test-handsfree').click();
        await t.waitFor(async () => /1 of 3/.test(await t.text(t.locator('audio-handsfree'))), { timeout: 5000, message: 'step 1' });
        await setHidden(t.page, true);
        await t.page.waitForTimeout(600);
        await t.page.evaluate(() => window.__voice.say('testing'));
        await t.waitFor(async () => /2 of 3/.test(await t.text(t.locator('audio-handsfree'))), { timeout: 12000, message: 'step 2' });
        await setHidden(t.page, false);
        await t.waitFor(async () => /3 of 3/.test(await t.text(t.locator('audio-handsfree'))), { timeout: 30000, message: 'step 3 (George has spoken)' });
        t.assert(t.core.senses.speaks.length >= 1, 'George spoke from the home base');
        await t.locator('audio-handsfree-yes').click();
        await t.waitFor(async () => !!(await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.handsFreeTest.v1') || 'null')))?.heardSpeaker, { timeout: 3000, message: 'the result kept' });
        const r = await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.handsFreeTest.v1')));
        t.assert(Number.isFinite(r.at) && r.hiddenWords === true && r.selfTrigger === 'passed' && r.heardSpeaker === true, `The stored shape (${JSON.stringify(r)})`);
        t.assert(Object.keys(r).sort().join(',') === 'at,heardSpeaker,hiddenWords,selfTrigger', `Exactly these keys (${Object.keys(r)})`);
        const lines = await t.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="audio-handsfree-result"]')).map((li) => `${li.dataset.step}:${li.dataset.ok}`));
        t.assert(lines.join(',') === 'hidden:true,self:true,speaker:true', `Shown on the card (${lines})`);
        t.assert(t.requests('lead').length === 0, 'Nothing was sent to Claude');
        await t.screenshot('5-handsfree');
      });
      await t.step('a reload: the setup and the results are still there', async () => {
        await t.reload();
        await openCard(t);
        const lines = await t.page.evaluate(() => Array.from(document.querySelectorAll('[data-testid="audio-handsfree-result"]')).length);
        t.assert(lines === 3, `The results kept (${lines})`);
        t.assert((await t.locator('audio-input').inputValue()) === 'mac-mic', 'The setup kept');
        t.assert((await A(t)).gets.length === 0, 'Opening Settings again opened no microphone');
      });
    },
  },
  {
    name: 'audio-devices-routing',
    title: 'Mac, “Speakerphone speaks, Mac listens”: Standby listens on the Mac’s microphone with echo cancellation on and noise suppression and auto gain off; the pill names it; the recognizer gets a processed track of it; George’s context and the chimes play on the speakerphone; setup 3 hears the question on the speakerphone’s microphone',
    device: 'mac',
    seed: { settings: { ...SETUP1, ...GEORGE } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.step('Standby on the chosen microphone, with the setup’s constraints; the pill names it', async () => {
        await enterStandby(t);
        const g = (await A(t)).gets.filter((x) => x.device);
        const sb = g[g.length - 1];
        t.assert(sb && sb.deviceId === 'mac-mic' && sb.ec === true && sb.ns === false && sb.agc === false, `deviceId exact and EC on, NS and AGC off (${JSON.stringify(sb)})`);
        await pillIs(t, /^LISTENING ON THE MAC’S MICROPHONE · TWO CLAPS$/);
        await t.screenshot('1-standby-mac-mic');
      });
      await t.step('everything Jarvis plays goes to the speakerphone: George’s context and the chimes', async () => {
        const sinks = (await A(t)).sinks;
        t.assert(sinks.some((s) => s.kind === 'george' && s.id === 'sp-out'), `George’s context (${JSON.stringify(sinks)})`);
        t.assert(sinks.some((s) => s.kind === 'context' && s.id === 'sp-out'), `The chimes’ context (${JSON.stringify(sinks)})`);
        t.assert(!sinks.some((s) => s.id && s.id !== 'sp-out'), 'No other speaker');
      });
      await t.step('woken: the recognizer hears a processed track of the Mac’s microphone, closed after the listen', async () => {
        await play(t, DOUBLE_CLAP);
        await t.visible('voice-mode', { timeout: 8000, message: 'two claps wake Jarvis' });
        await t.waitFor(async () => (await A(t)).recStarts.length >= 1, { timeout: 8000, message: 'the recognizer started' });
        const a = await A(t);
        const r = a.recStarts[a.recStarts.length - 1];
        t.assert(r.track && r.device === 'mac-mic', `recognition.start(track) on the Mac’s microphone (${JSON.stringify(a.recStarts)})`);
        const q = a.gets.filter((x) => x.agc === true);
        t.assert(q.length >= 1 && q.every((x) => x.deviceId === 'mac-mic' && x.ec === true && x.ns === true), `A processed track (${JSON.stringify(q)})`);
        t.assert(a.gets.every((x) => x.deviceId === 'mac-mic'), `Every microphone opened is the Mac’s, the core’s mic bands too (${JSON.stringify(a.gets)})`);
      });
      await t.step('setup 3 (Switch): Standby stays on the Mac’s microphone; the question is heard on the speakerphone’s', async () => {
        await t.page.evaluate((s) => {
          const cur = JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}');
          localStorage.setItem('jarvis.settings.v1', JSON.stringify({ ...cur, ...s }));
        }, SETUP3);
        await t.reload();
        await enterStandby(t);
        const g = (await A(t)).gets.filter((x) => x.device);
        t.assert(g[g.length - 1].deviceId === 'mac-mic' && g[g.length - 1].ec === true && g[g.length - 1].ns === false, `Standby on the Mac (${JSON.stringify(g[g.length - 1])})`);
        await play(t, DOUBLE_CLAP);
        await t.visible('voice-mode', { timeout: 8000 });
        await t.waitFor(async () => (await A(t)).recStarts.some((r) => r.device === 'sp-mic'), { timeout: 8000, message: async () => `the question on the speakerphone (${JSON.stringify((await A(t)).recStarts)})` });
      });
    },
  },
  {
    name: 'audio-devices-old-chrome',
    title: 'Mac, a Chrome without recognition.start(track): the recognizer is started as before (no track, no extra microphone), and the card says to set Chrome’s own microphone to the chosen one, with the address to copy',
    device: 'mac',
    seed: { settings: SETUP1 },
    timeout: 90000,
    async run(t) {
      await setup(t, { audio: { oldChrome: true } });
      await t.step('the card says what to do', async () => {
        await openCard(t);
        const note = await t.text(t.locator('audio-chrome-mic'));
        t.assert(/Set Chrome’s microphone to MacBook Pro Microphone/.test(note) && /chrome:\/\/settings\/content\/microphone/.test(note), `The note (${note})`);
        await t.visible('audio-chrome-copy');
        await t.screenshot('1-old-chrome');
        await (await t.visible('settings-close')).click();
      });
      await t.step('Voice Mode listens as before: recognition.start() with no track, and no question microphone opened', async () => {
        const before = (await A(t)).gets.length;
        await (await t.visible('voice-open')).click();
        await t.waitFor(async () => (await A(t)).recStarts.length >= 1, { timeout: 8000, message: 'the recognizer started' });
        const a = await A(t);
        t.assert(a.recStarts.every((r) => !r.track), `No track (${JSON.stringify(a.recStarts)})`);
        t.assert(!a.gets.slice(before).some((g) => g.agc === true), `No question track opened (${JSON.stringify(a.gets.slice(before))})`);
      });
    },
  },
  {
    name: 'audio-devices-hotplug',
    title: 'Mac, “Speakerphone for both”, Standby on: a single missed enumeration (a Bluetooth mode switch) changes nothing; the speakerphone turned off: Standby listens on the Mac’s microphone at once and the pill says the speakerphone is disconnected, George’s speaker goes to the default; back: Standby and George move back by themselves',
    device: 'mac',
    seed: { settings: { ...SETUP2, ...GEORGE } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await pillIs(t, /^LISTENING ON DESK SPEAKERPHONE · TWO CLAPS$/);
      await t.step('one missed enumeration: no change', async () => {
        const before = await A(t);
        await t.page.evaluate(() => window.__audio.blip());
        await t.page.waitForTimeout(4500);
        const after = await A(t);
        t.assert(after.enumerations > before.enumerations, 'The devices were listed again');
        t.assert(after.gets.length === before.gets.length, `Standby didn't move (${after.gets.length - before.gets.length} new requests)`);
        t.assert(!after.sinks.slice(before.sinks.length).some((s) => s.id === ''), 'No sink change');
        await pillIs(t, /^LISTENING ON DESK SPEAKERPHONE · TWO CLAPS$/, 1000);
      });
      await t.step('the speakerphone turned off: the Mac’s microphone at once, the pill says so; the speaker goes to the default', async () => {
        const before = await A(t);
        await t.page.evaluate(() => window.__audio.setDevices(window.__audio.LISTS.mac));
        await pillIs(t, /^LISTENING ON THE MAC’S MICROPHONE · SPEAKERPHONE DISCONNECTED$/, 12000);
        const g = (await A(t)).gets.slice(before.gets.length).filter((x) => x.device);
        t.assert(g.length >= 1 && g[g.length - 1].device === 'mac-mic', `Listening on the Mac’s microphone (${JSON.stringify(g)})`);
        await t.waitFor(async () => (await A(t)).sinks.slice(before.sinks.length).some((s) => s.kind === 'george' && s.id === ''), { timeout: 8000, message: 'George’s sink to the default' });
        await t.screenshot('1-disconnected');
      });
      await t.step('back: Standby moves back to the speakerphone, George too', async () => {
        const before = await A(t);
        await t.page.evaluate(() => window.__audio.setDevices([...window.__audio.LISTS.mac, ...window.__audio.LISTS.speakerphone]));
        await pillIs(t, /^LISTENING ON DESK SPEAKERPHONE · TWO CLAPS$/, 12000);
        const g = (await A(t)).gets.slice(before.gets.length).filter((x) => x.device);
        t.assert(g.length >= 1 && g[g.length - 1].device === 'sp-mic', `Back on the speakerphone (${JSON.stringify(g)})`);
        await t.waitFor(async () => (await A(t)).sinks.slice(before.sinks.length).some((s) => s.kind === 'george' && s.id === 'sp-out'), { timeout: 8000, message: 'George back on the speakerphone' });
      });
      await t.step('the speaker alone gone: its sink goes to the default after the second enumeration', async () => {
        const before = await A(t);
        await t.page.evaluate(() => window.__audio.setDevices([...window.__audio.LISTS.mac, window.__audio.LISTS.speakerphone[0]]));
        await t.page.waitForTimeout(1000);
        t.assert(!(await A(t)).sinks.slice(before.sinks.length).some((s) => s.id === ''), 'Not after one enumeration');
        await t.waitFor(async () => (await A(t)).sinks.slice(before.sinks.length).some((s) => s.kind === 'george' && s.id === ''), { timeout: 8000, message: 'the default speaker after about 3 s' });
        await pillIs(t, /SPEAKERPHONE DISCONNECTED$/, 3000);
      });
    },
  },
  {
    name: 'standby-retry-backoff',
    title: 'Mac, Standby: the microphone busy twice, then free: tried again after 2 s and 5 s and listening (the hint says it tries by itself); a track that ends in the background is tried again in the background',
    device: 'mac',
    timeout: 90000,
    async run(t) {
      await setup(t);
      await t.step('busy, busy, then listening: after 2 s, then 5 s', async () => {
        await t.page.evaluate(() => {
          window.__audio.failNext = ['NotReadableError', 'NotReadableError'];
        });
        await (await t.visible('quick-key-standby')).click();
        await t.visible('standby');
        await t.waitFor(async () => /The microphone is busy\. Jarvis tries it again by himself\./.test((await standbyState(t))?.hint || ''), { timeout: 5000, message: async () => `the hint (${JSON.stringify(await standbyState(t))})` });
        t.assert(/NOT LISTENING/.test((await standbyState(t)).pill), 'Not listening meanwhile');
        await t.waitFor(async () => (await standbyState(t))?.listening === 'live', { timeout: 15000, message: 'listening after the retries' });
        const at = (await A(t)).gets.map((g) => g.at);
        t.assert(at.length === 3, `Three tries (${at.length})`);
        const d1 = at[1] - at[0];
        const d2 = at[2] - at[1];
        t.assert(d1 >= 1800 && d1 < 3500 && d2 >= 4800 && d2 < 7000, `2 s, then 5 s (${d1} ms, ${d2} ms)`);
        await pillIs(t, /^LISTENING ON THIS DEVICE · TWO CLAPS$/, 2000);
      });
      await t.step('in the background, the track ends: tried again after 2 s, still in the background', async () => {
        await setHidden(t.page, true);
        const before = (await A(t)).gets.length;
        await t.page.evaluate(() => {
          for (const x of window.__audio.tracks) {
            if (x.track.readyState === 'live') {
              x.track.stop();
              x.track.dispatchEvent(new Event('ended'));
            }
          }
        });
        await t.waitFor(async () => (await A(t)).gets.length > before && (await standbyState(t))?.listening === 'live', { timeout: 8000, message: 'listening again, hidden' });
        t.assert(await t.page.evaluate(() => document.hidden), 'still hidden');
        await setHidden(t.page, false);
      });
    },
  },
  {
    name: 'standby-muted',
    title: 'Mac, Standby: the speakerphone’s mute button (exact digital silence) for 10 s: the pill asks “MICROPHONE MUTED?” and the hint says why; unmuted, it listens as before',
    device: 'mac',
    seed: { settings: SETUP2 },
    timeout: 90000,
    async run(t) {
      await setup(t);
      await enterStandby(t);
      await pillIs(t, /^LISTENING ON DESK SPEAKERPHONE · TWO CLAPS$/);
      await t.step('muted: after 10 s of exact zeros the pill asks', async () => {
        const at = Date.now();
        await t.page.evaluate(() => window.__audio.mute(true));
        await t.page.waitForTimeout(6000);
        t.assert(/^LISTENING ON/.test((await standbyState(t)).pill), 'not after 6 s');
        await pillIs(t, /^MICROPHONE MUTED\?$/, 12000);
        const took = Date.now() - at;
        t.assert(took >= 9500, `about 10 s (${took} ms)`);
        t.assert(/Is it muted \(the speakerphone’s mute button\)\?/.test((await standbyState(t)).hint), `the hint (${(await standbyState(t)).hint})`);
        await t.screenshot('1-muted');
      });
      await t.step('unmuted: listening again, as before', async () => {
        await t.page.evaluate(() => window.__audio.mute(false));
        await pillIs(t, /^LISTENING ON DESK SPEAKERPHONE · TWO CLAPS$/, 4000);
        await play(t, DOUBLE_CLAP);
        await t.visible('voice-mode', { timeout: 8000, message: 'two claps still wake Jarvis' });
      });
    },
  },
];
