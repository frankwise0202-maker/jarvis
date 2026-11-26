// Jarvis for Chrome by voice, the fixes after the red team (v8.1): the controller (src/ui/chrome-task.js) and the
// words (src/lib/chrome-task-words.js, src/lib/chrome-prompt-words.js), against the fake app.chromeLink
// (chrome-voice.fakes.mjs) and the app's router with chrome-voice's and voice's matchers. Plain Node. (Voice Mode's
// own side is chrome-voice.voice-mode.test.mjs.)
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS, createFakeChromeLink, createFakeVoice, flush } from './chrome-voice.fakes.mjs';
import { createChromeVoice } from '../../src/ui/chrome-task.js';
import { matchChromeStatus, matchChromeTask, taskCheckLine } from '../../src/lib/chrome-task-words.js';
import * as promptWords from '../../src/lib/chrome-prompt-words.js';

const { isNoWord, chooseAnswer, promptAnswers } = promptWords;
const matchTypedChrome = (...a) => promptWords.matchTypedChrome(...a);
import { createRouter, registerTodayCommands, emptyState } from '../../src/lib/command-router.js';
import { register as registerChromeVoice } from '../../src/ui/commands/chrome-voice.js';
import { register as registerVoice } from '../../src/ui/commands/voice.js';
import { appCommandLine } from '../../src/lib/app-commands.js';

const TASK = { do: 'chrome-task', text: 'find a 4K monitor under $300 and add it to the cart', chat: 'new' };

function setup({ voice = true, budget = 1, hidden = false, link = {}, channel = null } = {}) {
  const fake = createFakeChromeLink(link);
  if (budget !== null) fake.set({ budgetUsd: budget });
  const v = voice ? createFakeVoice() : null;
  if (v) delete v.card;
  const toasts = [];
  const notices = [];
  let voiceOpen = !!v;
  const cv = createChromeVoice({
    link: fake.link,
    voice: () => (voiceOpen ? v : null),
    toast: (text) => toasts.push(text),
    notify: (n) => notices.push(n),
    closeNotice: () => {},
    hidden: () => hidden,
    channel,
  });
  return {
    fake,
    v,
    cv,
    toasts,
    notices,
    setVoice(on) {
      voiceOpen = on;
      cv.voiceChanged();
    },
  };
}

/** The app's router for a surface, with chrome-voice's and voice's matchers, over the controller's state. */
function routerFor(cv, { phone = false } = {}) {
  const router = createRouter();
  registerTodayCommands(router);
  registerVoice(router, { stopTarget: (target) => (target === 'chrome' ? cv.stopFromVoice() : undefined) });
  registerChromeVoice(router, { chromeVoice: () => cv, phone });
  return {
    route: (text, surface = 'chat') => router.route([text], { ...emptyState(surface), surface, chrome: cv.state() }),
    run: async (text, surface = 'chat') => {
      const hit = router.route([text], { ...emptyState(surface), surface, chrome: cv.state() });
      return hit ? { id: hit.id, out: await router.run(hit, { surface }) } : null;
    },
  };
}

// ---- REDTEAM-VOICE-2: stop reaches the running task; the stop is confirmed before it is called stopped -------

/** Promise callbacks only (safe under mock timers). */
const settle = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

test('REDTEAM-VOICE-2: after a busy refusal, a bare "stop" or "stop Chrome" stops the task that runs (the refused start never swallows it)', async () => {
  for (const words of ['stop', 'stop Chrome']) {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const t = setup({ voice: false });
      const r = routerFor(t.cv);
      t.cv.run(TASK, { surface: 'chat' });
      mock.timers.tick(2000);
      await settle();
      assert.equal(t.fake.calls.startTask.length, 1);
      // A second task, refused 'busy' (typed: the card says so).
      t.cv.run({ do: 'chrome-task', text: 'find a USB-C hub', chat: 'new' }, { surface: 'chat' });
      mock.timers.tick(2000);
      await settle();
      assert.equal(t.fake.calls.startTask.length, 2);
      const res = await r.run(words);
      await settle();
      assert.equal(t.fake.calls.stopTask, 1, `${words}: the running task got its stop (${JSON.stringify(res)})`);
      assert.equal(t.fake.link.state().task, null, `${words}: it stopped`);
      assert.notEqual(res.out.say, 'Okay, nothing sent to Chrome.', `${words}: not taken as the refused task's`);
    } finally {
      mock.timers.reset();
    }
  }
});

test('REDTEAM-VOICE-2: "Stopping…" until Jarvis for Chrome confirms the stop; 10 s unconfirmed: where to press Stop; a later confirmation is said', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = setup();
    t.cv.run(TASK);
    t.v.checks[0].spec.onGo();
    await settle();
    let confirm = null;
    t.fake.link.stopTask = () => new Promise((resolve) => (confirm = resolve)); // the relay is slow
    assert.deepEqual(t.cv.run({ do: 'chrome-stop', named: true }), { ack: 'Stopping Chrome…', show: 'Stopping Chrome…' });
    assert.equal(t.cv.state().task.status, 'running', 'not called stopped before it is confirmed');
    mock.timers.tick(9999);
    await settle();
    assert.ok(!t.v.said.includes('I couldn’t reach Chrome to stop it. Press Stop in its side panel.'));
    mock.timers.tick(1);
    await settle();
    assert.ok(t.v.said.includes('I couldn’t reach Chrome to stop it. Press Stop in its side panel.'), 'after 10 s unconfirmed');
    confirm({ ok: true });
    await settle();
    await settle();
    assert.equal(t.cv.state().task.status, 'stopped');
    assert.equal(t.v.said.at(-1), 'Chrome stopped.', 'the late confirmation is said');
    // An older link (stopTask resolves nothing): its `done` confirms it.
    const o = setup();
    o.cv.run(TASK);
    o.v.checks[0].spec.onGo();
    await settle();
    const stopNow = o.fake.link.stopTask;
    o.fake.link.stopTask = async () => undefined;
    o.cv.run({ do: 'chrome-stop', named: true });
    await settle();
    assert.equal(o.cv.state().task.status, 'running', 'void: not confirmed by itself');
    o.fake.link.stopTask = stopNow;
    o.fake.done({ status: 'stopped' });
    await settle();
    assert.equal(o.cv.state().task.status, 'stopped');
    assert.equal(o.v.said.filter((x) => x === 'Chrome stopped.').length, 1);
    // Unlinked meanwhile: said at once.
    const u = setup();
    u.cv.run(TASK);
    u.v.checks[0].spec.onGo();
    await settle();
    u.fake.link.stopTask = async () => ({ ok: false, reason: 'unlinked' });
    u.cv.run({ do: 'chrome-stop', named: true });
    await settle();
    await settle();
    assert.ok(u.v.said.includes('I couldn’t reach Chrome to stop it. Press Stop in its side panel.'));
  } finally {
    mock.timers.reset();
  }
});

test('REDTEAM-VOICE-2: the busy question: "no" (or no answer) drops the refused task, so nothing is left to catch a later stop', async () => {
  const t = setup();
  t.cv.run(TASK);
  t.v.checks[0].spec.onGo();
  await flush();
  t.cv.run({ do: 'chrome-task', text: 'find a USB-C hub', chat: 'new' });
  t.v.checks[1].spec.onGo();
  await flush();
  const q = t.v.questions.at(-1).spec;
  q.onAnswer('no', { words: 'no thanks', via: 'voice' });
  assert.equal(t.cv.checking(), false);
  assert.deepEqual(t.cv.stopFromVoice(), { withdrawn: false, stopping: true, busyYes: false, none: false, confirmed: true }, 'the running task stops');
  assert.equal(t.fake.calls.startTask.length, 2, 'the refused task never starts');
  // Expired: the same.
  const e = setup();
  e.cv.run(TASK);
  e.v.checks[0].spec.onGo();
  await flush();
  e.cv.run({ do: 'chrome-task', text: 'find a USB-C hub', chat: 'new' });
  e.v.checks[1].spec.onGo();
  await flush();
  e.v.questions.at(-1).spec.onExpire('timeout');
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(e.cv.run({ do: 'chrome-stop', named: true }).ack, 'Chrome stopped.');
  assert.equal(e.fake.calls.stopTask, 1);
});

test('REDTEAM-VOICE-2: voice\'s stop line says what stopped', () => {
  const act = (targets) => ({ do: 'stop', targets });
  assert.equal(appCommandLine(act(['chrome']), { stopped: { chrome: { withdrawn: true, stopping: false } } }), 'Okay, nothing sent to Chrome.');
  assert.equal(appCommandLine(act(['chrome']), { stopped: { chrome: { withdrawn: false, stopping: true } } }), 'Chrome is stopping.');
  assert.equal(appCommandLine(act(['chrome']), { stopped: { chrome: { withdrawn: true, stopping: true } } }), 'Okay, nothing sent. Chrome is stopping.');
  assert.equal(appCommandLine(act(['chrome']), { stopped: { chrome: { none: true } } }), 'Okay.');
  assert.equal(appCommandLine(act(['tour', 'chrome']), { stopped: { chrome: { withdrawn: true } } }), 'Okay, nothing sent to Chrome. The tour is paused.');
  assert.equal(appCommandLine(act(['tour', 'chrome'])), 'The tour is paused and Chrome is stopping.', 'unchanged without an outcome');
});

// ---- REDTEAM-VOICE-5: a typed countdown ------------------------------------------------------------------

test('REDTEAM-VOICE-5: typed "stop" or "cancel" during the chat\'s countdown withdraws it (never "Okay." then a start, never Claude); the field says "Press Cancel to stop."', async () => {
  for (const words of ['stop', 'cancel', 'no']) {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const t = setup({ voice: false });
      const r = routerFor(t.cv);
      const shown = t.cv.run(TASK, { surface: 'hologram' }).show;
      assert.equal(shown, 'Chrome, up to a dollar: find a 4K monitor under $300 and add it to the cart. Press Cancel to stop.');
      mock.timers.tick(800);
      const res = await r.run(words, 'chat');
      assert.ok(res, `${words}: taken`);
      assert.equal(res.id, 'chrome-typed', `${words}: the countdown's`);
      assert.equal(res.out.say, 'Okay, nothing sent to Chrome.');
      mock.timers.tick(5000);
      await settle();
      assert.equal(t.fake.calls.startTask.length, 0, `${words}: nothing sent`);
    } finally {
      mock.timers.reset();
    }
  }
  // "start now" typed lets it go; the router state's task is the countdown's while it runs (chrome-relay's block
  // no longer hides it: app.js runs chrome-voice's after it).
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const t = setup({ voice: false });
    const r = routerFor(t.cv);
    t.cv.run(TASK, { surface: 'chat' });
    assert.equal(t.cv.state().task.status, 'starting');
    assert.equal(t.cv.state().checking, true);
    assert.equal((await r.run('start now', 'chat')).id, 'chrome-typed');
    await settle();
    assert.equal(t.fake.calls.startTask.length, 1);
  } finally {
    mock.timers.reset();
  }
});

// ---- REDTEAM-VOICE-7: two Jarvis windows ------------------------------------------------------------------

/** BroadcastChannel-likes joined in memory (messages go to the other ends, asynchronously). */
function channels() {
  const ends = [];
  return () => {
    const end = {
      listeners: new Set(),
      postMessage(data) {
        const copy = JSON.parse(JSON.stringify(data));
        for (const other of ends) if (other !== end) for (const fn of other.listeners) queueMicrotask(() => fn({ data: copy }));
      },
      addEventListener(_t, fn) {
        end.listeners.add(fn);
      },
      close() {
        ends.splice(ends.indexOf(end), 1);
      },
    };
    ends.push(end);
    return end;
  };
}

test('REDTEAM-VOICE-7: two windows: Chrome\'s question, its closing and a task\'s end reach the one where Voice Mode is open; the other shows the cards and stays quiet', async () => {
  const channel = channels();
  // Window A holds the link (its listeners hear the extension); window B has Voice Mode open (no events of its own).
  const A = setup({ voice: false, channel });
  const fakeB = createFakeChromeLink();
  fakeB.set({ budgetUsd: 1 });
  const vB = createFakeVoice();
  delete vB.card;
  const B = createChromeVoice({ link: { ...fakeB.link, onPrompt: () => () => {}, onPromptClosed: () => () => {}, onDone: () => () => {} }, voice: () => vB, channel, toast: () => {}, notify: () => {}, hidden: () => false });
  B.voiceChanged();
  await flush();
  A.fake.prompt(PROMPTS.cart);
  await flush();
  assert.equal(vB.prompts.length, 1, 'B says the prompt (its Voice Mode is open)');
  assert.equal(vB.prompts[0].spec.id, 'chrome:p-cart');
  assert.equal(A.notices.length, 0, 'A sends no notification: Voice Mode is open in B');
  // Answered in the side panel: B's prompt closes too.
  A.fake.closePrompt('p-cart', 'clicked');
  await flush();
  assert.equal(vB.prompts[0].closed, true, 'closed in B');
  // A task said in B ends: B says the answer; A (no Voice Mode) stays quiet.
  B.run(TASK);
  vB.checks[0].spec.onGo();
  await flush();
  A.fake.task({ id: 't9', status: 'running', text: TASK.text });
  A.fake.done({ status: 'done', answer: 'Added it.' });
  await flush();
  assert.equal(vB.said.at(-1), 'Chrome is done. Added it.', 'B says the end');
  assert.deepEqual(A.toasts, [], 'A says nothing (its card shows it)');
  // B goes away (pagehide, or its Voice Mode closes): with Voice Mode open nowhere, the window holding the link
  // sends the notification (one, not one a window); a second window without Voice Mode only shows the card.
  const C = createChromeVoice({ link: { ...fakeB.link, onPrompt: () => () => {}, onPromptClosed: () => () => {}, onDone: () => () => {} }, voice: () => null, channel, toast: () => {}, notify: (n) => cNotices.push(n), hidden: () => false });
  const cNotices = [];
  B.destroy();
  await flush();
  A.fake.prompt({ ...PROMPTS.cart, promptId: 'p-2', hash: 'h-2' });
  await flush();
  assert.equal(A.notices.length, 1, 'the window holding the link notifies');
  assert.equal(cNotices.length, 0, 'the other window doesn\'t');
  C.destroy();
  A.cv.destroy();
});

// ---- REDTEAM-VOICE-8: prompts closed without a word -------------------------------------------------------

test('REDTEAM-VOICE-8: a task\'s end closes its prompts (no stale "Chrome is waiting for you"); so does the link reporting no task; a "gone" refusal closes it and says so', async () => {
  const t = setup();
  t.cv.run(TASK);
  t.v.checks[0].spec.onGo();
  await flush();
  t.fake.prompt(PROMPTS.cart);
  assert.ok(t.cv.pending(), 'waiting');
  // The extension's worker restarted: only `done` (failed) comes, no prompt-closed.
  t.fake.done({ status: 'failed' });
  assert.equal(t.cv.pending(), null, 'no stale wake line');
  assert.equal(t.v.prompts[0].closed, true, 'Voice Mode\'s channel closed it');
  // The link reports the task gone (a lost prompt-closed and done).
  const u = setup();
  u.cv.run(TASK);
  u.v.checks[0].spec.onGo();
  await flush();
  u.fake.prompt(PROMPTS.cart);
  u.fake.set({ task: null });
  assert.equal(u.cv.pending(), null);
  // An answer refused 'gone' (the question isn't open there any more): closed here too, and said.
  const g = setup();
  g.cv.run(TASK);
  g.v.checks[0].spec.onGo();
  await flush();
  g.fake.prompt(PROMPTS.cart);
  g.fake.link.answer = async () => ({ ok: false, reason: 'gone', why: 'That question isn’t open any more.' });
  g.v.prompts[0].spec.onAnswer('deny', { words: 'deny', via: 'voice' });
  await flush();
  await flush();
  assert.equal(g.cv.pending(), null);
  assert.ok(g.v.said.includes('That question is no longer open.'));
  // Too late (D5: the answer was more than 8 s old): the question stays open.
  const l = setup();
  l.cv.run(TASK);
  l.v.checks[0].spec.onGo();
  await flush();
  l.fake.prompt(PROMPTS.cart);
  l.fake.link.answer = async () => ({ ok: false, reason: 'gone', why: 'too late' });
  l.v.prompts[0].spec.onAnswer('deny', { words: 'deny', via: 'voice' });
  await flush();
  await flush();
  assert.ok(l.cv.pending(), 'too late: still open');
});

// ---- REDTEAM-VOICE-9, MONEY-3: the price said is the budget reported -----------------------------------------

test('REDTEAM-VOICE-9, MONEY-3: before Jarvis for Chrome reports its budget, "up to your Chrome budget" (no limit sent); then its budget, sent with the start', async () => {
  const t = setup({ budget: null });
  t.cv.run(TASK);
  assert.equal(t.v.checks[0].spec.say, 'Chrome, up to your Chrome budget: find a 4K monitor under $300 and add it to the cart. Say cancel to stop.');
  t.v.checks[0].spec.onGo();
  await flush();
  assert.deepEqual(t.fake.calls.startTask[0], { text: TASK.text, chat: 'new' }, 'no limit while the budget is unknown');
  t.fake.done({ status: 'done' });
  // hello / status report a $5 budget: said, and sent with the start.
  t.fake.set({ budgetUsd: 5 });
  t.cv.run({ do: 'chrome-task', text: 'find a USB-C hub', chat: 'new' });
  assert.equal(t.v.checks[1].spec.say, 'Chrome, up to five dollars: find a USB-C hub. Say cancel to stop.');
  t.v.checks[1].spec.onGo();
  await flush();
  assert.deepEqual(t.fake.calls.startTask[1], { text: 'find a USB-C hub', chat: 'new', limitUsd: 5 });
  // A 25-cent budget.
  const c = setup({ budget: 0.25 });
  c.cv.run(TASK);
  assert.match(c.v.checks[0].spec.say, /^Chrome, up to 25 cents: /);
  assert.equal(taskCheckLine({ text: 'x', limitUsd: null }), 'Chrome, up to your Chrome budget: x. Say cancel to stop.');
});

// ---- REDTEAM-VOICE-13: "How's it going?" ---------------------------------------------------------------------

test('REDTEAM-VOICE-13: "how\'s it going?" is Chrome\'s only while a task runs; on a phone, the Chrome words say it\'s the Mac\'s', async () => {
  for (const w of ["How's it going?", "How's it going, Jarvis?", 'How is it going']) {
    assert.equal(matchChromeStatus(w, {}), null, `${w}: nothing runs`);
    assert.equal(matchChromeStatus(w, { chrome: { task: { status: 'running' } } }).do, 'chrome-status', `${w}: a task runs`);
    assert.equal(matchChromeTask(w, {}), null);
  }
  for (const w of ['what are you doing in Chrome?', "how's the task going", "how's Chrome doing"]) assert.equal((matchChromeStatus(w, {}) || {}).do, 'chrome-status', w);
  const t = setup({ voice: false });
  const phone = routerFor(t.cv, { phone: true });
  const out = await phone.run('find a 4K monitor in Chrome', 'voice');
  assert.equal(out.out.say, 'Chrome tasks work from Jarvis on your Mac.');
  assert.equal(t.fake.calls.startTask.length, 0);
  const chat = await phone.run("how's it going", 'chat');
  assert.equal(chat, null, 'a greeting goes to Jarvis as before');
});

// ---- REDTEAM-VOICE-14: near-misses and other readings ----------------------------------------------------------

test('REDTEAM-VOICE-14: "disapprove", "reject", "decline", "refuse", "never", "hold off" as another reading of "approve": asked again', () => {
  const answers = promptAnswers(PROMPTS.cart);
  for (const other of ['disapprove', 'reject', 'decline', 'refuse', 'never', 'hold off']) {
    assert.equal(isNoWord(other), true, other);
    assert.equal(chooseAnswer({ readings: ['approve', other], answers, saidAt: 1000, now: 2000 }).again, 'unsure', other);
  }
});

test('REDTEAM-VOICE-14: typed in the chat with a prompt\'s card waiting: a no goes out as the card\'s would, a yes points to the card', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  let t;
  let r;
  try {
    t = setup({ voice: false });
    r = routerFor(t.cv);
    t.cv.run(TASK, { surface: 'chat' });
    mock.timers.tick(2000);
    await settle();
  } finally {
    mock.timers.reset();
  }
  t.fake.prompt(PROMPTS.cart);
  for (const w of ['approve', 'yes approve', 'I approve']) {
    const res = await r.run(w, 'chat');
    assert.equal(res && res.out.say, 'Chrome’s question is on its card: tap its button to answer.', w);
  }
  assert.equal(t.fake.calls.answer.length, 0, 'a typed yes approves nothing');
  const no = await r.run('deny', 'chat');
  assert.equal(no.out.say, 'Okay, I told Chrome no.');
  await flush();
  assert.deepEqual(t.fake.calls.answer, [{ promptId: 'p-cart', hash: 'h-cart-1', choice: 'cancel', via: 'card' }]);
  assert.equal(matchTypedChrome('approve', { chrome: { waiting: 0 } }), null, 'nothing waiting: not Chrome\'s');
});
