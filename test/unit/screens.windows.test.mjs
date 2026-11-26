// Windows by voice (v8.1): the matcher for words about several windows (src/lib/window-commands.js).
// Pure. Named windows, layouts, "do this in this window", the front; words that need a window open
// only while one is; questions and ordinary sentences go to Jarvis; it never takes what the Screens
// matcher (screen-commands.js) already takes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchWindowCommand, windowKindOf, windowName } from '../../src/lib/window-commands.js';
import { matchScreenCommand } from '../../src/lib/screen-commands.js';

const NONE = { windows: [] };
const ONE = { windows: [{ id: 'a', kind: 'camera', label: 'WINDOW', focused: false }] };
const TWO = { windows: [{ id: 'a', kind: 'camera', label: 'WINDOW', focused: false }, { id: 'b', kind: 'hologram', label: 'WINDOW', focused: true }] };
const pick = (m) => (m ? Object.fromEntries(Object.entries(m).filter(([k]) => !['do', 'free', 'undo', 'check', 'camera'].includes(k))) : null);

test('the owner\'s words: several named windows, side by side, this window', () => {
  assert.deepEqual(pick(matchWindowCommand('close the camera window', TWO)), { op: 'close', which: 'camera' });
  assert.deepEqual(pick(matchWindowCommand('Close the hologram window.', TWO)), { op: 'close', which: 'hologram' });
  assert.deepEqual(pick(matchWindowCommand('side by side', TWO)), { op: 'arrange', layout: 'side-by-side', a: null, b: null });
  assert.deepEqual(pick(matchWindowCommand('camera on the left, hologram on the right', NONE)), { op: 'arrange', layout: 'left-right', a: 'camera', b: 'hologram' });
  assert.deepEqual(pick(matchWindowCommand('put the camera and the hologram side by side', NONE)), { op: 'arrange', layout: 'left-right', a: 'camera', b: 'hologram' });
  assert.deepEqual(pick(matchWindowCommand('split the screen', ONE)), { op: 'arrange', layout: 'side-by-side', a: null, b: null });
  assert.deepEqual(pick(matchWindowCommand("Okay, we'll do this in this window", NONE)), { op: 'here', which: null });
  assert.deepEqual(pick(matchWindowCommand('show it here', ONE)), { op: 'here', which: null });
  assert.deepEqual(pick(matchWindowCommand('show the report here', ONE)), { op: 'here', which: 'answer' });
  assert.deepEqual(pick(matchWindowCommand('show me the hologram window', TWO)), { op: 'focus', which: 'hologram' });
  assert.deepEqual(pick(matchWindowCommand('close everything', TWO)), { op: 'close-all', viewers: true });
});

test('every action is free and local; closing never comes from an alternative reading', () => {
  const close = matchWindowCommand('close the camera window', TWO);
  assert.deepEqual([close.do, close.free, close.undo, close.check, close.camera], ['window', true, false, false, false]);
  const arrange = matchWindowCommand('side by side', TWO);
  assert.deepEqual([arrange.do, arrange.free, arrange.undo, arrange.check], ['window', true, true, false]);
});

test('left and right, in either order; one thing alone only while a window is open', () => {
  const lr = (t, st = TWO) => {
    const m = matchWindowCommand(t, st);
    return m && m.op === 'arrange' ? [m.a, m.b] : null;
  };
  assert.deepEqual(lr('hologram on the right, camera on the left'), ['camera', 'hologram']);
  assert.deepEqual(lr('put the camera on the left and the hologram on the right'), ['camera', 'hologram']);
  assert.deepEqual(lr('move the report to the right side'), [null, 'answer']);
  assert.deepEqual(lr('put the camera on the left'), ['camera', null]);
  assert.equal(lr('put the camera on the left', NONE), null, 'no window open: not a layout');
  assert.equal(lr('show the model on the right', TWO), null, 'the hologram\'s own view words');
  assert.equal(lr('put the camera on the left and the hologram on the left'), null, 'both on one side');
});

test('words that need a window open; named windows always count (and say when there is none)', () => {
  for (const t of ['side by side', 'split the screen', 'tile them', 'put them next to each other']) {
    assert.equal(matchWindowCommand(t, NONE), null, `${t}: no window open`);
    assert.equal(matchWindowCommand(t, ONE)?.op, 'arrange', t);
  }
  assert.equal(matchWindowCommand('swap them', ONE), null, 'two are needed to swap');
  assert.equal(matchWindowCommand('swap them', TWO)?.op, 'swap');
  assert.equal(matchWindowCommand('close the camera window', NONE)?.op, 'close', 'Jarvis says there is none');
});

test('"this window" phrasings', () => {
  for (const t of ['do this in this window', "we'll do this in this window", 'let\'s do it in this window', 'keep it in this window', 'use this window', 'put it here', 'bring it over here', 'open this here', 'work on this in this window']) {
    assert.equal(matchWindowCommand(t, NONE)?.op, 'here', t);
  }
  assert.equal(matchWindowCommand('show the camera here', NONE)?.which, 'camera');
});

test('not window commands: questions, ordinary sentences, what Screens takes', () => {
  const negatives = [
    'how do I split my screen on a MacBook',
    'can I open two windows side by side on a Mac',
    'what is a side by side refrigerator',
    'side by side comparison of iPhones',
    'put them side by side in the photo',
    'close the window please the bugs are coming in',
    'I left the window open',
    'the window is open',
    'open the window it is hot',
    'swap the windows on my house',
    'make the window bigger in my kitchen remodel',
    'close the garage door',
    'close it',
    'show me the money',
    'here it is',
    'put this aside for later',
    'what is this window',
    'is this window open',
    'how do I close everything on my Mac',
    // Screens' own words stay Screens' (one matcher each)
    'close that window',
    'close the window',
    'close the other screen',
    'close all windows',
    'bring the hologram back',
    'put the camera in a window',
    'float it',
    '',
    'a '.repeat(30) + 'side by side',
  ];
  for (const t of negatives) assert.equal(matchWindowCommand(t, TWO), null, `"${t}"`);
  for (const t of ['close that window', 'close the window', 'close all windows', 'bring the hologram back', 'put the camera in a window']) assert.ok(matchScreenCommand(t), `Screens takes "${t}"`);
});

test('names: spoken names to kinds, and what Jarvis calls each window', () => {
  assert.equal(windowKindOf('the camera feed'), 'camera');
  assert.equal(windowKindOf('3d model'), 'hologram');
  assert.equal(windowKindOf('research report'), 'answer');
  assert.equal(windowKindOf('mission control'), 'mission');
  assert.equal(windowKindOf('web page'), 'link');
  assert.equal(windowKindOf('weather'), null);
  assert.equal(windowName('camera'), 'the camera window');
  assert.equal(windowName('answer', { report: true }), 'the report window');
  assert.equal(windowName('mission'), 'the Mission Control window');
  assert.equal(windowName('link'), 'the page window');
});
