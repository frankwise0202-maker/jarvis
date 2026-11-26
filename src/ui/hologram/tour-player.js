// The walkthrough player and its bar (SPEC §29). The player plays a tour plan (src/lib/tour.js) on a
// renderer target (contract (e), holo.tourTarget(): setEmphasis, flyTo, explode, focus, select,
// setLabels(true | false | [ids]), settled, holdAutoRotate), so any renderer can show a tour; it
// never touches the viewer's DOM. The bar is a separate element the viewer mounts.
//
//   const player = createTourPlayer({ plan, target, narrator, asker, holder, say, clock, onChange, onEnd })
//   await player.start()          after target.settled() (at most 10 s): the first step
//   player.next() / back() / repeat() / pause(reason) / resume() / toggle() / end(reason)
//   player.choose(choiceId) / jump(partId) / showView('enclosed' | 'opened') / setHidden(hidden)
//   player.getState()             { status, stepId, shown (the step whose look shows), index, total, say, ask, choices, … }
//
// Steps are spoken in runs: from a step up to the next decision or `wait` step, one step per line,
// in one narrate() call. A step's look is applied when its line starts to be heard (the voice's
// chunk event, else the voice's fallback and then an estimate: createLineSync), never when the
// speech is asked for (George's first words come 1-2 s later). A decision asks through the asker
// (Voice Mode's question, kept open while other words are routed) and the bar's buttons, and
// always waits. Pause cancels the speech and leaves the model where it is; Play says the step again
// from its first word. Without a narrator (no Voice Mode, or speech off) the words show in the bar
// and the tour moves on by estimate.
//
//   narrator: { narrate({ text, kind, onChunk({ start, end }), onEnd(reason), listenAfter }) -> { cancel(), voice? } }
//             voice: { kind: 'george' | 'device' | 'none', startEvents } (its pacing: voicePacing)
//   asker:    { ask({ id, say, choices, defaultId, onAnswer(choiceId, info), onExpire() }) -> { cancel() } }
//   holder:   { hold(), release() }   a woken session stays awake while the tour plays
//   say(line) a short line said or shown ("Say continue to go back to the tour.")

import { h, setText, clear } from '../dom.js';
import { icon } from '../icons.js';
import { createLineSync, isDecision, narrationText, nextStepId, partViewShow, runFrom, stepById, tourPath, viewWord, voicePacing } from '../../lib/tour.js';

const SETTLE_MS = 10000; // a live build's last meshes move the camera: wait for them, at most this long
const SILENT_STEP_MS = 1200; // a run of steps with nothing to say: time for the camera to move
const JUMP_LINE = 'Say continue to go back to the tour.';

const NOOP = () => {};
const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const DEFAULT_CLOCK = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) };

/**
 * Speech off, or no Voice Mode: each line "starts" by estimate (14.5 characters a second, at least
 * 2.6 s a line) and the run ends after the last one, so the bar's words move on by themselves.
 */
export function silentNarrator(clock = DEFAULT_CLOCK, { cps = 14.5, minLineMs = 2600, gapMs = 500 } = {}) {
  return {
    narrate({ text, onChunk = NOOP, onEnd = NOOP } = {}) {
      const lines = String(text || '').split('\n');
      const timers = [];
      let done = false;
      let at = 0;
      let t = 0;
      for (const line of lines) {
        const start = at;
        timers.push(clock.setTimeout(() => !done && onChunk({ start, end: start + line.length }), t));
        t += Math.max(minLineMs, (line.length / cps) * 1000) + gapMs;
        at += line.length + 1;
      }
      timers.push(
        clock.setTimeout(() => {
          if (done) return;
          done = true;
          onEnd('done');
        }, t),
      );
      return {
        voice: { kind: 'none' },
        cancel() {
          if (done) return;
          done = true;
          for (const x of timers) clock.clearTimeout(x);
        },
      };
    },
  };
}

/**
 * Play a normalized tour plan on a renderer target. See the file comment for the dependencies.
 * spec (optional): the hologram's spec, for "show it opened" on a plan without such a step.
 */
export function createTourPlayer({ plan, target, narrator = null, asker = null, holder = null, say = null, clock = null, rate = 1, spec = null, settleMs = SETTLE_MS, onChange = NOOP, onEnd = NOOP } = {}) {
  const c = clock || DEFAULT_CLOCK;
  const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
  const silent = silentNarrator(c);
  let voice = narrator;
  let ask = asker;
  let holdr = holder;
  let sayLine = say;

  let status = 'idle'; // idle | starting | playing | paused | choice | waiting | done | ended
  let pausedFor = null; // owner | touch | speech | hidden | jump
  let hiddenFrom = null; // what it was doing when the page was hidden
  let stepId = steps.length ? steps[0].id : null; // the step being said (or about to be)
  let shownId = null; // the step whose look was shown last (when its words began: B5)
  let history = []; // the steps visited, in order (back goes through it)
  const chosen = {}; // decision id -> choice id
  let look = {}; // what the hologram shows now (every step's show merged)
  const lookBefore = new Map(); // step id -> the look before it was entered (back and repeat restore it)
  let token = 0; // a newer run or question makes older callbacks stale
  let run = null; // { sync, handle, timer }
  let question = null;
  let holding = false;
  let before = null; // the renderer's labels and auto-rotate before the tour

  const changed = () => safe(() => onChange(getState()));
  const hold = () => {
    if (holding || !holdr) return;
    holding = true;
    safe(() => holdr.hold());
  };
  const release = () => {
    if (!holding) return;
    holding = false;
    if (holdr) safe(() => holdr.release());
  };

  function stopActivity() {
    token += 1;
    if (run) {
      if (run.sync) run.sync.cancel();
      if (run.timer) c.clearTimeout(run.timer);
      if (run.handle) safe(() => run.handle.cancel());
      run = null;
    }
    if (question) {
      const q = question;
      question = null;
      safe(() => q.cancel());
    }
  }

  // ---- the renderer ----------------------------------------------------------------------------

  const partsOf = (step) => (step && Array.isArray(step.parts) && step.parts.length ? step.parts : Array.isArray(look.glow) ? look.glow : []);

  /** Labels: none, every part's, or only the step's parts' (setLabels takes a list of ids for that). */
  function applyLabels(mode, ids) {
    safe(() => target.setLabels(mode === 'none' ? false : mode === 'parts' && ids.length ? ids.slice() : true));
  }

  function flyTo(ids, frame, camera) {
    const opts = { ids, frame: ids.length ? frame || 'parts' : 'all' };
    if (camera && typeof camera === 'object' && Array.isArray(camera.dir)) opts.dir = camera.dir;
    else if (typeof camera === 'string') opts.view = camera;
    const p = safe(() => target.flyTo(opts), null);
    if (p && typeof p.catch === 'function') p.catch(NOOP);
  }

  /** Enter a step: merge its show into the look and show it (all of it when replayed). */
  function enterStep(step, { replay = false } = {}) {
    if (!step) return;
    if (replay && lookBefore.has(step.id)) look = { ...lookBefore.get(step.id) };
    else lookBefore.set(step.id, { ...look });
    const show = step.show || {};
    look = { ...look, ...show };
    stepId = step.id;
    shownId = step.id;
    if (history[history.length - 1] !== step.id) history.push(step.id);
    const ids = partsOf(step);
    safe(() => target.setEmphasis({ glow: look.glow || [], ghost: look.ghost || [], hide: look.hide || [], others: look.others }));
    if ('explode' in show || (replay && 'explode' in look)) safe(() => target.explode(look.explode));
    if ('labels' in show || (replay && 'labels' in look)) applyLabels(look.labels, ids);
    if ('card' in show) safe(() => target.select(show.card ? ids[0] || null : null));
    if (show.frame || show.camera || (replay && (look.frame || look.camera))) flyTo(ids, look.frame, look.camera);
    if (show.photos && typeof target.photos === 'function') safe(() => target.photos(ids[0] || null));
    changed();
  }

  // ---- runs ------------------------------------------------------------------------------------

  /** Say the steps from `id` up to the next decision or wait step, showing each as it is heard. */
  function playFrom(id, { replay = false } = {}) {
    stopActivity();
    const first = stepById(plan, id);
    if (!first) return finish();
    const list = runFrom(plan, id);
    if (!list.length) return isDecision(first) ? askAt(first, { replay }) : finish();
    status = 'playing';
    pausedFor = null;
    stepId = first.id;
    hold();
    const my = token;
    // Steps without words are shown with the next step that has some (or when the run ends).
    const groups = [];
    let pending = [];
    for (const s of list) {
      if (s.say) {
        groups.push([...pending, s]);
        pending = [];
      } else pending.push(s);
    }
    const tail = pending;
    const { text, lines } = narrationText(list);
    let entered = 0;
    const enterGroup = (i) => {
      for (const s of groups[i]) enterStep(s, { replay: replay && entered++ === 0 });
    };
    run = { sync: null, handle: null, timer: 0, groups, tail, list };
    changed();
    if (!lines.length) {
      // Nothing to say (parts only): show them, then go on as if they were said.
      for (const s of tail) enterStep(s, { replay: replay && entered++ === 0 });
      run.timer = c.setTimeout(() => my === token && runEnded('done'), SILENT_STEP_MS);
      return;
    }
    const early = [];
    let sync = null;
    const speaker = voice || silent;
    const handle = safe(
      () =>
        speaker.narrate({
          text,
          kind: 'tour',
          listenAfter: listenAfterFor(list),
          onChunk: (chunk) => {
            if (my !== token) return;
            if (sync) sync.chunk(chunk);
            else early.push(chunk);
          },
          onEnd: (reason) => {
            if (my === token) c.setTimeout(() => my === token && runEnded(reason), 0);
          },
        }),
      null,
    );
    if (my !== token) return;
    if (!handle && speaker !== silent) {
      // The voice couldn't start: the words show in the bar and move on by estimate.
      voice = null;
      return playFrom(id, { replay });
    }
    run.handle = handle;
    const pacing = voicePacing(handle && handle.voice ? handle.voice : speaker === silent ? { kind: 'none' } : {}, rate);
    sync = createLineSync({ lines, clock: c, fallbackMs: pacing.fallbackMs, cps: pacing.cps, onLine: (i) => my === token && enterGroup(i) });
    run.sync = sync;
    sync.start();
    for (const chunk of early) sync.chunk(chunk);
  }

  /** Voice Mode listens after a run only where the owner is expected to speak: a wait step and the end (a decision asks itself). */
  function listenAfterFor(list) {
    const last = list[list.length - 1];
    if (isDecision(last)) return false;
    if (last.wait) return null;
    const after = nextStepId(plan, last.id);
    return after && isDecision(stepById(plan, after)) ? false : null;
  }

  function runEnded(reason) {
    const r = run;
    if (!r) return;
    if (reason === 'done' || reason === 'empty') {
      if (r.sync) r.sync.flush();
      for (const s of r.tail) enterStep(s);
      run = null;
      const last = r.list[r.list.length - 1];
      if (isDecision(last)) return askAt(last, { entered: true });
      if (last.wait) {
        status = 'waiting';
        changed();
        return;
      }
      const after = nextStepId(plan, last.id);
      const step = after ? stepById(plan, after) : null;
      if (!step) return finish();
      return isDecision(step) && !step.say ? askAt(step) : playFrom(step.id);
    }
    if (reason === 'failed' || reason === 'error' || reason === 'unsupported') {
      // Speech isn't working: the rest is shown in the bar, from the step that was being said.
      voice = null;
      return playFrom(stepId, { replay: true });
    }
    // Stopped by someone else (Stop, a tap on the microphone, "Hey Jarvis"): the tour pauses there.
    stopActivity();
    status = 'paused';
    pausedFor = 'speech';
    changed();
  }

  function askAt(step, { replay = false, entered = false } = {}) {
    stopActivity();
    if (!entered) enterStep(step, { replay });
    stepId = step.id;
    delete chosen[step.id];
    status = 'choice';
    pausedFor = null;
    hold();
    const my = token;
    if (ask) {
      question =
        safe(
          () =>
            ask.ask({
              id: `tour:${step.id}`,
              say: step.ask,
              choices: step.choices.map((ch) => ({ id: ch.id, label: ch.label, words: ch.words || [] })),
              defaultId: step.default,
              onAnswer: (choiceId, info) => {
                if (my !== token) return;
                question = null; // answered: nothing to cancel
                choose(choiceId, info);
              },
              onExpire: () => {
                if (my !== token) return;
                question = null; // the decision still waits: the bar's buttons and the words work
                changed();
              },
            }),
          null,
        ) || null;
    }
    changed();
  }

  function finish() {
    stopActivity();
    status = 'done';
    pausedFor = null;
    release();
    changed();
  }

  // ---- controls --------------------------------------------------------------------------------

  const current = () => stepById(plan, stepId);
  const live = () => status !== 'idle' && status !== 'ended';

  function choose(choiceId, info) {
    if (!live()) return false;
    const step = current();
    if (status !== 'choice' || !isDecision(step)) return choiceId === 'enclosed' || choiceId === 'opened' ? showView(choiceId) : false;
    const choice = step.choices.find((ch) => ch.id === choiceId);
    if (!choice) return false;
    chosen[step.id] = choice.id;
    playFrom(choice.goto);
    return true;
  }

  function next() {
    if (!live() || status === 'starting' || status === 'done') return false;
    const step = current();
    if (status === 'choice') return choose(step.default);
    const after = nextStepId(plan, stepId);
    const s = after ? stepById(plan, after) : null;
    if (!s) {
      finish();
      return true;
    }
    if (isDecision(s) && !s.say) askAt(s);
    else playFrom(s.id);
    return true;
  }

  function back() {
    if (!live() || status === 'starting') return false;
    // The current step is the top of the history; the one under it is where "back" goes.
    if (history[history.length - 1] !== stepId) history.push(stepId);
    if (history.length > 1) history.pop();
    const prev = history.pop() || (steps[0] && steps[0].id);
    const s = stepById(plan, prev);
    if (!s) return false;
    if (isDecision(s) && !s.say) askAt(s, { replay: true });
    else playFrom(s.id, { replay: true });
    return true;
  }

  function repeat() {
    if (!live() || status === 'starting') return false;
    const s = current();
    if (!s) return false;
    if (isDecision(s) && !s.say) askAt(s, { replay: true });
    else playFrom(s.id, { replay: true });
    return true;
  }

  function pause(reason = 'owner') {
    if (!live()) return false;
    if (status === 'choice') {
      if (reason !== 'hidden') return false; // a decision waits anyway
      hiddenFrom = 'choice';
      stopActivity();
    } else if (status === 'playing' || status === 'waiting' || status === 'starting') {
      if (status === 'waiting' && reason === 'touch') return false; // it waits for "next" already
      if (reason === 'hidden') hiddenFrom = status;
      stopActivity();
    } else if (status === 'paused') {
      if (reason === 'hidden' && !hiddenFrom) hiddenFrom = 'paused';
      if (reason === 'hidden') release();
      return false;
    } else return false;
    status = 'paused';
    pausedFor = reason;
    if (reason === 'hidden') release();
    changed();
    return true;
  }

  function resume() {
    if (!live()) return false;
    if (status === 'waiting') return next();
    if (status !== 'paused') return false;
    const from = hiddenFrom;
    hiddenFrom = null;
    const s = current();
    if (!s) return false;
    if (from === 'starting') return begin();
    if (from === 'waiting') {
      status = 'waiting';
      pausedFor = null;
      hold();
      changed();
      return true;
    }
    if (isDecision(s) && !s.say) askAt(s, { entered: true });
    else playFrom(s.id, { replay: true });
    return true;
  }

  function toggle() {
    if (status === 'playing' || status === 'starting') return pause('owner');
    if (status === 'paused' || status === 'waiting') return resume();
    if (status === 'done' && steps.length) {
      history = [];
      playFrom(steps[0].id, { replay: true });
      return true;
    }
    return false;
  }

  function end(reason = 'owner') {
    if (status === 'ended') return false;
    stopActivity();
    release();
    status = 'ended';
    pausedFor = null;
    // The hologram stays where it is; the tour's glow, see-through case and hidden covers go.
    safe(() => target.setEmphasis(null));
    if (before) {
      safe(() => target.setLabels(before.labels !== false));
      if (typeof target.holdAutoRotate === 'function') safe(() => target.holdAutoRotate(false));
    }
    changed();
    safe(() => onEnd(reason));
    return true;
  }

  /** "Skip to the fan": its step, or (no step for it) the camera on it, paused, and how to go back. */
  function jump(partId) {
    if (!live() || !partId) return false;
    const has = (s, first) => Array.isArray(s.parts) && (first ? s.parts[0] === partId : s.parts.includes(partId)) && !isDecision(s);
    const s = steps.find((x) => has(x, true)) || steps.find((x) => has(x, false));
    if (s) {
      playFrom(s.id);
      return true;
    }
    stopActivity();
    look = { ...look, glow: [partId] };
    safe(() => target.setEmphasis({ glow: [partId], ghost: look.ghost || [], hide: look.hide || [], others: look.others }));
    flyTo([partId], 'parts', null);
    status = 'paused';
    pausedFor = 'jump';
    if (typeof sayLine === 'function') safe(() => sayLine(JUMP_LINE));
    changed();
    return true;
  }

  /** "Show it enclosed" / "opened" away from a decision: that step when the plan has it, else the view of the part. */
  function showView(view) {
    if (!live() || (view !== 'enclosed' && view !== 'opened')) return false;
    const s = current();
    if (status === 'choice' && isDecision(s)) {
      const ch = s.choices.find((x) => x.id === view);
      return ch ? choose(ch.id) : false;
    }
    if (stepById(plan, view) && !isDecision(stepById(plan, view))) {
      playFrom(view);
      return true;
    }
    const partId = plan.for || partsOf(s)[0];
    const show = partId && spec ? partViewShow(spec, partId, view) : null;
    if (!show) return false;
    stopActivity();
    enterStep({ id: stepId, parts: [partId], show });
    status = 'paused';
    pausedFor = 'owner';
    changed();
    return true;
  }

  /** The page was hidden (the hologram stops drawing): pause and let go of the session; go on when shown. */
  function setHidden(hidden) {
    if (hidden) return pause('hidden');
    if (status === 'paused' && pausedFor === 'hidden') return resume();
    return false;
  }

  async function begin() {
    status = 'starting';
    pausedFor = null;
    changed();
    const my = token;
    if (typeof target.settled === 'function') {
      await Promise.race([
        Promise.resolve(safe(() => target.settled(settleMs), true)).catch(NOOP),
        new Promise((resolve) => c.setTimeout(resolve, settleMs)),
      ]);
    }
    if (my !== token || status !== 'starting') return false;
    history = [];
    playFrom(steps[0].id);
    return true;
  }

  /** Start the tour: once the meshes have landed (at most 10 s), from the first step. */
  function start() {
    if (status !== 'idle' || !steps.length) return Promise.resolve(false);
    const st = typeof target.getState === 'function' ? safe(() => target.getState(), null) : null;
    before = { labels: st ? st.labels !== false : true };
    if (typeof target.holdAutoRotate === 'function') safe(() => target.holdAutoRotate(true)); // no idle spin while it tours
    safe(() => target.select(null)); // a part card from before would cover the model
    return begin();
  }

  /**
   * Voice Mode opened or closed under the tour: its narrator, question and hold (null: none). The
   * next run uses them; an open decision is asked again through the new question.
   */
  function setVoice({ narrator: n = null, asker: a = null, holder: hd = null, say: sl = null } = {}) {
    const wasHolding = holding;
    release();
    voice = n;
    ask = a;
    holdr = hd;
    sayLine = sl;
    if (wasHolding) hold();
    if (status === 'choice') {
      const s = current();
      if (isDecision(s)) askAt(s, { entered: true });
    }
  }

  function getState() {
    const s = current();
    const path = tourPath(plan, chosen);
    const at = path.indexOf(stepId);
    const decision = status === 'choice' && isDecision(s);
    return {
      status,
      pausedFor,
      stepId,
      shown: shownId,
      index: at >= 0 ? at + 1 : Math.max(1, history.length),
      total: Math.max(path.length, at + 1),
      say: s && s.say ? s.say : '',
      ask: decision ? s.ask : '',
      choices: decision ? s.choices.map((ch) => ({ id: ch.id, label: ch.label, words: ch.words || [] })) : [],
      defaultId: decision ? s.default : null,
      waits: status === 'waiting',
      parts: partsOf(s),
      view: viewWord(look),
      title: (plan && plan.title) || '',
      partId: (plan && plan.for) || null,
      source: (plan && plan.source) || 'local',
      asking: !!question,
      holding, // a woken session is held for the tour (Voice Mode's api.hold('tour'))
    };
  }

  return { start, next, back, repeat, pause, resume, toggle, end, choose, jump, showView, setHidden, setVoice, getState, get plan() { return plan; } };
}

// ---- the bar -----------------------------------------------------------------------------------

/**
 * The tour bar: the step's words, "3 of 8", Back, Pause/Play, Next, End, and the choice buttons at a
 * decision. Its height never changes while a tour runs (an inset change refits the camera). On a
 * phone (compact) it keeps the count and the buttons; the viewer shows the words in its caption.
 *   const bar = createTourBar({ onBack, onToggle, onNext, onEnd, onChoose }); bar.render(player.getState())
 */
export function createTourBar({ onBack = NOOP, onToggle = NOOP, onNext = NOOP, onEnd = NOOP, onChoose = NOOP } = {}) {
  const btn = (name, label, testid, onClick, cls = '') =>
    h('button', { class: `hv__tour-btn ${cls}`.trim(), type: 'button', attrs: { 'aria-label': label, title: label, 'data-testid': testid }, on: { click: onClick } }, icon(name, { size: 18 }));
  const words = h('p', { class: 'hv__tour-words', attrs: { 'data-testid': 'tour-words', 'aria-live': 'polite' } });
  const count = h('span', { class: 'hv__tour-count', attrs: { 'data-testid': 'tour-count' } });
  const backBtn = btn('chevron-left', 'Back (←)', 'tour-back', () => onBack());
  const toggleBtn = btn('pause', 'Pause (Space)', 'tour-toggle', () => onToggle());
  const nextBtn = btn('chevron-right', 'Next (→)', 'tour-next', () => onNext());
  const endBtn = h('button', { class: 'hv__tour-end', type: 'button', text: 'End', attrs: { 'aria-label': 'End the walkthrough (Esc)', title: 'End the walkthrough (Esc)', 'data-testid': 'tour-end' }, on: { click: () => onEnd() } });
  const choices = h('div', { class: 'hv__tour-choices', attrs: { role: 'group', 'aria-label': 'Choose a view', 'data-testid': 'tour-choices' } });
  const steps = h('div', { class: 'hv__tour-steps' }, backBtn, toggleBtn, nextBtn);
  const el = h(
    'section',
    { class: 'hv__tour', attrs: { 'data-testid': 'tour-bar', 'aria-label': 'Walkthrough', 'data-status': 'starting' } },
    words,
    h('div', { class: 'hv__tour-row' }, count, steps, choices, endBtn),
  );
  let choiceKey = '';
  let toggleIcon = 'pause';

  function render(state) {
    if (!state) return;
    const decision = state.status === 'choice' && state.choices.length > 0;
    el.dataset.status = state.status;
    el.dataset.step = state.stepId || '';
    el.dataset.decision = decision ? 'true' : 'false';
    const text = decision ? state.ask : state.status === 'starting' ? 'Getting the walkthrough ready…' : state.say;
    if (words.textContent !== text) setText(words, text || '');
    setText(count, state.total ? `${state.index} of ${state.total}` : '');
    const playing = state.status === 'playing' || state.status === 'starting';
    const want = playing ? 'pause' : 'play';
    if (want !== toggleIcon) {
      toggleIcon = want;
      clear(toggleBtn).appendChild(icon(want, { size: 18 }));
    }
    const label = playing ? 'Pause (Space)' : state.status === 'done' ? 'Play it again (Space)' : 'Play (Space)';
    toggleBtn.setAttribute('aria-label', label);
    toggleBtn.title = label;
    backBtn.disabled = state.index <= 1 && state.status !== 'done';
    nextBtn.disabled = state.status === 'done' || state.status === 'starting';
    toggleBtn.disabled = state.status === 'choice';
    const key = decision ? state.choices.map((ch) => `${ch.id}:${ch.label}`).join('|') : '';
    if (key !== choiceKey) {
      choiceKey = key;
      clear(choices);
      for (const ch of decision ? state.choices : []) {
        choices.append(
          h('button', {
            class: ['hv__tour-choice', ch.id === state.defaultId && 'is-default'],
            type: 'button',
            text: ch.label,
            attrs: { 'data-testid': 'tour-choice', 'data-choice': ch.id },
            on: { click: () => onChoose(ch.id) },
          }),
        );
      }
    }
  }

  return { el, render, destroy: () => el.remove() };
}
