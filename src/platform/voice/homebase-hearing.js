// Hearing through the home base (v7.7, beta, SPEC §25): Whisper on the owner's Alienware (Jarvis
// Core's POST api/hear) behind the listening engine's own interface (stt.js), so Voice Mode uses it
// unchanged where it asks for it.
//
//   const listening = createHomeBaseHearing({ stt, senses, createCapture, getPrompt, getSettings });
//   listening.startListening({ …stt.js options…, homeBase: true, onHomeBase(info) })
//     -> { stop(), abort() }           (every other export is stt.js's own)
//
// Only a listen that asks for it (`homeBase: true`: Voice Mode's own listens) and only while the
// owner turned it on and the home base is ready (senses.canHear(), decided at once, inside the tap)
// goes to the home base; every other listen is stt.js's, exactly as before.
//
// The home base path: this device's microphone through the Standby capture (capture.js: 16 kHz
// frames from its AudioWorklet, with the browser's echo cancellation, noise suppression and auto
// gain), an energy VAD finds the end of what was said (speech, then 1.2 s of silence; 2.2 s with
// Settings → Voice → Wait: Long; at most 30 s), a WAV goes to the home base with the conversation's
// context words (?prompt=), and the words come back as the turn's final (onFinal(text, {
// alternatives: [], reason, turn })). There are no words while the owner talks (Whisper hears whole
// utterances): onHomeBase({ phase }) says what happens instead — 'listening' (the microphone is
// open), 'speech' (the owner is talking), 'sending' (the words are on their way), 'heard' ({ ms }),
// 'fallback' ({ reason: 'unreachable' | 'slow' | 'error' | 'mic' }), 'idle' (ended).
//
// Fallback: the home base unreachable, slower than 4 s (HEAR_TIMEOUT_MS) or failing, or the
// microphone not opening -> this device's recognizer (stt.js) takes over the same listen with the
// same callbacks (the owner says it again; Voice Mode says so), and the home base rests for a minute
// (senses.noteFailure). keepListening (the 2-second check) goes on hearing the next utterances.
// stop() delivers what was said so far (the words come when the home base answers); abort()
// delivers nothing; onEnd() comes exactly once, never inside startListening() itself.

import { createVad, encodeWav, hearEndSilenceMs, HEAR_MAX_MS, HEAR_SAMPLE_RATE, HEAR_TIMEOUT_MS } from '../../lib/senses.js';

const NO_SPEECH_MESSAGE = "I didn't hear anything. Tap the mic and try again.";

function report(err) {
  try {
    console.error('[jarvis] voice input callback failed:', err);
  } catch {
    /* ignore */
  }
}

function call(fn, ...args) {
  if (typeof fn !== 'function') return;
  try {
    fn(...args);
  } catch (err) {
    report(err);
  }
}

function safe(fn, fallback) {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function createHomeBaseHearing({ stt, senses, createCapture, getPrompt = () => '', getSettings = () => ({}), timeoutMs = HEAR_TIMEOUT_MS } = {}) {
  let capture = null;
  let current = null; // the home base listen under way

  function cap() {
    if (!capture && typeof createCapture === 'function') {
      capture = createCapture({
        processed: true,
        // The microphone's track ended (iOS: a call, Siri): what was said so far is delivered.
        onState: (s) => {
          if (current && s && s.state === 'off' && s.reason === 'ended') stop(current);
        },
      });
    }
    return capture;
  }

  function startListening(options = {}) {
    const o = options && typeof options === 'object' ? options : {};
    const { homeBase, onHomeBase, ...rest } = o;
    const usable = homeBase === true && !!senses && !!safe(() => senses.canHear(), false) && !!cap() && safe(() => capture.supported(), false);
    if (!usable) return stt.startListening(rest);
    if (current) abort(current); // one listen at a time, like a recognizer
    const L = {
      o: rest,
      onHomeBase,
      ended: false,
      endSent: false,
      device: null, // stt.js's handle once the device's recognizer took over
      vad: null,
      port: null,
      live: false,
      turn: 1,
      queue: [], // utterances waiting for the home base (one request at a time)
      inflight: null, // its AbortController
      stopping: false,
      delivered: false,
    };
    current = L;
    // Inside the owner's tap: the capture's AudioContext starts (iOS starts audio only there).
    safe(() => capture.prepare());
    Promise.resolve().then(() => begin(L));
    return { stop: () => stop(L), abort: () => abort(L) };
  }

  function emit(L, phase, extra = {}) {
    call(L.onHomeBase, { phase, source: 'homebase', ...extra });
  }

  async function begin(L) {
    if (L.ended) return;
    emit(L, 'listening');
    let r;
    try {
      r = await capture.start({ clap: false, word: true, sensitivity: 'normal' });
    } catch {
      r = { ok: false, reason: 'error' };
    }
    if (L.ended || L.device) {
      if (current !== L || L.ended) safeStopCapture(L);
      return;
    }
    const port = r && r.ok ? safe(() => capture.wordPort(), null) : null;
    if (!port) {
      fallback(L, 'mic');
      return;
    }
    L.port = port;
    L.live = true;
    const st = safe(() => getSettings(), {}) || {};
    L.vad = createVad({
      sampleRate: HEAR_SAMPLE_RATE,
      endSilenceMs: hearEndSilenceMs(st.listenWait),
      noSpeechMs: Number.isFinite(L.o.noSpeechMs) ? L.o.noSpeechMs : 10000,
      maxMs: HEAR_MAX_MS,
    });
    port.onmessage = (e) => {
      const m = e && e.data;
      if (m && m.type === 'frame' && m.samples) frames(L, m.samples);
    };
    if (typeof port.start === 'function') port.start();
  }

  function frames(L, samples) {
    if (L.ended || L.device || L.stopping || !L.vad) return;
    for (const ev of L.vad.push(samples)) {
      if (L.ended || L.device) return;
      if (ev.type === 'speech') emit(L, 'speech');
      else if (ev.type === 'noise') emit(L, L.inflight || L.queue.length ? 'sending' : 'listening');
      else if (ev.type === 'nospeech') {
        // Nothing at all for 10 s, before any words (later turns of keepListening just listen on).
        if (!L.delivered && !L.inflight && !L.queue.length) {
          call(L.o.onError, { code: 'no-speech', message: NO_SPEECH_MESSAGE });
          end(L);
          return;
        }
      } else if (ev.type === 'end') utterance(L, ev);
    }
  }

  function utterance(L, ev) {
    if (!ev.samples || !ev.samples.length) return;
    if (L.queue.length >= 2) L.queue.shift(); // never more than three waiting on the home base
    L.queue.push({ wav: encodeWav(ev.samples, HEAR_SAMPLE_RATE), reason: ev.reason });
    pump(L);
  }

  async function pump(L) {
    if (L.ended || L.device || L.inflight || !L.queue.length) return;
    const u = L.queue.shift();
    const ctl = new AbortController();
    L.inflight = ctl;
    emit(L, 'sending');
    const prompt = safe(() => String(getPrompt() || ''), '');
    let r;
    try {
      r = await senses.hear(u.wav, { prompt, timeoutMs, signal: ctl.signal });
    } catch {
      r = { ok: false, kind: 'error' };
    }
    if (L.inflight === ctl) L.inflight = null;
    if (L.ended || L.device) return;
    if (!r || !r.ok) {
      if (r && r.kind === 'aborted') return;
      fallback(L, r && r.kind === 'timeout' ? 'slow' : r && (r.kind === 'unreachable' || r.kind === 'down' || r.kind === 'starting') ? 'unreachable' : 'error');
      return;
    }
    if (!r.text) {
      // No words (a cough, the room): as if nothing had been heard; the listen goes on.
      emit(L, L.queue.length ? 'sending' : 'listening');
      if (L.stopping && !L.queue.length) end(L);
      else pump(L);
      return;
    }
    L.delivered = true;
    const reason = u.reason === 'max' ? 'max' : u.reason === 'stop' ? 'stop' : 'silence';
    call(L.o.onFinal, r.text, { alternatives: [], reason, turn: L.turn });
    if (L.ended || L.device) return;
    emit(L, 'heard', { ms: r.ms, tookMs: r.tookMs });
    L.turn += 1;
    if (!L.o.keepListening || L.stopping) {
      end(L);
      return;
    }
    emit(L, L.queue.length ? 'sending' : 'listening');
    pump(L);
  }

  /** This device's recognizer takes over the listen (same callbacks); the owner says it again. */
  function fallback(L, reason) {
    if (L.ended || L.device) return;
    safeStopCapture(L);
    L.queue = [];
    if (L.inflight) safe(() => L.inflight.abort());
    L.inflight = null;
    emit(L, 'fallback', { reason });
    const o = L.o;
    // The owner already said "I'm done" (stop): nothing to listen for any more; the caller says why.
    if (L.stopping) {
      end(L);
      return;
    }
    try {
      L.device = stt.startListening({
        ...o,
        onPartial: (...a) => call(o.onPartial, ...a),
        onFinal: (...a) => call(o.onFinal, ...a),
        onError: (...a) => call(o.onError, ...a),
        onEnd: () => end(L),
      });
    } catch (err) {
      call(o.onError, { code: 'other', message: (err && err.message) || 'Voice input stopped unexpectedly. Please try again.' });
      end(L);
    }
  }

  function stop(L) {
    if (L.ended) return;
    if (L.device) {
      safe(() => L.device.stop());
      return;
    }
    if (L.stopping) return;
    L.stopping = true;
    const ev = L.vad ? L.vad.finish() : null;
    safeStopCapture(L);
    if (ev && ev.type === 'end') utterance(L, { ...ev, reason: 'stop' });
    // Nothing said, or nothing waiting on the home base: done now (never inside stop() itself).
    if (!L.inflight && !L.queue.length) Promise.resolve().then(() => end(L));
  }

  function abort(L) {
    if (L.ended) return;
    if (L.device) {
      safe(() => L.device.abort());
      return;
    }
    L.queue = [];
    if (L.inflight) safe(() => L.inflight.abort());
    L.inflight = null;
    safeStopCapture(L);
    L.ended = true; // nothing more is delivered
    Promise.resolve().then(() => finish(L));
  }

  function safeStopCapture(L) {
    if (L.port) {
      safe(() => {
        L.port.onmessage = null;
        L.port.close();
      });
      L.port = null;
    }
    if (L.live || current === L) safe(() => capture && capture.stop());
    L.live = false;
  }

  function end(L) {
    if (L.ended && L.endSent) return;
    L.ended = true;
    finish(L);
  }

  function finish(L) {
    if (L.endSent) return;
    L.endSent = true;
    safeStopCapture(L);
    if (current === L) current = null;
    emit(L, 'idle');
    call(L.o.onEnd);
  }

  return {
    ...stt,
    startListening,
    /** The listen under way hears through the home base (not this device's recognizer). */
    hearingViaHomeBase: () => !!current && !current.ended && !current.device,
  };
}
