// v7.8.1 (integrator): after a stall, George's stuck sound (the review of v7.8.1's findings M1-M3 and L1-L2).
// The reviewer's probes P1-P4b are kept here as tests (each failed on the builder's head a94a0cb), driven
// through the real audio-out.js on a WebKit-like fake AudioContext, or through the builder's fakes:
//   L1  our own 30 s idle suspend still landing when a reply's play() comes (WebKit sets `state` only once it
//       has): George starts at once, not 1.5 s later at the watchdog's kick
//   M3  after a stall, George comes back by himself once the output can run again: each reply sent to the
//       device voice meanwhile asks the stuck output to run (audio.probe()), so the next one sees its clock move
//   M1  a tap revives an output whose context says 'running' with its clock stopped (audio.revive() inside the
//       tap: suspend and resume it, then a fresh context), under three models of what iOS needs
//   M2  an unlockSpeech() without a tap (Standby entered again, Voice Mode opened by the wake routine, or
//       navigator.userActivation saying so) keeps what is known: the wake greeting at once on the device voice
//   L2  Settings' Test buttons say "Played" only when the audio clock got past the sample
// The second review's findings (each test failed on aa0b53b):
//   stuck-1   George came back by himself on the context that stalled: the next tap with nothing playing on it
//             starts it afresh (iOS can leave it running but silent), once, never under a reply he is speaking
//   stuck-2   a George reply cancelled after the watchdog's kick counts as a stall
//   normal-1  George switched off on this device: Hearing and voice → Test's tap still starts a stuck output afresh
//   normal-2  the words a Test says when it can't tell (Jarvis in the background, the sound restarted meanwhile)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock, createFakeEngine, createFakeAudio } from './natural.fakes.mjs';
import { createFakeSpeech } from './platform.voice.fakeengine.test.mjs';
import { createAudioOut } from '../../src/platform/voice/natural/audio-out.js';
import { createHomeBaseVoiceEngine } from '../../src/platform/voice/homebase-voice.js';
import { samplePlayed, silentSampleText, unsureSampleText } from '../../src/lib/voice-choice.js';
import { watchAway } from '../../src/ui/dom.js';

let loads = 0;

/**
 * A WebKit-like AudioContext on the virtual clock (installClock): suspend() changes `state` only after
 * `suspendDelayMs` (WebKit stops the audio unit, then sets the state), resume() after `resumeDelayMs`.
 * Stopped clocks, each 'running' with its clock standing still (the iOS case the brief names):
 *   ctx._zombie         this context only (nothing but a fresh context runs)
 *   model.zombie        every context of the page, until cured; model.cure says how:
 *     'suspend-resume'  a resume() of a context that was suspended before (the reviewer's model, P3)
 *     'gesture-start'   any resume() that starts audio, a new context's first one included
 *   model.reviveNeedsGesture: the cure counts only inside a tap (model.gestureUntil)
 * model.canResume(): false = resume() resolves and nothing runs (the E2E's stuck patch).
 * ctx._deaf (second review): this context runs, its clock moving, but nothing it plays is heard (iOS can leave a
 * context the interruption stopped like that); model.heard records, for each sample as it begins, whether it was.
 */
function webkitLikeContext(model) {
  return class Ctx {
    constructor(opts) {
      this.sampleRate = (opts && opts.sampleRate) || 48000;
      this.state = 'suspended';
      this.destination = { kind: 'destination' };
      this.outputLatency = 0;
      this._zombie = false;
      this._deaf = false;
      this._index = model.contexts.length;
      this._acc = 0;
      this._since = null;
      this._sources = new Set();
      this._suspendPending = false;
      this._suspendedOnce = false;
      this._createdAt = Date.now();
      model.contexts.push(this);
      this._iv = setInterval(() => this._ended(), 5);
    }
    _moving() {
      return this.state === 'running' && !model.zombie && !this._zombie;
    }
    _sync() {
      if (this._since !== null) this._acc += (Date.now() - this._since) / 1000;
      this._since = this._moving() ? Date.now() : null;
    }
    get currentTime() {
      return this._since !== null ? this._acc + (Date.now() - this._since) / 1000 : this._acc;
    }
    _set(state) {
      this._sync();
      this.state = state;
      this._sync();
      model.log.push([Date.now(), 'state', state]);
    }
    suspend() {
      model.log.push([Date.now(), 'suspend()', this.state]);
      this._suspendPending = true;
      return new Promise((resolve) => {
        const land = () => {
          this._suspendPending = false;
          this._suspendedOnce = true;
          if (this.state !== 'suspended' && this.state !== 'closed') this._set('suspended');
          resolve();
          if (this._resumeAfterSuspend) {
            // WebKit: a resume() asked while the suspend was landing runs after it (the destination's queue)
            this._resumeAfterSuspend = false;
            this.resume();
          }
        };
        if (model.suspendDelayMs > 0) setTimeout(land, model.suspendDelayMs);
        else land();
      });
    }
    resume() {
      model.log.push([Date.now(), 'resume()', this.state]);
      if (model.canResume && !model.canResume()) return Promise.resolve(); // "resumed", nothing runs
      if (this.state === 'closed') return Promise.reject(new Error('InvalidStateError'));
      const inGesture = Date.now() <= (model.gestureUntil || 0);
      if (this.state === 'running' && this._suspendPending) {
        this._resumeAfterSuspend = true; // queued behind the suspend
        return Promise.resolve();
      }
      if (this.state === 'running') return Promise.resolve(); // WebKit/Chromium: nothing to do
      return new Promise((resolve) => {
        setTimeout(() => {
          const cures = model.cure === 'gesture-start' || this._suspendedOnce;
          if (model.zombie && cures && (!model.reviveNeedsGesture || inGesture)) {
            this._sync();
            model.zombie = false;
            this._sync();
            model.log.push([Date.now(), 'page cured']);
          }
          if (this.state !== 'closed') this._set('running');
          resolve();
        }, model.resumeDelayMs || 0);
      });
    }
    close() {
      this._set('closed');
      clearInterval(this._iv);
      return Promise.resolve();
    }
    createGain() {
      return { connect() {}, kind: 'gain' };
    }
    createAnalyser() {
      const a = {
        fftSize: 2048,
        smoothingTimeConstant: 0.8,
        get frequencyBinCount() {
          return a.fftSize / 2;
        },
        connect() {},
        getFloatFrequencyData: (arr) => arr.fill(-60),
        getFloatTimeDomainData: (arr) => arr.fill(0.1),
      };
      return a;
    }
    createBuffer(ch, length, sampleRate) {
      const data = new Float32Array(length);
      return { length, sampleRate, duration: length / sampleRate, copyToChannel: (src) => data.set(src), getChannelData: () => data };
    }
    createBufferSource() {
      const ctx = this;
      const src = {
        buffer: null,
        onended: null,
        connect() {},
        disconnect() {},
        start(when) {
          src.when = when;
          src.begun = false;
          ctx._sources.add(src);
          model.starts.push({ when, at: ctx.currentTime, wall: Date.now(), duration: src.buffer ? src.buffer.duration : 0, ctx: ctx._index });
        },
        stop() {
          if (ctx._sources.delete(src) && src.onended) src.onended();
        },
      };
      return src;
    }
    _ended() {
      const t = this.currentTime;
      for (const src of Array.from(this._sources)) {
        if (!src.begun && src.buffer && src.buffer.length > 1 && t >= src.when) {
          src.begun = true;
          model.heard.push({ heard: !this._deaf, ctx: this._index });
        }
        if (src.buffer && t >= src.when + src.buffer.duration) {
          this._sources.delete(src);
          if (src.onended) src.onended();
        }
      }
    }
  };
}

function newModel(extra = {}) {
  return { contexts: [], log: [], starts: [], heard: [], suspendDelayMs: 0, resumeDelayMs: 20, zombie: false, cure: 'suspend-resume', reviveNeedsGesture: false, gestureUntil: 0, ...extra };
}

/** A document whose visibility never changes (visible), with addEventListener. */
function visibleDocument() {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.visibilityState = 'visible';
  return doc;
}

async function streamModule() {
  return import(`../../src/platform/voice/natural/natural-stream.js?stuck=${++loads}`);
}

const LINE1 = 'Good evening, sir. Here is the first reply, short and sweet.';
const LINE2 = 'And here is the second reply, thirty seconds later.';

// ---- L1 (P1): our own 30 s idle suspend, a WebKit-like (asynchronous) suspend, and the next reply's play() ------

test('audio out (L1): a reply whose first play() lands while our own idle suspend is still landing (WebKit reads "running" until it has) starts at once, not after the watchdog’s kick', async () => {
  const results = {};
  for (const variant of ['race', 'control']) {
    const clock = installClock();
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { value: visibleDocument(), configurable: true, writable: true });
    try {
      const model = newModel({ suspendDelayMs: 60, resumeDelayMs: 40 });
      const out = createAudioOut({ AudioContextImpl: webkitLikeContext(model), scope: { document: globalThis.document, navigator: {} } });
      out.unlock(); // the first tap
      clock.advance(100);
      const mod = await streamModule();
      const engine = createFakeEngine(clock, { rtf: 0.002 }); // synthesis takes ~6 ms: play() comes right away
      const handoffs = [];
      const deps = { engine, audio: out, voice: 'bm_george', onHandoff: (h) => handoffs.push(h) };
      const ends1 = [];
      const s1 = mod.createNaturalStream(deps, { onEnd: (e) => ends1.push(e.reason) });
      s1.append(LINE1);
      s1.finish();
      clock.runUntil(() => ends1.length > 0, 60_000);
      // Wait for our own idle suspend (30 s after the last chunk ended) to be called.
      const ctx = model.contexts[0];
      if (variant === 'race') clock.runUntil(() => ctx._suspendPending, 40_000);
      else clock.runUntil(() => ctx.state === 'suspended', 40_000); // the suspend has landed: play() resumes it
      const asked = clock.now;
      const starts = [];
      const ends2 = [];
      const s2 = mod.createNaturalStream(deps, { onStart: () => starts.push(clock.now), onEnd: (e) => ends2.push(e.reason) });
      s2.append(LINE2);
      s2.finish();
      clock.runUntil(() => ends2.length > 0 || handoffs.length > 0, 60_000);
      const kicks = model.log.filter((e) => e[0] > asked + 1000 && (e[1] === 'resume()' || (e[1] === 'suspend()' && e[2] === 'running'))).length;
      results[variant] = { firstWords: starts.length ? starts[0] - asked : null, ends2, handoffs: handoffs.map((h) => h.reason), kicks };
    } finally {
      if (saved) Object.defineProperty(globalThis, 'document', saved);
      else delete globalThis.document;
      clock.restore();
    }
  }
  assert.ok(results.control.firstWords < 300, `control: first words at once (${results.control.firstWords} ms)`);
  assert.ok(results.race.firstWords < 500, `a reply that lands on our own idle suspend starts at once too (${results.race.firstWords} ms; 1680 ms before the fix: only after the 1.5 s kick)`);
  assert.deepEqual(results.race.ends2, ['done']);
  assert.deepEqual(results.race.handoffs, []);
  assert.equal(results.race.kicks, 0, 'no kick needed');
});

// ---- the router with George from the home base (and on this device), sharing one audio output ----------------

async function routerWith(t, { frozen = true, home = true, natural = false, audio = null, clock = null } = {}) {
  const ck = clock || installClock();
  const speech = createFakeSpeech(ck, {}).install();
  const device = await import(`../../src/platform/voice/tts.js?stuck=${++loads}`);
  const { createVoiceRouter } = await import(`../../src/platform/voice/voice-router.js?stuck=${loads}`);
  t.after(() => {
    speech.uninstall();
    ck.restore();
  });
  const requests = [];
  const senses = {
    speak({ text }, { timeoutMs, signal }) {
      const synthMs = (0.4 * text.length * 1000) / 13 + 150;
      requests.push({ text, at: ck.now });
      return new Promise((resolve) => {
        const timer = setTimeout(() => (synthMs > timeoutMs ? resolve({ ok: false, kind: 'timeout' }) : resolve({ ok: true, pcm: new Float32Array(Math.round((text.length / 13) * 24000)).fill(0.1), sampleRate: 24000 })), Math.min(synthMs, timeoutMs));
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve({ ok: false, kind: 'aborted' });
        });
      });
    },
    noteFailure() {},
  };
  const out = audio || createFakeAudio(ck, { frozen });
  const hEngine = createHomeBaseVoiceEngine({ senses, now: () => Date.now() });
  const nEngine = createFakeEngine(ck, { rtf: 0.3, state: 'ready' });
  const settings = { homeBaseSpeak: home, naturalVoice: natural, naturalVoiceId: 'bm_george' };
  const router = createVoiceRouter({ device, natural: { engine: nEngine, audio: out }, homebase: { engine: hEngine, audio: out, canSpeak: () => true }, getSettings: () => settings });
  const run = async (until, max = 40000) => {
    for (let i = 0; i < max && !until(); i++) {
      ck.advance(20);
      await new Promise((done) => setImmediate(done));
    }
    if (!until()) throw new Error('run: condition not met');
  };
  /** One reply; resolves with { voice: 'george' | 'device', silenceMs, georgeAsked } once it has ended. */
  const reply = async (text, { stream = true } = {}) => {
    const ends = [];
    const asked = requests.length;
    const said0 = speech.submitted.length;
    const t0 = ck.now;
    let firstSound = null;
    const opts = {
      onEnd: (e) => ends.push(e.reason),
      onStart: () => {
        if (firstSound === null) firstSound = ck.now;
      },
    };
    if (stream) {
      const h = router.createSpeechStream(opts);
      h.append(text);
      h.finish();
    } else router.speak(text, opts);
    await run(() => ends.length > 0);
    const byDevice = speech.submitted.length > said0;
    const deviceAt = byDevice ? speech.submitted[said0].t : null;
    return { voice: byDevice ? 'device' : 'george', georgeAsked: requests.length > asked, silenceMs: (byDevice ? deviceAt : firstSound ?? ck.now) - t0, ends };
  };
  return { clock: ck, speech, router, requests, audio: out, settings, run, reply };
}

// ---- M3 (P2): George comes back by himself ---------------------------------------------------------------------

test('router (M3): after a stall, once the output can run again George comes back by himself, by the second reply; each reply on the device voice meanwhile asks the output to run', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  let causeGone = false;
  ctx.audio.onKick = (a) => causeGone && a.resume(); // what asking it to run does (the kick, a probe)
  const first = await ctx.reply('The first reply, which stalls.');
  assert.equal(first.voice, 'device');
  assert.equal(ctx.router.audioStuck(), true);
  // Still stuck: every reply on the device voice at once (no new wait), each asking the output to run.
  const probes0 = ctx.audio.probes;
  const still = [];
  for (let i = 0; i < 2; i++) still.push(await ctx.reply(`Still stuck, reply ${i + 1}.`));
  assert.deepEqual(still.map((r) => r.voice), ['device', 'device']);
  assert.ok(still.every((r) => r.silenceMs < 100 && !r.georgeAsked), `at once, George not asked (${JSON.stringify(still)})`);
  assert.equal(ctx.audio.probes - probes0, 2, 'one probe per reply sent to the device voice');
  assert.equal(ctx.router.audioStuck(), true);
  // The cause goes (an interruption ended; a Mac's output device came back): no tap anywhere.
  causeGone = true;
  const later = [];
  for (let i = 0; i < 5; i++) {
    ctx.clock.advance(60_000);
    later.push(await ctx.reply(`Reply number ${i + 2}, a minute later.`));
  }
  assert.deepEqual(later.map((r) => r.voice), ['device', 'george', 'george', 'george', 'george'], 'the first one asks the output to run; from the second, George (before the fix: device ×5, nothing asked of the output)');
  assert.equal(ctx.router.audioStuck(), false);
});

test('router (M3): George switched off meanwhile: nothing asks his stuck output to run', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  await ctx.reply('A reply that stalls.');
  assert.equal(ctx.router.audioStuck(), true);
  ctx.settings.homeBaseSpeak = false;
  const probes0 = ctx.audio.probes;
  const r = await ctx.reply('The iPhone voice, George off.');
  assert.equal(r.voice, 'device');
  assert.equal(ctx.audio.probes, probes0);
});

// ---- M1 (P3): a tap revives an output whose context says 'running' with its clock stopped ----------------------

async function zombieTaps(t, { modelExtra, stop }) {
  const clock = installClock();
  const model = newModel({ resumeDelayMs: 20, reviveNeedsGesture: true, ...modelExtra });
  const out = createAudioOut({ AudioContextImpl: webkitLikeContext(model), scope: { navigator: {} } });
  const ctx = await routerWith(t, { audio: out, clock });
  const tap = () => {
    model.gestureUntil = clock.now + 1000;
    ctx.router.unlockSpeech();
  };
  tap(); // the first tap: the context starts
  clock.advance(200);
  const ok = await ctx.reply('George works at first.');
  assert.equal(ok.voice, 'george', 'George at first');
  stop(model); // the microphone took the session, an interruption: 'running', its clock standing still
  const stalled = await ctx.reply('The reply that stalls: the watchdog kicks outside a tap, which does nothing here.');
  assert.equal(stalled.voice, 'device', 'the stall hands over');
  assert.equal(out.context.state, 'running', 'it says it runs');
  const taps = [];
  for (let i = 0; i < 3; i++) {
    clock.advance(5000);
    tap(); // a Speak tap, Test, or Voice Mode opened by hand: unlockSpeech() inside the tap
    taps.push(await ctx.reply(`Reply after tap ${i + 1}.`));
  }
  return { taps, model, ctx };
}

test('router + audio out (M1): the reviewer’s model (P3: the whole page’s audio stuck until a context is suspended and resumed inside a tap): each tap brings George back at once', async (t) => {
  const { taps, model } = await zombieTaps(t, {
    modelExtra: { cure: 'suspend-resume' },
    stop: (m) => {
      m.zombie = true;
      m.contexts[0]._sync();
    },
  });
  assert.ok(taps.every((r) => r.voice === 'george' && r.silenceMs < 1500), `George at once after each tap (${taps.map((r) => `${r.voice} after ${r.silenceMs} ms`).join('; ')}; before the fix: device after 4280 ms each)`);
  assert.equal(model.zombie, false);
});

test('router + audio out (M1): a context iOS left running with its clock stopped, which only a fresh context replaces: the first tap brings George back at once', async (t) => {
  const { taps, model } = await zombieTaps(t, {
    modelExtra: {},
    stop: (m) => {
      m.contexts[0]._zombie = true;
      m.contexts[0]._sync();
    },
  });
  assert.ok(taps.every((r) => r.voice === 'george' && r.silenceMs < 1500), `George at once after each tap (${taps.map((r) => `${r.voice} after ${r.silenceMs} ms`).join('; ')})`);
  assert.equal(model.contexts.length, 2, 'one fresh context, made in the first tap after the stall (later taps find nothing stuck)');
  assert.equal(model.contexts[0].state, 'closed', 'the stuck one closed');
  const made = model.contexts[1]._createdAt;
  assert.ok(model.log.some((e) => e[1] === 'resume()' && e[0] === made), 'the fresh one started inside the tap');
});

test('router + audio out (M1): the whole page’s audio stuck until audio is started inside a tap: the first tap brings George back', async (t) => {
  const { taps, model } = await zombieTaps(t, {
    modelExtra: { cure: 'gesture-start' },
    stop: (m) => {
      m.zombie = true;
      m.contexts[0]._sync();
    },
  });
  assert.ok(taps.every((r) => r.voice === 'george'), `George after each tap (${taps.map((r) => `${r.voice} after ${r.silenceMs} ms`).join('; ')})`);
  assert.equal(model.zombie, false);
});

test('router + audio out (M1): a tap with nothing stuck keeps the context; an unlock without a tap never replaces a stuck one', async (t) => {
  const clock = installClock();
  const model = newModel({ resumeDelayMs: 20 });
  const out = createAudioOut({ AudioContextImpl: webkitLikeContext(model), scope: { navigator: {} } });
  const ctx = await routerWith(t, { audio: out, clock });
  ctx.router.unlockSpeech();
  clock.advance(200);
  assert.equal((await ctx.reply('George.')).voice, 'george');
  ctx.router.unlockSpeech(); // another tap, nothing stuck
  ctx.router.unlockSpeech();
  assert.equal(model.contexts.length, 1, 'no new context without a stuck one');
  model.contexts[0]._zombie = true;
  model.contexts[0]._sync();
  assert.equal((await ctx.reply('This one stalls.')).voice, 'device');
  assert.equal(ctx.router.audioStuck(), true);
  ctx.router.unlockSpeech({ tap: false }); // Standby entered again, a wake: no tap
  assert.equal(model.contexts.length, 1, 'not replaced without a tap');
  assert.equal(ctx.router.audioStuck(), true, 'still known stuck');
  ctx.router.unlockSpeech(); // a tap
  assert.equal(model.contexts.length, 2, 'replaced inside the tap');
  assert.equal(ctx.router.audioStuck(), false);
});

// ---- M2 (P4, P4b): an unlock without a tap keeps what is known -------------------------------------------------

test('router (M2): unlockSpeech({ tap: false }) (Standby entered again, Voice Mode opened by claps or "Hey Jarvis") keeps the stuck state: each wake greeting on the iPhone voice at once', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  await ctx.reply('A reply in Voice Mode that stalls.');
  assert.equal(ctx.router.audioStuck(), true);
  const greetings = [];
  for (let i = 0; i < 3; i++) {
    ctx.clock.advance(10 * 60_000);
    ctx.router.unlockSpeech({ tap: false });
    greetings.push(await ctx.reply(`Good evening, Tony. Wake number ${i + 1}.`, { stream: false }));
  }
  assert.ok(greetings.every((g) => g.voice === 'device' && g.silenceMs < 500 && !g.georgeAsked), `no 3.5 s wait at a wake without a tap (${greetings.map((g) => `${g.voice} after ${g.silenceMs} ms`).join('; ')}; before the fix: device after 4280 ms each)`);
});

test('router (M2): navigator.userActivation saying "no tap" (Safari 16.4+, Chrome) keeps it too; a real tap then gives George his chance', async (t) => {
  const nav = globalThis.navigator;
  const had = nav && Object.getOwnPropertyDescriptor(nav, 'userActivation');
  const act = { isActive: true, hasBeenActive: true };
  Object.defineProperty(nav, 'userActivation', { value: act, configurable: true, writable: true });
  t.after(() => {
    if (had) Object.defineProperty(nav, 'userActivation', had);
    else delete nav.userActivation;
  });
  const ctx = await routerWith(t, { frozen: true });
  await ctx.reply('A reply in Voice Mode that stalls.');
  assert.equal(ctx.router.audioStuck(), true);
  const greetings = [];
  for (let i = 0; i < 2; i++) {
    ctx.clock.advance(10 * 60_000);
    act.isActive = false; // claps / "Hey Jarvis", Standby entered again: no tap
    ctx.router.unlockSpeech();
    greetings.push(await ctx.reply(`Good evening, Tony. Wake number ${i + 1}.`, { stream: false }));
  }
  assert.ok(greetings.every((g) => g.voice === 'device' && g.silenceMs < 500 && !g.georgeAsked), `no 3.5 s wait without a tap (${greetings.map((g) => `${g.voice} after ${g.silenceMs} ms`).join('; ')})`);
  act.isActive = true; // a real tap (Speak, Test, Voice Mode opened by hand)
  ctx.router.unlockSpeech();
  assert.equal(ctx.router.audioStuck(), false);
  const tapped = await ctx.reply('After a real tap.');
  assert.ok(tapped.georgeAsked, 'George gets his chance (his sound is still stuck here, so the device voice says it after the wait)');
  assert.equal(tapped.voice, 'device');
});

// ---- L2: Settings' Test buttons ------------------------------------------------------------------------------------

test('Settings Test (L2): "Played" only when the audio clock got past the sample; the plain words otherwise', () => {
  assert.equal(samplePlayed({ clock: 0, when: 0.05, duration: 4 }), false, 'the clock never moved');
  assert.equal(samplePlayed({ clock: 0.2, when: 0.05, duration: 4 }), false, 'not past the first quarter second');
  assert.equal(samplePlayed({ clock: 4.3, when: 0.05, duration: 4 }), true);
  assert.equal(samplePlayed({ clock: 0.12, when: 0.05, duration: 0.1 }), true, 'a very short sample: half of it');
  assert.equal(samplePlayed({ clock: NaN, when: 0.05, duration: 4 }), true, 'a clock that can’t be read: no claim either way');
  assert.equal(silentSampleText({ voiceName: 'George', os: 'ios' }), 'Nothing played: George’s sound didn’t start on this iPhone, so the iPhone voice speaks for now. Tap Test to try again.');
  assert.equal(silentSampleText({ voiceName: 'George', os: 'mac' }), 'Nothing played: George’s sound didn’t start on this Mac, so the built-in voice speaks for now. Tap Test to try again.');
});

test('Settings Test (L2): leaving Jarvis during the sample (iOS stops its audio in the background) gives no verdict', () => {
  const doc = new EventTarget();
  doc.hidden = false;
  doc.visibilityState = 'visible';
  const flip = (hidden) => {
    doc.hidden = hidden;
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  const stayed = watchAway(doc);
  assert.equal(stayed.done(), false, 'in view all along');
  const left = watchAway(doc);
  flip(true);
  flip(false);
  assert.equal(left.done(), true, 'hidden for a moment, back by the check');
  flip(true);
  const startedHidden = watchAway(doc);
  assert.equal(startedHidden.done(), true);
  flip(false);
  const after = watchAway(doc);
  after.done();
  flip(true); // after done(): no longer watched
  flip(false);
  assert.equal(watchAway(null).done(), false, 'no document: nothing to say it was away');
});

test('Settings Test (second review, normal-2): Jarvis in the background during the sample, or its sound restarted meanwhile: words that claim nothing', () => {
  assert.equal(unsureSampleText({ away: true }), 'Couldn’t tell whether it played: Jarvis was in the background during the test. Tap Test to try again.');
  assert.equal(unsureSampleText({ voiceName: 'George', away: false }), 'Couldn’t tell whether it played: George’s sound restarted during the test. Tap Test to try again.');
});

// ---- the second review of v7.8.1 -----------------------------------------------------------------------------------

test('router + audio out (second review, stuck-1): George came back by himself on the context that stalled; iOS can leave such a context running with nothing heard, so the next tap with nothing playing on it starts his sound afresh, once; a tap while he speaks never does', async (t) => {
  const clock = installClock();
  const model = newModel({ resumeDelayMs: 20 });
  const out = createAudioOut({ AudioContextImpl: webkitLikeContext(model), scope: { navigator: {} } });
  const ctx = await routerWith(t, { audio: out, clock });
  const tap = () => {
    model.gestureUntil = clock.now + 1000;
    ctx.router.unlockSpeech();
  };
  /** One reply: 'device', 'George heard' or 'George SILENT' (his clock ran, nothing came out). */
  const reply = async (text) => {
    const n = model.heard.length;
    const r = await ctx.reply(text);
    const plays = model.heard.slice(n);
    if (r.voice !== 'george') return r.voice;
    return plays.length && plays.every((p) => p.heard) ? 'George heard' : 'George SILENT';
  };
  tap(); // the first tap of the session
  clock.advance(200);
  assert.equal(await reply('George works at first.'), 'George heard');
  const c0 = model.contexts[0];
  c0._zombie = true; // a call: the context says it runs, its clock stands still
  c0._sync();
  assert.equal(await reply('The reply during the call stalls.'), 'device');
  c0._zombie = false; // the call is over: iOS runs the context again, and nothing it plays comes out
  c0._deaf = true;
  c0._sync();
  assert.equal(await reply('Right after the call: the iPhone voice, which asks George’s output to run.'), 'device');
  assert.equal(await reply('George is back by himself, on the context the call stopped.'), 'George SILENT', 'its clock moves: the code can’t tell (the residue until the next tap)');
  // A tap while George speaks never replaces the context under him (his stream waits on its clock).
  const ends = [];
  const s0 = model.starts.length;
  const h = ctx.router.createSpeechStream({ onEnd: (e) => ends.push(e.reason) });
  h.append('A longer reply George is speaking when the owner taps. It has a second sentence, too.');
  h.finish();
  await ctx.run(() => model.starts.length > s0);
  tap();
  assert.equal(model.contexts.length, 1, 'never under George');
  await ctx.run(() => ends.length > 0);
  assert.deepEqual(ends, ['done']);
  // The next tap with nothing playing (Speak, Test, the microphone, Voice Mode opened by hand): afresh.
  clock.advance(2000);
  tap();
  assert.equal(model.contexts.length, 2, 'the context that stalled is replaced at the next idle tap (before the fix: kept for good)');
  assert.equal(c0.state, 'closed');
  assert.equal(await reply('After the tap, George is heard again.'), 'George heard');
  tap(); // once: a later tap keeps the fresh context
  assert.equal(model.contexts.length, 2);
  assert.equal(await reply('And again.'), 'George heard');
});

test('router (second review, stuck-2): a George reply cancelled after the watchdog’s kick (the core tapped in the silence, Stop, a new reply) counts as a stall: the next reply goes to the device voice at once; before the kick, nothing is learned', async (t) => {
  const ctx = await routerWith(t, { frozen: true });
  /** A reply cancelled `ms` after George's first chunk was put on the (stopped) clock. */
  const cancelled = async (text, ms) => {
    const ends = [];
    const p0 = ctx.audio.played.length;
    const h = ctx.router.createSpeechStream({ onEnd: (e) => ends.push(e.reason) });
    h.append(text);
    h.finish();
    await ctx.run(() => ctx.audio.played.length > p0);
    const at = ctx.clock.now;
    await ctx.run(() => ctx.clock.now - at >= ms);
    h.cancel();
    return ends;
  };
  assert.deepEqual(await cancelled('Tapped one second into the silence.', 1000), ['cancelled']);
  assert.equal(ctx.router.audioStuck(), false, 'before the kick: nothing learned (a route change can take that long)');
  assert.deepEqual(await cancelled('Tapped two and a half seconds into the silence.', 2500), ['cancelled']);
  assert.equal(ctx.audio.kicks, 1, 'the second one was kicked at 1.5 s, which did nothing');
  assert.equal(ctx.router.audioStuck(), true, 'after the kick, which did nothing: as good as a stall (before the fix: nothing learned)');
  assert.equal(ctx.speech.submitted.length, 0, 'the cancelled replies weren’t said');
  const next = await ctx.reply('The next question’s answer.');
  assert.equal(next.voice, 'device');
  assert.ok(next.silenceMs < 100 && !next.georgeAsked, `at once, George not tried (${JSON.stringify(next)}; before the fix: George tried again, 3.5 s of silence)`);
});

test('router (second review, stuck-2): a George reply stopped while he plays teaches nothing', async (t) => {
  const ctx = await routerWith(t, { frozen: false });
  const ends = [];
  const h = ctx.router.createSpeechStream({ onEnd: (e) => ends.push(e.reason) });
  h.append('George speaks a long reply here. The owner taps Stop in the middle of this second sentence of it.');
  h.finish();
  await ctx.run(() => ctx.audio.played.length > 0);
  const at = ctx.clock.now;
  await ctx.run(() => ctx.clock.now - at >= 2500);
  h.cancel();
  assert.deepEqual(ends, ['cancelled']);
  assert.equal(ctx.router.audioStuck(), false);
  assert.equal((await ctx.reply('The next one.')).voice, 'george');
});

test('router + audio out (second review, normal-1): George switched off on this iPhone after a stall; Hearing and voice → Test’s tap still starts the stuck sound afresh, once, so “Tap Test to try again” holds', async (t) => {
  const clock = installClock();
  const model = newModel({ resumeDelayMs: 20, reviveNeedsGesture: true });
  const out = createAudioOut({ AudioContextImpl: webkitLikeContext(model), scope: { navigator: {} } });
  const ctx = await routerWith(t, { audio: out, clock });
  model.gestureUntil = clock.now + 1000;
  ctx.router.unlockSpeech(); // the first tap
  clock.advance(200);
  assert.equal((await ctx.reply('George works at first.')).voice, 'george');
  model.contexts[0]._zombie = true; // it says it runs, its clock stopped; only a fresh context plays
  model.contexts[0]._sync();
  assert.equal((await ctx.reply('This reply stalls.')).voice, 'device');
  assert.equal(ctx.router.audioStuck(), true);
  ctx.settings.homeBaseSpeak = false; // George off on this iPhone (the home base keeps him for the other devices)
  // Settings → Home base → Hearing and voice → Test, as senses-settings.js does it: inside the tap the router's
  // unlock (unlockVoice), then the card's own; the sentence; the sample judged by its clock; "Nothing played"
  // marks the output stuck (onSilent).
  const senseTest = () => {
    model.gestureUntil = clock.now + 1000;
    ctx.router.unlockSpeech();
    out.unlock();
    clock.advance(1500); // the home base makes the sentence
    const playing = out.play(new Float32Array(24000 * 3).fill(0.1), 24000, out.now() + 0.05);
    const ctxAtPlay = out.context;
    clock.advance(3200);
    if (out.context !== ctxAtPlay) return 'no verdict';
    if (samplePlayed({ clock: out.now(), when: playing.when, duration: playing.duration })) return 'Played';
    ctx.router.noteAudioStuck(out);
    return 'Nothing played';
  };
  const tests = [senseTest(), senseTest(), senseTest()];
  assert.deepEqual(tests, ['Played', 'Played', 'Played'], 'with George off here too (before the fix: Nothing played ×3, the stuck context kept)');
  assert.equal(model.contexts.length, 2, 'one fresh context, in the first Test’s tap (not one per Test)');
  assert.equal(model.contexts[0].state, 'closed');
  assert.equal(ctx.router.audioStuck(), false);
});
