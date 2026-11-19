// Screens (v7): the local matcher for spoken and typed screen commands (src/lib/screen-commands.js).
// Free and strict: a known object plus a place, every other word a command word; speech-to-text
// slips folded in; questions and requests for new content go to Jarvis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchScreenCommand, normalizeScreenText } from '../../src/lib/screen-commands.js';

const pick = (m) => (m ? { action: m.action, what: m.what, where: m.where, screen: m.screen, ordinal: m.ordinal } : null);
const open = (what, where, screen = null, ordinal = null) => ({ action: 'open', what, where, screen, ordinal });

test('the owner\'s own phrasings (the request) match', () => {
  const cases = [
    ['open this on my other screen', open('this', 'other')],
    ['put the hologram on screen 2', open('hologram', 'other', 2)],
    ['pull it up beside me', open('this', 'beside')],
    ['float it', open('this', 'beside')],
    ['open it in a window', open('this', 'window')],
    ['Open this up in another, like, screen or something', open('this', 'other')],
    ['pull it up beside what I\'m looking at', open('this', 'beside')],
    ['If I say open this up in another screen', null], // a sentence about commands, not a command
  ];
  for (const [text, want] of cases) assert.deepEqual(pick(matchScreenCommand(text)), want, text);
  assert.equal(matchScreenCommand('bring it back').action, 'back');
  assert.equal(matchScreenCommand('close the other screen').action, 'close');
});

test('objects: this, the content kinds and their spoken names', () => {
  const cases = [
    ['put the report on my other screen', 'answer'],
    ['put the research on my second monitor', 'answer'],
    ['show the answer on screen 2', 'answer'],
    ['put what you just said on screen 2', 'answer'],
    ['move mission control to screen 2', 'mission'],
    ['put the agents on my other screen', 'mission'],
    ['float the blueprint', 'blueprint'],
    ['put the schematic on screen 2', 'blueprint'],
    ['open the 2d drawing in a window', 'blueprint'],
    ['put the 3d model on my other screen', 'hologram'],
    ['open the photo on my other monitor', 'photo'],
    ['send the camera to my other screen', 'camera'],
    ['put the camera feed on screen 2', 'camera'],
    ['open the link in a new window', 'link'],
    ['open the website on my other screen', 'link'],
    ['put that on the big screen', 'this'],
    ['show this on my external display', 'this'],
    ['throw it up on screen two', 'this'],
    ['put this one beside me', 'this'],
  ];
  for (const [text, what] of cases) {
    const m = matchScreenCommand(text);
    assert.ok(m, `${text} matches`);
    assert.equal(m.what, what, text);
    assert.equal(m.action, 'open', text);
  }
});

test('places: other screen (with numbers), beside / floating, its own window', () => {
  const cases = [
    ['display it on monitor 2', 'other', 2],
    ['open the report on monitor two', 'other', 2],
    ['show me the hologram on my second monitor', 'other', 2],
    ['put it on the second screen', 'other', 2],
    ['put this on the TV', 'other', null],
    ['move it over to my other screen', 'other', null],
    ['shift it to the other monitor', 'other', null],
    ['put it on screen 3', 'other', 3],
    ['put it on screen one', 'other', 1],
    ['keep it on top', 'beside', null],
    ['make it float', 'beside', null],
    ['pop it out', 'beside', null],
    ['pop out the report', 'beside', null],
    ['put mission control next to me', 'beside', null],
    ['put it on the side', 'beside', null],
    ['open the hologram picture in picture', 'beside', null],
    ['put the report in its own window', 'window', null],
    ['open the blueprint in a separate window', 'window', null],
    ['open this in a new tab', 'window', null],
    ['open it in another window', 'window', null],
  ];
  for (const [text, where, screen] of cases) {
    const m = matchScreenCommand(text);
    assert.ok(m, `${text} matches`);
    assert.equal(m.where, where, text);
    assert.equal(m.screen, screen, text);
  }
});

test('the laptop\'s own screen, the main screen and full screen', () => {
  let m = matchScreenCommand('put it on my laptop screen');
  assert.equal(m.where, 'other');
  assert.equal(m.target, 'internal');
  m = matchScreenCommand('put the report on the main screen');
  assert.equal(m.target, 'primary');
  m = matchScreenCommand('put the hologram full screen on my other monitor');
  assert.equal(m.where, 'other');
  assert.equal(m.fullscreen, true);
  assert.equal(matchScreenCommand('float it full screen').fullscreen, false, 'a floating panel is never full screen');
});

test('links: ordinals pick a link of the newest answer', () => {
  assert.equal(matchScreenCommand('open the second link on my other screen').ordinal, 2);
  assert.equal(matchScreenCommand('put the third link on screen 2').ordinal, 3);
  assert.equal(matchScreenCommand('open link 2 in a window').ordinal, 2);
  assert.equal(matchScreenCommand('open the last link in a window').ordinal, -1);
  assert.equal(matchScreenCommand('open the link in a window').ordinal, null);
  assert.equal(matchScreenCommand('put the second report on screen 2').ordinal, null, 'ordinals only for links and photos');
});

test('speech-to-text slips are folded in', () => {
  const cases = [
    ['put the hologram on screen to', open('hologram', 'other', 2)],
    ['put it on screen too', open('this', 'other', 2)],
    ['put it on scream 2', open('this', 'other', 2)],
    ['flow it', open('this', 'beside')],
    ['flow the report', open('answer', 'beside')],
    ['besides me pull it up', open('this', 'beside')],
    ['pull it up by side me', open('this', 'beside')],
    ['put it on mother screen', open('this', 'other')],
    ['put it on my udder screen', open('this', 'other')],
    ['open it on the author monitor', open('this', 'other')],
    ['but it on my other screen', open('this', 'other')],
    ['put the hollow gram on my other screen', open('hologram', 'other')],
    ['put the blue print on screen two', open('blueprint', 'other', 2)],
    ['open the web cam on my other screen', open('camera', 'other')],
    ['Jarvis, can you please put this on my other screen?', open('this', 'other')],
    ['um so like just float it for me thanks', open('this', 'beside')],
    ['put this on my other screen as well', open('this', 'other')],
  ];
  for (const [text, want] of cases) assert.deepEqual(pick(matchScreenCommand(text)), want, text);
  for (const t of ['bring in back', 'bring it bag', 'ring it back', 'bringing it back', 'bring that back', 'bring the hologram back', 'put it back on this screen', 'bring everything back here']) {
    assert.equal(matchScreenCommand(t)?.action, 'back', t);
  }
  for (const t of ['clothes the other screen', 'close screen 2', 'close screen to', 'close all screens', 'close both screens', 'close the screens', 'hide the floating panel', 'close the float', 'kill screen two', 'dismiss the second window']) {
    assert.equal(matchScreenCommand(t)?.action, 'close', t);
  }
  assert.equal(matchScreenCommand('close screen 2').screen, 2);
  assert.equal(matchScreenCommand('close the floating window').where, 'beside');
  assert.equal(matchScreenCommand('close the window').ambiguous, true, '"close the window" is a screen command only while one is open');
});

test('not screen commands: questions, new content, other words', () => {
  const negatives = [
    'pull up the weather on my other screen', // a job for Jarvis (who can call open_screen after answering)
    'open google on my other screen',
    'how do I use a second monitor',
    'what is on my other screen',
    "what's a picture in picture window",
    'is my other screen connected',
    'show me a hologram of a jet engine',
    'show me the report',
    'float like a butterfly',
    'bring back the dinosaurs',
    'take it back',
    'I take it back',
    'close the deal',
    'close it',
    'open the window',
    'open the pod bay doors',
    'put a reminder on my screen',
    'open this on my other screen and explode it',
    'I need a bigger monitor for my desk',
    'explain how monitors work',
    'put the kettle on',
    'move the meeting to tuesday',
    'send an email to my boss',
    'pop the champagne',
    'make it shorter',
    'screen 2',
    'other screen',
    'put this and that on screen 2',
    '',
    '   ',
    'a '.repeat(30) + 'float it',
  ];
  for (const t of negatives) assert.equal(matchScreenCommand(t), null, `"${t}" is not a screen command`);
});

test('normalization: punctuation, apostrophes, fillers', () => {
  assert.equal(normalizeScreenText('  Jarvis — could you, um, FLOAT it?!  '), 'float it');
  assert.equal(normalizeScreenText("pull it up beside what I'm looking at"), 'pull it up beside what im looking at');
  assert.equal(normalizeScreenText('put it on screen #2'), 'put it on screen 2');
  assert.equal(normalizeScreenText(null), '');
});
