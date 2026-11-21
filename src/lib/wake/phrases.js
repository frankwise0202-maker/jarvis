// Wake Jarvis: the words of the wake routine and of Standby, pure (no DOM).
//
//   homePhrase(text, { name })   "wake up", "daddy's home", "Frank's home", "I'm home" (also after
//                                "Jarvis", "hey Jarvis", "honey", "okay"): the owner is home
//   openingIntent(text, { name }) the words heard right after waking: 'home' (a home phrase, or what
//                                is left of one: the recognizer started late, "…daddy's home" →
//                                "home"), 'sleep', 'greet' (a fragment of one or two words: "up",
//                                "Jarvis") or 'ask' (a real question: the routine steps aside)
//   standbyCommand(text)          "standby", "Jarvis, standby", "go to sleep", "go back to sleep",
//                                "sleep mode": the whole sentence, nothing else in it (an answer
//                                word before it and thanks after it allowed: "No thanks, go back to
//                                sleep", "Okay, standby")
//   routineReply(text)            after "Shall I put on some AC/DC? Or I can run your evening
//                                briefing.": 'music' | 'brief' | 'sleep' | null (anything else is
//                                a question for Jarvis). Whole sentences, or in pieces: an answer
//                                word (yes / no / sure / okay …) and what follows it ("No, go back to
//                                sleep", "Yes, please do", "Sure, run the briefing"), thanks aside
//   answerParts(text)             { answer: 'yes' | 'no', rest } for such a reply, else null
//   greetingLine({ now, name, home })   "Welcome home, Frank." | "Good evening, Frank."
//   suggestionLine({ artist, part })    "Shall I put on some AC/DC? Or I can run your evening briefing."
//   partOfDayFor(date)            'morning' (0–11) | 'afternoon' (12–16) | 'evening' (17–23): one
//                                rule for the greeting, the offer and the briefing itself (the
//                                briefing protocol's and Presence's split: after midnight is morning)

/** Lowercase words: apostrophes kept inside words (curly ones made straight), the rest dropped. */
export function normalizeWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/'+(?=\s|$)|(^|\s)'+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Words the owner may say first that change nothing ("Jarvis, wake up", "okay, I'm home").
const LEAD = /^(?:(?:hey|hi|hello|ok|okay|oh|well|so|yo|honey|darling|um|uh|ah)\s+)*(?:jarvis\s+)?(?:(?:hey|hi|hello|ok|okay|oh|well|so|honey|darling)\s+)*/;
// …and at the end ("I'm home, Jarvis", "wake up please").
const TAIL = /(?:\s+(?:jarvis|please|now|buddy|pal|mate|sir|then))*$/;

function core(text) {
  return normalizeWords(text).replace(LEAD, '').replace(TAIL, '').trim();
}

const HOME_PEOPLE = ['daddy', 'dad', 'papa', 'pops', 'mommy', 'mummy', 'mom', 'mum', 'mama', 'the boss', 'boss', 'the man', 'the master'];

function nameWords(name) {
  const n = normalizeWords(name);
  if (!n || n === 'sir') return [];
  const first = n.split(' ')[0];
  return first && first !== n ? [n, first] : [n];
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "wake up", "daddy's home", "<name>'s home", "I'm home" (and close variants), the whole sentence. */
export function homePhrase(text, { name = '' } = {}) {
  const t = core(text);
  if (!t) return false;
  const who = [...HOME_PEOPLE, ...nameWords(name)].map(escapeRe).join('|');
  const home = `(?:(?:${who})(?:'s| is|s)|i'm|im|i am|we're|were|we are) (?:home|back|back home|here)`;
  const wake = "(?:wake up|wakey wakey|rise and shine|time to wake up|it's time to wake up|you awake|are you awake)";
  const re = new RegExp(`^(?:${wake}(?: ${home})?|${home}(?: ${wake})?|${wake} ${wake}|honey ${home})$`);
  return re.test(t);
}

/** The words heard right after waking: 'home' | 'sleep' | 'greet' | 'ask'. */
export function openingIntent(text, { name = '' } = {}) {
  const t = core(text);
  if (!t) return 'greet';
  if (standbyCommand(text)) return 'sleep';
  if (homePhrase(text, { name })) return 'home';
  const words = t.split(' ');
  // "Hey Jarvis, wake up, daddy's home": the microphone opens a moment after the wake word, so the
  // owner's words may come in cut ("daddy's home", "up daddy's home", "home").
  if (words.length <= 5 && words.some((w) => w === 'home' || w === "home's")) return 'home';
  if (words.length <= 2) return 'greet';
  return 'ask';
}

const STANDBY = /^(?:(?:go |go back |back )?to sleep|go back to sleep|sleep|sleep mode|standby|stand by|standby mode|go to standby|go into standby|standby please|you can go to sleep|you can sleep now|time to sleep|goodnight|good night)$/;

/**
 * "standby", "go to sleep", "go back to sleep" and nothing else (a question about sleep is not it),
 * also after an answer word or before thanks: "No thanks, go back to sleep", "Okay, standby".
 */
export function standbyCommand(text) {
  const t = core(text);
  if (!t) return false;
  if (STANDBY.test(t)) return true;
  const p = answerParts(text);
  return !!p && !!p.rest && STANDBY.test(p.rest);
}

const YES = /^(?:yes|yeah|yep|yup|sure|please|yes please|ok|okay|alright|all right|absolutely|of course|definitely|go ahead|do it|go for it|sounds good|sounds great|perfect|why not|let's do it|let's hear it|let's go|i'd love that|that'd be great|that would be great|play it|play that|play them|put it on|put them on|put that on|hit it|music|the music|play music|play some music|some music|the first one|yes play it|yeah play it|sure play it|please play it)$/;
const BRIEF = /^(?:brief me|briefing|the briefing|my briefing|a briefing|(?:the |my )?(?:morning|afternoon|evening|night) briefing|run (?:the |my )?(?:\w+ )?briefing|run it|do the briefing|give me (?:the |my |a )?briefing|give me the (?:news|rundown)|catch me up|update me|(?:the )?briefing please|brief me please|yes brief me|the second one|the news|news)$/;
const NO = /^(?:no|nope|nah|no thanks|no thank you|not|not now|not right now|maybe later|later|never mind|nevermind|nothing|nothing thanks|that's all|that's it|that will be all|that'll be all|i'm good|im good|i'm fine|all good|no i'm good|no that's all|go back to sleep|back to sleep|go to sleep|sleep|standby|stand by|goodnight|good night)$/;
// What may follow a yes: "Yes, please do", "Yeah, sure", "Okay, go ahead".
const AFFIRM = /^(?:please do|do|do it|please|sure|yes|yeah|go ahead|go for it|of course|why not|sounds good|sounds great|that sounds good|that'd be great|that would be great|i'd love that|let's do it|let's hear it|let's go|play it|play that|put it on|put that on|hit it|the music|music|some music|play music|play some music)$/;
// The answer words a reply may start with (longest first) and the thanks it may end with.
const ANSWER = /^(no thank you|no thanks|not right now|not tonight|not now|not yet|not really|maybe later|nope|nah|no|yes please|yes|yeah|yep|yup|sure|okay|ok|alright|all right|of course|absolutely|definitely|thank you|thanks)(?: (?:thanks|thank you|please))?(?: (.+))?$/;
const THANKS = /(?:\s+(?:thanks|thank you|thanks a lot|thank you very much|cheers))+$/;
const NO_WORDS = new Set(['no thank you', 'no thanks', 'not right now', 'not tonight', 'not now', 'not yet', 'not really', 'maybe later', 'nope', 'nah', 'no']);
const THANKS_WORDS = new Set(['thank you', 'thanks']);

/**
 * A reply in pieces: the answer word it starts with and what follows, thanks and "Jarvis" aside.
 * "No thanks, go back to sleep." → { answer: 'no', rest: 'go back to sleep' }; "Yes, please do" →
 * { answer: 'yes', rest: 'do' }; "Thanks, go back to sleep" → { answer: 'thanks', rest: … }; null
 * when it starts with no answer word.
 */
export function answerParts(text) {
  const t = core(text)
    .replace(THANKS, '')
    .replace(/(?:\s+(?:jarvis|please))+$/, '')
    .trim();
  const m = ANSWER.exec(t);
  if (!m) return null;
  const rest = (m[2] || '').replace(/^(?:jarvis )+/, '').trim();
  return { answer: NO_WORDS.has(m[1]) ? 'no' : THANKS_WORDS.has(m[1]) ? 'thanks' : 'yes', rest };
}

/** The owner's answer to the wake routine's offer: 'music' | 'brief' | 'sleep' | null. */
export function routineReply(text) {
  const t = core(text);
  if (!t) return null;
  if (BRIEF.test(t)) return 'brief';
  if (NO.test(t)) return 'sleep';
  if (YES.test(t)) return 'music';
  // In pieces: "No, go back to sleep", "Not now, thanks", "Yes, please do", "Sure, run the briefing".
  const p = answerParts(text);
  if (!p) return null;
  const rest = p.rest.replace(/^just /, '');
  if (!rest) return p.answer === 'no' ? 'sleep' : p.answer === 'yes' ? 'music' : null; // "Thank you." alone: unclear
  if (BRIEF.test(rest)) return 'brief';
  if (NO.test(rest) || STANDBY.test(rest)) return 'sleep';
  if (p.answer !== 'no' && (YES.test(rest) || AFFIRM.test(rest))) return 'music';
  return null; // "Yes, and what's the weather?", "No, play Highway to Hell": not the routine's
}

/**
 * 'morning' (0–11), 'afternoon' (12–16), 'evening' (17–23): the briefing protocol's split (its own
 * prompt opens "Good morning" before noon) and Presence's. The greeting and the offer both use it,
 * so after midnight Jarvis says "Good morning … your morning briefing", as the briefing will.
 */
export function partOfDayFor(date = new Date()) {
  const h = date instanceof Date && !Number.isNaN(date.getTime()) ? date.getHours() : 12;
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
}

/** The greeting: "Welcome home, Frank." after a home phrase, else by the time of day (partOfDayFor). */
export function greetingLine({ now = new Date(), name = '', home = false } = {}) {
  const who = String(name || '').trim() || 'sir';
  if (home) return `Welcome home, ${who}.`;
  return `Good ${partOfDayFor(now)}, ${who}.`;
}

/** The offer: music (when Apple Music found something) and the briefing for the time of day. */
export function suggestionLine({ artist = '', part = 'evening' } = {}) {
  const who = String(artist || '').trim();
  const brief = `${part} briefing`;
  return who ? `Shall I put on some ${who}? Or I can run your ${brief}.` : `Shall I run your ${brief}?`;
}
