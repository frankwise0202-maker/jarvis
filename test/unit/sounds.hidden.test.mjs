// v8.1 (SPEC §28.1, A1): the chimes of a hands-free session play while Jarvis is in the background on a Mac.
// sounds.js plays nothing while the page is hidden, except the sounds in HIDDEN_SOUNDS asked for with
// { hidden: true }: the wake (v7.4) and now the listen chimes and the error, the honest signal for someone
// across the room. Node, with a small fake Web Audio and a fake page.

import { test } from 'node:test';
import assert from 'node:assert/strict';

let loads = 0;

class FakeParam {
  constructor(value = 0) {
    this.value = value;
  }
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  setTargetAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}

class FakeNode {
  constructor(ctx) {
    this.context = ctx;
    for (const p of ['gain', 'frequency', 'Q', 'detune', 'pan', 'playbackRate']) this[p] = new FakeParam(1);
  }
  connect(dest) {
    return dest;
  }
  disconnect() {}
  start() {
    this.context.starts += 1;
  }
  stop() {}
}

class FakeAudioContext {
  constructor() {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 48000;
    this.destination = new FakeNode(this);
    this.starts = 0;
    this.resumes = 0;
    FakeAudioContext.made.push(this);
  }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (i) => data[i] };
  }
  resume() {
    this.resumes += 1;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}
for (const kind of ['Gain', 'BiquadFilter', 'BufferSource', 'Convolver', 'Oscillator', 'StereoPanner', 'WaveShaper', 'DynamicsCompressor']) {
  FakeAudioContext.prototype[`create${kind}`] = function create() {
    return new FakeNode(this);
  };
}
FakeAudioContext.made = [];

/** A fresh sounds.js on a fake page: Chrome on a Mac, the owner has clicked once. */
async function setup(t) {
  const saved = {};
  for (const k of ['window', 'document', 'navigator']) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
  const win = new EventTarget();
  win.AudioContext = FakeAudioContext;
  const doc = new EventTarget();
  doc.visibilityState = 'visible';
  const nav = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36', maxTouchPoints: 0, userActivation: { hasBeenActive: true, isActive: false } };
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: nav, configurable: true, writable: true });
  t.after(() => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete globalThis[k];
    }
  });
  const sounds = await import(`../../src/ui/sounds.js?hidden=${++loads}`);
  sounds.initSounds(() => ({ sounds: true, soundVolume: 0.6 }));
  const setHidden = (hidden) => {
    doc.visibilityState = hidden ? 'hidden' : 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
  };
  return { sounds, setHidden, ctx: () => FakeAudioContext.made.at(-1) };
}

test('HIDDEN_SOUNDS: the wake, the two listen chimes and the error', async (t) => {
  const { sounds } = await setup(t);
  assert.deepEqual([...sounds.HIDDEN_SOUNDS], ['wake', 'listen-start', 'listen-stop', 'error']);
  for (const name of sounds.HIDDEN_SOUNDS) assert.ok(sounds.SOUND_NAMES.includes(name), name);
});

test('hidden: the listen chimes and the error play when asked with { hidden: true } (a hands-free session on a Mac), not without it', async (t) => {
  const { sounds, setHidden, ctx } = await setup(t);
  assert.equal(sounds.play('tap'), true, 'on screen, sounds play (the context is made)');
  setHidden(true); // our own background suspend
  assert.equal(ctx().state, 'suspended');
  for (const name of ['listen-start', 'listen-stop', 'error']) {
    assert.equal(sounds.play(name), false, `${name} without { hidden: true }: not in the background`);
  }
  const before = ctx().starts;
  for (const name of ['listen-start', 'listen-stop', 'error', 'wake']) {
    assert.equal(sounds.play(name, { hidden: true }), true, `${name} with { hidden: true }`);
  }
  assert.ok(ctx().starts > before, 'their voices were started');
  assert.ok(ctx().resumes >= 1, 'the context suspended for the background was resumed for them');
});

test('hidden: any other sound stays silent, even asked with { hidden: true }', async (t) => {
  const { sounds, setHidden } = await setup(t);
  assert.equal(sounds.play('tap'), true);
  setHidden(true);
  for (const name of ['send', 'reply-done', 'mission-done', 'agent-done', 'notify', 'launch', 'tap', 'alert']) {
    assert.equal(sounds.play(name, { hidden: true }), false, name);
  }
});

test('on screen: unchanged, with or without { hidden: true }', async (t) => {
  const { sounds } = await setup(t);
  assert.equal(sounds.play('listen-start'), true);
  assert.equal(sounds.play('reply-done', { hidden: true }), true);
});
