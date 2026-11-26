// Windows by voice (v8.1): the local, free matcher for the words that work on several windows at
// once. Pure: no DOM. The words that put one thing somewhere ("put the camera in a window", "float
// it", "bring the hologram back", "close the other screen") stay in screen-commands.js; this module
// takes the rest:
//
//   matchWindowCommand('close the camera window', state)  -> { do: 'window', op: 'close', which: 'camera', … }
//   matchWindowCommand('camera on the left, hologram on the right', state)
//                                       -> { do: 'window', op: 'arrange', layout: 'left-right', a: 'camera', b: 'hologram' }
//   matchWindowCommand('side by side', state)          -> { op: 'arrange', layout: 'side-by-side' } (a window open)
//   matchWindowCommand("we'll do this in this window") -> { op: 'here', which: null }
//   matchWindowCommand('show me the hologram window')  -> { op: 'focus', which: 'hologram' }
//   matchWindowCommand('close everything')             -> { op: 'close-all', viewers: true }
//   matchWindowCommand('how do I split my screen')     -> null (a question for Jarvis)
//
// state (the router's, all optional): { windows: [{ id, kind, label, focused }], hologram: { open } }.
// Words that only make sense with a window open ("side by side", "split the screen", "swap them")
// are commands only while one is; a named window ("the camera window") is always one, and says so
// when there is none. Every action is free; it carries the router's fields (free, undo, check).
//
// which / a / b: 'camera' | 'hologram' | 'blueprint' | 'answer' | 'mission' | 'photo' | 'look' | 'link'

import { normalizeScreenText } from './screen-commands.js';

export const WINDOW_OPS = Object.freeze(['close', 'close-all', 'arrange', 'here', 'focus', 'swap', 'size']);

const MAX_WORDS = 16;

// What a window shows, by its spoken name (singular; normalizeScreenText folds "web cam", "holo gram").
const THINGS = [
  ['camera', 'camera feed|camera view|camera|optics|live view'],
  ['hologram', 'hologram|holo|3d model|3d view|model|3d'],
  ['blueprint', 'blueprint|schematic|drawing|2d drawing|2d|sheet'],
  ['answer', 'research report|report|answer|reply|response|research|results|summary|findings'],
  ['mission', 'mission control|mission|agents'],
  ['photo', 'photograph|photo|picture|image|pic'],
  ['look', 'look'],
  ['link', 'web page|webpage|website|web site|page|link|site|article'],
];
const THING = `(?:${THINGS.map(([, w]) => w).join('|')})`;
const KIND_OF = new Map();
for (const [kind, words] of THINGS) for (const w of words.split('|')) KIND_OF.set(w, kind);

/** The kind a spoken name stands for ('the camera feed' -> 'camera'), or null. */
export function windowKindOf(words) {
  const s = String(words || '')
    .replace(/^(?:the|my|your|that|this) /, '')
    .trim();
  return KIND_OF.get(s) || null;
}

const THE = '(?:(?:the|my|your|that|this) )?';
const WIN = '(?:window|panel|popup|pop up|screen)';
const QUESTION = /^(?:what|whats|why|how|hows|which|who|whos|when|where|wheres|is|are|was|were|does|do you|did|should|could i|can i|has|have|had|isnt|arent|doesnt|dont|am|will|would)\b/;

// "Do this in this window", "we'll do this in this window", "show it here", "show the report here".
const HERE_LEAD = '(?:(?:we ll|well|we will|i ll|i will|we can|we re going to|were going to|im going to|i want to|i d like to|id like to|lets|let s) )?';
const HERE_RE = [
  new RegExp(`^${HERE_LEAD}(?:do|show|put|open|see|keep|work on|continue|have|use) (it|this|that|them|this one|${THE}${THING})(?: up)? (?:in|on|inside) (?:this|this one|the current) (?:window|screen|one)$`),
  new RegExp(`^${HERE_LEAD}(?:show|put|open|bring|move|have) (it|this|that|them|${THE}${THING})(?: up)? (?:here|over here|in here|right here)$`),
  /^(?:(?:we ll|we will|lets|let s) )?(?:use|stay in|work in) this (?:window|one)$/,
];

// Close one window by its name, or everything.
const CLOSE = '(?:close|shut|kill|dismiss|hide|get rid of)';
const CLOSE_NAMED_RE = new RegExp(`^${CLOSE} ${THE}(${THING}) ${WIN}$`);
const CLOSE_ALL_RE = /^(?:close|shut|kill) (?:everything|it all|all of it|all of them|them all|every window|all windows and viewers)$/;

// Layouts.
const PAIR = `${THE}(${THING}) and ${THE}(${THING})`;
const ARRANGE_VERB = '(?:(?:put|show|place|arrange|open|set|move|lay out|have|get|make) )?';
const SIDE_BY_SIDE = '(?:side by side|next to each other|beside each other|in split screen|split screen|in a split screen)';
const PAIR_SIDE_RE = new RegExp(`^${ARRANGE_VERB}${PAIR} ${SIDE_BY_SIDE}$`);
const OPEN_SIDE_RE = new RegExp(`^${ARRANGE_VERB}(?:(?:them|both|both of them|these|those|the windows|my windows|the two|both windows) )?${SIDE_BY_SIDE}$`);
const SIDE = `(?:on|to|at) (?:the )?(left|right)(?: side| half)?`;
const LEFT_RIGHT_RE = new RegExp(`^(?:(?:put|move|show|place|have|set) )?${THE}(${THING})(?: ${WIN})? ${SIDE}(?: (?:and )?${THE}(${THING})(?: ${WIN})? ${SIDE})?$`);
const SPLIT_RE = /^(?:split|tile|arrange|lay out|organize|organise) (?:the |my )?(?:screen|windows|them|it|everything)(?: up)?$|^(?:split screen|tile them|tile the windows)$/;
const SWAP_RE = /^(?:swap|switch|flip|exchange|trade) (?:them|the windows|windows|the screens|screens|sides|places|the two|them around|left and right|the left and the right)(?: around| over)?$/;

// Bring one to the front.
const FOCUS_RE = new RegExp(`^(?:show me|bring up|go to|switch to|focus on|focus|raise|bring forward|bring to the front) ${THE}(${THING}) ${WIN}$`);

function action(op, extra = {}) {
  // Free and local. Closing can lose something (a camera stops), so no alternative reading closes.
  return { do: 'window', op, free: true, undo: op !== 'close' && op !== 'close-all', check: false, camera: false, ...extra };
}

const kindOf = (w) => (w ? windowKindOf(w) : null);

/**
 * The window command in `text`, or null (see the header). `state.windows` is the list of windows
 * Jarvis has open (the floating panel counts).
 */
export function matchWindowCommand(text, state = {}) {
  const s = normalizeScreenText(text).replace(/\bpop up\b/g, 'popup');
  if (!s) return null;
  const words = s.split(' ');
  if (words.length > MAX_WORDS) return null;
  const open = Array.isArray(state && state.windows) ? state.windows.length : 0;

  // "Do this in this window": before the question filter ("do this…" is not "do you…").
  for (const re of HERE_RE) {
    const m = re.exec(s);
    if (m) {
      const which = m[1] && !/^(?:it|this|that|them|this one)$/.test(m[1]) ? kindOf(m[1]) : null;
      return action('here', { which });
    }
  }
  if (QUESTION.test(s)) return null;

  let m = CLOSE_NAMED_RE.exec(s);
  if (m) return action('close', { which: kindOf(m[1]) });
  if (CLOSE_ALL_RE.test(s)) return action('close-all', { viewers: true });

  m = PAIR_SIDE_RE.exec(s);
  if (m && kindOf(m[1]) && kindOf(m[2]) && kindOf(m[1]) !== kindOf(m[2])) return action('arrange', { layout: 'left-right', a: kindOf(m[1]), b: kindOf(m[2]) });
  if (OPEN_SIDE_RE.test(s) && open >= 1) return action('arrange', { layout: 'side-by-side', a: null, b: null });
  m = LEFT_RIGHT_RE.exec(s);
  if (m) {
    const a = kindOf(m[1]);
    const b = kindOf(m[3]);
    const sideA = m[2];
    const sideB = m[4];
    // One thing alone ("put the camera on the left") only while a window is open: with none, "show
    // the model on the right" is the hologram's own view words.
    const one = !b && open >= 1 && !/^show\b/.test(s);
    if (a && (one || (b && b !== a && sideB && sideB !== sideA))) {
      // Always left first: "hologram on the right, camera on the left" -> a: camera, b: hologram.
      const left = sideA === 'left' ? a : b;
      const right = sideA === 'left' ? b : a;
      return action('arrange', { layout: 'left-right', a: left || null, b: right || null });
    }
  }
  if (SPLIT_RE.test(s) && open >= 1) return action('arrange', { layout: 'side-by-side', a: null, b: null });
  if (SWAP_RE.test(s) && open >= 2) return action('swap');

  m = FOCUS_RE.exec(s);
  if (m) return action('focus', { which: kindOf(m[1]) });
  return null;
}

/** "the camera window", "the report window": what Jarvis calls a window showing `kind`. */
export function windowName(kind, { report = false } = {}) {
  switch (kind) {
    case 'answer':
      return report ? 'the report window' : 'the answer window';
    case 'mission':
      return 'the Mission Control window';
    case 'link':
      return 'the page window';
    case 'look':
      return 'the Look window';
    case 'camera':
    case 'hologram':
    case 'blueprint':
    case 'photo':
      return `the ${kind} window`;
    default:
      return 'the window';
  }
}
