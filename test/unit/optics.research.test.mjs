// "Research this" (v8.1, E3): src/lib/research-offer.js. The words (and what they leave to Jarvis),
// the subject in words, the price of each way (one source for the card and the spoken line), the
// offer with and without the home base, with the live view on (the quick answer counts toward its
// dollar, the other two don't and the offer says so; a quick answer that wouldn't fit isn't
// offered), offline, the answers, and the words each way sends. Pure functions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOK_FIRST_LINE,
  OFFLINE_LINE,
  OUTSIDE_ONE,
  OUTSIDE_TWO,
  QUICK_TOO_DEAR,
  estimateResearchCost,
  firstSentence,
  matchOfferChoice,
  matchResearchThis,
  researchOffer,
  researchPrompt,
  researchSubject,
} from '../../src/lib/research-offer.js';

test('"research this" and its cousins open the offer; in the background or on the home base, the home base; in depth, the deep variant', () => {
  for (const words of [
    'Research this',
    'Jarvis, research this.',
    'research it',
    'Research that, please',
    'Look this up',
    'look that up for me',
    'Find out more about this',
    'find out about that',
    'Do some research on this',
    'do research on that',
    'Dig into this',
    'dig deeper into this',
    'Look into this',
    'read up on this',
    "Research what I'm holding",
    'Can you research this one?',
  ]) {
    assert.deepEqual(matchResearchThis(words), { where: 'offer', deep: false }, words);
  }
  for (const words of ['Research this in depth', 'Do some deep research on this', 'research this thoroughly']) {
    assert.deepEqual(matchResearchThis(words), { where: 'offer', deep: true }, words);
  }
  for (const words of ['Research this in the background', 'research it on the home base', 'Have the home base research this', 'home base, look into this', 'Get the home base to dig into this']) {
    assert.deepEqual(matchResearchThis(words), { where: 'homebase', deep: false }, words);
  }
  for (const words of ['Research this in depth in the background', 'research this in the background in depth', 'have the home base do some deep research on this']) {
    assert.deepEqual(matchResearchThis(words), { where: 'homebase', deep: true }, words);
  }
});

test('sentences that name their own subject, or are questions about research, stay with Jarvis', () => {
  for (const words of [
    'research the best laptops under 800 dollars',
    'Look it up',
    'look it up online',
    'look into the warranty',
    'look into flights for me',
    'look into it',
    'dig into it',
    'look up the battery part number',
    'should I research before buying a laptop',
    'what does research show about sleep',
    'how long does battery research take',
    'research this topic for my essay about whales',
    'find out more',
    'find out about the weather tomorrow',
    'dig into the numbers from last quarter',
    'Research',
    '',
    'x'.repeat(300),
  ]) {
    assert.equal(matchResearchThis(words), null, words);
  }
});

test('the price of each way: a quick answer about 10¢, an 8-agent mission about $1.70, the home base up to $1.25 ($3 in depth)', () => {
  assert.deepEqual(estimateResearchCost({ route: 'quick' }), { usd: 0.1, low: 0.06, high: 0.16 });
  assert.deepEqual(estimateResearchCost({ route: 'mission' }), { usd: 1.7, low: 1, high: 2.55, agents: 8 });
  const deep20 = estimateResearchCost({ route: 'mission', agents: 20, depth: 'deep' });
  assert.ok(deep20.usd >= 7 && deep20.usd <= 15, `a Deep 20-agent mission: ${deep20.usd} (README: $7–15)`);
  assert.ok(estimateResearchCost({ route: 'mission', depth: 'fast' }).usd < 1.7);
  assert.equal(estimateResearchCost({ route: 'mission', agents: 99 }).agents, 20);
  assert.equal(estimateResearchCost({ route: 'mission', agents: 'x' }).agents, 8);
  assert.deepEqual(estimateResearchCost({ route: 'homebase' }), { max: 1.25 });
  assert.deepEqual(estimateResearchCost({ route: 'homebase', homeDepth: 'deep' }), { max: 3 });
  assert.deepEqual(estimateResearchCost({ route: 'nope' }), { usd: 0 });
});

test('the subject in words: the tapped or first label with the answer\'s first sentence, else the answer, the live view\'s scene, what "this" names; else look first', () => {
  const answer = 'A **65-watt USB-C charger** with two ports. It folds flat.\n\nMore below.';
  assert.equal(firstSentence(answer), 'A 65-watt USB-C charger with two ports.');
  assert.deepEqual(researchSubject({ label: 'USB-C charger', answer }), { name: 'USB-C charger', words: 'USB-C charger (A 65-watt USB-C charger with two ports)', source: 'look' });
  assert.deepEqual(researchSubject({ answer }), { name: '', words: 'A 65-watt USB-C charger with two ports.', source: 'look' });
  assert.deepEqual(researchSubject({ liveSummary: 'Someone holds a white charger up to the camera.' }), { name: '', words: 'Someone holds a white charger up to the camera.', source: 'live' });
  assert.deepEqual(researchSubject({ resolved: { kind: 'hologram', words: 'Laptop battery' } }), { name: 'Laptop battery', words: 'Laptop battery', source: 'hologram' });
  assert.deepEqual(researchSubject({ resolved: { kind: 'question', words: 'Which charger fits a 14-inch laptop?' } }), { name: '', words: 'Which charger fits a 14-inch laptop?', source: 'question' });
  assert.equal(researchSubject({ resolved: { kind: 'none', words: '' } }), null);
  assert.equal(researchSubject({}), null);
  assert.equal(researchSubject({ label: '\u0000\u202e  ' }), null, 'control characters only: nothing');
  assert.equal(researchSubject({ label: 'x'.repeat(100) }).name.length, 60);
});

test('the offer, prices first, in the brief\'s words; mission and home base go through the check', () => {
  const offer = researchOffer({ subject: { name: '65-watt USB-C charger', words: '65-watt USB-C charger' }, homeBase: true });
  assert.equal(offer.say, 'Research this 65-watt USB-C charger? A quick answer with a web search, about 10¢. A research mission with 8 agents, about $1.70. Or the home base can do it in the background, up to $1.25.');
  assert.deepEqual(
    offer.choices.map((c) => [c.id, c.label, c.dear]),
    [
      ['quick', 'Quick · about 10¢', false],
      ['mission', 'Mission · about $1.70', true],
      ['homebase', 'Home base · up to $1.25', true],
      ['cancel', 'Cancel', false],
    ],
  );
  // The chips and the spoken line come from the same estimates.
  assert.equal(offer.costs.mission.usd, 1.7);
  const deep = researchOffer({ subject: { name: 'Coffee grinder', words: 'Coffee grinder' }, homeBase: true, deep: true, agents: 5 });
  assert.equal(deep.say, 'Research this coffee grinder? A quick answer with a web search, about 10¢. A research mission with 5 agents, about $1.20. Or the home base can do it in the background, in depth, up to $3.');
  const words = researchOffer({ subject: { name: '', words: 'A white charger held up to the camera' } });
  assert.match(words.say, /^Research “A white charger held up to the camera”\?/);
});

test('no home base: two choices; offline: no offer; nothing to name yet: a Look first', () => {
  const offer = researchOffer({ subject: { name: 'Kettle', words: 'Kettle' }, homeBase: false });
  assert.equal(offer.say, 'Research this kettle? A quick answer with a web search, about 10¢. Or a research mission with 8 agents, about $1.70.');
  assert.deepEqual(offer.choices.map((c) => c.id), ['quick', 'mission', 'cancel']);
  assert.deepEqual(researchOffer({ subject: { name: 'Kettle', words: 'Kettle' }, online: false }), { refuse: OFFLINE_LINE });
  assert.deepEqual(researchOffer({ subject: null }), { refuse: LOOK_FIRST_LINE, lookFirst: true });
  assert.equal(LOOK_FIRST_LINE, 'Let me look first: about 3¢.');
  const home = researchOffer({ subject: { name: 'Kettle', words: 'Kettle' }, homeBase: true, only: 'homebase' });
  assert.equal(home.say, 'Research this kettle? The home base can do it in the background, up to $1.25.');
  assert.deepEqual(home.choices.map((c) => c.id), ['homebase', 'cancel']);
  assert.match(researchOffer({ subject: { name: 'Kettle', words: 'Kettle' }, homeBase: false, only: 'homebase' }).refuse, /home base/i);
});

test('with the live view on: the quick answer counts toward its dollar, the other two are outside it and the offer says so', () => {
  const subject = { name: 'USB-C charger', words: 'USB-C charger' };
  const on = researchOffer({ subject, homeBase: true, liveView: { on: true, quickFits: true } });
  assert.equal(on.say, `Research this USB-C charger? A quick answer with a web search, about 10¢. A research mission with 8 agents, about $1.70. Or the home base can do it in the background, up to $1.25. ${OUTSIDE_TWO}`);
  assert.equal(OUTSIDE_TWO, 'Those two are outside the live view’s dollar an hour.');
  const noHome = researchOffer({ subject, homeBase: false, liveView: { on: true, quickFits: true } });
  assert.ok(noHome.say.endsWith(OUTSIDE_ONE));
  // A quick answer that wouldn't fit in the hour is not offered; the offer says why.
  const full = researchOffer({ subject, homeBase: true, liveView: { on: true, quickFits: false } });
  assert.equal(full.say, `Research this USB-C charger? ${QUICK_TOO_DEAR} A research mission with 8 agents, about $1.70. Or the home base can do it in the background, up to $1.25. ${OUTSIDE_TWO}`);
  assert.deepEqual(full.choices.map((c) => c.id), ['mission', 'homebase', 'cancel']);
  const fullAlone = researchOffer({ subject, homeBase: false, liveView: { on: true, quickFits: false } });
  assert.equal(fullAlone.say, `Research this USB-C charger? ${QUICK_TOO_DEAR} A research mission with 8 agents, about $1.70. ${OUTSIDE_ONE}`);
  // The live view off: nothing about its dollar.
  const off = researchOffer({ subject, homeBase: true, liveView: { on: false, quickFits: false } });
  assert.ok(!/live view/.test(off.say));
  assert.equal(off.choices[0].id, 'quick');
});

test('the answers: the choice\'s words after fillers; anything else is not an answer', () => {
  const { choices } = researchOffer({ subject: { name: 'Kettle', words: 'Kettle' }, homeBase: true });
  const cases = {
    quick: ['Quick', 'quick.', 'Okay, quick', "Let's do the quick one", 'a quick answer please', 'go with the quick answer'],
    mission: ['Mission', 'the mission', "let's do a research mission", 'send the agents', 'go for the mission'],
    homebase: ['Home base', 'the home base please', 'in the background', 'homebase'],
    cancel: ['Cancel', 'no', 'No thanks', 'never mind', 'forget it', 'not now'],
  };
  for (const [id, list] of Object.entries(cases)) for (const words of list) assert.equal(matchOfferChoice(words, choices), id, words);
  for (const words of ['what is this', 'research this', 'quick question about the kettle', 'the mission was a success', '', 'mission control']) {
    assert.equal(matchOfferChoice(words, choices), null, words);
  }
  const noQuick = researchOffer({ subject: { name: 'Kettle', words: 'Kettle' }, homeBase: true, liveView: { on: true, quickFits: false } }).choices;
  assert.equal(matchOfferChoice('quick', noQuick), null, 'not offered: not an answer');
  assert.equal(matchOfferChoice('quick', null), null);
});

test('what each way sends: words only (the agents and the home base can\'t see the picture)', () => {
  const subject = researchSubject({ label: 'USB-C charger', answer: 'A 65-watt charger with two ports.' });
  assert.equal(researchPrompt(subject, 'quick'), 'Research this with a web search and give me a quick answer: USB-C charger (A 65-watt charger with two ports).');
  assert.equal(researchPrompt(subject, 'mission'), 'Research USB-C charger (A 65-watt charger with two ports): what it is, its specifications, prices and reviews, and anything to watch out for.');
  assert.equal(researchPrompt(subject, 'homebase'), 'USB-C charger (A 65-watt charger with two ports): what it is, its specifications, prices and reviews, and anything to watch out for');
  assert.equal(researchPrompt(null, 'quick'), 'Research this with a web search and give me a quick answer: this.');
});
