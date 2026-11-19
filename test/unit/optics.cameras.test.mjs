// The Optics camera picker's pure logic (src/lib/cameras.js): friendly names from the labels real
// browsers give, picker order, the remembered camera (by id, then label, then the default), and
// what happens when a camera is plugged in or unplugged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraLabelKey, defaultCamera, describeCamera, hotplugPlan, listCameras, pickCamera } from '../../src/lib/cameras.js';

const dev = (deviceId, label, extra = {}) => ({ kind: 'videoinput', deviceId, groupId: `g-${deviceId}`, label, ...extra });

const MAC = [dev('mac1', 'FaceTime HD Camera (Built-in) (05ac:8514)'), dev('logi1', 'Logitech BRIO (046d:085e)')];
const IPHONE = [dev('f', 'Front Camera'), dev('b', 'Back Camera'), dev('uw', 'Back Ultra Wide Camera'), dev('t', 'Back Telephoto Camera'), dev('tri', 'Back Triple Camera')];

test('friendly names: Mac built-in and the Logitech webcam, iPhone lenses, Android, Windows, Continuity, virtual cameras', () => {
  const name = (label, os = 'mac') => describeCamera(dev('x', label), { os }).name;
  assert.equal(name('FaceTime HD Camera'), 'MacBook camera');
  assert.equal(name('MacBook Pro Camera (0000:0001)'), 'MacBook camera');
  assert.equal(name('MacBook Air Camera'), 'MacBook camera');
  assert.equal(name('Logitech BRIO (046d:085e)'), 'Logitech webcam');
  assert.equal(name('HD Pro Webcam C920 (046d:082d)'), 'Logitech webcam', 'Logitech by its USB vendor id');
  assert.equal(name('Logi C270 HD WebCam'), 'Logitech webcam');
  assert.equal(describeCamera(dev('x', 'HD Pro Webcam C920 (046d:082d)'), { os: 'mac' }).detail, 'HD Pro Webcam C920');
  assert.equal(name("Tony's iPhone Camera"), 'iPhone (Continuity Camera)');
  assert.equal(name("Tony's iPhone Desk View Camera"), 'Desk View');
  assert.equal(name('Studio Display Camera'), 'Studio Display camera');
  assert.equal(name('OBS Virtual Camera'), 'OBS Virtual Camera');
  assert.equal(describeCamera(dev('x', 'OBS Virtual Camera'), { os: 'mac' }).detail, 'Virtual camera');
  assert.equal(name('Elgato Facecam (0fd9:0078)'), 'Elgato Facecam', 'another USB camera keeps its own name, without the ids');
  assert.equal(describeCamera(dev('x', 'Elgato Facecam (0fd9:0078)'), { os: 'mac' }).detail, 'USB camera');
  assert.equal(name('Integrated Camera', 'windows'), 'Built-in camera');
  assert.equal(name('HP TrueVision HD Camera', 'windows'), 'Built-in camera');
  // iPhone: Front and Back, and the extra back lenses Safari lists separately.
  assert.deepEqual(IPHONE.map((d) => describeCamera(d, { os: 'ios' }).name), ['Front', 'Back', 'Back Ultra Wide', 'Back Telephoto', 'Back Triple']);
  assert.deepEqual(IPHONE.map((d) => describeCamera(d, { os: 'ios' }).facing), ['front', 'rear', 'rear', 'rear', 'rear']);
  // Android Chrome.
  assert.equal(name('camera2 1, facing front', 'android'), 'Front camera');
  assert.equal(describeCamera(dev('x', 'camera2 0, facing back'), { os: 'android' }).facing, 'rear');
  // Before the camera is allowed, labels are empty: numbered, or by the facing the browser reports.
  assert.equal(describeCamera(dev('', ''), { os: 'mac', index: 1 }).name, 'Camera 2');
  assert.equal(describeCamera(dev('', '', { facing: 'user' }), { os: 'ios' }).name, 'Front camera');
  // A computer's webcam has no facing (the preview is mirrored like a mirror, see camera.js).
  assert.equal(describeCamera(MAC[0], { os: 'mac' }).facing, null);
  // Hostile labels are plain text on one line.
  assert.equal(name(`Cam\u202e\u0007era ${'x'.repeat(200)}`, 'linux').length <= 80, true);
  assert.doesNotMatch(name('Cam\u202eera\nTwo', 'linux'), /[\u202e\n]/);
});

test('picker order: built-in first on a computer; back lenses then front on a phone; duplicate names told apart', () => {
  assert.deepEqual(listCameras([MAC[1], MAC[0], dev('obs', 'OBS Virtual Camera')], { os: 'mac' }).map((c) => c.name), ['MacBook camera', 'Logitech webcam', 'OBS Virtual Camera']);
  assert.deepEqual(listCameras(IPHONE, { os: 'ios' }).map((c) => c.name), ['Back', 'Back Ultra Wide', 'Back Telephoto', 'Back Triple', 'Front']);
  const two = listCameras([MAC[0], dev('l1', 'HD Pro Webcam C920 (046d:082d)'), dev('l2', 'Logitech BRIO (046d:085e)')], { os: 'mac' });
  assert.deepEqual(two.map((c) => c.name), ['MacBook camera', 'Logitech webcam (HD Pro Webcam C920)', 'Logitech webcam (BRIO)']);
  const same = listCameras([dev('a', 'camera2 0, facing back'), dev('c', 'camera2 2, facing back'), dev('b', 'camera2 1, facing front')], { os: 'android' });
  assert.deepEqual(same.map((c) => c.name), ['Back camera', 'Back camera 2', 'Front camera']);
  // Audio devices and duplicates are left out.
  assert.equal(listCameras([...MAC, { kind: 'audioinput', deviceId: 'mic', label: 'MacBook Pro Microphone' }, MAC[0]], { os: 'mac' }).length, 2);
  assert.deepEqual(listCameras(null), []);
});

test('the remembered camera: by device id, else by label (the USB ids may change), else the default', () => {
  const cams = listCameras(MAC, { os: 'mac' });
  assert.equal(pickCamera(cams, { id: 'logi1', label: '' }, { os: 'mac' }).by, 'id');
  const byLabel = pickCamera(cams, { id: 'gone', label: 'Logitech BRIO (046d:0999)' }, { os: 'mac' });
  assert.deepEqual([byLabel.by, byLabel.camera.id], ['label', 'logi1']);
  assert.equal(cameraLabelKey('Logitech BRIO (046d:085e)'), 'logitech brio');
  const fallback = pickCamera(cams, { id: 'gone', label: 'Some other camera' }, { os: 'mac' });
  assert.deepEqual([fallback.by, fallback.camera.name], ['default', 'MacBook camera']);
  assert.deepEqual(pickCamera(cams, null, { os: 'mac' }).camera.name, 'MacBook camera');
  assert.equal(pickCamera([], { id: 'logi1' }), null);
  // Phones fall back to the main back camera.
  assert.equal(defaultCamera(listCameras(IPHONE, { os: 'ios' }), { os: 'ios' }).name, 'Back');
  assert.equal(pickCamera(listCameras(IPHONE, { os: 'ios' }), { id: 'uw', label: 'Back Ultra Wide Camera' }, { os: 'ios' }).camera.name, 'Back Ultra Wide');
});

test('hot-plug: the remembered webcam plugged in is switched to; the camera in use unplugged falls back to the built-in one', () => {
  const builtIn = listCameras([MAC[0]], { os: 'mac' });
  const both = listCameras(MAC, { os: 'mac' });
  const remembered = { id: 'logi1', label: 'Logitech BRIO (046d:085e)' };
  // Plugged in, and it is the one the owner chose last: switch to it.
  const plug = hotplugPlan({ before: builtIn, after: both, currentId: 'mac1', remembered, os: 'mac' });
  assert.deepEqual([plug.action, plug.to.name, plug.added.map((c) => c.name)], ['switch', 'Logitech webcam', ['Logitech webcam']]);
  // Plugged in, but the owner chose the built-in camera last: only listed.
  const listed = hotplugPlan({ before: builtIn, after: both, currentId: 'mac1', remembered: { id: 'mac1', label: MAC[0].label }, os: 'mac' });
  assert.equal(listed.action, 'none');
  assert.equal(listed.added.length, 1);
  // Never remembered anything: only listed.
  assert.equal(hotplugPlan({ before: builtIn, after: both, currentId: 'mac1', remembered: null, os: 'mac' }).action, 'none');
  // The webcam in use is unplugged: back to the built-in camera, naming the one that went away.
  const unplug = hotplugPlan({ before: both, after: builtIn, currentId: 'logi1', remembered, os: 'mac' });
  assert.deepEqual([unplug.action, unplug.to.name, unplug.gone.name, unplug.removed.map((c) => c.name)], ['fallback', 'MacBook camera', 'Logitech webcam', ['Logitech webcam']]);
  // Another camera unplugged: nothing to do for the one in use.
  assert.equal(hotplugPlan({ before: both, after: builtIn, currentId: 'mac1', remembered, os: 'mac' }).action, 'none');
  // The last camera unplugged: nothing to switch to.
  assert.equal(hotplugPlan({ before: builtIn, after: [], currentId: 'mac1', remembered, os: 'mac' }).action, 'none');
});
