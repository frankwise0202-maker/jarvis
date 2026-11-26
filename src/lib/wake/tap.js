// The Standby listener's signal path, shared by the AudioWorklet (src/platform/wake/wake-worklet.js)
// and the ScriptProcessor fallback on the page: the microphone's blocks at the device rate →
// 16 kHz → the clap detector, and → 1280-sample frames for the "Hey Jarvis" worker. Pure.
//
//   const tap = createWakeTap({ inputRate: sampleRate, clap: true, sensitivity: 'normal',
//                               onClap(ev), onFrame(Float32Array), onSilence(silent) });
//   tap.push(block)                       // any number of samples at inputRate
//   tap.configure({ clap, sensitivity, word })   // word: send frames (the wake word is on)
//
// v8.1 (A12): onSilence(true) once the microphone has sent exact digital silence (every sample 0) for
// silenceMs (10 s): a microphone's mute button (a speakerphone's), not a quiet room (a real microphone always
// has some noise); onSilence(false) at the first sound after that.

import { createClapDetector } from './clap.js';
import { createResampler } from './resample.js';
import { createFramer, OWW } from './oww.js';

export const SILENCE_MS = 10000;

export function createWakeTap({ inputRate = 48000, clap = true, sensitivity = 'normal', word = false, onClap = () => {}, onFrame = () => {}, onSilence = null, silenceMs = SILENCE_MS } = {}) {
  const rs = createResampler(inputRate, OWW.sampleRate);
  const silentAfter = Math.max(1, Math.round((inputRate * silenceMs) / 1000));
  let zeros = 0; // exact zeros in a row, at inputRate
  let silent = false;
  const detector = createClapDetector({ sampleRate: OWW.sampleRate, sensitivity });
  const framer = createFramer(OWW.frame, (frame) => {
    if (cfg.word) onFrame(frame);
  });
  const cfg = { clap: !!clap, word: !!word };
  let samples16 = 0; // samples at 16 kHz so far (the clock for events)

  function push(block) {
    if (!block || !block.length) return;
    if (typeof onSilence === 'function') watchSilence(block);
    const y = rs.push(block);
    samples16 += y.length;
    if (cfg.clap) {
      for (const ev of detector.push(y)) if (ev.type === 'double') onClap({ ...ev, t: samples16 / OWW.sampleRate });
    }
    if (cfg.word) framer.push(y);
  }

  /** v8.1: exact zeros only (a muted microphone), counted across blocks. */
  function watchSilence(block) {
    let last = -1;
    for (let i = block.length - 1; i >= 0; i--) {
      if (block[i] !== 0) {
        last = i;
        break;
      }
    }
    if (last < 0) zeros += block.length;
    else {
      zeros = block.length - 1 - last;
      if (silent) {
        silent = false;
        onSilence(false);
      }
    }
    if (!silent && zeros >= silentAfter) {
      silent = true;
      onSilence(true);
    }
  }

  function configure(next = {}) {
    if (typeof next.clap === 'boolean' && next.clap !== cfg.clap) {
      cfg.clap = next.clap;
      detector.reset();
    }
    if (typeof next.sensitivity === 'string') detector.setSensitivity(next.sensitivity);
    if (typeof next.word === 'boolean' && next.word !== cfg.word) {
      cfg.word = next.word;
      framer.reset();
    }
  }

  return {
    push,
    configure,
    reset() {
      detector.reset();
      framer.reset();
      rs.reset();
      zeros = 0;
      silent = false;
    },
    get floorDb() {
      return detector.floorDb;
    },
  };
}
