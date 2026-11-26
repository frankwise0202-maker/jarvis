// Jarvis for Chrome by voice (v8.1, the app side of G4 and G5): the task card, the prompt card, and
// the controller between app.chromeLink (contract (f)) and Jarvis: Voice Mode (through a small
// adapter over its seams, contract (a)), the cards in the chat, and notifications.
//
//   const cv = createChromeVoice({ link: app.chromeLink, voice: () => adapter | null, dock, notify, … });
//   cv.run(action, { surface })   // the router's chrome-task, chrome-ask, chrome-stop, chrome-status
//   cv.state()                    // the router state's `chrome`: { linked, online, task, contextUntil, prompt }
//   cv.noteOpened()               // a page opened in the Jarvis window (G3): a Chrome context starts
//   cv.pending()                  // the wake greeting's first words while a prompt waits, or ''
//   cv.voiceChanged()             // Voice Mode opened, closed, slept or woke: prompts move with it
//
// The voice adapter (part 2 builds it on Voice Mode's api): { say(line) -> bool (said now; false
// while Voice Mode is busy), prompt(spec) -> { update, close } (api.prompt), question(spec) -> { cancel }
// (api.question), check({ show, say, ms, onGo, onCancel }) -> { cancel } (the spoken check that binds
// the task), card(view) / uncard(view) (a card under Voice Mode's captions) }.
//
// Rules kept here: only the owner's checked words start a task (the router hands them over; nothing
// from the extension, a page or Claude ever becomes one); only the owner's checked "approve" or a tap
// on the card answers yes; a task never holds the session; Jarvis never says "Jarvis for Chrome".
// Text from the extension is shown with textContent only and said through sayable().

import { h, setText } from './dom.js';
import { icon } from './icons.js';
// (Its stylesheet, src/styles/chrome-task.css, comes in through app.css: a stylesheet imported from a JS module
// would break the Node unit tests that load this file's importers.)
import {
  CHROME_CONTEXT_MS,
  NOTHING_TO_STOP_LINE,
  TASK_ASK_LINE,
  TASK_CHECK_MS,
  TASK_CANCELLED_LINE,
  TASK_STARTED_LINE,
  TASK_STOPPING_LINE,
  TASK_STOP_UNREACHED_LINE,
  dollarsShown,
  isTaskAnswerCancel,
  matchTaskAnswer,
  sayable,
  taskCheckLine,
  taskCheckMs,
  taskDoneLine,
  taskRefusal,
  taskStatusLine,
} from '../lib/chrome-task-words.js';
import {
  DENIED_LINE,
  NOTHING_ASKED_LINE,
  answerHint,
  approveCheckMs,
  approvingLine,
  clickOnlyLine,
  hintLine,
  noChoice,
  promptAnswers,
  promptKind,
  promptLine,
  promptNotice,
  promptQuestion,
  refusedLine,
  takesVoiceYes,
  waitingLine,
} from '../lib/chrome-prompt-words.js';

const RUNNING = new Set(['running', 'waiting', 'paused', 'starting']);
const FINAL = new Set(['done', 'stopped', 'failed', 'limit', 'error', 'interrupted']);
const SAY_RETRY_MS = 400; // a line waits this long between tries while Voice Mode is busy
const SAY_GIVE_UP_MS = 60000; // ... and is dropped after this (the card still shows it)
const CLOSED_CARD_MS = 4000; // a prompt answered elsewhere: its card says so this long, then goes
const CARD_ANSWERS_LINE = 'Chrome’s question is on its card: tap its button to answer.';
const STOP_CONFIRM_MS = 10000; // a stop Jarvis for Chrome hasn't confirmed by then: the owner is told where to press Stop
const GONE_LINE = 'That question is no longer open.';
/** The BroadcastChannel name app.js opens for this device's Jarvis windows (REDTEAM-VOICE-7). */
export const CHROME_VOICE_CHANNEL = 'jarvis-chrome-voice';
const PEER_BEAT_MS = 30000; // a window with Voice Mode open says so again this often
const PEER_FRESH_MS = 75000; // ... and one not heard from for this long counts as gone

// ---------------------------------------------------------------------------------- the views

const STATUS_WORDS = {
  checking: 'Starting',
  starting: 'Starting…',
  running: 'Working',
  waiting: 'Waiting for you',
  paused: 'Paused: you took over',
  stopping: 'Stopping…',
  done: 'Done',
  stopped: 'Stopped',
  limit: 'Stopped at its limit',
  failed: 'Didn’t finish',
  error: 'Didn’t finish',
  interrupted: 'Didn’t finish',
  refused: 'Not started',
  cancelled: 'Not sent',
};

/** Money as a card shows it: 42¢ under a dollar, $1.20 above. */
function money(usd) {
  const v = Number(usd);
  if (!Number.isFinite(v) || v < 0) return '';
  return v < 1 ? `${Math.round(v * 100)}¢` : dollarsShown(v);
}

/**
 * The task card (in the chat and in Voice Mode): the owner's words, the status, the latest step,
 * the cost against its budget, the final answer; Cancel and Start now during the check (the lead's D2),
 * Stop while it runs.
 *   view.update({ phase, text, step, costUsd, limitUsd, answer, line, checkMs, countAt })
 *   (countAt: when the check's countdown started, checkMs its length; the bar fills over it)
 */
export function createTaskCard({ onStop = null, onCancel = null, onStartNow = null, onDismiss = null, testid = 'chrome-task-card' } = {}) {
  const kicker = h('span', { class: 'chrome-card-kicker hud-label', text: 'Chrome · from Jarvis' });
  const pill = h('span', { class: 'chrome-card-pill', attrs: { 'data-testid': `${testid}-status` } });
  const dismiss = h(
    'button',
    { class: 'chrome-card-dismiss', type: 'button', hidden: true, attrs: { 'aria-label': 'Close the Chrome card', 'data-testid': `${testid}-dismiss` }, on: { click: () => onDismiss && onDismiss() } },
    icon('close', { size: 16 }),
  );
  const head = h('div', { class: 'chrome-card-head' }, h('span', { class: 'chrome-card-icon', attrs: { 'aria-hidden': 'true' } }, icon('globe', { size: 16 })), kicker, pill, dismiss);
  const text = h('p', { class: 'chrome-card-text', attrs: { 'data-testid': `${testid}-text` } });
  const check = h('p', { class: 'chrome-card-check', hidden: true, attrs: { 'data-testid': `${testid}-check` } });
  const bar = h('span', { class: 'chrome-card-bar', hidden: true, attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'chrome-card-bar-fill' }));
  const step = h('p', { class: 'chrome-card-step', hidden: true, attrs: { 'data-testid': `${testid}-step` } });
  const answer = h('p', { class: 'chrome-card-answer', hidden: true, attrs: { 'data-testid': `${testid}-answer` } });
  const meta = h('p', { class: 'chrome-card-meta', hidden: true, attrs: { 'data-testid': `${testid}-cost` } });
  const cancelBtn = h('button', { class: 'btn btn-sm chrome-card-cancel', type: 'button', hidden: true, attrs: { 'data-testid': `${testid}-cancel` }, on: { click: () => onCancel && onCancel() } }, h('span', { text: 'Cancel' }));
  const startBtn = h('button', { class: 'btn btn-sm btn-primary chrome-card-start', type: 'button', hidden: true, attrs: { 'data-testid': `${testid}-start` }, on: { click: () => onStartNow && onStartNow() } }, h('span', { text: 'Start now' }));
  const stopBtn = h(
    'button',
    { class: 'btn btn-sm btn-danger-ghost chrome-card-stop', type: 'button', hidden: true, attrs: { 'data-testid': `${testid}-stop` }, on: { click: () => onStop && onStop() } },
    icon('stop', { size: 14 }),
    h('span', { text: 'Stop' }),
  );
  const actions = h('div', { class: 'chrome-card-actions' }, startBtn, cancelBtn, stopBtn);
  const el = h(
    'section',
    { class: ['chrome-card', 'chrome-card--task', 'hud-frame'], attrs: { 'data-testid': testid, 'data-status': 'checking', role: 'group', 'aria-label': 'Chrome task' } },
    head,
    text,
    check,
    bar,
    step,
    answer,
    meta,
    actions,
  );
  let barTimer = 0;
  let barFrom = 0; // the countdown the bar shows (its start), so other updates don't restart it

  function update(m = {}) {
    const phase = STATUS_WORDS[m.phase] ? m.phase : 'running';
    el.dataset.status = phase;
    setText(pill, STATUS_WORDS[phase]);
    setText(text, m.text ? `“${m.text}”` : '');
    text.hidden = !m.text;
    const checking = phase === 'checking';
    setText(check, checking ? m.line || '' : phase === 'refused' || phase === 'cancelled' ? m.line || '' : '');
    check.hidden = !check.textContent;
    const counting = checking && Number(m.checkMs) > 0 && Number(m.countAt) > 0;
    bar.hidden = !checking;
    if (counting && m.countAt !== barFrom) {
      // The countdown: the bar fills over what is left of the check's time (a CSS transition).
      barFrom = m.countAt;
      clearTimeout(barTimer);
      const left = Math.max(0, Number(m.checkMs) - Math.max(0, Date.now() - Number(m.countAt)));
      el.style.setProperty('--chrome-check-ms', `${Math.round(left)}ms`);
      el.dataset.counting = 'false';
      barTimer = setTimeout(() => {
        el.dataset.counting = 'true';
      }, 30);
    } else if (!counting) {
      barFrom = 0;
      clearTimeout(barTimer);
      delete el.dataset.counting;
    }
    const stepText = sayable(m.step, 240);
    setText(step, stepText);
    step.hidden = !stepText || checking || FINAL.has(phase);
    const answerText = FINAL.has(phase) ? String(m.answer || '').replace(/\r\n?/g, '\n').slice(0, 2000) : '';
    setText(answer, answerText);
    answer.hidden = !answerText;
    const spent = money(m.costUsd);
    const budget = money(m.limitUsd);
    setText(meta, spent ? (budget ? `${spent} of ${budget}` : spent) : '');
    meta.hidden = !meta.textContent || checking;
    cancelBtn.hidden = !checking;
    startBtn.hidden = !checking;
    stopBtn.hidden = !RUNNING.has(phase);
    dismiss.hidden = !(FINAL.has(phase) || phase === 'refused' || phase === 'cancelled');
  }

  return {
    el,
    update,
    destroy() {
      clearTimeout(barTimer);
      el.remove();
    },
  };
}

const YES_LABELS = { approve: 'Approve', once: 'Allow once', budget: 'Spend more', steps: 'More steps' };

/**
 * The prompt card (in the chat and in Voice Mode): Chrome's question in the extension's words, its
 * site and address, the buttons the voice policy allows (they count as voice: `via: 'card'`), and, for
 * a click-only prompt, where to click. view.update(prompt), view.status(text), view.busy(on).
 */
export function createPromptCard(prompt, { onChoice = null, testid = 'chrome-prompt-card' } = {}) {
  let p = prompt;
  const kicker = h('span', { class: 'chrome-card-kicker hud-label', text: 'Chrome asks' });
  const site = h('span', { class: 'chrome-card-site', attrs: { 'data-testid': `${testid}-site` } });
  const head = h('div', { class: 'chrome-card-head' }, h('span', { class: 'chrome-card-icon', attrs: { 'aria-hidden': 'true' } }, icon('alert', { size: 16 })), kicker, site);
  const title = h('p', { class: 'chrome-card-title', attrs: { 'data-testid': `${testid}-title` } });
  const ask = h('p', { class: 'chrome-card-text', attrs: { 'data-testid': `${testid}-ask` } });
  const body = h('p', { class: 'chrome-card-body', attrs: { 'data-testid': `${testid}-body` } });
  const address = h('code', { class: 'chrome-card-address', hidden: true, attrs: { 'data-testid': `${testid}-address` } });
  const note = h('p', { class: 'chrome-card-note', hidden: true, attrs: { 'data-testid': `${testid}-click-only` } });
  const yesBtn = h('button', { class: 'btn btn-sm btn-primary chrome-card-yes', type: 'button', hidden: true, attrs: { 'data-testid': `${testid}-yes` }, on: { click: () => choose('yes') } });
  const noBtn = h('button', { class: 'btn btn-sm chrome-card-no', type: 'button', hidden: true, attrs: { 'data-testid': `${testid}-no` }, on: { click: () => choose('no') } });
  const actions = h('div', { class: 'chrome-card-actions' }, yesBtn, noBtn);
  const status = h('p', { class: 'chrome-card-status', hidden: true, attrs: { 'data-testid': `${testid}-status`, role: 'status' } });
  const el = h(
    'section',
    { class: ['chrome-card', 'chrome-card--prompt', 'hud-frame'], attrs: { 'data-testid': testid, role: 'group', 'aria-label': 'Chrome asks' } },
    head,
    title,
    ask,
    body,
    address,
    note,
    actions,
    status,
  );

  function choose(which) {
    if (!onChoice || el.dataset.busy === 'true' || el.dataset.closed === 'true') return;
    if (which === 'yes') {
      const yes = promptAnswers(p).find((a) => a.check && a.choice);
      if (yes) onChoice({ answer: yes.id, choice: yes.choice });
    } else {
      const choice = noChoice(p);
      if (choice) onChoice({ answer: 'deny', choice });
    }
  }

  function update(next) {
    p = next && typeof next === 'object' ? next : p;
    el.dataset.kind = promptKind(p);
    el.dataset.voice = takesVoiceYes(p) ? 'allowed' : 'click';
    el.dataset.promptId = String(p.promptId || '');
    if (p.consequential) el.dataset.consequential = 'true';
    else delete el.dataset.consequential;
    setText(site, sayable(p.site, 80));
    setText(title, sayable(p.title, 200));
    title.hidden = !title.textContent;
    // The question and, when a yes can be said, how to say it; a click-only prompt says why below.
    setText(ask, takesVoiceYes(p) ? `${promptQuestion(p)} ${answerHint(p)}` : promptQuestion(p));
    setText(body, String(p.body || '').replace(/\s+/g, ' ').trim().slice(0, 600));
    body.hidden = !body.textContent;
    const addr = String(p.address || '').trim().slice(0, 600);
    setText(address, addr);
    address.hidden = !addr;
    const yes = takesVoiceYes(p) ? promptAnswers(p).find((a) => a.check && a.choice) : null;
    yesBtn.hidden = !yes;
    setText(yesBtn, yes ? YES_LABELS[yes.id] || 'Approve' : '');
    const no = noChoice(p);
    const noLabel = (Array.isArray(p.choices) ? p.choices : []).find((c) => c && c.id === no);
    noBtn.hidden = !no;
    setText(noBtn, no ? sayable(noLabel && noLabel.label, 30) || 'Cancel' : '');
    setText(note, takesVoiceYes(p) ? '' : clickOnlyLine(p).show);
    note.hidden = !note.textContent;
  }

  update(p);
  return {
    el,
    update,
    /** A line under the buttons ("Sending…", "Chrome didn't take that: …"), or none. */
    status(text) {
      setText(status, text || '');
      status.hidden = !text;
    },
    /** While an answer is on its way, the buttons wait. */
    busy(on) {
      el.dataset.busy = on ? 'true' : 'false';
      yesBtn.disabled = !!on;
      noBtn.disabled = !!on;
    },
    /** Answered or withdrawn: the buttons go, a line says so. */
    closed(text) {
      el.dataset.closed = 'true';
      yesBtn.hidden = true;
      noBtn.hidden = true;
      note.hidden = true;
      setText(status, text || '');
      status.hidden = !text;
    },
    destroy() {
      el.remove();
    },
  };
}

// ----------------------------------------------------------------------------- the controller

const quiet = (fn, fallback = null) => {
  try {
    return fn();
  } catch (err) {
    console.warn('[chrome-voice]', err);
    return fallback;
  }
};

/**
 * The Voice Mode adapter the controller uses, made from Voice Mode's api (contract (a) and its
 * api.chrome), or null when it has none.
 */
export function voiceAdapter(api) {
  if (!api || typeof api !== 'object' || !api.chrome || typeof api.prompt !== 'function') return null;
  return {
    say: (line) => api.chrome.say(line),
    check: (spec) => api.chrome.check(spec),
    card: (view) => api.chrome.card(view),
    greeted: (id, line) => (typeof api.chrome.greeted === 'function' ? api.chrome.greeted(id, line) : false),
    prompt: (spec) => api.prompt(spec),
    question: (spec) => api.question(spec),
  };
}

/**
 * The link's own notices (app.js chromeLinkNotice: D5's late start, and its unconfirmed variant): shown in the chat,
 * and said in Voice Mode as any line from Chrome is (api.chrome.say: no microphone after it unless this session would
 * listen anyway; CHROME-VOICE-R2-5, PRIVACY-1). Not said (Voice Mode closed or busy) while Jarvis is hidden: a
 * notification. `voice`: Voice Mode's api while it is open, else null.
 */
export function sayLinkNotice(n, { voice = null, hidden = () => false, toast = null, notify = null } = {}) {
  const line = n && typeof n.line === 'string' ? n.line : '';
  if (!line) return;
  const shown = typeof n.show === 'string' && n.show ? n.show : line; // (`line` is said; `show` may hold ⌘⇧.)
  if (typeof toast === 'function') quiet(() => toast(shown, { level: 'warn', timeout: 8000 }));
  const say = voice && voice.chrome && typeof voice.chrome.say === 'function' ? voice.chrome.say : null;
  const said = !!say && quiet(() => say(line), false);
  if (!said && quiet(() => hidden(), false) && typeof notify === 'function') quiet(() => notify({ tag: 'chrome-link', title: 'Jarvis', body: shown }));
}

/**
 * The controller. deps:
 *   link        app.chromeLink (contract (f)), or a function giving it (null until it exists: everything
 *               says "not linked"). Its listeners are attached as soon as it is there.
 *   voice()     the Voice Mode adapter while Voice Mode is open and awake (not on Standby), else null
 *   dock        an element in the chat for the cards (optional)
 *   notify({ tag, title, body, onClick }), closeNotice(tag)   system notifications (attention.js)
 *   focusApp()  brings Jarvis forward (a notification's click)
 *   toast(text, { level })    a line in the chat when Voice Mode isn't there to say it
 *   hidden()    Jarvis isn't on screen (the checks wait 5 s instead of 2)
 *   channel()   (optional) a BroadcastChannel-like object for this device's other Jarvis windows (app.js:
 *               new BroadcastChannel('jarvis-chrome-voice')): prompts, their closing and a task's end reach
 *               every window, and only the one where the owner talks says them (REDTEAM-VOICE-7)
 *   now()       the clock (tests)
 */
export function createChromeVoice(deps = {}) {
  const {
    link: linkDep = null,
    voice = () => null,
    dock = null,
    notify = null,
    closeNotice = null,
    focusApp = null,
    toast = null,
    hidden = () => (typeof document !== 'undefined' ? !!document.hidden : false),
    channel: channelDep = null,
    now = () => Date.now(),
  } = deps;

  const S = {
    contextUntil: 0, // a Chrome context lasts until then (CHROME_CONTEXT_MS after the last Chrome action)
    task: null, // the latest task: { id, status, text, narration, lastStep, costUsd, limitUsd, answer, stopping }
    pendingTask: null, // the check before a start: { text, chat, check, cancelled }
    asking: null, // "What should I do in Chrome?" waiting: { handle }
    busy: null, // "Chrome is busy with another task. Stop it first?" waiting: { pend, handle, taken }
    taskViews: new Set(), // the task card's views (chat and Voice Mode)
    prompts: new Map(), // promptId -> { prompt, hash, views: Set, handle, notified, answering, closing }
    // A task's budget as Jarvis for Chrome reported it (hello and status, else a task's first limit); null
    // until it has: the check then says "up to your Chrome budget" (MONEY-3, REDTEAM-VOICE-9).
    baseUsd: null,
    linkTaskId: '', // the task the link last reported: its prompts close when it ends or another begins
    lastDoneId: '', // the task whose end was handled last (heard twice, it is said once)
    sayQueue: [], // lines waiting for Voice Mode to be free: { line, until }
    sayTimer: 0,
    voiceOn: false, // the adapter was there last time we looked
    peers: new Map(), // other windows: id -> { voice: Voice Mode open there, at }
    destroyed: false,
  };
  const me = `w${Math.random().toString(36).slice(2, 10)}${now().toString(36)}`;
  let chan = null;
  let offs = [];
  let attached = null; // the link our listeners are on
  let attachTimer = 0;
  const L = () => {
    const l = typeof linkDep === 'function' ? quiet(() => linkDep(), null) : linkDep;
    return l && typeof l === 'object' && typeof l.state === 'function' ? l : null;
  };
  const linkOk = () => !!attach();
  const linkState = () => {
    const l = attach();
    return (l ? quiet(() => l.state(), null) : null) || { linked: false, online: false, voiceApprovals: false, task: null };
  };
  const v = () => (S.destroyed ? null : quiet(() => voice(), null));

  // ---- lines: said in Voice Mode, else shown ----------------------------------------------------

  /** Say a line now when Voice Mode is free, or as soon as it is (up to a minute); else a toast. */
  function tell(say, show = say, { level = 'info' } = {}) {
    if (!say && !show) return;
    const adapter = v();
    if (adapter) {
      if (!say) return; // the card says it
      if (quiet(() => adapter.say(say), false)) return;
      S.sayQueue.push({ line: say, until: now() + SAY_GIVE_UP_MS });
      pumpSay();
      return;
    }
    if (typeof toast === 'function') quiet(() => toast(show, { level, id: 'chrome-voice' }));
  }

  function pumpSay() {
    clearTimeout(S.sayTimer);
    S.sayTimer = 0;
    if (S.destroyed) return;
    while (S.sayQueue.length && S.sayQueue[0].until < now()) S.sayQueue.shift();
    if (!S.sayQueue.length) return;
    const adapter = v();
    if (adapter && quiet(() => adapter.say(S.sayQueue[0].line), false)) S.sayQueue.shift();
    if (S.sayQueue.length) S.sayTimer = setTimeout(pumpSay, SAY_RETRY_MS);
  }

  // ---- the Chrome context -----------------------------------------------------------------------

  function noteContext() {
    S.contextUntil = Math.max(S.contextUntil, now() + CHROME_CONTEXT_MS);
  }

  // ---- the link ---------------------------------------------------------------------------------

  /**
   * The link, with our listeners on it (attached once it exists; again if it is replaced). A page that
   * opens in the Jarvis window (G3, "pull this up in Chrome") starts a Chrome context: open() is watched
   * for that (same arguments, same answer).
   */
  function attach() {
    const l = L();
    if (!l || l === attached || S.destroyed) return l;
    for (const off of offs) if (typeof off === 'function') quiet(off);
    offs = [];
    attached = l;
    clearInterval(attachTimer);
    attachTimer = 0;
    if (typeof l.subscribe === 'function') offs.push(quiet(() => l.subscribe(() => syncFromLink())));
    if (typeof l.onPrompt === 'function') offs.push(quiet(() => l.onPrompt((p) => onPrompt(p))));
    if (typeof l.onPromptClosed === 'function') offs.push(quiet(() => l.onPromptClosed((id) => onPromptClosed(id))));
    if (typeof l.onDone === 'function') offs.push(quiet(() => l.onDone((d) => onDone(d))));
    if (typeof l.open === 'function' && !l.__chromeVoiceOpen) {
      const open = l.open;
      quiet(() => {
        l.open = function openWatched(...args) {
          return Promise.resolve(open.apply(this, args)).then((r) => {
            if (r && r.ok) noteContext();
            return r;
          });
        };
        Object.defineProperty(l, '__chromeVoiceOpen', { value: true });
      });
    }
    return l;
  }

  // ---- the task card ----------------------------------------------------------------------------

  function taskModel() {
    const pend = S.pendingTask;
    // A check (or a start refused) shows over the last task, except a refusal while one runs.
    if (pend && !pend.done && !(pend.refused && S.task && RUNNING.has(S.task.status))) {
      // Its start on its way (ROUTING-11): no check any more; Stop stops the task it makes.
      const flying = pend.sent && !pend.cancelled && !pend.refused;
      const phase = pend.cancelled ? 'cancelled' : pend.refused ? 'refused' : flying ? (pend.stopAfterStart ? 'stopping' : 'starting') : 'checking';
      return { phase, text: pend.text, line: pend.line, checkMs: pend.ms, countAt: pend.countAt };
    }
    const t = S.task;
    if (!t) return null;
    // A stop on its way: "Stopping…" until Jarvis for Chrome confirms it (then "Stopped").
    const status = t.stopping && RUNNING.has(t.status) ? 'stopping' : t.status === 'error' || t.status === 'interrupted' ? 'failed' : t.status;
    return { phase: status, text: t.text, step: t.narration || t.lastStep, costUsd: t.costUsd, limitUsd: t.limitUsd, answer: t.answer, line: t.line };
  }

  function renderTask() {
    const m = taskModel();
    if (!m) {
      for (const view of S.taskViews) view.destroy();
      S.taskViews.clear();
      return;
    }
    ensureTaskViews();
    for (const view of S.taskViews) view.update(m);
  }

  function makeTaskView(testid) {
    return createTaskCard({
      testid,
      onStop: () => stopTask({ via: 'card' }),
      onCancel: () => cancelCheck('card'),
      onStartNow: () => startNow(),
      onDismiss: () => dismissTask(),
    });
  }

  function ensureTaskViews() {
    if (dock && ![...S.taskViews].some((x) => x.where === 'dock')) {
      const view = makeTaskView('chrome-task-card');
      view.where = 'dock';
      dock.prepend(view.el);
      S.taskViews.add(view);
    }
    const adapter = v();
    if (adapter && typeof adapter.card === 'function' && ![...S.taskViews].some((x) => x.where === 'voice')) {
      const view = makeTaskView('voice-chrome-task-card');
      view.where = 'voice';
      if (quiet(() => adapter.card(view), false) !== false) S.taskViews.add(view);
    }
  }

  function dropVoiceViews() {
    for (const view of [...S.taskViews]) {
      if (view.where !== 'voice') continue;
      S.taskViews.delete(view);
      view.destroy();
    }
    for (const entry of S.prompts.values()) {
      for (const view of [...entry.views]) {
        if (view.where !== 'voice') continue;
        entry.views.delete(view);
        view.destroy();
      }
    }
  }

  function dismissTask() {
    if (S.pendingTask && !S.pendingTask.done) S.pendingTask = null;
    if (S.task && FINAL.has(S.task.status)) S.task = null;
    renderTask();
  }

  // ---- tasks ------------------------------------------------------------------------------------

  /** Why no task can go to Chrome now ('unlinked' | 'offline'), or ''. */
  function unreachable() {
    const st = linkState();
    if (!linkOk() || !st.linked) return 'unlinked';
    if (!st.online) return 'offline';
    return '';
  }

  /**
   * A task from the owner's checked words: one check (the lead's D2). In Voice Mode it is spoken with
   * the price ("Chrome, up to a dollar: …. Say cancel to stop.") and counts 2 s once said (5 s while
   * hidden) with the microphone open (voice-mode.js api.chrome.check). Typed (Voice Mode closed), the
   * card shows the price and counts 2 s, nothing spoken. Either way the card has Cancel and Start now,
   * and nothing goes to the extension before the countdown ends.
   */
  function startTaskFlow({ text, chat = 'new' }) {
    const words = String(text || '').trim();
    if (!words) return;
    const why = unreachable();
    if (why) {
      const r = taskRefusal(why);
      tell(r.say, r.show, { level: 'warn' });
      return;
    }
    cancelCheck('replaced', { quietly: true });
    learnBudget();
    // The price said is the budget Jarvis for Chrome reported (or "your Chrome budget" until it has), and the
    // start carries it: what the owner heard is what it may spend (MONEY-3).
    const limitUsd = Number(S.baseUsd) > 0 ? S.baseUsd : null;
    const line = taskCheckLine({ text: words, limitUsd });
    const pend = { text: words, chat: chat === 'same' ? 'same' : 'new', line, limitUsd, ms: 0, countAt: 0, check: null, timer: 0, cancelled: false, refused: false, done: false };
    S.pendingTask = pend;
    noteContext();
    renderTask();
    const adapter = v();
    if (adapter && typeof adapter.check === 'function') {
      pend.check = quiet(
        () =>
          adapter.check({
            kind: 'task',
            show: line,
            say: line,
            cancelLine: TASK_CANCELLED_LINE,
            onGo: () => goTask(pend),
            onCancel: (how) => cancelCheck(how, { quietly: how !== 'closed', fromCheck: true }),
            onCount: (ms) => {
              if (S.pendingTask !== pend) return;
              pend.ms = ms;
              pend.countAt = now();
              renderTask();
            },
            // "Stop" during it while another task runs: that one stops too (REDTEAM-VOICE-4). Quietly: Voice
            // Mode says "Okay, nothing sent. Chrome is stopping."
            onStop: () => stopRunning({ quietly: true }),
          }),
        null,
      );
      if (pend.check) return;
    }
    // Typed (no Voice Mode): the card shows the price and counts 2 s; Cancel (or a typed "cancel") withdraws it.
    pend.line = taskCheckLine({ text: words, limitUsd, typed: true });
    pend.ms = TASK_CHECK_MS;
    pend.countAt = now();
    renderTask();
    pend.timer = setTimeout(() => goTask(pend), pend.ms);
  }

  /** "Start now" on the card: the check ends at once and the task goes. */
  function startNow() {
    const pend = S.pendingTask;
    if (!pend || pend.done || pend.cancelled || pend.refused || pend.sent) return;
    if (pend.check && typeof pend.check.go === 'function' && quiet(() => pend.check.go(), false)) return;
    goTask(pend);
  }

  /**
   * The check withdrawn: "cancel" (Voice Mode says why itself), the card's Cancel, a correction or other
   * words (routed again), a new task, Voice Mode closing. Nothing is sent. A start already refused (busy,
   * off, …) is no check any more: false, so a "stop" after it reaches the task that runs (REDTEAM-VOICE-2).
   */
  function cancelCheck(how, { quietly = false, fromCheck = false } = {}) {
    const pend = S.pendingTask;
    // (A start already sent is no check either: a stop then stops the task it makes, ROUTING-11.)
    if (!pend || pend.done || pend.cancelled || pend.refused || pend.sent) return false;
    clearTimeout(pend.timer);
    pend.cancelled = true;
    if (!fromCheck && pend.check && typeof pend.check.cancel === 'function') quiet(() => pend.check.cancel());
    pend.line = TASK_CANCELLED_LINE;
    renderTask();
    if (!quietly) tell(how === 'card' && v() ? TASK_CANCELLED_LINE : '', TASK_CANCELLED_LINE);
    return true;
  }

  async function goTask(pend) {
    if (S.pendingTask !== pend || pend.cancelled || pend.done) return;
    clearTimeout(pend.timer);
    const why = unreachable();
    if (why) {
      refuse(pend, why);
      return;
    }
    // On its way: from here a stop is for the task this start makes (ROUTING-11; the reply takes a relay round trip).
    pend.sent = true;
    renderTask();
    let res = null;
    try {
      // The limit the owner heard goes with it (absent while the budget is unknown: "up to your Chrome budget").
      res = await L().startTask({ text: pend.text, chat: pend.chat, ...(Number(pend.limitUsd) > 0 ? { limitUsd: pend.limitUsd } : {}) });
    } catch {
      res = { ok: false, reason: 'offline' };
    }
    if (S.pendingTask !== pend || S.destroyed) return;
    if (!res || !res.ok) {
      if (pend.stopAfterStart) {
        // Stopped on its way, and it never started: nothing runs (the owner was told it is stopping).
        pend.cancelled = true;
        pend.line = TASK_CANCELLED_LINE;
        renderTask();
        settleFlightStop(pend, { confirmed: true, nothingRan: true });
        return;
      }
      refuse(pend, (res && res.reason) || 'offline', res && res.why);
      return;
    }
    pend.done = true;
    S.pendingTask = null;
    S.task = { id: String(res.id || ''), status: 'starting', text: pend.text, narration: '', lastStep: '', costUsd: 0, limitUsd: pend.limitUsd, answer: '', stoppedByOwner: false, stopping: null };
    noteContext();
    syncFromLink();
    renderTask();
    if (pend.stopAfterStart) {
      // A stop said while its start was on its way: the task is stopped at once, now that it has an id (never
      // "Chrome is on it." for a task the owner stopped; D5's rule).
      stopTask({ via: 'voice', quietly: pend.stopQuietly !== false }).then((r) => settleFlightStop(pend, r));
      return;
    }
    tell(TASK_STARTED_LINE);
  }

  /** A start on its way (sent, no answer yet), or null. */
  function inFlight() {
    const pend = S.pendingTask;
    return pend && pend.sent && !pend.done && !pend.cancelled && !pend.refused ? pend : null;
  }

  /** Stop the task a start on its way makes, once it has an id (ROUTING-11). quietly: no "Chrome stopped." at the end. */
  function stopInFlight(pend, { quietly = true } = {}) {
    if (!pend.stopAfterStart) {
      pend.stopAfterStart = true;
      pend.stopQuietly = quietly;
      pend.stopPromise = new Promise((resolve) => {
        pend.stopResolve = resolve;
      });
      renderTask();
    } else if (!quietly) pend.stopQuietly = false;
    return pend.stopPromise;
  }

  function settleFlightStop(pend, result) {
    if (typeof pend.stopResolve === 'function') pend.stopResolve(result || { confirmed: false });
    pend.stopResolve = null;
  }

  function refuse(pend, reason, why = '') {
    pend.refused = true;
    const r = taskRefusal(reason, why);
    pend.line = r.show;
    renderTask();
    if (reason === 'busy' && v()) {
      askStopFirst(pend);
      return;
    }
    if (reason === 'busy') {
      tell('', 'Chrome is busy with another task. Stop it first, then ask again.', { level: 'warn' });
      return;
    }
    tell(r.say, r.show, { level: 'warn' });
  }

  /** A refused start the owner left (no, or no answer): it goes, and nothing about it stays to catch a "stop". */
  function dropRefused(pend) {
    if (S.pendingTask !== pend) return;
    S.pendingTask = null;
    renderTask();
  }

  /**
   * "Chrome is busy with another task. Stop it first?": yes (or "stop it", "stop": the stop layer takes those
   * and stopFromVoice() counts them as this yes) stops it and, once that is confirmed, starts this one; no, or
   * no answer, leaves it (REDTEAM-VOICE-2).
   */
  function askStopFirst(pend) {
    const adapter = v();
    const r = taskRefusal('busy');
    const busy = { pend, handle: null, taken: false };
    S.busy = busy;
    const over = () => {
      if (S.busy === busy) S.busy = null;
    };
    busy.handle = quiet(
      () =>
        adapter.question({
          id: 'chrome-busy',
          say: r.say,
          choices: [
            { id: 'yes', label: 'Stop it', words: ['yes', 'yes stop it', 'stop it', 'yes please'] },
            { id: 'no', label: 'Leave it', words: ['no', 'leave it', 'no thanks', 'never mind', 'cancel'] },
          ],
          onAnswer: (id) => {
            over();
            if (busy.taken) return;
            busy.taken = true;
            if (id !== 'yes') {
              dropRefused(pend);
              tell('Okay, I’ll leave it.');
              return;
            }
            stopThenStart(pend);
          },
          onExpire: () => {
            // (A stop word dropped it on its way to the stop layer: that stop, in this same turn, is its yes.)
            setTimeout(() => {
              over();
              if (!busy.taken) dropRefused(pend);
            }, 0);
          },
        }),
      null,
    );
    if (!busy.handle) {
      over();
      tell(r.say, r.show, { level: 'warn' });
    }
  }

  /** The busy question's yes: the running task stops; once Jarvis for Chrome confirms it, the checked one starts. */
  function stopThenStart(pend) {
    const running = S.task && RUNNING.has(S.task.status) ? S.task : null;
    const go = () => {
      if (S.pendingTask !== pend || S.destroyed) return;
      pend.refused = false;
      renderTask();
      goTask(pend);
    };
    if (!running) {
      go();
      return;
    }
    stopTask({ via: 'voice', quietly: true }).then((r) => {
      if (r && r.confirmed) go();
      else dropRefused(pend); // not confirmed: the owner was told where to press Stop; nothing new starts
    });
  }

  /**
   * Stop the running task. The card says "Stopping…", and the task is marked stopped only once Jarvis for
   * Chrome confirms it: stopTask()'s { ok: true } (REDTEAM-LINK-1; a link that resolves nothing waits for the
   * task's `done`), or the task's `done`. After 10 s unconfirmed: "I couldn't reach Chrome to stop it. Press
   * Stop in its side panel." (the link keeps sending it meanwhile). One stop at a time: asking again joins it.
   * quietly: no "Chrome stopped." when it is confirmed (the caller said its own line). -> Promise<{ none } |
   * { confirmed: boolean }>
   */
  function stopTask({ via = 'voice', quietly = false } = {}) {
    const flying = inFlight();
    if (flying) return stopInFlight(flying, { quietly });
    const t = S.task;
    if (!t || !RUNNING.has(t.status)) {
      if (!quietly && via !== 'card') tell(NOTHING_TO_STOP_LINE);
      return Promise.resolve({ none: true });
    }
    if (t.stopping) {
      if (!quietly) t.stopping.quietly = false;
      quiet(() => L().stopTask()); // sent again now (the link joins the stop it is already sending)
      return t.stopping.promise;
    }
    t.stoppedByOwner = true;
    const st = { quietly, warned: false, settled: false, timer: 0, promise: null, resolve: null };
    st.promise = new Promise((resolve) => {
      st.resolve = resolve;
    });
    t.stopping = st;
    renderTask();
    st.timer = setTimeout(() => {
      if (st.settled || S.destroyed) return;
      st.warned = true;
      tell(TASK_STOP_UNREACHED_LINE, TASK_STOP_UNREACHED_LINE, { level: 'warn' });
    }, STOP_CONFIRM_MS);
    let res;
    try {
      res = L().stopTask();
    } catch {
      res = null;
    }
    Promise.resolve(res).then(
      (r) => {
        if (r && typeof r === 'object' && r.ok === true) stopConfirmed(t);
        else if (r && typeof r === 'object' && r.ok === false) stopFailed(t, r.reason);
        // (void: an older link; the task's `done` confirms it)
      },
      () => stopFailed(t, 'offline'),
    );
    return st.promise;
  }

  /** Jarvis for Chrome confirmed the stop (its reply, or the task's end). `say`: false when it ended otherwise. */
  function stopConfirmed(t, { say = true } = {}) {
    const st = t && t.stopping;
    if (!st || st.settled) return;
    st.settled = true;
    clearTimeout(st.timer);
    t.stopping = null;
    if (RUNNING.has(t.status)) t.status = 'stopped';
    renderTask();
    // Said when asked for, and always after "I couldn't reach Chrome…": the owner hears that it did stop.
    if (say && (!st.quietly || st.warned) && !S.destroyed) tell('Chrome stopped.');
    st.resolve({ confirmed: true });
  }

  /** The link gave up on the stop (unlinked, or 2 minutes unconfirmed). */
  function stopFailed(t, reason) {
    const st = t && t.stopping;
    if (!st || st.settled) return;
    st.settled = true;
    clearTimeout(st.timer);
    t.stopping = null;
    renderTask();
    if (!st.warned && !S.destroyed) tell(TASK_STOP_UNREACHED_LINE, TASK_STOP_UNREACHED_LINE, { level: 'warn' });
    st.resolve({ confirmed: false, reason: reason || 'offline' });
  }

  /** A running task stopped quietly (a stop word said during another task's check): true when one runs. */
  function stopRunning({ quietly = true } = {}) {
    const t = S.task;
    if (!t || !RUNNING.has(t.status)) return false;
    stopTask({ via: 'voice', quietly });
    return true;
  }

  // ---- the link's events ------------------------------------------------------------------------

  /**
   * The budget Jarvis for Chrome reported (hello and status carry budgetUsd; MONEY-3, REDTEAM-VOICE-9): the
   * price every check says from now on.
   */
  function learnBudget(st = linkState()) {
    const b = Number(st && st.budgetUsd);
    if (Number.isFinite(b) && b > 0) {
      S.baseUsd = Math.round(b * 100) / 100;
      S.budgetReported = true;
    }
  }

  /** The link's state changed: the task's status, its latest step and its cost. */
  function syncFromLink() {
    const st = linkState();
    learnBudget(st);
    const lt = st.task && typeof st.task === 'object' ? st.task : null;
    // A prompt belongs to the task that asked it: once the link reports that task gone (or another one), any
    // prompt still open here was closed without a word (a worker restart, a lost prompt-closed: REDTEAM-VOICE-8).
    const ltId = lt && lt.id ? String(lt.id) : '';
    if (S.linkTaskId && S.linkTaskId !== ltId) closeAllPrompts();
    S.linkTaskId = ltId;
    if (lt && lt.id) {
      if (!S.task || S.task.id !== lt.id) {
        if (S.task && S.task.id && RUNNING.has(S.task.status)) S.task.status = 'stopped';
        S.task = { id: String(lt.id), status: 'running', text: '', narration: '', lastStep: '', costUsd: 0, limitUsd: S.baseUsd, answer: '', stoppedByOwner: false, stopping: null };
      }
      const t = S.task;
      if (typeof lt.status === 'string' && !FINAL.has(t.status)) t.status = lt.status;
      if (typeof lt.text === 'string' && lt.text) t.text = lt.text;
      if (typeof lt.narration === 'string') t.narration = lt.narration;
      if (typeof lt.lastStep === 'string') t.lastStep = lt.lastStep;
      if (Number.isFinite(Number(lt.costUsd)) && lt.costUsd !== null) t.costUsd = Number(lt.costUsd);
      if (Number(lt.limitUsd) > 0) {
        t.limitUsd = Number(lt.limitUsd);
        if (!t.baseSeen) {
          t.baseSeen = true;
          // The first limit of a task is its budget, when Jarvis for Chrome hasn't said its budget itself.
          if (!S.budgetReported) S.baseUsd = t.limitUsd;
        }
      }
      noteContext();
    }
    renderTask();
  }

  /** A task ended (the link's `done`, or another window's: `relayed`). */
  function onDone(d, { relayed = false } = {}) {
    const done = d && typeof d === 'object' ? d : {};
    // Once per task: the same end heard twice (from the link and from another window) is said once.
    if (done.id && S.lastDoneId === String(done.id)) return;
    if (done.id) S.lastDoneId = String(done.id);
    if (!relayed) share({ t: 'done', done });
    let t = S.task;
    if (!t || (done.id && t.id && String(done.id) !== t.id)) {
      t = { id: String(done.id || ''), status: 'done', text: '', narration: '', lastStep: '', costUsd: 0, limitUsd: S.baseUsd, answer: '', stopping: null };
      S.task = t;
    }
    const status = ['done', 'stopped', 'failed', 'limit'].includes(done.status) ? done.status : 'failed';
    const owner = t.stoppedByOwner && status === 'stopped';
    t.status = status;
    t.answer = String(done.answer || '').slice(0, 2000);
    if (Number.isFinite(Number(done.costUsd))) t.costUsd = Number(done.costUsd);
    // A stop on its way is confirmed: the task is over. ("Chrome stopped." only when it did stop.)
    if (t.stopping) stopConfirmed(t, { say: status === 'stopped' });
    // Its prompts are over too, whatever its end (REDTEAM-VOICE-8).
    closeAllPrompts();
    noteContext();
    renderTask();
    if (owner) return; // the owner's stop said its own lines
    const line = taskDoneLine({ status, answer: t.answer });
    // Jarvis says the final answer where the owner talks to him; with Voice Mode closed everywhere, the card
    // shows it (and a notification tells the owner while Jarvis is hidden).
    if (!v() && voiceElsewhere()) return;
    if (!v() && quiet(() => hidden(), false) && typeof notify === 'function') {
      quiet(() => notify({ tag: 'chrome-task', title: 'Chrome', body: sayable(line.show, 180), onClick: () => focusApp && focusApp() }));
      return;
    }
    tell(line.say, line.show, { level: status === 'done' ? 'success' : 'info' });
  }

  // ---- prompts (G5) -----------------------------------------------------------------------------

  /**
   * Chrome asks (the link's `prompt`; `relayed`: from the window holding the link, REDTEAM-VOICE-7). Every
   * window shows its cards; the window where Voice Mode is open says it; with Voice Mode open nowhere, the
   * window holding the link sends the notification.
   */
  function onPrompt(raw, { relayed = false, from = '' } = {}) {
    if (!raw || typeof raw !== 'object' || !raw.promptId) return;
    const prompt = { ...raw, promptId: String(raw.promptId) };
    if (!relayed) share({ t: 'prompt', prompt });
    let entry = S.prompts.get(prompt.promptId);
    if (!entry) {
      // from: the window that passed it on (CHROME-VOICE-R2-6: when it closes, this window notifies for it).
      entry = { prompt, hash: prompt.hash, views: new Set(), handle: null, notified: false, answering: false, closing: 0, shownAt: now(), direct: !relayed, from: relayed ? from : '' };
      S.prompts.set(prompt.promptId, entry);
    } else {
      entry.prompt = prompt;
      entry.hash = prompt.hash; // a changed prompt is said again before a yes counts (update)
      entry.shownAt = now();
      if (!relayed) entry.direct = true;
    }
    if (S.task && RUNNING.has(S.task.status)) S.task.status = 'waiting';
    renderTask();
    renderPrompt(entry);
    toVoiceOrNotice(entry);
  }

  function promptViews(entry) {
    if (dock && ![...entry.views].some((x) => x.where === 'dock')) {
      const view = createPromptCard(entry.prompt, { onChoice: (c) => answerFromCard(entry, c) });
      view.where = 'dock';
      dock.prepend(view.el);
      entry.views.add(view);
    }
    const adapter = v();
    if (adapter && typeof adapter.card === 'function' && ![...entry.views].some((x) => x.where === 'voice')) {
      const view = createPromptCard(entry.prompt, { onChoice: (c) => answerFromCard(entry, c), testid: 'voice-chrome-prompt-card' });
      view.where = 'voice';
      if (quiet(() => adapter.card(view), false) !== false) entry.views.add(view);
    }
  }

  function renderPrompt(entry) {
    promptViews(entry);
    for (const view of entry.views) view.update(entry.prompt);
  }

  /** The answers Voice Mode's prompt channel takes for this prompt, with their checks. */
  function channelAnswers(entry) {
    const hiddenNow = quiet(() => hidden(), false);
    // "Spend more" adds one more budget: the one Jarvis for Chrome reported, else this task's own first one.
    const base = Number(S.baseUsd) > 0 ? S.baseUsd : S.task && Number(S.task.limitUsd) > 0 ? S.task.limitUsd : undefined;
    return promptAnswers(entry.prompt).map((a) => {
      if (!a.check) return a;
      const lines = approvingLine(entry.prompt, a, { task: S.task, baseUsd: base });
      return { ...a, check: { show: lines.show, say: lines.say, ms: approveCheckMs({ hidden: hiddenNow }) } };
    });
  }

  /** Said in Voice Mode when it is there (its channel says it when free); else a notification. */
  function toVoiceOrNotice(entry) {
    const adapter = v();
    const line = promptLine(entry.prompt);
    if (adapter && typeof adapter.prompt === 'function') {
      if (entry.handle && typeof entry.handle.update === 'function') {
        quiet(() => entry.handle.update({ say: line.say, answers: channelAnswers(entry) }));
      } else {
        entry.handle = quiet(
          () =>
            adapter.prompt({
              id: `chrome:${entry.prompt.promptId}`,
              say: line.say,
              hint: hintLine(entry.prompt),
              answers: channelAnswers(entry),
              onAnswer: (answerId, info) => answerFromVoice(entry, answerId, info),
              onClosed: () => {
                entry.handle = null;
              },
            }),
          null,
        );
      }
      if (entry.handle) {
        // Behind other windows, a notification says Chrome is asking too: Voice Mode may say it with no microphone
        // open for it (PRIVACY-1), so the owner may only see it there. On screen, Voice Mode and its card are enough.
        if (quiet(() => hidden(), false)) noticeOf(entry);
        else closeNoticeOf(entry);
        return;
      }
    }
    // Another window has Voice Mode open: it says the prompt there. With Voice Mode open nowhere, only the
    // window holding the link (which heard it first) sends the notification: one for the owner, not one a window.
    if (voiceElsewhere() || !entry.direct) return;
    noticeOf(entry);
  }

  /** "Chrome asks: …" as a notification (once per prompt); its click brings Jarvis forward with the card. */
  function noticeOf(entry) {
    if (!entry.notified && typeof notify === 'function') {
      entry.notified = true;
      const n = promptNotice(entry.prompt);
      quiet(() =>
        notify({
          tag: noticeTag(entry),
          title: n.title,
          body: n.body,
          onClick: () => {
            if (typeof focusApp === 'function') quiet(() => focusApp());
            const card = [...entry.views].find((x) => x.where === 'dock');
            if (card && card.el && typeof card.el.scrollIntoView === 'function') quiet(() => card.el.scrollIntoView({ block: 'nearest' }));
          },
        }),
      );
    }
  }

  const noticeTag = (entry) => `chrome-prompt-${entry.prompt.promptId}`;
  function closeNoticeOf(entry) {
    if (entry.notified && typeof closeNotice === 'function') quiet(() => closeNotice(noticeTag(entry)));
    entry.notified = false;
  }

  /** An answer from Voice Mode's channel (its check, if any, is over): it goes out bound to the hash. */
  async function answerFromVoice(entry, answerId, info = {}) {
    if (!S.prompts.has(entry.prompt.promptId)) return;
    const answer = promptAnswers(entry.prompt).find((a) => a.id === answerId);
    if (!answer) return;
    if (answer.clickOnly) {
      tell(clickOnlyLine(entry.prompt).say, clickOnlyLine(entry.prompt).show);
      return;
    }
    if (answer.id === 'other') {
      tell(hintLine(entry.prompt));
      return;
    }
    if (answer.stopTask) {
      // "Stop Chrome": "Stopping Chrome…", then "Chrome stopped." once confirmed. Quiet when Voice Mode said its
      // own line (a stop said during an approval's check: "Okay, not approved. Chrome is stopping.").
      const quietly = !!(info && info.quiet);
      if (!quietly && S.task && RUNNING.has(S.task.status) && !S.task.stopping) tell(TASK_STOPPING_LINE);
      await stopTask({ via: 'voice', quietly });
      return;
    }
    if (!answer.choice) return;
    await send(entry, answer, info && info.via === 'card' ? 'card' : 'voice');
  }

  function answerFromCard(entry, { answer: answerId }) {
    const answer = promptAnswers(entry.prompt).find((a) => a.id === answerId);
    if (answer && answer.choice) send(entry, answer, 'card');
  }

  async function send(entry, answer, via) {
    if (entry.answering) return;
    entry.answering = true;
    const hash = entry.hash;
    for (const view of entry.views) {
      view.busy(true);
      view.status('Sending…');
    }
    let res = null;
    try {
      res = await L().answer({ promptId: entry.prompt.promptId, hash, choice: answer.choice, via });
    } catch {
      res = { ok: false, reason: 'offline', why: 'Chrome couldn’t be reached' };
    }
    entry.answering = false;
    if (S.destroyed) return;
    const open = S.prompts.has(entry.prompt.promptId); // the extension may have closed it already
    if (open) for (const view of entry.views) view.busy(false);
    if (res && res.ok) {
      if (open) for (const view of entry.views) view.status(answer.negative ? 'You said no.' : 'Approved.');
      if (answer.negative && via === 'voice') tell(DENIED_LINE);
      return;
    }
    if (!open) return;
    // The question isn't open any more in Jarvis for Chrome (not an answer refused for being too late, which
    // leaves it open): it closes here too, and Jarvis says so (REDTEAM-VOICE-8).
    if (res && res.reason === 'gone' && !/too late/i.test(String(res.why || ''))) {
      closePromptEntry(entry, 'No longer open.');
      if (via === 'voice' || v()) tell(GONE_LINE, GONE_LINE, { level: 'warn' });
      return;
    }
    // Refused (the policy, a changed prompt, too soon) or not delivered: the prompt stays open.
    const why = (res && (res.why || res.reason)) || '';
    const line = refusedLine(why === 'offline' ? 'Chrome couldn’t be reached' : why);
    for (const view of entry.views) view.status(line);
    if (via === 'voice' || v()) tell(line, line, { level: 'warn' });
  }

  /** The prompt was answered or closed in Jarvis for Chrome (the link's `prompt-closed`, or another window's). */
  function onPromptClosed(id, { relayed = false } = {}) {
    const promptId = String(id && typeof id === 'object' ? id.promptId : id);
    if (!relayed) share({ t: 'prompt-closed', promptId });
    const entry = S.prompts.get(promptId);
    if (!entry) return;
    closePromptEntry(entry, 'Answered.');
  }

  /** A prompt is over here: its handle in Voice Mode, its notification and its cards ("Answered.", …) go. */
  function closePromptEntry(entry, line) {
    if (S.prompts.get(entry.prompt.promptId) !== entry) return;
    S.prompts.delete(entry.prompt.promptId);
    if (entry.handle && typeof entry.handle.close === 'function') quiet(() => entry.handle.close());
    entry.handle = null;
    closeNoticeOf(entry);
    for (const view of entry.views) {
      view.closed(line);
      setTimeout(() => view.destroy(), CLOSED_CARD_MS);
    }
    if (S.task && S.task.status === 'waiting' && ![...S.prompts.values()].length) S.task.status = 'running';
    renderTask();
    // Voice Mode's channel holds one prompt at a time: one still open (rare) goes back to it.
    for (const other of S.prompts.values()) if (!other.handle) toVoiceOrNotice(other);
  }

  /** Every prompt still open here is over: its task ended, or the link reports another (REDTEAM-VOICE-8). */
  function closeAllPrompts() {
    for (const entry of [...S.prompts.values()]) closePromptEntry(entry, 'No longer open.');
  }

  // ---- this device's other windows (REDTEAM-VOICE-7) ------------------------------------------------

  /** Tell the other windows (the link's events this window heard, and whether Voice Mode is open here). */
  function share(message) {
    if (!chan || S.destroyed) return;
    quiet(() => chan.postMessage({ ...message, from: me }));
  }

  function onChannel(m) {
    if (!m || typeof m !== 'object' || m.from === me || S.destroyed) return;
    const from = String(m.from || '');
    switch (m.t) {
      case 'hello':
        S.peers.delete(from);
        share({ t: 'voice', on: !!v() });
        // A window opened while a prompt waits: it gets the prompts this one heard from the link.
        for (const entry of S.prompts.values()) if (entry.direct) share({ t: 'prompt', prompt: entry.prompt });
        break;
      case 'voice':
        S.peers.set(from, { voice: m.on === true, at: now() });
        // Voice Mode closed there: a prompt it would have said needs its notification here (the link's window).
        if (m.on !== true) for (const entry of S.prompts.values()) if (!entry.handle) toVoiceOrNotice(entry);
        break;
      case 'bye':
        S.peers.delete(from);
        for (const entry of S.prompts.values()) {
          // The window that passed a question on has closed: this one notifies for it when Voice Mode is open nowhere
          // (CHROME-VOICE-R2-6).
          if (!entry.direct && entry.from === from) entry.direct = true;
          if (!entry.handle) toVoiceOrNotice(entry);
        }
        break;
      case 'prompt':
        onPrompt(m.prompt, { relayed: true, from });
        break;
      case 'prompt-closed':
        onPromptClosed(m.promptId, { relayed: true });
        break;
      case 'done':
        onDone(m.done, { relayed: true });
        break;
      default:
        break;
    }
  }

  /** Voice Mode is open in another window of this device (it says Chrome's prompts and news there). */
  function voiceElsewhere() {
    const fresh = now() - PEER_FRESH_MS;
    for (const p of S.peers.values()) if (p.voice && p.at >= fresh) return true;
    return false;
  }

  // ---- what the router runs ---------------------------------------------------------------------

  /**
   * Run a router action of this feature. Returns { ack, show }: the line for the owner's words
   * (Voice Mode says `ack`; the chat shows `show`). Flows that go on (the check, a question) say their
   * own lines and return an empty ack.
   */
  function run(action, { surface = 'voice' } = {}) {
    const a = action && typeof action === 'object' ? action : {};
    switch (a.do) {
      case 'chrome-task': {
        startTaskFlow({ text: a.text, chat: a.chat });
        // Typed in a hologram's or Optics' field (over the chat): the line shows the price there too.
        const pend = S.pendingTask;
        const shown = surface === 'hologram' || surface === 'optics' ? (pend && !pend.done && !pend.cancelled ? pend.line : '') : '';
        return { ack: '', show: shown };
      }
      case 'chrome-ask':
        return ask(surface);
      case 'chrome-stop': {
        // "Stop Chrome": a task still in its check is withdrawn (nothing sent), and a task that runs stops:
        // "Stopping Chrome…", then "Chrome stopped." once Jarvis for Chrome confirms it.
        const out = stopWords({ via: surface === 'voice' ? 'voice' : 'card', say: true });
        const line = stopLine(out, { named: true });
        return { ack: line, show: line };
      }
      case 'chrome-check-typed': {
        // Typed (the chat, a hologram's or Optics' field) while a task's countdown runs or a prompt's card waits
        // (REDTEAM-VOICE-5, -14): the same words as by voice.
        if (a.how === 'go') {
          startNow();
          return { ack: '', show: '' };
        }
        if (a.how === 'keep') return { ack: '', show: '' }; // it counts on
        if (a.how === 'deny') return denyFromTyped();
        if (a.how === 'card') return { ack: CARD_ANSWERS_LINE, show: CARD_ANSWERS_LINE };
        const out = a.stop ? stopWords({ via: 'card', say: false }) : { withdrawn: cancelCheck('typed', { quietly: true }) };
        const line = stopLine(out, { named: !!a.stop });
        return { ack: line, show: line };
      }
      case 'chrome-status': {
        const open = [...S.prompts.values()].pop();
        const line = open ? waitingLine(open.prompt).say : taskStatusLine(S.task);
        return { ack: line, show: open ? waitingLine(open.prompt).show : line };
      }
      case 'chrome-nothing-asked': {
        // A yes naming Chrome with no prompt open where it was said: one may wait on its card in the chat.
        const line = S.prompts.size ? CARD_ANSWERS_LINE : NOTHING_ASKED_LINE;
        return { ack: line, show: line };
      }
      default:
        return null; // 'chrome-check' and the prompt's answers are Voice Mode's own (its prompt channel)
    }
  }

  /**
   * A stop word for Chrome ("stop Chrome", a bare "stop", a stop typed during a countdown): a check is
   * withdrawn (nothing sent) and a task that runs stops, both. Right after "Chrome is busy with another task.
   * Stop it first?", "stop it" (which the stop layer takes) is that question's yes: the running task stops
   * and, once confirmed, the checked one starts (REDTEAM-VOICE-2). say: "Chrome stopped." once confirmed.
   * -> { withdrawn, stopping, busyYes, none }
   */
  function stopWords({ via = 'voice', say = false } = {}) {
    const busy = S.busy;
    if (busy && !busy.taken && S.pendingTask === busy.pend && busy.pend.refused) {
      busy.taken = true;
      S.busy = null;
      if (busy.handle && typeof busy.handle.cancel === 'function') quiet(() => busy.handle.cancel());
      stopThenStart(busy.pend);
      return { withdrawn: false, stopping: true, busyYes: true, none: false };
    }
    const withdrawn = cancelCheck('stop', { quietly: true });
    const flying = inFlight();
    if (flying) {
      // Its start is on its way: the task it makes is stopped as soon as it has an id (ROUTING-11).
      stopInFlight(flying, { quietly: !say });
      return { withdrawn, stopping: true, busyYes: false, none: false };
    }
    const t = S.task;
    const stopping = !!(t && RUNNING.has(t.status));
    let confirmed = false;
    if (stopping) {
      // Quiet at first: the caller's line comes first. Confirmed at once (rare): that line says it stopped;
      // otherwise, when asked for, "Chrome stopped." follows once it is confirmed.
      stopTask({ via, quietly: true });
      if (t.stopping) {
        if (say) t.stopping.quietly = false;
      } else confirmed = !RUNNING.has(t.status);
    }
    return { withdrawn, stopping, busyYes: false, none: !withdrawn && !stopping, ...(confirmed ? { confirmed: true } : {}) };
  }

  /** What a stop word gets said back, from what it did. */
  function stopLine(out, { named = false } = {}) {
    if (!out || out.none) return NOTHING_TO_STOP_LINE;
    if (!out.stopping) return out.withdrawn ? TASK_CANCELLED_LINE : NOTHING_TO_STOP_LINE;
    const stopping = out.confirmed ? 'Chrome stopped.' : named ? TASK_STOPPING_LINE : 'Chrome is stopping.';
    return out.withdrawn ? `Okay, nothing sent. ${stopping}` : stopping;
  }

  /** "Deny", "cancel" or "no" typed while a prompt's card waits: the card's no, for its newest prompt. */
  function denyFromTyped() {
    const entry = [...S.prompts.values()].pop();
    const no = entry ? promptAnswers(entry.prompt).find((x) => x.id === 'deny' && x.choice) : null;
    if (!entry || !no) return { ack: NOTHING_ASKED_LINE, show: NOTHING_ASKED_LINE };
    send(entry, no, 'card');
    return { ack: DENIED_LINE, show: DENIED_LINE };
  }

  /** "Click around for me": "What should I do in Chrome?", and the answer is the task (checked). */
  function ask(surface) {
    const why = unreachable();
    if (why) {
      const r = taskRefusal(why);
      return { ack: r.say, show: r.show };
    }
    noteContext();
    const adapter = v();
    if (surface !== 'voice' || !adapter || typeof adapter.question !== 'function') {
      return { ack: TASK_ASK_LINE, show: 'What should I do in Chrome? Say or type it with “in Chrome”.' };
    }
    if (S.asking && S.asking.handle && typeof S.asking.handle.cancel === 'function') quiet(() => S.asking.handle.cancel());
    const asking = { handle: null };
    S.asking = asking;
    asking.handle = quiet(
      () =>
        adapter.question({
          id: 'chrome-ask',
          say: TASK_ASK_LINE,
          choices: [{ id: 'cancel', label: 'Never mind', words: ['never mind', 'nothing', 'cancel', 'no'] }],
          match: (text) => (isTaskAnswerCancel(text) ? 'cancel' : matchTaskAnswer(text) ? 'task' : null),
          onAnswer: (id, { words } = {}) => {
            if (S.asking === asking) S.asking = null;
            const task = id === 'task' ? matchTaskAnswer(words) : null;
            if (task) startTaskFlow({ text: task.text, chat: 'new' });
            else tell('Okay.');
          },
          onExpire: () => {
            if (S.asking === asking) S.asking = null;
          },
        }),
      null,
    );
    return asking.handle ? { ack: '', show: TASK_ASK_LINE } : { ack: TASK_ASK_LINE, show: TASK_ASK_LINE };
  }

  /** The router state's `chrome` (contract (b)): the link, the latest task (also a finished one), the context. */
  function state() {
    const st = linkState();
    const pend = S.pendingTask && !S.pendingTask.done && !S.pendingTask.cancelled && !S.pendingTask.refused ? S.pendingTask : null;
    // A task over reports done, stopped or failed (its stop layer and the router's words know those).
    const over = (s) => (s === 'limit' ? 'stopped' : s === 'error' || s === 'interrupted' ? 'failed' : s);
    const t = pend ? { id: S.task ? S.task.id : '', status: 'starting', text: pend.text } : S.task ? { id: S.task.id, status: over(S.task.status), text: S.task.text } : null;
    // lastTask: the latest task, finished too ("now add the second one too" carries on its chat).
    const last = S.task && S.task.id ? { id: S.task.id, status: over(S.task.status), text: S.task.text } : null;
    // checking: a task's countdown runs (typed words take it too: REDTEAM-VOICE-5); waiting: prompts on their cards.
    return { linked: !!st.linked, online: !!st.online, task: t, lastTask: last, contextUntil: S.contextUntil, checking: !!pend && !pend.sent, waiting: S.prompts.size };
  }

  /** Voice Mode opened, closed, slept or woke: cards and prompts follow it (and the other windows hear of it). */
  function voiceChanged() {
    const on = !!v();
    if (on !== S.voiceOn) share({ t: 'voice', on });
    if (!on) {
      dropVoiceViews();
      for (const entry of S.prompts.values()) {
        if (entry.handle && typeof entry.handle.close === 'function') quiet(() => entry.handle.close());
        entry.handle = null;
        toVoiceOrNotice(entry); // closed or asleep: a notification now
      }
      S.asking = null;
    } else {
      renderTask();
      for (const entry of S.prompts.values()) {
        renderPrompt(entry);
        toVoiceOrNotice(entry);
      }
      pumpSay();
    }
    S.voiceOn = on;
  }

  /**
   * The wake greeting's first words while a prompt waits ("Chrome is waiting for you: …"), or null
   * (mac-hf's wake.pending(), the lead's D3). Voice Mode's channel is told, so the greeting counts as the
   * prompt said and it isn't said twice.
   */
  function pending() {
    const open = [...S.prompts.values()].pop();
    if (!open) return null;
    // One line of at most 240 characters, as the wake routine says it (src/lib/wake/pending.js).
    const line = waitingLine(open.prompt).say.replace(/\s+/g, ' ').trim().slice(0, 240);
    const adapter = v();
    if (adapter && typeof adapter.greeted === 'function') quiet(() => adapter.greeted(`chrome:${open.prompt.promptId}`, line));
    return line;
  }

  attach();
  if (!attached && typeof linkDep === 'function') {
    // The link may be made after us (app.js): look for it until it is there.
    attachTimer = setInterval(() => {
      if (S.destroyed || attach()) clearInterval(attachTimer);
    }, 1000);
  }
  // This device's other Jarvis windows (REDTEAM-VOICE-7): the window holding the link passes on what it hears,
  // and each says whether Voice Mode is open there (again every 30 s while it is).
  let beatTimer = 0;
  chan = typeof channelDep === 'function' ? quiet(() => channelDep(), null) : channelDep;
  if (chan && typeof chan.postMessage === 'function') {
    const onMessage = (e) => onChannel(e && e.data);
    if (typeof chan.addEventListener === 'function') chan.addEventListener('message', onMessage);
    else chan.onmessage = onMessage;
    share({ t: 'hello' });
    beatTimer = setInterval(() => {
      if (S.voiceOn) share({ t: 'voice', on: true });
    }, PEER_BEAT_MS);
    if (beatTimer && typeof beatTimer.unref === 'function') beatTimer.unref(); // (Node: never holds a test open)
  } else chan = null;

  return {
    run,
    state,
    noteOpened: () => noteContext(),
    pending,
    voiceChanged,
    /** "Start now": the task's check ends at once. */
    startNow: () => startNow(),
    /**
     * A bare "stop" (voice's stop layer, which says its own line from what this did): a check is withdrawn
     * and a running task stopped, quietly (after a busy refusal: the busy question's yes). -> { withdrawn,
     * stopping, busyYes, none }
     */
    stopFromVoice: () => stopWords({ via: 'voice', say: false }),
    /** Whether a check for a task is on screen (the router's "check" state). */
    checking: () => !!(S.pendingTask && !S.pendingTask.done && !S.pendingTask.cancelled && !S.pendingTask.refused && !S.pendingTask.sent),
    /** This window is going away (pagehide): the other windows stop counting on its Voice Mode. */
    bye: () => share({ t: 'bye' }),
    destroy() {
      share({ t: 'bye' });
      S.destroyed = true;
      clearTimeout(S.sayTimer);
      clearInterval(attachTimer);
      clearInterval(beatTimer);
      if (chan && typeof chan.close === 'function') quiet(() => chan.close());
      chan = null;
      if (S.task && S.task.stopping) clearTimeout(S.task.stopping.timer);
      if (S.pendingTask) clearTimeout(S.pendingTask.timer);
      for (const off of offs) if (typeof off === 'function') quiet(off);
      for (const view of S.taskViews) view.destroy();
      for (const entry of S.prompts.values()) for (const view of entry.views) view.destroy();
      S.taskViews.clear();
      S.prompts.clear();
    },
  };
}
