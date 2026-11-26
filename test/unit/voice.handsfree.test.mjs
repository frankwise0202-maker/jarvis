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

test('A8: a "Hey Jarvis" barge-in counts as the owner calling him: the hidden count starts again', async (t) => {
  const env = await voiceEnv(t, { speechMs: 6000 });
  env.voice('natural');
  env.say(() => 'what is the capital of Spain');
  const vm = env.open({ listenWhileHidden: () => true, answer: LONG });
  await env.advance(300);
  env.setHidden(true);
  await until(env, () => env.log.turns.length >= 3, 'three questions');
  await until(env, () => vm.state === 'speaking', 'the third answer');
  await env.advance(1000);
  assert.equal(vm.bargeIn('word'), true);
  await env.advance(8000);
  assert.equal(env.log.turns.length, 4, 'a fourth question after the barge-in');
});

// MAC-4: claps are the weak signal (a door, knocks, a TV's bang): they may stop George, but only the wake words, a
// tap or a key start the hidden count again. Before, a double bang during each answer let a TV run up questions.
test('MAC-4: woken hidden by claps, the TV heard in every listen, two claps during each answer: he stops each time, yet at most 3 questions, then the brake and Standby', async (t) => {
  for (const tapped of [false, true]) {
    const env = await voiceEnv(t, { speechMs: 6000 });
    env.voice('natural');
    if (!tapped) env.setHidden(true);
    env.say((n) => (n === 0 && !tapped ? null : 'what is the capital of Spain'));
    const vm = tapped ? env.open({ listenWhileHidden: () => true, answer: LONG }) : env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, answer: LONG });
    if (tapped) {
      await env.advance(300);
      env.setHidden(true);
    }
    const clapped = new Set();
    const acted = [];
    const end = env.clock.now() + 300000;
    while (env.clock.now() < end && !env.log.closes.length && env.log.turns.length < 8) {
      await env.advance(250);
      const sp = env.log.spoken.at(-1);
      if (vm.state === 'speaking' && sp && sp.text.startsWith('Here is the plan') && !sp.cancelled && !clapped.has(sp)) {
        clapped.add(sp);
        await env.advance(1000);
        acted.push(vm.bargeIn('clap'));
      }
      if (tapped && env.log.spoken.some((s) => s.text === 'Say “Hey Jarvis” when you need me.')) break;
    }
    assert.equal(env.log.turns.length, 3, `${tapped ? 'tapped' : 'woken'}: ${env.log.turns.length} questions taken (claps acted: ${JSON.stringify(acted)})`);
    assert.deepEqual(acted.slice(0, 2), [true, true], 'the claps stopped him during the first two answers');
    assert.ok(env.log.spoken.some((s) => s.text === 'Say “Hey Jarvis” when you need me.'), 'the brake was said');
    if (!tapped) assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }], 'then Standby');
  }
});

test('MAC-4: on screen, two claps during an answer still stop him and he listens (the brake is for the background)', async (t) => {
  const { env, vm } = await speakingGeorge(t);
  assert.equal(vm.bargeIn('clap'), true);
  await env.advance(50);
  assert.equal(vm.state, 'listening');
});

// MAC-8: "go back to sleep" (or the brake) sets S.sleepAfter for the line said next. When the owner cut that line
// ("Hey Jarvis", a tap) and asked something, the answer used to drop straight to Standby, without its follow-up.
test('MAC-8: “go back to sleep”, then “Hey Jarvis” or a tap during “Very good, Tony.” and a question: the answer gets its follow-up listen, not Standby at once', async (t) => {
  for (const how of ['word', 'tap']) {
    const env = await voiceEnv(t, { speechMs: 3000, noSpeechMs: 60000 });
    env.voice('natural');
    env.say((n) => (n === 1 ? 'go back to sleep' : n === 2 ? Q : null));
    const vm = env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, answer: ANSWER });
    await until(env, () => env.log.spoken.some((s) => /^Very good, Tony/.test(s.text)), 'the sleep line');
    await env.advance(1000);
    if (how === 'word') assert.equal(vm.bargeIn('word'), true, 'the line is cut');
    else vm.tap();
    await until(env, () => env.log.spoken.some((s) => s.text === ANSWER && s.done), `${how}: the answer, said to the end`);
    await env.advance(1500);
    assert.deepEqual(env.log.closes, [], `${how}: not straight back to Standby`);
    assert.equal(env.log.listens.length, 4, `${how}: the follow-up listen`);
    assert.equal(env.log.listens[3].noSpeechMs, 8000);
    await env.advance(12000);
    assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }], `${how}: Standby after the quiet follow-up`);
  }
});

test('MAC-8: the brake line cut by a tap (his own “Jarvis” in it masks the wake word) and a question: answered, then the follow-up window (not Standby at once)', async (t) => {
  const env = await voiceEnv(t, { speechMs: 3000, noSpeechMs: 60000 });
  env.voice('natural');
  env.setHidden(true);
  let cut = false;
  env.say((n) => (n === 0 ? null : n <= 3 ? 'what is the capital of Spain' : n === 4 && cut ? Q : null));
  const vm = env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, answer: (q) => (/France/.test(q) ? ANSWER : 'Madrid.') });
  await until(env, () => env.log.spoken.some((s) => s.text === 'Say “Hey Jarvis” when you need me.'), 'the brake line');
  await env.advance(800);
  cut = true;
  assert.equal(vm.bargeIn('word'), false, 'masked: George is saying “Jarvis”');
  vm.tap();
  await until(env, () => env.log.spoken.some((s) => s.text === ANSWER && s.done), 'the answer');
  await env.advance(1500);
  assert.deepEqual(env.log.closes, [], 'not straight back to Standby');
  assert.equal(env.log.listens.at(-1).noSpeechMs, 8000, 'the follow-up listen');
});

// MAC-V-1: the brake counts questions "since the last wake word, tap or key". Across the room, an owner who starts each
// follow-up with "Hey Jarvis, …" was counted as room talk: after three, "Say “Hey Jarvis” when you need me." (which
// they just did) and back to Standby.
test('MAC-V-1: woken hidden by “Hey Jarvis”, five follow-ups each said “Hey Jarvis, …”: all five are taken, no brake', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  const qs = ['France', 'Spain', 'Italy', 'Peru', 'Chile'].map((c) => `hey Jarvis what is the capital of ${c}`);
  env.say((n) => (n === 0 ? null : qs[n - 1] || null));
  env.open({ wake: env.wakeHooks({ trigger: 'word' }), listenWhileHidden: () => true, answer: 'Here it is.' });
  await until(env, () => env.log.closes.length > 0, 'the session to end', 240000);
  assert.deepEqual(env.log.turns, qs, 'every question taken');
  assert.ok(!env.log.spoken.some((s) => /when you need me/.test(s.text)), 'no brake');
  assert.deepEqual(env.log.closes, [{ reason: 'standby', wakeSession: true }], 'Standby after the quiet follow-up');
});

test('MAC-V-1: “Hey Jarvis” heard by Standby’s kept detector while he listens: no barge-in (nothing to interrupt), but the hidden count starts again', async (t) => {
  const env = await voiceEnv(t);
  env.say(() => 'what is the capital of Spain'); // the TV, in every listen
  const vm = env.open({ listenWhileHidden: () => true, answer: 'Madrid.' });
  await env.advance(300);
  env.setHidden(true);
  await until(env, () => env.log.listens.length >= 3 && vm.state === 'listening', 'the third listen');
  assert.equal(env.log.turns.length, 2);
  assert.equal(vm.bargeIn('word'), false, 'nothing to interrupt');
  await env.advance(120000);
  assert.equal(env.log.turns.length, 5, `the count started again at the wake word: ${env.log.turns.length} questions`);
  assert.ok(env.log.spoken.some((s) => s.text === 'Say “Hey Jarvis” when you need me.'), 'then the brake, three questions later');
});

test('MAC-V-1: two claps heard while he listens do nothing to the count', async (t) => {
  const env = await voiceEnv(t);
  env.say(() => 'what is the capital of Spain');
  const vm = env.open({ listenWhileHidden: () => true, answer: 'Madrid.' });
  await env.advance(300);
  env.setHidden(true);
  await until(env, () => env.log.listens.length >= 3 && vm.state === 'listening', 'the third listen');
  assert.equal(vm.bargeIn('clap'), false);
  await env.advance(120000);
  assert.equal(env.log.turns.length, 3, 'the brake after three, as without them');
});

// MAC-7: the most natural hidden wake, a question straight after "Hey Jarvis" in one breath, never reached greetWake:
// no "Jarvis is listening" notification, and the lines that waited (D3) weren't said.
test('MAC-7: woken hidden by “Hey Jarvis, what is …” in one breath: one “Jarvis is listening” notification, and the lines that waited (wake.pending()) are said before the answer', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  env.say(onlyAfter(0, Q)); // the wake window hears the question
  let asked = 0;
  const pending = () => {
    asked += 1;
    return ['I’m on the Mac’s speakers; the speakerphone isn’t connected.'];
  };
  env.open({ wake: env.wakeHooks({ trigger: 'word', pending }), listenWhileHidden: () => true, answer: ANSWER });
  await until(env, () => env.log.spoken.some((s) => s.text.includes(ANSWER)), 'the answer');
  assert.deepEqual(env.log.turns, [Q], 'the question was asked (the routine stepped aside)');
  assert.equal(env.log.notes.length, 1, 'one notification');
  assert.equal(env.log.notes[0].title, 'Jarvis is listening');
  assert.equal(asked, 1, 'the lines were asked for once');
  assert.equal(env.log.spoken.find((s) => s.text.includes(ANSWER)).text, `I’m on the Mac’s speakers; the speakerphone isn’t connected. ${ANSWER}`);
  await until(env, () => env.log.closes.length > 0, 'the end of the session');
  assert.equal(env.log.notes[0].closed, true, 'closed with the session');
});

test('MAC-7: on screen, the same one-breath wake shows no notification; with nothing waiting the answer is said as before', async (t) => {
  const env = await voiceEnv(t);
  env.say(onlyAfter(0, Q));
  env.open({ wake: env.wakeHooks({ trigger: 'word' }), listenWhileHidden: () => true, answer: ANSWER });
  await until(env, () => env.log.spoken.some((s) => s.text.includes(ANSWER)), 'the answer');
  assert.equal(env.log.notes.length, 0);
  assert.equal(env.log.spoken.find((s) => s.text.includes(ANSWER)).text, ANSWER);
});

// MAC-R2-1: the app's voice lock follows what Voice Mode does, not whether it is open: it is active while he listens,
// checks, thinks or speaks, and not while he sits idle ("Ready"); closed, it ends at once.
test('MAC-R2-1: Voice Mode tells the app when it can hear the owner or is answering, and when it sits idle; closing ends it at once', async (t) => {
  const env = await voiceEnv(t, { noSpeechMs: 900 });
  env.say(onlyAfter(0, Q));
  const seen = [];
  const vm = env.open({ answer: ANSWER, settings: { listenSend: 'show' }, extra: { onActive: (on, o = {}) => seen.push(o.now ? `${on}:now` : on) } });
  await env.advance(200);
  assert.equal(seen.at(-1), true, 'listening: active');
  await until(env, () => env.log.spoken.some((s) => s.text === ANSWER && s.done), 'the answer, through the 2-second check');
  assert.ok(!seen.includes(false), `active all through the check, the turn and the answer (${JSON.stringify(seen)})`);
  await until(env, () => vm.state === 'idle', 'idle after the follow-ups heard nobody', 60000);
  assert.equal(seen.at(-1), false, 'idle: no longer active');
  vm.close();
  assert.equal(seen.at(-1), 'false:now', 'closed: at once');
});

// MAC-R2-3: the hidden count (A6) goes on across sessions until "Hey Jarvis", a tap or key, or Jarvis on screen: a
// false double bang after the brake used to start it again, and a TV got 3 more paid questions every time.
test('MAC-R2-3: after the brake, two more claps-woken hidden sessions take no question (only the routine’s free answers), each ends with the brake line; a "Hey Jarvis" wake starts the count again', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  env.say(() => 'what is the capital of Spain'); // the TV, in every listen (the claps' wake window ignores it)
  let carried = { asked: 0, braked: false };
  const hiddenCount = { get: () => carried, set: (c) => (carried = c) };
  const session = async (trigger, n) => {
    env.open({ wake: env.wakeHooks({ trigger }), listenWhileHidden: () => true, answer: 'Madrid.', extra: { hiddenCount } });
    await until(env, () => env.log.closes.length >= n, `session ${n} to end`, 240000);
  };
  await session('clap', 1);
  assert.equal(env.log.turns.length, 3, 'the first: 3 questions, then the brake');
  for (const n of [2, 3]) {
    await session('clap', n);
    assert.equal(env.log.turns.length, 3, `claps wake ${n}: no paid question (${env.log.turns.length})`);
    assert.deepEqual(env.log.closes.at(-1), { reason: 'standby', wakeSession: true }, 'back to Standby');
  }
  assert.equal(env.log.spoken.filter((s) => s.text === 'Say “Hey Jarvis” when you need me.').length, 3, 'each wake ended with the brake line');
  await session('word', 4); // "Hey Jarvis": the owner calls him
  assert.ok(env.log.turns.length > 3, `"Hey Jarvis" starts the count again (${env.log.turns.length})`);
});

test('MAC-R2-3: braked after claps, the routine’s free answers still work ("play it", "go back to sleep"), and on screen the count doesn’t carry', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  env.say((n) => (n === 0 ? null : 'go back to sleep'));
  let carried = { asked: 3, braked: true };
  const hiddenCount = { get: () => carried, set: (c) => (carried = c) };
  env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, answer: 'Madrid.', extra: { hiddenCount } });
  await until(env, () => env.log.closes.length >= 1, 'the session to end', 60000);
  assert.ok(env.log.spoken.some((s) => /^Very good, Tony/.test(s.text)), '"go back to sleep" taken (free)');
  assert.equal(env.log.turns.length, 0);
  // Jarvis on screen: the count starts again.
  env.setHidden(false);
  carried = { asked: 3, braked: true };
  env.say(() => 'what is the capital of Spain');
  env.open({ wake: env.wakeHooks(), listenWhileHidden: () => true, answer: 'Madrid.', extra: { hiddenCount } });
  await until(env, () => env.log.turns.length >= 1, 'a question taken on screen', 60000);
});

// MAC-R3-3: braked after claps, free commands still run (stops above all): only words that would be paid get the brake
// line. And only paid or sent listens count toward the carried count (free music commands never brake him).
const BRAKE_LINE = 'Say “Hey Jarvis” when you need me.';
function freeRouter(ran) {
  return {
    route: (readings) => {
      const w = readings[0];
      if (/\bstop\b/i.test(w)) return { id: 'stop', layer: 'stop', reading: w, action: { targets: [/chrome|task/i.test(w) ? 'chrome' : 'music'] } };
      if (/^(play|next)\b/i.test(w)) return { id: 'media-free', layer: 'media', reading: w, action: { words: w } };
      return null;
    },
    run: (hit) => {
      ran.push(hit.id === 'stop' ? `stop:${hit.action.targets.join(',')}` : hit.action.words);
      return { ack: 'Done.' };
    },
  };
}

test('MAC-R3-3: braked after claps (hidden), "stop Chrome" and "stop the music" in the offer’s listen are carried out; a question gets the brake line and nothing is sent', async (t) => {
  for (const carried0 of [{ asked: 3, braked: true }, { asked: 0, braked: false }]) {
    for (const words of ['stop Chrome', 'stop the music', 'what is the capital of Spain']) {
      const env = await voiceEnv(t);
      env.setHidden(true);
      env.say((n) => (n === 1 ? words : null));
      const ran = [];
      let carried = { ...carried0 };
      const hiddenCount = { get: () => carried, set: (c) => (carried = c) };
      env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: 'Madrid.', extra: { hiddenCount, router: freeRouter(ran) } });
      await until(env, () => env.log.closes.length >= 1, 'the session to end', 120000);
      const said = env.log.spoken.map((x) => x.text);
      const what = `${JSON.stringify(carried0)} "${words}"`;
      if (/^stop/.test(words)) {
        assert.equal(ran.length, 1, `${what}: carried out (${JSON.stringify(ran)})`);
        assert.equal(env.log.turns.length, 0, `${what}: nothing sent`);
        if (carried0.braked) assert.ok(!said.slice(1).includes(BRAKE_LINE), `${what}: no brake line for a free stop`);
        assert.deepEqual(carried, carried0.braked ? carried0 : { asked: 0, braked: false }, `${what}: a free stop is not counted`);
      } else if (carried0.braked) {
        assert.equal(env.log.turns.length, 0, `${what}: nothing sent`);
        assert.ok(said.includes(BRAKE_LINE), `${what}: the brake line`);
      } else {
        assert.equal(env.log.turns.length, 1, `${what}: the question is answered`);
        assert.equal(carried.asked, 1, `${what}: counted`);
      }
    }
  }
});

test('MAC-R3-3: braked after claps, "stop Chrome" in the claps wake window (REDTEAM-VOICE-10) still runs', async (t) => {
  for (const carried0 of [{ asked: 3, braked: true }, { asked: 0, braked: false }]) {
    const env = await voiceEnv(t);
    env.setHidden(true);
    env.say((n) => (n === 0 ? 'stop Chrome' : null));
    const ran = [];
    const router = {
      route: (readings) => (/\bstop\b/i.test(readings[0]) ? { id: 'stop', layer: 'stop', reading: readings[0], action: { targets: ['chrome'] } } : null),
      run: (hit) => {
        ran.push(`${hit.id}:${hit.action.targets.join(',')}`);
        return { ack: 'Chrome stopped.' };
      },
    };
    let carried = { ...carried0 };
    const hiddenCount = { get: () => carried, set: (c) => (carried = c) };
    env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: 'x', extra: { hiddenCount, router } });
    await until(env, () => env.log.closes.length >= 1, 'the session to end', 120000);
    assert.deepEqual(ran, ['stop:chrome'], `${JSON.stringify(carried0)}: the stop ran`);
  }
});

test('MAC-R3-3: four claps wakes while hidden, each with one free music command: all four run, no brake, and the carried count stays 0', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  const words = ['play some jazz', 'next song', 'play Back in Black', 'stop the music'];
  const ran = [];
  const router = freeRouter(ran);
  let carried = { asked: 0, braked: false };
  const hiddenCount = { get: () => carried, set: (c) => (carried = { asked: Math.max(0, Number(c && c.asked) || 0), braked: !!(c && c.braked) }) };
  for (let s = 1; s <= 4; s++) {
    const base = env.log.listens.length;
    env.say((n) => (n === base + 1 ? words[s - 1] : null)); // the offer's listen of this session
    env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: 'x', extra: { hiddenCount, router } });
    await until(env, () => env.log.closes.length >= s, `session ${s} to end`, 300000);
  }
  assert.equal(ran.length, 4, `every free command ran (${JSON.stringify(ran)})`);
  assert.ok(!env.log.spoken.some((x) => x.text === BRAKE_LINE), 'no brake line');
  assert.deepEqual(carried, { asked: 0, braked: false });
  assert.equal(env.log.turns.length, 0);
});

test('MAC-R3-3: a TV heard in every listen of three false claps wakes: at most 3 paid questions in all (the second and third wakes: none)', async (t) => {
  for (const tv of [
    ['How tall is the Eiffel Tower?', 'Who wrote Hamlet?', 'What is the speed of light?', 'What is the capital of Spain?'],
    ['yes', 'Hey, what is the weather like in Paris?', 'run the briefing', 'tell me a joke'],
  ]) {
    const env = await voiceEnv(t);
    env.setHidden(true);
    let i = 0;
    env.say(() => tv[i++ % tv.length]);
    let carried = { asked: 0, braked: false };
    const hiddenCount = { get: () => carried, set: (c) => (carried = { asked: Math.max(0, Number(c && c.asked) || 0), braked: !!(c && c.braked) }) };
    const paid = [];
    for (let s = 1; s <= 3; s++) {
      const before = env.log.turns.length;
      env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: 'An answer.', extra: { hiddenCount } });
      await until(env, () => env.log.closes.length >= s, `session ${s} to end`, 300000);
      paid.push(env.log.turns.length - before);
    }
    assert.ok(paid[0] <= 3 && paid[1] === 0 && paid[2] === 0, `${JSON.stringify(tv[0])}…: paid per wake ${JSON.stringify(paid)}`);
  }
});

// MAC-R3-1: after the brake, two claps and "Hey Jarvis" in the same breath: the owner called him, so the count starts
// again (the wake window heard the wake words, or Standby's kept microphone did: barge-in), and the greeting keeps it.
test('MAC-R3-1: braked, claps with "Hey Jarvis" heard by the wake window: the question in the offer’s listen is answered', async (t) => {
  const cases = [(n) => (n === 0 ? `hey jarvis ${Q}` : n === 1 ? Q : null), (n) => (n === 0 ? 'hey jarvis' : n === 1 ? Q : null)];
  for (const say of cases) {
    const env = await voiceEnv(t);
    env.setHidden(true);
    env.say(say);
    let carried = { asked: 3, braked: true };
    const hiddenCount = { get: () => carried, set: (c) => (carried = c) };
    env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: ANSWER, extra: { hiddenCount } });
    await until(env, () => env.log.closes.length >= 1, 'the session to end', 120000);
    assert.ok(env.log.turns.length >= 1, `answered (${JSON.stringify(env.log.spoken.map((x) => x.text.slice(0, 40)))})`);
    assert.ok(!env.log.spoken.some((x) => x.text === BRAKE_LINE), 'no brake line');
  }
});

test('MAC-R3-1: braked, Standby’s kept microphone hears "Hey Jarvis" during the claps wake window (barge-in): the count starts again', async (t) => {
  const env = await voiceEnv(t);
  env.setHidden(true);
  env.say((n) => (n === 1 ? Q : null));
  let carried = { asked: 3, braked: true };
  const hiddenCount = { get: () => carried, set: (c) => (carried = c) };
  const vm = env.open({ wake: env.wakeHooks({ trigger: 'clap' }), listenWhileHidden: () => true, answer: ANSWER, extra: { hiddenCount } });
  await until(env, () => vm.isListening(), 'the wake window');
  await env.advance(600);
  vm.bargeIn('word');
  await until(env, () => env.log.closes.length >= 1, 'the session to end', 120000);
  assert.ok(env.log.turns.length >= 1, 'the question is answered');
  assert.ok(!env.log.spoken.some((x) => x.text === BRAKE_LINE), 'no brake line');
});

// MAC-R2-5: a one-breath "Hey Jarvis, <free command>" took the speakerphone line (given once per absence) for a turn's
// preface that never came: the line was never said. Now it is asked for only when an answer says it.
test('MAC-R2-5: one breath "Hey Jarvis, play some AC/DC" (a free command) with the speakerphone away: the line isn’t taken, and the next wake’s greeting says it; a one-breath question still says it before its answer', async (t) => {
  const LINE = 'I’m on the Mac’s speakers; the speakerphone isn’t connected.';
  const { createWakePending } = await import('../../src/lib/wake/pending.js');
  const music = { command: () => ({ handled: true, done: Promise.resolve({ ack: 'Here’s some AC/DC.' }) }) };
  const router = { route: (readings) => (/^play\b/i.test(readings[0]) ? { id: 'music', layer: 'media', reading: readings[0], action: {} } : null), run: () => false };
  for (const words of ['play some AC/DC', Q]) {
    const env = await voiceEnv(t);
    env.setHidden(true);
    const st = { away: true, given: 0 };
    const wp = createWakePending();
    wp.add(() => {
      if (!st.away) return null;
      st.away = false; // awayLine(): given once per absence
      st.given += 1;
      return LINE;
    });
    env.say((n) => (n === 0 ? words : null));
    env.open({ wake: env.wakeHooks({ trigger: 'word', pending: () => wp.lines() }), listenWhileHidden: () => true, answer: ANSWER, extra: { router, music } });
    await until(env, () => env.log.spoken.some((s) => /AC\/DC|Paris/.test(s.text)), 'the answer');
    await env.advance(30000);
    const first = env.log.spoken.map((s) => s.text);
    if (words === Q) {
      assert.ok(first.some((x) => x.startsWith(`${LINE} `) && x.includes('Paris')), `said before the answer (${JSON.stringify(first)})`);
      continue;
    }
    assert.equal(st.given, 0, 'not taken by a free command');
    env.say(() => null);
    env.open({ wake: env.wakeHooks({ trigger: 'clap', pending: () => wp.lines() }), listenWhileHidden: () => true });
    await env.advance(8000);
    assert.ok(env.log.spoken.some((s) => s.text.startsWith(`${LINE} Good`)), `the next greeting says it (${JSON.stringify(env.log.spoken.map((s) => s.text))})`);
  }
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
