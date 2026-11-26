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
import '../styles/chrome-task.css';
import {
  CHROME_CONTEXT_MS,
  DEFAULT_TASK_LIMIT_USD,
  NOTHING_TO_STOP_LINE,
  TASK_ASK_LINE,
  TASK_CHECK_MS,
  TASK_CANCELLED_LINE,
  TASK_STARTED_LINE,
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

// ---------------------------------------------------------------------------------- the views

const STATUS_WORDS = {
  checking: 'Starting',
  starting: 'Starting…',
  running: 'Working',
  waiting: 'Waiting for you',
  paused: 'Paused: you took over',
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
 * The controller. deps:
 *   link        app.chromeLink (contract (f)), or a function giving it (null until it exists: everything
 *               says "not linked"). Its listeners are attached as soon as it is there.
 *   voice()     the Voice Mode adapter while Voice Mode is open and awake (not on Standby), else null
 *   dock        an element in the chat for the cards (optional)
 *   notify({ tag, title, body, onClick }), closeNotice(tag)   system notifications (attention.js)
 *   focusApp()  brings Jarvis forward (a notification's click)
 *   toast(text, { level })    a line in the chat when Voice Mode isn't there to say it
 *   hidden()    Jarvis isn't on screen (the checks wait 5 s instead of 2)
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
    now = () => Date.now(),
  } = deps;

  const S = {
    contextUntil: 0, // a Chrome context lasts until then (CHROME_CONTEXT_MS after the last Chrome action)
    task: null, // the latest task: { id, status, text, narration, lastStep, costUsd, limitUsd, answer, baseUsd }
    pendingTask: null, // the check before a start: { text, chat, check, cancelled }
    asking: null, // "What should I do in Chrome?" waiting: { handle }
    taskViews: new Set(), // the task card's views (chat and Voice Mode)
    prompts: new Map(), // promptId -> { prompt, hash, views: Set, handle, notified, answering, closing }
    baseUsd: DEFAULT_TASK_LIMIT_USD, // a task's budget as the extension last said it
    sayQueue: [], // lines waiting for Voice Mode to be free: { line, until }
    sayTimer: 0,
    voiceOn: false, // the adapter was there last time we looked
    destroyed: false,
  };
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
      return { phase: pend.cancelled ? 'cancelled' : pend.refused ? 'refused' : 'checking', text: pend.text, line: pend.line, checkMs: pend.ms, countAt: pend.countAt };
    }
    const t = S.task;
    if (!t) return null;
    const status = t.status === 'error' || t.status === 'interrupted' ? 'failed' : t.status;
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
    const line = taskCheckLine({ text: words, limitUsd: S.baseUsd });
    const pend = { text: words, chat: chat === 'same' ? 'same' : 'new', line, ms: 0, countAt: 0, check: null, timer: 0, cancelled: false, refused: false, done: false };
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
          }),
        null,
      );
      if (pend.check) return;
    }
    // Typed (no Voice Mode): the card shows the price and counts 2 s; Cancel withdraws it.
    pend.ms = TASK_CHECK_MS;
    pend.countAt = now();
    renderTask();
    pend.timer = setTimeout(() => goTask(pend), pend.ms);
  }

  /** "Start now" on the card: the check ends at once and the task goes. */
  function startNow() {
    const pend = S.pendingTask;
    if (!pend || pend.done || pend.cancelled || pend.refused) return;
    if (pend.check && typeof pend.check.go === 'function' && quiet(() => pend.check.go(), false)) return;
    goTask(pend);
  }

  /**
   * The check withdrawn: "cancel" (Voice Mode says why itself), the card's Cancel, a correction or other
   * words (routed again), a new task, Voice Mode closing. Nothing is sent.
   */
  function cancelCheck(how, { quietly = false, fromCheck = false } = {}) {
    const pend = S.pendingTask;
    if (!pend || pend.done || pend.cancelled) return false;
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
    let res = null;
    try {
      res = await L().startTask({ text: pend.text, chat: pend.chat });
    } catch {
      res = { ok: false, reason: 'offline' };
    }
    if (S.pendingTask !== pend || S.destroyed) return;
    if (!res || !res.ok) {
      refuse(pend, (res && res.reason) || 'offline', res && res.why);
      return;
    }
    pend.done = true;
    S.pendingTask = null;
    S.task = { id: String(res.id || ''), status: 'starting', text: pend.text, narration: '', lastStep: '', costUsd: 0, limitUsd: S.baseUsd, answer: '', stoppedByOwner: false };
    noteContext();
    syncFromLink();
    renderTask();
    tell(TASK_STARTED_LINE);
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

  /** After a stop: wait (up to 3 s) for the extension to end the task, so a new one isn't "busy". */
  function stopped(t, ms = 3000) {
    const until = now() + ms;
    return new Promise((resolve) => {
      const look = () => {
        if (!t || S.task !== t || FINAL.has(t.status) || now() >= until || S.destroyed) resolve();
        else setTimeout(look, 100);
      };
      look();
    });
  }

  /** "Chrome is busy with another task. Stop it first?": yes stops it and starts this one. */
  function askStopFirst(pend) {
    const adapter = v();
    const r = taskRefusal('busy');
    const handle = quiet(
      () =>
        adapter.question({
          id: 'chrome-busy',
          say: r.say,
          choices: [
            { id: 'yes', label: 'Stop it', words: ['yes', 'yes stop it', 'stop it', 'yes please'] },
            { id: 'no', label: 'Leave it', words: ['no', 'leave it', 'no thanks', 'never mind', 'cancel'] },
          ],
          onAnswer: async (id) => {
            if (id !== 'yes') {
              tell('Okay, I’ll leave it.');
              return;
            }
            const running = S.task;
            await stopTask({ via: 'voice', quietly: true });
            await stopped(running);
            if (S.pendingTask !== pend) return;
            pend.refused = false;
            renderTask();
            goTask(pend);
          },
          onExpire: () => {},
        }),
      null,
    );
    if (!handle) tell(r.say, r.show, { level: 'warn' });
  }

  async function stopTask({ via = 'voice', quietly = false } = {}) {
    const t = S.task;
    if (!t || !RUNNING.has(t.status)) {
      if (!quietly && via !== 'card') tell(NOTHING_TO_STOP_LINE);
      return false;
    }
    t.stoppedByOwner = true;
    try {
      await L().stopTask();
    } catch {
      /* the extension pauses a voice task by itself once the relay is gone for 20 s */
    }
    if (S.task === t && RUNNING.has(t.status)) {
      t.status = 'stopped';
      renderTask();
    }
    if (!quietly) tell('Chrome stopped.');
    return true;
  }

  // ---- the link's events ------------------------------------------------------------------------

  /** The link's state changed: the task's status, its latest step and its cost. */
  function syncFromLink() {
    const st = linkState();
    const lt = st.task && typeof st.task === 'object' ? st.task : null;
    if (lt && lt.id) {
      if (!S.task || S.task.id !== lt.id) {
        if (S.task && S.task.id && RUNNING.has(S.task.status)) S.task.status = 'stopped';
        S.task = { id: String(lt.id), status: 'running', text: '', narration: '', lastStep: '', costUsd: 0, limitUsd: S.baseUsd, answer: '', stoppedByOwner: false };
      }
      const t = S.task;
      if (typeof lt.status === 'string' && !FINAL.has(t.status)) t.status = lt.status;
      if (typeof lt.text === 'string' && lt.text) t.text = lt.text;
      if (typeof lt.narration === 'string') t.narration = lt.narration;
      if (typeof lt.lastStep === 'string') t.lastStep = lt.lastStep;
      if (Number.isFinite(Number(lt.costUsd))) t.costUsd = Number(lt.costUsd);
      if (Number(lt.limitUsd) > 0) {
        t.limitUsd = Number(lt.limitUsd);
        if (!t.baseSeen) {
          t.baseSeen = true;
          S.baseUsd = t.limitUsd; // the first limit of a task is its budget
        }
      }
      noteContext();
    }
    renderTask();
  }

  function onDone(d) {
    const done = d && typeof d === 'object' ? d : {};
    let t = S.task;
    if (!t || (done.id && t.id && String(done.id) !== t.id)) {
      t = { id: String(done.id || ''), status: 'done', text: '', narration: '', lastStep: '', costUsd: 0, limitUsd: S.baseUsd, answer: '' };
      S.task = t;
    }
    const status = ['done', 'stopped', 'failed', 'limit'].includes(done.status) ? done.status : 'failed';
    const owner = t.stoppedByOwner && status === 'stopped';
    t.status = status;
    t.answer = String(done.answer || '').slice(0, 2000);
    if (Number.isFinite(Number(done.costUsd))) t.costUsd = Number(done.costUsd);
    noteContext();
    renderTask();
    if (owner) return; // "Chrome stopped." was said when the owner stopped it
    const line = taskDoneLine({ status, answer: t.answer });
    // Jarvis says the final answer; with Voice Mode closed, the card shows it (and a notification
    // tells the owner while Jarvis is hidden).
    if (!v() && quiet(() => hidden(), false) && typeof notify === 'function') {
      quiet(() => notify({ tag: 'chrome-task', title: 'Chrome', body: sayable(line.show, 180), onClick: () => focusApp && focusApp() }));
      return;
    }
    tell(line.say, line.show, { level: status === 'done' ? 'success' : 'info' });
  }

  // ---- prompts (G5) -----------------------------------------------------------------------------

  function onPrompt(raw) {
    if (!raw || typeof raw !== 'object' || !raw.promptId) return;
    const prompt = { ...raw, promptId: String(raw.promptId) };
    let entry = S.prompts.get(prompt.promptId);
    if (!entry) {
      entry = { prompt, hash: prompt.hash, views: new Set(), handle: null, notified: false, answering: false, closing: 0, shownAt: now() };
      S.prompts.set(prompt.promptId, entry);
    } else {
      entry.prompt = prompt;
      entry.hash = prompt.hash; // a changed prompt is said again before a yes counts (update)
      entry.shownAt = now();
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
    return promptAnswers(entry.prompt).map((a) => {
      if (!a.check) return a;
      const lines = approvingLine(entry.prompt, a, { task: S.task, baseUsd: S.baseUsd });
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
        closeNoticeOf(entry);
        return;
      }
    }
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
      await stopTask({ via: 'voice' });
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
    // Refused (the policy, a changed prompt, too soon) or not delivered: the prompt stays open.
    const why = (res && (res.why || res.reason)) || '';
    const line = refusedLine(why === 'offline' ? 'Chrome couldn’t be reached' : why);
    for (const view of entry.views) view.status(line);
    if (via === 'voice' || v()) tell(line, line, { level: 'warn' });
  }

  function onPromptClosed(id) {
    const entry = S.prompts.get(String(id && typeof id === 'object' ? id.promptId : id));
    if (!entry) return;
    S.prompts.delete(entry.prompt.promptId);
    if (entry.handle && typeof entry.handle.close === 'function') quiet(() => entry.handle.close());
    entry.handle = null;
    closeNoticeOf(entry);
    for (const view of entry.views) {
      view.closed('Answered.');
      setTimeout(() => view.destroy(), CLOSED_CARD_MS);
    }
    if (S.task && S.task.status === 'waiting' && ![...S.prompts.values()].length) S.task.status = 'running';
    renderTask();
    // Voice Mode's channel holds one prompt at a time: one still open (rare) goes back to it.
    for (const other of S.prompts.values()) if (!other.handle) toVoiceOrNotice(other);
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
      case 'chrome-task':
        startTaskFlow({ text: a.text, chat: a.chat });
        return { ack: '', show: '' };
      case 'chrome-ask':
        return ask(surface);
      case 'chrome-stop': {
        // A task still in its check: withdrawn, nothing sent.
        if (cancelCheck('stop', { quietly: true })) return { ack: TASK_CANCELLED_LINE, show: TASK_CANCELLED_LINE };
        const t = S.task;
        if (!t || !RUNNING.has(t.status)) return { ack: NOTHING_TO_STOP_LINE, show: NOTHING_TO_STOP_LINE };
        stopTask({ via: surface === 'voice' ? 'voice' : 'card', quietly: true });
        return { ack: 'Chrome stopped.', show: 'Chrome stopped.' };
      }
      case 'chrome-status': {
        const open = [...S.prompts.values()].pop();
        const line = open ? waitingLine(open.prompt).say : taskStatusLine(S.task);
        return { ack: line, show: open ? waitingLine(open.prompt).show : line };
      }
      case 'chrome-answer':
        // Typed in the chat (Voice Mode answers its own through its prompt channel).
        return typedAnswer(a.answer);
      case 'chrome-nothing-asked':
        return { ack: NOTHING_ASKED_LINE, show: NOTHING_ASKED_LINE };
      default:
        return null; // 'chrome-check' is Voice Mode's alone
    }
  }

  /**
   * A reserved answer typed in the chat (or a hologram's or Optics' field): a no goes out at once (as
   * the card's would); a yes is the card's button (typing isn't the check); click-only says where.
   */
  function typedAnswer(answerId) {
    const entry = [...S.prompts.values()].pop();
    if (!entry) return { ack: NOTHING_ASKED_LINE, show: NOTHING_ASKED_LINE };
    const answer = promptAnswers(entry.prompt).find((x) => x.id === answerId);
    if (!answer) return null;
    if (answer.stopTask) {
      stopTask({ via: 'card', quietly: true });
      return { ack: 'Chrome stopped.', show: 'Chrome stopped.' };
    }
    if (answer.negative) {
      if (!answer.choice) return null;
      send(entry, answer, 'card');
      return { ack: '', show: '' };
    }
    if (answer.clickOnly) {
      const line = clickOnlyLine(entry.prompt);
      return { ack: line.say, show: line.show };
    }
    if (answer.id === 'other') return { ack: hintLine(entry.prompt), show: hintLine(entry.prompt) };
    return { ack: 'Tap its button on the card to answer Chrome.', show: 'Tap its button on the card to answer Chrome.' };
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
    const t = pend ? { id: S.task ? S.task.id : '', status: 'starting', text: pend.text } : S.task ? { id: S.task.id, status: S.task.status, text: S.task.text } : null;
    // lastTask: the latest task, finished too ("now add the second one too" carries on its chat).
    const last = S.task && S.task.id ? { id: S.task.id, status: S.task.status, text: S.task.text } : null;
    return { linked: !!st.linked, online: !!st.online, task: t, lastTask: last, contextUntil: S.contextUntil };
  }

  /**
   * The open prompt as the router's answer layer sees it where Voice Mode isn't (state.prompt: the chat,
   * a hologram's or Optics' field), or null: { id, chrome, answers, askedAt, kind, voice }.
   */
  function promptState() {
    const entry = [...S.prompts.values()].pop();
    if (!entry) return null;
    return {
      id: `chrome:${entry.prompt.promptId}`,
      chrome: true,
      answers: promptAnswers(entry.prompt),
      askedAt: entry.shownAt || 0,
      kind: promptKind(entry.prompt),
      voice: { allowed: takesVoiceYes(entry.prompt) },
    };
  }

  /** Voice Mode opened, closed, slept or woke: cards and prompts follow it. */
  function voiceChanged() {
    const on = !!v();
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

  return {
    run,
    state,
    promptState,
    noteOpened: () => noteContext(),
    pending,
    voiceChanged,
    /** "Start now": the task's check ends at once. */
    startNow: () => startNow(),
    /** Whether a check for a task is on screen (the router's "check" state). */
    checking: () => !!(S.pendingTask && !S.pendingTask.done && !S.pendingTask.cancelled && !S.pendingTask.refused),
    destroy() {
      S.destroyed = true;
      clearTimeout(S.sayTimer);
      clearInterval(attachTimer);
      if (S.pendingTask) clearTimeout(S.pendingTask.timer);
      for (const off of offs) if (typeof off === 'function') quiet(off);
      for (const view of S.taskViews) view.destroy();
      for (const entry of S.prompts.values()) for (const view of entry.views) view.destroy();
      S.taskViews.clear();
      S.prompts.clear();
    },
  };
}
