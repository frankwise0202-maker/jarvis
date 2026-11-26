// v8.1 (A12, the mute half): Standby's signal path (src/lib/wake/tap.js) notices exact digital silence. A
// speakerphone's mute button sends zeros; a real microphone in a quiet room never does (it always has some
// noise). After 10 s of exact zeros onSilence(true), once; the first sound after it onSilence(false).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWakeTap, SILENCE_MS } from '../../src/lib/wake/tap.js';
import * as S from './wake.signals.mjs';

const RATE = 48000;
const block = (n, value = 0) => new Float32Array(n).fill(value);

/** Push `seconds` of `fill` (a number, or a Float32Array source) in 128-sample blocks. */
function feed(tap, seconds, fill = 0) {
  const total = Math.round(seconds * RATE);
  for (let at = 0; at < total; at += 128) {
    const n = Math.min(128, total - at);
    if (typeof fill === 'number') tap.push(block(n, fill));
    else tap.push(fill.subarray(at % (fill.length - 128), (at % (fill.length - 128)) + n));
  }
}

test('ten seconds of exact zeros: muted, once; the first sound: not any more', () => {
  assert.equal(SILENCE_MS, 10000);
  const events = [];
  const tap = createWakeTap({ inputRate: RATE, clap: true, onSilence: (s) => events.push(s) });
  feed(tap, 9.9);
  assert.deepEqual(events, [], 'not before 10 s');
  feed(tap, 0.2);
  assert.deepEqual(events, [true]);
  feed(tap, 30);
  assert.deepEqual(events, [true], 'said once');
  const sound = block(128);
  sound[77] = 0.001;
  tap.push(sound);
  assert.deepEqual(events, [true, false], 'the first sound ends it');
  feed(tap, 9.99);
  assert.deepEqual(events, [true, false], 'the zeros counted again from that sound');
  feed(tap, 0.02);
  assert.deepEqual(events, [true, false, true]);
});

test('a quiet room is never "muted": its noise floor is not exact zeros; claps still work beside the watch', () => {
  const events = [];
  const claps = [];
  const tap = createWakeTap({ inputRate: 16000, clap: true, onSilence: (s) => events.push(s), onClap: (e) => claps.push(e) });
  const room = S.roomNoise(12, { rmsDb: -75, rate: 16000 });
  for (let at = 0; at + 128 <= room.length; at += 128) tap.push(room.subarray(at, at + 128));
  assert.deepEqual(events, [], 'room noise at -75 dB is still sound');
  const dbl = S.concat(S.silence(0.3, 16000), S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10, rate: 16000 }), S.roomNoise(1.2, { rmsDb: -75, rate: 16000 }));
  for (let at = 0; at + 128 <= dbl.length; at += 128) tap.push(dbl.subarray(at, at + 128));
  assert.equal(claps.length, 1, 'two claps detected as before');
});

test('without onSilence nothing is called; reset() starts the count over', () => {
  const quiet = createWakeTap({ inputRate: RATE });
  feed(quiet, 11); // no callback: nothing to call, nothing breaks
  const events = [];
  const tap = createWakeTap({ inputRate: RATE, onSilence: (s) => events.push(s) });
  feed(tap, 8);
  tap.reset();
  feed(tap, 8);
  assert.deepEqual(events, [], 'the count started over at reset');
  feed(tap, 2.1);
  assert.deepEqual(events, [true]);
});

test('unmuted: two claps work at once again (the detector starts afresh after a second or more of digital silence)', () => {
  for (const zerosSec of [1.5, 3, 12]) {
    const claps = [];
    const tap = createWakeTap({ inputRate: 16000, clap: true, onClap: (e) => claps.push(e) });
    const push = (x) => {
      for (let at = 0; at + 128 <= x.length; at += 128) tap.push(x.subarray(at, at + 128));
    };
    push(S.roomNoise(2, { rmsDb: -62, rate: 16000 }));
    push(new Float32Array(Math.round(zerosSec * 16000))); // the mute button
    push(S.roomNoise(0.5, { rmsDb: -62, rate: 16000 })); // unmuted, half a second later: two claps
    const dbl = S.concat(S.silence(0.3, 16000), S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10, rate: 16000 }), S.silence(0.9, 16000));
    const noise = S.roomNoise(dbl.length / 16000, { rmsDb: -62, rate: 16000 });
    push(dbl.map((v, i) => v + (noise[i] || 0)));
    push(S.roomNoise(1, { rmsDb: -62, rate: 16000 }));
    assert.equal(claps.length, 1, `after ${zerosSec} s of digital silence`);
  }
});
