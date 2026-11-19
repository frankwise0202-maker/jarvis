// Voice Mode × holograms, the pure parts (v6): what Jarvis says after a hologram command acts
// (src/ui/voice-visuals.js); a hologram or blueprint closes the text before it, so the line said
// before the tool call is spoken while it builds (src/ui/voice-stream.js); and the answer Voice
// Mode summarizes is the text after the last hologram or blueprint (src/ui/voice-mode.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commandAck, savedBlueprintAck, spokenPart, blueprintQuestion, confirmReply, spokenCost } from '../../src/ui/voice-visuals.js';
import { createSpokenFeed, textClosed } from '../../src/ui/voice-stream.js';
import { finalAnswerMarkdown } from '../../src/ui/voice-mode.js';
import { matchHologramCommand } from '../../src/lib/hologram-commands.js';

const PARTS = [
  { id: 'can', name: 'Steel can (+)' },
  { id: 'separator', name: 'Separator' },
  { id: 'anode', name: 'Zinc anode gel' },
  { id: 'cathode', name: 'Cathode rings (MnO2)' },
  { id: 'dcdc', name: 'DC-DC converter', aka: ['alternator'] },
];
const ack = (words, selected = null) => commandAck(matchHologramCommand(words, PARTS, { selected }));

test('voice acknowledgements: short lines for the brief\'s commands ("Expanding.", "Here\'s the alternator.")', () => {
  assert.equal(ack('okay, now expand it'), 'Expanding.');
  assert.equal(ack('take it apart'), 'Expanding.');
  assert.equal(ack('put it back together'), 'Putting it back together.');
  assert.equal(ack('show the separator'), "Here's the separator.");
  assert.equal(ack('show me the alternator'), "Here's the DC-DC converter.", 'the part found through its aka is named as it is');
  assert.equal(ack('zoom in on the zinc anode'), 'Zooming in on the zinc anode gel.');
  assert.equal(ack('isolate the steel can'), 'Just the steel can.');
  assert.equal(ack('labels off'), 'Labels off.');
  assert.equal(ack('labels on'), 'Labels on.');
  assert.equal(ack('rotate'), 'Rotating.');
  assert.equal(ack('stop'), 'Holding still.');
  assert.equal(ack('reset'), 'Back to the start.');
  assert.equal(ack('front view'), 'Front view.');
  assert.equal(ack('show everything'), 'Showing every part.');
  assert.equal(ack('photos of the cathode rings'), 'Photos of the cathode rings.');
  assert.equal(commandAck({ action: 'photos', query: 'rusty alternator' }), 'Photos of rusty alternator.');
  assert.equal(commandAck({ action: 'photos' }), 'Here are some photos.');
  assert.equal(ack('show me the parts list'), 'Here are the parts.');
  // Close: the viewer is gone and Voice Mode is back. Blueprint: its outcome speaks for it.
  assert.equal(ack('close'), '');
  assert.equal(ack('blueprint the separator'), '');
  for (const bad of [null, undefined, {}, { action: 'warp' }, 'explode']) assert.equal(commandAck(bad), '');
  // Every line is plain speech: no Markdown, no symbols.
  for (const words of ['expand it', 'show the steel can', 'isolate the cathode rings', 'photos of the steel can']) assert.doesNotMatch(ack(words), /[*_`#()+−]/);
});

test('voice acknowledgements: part names said after "the"; a saved blueprint that opened', () => {
  assert.equal(spokenPart('Separator'), 'the separator');
  assert.equal(spokenPart('Steel can (+)'), 'the steel can');
  assert.equal(spokenPart('Negative end cap (−)'), 'the negative end cap');
  assert.equal(spokenPart('DC-DC converter'), 'the DC-DC converter');
  assert.equal(spokenPart('12 V battery'), 'the 12 V battery');
  assert.equal(spokenPart('HV battery'), 'the HV battery');
  assert.equal(spokenPart('The rotor'), 'the rotor');
  assert.equal(spokenPart('  '), '');
  assert.equal(spokenPart(undefined), '');
  assert.equal(savedBlueprintAck({ action: 'blueprint', partId: 'separator', partName: 'Separator' }), "Here's your saved blueprint of the separator.");
  assert.equal(savedBlueprintAck({ action: 'blueprint' }), "Here's your saved blueprint.");
  assert.equal(savedBlueprintAck(null), "Here's your saved blueprint.");
});

test('streamed speech: a hologram or blueprint closes the text before it, so "Pulling up…" is said while it builds', () => {
  const intro = { id: 't1', kind: 'text', req: 0, text: 'Pulling up the AA alkaline battery now.' };
  const building = { id: 'h1', kind: 'hologram', status: 'building' };
  assert.equal(textClosed([intro]), false);
  assert.equal(textClosed([intro, building]), true);
  assert.equal(textClosed([intro, { id: 'b1', kind: 'blueprint', status: 'building' }]), true);
  assert.equal(textClosed([intro, { id: 'n1', kind: 'notice' }]), false, 'a notice still does not close it');
  // The feed hands the line to the voice as soon as the hologram starts (no wait for the turn's end).
  const feed = createSpokenFeed();
  assert.deepEqual(feed.update({ segments: [intro] }), { pieces: [], finish: false });
  const step = feed.update({ segments: [intro, building] });
  assert.deepEqual(step.pieces, ['Pulling up the AA alkaline battery now.\n\n']);
  assert.equal(step.finish, false);
  // Then the reply after the tool round, once, never the line before it again.
  const after = { id: 't2', kind: 'text', req: 1, text: 'Here\'s the AA alkaline battery. Say "expand it", or tap any part.' };
  const end = feed.update({ segments: [intro, { ...building, status: 'done' }, after], done: true });
  assert.deepEqual(end.pieces, ["Here's the AA alkaline battery. ", 'Say "expand it", or tap any part.\n\n']);
  assert.equal(end.finish, true);
});

test('Voice Mode\'s answer: the text after the last hologram or blueprint (the line before it is not the answer)', () => {
  const turn = {
    segments: [
      { kind: 'thinking', text: 'x' },
      { kind: 'text', req: 0, text: 'Pulling up the AA alkaline battery now.' },
      { kind: 'hologram', status: 'done' },
      { kind: 'text', req: 1, text: "Here's the AA alkaline battery." },
    ],
  };
  assert.equal(finalAnswerMarkdown(turn), "Here's the AA alkaline battery.");
  const sheet = { segments: [{ kind: 'text', req: 0, text: 'Drawing it now.' }, { kind: 'blueprint', status: 'done' }, { kind: 'text', req: 1, text: 'It is open on your screen.' }] };
  assert.equal(finalAnswerMarkdown(sheet), 'It is open on your screen.');
  // Unchanged for turns without them.
  assert.equal(finalAnswerMarkdown({ segments: [{ kind: 'text', req: 0, text: 'Let me check.' }, { kind: 'tool', status: 'done' }, { kind: 'text', req: 0, text: 'Paris.' }] }), 'Paris.');
  assert.equal(finalAnswerMarkdown({ segments: [{ kind: 'text', req: 0, text: 'Only this.' }] }), 'Only this.');
});

test('a softer 2D wording in Voice Mode is asked first: the question names the part and the price, said for the ear', () => {
  assert.equal(spokenCost('≈ $0.15'), 'about 15 cents');
  assert.equal(spokenCost('≈ $0.05'), 'about 5 cents');
  assert.equal(spokenCost('≈ $0.15–0.35'), 'about 15 to 35 cents');
  assert.equal(spokenCost('≈ $1.20'), 'about 1 dollar 20');
  assert.equal(spokenCost('≈ $2.00'), 'about 2 dollars');
  assert.equal(spokenCost(''), '');
  assert.equal(spokenCost(null), '');
  assert.equal(blueprintQuestion({ partName: 'Hood', cost: '≈ $0.15' }), 'Shall I draw a blueprint of the hood? It costs about 15 cents.');
  assert.equal(blueprintQuestion({ partName: 'Steel can (+)', cost: '≈ $0.15–0.35' }), 'Shall I draw a blueprint of the steel can? It costs about 15 to 35 cents.');
  assert.equal(blueprintQuestion({ title: 'AA alkaline battery (LR6)', cost: '≈ $0.15' }), 'Shall I draw a blueprint of the AA alkaline battery? It costs about 15 cents.');
  assert.equal(blueprintQuestion({}), 'Shall I draw a blueprint of the whole object? It costs a few cents.');
  for (const q of [blueprintQuestion({ partName: 'DC-DC converter', cost: '≈ $0.15' }), blueprintQuestion({ title: '2024 Toyota Camry Hybrid (XV70)', cost: '≈ $0.36' })]) assert.doesNotMatch(q, /[*_`#()$≈]/, q);
});

test('the answer to that question: yes draws it, no drops it, anything else is not an answer', () => {
  for (const t of ['Yes.', 'yes please', 'Yeah', 'yep', 'sure', 'okay', 'OK, do it', 'go ahead', 'do it', 'draw it', 'please do', 'yes, draw it', 'go for it', 'absolutely', 'sounds good', 'Jarvis, yes']) assert.equal(confirmReply(t), 'yes', t);
  for (const t of ['No.', 'no thanks', 'nope', 'nah', "don't", 'cancel', 'never mind', 'not now', 'skip it', 'forget it', 'no, leave it', 'stop']) assert.equal(confirmReply(t), 'no', t);
  for (const t of ['', 'expand it', 'how does the separator work?', 'show the hood', 'yes and also explain the rotor', 'no I meant the rotor blueprint']) assert.equal(confirmReply(t), null, t);
});

test('"isolate it" with nothing selected asks which part; closing a sheet by name says nothing', () => {
  assert.equal(commandAck({ action: 'which-part', for: 'isolate' }), 'Which part? Tap one, or say isolate and its name.');
  assert.equal(commandAck({ action: 'which-part', for: 'focus' }), 'Which part? Tap one, or say zoom in on and its name.');
  assert.equal(commandAck({ action: 'close-blueprint' }), '');
  assert.equal(ack('close the blueprint'), '');
});
