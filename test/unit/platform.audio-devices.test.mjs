// v8.1 Microphone and speaker, the media side (src/platform/audio-devices.js and Standby's capture,
// src/platform/wake/capture.js): the chosen microphone by exact id with the setup's processing, the fallback
// to the default device, the speaker given to every sink, the speakerphone coming and going (two
// enumerations about 3 s apart), the recognizer's track, setup 3's listen chime, the wake line, the
// one-time Standby line and the Mac's sleep. A fake browser scope on the virtual clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installClock } from './platform.voice.fakeengine.test.mjs';
import { createAudioDevices, audioChoiceSupported, recognizerTakesTrack, openMic, micPermission, showMyDevices } from '../../src/platform/audio-devices.js';
import { createStandbyCapture } from '../../src/platform/wake/capture.js';

const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const mic = (deviceId, label, groupId) => ({ kind: 'audioinput', deviceId, groupId, label });
const out = (deviceId, label, groupId) => ({ kind: 'audiooutput', deviceId, groupId, label });
const MAC = [mic('default', 'Default - MacBook Pro Microphone (Built-in)', 'g-mac'), mic('mac-mic', 'MacBook Pro Microphone (Built-in)', 'g-mac'), out('default', 'Default - MacBook Pro Speakers (Built-in)', 'g-mac'), out('mac-out', 'MacBook Pro Speakers (Built-in)', 'g-mac')];
const SP = [mic('sp-mic', 'Desk Speakerphone (Bluetooth)', 'g-sp'), out('sp-out', 'Desk Speakerphone (Bluetooth)', 'g-sp')];

/** A browser: devices to list (changeable), getUserMedia on them (exact ids), AudioContext with setSinkId. */
function fakeScope({ devices = [...MAC, ...SP], userAgent = MAC_UA, permission = 'granted', sinkIds = true } = {}) {
  const fired = new Set();
  const store = new Map();
  const md = {
    list: devices.slice(),
    gets: [],
    live: 0,
    failNext: [],
    async enumerateDevices() {
      return md.list.map((d) => ({ ...d }));
    },
    async getUserMedia(c) {
      md.gets.push(c);
      if (md.failNext.length) {
        const e = new Error('fail');
        e.name = md.failNext.shift();
        throw e;
      }
      const want = c && c.audio && c.audio.deviceId && c.audio.deviceId.exact;
      const inputs = md.list.filter((d) => d.kind === 'audioinput' && d.deviceId !== 'default');
      const dev = want ? inputs.find((d) => d.deviceId === want) : md.list.find((d) => d.kind === 'audioinput' && d.deviceId === 'default') || inputs[0];
      if (!dev) {
        const e = new Error('Requested device not found');
        e.name = want ? 'OverconstrainedError' : 'NotFoundError';
        throw e;
      }
      md.live += 1;
      const on = new Map();
      const track = {
        kind: 'audio',
        label: dev.label,
        readyState: 'live',
        getSettings: () => ({ deviceId: dev.deviceId }),
        addEventListener: (type, fn) => on.set(type, [...(on.get(type) || []), fn]),
        fire: (type) => (on.get(type) || []).forEach((fn) => fn({ type })),
      };
      md.tracks = [...(md.tracks || []), track];
      track.stop = () => {
        if (track.readyState === 'live') md.live -= 1;
        track.readyState = 'ended';
      };
      return { getAudioTracks: () => [track], getTracks: () => [track] };
    },
    addEventListener: (type, fn) => type === 'devicechange' && fired.add(fn),
    removeEventListener: (type, fn) => fired.delete(fn),
    change(list) {
      md.list = list.slice();
      for (const fn of [...fired]) fn();
    },
    get watchers() {
      return fired.size;
    },
  };
  class FakeAudioContext {
    constructor() {
      this.state = 'running';
      this.sampleRate = 48000;
      this.destination = {};
      this.currentTime = 0;
    }
    resume() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createScriptProcessor() {
      return { connect() {}, disconnect() {}, onaudioprocess: null };
    }
    addEventListener() {}
  }
  if (sinkIds) FakeAudioContext.prototype.setSinkId = function setSinkId(id) {
    this.sinkId = id;
    return Promise.resolve();
  };
  return {
    navigator: { mediaDevices: md, userAgent, permissions: { query: async () => ({ state: permission }) } },
    AudioContext: FakeAudioContext,
    MessageChannel: globalThis.MessageChannel,
    location: { href: 'https://localhost/' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    md,
    store,
  };
}

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** A sink that records what it was given. */
function sink({ settle = false, probe = false } = {}) {
  const s = { ids: [], settles: [], probes: 0, setSink: (id) => (s.ids.push(id), Promise.resolve(true)) };
  if (settle) s.settle = (ms) => s.settles.push(ms);
  if (probe) s.probe = () => (s.probes += 1);
  return s;
}

const SETUP1 = { audioSetup: 'speaker-mac-mic', audioInputId: 'mac-mic', audioInputLabel: 'MacBook Pro Microphone (Built-in)', audioOutputId: 'sp-out', audioOutputLabel: 'Desk Speakerphone (Bluetooth)' };
const SETUP2 = { audioSetup: 'speakerphone-both', audioInputId: 'sp-mic', audioInputLabel: 'Desk Speakerphone (Bluetooth)', audioOutputId: 'sp-out', audioOutputLabel: 'Desk Speakerphone (Bluetooth)' };
const SETUP3 = { ...SETUP2, audioSetup: 'switch' };

test('where the card is offered, and the recognizer’s track by browser', async () => {
  assert.equal(audioChoiceSupported(fakeScope()), true);
  assert.equal(audioChoiceSupported(fakeScope({ sinkIds: false })), false, 'Safari, the iPhone, Firefox: no AudioContext.setSinkId');
  assert.equal(recognizerTakesTrack(fakeScope()), true);
  assert.equal(recognizerTakesTrack(fakeScope({ userAgent: MAC_UA.replace('142', '134') })), false);
  assert.equal(await micPermission(fakeScope({ permission: 'prompt' })), 'prompt');
  assert.equal(await micPermission({ navigator: {} }), 'unknown');
  const scope = fakeScope();
  assert.deepEqual(await showMyDevices(scope), { ok: true });
  assert.equal(scope.md.live, 0, 'the microphone opened inside the tap is let go at once');
});

test('Standby’s capture: today’s request with nothing chosen; the chosen device by exact id with its processing; the default when it is gone', async () => {
  const scope = fakeScope();
  const plain = createStandbyCapture({ scope });
  assert.deepEqual((await plain.start({ clap: true })).ok, true);
  assert.deepEqual(scope.md.gets[0], { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } }, video: false }, 'exactly as before');
  plain.close();

  const released = [];
  const cap = createStandbyCapture({ scope, device: () => ({ id: 'mac-mic', processing: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } }), onRelease: (d) => released.push(d) });
  const r = await cap.start({ clap: true });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(scope.md.gets[1].audio, { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, deviceId: { exact: 'mac-mic' } });
  assert.deepEqual(cap.device, { id: 'mac-mic', label: 'MacBook Pro Microphone (Built-in)', fellBack: false });
  cap.stop();
  assert.deepEqual(released, [{ id: 'mac-mic', label: 'MacBook Pro Microphone (Built-in)', fellBack: false }]);

  // The system mutes, unmutes or ends the live track: the device watcher is told (onTrack).
  const told = [];
  const watched = createStandbyCapture({ scope, device: () => ({ id: 'sp-mic', processing: null }), onTrack: (type) => told.push(type) });
  await watched.start({ clap: true });
  const tr = scope.md.tracks[scope.md.tracks.length - 1];
  tr.fire('mute');
  tr.fire('unmute');
  tr.fire('ended');
  assert.deepEqual(told, ['mute', 'unmute', 'ended']);
  assert.equal(watched.state, 'off', 'an ended track stops the capture, as before');
  watched.close();

  // The speakerphone is off: OverconstrainedError → the default device, with a note (not 'no-mic').
  const states = [];
  const gone = createStandbyCapture({ scope, device: () => ({ id: 'missing', processing: null }), onState: (s) => states.push(s) });
  const g = await gone.start({ clap: true });
  assert.deepEqual(g, { ok: true, fellBack: true });
  assert.equal('deviceId' in scope.md.gets[scope.md.gets.length - 1].audio, false, 'asked again without the id');
  assert.equal(gone.device.fellBack, true);
  assert.deepEqual(states[states.length - 1], { state: 'live', fellBack: true });
  gone.close();
  // No microphone at all: 'no-mic' as before.
  scope.md.list = [];
  const none = createStandbyCapture({ scope, device: () => ({ id: 'missing', processing: null }) });
  assert.deepEqual(await none.start({ clap: true }), { ok: false, reason: 'no-mic' });
});

test('nothing chosen: no device anywhere, no setSinkId, listens as before', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const scope = fakeScope();
  const audio = createAudioDevices({ getSettings: () => ({}), scope });
  const s = sink();
  audio.addSink(s);
  await flush();
  assert.equal(audio.supported(), true);
  assert.equal(audio.wakeAudio(), null);
  assert.equal(audio.questionAudio(), null);
  assert.equal(audio.wakeKey(), '');
  assert.deepEqual(s.ids, [], 'no setSinkId at all');
  assert.equal(audio.standbyPill({ id: 'default', label: 'Default - MacBook Pro Microphone (Built-in)' }), null, 'the pill says "this device", as before');
  let given = null;
  const stt = audio.wrapStt({ startListening: (o) => (given = o), sttSupported: () => true });
  stt.startListening({ lang: 'en-GB' });
  assert.deepEqual(given, { lang: 'en-GB' }, 'no audioTrack');
  const bands = await audio.getQuestionMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  assert.deepEqual(scope.md.gets[scope.md.gets.length - 1], { audio: { echoCancellation: true, noiseSuppression: true }, video: false }, 'the mic bands ask exactly as before');
  bands.getTracks().forEach((tr) => tr.stop());
  assert.equal(scope.md.watchers, 0, 'nothing to watch');
  audio.destroy();
});

test('a setup chosen: Standby’s and the questions’ microphones, the speaker for every sink, and the recognizer’s track', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const scope = fakeScope();
  let settings = SETUP1;
  const audio = createAudioDevices({ getSettings: () => settings, scope });
  const george = sink({ settle: true });
  const chimes = sink();
  audio.addSink(george);
  audio.addSink(chimes);
  await flush();
  assert.deepEqual(audio.wakeAudio(), { id: 'mac-mic', processing: { echoCancellation: true, noiseSuppression: false, autoGainControl: false } });
  assert.deepEqual(audio.questionAudio(), { id: 'mac-mic', processing: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  assert.deepEqual([george.ids, chimes.ids], [['sp-out'], ['sp-out']], 'everything Jarvis plays goes to the speakerphone');
  // A sink added later gets it at once.
  const music = sink();
  audio.addSink(music);
  assert.deepEqual(music.ids, ['sp-out']);
  // George's context reports an error (its output device went away): the devices are checked.
  let tell = null;
  const before = scope.md.list.length;
  audio.addSink({ setSink: () => Promise.resolve(true), onDevice: (fn) => ((tell = fn), () => (tell = null)) });
  const listed = [];
  const enumerate = scope.md.enumerateDevices;
  scope.md.enumerateDevices = async () => (listed.push(1), enumerate());
  tell({ type: 'error', state: 'suspended' });
  clock.advance(250);
  await flush();
  assert.equal(listed.length, 1, 'enumerated once the burst settled');
  scope.md.enumerateDevices = enumerate;
  assert.equal(scope.md.list.length, before);
  assert.deepEqual(audio.standbyPill({ id: 'mac-mic', label: 'MacBook Pro Microphone (Built-in)' }), { name: 'THE MAC’S MICROPHONE', gone: '' });

  // The recognizer gets a processed track on the question microphone, closed at the end.
  let given = null;
  const stt = audio.wrapStt({ startListening: (o) => (given = o) });
  stt.startListening({ lang: '' });
  assert.equal(typeof given.audioTrack, 'function');
  const t1 = await given.audioTrack();
  assert.deepEqual(scope.md.gets[scope.md.gets.length - 1].audio, { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 }, deviceId: { exact: 'mac-mic' } });
  t1.used(true);
  assert.deepEqual(audio.trackUse().used, true);
  t1.stop();
  assert.equal(scope.md.live, 0);
  assert.deepEqual(george.settles, [], 'the Mac’s microphone closing: George needn’t wait');

  // Setup 2: the speakerphone's microphone for both; its closing makes George wait for the switch.
  settings = SETUP2;
  audio.settingsChanged();
  await flush();
  assert.deepEqual(audio.wakeAudio(), { id: 'sp-mic', processing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  const t2 = await audio.questionTrack();
  t2.stop();
  assert.deepEqual(george.settles, [800], 'a Bluetooth microphone closed: George waits 800 ms');
  audio.noteMicClosed({ id: 'sp-mic', label: 'Desk Speakerphone (Bluetooth)' });
  audio.noteMicClosed({ id: 'mac-mic', label: 'MacBook Pro Microphone (Built-in)' });
  assert.deepEqual(george.settles, [800, 800]);

  // Voice Mode's mic bands open the question microphone too (else Chrome's own, perhaps the speakerphone's).
  const n0 = scope.md.gets.length;
  const bands = await audio.getQuestionMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  assert.deepEqual(scope.md.gets[n0].audio, { echoCancellation: true, noiseSuppression: true, deviceId: { exact: 'sp-mic' } });
  bands.getTracks().forEach((tr) => tr.stop());

  // Old Chrome (no start(track)): no track, the recognizer opens Chrome's own microphone.
  const old = createAudioDevices({ getSettings: () => SETUP1, scope: fakeScope({ userAgent: MAC_UA.replace('142', '130') }) });
  let oldGiven = null;
  old.wrapStt({ startListening: (o) => (oldGiven = o) }).startListening({});
  assert.deepEqual(oldGiven, {});
  // Cleared: back to the default output.
  settings = {};
  audio.settingsChanged();
  await flush();
  assert.equal(george.ids[george.ids.length - 1], '');
  audio.destroy();
  old.destroy();
});

test('the speakerphone going and coming back: gone after two enumerations about 3 s apart, back at once; one miss changes nothing', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const scope = fakeScope();
  const audio = createAudioDevices({ getSettings: () => SETUP2, scope });
  const george = sink();
  audio.addSink(george);
  const events = [];
  audio.subscribe((snap) => events.push(snap.state.input));
  await flush();
  assert.deepEqual(george.ids, ['sp-out']);
  assert.equal(scope.md.watchers, 1, 'devicechange is watched');
  const before = audio.wakeKey();

  // One missed enumeration (a Bluetooth mode switch): nothing changes.
  scope.md.change(MAC);
  clock.advance(250);
  await flush();
  assert.equal(audio.snapshot().state.input, 'suspect');
  scope.md.change([...MAC, ...SP]);
  clock.advance(250);
  await flush();
  clock.advance(5000);
  await flush();
  assert.equal(audio.snapshot().state.input, 'present');
  assert.deepEqual(george.ids, ['sp-out'], 'no sink change');
  assert.equal(audio.wakeKey(), before, 'Standby stays where it is');
  assert.equal(audio.awayLine(), '');

  // Turned off: missed now and 3 s later → gone: the default microphone and speaker.
  scope.md.change(MAC);
  clock.advance(250);
  await flush();
  assert.deepEqual(george.ids, ['sp-out'], 'not yet');
  clock.advance(3000);
  await flush();
  assert.equal(audio.snapshot().state.input, 'gone');
  assert.deepEqual(george.ids, ['sp-out', ''], 'setSinkId("")');
  assert.notEqual(audio.wakeKey(), before, 'Standby moves to the default microphone');
  assert.deepEqual(audio.wakeAudio(), { id: '', processing: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  assert.deepEqual(audio.standbyPill({ id: 'default', label: 'Default - MacBook Pro Microphone (Built-in)' }), { name: 'THE MAC’S MICROPHONE', gone: 'SPEAKERPHONE' });
  assert.equal(audio.awayLine(), 'I’m on the Mac’s speakers; the speakerphone isn’t connected.');
  assert.equal(audio.awayLine(), '', 'said once, at the next wake');

  // Back: at once.
  scope.md.change([...MAC, ...SP]);
  clock.advance(250);
  await flush();
  assert.equal(audio.snapshot().state.input, 'present');
  assert.deepEqual(george.ids, ['sp-out', '', 'sp-out']);
  assert.equal(audio.wakeKey(), before);
  assert.ok(events.includes('gone') && events[events.length - 1] === 'present');
  audio.destroy();
  assert.equal(scope.md.watchers, 0);
});

test('the capture that fell back by itself says so on the pill before the watcher confirms it', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const scope = fakeScope({ devices: MAC });
  const audio = createAudioDevices({ getSettings: () => SETUP2, scope });
  await flush();
  // Jarvis started with the speakerphone off: the first enumeration decides at once.
  assert.equal(audio.snapshot().state.input, 'gone');
  assert.equal(audio.wakeKey(true), audio.wakeKey(false), 'Standby on the default already: nothing to move');
  assert.deepEqual(audio.standbyPill({ id: 'default', label: 'Default - MacBook Pro Microphone (Built-in)', fellBack: true }), { name: 'THE MAC’S MICROPHONE', gone: 'SPEAKERPHONE' });
  audio.destroy();
});

test('setup 3: the listen chime waits for the speakerphone’s microphone (at most 1.2 s); other setups play it at once', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const played = [];
  const scope = fakeScope();
  let settings = SETUP3;
  const audio = createAudioDevices({ getSettings: () => settings, scope, playChime: (name, o) => played.push([name, o]) });
  await flush();
  assert.equal(audio.holdChime('listen-stop'), false);
  assert.equal(audio.holdChime('listen-start', { hidden: true }), true, 'held');
  clock.advance(1199);
  assert.deepEqual(played, []);
  clock.advance(1);
  assert.deepEqual(played, [['listen-start', { hidden: true }]], 'after 1.2 s at the latest');
  settings = SETUP1;
  audio.settingsChanged();
  await flush();
  assert.equal(audio.holdChime('listen-start'), false, 'the Mac’s microphone: no switch, no wait');
  audio.destroy();
});

test('Standby’s one-time line: nothing chosen and a Bluetooth output, once on this device', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const bt = [mic('default', 'Default - MacBook Pro Microphone (Built-in)', 'g-mac'), MAC[1], out('default', 'Default - Desk Speakerphone (Bluetooth)', 'g-sp'), MAC[3], ...SP];
  const scope = fakeScope({ devices: bt });
  const audio = createAudioDevices({ getSettings: () => ({}), scope });
  assert.equal(await audio.firstTimeLine(), 'Using a Bluetooth speakerphone? Set it up in Settings → Voice.');
  assert.equal(await audio.firstTimeLine(), '', 'once');
  const builtin = createAudioDevices({ getSettings: () => ({}), scope: fakeScope() });
  assert.equal(await builtin.firstTimeLine(), '', 'the Mac’s own speakers: nothing to say');
  const chosen = createAudioDevices({ getSettings: () => SETUP1, scope: fakeScope({ devices: bt }) });
  assert.equal(await chosen.firstTimeLine(), '', 'already set up');
  for (const a of [audio, builtin, chosen]) a.destroy();
});

test('the Mac slept: a long jump in Date.now() wakes the listeners and probes George once', async (t) => {
  const clock = installClock();
  t.after(() => clock.restore());
  const scope = fakeScope();
  const audio = createAudioDevices({ getSettings: () => SETUP1, scope });
  const george = sink({ probe: true });
  audio.addSink(george);
  let woke = 0;
  const off = audio.onWoke(() => (woke += 1));
  clock.advance(60000); // throttled timers in a hidden page: not a sleep
  assert.equal(woke, 0);
  // Asleep for an hour: timers didn't run, the clock jumped.
  const saved = Date.now;
  const asleepAt = Date.now();
  Date.now = () => asleepAt + 3600000;
  try {
    clock.advance(15000);
  } finally {
    Date.now = saved;
  }
  assert.equal(woke, 1);
  assert.equal(george.probes, 1);
  off();
  audio.destroy();
});

test('openMic: the device asked for, or the default when it isn’t there', async () => {
  const scope = fakeScope();
  const m = await openMic({ id: 'sp-mic', processing: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }, { scope });
  assert.deepEqual([m.deviceId, m.label, m.fellBack], ['sp-mic', 'Desk Speakerphone (Bluetooth)', false]);
  m.stop();
  const f = await openMic({ id: 'nope' }, { scope });
  assert.deepEqual([f.deviceId, f.fellBack], ['default', true]);
  f.stop();
  scope.md.failNext.push('NotAllowedError');
  await assert.rejects(openMic({ id: 'sp-mic' }, { scope }), { name: 'NotAllowedError' });
  assert.equal(scope.md.live, 0);
});
