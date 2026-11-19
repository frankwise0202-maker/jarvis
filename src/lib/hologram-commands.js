// Local (free) commands for the hologram viewer, typed in its command field or spoken through its
// mic (and in Voice Mode while a hologram is showing). Pure: no DOM.
//
//   matchHologramCommand(text, parts, { selected }) -> command | null
//
// parts: [{ id, name, aka? }] (the viewer's parts list). selected: the selected part id, used for
// "isolate it" / "blueprint this". null means "not a viewer command": send the text to Jarvis as a
// normal message, with the hologram as context.
//
// Commands ({ action, ... }):
//   explode | collapse | rotate | stop | labels-on | labels-off | reset | close | parts-list
//   view        { view: 'front'|'back'|'left'|'right'|'top'|'bottom' }
//   zoom-in | zoom-out
//   select      { partId }          "show / select / highlight / find / where is <part>", or just "<part>"
//   focus       { partId }          "focus on / zoom in on / look at / go to <part>"
//   isolate     { partId }          "isolate <part>", "show only <part>", "just the <part>"
//   show-all                        "show everything", "unisolate"
//   deselect
//   photos      { partId? }         "photos of <part>" (no partId: the whole object)
//   blueprint   { partId? }         "2D", "blueprint", "blueprint <part>" (the owner asked: the paid build starts)
// A part command also carries { partName, score, alternatives } (alternatives: other ids that
// matched as well, e.g. "front brake" with left and right brakes).
//
// Matching is forgiving of speech-to-text slips: filler words are dropped, number words and
// split letters are joined ("d c to d c" -> "dc dc", "twelve volt" -> "12 volt"), plurals and
// spelling variants fold together, and part names match by word, by joined spelling and by a
// consonant skeleton ("router" ~ "rotor", "alternate or" ~ "alternator").

const NUMBER_WORDS = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
  eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', twenty: '20', thirty: '30',
  forty: '40', fifty: '50', hundred: '100',
};

// Folded spelling variants and synonyms (both sides of a comparison go through this).
const VARIANTS = {
  tyre: 'tire', tyres: 'tire', tires: 'tire', aluminium: 'aluminum', colour: 'color', bonnet: 'hood', boot: 'trunk',
  windscreen: 'windshield', silencer: 'muffler', petrol: 'gas', gasoline: 'gas', motor: 'motor', lh: 'left', rh: 'right',
  l: 'left', r: 'right', fl: 'front left', fr: 'front right', rl: 'rear left', rr: 'rear right', back: 'rear', volts: 'volt',
  v: 'volt', '12v': '12 volt', dcdc: 'dc dc', ecu: 'ecu', convertor: 'converter', inverters: 'inverter', centre: 'center',
};

// Words that carry no meaning for matching a part.
const PART_FILLER = new Set([
  'the', 'a', 'an', 'my', 'this', 'that', 'its', "it's", 'his', 'her', 'their', 'our', 'your', 'of', 'part', 'parts', 'piece',
  'component', 'one', 'thing', 'please', 'now', 'there', 'here', 'again', 'for', 'me', 'us', 'on', 'to', 'in', 'at', 'up', 'some',
  'just', 'real', 'quick', 'thanks', 'thank', 'you', 'jarvis',
]);

// Leading politeness / wake words.
const LEAD_FILLER = [
  /^(hey|ok|okay|alright|all right|so|and|then|now|um|uh|er|well)\b,?\s*/,
  /^jarvis\b\s*/,
  /^(please|kindly)\b\s*/,
  /^(can|could|would|will) you( please)?\b\s*/,
  /^(i want to|i'd like to|i would like to|i wanna|let me|let's|lets|go ahead and|i need to|try to|try and)\b\s*/,
  /^(can|could) (i|we)\b\s*/,
];
const TRAIL_FILLER = /\s*\b(please|thanks|thank you|now|for me|jarvis|again)$/;

/** Lowercase ASCII-ish text: punctuation to spaces, hyphens split, number words to digits, letters joined. */
export function normalizeCommandText(text) {
  let s = String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s
    .split(' ')
    .map((w) => NUMBER_WORDS[w] ?? w)
    .join(' ');
  // "d c to d c" / "dc to dc" -> "dc dc"; split single letters "d c" -> "dc"
  s = s.replace(/\b([a-z]) ([a-z])\b(?= |$)/g, (m, a, b) => (/[aeiou]/.test(a + b) && !/^(a|i)$/.test(a) ? m : a + b));
  s = s.replace(/\b(dc|ac) (to|2) (dc|ac)\b/g, '$1 $3');
  s = s.replace(/\b(\d+) ?(v|volts?)\b/g, '$1 volt');
  return s;
}

function stripFillers(s) {
  let prev;
  do {
    prev = s;
    for (const re of LEAD_FILLER) s = s.replace(re, '');
    s = s.replace(TRAIL_FILLER, '');
  } while (s !== prev);
  return s.trim();
}

function singular(w) {
  if (w.length <= 3) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(sh|ch|x|z)es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

function foldWord(w) {
  const v = VARIANTS[w];
  if (v !== undefined) return v;
  return singular(w);
}

/** Tokens for matching: folded, singular, fillers removed. */
function tokens(text) {
  const out = [];
  for (const raw of normalizeCommandText(text).split(' ')) {
    if (!raw || PART_FILLER.has(raw)) continue;
    for (const w of foldWord(raw).split(' ')) if (w && !PART_FILLER.has(w)) out.push(w);
  }
  return out;
}

function skeleton(w) {
  // consonant skeleton: first letter kept, vowels and doubled letters dropped ("router" -> "rtr", "rotor" -> "rtr")
  if (w.length < 4) return w;
  const first = w[0];
  const rest = w
    .slice(1)
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/[aeiouyhw]/g, '')
    .replace(/(.)\1+/g, '$1');
  return first + rest;
}

function editDistance(a, b, max = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array(b.length + 1);
  let cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** 0..1 similarity of two single words. */
function wordScore(a, b) {
  if (a === b) return 1;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return 0; // numbers must match exactly
  const len = Math.max(a.length, b.length);
  if (len >= 4) {
    const d = editDistance(a, b, 3);
    if (d === 1) return 0.86;
    if (d === 2 && len >= 6) return 0.74;
    if (d === 3 && len >= 9) return 0.62;
  }
  if (a.length >= 4 && b.length >= 4 && skeleton(a) === skeleton(b)) return 0.72;
  if (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a))) return 0.7;
  return 0;
}

/** How well a phrase names a candidate (0..1). Both are token lists. */
function phraseScore(phrase, cand) {
  if (!phrase.length || !cand.length) return 0;
  let covered = 0;
  const used = new Array(cand.length).fill(false);
  for (const w of phrase) {
    let best = 0;
    let bestJ = -1;
    for (let j = 0; j < cand.length; j++) {
      const s = wordScore(w, cand[j]);
      if (s > best || (s === best && s > 0 && used[bestJ] && !used[j])) {
        best = s;
        bestJ = j;
      }
    }
    if (bestJ >= 0) used[bestJ] = true;
    covered += best;
  }
  const coverage = covered / phrase.length; // the owner's words are explained by the name
  const precision = used.filter(Boolean).length / cand.length; // and the name is mostly said
  let score = coverage * 0.72 + precision * 0.28;
  // joined spelling catches split or merged words ("alternate or", "dcdc", "batter e")
  const joinedA = phrase.join('');
  const joinedB = cand.join('');
  const len = Math.max(joinedA.length, joinedB.length);
  if (len >= 6) {
    const d = editDistance(joinedA, joinedB, 3);
    const joinedScore = d === 0 ? 1 : d === 1 ? 0.9 : d === 2 && len >= 8 ? 0.8 : d === 3 && len >= 11 ? 0.7 : 0;
    score = Math.max(score, joinedScore);
  }
  return coverage < 0.5 ? Math.min(score, 0.4) : score;
}

/**
 * Best part for a phrase: { part, score, alternatives } or null.
 * A part is matched by its name, its id (words), and its aka names.
 */
export function resolvePart(phrase, parts) {
  const words = tokens(phrase);
  if (!words.length || !Array.isArray(parts) || !parts.length) return null;
  const scored = [];
  for (const part of parts) {
    if (!part || !part.id) continue;
    const names = [part.name, String(part.id).replace(/[-_]+/g, ' '), ...(Array.isArray(part.aka) ? part.aka : [])].filter(Boolean);
    let best = 0;
    for (const n of names) {
      const t = tokens(n);
      // Parenthesized qualifiers ("(FL)", "(MnO2)") are optional to say.
      const core = tokens(String(n).replace(/\([^)]*\)/g, ' '));
      best = Math.max(best, phraseScore(words, t), core.length && core.length < t.length ? phraseScore(words, core) * 0.97 : 0);
    }
    if (best > 0) scored.push({ part, score: best });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top || top.score < 0.62) return null;
  const alternatives = scored.filter((s) => s !== top && top.score - s.score < 0.03).map((s) => s.part.id);
  return { part: top.part, score: Math.round(top.score * 100) / 100, alternatives };
}

// ---------------------------------------------------------------------------------------------
// Command grammar (applied to normalized text with leading/trailing fillers stripped)

// The object of a verb: "it", "everything", or "the/this/that <words>" (never bare words, so
// "turn on the labels" is not read as "turn <on the labels>").
const OBJ = "(?: (?:it|this|that|them|everything|the whole thing|(?:the|this|that) [a-z0-9' ]{1,40}))?";

const SIMPLE = [
  // close
  { re: /^(close|exit|quit|dismiss|leave|hide)( (it|this|that|the (hologram|viewer|model|view|3d view|3 d view)|hologram|viewer))?$/, action: 'close' },
  { re: /^(we're|we are|i'm|i am) (done|finished)( here)?$/, action: 'close' },
  // explode
  {
    re: new RegExp(
      `^(expand|expend|explode|exploded|blow apart|blow it apart|disassemble|dismantle|separate|spread out|open up|unpack|deconstruct)${OBJ}( apart| up| out)?$`,
    ),
    action: 'explode',
  },
  { re: new RegExp(`^(take|pull|break|split|tear|bring)${OBJ} (apart|a part|open|down)$`), action: 'explode' },
  { re: /^(take apart|pull apart|break apart|split apart|break down|tear down|open it up|open (it|this|that) up|exploded view|explode view|expanded view|(show|give) (me )?(an |the )?(exploded|expanded) view)$/, action: 'explode' },
  // collapse
  { re: new RegExp(`^(collapse|collapsed|assemble|reassemble|re assemble|unexplode|un explode|implode|rebuild|compress|combine|retract)${OBJ}$`), action: 'collapse' },
  { re: new RegExp(`^(put|snap|piece)${OBJ} (back )?(together|to gather|back)$`), action: 'collapse' },
  { re: new RegExp(`^bring${OBJ} (back )?(together|to gather)$`), action: 'collapse' },
  { re: /^(back together|put back together|close it up|assembled view|(show|give) (me )?(the )?assembled view)$/, action: 'collapse' },
  // labels
  // (singular "the label" is left to part matching first: a battery has a "Label sleeve")
  { re: /^((show|turn on|enable|add|display|bring back|put) (the |all )?(labels|names|labelling|labeling|tags)( on| back)?|(labels?|label son|labels own|names) (on|back)|labels|label (it|everything|the parts|them))$/, action: 'labels-on' },
  { re: /^((hide|turn off|disable|remove|clear|lose|drop|get rid of) (the |all )?(labels?|names|labelling|labeling|tags)( off)?|(labels?|names) (off|of|away)|no (more )?labels?)$/, action: 'labels-off' },
  // rotation
  { re: new RegExp(`^(stop|pause|freeze|halt|hold)( (it|that|this))?( (rotating|spinning|turning|the rotation|the spin|moving|still))?$`), action: 'stop' },
  { re: /^(stop|don't|do not) (rotating|spinning|turning|rotate|spin|turn)( it)?$|^(stay|hold|keep) still$|^(no|stop) (rotation|spin|spinning)$/, action: 'stop' },
  { re: new RegExp(`^(rotate|spin|turn|revolve|orbit|auto rotate|autorotate)${OBJ}( around| round)?$`), action: 'rotate' },
  { re: /^(start|keep|resume) (rotating|spinning|turning)( it)?$|^(spin|rotate|turn) it around$|^(turn on|start) (auto )?rotat(e|ion)$/, action: 'rotate' },
  // camera
  { re: /^(reset|reset (the )?(view|camera|it|everything|zoom)|recenter|re center|center (it|the view|the model)|centre (it|the view)|default view|start view|home view|back to (the )?(start|default view))$/, action: 'reset' },
  { re: /^(zoom in|closer|get closer|move closer|bigger|make it bigger|enlarge|magnify)$/, action: 'zoom-in' },
  { re: /^(zoom out|further|farther|further away|back up|smaller|make it smaller|pull back|move back)$/, action: 'zoom-out' },
  // parts list
  { re: /^((show|open|list|give me|see) (me )?(the |all )?(the )?(parts|parts list|list of parts|components|component list)( list)?|parts list|what parts( are there)?|what are the parts)$/, action: 'parts-list' },
  // selection / isolation housekeeping
  { re: /^(deselect|unselect|clear (the )?selection|select nothing|never mind|nevermind)$/, action: 'deselect' },
  { re: /^(show (all|everything|all parts|the whole thing|it all)|unisolate|un isolate|unhide( all| everything)?|bring (it all|everything) back|exit isolation|stop isolating|show all parts)$/, action: 'show-all' },
];

const VIEW_WORDS = {
  front: 'front', 'the front': 'front', back: 'back', 'the back': 'back', rear: 'back', 'the rear': 'back', behind: 'back',
  side: 'left', 'the side': 'left', left: 'left', 'the left': 'left', 'left side': 'left', 'the left side': 'left',
  right: 'right', 'the right': 'right', 'right side': 'right', 'the right side': 'right',
  top: 'top', 'the top': 'top', above: 'top', 'top down': 'top', overhead: 'top', "bird's eye": 'top', 'birds eye': 'top', 'bird eye': 'top',
  bottom: 'bottom', 'the bottom': 'bottom', below: 'bottom', underneath: 'bottom', 'the underside': 'bottom', underside: 'bottom', 'under side': 'bottom',
};

function matchView(s) {
  let m = /^(?:(?:show|look at|view|go to|switch to|turn to|rotate to|give me|see)(?: me)? )?(?:it )?(?:from )?(the )?([a-z' ]+?)(?: view| side view| angle)$/.exec(s);
  if (m && VIEW_WORDS[m[2]]) return VIEW_WORDS[m[2]];
  m = /^(?:(?:show|look at|view|see|let me see|look)(?: me)?(?: it)? )?from (?:the )?([a-z' ]+)$/.exec(s);
  if (m && VIEW_WORDS[m[1]]) return VIEW_WORDS[m[1]];
  m = /^(?:look|view it|see it|show it|show me it) from ([a-z' ]+)$/.exec(s);
  if (m && VIEW_WORDS[m[1]]) return VIEW_WORDS[m[1]];
  m = /^(?:show (?:me )?|turn (?:it )?to |look at )(the (?:front|back|rear|top|bottom|left side|right side|side|underside))$/.exec(s);
  if (m && VIEW_WORDS[m[1]]) return VIEW_WORDS[m[1]];
  if (/^(top|front|back|rear|side|left|right|bottom)$/.test(s)) return VIEW_WORDS[s];
  return null;
}

const BLUEPRINT_WORD = '(?:2d|2 d|2 dee|to d|too d|blue ?prints?|schematics?|technical drawings?|drawings?|plans?|2d drawings?|2d views?|2d blueprints?|2d plans?|flat drawings?)';

function partCommand(action, phrase, parts, extra = {}) {
  const hit = resolvePart(phrase, parts);
  if (!hit) return null;
  return { action, partId: hit.part.id, partName: hit.part.name, score: hit.score, alternatives: hit.alternatives, ...extra };
}

const IT = /^(it|this|that|this one|that one|this part|that part|the selected part|the selection|selected)$/;

/**
 * @param {string} text
 * @param {{ id: string, name: string, aka?: string[] }[]} parts
 * @param {{ selected?: string|null }} [context]
 */
export function matchHologramCommand(text, parts = [], context = {}) {
  const s = stripFillers(normalizeCommandText(text));
  if (!s || s.length > 120) return null;
  const selected = context.selected || null;
  const list = Array.isArray(parts) ? parts : [];

  // 2D / blueprint (the owner asked explicitly, so the paid build may start)
  let m = new RegExp(`^(?:(?:make|build|draw|create|generate|do|show|give|get|open|switch to|go to|change to|see|view)(?: me)? (?:a |an |the |it in |it as |into )?)?(?:the )?${BLUEPRINT_WORD}(?: (?:view|version|mode|drawing|sheet))?(?: (?:of|for|on) (.+))?$`).exec(s);
  if (m) {
    const target = m[1] ? m[1].trim() : '';
    if (!target || IT.test(target)) return target && selected ? { action: 'blueprint', partId: selected } : { action: 'blueprint' };
    const hit = partCommand('blueprint', target, list);
    if (hit) return hit;
    // "blueprint of the whole thing" / of the object's own name
    if (/^(the )?(whole|entire|full)( thing| model| object| car| assembly)?$|^(it all|everything)$/.test(target)) return { action: 'blueprint' };
    return null;
  }
  m = new RegExp(`^(.+?) (?:in |as (?:a )?)?${BLUEPRINT_WORD}$`).exec(s);
  if (m && !/^(show|make|draw|switch|go|change|open)$/.test(m[1])) {
    if (IT.test(m[1])) return selected ? { action: 'blueprint', partId: selected } : { action: 'blueprint' };
    const hit = partCommand('blueprint', m[1].replace(/^(show|draw|make|give me)( me)? /, ''), list);
    if (hit) return hit;
  }
  m = /^blue ?print (.+)$/.exec(s);
  if (m) {
    if (IT.test(m[1])) return selected ? { action: 'blueprint', partId: selected } : { action: 'blueprint' };
    const hit = partCommand('blueprint', m[1], list);
    if (hit) return hit;
  }

  // Photos
  m = /^(?:(?:show|find|get|pull up|open|see|search|look up|give)(?: me)? )?(?:some |a few |real |the |a )?(?:real |actual )?(photos?|pictures?|pics?|photographs?|images?|real life photos?)(?: (?:of|for|on) (.+))?$/.exec(s);
  if (m) {
    const target = m[2] ? m[2].trim() : '';
    if (!target) return { action: 'photos' };
    if (IT.test(target)) return selected ? { action: 'photos', partId: selected } : { action: 'photos' };
    const hit = partCommand('photos', target, list);
    if (hit) return hit;
    if (/^(the )?(whole|entire|full)( thing| model| object)?$|^(it all|everything)$/.test(target)) return { action: 'photos' };
    return { action: 'photos', query: target };
  }
  m = /^what does (?:the |a |an )?(.+) look like( in real life)?$/.exec(s);
  if (m) {
    const hit = partCommand('photos', m[1], list);
    if (hit) return hit;
  }

  // Views
  const view = matchView(s);
  if (view) return { action: 'view', view };

  // Simple commands
  for (const rule of SIMPLE) if (rule.re.test(s)) return { action: rule.action };

  // Isolate
  m = /^(?:isolate|isolated|i so late|isolates|solo|only show|show only|show just|just show|focus only on)(?: on)? (.+)$/.exec(s) || /^(?:hide everything|hide all|hide the rest|hide the others|hide all the others|hide everything else)(?: but| except| apart from| other than)? (.+)$/.exec(s) || /^(?:just|only) (?:the )?(.+?)(?: please)?$/.exec(s);
  if (m) {
    const target = m[1].replace(/ (only|alone|by itself)$/, '').trim();
    if (IT.test(target)) return selected ? { action: 'isolate', partId: selected } : null;
    const hit = partCommand('isolate', target, list);
    if (hit) return hit;
    if (/^(isolate|show only|only show|solo)/.test(s)) return null;
  }
  m = /^(?:show|see) (?:me )?(?:the )?(.+?) (?:only|alone|by itself|on its own)$/.exec(s);
  if (m) {
    const hit = partCommand('isolate', m[1], list);
    if (hit) return hit;
  }
  if (/^(isolate|isolated|isolate (it|this|that))$/.test(s)) return selected ? { action: 'isolate', partId: selected } : null;

  // Focus / zoom on a part
  m = /^(?:focus|zoom|zoom in|zoom into|zoom closer|get closer|go|move|fly|take me|bring me|look|get a closer look|take a closer look)(?: in)?(?: on| to| into| at| onto)? (?:the )?(.+)$/.exec(s) || /^(?:closer look at|close up of|close up on|closeup of) (?:the )?(.+)$/.exec(s);
  if (m) {
    const target = m[1].trim();
    if (IT.test(target)) return selected ? { action: 'focus', partId: selected } : null;
    const hit = partCommand('focus', target, list);
    if (hit) return hit;
  }

  // Select / show a part
  m = /^(?:show|select|highlight|find|locate|point to|point out|point at|tap|click|click on|pick|choose|mark|where is|where's|wheres|where are|which (?:one|part) is|identify|open|display)(?: me)?(?: where)? (?:the |a |an )?(.+?)(?: is| are)?$/.exec(s);
  if (m) {
    const target = m[1].trim();
    if (IT.test(target)) return null;
    const hit = partCommand('select', target, list);
    if (hit) return hit;
    if (/^(label|name|tag)$/.test(target)) return { action: 'labels-on' };
    return null;
  }

  // A bare part name selects it ("alternator", "the DC-DC converter")
  if (s.split(' ').length <= 6) {
    const hit = partCommand('select', s, list);
    if (hit && hit.score >= 0.8) return hit;
  }
  // "show the label" with no part called that: the owner wants the labels
  if (/^(show|turn on|display|add)( me)? (the )?(label|name|tag)$/.test(s)) return { action: 'labels-on' };
  return null;
}
