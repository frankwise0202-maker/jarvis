// v8.1 Voice Mode seams (contract (a)), pure parts: the owner questions stack, the standing prompt
// channel beside it, the hold's 2-minute cap, and the 2-second check's bound action
// (src/lib/voice-questions.js, src/lib/voice-hold.js). All on a virtual clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQuestionStack, createPromptChannel, matchQuestionAnswer, matchPromptAnswer, answerWords, sameWords, boundAction } from '../../src/lib/voice-questions.js';
import { createVoiceHold, HOLD_CAP_MS } from '../../src/lib/voice-hold.js';
import { createRouter, registerTodayCommands, emptyState } from '../../src/lib/command-router.js';

/** A virtual clock: setTimer/clearTimer driven by advance(ms). */
function virtualClock() {
  let now = 0;
  let seq = 0;
  const timers = new Map(); // id -> { at, fn }
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: now + Math.max(0, ms), fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    advance(ms) {
      const until = now + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, t]) => t.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
    pending: () => timers.size,
  };
}

function stackOn(clock) {
  const asked = [];
  const stack = createQuestionStack({ now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer, onAsk: (q, { again }) => asked.push(`${again ? 'again' : 'ask'}:${q.id}`) });
  return { stack, asked };
}

function question(id, log, extra = {}) {
  return {
    id,
    say: `${id}?`,
    choices: [
      { id: 'yes', label: 'Yes', words: ['yes', 'yes please'] },
      { id: 'no', label: 'No', words: ['no', 'no thanks'] },
    ],
    onAnswer: (choice, info) => log.push(`answer:${id}:${choice}:${info.via}:${info.words}`),
    onExpire: (reason) => log.push(`expire:${id}:${reason}`),
    ...extra,
  };
}

// ---- the question stack ------------------------------------------------------------------------

test('questions stack: the newest is asked and answered first; then the one under it is asked again', () => {
  const clock = virtualClock();
  const { stack, asked } = stackOn(clock);
  const log = [];
  stack.push(question('tour', log, { keep: true }));
  stack.push(question('research', log));
  assert.deepEqual(asked, ['ask:tour', 'ask:research']);
  assert.deepEqual(stack.list().map((q) => q.id), ['research', 'tour'], 'newest first');
  assert.equal(stack.answer('tour', 'yes', { words: 'yes' }), false, 'only the top question is answered by voice');
  assert.equal(stack.answer('research', 'no', { words: 'no thanks', via: 'voice' }), true);
  assert.deepEqual(log, ['answer:research:no:voice:no thanks']);
  assert.deepEqual(asked, ['ask:tour', 'ask:research', 'again:tour']);
  assert.equal(stack.top().id, 'tour');
});

test("questions stack: a covered question's clock stops, and runs on when it is on top again", () => {
  const clock = virtualClock();
  const { stack } = stackOn(clock);
  const log = [];
  stack.push(question('tour', log, { timeoutMs: 60000 }));
  clock.advance(20000);
  stack.push(question('research', log, { timeoutMs: 30000 }));
  clock.advance(29999);
  assert.equal(stack.remaining('tour'), 40000, 'covered: still 40 s left');
  assert.deepEqual(log, []);
  clock.advance(1); // the research offer expires; the tour's question is on top again
  assert.deepEqual(log, ['expire:research:timeout']);
  clock.advance(39999);
  assert.deepEqual(log, ['expire:research:timeout']);
  clock.advance(1);
  assert.deepEqual(log, ['expire:research:timeout', 'expire:tour:timeout']);
  assert.equal(stack.size(), 0);
  assert.equal(clock.pending(), 0);
});

test('questions stack: keep leaves a question open for other words; otherwise they drop it', () => {
  const clock = virtualClock();
  const { stack, asked } = stackOn(clock);
  const log = [];
  stack.push(question('blueprint', log));
  stack.push(question('tour', log, { keep: true }));
  assert.equal(stack.dropTop(), false, 'the tour keeps its question');
  assert.equal(stack.top().id, 'tour');
  stack.answer('tour', 'yes', { words: 'yes' });
  assert.equal(stack.dropTop(), true, 'the blueprint question goes with other words');
  assert.deepEqual(log, ['answer:tour:yes:voice:yes', 'expire:blueprint:dropped']);
  assert.deepEqual(asked, ['ask:blueprint', 'ask:tour', 'again:blueprint']);
});

test('questions stack: a new request or Stop drops the questions that do not keep; closing drops all', () => {
  const clock = virtualClock();
  const { stack, asked } = stackOn(clock);
  const log = [];
  stack.push(question('tour', log, { keep: true }));
  stack.push(question('blueprint', log));
  assert.equal(stack.dropUnkept(), true);
  assert.deepEqual(log, ['expire:blueprint:replaced']);
  assert.deepEqual(asked, ['ask:tour', 'ask:blueprint'], 'not asked again at once');
  assert.equal(stack.top().id, 'tour');
  clock.advance(59999);
  assert.equal(stack.size(), 1, "the tour's clock ran on");
  stack.clear();
  assert.deepEqual(log, ['expire:blueprint:replaced', 'expire:tour:closed']);
  assert.equal(clock.pending(), 0);
});

test('questions stack: cancel() withdraws without a callback; a tap answers from anywhere', () => {
  const clock = virtualClock();
  const { stack, asked } = stackOn(clock);
  const log = [];
  const tour = stack.push(question('tour', log, { keep: true }));
  const research = stack.push(question('research', log));
  assert.equal(tour.answer('yes'), true, 'a tap on the covered question');
  assert.deepEqual(log, ['answer:tour:yes:tap:']);
  assert.deepEqual(asked, ['ask:tour', 'ask:research'], 'the one on top stays');
  assert.equal(research.cancel(), true);
  assert.equal(research.cancel(), false);
  assert.deepEqual(log, ['answer:tour:yes:tap:']);
  assert.equal(stack.size(), 0);
});

test('questions stack: a failing callback never breaks the stack', () => {
  const clock = virtualClock();
  const { stack } = stackOn(clock);
  stack.push({ id: 'q', onAnswer: () => { throw new Error('x'); }, onExpire: () => { throw new Error('y'); } });
  assert.equal(stack.answer('q', 'yes'), true);
  stack.push({ id: 'r', timeoutMs: 10, onExpire: () => { throw new Error('y'); } });
  clock.advance(10);
  assert.equal(stack.size(), 0);
});

// ---- the prompt channel, beside the questions --------------------------------------------------

test('the prompt channel: one prompt at a time, answered by its own words; it never touches the questions', () => {
  const clock = virtualClock();
  const { stack } = stackOn(clock);
  const said = [];
  const prompts = createPromptChannel({ onSay: (p) => said.push(p.id) });
  const log = [];
  stack.push(question('tour', log, { keep: true, timeoutMs: 60000 }));
  const first = prompts.open({ id: 'chrome-1', say: 'Chrome asks: add it to the cart?', answers: [{ id: 'approve', words: ['approve', 'approve it'] }, { id: 'deny', words: ['deny', 'cancel Chrome'] }], onAnswer: (a, info) => log.push(`prompt:${a}:${info.words}`), onClosed: () => log.push('closed:chrome-1') });
  assert.deepEqual(said, ['chrome-1']);
  // Questions never expire it, and it never expires them.
  stack.push(question('research', log, { timeoutMs: 1000 }));
  clock.advance(1000);
  assert.equal(prompts.current().id, 'chrome-1');
  assert.equal(stack.top().id, 'tour');
  assert.equal(stack.remaining('tour'), 60000, 'its clock stopped while the research offer covered it');
  clock.advance(1000);
  assert.equal(stack.remaining('tour'), 59000, 'and runs again, the prompt open or not');
  assert.equal(prompts.answer('chrome-1', 'approve', { words: 'approve' }), true);
  assert.equal(prompts.current().id, 'chrome-1', 'it stays until its owner closes it');
  assert.equal(stack.size(), 1);
  // A new prompt closes the old one; update() and close() act on their own prompt only.
  const second = prompts.open({ id: 'chrome-2', say: 'Chrome asks again', answers: [], onClosed: () => log.push('closed:chrome-2') });
  assert.equal(first.update({ say: 'x' }), false);
  assert.equal(second.update({ say: 'Chrome asks: the second one?' }), true);
  assert.equal(prompts.current().say, 'Chrome asks: the second one?');
  assert.equal(first.close(), false);
  assert.equal(second.close(), true);
  assert.equal(prompts.current(), null);
  assert.deepEqual(log, ['expire:research:timeout', 'prompt:approve:approve', 'closed:chrome-1', 'closed:chrome-2']);
  assert.equal(stack.top().id, 'tour');
});

test("the router's answer layer: the prompt's words first, then the top question's; never the prompt from another reading", () => {
  const r = createRouter();
  registerTodayCommands(r);
  const log = [];
  const clock = virtualClock();
  const { stack } = stackOn(clock);
  stack.push(question('tour', log, { keep: true, choices: [{ id: 'enclosed', words: ['enclosed', 'show it enclosed'] }, { id: 'continue', words: ['continue'] }] }));
  const prompts = createPromptChannel();
  prompts.open({ id: 'p1', answers: [{ id: 'approve', words: ['approve'] }] });
  const st = { ...emptyState('voice'), questions: stack.list(), prompt: prompts.current() };
  let hit = r.route(['approve'], st);
  assert.deepEqual([hit.id, hit.action.prompt, hit.action.answer], ['prompt', 'p1', 'approve']);
  hit = r.route(['Hey Jarvis, enclosed please'], st);
  assert.deepEqual([hit.id, hit.action.question, hit.action.choice], ['question', 'tour', 'enclosed']);
  hit = r.route(['continue'], st);
  assert.deepEqual([hit.id, hit.action.choice], ['question', 'continue'], '"continue" is the tour\'s, never the prompt\'s');
  assert.equal(r.route(['apples', 'approve'], st), null, 'an approval never comes from another reading');
});

test('answers are whole sentences after fillers', () => {
  assert.equal(answerWords('Hey Jarvis, enclosed, please.'), 'enclosed');
  assert.equal(answerWords('OK so Jarvis approve it thanks'), 'approve it');
  assert.equal(sameWords('Approve!', 'approve'), true);
  assert.equal(sameWords('approve the purchase', 'approve'), false);
  assert.equal(sameWords('', ''), false);
  const q = [{ id: 'q', choices: [{ id: 'a', words: ['the first one'] }] }];
  assert.equal(matchQuestionAnswer(q, 'the first one please').choice, 'a');
  assert.equal(matchQuestionAnswer(q, 'the first one is wrong'), null);
  assert.equal(matchQuestionAnswer([], 'yes'), null);
  // A question's own match() wins over words, and gets the readings.
  const seen = [];
  const own = [{ id: 'q', check: true, match: (text, readings) => (seen.push(readings.length), text === 'yep' ? 'yes' : null) }];
  assert.deepEqual(matchQuestionAnswer(own, 'yep', ['yep', 'yap']), { do: 'answer', question: 'q', choice: 'yes', check: true });
  assert.deepEqual(seen, [2]);
  assert.equal(matchPromptAnswer(null, 'approve'), null);
  assert.equal(matchPromptAnswer({ id: 'p', answers: [{ id: 'allow', words: ['allow once'], check: true }] }, 'allow once').check, true);
});

// ---- the hold ---------------------------------------------------------------------------------

test('the hold: at most 2 minutes after the owner\'s last words, then not held (its reasons stay)', () => {
  let now = 1000;
  const hold = createVoiceHold({ now: () => now });
  assert.equal(HOLD_CAP_MS, 120000);
  assert.equal(hold.held(), false);
  hold.hold('tour');
  assert.equal(hold.held(), true);
  now += 119999;
  assert.equal(hold.held(), true);
  assert.equal(hold.remainingMs(), 1);
  now += 1;
  assert.equal(hold.held(), false, 'the cap');
  assert.equal(hold.remainingMs(), 0);
  assert.deepEqual(hold.reasons(), ['tour'], 'whatever held it stays where it was');
  hold.heard(); // "Hey Jarvis, continue the tour": the owner's words start the 2 minutes again
  assert.equal(hold.held(), true);
  now += 60000;
  hold.heard();
  now += 119999;
  assert.equal(hold.held(), true, 'counted from the last words');
  assert.equal(hold.release('tour'), true, 'nothing holds it any more');
  assert.equal(hold.held(), false);
});

test('the hold: several reasons; released only when the last one goes', () => {
  let now = 0;
  const hold = createVoiceHold({ now: () => now, capMs: 1000 });
  hold.hold('tour');
  hold.hold('research');
  assert.equal(hold.release('tour'), false);
  assert.equal(hold.held(), true);
  now = 999;
  assert.equal(hold.held(), true);
  assert.equal(hold.release('research'), true);
  assert.equal(hold.held(), false);
});

// ---- the 2-second check's bound action ---------------------------------------------------------

test("the check's bound action: sent unchanged it runs that action; corrected words are routed again", () => {
  const action = { id: 'chrome-task', action: { do: 'chrome-task', check: true }, reading: 'find a 4K monitor in Chrome' };
  const check = { action, shown: 'find a 4K monitor in Chrome' };
  assert.equal(boundAction(check, 'find a 4K monitor in Chrome'), action);
  assert.equal(boundAction(check, '  find a 4K monitor in Chrome '), action, 'spaces aside');
  assert.equal(boundAction(check, 'find a 5K monitor in Chrome'), null, '"no, I said …" or an edit');
  assert.equal(boundAction(check, ''), null);
  assert.equal(boundAction({ action: null, shown: 'what time is it' }, 'what time is it'), null, 'a turn: routed as before');
  assert.equal(boundAction(null, 'x'), null);
});
