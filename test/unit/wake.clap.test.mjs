// Two claps wake Jarvis (SPEC §22): the clap detector (src/lib/wake/clap.js) and the resampler
// (src/lib/wake/resample.js), on synthetic sounds (wake.signals.mjs) in 128-sample blocks, as the
// Standby AudioWorklet feeds them: double claps and snaps wake it, also from across a reverberant
// room (two room models); one clap, three claps, a third clap in the same rhythm, clapping along or a
// metronome, claps too close or too far apart, speech, music, drums, knocks, footsteps, a door slam,
// a ringing glass, mouse clicks and typing do not (near and far); the noise floor adapts; the
// sensitivity setting moves the line; the recorded-style room take (fixtures/wake/room-double-clap.wav)
// wakes it, also at 48 kHz through the resampler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClapDetector, CLAP_SENSITIVITIES, CLAP } from '../../src/lib/wake/clap.js';
import { createResampler } from '../../src/lib/wake/resample.js';
import * as S from './wake.signals.mjs';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'wake');

/** The signal with `before`/`after` seconds of quiet, over room tone. */
const inRoom = (x, { before = 1, after = 1, rmsDb = -60, seed = 5 } = {}) => S.withRoom(S.concat(S.silence(before), x, S.silence(after)), { rmsDb, seed });
const doubles = (x, sensitivity = 'normal') => S.runDetector(createClapDetector({ sensitivity }), x).filter((e) => e.type === 'double');
/** Feed a detector in 128-sample blocks, without the quiet runDetector adds at the end. */
const feed = (d, x) => {
  const ev = [];
  for (let i = 0; i < x.length; i += 128) ev.push(...d.push(x.subarray(i, i + 128)));
  return ev;
};

test('two claps 150–900 ms apart wake it, once, with the gap reported', () => {
  for (const gapMs of [160, 250, 420, 700, 880]) {
    const ev = doubles(inRoom(S.doubleClap({ gapMs })));
    assert.equal(ev.length, 1, `gap ${gapMs} ms`);
    assert.ok(Math.abs(ev[0].gapMs - gapMs) <= 10, `gap reported ${ev[0].gapMs}`);
  }
});

test('soft and loud claps, uneven claps, a noisy room, a reverberant room, finger snaps', () => {
  assert.equal(doubles(inRoom(S.doubleClap({ peakDb: -28 }))).length, 1, 'soft claps');
  assert.equal(doubles(inRoom(S.doubleClap({ peakDb: -3 }))).length, 1, 'loud claps');
  assert.equal(doubles(inRoom(S.doubleClap({ peakDb: -12, second: -20 }))).length, 1, 'the second one softer');
  assert.equal(doubles(inRoom(S.doubleClap({ peakDb: -14 }), { rmsDb: -45 })).length, 1, 'a noisy room');
  const reverb = S.concat(S.inRoom(S.clap({ peakDb: -12, seed: 3 })).subarray(0, Math.round(0.42 * S.RATE)), S.inRoom(S.clap({ peakDb: -13, seed: 9 })));
  assert.equal(doubles(inRoom(reverb)).length, 1, 'a reverberant room');
  assert.equal(doubles(inRoom(S.doubleClap({ snaps: true, gapMs: 380, peakDb: -16 }))).length, 1, 'two snaps');
  assert.equal(doubles(inRoom(S.doubleClap({ snaps: true, gapMs: 500, peakDb: -30 }))).length, 1, 'two soft snaps');
});

test('not two claps: one, three, too close, too far apart, applause', () => {
  assert.equal(doubles(inRoom(S.clap())).length, 0, 'one clap');
  assert.equal(doubles(inRoom(S.doubleClap({ gapMs: 120 }))).length, 0, '120 ms apart');
  assert.equal(doubles(inRoom(S.doubleClap({ gapMs: 1100, seconds: 3 }))).length, 0, '1.1 s apart');
  const triple = S.concat(S.doubleClap({ gapMs: 350, seconds: 0.7, at: 0 }), S.clap({ seed: 77 }));
  assert.equal(doubles(inRoom(triple)).length, 0, 'three claps');
  const applause = S.silence(2.2);
  for (let k = 0; k < 8; k++) S.mixAt(applause, S.clap({ seed: 200 + k, peakDb: -12 - (k % 3) }), k * 0.2);
  assert.equal(doubles(inRoom(applause)).length, 0, 'applause');
});

/** A double clap from across a room: each clap through `room(dry, seed)`, over quiet room tone. */
function farDouble(room, { peakDb = -16, gapMs = 450, seed = 1, snaps = false } = {}) {
  const dry = (s, p) => (snaps ? S.snap({ peakDb: p, seed: s }) : S.clap({ peakDb: p, seed: s, tail: 0 }));
  const x = S.silence(4.2);
  S.mixAt(x, room(dry(seed + 10, peakDb), seed + 20), 1.2);
  S.mixAt(x, room(dry(seed + 30, peakDb - 1), seed + 40), 1.2 + gapMs / 1000);
  return S.withRoom(x, { rmsDb: -62, seed: seed + 50 });
}

test('claps from across the room wake it: the room’s echo as loud as the clap or louder, at every sensitivity', () => {
  // The builder's room (inRoom) with its diffuse tail raised: wet 1 is R ≈ +4 dB, wet 1.5 ≈ +8 dB.
  const builder = (wet, rt60) => (dry, seed) => S.inRoom(dry, { wet, rt60, seed });
  assert.ok(S.reverbRatioDb((x) => S.inRoom(x, { wet: 1, rt60: 0.45 })) > 3, 'wet 1: the echo carries more energy than the clap');
  for (const [wet, rt60] of [[1, 0.45], [1.5, 0.45], [1, 0.6], [1.5, 0.6]]) {
    for (const sens of CLAP_SENSITIVITIES) {
      for (const seed of [7, 207]) {
        const ev = doubles(farDouble(builder(wet, rt60), { seed }), sens);
        assert.equal(ev.length, 1, `inRoom wet ${wet}, RT60 ${rt60} s, ${sens}, seed ${seed}`);
        assert.ok(Math.abs(ev[0].gapMs - 450) <= 10, `the gap (${ev[0].gapMs})`);
      }
    }
  }
  // An independent statistical room: R +3 to +9 dB (about 1.2–3 m in a living room), RT60 0.35–0.9 s.
  const far = (R, rt60) => (dry, seed) => S.farField(dry, { R, rt60, seed });
  for (const rt60 of [0.35, 0.5, 0.7, 0.9]) {
    for (const R of [3, 6, 9]) {
      for (const seed of [7, 307]) assert.equal(doubles(farDouble(far(R, rt60), { seed })).length, 1, `farField R +${R} dB, RT60 ${rt60} s, seed ${seed}`);
    }
  }
  for (const sens of CLAP_SENSITIVITIES) assert.equal(doubles(farDouble(far(6, 0.5), { seed: 11 }), sens).length, 1, `R +6 dB at ${sens}`);
  // Snaps from across the room, and a softer pair farther away (R +12 dB, RT60 0.5 s).
  assert.equal(doubles(farDouble(far(6, 0.5), { snaps: true, peakDb: -20, seed: 5 })).length, 1, 'two snaps across the room');
  assert.equal(doubles(farDouble(far(12, 0.5), { peakDb: -24, seed: 9 })).length, 1, 'soft claps 3–4 m away');
});

test('from across the room too: speech, music, knocks, steps, typing, a metronome and a ringing glass do not wake it', () => {
  const far = (x, seed = 9) => S.farField(x, { R: 6, rt60: 0.5, seed });
  const sounds = {
    'speech across the room': far(S.speechLike({ seconds: 6, seed: 25 })),
    'music across the room': far(S.musicLike({ seconds: 6, bpm: 100, seed: 38 })),
    'drums across the room': far(S.musicLike({ seconds: 6, bpm: 75, chords: false, seed: 39 })),
    'knocks across the room': far(S.knocks()),
    'two steps across the room': far(S.footsteps({ count: 2, gapMs: 500 })),
    'typing across the room': far(S.typing({ seconds: 4, peakDb: -18, seed: 93 })),
    'a metronome across the room': far(S.beats(667, 8, (k) => S.woodblock({ seed: k + 1, peakDb: -16 - (k % 2) }))),
    'two glasses clinking': S.beats(300, 2, (k) => S.glassClink({ seed: 80 + k, peakDb: -18 - k })),
    'a spoon on a plate, twice': S.beats(400, 2, (k) => S.glassClink({ seed: 90 + k, freq: 4200, tau: 0.08, peakDb: -20 })),
  };
  for (const sens of CLAP_SENSITIVITIES) for (const [name, x] of Object.entries(sounds)) assert.equal(doubles(inRoom(x), sens).length, 0, `${name} (${sens})`);
  // A ringing glass is clap-like at its start, but no room's echo rings that smoothly.
  const d = createClapDetector({ sensitivity: 'high' });
  const ev = S.runDetector(d, inRoom(S.glassClink({ seed: 3 })));
  assert.equal(ev.filter((e) => e.type === 'transient').length, 0, 'a clink is not a clap');
});

test('a third clap in the rhythm cancels the pair: 500–850 ms after it, or a steady beat of 70–120 bpm', () => {
  // A pair 350 ms apart, then a third clap 500–590 ms after the second (inside the 600 ms of quiet).
  for (const third of [500, 550, 590]) {
    const x = S.silence(2.6);
    S.mixAt(x, S.clap({ seed: 1, peakDb: -12 }), 0);
    S.mixAt(x, S.clap({ seed: 2, peakDb: -13 }), 0.35);
    S.mixAt(x, S.clap({ seed: 3, peakDb: -12 }), 0.35 + third / 1000);
    for (const sens of CLAP_SENSITIVITIES) assert.equal(doubles(inRoom(x), sens).length, 0, `a third clap ${third} ms after the second (${sens})`);
  }
  // Three claps evenly spaced, 500–850 ms apart: the third always comes within 1.5× the pair's gap.
  for (const gap of [500, 600, 700, 850]) {
    const x = S.beats(gap, 3, (k) => S.clap({ seed: 20 + k, peakDb: -12 - (k % 2) }));
    assert.equal(doubles(inRoom(x)).length, 0, `three claps ${gap} ms apart`);
  }
  // Clapping along (8 claps 500–850 ms apart), snapping along, a metronome's woodblock at 70–120 bpm.
  for (const gap of [500, 550, 650, 750, 850]) {
    const x = S.beats(gap, 8, (k) => S.clap({ seed: 300 + k, peakDb: -12 - (k % 2) }));
    for (const sens of CLAP_SENSITIVITIES) assert.equal(doubles(inRoom(x), sens).length, 0, `8 claps every ${gap} ms (${sens})`);
  }
  for (const gap of [550, 700]) assert.equal(doubles(inRoom(S.beats(gap, 6, (k) => S.snap({ seed: 400 + k, peakDb: -16 })))).length, 0, `6 snaps every ${gap} ms`);
  for (const bpm of [70, 80, 90, 100, 110, 120]) {
    const x = S.beats(60000 / bpm, 8, (k) => S.woodblock({ seed: k + 1, peakDb: -16 - (k % 2) }));
    for (const sens of CLAP_SENSITIVITIES) assert.equal(doubles(inRoom(x), sens).length, 0, `a metronome at ${bpm} bpm (${sens})`);
  }
  // A double clap a while after a rhythm (more than 1.5× its gap later) still wakes it.
  const after = S.concat(S.beats(650, 4, (k) => S.clap({ seed: 500 + k, peakDb: -12 })), S.silence(1.2), S.doubleClap({ at: 0.1, seconds: 1.2, seed: 41 }));
  assert.equal(doubles(inRoom(after)).length, 1, 'a double clap after the rhythm stopped');
});

test('the wake is reported only once the quiet after the second clap has been judged', () => {
  for (const gapMs of [300, 420, 800]) {
    const x = inRoom(S.doubleClap({ gapMs, at: 0.8, seconds: 1.8 }));
    const d = createClapDetector();
    let reportedAt = null;
    let t = 0;
    for (let i = 0; i < x.length; i += 128) {
      const block = x.subarray(i, i + 128);
      t += block.length;
      if (d.push(block).some((e) => e.type === 'double') && reportedAt === null) reportedAt = t / S.RATE;
    }
    for (let k = 0; k < 40 && reportedAt === null; k++) {
      t += 1280;
      if (d.push(new Float32Array(1280)).some((e) => e.type === 'double')) reportedAt = t / S.RATE;
    }
    const second = 1 + 0.8 + gapMs / 1000;
    const quiet = Math.max(CLAP.isolationMs, CLAP.isolationGap * gapMs) / 1000;
    assert.ok(reportedAt !== null, `gap ${gapMs}: reported`);
    assert.ok(reportedAt >= second + quiet + CLAP.judgeMs / 1000 - 0.01, `gap ${gapMs}: reported at ${reportedAt.toFixed(2)} s, not before the quiet after ${second.toFixed(2)} s was judged`);
    assert.ok(reportedAt <= second + quiet + CLAP.judgeMs / 1000 + 0.1, `gap ${gapMs}: reported promptly (${reportedAt.toFixed(2)} s)`);
  }
});

test('speech, music and drums never wake it (every sensitivity)', () => {
  const sounds = {
    'speech (male)': S.speechLike({ seconds: 8, seed: 21 }),
    'speech (loud)': S.speechLike({ seconds: 8, seed: 22, peakDb: -6 }),
    'speech (female)': S.speechLike({ seconds: 8, seed: 23, f0: 200 }),
    'music 100 bpm': S.musicLike({ seconds: 8, bpm: 100 }),
    'music 80 bpm': S.musicLike({ seconds: 8, bpm: 80, seed: 32 }),
    'music 60 bpm': S.musicLike({ seconds: 8, bpm: 60, seed: 33 }),
    'drums alone 75 bpm': S.musicLike({ seconds: 8, bpm: 75, chords: false, seed: 34 }),
  };
  for (const sens of CLAP_SENSITIVITIES) for (const [name, x] of Object.entries(sounds)) assert.equal(doubles(inRoom(x), sens).length, 0, `${name} (${sens})`);
});

test('knocks, footsteps, a door slam, clicks and typing never wake it', () => {
  const sounds = {
    'three knocks': S.knocks(),
    'two knocks 400 ms apart': S.knocks({ count: 2, gapMs: 400 }),
    footsteps: S.footsteps(),
    'two steps 500 ms apart': S.footsteps({ count: 2, gapMs: 500 }),
    'a door slam': S.doorSlam(),
    'a slam and a bang': S.concat(S.doorSlam(), S.doorSlam({ seed: 42, peakDb: -12 })),
    'a mouse double click': (() => {
      const x = S.silence(0.5);
      S.mixAt(x, S.click({ peakDb: -20 }), 0);
      S.mixAt(x, S.click({ peakDb: -21, seed: 82 }), 0.18);
      return x;
    })(),
    'two loud clicks 400 ms apart': (() => {
      const x = S.silence(0.7);
      S.mixAt(x, S.click({ peakDb: -12 }), 0);
      S.mixAt(x, S.click({ peakDb: -13, seed: 83 }), 0.4);
      return x;
    })(),
    typing: S.typing({ seconds: 6 }),
    'loud typing': S.typing({ seconds: 6, peakDb: -18, seed: 92 }),
  };
  for (const sens of CLAP_SENSITIVITIES) for (const [name, x] of Object.entries(sounds)) assert.equal(doubles(inRoom(x), sens).length, 0, `${name} (${sens})`);
  // The lone transients are found (diagnostics), but a knock is not bright enough to be a clap.
  const ev = S.runDetector(createClapDetector(), inRoom(S.knocks()));
  assert.equal(ev.filter((e) => e.type === 'transient').length, 0, 'knocks are not claps');
});

test('a double clap right after talking still wakes it; in the middle of music it does not', () => {
  const afterTalk = S.concat(S.speechLike({ seconds: 3, seed: 24 }), S.silence(0.9), S.doubleClap({ at: 0.1, seconds: 1.5 }));
  assert.equal(doubles(inRoom(afterTalk)).length, 1, 'after talking');
  const m = S.musicLike({ seconds: 6, bpm: 96, seed: 35, peakDb: -10 });
  S.mixAt(m, S.doubleClap({ at: 0, seconds: 1.2, gapMs: 420, peakDb: -16 }), 2.05);
  assert.equal(doubles(inRoom(m)).length, 0, 'over loud music');
});

test('the noise floor adapts: a loud steady room raises it, the quiet brings it back', () => {
  const d = createClapDetector();
  feed(d, S.roomNoise(3, { rmsDb: -60, seed: 1 }));
  const quiet = d.floorDb;
  feed(d, S.roomNoise(8, { rmsDb: -35, seed: 2 }));
  const loud = d.floorDb;
  feed(d, S.roomNoise(1, { rmsDb: -60, seed: 3 }));
  const back = d.floorDb;
  assert.ok(loud > quiet + 15, `a loud room raises the floor (${quiet.toFixed(1)} → ${loud.toFixed(1)} dB)`);
  assert.ok(back < loud - 15, `quiet brings it back fast (${back.toFixed(1)} dB)`);
  // Claps that stand out of a loud fan still count; the same claps under it do not.
  const fan = S.roomNoise(4, { rmsDb: -36, seed: 4 });
  S.mixAt(fan, S.doubleClap({ seconds: 1.5, at: 0, peakDb: -6 }), 2);
  assert.equal(doubles(fan).length, 1, 'loud claps over a fan');
  const fan2 = S.roomNoise(4, { rmsDb: -36, seed: 6 });
  S.mixAt(fan2, S.doubleClap({ seconds: 1.5, at: 0, peakDb: -26 }), 2);
  assert.equal(doubles(fan2).length, 0, 'claps lost in the fan');
});

test('sensitivity: Low needs louder claps than Normal, Normal than High', () => {
  // The same double clap at -40…-10 dBFS in a moderately noisy room (-50 dBFS): the quietest level
  // each setting hears, and every louder level heard too.
  const quietest = {};
  for (const sens of CLAP_SENSITIVITIES) {
    let first = null;
    for (let p = -40; p <= -10; p += 2) {
      const heard = doubles(inRoom(S.doubleClap({ peakDb: p, seed: 15 }), { rmsDb: -50, seed: 8 }), sens).length === 1;
      if (heard && first === null) first = p;
      if (first !== null) assert.ok(heard, `${sens}: heard at ${first} dBFS but not at ${p}`);
    }
    assert.ok(first !== null, `${sens} never hears them`);
    quietest[sens] = first;
  }
  assert.ok(quietest.high < quietest.normal, `High (${quietest.high}) hears softer claps than Normal (${quietest.normal})`);
  assert.ok(quietest.normal < quietest.low, `Normal (${quietest.normal}) hears softer claps than Low (${quietest.low})`);
  // setSensitivity takes effect at once.
  const soft = inRoom(S.doubleClap({ peakDb: quietest.high, seed: 15 }), { rmsDb: -50, seed: 8 });
  const d = createClapDetector({ sensitivity: 'low' });
  d.setSensitivity('high');
  assert.equal(S.runDetector(d, soft).filter((e) => e.type === 'double').length, 1);
});

test('the recorded-style fixture (a living room take) wakes it once, at 16 kHz and at 48 kHz', async () => {
  const fixture = S.readWav(await readFile(path.join(FIX, 'room-double-clap.wav')));
  assert.equal(fixture.rate, 16000);
  const ev = doubles(fixture.samples);
  assert.equal(ev.length, 1);
  assert.ok(Math.abs(ev[0].at - 3.52) < 0.05, `the second clap at ${ev[0].at} s`);
  assert.ok(Math.abs(ev[0].gapMs - 420) <= 10);
  // The same take recorded at 48 kHz, down to 16 kHz in 128-sample blocks like the AudioWorklet.
  const take48 = S.recordedRoomTake({ rate: 48000 });
  const rs = createResampler(48000, 16000);
  const d = createClapDetector();
  const evs = [];
  for (let i = 0; i < take48.length; i += 128) evs.push(...d.push(rs.push(take48.subarray(i, i + 128))));
  evs.push(...d.push(new Float32Array(16000)));
  assert.equal(evs.filter((e) => e.type === 'double').length, 1);
  // And the fixture is what the generator makes (it was written by `node test/unit/wake.fixtures.mjs`).
  const again = S.recordedRoomTake();
  let worst = 0;
  for (let i = 0; i < again.length; i++) worst = Math.max(worst, Math.abs(Math.round(again[i] * 32767) / 32768 - fixture.samples[i]));
  assert.ok(worst < 2 / 32768, `fixture drifted from its generator (${worst})`);
});

test('resampler: a 1 kHz tone keeps its pitch and level; 10 kHz (above 8 kHz) is filtered out', () => {
  for (const from of [48000, 44100]) {
    const rs = createResampler(from, 16000);
    const tone = (hz) => Float32Array.from({ length: from }, (_, i) => Math.sin((2 * Math.PI * hz * i) / from));
    const blocks = [];
    const x = tone(1000);
    for (let i = 0; i < x.length; i += 128) blocks.push(rs.push(x.subarray(i, i + 128)));
    const y = S.concat(...blocks);
    assert.ok(Math.abs(y.length - 16000) < 40, `${from}: ${y.length} samples for one second`);
    const mid = y.subarray(2000, 14000);
    let zc = 0;
    for (let i = 1; i < mid.length; i++) if (mid[i - 1] < 0 && mid[i] >= 0) zc++;
    assert.ok(Math.abs(zc - 750) <= 2, `${from}: ${zc} cycles in 0.75 s`);
    const rms = Math.sqrt(mid.reduce((s, v) => s + v * v, 0) / mid.length);
    assert.ok(Math.abs(rms - Math.SQRT1_2) < 0.02, `${from}: rms ${rms}`);
    const rs2 = createResampler(from, 16000);
    const hi = rs2.push(tone(10000));
    const hiRms = Math.sqrt(hi.subarray(500).reduce((s, v) => s + v * v, 0) / (hi.length - 500));
    assert.ok(hiRms < 0.01, `${from}: 10 kHz leaks ${hiRms}`);
  }
  const same = createResampler(16000, 16000);
  assert.deepEqual(Array.from(same.push(new Float32Array([1, 2, 3]))), [1, 2, 3]);
  assert.throws(() => createResampler(0, 16000), RangeError);
});

test('constants match the owner’s brief', () => {
  assert.equal(CLAP.minGapMs, 150);
  assert.equal(CLAP.maxGapMs, 900);
  assert.deepEqual(CLAP_SENSITIVITIES, ['low', 'normal', 'high']);
});
