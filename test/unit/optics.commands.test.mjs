// Optics words and follow-ups (src/lib/optics-commands.js), the schematic's edge filter
// (src/ui/optics/schematic.js) and the Hologram-of-this estimate: pure functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hologramRequest, matchOpticsCommand, normalizeOpticsText, partQuestion, theName } from '../../src/lib/optics-commands.js';
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
