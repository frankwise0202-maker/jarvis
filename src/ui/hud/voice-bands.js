// Voice bands for the Living Core (SPEC 2.4.13 "What drives the voice band"): the microphone feeds
// one AnalyserNode (fftSize 512, smoothing 0.6); its spectrum is split into 8 bands spaced on a
// log scale from 100 Hz to 4 kHz, −90…−30 dB maps to 0…1, each band rises in 50 ms and falls in
// 250 ms, and the result is pushed at most 30 times a second through one preallocated array:
//
//   const mic = createMicBands({ onBands: (b) => core.setBands(b), onState: (s) => … });
//   await mic.start();   // 'live' (true) or 'error' (false: keep the synthetic envelope)
//   mic.stop();          // releases the mic and closes the audio context; onBands(null)
//
// Privacy (SPEC 2.4.20 rule 7): the mic is released at once when the page is hidden or closed
// (visibilitychange / pagehide), well within the 500 ms the spec allows, and onState reports
// 'live' / 'off' so a LIVE pill shows the whole time a track is live. Nothing is recorded or sent.
// At most one AnalyserNode per instance, and the caller runs it only while Voice Mode listens.
//
// The pure helpers (bandEdges, bandBins, dbToUnit, computeBands, smoothBands) are unit-tested.

export const BAND_COUNT = 8;
export const FFT_SIZE = 512;
export const MIN_HZ = 100;
export const MAX_HZ = 4000;
export const DB_FLOOR = -90;
export const DB_CEIL = -30;
export const RISE_MS = 50;
export const FALL_MS = 250;
export const PUSH_MS = 1000 / 30;

/** Band edges in Hz, log-spaced: count + 1 values from minHz to maxHz. */
export function bandEdges(count = BAND_COUNT, minHz = MIN_HZ, maxHz = MAX_HZ) {
  const edges = new Float32Array(count + 1);
  for (let i = 0; i <= count; i++) edges[i] = minHz * Math.pow(maxHz / minHz, i / count);
  return edges;
}

/**
 * FFT bin ranges [lo, hi) per band for an analyser (fftSize, sampleRate). Every band gets at least
 * one bin (the lowest bands share bins at fftSize 512: 93.75 Hz each at 48 kHz).
 */
export function bandBins(fftSize = FFT_SIZE, sampleRate = 48000, count = BAND_COUNT, minHz = MIN_HZ, maxHz = MAX_HZ) {
  const binHz = sampleRate / fftSize;
  const nBins = fftSize / 2;
  const edges = bandEdges(count, minHz, maxHz);
  const lo = new Uint16Array(count);
  const hi = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    let a = Math.floor(edges[i] / binHz);
    let b = Math.ceil(edges[i + 1] / binHz);
    a = Math.max(1, Math.min(nBins - 1, a));
    b = Math.max(a + 1, Math.min(nBins, b));
    lo[i] = a;
    hi[i] = b;
  }
  return { lo, hi, binHz };
}

/** −90…−30 dB → 0…1 (clamped; silence and -Infinity are 0). */
export function dbToUnit(db, floor = DB_FLOOR, ceil = DB_CEIL) {
  if (!(db > floor)) return 0;
  if (db >= ceil) return 1;
  return (db - floor) / (ceil - floor);
}

/** Mean level (dB) per band → 0…1, written into `out` (no allocation). */
export function computeBands(freqDb, bins, out) {
  const n = out.length;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let count = 0;
    for (let k = bins.lo[i]; k < bins.hi[i]; k++) {
      const v = freqDb[k];
      sum += v > -200 ? v : -200; // -Infinity (silence) counts as very quiet, never NaN
      count++;
    }
    out[i] = count ? dbToUnit(sum / count) : 0;
  }
  return out;
}

/** One smoothing step in place: each band rises with a 50 ms and falls with a 250 ms time constant. */
export function smoothBands(cur, target, dtMs, riseMs = RISE_MS, fallMs = FALL_MS) {
  const up = 1 - Math.exp(-dtMs / riseMs);
  const down = 1 - Math.exp(-dtMs / fallMs);
  for (let i = 0; i < cur.length; i++) {
    const t = target[i];
    cur[i] += (t - cur[i]) * (t > cur[i] ? up : down);
  }
  return cur;
}

/**
 * @param {{ onBands?: (bands: Float32Array | null) => void, onState?: (state: 'live'|'off'|'error', err?: any) => void,
 *           getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>, AudioContextCtor?: any }} o
 */
export function createMicBands(o = {}) {
  const onBands = typeof o.onBands === 'function' ? o.onBands : () => {};
  const onState = typeof o.onState === 'function' ? o.onState : () => {};
  const gum = typeof o.getUserMedia === 'function'
    ? o.getUserMedia
    : (c) => (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? navigator.mediaDevices.getUserMedia(c) : Promise.reject(new Error('getUserMedia unavailable')));
  const AC = o.AudioContextCtor || (typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null);

  let stream = null;
  let ctx = null;
  let source = null;
  let analyser = null;
  let freq = null;
  let bins = null;
  const raw = new Float32Array(BAND_COUNT);
  const out = new Float32Array(BAND_COUNT);
  let raf = 0;
  let last = 0;
  let live = false;
  let starting = null;
  let generation = 0;
  let destroyed = false;

  const onHidden = () => {
    if (document.hidden) stop();
  };
  const onPageHide = () => stop();

  function tick(now) {
    raf = 0;
    if (!live || !analyser) return;
    raf = requestAnimationFrame(tick);
    if (last && now - last < PUSH_MS - 1) return;
    const dt = last ? Math.min(200, now - last) : PUSH_MS;
    last = now;
    analyser.getFloatFrequencyData(freq);
    computeBands(freq, bins, raw);
    smoothBands(out, raw, dt);
    onBands(out);
  }

  /** Open the mic and start pushing bands. Resolves true when live. */
  function start() {
    if (destroyed) return Promise.resolve(false);
    if (live) return Promise.resolve(true);
    if (starting) return starting;
    if (typeof document !== 'undefined' && document.hidden) return Promise.resolve(false);
    if (!AC) {
      onState('error', new Error('Web Audio unavailable'));
      return Promise.resolve(false);
    }
    const gen = ++generation;
    starting = (async () => {
      try {
        const s = await gum({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
        if (gen !== generation || destroyed || (typeof document !== 'undefined' && document.hidden)) {
          for (const t of s.getTracks()) t.stop(); // stopped (or hidden) while the prompt was up
          return false;
        }
        stream = s;
        ctx = new AC();
        source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        freq = new Float32Array(analyser.frequencyBinCount);
        bins = bandBins(FFT_SIZE, ctx.sampleRate);
        out.fill(0);
        for (const t of stream.getTracks()) t.addEventListener('ended', () => stop());
        if (ctx.state === 'suspended' && typeof ctx.resume === 'function') ctx.resume().catch(() => {});
        live = true;
        last = 0;
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('pagehide', onPageHide);
        onState('live');
        raf = requestAnimationFrame(tick);
        return true;
      } catch (err) {
        if (gen === generation) onState('error', err);
        release();
        return false;
      } finally {
        if (gen === generation) starting = null;
      }
    })();
    return starting;
  }

  function release() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    try {
      if (source) source.disconnect();
    } catch {
      /* already disconnected */
    }
    source = null;
    analyser = null;
    if (ctx && typeof ctx.close === 'function') ctx.close().catch(() => {});
    ctx = null;
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHidden);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
  }

  /** Release the mic now (also cancels a start still waiting for permission). */
  function stop() {
    generation++;
    starting = null;
    const was = live;
    live = false;
    release();
    if (was) {
      onBands(null);
      onState('off');
    }
  }

  return {
    start,
    stop,
    isLive: () => live,
    destroy() {
      stop();
      destroyed = true;
    },
  };
}
