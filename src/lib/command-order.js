// The one router's order and its rules (v8.1, SPEC §30). Pure data and small helpers, no DOM.
// src/lib/command-router.js takes its order from here; the T1-T5 tests and SPEC §30 read it too.
//
// A sentence goes to the first matcher that takes it, in this order (the same on every surface:
// Voice Mode, the chat box, the hologram's field, Optics' field):
//   (0) the wake routine's answers: Voice Mode only, right after a wake (heard() asks them first)
//   (1) standby      the Standby words ("go to sleep", "standby"), on every surface
//   (2) answer       while a Chrome prompt is open, its reserved words ("approve", "deny", "cancel
//                    Chrome"…); then the newest owner question (the blueprint question, a tour
//                    decision, the research offer). A bare "cancel" or "no" answers whichever was
//                    asked last; "stop" is never an answer (it goes on to (3))
//   (3) stop         a bare "stop": pauses a tour, stops a Chrome task, the live view, a preview and
//                    Jarvis's voice; nothing running: "Okay." (src/lib/app-commands.js)
//   (4) destination  explicit places: Chrome (opening a page, then tasks), windows, Screens, "my screen"
//   (5) top          the thing on top: a tour, then a hologram or blueprint, then Optics (with the
//                    live view's words)
//   (6) app          Voice Mode's controls, the app's commands, "open optics", the live view's words
//                    with Optics closed, "research this"
//   (7) media        Apple Music (the best reading only), the home base, its brain
//   (8) camera       the camera words with Optics closed ("what am I looking at?"), Voice Mode only
//   (9) Claude, with the 2-second check
//
//   LAYERS                 (1)-(8), contract (b)
//   ORDER                  for each layer, the matcher ids in the order they are asked; an id not listed
//                          comes after the listed ones, in the order it was registered
//   sortRegistrations(list) the registrations in the router's order
//   MAX_WORDS, wordCount, overCap(text, carrier)   R3: at most 18 words, carriers exempt
//   isQuestion(text)       R4: starts like a question (what, how, is, can I …)
//   alternativeOk(action)  R7: another reading may take only a free, undoable, unchecked action that
//                          touches neither the camera nor the microphone
//   readingsToTry(readings) R7: the alternatives are tried only when the best reading isn't a question
//   isBareNo(text), isStopWord(text), lastAsked({ prompt, questions })   the answer layer's arbitration
//
// The rules (u-voice §4.3, with the brief's two changes):
//   R1 one router, every surface; declared exceptions only (camera words and Voice Mode's controls
//      are Voice Mode's; the wake routine's answers come before the router)
//   R2 one order (above)
//   R3 whole sentences after the fillers; at most 18 words, except carriers (Chrome tasks, music, home
//      base research), which carry the owner's words out and are anchored by their own prefix or suffix
//   R4 questions are never commands, except fixed forms ("what am I looking at?", "how much have I
//      spent today?")
//   R5 a matcher claims words only while its thing exists (tour words while a tour runs, window words
//      while a window is open)
//   R6 money: a command that spends needs an explicit verb and object; the dearer ones say the price
//      first and wait for yes
//   R7 alternatives: only when the best reading isn't a question, and only for a free, undoable,
//      unchecked action that touches neither the camera nor the microphone
//   R8 the 2-second check: commands act at once; one that carries the owner's words out (a Google
//      search, a Chrome task) is checked first (action.check)
//   R9 one short spoken line for every local action, so a stolen sentence is noticed at once
//   R10 inside a hologram, its part names win, except "my …" and "Optics", with a hint

export const LAYERS = Object.freeze(['standby', 'answer', 'stop', 'destination', 'top', 'app', 'media', 'camera']);

/** The ids each layer asks first, in this order (see the header). */
export const ORDER = Object.freeze({
  standby: Object.freeze(['standby']),
  answer: Object.freeze(['chrome.prompt', 'question']),
  stop: Object.freeze(['stop']),
  destination: Object.freeze(['chrome.open', 'chrome.task', 'windows', 'screens', 'screen.look']),
  top: Object.freeze(['tour', 'tour.start', 'hologram', 'optics']),
  app: Object.freeze(['voice.controls', 'app', 'optics.open', 'liveview', 'research']),
  media: Object.freeze(['music', 'homebase', 'brain']),
  camera: Object.freeze(['camera']),
});

/** The order as the docs tell it: [{ step, layer, what }], (0) to (9). */
export const ORDER_STEPS = Object.freeze([
  { step: 0, layer: 'wake', what: "the wake routine's answers (Voice Mode, right after a wake)" },
  { step: 1, layer: 'standby', what: 'Standby words' },
  { step: 2, layer: 'answer', what: "the Chrome prompt's reserved words, then the newest owner question" },
  { step: 3, layer: 'stop', what: '"stop": pauses a tour, stops a Chrome task' },
  { step: 4, layer: 'destination', what: 'Chrome, windows, Screens, "my screen"' },
  { step: 5, layer: 'top', what: 'the thing on top: a tour, a hologram or blueprint, Optics' },
  { step: 6, layer: 'app', what: 'app commands, Voice Mode controls, "open optics", live view words, "research this"' },
  { step: 7, layer: 'media', what: 'Apple Music, the home base, its brain' },
  { step: 8, layer: 'camera', what: 'camera words with Optics closed' },
  { step: 9, layer: 'claude', what: 'Claude, with the 2-second check' },
].map((s) => Object.freeze(s)));

/**
 * `list` ({ id, layer }[], in the order registered) sorted into the router's order: by layer, then by
 * ORDER within the layer, then as registered. A registration in an unknown layer is left out.
 */
export function sortRegistrations(list) {
  const rows = (Array.isArray(list) ? list : []).map((r, i) => ({ r, i })).filter(({ r }) => r && LAYERS.includes(r.layer));
  const rank = ({ r }) => {
    const k = ORDER[r.layer].indexOf(r.id);
    return k < 0 ? ORDER[r.layer].length : k;
  };
  rows.sort((a, b) => LAYERS.indexOf(a.r.layer) - LAYERS.indexOf(b.r.layer) || rank(a) - rank(b) || a.i - b.i);
  return rows.map(({ r }) => r);
}

// ---------------------------------------------------------------------------------------------
// R3 and R4

export const MAX_WORDS = 18;

const WAKE_LEAD = /^(?:(?:hey|ok|okay|hi)\s+)?jarvis\b[\s,.!:]*/i;

/** How many words `text` has ("Hey Jarvis," first doesn't count). */
export function wordCount(text) {
  const s = String(text ?? '').trim().replace(WAKE_LEAD, '');
  const words = s.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu);
  return words ? words.length : 0;
}

/** R3: too long for a command, unless the matcher is a carrier (it carries the owner's words out). */
export function overCap(text, carrier = false) {
  return !carrier && wordCount(text) > MAX_WORDS;
}

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
// R7

/** R7: another reading may take this action (free, undoable, unchecked, no camera, no microphone). */
export function alternativeOk(action) {
  return !!action && typeof action === 'object' && action.free !== false && action.undo !== false && !action.check && !action.camera && !action.mic;
}

/** R7: the readings the router tries: all of them, or only the best one when it is a question. */
export function readingsToTry(readings) {
  const list = (Array.isArray(readings) ? readings : [readings]).filter((r) => typeof r === 'string' && r.trim());
  if (!list.length) return [];
  return isQuestion(list[0]) ? [list[0]] : list;
}

// ---------------------------------------------------------------------------------------------
// The answer layer (2): which open question a bare "cancel" or "no" answers

const BARE_NO = /^(?:no|nope|nah|cancel|cancel (?:it|that|this)|no thanks|no thank you|never ?mind|forget it|not now)$/;
const STOP_WORD = /^(?:(?:ok|okay|no|wait|oh) )?stop(?: (?:it|now|everything|stop|right there|right now))*$/;

/** A bare "cancel" or "no" ("no thanks", "never mind"): it answers whatever was asked last. */
export function isBareNo(text) {
  return BARE_NO.test(plain(text).replace(/ (?:please|jarvis|thanks|thank you)$/, ''));
}

/** A bare "stop": never an answer; the stop layer (3) takes it. */
export function isStopWord(text) {
  return STOP_WORD.test(plain(text).replace(/ (?:please|jarvis)$/, ''));
}

const askedAtOf = (x) => (x && Number.isFinite(x.askedAt) ? x.askedAt : -Infinity);

/**
 * What was asked last: 'prompt' (the open Chrome prompt), the newest owner question, or null. The
 * questions stack newest last; the prompt and each question carry `askedAt` (when it was said, ms).
 */
export function lastAsked({ prompt = null, questions = [] } = {}) {
  const list = Array.isArray(questions) ? questions.filter(Boolean) : [];
  const top = list.length ? list[list.length - 1] : null;
  if (prompt && (!top || askedAtOf(prompt) >= askedAtOf(top))) return 'prompt';
  return top;
}
