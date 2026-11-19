// One speech API for the app with two engines behind it: the device voice (tts.js,
// speechSynthesis) and the natural voice (Kokoro in a Worker, natural/*). It has the same exports
// as tts.js, so Voice Mode and the chat use it unchanged (app.js passes the router as `tts`).
//
//   const tts = createVoiceRouter({ device, natural, getSettings });
//     device    the tts.js module (namespace import)
//     natural   { engine (engine-client.js), audio (audio-out.js) } or null
//   tts.createSpeechStream(opts) / speak(text, opts) / stopSpeaking() / isSpeaking() /
//   unlockSpeech() / toSpeech() / ttsSupported() / getVoices() / …   (tts.js contract)
//   tts.getOutputLevel()     0..1 while the natural voice plays, else null (no real signal)
//   tts.getOutputBands(out)  fills 8 bands and returns true while the natural voice plays
//   tts.activeEngine()       'natural' | 'device' | null
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

import { newText, ingest } from './speech-text.js';
import { createNaturalStream, stopNatural } from './natural/natural-stream.js';

const WAIT_MS = 4000;

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

export function createVoiceRouter({ device, natural = null, getSettings = () => ({}), waitMs = WAIT_MS } = {}) {
  let current = null; // the router stream being spoken

  const settings = () => {
    try {
      return getSettings() || {};
    } catch {
      return {};
    }
  };
  const wantNatural = () => !!natural && settings().naturalVoice === true && natural.audio.supported();
  const engineState = () => (natural ? natural.engine.status().state : 'off');

  function naturalDeps(r) {
    return { engine: natural.engine, audio: natural.audio, voice: settings().naturalVoiceId || 'bm_george', onHandoff: (h) => handoff(r, h.from) };
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
    return r.kind === 'device' ? (n > 0 ? r.base + n : r.base) : n;
  }

  function events(r, kind) {
    const base = () => (kind === 'device' ? r.base : 0);
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
    if (!wantNatural()) return startDevice(r, 0);
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

  /** The device voice says everything from `from` (an offset into mirror.norm) onwards. */
  function startDevice(r, from) {
    stopWaiting(r);
    r.kind = 'device';
    const t = r.mirror.norm;
    let base = Math.max(0, Math.min(from, t.length));
    while (base < t.length && t.charCodeAt(base) === 32) base += 1;
    r.base = base;
    // Rebuild the rest with its line breaks (they end chunks and make pauses) and pending space.
    let rest = '';
    let bi = 0;
    const breaks = r.mirror.breaks;
    for (let i = base; i < t.length; i++) {
      while (bi < breaks.length && breaks[bi] < i) bi++;
      rest += t[i] === ' ' && breaks[bi] === i ? '\n' : t[i];
    }
    if (r.mirror.pendingWs) rest += r.mirror.pendingBreak ? '\n' : ' ';
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

  function handoff(r, from) {
    if (r.ended || r.kind !== 'natural') return;
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
    if (current === r) current = null;
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
    if (!wantNatural()) startDevice(r, 0); // the device voice behaves exactly as before
    return r.handle;
  }

  function speak(text, opts) {
    if (!wantNatural()) {
      // Unchanged path: tts.speak() itself (synchronous start inside a gesture on iOS).
      stopAll();
      return device.speak(text, opts);
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

  function unlockSpeech() {
    try {
      device.unlockSpeech();
    } catch {
      /* ignore */
    }
    if (wantNatural()) {
      natural.audio.unlock();
      const known = typeof natural.engine.knownSlow === 'function' && natural.engine.knownSlow();
      if (engineState() === 'off' && !known) natural.engine.start().catch(() => {});
    }
  }

  function ttsSupported() {
    let dev = false;
    try {
      dev = !!device.ttsSupported();
    } catch {
      dev = false;
    }
    return dev || wantNatural();
  }

  function activeEngine() {
    return current && !current.ended ? current.kind : null;
  }

  function getOutputLevel() {
    if (!natural || activeEngine() !== 'natural' || !natural.audio.busy()) return null;
    return natural.audio.level();
  }

  function getOutputBands(out) {
    if (!natural || activeEngine() !== 'natural' || !natural.audio.busy()) return false;
    natural.audio.bands(out);
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
    natural,
  };
}
