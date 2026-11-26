// Jarvis for Chrome by voice (v8.1, the app side of G4): which of the owner's sentences become a
// Chrome task, the task's words, and what Jarvis says around a task. Pure: no DOM, no clock of its
// own (the router's state carries `now`; Date.now() otherwise).
//
//   matchChromeTask('find a 4K monitor under $300 and add it to the cart in Chrome', state)
//     -> { do: 'chrome-task', text: 'find a 4K monitor under $300 and add it to the cart', chat: 'new',
//          via: 'carrier', free: false, undo: false, check: true }
//   matchChromeTask('add the cheapest one to the cart', { chrome: { contextUntil: now + 60000 } })
//     -> { do: 'chrome-task', text: 'add the cheapest one to the cart', chat: 'new', via: 'context', … }
//   matchChromeTask('open the camera', { chrome: { contextUntil: now + 60000 } })   -> null (a Jarvis thing)
//   matchChromeTask('how do I open a new window in Chrome')                       -> null (a question)
//   matchChromeTask('open youtube in Chrome')                                     -> null (opening: G1)
//   matchClickAround('click around for me')   -> { do: 'chrome-ask' }   ("What should I do in Chrome?")
//   matchChromeStop('stop Chrome')            -> { do: 'chrome-stop', named: true }
//   matchChromeStatus('what are you doing in Chrome?') -> { do: 'chrome-status' }
//   taskCheckLine({ text, limitUsd: 1 })      -> 'Chrome, up to a dollar: … Say cancel to stop.'
//
// The words (brief G4, critique H3, owner question 4's default answer):
//   - Any time: "in Chrome, …", "… in Chrome", "use Jarvis for Chrome to …", "have Chrome …" (and
//     "ask / tell / get Chrome to …"). A carrier: no word cap, anchored by its own prefix or suffix.
//   - In a Chrome context only (2 minutes after a page opened in the Jarvis window, a task, or "click
//     around for me"; also while a task runs): sentences bound to the page: "click …", "scroll …",
//     "add … to the cart", "… on this page / site", "sort by …", "filter by …", "search this site for
//     …", "go back a page". "Open …", "go to …", "compare …", "pick …" (and a few verbs like them)
//     need a page object ("the cheapest one", "that result", "the second item").
//   - Never: a sentence that names a Jarvis thing (his camera, Optics, library, settings, history,
//     chat, home base, hologram, blueprint, windows, screens, tour, live view, Standby, music); a
//     question without page words (R4); with a hologram on top, a sentence naming one of its parts
//     (R10); what opening a page in Chrome takes (G1: "pull this up in Chrome", "open YouTube in
//     Chrome", "search for … in Chrome", "open the second link"), unless it also asks for an action.
// The task text is the owner's own words, without the carrier and fillers, never Claude's text, a
// page's or the extension's: this module only ever sees what the owner said or typed.

/** How long a Chrome action keeps page-bound words going to Chrome. */
export const CHROME_CONTEXT_MS = 120000;
/** The spoken check of a task: how long "Say cancel to stop" waits once said (5 s while hidden). */
export const TASK_CHECK_MS = 2000;
export const TASK_CHECK_HIDDEN_MS = 5000;
/** A task's budget when the extension hasn't said one yet (its default, extension limits.js). */
export const DEFAULT_TASK_LIMIT_USD = 1;
/** Carriers are exempt from the router's word cap; this bounds a monologue heard across the room. */
const MAX_TASK_WORDS = 60;

// ---------------------------------------------------------------------------------- the words

/** One word as the matchers see it: lower case, apostrophes joined, punctuation off its ends. */
function normWord(raw) {
  return String(raw)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/(\w)'(\w)/g, '$1$2')
    .replace(/[^a-z0-9$%./-]+/g, '')
    .replace(/^[./-]+|[./-]+$/g, '');
}

/** The sentence as words, each with the owner's own spelling kept for the task text. */
function wordsOf(text) {
  const out = [];
  for (const raw of String(text ?? '').split(/\s+/)) {
    const w = normWord(raw);
    if (w) out.push({ raw, w });
  }
  return out;
}

const seq = (phrase) => phrase.split(' ');
const LEAD_FILLERS = [
  'hey jarvis', 'ok jarvis', 'okay jarvis', 'hi jarvis', 'jarvis', 'can you please', 'could you please', 'would you please',
  'will you please', 'can you', 'could you', 'would you', 'will you', 'go ahead and', 'i want you to', 'i would like you to',
  'id like you to', 'i need you to', 'please', 'kindly', 'just', 'now', 'also', 'then', 'and', 'so', 'ok', 'okay', 'alright',
  'all right', 'hey', 'um', 'umm', 'uh', 'er', 'erm', 'hmm', 'well', 'oh',
].map(seq);
const TAIL_FILLERS = ['please', 'for me', 'thanks', 'thank you', 'jarvis', 'right now', 'now', 'if you can', 'if you could', 'real quick', 'sir'].map(seq);
// Said first, they make a sentence a follow-up of the last task ("now add the second one too").
const FOLLOW_LEAD = new Set(['now', 'also', 'then', 'and']);
const FOLLOW_TAIL = /(?:^|\s)(?:too|as well|also|again|instead)$/;

const LEAD_CARRIERS = [
  'in google chrome', 'in chrome', 'in jarvis for chrome', 'using jarvis for chrome', 'with jarvis for chrome', 'over in chrome',
  'use jarvis for chrome to', 'use google chrome to', 'use chrome to', 'have jarvis for chrome', 'have google chrome', 'have chrome',
  'ask jarvis for chrome to', 'ask chrome to', 'tell jarvis for chrome to', 'tell chrome to', 'get jarvis for chrome to', 'get chrome to',
].map(seq);
// The lead carriers that ask for something: whatever follows is an instruction (G4; CHROME-VOICE-R2-3).
const ASKING_LEADS = new Set([
  'use jarvis for chrome to', 'use google chrome to', 'use chrome to', 'have jarvis for chrome', 'have google chrome', 'have chrome',
  'ask jarvis for chrome to', 'ask chrome to', 'tell jarvis for chrome to', 'tell chrome to', 'get jarvis for chrome to', 'get chrome to',
]);
const TAIL_CARRIERS = [
  'in google chrome', 'in chrome', 'on google chrome', 'on chrome', 'using google chrome', 'using chrome', 'with chrome',
  'in jarvis for chrome', 'using jarvis for chrome', 'with jarvis for chrome', 'over in chrome',
].map(seq);

function startsWith(ws, i, words) {
  if (i + words.length > ws.length) return false;
  for (let k = 0; k < words.length; k++) if (ws[i + k].w !== words[k]) return false;
  return true;
}
function endsWith(ws, j, words) {
  if (j - words.length < 0) return false;
  for (let k = 0; k < words.length; k++) if (ws[j - words.length + k].w !== words[k]) return false;
  return true;
}
const longestFirst = (list) => [...list].sort((a, b) => b.length - a.length);
const LEADS = longestFirst(LEAD_FILLERS);
const TAILS = longestFirst(TAIL_FILLERS);
const LEAD_CARRY = longestFirst(LEAD_CARRIERS);
const TAIL_CARRY = longestFirst(TAIL_CARRIERS);

/** [i, j): the words left once fillers are off both ends; `follow`: a follow-up word was said first. */
function trim(ws, i = 0, j = ws.length) {
  let follow = false;
  for (let guard = 0; guard < 12 && i < j; guard++) {
    const f = LEADS.find((words) => startsWith(ws, i, words) && i + words.length <= j);
    if (!f) break;
    if (f.length === 1 && FOLLOW_LEAD.has(f[0])) follow = true;
    i += f.length;
  }
  for (let guard = 0; guard < 12 && j > i; guard++) {
    const f = TAILS.find((words) => endsWith(ws, j, words) && j - words.length >= i);
    if (!f) break;
    j -= f.length;
  }
  return { i, j, follow };
}

/**
 * The sentence taken apart: its words (fillers off), the carrier that names Chrome ('lead', 'tail'
 * or null) and the words the task would carry; `asks`: a lead carrier that asks ("have Chrome …").
 * Null for an empty sentence.
 */
function parse(text) {
  const ws = wordsOf(text);
  let { i, j, follow } = trim(ws);
  if (i >= j) return null;
  let carrier = null;
  let asks = false;
  const lead = LEAD_CARRY.find((words) => startsWith(ws, i, words) && i + words.length < j);
  if (lead) {
    carrier = 'lead';
    asks = ASKING_LEADS.has(lead.join(' '));
    const t = trim(ws, i + lead.length, j);
    i = t.i;
    j = t.j;
    follow = follow || t.follow;
  } else {
    const tail = TAIL_CARRY.find((words) => endsWith(ws, j, words) && j - words.length > i);
    if (tail) {
      carrier = 'tail';
      const t = trim(ws, i, j - tail.length);
      i = t.i;
      j = t.j;
      follow = follow || t.follow;
    }
  }
  if (i >= j) return null;
  const words = ws.slice(i, j);
  const s = words.map((x) => x.w).join(' ');
  return { s, words, carrier, asks, follow: follow || FOLLOW_TAIL.test(s), all: ws.map((x) => x.w).join(' ') };
}

// Words an instruction starts with, written in lower case after "Chrome, up to a dollar:".
const VERBS_SAID_FIRST = new Set(
  ('find add click scroll sort filter search go open compare pick choose select buy order get grab read check save tell show look put book ' +
    'sign fill type play watch see use make reserve subscribe download send write summarize list give help take start continue keep try ' +
    'switch remove delete change set close log apply print copy follow visit navigate press tap hit').split(' '),
);

// With a carrier, only an instruction is a task (ROUTING-2), told by the sentence's shape, never by a list of verbs
// (CHROME-VOICE-R2-3, ROUTING-R2-2): "cancel my Netflix subscription", "email the seller" are instructions as much as
// "find …". A statement or a trouble is the owner's, for Jarvis to answer: a subject first ("my Gmail won't load", "it
// says access denied"), or a short noun phrase and then a verb ("log in doesn't work", "order history is empty", "Zoom
// keeps crashing"). A question was taken out before (R4); "explain …", "teach me …", "tell me how …" ask for help.
const NOT_INSTRUCTION =
  /^(?:show me how|show me why|teach me|tell me how|tell me why|help me understand|explain|describe|define|remind me (?:how|what|why|where|when|which)|look at all (?:these|those|this|that|the)|open (?:when|whenever|on startup|at startup|every time))(?:\s|$)/;
const SUBJECT_FIRST = new Set(
  ('i im ive id ill my mine it its this that thats there theres the these those our your their his her we they theyre he she hes shes ' +
    'something everything nothing anything someone somebody everyone everybody nobody a an no not nope nah').split(' '),
);
// The verb after the noun phrase. A trouble's ("won't", "keeps", "failed") may follow one with a determiner in it ("find my
// iPhone won't load"); a plain one ("is", "has", "says") may also follow an instruction's object ("confirm the order is
// right"), so before it the noun phrase has no determiner after its first word.
const TROUBLE_VERBS = new Set('wont wouldnt doesnt dont didnt cant cannot couldnt isnt arent wasnt werent hasnt havent keeps kept fails failed stopped broke crashes crashed freezes froze'.split(' '));
const PLAIN_VERBS = new Set('is are was were has have had does says say said looks look seems seem keep fail'.split(' '));
// Never inside a noun phrase: a clause or a question starts there ("see if Best Buy has it", "make sure it is").
const NOT_IN_A_NOUN = new Set('if whether that than then and or but so because sure what which who whom whose when where why how whatever whichever whoever i me you him it us them we they'.split(' '));
const DETERMINERS = new Set('the a an my your our his her their its this these those some any every each no'.split(' '));

/** The words (normalized) read as a statement: a subject first, or a noun phrase of one to four words and then its verb (or "not …ing"). */
function statementShape(ws) {
  if (!ws.length) return false;
  if (SUBJECT_FIRST.has(ws[0])) return true;
  // "Sound not working", "videos not loading": a trouble said short.
  if (ws.slice(1, 5).some((w, n) => w === 'not' && /^[a-z]+ing$/.test(ws[n + 2] || ''))) return true;
  for (let k = 1; k <= 4 && k < ws.length; k++) {
    const trouble = TROUBLE_VERBS.has(ws[k]);
    if (!trouble && !PLAIN_VERBS.has(ws[k])) continue;
    const rest = ws.slice(1, k);
    if (rest.some((w) => NOT_IN_A_NOUN.has(w))) return false;
    const determined = rest.some((w) => DETERMINERS.has(w));
    if (!determined || (trouble && k <= 3)) return true;
  }
  return false;
}

/**
 * The words after the carrier read as an instruction (ROUTING-2, CHROME-VOICE-R2-3): after a carrier that asks ("have
 * Chrome …", "tell Chrome to …"), anything but a request for help; after "… in Chrome" or "in Chrome, …", anything but a
 * statement or a request for help. A site and a colon may come first ("Best Buy: add …", "Amazon: my order is late").
 */
function isInstruction(p) {
  const ws = p.words.map((x) => x.w);
  const k = ws[0] === 'lets' || ws[0] === 'please' ? 1 : 0;
  const colon = p.words.slice(0, 4).findIndex((x) => /:$/.test(x.raw));
  const after = colon >= 0 ? ws.slice(colon + 1) : null;
  if (NOT_INSTRUCTION.test(ws.slice(k).join(' ')) || (after && NOT_INSTRUCTION.test(after.join(' ')))) return false;
  if (p.asks) return true;
  return !statementShape(ws.slice(k)) && !(after && statementShape(after));
}

/** The owner's own words for a task: their spelling, without the carrier, fillers or end stops. */
function taskWords(words) {
  let text = words
    .map((x) => x.raw)
    .join(' ')
    .replace(/^[\s,;:.!—–-]+/, '')
    .replace(/[\s,;:.!—–-]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "Find …" -> "find …" (the check reads "Chrome, up to a dollar: find …"), as any instruction's first word ("Cancel …",
  // "Re-order …"; CHROME-VOICE-R2-3); "Best Buy: …" (a site and a colon first) and "USB …" stay.
  const first = /^([A-Z][a-z]+(?:-[a-z]+)?)(?=\s|$)/.exec(text);
  const site = words.slice(0, 4).some((x) => /:$/.test(x.raw));
  if (first && (VERBS_SAID_FIRST.has(first[1].toLowerCase()) || !site)) text = text[0].toLowerCase() + text.slice(1);
  return text;
}

/** The task text for an owner's sentence (what the check reads and the extension gets), or ''. */
export function chromeTaskText(text) {
  const p = parse(text);
  return p ? taskWords(p.words) : '';
}

// ------------------------------------------------------------------------------ never a task

const phrase = (re) => new RegExp(`(?:^|\\s)(?:${re})(?=\\s|$)`);
// Jarvis's own things, whatever words are around them.
const JARVIS_ONLY = phrase(
  'optics|the optics|holograms?|blueprints?|standby|stand by mode|home ?base|homebase|live view|video mode|voice mode|' +
    'mission control|new chat|new conversation|voice settings|full ?screen',
);
// Words for things both Jarvis and a web page have. They are Jarvis's when said as his: after
// "the / my / your / this / that" (one of his modifiers may come between: "my other screen", "the
// voice settings", "the camera window"), or right after a verb or "in / on / to" ("open settings",
// "in chat"), and not as part of a longer name ("the screen protector", "the camera bag", "order
// history", "the cheapest camera" are a page's).
const SHARED = '(?:cameras?|cams?|webcams?|windows?|screens?|displays?|chats?|conversations?|history|settings|preferences|library|music|tours?|microphones?|mics?)';
const DET = '(?:the|my|your|this|that|these|those|our|jarvis|jarviss)';
const JMOD =
  '(?:other|second|first|third|main|voice|sound|audio|camera|hologram|blueprint|chat|big|bigger|small|smaller|new|old|current|last|' +
  'previous|recent|front|back|rear|built-in|builtin|mac|macs|jarvis|jarviss|whole|entire|own|external|usb|left|right|top|bottom)';
const BARE_BEFORE = '(?:open|close|show|hide|start|stop|exit|leave|use|clear|switch to|go to|turn on|turn off|in|on|to|into|from|of)';
// What may follow such a word for it to be the whole name (else it is part of a longer one).
const HEAD_NEXT =
  '(?:to|on|in|into|at|for|from|of|and|or|but|by|off|up|down|back|again|please|too|so|then|here|there|is|isnt|was|it|its|' +
  'that|this|window|windows|screen|screens|settings|view|feed|mode|panel|now)';
const JARVIS_SHARED = new RegExp(`(?:^|\\s)(?:${DET}(?: ${JMOD})?|${BARE_BEFORE}) ${SHARED}(?=$|\\s${HEAD_NEXT}(?:\\s|$))`);
// Said on its own at the start ("settings please", "camera on"): his; "chat with the seller" is a verb.
const JARVIS_FIRST = new RegExp(`^(?!chats? )${SHARED}(?=$|\\s${HEAD_NEXT}(?:\\s|$))`);

/** True when the words name one of Jarvis's own things (his camera, settings, windows, …). */
export function namesJarvisThing(text) {
  const s = wordsOf(text).map((x) => x.w).join(' ');
  return JARVIS_ONLY.test(s) || JARVIS_SHARED.test(s) || JARVIS_FIRST.test(s);
}

/** With a hologram on top (R10): the words name one of its parts. */
function namesPart(s, parts) {
  if (!Array.isArray(parts)) return false;
  for (const p of parts) {
    const names = typeof p === 'string' ? [p] : p && typeof p === 'object' ? [p.name, ...(Array.isArray(p.aliases) ? p.aliases : [])] : [];
    for (const name of names) {
      const n = wordsOf(name).map((x) => x.w).join(' ');
      if (n && n.length >= 3 && phrase(n.replace(/[.$%/-]/g, (c) => `\\${c}`)).test(s)) return true;
    }
  }
  return false;
}

// The answers to Chrome's questions are reserved (G5: chrome-prompt-words.js RESERVED_ANSWERS): with
// "in Chrome" or without it, none of them is ever a task.
const ANSWER_WORDS = /^(?:yes )?(?:approve(?: it| that)?|i approve|allow (?:it |that )?once|deny(?: it| that)?|cancel(?: it| that)?|stop(?: it| the task)?|spend more(?: money)?|(?:take )?more steps)$/;

const QUESTION =
  /^(?:what|whats|why|how|hows|which|who|whos|whose|when|where|wheres|is|isnt|are|arent|was|were|does|doesnt|do|dont|did|didnt|should|shall|could i|can i|cant i|has|have|had|am|will i|would i|tell me (?:what|why|how|who|when|where|which|if|whether))(?:\s|$)/;
const PAGE_WORDS = /(?:^|\s)(?:(?:on|in|from|of) (?:this|the) (?:page|site|website|web page|tab)|this (?:page|site|website|web page|tab))(?=\s|$)/;

// ------------------------------------------------------------------------ opening (G1's words)

// What opening a page takes (the windows builder's matchChromeCommand: G1 and G3, src/lib/chrome-commands.js):
// "pull this up in Chrome", "look it up in Chrome", "open the second link", "google …", "search for …
// in Chrome", "open YouTube in Chrome", "go to amazon.com". It is the cheaper move (no clicks, no task
// budget): a task needs more than that. ("Find … in Chrome" is not one of its searches: it is a task.)
const OPEN_THIS =
  /^(?:(?:pull|bring|put|open|show|load|get|throw|send|take)(?: me)? (?:this|that|it)(?: (?:page|link|one|thing))?(?: up)?|(?:pull|bring|open|show) up (?:this|that|it)(?: (?:page|link|one|thing))?|(?:open|show) (?:this|that|it) up|(?:look|search) (?:it|this|that) up|google (?:it|this|that|them))$/;
const OPEN_LINK = /^(?:open|pull up|bring up|show me|go to|load)(?: up)? (?:the )?(?:(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last|top) )?(?:link|links|source|sources|website|site)(?: \d+)?$|^open link \d+$/;
const OPEN_SEARCH = /^(?:google|search(?: on)? google for|look (?:on )?google for|search(?: for)?|look up) (?!(?:it|this|that)$)\S|^(?:search|look) .+ up$/;
const OPEN_SITE = /^(?:open|go to|pull up|bring up|load|take me to|show me)(?: up)? (?!(?:it|this|that)$)\S/;
// "Open the second link", "follow the link", "open link 3": the newest reply's link when it has links (G1);
// with none, a link on the page, a task's (lead decision D1, as the windows builder's LINK_RE leaves it).
const LINK_WORDS = /^(?:open|pull up|bring up|show me|go to|load|follow|visit)(?: up)? (?:the )?(?:(?:first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last|top) )?(?:link|source)(?: (?:number )?(?:\d|one|two|three|four|five))?$|^open link \d+$/;
// Words that make it more than opening: an action on the page, or the page itself.
const ACTION = new RegExp(
  '(?:^|\\s)(?:(?:and|then|and then) (?:add|click|compare|pick|choose|select|buy|order|sort|filter|scroll|tell me|read|check|show me|find|open|put|' +
    'sign|fill|book|reserve|subscribe|download|save|apply|send|post|summarize|write|type|enter|log|get me|see if|let me know)' +
    '|to (?:the |my |your )?(?:shopping )?(?:cart|basket|bag|trolley|wish ?list)|(?:on|in|from) (?:this|the) (?:page|site|website))(?=\\s|$)',
);

// "Open that in a new tab", "put it in another tab": a tab of the owner's (G1).
const IN_A_TAB = /^(?:pull|bring|put|open|show|load|get)(?: up)? (?:this|that|it|the \S+(?: \S+)?)(?: up)? (?:in|into|on) (?:a |another |a new |new )?tab$/;

/** How many links the newest reply has (the router's state.reply.links: a list, or a count). */
function replyLinkCount(state) {
  const links = state && state.reply ? state.reply.links : null;
  if (Array.isArray(links)) return links.length;
  const n = Number(links);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isOpening(s, carrier) {
  if (OPEN_THIS.test(s) || OPEN_LINK.test(s) || IN_A_TAB.test(s)) return true;
  if (ACTION.test(s) || hasPageObject(s)) return false;
  // "google X" is a search with or without "in Chrome"; "find X" only with it (else it is Claude's).
  if (/^(?:google|search(?: on)? google for|look (?:on )?google for) /.test(s)) return true;
  if (carrier === 'tail' && (OPEN_SEARCH.test(s) || OPEN_SITE.test(s))) return true;
  // "go to amazon.com", "open youtube": a site said as an address or a known name.
  return !carrier && OPEN_SITE.test(s) && /^(?:open|go to|pull up|bring up|load|take me to)(?: up)? (?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?$/.test(s);
}

// ---------------------------------------------------------------------------- page-bound words

// A thing on the page: "the cheapest one", "that result", "the second item", "the two black ones".
const PAGE_THING = '(?:one|ones|result|results|item|items|product|products|listing|listings|option|options|deal|deals|offer|offers|model|models|version|versions|size|sizes|color|colors|colour|colours|seller|sellers|review|reviews|button|tab|article|articles|video|videos|variant)';
// (Up to three words between, none of them a little word that starts another phrase: "that in a new tab" is not one.)
const LITTLE = '(?:in|into|on|at|to|of|for|from|with|by|a|an|the|and|or|but|it|its|is|are|this|that|these|those|my|your)';
const PAGE_OBJECT = new RegExp(`(?:^|\\s)(?:the|that|this|those|these)(?: (?!${LITTLE}(?:\\s|$))\\S+){0,3}? ${PAGE_THING}(?=\\s|$)`);
function hasPageObject(s) {
  return PAGE_OBJECT.test(s);
}

// Bound to the page in a Chrome context, whatever follows.
const PAGE_BOUND = [
  /^click(?! around(?:\s|$))(?:\s|$)/,
  /^scroll(?:\s|$)/,
  /^add .+ to (?:the |my |your )?(?:shopping )?(?:cart|basket|bag|trolley|wish ?list)(?:\s|$)/,
  /^put .+ (?:in|into) (?:the |my |your )?(?:shopping )?(?:cart|basket|trolley)(?:\s|$)/,
  /^sort (?:it |them |this |these |the results |the list |everything )?by\s/,
  /^filter (?:it |them |this |these |the results |the list |everything )?(?:by|for|to)\s/,
  /^search (?:this|the) (?:site|page|website) for\s/,
  /^(?:go )?back (?:a|one) page$|^go back to the (?:previous|last) page$|^go (?:forward|ahead) (?:a|one) page$/,
  /^(?:go to |show me |open )?(?:the )?(?:next|previous) page(?: of (?:results|the results))?$/,
];
// With a page object: "open the first result", "pick the cheaper one", "now add the second one too".
const PAGE_OBJECT_VERBS = /^(?:open|go to|go into|compare|pick|choose|select|add|find(?: me)?|show me|buy|order|get(?: me)?|grab|read(?: me)?|check|save|tell me about|tell me more about)\s/;

/** In a Chrome context: the words are about the page in the Jarvis window. */
function pageBound(s) {
  if (PAGE_BOUND.some((re) => re.test(s))) return true;
  if (PAGE_WORDS.test(s)) return true;
  return PAGE_OBJECT_VERBS.test(s) && hasPageObject(s);
}

/** True while a Chrome action (an open, a task, "click around for me") is under 2 minutes old, or a task runs. */
export function inChromeContext(state = {}) {
  const chrome = state && typeof state.chrome === 'object' && state.chrome ? state.chrome : {};
  const now = Number.isFinite(state.now) ? state.now : Date.now();
  if (chrome.task && typeof chrome.task === 'object' && ['running', 'waiting', 'paused', 'starting'].includes(chrome.task.status)) return true;
  return Number(chrome.contextUntil) > now;
}

// ------------------------------------------------------------------------------ the matchers

/**
 * The owner's sentence as a Jarvis for Chrome task, or null. The router's layer `destination`, a
 * carrier (no word cap). Paid and not undoable, so never from another reading; always checked.
 * `chat`: 'same' carries on the last task's chat ("now add the second one too"), else 'new'.
 */
export function matchChromeTask(text, state = {}) {
  const p = parse(text);
  if (!p) return null;
  const st = state && typeof state === 'object' ? state : {};
  const s = p.s;
  if (s.split(' ').length > MAX_TASK_WORDS) return null;
  if (namesJarvisThing(p.all)) return null;
  const holo = st.hologram && typeof st.hologram === 'object' ? st.hologram : null;
  if (holo && holo.open && namesPart(p.all, holo.parts)) return null;
  if (matchClickAround(text) || matchChromeStatus(text) || ANSWER_WORDS.test(s)) return null;
  if (QUESTION.test(s) && !PAGE_WORDS.test(s)) return null; // R4
  // A link with no links in the newest reply is one on the page: never G1's then (D1).
  const pageLink = LINK_WORDS.test(s) && !replyLinkCount(st);
  if (!pageLink && isOpening(s, p.carrier)) return null; // G1 opens it (free)
  let via = null;
  // (A question about the page itself, "what's the return policy on this page in Chrome", is a task too.)
  if (p.carrier) via = isInstruction(p) || pageLink || (QUESTION.test(s) && PAGE_WORDS.test(s)) ? 'carrier' : null;
  else if (inChromeContext(st) && (pageLink || pageBound(s))) via = 'context';
  if (!via) return null;
  const words = taskWords(p.words);
  if (words.split(' ').length < 2 && !/^scroll\b/.test(s)) return null;
  const chrome = st.chrome && typeof st.chrome === 'object' ? st.chrome : {};
  const last = [chrome.lastTask, chrome.task].find((t) => t && typeof t === 'object' && t.id);
  const prior = !!last && inChromeContext(st);
  const chat = prior && (via === 'context' || p.follow) ? 'same' : 'new';
  return { do: 'chrome-task', text: words, chat, via, free: false, undo: false, check: true };
}

/**
 * The owner's answer to "What should I do in Chrome?": the task's words, or null (a cancel, a Jarvis
 * thing, a question without page words, a word or two of noise).
 */
export function matchTaskAnswer(text, state = {}) {
  const p = parse(text);
  if (!p) return null;
  if (/^(?:no|nope|nah|nothing|none|cancel|stop|never ?mind|forget it|not now|nothing for now|no thanks|no thank you|leave it)$/.test(p.s)) return null;
  if (ANSWER_WORDS.test(p.s) || namesJarvisThing(p.all) || (QUESTION.test(p.s) && !PAGE_WORDS.test(p.s))) return null;
  const holo = state && state.hologram && typeof state.hologram === 'object' ? state.hologram : null;
  if (holo && holo.open && namesPart(p.all, holo.parts)) return null;
  const words = taskWords(p.words);
  if (words.split(' ').length < 2 || words.split(' ').length > MAX_TASK_WORDS) return null;
  return { text: words };
}

/** True for the answers that drop "What should I do in Chrome?" without a task. */
export function isTaskAnswerCancel(text) {
  const p = parse(text);
  return !!p && /^(?:no|nope|nah|nothing|none|cancel|stop|never ?mind|forget it|not now|nothing for now|no thanks|no thank you|leave it)$/.test(p.s);
}

/** "Click around for me": Jarvis asks "What should I do in Chrome?" (free; the answer is the task). */
export function matchClickAround(text) {
  const p = parse(text);
  const s = p ? (p.carrier ? `${p.s} in chrome` : p.s) : '';
  return /^(?:go |come |start )?click(?:ing)? around(?: for me)?(?: in chrome)?(?: for me)?$|^do some clicking(?: for me)?(?: in chrome)?$/.test(s) ? { do: 'chrome-ask', free: true, undo: true } : null;
}

/**
 * Stop words for the Chrome task (the router's layer `stop`). "Stop Chrome" and its kin name it
 * (`named`: answered even when nothing runs); a bare "stop" stops a running task (and pauses a tour
 * too: the stop layer does both).
 */
export function matchChromeStop(text, state = {}) {
  const p = parse(text);
  if (!p) return null;
  const s = p.carrier ? `${p.s} in chrome` : p.s;
  if (
    /^(?:stop|cancel|end|halt|abort|kill)(?: (?:it|that|the task|the chrome task|what youre doing|everything|clicking|working))?(?: in chrome)?$/.test(s) &&
    (p.carrier || /chrome/.test(s))
  ) {
    return { do: 'chrome-stop', named: true, free: true, undo: false };
  }
  if (/^(?:stop|cancel|end|halt|abort)(?: the)? chrome(?: task)?$|^chrome stop$|^stop jarvis for chrome$/.test(p.s)) {
    return { do: 'chrome-stop', named: true, free: true, undo: false };
  }
  const chrome = state && state.chrome && typeof state.chrome === 'object' ? state.chrome : {};
  const running = !!(chrome.task && typeof chrome.task === 'object' && ['running', 'waiting', 'paused', 'starting'].includes(chrome.task.status));
  if (!running) return null;
  if (/^(?:stop|stop it|stop now|stop stop)$/.test(s)) return { do: 'chrome-stop', named: false, free: true, undo: false };
  // While a task runs, the plain ways of stopping it are Chrome's too (ROUTING-5): "stop that", "stop the task",
  // "cancel the task", "abort", "halt", "kill it", "stop what you're doing", a bare "cancel" (what every check
  // teaches), "whoa, stop". (With a hologram open, "stop that" / "stop this" stay its own: R10.)
  const holo = state && state.hologram && typeof state.hologram === 'object' && state.hologram.open;
  if (holo && /^stop (?:that|this)$/.test(s)) return null;
  // ("Pause", "end" and "kill" need what they stop: a bare "pause" is a walkthrough's word.)
  const what = '(?:it|that|this|the task|the job|what youre doing|what you are doing|clicking|working|that task|this task)';
  if (
    new RegExp(`^(?:stop|cancel|abort|halt)(?: ${what})?$`).test(s) ||
    new RegExp(`^(?:end|pause|kill) ${what}$`).test(s) ||
    /^(?:whoa|woah|hey|hold on) stop(?: it| that)?$/.test(s)
  ) {
    return { do: 'chrome-stop', named: true, free: true, undo: false };
  }
  return null;
}

/**
 * "What are you doing in Chrome?": the latest step (free, local). The bare "how's it going?" is an everyday
 * greeting: it is Chrome's only while a task runs or waits (`state.chrome.task`), or with "Chrome" or "the
 * task" in it (REDTEAM-VOICE-13).
 */
export function matchChromeStatus(text, state = {}) {
  const p = parse(text);
  if (!p) return null;
  const s = p.carrier ? `${p.s} in chrome` : p.s;
  const re =
    /^(?:what are you doing in chrome|what are you up to in chrome|whats happening in chrome|what is happening in chrome|whats going on in chrome|what is going on in chrome|(?:what|whats|what is) chrome doing|(?:how|hows|how is) chrome doing|(?:how|hows|how is) (?:it going|the task going|the chrome task going)(?: in chrome)?|(?:how|hows|how is) the chrome task(?: going)?|where (?:are you|is chrome) (?:at )?(?:in chrome|with the task)|what step is chrome on|what has chrome done(?: so far)?|whats chrome done(?: so far)?|is chrome (?:done|finished)(?: yet)?|chrome status|(?:whats |what is )?the status of the chrome task)$/;
  if (!re.test(s)) return null;
  if (/^(?:how|hows|how is) it going$/.test(s)) {
    const chrome = state && typeof state.chrome === 'object' && state.chrome ? state.chrome : {};
    const t = chrome.task && typeof chrome.task === 'object' ? chrome.task : null;
    if (!t || !['running', 'waiting', 'paused', 'starting'].includes(t.status)) return null;
  }
  return { do: 'chrome-status', free: true, undo: true };
}

// ------------------------------------------------------------------------------ what is said

const SMALL = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** A budget for the ear: 1 -> "a dollar", 3 -> "three dollars", 0.5 -> "50 cents", 1.5 -> "$1.50". */
export function dollarsSaid(usd) {
  const v = Number(usd);
  if (!Number.isFinite(v) || v <= 0) return 'a dollar';
  const cents = Math.round(v * 100);
  if (cents < 100) return `${cents} cents`;
  if (cents % 100 === 0) {
    const d = cents / 100;
    if (d === 1) return 'a dollar';
    return d <= 10 ? `${SMALL[d]} dollars` : `$${d}`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

/** "$1.00", "$0.42": money on the card. */
export function dollarsShown(usd) {
  const v = Number(usd);
  return Number.isFinite(v) && v >= 0 ? `$${v.toFixed(2)}` : '';
}

/** How long the check waits after it was said: 2 s, or 5 s while Jarvis is hidden. */
export function taskCheckMs({ hidden = false } = {}) {
  return hidden ? TASK_CHECK_HIDDEN_MS : TASK_CHECK_MS;
}

/** Said for the price while Jarvis for Chrome hasn't told the app its budget yet (MONEY-3, REDTEAM-VOICE-9). */
export const UNKNOWN_BUDGET_SAID = 'your Chrome budget';

/**
 * The spoken (and shown) check: "Chrome, up to a dollar: <the task>. Say cancel to stop." The price is the
 * budget Jarvis for Chrome reported (limitUsd); while none has been reported (null), "up to your Chrome
 * budget". Typed (`typed`: the chat, a hologram's or Optics' field), nothing listens: "Press Cancel to stop."
 */
export function taskCheckLine({ text, limitUsd = DEFAULT_TASK_LIMIT_USD, typed = false } = {}) {
  const words = String(text ?? '').replace(/\s+/g, ' ').trim();
  const stop = /[?!]$/.test(words) ? '' : '.';
  const price = Number(limitUsd) > 0 ? dollarsSaid(limitUsd) : UNKNOWN_BUDGET_SAID;
  return `Chrome, up to ${price}: ${words}${stop} ${typed ? 'Press Cancel to stop.' : 'Say cancel to stop.'}`;
}

export const TASK_ASK_LINE = 'What should I do in Chrome?';
export const TASK_STARTED_LINE = 'Chrome is on it.';
export const TASK_CANCELLED_LINE = 'Okay, nothing sent to Chrome.';
export const NOTHING_TO_STOP_LINE = 'Okay.';
export const TASK_STOPPED_LINE = 'Stopped Chrome.';
/** A stop on its way (the task is marked stopped only once Jarvis for Chrome confirms it). */
export const TASK_STOPPING_LINE = 'Stopping Chrome…';
/** A stop not confirmed after 10 s (REDTEAM-LINK-1's resends go on meanwhile). */
export const TASK_STOP_UNREACHED_LINE = 'I couldn’t reach Chrome to stop it. Press Stop in its side panel.';
/** On a phone: Chrome tasks run from the Mac (REDTEAM-VOICE-13). */
export const TASK_PHONE_LINE = { show: 'Jarvis for Chrome works with Jarvis on your Mac.', say: 'Chrome tasks work from Jarvis on your Mac.' };

/**
 * Why a task couldn't start (startTask's reason, contract (f)), as { show, say }: `show` on screen
 * may name Jarvis for Chrome; `say` never does (his own name would set off his barge-in).
 */
export function taskRefusal(reason, why = '') {
  switch (reason) {
    case 'unlinked':
      return {
        show: 'Jarvis for Chrome isn’t linked yet. Link it in Settings → Jarvis for Chrome.',
        say: 'Chrome isn’t linked yet. Link it in Settings.',
      };
    case 'offline':
      return {
        show: 'I can’t reach Jarvis for Chrome. Open the Jarvis window and keep it open.',
        say: 'I can’t reach Chrome. Open the Jarvis window and keep it open.',
      };
    case 'off':
      return { show: 'Tasks from Jarvis are off in Jarvis for Chrome.', say: 'Tasks from Jarvis are turned off in Chrome.' };
    case 'busy':
      return { show: 'Chrome is busy with another task. Stop it first?', say: 'Chrome is busy with another task. Stop it first?' };
    case 'cap':
      return { show: 'That’s today’s 30 tasks.', say: 'That’s today’s 30 tasks.' };
    default: {
      const line = why ? `Chrome didn’t take that: ${sayable(why, 160).replace(/[.!?]+$/, '')}.` : 'Chrome didn’t take that.';
      return { show: line, say: line };
    }
  }
}

/** What Jarvis says when a task ends (the extension's `done`), as { show, say }. */
export function taskDoneLine({ status, answer } = {}) {
  const said = sayable(answer, 400);
  const full = sayable(answer, 2000);
  const join = (head, body) => (body ? `${head} ${body}` : head);
  switch (status) {
    case 'done':
      return { show: join('Chrome is done.', full), say: join('Chrome is done.', said) };
    case 'stopped':
      return { show: 'Chrome stopped.', say: 'Chrome stopped.' };
    case 'limit':
      return { show: join('Chrome stopped at its limit.', full), say: join('Chrome stopped at its limit.', said) };
    default:
      return { show: join('Chrome couldn’t finish that.', full), say: join('Chrome couldn’t finish that.', said) };
  }
}

/** "What are you doing in Chrome?": the latest step of the task (or that there is none). */
export function taskStatusLine(task) {
  const t = task && typeof task === 'object' ? task : null;
  if (!t || !t.status) return 'Chrome isn’t doing anything right now.';
  const what = sayable(t.text, 160);
  const step = sayable(t.narration || t.lastStep, 200);
  if (t.status === 'waiting') return `Chrome is waiting for you${what ? ` on: ${what.replace(/[.!?]+$/, '')}` : ''}.`;
  if (t.status === 'paused') return `Chrome is paused${what ? ` on: ${what.replace(/[.!?]+$/, '')}` : ''}.`;
  if (['running', 'starting'].includes(t.status)) {
    const head = what ? `Chrome is working on: ${what.replace(/[.!?]+$/, '')}.` : 'Chrome is working.';
    return step ? `${head} Latest: ${step.replace(/[.!?]+$/, '')}.` : head;
  }
  if (t.status === 'done') return what ? `Chrome finished: ${what.replace(/[.!?]+$/, '')}.` : 'Chrome finished.';
  if (t.status === 'stopped') return 'Chrome stopped.';
  return 'Chrome isn’t doing anything right now.';
}

/**
 * Text from the extension (its narration, a step, an answer, its `spoken` line), made safe to say:
 * one line, at most `max` characters, "Jarvis for Chrome" said as "Chrome", and a quote of page
 * text dropped when it is long or holds "approve", "cancel", "say" or "yes" (critique M4: a page
 * imitating Jarvis). Information only: what is said is never taken as an order.
 */
export function sayable(text, max = 300) {
  let s = String(text ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤﻿]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/jarvis\s+for\s+chrome/gi, 'Chrome');
  s = s.replace(/["“]([^"“”]*)["”]/g, (all, inner) => (inner.length > 40 || /\b(?:approve|approved|approving|cancel|say|yes)\b/i.test(inner) ? '“…”' : all));
  if (s.length > max) {
    const cut = s.slice(0, max - 1);
    const at = cut.lastIndexOf(' ');
    s = `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:.!?—–-]+$/, '')}…`;
  }
  return s;
}
