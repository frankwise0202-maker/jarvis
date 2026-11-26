// v8.1 Optics words (src/lib/optics-commands.js): "look …" no longer steals sentences (E4, the 16
// steals of the voice study's probe), "open optics" by voice (E2: voiceOpticsOpen, and "video mode"),
// "take a picture" (E7), the words for a Look set aside beside the live video (E1: expand, aside,
// close the picture, back to live) and its question rule (asideQuestionRoute). The ordinary
// sentences of the no-steal corpus stay with Jarvis in every Optics state. Pure functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FRESH_LOOK_QUESTION,
  asideQuestionRoute,
  findNamedCamera,
  isCameraRequest,
  isLiveViewRequest,
  isOpticsOpenRequest,
  matchOpticsCommand,
  opticsOpenLine,
  voiceCameraRequest,
  voiceLiveViewRequest,
  voiceOpticsOpen,
} from '../../src/lib/optics-commands.js';
import { matchResearchThis } from '../../src/lib/research-offer.js';

const cmd = (text, opts) => matchOpticsCommand(text, opts);
const action = (text, opts) => (cmd(text, opts) || {}).action || null;

// The voice study's probe found 24 ordinary sentences taken by a local command; 16 of them were
// Optics' "look …" (8 sentences, with the camera live and with a Look on screen).
const LOOK_STEALS = [
  'look up the laptop battery part number',
  'look into the warranty',
  'look into flights for me',
  'take a look at my calendar',
  'look at my calendar',
  'look at my email',
  'look it up online',
  'look it up',
];

test('E4: the 16 steals: "look up …", "look into …", "look at my calendar", "look it up" go to Jarvis, live or frozen', () => {
  let freed = 0;
  for (const words of LOOK_STEALS) {
    for (const frozen of [false, true]) {
      assert.equal(cmd(words, { frozen }), null, `${words} (frozen ${frozen})`);
      freed += 1;
    }
  }
  assert.equal(freed, 16);
});

test('E4: "look" alone, "look here", "look now", "look at this / that / it / me" with at most three more words stay Looks', () => {
  for (const words of ['Look', 'look here', 'Look now', 'Look at this', 'look at that', 'Look at it', 'look at me', 'look at these', 'Look at this thing here', 'look at that one please', 'Take a look', 'take a look at this', 'Have a look at it, Jarvis', 'take a quick look']) {
    const m = cmd(words);
    assert.equal(m && m.action, 'look', words);
    assert.equal(m.explicit, true, words);
    assert.notEqual(m.fresh, true, `${words}: not a "fresh" word`);
  }
  // Four or more words after "look at this" are a sentence of their own.
  assert.equal(cmd('look at this from the other side'), null);
  assert.equal(cmd('take a look at the news'), null);
  // A question about "this" with the camera live is still a Look by design.
  assert.equal(action('Look at this, is it ripe?'), 'look');
});

test('E1/E7: "look again", "new look", "what about now", "take a picture" always take a new picture', () => {
  for (const words of ['Look again', 'new look', 'Take another look', 'look closer', 'New picture', 'Take a picture', 'take a photo', 'Take a photo of this', 'snap a picture', 'take a pic of me', "take a picture of what I'm holding"]) {
    for (const frozen of [false, true]) {
      assert.deepEqual(cmd(words, { frozen }), { action: 'look', question: FRESH_LOOK_QUESTION, explicit: true, fresh: true }, `${words} (frozen ${frozen})`);
    }
  }
  assert.equal(FRESH_LOOK_QUESTION, 'What am I looking at?');
  // A question of its own keeps its words.
  assert.deepEqual(cmd('What about now?'), { action: 'look', question: 'What about now?', explicit: true, fresh: true });
  assert.deepEqual(cmd('And now?', { frozen: true }), { action: 'look', question: 'And now?', explicit: true, fresh: true });
  // "What about this one?" points at the scene, but is not "always new" (the aside rule decides).
  assert.equal(cmd('What about this one?').fresh, undefined);
  for (const words of ['take a picture with my phone', 'take a picture of the moon tonight', 'take a picture with flash', 'snap a picture tips', 'how do I take a picture of the moon', 'take a break', 'new look for my living room']) {
    assert.equal(cmd(words), null, words);
  }
});

test('E1: expand the picture, put it aside, close the picture; back to live and the live video are Live, never the live view', () => {
  for (const words of ['Expand the picture', 'expand the photo', 'expand it', 'Show the picture big', 'make the picture bigger', 'show me the picture full screen', 'enlarge the image']) {
    assert.deepEqual(cmd(words), { action: 'expand' }, words);
  }
  for (const words of ['Put the picture aside', 'put the photo to the side', 'put it aside', 'set the picture aside', 'put the picture back in its card']) {
    assert.deepEqual(cmd(words), { action: 'aside' }, words);
  }
  for (const words of ['Close the picture', 'hide the photo', 'dismiss the picture', 'clear the image']) {
    assert.deepEqual(cmd(words), { action: 'close-card' }, words);
  }
  for (const words of ['Back to live', 'show the live video', 'the live video', 'Go live', 'back to the camera', 'show me the camera']) {
    assert.deepEqual(cmd(words), { action: 'live' }, words);
    assert.equal(isLiveViewRequest(words), false, `${words}: never the live view`);
  }
  // Still the camera's own words.
  assert.equal(action('close the camera'), 'close');
  assert.equal(action('close it'), 'close');
  for (const words of ['put this aside for later', 'close the window please the bugs are coming in', 'expand the business', 'show me the picture of the moon']) {
    assert.equal(cmd(words), null, words);
  }
});

test('E2: "video mode" is the live view in the owner\'s words (on and off)', () => {
  for (const words of ['Video mode', 'start video mode', 'Turn on video mode', 'video mode on', 'switch to video mode', 'go into video mode']) {
    assert.deepEqual(cmd(words), { action: 'liveview', on: true }, words);
    assert.equal(isLiveViewRequest(words), true, words);
    assert.equal(voiceLiveViewRequest(words, { cameraAllowed: 'granted' }), 'start', words);
    assert.equal(voiceLiveViewRequest(words, { cameraAllowed: 'granted', ios: true }), 'need-tap', words);
  }
  for (const words of ['Video mode off', 'stop video mode', 'turn off video mode', 'turn video mode off', 'exit video mode']) {
    assert.deepEqual(cmd(words), { action: 'liveview', on: false }, words);
  }
  for (const words of ['video mode on a GoPro', 'what is video mode', 'live view on Google Maps', 'start live streaming on YouTube']) {
    assert.equal(isLiveViewRequest(words), false, words);
    assert.notEqual(action(words), 'liveview', words);
  }
});

test('E2: "open optics" and its cousins open the camera, free: a Mac where it is allowed opens it; hidden, a notification; iPhone or not allowed, a tap', () => {
  const words = [
    'open optics',
    'Hey Jarvis, open optics',
    'Optics',
    'open the camera',
    'Turn on the camera',
    'camera on',
    'start the camera',
    'show me the camera',
    'turn the camera on',
    'open my webcam',
    'Jarvis, open the optics please',
    'switch cameras',
    'use the front camera',
    'Use the Logitech camera',
  ];
  for (const w of words) {
    assert.equal(isOpticsOpenRequest(w), true, w);
    assert.equal(voiceOpticsOpen(w, { cameraAllowed: 'granted', ios: false }), 'open', w);
    assert.equal(voiceOpticsOpen(w, { cameraAllowed: 'granted', ios: false, hidden: true }), 'need-front', `${w} (hidden)`);
    assert.equal(voiceOpticsOpen(w, { cameraAllowed: 'prompt', ios: false }), 'need-tap', `${w} (not allowed yet)`);
    assert.equal(voiceOpticsOpen(w, { cameraAllowed: 'granted', ios: true }), 'need-tap', `${w} (iPhone)`);
    assert.equal(voiceOpticsOpen(w, { cameraAllowed: 'granted', ios: true, hidden: true }), 'need-tap', `${w} (iPhone: a tap)`);
    assert.equal(isCameraRequest(w), false, `${w}: never a Look by itself`);
  }
  assert.equal(voiceOpticsOpen('open optics'), 'need-tap', 'defaults: permission unknown');
  for (const w of ['open the camera app on my phone', 'turn on the camera flash', 'turn off the camera sound on my phone', 'show me the camera settings on my phone', 'is the camera on', 'the camera on my phone is broken', 'why is my camera blurry', 'what is the best webcam for streaming', 'how do I switch cameras in a video call', 'switch cameras on my phone', 'flip a coin', 'flip', 'optics is a branch of physics', 'open a bank account online']) {
    assert.equal(voiceOpticsOpen(w, { cameraAllowed: 'granted' }), null, w);
  }
  // Optics open: the switches are Optics' own.
  assert.deepEqual(cmd('Use the Logitech camera'), { action: 'camera', name: 'logitech' });
  assert.deepEqual(cmd('switch to the MacBook camera'), { action: 'camera', name: 'macbook' });
  assert.deepEqual(cmd('use the built-in camera'), { action: 'camera', name: 'built-in' });
  assert.deepEqual(cmd('use the other camera'), { action: 'flip', side: null });
  assert.deepEqual(cmd('use the front camera'), { action: 'flip', side: 'front' });
});

test('a camera by its name: the word finds it among the described cameras (cameras.js)', () => {
  const cams = [
    { id: 'mb', name: 'MacBook camera', label: 'FaceTime HD Camera (Built-in)', detail: 'FaceTime HD Camera', kind: 'builtin' },
    { id: 'lg', name: 'Logitech webcam', label: 'HD Pro Webcam C920 (046d:082d)', detail: 'C920', kind: 'usb' },
    { id: 'ip', name: 'iPhone (Continuity Camera)', label: 'Phone Camera', detail: '', kind: 'continuity' },
    { id: 'dv', name: 'Desk View', label: 'Desk View Camera', detail: 'iPhone desk camera', kind: 'continuity' },
  ];
  assert.equal(findNamedCamera(cams, 'logitech').id, 'lg');
  assert.equal(findNamedCamera(cams, 'macbook').id, 'mb');
  assert.equal(findNamedCamera(cams, 'mac').id, 'mb');
  assert.equal(findNamedCamera(cams, 'built-in').id, 'mb');
  assert.equal(findNamedCamera(cams, 'external').id, 'lg');
  assert.equal(findNamedCamera(cams, 'usb').id, 'lg');
  assert.equal(findNamedCamera(cams, 'iphone').id, 'ip', 'the iPhone itself, not its Desk View');
  assert.equal(findNamedCamera(cams, 'desk view').id, 'dv');
  assert.equal(findNamedCamera(cams, 'studio display'), null);
  assert.equal(findNamedCamera([], 'logitech'), null);
  assert.equal(findNamedCamera(null, 'logitech'), null);
});

test('E7 with Optics closed: "take a picture" follows the camera rules first (never a Look before the camera is on)', () => {
  const mac = { cameraAllowed: 'granted', ios: false };
  for (const w of ['Take a picture', 'take a photo of this', 'snap a picture']) {
    assert.equal(isCameraRequest(w), true, w);
    assert.equal(voiceCameraRequest(w, mac), 'look', w);
    assert.equal(voiceCameraRequest(w, { ...mac, hidden: true }), 'need-front', `${w} (hidden)`);
    assert.equal(voiceCameraRequest(w, { ...mac, ios: true }), 'need-tap', `${w} (iPhone)`);
    assert.equal(voiceCameraRequest(w, { ...mac, viewerOpen: true }), null, `${w} (a hologram on screen)`);
  }
  assert.equal(voiceCameraRequest('What am I looking at?', { ...mac, hidden: true }), 'need-front', 'the camera words follow the same rule');
  assert.equal(isCameraRequest('take a picture with my phone'), false);
});

test('E1: a question with a Look set aside: explicit follow-ups and the card\'s labels go to the card; "look again" always looks; anything else by the scene', () => {
  const labels = ['USB-C charger', 'Desk lamp'];
  const route = (text, sceneChanged) => asideQuestionRoute(text, { cmd: matchOpticsCommand(text, { frozen: true }), labels, sceneChanged });
  for (const changed of [false, true]) {
    assert.equal(route('Tell me more', changed), 'card', `more (changed ${changed})`);
    assert.equal(route("What's this part?", changed), 'card');
    assert.equal(route('How many watts is the USB-C charger?', changed), 'card', 'names a label');
    assert.equal(route('Is the desk lamp LED?', changed), 'card');
    assert.equal(route('About the picture, what brand is it?', changed), 'card');
    assert.equal(route('What is written in the picture?', changed), 'card');
    assert.equal(route('Look again', changed), 'look');
    assert.equal(route('New look', changed), 'look');
    assert.equal(route('What about now?', changed), 'look');
    assert.equal(route('Take a picture', changed), 'look');
  }
  // Anything else: the card while the scene is the card's, a new Look once it changed.
  for (const words of ['What is this?', 'What am I holding?', 'Is this ripe?', 'Read this', 'What brand is this?', 'What about this one?', 'How much does it cost?']) {
    assert.equal(route(words, false), 'card', `${words}: the same scene`);
    assert.equal(route(words, true), 'look', `${words}: a new scene`);
  }
  // A label is matched as whole words; one word of it is not enough.
  assert.equal(route('Is the charger hot?', true), 'look');
  assert.equal(asideQuestionRoute('what is this', {}), 'card');
  assert.equal(asideQuestionRoute('what is this', { sceneChanged: true, labels: null }), 'look');
});

// The no-steal corpus's sentences (the voice study's, without brand names), in every Optics state:
// none is taken by an Optics, open-optics, picture or research word, except Optics' own "this"
// questions while the camera is live or a Look is on screen (a Look or a follow-up by design).
const NOT = [
  'what is the weather tomorrow', 'how do I open a new window in Chrome', 'what is the best webcam for streaming', 'why is my camera blurry',
  'how do I switch cameras in a video call', 'how do I take a screenshot on a Mac', 'how do I take a picture of the moon', 'should I research before buying a laptop',
  'what does research show about sleep', 'what is a live view on a camera', 'how much does a video camera cost', 'can you watch my house while I am away',
  'is the camera on', 'research the best laptops under 800 dollars', 'find me a 4K monitor under 300 dollars', 'look up the laptop battery part number',
  'show me a hologram of a jet engine', 'open a bank account online', 'close the garage door', 'turn on the lights', 'take a picture with my iPhone',
  'take a break', 'show me the money', 'show me the way to go home', 'pull up a chair', 'start the car', 'flip a coin', 'read me a poem',
  'history of the camera', 'video of cats', 'live music near me', 'watch the movie Dune', 'look into the warranty', 'look into flights for me',
  'the camera on my phone is broken', 'pull this up', 'put this aside for later', 'take a look at my calendar', 'look at my calendar', 'look at my email',
  'watch out for ice tomorrow', 'now what', 'that one', 'look it up online', 'look it up', 'search it up online', 'open the camera app on my phone',
  'turn on the camera flash', 'turn off the camera sound on my iPhone', 'show me the camera settings on my phone', 'take a picture of the moon tonight',
  'take a picture with flash', 'snap a picture tips', 'switch cameras on my iPhone', 'video mode on a GoPro', 'live view on Google Maps',
  'start live streaming on YouTube', 'walk me through how to replace the battery', 'what tools do I need to open it', 'is it hard to open the bottom cover',
];
// By design: "this one" is Optics' own "this" question (a Look with the camera live, a follow-up with
// a Look on screen); "show me a hologram of …" said with Optics open is Optics' "hologram of" (the
// frame goes with it, about half a cent, and Claude still builds what was named: the study's "low").
const BY_DESIGN = new Set(['this one', 'show me a hologram of a jet engine']);

test('the no-steal corpus stays with Jarvis in every Optics state (closed, live, a Look on screen or aside)', () => {
  const taken = [];
  for (const words of NOT) {
    if (voiceOpticsOpen(words, { cameraAllowed: 'granted' })) taken.push(`open: ${words}`);
    if (isCameraRequest(words)) taken.push(`camera: ${words}`);
    if (matchResearchThis(words)) taken.push(`research: ${words}`);
    for (const frozen of [false, true]) {
      const m = cmd(words, { frozen });
      if (m && !BY_DESIGN.has(words)) taken.push(`optics ${frozen ? 'frozen' : 'live'}: ${words} -> ${m.action}`);
    }
  }
  assert.deepEqual(taken, []);
});

test('R10: with a laptop hologram on screen, "open the camera" is its camera part, selected as today, with the hint for Optics', async () => {
  const { register, OPTICS_HINT } = await import('../../src/ui/commands/optics.js');
  const entries = new Map();
  const calls = [];
  register({ register: (e) => entries.set(e.id, e) }, { hologramPart: (args) => (calls.push(args), { say: `Here's the webcam. ${args.hint}` }) });
  const part = entries.get('optics-camera-part');
  assert.ok(part && part.layer === 'top', 'registered before the hologram\'s own entry');
  const parts = [{ id: 'keyboard', name: 'Keyboard', aka: [] }, { id: 'webcam', name: 'Webcam', aka: ['camera'] }];
  const VH = { surface: 'voice', hologram: { open: true, inWindow: false, parts, selected: null } };
  for (const words of ['open the camera', 'camera on', 'show me the camera']) assert.equal((part.match(words, VH) || {}).do, 'hologram-part', words);
  // "Open optics" is always Optics (optics-open); a hologram without a camera part, or none, leaves it.
  assert.equal(part.match('open optics', VH), null);
  assert.equal(part.match('open the camera', { ...VH, hologram: { ...VH.hologram, parts: parts.slice(0, 1) } }), null);
  assert.equal(part.match('open the camera', { surface: 'voice' }), null);
  assert.equal(part.match('open the camera', { ...VH, hologram: { ...VH.hologram, inWindow: true } }), null);
  const out = await part.run(part.match('open the camera', VH), { reading: 'open the camera', surface: 'voice' });
  assert.equal(OPTICS_HINT, 'Say ‘open Optics’ for your camera.');
  assert.equal(out.say, `Here's the webcam. ${OPTICS_HINT}`);
  assert.deepEqual(calls, [{ text: 'open the camera', surface: 'voice', hint: OPTICS_HINT }]);
});

test('E2: what Jarvis says once Optics opened by voice knows how the camera started: "Optics is on." only when it is live', () => {
  assert.equal(opticsOpenLine({ ok: true }), 'Optics is on.');
  assert.equal(opticsOpenLine({ error: 'No camera was found on this device.', code: 'no-camera' }), 'I can’t find a camera.');
  const busy = 'The camera is in use by another app. Close it (a video call, the Camera app), then try again.';
  assert.equal(opticsOpenLine({ error: busy, code: 'busy' }), busy);
  assert.equal(opticsOpenLine({ error: 'Camera access is blocked for Jarvis.', code: 'denied' }), 'Camera access is blocked for Jarvis.');
  assert.equal(opticsOpenLine({ timeout: true }), 'The camera is starting.');
  assert.equal(opticsOpenLine({ paused: true }), 'Optics is open. The camera waits until I’m on screen.');
  for (const r of [{ error: 'Closed.' }, {}, null, undefined]) assert.equal(opticsOpenLine(r), 'The camera couldn’t start.');
});
