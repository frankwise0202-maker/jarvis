// v7.8 (SPEC §26): "Jarvis speaks with George". The owner never heard a difference through the voice
// updates: every better voice was off until he found its switch. A fake Core (core-fakes.mjs
// fakeSenses, a Jarvis Core 1.2 with hearing and voice) at https://alienware.tail4e5f6a.ts.net/.
//   george-auto / george-auto-mac   a linked home base turns George on by itself, once: PUT speak
//                                   enabled, the notice ("Getting it ready…", then ready, Hear him), the
//                                   label "George · home base" in Voice Mode and on a reply read aloud;
//                                   a reload asks nothing again
//   george-off                      the notice's Turn off: off on this device (the home base keeps George
//                                   for the others), and it stays off (a reload, Voice Mode: "iPhone
//                                   voice"); Settings → Voice shows it
//   george-two-devices              the iPhone and the Mac on one home base: Turn off on the Mac is the
//                                   Mac's alone (the home base keeps George; the iPhone's next reply is
//                                   his); George turned off at the home base by an older Jarvis comes back
//                                   on there from the iPhone, whose switch is still on
//   george-fallback                 George failing mid-reply: the label changes to "iPhone voice"
//   george-away                     the home base stops answering (Tailscale on, the Alienware asleep): the
//                                   reply is spoken by the iPhone voice at once, not after 6 s of silence;
//                                   George again once a reading of the home base succeeds
//   george-no-homebase(-mac)        no home base: Jarvis's voice offers George on this device (its
//                                   download, "may be slow on iPhone") and the better-voice tip; Test
//   george-old-core                 a Jarvis Core 1.1 (no senses): nothing turned on, no notice
//   george-stuck                    v7.8.1: George's sound never starts (Web Audio stuck, installStuckAudio):
//                                   the iPhone voice says the reply within about 5 s, labelled so; Voice Mode
//                                   listens on and its next reply starts on the iPhone voice at once;
//                                   Settings → Voice says why; a reply's Speak tap is said too; once the
//                                   audio works again, Test (a tap) brings George back
//   george-stuck-midway             v7.8.1: George's sound stops mid-sentence: the iPhone voice says the rest
//                                   from the last word heard, and Voice Mode listens again

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';

/**
 * v7.8.1, an init script: the voice's Web Audio output (audio-out.js's 24 kHz AudioContext) stuck as iOS can
 * leave it after an interruption, a route change or the microphone taking the audio session, or as a context
 * never unlocked by a tap is: suspended right after it is made, and resume() resolves without resuming, so in
 * Chromium its clock (currentTime) stops. Other contexts (sounds, the microphone) are untouched.
 * window.__stuckAudio: { on, contexts, starts: [{ when, at, duration, t }] (each chunk put on the clock; t is
 * performance.now()), stop() (stop the clock of a running one now), lift() (resume() works again) }.
 */
function installStuckAudio({ on = true } = {}) {
  const Real = window.AudioContext || window.webkitAudioContext;
  if (!Real) return;
  const st = { on, contexts: [], starts: [], stoppedAt: 0 };
  window.__stuckAudio = st;
  class StuckAudioContext extends Real {
    constructor(opts) {
      super(opts);
      this.__voice = !!opts && opts.sampleRate === 24000;
      if (!this.__voice) return;
      st.contexts.push(this);
      if (st.on) super.suspend().catch(() => {});
    }
    resume() {
      if (this.__voice && st.on) return Promise.resolve(); // "resumed", and nothing runs
      return super.resume();
    }
  }
  window.AudioContext = StuckAudioContext;
  if (window.webkitAudioContext) window.webkitAudioContext = StuckAudioContext;
  st.stop = () => {
    st.on = true;
    st.stoppedAt = performance.now();
    for (const c of st.contexts) c.suspend().catch(() => {});
  };
  st.lift = () => {
    st.on = false;
  };
  const start = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (when, ...rest) {
    try {
      if (this.context && this.context.__voice && this.buffer && this.buffer.length > 1) st.starts.push({ when: Number(when) || 0, at: this.context.currentTime, duration: this.buffer.duration, t: performance.now() });
    } catch {
      /* bookkeeping only */
    }
    return start.call(this, when, ...rest);
  };
}

const QUESTION = 'What is the capital of France?';
const FRESH_LINK = { settings: { homeBaseUrl: CORE_URL, homeBaseSpeakBy: '' } }; // never switched on this device
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const stored = (t) => t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}'));
const speakPuts = (t) => t.core.senses.puts.filter((p) => p.speak);

async function setup(t) {
  await t.newPage();
  await prepPage(t.page);
  await t.goto('/');
}

/** The fake recognizer and voice, and a record of every voice label the page showed. */
async function prepPage(page) {
  await page.addInitScript(installFakeSpeech, { noSpeechMs: 900 });
  await page.addInitScript(() => {
    window.__voice.queue = []; // the recognizer hears only what a step says
    // Every voice label the page showed, in order (Voice Mode's and a reply's read aloud).
    window.__labels = [];
    const seen = new WeakMap();
    const note = () => {
      for (const el of document.querySelectorAll('[data-testid="voice-label"], [data-testid="turn-speak-voice"]')) {
        const v = el.hidden ? '' : (el.textContent || '').trim();
        if (seen.get(el) !== v) {
          seen.set(el, v);
          if (v) window.__labels.push(`${el.dataset.testid}:${v}:${el.dataset.engine || ''}`);
        }
      }
    };
    new MutationObserver(note).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

const storedOn = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}'));

/** A question in Voice Mode on `page`; resolves once the reply has been spoken. Returns its labels and what the device voice said. */
async function voiceReply(t, page) {
  await page.bringToFront();
  await page.locator(tid('voice-open')).click();
  const vm = page.locator(tid('voice-mode'));
  await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 10000, message: 'Voice Mode to listen' });
  await t.waitFor(async () => (await page.evaluate(() => window.__voice.listens)) >= 1, { timeout: 8000, message: 'the recognizer' });
  const before = await page.evaluate(() => window.__labels.length);
  await page.evaluate((q) => window.__voice.say(q), QUESTION);
  await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'speaking', { timeout: 20000, message: 'the reply to be spoken' });
  await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 40000, message: 'done speaking' });
  const labels = await page.evaluate((n) => window.__labels.slice(n).filter((x) => x.startsWith('voice-label:')), before);
  const said = await page.evaluate(() => window.__voice.said.join(' '));
  await page.locator(tid('voice-close')).click();
  return { labels, said };
}

async function openListening(t) {
  await (await t.visible('voice-open')).click();
  const vm = await t.visible('voice-mode');
  await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 10000, message: 'Voice Mode to listen' });
  return vm;
}

async function ask(t, vm) {
  await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.listens)) >= 1, { timeout: 8000, message: 'the recognizer' });
  await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
  await t.waitFor(async () => t.requests('lead').length >= 1, { timeout: 15000, message: 'sent to Jarvis' });
  return vm;
}

async function settingsVoice(t) {
  await (await t.visible('settings-button')).click();
  await t.visible('settings-sheet');
  const card = await t.visible('jarvis-voice');
  await card.scrollIntoViewIfNeeded();
  return card;
}

function autoScenario(device) {
  const mac = device === 'mac';
  const dev = mac ? 'built-in voice' : 'iPhone voice';
  return {
    name: mac ? 'george-auto-mac' : 'george-auto',
    title: `${mac ? 'Chrome on the Mac' : 'iPhone'}: a linked home base whose Core has George turns him on by itself, once — PUT speak enabled, the notice (“Jarvis now speaks with George’s natural voice, made by your Alienware. Getting it ready…”, its download, then ready, Hear him), the label “George · home base” in Voice Mode and on a reply read aloud; a reload asks nothing again`,
    device,
    seed: FRESH_LINK,
    fakeCore: { senses: { downloadSteps: 3 } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.step('turned on by itself, once, and said so', async () => {
        await t.waitFor(async () => speakPuts(t).length === 1, { timeout: 10000, message: 'PUT api/senses { speak: { enabled: true } }' });
        t.assert(JSON.stringify(speakPuts(t)[0]) === JSON.stringify({ speak: { enabled: true } }), `on at the home base (${JSON.stringify(t.core.senses.puts)})`);
        const s = await stored(t);
        t.assert(s.homeBaseSpeak === true && s.homeBaseSpeakBy === 'auto', `on for this device, recorded as automatic (${s.homeBaseSpeak}, ${s.homeBaseSpeakBy})`);
        const notice = await t.visible('voice-notice', { timeout: 5000 });
        await t.waitFor(async () => /Jarvis now speaks with George’s natural voice, made by your Alienware\. Getting it ready…/.test(await t.text(notice)), { timeout: 5000, message: 'the notice' });
        t.assert(/George · home base/.test(await t.text(t.page.locator(tid('voice-notice-tag')))), 'its label');
        t.assert(await t.page.locator(tid('voice-notice-off')).isVisible(), 'an easy off switch');
        await t.screenshot('1-getting-ready');
      });
      await t.step('ready', async () => {
        await t.waitFor(async () => (await t.page.locator(tid('voice-notice')).getAttribute('data-state')) === 'ready', { timeout: 20000, message: async () => `ready (${await t.text(t.page.locator(tid('voice-notice')))})` });
        t.assert(/George’s voice is ready\. Jarvis speaks with it from now on/.test(await t.text(t.page.locator(tid('voice-notice-text')))), 'ready, in words');
        await t.screenshot('2-ready');
        const before = t.core.senses.speaks.length;
        await t.page.locator(tid('voice-notice-test')).click();
        const heard = () => norm(t.core.senses.speaks.slice(before).map((x) => x.text).join(' '));
        await t.waitFor(async () => /^Good (?:morning|afternoon|evening), Tony\. This is my voice, made on your home base\.$/.test(heard()), { timeout: 10000, message: async () => `Hear him: a sentence from the home base (asked: ${JSON.stringify(t.core.senses.speaks)}; the device said: ${JSON.stringify(await t.page.evaluate(() => window.__voice.said))})` });
        t.assert(t.core.senses.speaks.slice(before).every((x) => x.voice === 'bm_george'), 'George');
        t.assert(t.core.senses.speaks[before].text.length <= 60, `a short first chunk (${t.core.senses.speaks[before].text})`);
        t.assert((await t.page.evaluate(() => window.__voice.said.length)) === 0, `not the ${dev}`);
        await t.page.locator(tid('voice-notice-close')).click();
      });
      await t.step('Voice Mode: the reply in George’s voice, labelled', async () => {
        const vm = await openListening(t);
        await ask(t, vm);
        const label = await t.visible('voice-label', { timeout: 20000 });
        await t.waitFor(async () => (await label.getAttribute('data-engine')) === 'homebase', { timeout: 15000, message: 'the label' });
        t.assert(norm(await t.text(label)) === 'George · home base', `the label says so (${await t.text(label)})`);
        await t.waitFor(async () => t.core.senses.speaks.some((x) => /capital of France is Paris/.test(x.text)), { timeout: 20000, message: 'the reply from the home base' });
        t.assert((await t.page.evaluate(() => window.__voice.said.length)) === 0, `not the ${dev}`);
        await t.screenshot('3-voice-mode');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking' && !(await label.isVisible()), { timeout: 40000, message: 'done speaking: the label goes' });
        await (await t.visible('voice-close')).click();
      });
      await t.step('a reply read aloud in the chat shows its voice', async () => {
        const speakBtn = t.page.locator(tid('turn-speak')).last();
        await speakBtn.waitFor({ state: 'visible', timeout: 10000 });
        const before = t.core.senses.speaks.length;
        await speakBtn.click();
        const tag = t.page.locator(tid('turn-speak-voice')).last();
        await t.waitFor(async () => (await tag.isVisible()) && norm(await t.text(tag)) === 'George · home base', { timeout: 10000, message: 'the label beside Stop' });
        await t.waitFor(async () => t.core.senses.speaks.length > before, { timeout: 10000, message: 'read by the home base' });
        await t.screenshot('4-read-aloud');
        await speakBtn.click(); // Stop
        await t.waitFor(async () => !(await tag.isVisible()), { timeout: 5000, message: 'the label goes with Stop' });
      });
      await t.step('a reload asks nothing again', async () => {
        const puts = t.core.senses.puts.length;
        await t.page.reload();
        await t.waitReady();
        await t.page.waitForTimeout(3500);
        t.assert(speakPuts(t).filter((p) => p.speak.enabled === true).length >= 1 && t.core.senses.puts.slice(puts).every((p) => JSON.stringify(p) === JSON.stringify({ speak: { enabled: true } })), 'nothing but the voice warm-up');
        t.assert(!(await t.page.locator(tid('voice-notice')).isVisible()), 'no notice again');
        const s = await stored(t);
        t.assert(s.homeBaseSpeak === true && s.homeBaseSpeakBy === 'auto', 'still on, still recorded as automatic');
      });
      await t.step('Settings → Voice: Jarvis’s voice', async () => {
        const card = await settingsVoice(t);
        await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-tag')))) === 'George · home base', { timeout: 10000, message: async () => `the voice in use (${await t.text(card)})` });
        t.assert(/made by your Alienware and played on this (?:iPhone|Mac)/.test(await t.text(card.locator(tid('jarvis-voice-where')))), 'where it comes from');
        t.assert(await card.locator(tid('jarvis-voice-homebase-toggle')).isChecked(), 'the switch is on');
        t.assert(await card.locator(tid('jarvis-voice-tip')).isVisible(), 'the tip');
        await t.screenshot('5-settings');
      });
    },
  };
}

function noHomeBase(device) {
  const mac = device === 'mac';
  return {
    name: mac ? 'george-no-homebase-mac' : 'george-no-homebase',
    title: `${mac ? 'Chrome on the Mac' : 'iPhone'} without a home base: Settings → Voice → Jarvis’s voice says the ${mac ? 'built-in voice' : 'iPhone voice'} speaks, offers George from a home base and George on this device (its download, may be slow on iPhone), and the plain tip for a better voice; Test speaks and its label says which voice`,
    device,
    timeout: 90000,
    async run(t) {
      await setup(t);
      const card = await settingsVoice(t);
      const word = mac ? 'built-in voice' : 'iPhone voice';
      await t.step('the voice in use and the ways to George', async () => {
        await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-tag')))) === word, { timeout: 8000, message: async () => `the label (${await t.text(card.locator(tid('jarvis-voice-tag')))})` });
        const offer = card.locator(tid('jarvis-voice-offer'));
        t.assert(await offer.isVisible(), 'the offer');
        const natural = norm(await t.text(card.locator(tid('jarvis-voice-natural'))));
        t.assert(/downloads about \d+ MB once/.test(natural) && /may be slow on iPhone/.test(natural), `George on this device: its download and the warning (${natural})`);
        t.assert(await card.locator(tid('jarvis-voice-link')).isVisible(), 'link your home base');
        const tip = norm(await t.text(card.locator(tid('jarvis-voice-tip'))));
        t.assert(mac ? /System Settings > Accessibility > Spoken Content/.test(tip) : /Settings > Accessibility > Spoken Content > Voices > English > pick a British voice \(for example Daniel or Arthur\) > download its Enhanced or Premium version/.test(tip), `the tip (${tip})`);
        t.assert(/Jarvis already prefers those automatically/.test(tip), 'Jarvis prefers them already');
        await t.screenshot('1-card');
      });
      await t.step('Test speaks with the voice in use, labelled', async () => {
        await card.locator(tid('jarvis-voice-test')).click();
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes('This is the voice I speak with.'), { timeout: 10000, message: 'the test sentence' });
        t.assert((await card.locator(tid('jarvis-voice-tag')).getAttribute('data-engine')) === 'device', 'the label: this device’s voice');
      });
    },
  };
}

export default [
  autoScenario('iphone13'),
  autoScenario('mac'),
  {
    name: 'george-off',
    title: 'iPhone: George turned on by himself, then the owner taps Turn off on the notice: off on this iPhone (nothing asked of the home base, which keeps George for the other devices), and it stays off (a reload asks nothing; Voice Mode speaks with the iPhone voice and says so); Settings → Voice shows the iPhone voice with the switch off, and turning it on there is the owner’s choice',
    device: 'iphone13',
    seed: FRESH_LINK,
    fakeCore: { senses: { downloadSteps: 2 } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.step('turned on, then off from the notice', async () => {
        await t.visible('voice-notice', { timeout: 10000 });
        await t.page.locator(tid('voice-notice-off')).click();
        await t.waitFor(async () => (await stored(t)).homeBaseSpeak === false, { timeout: 10000, message: 'off on this iPhone' });
        const s = await stored(t);
        t.assert(s.homeBaseSpeak === false && s.homeBaseSpeakBy === 'owner', `off, the owner’s choice (${s.homeBaseSpeak}, ${s.homeBaseSpeakBy})`);
        await t.page.waitForTimeout(1000);
        t.assert(!speakPuts(t).some((p) => p.speak.enabled === false) && t.core.senses.speak.enabled === true, `the home base keeps George for the other devices (${JSON.stringify(t.core.senses.puts)})`);
        t.assert(/Off\. Jarvis speaks with the iPhone voice\./.test(await t.text(t.page.locator(tid('voice-notice-text')))), 'said so');
        await t.screenshot('1-off');
      });
      await t.step('it stays off', async () => {
        const puts = t.core.senses.puts.length;
        await t.page.reload();
        await t.waitReady();
        await t.page.waitForTimeout(3500);
        t.assert(t.core.senses.puts.length === puts, `nothing turned on again (${JSON.stringify(t.core.senses.puts.slice(puts))})`);
        t.assert(!(await t.page.locator(tid('voice-notice')).isVisible()), 'no notice');
        const vm = await openListening(t);
        await ask(t, vm);
        const label = await t.visible('voice-label', { timeout: 20000 });
        await t.waitFor(async () => norm(await t.text(label)) === 'iPhone voice', { timeout: 15000, message: 'the label: the iPhone voice' });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).length > 0, { timeout: 20000, message: 'the iPhone voice speaks' });
        t.assert(t.core.senses.speaks.length === 0, 'nothing asked of the home base’s voice');
        await t.screenshot('2-iphone-voice');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 40000, message: 'done speaking' });
        await (await t.visible('voice-close')).click();
      });
      await t.step('Settings → Voice: off, and on again is his choice', async () => {
        const card = await settingsVoice(t);
        await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-tag')))) === 'iPhone voice', { timeout: 8000, message: 'the iPhone voice' });
        const sw = card.locator(tid('jarvis-voice-homebase-toggle'));
        t.assert(!(await sw.isChecked()), 'the switch is off');
        await t.screenshot('3-settings-off');
        await sw.click();
        await t.waitFor(async () => (await stored(t)).homeBaseSpeak === true, { timeout: 10000, message: 'on again' });
        t.assert((await stored(t)).homeBaseSpeakBy === 'owner', 'the owner’s choice');
        t.assert(JSON.stringify(speakPuts(t).at(-1)) === JSON.stringify({ speak: { enabled: true } }), 'on at the home base');
        await t.waitFor(async () => /getting ready on your Alienware|George · home base/.test(await t.text(card)), { timeout: 10000, message: 'getting ready, or ready' });
      });
    },
  },
  {
    name: 'george-two-devices',
    title: 'The iPhone and the Mac on one home base: George turns on by himself on both; Turn off on the Mac’s notice turns him off on the Mac only — the home base keeps him and the iPhone’s next reply is George; when an older Jarvis turns him off at the home base, the iPhone (still on) turns him on there again',
    device: 'iphone13',
    seed: FRESH_LINK,
    fakeCore: { senses: { downloadSteps: 2, shared: true } },
    timeout: 200000,
    async run(t) {
      const phone = await t.newPage({ device: 'iphone13' });
      await prepPage(phone);
      await t.goto('/', { page: phone });
      const phoneCore = t.core; // the iPhone's own requests
      const home = phoneCore.senses; // the one home base
      await t.step('iPhone: George on by himself, then ready', async () => {
        await t.waitFor(async () => speakPuts(t).length === 1, { timeout: 10000, message: 'the auto-enable PUT' });
        await phone.locator(tid('voice-notice')).waitFor({ state: 'visible', timeout: 10000 });
        await t.waitFor(async () => (await phone.locator(tid('voice-notice')).getAttribute('data-state')) === 'ready', { timeout: 30000, message: 'the ready notice' });
        const s = await storedOn(phone);
        t.assert(s.homeBaseSpeak === true && s.homeBaseSpeakBy === 'auto', `on, by itself (${s.homeBaseSpeak}, ${s.homeBaseSpeakBy})`);
      });
      const mac = await t.newPage({ device: 'mac' });
      await prepPage(mac);
      await t.goto('/', { page: mac });
      const macCore = t.core;
      t.assert(macCore !== phoneCore && macCore.senses === home, 'two devices, one home base');
      await t.step('Mac: on by itself; Turn off on its notice is the Mac’s alone', async () => {
        await t.waitFor(async () => (await storedOn(mac)).homeBaseSpeakBy === 'auto', { timeout: 15000, message: 'the Mac turned George on by itself' });
        const notice = mac.locator(tid('voice-notice'));
        await notice.waitFor({ state: 'visible', timeout: 10000 });
        await t.waitFor(async () => (await notice.getAttribute('data-state')) === 'ready', { timeout: 30000, message: 'the Mac’s ready notice' });
        await mac.locator(tid('voice-notice-off')).click();
        await t.waitFor(async () => (await storedOn(mac)).homeBaseSpeak === false, { timeout: 10000, message: 'off on the Mac' });
        t.assert((await storedOn(mac)).homeBaseSpeakBy === 'owner', 'the owner’s choice');
        t.assert(/Off\. Jarvis speaks with the built-in voice\./.test(await t.text(mac.locator(tid('voice-notice-text')))), 'the Mac says so');
        await mac.waitForTimeout(1500);
        t.assert(!speakPuts(t).some((p) => p.speak.enabled === false), `the home base keeps George (${JSON.stringify(home.puts)})`);
        t.assert(home.speak.enabled === true && home.speak.state === 'ready', `George still on and ready at the home base (${JSON.stringify(home.speak)})`);
        const s = await storedOn(phone);
        t.assert(s.homeBaseSpeak === true && s.homeBaseSpeakBy === 'auto', `the iPhone unchanged (${s.homeBaseSpeak}, ${s.homeBaseSpeakBy})`);
        await t.screenshot('1-mac-off', mac);
      });
      await t.step('iPhone: the next reply is George from the home base', async () => {
        const asked = home.speaks.length;
        const { labels, said } = await voiceReply(t, phone);
        t.assert(labels[0] === 'voice-label:George · home base:homebase', `labelled George (${labels.join(' | ')})`);
        t.assert(home.speaks.length > asked && phoneCore.requests.includes('POST /api/speak'), 'made by the home base for the iPhone');
        t.assert(!said, `the iPhone voice said nothing (${said})`);
      });
      await t.step('Mac: its own built-in voice', async () => {
        const { labels } = await voiceReply(t, mac);
        t.assert(labels[0] === 'voice-label:built-in voice:device', `labelled built-in voice (${labels.join(' | ')})`);
        t.assert(!macCore.requests.includes('POST /api/speak'), 'nothing asked of the home base’s voice from the Mac');
      });
      await t.step('an older Jarvis turns George off at the home base: the iPhone, still on, turns him on there again', async () => {
        Object.assign(home.speak, { enabled: false, state: 'off', progress: 0 });
        const n = phoneCore.requests.length;
        const m = macCore.requests.length;
        const puts = home.puts.length;
        await phone.bringToFront();
        await phone.locator(tid('settings-button')).click();
        const card = phone.locator(tid('jarvis-voice'));
        await card.waitFor({ state: 'visible', timeout: 10000 });
        await card.scrollIntoViewIfNeeded();
        await t.waitFor(async () => phoneCore.requests.slice(n).includes('PUT /api/senses'), { timeout: 10000, message: 'the iPhone turned George on at the home base again' });
        t.assert(JSON.stringify(home.puts.slice(puts)) === JSON.stringify([{ speak: { enabled: true } }]), `one PUT speak enabled:true (${JSON.stringify(home.puts.slice(puts))})`);
        t.assert(!macCore.requests.slice(m).includes('PUT /api/senses'), 'not the Mac (off there)');
        await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-tag')))) === 'George · home base', { timeout: 20000, message: 'George ready again on the iPhone' });
        t.assert(home.speak.enabled === true && home.speak.state === 'ready', 'on and ready at the home base');
        await t.screenshot('2-iphone-back-on', phone);
      });
    },
  },
  {
    name: 'george-fallback',
    title: 'iPhone, Voice Mode: George from the home base starts the reply, the home base fails mid-reply, the iPhone voice says the rest — and the label changes from “George · home base” to “iPhone voice”',
    device: 'iphone13',
    seed: { settings: { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'auto' } },
    fakeCore: { senses: { speak: 'ready', speakDelayMs: 1500 } },
    allowConsole: [/Failed to load resource: the server responded with a status of 500/],
    timeout: 120000,
    async run(t) {
      await setup(t);
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'api/senses read at launch' });
      const vm = await openListening(t);
      await ask(t, vm);
      await t.step('George first', async () => {
        await t.waitFor(async () => t.core.senses.speaks.length >= 1, { timeout: 20000, message: 'the first sentence asked of the home base' });
        t.core.senses.speakMode = 'error'; // the home base fails from the next sentence on
        const label = await t.visible('voice-label', { timeout: 10000 });
        t.assert(norm(await t.text(label)) === 'George · home base', `George first (${await t.text(label)})`);
        await t.screenshot('1-george');
      });
      await t.step('the iPhone voice says the rest, and the label says so', async () => {
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).length > 0, { timeout: 25000, message: 'the iPhone voice took over' });
        const label = t.page.locator(tid('voice-label'));
        await t.waitFor(async () => (await label.isVisible()) && norm(await t.text(label)) === 'iPhone voice', { timeout: 5000, message: async () => `the label changed (${await t.text(label)})` });
        t.assert((await label.getAttribute('data-engine')) === 'device', 'data-engine device');
        await t.screenshot('2-fallback');
        const labels = await t.page.evaluate(() => window.__labels.filter((x) => x.startsWith('voice-label:')));
        t.assert(labels[0] === 'voice-label:George · home base:homebase' && labels.includes('voice-label:iPhone voice:device'), `in that order (${labels.join(' | ')})`);
        const said = await t.page.evaluate(() => window.__voice.said.join(' '));
        t.assert(!/^The capital of France is Paris\./.test(said), `George said the first words, the iPhone voice the rest (${said})`);
      });
    },
  },
  {
    name: 'george-away',
    title: 'iPhone away from home, the home base not answering (Tailscale on, the Alienware asleep: every request hangs): the reply is spoken by the iPhone voice at once instead of after 6 s of silence, nothing asked of George meanwhile; once the home base answers a reading again, George speaks again',
    device: 'iphone13',
    seed: { settings: { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'auto' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'api/senses read at launch: George ready' });
      await t.page.waitForTimeout(1500);
      t.core.delayMs = 120000; // every request to the home base now hangs: no answer, no error
      const n0 = t.core.requests.length;
      await t.step('Voice Mode: the reply is heard at once, in the iPhone voice', async () => {
        const vm = await openListening(t);
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.listens)) >= 1, { timeout: 8000, message: 'the recognizer' });
        await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
        let shownAt = 0;
        await t.waitFor(
          async () => {
            const turns = t.page.locator(tid('turn-jarvis'));
            if (!shownAt && (await turns.count()) && /Paris/.test(await t.text(turns.last()))) shownAt = Date.now();
            return shownAt > 0;
          },
          { timeout: 20000, interval: 50, message: 'the reply on screen' },
        );
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).length > 0, { timeout: 15000, interval: 50, message: 'the iPhone voice' });
        const silence = (Date.now() - shownAt) / 1000;
        t.assert(silence < 2, `the iPhone voice ${silence.toFixed(1)} s after the reply came (before: 6 s of silence while George's first request waited)`);
        const label = await t.visible('voice-label', { timeout: 5000 });
        t.assert(norm(await t.text(label)) === 'iPhone voice', `labelled (${await t.text(label)})`);
        t.assert(!t.core.requests.slice(n0).includes('POST /api/speak'), `nothing asked of George meanwhile (${t.core.requests.slice(n0).join(', ')})`);
        await t.screenshot('1-iphone-voice');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 40000, message: 'done speaking' });
        await (await t.visible('voice-close')).click();
      });
      await t.step('the home base answers again: George speaks again', async () => {
        t.core.delayMs = 0;
        const gets = t.core.senses.gets;
        await t.page.waitForTimeout(11000); // the app reads api/senses at most every 10 s
        const vm = await openListening(t);
        await t.waitFor(async () => t.core.senses.gets > gets, { timeout: 10000, message: 'a new reading of the home base' });
        const asked = t.core.senses.speaks.length;
        await t.page.evaluate((q) => window.__voice.say(q), QUESTION);
        await t.waitFor(async () => t.core.senses.speaks.length > asked, { timeout: 20000, message: 'George asked again' });
        const label = await t.visible('voice-label', { timeout: 10000 });
        await t.waitFor(async () => norm(await t.text(label)) === 'George · home base', { timeout: 10000, message: async () => `George again (${await t.text(label)})` });
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 40000, message: 'done speaking' });
      });
    },
  },
  noHomeBase('iphone13'),
  noHomeBase('mac'),
  {
    name: 'george-old-core',
    title: 'iPhone with a Jarvis Core 1.1 (no hearing or voice): nothing is turned on by itself, no notice; Settings → Voice says the iPhone voice speaks',
    device: 'iphone13',
    seed: FRESH_LINK,
    fakeCore: { senses: false },
    allowConsole: [/Failed to load resource: the server responded with a status of 404/],
    timeout: 60000,
    async run(t) {
      await setup(t);
      await t.waitFor(async () => t.core.requests.includes('GET /api/senses'), { timeout: 10000, message: 'asked once' });
      await t.page.waitForTimeout(2000);
      t.assert(!t.core.requests.some((r) => r === 'PUT /api/senses'), `nothing turned on (${t.core.requests.join(', ')})`);
      t.assert(!(await t.page.locator(tid('voice-notice')).isVisible()), 'no notice');
      const s = await stored(t);
      t.assert(s.homeBaseSpeak !== true && !s.homeBaseSpeakBy, `unchanged: tried again once the Core can (${s.homeBaseSpeak}, ${s.homeBaseSpeakBy})`);
      const card = await settingsVoice(t);
      await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-tag')))) === 'iPhone voice', { timeout: 8000, message: 'the iPhone voice' });
      await t.screenshot('1-settings');
    },
  },
  {
    name: 'george-stuck',
    title: 'iPhone, George’s sound never starts (Web Audio stuck: the context suspended and resume() doing nothing, as after an interruption, the microphone taking the audio session, or a context never unlocked): the reply is said by the iPhone voice within about 5 s, labelled so; Voice Mode listens on and its next reply starts on the iPhone voice at once; Settings → Voice says why and George stays on; a reply’s Speak tap is said by the iPhone voice too; once the audio works again, a tap on Test brings George back',
    device: 'iphone13',
    seed: { settings: { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'auto' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 200000,
    async run(t) {
      await t.newPage();
      await prepPage(t.page);
      await t.page.addInitScript(installStuckAudio, { on: true });
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'api/senses read at launch: George ready' });
      const said = () => t.page.evaluate(() => window.__voice.said.join(' '));
      const saidCount = () => t.page.evaluate(() => window.__voice.said.length);
      let vm = null;
      await t.step('Voice Mode: George is asked, his sound never starts; the iPhone voice says the reply within about 5 s, every word once, labelled', async () => {
        vm = await openListening(t);
        await ask(t, vm);
        await t.waitFor(async () => t.core.senses.speaks.length >= 1, { timeout: 20000, message: 'George asked for the reply' });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__stuckAudio.starts.length)) >= 1, { timeout: 15000, message: 'George’s first chunk put on the (stuck) clock' });
        await t.waitFor(async () => (await saidCount()) > 0, { timeout: 15000, interval: 50, message: 'the iPhone voice' });
        const gap = await t.page.evaluate(() => window.__voice.log[0].at - window.__stuckAudio.starts[0].t);
        t.assert(gap >= 3000 && gap <= 5500, `the iPhone voice ${(gap / 1000).toFixed(1)} s after George’s first words were due (about 3.5 s: a kick at 1.5 s, the handoff at 3.5 s)`);
        t.note(`iPhone voice after ${(gap / 1000).toFixed(2)} s`);
        const clock = await t.page.evaluate(() => window.__stuckAudio.contexts.map((c) => [c.state, c.currentTime]));
        t.assert(clock.length === 1 && clock[0][0] !== 'running', `George’s audio really is stuck (${JSON.stringify(clock)})`);
        const label = await t.visible('voice-label', { timeout: 5000 });
        await t.waitFor(async () => norm(await t.text(label)) === 'iPhone voice', { timeout: 5000, message: async () => `the label: the iPhone voice (${await t.text(label)})` });
        await t.screenshot('1-iphone-voice');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 40000, message: 'done speaking: Voice Mode is not left in “speaking”' });
        const all = norm(await said());
        t.assert(/^The capital of France is Paris\. /.test(all) && /travel brief, Tony\?$/.test(all), `the iPhone voice said the whole reply, from its first word (${all})`);
        t.assert(all.split('Paris.').length === 2, `each word once (${all})`);
        const labels = await t.page.evaluate(() => window.__labels.filter((x) => x.startsWith('voice-label:')));
        t.assert(labels[0] === 'voice-label:George · home base:homebase' && labels.includes('voice-label:iPhone voice:device'), `George first, then the iPhone voice (${labels.join(' | ')})`);
      });
      await t.step('Voice Mode listens on; the next reply starts on the iPhone voice at once, nothing asked of George', async () => {
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening' && (await t.page.evaluate(() => window.__voice.listens)) >= 2, { timeout: 15000, message: 'listening for the next turn' });
        const asked = t.core.senses.speaks.length;
        const n = await saidCount();
        await t.page.evaluate(() => window.__voice.say('What is the capital of Germany?'));
        let shownAt = 0;
        await t.waitFor(
          async () => {
            const turns = t.page.locator(tid('turn-jarvis'));
            if (!shownAt && (await turns.count()) && /Berlin/.test(await t.text(turns.last()))) shownAt = Date.now();
            return shownAt > 0;
          },
          { timeout: 20000, interval: 50, message: 'the second reply on screen' },
        );
        await t.waitFor(async () => (await saidCount()) > n, { timeout: 15000, interval: 50, message: 'the iPhone voice' });
        const silence = (Date.now() - shownAt) / 1000;
        t.assert(silence < 2, `the iPhone voice ${silence.toFixed(1)} s after the reply came (no new 3.5 s wait)`);
        t.note(`next reply ${silence.toFixed(2)} s`);
        t.assert(t.core.senses.speaks.length === asked, `nothing asked of George (${JSON.stringify(t.core.senses.speaks.slice(asked))})`);
        const label = await t.visible('voice-label', { timeout: 5000 });
        t.assert(norm(await t.text(label)) === 'iPhone voice', `labelled (${await t.text(label)})`);
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 40000, message: 'done speaking' });
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening', { timeout: 15000, message: 'listening again' });
        await (await t.visible('voice-close')).click();
      });
      await t.step('Settings → Voice → Jarvis’s voice says why; George’s switch stays on', async () => {
        const card = await settingsVoice(t);
        await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-tag')))) === 'iPhone voice', { timeout: 8000, message: async () => `the iPhone voice speaks (${await t.text(card)})` });
        const pending = card.locator(tid('jarvis-voice-pending'));
        t.assert((await pending.isVisible()) && (await pending.getAttribute('data-state')) === 'stuck', 'the reason is shown');
        t.assert(norm(await t.text(pending)) === 'George’s sound didn’t start on this iPhone, so the iPhone voice is speaking. Tap Test to try again.', `in plain words (${await t.text(pending)})`);
        t.assert(await card.locator(tid('jarvis-voice-homebase-toggle')).isChecked(), 'the switch is on');
        const s = await stored(t);
        t.assert(s.homeBaseSpeak === true, 'George’s setting untouched');
        await t.screenshot('2-settings-stuck');
        await (await t.visible('settings-close')).click();
      });
      await t.step('a reply’s Speak tap: George gets another chance (a tap), his sound still doesn’t start, and the iPhone voice reads it within about 5 s, labelled beside Stop', async () => {
        const speakBtn = t.page.locator(tid('turn-speak')).last();
        await speakBtn.waitFor({ state: 'visible', timeout: 10000 });
        const asked = t.core.senses.speaks.length;
        const n = await saidCount();
        const t0 = Date.now();
        await speakBtn.click();
        await t.waitFor(async () => (await saidCount()) > n, { timeout: 15000, interval: 50, message: 'the iPhone voice reads it' });
        const took = (Date.now() - t0) / 1000;
        t.assert(took <= 6, `read by the iPhone voice ${took.toFixed(1)} s after the tap`);
        t.note(`Speak ${took.toFixed(2)} s`);
        t.assert(t.core.senses.speaks.length > asked, 'George was tried again (the tap unlocks audio)');
        const tag = t.page.locator(tid('turn-speak-voice')).last();
        await t.waitFor(async () => (await tag.isVisible()) && norm(await t.text(tag)) === 'iPhone voice', { timeout: 5000, message: async () => `the label beside Stop (${await t.text(tag)})` });
        await t.screenshot('3-read-aloud');
        await t.waitFor(async () => !(await tag.isVisible()), { timeout: 40000, message: 'read to the end' });
      });
      await t.step('the audio works again: a tap on Test brings George back by himself', async () => {
        await t.page.evaluate(() => window.__stuckAudio.lift());
        const card = await settingsVoice(t);
        const asked = t.core.senses.speaks.length;
        const n = await saidCount();
        await card.locator(tid('jarvis-voice-test')).click();
        await t.waitFor(async () => /This is the voice I speak with\./.test(t.core.senses.speaks.slice(asked).map((x) => x.text).join(' ')), { timeout: 15000, message: 'George asked for the test sentence' });
        await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-test')))) === 'Test', { timeout: 20000, message: 'the test sentence ends' });
        t.assert((await saidCount()) === n, `George said it, not the iPhone voice (${await said()})`);
        const clock = await t.page.evaluate(() => window.__stuckAudio.contexts.map((c) => [c.state, c.currentTime]));
        // v7.8.1 integrator (review M1): each tap while the sound is known stuck starts a fresh context inside the
        // tap (the Speak tap above, and this Test), and closes the stuck one.
        const newest = clock[clock.length - 1];
        t.assert(clock.length === 3 && clock.slice(0, -1).every(([state]) => state === 'closed') && newest[0] === 'running' && newest[1] > 0, `George’s audio runs again, on the context started by this tap (${JSON.stringify(clock)})`);
        await t.waitFor(async () => norm(await t.text(card.locator(tid('jarvis-voice-tag')))) === 'George · home base', { timeout: 8000, message: 'Jarvis’s voice: George again' });
        t.assert(!(await card.locator(tid('jarvis-voice-pending')).isVisible()), 'the reason is gone');
        await t.screenshot('4-george-back');
      });
    },
  },
  {
    name: 'george-stuck-midway',
    title: 'iPhone, Voice Mode: George’s sound stops in the middle of a sentence (Web Audio’s clock stops: an audio interruption): within about 3.5 s the iPhone voice says the rest from the last word heard, labelled so, and Voice Mode listens again',
    device: 'iphone13',
    seed: { settings: { homeBaseUrl: CORE_URL, homeBaseSpeak: true, homeBaseSpeakBy: 'auto' } },
    fakeCore: { senses: { speak: 'ready' } },
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await prepPage(t.page);
      await t.page.addInitScript(installStuckAudio, { on: false });
      await t.goto('/');
      await t.waitFor(async () => t.core.senses.gets >= 1, { timeout: 10000, message: 'api/senses read at launch: George ready' });
      const vm = await openListening(t);
      await ask(t, vm);
      await t.step('George speaks; his clock stops 0.7 s into his first sentence', async () => {
        // In the page, so the clock stops at once when George is that far in.
        await t.page.waitForFunction(
          () => {
            const s = window.__stuckAudio;
            const c = s.contexts[0];
            if (!c || !s.starts.length || c.currentTime < s.starts[0].when + 0.7) return false;
            s.stop();
            return true;
          },
          null,
          { timeout: 20000, polling: 20 },
        );
        const label = await t.visible('voice-label', { timeout: 5000 });
        t.assert(norm(await t.text(label)) === 'George · home base', `George was speaking (${await t.text(label)})`);
        t.assert((await t.page.evaluate(() => window.__voice.said.length)) === 0, 'the iPhone voice said nothing yet');
        await t.screenshot('1-george');
      });
      await t.step('the iPhone voice says the rest from the last word heard, within about 3.5 s, labelled so', async () => {
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.length)) > 0, { timeout: 15000, interval: 50, message: 'the iPhone voice' });
        const gap = await t.page.evaluate(() => window.__voice.log[0].at - window.__stuckAudio.stoppedAt);
        t.assert(gap >= 3000 && gap <= 5500, `the iPhone voice ${(gap / 1000).toFixed(1)} s after the clock stopped`);
        t.note(`iPhone voice ${(gap / 1000).toFixed(2)} s after the stop`);
        const label = t.page.locator(tid('voice-label'));
        await t.waitFor(async () => (await label.isVisible()) && norm(await t.text(label)) === 'iPhone voice', { timeout: 5000, message: async () => `the label changed (${await t.text(label)})` });
        await t.screenshot('2-iphone-voice');
        await t.waitFor(async () => (await vm.getAttribute('data-state')) !== 'speaking', { timeout: 40000, message: 'done speaking' });
        const said = norm(await t.page.evaluate(() => window.__voice.said.join(' ')));
        const sentence = 'The capital of France is Paris.';
        const head = said.slice(0, said.indexOf('Paris.') + 'Paris.'.length); // what the iPhone voice said of George's first sentence
        t.assert(said.includes('Paris.') && sentence.endsWith(` ${head}`) && head !== sentence, `from a word inside George’s first sentence, not its start: the rest of it (${said})`);
        t.assert(/travel brief, Tony\?$/.test(said) && said.split('Paris.').length === 2, `then everything after it, once (${said})`);
        t.note(`from “${said.split(' ')[0]}”`);
      });
      await t.step('Voice Mode listens again', async () => {
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'listening' && (await t.page.evaluate(() => window.__voice.listens)) >= 2, { timeout: 15000, message: 'listening for the next turn' });
      });
    },
  },
];
