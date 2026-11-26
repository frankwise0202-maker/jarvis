// Jarvis for Chrome's questions by voice (v8.1, the app side of G5): which of the owner's words answer
// a prompt from the extension, when such an answer counts, and what Jarvis says about it. Pure: no
// DOM, no clock of its own.
//
// The rules (brief G5, critique H4, M4, M8):
//   - The answers are reserved words, each a whole sentence once fillers are off: "approve", "approve
//     it", "yes, approve" (only when the prompt's voice.allowed); "allow once" (only when allowed);
//     "deny", "cancel Chrome", "stop Chrome"; "spend more in Chrome" (the budget); "more steps in
//     Chrome" (the step limit). No other feature uses them. A bare "yes", "okay", "sure", "go ahead"
//     or "continue" never answers a prompt. A bare "cancel" or "no" answers it only when it was asked
//     last (the router's answer layer decides that: isBareNo()).
//   - A yes (approve, allow once, spend more, more steps) counts only from the best reading, only
//     within 30 s after the prompt was said in full, and only when no other reading of the same words
//     is a no, cancel or stop word: otherwise Jarvis asks again. Then the check "Approving: … · say
//     cancel" (2 s, 5 s while hidden), which "cancel", "no" or "stop" withdraws. A no acts at once.
//   - What is said comes from the extension's own `spoken` line (made safe by sayable()), never from
//     page text Jarvis picks; "Jarvis for Chrome" is never said (his own name sets off his barge-in).
//   - The extension decides again when the answer comes (its voice policy, the prompt's hash, its age):
//     the app only mirrors voice.allowed so it doesn't offer what will be refused.
//
//   matchChromeAnswer(text, state)    -> the router's answer layer ('chrome-prompt'): a check's words, a
//                                        prompt's reserved words, a bare no asked last, or null
//   matchNothingAsked(text, state)    -> 'chrome-answer': a yes naming Chrome with nothing asked
//   promptAnswers(prompt)             -> the answers for api.prompt(): [{ id, choice, words, check, … }]
//   chooseAnswer({ readings, answers, saidAt, now }) -> null | { answer, check } | { answer, again }
//   promptLine(prompt)                -> { say, show }: "Chrome asks: …? Say approve, or cancel."
//   approvingLine(prompt, answer, task) -> { say, show }: "Approving: … · say cancel"

import { dollarsSaid, dollarsShown, matchChromeStop, sayable } from './chrome-task-words.js';

/** An answer counts this long after the prompt was said in full. */
export const ANSWER_WINDOW_MS = 30000;
/** The check after a yes: "Approving: … · say cancel" (5 s while Jarvis is hidden). */
export const APPROVE_CHECK_MS = 2000;
export const APPROVE_CHECK_HIDDEN_MS = 5000;
/** A Continue at the budget adds this much when the task's own budget isn't known (extension limits.js). */
const DEFAULT_BUDGET_USD = 1;

// The reserved answers, by what they do.
export const RESERVED_ANSWERS = Object.freeze({
  approve: Object.freeze(['approve', 'approve it', 'approve that', 'yes approve', 'yes approve it', 'yes approve that', 'i approve']),
  once: Object.freeze(['allow once', 'allow it once', 'allow that once', 'yes allow once', 'allow once in chrome']),
  deny: Object.freeze(['deny', 'deny it', 'deny that', 'deny in chrome', 'cancel chrome', 'cancel in chrome', 'cancel it in chrome', 'cancel that in chrome']),
  stop: Object.freeze(['stop chrome', 'stop it in chrome', 'stop the chrome task', 'chrome stop']),
  budget: Object.freeze(['spend more in chrome', 'yes spend more in chrome', 'spend more money in chrome']),
  steps: Object.freeze(['more steps in chrome', 'yes more steps in chrome', 'take more steps in chrome']),
});
/** Every reserved sentence (the router's corpus and collision rows use these). */
export const RESERVED_WORDS = Object.freeze([...new Set(Object.values(RESERVED_ANSWERS).flat())]);
/** Never an answer to a prompt, said alone. */
export const NEVER_ANSWERS = Object.freeze(['yes', 'yeah', 'yep', 'yup', 'okay', 'ok', 'sure', 'go ahead', 'continue', 'go on', 'do it', 'fine', 'alright', 'all right', 'proceed', 'yes please', 'please do', 'carry on', 'keep going', 'go']);

const LEAD = /^(?:(?:hey|ok|okay|hi) jarvis|jarvis|please|um+|uh+|er+|erm|hmm+|well|so|oh|okay|ok)\s+/;
const TAIL = /\s+(?:please|thanks|thank you|jarvis|now|right now)$/;

/** The words as the answers are compared: lower case, punctuation off, fillers off both ends. */
export function normalizeAnswer(text) {
  let s = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/(\w)'(\w)/g, '$1$2')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 6; i++) {
    const next = s.replace(LEAD, '').replace(TAIL, '').trim();
    if (next === s) break;
    s = next;
  }
  return s;
}

/** Which reserved answer the words are ('approve', 'once', 'deny', 'stop', 'budget', 'steps'), or null. */
export function reservedKind(text) {
  const s = normalizeAnswer(text);
  if (!s) return null;
  for (const [kind, words] of Object.entries(RESERVED_ANSWERS)) if (words.includes(s)) return kind;
  return null;
}

/**
 * A reserved answer that names Chrome ("cancel Chrome", "spend more in Chrome"): Chrome's even when it
 * isn't asking anything ("Chrome isn't asking anything right now."), so it never reaches Claude.
 */
export function namesChromeAnswer(text) {
  return !!reservedKind(text) && /(?:^|\s)chrome(?:\s|$)/.test(normalizeAnswer(text));
}

export const NOTHING_ASKED_LINE = 'Chrome isn’t asking anything right now.';

/** A bare "cancel" or "no": it answers the prompt only when the prompt was asked last. */
export function isBareNo(text) {
  return /^(?:no|nope|nah|cancel|cancel it|cancel that|no thanks|no thank you|never ?mind|dont|do not|dont do it|do not do it|not now)$/.test(normalizeAnswer(text));
}

/**
 * A no, cancel or stop word anywhere in a reading (another reading of a yes that may be a no; or what
 * withdraws the check).
 */
export function isNoWord(text) {
  const s = normalizeAnswer(text);
  if (!s) return false;
  return /^(?:no|nope|nah|not|negative|wait|hold on|hold it|never ?mind)(?:\s|$)/.test(s) || /(?:^|\s)(?:cancel|cancelled|deny|denied|stop|dont|do not|abort)(?:\s|$)/.test(s);
}

// ------------------------------------------------------------------------------- the answers

const LABELS = {
  approve: /^approve$/i,
  once: /^allow once$/i,
  continue: /^continue$/i,
  cancel: /^cancel$/i,
  deny: /^deny$/i,
  stop: /^stop$/i,
};
/** The prompt's choice with this id (or, failing that, this label), or null. Never "Always". */
function choiceOf(prompt, ...ids) {
  const choices = Array.isArray(prompt && prompt.choices) ? prompt.choices.filter((c) => c && typeof c.id === 'string') : [];
  for (const id of ids) {
    const hit = choices.find((c) => c.id === id) || choices.find((c) => LABELS[id] && LABELS[id].test(String(c.label || '').trim()));
    if (hit && hit.id !== 'always') return hit.id;
  }
  return null;
}

/** The prompt's kind as the extension names it: 'site' | 'confirm' | 'budget' | 'steps'. */
export function promptKind(prompt) {
  const k = prompt && typeof prompt.kind === 'string' ? prompt.kind : '';
  return ['site', 'confirm', 'budget', 'steps'].includes(k) ? k : 'confirm';
}

/** Whether the extension lets this prompt be answered yes by voice (or on Jarvis's card). */
export function voiceAllowed(prompt) {
  return !!(prompt && prompt.voice && typeof prompt.voice === 'object' && prompt.voice.allowed === true);
}

/** The yes this prompt can take by voice: { id, choice, words } or null (a click-only prompt). */
function yesFor(prompt) {
  const kind = promptKind(prompt);
  if (kind === 'site') {
    const choice = choiceOf(prompt, 'once');
    return choice ? { id: 'once', choice, words: RESERVED_ANSWERS.once } : null;
  }
  if (kind === 'budget' || kind === 'steps') {
    const choice = choiceOf(prompt, 'continue');
    return choice ? { id: kind, choice, words: RESERVED_ANSWERS[kind] } : null;
  }
  const choice = choiceOf(prompt, 'approve');
  return choice ? { id: 'approve', choice, words: RESERVED_ANSWERS.approve } : null;
}

/** The no this prompt takes (by voice, at once): its Cancel, Deny or Stop choice id, or null. */
export function noChoice(prompt) {
  const kind = promptKind(prompt);
  if (kind === 'site') return choiceOf(prompt, 'deny', 'cancel', 'stop');
  if (kind === 'budget' || kind === 'steps') return choiceOf(prompt, 'stop', 'cancel', 'deny');
  return choiceOf(prompt, 'cancel', 'deny', 'stop');
}

/**
 * The answers for api.prompt() (contract (a)): { id, words, check } plus what the Chrome side needs:
 *   choice     the extension's choice id to send (null: nothing is sent)
 *   negative   a no (a bare "cancel" or "no" asked last means this one)
 *   stopTask   "stop Chrome": stops the task (which closes the prompt)
 *   clickOnly  a yes this prompt can't take by voice: Jarvis says it needs a click
 *   hint       a yes word of another kind ("allow once" to a step): Jarvis says what to say
 * Every reserved word is in one of them, so none ever reaches another feature or Claude.
 */
export function promptAnswers(prompt) {
  const out = [];
  const yes = voiceAllowed(prompt) ? yesFor(prompt) : null;
  if (yes) out.push({ id: yes.id, choice: yes.choice, words: [...yes.words], check: true });
  const no = noChoice(prompt);
  out.push({ id: 'deny', choice: no, words: [...RESERVED_ANSWERS.deny], check: false, negative: true });
  out.push({ id: 'stop', choice: null, words: [...RESERVED_ANSWERS.stop], check: false, negative: true, stopTask: true });
  const taken = new Set(out.flatMap((a) => a.words));
  const rest = [...RESERVED_ANSWERS.approve, ...RESERVED_ANSWERS.once, ...RESERVED_ANSWERS.budget, ...RESERVED_ANSWERS.steps].filter((w) => !taken.has(w));
  if (yes) out.push({ id: 'other', choice: null, words: rest, check: false, hint: true });
  else out.push({ id: 'click', choice: null, words: rest, check: false, clickOnly: true });
  return out;
}

/**
 * What the owner's words do to an open prompt. `readings`: [best, ...alternatives]; `answers`: from
 * promptAnswers() (or any api.prompt answers); `saidAt`: when the prompt was last said in full (null
 * while it hasn't been, e.g. cut by barge-in).
 *   null                          not an answer to this prompt (routed as usual)
 *   { answer }                    act at once (a no, a stop, or "that needs a click")
 *   { answer, check: true }       a yes: start the check ("Approving: … · say cancel")
 *   { answer, again: why }        a yes that doesn't count: say the prompt again
 *                                 ('unsaid' | 'late' | 'unsure': another reading was a no)
 */
export function chooseAnswer({ readings, answers, saidAt = null, now = Date.now(), windowMs = ANSWER_WINDOW_MS } = {}) {
  const list = Array.isArray(readings) ? readings.filter((r) => typeof r === 'string' && r.trim()) : [];
  if (!list.length || !Array.isArray(answers)) return null;
  const best = normalizeAnswer(list[0]);
  if (!best || NEVER_ANSWERS.includes(best)) return null;
  const answer = answers.find((a) => a && Array.isArray(a.words) && a.words.some((w) => normalizeAnswer(w) === best));
  if (!answer) return null;
  if (!answer.check) return { answer };
  if (!Number.isFinite(saidAt)) return { answer, again: 'unsaid' };
  if (now - saidAt > windowMs || now < saidAt) return { answer, again: 'late' };
  if (list.slice(1).some((r) => isNoWord(r))) return { answer, again: 'unsure' };
  return { answer, check: true };
}

// ------------------------------------------------------------------------- the answer layer

// While a check counts down (a task's, or a yes to a prompt), as whole sentences: words that withdraw
// it, words that let it go at once, and an affirmation, which lets it count on (from the start: it
// never sends anything sooner, and is never other words). Anything else isn't the check's: Voice Mode
// withdraws the check and routes the words as usual.
const WITHDRAW_WORDS = /^(?:no|nope|nah|cancel|cancel it|cancel that|stop|stop it|stop now|wait|hold on|hold it|never ?mind|forget it|no thanks|no thank you|dont|do not|dont do it|do not do it|not now|cancel chrome|stop chrome|deny)$/;
const GO_WORDS = /^(?:start now|start it now|start it|send it|send it now|go ahead|go|do it|do it now|yes start|yes go ahead|start)$/;
const KEEP_WORDS = /^(?:yes|yeah|yep|yup|yes please|okay|ok|okay then|sure|fine|alright|all right|right|correct|thats right|exactly|good|great|perfect|cool|sounds good|thanks|thank you|uh huh|mhm|mm hmm)$/;
// "No, I said the second one": a corrected task, routed again from the top (D2).
const CORRECTION = /^\W*(?:(?:no|nope|nah)\W+)?(?:I\s+said|I\s+meant|I\s+mean|what\s+I\s+said\s+was)\W+(.+?)\W*$/i;

/** The corrected words of "no, I said …" (with the owner's spelling), or ''. */
export function correctionOf(text) {
  const m = CORRECTION.exec(String(text ?? ''));
  return m && m[1].trim().split(/\s+/).length >= 1 ? m[1].trim() : '';
}

/** The prompt was asked last: no open question was asked after it (one without a time loses to it only when alone). */
function askedLast(state) {
  const p = state.prompt;
  const qs = Array.isArray(state.questions) ? state.questions.filter(Boolean) : [];
  if (!qs.length) return true;
  const at = Number(p && p.askedAt);
  if (!Number.isFinite(at)) return false;
  return qs.every((q) => Number.isFinite(q.askedAt) && q.askedAt <= at);
}

const answerAction = (a) => ({ free: true, undo: false, check: false, camera: false, ...a });

/**
 * The router's answer layer for Jarvis for Chrome (id 'chrome-prompt'). Pure. Never from another
 * reading (undo: false); Voice Mode's prompt channel applies the 30-s window, the other readings and
 * the check when it acts.
 *   state.chromeCheck ({ kind: 'task' | 'approve' }, Voice Mode's): while a check counts down, "cancel",
 *     "no", "stop" withdraw it; "no, I said …" corrects a task (routed again from the top); "start now"
 *     / "send it" lets it go; "yes", "okay", "thanks" let it count on, from the start.
 *     -> { do: 'chrome-check', how: 'withdraw' | 'correct' | 'go' | 'keep', words? }
 *     (Other words aren't its: Voice Mode withdraws the check and routes them as usual.)
 *   state.prompt (the open Chrome prompt, with its answers, or the extension's fields): its reserved
 *     words; a bare "cancel" or "no" when it was asked last. -> { do: 'chrome-answer', answer, bare? }
 *     A bare "yes", "okay", "continue" … never answers it; asked last, with no tour and no other
 *     question open, Jarvis says what to say instead. -> { do: 'chrome-hint' }
 * (A yes naming Chrome with nothing asked is matchNothingAsked's, in the destination layer.)
 */
export function matchChromeAnswer(text, state = {}) {
  const st = state && typeof state === 'object' ? state : {};
  const check = st.chromeCheck && typeof st.chromeCheck === 'object' ? st.chromeCheck : null;
  if (check) {
    const fixed = check.kind === 'task' ? correctionOf(text) : '';
    if (fixed) return answerAction({ do: 'chrome-check', how: 'correct', words: fixed });
    const said = normalizeAnswer(text);
    if (WITHDRAW_WORDS.test(said)) return answerAction({ do: 'chrome-check', how: 'withdraw' });
    if (GO_WORDS.test(said)) return answerAction({ do: 'chrome-check', how: 'go' });
    if (KEEP_WORDS.test(said)) return answerAction({ do: 'chrome-check', how: 'keep' });
    return null;
  }
  const p = st.prompt && typeof st.prompt === 'object' && st.prompt.id ? st.prompt : null;
  if (p) {
    const answers = Array.isArray(p.answers) && p.answers.length ? p.answers : promptAnswers(p);
    const said = normalizeAnswer(text);
    if (!said) return null;
    if (NEVER_ANSWERS.includes(said)) {
      const others = (Array.isArray(st.questions) && st.questions.length) || (st.tour && st.tour.active);
      return !others && askedLast(st) ? answerAction({ do: 'chrome-hint' }) : null;
    }
    const hit = answers.find((a) => a && Array.isArray(a.words) && a.words.some((w) => normalizeAnswer(w) === said));
    if (hit) return answerAction({ do: 'chrome-answer', answer: hit.id });
    if (isBareNo(text) && askedLast(st)) {
      const no = answers.find((a) => a && a.negative && !a.stopTask);
      if (no) return answerAction({ do: 'chrome-answer', answer: no.id, bare: true });
    }
    return null;
  }
  return null;
}

/**
 * Nothing asked (no prompt in `state`): a yes that names Chrome ("spend more in Chrome", "allow once in
 * Chrome") is still Chrome's, never Claude's: "Chrome isn't asking anything right now." (A no or a stop
 * that names Chrome goes to the stop layer: "stop Chrome", "cancel Chrome".) The router's 'chrome-answer'.
 */
export function matchNothingAsked(text, state = {}) {
  if (state && state.prompt) return null;
  const kind = reservedKind(text);
  if (!kind || kind === 'stop' || kind === 'deny' || !namesChromeAnswer(text) || matchChromeStop(text)) return null;
  return { do: 'chrome-nothing-asked', free: true, undo: true, check: false, camera: false };
}

/** How long the check after a yes waits: 2 s, or 5 s while Jarvis is hidden. */
export function approveCheckMs({ hidden = false } = {}) {
  return hidden ? APPROVE_CHECK_HIDDEN_MS : APPROVE_CHECK_MS;
}

// ----------------------------------------------------------------------------- what is said

export const CLICK_LINE = 'That needs a click in the Jarvis window.';
const PANEL_LINE = 'Option-Shift-J opens its side panel.';
const PANEL_SHOWN = '⌥⇧J opens its side panel.';

/** The extension's question in its own words (sayable), without a "Chrome asks:" of its own. */
export function promptQuestion(prompt) {
  const q = question(prompt);
  return /[?.!]$/.test(q) ? q : `${q}?`;
}

function question(prompt) {
  const p = prompt && typeof prompt === 'object' ? prompt : {};
  let q = sayable(p.spoken, 280) || sayable(p.title, 160) || 'May I go ahead?';
  q = q.replace(/^chrome asks\s*[:,-]?\s*/i, '');
  // Its own "Say approve …" goes: Jarvis says what can be said, from the voice policy.
  q = q.replace(/\s*(?:Say|You can say)\b[^.?!]*[.?!]?\s*$/i, '').trim();
  return q || 'May I go ahead?';
}

/** "Say approve, or cancel." for a prompt that takes a yes by voice, by its kind. */
export function answerHint(prompt) {
  switch (promptKind(prompt)) {
    case 'site':
      return 'Say allow once, or deny.';
    case 'budget':
      return 'Say spend more in Chrome, or cancel.';
    case 'steps':
      return 'Say more steps in Chrome, or cancel.';
    default:
      return 'Say approve, or cancel.';
  }
}

/** Why a click is needed: the extension's reason ("That's a purchase.") or the plain line. */
function clickReason(prompt) {
  const why = prompt && prompt.voice && typeof prompt.voice === 'object' ? sayable(prompt.voice.why, 140) : '';
  if (!why) return { say: `${CLICK_LINE} ${PANEL_LINE}`, show: `${CLICK_LINE} ${PANEL_SHOWN}` };
  const head = /[.!?]$/.test(why) ? why : `${why}.`;
  return { say: `${head} It needs a click in the Jarvis window. ${PANEL_LINE}`, show: `${head} It needs a click in the Jarvis window. ${PANEL_SHOWN}` };
}

/** "Say approve, or cancel.": what to say to this prompt (a yes of another kind was said). */
export function hintLine(prompt) {
  return takesVoiceYes(prompt) ? answerHint(prompt) : clickOnlyLine(prompt).say;
}

/** True when the prompt takes a yes by voice (voice.allowed, and a yes choice it has). */
export function takesVoiceYes(prompt) {
  return voiceAllowed(prompt) && !!yesFor(prompt);
}

/**
 * What Jarvis says (and the card shows) for a prompt: "Chrome asks: <the extension's line>? Say
 * approve, or cancel." A click-only prompt says why it needs a click instead.
 */
export function promptLine(prompt) {
  const ask = promptQuestion(prompt);
  if (takesVoiceYes(prompt)) {
    const hint = answerHint(prompt);
    return { say: `Chrome asks: ${ask} ${hint}`, show: `Chrome asks: ${ask} ${hint}` };
  }
  const why = clickReason(prompt);
  return { say: `Chrome asks: ${ask} ${why.say}`, show: `Chrome asks: ${ask} ${why.show}` };
}

/** The wake greeting's first words while a prompt waits: "Chrome is waiting for you: …". */
export function waitingLine(prompt) {
  const line = promptLine(prompt);
  return { say: line.say.replace(/^Chrome asks: /, 'Chrome is waiting for you: '), show: line.show.replace(/^Chrome asks: /, 'Chrome is waiting for you: ') };
}

/** A system notification for a prompt while Voice Mode is closed or on Standby. */
export function promptNotice(prompt) {
  return { title: 'Chrome asks', body: sayable(question(prompt), 180) };
}

/** A yes said for a prompt that takes none by voice. */
export function clickOnlyLine(prompt) {
  const why = clickReason(prompt);
  return { say: why.say, show: why.show };
}

/** The new budget a Continue gives: what the task has used plus one more budget. */
export function nextLimitUsd(task, baseUsd = DEFAULT_BUDGET_USD) {
  const t = task && typeof task === 'object' ? task : {};
  const used = Number(t.costUsd);
  const base = Number(baseUsd) > 0 ? Number(baseUsd) : DEFAULT_BUDGET_USD;
  const limit = Number(t.limitUsd);
  const from = Number.isFinite(used) && used > 0 ? used : Number.isFinite(limit) && limit > 0 ? limit : 0;
  return Math.round((from + base) * 100) / 100;
}

/** What a yes is about, in a few words for the check: the extension's line, short. */
function yesWhat(prompt) {
  const q = question(prompt).replace(/[?.!]+$/, '');
  return sayable(q, 90);
}

/**
 * The check after a yes, { say, show }: shown "Approving: add the monitor to the cart · say cancel",
 * said "Approving. Say cancel to stop." (the prompt was just said in full). The budget says the new
 * limit; allowing a site names it.
 */
export function approvingLine(prompt, answer, { task = null, baseUsd = DEFAULT_BUDGET_USD } = {}) {
  const id = answer && typeof answer === 'object' ? answer.id : answer;
  if (id === 'budget') {
    const limit = nextLimitUsd(task, baseUsd);
    return { show: `Approving: up to ${dollarsShown(limit)} in Chrome · say cancel`, say: `Approving up to ${dollarsSaid(limit)} in Chrome. Say cancel to stop.` };
  }
  if (id === 'steps') return { show: 'Approving: more steps in Chrome · say cancel', say: 'Approving more steps in Chrome. Say cancel to stop.' };
  if (id === 'once') {
    const site = sayable(prompt && prompt.site, 60);
    return { show: `Approving: ${site || 'this site'} for this task · say cancel`, say: `Approving ${site || 'this site'} for this task. Say cancel to stop.` };
  }
  return { show: `Approving: ${yesWhat(prompt)} · say cancel`, say: 'Approving. Say cancel to stop.' };
}

/** The answer went out but the extension didn't take it: "Chrome didn't take that: <why>." */
export function refusedLine(why = '') {
  const w = sayable(why, 160).replace(/[.!?]+$/, '');
  return w ? `Chrome didn’t take that: ${w}.` : 'Chrome didn’t take that.';
}

/** Said after a yes that doesn't count yet (before the prompt is said again). */
export function againLine(why) {
  if (why === 'unsure') return 'I’m not sure I heard that right.';
  if (why === 'late') return 'Let me ask again.';
  return '';
}

/** Said when the check is withdrawn, or a no went out. */
export const WITHDRAWN_LINE = 'Okay, not approved.';
export const DENIED_LINE = 'Okay, I told Chrome no.';
