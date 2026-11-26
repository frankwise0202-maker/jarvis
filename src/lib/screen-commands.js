// Screens (v7): the local, free matcher for spoken or typed screen commands. No DOM, no tokens.
//
//   matchScreenCommand('put the hologram on screen 2')
//     -> { action: 'open', what: 'hologram', where: 'other', screen: 2, ordinal: null }
//   matchScreenCommand('float it')            -> { action: 'open', what: 'this', where: 'beside', … }
//   matchScreenCommand('open it in a window') -> { action: 'open', what: 'this', where: 'window', … }
//   matchScreenCommand('bring it back')       -> { action: 'back', what: 'this', all: false, … }
//   matchScreenCommand('bring the hologram back') -> { action: 'back', what: 'hologram', … } (that one only)
//   matchScreenCommand('close the other screen') -> { action: 'close', where: 'other', screen: null, all: false, … }
//   matchScreenCommand('close all screens')   -> { action: 'close', all: true, … }
//   matchScreenCommand('close the window')    -> { action: 'close', ambiguous: true } (the focused or newest one)
//   matchScreenCommand('pull up the weather on my other screen') -> null (a job for Jarvis)
//
// what:  'this' | 'hologram' | 'blueprint' | 'mission' | 'answer' | 'photo' | 'camera' | 'link'
// where: 'other' (another monitor) | 'beside' (a floating panel) | 'window' (its own window)
//
// It is deliberately strict: a command needs a known object ("this", "it", "the report", "mission
// control"...) and a place ("on my other screen", "beside me", "in a window", "float"), and every
// other word must be a command word. Anything else ("pull up the weather on my other screen",
// "how do I use a second monitor?") is not a screen command and goes to Jarvis as usual, who can
// still call the open_screen tool after answering. Speech-to-text slips are folded in first
// ("screen to", "flow it", "besides me", "clothes the other screen", "on mother screen").

export const SCREEN_WHATS = Object.freeze(['this', 'hologram', 'blueprint', 'mission', 'answer', 'photo', 'camera', 'link']);
export const SCREEN_WHERES = Object.freeze(['other', 'beside', 'window']);

const MAX_WORDS = 18;

// Fillers and politeness, removed before parsing (whole words / phrases only).
const FILLERS = [
  'hey jarvis', 'ok jarvis', 'okay jarvis', 'jarvis',
  'can you please', 'could you please', 'would you please', 'will you please',
  'can you', 'could you', 'would you', 'will you', 'can we', 'could we',
  'i want you to', 'i would like you to', 'i d like you to', 'id like you to', 'i need you to',
  'go ahead and', 'do me a favor and', 'do me a favour and', 'let s', 'lets',
  'or something like that', 'or something', 'or whatever', 'or so',
  'right now', 'real quick', 'for me', 'thank you', 'thanks', 'please', 'pls', 'kindly',
  'if you can', 'if you could', 'as well', 'quickly', 'actually', 'basically', 'maybe', 'just', 'now', 'sir',
  'okay', 'ok', 'alright', 'all right', 'hey', 'yo', 'so', 'um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'like', 'kind of', 'kinda', 'sort of',
];

// Speech-to-text slips and spelling variants, folded into one spelling (applied in order).
const SLIPS = [
  [/\bmother (screen|monitor|display)/g, 'my other $1'],
  [/\b(?:udder|author|otter|ather|uther)( (?:screen|scream|monitor|display))/g, 'other$1'],
  [/\bscream\b/g, 'screen'],
  [/\bscreams\b/g, 'screens'],
  [/\bmoniter\b/g, 'monitor'],
  [/\b(screen|monitor|display) (?:number )?(?:2|two|to|too|tu|ii)\b/g, '$1 2'],
  [/\b(screen|monitor|display) (?:number )?(?:1|one|won)\b/g, '$1 1'],
  [/\b(screen|monitor|display) (?:number )?(?:3|three)\b/g, '$1 3'],
  [/\b(screen|monitor|display) number (\d)\b/g, '$1 $2'],
  [/\bsecond(?:ary)?\b|\b2nd\b/g, 'second'],
  [/\b(?:flow|flote|flowed|floated|floats)\b(?= (?:it|this|that|these|those|the|my|them)\b)/g, 'float'],
  [/^but (?=(?:it|this|that|the|them)\b)/g, 'put '],
  [/\bbesides\b/g, 'beside'],
  [/\b(?:by|be|b) side (?=me\b|this\b|it\b|what\b)/g, 'beside '],
  [/^clothes\b/g, 'close'],
  [/\bbringing\b/g, 'bring'],
  [/\bbring (?:in|a|it on) back\b/g, 'bring it back'],
  [/\bbring (it|this|that) (?:bag|pack|back)\b/g, 'bring $1 back'],
  [/^ring (it|this|that) back\b/g, 'bring $1 back'],
  [/\b(?:hollow ?gram|holo ?gram|halo ?gram|hollow grams|hologram s|holograms)\b/g, 'hologram'],
  [/\bblue ?prints?\b/g, 'blueprint'],
  [/\b(?:2|two) d\b/g, '2d'],
  [/\b(?:3|three) d\b/g, '3d'],
  [/\bweb ?cam\b/g, 'camera'],
  [/\bpop ?ups?\b/g, 'popup'],
  [/\bpicture in a picture\b|\bpic in pic\b/g, 'picture in picture'],
  [/\bi m\b/g, 'im'],
  [/\bi am\b/g, 'im'],
];

// Objects: deictic words, then the content kinds and their spoken names.
const KIND_WORDS = [
  ['mission', 'mission control|mission controller|mission status|the mission|mission|the agents|agents|the swarm|swarm|the team|progress'],
  ['hologram', 'hologram|holo|3d model|3d view|3d|model'],
  ['blueprint', 'blueprint|schematic|schematics|drawing|2d drawing|2d view|2d|sheet'],
  ['answer', 'research report|report|answer|reply|response|research|results|result|summary|findings|write up|writeup|what you (?:just )?(?:said|wrote|found)'],
  ['photo', 'photograph|photos|photo|pictures|picture|pic|image|images'],
  ['camera', 'camera feed|camera view|camera|optics|live view|the feed|what the camera sees'],
  ['link', 'links|link|url|web page|webpage|website|web site|page|site|article'],
];
const DEICTIC = 'this one|that one|this thing|that thing|this|that|these|those|it|them';
const ORDINALS = { first: 1, '1st': 1, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5, last: -1 };
const ORDINAL_RE = 'first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last';
const MODIFIERS = '(?:current|latest|last|newest|new|whole|full|open|live|same)';

const KIND_RE = KIND_WORDS.map(([kind, words]) => ({ kind, re: new RegExp(`\\b(?:the |my |your |that |this |our )?(?:(${ORDINAL_RE}) )?(?:${MODIFIERS} )?(?:${words})(?: (?:number )?(\\d))?\\b`) }));
const DEICTIC_RE = new RegExp(`\\b(?:${DEICTIC})\\b`);

// Places, most specific first. Each removes its words; `screen` is a requested screen number.
const SCREEN_NOUN = '(?:screens?|monitors?|displays?|tv|television)';
const OTHER_QUAL = '(?:other|second|external|extra|big|bigger|another|next|separate|spare|secondary|outside)';
const PLACES = [
  // its own window ("in a new tab" is a Chrome tab: chrome-commands.js, v8.1)
  { where: 'window', re: /\b(?:in|into|as|on|to|inside|onto)(?: (?:a|an|its|it s|the|my|their))?(?: (?:own|new|separate|another|different|seperate))* (?:window|popup|browser window)\b/ },
  { where: 'window', re: /\b(?:in|into|as) (?:a |an )?(?:another|new|separate|different) window\b/ },
  // a named screen: the laptop's own (internal) or the main (primary) one
  { where: 'other', target: 'internal', re: /\b(?:(?:on|onto|to|over to|up on|back to|in|into)(?: (?:the|my))? )?(?:laptop|macbook|mac book|built in|builtin|internal|computer s own|own laptop) (?:screen|display|monitor)\b/ },
  { where: 'other', target: 'primary', re: /\b(?:(?:on|onto|to|over to|up on|in|into)(?: (?:the|my))? )?(?:main|primary|first) (?:screen|display|monitor)\b/ },
  // another monitor, with or without a number
  { where: 'other', re: new RegExp(`\\b(?:(?:on|onto|to|over to|up on|over on|in|into|across to|on to|over|up to)(?: (?:the|my|your|our|a|that))? )?(?:${OTHER_QUAL} )+${SCREEN_NOUN}(?: (\\d))?\\b`) },
  { where: 'other', re: new RegExp(`\\b(?:(?:on|onto|to|over to|up on|over on|in|into|on to|over|up to)(?: (?:the|my|your|our))? )?${SCREEN_NOUN} (\\d)\\b`) },
  { where: 'other', re: /\b(?:(?:on|onto|to|over to|up on|over on|on to|over|up to)(?: (?:the|my|your|our))? )?(?:monitor|display|tv|television)\b/ },
  // beside me / floating on top
  { where: 'beside', re: /\b(?:beside|next to|alongside|along side|by)(?: (?:me|this|it|what im (?:looking at|working on|doing)|what i (?:m )?looking at|my (?:work|screen|window|stuff|app|desk)|the (?:app|window|screen)))\b/ },
  { where: 'beside', re: /\b(?:on|to|by|at|off to) (?:the |my )?side(?: of (?:my |the )?(?:screen|window|work))?\b/ },
  { where: 'beside', re: /\bon top(?: of (?:everything|it all|my (?:screen|work|window|stuff)|the (?:screen|window)|other (?:windows|apps)))?\b/ },
  { where: 'beside', re: /\b(?:(?:as|in|into) (?:a |an )?)?(?:floating (?:panel|window|screen|view)|picture in picture|pip|mini (?:player|window|view)|floating)\b/ },
  { where: 'beside', re: /\bbeside\b/ },
];

const QUESTION_START = /^(?:what|whats|why|how|hows|which|who|whos|when|where|wheres|is|are|was|were|does|do|did|should|has|have|had|isnt|arent|doesnt|dont|am)\b/;
const REQUEST_START = /^(?:can i (?:see|get|have|put)|could i (?:see|get|have)|(?:have|show|get|give) me|let me (?:see|have))\b/;

// Words a command may contain besides its object and place.
const COMMAND_WORDS = new Set(
  (
    'open opened opens put puts show shows display move moved send throw cast push pull bring take pop place stick drop toss project get load launch mirror expand ' +
    'float make keep have see give want need let view slide shift transfer up over out across there here also again too ' +
    'a an the my your our its on onto to in into at for of with from me i can could would will you we us please'
  ).split(' '),
);
const BACK_RE = /^(?:(?:bring|get|put|move|send|pull|slide)(?: (?:it|this|that|them|everything|all|the screen|the window|the (?:hologram|blueprint|report|answer|photo|camera|mission|mission control|link)))? back(?: (?:here|over here|to me|in here|on here|to (?:this|the main|my main|the first|my first|my laptop|the laptop|the original) (?:screen|window|display|monitor)|on (?:this|my main|the main) (?:screen|window)))?|bring back (?:it|this|that|them|everything|the (?:hologram|blueprint|report|answer|photo|camera|mission|mission control|link|screen|window)))$/;
const CLOSE_VERB = '(?:close|shut|hide|dismiss|kill|remove|get rid of|turn off|end|stop showing)(?: down)?(?: (?:all|both))?(?: (?:the|my|that|this|those|these|your))?';
// Clear: "close the other screen", "close screen 2", "close the floating panel", "close all screens".
const CLOSE_RE = new RegExp(
  `^${CLOSE_VERB} (?:(?:(${OTHER_QUAL}|floating|float|popout|pop out|popup|side|secondary|extra) (?:screens?|windows?|panels?|displays?|monitors?|views?))|(?:screens?|monitors?|displays?|windows?) (\\d)|screens|windows|(floating(?: panel| window)?|float|picture in picture|pip|popup|pop out|popout))$`,
);
// Ambiguous ("close the window"): only a screen command while a screen is open (the app decides).
const CLOSE_PLAIN_RE = new RegExp(`^${CLOSE_VERB} (?:screen|window|panel)$`);
const FULLSCREEN_RE = /\b(?:in |as |to )?(?:full ?screen|maximi[sz]ed?|max size|full size)\b/;

/** Lowercase words: punctuation off, apostrophes joined ("I'm" -> "im"), fillers and slips folded. */
export function normalizeScreenText(text) {
  let s = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/(\w)'(\w)/g, '$1 $2') // what's -> what s, i'm -> i m
    .replace(/#\s*(\d)/g, ' $1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (!s) return '';
  s = ` ${s} `;
  for (const f of FILLERS) {
    const re = new RegExp(` ${f} `, 'g');
    while (re.test(s)) s = s.replace(re, ' ');
  }
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(?:what s|whats) /, 'what is ');
  for (const [re, to] of SLIPS) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

function cut(s, m) {
  return `${s.slice(0, m.index)} ${s.slice(m.index + m[0].length)}`.replace(/\s+/g, ' ').trim();
}

function onlyCommandWords(s) {
  if (!s) return true;
  return s.split(' ').every((w) => COMMAND_WORDS.has(w));
}

/**
 * The screen command in `text`, or null.
 * { action: 'open' | 'back' | 'close', what, where, screen: number|null, ordinal: number|null, text }
 */
export function matchScreenCommand(text) {
  const s = normalizeScreenText(text);
  if (!s) return null;
  const words = s.split(' ');
  if (words.length > MAX_WORDS) return null;
  const base = { what: null, where: null, screen: null, target: null, ordinal: null, fullscreen: false, ambiguous: false, all: false, text: s };

  // v8.1: "back" and "close" say which: a named one, the other monitor's, the float, or all of them.
  if (BACK_RE.test(s)) return { ...base, action: 'back', what: whatOf(s), all: /\b(?:everything|them|all)\b/.test(s) };
  const close = CLOSE_RE.exec(s);
  if (close) {
    const qual = close[1] || close[3] || '';
    const where = /float|pop|pip|picture|side/.test(qual) ? 'beside' : close[1] && /\b(?:screens?|monitors?|displays?)$/.test(s) ? 'other' : null;
    const all = /\b(?:all|both)\b/.test(s) || (!close[2] && /\b(?:screens|windows|panels|displays|monitors|views)$/.test(s));
    return { ...base, action: 'close', where, screen: close[2] ? Number(close[2]) : null, all };
  }
  if (CLOSE_PLAIN_RE.test(s)) return { ...base, action: 'close', ambiguous: true };
  if (QUESTION_START.test(s) && !REQUEST_START.test(s)) return null;

  // The place.
  let rest = s;
  let where = null;
  let screen = null;
  let target = null;
  let fullscreen = false;
  const fs = FULLSCREEN_RE.exec(rest);
  if (fs) {
    fullscreen = true;
    rest = cut(rest, fs);
  }
  for (const p of PLACES) {
    const m = p.re.exec(rest);
    if (!m) continue;
    where = p.where;
    target = p.target || null;
    if (m[1] && /^\d$/.test(m[1])) screen = Number(m[1]);
    else if (/\bsecond\b/.test(m[0]) && where === 'other') screen = 2;
    rest = cut(rest, m);
    break;
  }
  // "float it", "pop it out", "make it float", "keep it on top" (the place is in the verb).
  const floatVerb = /^(?:float|make (?:it|this|that|them) float|pop (?:it|this|that|them) out|pop out|pop)\b/.exec(rest);
  if (floatVerb && !where) where = 'beside';
  if (!where) return null;
  if (floatVerb) rest = rest.replace(/^(?:float|make (it|this|that|them) float|pop (it|this|that|them) out|pop out|pop)\b/, (all, a, b) => a || b || '').trim();

  // The object.
  let what = null;
  let ordinal = null;
  for (const { kind, re } of KIND_RE) {
    const m = re.exec(rest);
    if (!m) continue;
    what = kind;
    if (m[1]) ordinal = ORDINALS[m[1]] ?? null;
    else if (m[2]) ordinal = Number(m[2]);
    rest = cut(rest, m);
    break;
  }
  if (!what) {
    const m = DEICTIC_RE.exec(rest);
    if (m) {
      what = 'this';
      rest = cut(rest, m);
    }
  }
  if (!what) return null;
  // Only command words may remain ("pull up the weather on my other screen" keeps "weather").
  if (!onlyCommandWords(rest)) return null;
  // A stray second object ("put this and that on screen 2") is not a command.
  if (DEICTIC_RE.test(rest.replace(/\b(?:it|this|that)\b(?= (?:up|over|out|there|here))/g, '')) && what !== 'this') return null;
  if (what !== 'link') ordinal = what === 'photo' ? ordinal : null;
  return { ...base, action: 'open', what, where, screen, target, ordinal, fullscreen: fullscreen && where !== 'beside' };
}

function whatOf(s) {
  for (const { kind, re } of KIND_RE) if (re.test(s)) return kind;
  return 'this';
}

/** Where a command puts things, for messages: 'screen 2', 'beside you', 'its own window'. */
export function describePlace(where, screenLabel) {
  if (where === 'other') return screenLabel ? screenLabel.toLowerCase() : 'your other screen';
  if (where === 'beside') return 'beside you';
  if (where === 'window') return 'its own window';
  return 'here';
}
