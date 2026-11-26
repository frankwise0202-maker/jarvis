// Voice Mode's questions (v8.1 contract (a)), pure: no DOM, clocks injected. Voice Mode (voice-mode.js)
// wires them to api.question() and api.prompt(); the router (command-router.js) matches their answers.
//
//   createQuestionStack({ now, setTimer, clearTimer, onAsk }) -> stack
//     Owner-started questions stack: the newest is asked and answered first. When it is answered,
//     cancelled or expires, the one under it is asked again (onAsk(q, { again: true })). A covered
//     question's clock stops. keep: other words leave it open; otherwise they drop it. onExpire never
//     sends or spends anything; an answer is consumed (it never also goes to Claude).
//   createPromptChannel() -> channel
//     The standing channel (Jarvis for Chrome, Track 3 fills it): one prompt at a time, with its own
//     reserved answer words. Questions never expire it, and it never expires them.
//   matchQuestionAnswer(questions, text, readings) / matchPromptAnswer(prompt, text)
//     the router's 'answer' layer: the top question's choice, the prompt's answer, or null
//   answerWords(text) / sameWords(a, b)
//     whole sentences after fillers ("hey Jarvis, enclosed please" = "enclosed")
//   boundAction({ action, shown }, text)
//     the 2-second check's bound action when the words sent are unchanged, else null

const DEFAULT_TIMEOUT_MS = 60000;

/**
 * The 2-second check's send (v8.1 Phase 0 item 3): the action the check was bound to when the words
 * sent are the words it showed, else null (corrected words, "no, I said …" or an edit, are routed
 * again). `check`: { action, shown }.
 */
export function boundAction(check, text) {
  const c = check && typeof check === 'object' ? check : {};
  if (!c.action || typeof c.action !== 'object') return null;
  const sent = String(text ?? '').trim();
  return sent && sent === String(c.shown ?? '').trim() ? c.action : null;
}

/** Lower case, letters and digits, one space; without "hey Jarvis", "okay", "please", "thanks" around it. */
export function answerWords(text) {
  let s = String(text ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 4; i += 1) {
    const before = s;
    s = s
      .replace(/^(?:hey|ok|okay|so|um|uh|er|and|well|oh)\s+/, '')
      .replace(/^jarvis\s+/, '')
      .replace(/^please\s+/, '')
      .replace(/\s+(?:please|jarvis|thanks|thank you)$/, '')
      .trim();
    if (s === before) break;
  }
  return s;
}

/** True when two sentences are the same words after fillers. */
export function sameWords(a, b) {
  const x = answerWords(a);
  return !!x && x === answerWords(b);
}

/** The choice whose words are the whole sentence (after fillers), or null. */
function choiceByWords(choices, text) {
  for (const c of Array.isArray(choices) ? choices : []) {
    if (!c || typeof c.id !== 'string') continue;
    const words = Array.isArray(c.words) ? c.words : [];
    if (words.some((w) => sameWords(w, text))) return c.id;
  }
  return null;
}

/**
 * The router's question matcher: the top question (questions[0], the newest) answered by `text`:
 * { do: 'answer', question, choice, check } or null. The question's own match(text, readings) wins
 * over its choices' words.
 */
export function matchQuestionAnswer(questions, text, readings = [text]) {
  const q = Array.isArray(questions) ? questions[0] : null;
  if (!q || typeof q.id !== 'string') return null;
  let choice = null;
  if (typeof q.match === 'function') {
    try {
      choice = q.match(text, Array.isArray(readings) ? readings : [text]);
    } catch {
      choice = null;
    }
  } else {
    choice = choiceByWords(q.choices, text);
  }
  if (typeof choice !== 'string' || !choice) return null;
  return { do: 'answer', question: q.id, choice, check: !!q.check };
}

/**
 * The router's prompt matcher: the open prompt's answer whose words are the whole sentence:
 * { do: 'prompt-answer', prompt, answer, check, undo: false } or null. Never from another reading
 * (undo: false): a misheard approval must not approve anything.
 */
export function matchPromptAnswer(prompt, text) {
  if (!prompt || typeof prompt.id !== 'string') return null;
  for (const a of Array.isArray(prompt.answers) ? prompt.answers : []) {
    if (!a || typeof a.id !== 'string') continue;
    const words = Array.isArray(a.words) ? a.words : [];
    if (words.some((w) => sameWords(w, text))) return { do: 'prompt-answer', prompt: prompt.id, answer: a.id, check: !!a.check, undo: false };
  }
  return null;
}

/**
 * The owner questions (contract (a) api.question). `onAsk(q, { again })`: say q.say (a new question,
 * or the one under it once the newer one is done). Each question spec:
 *   { id, say, choices: [{ id, label, words }], match(text, readings) → choiceId | null, check = false,
 *     keep = false, timeoutMs = 60000, onAnswer(choiceId, { words, via }), onExpire(reason) }
 * onExpire's reason: 'timeout' | 'dropped' (other words, keep false) | 'replaced' (a new request or
 * Stop) | 'closed' (Voice Mode closed) | 'dismissed' (v8.1: a bare "cancel" or "no" said to it).
 */
export function createQuestionStack({ now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t), onAsk = () => {} } = {}) {
  const stack = []; // newest last
  let seq = 0;

  const call = (fn, ...args) => {
    try {
      if (typeof fn === 'function') fn(...args);
    } catch (err) {
      try {
        console.warn('[voice] a question callback failed', err);
      } catch {
        /* ignore */
      }
    }
  };

  function startClock(q) {
    stopClock(q);
    q.deadline = now() + q.remaining;
    q.timer = setTimer(() => {
      q.timer = 0;
      if (stack[stack.length - 1] !== q) return;
      remove(q);
      call(q.spec.onExpire, 'timeout');
      uncover();
    }, Math.max(0, q.remaining));
  }

  function stopClock(q) {
    if (q.timer) {
      clearTimer(q.timer);
      q.timer = 0;
      q.remaining = Math.max(0, q.deadline - now());
    }
  }

  function remove(q) {
    const i = stack.indexOf(q);
    if (i < 0) return false;
    stopClock(q);
    stack.splice(i, 1);
    return true;
  }

  /** The question now on top (if any) goes on: its clock runs again and it is asked again. */
  function uncover() {
    const q = stack[stack.length - 1];
    if (!q) return;
    startClock(q);
    call(onAsk, view(q), { again: true });
  }

  function view(q) {
    const s = q.spec;
    return Object.freeze({ id: s.id, say: s.say, choices: s.choices, match: s.match, keep: s.keep, check: s.check, key: q.key });
  }

  /** Ask a new question: it covers the one on top (whose clock stops). Returns { cancel(), answer(choiceId) }. */
  function push(spec) {
    const s = spec && typeof spec === 'object' ? spec : {};
    const timeoutMs = Number.isFinite(s.timeoutMs) && s.timeoutMs > 0 ? s.timeoutMs : DEFAULT_TIMEOUT_MS;
    const q = {
      key: ++seq,
      spec: { ...s, id: typeof s.id === 'string' && s.id ? s.id : `question-${seq}`, say: typeof s.say === 'string' ? s.say : '', choices: Array.isArray(s.choices) ? s.choices : [], keep: !!s.keep, check: !!s.check },
      remaining: timeoutMs,
      deadline: 0,
      timer: 0,
    };
    const covered = stack[stack.length - 1];
    if (covered) stopClock(covered);
    stack.push(q);
    startClock(q);
    call(onAsk, view(q), { again: false });
    return {
      /** Withdraw it (no callback). If it was on top, the one under it is asked again. */
      cancel() {
        const wasTop = stack[stack.length - 1] === q;
        if (!remove(q)) return false;
        if (wasTop) uncover();
        return true;
      },
      /** Answered by a tap on its own button (via 'tap'), on top or not: consumed like a spoken answer. */
      answer(choiceId, info = {}) {
        const wasTop = stack[stack.length - 1] === q;
        if (!remove(q)) return false;
        call(q.spec.onAnswer, choiceId, { words: typeof info.words === 'string' ? info.words : '', via: info.via === 'voice' ? 'voice' : 'tap' });
        if (wasTop) uncover();
        return true;
      },
    };
  }

  return {
    push,
    /** The question on top, or null. */
    top: () => (stack.length ? view(stack[stack.length - 1]) : null),
    /** Every open question, newest first (the router's state.questions). */
    list: () => stack.map(view).reverse(),
    size: () => stack.length,
    /** The top question `id` was answered: it is consumed, its onAnswer runs, the one under goes on. */
    answer(id, choiceId, info = {}) {
      const q = stack[stack.length - 1];
      if (!q || q.spec.id !== id) return false;
      remove(q);
      call(q.spec.onAnswer, choiceId, { words: typeof info.words === 'string' ? info.words : '', via: info.via === 'tap' ? 'tap' : 'voice' });
      uncover();
      return true;
    },
    /**
     * v8.1: a bare "cancel" or "no" said to the top question (it was asked last), and none of its
     * choices is that: it goes even if it keeps (onExpire(reason)), and the one under it goes on.
     */
    dismissTop(reason = 'dismissed') {
      const q = stack[stack.length - 1];
      if (!q) return false;
      remove(q);
      call(q.spec.onExpire, reason);
      uncover();
      return true;
    },
    /** Other words were heard: the top question goes unless it keeps (true when one went). */
    dropTop(reason = 'dropped') {
      const q = stack[stack.length - 1];
      if (!q || q.spec.keep) return false;
      remove(q);
      call(q.spec.onExpire, reason);
      uncover();
      return true;
    },
    /**
     * A new request, or Stop: every question that doesn't keep goes (no question is asked again now;
     * the one left on top gets its clock back). True when one went.
     */
    dropUnkept(reason = 'replaced') {
      const gone = stack.filter((q) => !q.spec.keep);
      if (!gone.length) return false;
      const topBefore = stack[stack.length - 1];
      for (const q of gone) remove(q);
      for (const q of gone) call(q.spec.onExpire, reason);
      const top = stack[stack.length - 1];
      if (top && top !== topBefore && !top.timer) startClock(top);
      return true;
    },
    /** Voice Mode closes: every question goes (onExpire('closed')). */
    clear(reason = 'closed') {
      const gone = stack.splice(0, stack.length);
      for (const q of gone) stopClock(q);
      for (const q of gone.reverse()) call(q.spec.onExpire, reason);
    },
    /** Milliseconds left on a question's clock (tests). */
    remaining(id) {
      const q = stack.find((x) => x.spec.id === id);
      if (!q) return 0;
      return q.timer ? Math.max(0, q.deadline - now()) : q.remaining;
    },
  };
}

/**
 * The standing prompt channel (contract (a) api.prompt, Jarvis for Chrome). One prompt at a time:
 * a new one closes the old one (its onClosed runs). It has no clock and never touches the questions.
 *   open({ id, say, answers: [{ id, words, check }], onAnswer(answerId, { words, via }), onClosed() })
 *     -> { update({ say, answers }), close() }
 */
export function createPromptChannel({ onSay = () => {} } = {}) {
  let cur = null; // { key, spec }
  let seq = 0;

  const call = (fn, ...args) => {
    try {
      if (typeof fn === 'function') fn(...args);
    } catch (err) {
      try {
        console.warn('[voice] a prompt callback failed', err);
      } catch {
        /* ignore */
      }
    }
  };

  function closeCurrent() {
    const p = cur;
    if (!p) return false;
    cur = null;
    call(p.spec.onClosed);
    return true;
  }

  function view(p) {
    return Object.freeze({ id: p.spec.id, say: p.spec.say, answers: p.spec.answers, key: p.key });
  }

  return {
    open(spec) {
      const s = spec && typeof spec === 'object' ? spec : {};
      closeCurrent();
      const p = { key: ++seq, spec: { ...s, id: typeof s.id === 'string' && s.id ? s.id : `prompt-${seq}`, say: typeof s.say === 'string' ? s.say : '', answers: Array.isArray(s.answers) ? s.answers : [] } };
      cur = p;
      call(onSay, view(p));
      return {
        update({ say, answers } = {}) {
          if (cur !== p) return false;
          if (typeof say === 'string') p.spec.say = say;
          if (Array.isArray(answers)) p.spec.answers = answers;
          return true;
        },
        close() {
          return cur === p ? closeCurrent() : false;
        },
      };
    },
    /** The open prompt ({ id, say, answers }) or null: the router's state.prompt. */
    current: () => (cur ? view(cur) : null),
    /** The open prompt `id` was answered: its onAnswer runs (the prompt stays until its owner closes it). */
    answer(id, answerId, info = {}) {
      if (!cur || cur.spec.id !== id) return false;
      call(cur.spec.onAnswer, answerId, { words: typeof info.words === 'string' ? info.words : '', via: info.via === 'tap' ? 'tap' : 'voice' });
      return true;
    },
    close: () => closeCurrent(),
  };
}
