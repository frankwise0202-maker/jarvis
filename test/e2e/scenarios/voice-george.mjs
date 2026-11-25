// v7.8 (SPEC §26): "Jarvis speaks with George". The owner never heard a difference through the voice
// updates: every better voice was off until he found its switch. A fake Core (core-fakes.mjs
// fakeSenses, a Jarvis Core 1.2 with hearing and voice) at https://alienware.tail4e5f6a.ts.net/.
//   george-auto / george-auto-mac   a linked home base turns George on by itself, once: PUT speak
//                                   enabled, the notice ("Getting it ready…", then ready, Hear him), the
//                                   label "George · home base" in Voice Mode and on a reply read aloud;
//                                   a reload asks nothing again
//   george-off                      the notice's Turn off: off here and at the home base, and it stays
//                                   off (a reload, Voice Mode: "iPhone voice"); Settings → Voice shows it
//   george-fallback                 George failing mid-reply: the label changes to "iPhone voice"
//   george-no-homebase(-mac)        no home base: Jarvis's voice offers George on this device (its
//                                   download, "may be slow on iPhone") and the better-voice tip; Test
//   george-old-core                 a Jarvis Core 1.1 (no senses): nothing turned on, no notice

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';

const QUESTION = 'What is the capital of France?';
const FRESH_LINK = { settings: { homeBaseUrl: CORE_URL, homeBaseSpeakBy: '' } }; // never switched on this device
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const stored = (t) => t.page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}'));
const speakPuts = (t) => t.core.senses.puts.filter((p) => p.speak);

async function setup(t) {
  await t.newPage();
  await t.page.addInitScript(installFakeSpeech, { noSpeechMs: 900 });
  await t.page.addInitScript(() => {
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
  await t.goto('/');
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
    title: 'iPhone: George turned on by himself, then the owner taps Turn off on the notice: off here and at the home base, and it stays off (a reload asks nothing; Voice Mode speaks with the iPhone voice and says so); Settings → Voice shows the iPhone voice with the switch off, and turning it on there is the owner’s choice',
    device: 'iphone13',
    seed: FRESH_LINK,
    fakeCore: { senses: { downloadSteps: 2 } },
    timeout: 150000,
    async run(t) {
      await setup(t);
      await t.step('turned on, then off from the notice', async () => {
        await t.visible('voice-notice', { timeout: 10000 });
        await t.page.locator(tid('voice-notice-off')).click();
        await t.waitFor(async () => speakPuts(t).some((p) => p.speak.enabled === false), { timeout: 10000, message: 'PUT speak enabled:false' });
        const s = await stored(t);
        t.assert(s.homeBaseSpeak === false && s.homeBaseSpeakBy === 'owner', `off, the owner’s choice (${s.homeBaseSpeak}, ${s.homeBaseSpeakBy})`);
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
];
