// v8.1 hands-free on a Mac, Voice Mode's side (src/ui/voice-mode.js, SPEC §28.1, §28.4; §22 note): listening and
// speaking in the background (A1), every woken session going back to Standby (A2), the follow-up window and the
// hidden brake (A6), barge-in (A8) and the lines before the wake greeting (wake.pending(), lead decision D3).
// Voice Mode itself on a tiny DOM and a virtual clock, with a fake recognizer and fake voices
// (voice-mode.fakes.mjs, from the u-mac study's probe: there, woken hidden, he listened 0 times).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voiceEnv } from './voice-mode.fakes.mjs';

const ANSWER = 'The capital of France is Paris.';
const Q = 'what is the capital of France';
const onlyAfter = (n, words) => (i) => (i === n ? words : null); // listen n hears `words`, the others nobody

/** Advance the virtual clock 50 ms at a time until `cond()` holds (at most `maxMs`). */
async function until(env, cond, what = 'the condition', maxMs = 180000) {
  const end = env.clock.now() + maxMs;
  while (!cond()) {
    if (env.clock.now() > end) throw new Error(`timed out waiting for ${what}`);
    await env.advance(50);
  }
}

// ---- A1: woken in the background -----------------------------------------------------------------------

test('A1: woken hidden on a Mac — he listens there (the recognizer restarts in the background), hears the question, answers, then Standby; chimes, title and one notification say so', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  env.say(onlyAfter(1, Q)); // the wake window hears nobody; the offer's listen hears the question
  env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, answer: ANSWER });
  await env.advance(40000);
  assert.ok(env.log.listens.length >= 3, `listens while hidden: ${env.log.listens.length}`);
  assert.ok(env.log.listens.every((l) => l.hidden && l.background === true), 'each with background: true');
  assert.deepEqual(env.log.turns, [Q], 'the question was sent once');
  assert.ok(env.log.spoken.some((s) => s.text === ANSWER), 'the answer was said');
  assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }], 'back to Standby by himself');
  const hiddenChimes = env.log.sounds.filter((x) => x.hidden && x.asked).map((x) => x.name);
  assert.ok(hiddenChimes.includes('wake') && hiddenChimes.includes('listen-start') && hiddenChimes.includes('listen-stop'), `the chimes, asked to play hidden: ${hiddenChimes}`);
  for (const w of ['Listening', 'Thinking', 'Speaking']) assert.ok(env.doc.titles.includes(`${w} · Jarvis`), `“${w} · Jarvis” in ${JSON.stringify(env.doc.titles)}`);
  assert.equal(env.doc.title, 'Jarvis', 'the title is back');
  assert.equal(env.log.notes.length, 1, 'one notification');
  assert.equal(env.log.notes[0].title, 'Jarvis is listening');
  assert.equal(env.log.notes[0].body, 'Ask away, or say “go back to sleep”.');
  assert.equal(env.log.notes[0].closed, true, 'closed when the session ended');
  assert.ok(env.log.awake.length === 1 && env.log.awake[0].hidden === true, 'onAwake still told it was hidden');
});

test('A1: hands-free off (the setting, an iPhone): woken hidden he greets and never listens there; once shown he listens (as before)', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  env.say(() => null);
  const vm = env.open({ wake: env.wakeHooks(), listenWhileHidden: () => false });
  await env.advance(20000);
  assert.equal(env.log.listens.length, 0, 'no listening while hidden');
  assert.ok(env.log.spoken[0] && /Shall I/.test(env.log.spoken[0].text), 'the greeting was said');
  assert.equal(env.log.notes.length, 0, 'no hands-free notification (the app shows its own)');
  assert.ok(!env.doc.titles.some((x) => /·/.test(x)), 'no session title');
  assert.ok(env.log.sounds.filter((x) => x.asked && x.name !== 'wake').length === 0, 'no chime asked to play hidden but the wake (as before)');
  env.setHidden(false);
  await env.advance(500);
  assert.equal(vm.state, 'listening', 'on screen again, he listens for the answer');
  assert.equal(env.log.listens[0].background, false);
});

test('A1: a session opened by a tap, hidden mid-listen — the same listen goes on, the question is sent, one notification', async (t) => {
  const env = await voiceEnv(t);
  env.say(onlyAfter(0, Q));
  const vm = env.open({ listenWhileHidden: () => true, answer: ANSWER });
  await env.advance(500);
  assert.equal(vm.state, 'listening');
  env.setHidden(true);
  await env.advance(200);
  assert.equal(env.log.aborted, 0, 'the listen was not stopped');
  assert.equal(vm.state, 'listening');
  await env.advance(8000);
  assert.deepEqual(env.log.turns, [Q]);
  assert.ok(env.log.spoken.some((s) => s.text === ANSWER));
  assert.equal(env.log.notes.length, 1, 'the notification once he went on in the background');
  vm.close();
  assert.equal(env.log.notes[0].closed, true);
  assert.equal(env.doc.title, 'Jarvis');
});

test('A1: an idle session (nothing under way) hidden on a Mac shows no “Jarvis is listening” notification', async (t) => {
  const env = await voiceEnv(t);
  env.say(onlyAfter(0, Q));
  const vm = env.open({ listenWhileHidden: () => true }); // the question fails: an apology, then idle
  await until(env, () => env.log.spoken.some((s) => /apologies/.test(s.text)), 'the apology');
  await env.advance(3000);
  env.setHidden(true);
  await env.advance(1000);
  assert.equal(env.log.notes.length, 0, JSON.stringify(env.log.notes.map((n) => n.title)));
  vm.close();
});

test('A1 (u-mac probe C): hidden during the 2-second check — it keeps counting and sends; without hands-free it pauses (and A2 brings Standby back)', async (t) => {
  for (const handsFree of [true, false]) {
    const env = await voiceEnv(t);
    env.say(onlyAfter(1, Q));
    env.open({ wake: env.wakeHooks(), listenWhileHidden: () => handsFree, answer: ANSWER, settings: { listenSend: 'show' } });
    await env.advance(1); // the wake routine
    // Wake window (2.4 s, nobody), the greeting (1.5 s), then the question heard 1.5 s into the offer's listen.
    await until(env, () => !!env.log.listens[1], 'the offer\'s listen');
    await env.advance(1500 + 600); // the words are on the check: 0.6 s into its 2 s
    env.setHidden(true);
    await env.advance(3000);
    if (handsFree) {
      assert.deepEqual(env.log.turns, [Q], 'sent from the background');
      await env.advance(30000);
      assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }]);
    } else {
      assert.deepEqual(env.log.turns, [], 'paused: nothing sent while away');
      await env.advance(55000);
      assert.deepEqual(env.log.closes, [], 'not yet');
      await env.advance(10000);
      assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }], 'A2: back to Standby after a quiet minute (it stayed for good before)');
      assert.deepEqual(env.log.turns, [], 'and nothing was sent');
    }
  }
});

test('A1: the recognizer fails in the background — he says once that he can’t hear there, the notification says the same, he stops listening; woken, back to Standby', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  env.say((n) => (n === 0 ? null : { error: 'other' }));
  env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true });
  await env.advance(15000);
  const said = env.log.spoken.map((s) => s.text);
  assert.ok(said.includes('I can’t hear you while I’m in the background. Click me.'), JSON.stringify(said));
  assert.equal(said.filter((x) => /can’t hear you/.test(x)).length, 1, 'said once');
  const note = env.log.notes.at(-1);
  assert.equal(note.body, 'I can’t hear you while I’m in the background. Click me.');
  const listens = env.log.listens.length;
  await env.advance(15000);
  assert.equal(env.log.listens.length, listens, 'no more listening in the background');
  assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }]);
});

// ---- A2: every end of a woken session goes back to Standby ---------------------------------------------

test('A2: an apology (a failed question) in a woken session: back to Standby after 10 s (it waited for a tap for good before)', async (t) => {
  const env = await voiceEnv(t);
  env.say(onlyAfter(1, Q));
  env.open({ wake: env.wakeHooks() }); // startTurn fails: "My apologies, Tony. …"
  await until(env, () => env.log.spoken.some((s) => /apologies/.test(s.text)), 'the apology');
  const at = env.clock.now();
  await env.advance(9000);
  assert.deepEqual(env.log.closes, []);
  await env.advance(3000);
  assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }]);
  assert.ok(env.clock.now() - at >= 10000);
});

test('A2: a voice-input error in a woken session (the typing it forces doesn’t hold him): back to Standby after 10 s', async (t) => {
  const env = await voiceEnv(t);
  env.say((n) => (n === 1 ? { error: 'network' } : null));
  const vm = env.open({ wake: env.wakeHooks() });
  await until(env, () => vm.state === 'error', 'the voice-input error');
  await env.advance(11000);
  assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }]);
});

test('A2: a session opened by a tap is unchanged: an apology waits for a tap', async (t) => {
  const env = await voiceEnv(t);
  env.say(onlyAfter(0, Q));
  env.open({});
  await env.advance(120000);
  assert.deepEqual(env.log.closes, [], 'stays open');
});

test('A2 (contract (a)): a held session waits 2 minutes after the owner’s last words, then goes back to Standby', async (t) => {
  const env = await voiceEnv(t);
  env.say(() => null);
  const vm = env.open({ wake: env.wakeHooks() });
  vm.hold('tour');
  await env.advance(100000);
  assert.deepEqual(env.log.closes, [], 'held');
  await env.advance(40000);
  assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }], 'the 2 minutes are up');
});

// ---- A6: the follow-up window and the brake ---------------------------------------------------------------

test('A6: woken — after an answer one listen with an 8 s window (one try); a follow-up said in it is answered; then silence: Standby', async (t) => {
  const env = await voiceEnv(t, { noSpeechMs: 60000 }); // the recognizer never gives up by itself
  env.say((n) => (n === 1 ? Q : n === 2 ? 'and what about Germany' : null));
  env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, answer: (q) => (/Germany/.test(q) ? 'The capital of Germany is Berlin.' : ANSWER) });
  await until(env, () => env.log.turns.length >= 2, 'the follow-up question');
  assert.equal(env.log.listens[2].noSpeechMs, 8000, 'the follow-up listen has the 8 s window');
  await until(env, () => env.log.listens.length >= 4, 'the second follow-up listen');
  const began = env.log.listens[3].at;
  assert.equal(env.log.listens[3].noSpeechMs, 8000);
  await until(env, () => env.log.closes.length > 0, 'Standby');
  const took = env.clock.now() - began;
  assert.ok(took >= 8000 && took <= 11500, `Standby ${took} ms after the follow-up listen began (8 s, then 2.5 s)`);
  assert.equal(env.log.listens.length, 4, 'one try');
  assert.equal(env.log.turns.length, 2);
});

test('A6: an iPhone (or the setting off) keeps today’s rule — woken: no 8 s window, two tries; three questions, then hidden while he answers: no brake', async (t) => {
  const env = await voiceEnv(t, { noSpeechMs: 60000 });
  env.say(onlyAfter(1, Q));
  env.open({ wake: env.wakeHooks(), listenWhileHidden: () => false, answer: ANSWER });
  await until(env, () => env.log.listens.length >= 3, 'the listen after the answer');
  assert.equal(env.log.listens[1].noSpeechMs, undefined, 'the offer: no window');
  assert.equal(env.log.listens[2].noSpeechMs, undefined, 'after the answer: no window');
  const phone = await voiceEnv(t, { speechMs: 3000 });
  phone.say((n) => (n < 3 ? 'what is the capital of Spain' : null));
  phone.open({ listenWhileHidden: () => false, answer: 'Madrid.' });
  await until(phone, () => phone.log.turns.length >= 3, 'three questions on screen');
  await until(phone, () => phone.log.spoken.length >= 3, 'the third answer');
  phone.setHidden(true);
  await phone.advance(20000);
  assert.ok(!phone.log.spoken.some((x) => /Hey Jarvis/.test(x.text)), 'no brake said');
});

test('A6: a session opened by a tap, on screen: today’s Continuous rule (no window, two tries)', async (t) => {
  const env = await voiceEnv(t);
  env.say(onlyAfter(0, Q));
  env.open({ answer: ANSWER });
  await until(env, () => env.log.listens.length >= 3, 'two listens after the answer');
  assert.equal(env.log.listens[1].noSpeechMs, undefined, 'no 8 s window');
  assert.ok(env.log.listens[2].at > env.log.listens[1].at, 'a second try after a silent one');
});

test('A6: the brake — a tapped session in the background with steady talk: 3 questions, then “Say “Hey Jarvis” when you need me.” and no more listening', async (t) => {
  const env = await voiceEnv(t);
  env.say(() => 'what is the capital of Spain'); // a TV: every listen hears a question
  const vm = env.open({ listenWhileHidden: () => true, answer: 'Madrid.' });
  await env.advance(300);
  env.setHidden(true);
  await env.advance(90000);
  assert.equal(env.log.turns.length, 3, `${env.log.turns.length} questions taken`);
  assert.ok(env.log.spoken.some((s) => s.text === 'Say “Hey Jarvis” when you need me.'));
  const n = env.log.listens.length;
  await env.advance(60000);
  assert.equal(env.log.listens.length, n, 'no more listening');
  assert.equal(env.log.turns.length, 3, 'no more questions');
  assert.deepEqual(env.log.closes, [], 'a tapped session stays open, idle');
  // A tap (the owner, back): the count starts again.
  env.setHidden(false);
  vm.tap();
  await env.advance(5000);
  assert.equal(env.log.turns.length, 4, 'heard again after the tap');
});

test('A6: the brake in a woken session goes back to Standby; with Return to standby off it just stops listening', async (t) => {
  for (const back of [true, false]) {
    const env = await voiceEnv(t);
    env.setHidden(true);
    env.say((n) => (n === 0 ? null : 'what is the capital of Spain'));
    env.open({ wake: env.wakeHooks({ returnToStandby: () => back }), listenWhileHidden: () => true, answer: 'Madrid.' });
    await env.advance(120000);
    assert.equal(env.log.turns.length, 3);
    assert.ok(env.log.spoken.some((s) => s.text === 'Say “Hey Jarvis” when you need me.'));
    assert.deepEqual(env.log.closes, back ? [{ reason: 'standby', wakeSession: true }] : [], `return ${back}`);
  }
});

// ---- A8: barge-in ---------------------------------------------------------------------------------------

const LONG = 'Here is the plan for the evening, and the lights go out at ten. After that the house stays quiet until the morning, when the heating comes on at six and the coffee at seven.';

async function speakingGeorge(t, { voice = 'natural', text = LONG } = {}) {
  const env = await voiceEnv(t, { speechMs: 6000 });
  env.voice(voice);
  env.say(onlyAfter(0, Q));
  const vm = env.open({ answer: text });
  await until(env, () => env.log.spoken.some((s) => s.text.includes(text.slice(0, 20))), 'the answer to be spoken');
  await env.advance(1500); // well into it
  return { env, vm };
}

test('A8: "Hey Jarvis" or two claps while George speaks: he stops and listens', async (t) => {
  for (const trigger of ['word', 'clap']) {
    const { env, vm } = await speakingGeorge(t);
    assert.equal(vm.state, 'speaking');
    const listens = env.log.listens.length;
    assert.equal(vm.bargeIn(trigger), true, trigger);
    await env.advance(50);
    assert.ok(env.log.spoken.at(-1).cancelled, 'his speech was stopped');
    assert.equal(vm.state, 'listening');
    assert.equal(env.log.listens.length, listens + 1, 'a new listen');
  }
});

test('A8: not while the Mac’s own voice speaks (macOS plays it, outside Chrome’s echo reference), and not when he isn’t speaking', async (t) => {
  const { env, vm } = await speakingGeorge(t, { voice: 'device' });
  assert.equal(vm.bargeIn('word'), false);
  assert.equal(vm.state, 'speaking');
  assert.ok(!env.log.spoken.at(-1).cancelled);
  const quiet = await voiceEnv(t);
  quiet.say(() => null);
  const vm2 = quiet.open({});
  await quiet.advance(200);
  assert.equal(vm2.bargeIn('clap'), false, 'listening already: nothing to interrupt');
});

test('A8 (critique M8): George says “Jarvis” and the detector hears it — masked, he goes on; two claps at that moment still stop him', async (t) => {
  const text = 'Here is the plan for this evening. Jarvis will remind you at ten, and the house stays quiet until the morning comes again.';
  for (const trigger of ['word', 'clap']) {
    const env = await voiceEnv(t, { speechMs: 8000 });
    env.voice('natural');
    env.say(onlyAfter(0, Q));
    let result = null;
    let vm = null;
    env.onWord = ({ word }) => {
      if (/^Jarvis/.test(word) && result === null) result = vm.bargeIn(trigger);
    };
    vm = env.open({ answer: text });
    await until(env, () => result !== null, 'George to say “Jarvis”', 60000);
    if (trigger === 'word') {
      assert.equal(result, false, 'his own “Jarvis” is masked');
      assert.equal(vm.state, 'speaking');
    } else {
      assert.equal(result, true, 'claps are not masked');
    }
  }
});

test('A8: a barge-in counts as the owner calling him: the hidden count starts again', async (t) => {
  const env = await voiceEnv(t, { speechMs: 6000 });
  env.voice('natural');
  env.say(() => 'what is the capital of Spain');
  const vm = env.open({ listenWhileHidden: () => true, answer: LONG });
  await env.advance(300);
  env.setHidden(true);
  await until(env, () => env.log.turns.length >= 3, 'three questions');
  await until(env, () => vm.state === 'speaking', 'the third answer');
  await env.advance(1000);
  assert.equal(vm.bargeIn('clap'), true);
  await env.advance(8000);
  assert.equal(env.log.turns.length, 4, 'a fourth question after the barge-in');
});

// ---- D3: wake.pending() --------------------------------------------------------------------------------------

test('D3: the lines that waited for the owner (wake.pending()) come before the greeting', async (t) => {
  const env = await voiceEnv(t);
  env.say(() => null);
  env.open({ wake: env.wakeHooks({ pending: () => ['Chrome is waiting for you: add the monitor to the cart? Say approve, or cancel.', 'I’m on the Mac’s speakers; the speakerphone isn’t connected.'] }) });
  await until(env, () => env.log.spoken.length > 0, 'the greeting');
  const line = env.log.spoken[0].text;
  assert.ok(line.startsWith('Chrome is waiting for you: add the monitor to the cart? Say approve, or cancel. I’m on the Mac’s speakers; the speakerphone isn’t connected. Good '), line);
  assert.ok(/Shall I/.test(line), 'then the greeting and the offer');
  assert.equal(env.log.awake[0].line, line, 'onAwake gets the whole line');
});

test('D3: no hook, an empty list, or a hook that throws: the greeting as before', async (t) => {
  for (const pending of [undefined, () => [], () => null, () => { throw new Error('x'); }]) {
    const env = await voiceEnv(t);
    env.say(() => null);
    env.open({ wake: env.wakeHooks(pending ? { pending } : {}) });
    await until(env, () => env.log.spoken.length > 0, 'the greeting');
    assert.ok(/^Good (morning|afternoon|evening), Tony\./.test(env.log.spoken[0].text), env.log.spoken[0].text);
  }
});
