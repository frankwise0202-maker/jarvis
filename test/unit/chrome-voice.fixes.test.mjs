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

// ---- PRIVACY-1: Chrome's question while Jarvis is hidden ----------------------------------------------------

test('PRIVACY-1: Chrome\'s question while Jarvis is hidden (Voice Mode open): said there and a notification too (no microphone may follow it); on screen, no notification', async () => {
  const hiddenT = setup({ hidden: true });
  hiddenT.fake.prompt(PROMPTS.cart);
  assert.equal(hiddenT.v.prompts.length, 1, 'Voice Mode\'s channel has it');
  assert.equal(hiddenT.notices.length, 1, 'and a notification');
  assert.equal(hiddenT.notices[0].title, 'Chrome asks');
  const shown = setup({ hidden: false });
  shown.fake.prompt(PROMPTS.cart);
  assert.equal(shown.v.prompts.length, 1);
  assert.equal(shown.notices.length, 0);
});

test('REDTEAM-VOICE-7: a task\'s end heard twice (from the link and from another window) is said once', async () => {
  let listener = null;
  const channel = () => ({ postMessage() {}, addEventListener: (_t, fn) => (listener = fn), close() {} });
  const t = setup({ channel });
  try {
    t.cv.run(TASK);
    t.v.checks[0].spec.onGo();
    await flush();
    const id = t.fake.link.state().task.id;
    t.fake.done({ status: 'done', answer: 'Added it.' });
    assert.equal(t.v.said.filter((x) => x === 'Chrome is done. Added it.').length, 1);
    listener({ data: { t: 'done', from: 'w-other', done: { id, status: 'done', answer: 'Added it.', costUsd: 0.1 } } });
    assert.equal(t.v.said.filter((x) => x.startsWith('Chrome is done.')).length, 1, 'not said again');
  } finally {
    t.cv.destroy();
  }
});

// ---- the routing review (ROUTING-11, -5, -2, -8) -------------------------------------------------------------

test('ROUTING-11: "stop" while the start is on its way: "Chrome is stopping.", never "nothing sent"; the task is stopped as soon as it has an id, and never "Chrome is on it."', async () => {
  for (const words of ['stop', 'stop Chrome']) {
    const t = setup();
    const r = routerFor(t.cv);
    let answer = null;
    const startNow = t.fake.link.startTask;
    t.fake.link.startTask = (args) => new Promise((resolve) => (answer = () => resolve(startNow(args)))); // the relay round trip
    t.cv.run(TASK);
    t.v.checks[0].spec.onGo(); // the countdown ended: the start is on its way
    await flush();
    assert.equal(t.cv.state().task.status, 'starting', 'the router sees the start on its way');
    assert.equal(t.cv.checking(), false, 'no check any more');
    const res = await r.run(words, 'voice');
    assert.ok(res, words);
    assert.match(res.out.say, /^(?:Chrome is stopping\.|Stopping Chrome…)$/, `${words}: what is true (${res.out.say})`);
    assert.equal(t.fake.calls.stopTask, 0, 'nothing to stop yet');
    answer();
    await flush();
    await flush();
    assert.equal(t.fake.calls.stopTask, 1, `${words}: stopped as soon as it had an id`);
    assert.ok(!t.v.said.includes('Chrome is on it.'), `${words}: never "Chrome is on it." (${JSON.stringify(t.v.said)})`);
    assert.equal(t.cv.state().lastTask.status, 'stopped');
  }
  // The start refused after all: nothing ran, no stop sent.
  const f = setup();
  let refuse = null;
  f.fake.link.startTask = () => new Promise((resolve) => (refuse = () => resolve({ ok: false, reason: 'off' })));
  f.cv.run(TASK);
  f.v.checks[0].spec.onGo();
  await flush();
  f.cv.stopFromVoice();
  refuse();
  await flush();
  assert.equal(f.fake.calls.stopTask, 0);
  assert.equal(f.cv.state().task, null, 'nothing runs');
});

test('ROUTING-5: while a task runs, "stop that", "stop the task", "cancel the task", "abort", "halt", "kill it" and a bare "cancel" stop it (never Claude)', async () => {
  for (const words of ['stop that', 'stop this', 'stop the task', 'cancel the task', 'abort the task', 'cancel that', 'cancel it', 'stop clicking', "stop what you're doing", 'abort', 'halt', 'whoa, stop', 'pause the task', 'end the task', 'kill it', 'cancel']) {
    for (const surface of ['voice', 'chat']) {
      const t = setup();
      const r = routerFor(t.cv);
      t.cv.run(TASK);
      t.v.checks[0].spec.onGo();
      await flush();
      const res = await r.run(words, surface);
      assert.ok(res && res.id === 'chrome-stop', `${words} (${surface}): Chrome's stop (${res && res.id})`);
      await flush();
      assert.equal(t.fake.calls.stopTask, 1, `${words} (${surface}): stopped`);
    }
  }
  // Nothing running: not Chrome's.
  const idle = setup();
  for (const words of ['stop that', 'cancel', 'abort']) assert.notEqual((routerFor(idle.cv).route(words, 'voice') || {}).id, 'chrome-stop', words);
});

test('ROUTING-2: a statement or a trouble that ends "in Chrome" is the owner\'s question, never a task; instructions still are', () => {
  for (const s of ["my Gmail won't load in Chrome", 'YouTube is really slow in Chrome', 'Netflix keeps buffering in Chrome', 'my bookmarks are gone in Chrome', "I can't log in to my bank in Chrome", 'something is wrong in Chrome', 'the sound is not working in Chrome', 'it says access denied in Chrome', 'this page looks broken in Chrome', 'have Chrome open when I log in', 'explain how cookies work in Chrome', 'teach me how to use bookmarks in Chrome', 'remind me how to turn on dark mode in Chrome', 'show me how to clear cookies in Chrome']) {
    assert.equal(matchChromeTask(s, {}), null, s);
  }
  for (const [s, text] of [
    ['find a 4K monitor under $300 and add it to the cart in Chrome', 'find a 4K monitor under $300 and add it to the cart'],
    ['can you find me a hotel in Bath in Chrome', 'find me a hotel in Bath'],
    ['Best Buy: add a 4K monitor under $300 to the cart in Chrome', 'Best Buy: add a 4K monitor under $300 to the cart'],
    ["what's the return policy on this page in Chrome", "what's the return policy on this page"],
  ]) assert.equal((matchChromeTask(s, {}) || {}).text, text, s);
});

// ---- v8.1.1: CHROME-VOICE-R2-3, ROUTING-R2-2: an instruction by its shape, not a list of verbs -------------------
// Both second reviews' sentences (chrome-voice's verbs.mjs and statements.mjs, its verifier's route-tasks.mjs; routing's
// review2-routing-words, verbs.mjs, carriers.mjs and tasks.mjs, its verifier's r2.mjs), and ROUTING-2's own. (A search,
// "look up flights to Denver in Chrome", is G1's to open, free: not in these lists.)
const R2_INSTRUCTIONS = [
  // chrome-voice reviewer (verbs.mjs)
  'Cancel my Netflix subscription in Chrome.', 'Cancel the order on Amazon in Chrome.', 'Return the headphones on Amazon in Chrome.',
  'Download my last invoice in Chrome.', 'Renew my library books in Chrome.', 'Upgrade my Spotify plan in Chrome.', 'Subscribe to the newsletter in Chrome.',
  'Register for the webinar in Chrome.', 'Reorder the paper towels in Chrome.', 'Show me the reviews in Chrome.', 'Read me the first review in Chrome.',
  'Write a review for the monitor in Chrome.', 'Email the seller in Chrome.', 'Contact support in Chrome.', 'Watch the trailer in Chrome.',
  'Play the video in Chrome.', 'Save the recipe in Chrome.', 'Get the cheapest flight to Denver in Chrome.', 'Grab a coffee order from Starbucks in Chrome.',
  'Tell me the price on this page in Chrome.', 'Check the weather on weather.com in Chrome.', 'Turn on dark mode on YouTube in Chrome.', 'Message Sam on WhatsApp in Chrome.',
  'Reply to the last email in Chrome.', 'Archive the newsletter emails in Chrome.', 'Mark all as read in Gmail in Chrome.', 'Empty the cart in Chrome.',
  'Remove the monitor from the cart in Chrome.', 'Apply the coupon in Chrome.', 'Enter my zip code in Chrome.', 'Type my address in Chrome.',
  'Accept the cookies in Chrome.', 'Close the popup in Chrome.', 'Sign me up for the trial in Chrome.',
  'Buy the monitor in Chrome.', 'Pick the second one in Chrome.', 'Choose next-day shipping in Chrome.',
  'Install the update in Chrome.', 'Donate five dollars to Wikipedia in Chrome.', 'Vote in the poll in Chrome.', 'Like the post in Chrome.', 'Follow her on Twitter in Chrome.',
  'Report the listing in Chrome.', 'Block the seller in Chrome.', 'Request a refund in Chrome.', 'Claim my reward in Chrome.', 'Redeem the gift card in Chrome.',
  // chrome-voice verifier (route-tasks.mjs)
  'Unfollow that account on Instagram in Chrome.', 'Transfer fifty dollars to savings in Chrome.', 'RSVP to the party in Chrome.', 'Join the Zoom meeting in Chrome.',
  'Confirm my appointment in Chrome.', 'Move my dentist appointment to Friday in Chrome.', 'Invite Sam to the shared doc in Chrome.', 'Respond to the last email in Chrome.',
  'Decline the meeting invite in Chrome.', 'Sell my old phone on eBay in Chrome.', 'Rent a car in Denver for next weekend in Chrome.', 'Dispute the charge in Chrome.',
  'Complete the survey in Chrome.', 'Retweet the last post in Chrome.', 'Upvote the top comment in Chrome.', 'Login to my bank in Chrome.', 'Finish the checkout in Chrome.',
  'Proceed to checkout in Chrome.', 'Re-order my usual groceries in Chrome.', 'Print my boarding pass in Chrome.', 'Pay my electric bill in Chrome.',
  'Find a 4K monitor under $300 and add it to the cart in Chrome.', 'Order more paper towels in Chrome.',
  // routing reviewer (review2-routing-words, carriers.mjs) and verifier (r2.mjs)
  'use Jarvis for Chrome to cancel my Netflix subscription', 'use Chrome to cancel my Netflix subscription', 'have Chrome renew my library books',
  'tell Chrome to email my landlord about the leak', 'ask Chrome to register me for the 5K', 'get Chrome to reorder my contact lenses',
  'ask Chrome to reorder my contact lenses', 'get Chrome to register me for the 5K', 'in Chrome, register me for the 5K', 'in Chrome, cancel my Netflix subscription',
  'in Chrome, transfer fifty dollars to savings', 'have Chrome install the Grammarly extension', 'use Chrome to block that spammer on Facebook', 'have Chrome find the return policy',
  'cancel my Netflix subscription in Chrome', 'reorder my contact lenses in Chrome', 'transfer fifty dollars to savings in Chrome', 'install the Grammarly extension in Chrome',
  'return the blender I bought on Amazon in Chrome', 'rsvp yes to the party in Chrome', 'refill my prescription at CVS in Chrome', 'reschedule my dentist appointment in Chrome',
  'unsubscribe me from the Target emails in Chrome', 'renew my passport in Chrome', 'donate twenty dollars to the Red Cross in Chrome', 'archive the old emails in Chrome',
  'mark all my emails as read in Chrome', 'join the zoom meeting in Chrome', 'upgrade my Spotify plan in Chrome', 'create a new Google Doc in Chrome', 'block that site in Chrome',
  'report the spam account in Chrome', 'pay my electric bill in Chrome', 'find a 4K monitor under $300 and add it to the cart in Chrome', 'book a table for two at Nobu in Chrome',
  'can you cancel my Netflix subscription in Chrome', 'please cancel my Netflix subscription in Chrome', 'I want you to cancel my Netflix subscription in Chrome',
  // routing reviewer (verbs.mjs: a verb and its object)
  'renew my library books in Chrome', 'return the shoes I bought last week in Chrome', 'register for the 5K race in Chrome', 'donate ten dollars to the food bank in Chrome',
  'email my landlord about the leak in Chrome', 'text my wife that I am late in Chrome', 'enable two factor on my Google account in Chrome', 'disable autoplay on YouTube in Chrome',
  'block that spammer on Facebook in Chrome', 'report the fake listing in Chrome', 'request a refund for my order in Chrome', 'claim my free trial in Chrome', 'redeem my gift card in Chrome',
  'contact Amazon support in Chrome', 'archive all my old emails in Chrome', 'mark all emails as read in Chrome', 'confirm my appointment in Chrome', 'verify my email address in Chrome',
  'ship the package to my mom in Chrome', 'move the meeting to Friday in Chrome', 'star the important emails in Chrome', 'watch the new trailer in Chrome', 'listen to the podcast in Chrome',
  'download my tax forms in Chrome', 'print the boarding pass in Chrome', 'save this recipe in Chrome', 'remind me to pay rent in Chrome',
  'create a new playlist in Chrome', 'start a free trial of Hulu in Chrome', 'stop my Hulu subscription in Chrome',
  // routing reviewer (tasks.mjs: polite and plain forms)
  'in Chrome, find a 4K monitor under $300', 'can you find a 4K monitor under $300 in Chrome', 'could you add the cheapest one to the cart in Chrome',
  'would you book a table for two at 7 in Chrome', 'can you please find me a flight to Denver in Chrome', 'please find me a flight to Denver in Chrome',
  'Jarvis, please find me a flight to Denver in Chrome', 'I want you to find a 4K monitor in Chrome', 'I need you to order more printer ink in Chrome',
  'go ahead and find a 4K monitor in Chrome', 'help me find a 4K monitor in Chrome', 'get me a 4K monitor under $300 in Chrome', 'grab the cheapest charger in Chrome',
  'check my order status on amazon in Chrome', 'fill out the contact form in Chrome', 'download my bank statement in Chrome', 'unsubscribe me from the newsletter in Chrome',
  'look for a 4K monitor in Chrome', 'see if Best Buy has the monitor in stock in Chrome', 'make a reservation at Nobu for Friday in Chrome', 'buy more paper towels in Chrome',
  'now add the second one too in Chrome', 'also add a HDMI cable in Chrome', 'then check out in Chrome', 'just find me a cheaper one in Chrome', 'maybe find a cheaper one in Chrome',
  'try finding a cheaper one in Chrome', "let's find a cheaper one in Chrome", 'use Jarvis for Chrome to compare the two cheapest monitors',
  // ROUTING-2's own instructions
  'can you find me a hotel in Bath in Chrome', 'Best Buy: add a 4K monitor under $300 to the cart in Chrome',
];

const R2_TROUBLES = [
  // chrome-voice reviewer (statements.mjs)
  'Search results look weird in Chrome.', 'Sign in fails in Chrome.', 'Print preview is broken in Chrome.', 'Scroll bars are missing in Chrome.',
  'Check boxes don’t work in Chrome.', 'Log in doesn’t work in Chrome.', 'Book covers don’t load in Chrome.', 'Order history is empty in Chrome.',
  'Watch history is gone in Chrome.', 'Play button does nothing in Chrome.', 'Pay pal won’t load in Chrome.', 'Track changes is greyed out in Chrome.',
  'Zoom keeps crashing in Chrome.', 'Clear history is greyed out in Chrome.', 'Open tabs are using too much memory in Chrome.', 'Find my iPhone won’t load in Chrome.',
  'Click here buttons look broken in Chrome.', 'Pick up times are wrong in Chrome.', 'Look at all these ads in Chrome.', 'Turn by turn directions are wrong in Chrome.',
  'Post office tracking says delivered in Chrome.', 'Share buttons are gone in Chrome.', 'Mute doesn’t work in Chrome.', 'Explore page is empty in Chrome.',
  // chrome-voice verifier (route-tasks.mjs)
  'Search is really slow in Chrome.', 'Checkout keeps failing in Chrome.', 'Play doesn’t do anything on YouTube in Chrome.', 'Update failed in Chrome.',
  'Download keeps failing in Chrome.', 'Upload is stuck at 99 percent in Chrome.', 'Pause doesn’t work on Netflix in Chrome.', 'Refresh doesn’t help in Chrome.',
  'Pay button is greyed out in Chrome.', 'Reply all is missing in Gmail in Chrome.', 'Save as PDF is missing in Chrome.', 'My Gmail won’t load in Chrome.', 'YouTube is really slow in Chrome.',
  // routing reviewer and verifier
  "my Gmail won't load in Chrome", 'explain how cookies work in Chrome', "in Chrome, my Gmail won't load", 'the page keeps reloading in Chrome', 'how come Gmail is slow in Chrome',
  'why does YouTube buffer in Chrome', 'nothing loads in Chrome', 'every site is slow in Chrome',
  // ROUTING-2's own
  'Netflix keeps buffering in Chrome', 'my bookmarks are gone in Chrome', "I can't log in to my bank in Chrome", 'something is wrong in Chrome', 'the sound is not working in Chrome',
  'it says access denied in Chrome', 'this page looks broken in Chrome', 'have Chrome open when I log in', 'teach me how to use bookmarks in Chrome',
  'remind me how to turn on dark mode in Chrome', 'show me how to clear cookies in Chrome', 'how do I clear my cookies in Chrome',
];

test('CHROME-VOICE-R2-3, ROUTING-R2-2: with a carrier, any instruction is a task whatever its verb; a statement, a trouble or a request for help never is', () => {
  const st = { chrome: { linked: true, online: true } };
  const lost = R2_INSTRUCTIONS.filter((s) => !matchChromeTask(s, st));
  const taken = R2_TROUBLES.filter((s) => matchChromeTask(s, st)).map((s) => `${s} -> "${matchChromeTask(s, st).text}"`);
  assert.deepEqual({ lost, taken }, { lost: [], taken: [] });
  // The task's words, as the check says them: the instruction's first word in lower case, a site first kept.
  for (const [s, text] of [
    ['Cancel my Netflix subscription in Chrome.', 'cancel my Netflix subscription'],
    ['use Jarvis for Chrome to cancel my Netflix subscription', 'cancel my Netflix subscription'],
    ['have Chrome renew my library books', 'renew my library books'],
    ['in Chrome, register me for the 5K', 'register me for the 5K'],
    ['Re-order my usual groceries in Chrome.', 're-order my usual groceries'],
    ['Best Buy: add a 4K monitor under $300 to the cart in Chrome', 'Best Buy: add a 4K monitor under $300 to the cart'],
  ]) assert.equal((matchChromeTask(s, st) || {}).text, text, s);
  // Through the app's router (Voice Mode and the chat): the lead carriers G4 makes tasks any time.
  const t = setup();
  try {
    const router = routerFor(t.cv);
    for (const s of ['use Jarvis for Chrome to cancel my Netflix subscription', 'have Chrome renew my library books', 'tell Chrome to email my landlord about the leak', 'ask Chrome to register me for the 5K', 'get Chrome to reorder my contact lenses', 'Email the seller in Chrome.']) {
      for (const surface of ['voice', 'chat']) assert.equal((router.route(s, surface) || {}).id, 'chrome-task', `${s} (${surface})`);
    }
    for (const s of ['Log in doesn’t work in Chrome.', 'Order history is empty in Chrome.', "my Gmail won't load in Chrome", 'explain how cookies work in Chrome']) {
      for (const surface of ['voice', 'chat']) assert.equal(router.route(s, surface), null, `${s} (${surface}): the owner's question`);
    }
  } finally {
    t.cv.destroy();
  }
});

test('ROUTING-R2-5: during a task\'s check, "continue", "carry on", "keep going", "go on", "done" and a yes-led sentence with no no-word let it count on', () => {
  const check = { chromeCheck: { kind: 'task' } };
  for (const w of ['Continue.', 'Yes, continue.', 'Okay, continue.', 'Carry on.', 'Keep going.', 'Sure, go on.', 'Go on.', 'Done.', 'Yes, that\'s right.', 'Okay, sounds good to me.']) {
    assert.equal((promptWords.matchChromeAnswer(w, check) || {}).how, 'keep', w);
  }
  // A no word anywhere: never a keep.
  for (const w of ['Yes, cancel it.', 'Okay, stop.', 'Sure, wait.', 'Yes, no, never mind.']) assert.notEqual((promptWords.matchChromeAnswer(w, check) || {}).how, 'keep', w);
});

test('MISSED-R2V-1: with a walkthrough going or a hologram open, "pause it", "pause that", "halt" and the bare end forms are theirs, never a stop for the task that runs; "stop", "stop Chrome", "stop the task" still stop it', async () => {
  const { matchChromeStop } = await import('../../src/lib/chrome-task-words.js');
  const chrome = { linked: true, online: true, task: { id: 't1', status: 'running', text: 'find a 4K monitor' } };
  const tour = { active: true, atChoice: false, choices: [], stepId: 's2' };
  const hologram = { open: true, inWindow: false, parts: [], selected: null };
  for (const [name, st] of [['tour', { chrome, tour }], ['hologram', { chrome, hologram }], ['both', { chrome, tour, hologram }]]) {
    for (const w of ['pause it', 'pause that', 'pause this', 'halt', 'halt it', 'end it', 'end that', 'kill it']) assert.equal(matchChromeStop(w, st), null, `${name}: "${w}"`);
    for (const w of ['stop', 'stop Chrome', 'stop the task', 'cancel the task', 'pause the task', 'end the task', 'stop the Chrome task']) assert.equal((matchChromeStop(w, st) || {}).do, 'chrome-stop', `${name}: "${w}"`);
  }
  // Nothing else open: ROUTING-5's plain forms still stop the task.
  for (const w of ['pause it', 'halt', 'end it']) assert.equal((matchChromeStop(w, { chrome }) || {}).do, 'chrome-stop', w);
});

test('MISSED-R2V-1: in the app\'s router (every module), a running task with a walkthrough going: "pause it" pauses the walkthrough; with a hologram open "halt" and "pause that" hold it; "stop the task" stops the task', async () => {
  const { DEFAULT_SETTINGS } = await import('../../src/platform/settings.js');
  const router = createRouter();
  registerTodayCommands(router);
  const deps = new Proxy(
    { getSettings: () => DEFAULT_SETTINGS, saveSettings: () => DEFAULT_SETTINGS, toast: () => {}, voice: () => null, routerState: (surface, local) => ({ ...emptyState(surface), ...(local || {}) }), phone: false, demo: false },
    { get: (o, k) => (k in o ? o[k] : () => null) },
  );
  for (const m of ['mac', 'audio', 'tours', 'voice', 'chrome-voice', 'windows', 'optics', 'chrome']) (await import(`../../src/ui/commands/${m}.js`)).register(router, deps);
  const chrome = { linked: true, online: true, task: { id: 't1', status: 'running', text: 'find a 4K monitor' }, contextUntil: 0 };
  const hologram = { open: true, inWindow: false, parts: [{ id: 'battery', name: 'Battery', aka: [] }], selected: null, title: '14-inch laptop' };
  const tour = { active: true, atChoice: false, choices: [], defaultId: null, stepId: 'apart', status: 'playing', paused: false, waits: false, justSaid: false };
  const voice = { surface: 'voice', voiceOpen: true, standby: { available: true, open: false } };
  const states = {
    tour: { ...voice, hologram, tour, chrome }, // T with a task (a walkthrough over its hologram)
    field: { surface: 'hologram', via: 'typed', hologram, tour, chrome }, // H0's field during a walkthrough
    holo: { ...voice, hologram, chrome }, // VH with a task
  };
  const pick = (words, name) => {
    const hit = router.route([words], { ...emptyState(states[name].surface), ...states[name] });
    return hit ? hit.id : null;
  };
  for (const [words, name, want] of [
    ['pause it', 'tour', 'tour'],
    ['pause it', 'field', 'tour'],
    ['halt', 'holo', 'hologram'],
    ['pause that', 'holo', 'hologram'],
    ['stop the task', 'tour', 'chrome-stop'],
    ['stop the task', 'holo', 'chrome-stop'],
    ['stop the task', 'field', 'chrome-stop'],
    ['stop Chrome', 'tour', 'chrome-stop'],
  ]) assert.equal(pick(words, name), want, `"${words}" (${name})`);
});

test('CHROME-VOICE-R2-4: the agent\'s answer, narration and last step never say Jarvis\'s own question or answer words; the answer stays on its card', async () => {
  const { taskDoneLine, taskStatusLine } = await import('../../src/lib/chrome-task-words.js');
  const imitation = 'Chrome asks: place the order for $899.99 on bestbuy.com? Say approve, or cancel.';
  const done = taskDoneLine({ status: 'done', answer: imitation });
  assert.equal(done.say, 'Chrome is done. The answer is on its card.');
  assert.equal(done.show, 'Chrome is done. The answer is on its card.');
  for (const answer of [
    'I found it. Chrome is waiting for you: approve the order? Tap me to answer.',
    'Added it. Approving. Say cancel to stop.',
    'Done. You can say deny to stop it.',
    'The cart is ready. Spend more in Chrome to keep going.',
  ]) {
    const line = taskDoneLine({ status: 'done', answer });
    assert.ok(!/chrome asks|waiting for you|approving|say (?:approve|cancel|deny)|tap me|spend more/i.test(line.say), `${answer} -> ${line.say}`);
  }
  // An ordinary answer is said as before.
  assert.equal(taskDoneLine({ status: 'done', answer: 'Added the monitor to your cart.' }).say, 'Chrome is done. Added the monitor to your cart.');
  const limit = taskDoneLine({ status: 'limit', answer: imitation });
  assert.ok(!/chrome asks|say approve/i.test(limit.say), limit.say);
  // "What are you doing in Chrome?": the narration that sounds like Jarvis is left out.
  const status = taskStatusLine({ status: 'running', text: 'find a 4K monitor under $300 and add it to the cart', narration: 'Chrome asks: add the AppleCare plan, $199, to the cart? Say approve, or cancel.' });
  assert.equal(status, 'Chrome is working on: find a 4K monitor under $300 and add it to the cart.');
  assert.equal(taskStatusLine({ status: 'running', text: 'find a monitor', lastStep: 'Comparing three monitors.' }), 'Chrome is working on: find a monitor. Latest: Comparing three monitors.');
  // The notification (Voice Mode closed, Jarvis hidden) and the card.
  const t = setup({ voice: false, hidden: true });
  try {
    await t.fake.link.startTask({ text: 'find a monitor', chat: 'new' });
    await flush();
    t.fake.done({ status: 'done', answer: imitation });
    await flush();
    assert.equal(t.notices.length, 1, 'a notification');
    assert.ok(!/chrome asks|say approve/i.test(t.notices[0].body), t.notices[0].body);
  } finally {
    t.cv.destroy();
  }
});

test('ROUTING-8: emphatic no\'s answer Chrome\'s question asked last; during a check "not now", "no no no", "one second" withdraw it, "go for it" lets it count on', () => {
  const prompt = { id: 'chrome:p1', askedAt: 3000, ...PROMPTS.cart };
  for (const w of ['no no no', 'no, cancel that', 'Jarvis, no, cancel that', 'no wait', 'not now', 'nope nope']) {
    assert.equal((promptWords.matchChromeAnswer(w, { prompt, questions: [] }) || {}).answer, 'deny', w);
  }
  const check = { chromeCheck: { kind: 'task' } };
  for (const w of ['not now', 'Not now.', 'no no no', 'no, cancel that', 'one second', 'give me a second', 'hang on']) assert.equal((promptWords.matchChromeAnswer(w, check) || {}).how, 'withdraw', w);
  for (const w of ['go for it', 'proceed']) assert.equal((promptWords.matchChromeAnswer(w, check) || {}).how, 'keep', w);
});
