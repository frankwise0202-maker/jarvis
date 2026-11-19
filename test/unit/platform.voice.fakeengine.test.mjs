// A scriptable fake of the Web Speech API's speech output for Node unit tests, plus a virtual
// clock. platform.voice.engine/stream tests import it; run directly (node --test runs every
// *.test.mjs file), it checks that the fake really reproduces each engine quirk.
//
//   const clock = installClock();                 // setTimeout/setInterval/Date.now are virtual
//   const fake = createFakeSpeech(clock, { quirks: { stuckSpeaking: true } });
//   fake.install();                               // globalThis.speechSynthesis, SpeechSynthesisUtterance, document
//   ... clock.advance(ms) / clock.runUntil(() => done, maxMs)
//   fake.uninstall(); clock.restore();
//
// The fake engine is a FIFO queue like Chromium's and WebKit's: speak() appends to the queue; the
// first utterance in it is the current one (handed to the "platform" after a small engine gap) and
// the next one is handed over only once the current one has completed. `speaking` is true while
// anything is queued, from the moment speak() is called (audio or not), `pending` while more than
// one is. While it plays: 'start' -> word 'boundary' events -> 'end'; cancel() empties the queue
// with 'interrupted' (the current one) and 'canceled' (the others) errors. Audio is simulated in
// steps of 50 ms at `cps` characters per second × rate, and every stretch of audio is recorded in
// fake.audio as { id, text, complete } (complete: it played to the end; a cancel or a cut-off
// leaves it incomplete).
//
// Quirks (config.quirks), alone or combined; predicates get (utterance, n) with n the utterance's
// position among the non-empty utterances the engine played or will play (0-based):
//   a  stuckSpeaking: true       speaking stays true after audio ends (until cancel(), or for
//                                good with stuckThroughCancel); stuckPending: true does the same for pending
//   b  dropEnd(u, n)             no 'end' event; the engine still moves on to the next queued
//                                (the event was lost, the completion was not)
//      stallAfterLostEnd: true   ... unless this is set: the completion is lost too, so the
//                                utterance stays current (speaking, nothing behind it plays) until cancel()
//   c  dropSpeakInEnd: true      speak() called synchronously inside an 'end' handler is dropped
//   d  dropAfterCancelMs: ms     speak() within ms after cancel() is dropped silently: it is queued
//                                but never plays and never sends an event, so it holds the queue
//                                (speaking stays true, nothing behind it plays) until cancel(), as
//                                in Chromium (dropWithError: true fires 'canceled' for it instead,
//                                which removes it); dropSpeak(u, k) drops the k-th speak() call the
//                                same way (0-based, all calls); invisibleDrops: true models an
//                                engine that forgets a dropped utterance instead (never queued,
//                                `speaking` unaffected)
//   e  cutoffMs: ms              audio stops after ms of playback (cutoffOnlineOnly: only voices
//                                with localService false): no 'end', speaking stays true, the
//                                engine is stuck until cancel()
//   f  earlyEnd(u, n) -> fraction   'end' fires at that fraction of the audio, which plays on
//      doubleEnd(u, n)          'end' fires twice
//      noStart(u, n)            no 'start' event although audio plays
//      boundaries: false        (config) no boundary events
//      cpsFor(u, n) -> cps      (config) this utterance's own speed (default cps)
//   g  fake.setHidden(true)      document.hidden: audio pauses, nothing new starts
//   h  cancelErrorDelayMs: ms    when cancel()'s 'interrupted'/'canceled' errors arrive
//      deadEngine: true          nothing ever plays and no event ever fires (each utterance is
//                                dropped as in d, so `speaking` stays true)
//      failWith(u, n) -> code    the utterance fails with an 'error' event of that code instead of playing

import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---- virtual clock ---------------------------------------------------------------------------

export function installClock(start = 1_800_000_000_000) {
  const saved = {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setInterval: globalThis.setInterval,
    clearInterval: globalThis.clearInterval,
    now: Date.now,
  };
  let now = start;
  let seq = 0;
  const timers = new Map();
  const add = (fn, ms, args, every) => {
    const id = ++seq;
    timers.set(id, { at: now + (every || Math.max(0, Number(ms) || 0)), fn, args, every, order: id });
    return id;
  };
  globalThis.setTimeout = (fn, ms, ...args) => add(fn, ms, args, 0);
  globalThis.setInterval = (fn, ms, ...args) => add(fn, ms, args, Math.max(1, Number(ms) || 0));
  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };
  globalThis.clearInterval = globalThis.clearTimeout;
  Date.now = () => now;

  const due = () => {
    let best = null;
    for (const [id, t] of timers) if (!best || t.at < best.t.at || (t.at === best.t.at && t.order < best.t.order)) best = { id, t };
    return best;
  };
  const runTo = (target, stop) => {
    for (let guard = 0; guard < 5_000_000; guard++) {
      if (stop && stop()) return true;
      const n = due();
      if (!n || n.t.at > target) break;
      now = Math.max(now, n.t.at);
      if (n.t.every) {
        n.t.at += n.t.every;
        n.t.order = ++seq;
      } else timers.delete(n.id);
      n.t.fn(...n.t.args);
    }
    if (stop && stop()) return true;
    now = Math.max(now, target);
    return false;
  };
  return {
    get now() {
      return now;
    },
    get timers() {
      return timers.size;
    },
    /** Run every timer due within `ms`, in order, with Date.now() at each timer's time. */
    advance(ms) {
      runTo(now + ms);
    },
    /** Run until `stop()` is true (checked before each timer); returns the virtual ms it took. */
    runUntil(stop, maxMs = 600_000) {
      const t0 = now;
      if (!runTo(now + maxMs, stop)) throw new Error(`runUntil: condition not met within ${maxMs} ms`);
      return now - t0;
    },
    restore() {
      Object.assign(globalThis, { setTimeout: saved.setTimeout, clearTimeout: saved.clearTimeout, setInterval: saved.setInterval, clearInterval: saved.clearInterval });
      Date.now = saved.now;
      timers.clear();
    },
  };
}

// ---- voices ----------------------------------------------------------------------------------

export const VOICES = Object.freeze({
  daniel: Object.freeze({ name: 'Daniel', lang: 'en-GB', voiceURI: 'com.apple.voice.compact.en-GB.Daniel', localService: true, default: false }),
  samantha: Object.freeze({ name: 'Samantha', lang: 'en-US', voiceURI: 'com.apple.voice.compact.en-US.Samantha', localService: true, default: true }),
  googleUK: Object.freeze({ name: 'Google UK English Male', lang: 'en-GB', voiceURI: 'Google UK English Male', localService: false, default: false }),
});

// ---- the fake engine -------------------------------------------------------------------------

export function createFakeSpeech(clock, config = {}) {
  const cfg = { cps: 15, startLatencyMs: 30, gapMs: 15, stepMs: 50, minMs: 150, boundaries: true, voices: [VOICES.samantha, VOICES.daniel, VOICES.googleUK], ...config };
  const q = { ...(config.quirks || {}) };
  const saved = {};
  let uid = 0;
  const byId = new Map();
  let accepted = 0;
  let calls = 0;
  let items = []; // the engine's queue; items[0] is the current utterance (playing, about to, stuck or dropped)
  let cur = null; // the platform's playback of items[0]: { u, n, dur, played, words, nextWord, earlyFired, seg } | { u, dead: true }
  let stuck = false; // items[0] never completed (a lost completion, a cut-off): nothing behind it plays until cancel()
  let stuckSpeaking = false;
  let stuckPending = false;
  let lastCancel = -Infinity;
  let inEnd = 0;
  let handTimer = 0;
  const doc = new EventTarget();
  doc.hidden = false;
  doc.visibilityState = 'visible';

  const fake = {
    submitted: [], // every speak() call: { id, text, t, dropped: false | 'in-end' | 'after-cancel' | 'custom' | 'dead', reached }
    // (reached: the engine handed it to the platform, i.e. it got to the front of the queue)
    audio: [], // { id, text, startT, endT, complete, cut, cancelled }
    events: [], // { t, type, id, error? }
    cancels: 0,
    maxOurs: 0, // most utterances in the engine (current + queued) at once
    get hidden() {
      return doc.hidden;
    },
    document: doc,
    completed: () => fake.audio.filter((s) => s.complete).map((s) => s.text),
    partial: () => fake.audio.filter((s) => !s.complete && s.endT !== null),
    queued: () => items.length,
    /** Ids of utterances that sent no event at all (no start, boundary, end or error). */
    silent: () => {
      const heard = new Set(fake.events.map((e) => e.id));
      return fake.submitted.filter((s) => !heard.has(s.id)).map((s) => s.id);
    },
    /** Replace the voice list and announce it ('voiceschanged'), like Chrome loading voices late. */
    setVoices(list) {
      cfg.voices = list.slice();
      synth.dispatchEvent(new Event('voiceschanged'));
    },
    /** Fire an event on any utterance spoken earlier (a late or stray event), e.g. fake.fire(id, 'error', { error: 'interrupted' }). */
    fire: (id, type, extra) => fire(byId.get(id), type, extra),
    idle: () => !items.length,
    setHidden(hidden) {
      doc.hidden = !!hidden;
      doc.visibilityState = hidden ? 'hidden' : 'visible';
      doc.dispatchEvent(new Event('visibilitychange'));
      if (!hidden) handOff();
    },
    install() {
      for (const k of ['speechSynthesis', 'SpeechSynthesisUtterance', 'document']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
      Object.defineProperty(globalThis, 'speechSynthesis', { value: synth, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true, writable: true });
      Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
      return fake;
    },
    uninstall() {
      for (const k of Object.keys(saved)) {
        if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
        else delete globalThis[k];
      }
    },
  };

  class FakeUtterance {
    constructor(text) {
      this.text = text === null || text === undefined ? '' : String(text);
      this.voice = null;
      this.lang = '';
      this.rate = 1;
      this.pitch = 1;
      this.volume = 1;
      this.onstart = this.onend = this.onerror = this.onboundary = this.onpause = this.onresume = this.onmark = null;
      this.__id = ++uid;
    }
  }

  const fire = (u, type, extra = {}) => {
    fake.events.push({ t: clock.now, type, id: u.__id, ...extra });
    const handler = u['on' + type];
    if (typeof handler !== 'function') return;
    const event = { type, utterance: u, charIndex: 0, charLength: 0, elapsedTime: 0, name: '', ...extra };
    if (type === 'end') inEnd += 1;
    try {
      handler.call(u, event);
    } finally {
      if (type === 'end') inEnd -= 1;
    }
  };

  const synth = new EventTarget();
  Object.defineProperties(synth, {
    speaking: { get: () => items.length > 0 || stuckSpeaking },
    pending: { get: () => items.length > 1 || stuckPending },
    paused: { get: () => false },
  });
  synth.getVoices = () => cfg.voices.slice();
  synth.pause = () => {};
  synth.resume = () => {};
  synth.speak = (u) => {
    const k = calls++;
    const rec = { id: u.__id, text: u.text, t: clock.now, dropped: false, reached: false, voice: u.voice ? u.voice.voiceURI : null, rate: u.rate, lang: u.lang };
    u.__rec = rec;
    byId.set(u.__id, u);
    fake.submitted.push(rec);
    if (inEnd && q.dropSpeakInEnd) {
      rec.dropped = 'in-end';
      return;
    }
    let drop = '';
    if (q.deadEngine) drop = 'dead';
    else if (clock.now - lastCancel < (q.dropAfterCancelMs || 0)) {
      if (q.dropWithError) {
        rec.dropped = 'after-cancel';
        setTimeout(() => fire(u, 'error', { error: 'canceled' }), 5);
        return;
      }
      drop = 'after-cancel';
    } else if (q.dropSpeak && q.dropSpeak(u, k)) drop = 'custom';
    if (drop) {
      rec.dropped = drop;
      if (q.invisibleDrops) return;
      u.__dead = true; // queued, but it never plays and never sends an event
    }
    u.__n = u.text && !drop ? accepted++ : -1;
    items.push(u);
    fake.maxOurs = Math.max(fake.maxOurs, items.length);
    handOff();
  };
  synth.cancel = () => {
    fake.cancels += 1;
    lastCancel = clock.now;
    stuck = false;
    if (!q.stuckThroughCancel) {
      stuckSpeaking = false;
      stuckPending = false;
    }
    clearTimeout(handTimer);
    handTimer = 0;
    if (cur && cur.seg && cur.seg.endT === null) {
      cur.seg.endT = clock.now;
      cur.seg.cancelled = true;
    }
    const victims = items.map((u, i) => [u, i === 0 ? 'interrupted' : 'canceled']);
    items = [];
    cur = null;
    for (const [u, code] of victims) setTimeout(() => fire(u, 'error', { error: code }), q.cancelErrorDelayMs || 0);
  };

  /** Hand the first queued utterance to the platform (after the engine's gap) once nothing holds it. */
  function handOff() {
    if (handTimer || cur || stuck || !items.length || doc.hidden) return;
    handTimer = setTimeout(() => {
      handTimer = 0;
      startFront();
    }, cfg.gapMs);
  }

  function startFront() {
    if (cur || stuck || !items.length || doc.hidden) return;
    const u = items[0];
    if (u.__rec) u.__rec.reached = true;
    if (u.__dead) {
      cur = { u, dead: true }; // the platform never plays it: the queue waits until cancel()
      return;
    }
    const rate = Number(u.rate) || 1;
    const words = [];
    for (const m of u.text.matchAll(/\S+/g)) words.push({ at: m.index, len: m[0].length });
    const cps = (cfg.cpsFor && cfg.cpsFor(u, u.__n)) || cfg.cps;
    const dur = u.text ? Math.max(cfg.minMs, (u.text.length / (cps * rate)) * 1000) : 5;
    const c = { u, n: u.__n, rate, cps, dur, played: 0, words, nextWord: 0, earlyFired: false, seg: null };
    cur = c;
    setTimeout(() => begin(c), cfg.startLatencyMs);
  }

  function begin(c) {
    if (cur !== c) return;
    const failure = q.failWith ? q.failWith(c.u, c.n) : '';
    if (failure) {
      cur = null; // the engine could not speak it: an error instead of audio, and it moves on
      items.shift();
      fire(c.u, 'error', { error: failure });
      handOff();
      return;
    }
    c.seg = { id: c.u.__id, text: c.u.text, startT: clock.now, endT: null, complete: false };
    if (c.u.text) fake.audio.push(c.seg);
    if (!(q.noStart && q.noStart(c.u, c.n))) fire(c.u, 'start');
    if (cur !== c) return;
    boundaries(c);
    setTimeout(() => step(c), cfg.stepMs);
  }

  function boundaries(c) {
    if (cfg.boundaries === false) return;
    while (cur === c && c.nextWord < c.words.length && (c.words[c.nextWord].at / (c.cps * c.rate)) * 1000 <= c.played) {
      const w = c.words[c.nextWord++];
      fire(c.u, 'boundary', { name: 'word', charIndex: w.at, charLength: w.len });
    }
  }

  function step(c) {
    if (cur !== c) return;
    if (doc.hidden) {
      setTimeout(() => step(c), cfg.stepMs); // paused in the background (quirk g)
      return;
    }
    c.played += cfg.stepMs;
    boundaries(c);
    if (cur !== c) return;
    const early = q.earlyEnd ? q.earlyEnd(c.u, c.n) : false;
    if (early && !c.earlyFired && c.played >= early * c.dur) {
      c.earlyFired = true;
      fire(c.u, 'end');
      if (cur !== c) return;
    }
    const cut = q.cutoffMs && (!q.cutoffOnlineOnly || (c.u.voice && c.u.voice.localService === false));
    if (cut && c.played >= q.cutoffMs && c.played < c.dur) {
      c.seg.endT = clock.now;
      c.seg.cut = true;
      cur = null;
      stuck = true; // Chrome: the voice goes silent, speaking stays true, nothing else plays
      return;
    }
    if (c.played < c.dur) {
      setTimeout(() => step(c), cfg.stepMs);
      return;
    }
    // The audio is complete.
    c.seg.endT = clock.now;
    c.seg.complete = true;
    cur = null;
    if (q.stuckSpeaking) stuckSpeaking = true;
    if (q.stuckPending) stuckPending = true;
    const lost = q.dropEnd && q.dropEnd(c.u, c.n);
    if (lost && q.stallAfterLostEnd) {
      stuck = true; // the platform never reports completion: it stays current, nothing behind it plays
      return;
    }
    items.shift(); // completed: the engine moves on
    if (!lost && !c.earlyFired) fire(c.u, 'end');
    if (!lost && q.doubleEnd && q.doubleEnd(c.u, c.n)) fire(c.u, 'end');
    handOff();
  }

  return fake;
}

// ---- self-test of the fake (only when this file is the test being run) -------------------------

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const words = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ') + '.';

  /** A naive client: the old "speak the next chunk from onend" chain, for observing quirks. */
  function naive(texts) {
    const log = [];
    let i = 0;
    const next = () => {
      if (i >= texts.length) return;
      const u = new globalThis.SpeechSynthesisUtterance(texts[i++]);
      u.onstart = () => log.push('start');
      u.onend = () => {
        log.push('end');
        next();
      };
      u.onerror = (e) => log.push('error:' + e.error);
      globalThis.speechSynthesis.speak(u);
    };
    next();
    return log;
  }

  const withFake = (config, fn) => {
    const clock = installClock();
    const fake = createFakeSpeech(clock, config).install();
    try {
      fn(clock, fake);
    } finally {
      fake.uninstall();
      clock.restore();
    }
  };

  test('fake engine: a FIFO queue that plays utterances back to back with start/boundary/end events', () => {
    withFake({}, (clock, fake) => {
      const a = new globalThis.SpeechSynthesisUtterance(words(10, 'a'));
      const b = new globalThis.SpeechSynthesisUtterance(words(10, 'b'));
      const seen = [];
      for (const u of [a, b]) {
        u.onstart = () => seen.push(['start', u.text[0]]);
        u.onend = () => seen.push(['end', u.text[0]]);
        u.onboundary = (e) => seen.push(['b', u.text.slice(e.charIndex, e.charIndex + e.charLength)]);
      }
      globalThis.speechSynthesis.speak(a);
      // Chromium and WebKit: `speaking` from speak() on (before any audio or event), `pending`
      // only while more than one is queued.
      assert.deepEqual([globalThis.speechSynthesis.speaking, globalThis.speechSynthesis.pending, fake.events.length], [true, false, 0]);
      globalThis.speechSynthesis.speak(b);
      assert.equal(globalThis.speechSynthesis.pending, true);
      assert.equal(fake.maxOurs, 2);
      clock.advance(20_000);
      assert.deepEqual(fake.completed(), [a.text, b.text]);
      assert.deepEqual(seen.filter((x) => x[0] !== 'b'), [['start', 'a'], ['end', 'a'], ['start', 'b'], ['end', 'b']]);
      assert.equal(seen.filter((x) => x[0] === 'b').length, 20);
      assert.equal(globalThis.speechSynthesis.speaking, false);
      assert.equal(globalThis.speechSynthesis.pending, false);
    });
  });

  test('fake engine quirks: a+b stall the naive onend chain; c drops speak() inside onend', () => {
    withFake({ quirks: { stuckSpeaking: true, dropEnd: (u, n) => n === 0 } }, (clock, fake) => {
      const log = naive([words(5, 'a'), words(5, 'b')]);
      clock.advance(30_000);
      assert.deepEqual(fake.completed(), [words(5, 'a')]);
      assert.deepEqual(log, ['start']);
      assert.equal(globalThis.speechSynthesis.speaking, true, 'speaking stays stuck');
    });
    withFake({ quirks: { dropSpeakInEnd: true } }, (clock, fake) => {
      naive([words(5, 'a'), words(5, 'b')]);
      clock.advance(30_000);
      assert.deepEqual(fake.completed(), [words(5, 'a')]);
      assert.equal(fake.submitted[1].dropped, 'in-end');
    });
  });

  test('fake engine quirks: d drops speak() right after cancel(); cancel() errors (h); e cut-off; g hidden pause', () => {
    withFake({ quirks: { dropAfterCancelMs: 200, cancelErrorDelayMs: 100 } }, (clock, fake) => {
      const a = new globalThis.SpeechSynthesisUtterance(words(30, 'a'));
      const errors = [];
      a.onerror = (e) => errors.push([e.error, clock.now]);
      globalThis.speechSynthesis.speak(a);
      clock.advance(1000);
      const t = clock.now;
      globalThis.speechSynthesis.cancel();
      const dropped = new globalThis.SpeechSynthesisUtterance('dropped.');
      const seen = [];
      dropped.onstart = dropped.onend = dropped.onboundary = dropped.onerror = (e) => seen.push(e.type);
      globalThis.speechSynthesis.speak(dropped);
      clock.advance(150);
      assert.deepEqual(errors, [['interrupted', t + 100]]);
      clock.advance(100);
      // Outside the window, but queued behind the dropped utterance: the dropped one never plays and
      // never sends an event, yet it stays current (Chromium), so nothing behind it plays either.
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance('behind.'));
      clock.advance(5000);
      assert.equal(fake.submitted[1].dropped, 'after-cancel');
      assert.deepEqual([fake.completed(), seen], [[], []]);
      assert.deepEqual([globalThis.speechSynthesis.speaking, globalThis.speechSynthesis.pending, fake.queued()], [true, true, 2]);
      assert.deepEqual(fake.silent(), [fake.submitted[1].id, fake.submitted[2].id]);
      // Only cancel() clears it; a speak() outside the window after that plays.
      globalThis.speechSynthesis.cancel();
      clock.advance(300);
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance('kept.'));
      clock.advance(5000);
      assert.deepEqual(fake.completed(), ['kept.']);
      assert.equal(fake.partial().length, 1);
      assert.equal(globalThis.speechSynthesis.speaking, false);
    });
    // dropSpeak and a dead engine hold the queue the same way; invisibleDrops forgets the utterance.
    withFake({ quirks: { dropSpeak: (u, k) => k === 0 } }, (clock, fake) => {
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance('lost.'));
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance('stuck behind it.'));
      clock.advance(10_000);
      assert.deepEqual([fake.completed(), fake.events.length, globalThis.speechSynthesis.speaking, globalThis.speechSynthesis.pending], [[], 0, true, true]);
    });
    withFake({ quirks: { deadEngine: true } }, (clock, fake) => {
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance('Hello.'));
      clock.advance(60_000);
      assert.deepEqual([fake.audio.length, fake.events.length, globalThis.speechSynthesis.speaking, fake.submitted[0].dropped], [0, 0, true, 'dead']);
    });
    withFake({ quirks: { deadEngine: true, invisibleDrops: true } }, (clock, fake) => {
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance('Hello.'));
      assert.deepEqual([globalThis.speechSynthesis.speaking, globalThis.speechSynthesis.pending, fake.queued()], [false, false, 0]);
    });
    // b with a lost completion: the utterance played, but it stays current and the queue stalls.
    withFake({ quirks: { dropEnd: (u, n) => n === 0, stallAfterLostEnd: true } }, (clock, fake) => {
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance(words(5, 'a')));
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance(words(5, 'b')));
      clock.advance(30_000);
      assert.deepEqual([fake.completed(), globalThis.speechSynthesis.speaking, globalThis.speechSynthesis.pending], [[words(5, 'a')], true, true]);
      globalThis.speechSynthesis.cancel();
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance(words(5, 'b')));
      clock.advance(30_000);
      assert.deepEqual(fake.completed(), [words(5, 'a'), words(5, 'b')]);
    });
    withFake({ quirks: { cutoffMs: 15_000, cutoffOnlineOnly: true } }, (clock, fake) => {
      const u = new globalThis.SpeechSynthesisUtterance(words(80, 'w'));
      u.voice = VOICES.googleUK;
      globalThis.speechSynthesis.speak(u);
      globalThis.speechSynthesis.speak(new globalThis.SpeechSynthesisUtterance('next.'));
      clock.advance(60_000);
      assert.deepEqual(fake.completed(), []);
      assert.equal(fake.partial()[0].cut, true);
      assert.equal(globalThis.speechSynthesis.speaking, true);
    });
    withFake({}, (clock, fake) => {
      const u = new globalThis.SpeechSynthesisUtterance(words(30, 'w')); // ~13 s
      globalThis.speechSynthesis.speak(u);
      clock.advance(2000);
      fake.setHidden(true);
      clock.advance(60_000);
      assert.deepEqual(fake.completed(), []);
      fake.setHidden(false);
      clock.advance(15_000);
      assert.deepEqual(fake.completed(), [u.text]);
    });
  });

  test('fake engine quirks: f early/double end and no start; virtual clock order', () => {
    withFake({ quirks: { earlyEnd: () => 0.5, noStart: () => true } }, (clock) => {
      const u = new globalThis.SpeechSynthesisUtterance(words(30, 'w'));
      const seen = [];
      u.onstart = () => seen.push('start');
      u.onend = () => seen.push(['end', globalThis.speechSynthesis.speaking]);
      globalThis.speechSynthesis.speak(u);
      clock.advance(30_000);
      assert.deepEqual(seen, [['end', true]], 'end while audio still plays, no start');
    });
    withFake({ quirks: { doubleEnd: () => true } }, (clock) => {
      const u = new globalThis.SpeechSynthesisUtterance('Hi.');
      let ends = 0;
      u.onend = () => ends++;
      globalThis.speechSynthesis.speak(u);
      clock.advance(5000);
      assert.equal(ends, 2);
    });
    const clock = installClock(0);
    try {
      const order = [];
      setTimeout(() => {
        order.push(['a', Date.now()]);
        setTimeout(() => order.push(['nested', Date.now()]), 10);
      }, 30);
      const iv = setInterval(() => order.push(['iv', Date.now()]), 25);
      clock.advance(60);
      clearInterval(iv);
      assert.deepEqual(order, [['iv', 25], ['a', 30], ['nested', 40], ['iv', 50]]);
    } finally {
      clock.restore();
    }
  });
}
