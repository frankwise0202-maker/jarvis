// The Standby listener's signal path, shared by the AudioWorklet (src/platform/wake/wake-worklet.js)
// and the ScriptProcessor fallback on the page: the microphone's blocks at the device rate →
// 16 kHz → the clap detector, and → 1280-sample frames for the "Hey Jarvis" worker. Pure.
//
//   const tap = createWakeTap({ inputRate: sampleRate, clap: true, sensitivity: 'normal',
//                               onClap(ev), onFrame(Float32Array) });
//   tap.push(block)                       // any number of samples at inputRate
//   tap.configure({ clap, sensitivity, word })   // word: send frames (the wake word is on)

import { createClapDetector } from './clap.js';
import { createResampler } from './resample.js';
import { createFramer, OWW } from './oww.js';

export function createWakeTap({ inputRate = 48000, clap = true, sensitivity = 'normal', word = false, onClap = () => {}, onFrame = () => {} } = {}) {
  const rs = createResampler(inputRate, OWW.sampleRate);
  const detector = createClapDetector({ sampleRate: OWW.sampleRate, sensitivity });
  const framer = createFramer(OWW.frame, (frame) => {
    if (cfg.word) onFrame(frame);
  });
  const cfg = { clap: !!clap, word: !!word };
  let samples16 = 0; // samples at 16 kHz so far (the clock for events)

  function push(block) {
    if (!block || !block.length) return;
    const y = rs.push(block);
    samples16 += y.length;
    if (cfg.clap) {
      for (const ev of detector.push(y)) if (ev.type === 'double') onClap({ ...ev, t: samples16 / OWW.sampleRate });
    }
    if (cfg.word) framer.push(y);
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
    },
    get floorDb() {
      return detector.floorDb;
    },
  };
}
