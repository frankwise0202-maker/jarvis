// Optics words and follow-ups (src/lib/optics-commands.js), the schematic's edge filter
// (src/ui/optics/schematic.js) and the Hologram-of-this estimate: pure functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hologramRequest, isCameraRequest, matchOpticsCommand, normalizeOpticsText, partQuestion, theName, voiceCameraRequest } from '../../src/lib/optics-commands.js';
import { edgeThreshold, sobelEdges } from '../../src/ui/optics/schematic.js';
import { estimateHologramCost, formatUsd } from '../../src/lib/optics.js';
import { commandAck } from '../../src/ui/voice-visuals.js';

const action = (text, opts) => {
  const m = matchOpticsCommand(text, opts);
  return m ? m.action : null;
};

test('"What am I looking at?" and its cousins are a Look, said to Jarvis or not, with the very words as the question', () => {
  for (const words of [
    'Jarvis, what am I looking at?',
    'What am I looking at',
    'what is this?',
    "What's this?",
    'whats that',
    'Hey Jarvis, what is this thing on my desk?',
    'What do you see?',
    'Can you see this?',
    'Look at this.',
    'Take a look',
    'Identify this, please',
    'Can you read this?',
    'What am I holding?',
    'What brand is this?',
    'What about now?',
    'And now?',
  ]) {
    const m = matchOpticsCommand(words);
    assert.equal(m && m.action, 'look', words);
    assert.equal(m.question, words.trim());
    assert.equal(m.explicit, true, `${words}: an explicit look`);
  }
  // A question about "this" with the camera live is a Look too, but not an explicit one (Voice Mode
  // with the camera closed asks for a tap only on explicit words).
  assert.deepEqual(matchOpticsCommand('Is this ripe?'), { action: 'look', question: 'Is this ripe?', explicit: false });
  assert.deepEqual(matchOpticsCommand('How do I fix this?'), { action: 'look', question: 'How do I fix this?', explicit: false });
  // With an answer on screen it is a follow-up about that frame.
  assert.equal(action('Is this ripe?', { frozen: true }), 'ask');
  assert.equal(action('What am I looking at?', { frozen: true }), 'look', 'an explicit look is always a new Look');
});

test('camera commands: flip (with a side), close, live, watch; the rest goes to Jarvis', () => {
  assert.deepEqual(matchOpticsCommand('Flip'), { action: 'flip', side: null });
  assert.deepEqual(matchOpticsCommand('switch cameras'), { action: 'flip', side: null });
  assert.deepEqual(matchOpticsCommand('Use the front camera'), { action: 'flip', side: 'front' });
  assert.deepEqual(matchOpticsCommand('back camera'), { action: 'flip', side: 'rear' });
  assert.deepEqual(matchOpticsCommand('selfie camera'), { action: 'flip', side: 'front' });
  for (const w of ['Close the camera', 'camera off', 'Stop looking.', 'close', 'Jarvis, close Optics']) assert.equal(action(w), 'close', w);
  for (const w of ['Go live', 'back to the camera', 'unfreeze']) assert.equal(action(w), 'live', w);
  assert.deepEqual(matchOpticsCommand('Watch this'), { action: 'watch', on: true });
  assert.deepEqual(matchOpticsCommand('stop watching'), { action: 'watch', on: false });
  for (const w of ['What is the weather today?', 'Is it going to rain?', 'Remind me to call Pepper', 'Open the pod bay doors', '', '   ']) assert.equal(matchOpticsCommand(w), null, `"${w}" is for Jarvis`);
  assert.equal(matchOpticsCommand('x'.repeat(300)), null);
  assert.equal(normalizeOpticsText('  Hey JARVIS, could you look at THIS, please?! '), 'look at this');
});

test('follow-ups: tell me more, what is this part, hologram of this (with its subject)', () => {
  assert.equal(action('Tell me more'), 'more');
  assert.equal(action('tell me more about it'), 'more');
  assert.equal(action("What's this part?"), 'part');
  assert.equal(action('what part is that'), 'part');
  assert.deepEqual(matchOpticsCommand('Hologram of this'), { action: 'hologram', subject: null });
  assert.deepEqual(matchOpticsCommand('Jarvis, make a hologram of the battery.'), { action: 'hologram', subject: 'battery' });
  assert.deepEqual(matchOpticsCommand('Show me this as a hologram'), { action: 'hologram', subject: null });
  assert.deepEqual(matchOpticsCommand('Can I see a hologram of that?'), { action: 'hologram', subject: null });
  assert.deepEqual(matchOpticsCommand('hollow gram of the screwdriver'), { action: 'hologram', subject: 'screwdriver' }, 'a speech slip');
  assert.equal(matchOpticsCommand('What is a hologram?'), null, 'a question about holograms is for Jarvis');
});

test('the messages the chips send: hologram request and part question, plain text written for Claude', () => {
  assert.equal(theName('AA battery'), 'the AA battery');
  assert.equal(theName('Coffee mug'), 'the coffee mug');
  assert.equal(theName('iPhone 15'), 'the iPhone 15');
  assert.equal(theName('The notebook'), 'the notebook');
  assert.equal(theName(''), '');
  assert.equal(hologramRequest('AA battery'), 'Show me a hologram of the AA battery.');
  assert.equal(hologramRequest(''), 'Show me a hologram of this.');
  assert.equal(hologramRequest(null), 'Show me a hologram of this.');
  assert.equal(partQuestion({ text: 'Screwdriver', x: 466, y: 810 }, 'f1'), "What's this part? (the screwdriver you pinned on frame f1, at 466, 810)");
  assert.equal(partQuestion({ text: 'Screwdriver', x: 466.6, y: 810.2 }, 'bad id'), "What's this part? (the screwdriver you pinned, at 467, 810)");
  assert.equal(partQuestion({ text: '' }, 'f1'), "What's this part?");
  assert.equal(partQuestion({ text: 'Mug\n\u0007x', x: 1, y: 2 }, 'f2'), "What's this part? (the mug x you pinned on frame f2, at 1, 2)");
});

test('the schematic: Sobel edges sit on the boundary of a shape; the threshold keeps the strongest share', () => {
  // A 12 × 8 image: black on the left half, white on the right.
  const w = 12;
  const h = 8;
  const gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = x < 6 ? 0 : 255;
  const edges = sobelEdges(gray, w, h);
  const at = (x, y) => edges[y * w + x];
  assert.ok(at(5, 4) > 0.5 && at(6, 4) > 0.5, 'strong on both sides of the step');
  assert.equal(at(2, 4), 0, 'flat black: no edge');
  assert.equal(at(9, 4), 0, 'flat white: no edge');
  assert.equal(at(0, 0), 0, 'borders are left at 0');
  assert.ok(Math.max(...edges) <= 1);
  const cut = edgeThreshold(edges, 0.12);
  const kept = edges.filter((e) => e >= cut).length;
  assert.ok(kept >= 1 && kept <= edges.length * 0.3, `kept ${kept} of ${edges.length}`);
  assert.deepEqual(Array.from(sobelEdges(new Uint8Array(4), 2, 2)), [0, 0, 0, 0], 'too small: nothing');
});

test('Hologram of this: about 16¢ on Opus 5.5 (the owner guide: 10–30¢), less on Sonnet', () => {
  const opus = estimateHologramCost({ model: 'claude-opus-5-5' }).usd;
  assert.ok(opus > 0.1 && opus < 0.3, `opus ${opus}`);
  assert.equal(formatUsd(opus), '16¢');
  const sonnet = estimateHologramCost({ model: 'claude-sonnet-5-5' }).usd;
  assert.ok(sonnet < opus);
  assert.ok(estimateHologramCost({ model: 'claude-opus-5-5', prefixCached: false }).usd > opus, 'a cold conversation costs more');
});

test('Voice Mode says Optics\' own short line for a command it handled', () => {
  assert.equal(commandAck({ action: 'optics', kind: 'flip', ack: 'Switching cameras.' }), 'Switching cameras.');
  assert.equal(commandAck({ action: 'optics', kind: 'look', ack: '' }), '');
  assert.equal(commandAck({ action: 'optics', ack: `  Camera\n off.  ${'x'.repeat(300)}` }).length, 160);
});

test('with the camera closed, only words plainly about seeing ask for it; "what\'s that?" stays a question for Jarvis', () => {
  for (const words of [
    'Jarvis, what am I looking at?',
    'What am I holding?',
    'What do you see?',
    'Can you see this?',
    'Can you see me?',
    'Do you see this?',
    'Look at this.',
    'Take a look',
    'Have a look at this, Jarvis',
    'Identify this, please',
    'What is this?',
    "What's this?",
    'whats this',
    'What are these?',
    'What is this thing on my desk?',
    'Tell me what you see',
    'What brand is this?',
    "What's in front of me?",
  ]) {
    assert.equal(isCameraRequest(words), true, words);
    assert.equal(action(words), 'look', `${words}: a Look once the camera is open`);
  }
  for (const words of [
    "What's that?",
    'What is it?',
    'whats that',
    'What is this song?',
    'What is this about?',
    'Look',
    'Look it up',
    'Take a look at the news',
    'Read this',
    'What about now?',
    'And now?',
    'Is this ripe?',
    'How do I fix this?',
    'What is the weather like?',
    '',
  ]) {
    assert.equal(isCameraRequest(words), false, words);
  }
});

test('with the camera closed, a whole short sentence about seeing asks for it, never a question that only starts like one (v7.1)', () => {
  // Ordinary questions that merely open with "what do you see…", "look at this…": Jarvis takes them as
  // usual. Before v7.1 the camera words matched how a sentence started, so on a Mac where the camera
  // was allowed these opened the webcam and sent a frame, and on an iPhone they were swallowed.
  for (const words of [
    'What do you see as the biggest risk in moving my savings into index funds?',
    'What can you see in these numbers?',
    'Do you see this working out?',
    'Look at this from the other side',
    'Identify these trends for me',
    'what do you see happening next year',
    'Tell me what you see in the data',
    'Do you see these prices going up?',
    'What am I looking at in terms of cost for a new roof?',
    'Describe what you see as the ideal plan',
    'See this through for me',
    'Look at me when I talk to you about the budget',
    'What am I holding back on in this plan?',
    'Recognize these patterns in my spending',
  ]) {
    assert.equal(isCameraRequest(words), false, words);
    for (const cameraAllowed of ['granted', 'prompt']) {
      assert.equal(voiceCameraRequest(words, { cameraAllowed, ios: false }), null, `${words} (${cameraAllowed})`);
      assert.equal(voiceCameraRequest(words, { cameraAllowed, ios: true }), null, `${words} (iOS, ${cameraAllowed})`);
    }
  }
  // A short tail about where to look keeps it a camera request.
  for (const words of [
    'What do you see?',
    'What do you see right now?',
    'What can you see here?',
    'What can you see in front of you?',
    'What am I looking at here?',
    'What am I holding in my hand?',
    'What am I pointing the camera at?',
    'Tell me what you see now',
    'Describe what you see',
    'So, what do you see, Jarvis?',
    'Look at me',
    'Look at these',
    "Look at what I'm holding",
    'Identify this, please',
    'Recognise these',
    'Do you see this?',
    'Can you see me?',
  ]) {
    assert.equal(isCameraRequest(words), true, words);
    assert.equal(voiceCameraRequest(words, { cameraAllowed: 'granted', ios: false }), 'look', words);
    assert.equal(voiceCameraRequest(words, { cameraAllowed: 'granted', ios: true }), 'need-tap', words);
  }
});

test('Voice Mode with the camera closed: a Mac where it is allowed looks; iPhone or no permission asks for a tap; a hologram on screen keeps "what is this?" for Jarvis', () => {
  const mac = { cameraAllowed: 'granted', ios: false };
  assert.equal(voiceCameraRequest('Jarvis, what am I looking at?', mac), 'look');
  assert.equal(voiceCameraRequest('What is this?', mac), 'look');
  for (const allowed of ['prompt', 'denied', 'unknown']) assert.equal(voiceCameraRequest('What is this?', { cameraAllowed: allowed, ios: false }), 'need-tap', allowed);
  assert.equal(voiceCameraRequest('What am I looking at?', { cameraAllowed: 'granted', ios: true }), 'need-tap', 'iOS asks inside a tap every time');
  // A hologram or blueprint covers Voice Mode: the words are about it, whatever the camera can do.
  for (const words of ['What is this?', 'What am I looking at?', 'Look at this.', 'What are these?']) {
    assert.equal(voiceCameraRequest(words, { ...mac, viewerOpen: true }), null, words);
    assert.equal(voiceCameraRequest(words, { cameraAllowed: 'prompt', ios: true, viewerOpen: true }), null, words);
  }
  // Not about seeing: Jarvis takes it as usual.
  for (const words of ["What's that?", 'What is it?', 'Tell me more.', 'How does the separator work?', '']) assert.equal(voiceCameraRequest(words, mac), null, words);
  assert.equal(voiceCameraRequest('What is this?'), 'need-tap', 'defaults: permission unknown');
});

test('ROUTING-R3-S1: every camera-off form isCameraCloseRequest takes is Optics\' own close (never a Look\'s question)', async () => {
  const { isCameraCloseRequest } = await import('../../src/lib/optics-commands.js');
  const forms = ['turn the camera off', 'turn the webcam off', 'switch the camera off', 'switch off the camera', 'turn my camera off', 'Turn the camera off, please.', 'turn off the camera', 'camera off', 'close the camera', 'switch off the webcam', 'shut off the camera', 'turn optics off'];
  for (const words of forms) {
    assert.equal(isCameraCloseRequest(words), true, words);
    for (const frozen of [false, true]) assert.deepEqual(matchOpticsCommand(words, { frozen }), { action: 'close' }, `${words} (frozen ${frozen})`);
  }
  // Not camera-off words: unchanged.
  for (const words of ['turn the camera around', 'what is this', 'is the camera off']) assert.notDeepEqual(matchOpticsCommand(words), { action: 'close' }, words);
});
