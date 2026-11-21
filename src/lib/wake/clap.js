// Two claps (or two finger snaps) wake Jarvis from Standby. A streaming detector for 16 kHz mono
// audio, pure (no DOM, no Web Audio): the Standby AudioWorklet runs it on the microphone, the unit
// tests on synthetic claps, snaps, speech, music, knocks, footsteps and a door slam.
//
// What counts as a clap ("a transient"), from 5 ms frames of the signal:
//   - loud against the room: its peak frame is `rise` dB above the adaptive noise floor (the quiet
//     between sounds, tracked fast down and slowly up) and above an absolute minimum level;
//   - sudden: the 15–60 ms before it are at least 12 dB quieter than the peak;
//   - short: 15–50 ms after the peak the sound is at least 9 dB down, 50–120 ms after at least
//     15 dB down (or back within 9 dB of the floor), and it stays within 10 dB of its peak for 30 ms at most,
//     but for 3 ms at least (in 1 ms steps: the click of a mouse, a trackpad or a key is shorter);
//   - bright: at least a third of its energy above 1.5 kHz, at most half below 500 Hz (a knock on a
//     door, a footstep or a door slam is mostly low; a hand clap or a snap is mostly high).
// Speech fails "short" (a consonant runs into its vowel), music fails "sudden" or "short", or brings
// more beats (below), a knock or a step fails "bright", a slam fails "short" and "bright".
//
// What counts as "two claps": two transients 150–900 ms apart, of similar loudness (within 12 dB)
// and brightness, with no other transient in the 600 ms before the first or after the second (a
// third clap, applause, knocking, a drum beat: no), and a quiet background around them (the room
// busy above the floor less than 35% of the time: not in the middle of speech or music). The
// detection is reported 600 ms after the second clap, once nothing followed it.
//
//   const d = createClapDetector({ sampleRate: 16000, sensitivity: 'normal' });
//   for each block: for (const ev of d.push(samples)) if (ev.type === 'double') wake(ev);
//   events: { type: 'transient', at, level, bright } (every clap-like sound; tests and diagnostics)
//           { type: 'double', at, gapMs, levels: [a, b] }
//   d.setSensitivity('low' | 'normal' | 'high'); d.reset(); d.floorDb

export const CLAP_SENSITIVITY = Object.freeze({
  // rise: dB above the noise floor; minDb: the peak frame's absolute level (dBFS, mean square)
  low: Object.freeze({ rise: 24, minDb: -44 }),
  normal: Object.freeze({ rise: 18, minDb: -50 }),
  high: Object.freeze({ rise: 13, minDb: -58 }),
});
export const CLAP_SENSITIVITIES = Object.freeze(Object.keys(CLAP_SENSITIVITY));

export const CLAP = Object.freeze({
  frameMs: 5,
  minGapMs: 150,
  maxGapMs: 900,
  isolationMs: 600,
  preQuietDb: 12,
  decayEarlyDb: 9, // 15–50 ms after the peak
  decayLateDb: 15, // 50–120 ms after the peak
  maxLoudMs: 30, // within 10 dB of the peak
  minBodyMs: 3, // ... and at least this long (1 ms steps): a mouse, trackpad or key click is shorter
  matchDb: 12, // the two claps' peaks
  minBright: 0.33, // energy above 1.5 kHz / all
  maxLow: 0.5, // energy below 500 Hz / all
  maxBusy: 0.35, // share of frames well above the floor around the claps
});

const LOG10 = Math.log(10);
const toDb = (ms) => (10 * Math.log(ms + 1e-12)) / LOG10;

/** A biquad (RBJ cookbook) as coefficients; process with runBiquad. */
function biquad(type, freq, sampleRate, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * freq) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0;
  let b1;
  let b2;
  if (type === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
  } else {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = (1 - cos) / 2;
  }
  const a0 = 1 + alpha;
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
}

function runBiquad(f, x) {
  const y = f.b0 * x + f.b1 * f.x1 + f.b2 * f.x2 - f.a1 * f.y1 - f.a2 * f.y2;
  f.x2 = f.x1;
  f.x1 = x;
  f.y2 = f.y1;
  f.y1 = y;
  return y;
}

export function createClapDetector({ sampleRate = 16000, sensitivity = 'normal', onEvent = null } = {}) {
  const hop = Math.max(16, Math.round((sampleRate * CLAP.frameMs) / 1000)); // 80 samples at 16 kHz
  const frameMs = (hop / sampleRate) * 1000;
  const frames = (ms) => Math.max(1, Math.round(ms / frameMs));
  const HISTORY = frames(2400); // frames of energy kept: enough for the busy check around two claps
  const total = new Float32Array(HISTORY); // dB per frame, ring buffer
  const bright = new Float32Array(HISTORY); // share above 1.5 kHz
  const low = new Float32Array(HISTORY); // share below 500 Hz
  const floorAt = new Float32Array(HISTORY); // the noise floor when the frame was measured
  const subLen = Math.max(4, Math.round(sampleRate / 1000)); // 1 ms sub-frames (the body of a clap)
  const SUBS = Math.ceil(hop / subLen); // sub-frames per frame
  const sub = new Float32Array(HISTORY * SUBS); // dB per sub-frame, ring buffer by frame
  let subAcc = 0;
  let subN = 0;
  let subI = 0;
  let n = 0; // frames measured so far
  let hp1 = biquad('highpass', 1500, sampleRate);
  let hp2 = biquad('highpass', 1500, sampleRate);
  let lp1 = biquad('lowpass', 500, sampleRate);
  let lp2 = biquad('lowpass', 500, sampleRate);
  let acc = 0;
  let accHi = 0;
  let accLo = 0;
  let accN = 0;
  let floorDb = -70;
  let warm = 0; // frames seen (the floor settles during the first second)
  let sens = CLAP_SENSITIVITY[sensitivity] || CLAP_SENSITIVITY.normal;
  const transients = []; // { frame, level, bright } recent clap-like sounds, oldest first
  const others = []; // frames of loud sounds that are not claps (they break pairs)
  let pair = null; // { a, b, due } two claps waiting for the quiet after them
  let lastJudged = null; // the last peak's measurements (diagnostics)
  const pre = frames(60); // look back 60 ms before the peak
  const preNear = frames(15);
  const early0 = frames(15);
  const early1 = frames(50);
  const late1 = frames(120);
  const loudMax = frames(CLAP.maxLoudMs);
  const iso = frames(CLAP.isolationMs);
  const gapMin = frames(CLAP.minGapMs);
  const gapMax = frames(CLAP.maxGapMs);

  const at = (frame) => (frame % HISTORY + HISTORY) % HISTORY;
  const dbAt = (frame) => total[at(frame)];

  function reset() {
    n = 0;
    acc = accHi = accLo = accN = 0;
    subAcc = subN = subI = 0;
    hp1 = biquad('highpass', 1500, sampleRate);
    hp2 = biquad('highpass', 1500, sampleRate);
    lp1 = biquad('lowpass', 500, sampleRate);
    lp2 = biquad('lowpass', 500, sampleRate);
    floorDb = -70;
    warm = 0;
    transients.length = 0;
    others.length = 0;
    pair = null;
    lastJudged = null;
    total.fill(-120);
    sub.fill(-120);
  }
  reset();

  function emit(out, ev) {
    out.push(ev);
    if (typeof onEvent === 'function') {
      try {
        onEvent(ev);
      } catch {
        /* the listener's problem */
      }
    }
  }

  /** Mean of frames [from, to] (inclusive, relative frame numbers) in dB, by energy. */
  function meanDb(from, to) {
    let sum = 0;
    let k = 0;
    for (let f = from; f <= to; f++) {
      if (f < 0 || f >= n || n - f > HISTORY) continue;
      sum += 10 ** (dbAt(f) / 10);
      k++;
    }
    return k ? toDb(sum / k) : -120;
  }

  function frameDone(out) {
    const e = acc / accN;
    const db = toDb(e);
    const i = at(n);
    total[i] = db;
    bright[i] = e > 0 ? accHi / accN / e : 0;
    low[i] = e > 0 ? accLo / accN / e : 0;
    // The noise floor: down fast (about 50 ms), up slowly (about 3 s), never above a loud frame's
    // influence for long: a clap barely moves it.
    if (db < floorDb) floorDb += (db - floorDb) * 0.1;
    else floorDb += Math.min(db - floorDb, 30) * (warm < frames(1000) ? 0.02 : 0.0016);
    if (floorDb < -100) floorDb = -100;
    floorAt[i] = floorDb;
    warm++;
    n++;
    acc = accHi = accLo = accN = 0;
    judge(out);
  }

  function judge(out) {
    const now = n - 1; // the newest frame
    // A peak is judged once 120 ms have passed after it.
    const f = now - late1;
    if (f >= pre && warm > frames(300) && isLocalMax(f) && dbAt(f) - floorAt[at(f)] >= sens.rise) {
      const t = asClap(f);
      if (t) {
        transients.push(t);
        while (transients.length && f - transients[0].frame > HISTORY - late1) transients.shift();
        emit(out, { type: 'transient', at: (f * frameMs) / 1000, level: Math.round(t.level * 10) / 10, bright: Math.round(t.bright * 100) / 100 });
        considerPair(t);
      } else if (!inClap(f) && dbAt(f) - meanDb(f - pre, f - preNear) >= 6) {
        // A new loud sound that is not a clap (a word, a beat, a knock): it breaks a pair. (Not the
        // ripples of a sound dying away: those never rise above what came just before them.)
        noteOther(f);
      }
    }
    // A pair waiting for the quiet after its second clap.
    if (pair && now >= pair.due) {
      const p = pair;
      pair = null;
      if (quietAround(p)) {
        emit(out, { type: 'double', at: (p.b.frame * frameMs) / 1000, gapMs: Math.round((p.b.frame - p.a.frame) * frameMs), levels: [Math.round(p.a.level), Math.round(p.b.level)] });
        transients.length = 0; // a third clap later starts a new pair
      }
    }
  }

  /** The peak at frame f as a clap ({ frame, level, bright }), or null when it is not one. */
  function asClap(f) {
    const peak = dbAt(f);
    if (peak < sens.minDb) return null;
    const floor = floorAt[at(f)];
    const before = meanDb(f - pre, f - preNear);
    const early = meanDb(f + early0, f + early1);
    const late = meanDb(f + early1, f + late1);
    let loud = 0;
    for (let k = f - 2; k <= f + loudMax + 2; k++) if (dbAt(k) >= peak - 10) loud++;
    // Brightness over the clap itself (the peak and the frame on either side, energy-weighted).
    let eSum = 0;
    let hiSum = 0;
    let loSum = 0;
    for (let k = f - 1; k <= f + 1; k++) {
      const ek = 10 ** (dbAt(k) / 10);
      eSum += ek;
      hiSum += ek * bright[at(k)];
      loSum += ek * low[at(k)];
    }
    const br = eSum > 0 ? hiSum / eSum : 0;
    const lo = eSum > 0 ? loSum / eSum : 1;
    // The body: 1 ms steps from the frame before the peak to two after, within 10 dB of the loudest.
    let subMax = -120;
    for (let k = f - 1; k <= f + 2; k++) for (let j = 0; j < SUBS; j++) subMax = Math.max(subMax, sub[at(k) * SUBS + j]);
    let body = 0;
    for (let k = f - 1; k <= f + 2; k++) for (let j = 0; j < SUBS; j++) if (sub[at(k) * SUBS + j] >= subMax - 10) body++;
    const bodyMs = (body * subLen * 1000) / sampleRate;
    const sudden = peak - before >= CLAP.preQuietDb;
    const short = peak - early >= CLAP.decayEarlyDb && (peak - late >= CLAP.decayLateDb || late - floor <= 9) && loud <= loudMax + 1 && bodyMs >= CLAP.minBodyMs;
    const isBright = br >= CLAP.minBright && lo <= CLAP.maxLow;
    lastJudged = { frame: f, peak, floor, before, early, late, loud, bodyMs, br, lo, sudden, short, isBright };
    return sudden && short && isBright ? { frame: f, level: peak, bright: br } : null;
  }

  /** Inside a clap already found (its own decay): not another sound. */
  function inClap(f) {
    for (let i = transients.length - 1; i >= 0; i--) {
      const d = f - transients[i].frame;
      if (d >= -2 && d <= late1) return true;
      if (d > late1) break;
    }
    return false;
  }

  function isLocalMax(f) {
    return dbAt(f) >= dbAt(f - 1) && dbAt(f) > dbAt(f + 1);
  }

  function noteOther(f) {
    others.push(f);
    while (others.length && f - others[0] > HISTORY) others.shift();
    if (pair && f > pair.a.frame - iso && f <= pair.b.frame + iso && !(f >= pair.b.frame - 2 && f <= pair.b.frame + late1)) pair.broken = true;
  }

  function considerPair(t) {
    // A new clap: a third one breaks a waiting pair.
    if (pair) {
      if (t.frame - pair.b.frame <= iso) {
        pair = null;
        return;
      }
    }
    const prev = transients.length >= 2 ? transients[transients.length - 2] : null;
    if (!prev) return;
    const gap = t.frame - prev.frame;
    if (gap < gapMin || gap > gapMax) return;
    // Nothing clap-like in the 600 ms before the first.
    const third = transients.length >= 3 ? transients[transients.length - 3] : null;
    if (third && prev.frame - third.frame <= iso) return;
    if (Math.abs(t.level - prev.level) > CLAP.matchDb) return;
    pair = { a: prev, b: t, due: t.frame + iso, broken: false };
  }

  /** No loud non-clap sound near the pair, and the room not busy around it. */
  function quietAround(p) {
    if (p.broken) return false;
    const own = (f) => (f >= p.a.frame - 2 && f <= p.a.frame + late1) || (f >= p.b.frame - 2 && f <= p.b.frame + late1);
    for (const f of others) if (f > p.a.frame - iso && f <= p.b.frame + iso && !own(f)) return false;
    // Busy: frames well above the floor, outside the two claps' own 120 ms.
    const from = p.a.frame - iso;
    const to = p.b.frame + iso;
    let busy = 0;
    let count = 0;
    for (let f = from; f <= to; f++) {
      if (f < 0 || n - f > HISTORY) continue;
      if (own(f)) continue;
      count++;
      if (dbAt(f) - floorAt[at(f)] >= 10) busy++;
    }
    return count === 0 || busy / count <= CLAP.maxBusy;
  }

  function push(samples) {
    const out = [];
    if (!samples) return out;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i];
      const hi = runBiquad(hp2, runBiquad(hp1, x));
      const lo = runBiquad(lp2, runBiquad(lp1, x));
      acc += x * x;
      accHi += hi * hi;
      accLo += lo * lo;
      accN++;
      subAcc += x * x;
      subN++;
      if (subN === subLen || accN === hop) {
        if (subI < SUBS) sub[at(n) * SUBS + subI] = toDb(subAcc / subN);
        subI++;
        subAcc = 0;
        subN = 0;
      }
      if (accN === hop) {
        while (subI < SUBS) sub[at(n) * SUBS + subI++] = -120;
        subI = 0;
        frameDone(out);
      }
    }
    return out;
  }

  return {
    push,
    reset,
    setSensitivity(value) {
      sens = CLAP_SENSITIVITY[value] || CLAP_SENSITIVITY.normal;
    },
    get floorDb() {
      return floorDb;
    },
    get frameMs() {
      return frameMs;
    },
    /** The last loud peak's measurements (diagnostics and tests). */
    get lastJudged() {
      return lastJudged;
    },
  };
}
