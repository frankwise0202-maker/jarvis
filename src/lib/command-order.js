// The one router's order and its rules (v8.1, SPEC §30). Pure data and small helpers, no DOM.
// src/lib/command-router.js routes by FINAL_ORDER; the T1-T5 tests and SPEC §30 read this file too.
//
// A sentence goes to the first matcher that takes it, in this order, the same on every surface (Voice
// Mode, the chat box and its microphone, a hologram's field and microphone, Optics' field and
// microphone; a matcher's `surfaces` say where it listens):
//   (0) the wake routine's answers: Voice Mode only, right after a wake (heard() asks them first)
//   (1) standby      the Standby words ("go to sleep", "standby"), on every surface
//   (2) answer       the best reading only: while a Chrome prompt is open, its reserved words
//                    ("approve", "deny", "cancel Chrome"…); the newest owner question (the blueprint
//                    question, a tour decision, the research offer); words held while a hologram of
//                    the reply builds. A bare "cancel" or "no" answers whichever was asked last;
//                    "stop" is never an answer (it goes on to (3))
//   (3) stop         a bare "stop": pauses a tour, stops a Chrome task, the live view, a preview and
//                    Jarvis's voice; nothing running: "Okay." (src/lib/app-commands.js)
//   (4) destination  places the owner names: a Jarvis for Chrome task first, then opening a page in
//                    Chrome (lead decision D1, below), windows, Optics' picture card (only while a Look
//                    is on screen: "put the picture to the side" goes back into its card, not a Screens
//                    float), Screens, "my screen"
//   (5) top          the thing on top: a tour, then a hologram or blueprint, then Optics (with the
//                    live view's words)
//   (6) app          Voice Mode's controls, the app's commands, "open optics", the live view's words
//                    with Optics closed, "research this"
//   (7) media        Apple Music (the best reading first; another reading only in the last pass), the
//                    home base, its brain
//   (8) camera       the camera words with Optics closed ("what am I looking at?"), Voice Mode only
//   (9) Claude, with the 2-second check
//
// Lead decision D1 ("open …" and page words in Chrome): `chrome-task` comes before `chrome-open`, and
// each declines the other's sentences. chrome-task takes page objects ("the cheapest one", "the first
// result", "that result", "the second item", "this product", "the listing") and page verbs ("click …",
// "scroll …", "add … to the cart", "sort by …", "filter by …", "search this site for …", "go back a
// page"), only in a Chrome context or with "in Chrome". chrome-open takes addresses and sites, Google
// searches, "pull this up in Chrome", and "open the Nth link" when the newest reply has links; it
// declines every sentence that starts with "click" and every page object. "Open the Nth link" without
// reply links is a task in a Chrome context, and a question for Jarvis outside one.
//
//   LAYERS           (1)-(8), contract (b)
//   ORDER            for each layer, the matcher ids in the order they are asked ('@<layer>' in a table
//                    places the ones not listed: right after the listed ones, in registration order)
//   ORDER_STEPS      the order as the docs tell it, (0) to (9)
//   FINAL_ORDER      every surface's passes (command-router.js's table format), built from ORDER
//   MAX_WORDS        R3: at most 18 words for a matcher that isn't a carrier
//   isQuestion(text) R4 (and R7: no other reading counts when the best one is a question)
//   isBareNo(text), isStopWord(text), askedLast(state)   the answer layer's arbitration
//
// The rules (u-voice §4.3, with the brief's two changes):
//   R1 one router, every surface; declared exceptions only (Voice Mode's controls and the camera
//      words are Voice Mode's; the wake routine's answers come before the router)
//   R2 one order (above)
//   R3 whole sentences after the fillers; at most 18 words, except carriers (Chrome tasks, Apple Music,
//      the home base's research and watches, Optics' questions about "this"), which carry the owner's
//      words out and are anchored by their own prefix or suffix
//   R4 questions are never commands, except fixed forms ("what am I looking at?", "how much have I
//      spent today?")
//   R5 a matcher claims words only while its thing exists (tour words while a tour runs, window words
//      while a window is open; Screens' "bring … back" and "close …" only while a screen is open, else
//      the viewer on top gets them)
//   R6 money: a command that spends needs an explicit verb and object; the dearer ones say the price
//      first and wait for yes
//   R7 alternatives: only when the best reading isn't a question, and only for a free, undoable,
//      unchecked action that touches neither the camera nor the microphone (an answer to a question or
//      to Chrome: the best reading only)
//   R8 the 2-second check: commands act at once; one that carries the owner's words out (a Google
//      search) is checked first (action.check); a Chrome task has its own check (lead decision D2)
//   R9 one short spoken line for every local action, so a stolen sentence is noticed at once
//   R10 inside a hologram, its part names win, except "my …" and "Optics", with a hint

export const LAYERS = Object.freeze(['standby', 'answer', 'stop', 'destination', 'top', 'app', 'media', 'camera']);

/** The ids each layer asks first, in this order (see the header). */
export const ORDER = Object.freeze({
  standby: Object.freeze(['standby']),
  answer: Object.freeze(['prompt', 'question', 'reply-building']),
  stop: Object.freeze(['stop']),
  destination: Object.freeze(['chrome-task', 'chrome-open', 'windows', 'optics-card', 'screens', 'screen-look']),
  top: Object.freeze(['tour', 'tour-start', 'blueprint', 'hologram', 'optics']),
  app: Object.freeze(['voice-controls', 'app', 'optics-open', 'liveview', 'research']),
  media: Object.freeze(['music', 'homebase', 'brain']),
  camera: Object.freeze(['camera']),
});

/** The order as the docs tell it: [{ step, layer, what }], (0) to (9). */
export const ORDER_STEPS = Object.freeze(
  [
    { step: 0, layer: 'wake', what: "the wake routine's answers (Voice Mode, right after a wake)" },
    { step: 1, layer: 'standby', what: 'Standby words' },
    { step: 2, layer: 'answer', what: "the Chrome prompt's reserved words, then the newest owner question" },
    { step: 3, layer: 'stop', what: '"stop": pauses a tour, stops a Chrome task' },
    { step: 4, layer: 'destination', what: 'a Chrome task, a page in Chrome, windows, Optics\' picture card, Screens, "my screen"' },
    { step: 5, layer: 'top', what: 'the thing on top: a tour, a hologram or blueprint, Optics' },
    { step: 6, layer: 'app', what: 'Voice Mode controls, app commands, "open optics", live view words, "research this"' },
    { step: 7, layer: 'media', what: 'Apple Music, the home base, its brain' },
    { step: 8, layer: 'camera', what: 'camera words with Optics closed' },
    { step: 9, layer: 'claude', what: 'Claude, with the 2-second check' },
  ].map((s) => Object.freeze(s)),
);

// A layer's ids in order, its unlisted matchers right after them ('@layer'). In `top` the unlisted
// ones come right after the tour's own (a builder's new tour or Optics words before today's viewers).
const slot = (layer) => (layer === 'top' ? ['tour', 'tour-start', '@top', 'blueprint', 'hologram', 'optics'] : [...ORDER[layer], `@${layer}`]);

/**
 * Every surface's passes (command-router.js's table format; R1: the same for all four):
 *   1. the Standby words, from any reading (R7 decides: going to Standby is free and undone by "Hey
 *      Jarvis")
 *   2. the answers, from the best reading only
 *   3. everything else, layer by layer, the readings in turn (Apple Music the best reading only)
 *   4. Apple Music from another reading, when the best one is nothing else and names no part of the
 *      hologram on screen
 * No pass takes alternatives for an action R7 refuses (anyReading is empty).
 */
const PASSES = [
  { use: slot('standby') },
  { use: slot('answer'), readings: 'best' },
  { use: [...slot('stop'), ...slot('destination'), ...slot('top'), ...slot('app'), ...slot('media'), ...slot('camera')], best: ['music'] },
  { use: ['music'], readings: 'alternatives', when: 'bestNamesNoPart' },
];
export const FINAL_ORDER = deepFreeze({ voice: PASSES, chat: PASSES, hologram: PASSES, optics: PASSES });

// ---------------------------------------------------------------------------------------------
// R3, R4

export const MAX_WORDS = 18;

const QUESTION = /^(?:what|whats|why|how|hows|which|who|whos|when|where|wheres|is|are|was|were|does|do|did|should|could i|can i|has|have|had|isnt|arent|doesnt|dont|am|will|would)\b/;
const LEAD = /^(?:(?:hey|hi|ok|okay|so|um|uh|and|well|oh)\s+)*(?:jarvis\s+)?(?:(?:hey|ok|okay|so|um|uh)\s+)*/;

function plain(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/(\w)'(\w)/g, '$1$2')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(LEAD, '')
    .trim();
}

/** R4: the words start like a question ("what is", "how do I", "can I"); "can you …" is a request. */
export function isQuestion(text) {
  return QUESTION.test(plain(text));
}

// ---------------------------------------------------------------------------------------------
// The answer layer (2): which open question a bare "cancel" or "no" answers

// A no, alone or emphatic ("no no no", "nope, nope"), with an optional tail ("no, cancel that", "no wait", "no,
// never mind", "no, forget it", "no not now"), or a no-word alone ("cancel", "never mind"): ROUTING-R2-4. "Wait"
// and "thanks" are a no only after one ("wait" alone is the tour's and the check's own word).
const NO_ALONE = '(?:cancel(?: (?:it|that|this))?|never ?mind|forget it|not now|dont|do not|dont do it|do not do it)';
const BARE_NO = new RegExp(`^(?:(?:no|nope|nah)(?: (?:no|nope|nah))*(?: (?:${NO_ALONE}|wait|thanks|thank you))?|${NO_ALONE})$`);
const STOP_WORD = /^(?:(?:ok|okay|no|wait|oh) )?stop(?: (?:it|now|everything|stop|right there|right now))*$/;

/** A bare "cancel" or "no" ("no thanks", "never mind", "no no no", "no, cancel that"): it answers whatever was asked last. */
export function isBareNo(text) {
  return BARE_NO.test(plain(text).replace(/(?: (?:please|jarvis|thanks|thank you))+$/, ''));
}

/** A bare "stop": never an answer; the stop layer (3) takes it. */
export function isStopWord(text) {
  return STOP_WORD.test(plain(text).replace(/(?: (?:please|jarvis))+$/, ''));
}

const askedAtOf = (x) => (x && Number.isFinite(x.askedAt) ? x.askedAt : -Infinity);

/**
 * What was asked last: 'prompt' (the open Chrome prompt), 'question' (the top owner question:
 * state.questions[0], the newest) or null. Each carries `askedAt`, when it was last said (Voice Mode
 * stamps it); one never said counts as the oldest. A tie goes to the prompt.
 */
export function askedLast(state = {}) {
  const s = state && typeof state === 'object' ? state : {};
  const top = Array.isArray(s.questions) && s.questions.length ? s.questions[0] : null;
  const prompt = s.prompt || null;
  if (prompt && (!top || askedAtOf(prompt) >= askedAtOf(top))) return 'prompt';
  return top ? 'question' : null;
}

function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const v of Object.values(obj)) deepFreeze(v);
  }
  return obj;
}
