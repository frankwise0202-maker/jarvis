// Web Audio output for the natural voice.
//
//   const out = createAudioOut();
//   out.unlock()                     call inside a user gesture (iOS starts audio only there)
//   out.play(pcm, sampleRate, when)  -> { when, duration, stop() }   exact start on the audio clock
//   out.now()                        the audio clock (seconds); it stops while the context is
//                                    suspended, so captions never run ahead of the voice
//   out.latency()                    seconds between the clock and the speaker (best effort)
//   out.level()                      0..1 loudness of what is playing now (for setLevel())
//   out.bands(outArray)              8 bands, 100 Hz–4 kHz on a log scale, −90…−30 dB -> 0…1
//                                    (the Living Core v2 voice band, report §2.4.13)
//   out.stopAll(), out.busy(), out.ready(), out.close()
//   out.kick()                       v7.8.1: the clock stopped while audio waits to play (natural-stream.js's
//                                    watchdog): resume the context; one that says it runs is suspended and
//                                    resumed (iOS can report 'running' with its clock stopped). Never throws.
//   out.revive()                     v7.8.1: inside a tap, for an output known stuck (voice-router.js): the
//                                    stuck context is closed and a fresh one made and started in the tap,
//                                    as at the very first unlock
//   out.probe()                      v7.8.1: outside a tap, while replies avoid this stuck output: kick it
//                                    (no sound) and let it idle-suspend as usual, so the next reply can see
//                                    whether its clock moves
//
// Chain: every chunk is an AudioBufferSourceNode -> one GainNode -> one AnalyserNode
// (fftSize 512, smoothing 0.6) -> destination. Chunks are scheduled back to back on the audio
// clock, so there is no gap and no timer jitter between sentences.
//
// iOS: Web Audio follows the ring/silent switch unless the page's audio session is 'playback'
// (navigator.audioSession, Safari 16.4+). speechSynthesis does not, so without this the natural
// voice would go quiet where the device voice speaks. The session is set to 'playback' while the
// voice plays and back to 'auto' once it has been idle for a moment (so the microphone can take
// over for Voice Mode's next turn).

export const BAND_COUNT = 8;
const BAND_LOW_HZ = 100;
const BAND_HIGH_HZ = 4000;
const DB_FLOOR = -90;
const DB_CEIL = -30;
const IDLE_SUSPEND_MS = 30000;
const SESSION_RELEASE_MS = 400;

/** Edges of the 8 log-spaced bands in Hz (9 numbers). */
export function bandEdges(count = BAND_COUNT, low = BAND_LOW_HZ, high = BAND_HIGH_HZ) {
  const out = [];
  for (let i = 0; i <= count; i++) out.push(low * (high / low) ** (i / count));
  return out;
}

/**
 * For each band, the FFT bin range [from, to) whose centre frequencies fall inside it; a band
 * narrower than one bin gets the nearest bin.
 */
export function bandBins(sampleRate, fftSize, count = BAND_COUNT) {
  const binHz = sampleRate / fftSize;
  const bins = fftSize / 2;
  const edges = bandEdges(count);
  const out = [];
  for (let i = 0; i < count; i++) {
    let from = Math.ceil(edges[i] / binHz);
    let to = Math.ceil(edges[i + 1] / binHz);
    if (to <= from) {
      from = Math.min(bins - 1, Math.round(Math.sqrt(edges[i] * edges[i + 1]) / binHz));
      to = from + 1;
    }
    out.push([Math.max(0, from), Math.min(bins, to)]);
  }
  return out;
}

/** Fill `out` (length 8) from analyser dB data: mean dB per band mapped −90…−30 dB -> 0…1. */
export function bandsFromDb(db, ranges, out) {
  for (let i = 0; i < ranges.length; i++) {
    const [from, to] = ranges[i];
    let sum = 0;
    let n = 0;
    for (let k = from; k < to; k++) {
      const v = db[k];
      sum += Number.isFinite(v) ? v : DB_FLOOR;
      n++;
    }
    const mean = n ? sum / n : DB_FLOOR;
    out[i] = Math.min(1, Math.max(0, (mean - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
  }
  return out;
}

/** RMS of a time-domain block mapped −50…−10 dBFS -> 0…1. */
export function levelFromSamples(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  if (rms <= 1e-6) return 0;
  const db = 20 * Math.log10(rms);
  return Math.min(1, Math.max(0, (db + 50) / 40));
}

export function createAudioOut({ AudioContextImpl, scope = globalThis, idleSuspendMs = IDLE_SUSPEND_MS } = {}) {
  const Ctor = AudioContextImpl || scope.AudioContext || scope.webkitAudioContext || null;
  let ctx = null;
  let gain = null;
  let analyser = null;
  let freq = null;
  let time = null;
  let ranges = null;
  const live = new Set();
  let idleTimer = 0;
  let sessionTimer = 0;
  let watching = false;
  // v7.8.1: our own idle suspend is still landing. WebKit sets `state` only once it has, so a play() in
  // that window would see 'running', skip resume(), and the suspend would then stop the clock under it.
  let suspending = false;

  function supported() {
    return typeof Ctor === 'function';
  }

  function ensure() {
    if (ctx) return ctx;
    if (!supported()) return null;
    try {
      ctx = new Ctor({ sampleRate: 24000, latencyHint: 'interactive' }); // the model's rate: no resampling per chunk
    } catch {
      ctx = new Ctor(); // a browser that refuses 24 kHz contexts: the buffers are resampled
    }
    gain = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.6;
    gain.connect(analyser);
    analyser.connect(ctx.destination);
    freq = new Float32Array(analyser.frequencyBinCount);
    time = new Float32Array(analyser.fftSize);
    ranges = bandBins(ctx.sampleRate, analyser.fftSize);
    watchVisibility();
    return ctx;
  }

  function watchVisibility() {
    if (watching) return;
    watching = true;
    try {
      const d = scope.document;
      if (d && typeof d.addEventListener === 'function') {
        d.addEventListener('visibilitychange', () => {
          // iOS interrupts audio in the background; carry on where the clock stopped.
          if (!d.hidden && ctx && ctx.state !== 'running' && live.size) resume();
        });
      }
    } catch {
      /* ignore */
    }
  }

  function setSession(type) {
    try {
      const s = scope.navigator && scope.navigator.audioSession;
      if (s && s.type !== type) s.type = type;
    } catch {
      /* not supported */
    }
  }

  function resume() {
    try {
      const p = ctx && ctx.resume ? ctx.resume() : null;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  /** Inside a user gesture: create/resume the context and play one silent frame (iOS unlock). */
  function unlock() {
    const c = ensure();
    if (!c) return false;
    setSession('playback');
    resume();
    try {
      const b = c.createBuffer(1, 1, c.sampleRate);
      const s = c.createBufferSource();
      s.buffer = b;
      s.connect(c.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
    releaseSessionSoon();
    return true;
  }

  /**
   * v7.8.1: the clock hasn't moved while a chunk waits to play (an audio interruption, a route change, the
   * microphone holding the audio session, a context never unlocked by a tap): try to start it once more. A
   * context that says it is running but whose clock stopped (iOS) is suspended and resumed.
   */
  function kick() {
    if (!ctx) return false;
    setSession('playback');
    try {
      if (ctx.state === 'running' && typeof ctx.suspend === 'function') {
        const p = ctx.suspend();
        if (p && typeof p.then === 'function') p.then(resume, resume);
        else resume();
      } else resume();
    } catch {
      resume();
    }
    return true;
  }

  /**
   * v7.8.1: inside a tap, for an output the router knows is stuck (its clock stopped during a reply and the
   * watchdog's kick didn't start it; iOS can leave a context that says it runs with its clock stopped, and
   * lets audio start only in a gesture). A resume() inside the tap does nothing to a context that says it
   * runs. So, all inside this tap: the stuck context is suspended and resumed (the lighter cure, should the
   * audio session need just that), then closed, and a fresh one is made and started, as at the very first
   * unlock. Nothing of ours plays on it meanwhile: replies avoid a stuck output. Never throws.
   */
  function revive() {
    if (!supported()) return false;
    const quiet = (p) => {
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    try {
      const old = ctx;
      if (old) {
        try {
          if (old.state === 'running' && typeof old.suspend === 'function') quiet(old.suspend());
          if (typeof old.resume === 'function') quiet(old.resume());
        } catch {
          /* closed below anyway */
        }
        close();
      }
      return unlock();
    } catch {
      return false;
    }
  }

  /**
   * v7.8.1: outside a tap, while the router keeps replies off this stuck output: ask it to run again (no
   * sound), as the watchdog's kick does, then let it idle-suspend as usual, so the next reply can see whether
   * its clock moves (the sound came back: an interruption ended, a Mac's output device returned).
   */
  function probe() {
    if (!ctx) return false;
    kick();
    if (!live.size) idleSoon();
    return true;
  }

  function ready() {
    return !!ctx && ctx.state === 'running';
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function latency() {
    if (!ctx) return 0;
    const v = Number(ctx.outputLatency) || Number(ctx.baseLatency) || 0;
    return Number.isFinite(v) && v > 0 && v < 1 ? v : 0;
  }

  function play(pcm, sampleRate, when) {
    const c = ensure();
    if (!c) throw new Error('Web Audio is not available.');
    clearTimeout(idleTimer);
    clearTimeout(sessionTimer);
    setSession('playback');
    if (c.state !== 'running' || suspending) resume(); // v7.8.1: also while our own idle suspend is landing
    const buffer = c.createBuffer(1, pcm.length, sampleRate);
    if (typeof buffer.copyToChannel === 'function') buffer.copyToChannel(pcm, 0);
    else buffer.getChannelData(0).set(pcm);
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.connect(gain);
    const at = Math.max(when, c.currentTime);
    src.start(at);
    live.add(src);
    const handle = {
      when: at,
      duration: pcm.length / sampleRate,
      stop() {
        try {
          src.stop();
        } catch {
          /* not started or already stopped */
        }
        forget();
      },
    };
    const forget = () => {
      if (!live.delete(src)) return;
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
      if (!live.size) idleSoon();
    };
    src.onended = forget;
    return handle;
  }

  function idleSoon() {
    releaseSessionSoon();
    clearTimeout(idleTimer);
    if (idleSuspendMs > 0) {
      idleTimer = setTimeout(() => {
        const c = ctx;
        if (!live.size && c && c.state === 'running' && typeof c.suspend === 'function') {
          suspending = true;
          const landed = () => {
            if (ctx !== c) return; // closed or replaced meanwhile
            suspending = false;
            if (live.size) resume(); // a chunk came while it landed: run again
          };
          try {
            const p = c.suspend();
            if (p && typeof p.then === 'function') p.then(landed, landed);
            else landed();
          } catch {
            suspending = false;
          }
        }
      }, idleSuspendMs);
    }
  }

  function releaseSessionSoon() {
    clearTimeout(sessionTimer);
    sessionTimer = setTimeout(() => {
      if (!live.size) setSession('auto');
    }, SESSION_RELEASE_MS);
  }

  function stopAll() {
    for (const src of Array.from(live)) {
      try {
        src.stop();
      } catch {
        /* ignore */
      }
      try {
        src.disconnect();
      } catch {
        /* ignore */
      }
      live.delete(src);
    }
    idleSoon();
  }

  function level() {
    if (!analyser || !live.size) return 0;
    analyser.getFloatTimeDomainData(time);
    return levelFromSamples(time);
  }

  function bands(out) {
    if (!analyser || !live.size) {
      out.fill(0);
      return out;
    }
    analyser.getFloatFrequencyData(freq);
    return bandsFromDb(freq, ranges, out);
  }

  function close() {
    stopAll();
    clearTimeout(idleTimer);
    clearTimeout(sessionTimer);
    setSession('auto');
    try {
      const p = ctx && typeof ctx.close === 'function' ? ctx.close() : null;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      /* ignore */
    }
    ctx = null;
    suspending = false;
  }

  return {
    supported,
    unlock,
    ready,
    now,
    latency,
    play,
    kick,
    revive,
    probe,
    stopAll,
    level,
    bands,
    close,
    busy: () => live.size > 0,
    get context() {
      return ctx;
    },
  };
}
