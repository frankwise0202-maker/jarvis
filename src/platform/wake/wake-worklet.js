// The Standby listener (bundled to dist/assets/wake-worklet.js and precached: claps work offline).
// An AudioWorkletProcessor on the audio thread: the microphone at the device's rate → 16 kHz → the
// clap detector (src/lib/wake/clap.js), and → 80 ms frames sent straight to the "Hey Jarvis" worker
// through a MessagePort the page hands over (the page's main thread never sees the audio). Nothing
// is recorded or sent anywhere: the frames are dropped as soon as the worker has scored them.
//
// Messages from the page (node.port): { type: 'config', clap, sensitivity, word }, { type: 'word-port'
// } with a MessagePort (the worker's end), { type: 'stop' }.
// To the page: { type: 'clap', gapMs, levels, t }, { type: 'ready', rate }.

import { createWakeTap } from '../../lib/wake/tap.js';

class JarvisWakeProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.alive = true;
    this.wordPort = null;
    this.wantWord = o.word === true;
    this.tap = createWakeTap({
      inputRate: sampleRate,
      clap: o.clap !== false,
      sensitivity: typeof o.sensitivity === 'string' ? o.sensitivity : 'normal',
      word: false,
      onClap: (ev) => this.port.postMessage({ type: 'clap', gapMs: ev.gapMs, levels: ev.levels, t: ev.t }),
      onFrame: (frame) => {
        if (!this.wordPort) return;
        try {
          this.wordPort.postMessage({ type: 'frame', samples: frame }, [frame.buffer]);
        } catch {
          /* the worker went away */
        }
      },
    });
    this.port.onmessage = (event) => {
      const msg = event.data || {};
      if (msg.type === 'config') {
        this.tap.configure({ clap: msg.clap, sensitivity: msg.sensitivity, word: !!msg.word && !!this.wordPort });
        this.wantWord = !!msg.word;
      } else if (msg.type === 'word-port') {
        this.wordPort = (event.ports && event.ports[0]) || null;
        this.tap.configure({ word: !!this.wordPort && this.wantWord });
      } else if (msg.type === 'stop') {
        this.alive = false;
        if (this.wordPort) {
          try {
            this.wordPort.close();
          } catch {
            /* closed */
          }
        }
        this.wordPort = null;
      }
    };
    this.port.postMessage({ type: 'ready', rate: sampleRate });
  }

  process(inputs) {
    if (!this.alive) return false;
    const input = inputs[0];
    const channel = input && input[0];
    if (channel && channel.length) this.tap.push(channel);
    return true;
  }
}

registerProcessor('jarvis-wake', JarvisWakeProcessor);
