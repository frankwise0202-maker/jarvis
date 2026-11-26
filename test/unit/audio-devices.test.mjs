// Microphone and speaker on a computer (src/lib/audio-devices.js, v8.1, SPEC §28.2-§28.3): names and
// connections from the labels Chrome on a Mac really gives, the remembered device (by id, then label), the
// three setups for a Bluetooth speakerphone, the two-enumeration rule when a device comes and goes, Standby's
// capture back-off on a virtual clock, and the hands-free Test's stored results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AUDIO_SETUPS,
  RECOMMENDED_SETUP,
  SETUP_IDS,
  audioConstraints,
  audioHotplugPlan,
  audioTransport,
  awayLine,
  captureRetryDelay,
  captureRetryable,
  chosenDevices,
  clockJumped,
  createBackoff,
  describeAudioDevice,
  deviceTitle,
  goneName,
  goneOf,
  handsFreeLines,
  initialHotplugState,
  listAudioDevices,
  micPillName,
  normalizeHandsFreeTest,
  pickDevice,
  planSetup,
  setupDevices,
  setupOf,
  trackStartSupport,
} from '../../src/lib/audio-devices.js';
import { installClock } from './platform.voice.fakeengine.test.mjs';

const mic = (deviceId, label, groupId = `g-${deviceId}`) => ({ kind: 'audioinput', deviceId, groupId, label });
const out = (deviceId, label, groupId = `g-${deviceId}`) => ({ kind: 'audiooutput', deviceId, groupId, label });

// A MacBook in Chrome with a Bluetooth speakerphone paired (its microphone and speaker share a group).
const MAC_BT = [
  mic('default', 'Default - MacBook Pro Microphone (Built-in)', 'g-mac'),
  mic('mac-mic', 'MacBook Pro Microphone (Built-in)', 'g-mac'),
  mic('sp-mic', 'Desk Speakerphone (Bluetooth)', 'g-sp'),
  out('default', 'Default - Desk Speakerphone (Bluetooth)', 'g-sp'),
  out('mac-out', 'MacBook Pro Speakers (Built-in)', 'g-mac'),
  out('sp-out', 'Desk Speakerphone (Bluetooth)', 'g-sp'),
  { kind: 'videoinput', deviceId: 'cam', groupId: 'g-cam', label: 'FaceTime HD Camera' },
];

test('connections from the labels Chrome on a Mac writes, and plain names without them', () => {
  assert.equal(audioTransport('MacBook Pro Microphone (Built-in)'), 'builtin');
  assert.equal(audioTransport('Desk Speakerphone (Bluetooth)'), 'bluetooth');
  assert.equal(audioTransport('Headphones (Bluetooth LE)'), 'bluetooth-le');
  assert.equal(audioTransport('Desk Speakerphone (1234:5678)'), 'usb', 'USB devices carry their vendor:product id');
  assert.equal(audioTransport('Virtual Cable (Virtual)'), 'virtual');
  assert.equal(audioTransport('Aggregate Device (Aggregate)'), 'aggregate');
  assert.equal(audioTransport('Display Audio (DisplayPort)'), 'displayport');
  assert.equal(audioTransport('TV (HDMI)'), 'hdmi');
  assert.equal(audioTransport('Living Room (AirPlay)'), 'airplay');
  assert.equal(audioTransport('Default - MacBook Pro Microphone (Built-in)'), 'builtin', 'the Default - prefix is not part of it');
  assert.equal(audioTransport('Microphone Array (Audio Device)'), '', 'Windows labels name a driver, not a connection');
  assert.equal(audioTransport(''), '');
  assert.equal(audioTransport(null), '');

  const d = describeAudioDevice(mic('sp-mic', 'Desk Speakerphone (Bluetooth)'));
  assert.deepEqual([d.name, d.connection, d.transport, d.kind, d.isDefault], ['Desk Speakerphone', 'Bluetooth', 'bluetooth', 'audioinput', false]);
  assert.equal(deviceTitle(d), 'Desk Speakerphone · Bluetooth');
  assert.equal(deviceTitle(describeAudioDevice(mic('m', 'MacBook Pro Microphone (Built-in)'))), 'MacBook Pro Microphone · Built-in');
  assert.equal(deviceTitle(describeAudioDevice(mic('u', 'Desk Speakerphone (1234:5678)'))), 'Desk Speakerphone · USB');
  assert.equal(deviceTitle(describeAudioDevice(mic('w', 'Microphone Array (Audio Device)'))), 'Microphone Array (Audio Device)');
  const def = describeAudioDevice(mic('default', 'Default - MacBook Pro Microphone (Built-in)'));
  assert.equal(def.isDefault, true);
  assert.equal(def.label, 'MacBook Pro Microphone (Built-in)', 'the label without the prefix');
  assert.equal(describeAudioDevice(out('communications', 'Communications - Speakers (Audio Device)')).isDefault, true);
  // Before the microphone is allowed: no labels.
  assert.equal(describeAudioDevice(mic('', '')).name, 'Microphone');
  assert.equal(describeAudioDevice(out('', '')).name, 'Speaker');
  // Hostile labels are one line of plain text.
  const odd = describeAudioDevice(mic('x', `Mic\u202e\u0007 two\nlines ${'x'.repeat(300)} (Bluetooth)`));
  assert.doesNotMatch(odd.name, /[\u202e\u0007\n]/);
  assert.ok(odd.name.length <= 80);
});

test('the lists: microphones and speakers, Chrome’s default entries named as what they stand for', () => {
  const l = listAudioDevices(MAC_BT);
  assert.deepEqual(l.inputs.map((d) => d.id), ['mac-mic', 'sp-mic']);
  assert.deepEqual(l.outputs.map((d) => d.id), ['mac-out', 'sp-out']);
  assert.equal(l.defaultInput.id, 'mac-mic');
  assert.equal(l.defaultOutput.id, 'sp-out', 'the default output is the speakerphone here');
  assert.equal(l.labelled, true);
  // Before permission: one unnamed entry per kind, nothing to choose but the default.
  const blank = listAudioDevices([mic('', ''), out('', ''), { kind: 'videoinput', deviceId: '', label: '' }]);
  assert.deepEqual([blank.inputs.length, blank.outputs.length, blank.labelled, blank.defaultInput, blank.defaultOutput], [0, 0, false, null, null]);
  // Safari lists no default entry: the first one is the default.
  const safari = listAudioDevices([mic('a', 'iPhone Microphone'), mic('b', 'Other')]);
  assert.equal(safari.defaultInput.id, 'a');
  // The same device twice is listed once.
  assert.equal(listAudioDevices([...MAC_BT, MAC_BT[1]]).inputs.length, 2);
  assert.deepEqual(listAudioDevices(null).inputs, []);
});

test('the remembered device: by id, else by label (ids change when site data is cleared), else the default, missing', () => {
  const l = listAudioDevices(MAC_BT);
  assert.equal(pickDevice(l.inputs, { id: 'sp-mic', label: 'whatever' }).by, 'id');
  const byLabel = pickDevice(l.inputs, { id: 'old-id', label: 'Desk Speakerphone (Bluetooth)' });
  assert.deepEqual([byLabel.by, byLabel.device.id, byLabel.missing], ['label', 'sp-mic', false]);
  assert.deepEqual(pickDevice(l.inputs, null), { device: null, by: 'default', missing: false });
  assert.deepEqual(pickDevice(l.inputs, { id: '', label: '' }), { device: null, by: 'default', missing: false });
  const gone = pickDevice(l.inputs, { id: 'other', label: 'Other Speakerphone (Bluetooth)' });
  assert.deepEqual([gone.device, gone.missing], [null, true]);
  assert.deepEqual(chosenDevices({ audioInputId: 'a', audioInputLabel: 'A', audioOutputId: '', audioOutputLabel: '' }), { input: { id: 'a', label: 'A' }, output: null });
  assert.equal(setupOf({ audioSetup: 'switch' }), 'switch');
  assert.equal(setupOf({ audioSetup: 'nonsense' }), '');
  assert.equal(setupOf({}), '');
});

test('the three setups: names, the recommended one (owner question 1), and the devices each one stores', () => {
  assert.deepEqual(SETUP_IDS, ['speaker-mac-mic', 'speakerphone-both', 'switch']);
  assert.equal(RECOMMENDED_SETUP, 'speaker-mac-mic');
  assert.deepEqual(AUDIO_SETUPS.map((s) => [s.id, s.title, s.recommended, s.experimental]), [
    ['speaker-mac-mic', 'Speakerphone speaks, Mac listens', true, false],
    ['speakerphone-both', 'Speakerphone for both', false, false],
    ['switch', 'Switch', false, true],
  ]);
  const l = listAudioDevices(MAC_BT);
  const ids = (r) => [r.input && r.input.id, r.output && r.output.id];
  assert.deepEqual(ids(setupDevices('speaker-mac-mic', l)), ['mac-mic', 'sp-out']);
  assert.deepEqual(ids(setupDevices('speakerphone-both', l)), ['sp-mic', 'sp-out']);
  assert.deepEqual(ids(setupDevices('switch', l)), ['sp-mic', 'sp-out']);
  // The speakerphone isn't the default output: still found (a Bluetooth output with a microphone of its own).
  const notDefault = listAudioDevices([MAC_BT[1], MAC_BT[2], out('default', 'Default - MacBook Pro Speakers (Built-in)', 'g-mac'), MAC_BT[4], MAC_BT[5]]);
  assert.deepEqual(ids(setupDevices('speaker-mac-mic', notDefault)), ['mac-mic', 'sp-out']);
  // Bluetooth headphones without a microphone come after the speakerphone.
  const withHeadphones = listAudioDevices([MAC_BT[1], MAC_BT[2], out('default', 'Default - MacBook Pro Speakers (Built-in)', 'g-mac'), out('hp', 'Headphones (Bluetooth)'), MAC_BT[4], MAC_BT[5]]);
  assert.deepEqual(ids(setupDevices('speakerphone-both', withHeadphones)), ['sp-mic', 'sp-out']);
  // A speaker already chosen by hand stays the speakerphone.
  assert.deepEqual(ids(setupDevices('speakerphone-both', withHeadphones, { output: { id: 'hp', label: 'Headphones (Bluetooth)' } })), ['sp-mic', 'hp']);
  // No speakerphone at all: the Mac's microphone and the default speaker.
  const plain = listAudioDevices([MAC_BT[1], MAC_BT[4]]);
  assert.deepEqual(ids(setupDevices('speaker-mac-mic', plain)), ['mac-mic', null]);
});

test('planSetup: which microphone wakes Jarvis, which hears questions, where he plays; no choice = today', () => {
  const l = listAudioDevices(MAC_BT);
  const chosen1 = { input: { id: 'mac-mic', label: 'MacBook Pro Microphone (Built-in)' }, output: { id: 'sp-out', label: 'Desk Speakerphone (Bluetooth)' } };
  const p1 = planSetup('speaker-mac-mic', l, chosen1);
  assert.deepEqual([p1.wakeMic.id, p1.questionMic.id, p1.speaker.id], ['mac-mic', 'mac-mic', 'sp-out']);
  assert.deepEqual(p1.wakeProcessing, { echoCancellation: true, noiseSuppression: false, autoGainControl: false }, 'setup 1: echo cancellation on, claps need NS and AGC off');
  assert.equal(p1.bluetoothMic, false);
  assert.equal(p1.bluetoothSpeaker, true);

  const chosen2 = { input: { id: 'sp-mic', label: 'Desk Speakerphone (Bluetooth)' }, output: chosen1.output };
  const p2 = planSetup('speakerphone-both', l, chosen2);
  assert.deepEqual([p2.wakeMic.id, p2.questionMic.id, p2.speaker.id], ['sp-mic', 'sp-mic', 'sp-out']);
  assert.deepEqual(p2.wakeProcessing, { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, 'setup 2: raw, as Standby always was');
  assert.equal(p2.bluetoothMic, true);

  const p3 = planSetup('switch', l, chosen2);
  assert.deepEqual([p3.wakeMic.id, p3.questionMic.id, p3.speaker.id], ['mac-mic', 'sp-mic', 'sp-out'], 'setup 3: the Mac waits for "Hey Jarvis", the speakerphone hears the question');
  assert.deepEqual(p3.wakeProcessing, { echoCancellation: true, noiseSuppression: false, autoGainControl: false });
  assert.deepEqual(p3.questionProcessing, { echoCancellation: true, noiseSuppression: true, autoGainControl: true });

  // Nothing chosen: no device anywhere (Chrome's own choice, the default output), raw Standby: today.
  const none = planSetup('', l, {});
  assert.deepEqual([none.none, none.custom, none.wakeMic, none.questionMic, none.speaker], [true, false, null, null, null]);
  assert.deepEqual(none.wakeProcessing, { echoCancellation: false, noiseSuppression: false, autoGainControl: false });
  // Picked by hand without a setup ("Custom"): the microphone does both, raw for Standby.
  const custom = planSetup('', l, { input: chosen2.input, output: null });
  assert.deepEqual([custom.custom, custom.wakeMic.id, custom.questionMic.id, custom.speaker], [true, 'sp-mic', 'sp-mic', null]);

  // A chosen device confirmed gone: the default meanwhile, and the plan says so.
  const gone = planSetup('speakerphone-both', l, chosen2, { input: true, output: true });
  assert.deepEqual([gone.wakeMic, gone.questionMic, gone.speaker], [null, null, null]);
  assert.deepEqual(gone.missing, { input: true, output: true });
  // Missed by one enumeration only (not confirmed gone): still used, by its remembered id.
  const once = planSetup('speakerphone-both', listAudioDevices([MAC_BT[1], MAC_BT[4]]), chosen2, {});
  assert.deepEqual([once.questionMic.id, once.speaker.id, once.missing.input], ['sp-mic', 'sp-out', false]);
  assert.equal(once.questionMic.transport, 'bluetooth', 'described from its remembered label');
});

test('getUserMedia constraints: the device by exact id with its processing; the default without an id', () => {
  const l = listAudioDevices(MAC_BT);
  const p = planSetup('switch', l, { input: { id: 'sp-mic', label: '' }, output: null });
  assert.deepEqual(audioConstraints(p.wakeMic, p.wakeProcessing), { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 }, deviceId: { exact: 'mac-mic' } });
  assert.deepEqual(audioConstraints(p.questionMic, p.questionProcessing), { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: { ideal: 1 }, deviceId: { exact: 'sp-mic' } });
  assert.deepEqual(audioConstraints(null), { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 1 } });
  assert.equal('deviceId' in audioConstraints({ id: 'default' }), false);
});

test('coming and going: gone only after two enumerations about 3 s apart; back at once; one miss changes nothing', () => {
  const both = listAudioDevices(MAC_BT);
  const macOnly = listAudioDevices([MAC_BT[0], MAC_BT[1], out('default', 'Default - MacBook Pro Speakers (Built-in)', 'g-mac'), MAC_BT[4]]);
  const chosen = { input: { id: 'sp-mic', label: 'Desk Speakerphone (Bluetooth)' }, output: { id: 'sp-out', label: 'Desk Speakerphone (Bluetooth)' } };
  let r = audioHotplugPlan({ state: initialHotplugState(), devices: both, chosen, now: 1000 });
  assert.deepEqual([r.state.input, r.state.output, r.actions, r.recheckAt], ['present', 'present', [], 0]);
  // A devicechange (a Bluetooth mode switch, or the speakerphone turned off): missed once → suspect, check again in 3 s.
  r = audioHotplugPlan({ state: r.state, devices: macOnly, chosen, now: 2000 });
  assert.deepEqual([r.state.input, r.state.output, r.actions.length, r.recheckAt], ['suspect', 'suspect', 0, 5000]);
  assert.deepEqual(goneOf(r.state), { input: false, output: false });
  // A second devicechange 1 s later still misses it: not yet (too soon to count).
  const early = audioHotplugPlan({ state: r.state, devices: macOnly, chosen, now: 3000 });
  assert.deepEqual([early.state.input, early.actions.length, early.recheckAt], ['suspect', 0, 5000]);
  // The re-check 3 s after the first miss: gone, fall back to the default.
  const gone = audioHotplugPlan({ state: early.state, devices: macOnly, chosen, now: 5000 });
  assert.deepEqual([gone.state.input, gone.state.output], ['gone', 'gone']);
  assert.deepEqual(gone.actions.map((a) => `${a.role}:${a.action}`), ['input:fallback', 'output:fallback']);
  assert.deepEqual(goneOf(gone.state), { input: true, output: true });
  // Still gone: nothing more to do.
  const still = audioHotplugPlan({ state: gone.state, devices: macOnly, chosen, now: 9000 });
  assert.deepEqual([still.state.input, still.actions.length], ['gone', 0]);
  // Back: at once (no second enumeration needed), with the device to use.
  const back = audioHotplugPlan({ state: still.state, devices: both, chosen, now: 20000 });
  assert.deepEqual(back.actions.map((a) => `${a.role}:${a.action}:${a.device.id}`), ['input:back:sp-mic', 'output:back:sp-out']);
  assert.deepEqual([back.state.input, back.state.output], ['present', 'present']);
  // A single missed enumeration (the mode switch): back in the next one, no action at all.
  const miss = audioHotplugPlan({ state: back.state, devices: macOnly, chosen, now: 30000 });
  const seen = audioHotplugPlan({ state: miss.state, devices: both, chosen, now: 33000 });
  assert.deepEqual([miss.actions.length, seen.actions.length, seen.state.input], [0, 0, 'present']);
  // At start (nothing known yet): the first enumeration decides at once.
  const start = audioHotplugPlan({ state: initialHotplugState(), devices: macOnly, chosen, now: 0 });
  assert.deepEqual(start.actions.map((a) => a.action), ['fallback', 'fallback']);
  // Nothing chosen: nothing to watch.
  const none = audioHotplugPlan({ state: initialHotplugState(), devices: macOnly, chosen: {}, now: 0 });
  assert.deepEqual([none.state.input, none.state.output, none.actions.length], ['none', 'none', 0]);
  // Another device chosen: what was known about the old one doesn't count.
  const other = { input: { id: 'mac-mic', label: '' }, output: chosen.output };
  const switched = audioHotplugPlan({ state: gone.state, devices: macOnly, chosen: other, now: 40000 });
  assert.deepEqual([switched.state.input, switched.state.output, switched.actions.length], ['present', 'gone', 0]);
});

test('Standby’s capture back-off: 2 s, 5 s, 15 s, 60 s, then every 5 minutes, on a virtual clock', (t) => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(captureRetryDelay), [2000, 5000, 15000, 60000, 300000, 300000]);
  assert.equal(captureRetryDelay(-1), 2000);
  assert.deepEqual(['busy', 'no-mic', 'error', 'ended', 'denied', 'unsupported', 'needs-tap'].map(captureRetryable), [true, true, true, true, false, false, false]);
  const clock = installClock();
  t.after(() => clock.restore());
  const tries = [];
  const t0 = clock.now;
  const b = createBackoff(() => tries.push(clock.now - t0));
  // Fails five times in a row: each retry waits longer.
  assert.equal(b.failed(), 2000);
  clock.advance(2000);
  assert.equal(b.failed(), 5000);
  clock.advance(5000);
  assert.equal(b.failed(), 15000);
  clock.advance(15000);
  assert.equal(b.failed(), 60000);
  clock.advance(60000);
  assert.equal(b.failed(), 300000);
  assert.equal(b.pending, true);
  clock.advance(300000);
  assert.deepEqual(tries, [2000, 7000, 22000, 82000, 382000]);
  // It works: the next failure starts from 2 s again.
  b.succeeded();
  assert.equal(b.failed(), 2000);
  b.cancel();
  clock.advance(10000);
  assert.equal(tries.length, 5, 'a cancelled retry never runs');
  assert.equal(b.pending, false);
});

test('the Mac slept: a long jump in Date.now(), not a throttled background timer', () => {
  assert.equal(clockJumped(1000, 1000 + 15000), false);
  assert.equal(clockJumped(1000, 1000 + 60000), false, 'hidden pages may run timers once a minute');
  assert.equal(clockJumped(1000, 1000 + 15000 + 120001), true);
  assert.equal(clockJumped(1000, 1000 + 3600000), true, 'an hour asleep');
  assert.equal(clockJumped(0, 999999999), false, 'no earlier reading');
  assert.equal(clockJumped(5000, 1000), false, 'the clock set back');
});

test('the Standby pill and the wake line name the microphone and the speakerphone', () => {
  const l = listAudioDevices(MAC_BT);
  assert.equal(micPillName(l.inputs[0]), 'THE MAC’S MICROPHONE');
  assert.equal(micPillName(l.inputs[1]), 'DESK SPEAKERPHONE');
  assert.equal(micPillName(null), 'THIS DEVICE');
  assert.equal(goneName(l.inputs[1]), 'SPEAKERPHONE');
  assert.equal(goneName(describeAudioDevice(mic('u', 'Desk Mic (1234:5678)'))), 'DESK MIC');
  const chosen = { input: { id: 'sp-mic', label: 'Desk Speakerphone (Bluetooth)' }, output: { id: 'sp-out', label: 'Desk Speakerphone (Bluetooth)' } };
  const macOnly = listAudioDevices([MAC_BT[1], out('default', 'Default - MacBook Pro Speakers (Built-in)', 'g-mac'), MAC_BT[4]]);
  assert.equal(awayLine(planSetup('speakerphone-both', macOnly, chosen, { input: true, output: true }), macOnly), 'I’m on the Mac’s speakers; the speakerphone isn’t connected.');
  assert.equal(awayLine(planSetup('speakerphone-both', macOnly, chosen, { input: true }), macOnly), 'I’m listening on the Mac’s microphone; the speakerphone isn’t connected.');
  assert.equal(awayLine(planSetup('speakerphone-both', l, chosen), l), '');
  assert.equal(awayLine(null), '');
});

test('the recognizer hears a track in Chrome and Edge 135+ on a computer and Firefox 160+; never on a phone', () => {
  const brands = (v) => [{ brand: 'Not.A/Brand', version: '99' }, { brand: 'Chromium', version: String(v) }, { brand: 'Google Chrome', version: String(v) }];
  const mac = (v) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v}.0.0.0 Safari/537.36`;
  assert.equal(trackStartSupport({ brands: brands(135), mobile: false, userAgent: mac(135) }), true);
  assert.equal(trackStartSupport({ brands: brands(134), mobile: false, userAgent: mac(134) }), false, 'older Chrome ignores the track silently');
  assert.equal(trackStartSupport({ userAgent: mac(142) }), true, 'by the user agent when there are no brands');
  assert.equal(trackStartSupport({ userAgent: mac(120) }), false);
  assert.equal(trackStartSupport({ brands: [{ brand: 'Microsoft Edge', version: '140' }], userAgent: `${mac(140)} Edg/140.0.0.0` }), true);
  assert.equal(trackStartSupport({ brands: brands(140), mobile: true, userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/140.0 Mobile' }), false, 'Android has no start(track)');
  assert.equal(trackStartSupport({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:160.0) Gecko/20100101 Firefox/160.0' }), true);
  assert.equal(trackStartSupport({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:140.0) Gecko/20100101 Firefox/140.0' }), false);
  assert.equal(trackStartSupport({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Safari/605.1.15' }), false, 'Safari');
  assert.equal(trackStartSupport({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 Version/26.1 Mobile/15E148 Safari/604.1' }), false);
  assert.equal(trackStartSupport(), false);
});

test('the hands-free Test: the stored shape Voice Mode’s barge-in reads, checked, and the card’s lines', () => {
  const r = normalizeHandsFreeTest({ at: 1764100000000, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: false, extra: 'x' });
  assert.deepEqual(r, { at: 1764100000000, hiddenWords: true, selfTrigger: 'passed', heardSpeaker: false });
  assert.deepEqual(normalizeHandsFreeTest(JSON.stringify({ at: 5, hiddenWords: 'yes', selfTrigger: 'maybe', heardSpeaker: null })), { at: 5, hiddenWords: null, selfTrigger: null, heardSpeaker: null });
  assert.equal(normalizeHandsFreeTest('{not json'), null);
  assert.equal(normalizeHandsFreeTest({ hiddenWords: true }), null, 'no time: not a result');
  assert.equal(normalizeHandsFreeTest([]), null);
  assert.equal(normalizeHandsFreeTest(null), null);
  const lines = handsFreeLines({ at: 1, hiddenWords: false, selfTrigger: 'failed', heardSpeaker: true });
  assert.deepEqual(lines.map((x) => [x.step, x.ok]), [['hidden', false], ['self', false], ['speaker', true]]);
  assert.match(lines[1].text, /interrupting him by voice stays off/);
  assert.deepEqual(handsFreeLines(null), []);
});
