// Two claps (or two finger snaps) wake Jarvis from Standby. A streaming detector for 16 kHz mono
// audio, pure (no DOM, no Web Audio): the Standby AudioWorklet runs it on the microphone, the unit
// tests on synthetic claps, snaps, speech, music, knocks, footsteps, a door slam and claps from
// across a reverberant room.
//
// What counts as a clap ("a transient"), from 5 ms frames of the signal:
//   - loud against the room: its peak frame is `rise` dB above the adaptive noise floor (the quiet
//     between sounds, tracked fast down and slowly up) and above an absolute minimum level;
//   - sudden: the 15–60 ms before it are at least 12 dB quieter than the peak;
//   - bright: at least a third of its energy above 1.5 kHz, at most half below 500 Hz (a knock on a
//     door, a footstep or a door slam is mostly low; a hand clap or a snap is mostly high);
//   - a body of 3 ms at least (1 ms steps within 10 dB of the loudest: the click of a mouse, a
//     trackpad or a key is shorter);
//   - and then gone, one of two ways:
//     - short (a clap near the microphone): 15–50 ms after the peak at least 9 dB down, 50–120 ms
//       after at least 15 dB down (or back within 9 dB of the floor), within 10 dB of its peak for
//       30 ms at most;
//     - or dying away like a room's echo (a clap from across the room, where the room's
//       reverberation is as loud as the clap itself or louder): from 30 ms after the peak the sound
//       never comes back up, falls at least 5 dB per 100 ms (a room that takes up to about 1.2 s to go
//       quiet) until it is lost in the room's noise, starts no more than 3 dB above the clap, and is
//       noisy (a reverberant tail flickers from one millisecond to the next; a glass, a bell or a beep
//       rings smoothly). The onset is judged, not the tail's length: the farther away, the longer the
//       echo, and a sensitivity setting cannot change that.
// Speech fails "sudden", "bright" or the dying away (a consonant runs into its louder vowel), music
// fails "sudden" or dies into its own sustained notes (or brings more beats, below), a knock or a step
// fails "bright", a slam fails "bright" and "short".
//
// What counts as "two claps": two transients 150–900 ms apart, of similar loudness (within 12 dB),
// with no other transient in the 600 ms before the first or after the second (or 1.5 times their gap
// when that is longer, so a third clap in the same rhythm always cancels them: clapping along to
// music, a metronome, applause), no other loud onset there either (a word, a beat, a knock), and a
// quiet background around them (the room busy above the floor less than 35% of the time, the claps'
// own echoes aside: not in the middle of speech or music). Peaks within 50 ms of each other are one
// clap (its early reflections). The detection is reported once everything up to the end of the quiet
// after the second clap has been judged (each peak is judged 200 ms after it happens): 0.8–1.6 s after
// the second clap.
//
//   const d = createClapDetector({ sampleRate: 16000, sensitivity: 'normal' });
//   for each block: for (const ev of d.push(samples)) if (ev.type === 'double') wake(ev);
//   events: { type: 'transient', at, level, bright } (every clap-like sound; tests and diagnostics)
//           { type: 'double', at, gapMs, levels: [a, b] }
//   d.setSensitivity('low' | 'normal' | 'high'); d.reset(); d.floorDb; d.lastJudged

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
  isolationMs: 600, // nothing else this long before the first clap and after the second …
  isolationGap: 1.5, // … or this many times their gap, when that is longer
  mergeMs: 50, // peaks this close are one clap (early reflections)
  judgeMs: 200, // a peak is judged once this much has followed it (the echo's last window)
  preQuietDb: 12,
  decayEarlyDb: 9, // short: 15–50 ms after the peak
  decayLateDb: 15, // short: 50–120 ms after the peak
  maxLoudMs: 30, // short: within 10 dB of the peak
  minBodyMs: 3, // ... and at least this long (1 ms steps): a mouse, trackpad or key click is shorter
  roomDecayDb: 5, // a room's echo: at least this many dB per 100 ms (RT60 up to about 1.2 s)
  roomStartDb: 3, // ... starting no more than this above the clap itself
  roomRiseDb: 1.5, // ... never coming back up by more than this
  roomRoughDb: 1, // ... and noisy: its 1 ms energies wander at least this much (dB, RMS)
  nearFloorDb: 6, // an echo this close to the floor is over
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
  // Frames of energy kept: the longest pair (900 ms) with 1.5× its gap of quiet on both sides, judged.
  const HISTORY = frames(CLAP.maxGapMs * (1 + 2 * CLAP.isolationGap) + CLAP.judgeMs + 400);
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
  const transients = []; // { frame, level, bright, end } recent clap-like sounds, oldest first
  const others = []; // frames of loud sounds that are not claps (they break pairs)
  let pair = null; // { a, b, before, after, due } two claps waiting for the quiet after them
  let lastJudged = null; // the last peak's measurements (diagnostics)
  const judgeAt = frames(CLAP.judgeMs); // a peak is judged this many frames after it
  const pre = frames(60); // look back 60 ms before the peak
  const preNear = frames(15);
  const early0 = frames(15);
  const early1 = frames(50);
  const late1 = frames(120);
  const loudMax = frames(CLAP.maxLoudMs);
  const iso = frames(CLAP.isolationMs);
  const gapMin = frames(CLAP.minGapMs);
  const gapMax = frames(CLAP.maxGapMs);
  const merge = frames(CLAP.mergeMs);
  // The echo's windows after the peak: 30–50, 50–90, 90–140 and 140–200 ms ([first, last frame, centre ms]).
  const ECHO = [
    [frames(30), frames(50) - 1, 40],
    [frames(50), frames(90) - 1, 70],
    [frames(90), frames(140) - 1, 115],
    [frames(140), frames(200) - 1, 170],
  ];

  const at = (frame) => (frame % HISTORY + HISTORY) % HISTORY;
  const dbAt = (frame) => total[at(frame)];
  /** The quiet needed on each side of a pair `gap` frames apart. */
  const quietFor = (gap) => Math.max(iso, Math.round(CLAP.isolationGap * gap));

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
    // A peak is judged once 200 ms have passed after it (its echo's last window).
    const f = now - judgeAt;
    if (f >= pre && warm > frames(300) && isLocalMax(f) && dbAt(f) - floorAt[at(f)] >= sens.rise) {
      const t = asClap(f);
      const last = transients[transients.length - 1];
      if (t && last && f - last.frame <= merge) {
        // The same clap again (its early reflections): one clap, at its loudest.
        last.level = Math.max(last.level, t.level);
        last.end = Math.max(last.end, t.end);
      } else if (t) {
        transients.push(t);
        while (transients.length && f - transients[0].frame > HISTORY - judgeAt) transients.shift();
        emit(out, { type: 'transient', at: (f * frameMs) / 1000, level: Math.round(t.level * 10) / 10, bright: Math.round(t.bright * 100) / 100 });
        considerPair(t);
      } else if (!inClap(f) && dbAt(f) - meanDb(f - pre, f - preNear) >= 6) {
        // A new loud sound that is not a clap (a word, a beat, a knock): it breaks a pair. (Not the
        // ripples of a sound dying away: those never rise above what came just before them.)
        noteOther(f);
      }
    }
    // A pair waiting for the quiet after its second clap: reported once all of it has been judged.
    if (pair && now >= pair.due) {
      const p = pair;
      pair = null;
      if (quietAround(p)) {
        emit(out, { type: 'double', at: (p.b.frame * frameMs) / 1000, gapMs: Math.round((p.b.frame - p.a.frame) * frameMs), levels: [Math.round(p.a.level), Math.round(p.b.level)] });
        transients.length = 0; // a third clap later starts a new pair
      }
    }
  }

  /** The peak at frame f as a clap ({ frame, level, bright, end }), or null when it is not one. */
  function asClap(f) {
    const peak = dbAt(f);
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
    const isBright = br >= CLAP.minBright && lo <= CLAP.maxLow;
    const onset = peak >= sens.minDb && sudden && isBright && bodyMs >= CLAP.minBodyMs;
    const short = peak - early >= CLAP.decayEarlyDb && (peak - late >= CLAP.decayLateDb || late - floor <= 9) && loud <= loudMax + 1;
    const echo = onset && !short ? roomEcho(f, peak, floor) : null;
    // Where the clap is over (10 dB above the floor) within the judged 200 ms: its own decay.
    let end = f + judgeAt;
    for (let k = f + 1; k <= f + judgeAt; k++) {
      if (dbAt(k) - floorAt[at(k)] < 10) {
        end = k;
        break;
      }
    }
    const isClap = onset && (short || (!!echo && echo.ok));
    lastJudged = { frame: f, peak, floor, before, early, late, loud, bodyMs, br, lo, sudden, short, isBright, echo, isClap };
    return isClap ? { frame: f, level: peak, bright: br, end: Math.max(end, f + late1) } : null;
  }

  /**
   * After a sudden, bright onset that is not short: does the sound die away like a room's echo? The
   * windows 30–50, 50–90, 90–140 and 140–200 ms after the peak (energy means): never rising, falling
   * at least `roomDecayDb` per 100 ms (W0→W2 and W1→W3) unless already lost in the room's noise,
   * starting no more than `roomStartDb` above the peak, and noisy (1 ms energies over 30–90 ms).
   */
  function roomEcho(f, peak, floor) {
    const w = ECHO.map(([a, b]) => meanDb(f + a, f + b));
    const near = (v) => v - floor <= CLAP.nearFloorDb;
    const s1 = ((w[0] - w[2]) / (ECHO[2][2] - ECHO[0][2])) * 100;
    const s2 = ((w[1] - w[3]) / (ECHO[3][2] - ECHO[1][2])) * 100;
    let rises = false;
    for (let i = 1; i < w.length; i++) if (!near(w[i - 1]) && w[i] - w[i - 1] > CLAP.roomRiseDb) rises = true;
    // Roughness: how far the 1 ms energies wander around their 5 ms frame's (RMS, dB), where the
    // echo is still well above the floor.
    let rs = 0;
    let rn = 0;
    for (let k = f + ECHO[0][0]; k <= f + ECHO[1][1]; k++) {
      if (dbAt(k) - floorAt[at(k)] < 10) continue;
      let lin = 0;
      for (let j = 0; j < SUBS; j++) lin += 10 ** (sub[at(k) * SUBS + j] / 10);
      const mean = toDb(lin / SUBS);
      for (let j = 0; j < SUBS; j++) {
        const d = sub[at(k) * SUBS + j] - mean;
        rs += d * d;
        rn++;
      }
    }
    const rough = rn >= 2 * SUBS ? Math.sqrt(rs / rn) : null;
    const ok =
      w[0] - peak <= CLAP.roomStartDb &&
      (s1 >= CLAP.roomDecayDb || near(w[2])) &&
      (s2 >= CLAP.roomDecayDb || near(w[3])) &&
      !rises &&
      (rough === null || rough >= CLAP.roomRoughDb);
    return { windows: w, s1, s2, rises, rough, ok };
  }

  /** Inside a clap already found (its own decay): not another sound. */
  function inClap(f) {
    for (let i = transients.length - 1; i >= 0; i--) {
      const t = transients[i];
      if (f >= t.frame - 2 && f <= t.end) return true;
      if (f - t.frame > HISTORY) break;
    }
    return false;
  }

  function isLocalMax(f) {
    return dbAt(f) >= dbAt(f - 1) && dbAt(f) > dbAt(f + 1);
  }

  function noteOther(f) {
    others.push(f);
    while (others.length && f - others[0] > HISTORY) others.shift();
  }

  function considerPair(t) {
    // A new clap: a third one within the quiet after a waiting pair cancels it.
    if (pair) {
      if (t.frame - pair.b.frame <= pair.after) {
        pair = null;
        return;
      }
    }
    const prev = transients.length >= 2 ? transients[transients.length - 2] : null;
    if (!prev) return;
    const gap = t.frame - prev.frame;
    if (gap < gapMin || gap > gapMax) return;
    const quiet = quietFor(gap);
    // Nothing clap-like in the quiet before the first (the end of a rhythm is no double clap either).
    const third = transients.length >= 3 ? transients[transients.length - 3] : null;
    if (third && prev.frame - third.frame <= quiet) return;
    if (Math.abs(t.level - prev.level) > CLAP.matchDb) return;
    // Reported once the quiet after the second clap has been judged: a third clap at its very end is
    // only judged 200 ms after it.
    pair = { a: prev, b: t, before: quiet, after: quiet, due: t.frame + quiet + judgeAt + 1 };
  }

  /** Where a clap's own echo ends: while it keeps falling and is 10 dB above the floor (≤ 800 ms). */
  function echoEnd(c) {
    let k = Math.max(c.frame + 1, c.end);
    let lowest = meanDb(k, k + 2);
    const limit = Math.min(n - 3, c.frame + frames(800));
    for (; k < limit; k++) {
      const v = meanDb(k, k + 2);
      if (v - floorAt[at(k)] < 10 || v > lowest + 2) break;
      lowest = Math.min(lowest, v);
    }
    return Math.max(c.end, k);
  }

  /** No loud non-clap sound near the pair, and the room not busy around it. */
  function quietAround(p) {
    const endA = echoEnd(p.a);
    const endB = echoEnd(p.b);
    const own = (f) => (f >= p.a.frame - 2 && f <= endA) || (f >= p.b.frame - 2 && f <= endB);
    const from = p.a.frame - p.before;
    const to = p.b.frame + p.after;
    for (const f of others) if (f > from && f <= to && !own(f)) return false;
    // Busy: frames well above the floor, outside the two claps' own echoes.
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
