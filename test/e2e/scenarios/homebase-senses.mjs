// Hearing and voice through the home base (v7.7, beta, SPEC §25): Whisper and George's voice made by
// Jarvis Core on the owner's Alienware. A fake Core (core-fakes.mjs fakeSenses: api/senses, api/hear
// answering a canned transcript, api/speak answering a small WAV) at https://alienware.tail4e5f6a.ts.net/
// and Chromium's fake microphone through the app's real capture path (fake-mic.mjs: the Standby
// capture's AudioWorklet, 16 kHz frames, the app's VAD). Settings → Home base → Hearing and voice
// (beta): both switches, the downloads with their progress, Fast or Accurate, Test (3 seconds heard;
// one sentence said); Voice Mode end to end (heard by the home base with the "via home base" mark,
// the 2-second check, the reply in the home base's voice, no device recognizer, no device voice; a
// "cancel" said during the check, heard by the home base, sends nothing);
// the home base unreachable (this iPhone's recognizer takes the listen over and the built-in voice
// speaks); slow answers (hearing over 4 s, the voice over 6 s: the same fallbacks); and off (the
// default): nothing asked of the home base, every listen and reply exactly as before.

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import * as S from '../../unit/wake.signals.mjs';

const ON = { settings: { homeBaseUrl: CORE_URL, homeBaseHear: true, homeBaseSpeak: true } };
const LINKED = { settings: { homeBaseUrl: CORE_URL } };
const QUESTION = 'What is the capital of France?';
// Requests the fake Core refuses or drops on purpose, as the browser reports them.
const NETWORK_NOISE = [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/];
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * About 2 seconds of speech-like sound, then quiet (the fake microphone's own room tone, about -72
 * dBFS, runs under everything): the end of speech is the silence after it.
 */
function utterance(seconds = 2.2, seed = 21) {
  return Array.from(S.concat(S.silence(0.3), S.speechLike({ seconds, peakDb: -14, seed }), S.silence(1.6)));
}

const say = (t, samples) => t.page.evaluate((x) => window.__fakeMic.play(x), samples);
/** What the owner said, as the home base got it (not the 0.4 s of silence that warms it up). */
const heardWords = (t) => t.core.senses.hears.filter((h) => h.seconds > 1);
const sensesReqs = (t) => t.core.requests.filter((r) => /\/api\/(?:senses|hear|speak)$/.test(r));

/** The owner's words in every request Jarvis got: the newest user message's last text block. */
function sentTexts(t) {
  return t.requests('lead').map((r) => {
    const msgs = r.body?.messages || [];
    const user = [...msgs].reverse().find((m) => m.role === 'user');
    const blocks = Array.isArray(user?.content) ? user.content.filter((b) => b.type === 'text') : [];
    return norm(blocks.at(-1)?.text || '');
  });
}

async function setup(t) {
  await t.newPage();
  await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 900 });
  await t.page.addInitScript(installFakeMic);
  await t.page.addInitScript(() => {
    window.__voice.queue = []; // this iPhone's recognizer hears only what a step says
  });
  await t.goto('/');
}

async function openListening(t) {
  await (await t.visible('voice-open')).click();
  const vm = await t.visible('voice-mode');
  await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 10000, message: 'Voice Mode to listen' });
  return vm;
}

async function settingsHomeBase(t) {
  await (await t.visible('settings-button')).click();
  await t.visible('settings-sheet');
  await t.page.evaluate(() => document.querySelector('#settings-homebase')?.scrollIntoView());
  const card = await t.visible('senses-settings');
  await card.scrollIntoViewIfNeeded();
  return card;
}

async function statusOf(t, which) {
  const el = t.page.locator(tid(`senses-${which}-status`));
  return { state: await el.getAttribute('data-state'), text: norm(await t.text(el)) };
}

export default [
  {
    name: 'senses-settings',
    title: 'Settings → Home base → Hearing and voice (beta) on an iPhone: off by default; hearing turned on downloads Whisper on the home base with its progress, then Ready; Accurate; Test hears 3 seconds and shows the words; George’s voice turned on, Test plays one sentence made by the home base; off again; a Core without senses says it needs an update',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { senses: { downloadSteps: 2 } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      const card = await settingsHomeBase(t);
      await t.step('off by default: what turning each on does', async () => {
        await t.waitFor(async () => (await statusOf(t, 'hear')).state === 'off', { timeout: 10000, message: 'the hearing status' });
        const hear = await statusOf(t, 'hear');
        t.assert(/Off\. Turning it on downloads Whisper \(Fast\) \(about 80 MB\) on the home base, once\./.test(hear.text), `hearing explained (${hear.text})`);
        const speak = await statusOf(t, 'speak');
        t.assert(speak.state === 'off' && /George’s voice \(about 92 MB\)/.test(speak.text), `voice explained (${speak.text})`);
        t.assert(/Hearing and voice \(beta\)/.test(await t.text(card)), 'the section is called Hearing and voice (beta)');
        t.assert(!(await card.locator(tid('senses-hear-toggle')).isChecked()) && !(await card.locator(tid('senses-speak-toggle')).isChecked()), 'both off');
        t.assert(await card.locator(tid('senses-hear-test')).isDisabled(), 'no test while it is off');
        await t.screenshot('1-off');
      });
      await t.step('hearing on: the download, its progress, then Ready', async () => {
        await card.locator(tid('senses-hear-toggle')).click();
        await t.waitFor(async () => t.core.senses.puts.length === 1, { timeout: 10000, message: 'PUT api/senses' });
        t.assert(JSON.stringify(t.core.senses.puts[0]) === JSON.stringify({ hear: { enabled: true, model: 'base.en' } }), `turned on at the home base (${JSON.stringify(t.core.senses.puts[0])})`);
        await t.waitFor(async () => (await statusOf(t, 'hear')).state === 'downloading', { timeout: 10000, message: 'downloading' });
        const st = await statusOf(t, 'hear');
        t.assert(/Downloading Whisper \(Fast\) on the home base… \d+% of about 80 MB/.test(st.text), `the download (${st.text})`);
        t.assert(await card.locator(tid('senses-hear-progress')).isVisible(), 'its progress bar');
        await t.screenshot('2-downloading');
        await t.waitFor(async () => (await statusOf(t, 'hear')).state === 'ready', { timeout: 15000, message: 'ready (the card reads api/senses every 2 s while it downloads)' });
        t.assert(/Ready\. Voice Mode hears you through the home base\./.test((await statusOf(t, 'hear')).text), 'ready');
        t.assert(await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1')).homeBaseHear === true), 'on for this iPhone');
      });
      await t.step('Accurate: Whisper small, downloaded the first time', async () => {
        await card.locator(tid('senses-hear-model')).selectOption('small.en');
        await t.waitFor(async () => t.core.senses.puts.length === 2, { timeout: 10000, message: 'the second PUT' });
        t.assert(JSON.stringify(t.core.senses.puts[1]) === JSON.stringify({ hear: { enabled: true, model: 'small.en' } }), `Accurate asked for (${JSON.stringify(t.core.senses.puts[1])})`);
        await t.waitFor(async () => (await statusOf(t, 'hear')).state === 'ready' && /Accurate/.test(await t.text(card.locator(tid('senses-hear-result')))), { timeout: 15000, message: 'Accurate ready' });
      });
      await t.step('Test: 3 seconds heard by the home base, the words shown', async () => {
        const test = card.locator(tid('senses-hear-test'));
        await t.waitFor(async () => !(await test.isDisabled()), { timeout: 5000, message: 'Test enabled once ready' });
        await test.click();
        await t.waitFor(async () => /Listening for 3 seconds/.test(await t.text(card.locator(tid('senses-hear-result')))), { timeout: 10000, message: 'listening' });
        await say(t, Array.from(S.speechLike({ seconds: 2.2, peakDb: -14 })));
        await t.waitFor(async () => /Heard in 0\.4 s: “What is the capital of France\?”/.test(await t.text(card.locator(tid('senses-hear-result')))), { timeout: 15000, message: async () => `the words (${await t.text(card.locator(tid('senses-hear-result')))})` });
        const h = t.core.senses.hears.at(-1);
        t.assert(h.wav && h.rate === 16000 && h.seconds > 2.5 && h.seconds <= 3.01, `a 3-second 16 kHz WAV (${JSON.stringify(h)})`);
        t.assert(h.prompt === 'Jarvis', `with a context word (${h.prompt})`);
        await t.waitFor(async () => t.page.evaluate(() => window.__fakeMic.live === 0), { timeout: 5000, message: 'the microphone released after the test' });
        await t.screenshot('3-hear-test');
      });
      await t.step('George’s voice on, Test plays one sentence from the home base', async () => {
        await card.locator(tid('senses-speak-toggle')).click();
        await t.waitFor(async () => (await statusOf(t, 'speak')).state === 'ready', { timeout: 15000, message: 'the voice ready' });
        await card.locator(tid('senses-speak-test')).click();
        await t.waitFor(async () => t.core.senses.speaks.length === 1, { timeout: 10000, message: 'POST api/speak' });
        t.assert(/^Good (?:morning|afternoon|evening), Tony\. This is my voice, made on your home base\.$/.test(t.core.senses.speaks[0].text) && t.core.senses.speaks[0].voice === 'bm_george', `the sentence (${JSON.stringify(t.core.senses.speaks[0])})`);
        await t.waitFor(async () => /Played “Good/.test(await t.text(card.locator(tid('senses-speak-result')))), { timeout: 15000, message: async () => `played (${await t.text(card.locator(tid('senses-speak-result')))})` });
        t.assert((await t.page.evaluate(() => window.__voice.said.length)) === 0, 'not the built-in voice');
        await t.screenshot('4-voice');
      });
      await t.step('hearing off again: off here and at the home base', async () => {
        await card.locator(tid('senses-hear-toggle')).click();
        await t.waitFor(async () => (await statusOf(t, 'hear')).state === 'off', { timeout: 10000, message: 'off' });
        t.assert(JSON.stringify(t.core.senses.puts.at(-1)) === JSON.stringify({ hear: { enabled: false } }), 'turned off at the home base');
        t.assert(await t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1')).homeBaseHear === false), 'off for this iPhone');
      });
    },
  },
  {
    name: 'senses-old-core',
    title: 'A home base without hearing and voice (Jarvis Core 1.1) says it needs an update; nothing can be turned on',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { senses: false },
    allowConsole: [/Failed to load resource: the server responded with a status of 404/],
    timeout: 60000,
    async run(t) {
      await setup(t);
      const card = await settingsHomeBase(t);
      await t.waitFor(async () => /needs an update for hearing and voice: run jarvis-core update/.test(await t.text(card.locator(tid('senses-state')))), { timeout: 10000, message: 'the update message' });
      t.assert(!(await card.locator(tid('senses-hear')).isVisible()), 'no switches to flip');
    },
  },
  {
    name: 'senses-voice-mode',
    title: 'Voice Mode end to end through the home base (iPhone): the “via home base” mark; spoken words heard by the home base’s Whisper (a 16 kHz WAV with the context words), never this iPhone’s recognizer; the 2-second check; the reply said in the home base’s George voice, not the built-in voice; the microphone released',
    device: 'iphone13',
    seed: ON,
    fakeCore: { senses: { hear: 'ready', speak: 'ready', hearText: QUESTION } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'one reading of api/senses at launch (both are on)' });
      const vm = await openListening(t);
      await t.step('listening through the home base', async () => {
        const mark = await t.visible('voice-homebase-mark', { timeout: 8000 });
        t.assert(/via home base/.test(await t.text(mark)), 'the mark');
        await t.waitFor(async () => t.page.evaluate(() => window.__fakeMic.live > 0), { timeout: 8000, message: 'the microphone open' });
        t.assert((await t.page.evaluate(() => window.__voice.listens)) === 0, 'this iPhone’s recognizer never started');
        await t.screenshot('1-listening');
      });
      await t.step('said, heard by the home base, checked, sent', async () => {
        await say(t, utterance());
        await t.waitFor(async () => heardWords(t).length === 1, { timeout: 10000, message: 'POST api/hear once the owner stopped' });
        const h = heardWords(t)[0];
        const warm = t.core.senses.hears.filter((x) => x.seconds <= 1);
        t.assert(warm.length === 1 && Math.abs(warm[0].seconds - 0.4) < 0.01, `warmed up once when Voice Mode opened (${JSON.stringify(warm)})`);
        t.assert(t.core.senses.speaks.some((x) => x.text === 'Ready.'), 'the voice too');
        t.assert(h.wav && h.type === 'audio/wav' && h.rate === 16000 && h.seconds > 1.8 && h.seconds < 3.2, `a 16 kHz WAV of what was said, not the silence after it (${JSON.stringify(h)})`);
        t.assert(/^Jarvis, Tony/.test(h.prompt), `the context words (${h.prompt})`);
        await t.waitFor(async () => norm(await t.text(t.page.locator(tid('voice-review-text')))) === QUESTION, { timeout: 10000, message: 'the 2-second check shows the words' });
        await t.screenshot('2-check');
        await t.waitFor(async () => sentTexts(t).some((x) => x.includes(QUESTION)), { timeout: 15000, message: 'sent to Jarvis' });
      });
      await t.step('the reply in George’s voice from the home base', async () => {
        await t.waitFor(async () => t.core.senses.speaks.length >= 1, { timeout: 20000, message: 'POST api/speak for the reply' });
        await t.waitFor(async () => t.core.senses.speaks.filter((x) => x.text !== 'Ready.').length >= 1, { timeout: 20000, message: 'the reply’s sentences' });
        t.assert(t.core.senses.speaks.every((x) => x.voice === 'bm_george' && x.text.length > 0 && x.text.length <= 1000), 'sentences, George');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'speaking' || t.core.senses.speaks.length >= 2, { timeout: 15000, message: 'speaking' });
        t.assert((await t.page.evaluate(() => window.__voice.said.length)) === 0, 'not the built-in voice');
        t.assert(await t.page.evaluate(() => window.__fakeMic.live === 0), 'the microphone is released while Jarvis speaks');
        t.assert((await t.page.evaluate(() => window.__voice.listens)) === 0, 'and this iPhone’s recognizer never ran');
        await t.screenshot('3-speaking');
      });
    },
  },
  {
    name: 'senses-check',
    title: 'The 2-second check hears through the home base too (iPhone, Voice Mode): “Set a timer for ten minutes.” is shown, then “Cancel.” said during the countdown pauses it while the home base hears it, and nothing is sent',
    device: 'iphone13',
    seed: ON,
    fakeCore: { senses: { hear: 'ready', speak: 'ready', hearQueue: ['Set a timer for ten minutes.', 'Cancel.'] } },
    timeout: 120000,
    async run(t) {
      await setup(t);
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'api/senses read at launch' });
      await openListening(t);
      await t.visible('voice-homebase-mark', { timeout: 8000 });
      await say(t, utterance(1.8, 31));
      await t.waitFor(async () => norm(await t.text(t.page.locator(tid('voice-review-text')))) === 'Set a timer for ten minutes.', { timeout: 10000, message: 'the check shows the words' });
      // Said at once, during the countdown: the check pauses while the home base hears it.
      const said = say(t, Array.from(S.concat(S.silence(0.15), S.speechLike({ seconds: 0.8, peakDb: -14, seed: 5 }), S.silence(1.6))));
      await t.waitFor(async () => (await t.page.locator(tid('voice-review')).getAttribute('data-state')) === 'listening', { timeout: 3000, message: 'the countdown pauses while the owner talks' });
      t.assert(norm(await t.text(t.page.locator(tid('voice-review-heard')))) === '…', 'the words are on their way');
      await t.screenshot('1-paused');
      await said;
      await t.waitFor(async () => /Okay, not sent\./.test(await t.text(t.page.locator(tid('voice-captions')))), { timeout: 10000, message: async () => `"cancel" heard: not sent (captions: ${await t.text(t.page.locator(tid('voice-captions')))})` });
      t.assert(t.core.senses.hears.filter((h) => h.seconds > 0.5).length === 2, `both utterances went to the home base (${JSON.stringify(t.core.senses.hears.map((h) => h.seconds))})`);
      t.assert(t.requests('lead').length === 0, 'nothing sent to Jarvis');
      t.assert((await t.page.evaluate(() => window.__voice.listens)) === 0, 'this iPhone’s recognizer never ran');
    },
  },
  {
    name: 'senses-fallback',
    title: 'The home base unreachable for hearing and voice (iPhone, Voice Mode): what was said goes unheard, Jarvis asks again and this iPhone’s recognizer takes the listen over; the reply is said by the built-in voice; the next listen uses this iPhone at once (the home base rests a minute)',
    device: 'iphone13',
    seed: ON,
    fakeCore: { senses: { hear: 'ready', speak: 'ready', hearMode: 'unreachable', speakMode: 'unreachable' } },
    allowConsole: NETWORK_NOISE,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'api/senses read at launch' });
      const vm = await openListening(t);
      await t.visible('voice-homebase-mark', { timeout: 8000 });
      await t.step('unreachable: this iPhone’s recognizer takes over and Jarvis asks again', async () => {
        await say(t, utterance());
        await t.waitFor(async () => /I couldn’t reach the home base\. Say that again\?/.test(await t.text(t.page.locator(tid('voice-captions')))), {
          timeout: 15000,
          message: async () => `asked again (captions: ${await t.text(t.page.locator(tid('voice-captions')))})`,
        });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.listens)) >= 1, { timeout: 8000, message: 'this iPhone’s recognizer' });
        t.assert(!(await t.page.locator(tid('voice-homebase-mark')).isVisible()), 'no mark now');
        t.assert(await t.page.evaluate(() => window.__fakeMic.live === 0), 'the home base path released the microphone first');
        await t.screenshot('1-asked-again');
        await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
        await t.waitFor(async () => sentTexts(t).some((x) => x.includes(QUESTION)), { timeout: 15000, message: 'sent' });
      });
      await t.step('the reply in the built-in voice', async () => {
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).length > 0, { timeout: 25000, message: 'the built-in voice speaks the reply' });
        t.assert(t.core.senses.speaks.length === 0, 'nothing reached the home base’s voice');
      });
      await t.step('the next listen: this iPhone at once', async () => {
        const hears = heardWords(t).length;
        const listens = await t.page.evaluate(() => window.__voice.listens);
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening' && (await t.page.evaluate(() => window.__voice.listens)) > listens, { timeout: 30000, message: 'listening again (Continuous) on this iPhone' });
        t.assert(!(await t.page.locator(tid('voice-homebase-mark')).isVisible()), 'no mark');
        t.assert(heardWords(t).length === hears, 'no new request to the home base');
      });
    },
  },
  {
    name: 'senses-slow',
    title: 'Slow answers (iPhone, Voice Mode): the home base hearing for more than 4 s hands the listen to this iPhone’s recognizer ("took too long"); a voice slower than 6 s a sentence hands the reply to the built-in voice',
    device: 'iphone13',
    seed: ON,
    fakeCore: { senses: { hear: 'ready', speak: 'ready', hearDelayMs: 6500, speakDelayMs: 9000 } },
    allowConsole: NETWORK_NOISE,
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'api/senses read at launch' });
      await openListening(t);
      await t.step('hearing slower than 4 s', async () => {
        await say(t, utterance());
        await t.waitFor(async () => heardWords(t).length === 1, { timeout: 10000, message: 'POST api/hear' });
        const sent = Date.now();
        await t.waitFor(async () => /The home base took too long\. Say that again\?/.test(await t.text(t.page.locator(tid('voice-captions')))), { timeout: 10000, message: 'took too long' });
        const waited = Date.now() - sent;
        t.assert(waited >= 3000 && waited < 6000, `about 4 s (${waited} ms)`);
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.listens)) >= 1, { timeout: 8000, message: 'this iPhone’s recognizer' });
        await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
        await t.waitFor(async () => sentTexts(t).some((x) => x.includes(QUESTION)), { timeout: 15000, message: 'sent' });
      });
      await t.step('a voice slower than 6 s: the built-in voice says the reply', async () => {
        await t.waitFor(async () => t.core.senses.speaks.filter((x) => x.text !== 'Ready.').length >= 1, { timeout: 20000, message: 'POST api/speak for the reply' });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).length > 0, { timeout: 25000, message: 'the built-in voice took over' });
      });
    },
  },
  {
    name: 'senses-off',
    title: 'Off (the default) with a home base that can hear and speak: Voice Mode listens with this iPhone’s recognizer and speaks with the built-in voice; nothing is asked of the home base’s senses',
    device: 'iphone13',
    seed: LINKED,
    fakeCore: { senses: { hear: 'ready', speak: 'ready' } },
    timeout: 120000,
    async run(t) {
      await setup(t);
      const vm = await openListening(t);
      t.assert(!(await t.page.locator(tid('voice-homebase-mark')).isVisible()), 'no mark');
      await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.listens)) >= 1, { timeout: 8000, message: 'this iPhone’s recognizer, as before' });
      t.assert(await t.page.evaluate(() => (window.__fakeMic.gets || 0) === 0), 'no microphone stream of the home base path');
      await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
      await t.waitFor(async () => sentTexts(t).some((x) => x.includes(QUESTION)), { timeout: 15000, message: 'sent' });
      await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).length > 0, { timeout: 25000, message: 'the built-in voice speaks' });
      await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 30000, message: 'done speaking' });
      t.assert(sensesReqs(t).length === 0, `nothing asked of the home base’s senses (${sensesReqs(t).join(', ')})`);
    },
  },
];
