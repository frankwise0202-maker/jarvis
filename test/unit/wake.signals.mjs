// Synthetic sounds for the Standby detectors (Node and the E2E fake microphone): hand claps, finger
// snaps, speech-like syllables, music with drums, knocks, footsteps, a door slam, room noise and a
// "recorded-style" room take (room tone + hum, claps through a simple room response, speech before
// and after). Deterministic: every generator takes a seeded random source. Mono Float32Array,
// default 16 kHz, peak levels in dBFS.

export const RATE = 16000;

/** A seeded uniform random source (mulberry32). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Roughly Gaussian noise (sum of uniforms). */
export function gauss(rand) {
  return (rand() + rand() + rand() + rand() - 2) * 1.2247;
}

export const db = (v) => 10 ** (v / 20);

function biquad(type, freq, rate, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * freq) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0;
  let b1;
  let b2;
  if (type === 'highpass') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha]; // bandpass (constant 0 dB peak)
  const a0 = 1 + alpha;
  const f = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0 };
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  return (x) => {
    const y = f.b0 * x + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    return y;
  };
}

/** Filter a whole signal (in place) through biquads in series: [['highpass', 800], …]. */
export function filter(x, stages, rate = RATE) {
  for (const [type, freq, q] of stages) {
    const f = biquad(type, freq, rate, q);
    for (let i = 0; i < x.length; i++) x[i] = f(x[i]);
  }
  return x;
}

/** Scale so the peak is `peakDb` dBFS. */
export function normalize(x, peakDb) {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m > 0) {
    const g = db(peakDb) / m;
    for (let i = 0; i < x.length; i++) x[i] *= g;
  }
  return x;
}

export function silence(seconds, rate = RATE) {
  return new Float32Array(Math.round(seconds * rate));
}

/** Add `src` into `dst` at `seconds` (clipped to dst). Returns dst. */
export function mixAt(dst, src, seconds, rate = RATE, gain = 1) {
  const start = Math.round(seconds * rate);
  for (let i = 0; i < src.length && start + i < dst.length; i++) if (start + i >= 0) dst[start + i] += src[i] * gain;
  return dst;
}

/** Pink-ish room noise (white noise through a gentle low-pass cascade), RMS `rmsDb` dBFS. */
export function roomNoise(seconds, { rmsDb = -60, seed = 7, hum = false, rate = RATE } = {}) {
  const rand = rng(seed);
  const x = new Float32Array(Math.round(seconds * rate));
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < x.length; i++) {
    const w = gauss(rand);
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    x[i] = b0 + b1 + b2 + w * 0.1848;
    if (hum) x[i] += 0.6 * Math.sin((2 * Math.PI * 60 * i) / rate) + 0.25 * Math.sin((2 * Math.PI * 120 * i) / rate);
  }
  let s = 0;
  for (const v of x) s += v * v;
  const g = db(rmsDb) / Math.sqrt(s / x.length);
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
}

/** A hand clap: a broadband burst (mostly 0.8–5 kHz), 0.3 ms attack, ~6 ms decay, a faint room tail. */
export function clap({ peakDb = -12, tau = 0.006, tail = 0.12, tailTau = 0.08, seed = 11, rate = RATE, low = 800, high = 5000 } = {}) {
  const rand = rng(seed);
  const n = Math.round(0.45 * rate);
  const burst = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = t < 0.0003 ? t / 0.0003 : Math.exp(-(t - 0.0003) / tau);
    burst[i] = gauss(rand) * env;
  }
  filter(burst, [['highpass', low], ['highpass', low], ['lowpass', high]], rate);
  const tailSig = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    tailSig[i] = t < 0.004 ? 0 : gauss(rand) * Math.exp(-(t - 0.004) / tailTau);
  }
  filter(tailSig, [['highpass', 300], ['lowpass', 3500]], rate);
  normalize(burst, 0);
  normalize(tailSig, 0);
  for (let i = 0; i < n; i++) burst[i] += tailSig[i] * tail;
  return normalize(burst, peakDb);
}

/** A finger snap: higher and shorter than a clap, with a little ring near 2.5 kHz. */
export function snap({ peakDb = -16, seed = 13, rate = RATE } = {}) {
  const rand = rng(seed);
  const n = Math.round(0.3 * rate);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = t < 0.0002 ? t / 0.0002 : Math.exp(-(t - 0.0002) / 0.003);
    x[i] = gauss(rand) * env + 0.6 * Math.sin(2 * Math.PI * 2500 * t) * Math.exp(-t / 0.006);
  }
  filter(x, [['highpass', 1400], ['highpass', 1400], ['lowpass', 7000]], rate);
  // a faint room tail
  const tailRand = rng(seed + 1);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    x[i] += t < 0.003 ? 0 : 0.02 * gauss(tailRand) * Math.exp(-(t - 0.003) / 0.06);
  }
  return normalize(x, peakDb);
}

/**
 * Speech-like sound: words of 1–3 syllables; a syllable is an optional consonant (a plosive burst
 * straight into its vowel, or a hissy fricative) and a voiced vowel (harmonics of a 95–210 Hz voice
 * through three formants), with natural pauses between words.
 */
export function speechLike({ seconds = 4, peakDb = -14, seed = 21, rate = RATE, f0 = 120 } = {}) {
  const rand = rng(seed);
  const x = new Float32Array(Math.round(seconds * rate));
  let t = 0.05;
  const formants = [
    [700, 1200, 2500],
    [400, 2000, 2600],
    [300, 900, 2300],
    [550, 1700, 2500],
    [650, 1000, 2400],
  ];
  while (t < seconds - 0.4) {
    const syllables = 1 + Math.floor(rand() * 3);
    for (let s = 0; s < syllables && t < seconds - 0.3; s++) {
      const kind = rand();
      if (kind < 0.35) {
        // plosive: a 6–10 ms burst, then the vowel at once
        const len = Math.round((0.006 + rand() * 0.004) * rate);
        const burst = new Float32Array(len);
        for (let i = 0; i < len; i++) burst[i] = gauss(rand) * Math.exp(-i / (len / 2));
        filter(burst, [['highpass', 1500]], rate);
        mixAt(x, burst, t, rate, 0.5);
        t += len / rate;
      } else if (kind < 0.55) {
        // fricative: 60–120 ms of hiss
        const len = Math.round((0.06 + rand() * 0.06) * rate);
        const hiss = new Float32Array(len);
        for (let i = 0; i < len; i++) {
          const u = i / len;
          hiss[i] = gauss(rand) * Math.sin(Math.PI * u);
        }
        filter(hiss, [['highpass', 3000]], rate);
        mixAt(x, hiss, t, rate, 0.25);
        t += len / rate;
      }
      // vowel: 110–240 ms
      const len = Math.round((0.11 + rand() * 0.13) * rate);
      const v = new Float32Array(len);
      const pitch = f0 * (0.85 + rand() * 0.35);
      const [fa, fb, fc] = formants[Math.floor(rand() * formants.length)];
      for (let i = 0; i < len; i++) {
        const tt = i / rate;
        const u = i / len;
        const env = Math.min(1, u / 0.12) * Math.min(1, (1 - u) / 0.2);
        let s = 0;
        const p = pitch * (1 + 0.04 * Math.sin(2 * Math.PI * 5 * tt));
        for (let h = 1; h <= 24; h++) {
          const fh = p * h;
          if (fh > 7500) break;
          const g = Math.exp(-(((fh - fa) / 150) ** 2)) + 0.5 * Math.exp(-(((fh - fb) / 200) ** 2)) + 0.25 * Math.exp(-(((fh - fc) / 250) ** 2)) + 0.02;
          s += g * Math.sin(2 * Math.PI * fh * tt + h);
        }
        v[i] = s * env;
      }
      mixAt(x, v, t, rate, 0.4);
      t += len / rate + 0.02 + rand() * 0.06;
    }
    t += 0.12 + rand() * 0.2; // between words
  }
  return normalize(x, peakDb);
}

/** Music: sustained chords and bass with a drum kit (kick, snare, hi-hat) at `bpm`. */
export function musicLike({ seconds = 6, bpm = 100, peakDb = -10, seed = 31, rate = RATE, drums = true, chords = true } = {}) {
  const rand = rng(seed);
  const x = new Float32Array(Math.round(seconds * rate));
  const beat = 60 / bpm;
  const prog = [
    [220, 277.18, 329.63],
    [196, 246.94, 293.66],
    [174.61, 220, 261.63],
    [196, 246.94, 329.63],
  ];
  if (chords) {
    for (let i = 0; i < x.length; i++) {
      const t = i / rate;
      const bar = Math.floor(t / (beat * 4)) % prog.length;
      let s = 0;
      for (const f of prog[bar]) for (let h = 1; h <= 4; h++) s += (0.5 / h) * Math.sin(2 * Math.PI * f * h * t);
      s += 0.6 * Math.sin(2 * Math.PI * (prog[bar][0] / 2) * t);
      x[i] += s * 0.08;
    }
  }
  if (drums) {
    for (let k = 0; k * beat < seconds; k++) {
      const t0 = k * beat;
      // kick on 1 and 3, snare on 2 and 4
      const len = Math.round(0.25 * rate);
      const hit = new Float32Array(len);
      if (k % 2 === 0) {
        for (let i = 0; i < len; i++) {
          const t = i / rate;
          hit[i] = Math.sin(2 * Math.PI * (55 + 60 * Math.exp(-t / 0.03)) * t) * Math.exp(-t / 0.09);
        }
        mixAt(x, hit, t0, rate, 0.9);
      } else {
        for (let i = 0; i < len; i++) {
          const t = i / rate;
          hit[i] = gauss(rand) * Math.exp(-t / 0.045) + 0.5 * Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.03);
        }
        filter(hit, [['highpass', 180]], rate);
        mixAt(x, hit, t0, rate, 0.45);
      }
      // hi-hat on the eighths
      for (const off of [0, beat / 2]) {
        const hl = Math.round(0.06 * rate);
        const hh = new Float32Array(hl);
        for (let i = 0; i < hl; i++) hh[i] = gauss(rand) * Math.exp(-i / rate / 0.012);
        filter(hh, [['highpass', 6000]], rate);
        mixAt(x, hh, t0 + off, rate, 0.2);
      }
    }
  }
  return normalize(x, peakDb);
}

/** A door slammed shut: a low thump, a crack and a ringing frame. */
export function doorSlam({ peakDb = -8, seed = 41, rate = RATE } = {}) {
  const rand = rng(seed);
  const n = Math.round(0.9 * rate);
  const x = new Float32Array(n);
  const crack = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    x[i] = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-t / 0.15) + 0.35 * Math.sin(2 * Math.PI * 180 * t) * Math.exp(-t / 0.3);
    crack[i] = gauss(rand) * Math.exp(-t / 0.025);
  }
  filter(crack, [['highpass', 200], ['lowpass', 3000]], rate);
  normalize(crack, -6);
  for (let i = 0; i < n; i++) x[i] += crack[i];
  return normalize(x, peakDb);
}

/** Knocks on a wooden door: `count` knocks `gapMs` apart. */
export function knocks({ count = 3, gapMs = 230, peakDb = -14, seed = 51, rate = RATE } = {}) {
  const rand = rng(seed);
  const each = Math.round(0.2 * rate);
  const x = new Float32Array(Math.round(((count - 1) * gapMs) / 1000 * rate) + each);
  for (let k = 0; k < count; k++) {
    const hit = new Float32Array(each);
    for (let i = 0; i < each; i++) {
      const t = i / rate;
      hit[i] = Math.sin(2 * Math.PI * 250 * t) * Math.exp(-t / 0.02) + 0.6 * Math.sin(2 * Math.PI * 550 * t) * Math.exp(-t / 0.015) + 0.3 * Math.sin(2 * Math.PI * 900 * t) * Math.exp(-t / 0.012);
      hit[i] += 0.08 * gauss(rand) * Math.exp(-t / 0.001);
    }
    mixAt(x, hit, (k * gapMs) / 1000, rate);
  }
  return normalize(x, peakDb);
}

/** Footsteps on a floor: `count` steps `gapMs` apart. */
export function footsteps({ count = 4, gapMs = 550, peakDb = -16, seed = 61, rate = RATE } = {}) {
  const rand = rng(seed);
  const each = Math.round(0.25 * rate);
  const x = new Float32Array(Math.round(((count - 1) * gapMs) / 1000 * rate) + each);
  for (let k = 0; k < count; k++) {
    const hit = new Float32Array(each);
    const scuff = new Float32Array(each);
    for (let i = 0; i < each; i++) {
      const t = i / rate;
      hit[i] = Math.sin(2 * Math.PI * (60 + 30 * Math.exp(-t / 0.01)) * t) * Math.exp(-t / 0.04);
      scuff[i] = gauss(rand) * Math.exp(-t / 0.03);
    }
    filter(scuff, [['lowpass', 1000]], rate);
    normalize(scuff, -12);
    for (let i = 0; i < each; i++) hit[i] += scuff[i];
    mixAt(x, hit, (k * gapMs) / 1000, rate);
  }
  return normalize(x, peakDb);
}

/** A mouse or trackpad click: a sub-millisecond bright tick. */
export function click({ peakDb = -26, seed = 81, rate = RATE } = {}) {
  const rand = rng(seed);
  const n = Math.round(0.03 * rate);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = gauss(rand) * Math.exp(-(i / rate) / 0.0003);
  filter(x, [['highpass', 1500]], rate);
  return normalize(x, peakDb);
}

/** A metronome's woodblock click: a bright knock ringing near 2.4 kHz for ~40 ms. */
export function woodblock({ freq = 2400, tau = 0.012, peakDb = -16, seed = 1, rate = RATE } = {}) {
  const rand = rng(seed);
  const n = Math.round(0.15 * rate);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = t < 0.0005 ? t / 0.0005 : Math.exp(-t / tau);
    x[i] = env * (Math.sin(2 * Math.PI * freq * t) + 0.6 * Math.sin(2 * Math.PI * freq * 1.7 * t) + 0.3 * gauss(rand));
  }
  return normalize(x, peakDb);
}

/** A glass or a spoon on a plate: a tick, then a bright ring (a few partials) dying over ~0.1–0.3 s. */
export function glassClink({ freq = 3100, tau = 0.12, peakDb = -18, seed = 1, rate = RATE } = {}) {
  const rand = rng(seed);
  const n = Math.round(0.8 * rate);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const env = t < 0.0003 ? t / 0.0003 : Math.exp(-t / tau);
    x[i] = env * (Math.sin(2 * Math.PI * freq * t) + 0.5 * Math.sin(2 * Math.PI * freq * 2.31 * t) + 0.3 * Math.sin(2 * Math.PI * freq * 3.9 * t)) + 0.4 * gauss(rand) * Math.exp(-t / 0.002);
  }
  return normalize(x, peakDb);
}

/** `count` sounds `gapMs` apart: gen(k) makes the k-th (a rhythm: clapping along, a metronome). */
export function beats(gapMs, count, gen, rate = RATE) {
  const x = new Float32Array(Math.round((((count - 1) * gapMs) / 1000 + 0.6) * rate));
  for (let k = 0; k < count; k++) mixAt(x, gen(k), (k * gapMs) / 1000, rate);
  return x;
}

/** Typing: keys (a press and a release ~70 ms later) in bursts, irregular, for `seconds`. */
export function typing({ seconds = 5, peakDb = -30, seed = 91, rate = RATE } = {}) {
  const rand = rng(seed);
  const x = new Float32Array(Math.round(seconds * rate));
  let t = 0.1;
  while (t < seconds - 0.2) {
    mixAt(x, click({ peakDb, seed: Math.floor(rand() * 1e6), rate }), t, rate);
    mixAt(x, click({ peakDb: peakDb - 6, seed: Math.floor(rand() * 1e6), rate }), t + 0.06 + rand() * 0.03, rate);
    t += rand() < 0.15 ? 0.6 + rand() * 0.8 : 0.12 + rand() * 0.22;
  }
  return x;
}

/** A simple room: the dry sound plus a few early reflections and a diffuse exponential tail. */
export function inRoom(dry, { rt60 = 0.45, wet = 0.25, seed = 71, rate = RATE } = {}) {
  const rand = rng(seed);
  const irLen = Math.round(rt60 * rate);
  const ir = new Float32Array(irLen);
  ir[0] = 1;
  for (const [ms, g] of [[7, 0.45], [13, 0.3], [21, 0.22], [29, 0.15]]) ir[Math.round((ms / 1000) * rate)] += g;
  const tau = rt60 / 6.9;
  for (let i = Math.round(0.03 * rate); i < irLen; i++) ir[i] += wet * gauss(rand) * Math.exp(-(i / rate) / tau) * 0.15;
  const out = new Float32Array(dry.length + irLen);
  // sparse IR: convolve only where it matters
  for (let j = 0; j < irLen; j++) {
    const g = ir[j];
    if (Math.abs(g) < 1e-4) continue;
    for (let i = 0; i < dry.length; i++) out[i + j] += dry[i] * g;
  }
  return out;
}

/**
 * A sound from across a room (a statistical room, independent of inRoom): the direct sound, three
 * early reflections, then a diffuse tail that decays 60 dB in `rt60` and carries `R` dB more energy
 * than the direct sound (R = 20·log10(distance / the room's critical distance): a living room's
 * critical distance is about 0.6–1 m, so R is about +6 dB at 1.5–2 m and +12 dB at 3–4 m).
 */
export function farField(dry, { rt60 = 0.5, R = 6, seed = 1, rate = RATE } = {}) {
  const rand = rng(seed);
  const n = Math.round(rt60 * 1.1 * rate);
  const ir = new Float32Array(n);
  const tauE = rt60 / Math.log(1e6); // the tail's energy time constant
  const start = Math.round(0.004 * rate);
  let e = 0;
  for (let i = start; i < n; i++) {
    const v = gauss(rand) * Math.exp(-(i - start) / rate / (2 * tauE));
    ir[i] = v;
    e += v * v;
  }
  const g = Math.sqrt(10 ** (R / 10) / e);
  for (let i = start; i < n; i++) ir[i] *= g;
  ir[0] += 1;
  for (const [ms, a] of [[3, 0.5], [6, 0.35], [11, 0.25]]) ir[Math.round((ms / 1000) * rate)] += a * Math.min(1, 10 ** (R / 20) / 2);
  // the dry sound's silent end is skipped (a clap is a few milliseconds long)
  let last = dry.length - 1;
  let peak = 0;
  for (const v of dry) peak = Math.max(peak, Math.abs(v));
  while (last > 0 && Math.abs(dry[last]) < peak * 1e-5) last--;
  const out = new Float32Array(last + 1 + n);
  for (let i = 0; i <= last; i++) {
    const x = dry[i];
    if (x === 0) continue;
    for (let j = 0; j < n; j++) out[i + j] += x * ir[j];
  }
  return out;
}

/** The energy after an impulse's first sample relative to it (dB): the R of a room model. */
export function reverbRatioDb(room) {
  const imp = new Float32Array(1);
  imp[0] = 1;
  const ir = room(imp);
  let rev = 0;
  for (let i = 1; i < ir.length; i++) rev += ir[i] * ir[i];
  return 10 * Math.log10(rev / (ir[0] * ir[0]));
}

/** Two claps `gapMs` apart (each with its own randomness), in `seconds` of signal. */
export function doubleClap({ gapMs = 420, at = 0.8, seconds = 2.4, peakDb = -12, second = null, seed = 11, snaps = false, rate = RATE } = {}) {
  const x = new Float32Array(Math.round(seconds * rate));
  const a = snaps ? snap({ peakDb, seed, rate }) : clap({ peakDb, seed, rate });
  const b = snaps ? snap({ peakDb: second ?? peakDb, seed: seed + 100, rate }) : clap({ peakDb: second ?? peakDb, seed: seed + 100, rate });
  mixAt(x, a, at, rate);
  mixAt(x, b, at + gapMs / 1000, rate);
  return x;
}

/**
 * The "recorded-style" fixture: 6 s in a living room. Room tone (pink noise at -58 dBFS) and mains
 * hum, someone talking (0.3–2.0 s), quiet, a double clap through the room (3.1 s and 3.52 s, a bit
 * uneven), quiet again, then a few words (5.0–5.8 s).
 */
export function recordedRoomTake({ seed = 3, rate = RATE } = {}) {
  const x = roomNoise(6, { rmsDb: -58, hum: true, seed, rate });
  mixAt(x, speechLike({ seconds: 1.7, peakDb: -20, seed: seed + 1, rate }), 0.3, rate);
  const a = inRoom(clap({ peakDb: -13, seed: seed + 2, rate }), { seed: seed + 3, rate });
  const b = inRoom(clap({ peakDb: -15, seed: seed + 4, rate, tau: 0.007 }), { seed: seed + 5, rate });
  mixAt(x, a, 3.1, rate);
  mixAt(x, b, 3.52, rate);
  mixAt(x, speechLike({ seconds: 0.8, peakDb: -21, seed: seed + 6, rate, f0: 105 }), 5.0, rate);
  return x;
}

/** Concatenate signals. */
export function concat(...parts) {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** Add room noise under a signal (in place), RMS `rmsDb`. */
export function withRoom(x, { rmsDb = -60, seed = 5, hum = false, rate = RATE } = {}) {
  const r = roomNoise(x.length / rate, { rmsDb, seed, hum, rate });
  for (let i = 0; i < x.length && i < r.length; i++) x[i] += r[i];
  return x;
}

/** Run a detector over a signal in 128-sample blocks (like an AudioWorklet); returns its events. */
export function runDetector(detector, x, block = 128) {
  const events = [];
  for (let i = 0; i < x.length; i += block) events.push(...detector.push(x.subarray(i, Math.min(x.length, i + block))));
  // silence after, so a pair at the very end can be confirmed (up to 1.35 s of quiet after its second
  // clap, judged 200 ms later)
  events.push(...detector.push(new Float32Array(Math.round(1.8 * RATE))));
  return events;
}

/** 16-bit PCM mono WAV bytes of a signal (fixtures). */
export function wavBytes(x, rate = RATE) {
  const n = x.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return buf;
}

/** A 16-bit PCM mono WAV -> { rate, samples: Float32Array in -1..1 }. */
export function readWav(bytes) {
  const b = Buffer.from(bytes);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file');
  let off = 12;
  let rate = 0;
  let bits = 0;
  let channels = 0;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      channels = b.readUInt16LE(off + 10);
      rate = b.readUInt32LE(off + 12);
      bits = b.readUInt16LE(off + 22);
    } else if (id === 'data') {
      if (bits !== 16 || channels !== 1) throw new Error('only 16-bit mono WAV');
      const n = Math.floor(size / 2);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = b.readInt16LE(off + 8 + i * 2) / 32768;
      return { rate, samples: out };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}
