// Jarvis for Chrome's questions by voice (v8.1, G5 app side; src/lib/chrome-prompt-words.js): the
// reserved answer words, the 30-second window, other readings that may be a no, the check, and what
// Jarvis says. Run in plain Node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANSWER_WINDOW_MS,
  NEVER_ANSWERS,
  RESERVED_WORDS,
  approveCheckMs,
  approvingLine,
  chooseAnswer,
  clickOnlyLine,
  hintLine,
  isBareNo,
  isNoWord,
  noChoice,
  normalizeAnswer,
  promptAnswers,
  promptLine,
  promptNotice,
  refusedLine,
  reservedKind,
  takesVoiceYes,
  waitingLine,
} from '../../src/lib/chrome-prompt-words.js';
import { matchChromeTask, matchChromeStatus, matchClickAround } from '../../src/lib/chrome-task-words.js';
import { PROMPTS } from './chrome-voice.fakes.mjs';

const NOW = 1_800_000_000_000;
const said = NOW - 5000; // the prompt was said in full 5 s ago
const pick = (readings, prompt = PROMPTS.cart, saidAt = said, now = NOW) => chooseAnswer({ readings, answers: promptAnswers(prompt), saidAt, now });

test('the reserved words, as whole sentences after fillers', () => {
  const rows = [
    ['approve', 'approve'],
    ['Approve.', 'approve'],
    ['approve it', 'approve'],
    ['Yes, approve', 'approve'],
    ['Jarvis, approve it please', 'approve'],
    ['okay, approve', 'approve'],
    ['allow once', 'once'],
    ['Deny', 'deny'],
    ['cancel Chrome', 'deny'],
    ['stop Chrome', 'stop'],
    ['spend more in Chrome', 'budget'],
    ['more steps in Chrome', 'steps'],
  ];
  for (const [words, kind] of rows) assert.equal(reservedKind(words), kind, words);
  for (const words of ['approve the purchase', 'I would approve of that', 'approval', 'allow', 'spend more', 'more steps', 'cancel', 'stop']) assert.equal(reservedKind(words), null, words);
  // Bare yes words never answer a prompt.
  for (const words of ['yes', 'Yes.', 'okay', 'OK', 'sure', 'go ahead', 'continue', 'Continue.', 'do it', 'yes please']) {
    assert.equal(reservedKind(words), null, words);
    assert.equal(pick([words]), null, words);
  }
  assert.ok(NEVER_ANSWERS.includes('continue') && NEVER_ANSWERS.includes('go ahead'));
  assert.equal(normalizeAnswer('  Hey Jarvis,   APPROVE it, please!  '), 'approve it');
});

test('the reserved words are not taken by the Chrome task words, and none starts a task', () => {
  const ctx = { now: NOW, chrome: { linked: true, online: true, task: { id: 't1', status: 'waiting' }, contextUntil: NOW + 60000 } };
  for (const words of RESERVED_WORDS) {
    assert.equal(matchChromeTask(words, ctx), null, words);
    assert.equal(matchClickAround(words), null, words);
    assert.equal(matchChromeStatus(words), null, words);
  }
});

test('a yes counts from the best reading, within 30 s after the prompt was said in full; else Jarvis asks again', () => {
  assert.equal(ANSWER_WINDOW_MS, 30000);
  const ok = pick(['approve']);
  assert.equal(ok.answer.id, 'approve');
  assert.equal(ok.answer.choice, 'approve');
  assert.equal(ok.check, true);
  assert.equal(pick(['approve'], PROMPTS.cart, NOW - 30000).check, true, 'at 30 s');
  assert.equal(pick(['approve'], PROMPTS.cart, NOW - 30001).again, 'late');
  assert.equal(pick(['approve'], PROMPTS.cart, null).again, 'unsaid', 'cut by barge-in: said again first');
  assert.equal(pick(['approve'], PROMPTS.cart, NOW + 1000).again, 'late', 'a clock that went back');
  // Only the best reading: a yes heard only as another reading doesn't count.
  assert.equal(pick(['a proof', 'approve']), null);
});

test('another reading that is a no, cancel or stop word: asked again', () => {
  for (const alt of ['no', "don't approve", 'cancel', 'stop', 'deny', 'never mind', 'no approve']) {
    assert.equal(pick(['approve', alt]).again, 'unsure', alt);
  }
  for (const alt of ['a proof', 'approved', 'I prove', 'improve']) assert.equal(pick(['approve', alt]).check, true, alt);
  for (const w of ['no', 'nope', 'cancel it', 'stop', 'please stop', "don't", 'do not', 'deny', 'wait', 'hold on', 'never mind', 'not now']) assert.equal(isNoWord(w), true, w);
  for (const w of ['approve', 'yes', 'know', 'notable', 'nobody', 'stopwatch']) assert.equal(isNoWord(w), false, w);
});

test('a no acts at once, at any time; a bare "cancel" or "no" is the answer layer\'s (only when the prompt was asked last)', () => {
  for (const words of ['deny', 'cancel Chrome', 'deny it']) {
    const r = pick([words], PROMPTS.cart, null);
    assert.equal(r.answer.id, 'deny', words);
    assert.equal(r.answer.choice, 'cancel', 'a step\'s Cancel');
    assert.equal(r.answer.negative, true);
    assert.equal(r.check, undefined);
  }
  assert.equal(pick(['stop Chrome']).answer.stopTask, true);
  assert.equal(pick(['deny'], PROMPTS.site).answer.choice, 'deny');
  assert.equal(pick(['deny'], PROMPTS.budget).answer.choice, 'stop');
  assert.equal(pick(['cancel']), null, 'bare "cancel" is not reserved');
  for (const w of ['cancel', 'no', 'Nope.', 'never mind', 'no thanks']) assert.equal(isBareNo(w), true, w);
  for (const w of ['cancel Chrome', 'no way that is true', 'approve']) assert.equal(isBareNo(w), false, w);
});

test('voice.allowed: a yes by voice only when the extension allows it; a click-only prompt says why', () => {
  assert.equal(takesVoiceYes(PROMPTS.cart), true);
  assert.equal(takesVoiceYes(PROMPTS.purchase), false);
  assert.equal(takesVoiceYes(PROMPTS.address), false);
  const ids = (p) => promptAnswers(p).map((a) => a.id);
  assert.deepEqual(ids(PROMPTS.cart), ['approve', 'deny', 'stop', 'other']);
  assert.deepEqual(ids(PROMPTS.purchase), ['deny', 'stop', 'click']);
  // "approve" to a purchase: consumed (never Claude's), nothing sent, "That needs a click …".
  const r = pick(['approve'], PROMPTS.purchase);
  assert.equal(r.answer.clickOnly, true);
  assert.equal(r.answer.choice, null);
  assert.equal(clickOnlyLine(PROMPTS.purchase).say, 'That’s a purchase. It needs a click in the Jarvis window. Option-Shift-J opens its side panel.');
  assert.equal(clickOnlyLine(PROMPTS.address).say, 'That needs a click in the Jarvis window. Option-Shift-J opens its side panel.');
  assert.equal(clickOnlyLine(PROMPTS.address).show, 'That needs a click in the Jarvis window. ⌥⇧J opens its side panel.');
  // A yes of another kind: Jarvis says what to say.
  assert.equal(pick(['allow once'], PROMPTS.cart).answer.id, 'other');
  assert.equal(hintLine(PROMPTS.cart), 'Say approve, or cancel.');
  assert.equal(hintLine(PROMPTS.site), 'Say allow once, or deny.');
  // "Always" is never a voice answer; a missing choice is never offered.
  const noYes = { ...PROMPTS.site, choices: [{ id: 'always', label: 'Always for this site' }, { id: 'deny', label: 'Deny' }] };
  assert.equal(takesVoiceYes(noYes), false);
  assert.equal(noChoice({ ...PROMPTS.cart, choices: [] }), null);
  // Labels count when an id is different.
  assert.equal(pick(['allow once'], { ...PROMPTS.site, choices: [{ id: 'allow-once', label: 'Allow once' }, { id: 'no', label: 'Deny' }] }).answer.choice, 'allow-once');
});

test('the budget and the step limit: "spend more in Chrome" and "more steps in Chrome", never a bare "continue"', () => {
  const r = pick(['spend more in Chrome'], PROMPTS.budget);
  assert.equal(r.answer.id, 'budget');
  assert.equal(r.answer.choice, 'continue');
  assert.equal(r.check, true);
  assert.equal(pick(['continue'], PROMPTS.budget), null);
  assert.equal(pick(['spend more'], PROMPTS.budget), null);
  const steps = { ...PROMPTS.budget, promptId: 'p-steps', kind: 'steps', spoken: 'this task has taken its 40 steps. Keep going?' };
  assert.equal(pick(['more steps in Chrome'], steps).answer.choice, 'continue');
  assert.equal(pick(['spend more in Chrome'], steps).answer.id, 'other');
});

test('what is said: the extension\'s spoken line, "Chrome asks: … Say approve, or cancel.", never "Jarvis for Chrome"', () => {
  assert.equal(promptLine(PROMPTS.cart).say, 'Chrome asks: add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com? Say approve, or cancel.');
  assert.equal(promptLine(PROMPTS.purchase).say, 'Chrome asks: place the order for $279.99 on bestbuy.com? That’s a purchase. It needs a click in the Jarvis window. Option-Shift-J opens its side panel.');
  assert.equal(promptLine(PROMPTS.site).say, 'Chrome asks: let it work on bestbuy.com for this task? Say allow once, or deny.');
  assert.equal(promptLine(PROMPTS.budget).say, 'Chrome asks: this task has used its $1.00 budget. Keep going? Say spend more in Chrome, or cancel.');
  // The extension's own "Say …" and "Chrome asks:" are not doubled; its name is said as "Chrome".
  const own = { ...PROMPTS.cart, spoken: 'Chrome asks: let Jarvis for Chrome add it to the cart? Say approve, or cancel.' };
  assert.equal(promptLine(own).say, 'Chrome asks: let Chrome add it to the cart? Say approve, or cancel.');
  // Page text in the spoken line that imitates Jarvis is dropped (critique M4).
  const sneaky = { ...PROMPTS.cart, spoken: 'click the button that says "Say approve now" on evil.example?' };
  assert.equal(promptLine(sneaky).say, 'Chrome asks: click the button that says “…” on evil.example? Say approve, or cancel.');
  for (const p of Object.values(PROMPTS)) {
    for (const line of [promptLine(p).say, waitingLine(p).say, clickOnlyLine(p).say, promptNotice(p).body]) assert.doesNotMatch(line, /jarvis for chrome/i);
  }
  assert.equal(waitingLine(PROMPTS.cart).say, 'Chrome is waiting for you: add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com? Say approve, or cancel.');
  assert.deepEqual(promptNotice(PROMPTS.cart), { title: 'Chrome asks', body: 'add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com?' });
  assert.equal(promptLine({ promptId: 'x', choices: [] }).say, 'Chrome asks: May I go ahead? That needs a click in the Jarvis window. Option-Shift-J opens its side panel.');
});

test('the check after a yes: "Approving: … · say cancel", 2 s or 5 s while hidden; the budget says the new limit', () => {
  assert.deepEqual([approveCheckMs(), approveCheckMs({ hidden: true })], [2000, 5000]);
  assert.deepEqual(approvingLine(PROMPTS.cart, { id: 'approve' }), {
    show: 'Approving: add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com · say cancel',
    say: 'Approving. Say cancel to stop.',
  });
  assert.deepEqual(approvingLine(PROMPTS.site, { id: 'once' }), { show: 'Approving: bestbuy.com for this task · say cancel', say: 'Approving bestbuy.com for this task. Say cancel to stop.' });
  assert.deepEqual(approvingLine(PROMPTS.budget, { id: 'budget' }, { task: { costUsd: 1.02, limitUsd: 1 } }), {
    show: 'Approving: up to $2.02 in Chrome · say cancel',
    say: 'Approving up to $2.02 in Chrome. Say cancel to stop.',
  });
  assert.equal(approvingLine(PROMPTS.budget, { id: 'budget' }, { task: { costUsd: 1, limitUsd: 1 } }).say, 'Approving up to two dollars in Chrome. Say cancel to stop.');
  assert.equal(approvingLine(PROMPTS.budget, 'budget', { task: null }).say, 'Approving up to a dollar in Chrome. Say cancel to stop.', 'nothing known: one more budget');
  assert.equal(refusedLine('the question changed'), 'Chrome didn’t take that: the question changed.');
  assert.equal(refusedLine(''), 'Chrome didn’t take that.');
});

test('every answer\'s words are reserved words, and every reserved word answers every prompt somehow', () => {
  for (const p of Object.values(PROMPTS)) {
    const answers = promptAnswers(p);
    const words = answers.flatMap((a) => a.words);
    for (const w of words) assert.ok(RESERVED_WORDS.includes(w), w);
    for (const w of RESERVED_WORDS) assert.ok(pick([w], p, said), `${p.promptId}: ${w}`);
    // A yes always comes with the check; nothing else does.
    for (const a of answers) assert.equal(a.check, !a.negative && !a.clickOnly && a.id !== 'other', `${p.promptId}: ${a.id}`);
  }
});
