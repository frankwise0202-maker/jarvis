// The camera platform module's pure parts (src/platform/camera.js): how getUserMedia /
// getDisplayMedia failures are classified, and the "camera is blocked" steps per platform.
// The live camera itself is covered by the E2E scenarios (a fake camera in Chromium).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CameraError, classifyCameraError, deniedHelp } from '../../src/platform/camera.js';

const err = (name, message = '') => Object.assign(new Error(message), { name });

test('classifyCameraError maps every DOMException name the browsers use', () => {
  const cases = [
    ['NotAllowedError', 'denied'],
    ['PermissionDeniedError', 'denied'],
    ['NotFoundError', 'no-camera'],
    ['DevicesNotFoundError', 'no-camera'],
    ['NotReadableError', 'busy'],
    ['TrackStartError', 'busy'],
    ['OverconstrainedError', 'overconstrained'],
    ['ConstraintNotSatisfiedError', 'overconstrained'],
    ['AbortError', 'aborted'],
    ['TypeError', 'unsupported'],
    ['WeirdError', 'other'],
  ];
  for (const [name, code] of cases) {
    const e = classifyCameraError(err(name));
    assert.ok(e instanceof CameraError, name);
    assert.equal(e.code, code, name);
    assert.ok(e.message.length > 10, `${name} has a message for the owner`);
  }
  assert.match(classifyCameraError(err('NotReadableError')).message, /in use by another app/);
  const own = new CameraError('busy', 'x');
  assert.equal(classifyCameraError(own), own, 'already classified');
  assert.equal(classifyCameraError(null).code, 'other');
});

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
};

test('deniedHelp: the steps for the platform the owner is on', () => {
  const tab = deniedHelp(UA.iphone, { standalone: false });
  assert.equal(tab.title, 'Allow the camera in Safari');
  assert.match(tab.steps.join(' '), /aA .*Website Settings › Camera › Allow/);
  const app = deniedHelp(UA.iphone, { standalone: true });
  assert.match(app.steps.join(' '), /Settings › Apps › Safari › Camera/);
  assert.match(app.steps.join(' '), /open it again/, 'a Home Screen app: relaunch, then allow');
  assert.match(deniedHelp(UA.android, { standalone: false }).steps.join(' '), /Permissions › Camera/);
  assert.match(deniedHelp(UA.macSafari, { standalone: false }).steps.join(' '), /Settings for This Website/);
  const mac = deniedHelp(UA.macChrome, { standalone: false });
  assert.match(mac.steps.join(' '), /System Settings › Privacy & Security › Camera/);
  assert.doesNotMatch(deniedHelp(UA.windows, { standalone: false }).steps.join(' '), /System Settings/);
  // An iPad that reports a desktop UA is still iOS.
  assert.equal(deniedHelp(UA.macSafari, { standalone: false, touchPoints: 5 }).title, 'Allow the camera in Safari');
  assert.match(deniedHelp(UA.macSafari, { standalone: false, touchPoints: 5 }).steps.join(' '), /aA/);
});
