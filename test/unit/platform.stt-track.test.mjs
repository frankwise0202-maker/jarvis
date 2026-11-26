// v8.1 (Settings → Voice → Microphone and speaker): the recognizer hears the chosen microphone's track
// (recognition.start(track), Chrome 135+) instead of Chrome's own microphone. stt.js's audioTrack option, on
// the virtual clock, against the fake recognizer of stt.fakes.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock } from './platform.voice.fakeengine.test.mjs';
import { installRecognition, freshStt, chrome } from './stt.fakes.mjs';

/** A fake MediaStreamTrack and what happened to it. */
function fakeTrack(label = 'MacBook Pro Microphone (Built-in)') {
  const t = { kind: 'audio', label, readyState: 'live', stops: 0 };
  t.stop = () => {
    t.stops += 1;
    t.readyState = 'ended';
  };
  return t;
}

/** The fake recognizer, recording what each start() was given; refuseTrack: start(track) throws. */
function setup(t, { refuseTrack = null } = {}) {
  const clock = installClock();
  const rec = installRecognition();
  const R = globalThis.webkitSpeechRecognition;
  const start = R.prototype.start;
  R.prototype.start = function startWith(...args) {
    if (args.length && refuseTrack) {
      const err = new Error('The MediaStreamTrack is not of kind audio or is not of state live.');
      err.name = refuseTrack;
      throw err;
    }
    this.startArgs = args;
    return start.call(this);
  };
  t.after(() => {
    rec.uninstall();
    clock.restore();
  });
  return { clock, rec };
}

function listen(stt, options = {}) {
  const log = [];
  const handle = stt.startListening({
    onPartial: (x) => log.push(`partial:${x}`),
    onFinal: (x) => log.push(`final:${x}`),
    onError: (e) => log.push(`error:${e.code}`),
    onEnd: () => log.push('end'),
    ...options,
  });
  return { handle, log };
}

const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test('the chosen microphone’s track: the recognizer starts on it once it is open, every restart reuses it, it closes at the end', async (t) => {
  const { clock, rec } = setup(t);
  const stt = await freshStt();
  const track = fakeTrack();
  const used = [];
  const { handle, log } = listen(stt, { audioTrack: async () => ({ track, stop: () => track.stop(), used: (ok) => used.push(ok) }) });
  assert.equal(rec.made.length, 0, 'nothing starts before the track is open');
  await flush();
  assert.equal(rec.made.length, 1);
  assert.deepEqual(rec.current.startArgs, [track], 'recognition.start(track)');
  assert.deepEqual(used, [true]);
  // Chrome's session ends by itself mid-turn: it starts again on the same track.
  chrome(rec).say('what is the');
  rec.current.end();
  clock.advance(10);
  assert.equal(rec.made.length, 2);
  assert.deepEqual(rec.current.startArgs, [track]);
  assert.equal(track.stops, 0, 'the track stays open through a restart');
  chrome(rec).say('time');
  chrome(rec).finalize();
  clock.advance(3000);
  await flush();
  clock.advance(2000);
  assert.ok(log.includes('final:what is the time'), log.join(' | '));
  assert.ok(log.includes('end'));
  assert.equal(track.stops, 1, 'the microphone closes when listening ends');
  assert.deepEqual(used, [true], 'said once');
  handle.abort();
});

test('no track to give (nothing chosen, or it failed to open): recognition.start() as before', async (t) => {
  const { rec } = setup(t);
  const stt = await freshStt();
  const { handle } = listen(stt, { audioTrack: async () => null });
  await flush();
  assert.equal(rec.made.length, 1);
  assert.deepEqual(rec.current.startArgs, []);
  handle.abort();
  // A provider that throws: the same.
  const second = listen(stt, { audioTrack: () => Promise.reject(new Error('NotReadableError')) });
  await flush();
  assert.deepEqual(rec.current.startArgs, []);
  second.handle.abort();
});

test('a track the recognizer refuses (its microphone went away): Chrome’s own microphone hears it, and the track is let go', async (t) => {
  const { rec } = setup(t, { refuseTrack: 'InvalidStateError' });
  const stt = await freshStt();
  const track = fakeTrack();
  const used = [];
  const { handle } = listen(stt, { audioTrack: async () => ({ track, stop: () => track.stop(), used: (ok) => used.push(ok) }) });
  await flush();
  assert.equal(rec.made.length, 1);
  assert.deepEqual(rec.current.startArgs, [], 'recognition.start()');
  assert.deepEqual(used, [false]);
  assert.equal(track.stops, 1);
  handle.abort();
});

test('an ended track is never handed over; abort() before the track opens starts nothing and still ends once', async (t) => {
  const { clock, rec } = setup(t);
  const stt = await freshStt();
  const ended = fakeTrack();
  ended.readyState = 'ended';
  const a = listen(stt, { audioTrack: async () => ({ track: ended, stop: () => ended.stop(), used: () => {} }) });
  await flush();
  assert.deepEqual(rec.current.startArgs, []);
  a.handle.abort();
  clock.advance(2000);

  const track = fakeTrack();
  let open;
  const before = rec.made.length;
  const b = listen(stt, { audioTrack: () => new Promise((r) => (open = r)) });
  b.handle.abort();
  await flush();
  assert.deepEqual(b.log, ['end'], 'ended once, nothing delivered');
  open({ track, stop: () => track.stop(), used: () => {} });
  await flush();
  assert.equal(rec.made.length, before, 'no recognizer was started');
  assert.equal(track.stops, 1, 'the late track is closed at once');
});

test('without audioTrack nothing changes: the first session starts inside startListening() (iOS needs the tap)', async (t) => {
  const { rec } = setup(t);
  const stt = await freshStt();
  const { handle } = listen(stt, {});
  assert.equal(rec.made.length, 1, 'started synchronously');
  assert.deepEqual(rec.current.startArgs, []);
  handle.abort();
});
