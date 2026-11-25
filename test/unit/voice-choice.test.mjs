// v7.8 (SPEC §26): "Jarvis speaks with George". The auto-enable rules (src/lib/voice-choice.js,
// src/ui/voice-auto.js), the voice label, the voice in use, the short first chunk for the home base's
// voice (speech-text.js takeFirstClause and natural-stream.js), the voice warm-up through PUT, and the
// router's voice-change events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoSpeakDecision, voiceLabel, deviceVoiceWord, voiceInUse, homeVoicePending, thisDevice } from '../../src/lib/voice-choice.js';
import { createVoiceAuto, setHomeBaseVoice } from '../../src/ui/voice-auto.js';
import { createSenses } from '../../src/ui/senses.js';
import { sensesView } from '../../src/lib/senses.js';
import { newText, ingest, segment, takeFirstClause, takeChunk } from '../../src/platform/voice/speech-text.js';
import { HOMEBASE_CHUNKS, HOMEBASE_FIRST, createHomeBaseVoiceEngine } from '../../src/platform/voice/homebase-voice.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../../src/platform/settings.js';
import { RESTORED_SETTINGS } from '../../src/platform/backup.js';
import { betterVoiceTip } from '../../src/ui/voice-card.js';
import { createFakeSpeech } from './platform.voice.fakeengine.test.mjs';
import { installClock, createFakeEngine, createFakeAudio } from './natural.fakes.mjs';

const BASE = 'https://alienware.tail4e5f6a.ts.net/';
const LINKED = { homeBaseUrl: BASE, homeBaseSpeak: false, homeBaseSpeakBy: '' };
const VIEW = sensesView({
  hear: { enabled: false, state: 'off', model: 'base.en', sizeMb: 80 },
  speak: { enabled: false, state: 'off', voice: 'bm_george', sizeMb: 326 },
  deps: { installed: true },
});

// ---- the setting -------------------------------------------------------------------------------------

test('settings: homeBaseSpeakBy is "" by default, only "", "auto" or "owner", and never in a backup', () => {
  assert.equal(DEFAULT_SETTINGS.homeBaseSpeakBy, '');
  assert.equal(normalizeSettings({ homeBaseSpeakBy: 'auto' }).homeBaseSpeakBy, 'auto');
  assert.equal(normalizeSettings({ homeBaseSpeakBy: 'owner' }).homeBaseSpeakBy, 'owner');
  assert.equal(normalizeSettings({ homeBaseSpeakBy: 'someone' }).homeBaseSpeakBy, '');
  assert.ok(!RESTORED_SETTINGS.includes('homeBaseSpeakBy'));
});

// ---- the auto-enable rules -----------------------------------------------------------------------------

test('auto-enable rules: a linked home base whose Core has a voice, never switched on this device: on', () => {
  assert.deepEqual(autoSpeakDecision({ settings: LINKED, view: VIEW }), { act: true, why: 'ok' });
  // The voice already on at the home base (turned on from the Mac): this device too.
  const on = sensesView({ ...VIEW, speak: { enabled: true, state: 'ready', voice: 'bm_george' } });
  assert.equal(autoSpeakDecision({ settings: LINKED, view: on }).act, true);
  // Still downloading there: on here too (until it's ready, today's voices speak).
  const dl = sensesView({ ...VIEW, speak: { enabled: true, state: 'downloading', progress: 0.4 } });
  assert.equal(autoSpeakDecision({ settings: LINKED, view: dl }).act, true);
});

test('auto-enable rules: never after the owner chose, never twice, never without a home base or in the demo', () => {
  const why = (settings, extra = {}) => autoSpeakDecision({ settings, view: VIEW, ...extra }).why;
  assert.equal(why({ ...LINKED, homeBaseSpeakBy: 'owner' }), 'owner', 'he switched it off (or on) himself');
  assert.equal(why({ ...LINKED, homeBaseSpeakBy: 'auto' }), 'done', 'once only');
  assert.equal(why({ ...LINKED, homeBaseSpeak: true }), 'on', 'already on (v7.7: he turned it on)');
  assert.equal(why({ ...LINKED, homeBaseUrl: '' }), 'unlinked');
  assert.equal(why(LINKED, { demo: true }), 'demo');
  for (const s of [{ ...LINKED, homeBaseSpeakBy: 'owner' }, { ...LINKED, homeBaseSpeakBy: 'auto' }]) assert.equal(autoSpeakDecision({ settings: s, view: VIEW }).act, false);
});

test('auto-enable rules: a 1.1 Core without senses, no answer, no speech software, an error: not now', () => {
  assert.equal(autoSpeakDecision({ settings: LINKED, view: null, problem: { state: 'old' } }).why, 'old');
  assert.equal(autoSpeakDecision({ settings: LINKED, view: null, problem: { state: 'offline' } }).why, 'unreachable');
  assert.equal(autoSpeakDecision({ settings: LINKED, view: null, problem: null }).why, 'unknown');
  assert.equal(autoSpeakDecision({ settings: LINKED, view: sensesView({ ...VIEW, deps: { installed: false } }) }).why, 'nodeps');
  assert.equal(autoSpeakDecision({ settings: LINKED, view: sensesView({ ...VIEW, speak: { enabled: true, state: 'error', error: 'load failed' } }) }).why, 'error');
});

/** A senses controller with a fake client: { ctl, calls, set, core } (core: the fake Core's state). */
function sensesWith({ settings = LINKED, core = { speak: 'off', old: false, offline: false, refuse: false } } = {}) {
  let s = { ...settings };
  const calls = { get: 0, put: [] };
  const state = { ...core };
  const view = () =>
    sensesView({
      hear: { enabled: false, state: 'off', model: 'base.en', sizeMb: 80 },
      speak: { enabled: state.speak !== 'off', state: state.speak, voice: 'bm_george', sizeMb: 326, progress: state.speak === 'ready' ? 1 : 0.3 },
      deps: { installed: true },
    });
  const client = {
    getSenses: async () => {
      calls.get += 1;
      if (state.old) return { ok: false, kind: 'http', status: 404, code: 'not_found' };
      if (state.offline) return { ok: false, kind: 'unreachable' };
      return { ok: true, senses: view() };
    },
    putSenses: async (base, patch) => {
      calls.put.push(patch);
      if (state.refuse) return { ok: false, kind: 'http', status: 429, code: 'rate_limited', message: 'too many requests' };
      if (patch.speak) state.speak = patch.speak.enabled ? (state.speak === 'off' ? 'downloading' : state.speak) : 'off';
      return { ok: true, senses: view() };
    },
    hearWav: async () => ({ ok: true, text: '' }),
    speakText: async () => ({ ok: true, pcm: new Float32Array(10), sampleRate: 24000 }),
  };
  let t = 5_000_000;
  const listeners = new Set();
  const ctl = createSenses({ getSettings: () => s, onSettingsChange: (fn) => listeners.add(fn), client, now: () => t, setTimer: () => 0, clearTimer: () => {} });
  return {
    ctl,
    calls,
    core: state,
    advance: (ms) => (t += ms),
    get: () => s,
    save: (p) => {
      s = normalizeSettings({ ...s, ...p });
      for (const fn of listeners) fn(s);
      return s;
    },
  };
}

test('auto-enable: turns George on once (this device and the home base), records it, and says so', async () => {
  const x = sensesWith();
  let notices = 0;
  const auto = createVoiceAuto({ senses: x.ctl, getSettings: x.get, saveSettings: x.save, onEnabled: () => (notices += 1) });
  const r = await auto.check();
  assert.deepEqual(r, { act: true, why: 'ok' });
  assert.deepEqual(x.calls.put, [{ speak: { enabled: true } }], 'PUT api/senses at the home base');
  assert.equal(x.get().homeBaseSpeak, true);
  assert.equal(x.get().homeBaseSpeakBy, 'auto', 'recorded as automatic');
  assert.equal(notices, 1, 'the notice');
  // Never again, even after a reload with the same settings.
  const again = await auto.check({ force: true });
  assert.equal(again.act, false);
  assert.equal(x.calls.put.length, 1);
});

test('auto-enable: the owner turns it off, and it stays off (here and at the home base)', async () => {
  const x = sensesWith();
  const auto = createVoiceAuto({ senses: x.ctl, getSettings: x.get, saveSettings: x.save });
  await auto.check();
  await setHomeBaseVoice(x.ctl, false, { commit: x.save });
  assert.equal(x.get().homeBaseSpeak, false);
  assert.equal(x.get().homeBaseSpeakBy, 'owner');
  assert.deepEqual(x.calls.put.at(-1), { speak: { enabled: false } }, 'off at the home base too');
  for (let i = 0; i < 3; i++) {
    x.advance(60_000);
    const r = await auto.check({ force: true });
    assert.equal(r.why, 'owner');
  }
  assert.equal(x.calls.put.length, 2, 'never turned on again');
  // The owner's own on is his choice too.
  const r = await setHomeBaseVoice(x.ctl, true, { commit: x.save });
  assert.equal(r.ok, true);
  assert.equal(x.get().homeBaseSpeak, true);
  assert.equal(x.get().homeBaseSpeakBy, 'owner');
});

test('auto-enable: a 1.1 Core, an unreachable home base, a refused PUT, no home base: nothing changes (tried again later)', async () => {
  const old = sensesWith({ core: { speak: 'off', old: true } });
  const a1 = createVoiceAuto({ senses: old.ctl, getSettings: old.get, saveSettings: old.save });
  assert.equal((await a1.check()).why, 'old');
  assert.equal(old.calls.put.length, 0);
  assert.equal(old.get().homeBaseSpeak, false);
  assert.equal(old.get().homeBaseSpeakBy, '');

  const off = sensesWith({ core: { speak: 'off', offline: true } });
  const a2 = createVoiceAuto({ senses: off.ctl, getSettings: off.get, saveSettings: off.save });
  assert.equal((await a2.check()).why, 'unreachable');
  off.core.offline = false; // back in front, the home base answers now
  off.advance(11_000);
  assert.equal((await a2.check()).act, true);
  assert.equal(off.get().homeBaseSpeakBy, 'auto');

  const busy = sensesWith({ core: { speak: 'off', refuse: true } });
  const a3 = createVoiceAuto({ senses: busy.ctl, getSettings: busy.get, saveSettings: busy.save });
  assert.equal((await a3.check()).why, 'refused');
  assert.equal(busy.get().homeBaseSpeak, false, 'on only once the home base accepted');
  assert.equal(busy.get().homeBaseSpeakBy, '', 'not recorded: the next launch tries again');

  const none = sensesWith({ settings: { ...LINKED, homeBaseUrl: '' } });
  const a4 = createVoiceAuto({ senses: none.ctl, getSettings: none.get, saveSettings: none.save });
  assert.equal((await a4.check()).why, 'unlinked');
  assert.equal(none.calls.get, 0, 'nothing asked');
});

test('auto-enable: in the demo nothing is asked; one check at a time', async () => {
  const x = sensesWith();
  const demo = createVoiceAuto({ senses: x.ctl, getSettings: x.get, saveSettings: x.save, demo: () => true });
  assert.equal((await demo.check()).why, 'demo');
  assert.equal(x.calls.get, 0);
  const auto = createVoiceAuto({ senses: x.ctl, getSettings: x.get, saveSettings: x.save });
  const [a, b] = await Promise.all([auto.check(), auto.check()]);
  assert.deepEqual(a, b);
  assert.equal(x.calls.put.length, 1);
});

// ---- the warm-up -----------------------------------------------------------------------------------------

test('voice warm-up: PUT speak enabled:true when the app comes to the front, at most every 3 minutes, only when on and ready', async () => {
  const x = sensesWith({ settings: { ...LINKED, homeBaseSpeak: true, homeBaseSpeakBy: 'auto' }, core: { speak: 'ready' } });
  await x.ctl.load({ force: true });
  assert.equal(x.ctl.warmVoice(), true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(x.calls.put, [{ speak: { enabled: true } }]);
  assert.equal(x.ctl.warmVoice(), false, 'not again within 3 minutes');
  x.advance(3 * 60 * 1000 + 1);
  assert.equal(x.ctl.warmVoice(), true);
  // Off at the home base (turned off on another device): never turned back on from here.
  const there = sensesWith({ settings: { ...LINKED, homeBaseSpeak: true }, core: { speak: 'off' } });
  await there.ctl.load({ force: true });
  assert.equal(there.ctl.warmVoice(), false);
  // Off on this device: nothing.
  const here = sensesWith({ settings: { ...LINKED, homeBaseSpeak: false }, core: { speak: 'ready' } });
  await here.ctl.load({ force: true });
  assert.equal(here.ctl.warmVoice(), false);
  assert.equal(there.calls.put.length + here.calls.put.length, 0);
});

// ---- the label and the voice in use ------------------------------------------------------------------------

test('voice label: George · home base, George · this device, iPhone voice, built-in voice', () => {
  assert.equal(voiceLabel('homebase', { voiceName: 'George', os: 'ios' }), 'George · home base');
  assert.equal(voiceLabel('natural', { voiceName: 'George', os: 'ios' }), 'George · this device');
  assert.equal(voiceLabel('device', { os: 'ios' }), 'iPhone voice');
  assert.equal(voiceLabel('device', { os: 'mac' }), 'built-in voice');
  assert.equal(voiceLabel('device', { os: 'ipados' }), 'iPad voice');
  assert.equal(voiceLabel('natural', { voiceName: 'Lewis' }), 'Lewis · this device', 'the speaker the owner chose');
  assert.equal(voiceLabel(null), '');
  assert.equal(deviceVoiceWord('windows'), 'built-in voice');
  assert.equal(thisDevice('ios'), 'this iPhone');
  assert.equal(thisDevice('mac'), 'this Mac');
  assert.equal(thisDevice('other'), 'this device');
});

test('voice in use: the same choice as the router, and what is getting ready meanwhile', () => {
  const on = { ...LINKED, homeBaseSpeak: true };
  const ready = sensesView({ ...VIEW, speak: { enabled: true, state: 'ready' } });
  const hb = voiceInUse({ settings: on, senses: { view: ready, canSpeak: true }, os: 'ios' });
  assert.equal(hb.engine, 'homebase');
  assert.equal(hb.label, 'George · home base');
  assert.match(hb.where, /made by your Alienware and played on this iPhone/);
  assert.equal(hb.pending, null);
  // Downloading on the home base: the iPhone voice speaks until it's ready, and says why.
  const dl = sensesView({ ...VIEW, speak: { enabled: true, state: 'downloading', progress: 0.45, sizeMb: 326 } });
  const getting = voiceInUse({ settings: on, senses: { view: dl, canSpeak: false }, device: { name: 'Daniel (Enhanced)' }, os: 'ios' });
  assert.equal(getting.engine, 'device');
  assert.equal(getting.label, 'iPhone voice');
  assert.match(getting.where, /This iPhone’s own voice \(Daniel \(Enhanced\)\)/);
  assert.equal(getting.pending.state, 'downloading');
  assert.match(getting.pending.text, /George is getting ready on your Alienware \(downloading 45% of about 326 MB, once\)/);
  // George on this device when the home base can't.
  const nat = voiceInUse({ settings: { ...on, naturalVoice: true }, senses: { view: dl, canSpeak: false }, natural: { supported: true, state: 'ready' }, os: 'ios' });
  assert.equal(nat.label, 'George · this device');
  assert.match(nat.where, /It can be slow on iPhone/);
  // Known too slow here: the device voice.
  assert.equal(voiceInUse({ settings: { naturalVoice: true }, natural: { supported: true, state: 'off', knownSlow: true }, os: 'ios' }).engine, 'device');
  // Resting after a failure, off at the home base, an old Core, unreachable.
  assert.equal(homeVoicePending({ settings: on, senses: { view: ready, cooling: true } }).state, 'resting');
  assert.equal(homeVoicePending({ settings: on, senses: { view: VIEW } }).state, 'off-there');
  assert.equal(homeVoicePending({ settings: on, senses: { view: null, problem: { state: 'old' } } }).state, 'old');
  assert.equal(homeVoicePending({ settings: on, senses: { view: null, problem: { state: 'offline' } } }).state, 'unreachable');
  assert.equal(homeVoicePending({ settings: LINKED, senses: { view: ready } }), null, 'off on this device: nothing pending');
  // The Mac.
  assert.equal(voiceInUse({ settings: {}, os: 'mac' }).label, 'built-in voice');
});

test('better voice tip: the iPhone steps name Spoken Content, a British voice and its Enhanced/Premium version', () => {
  const t = betterVoiceTip('ios');
  assert.match(t.text, /Settings > Accessibility > Spoken Content > Voices > English > pick a British voice \(for example Daniel or Arthur\) > download its Enhanced or Premium version/);
  assert.match(t.text, /Jarvis already prefers those automatically/);
  assert.match(betterVoiceTip('mac').text, /System Settings > Accessibility > Spoken Content/);
  assert.match(betterVoiceTip('other').title, /built-in voice/);
});

// ---- the first chunk --------------------------------------------------------------------------------------

function firstOf(text, { finished = true, opts } = {}) {
  const tx = newText();
  ingest(tx, text);
  tx.finished = finished;
  segment(tx, 260);
  const r = takeFirstClause(tx, opts);
  const next = takeChunk(tx, 1000);
  return { first: r ? tx.norm.slice(r.start, r.end) : null, rest: next ? tx.norm.slice(next.start, next.end) : null };
}

test('first chunk: cut at the first clause or sentence end 40-60 characters in', () => {
  assert.deepEqual(firstOf('Certainly, Frank. The weather today is mostly sunny, with a high of 72.'), { first: 'Certainly, Frank. The weather today is mostly sunny,', rest: 'with a high of 72.' });
  assert.deepEqual(firstOf('The weather in London is grey and mild today. It may rain later, so take a coat.'), { first: 'The weather in London is grey and mild today.', rest: 'It may rain later, so take a coat.' });
  const f = firstOf('I have checked the three retailers you mentioned, and the best price by far is at Best Buy.').first;
  assert.equal(f, 'I have checked the three retailers you mentioned,');
  assert.ok(f.length >= 40 && f.length <= 60);
});

test('first chunk: a short sentence on its own, a clause from 16 characters, else a word boundary within 60', () => {
  assert.equal(firstOf('Certainly, Frank. The LG 27GP850 is listed at three hundred and twenty nine dollars.').first, 'Certainly, Frank.');
  assert.equal(firstOf('Good evening, Frank. Welcome home. It is seven degrees outside and the house is warm.').first, 'Good evening, Frank. Welcome home.');
  assert.equal(firstOf('Good evening, Frank, I looked into the monitor you asked about this morning and found it.').first, 'Good evening, Frank,');
  const long = firstOf('The quick brown fox jumps over the lazy dog and keeps running across the field until sunset.');
  assert.equal(long.first, 'The quick brown fox jumps over the lazy dog and keeps');
  assert.equal(long.rest, 'running across the field until sunset.');
  assert.equal(firstOf('Yes.').first, 'Yes.');
  assert.equal(firstOf('Here is the list:\n- eggs\n- milk').first, 'Here is the list:', 'never across a line break');
  const noSpace = firstOf('x'.repeat(130)).first;
  assert.equal(noSpace.length, 60, 'a hard cut at 60');
});

test('first chunk: nothing lost or repeated, and the rest stays queued in order', () => {
  const text = 'Good evening, Frank, I looked into the monitor you asked about. The LG is listed at $329 today; Best Buy had it for $299 last week. Shall I watch it for you?';
  const tx = newText();
  ingest(tx, text);
  tx.finished = true;
  segment(tx, 260);
  const parts = [];
  const first = takeFirstClause(tx, HOMEBASE_FIRST.firstCut);
  parts.push(tx.norm.slice(first.start, first.end));
  for (let r = takeChunk(tx, 100); r; r = takeChunk(tx, 100)) parts.push(tx.norm.slice(r.start, r.end));
  assert.equal(parts.join(' '), text);
  assert.ok(parts[0].length <= 60);
});

test('home base engine: asks for the short first chunk; the v7.7 chunk limits stay', () => {
  assert.deepEqual(HOMEBASE_CHUNKS, { firstChunk: 80, maxChunk: 180 });
  assert.deepEqual(HOMEBASE_FIRST.firstCut, { min: 40, max: 60 });
  const engine = createHomeBaseVoiceEngine({ senses: { speak: async () => ({ ok: false }), noteFailure: () => {} } });
  const st = engine.status();
  assert.deepEqual(st.firstCut, { min: 40, max: 60 });
  assert.equal(st.minChunk, 40);
  assert.equal(st.assumedRtf, 0.7);
  assert.equal(st.firstChunk, 80);
  assert.equal(st.maxChunk, 180);
});

// ---- the router: short first chunk end to end, and the voice-change events ------------------------------------

let loads = 0;
async function routerWith(t, { rtf = 0.6, settings = {}, natural = false } = {}) {
  const clock = installClock();
  const speech = createFakeSpeech(clock, {}).install();
  const device = await import(`../../src/platform/voice/tts.js?voicechoice=${++loads}`);
  const { createVoiceRouter } = await import(`../../src/platform/voice/voice-router.js?voicechoice=${loads}`);
  t.after(() => {
    speech.uninstall();
    clock.restore();
  });
  const requests = [];
  const failures = [];
  const senses = {
    speak({ text }, { timeoutMs, signal }) {
      const synthMs = (rtf * text.length * 1000) / 13 + 150; // George at 13 characters a second, plus the network
      requests.push({ chars: text.length, text, at: clock.now, synthMs, timeoutMs });
      return new Promise((resolve) => {
        const timer = setTimeout(() => (synthMs > timeoutMs ? resolve({ ok: false, kind: 'timeout' }) : resolve({ ok: true, pcm: new Float32Array(Math.round((text.length / 13) * 24000)).fill(0.1), sampleRate: 24000 })), Math.min(synthMs, timeoutMs));
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve({ ok: false, kind: 'aborted' });
        });
      });
    },
    noteFailure: (w, k) => failures.push(`${w}:${k}`),
  };
  const engine = createHomeBaseVoiceEngine({ senses, now: () => Date.now() });
  const audio = createFakeAudio(clock);
  const plays = [];
  const play = audio.play;
  audio.play = (pcm, rate, at) => {
    const handle = play(pcm, rate, at);
    plays.push({ at: handle.when, end: handle.when + handle.duration });
    return handle;
  };
  const nEngine = natural ? createFakeEngine(clock, { rtf: 0.3, state: 'ready' }) : null;
  let s = { homeBaseSpeak: true, naturalVoiceId: 'bm_george', naturalVoice: natural, ...settings };
  const router = createVoiceRouter({ device, natural: nEngine ? { engine: nEngine, audio } : null, homebase: { engine, audio, canSpeak: () => true }, getSettings: () => s });
  const run = async (until, max = 20000) => {
    for (let i = 0; i < max && !until(); i++) {
      clock.advance(20);
      await new Promise((done) => setImmediate(done));
    }
  };
  return { clock, speech, router, requests, failures, plays, run, setSettings: (p) => (s = { ...s, ...p }) };
}

const REPLY =
  'Good evening, Frank. The LG 27GP850 is listed at three hundred and twenty nine dollars at most of the large retailers today, which is a little above the price you wanted. ' +
  'Best Buy had it for two hundred and ninety nine dollars last week, so a sale at that level may well come back before the holidays. Shall I keep an eye on it for you?';

test('router: George’s first words come sooner (a short first chunk) and the chunks after it keep up', async (t) => {
  const ctx = await routerWith(t, { rtf: 0.6 });
  const ends = [];
  const s = ctx.router.createSpeechStream({ onEnd: (e) => ends.push(e.reason) });
  const t0 = ctx.clock.now;
  s.append(REPLY);
  s.finish();
  await ctx.run(() => ends.length > 0);
  assert.deepEqual(ends, ['done']);
  assert.deepEqual(ctx.failures, []);
  assert.equal(ctx.speech.submitted.length, 0, 'all George');
  assert.ok(ctx.requests[0].chars <= 60, `first chunk ${ctx.requests[0].chars}: ${ctx.requests[0].text}`);
  const firstAudio = ctx.plays[0].at * 1000 - t0;
  assert.ok(firstAudio < 2000, `first words after ${Math.round(firstAudio)} ms`);
  // The v7.7 first chunk (up to 80 characters) at the same speed: 3.8 s of silence first.
  assert.ok((ctx.requests[0].chars / 13) * 0.6 * 1000 < ((80 / 13) * 0.6 * 1000) / 1.3);
  const gaps = ctx.plays.slice(1).map((p, i) => p.at - ctx.plays[i].end);
  assert.ok(gaps.every((g) => g < 0.8), `no long silence between chunks: ${gaps.map((g) => g.toFixed(2)).join(', ')} s`);
});

test('router: the voice-change events follow the voice actually speaking, George handing over included', async (t) => {
  const ctx = await routerWith(t, { rtf: 0.4 });
  const seen = [];
  const off = ctx.router.onVoiceChange((engine) => seen.push(engine));
  const ends = [];
  const s = ctx.router.createSpeechStream({ onEnd: (e) => ends.push(e.reason) });
  s.append('Good evening, Frank. All is well at home.');
  s.finish();
  await ctx.run(() => ends.length > 0);
  assert.deepEqual(seen, ['homebase', null]);
  assert.equal(ctx.router.voiceNow(), null);

  // The device voice's own speak() (George off): 'device', then null when it ends.
  ctx.setSettings({ homeBaseSpeak: false });
  seen.length = 0;
  const done = [];
  ctx.router.speak('Very good, sir.', { onEnd: (e) => done.push(e.reason) });
  assert.equal(ctx.router.voiceNow(), 'device');
  await ctx.run(() => done.length > 0);
  assert.deepEqual(seen, ['device', null]);
  assert.deepEqual(done, ['done'], 'its onEnd still comes');
  off();
});

test('router: George failing mid-reply switches the label to this device’s voice', async (t) => {
  const ctx = await routerWith(t, { rtf: 0.4 });
  const seen = [];
  ctx.router.onVoiceChange((engine) => seen.push(engine));
  // The home base answers the first request, then fails.
  let n = 0;
  const realSpeak = ctx.router.homebase.engine.synth;
  ctx.router.homebase.engine.synth = (text, opts) => {
    n += 1;
    if (n === 1) return realSpeak(text, opts);
    return { id: 1000 + n, promise: Promise.reject(Object.assign(new Error('down'), { code: 'not-ready' })) };
  };
  const ends = [];
  const s = ctx.router.createSpeechStream({ onEnd: (e) => ends.push(e.reason) });
  s.append(REPLY);
  s.finish();
  await ctx.run(() => ends.length > 0);
  assert.deepEqual(ends, ['done']);
  assert.deepEqual(seen, ['homebase', 'device', null]);
  assert.ok(ctx.speech.completed().length > 0, 'the iPhone voice said the rest');
});
