// One speech API for the app with two engines behind it: the device voice (tts.js,
// speechSynthesis) and the natural voice (Kokoro in a Worker, natural/*). It has the same exports
// as tts.js, so Voice Mode and the chat use it unchanged (app.js passes the router as `tts`).
//
//   const tts = createVoiceRouter({ device, natural, homebase, getSettings });
//     device    the tts.js module (namespace import)
//     natural   { engine (engine-client.js), audio (audio-out.js) } or null
//     homebase  v7.7 (beta): George's voice made by the home base, { engine (homebase-voice.js),
//               audio (audio-out.js), canSpeak() } or null
//   tts.createSpeechStream(opts) / speak(text, opts) / stopSpeaking() / isSpeaking() /
//   unlockSpeech() / toSpeech() / ttsSupported() / getVoices() / …   (tts.js contract)
//   tts.getOutputLevel()     0..1 while the natural voice plays, else null (no real signal)
//   tts.getOutputBands(out)  fills 8 bands and returns true while the natural voice plays
//   tts.activeEngine()       'homebase' | 'natural' | 'device' | null
//   tts.voiceNow()           v7.8: the voice speaking now, the device voice's own speak() included
//   tts.onVoiceChange(fn)    v7.8: fn(engine | null) when it changes (a reply starts, George hands over
//                            mid-reply, speech ends); returns unsubscribe. The voice label uses it.
//   tts.audioStuck()         v7.8.1: true while George's audio (Web Audio) is known not to play on this
//                            device, so replies go to the device voice
//   tts.onAudioStuck(fn)     v7.8.1: fn(stuck) when that changes; returns unsubscribe (Settings → Voice)
//   tts.noteAudioStuck(a)    v7.8.1: a sample played straight through audio output `a` (Settings' Test
//                            buttons) didn't move its clock: the same as a stall
//   tts.unlockSpeech({ tap }) v7.8.1: { tap: false } from callers that know no tap is behind the call
//
// Which engine speaks a stream: the natural voice when settings.naturalVoice is on and the engine
// is 'ready'. When it is still loading (the worker is stopped after 5 idle minutes and reloads
// from Cache Storage), the stream waits for it up to `waitMs` (4 s), buffering the text, then
// falls back to the device voice. 'slow' (real-time factor > 1), 'error' and 'off' speak with the
// device voice at once; unlockSpeech() (Voice Mode opening, the first tap) starts the engine so
// it is warm when the first reply comes.
//
// Mid-stream fallback: if the natural voice turns slow or fails, it lets the audio it has made
// play out and the device voice says the rest. The router keeps the whole text (its own copy,
// cut with the same speech-text.js rules), so offsets stay offsets into text() across the switch.
//
// The home base (v7.7, beta): with settings.homeBaseSpeak on and the home base's voice ready
// (homebase.canSpeak(): known ready, not resting after a failure), a stream is spoken by the home
// base's George through the same natural stream and audio path (each sentence fetched from api/speak,
// queued ahead). When it fails or is too slow, the rest goes to the on-device George when that is on
// and ready, else to the device voice, from the same offset. Off, nothing here changes.
//
// Stuck audio (v7.8.1): when the natural stream's watchdog finds the audio clock stopped (handoff reason
// 'stall'), the device voice says the rest at once (never the on-device George: he plays through the same
// Web Audio), and the router remembers that this device's Web Audio is stuck, with its clock reading. New
// replies then go straight to the device voice, without another wait, until a tap unlocks audio again
// (unlockSpeech() in a tap: the first tap, Voice Mode opened by hand, Test, a reply's Speak tap, the chat
// mic; each stuck output is then started afresh inside the tap, audio.revive()) or its clock is seen to have
// moved since (the sound came back by itself: each reply sent to the device voice meanwhile asks the stuck
// output to run again, audio.probe(), so the next reply can tell). Then George speaks again. An
// unlockSpeech() without a tap (Standby entered again after Voice Mode, Voice Mode opened by the wake
// routine; or navigator.userActivation saying no tap is active) keeps what is known, so a wake greeting
// doesn't wait 3.5 s for a sound that can't start. The George settings are never changed for this.

import { newText, ingest } from './speech-text.js';
import { createNaturalStream, stopNatural } from './natural/natural-stream.js';

const WAIT_MS = 4000;
// v7.8.1: stuck audio counts as working again once its clock has moved this far (seconds) since the stall.
const STUCK_MOVED_S = 0.25;

function report(err) {
  try {
    console.error('[jarvis] speech callback failed:', err);
  } catch {
    /* ignore */
  }
}

function call(fn, arg) {
  if (typeof fn !== 'function') return;
  try {
    fn(arg);
  } catch (err) {
    report(err);
  }
}

export function createVoiceRouter({ device, natural = null, homebase = null, getSettings = () => ({}), waitMs = WAIT_MS } = {}) {
  let current = null; // the router stream being spoken
  // v7.8: the voice speaking now (for the voice label), and who wants to know when it changes.
  let voiceNow = null;
  let direct = 0; // the device voice's own speak() (the unchanged path) is speaking: its token
  let directSeq = 0;
  const voiceListeners = new Set();
  function noteVoice(kind) {
    const next = kind || (direct ? 'device' : null);
    if (next === voiceNow) return;
    voiceNow = next;
    for (const fn of Array.from(voiceListeners)) call(fn, next);
  }
  const noteKind = (r) => {
    if (current === r && !r.ended) noteVoice(r.kind);
  };

  const settings = () => {
    try {
      return getSettings() || {};
    } catch {
      return {};
    }
  };
  const wantNatural = () => !!natural && settings().naturalVoice === true && natural.audio.supported();
  const engineState = () => (natural ? natural.engine.status().state : 'off');
  const wantHomebase = () => {
    if (!homebase || settings().homeBaseSpeak !== true) return false;
    try {
      return !!homebase.audio.supported() && !!homebase.canSpeak();
    } catch {
      return false;
    }
  };

  // ---- v7.8.1: stuck audio ------------------------------------------------------------------
  // The audio outputs whose clock stopped during a reply (the natural stream's 'stall' handoff), each
  // with its clock reading then. In the app George from the home base and George on this device share
  // one output (one AudioContext), so one stall covers both.
  const stuck = new Map(); // audio out -> { clock }
  const stuckListeners = new Set();
  const clockOf = (audio) => {
    try {
      const t = Number(audio.now());
      return Number.isFinite(t) ? t : null;
    } catch {
      return null;
    }
  };
  function noteStuck(was) {
    const now = stuck.size > 0;
    if (now === was) return;
    for (const fn of Array.from(stuckListeners)) call(fn, now);
  }
  function markStuck(audio) {
    if (!audio) return;
    const was = stuck.size > 0;
    const t = clockOf(audio);
    stuck.set(audio, { clock: t === null ? 0 : t });
    noteStuck(was);
  }
  /** Is this output known stuck? Not once its clock has moved since the stall (it came back by itself). */
  function isStuck(audio) {
    const rec = audio ? stuck.get(audio) : null;
    if (!rec) return false;
    const t = clockOf(audio);
    if (t !== null && Math.abs(t - rec.clock) >= STUCK_MOVED_S) {
      const was = stuck.size > 0;
      stuck.delete(audio);
      noteStuck(was);
      return false;
    }
    return true;
  }
  function clearStuck() {
    const was = stuck.size > 0;
    stuck.clear();
    noteStuck(was);
  }
  /**
   * Is this unlockSpeech() call a tap? Callers that know none is behind it say { tap: false } (Standby entered
   * again after Voice Mode, Voice Mode opened by the wake routine). Where the browser tells
   * (navigator.userActivation: Safari 16.4+, Chrome), a call made while no user activation is active isn't
   * one either. Without that API, a tap, as before.
   */
  function isTap(opts) {
    if (opts && opts.tap === false) return false;
    try {
      const ua = globalThis.navigator && globalThis.navigator.userActivation;
      return !ua || ua.isActive !== false;
    } catch {
      return true;
    }
  }
  /**
   * A reply went to the device voice because George's output is stuck: ask each stuck output he would use to
   * run again (audio.probe(): no sound), so the next reply can see its clock move and George comes back by
   * himself. Only as a reply starts: Voice Mode's microphone is closed while Jarvis speaks.
   */
  function nudgeStuck() {
    for (const audio of Array.from(stuck.keys())) {
      const used = (!!homebase && audio === homebase.audio && wantHomebase()) || (!!natural && audio === natural.audio && wantNatural());
      if (!used || !isStuck(audio) || typeof audio.probe !== 'function') continue;
      try {
        audio.probe();
      } catch {
        /* ignore */
      }
    }
  }
  // The engines a reply may use now: wanted, and their audio not known stuck.
  const useHomebase = () => wantHomebase() && !isStuck(homebase.audio);
  const useNatural = () => wantNatural() && !isStuck(natural.audio);

  function naturalDeps(r) {
    return { engine: natural.engine, audio: natural.audio, voice: settings().naturalVoiceId || 'bm_george', onHandoff: (h) => handoff(r, r.base + h.from, h.reason) };
  }

  // ---- router streams -------------------------------------------------------------------

  function open(opts) {
    for (let guard = 0; current && guard < 8; guard++) current.handle.cancel();
    const r = {
      opts: opts && typeof opts === 'object' ? opts : {},
      mirror: newText(),
      raw: '',
      finished: false,
      ended: false,
      kind: null, // 'natural' | 'device' | null (waiting)
      backend: null,
      base: 0, // device stream text starts at this offset of mirror.norm
      started: false,
      waitTimer: 0,
      unsub: null,
    };
    r.handle = {
      append: (text) => append(r, text),
      finish: () => finish(r),
      cancel: () => end(r, 'cancelled', true),
      text: () => r.mirror.norm,
      spokenUpTo: () => spokenUpTo(r),
      active: () => !r.ended,
    };
    current = r;
    return r;
  }

  function spokenUpTo(r) {
    if (!r.backend) return 0;
    const n = r.backend.spokenUpTo();
    return n > 0 ? r.base + n : r.base;
  }

  function events(r, kind) {
    // Offsets into text(): a stream that took over part way (the device voice, or the on-device
    // George after the home base) starts at r.base; one that spoke from the start has r.base 0.
    const base = () => r.base;
    const mine = () => !r.ended && r.kind === kind;
    return {
      rate: r.opts.rate,
      voiceURI: r.opts.voiceURI,
      onStart: () => {
        if (!mine() || r.started) return;
        r.started = true;
        call(r.opts.onStart);
      },
      onChunk: (c) => {
        if (!mine()) return;
        if (!r.started) {
          r.started = true;
          call(r.opts.onStart);
        }
        call(r.opts.onChunk, { index: c.index, start: c.start + base(), end: c.end + base(), text: c.text });
      },
      onBoundary: (b) => mine() && call(r.opts.onBoundary, { ...b, charIndex: b.charIndex + base() }),
      onIdle: () => mine() && call(r.opts.onIdle),
      onEnd: (e) => {
        if (!mine()) return;
        end(r, (e && e.reason) || 'done', false);
      },
    };
  }

  function choose(r) {
    if (r.kind || r.ended) return;
    if (useHomebase()) return startHomebase(r);
    if (!useNatural()) {
      startDevice(r, 0); // v7.8.1: George's audio stuck here too: at once, no wait
      if (stuck.size) nudgeStuck();
      return;
    }
    // Known to be too slow on this device (a verdict kept across reloads): the device voice, at once.
    if (typeof natural.engine.knownSlow === 'function' && natural.engine.knownSlow() && engineState() !== 'ready') return startDevice(r, 0);
    const state = engineState();
    if (state === 'ready') return startNatural(r);
    if (state === 'off' || state === 'starting' || state === 'downloading' || state === 'loading' || state === 'warming') {
      if (state === 'off') {
        natural.engine.start().catch(() => {});
        if (engineState() === 'error') return startDevice(r, 0);
      }
      if (state === 'downloading') return startDevice(r, 0); // first download: don't make the owner wait minutes
      // Wait a little for the engine (loading from Cache Storage takes seconds), then decide.
      r.unsub = natural.engine.subscribe((st) => {
        if (r.kind || r.ended) return;
        if (st.state === 'ready') startNatural(r);
        else if (st.state === 'error' || st.state === 'slow' || st.state === 'off') startDevice(r, 0);
      });
      r.waitTimer = setTimeout(() => !r.kind && !r.ended && startDevice(r, 0), waitMs);
      return;
    }
    startDevice(r, 0); // 'slow' or 'error'
  }

  function stopWaiting(r) {
    clearTimeout(r.waitTimer);
    r.waitTimer = 0;
    if (r.unsub) r.unsub();
    r.unsub = null;
  }

  function startNatural(r) {
    stopWaiting(r);
    r.kind = 'natural';
    noteKind(r);
    const ev = events(r, 'natural');
    try {
      r.backend = createNaturalStream(naturalDeps(r), ev);
      if (r.raw) r.backend.append(r.raw);
      if (r.finished) r.backend.finish();
    } catch (err) {
      report(err);
      startDevice(r, 0);
    }
  }

  /** The text from `from` (an offset into mirror.norm) on, with its line breaks and pending space. */
  function restFrom(r, from) {
    const t = r.mirror.norm;
    let base = Math.max(0, Math.min(from, t.length));
    while (base < t.length && t.charCodeAt(base) === 32) base += 1;
    // Rebuild the rest with its line breaks (they end chunks and make pauses) and pending space.
    let rest = '';
    let bi = 0;
    const breaks = r.mirror.breaks;
    for (let i = base; i < t.length; i++) {
      while (bi < breaks.length && breaks[bi] < i) bi++;
      rest += t[i] === ' ' && breaks[bi] === i ? '\n' : t[i];
    }
    if (r.mirror.pendingWs) rest += r.mirror.pendingBreak ? '\n' : ' ';
    return { base, rest };
  }

  /** The home base's George speaks the stream (v7.7): the natural stream on the home base's engine. */
  function startHomebase(r) {
    stopWaiting(r);
    r.kind = 'homebase';
    noteKind(r);
    const ev = events(r, 'homebase');
    try {
      r.backend = createNaturalStream({ engine: homebase.engine, audio: homebase.audio, voice: settings().naturalVoiceId || 'bm_george', onHandoff: (h) => handoffHome(r, h.from, h.reason) }, ev);
      if (r.raw) r.backend.append(r.raw);
      if (r.finished) r.backend.finish();
    } catch (err) {
      report(err);
      afterHomebase(r, 0);
    }
  }

  function handoffHome(r, from, reason) {
    if (r.ended || r.kind !== 'homebase') return;
    if (reason === 'stall') {
      // v7.8.1: the audio clock stopped: the device voice says the rest now; new replies go to it too.
      markStuck(homebase.audio);
      startDevice(r, from);
      return;
    }
    afterHomebase(r, from);
  }

  /** The home base couldn't go on: the on-device George when it is on and ready, else the device voice. */
  function afterHomebase(r, from) {
    if (useNatural() && engineState() === 'ready') startNaturalAt(r, from);
    else startDevice(r, from);
  }

  /** The on-device George says everything from `from` on (after the home base's voice). */
  function startNaturalAt(r, from) {
    stopWaiting(r);
    const { base, rest } = restFrom(r, from);
    r.kind = 'natural';
    r.base = base;
    noteKind(r);
    const ev = events(r, 'natural');
    try {
      r.backend = createNaturalStream(naturalDeps(r), ev);
      if (rest) r.backend.append(rest);
      if (r.finished) r.backend.finish();
    } catch (err) {
      report(err);
      startDevice(r, from);
    }
  }

  /** The device voice says everything from `from` (an offset into mirror.norm) onwards. */
  function startDevice(r, from) {
    stopWaiting(r);
    r.kind = 'device';
    const { base, rest } = restFrom(r, from);
    r.base = base;
    noteKind(r);
    const ev = events(r, 'device');
    try {
      const stream = device.createSpeechStream(ev);
      r.backend = stream;
      if (rest) stream.append(rest);
      if (r.finished) stream.finish();
    } catch (err) {
      report(err);
      end(r, 'error', false);
    }
  }

  function handoff(r, from, reason) {
    if (r.ended || r.kind !== 'natural') return;
    if (reason === 'stall') markStuck(natural.audio); // v7.8.1: new replies go to the device voice too
    startDevice(r, from);
  }

  function append(r, text) {
    if (r.ended || r.finished) return;
    const str = typeof text === 'string' ? text : text === null || text === undefined ? '' : String(text);
    if (!str) return;
    r.raw += str;
    ingest(r.mirror, str);
    if (r.backend) r.backend.append(str);
    else choose(r);
  }

  function finish(r) {
    if (r.ended || r.finished) return;
    r.finished = true;
    if (r.backend) r.backend.finish();
    else if (!r.mirror.norm) end(r, 'empty', false, true);
    else choose(r);
  }

  function end(r, reason, cancelBackend, later = false) {
    if (r.ended) return;
    r.ended = true;
    stopWaiting(r);
    if (current === r) {
      current = null;
      noteVoice(null);
    }
    if (cancelBackend && r.backend) {
      try {
        r.backend.cancel();
      } catch {
        /* ignore */
      }
    }
    if (later) setTimeout(() => call(r.opts.onEnd, { reason }), 0);
    else call(r.opts.onEnd, { reason });
  }

  // ---- the tts.js API ---------------------------------------------------------------------

  function createSpeechStream(opts) {
    const r = open(opts);
    if (!useNatural() && !useHomebase()) {
      startDevice(r, 0); // the device voice behaves exactly as before
      if (stuck.size) nudgeStuck(); // v7.8.1: George's sound stuck: ask it to run again, for the next reply
    }
    return r.handle;
  }

  function speak(text, opts) {
    if (!useNatural() && !useHomebase()) {
      // Unchanged path: tts.speak() itself (synchronous start inside a gesture on iOS). v7.8: the voice
      // label follows it (its onEnd is wrapped; every other option goes through as it is).
      stopAll();
      const o = opts && typeof opts === 'object' ? opts : {};
      const token = ++directSeq;
      direct = token;
      noteVoice('device');
      const onEnd = (info) => {
        if (direct === token) {
          direct = 0;
          noteVoice(current && !current.ended ? current.kind : null);
        }
        call(o.onEnd, info);
      };
      const handle = device.speak(text, { ...o, onEnd });
      if (stuck.size) nudgeStuck(); // v7.8.1: after the device voice has started (iOS: inside the gesture)
      return handle;
    }
    const r = open(opts);
    r.handle.append(text);
    r.handle.finish();
    return { cancel: r.handle.cancel };
  }

  function stopAll() {
    if (current) current.handle.cancel();
    stopNatural();
  }

  function stopSpeaking() {
    stopAll();
    try {
      device.stopSpeaking();
    } catch {
      /* ignore */
    }
  }

  function isSpeaking() {
    return (!!current && !current.ended) || !!(device.isSpeaking && device.isSpeaking());
  }

  function unlockSpeech(opts) {
    try {
      device.unlockSpeech();
    } catch {
      /* ignore */
    }
    // v7.8.1: a tap gives George his next chance: what is known about stuck audio is forgotten, and each stuck
    // output is started afresh inside the tap (audio.revive(): a new context, since a resume() can't start one
    // that says it runs with its clock stopped, and iOS starts audio only in a gesture). If his clock still
    // doesn't move, the stream's watchdog hands over again and the output is stuck once more. Without a tap
    // (isTap()), what is known stays: a wake greeting goes straight to the device voice.
    const revive = isTap(opts) ? Array.from(stuck.keys()) : null;
    if (revive) clearStuck();
    const revived = new Set();
    const start = (audio) => {
      if (revive && revive.includes(audio) && typeof audio.revive === 'function') {
        if (!revived.has(audio)) audio.revive(); // George from the home base and on this device share one
        revived.add(audio);
        return;
      }
      audio.unlock(); // inside the tap: iOS starts Web Audio only there
    };
    if (wantNatural()) {
      start(natural.audio);
      const known = typeof natural.engine.knownSlow === 'function' && natural.engine.knownSlow();
      if (engineState() === 'off' && !known) natural.engine.start().catch(() => {});
    }
    if (homebase && settings().homeBaseSpeak === true) {
      try {
        start(homebase.audio);
      } catch {
        /* ignore */
      }
    }
  }

  function ttsSupported() {
    let dev = false;
    try {
      dev = !!device.ttsSupported();
    } catch {
      dev = false;
    }
    return dev || wantNatural() || wantHomebase();
  }

  function activeEngine() {
    return current && !current.ended ? current.kind : null;
  }

  /** v7.8: fn(engine | null) whenever the voice speaking changes. Returns unsubscribe. */
  function onVoiceChange(fn) {
    if (typeof fn !== 'function') return () => {};
    voiceListeners.add(fn);
    return () => voiceListeners.delete(fn);
  }

  /** v7.8.1: George's audio is known stuck on this device (replies go to the device voice meanwhile). */
  function audioStuck() {
    for (const audio of Array.from(stuck.keys())) isStuck(audio); // a clock that moved since: not any more
    return stuck.size > 0;
  }

  /** v7.8.1: fn(stuck) whenever audioStuck() changes. Returns unsubscribe. */
  function onAudioStuck(fn) {
    if (typeof fn !== 'function') return () => {};
    stuckListeners.add(fn);
    return () => stuckListeners.delete(fn);
  }

  /**
   * v7.8.1: a sample played straight through an audio output (Settings' Test buttons, no natural stream and so
   * no watchdog) whose clock didn't move: the same as a stall, so replies don't wait for it.
   */
  function noteAudioStuck(audio) {
    markStuck(audio || (homebase && homebase.audio) || (natural && natural.audio) || null);
  }

  /** The Web Audio output the active stream plays through (the natural voice's, or the home base's). */
  function playingAudio() {
    const kind = activeEngine();
    const a = kind === 'natural' && natural ? natural.audio : kind === 'homebase' && homebase ? homebase.audio : null;
    return a && a.busy() ? a : null;
  }

  function getOutputLevel() {
    const a = playingAudio();
    return a ? a.level() : null;
  }

  function getOutputBands(out) {
    const a = playingAudio();
    if (!a) return false;
    a.bands(out);
    return true;
  }

  return {
    // tts.js pass-throughs
    getVoices: (...a) => device.getVoices(...a),
    voiceQuality: (...a) => device.voiceQuality(...a),
    rankVoices: (...a) => device.rankVoices(...a),
    pickDefaultVoice: (...a) => device.pickDefaultVoice(...a),
    resolveVoice: (...a) => device.resolveVoice(...a),
    toSpeech: (...a) => device.toSpeech(...a),
    chunkText: (...a) => device.chunkText(...a),
    splitSentences: (...a) => device.splitSentences(...a),
    SPEECH_TIMING: device.SPEECH_TIMING,
    // routed
    ttsSupported,
    unlockSpeech,
    createSpeechStream,
    speak,
    stopSpeaking,
    isSpeaking,
    // new
    getOutputLevel,
    getOutputBands,
    activeEngine,
    voiceNow: () => voiceNow,
    onVoiceChange,
    audioStuck,
    onAudioStuck,
    noteAudioStuck,
    natural,
    homebase,
  };
}
