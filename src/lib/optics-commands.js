// Words for Optics (pure, no DOM): what the owner says or types while the camera screen is open,
// read as commands the screen carries out itself (free: no tokens), and the follow-up questions its
// chips send.
//
//   matchOpticsCommand(text, { frozen }) -> null | { action, question?, side?, subject?, on? }
//     look      "what am I looking at?", "what is this?", "what do you see?", "look at this",
//               "identify this", "what am I holding?", "can you read this?" (explicit: true), and
//               (with the camera live) any question about "this" or "these" (explicit: false): a
//               Look with these very words
//     ask       (an answer is on screen) a question about "this": asked about the frozen frame
//     flip      "flip", "switch cameras", "use the front camera" (side: 'front'|'rear'|null)
//     close     "close the camera", "camera off", "stop looking", "close"
//     live      "go live", "back to the camera", "unfreeze"
//     more      "tell me more", "more about it"
//     hologram  "hologram of this", "make a hologram of the battery" (subject: 'battery' or null)
//     part      "what's this part?", "what part is that?" (the pin the owner tapped)
//     watch     "watch this" / "stop watching" (on: true | false)
//   Anything else is null: it goes to Jarvis as a normal message (in Voice Mode, a spoken turn).
//
//   isCameraRequest(text)             words plainly about seeing ("what am I looking at?", "look at
//                                     this", "what is this?" on its own): Voice Mode opens the camera
//                                     for them while it is closed. Whole short sentences only: not
//                                     "what do you see as the biggest risk…?", which only starts like
//                                     one, and not "what's that?" or "what is it?", which in a
//                                     conversation are about something Jarvis said.
//   voiceCameraRequest(text, { viewerOpen, cameraAllowed, ios })
//                                     what Voice Mode does with such words while Optics is closed:
//                                     null (Jarvis takes them as usual: not about seeing, or a
//                                     hologram or blueprint is on screen, so "what is this?" is about
//                                     it), 'need-tap' (iPhone, or the camera not allowed yet: "Tap
//                                     Look") or 'look' (open the camera and look)
//
//   hologramRequest(subject)          "Show me a hologram of the AA battery." (the chip's message)
//   partQuestion(pin, frameId)        "What's this part? (the AA battery you pinned on frame f1, at 316, 844)"
//   theName(label)                    "AA battery" -> "the AA battery", "Coffee mug" -> "the coffee mug"

/** Lower case, no "Jarvis," / "hey Jarvis" / "please", no punctuation, single spaces. */
export function normalizeOpticsText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey|ok|okay|so|um|uh|and)\s+)*(?:jarvis\s+)?/, '')
    .replace(/^(?:please|can you|could you|would you|will you)\s+/, '')
    .replace(/\s+(?:please|jarvis|for me)$/, '')
    .trim();
}

const LOOK = [
  /^what (?:am i|i'm|i am) (?:looking at|holding|seeing|pointing at|pointing the camera at)\b/,
  /^what(?:'s| is| are) (?:this|that|these|those|it|in front of me|on (?:my|the) (?:desk|table|screen)|here)\b/,
  /^whats (?:this|that|these|those|it)\b/,
  /^(?:what do you see|what can you see|do you see (?:this|that|it|these)|(?:can you )?see (?:this|that|it|these|me))\b/,
  /^(?:take a look|have a look|look at (?:this|that|it|these|those|me)|look here|look)\b/,
  /^(?:identify|recognize|recognise|read|describe) (?:this|that|it|these|those|what you see)\b/,
  /^(?:tell me what (?:this|that|these|those|it) (?:is|are)|tell me what you see)\b/,
  /^what (?:brand|model|make|kind|type|sort) (?:is|of) (?:this|that|it|these)\b/,
  /^what about (?:now|this|this one)\b/,
  /^(?:and )?(?:now|this one)$/,
];
// A question about "this" / "these" (is this ripe? how do I fix this?): with the camera live, a Look.
const DEICTIC = /\b(?:this|these|this one|this thing|here)\b/;
const QUESTION_START = /^(?:what|whats|which|who|where|when|why|how|is|are|can|could|should|would|will|do|does|did|was|were|tell me|explain|show me)\b/;

const FLIP = [
  /^(?:flip|switch|swap|change|turn)(?: (?:the|my))?(?: (?:camera|cameras|cam|lens|view))?(?: around)?$/,
  /^(?:use|switch to|go to|show me|flip to|change to|turn on) (?:the |my )?(front|back|rear|selfie|other) (?:camera|cam|lens)\b/,
  /^(front|back|rear|selfie) (?:camera|cam)$/,
];
const CLOSE = [
  /^(?:close|exit|quit|stop|end|turn off|shut off|shut down|hide|leave)(?: the| my)? (?:camera|optics|looking|camera view|the camera)$/,
  /^(?:camera off|stop looking|close it|close that|done looking|i'm done|that's all|close|exit)$/,
];
const LIVE = [/^(?:go )?live$/, /^(?:back to|resume|show(?: me)?|go back to) (?:the )?(?:camera|live view|live|picture)$/, /^unfreeze(?: it)?$/, /^new (?:look|picture|frame)$/];
const MORE = /^(?:tell me more|more|go on|keep going|more about (?:it|this|that)|tell me more about (?:it|this|that|them))$/;
const PART = /^(?:what(?:'s| is) (?:this|that) part|whats (?:this|that) part|what part is (?:this|that|it)|what is (?:this|that) piece|what's (?:this|that) piece)\b/;
const WATCH_ON = /^(?:start )?watch(?:ing)?(?: (?:this|it|that|for changes))?$/;
const WATCH_OFF = /^(?:stop|end|turn off) watch(?:ing)?$/;

function hologramOf(n) {
  if (!/\bholo ?grams?\b|\bhollow ?grams?\b/.test(n)) return null;
  // "hologram of this", "make a hologram of the battery", "show me this as a hologram", "hologram it".
  if (!/^(?:(?:make|build|show|do|give|create|turn)(?: me)?(?: (?:a|the|this|that|it))?(?: (?:as|into|in))?(?: a)? (?:holo ?gram|hollow ?gram)|(?:a )?holo ?gram|(?:a )?hollow ?gram|show (?:me )?(?:this|that|it) (?:as|in) (?:a )?(?:holo ?gram|hollow ?gram)|(?:can i|could i|let me) (?:see|get|have) (?:a )?(?:holo ?gram|hollow ?gram))\b/.test(n)) return null;
  const m = /\b(?:holo ?gram|hollow ?gram)s? of (?:the |a |an |my |that |this )?(.+)$/.exec(n);
  let subject = m ? m[1].trim() : '';
  if (/^(?:this|that|it|these|those|this one|that one|them|what you see|what i'm (?:looking at|holding))$/.test(subject)) subject = '';
  return { action: 'hologram', subject: subject ? subject.slice(0, 60) : null };
}

// With the camera closed (Voice Mode), only words plainly about seeing open it: whole short
// sentences (every pattern ends in $), with at most a short tail about where to look. A question that
// only starts like one ("what do you see as the biggest risk…", "look at this from the other side")
// is for Jarvis (v7.1: before, these opened the webcam on a Mac and were swallowed on an iPhone).
const SEEN_TAIL = '(?: (?:here|now|right now|in front of (?:me|you)|in my hand|on (?:my|the) (?:desk|table)))?';
const CAMERA_REQUEST = [
  new RegExp(`^what (?:am i|i'm|i am) (?:looking at|holding|seeing|pointing at|pointing the camera at)${SEEN_TAIL}$`),
  new RegExp(`^(?:what do you see|what can you see|tell me what you see|describe what you see)${SEEN_TAIL}$`),
  /^see (?:this|these|me)$/,
  /^do you see (?:this|these)$/,
  /^(?:take|have) a look(?: at (?:this|these|me|what i'm holding))?$/,
  /^look at (?:this|these|me|what i'm holding)$/,
  /^(?:identify|recognize|recognise) (?:this|these|what you see|what i'm holding)$/,
  /^what(?:'s| is| are) (?:this|these)(?: (?:thing|things|object|one))?(?: (?:here|in my hand|i'm holding|on (?:my|the) (?:desk|table)))?$/,
  /^whats (?:this|these)$/,
  /^what(?:'s| is) in front of me$/,
  /^what (?:brand|model|make) (?:is|are) (?:this|these)$/,
];

/** Words that ask Jarvis to look even while the camera is closed (see the header). */
export function isCameraRequest(text) {
  const n = normalizeOpticsText(text);
  return !!n && n.length <= 200 && CAMERA_REQUEST.some((re) => re.test(n));
}

/**
 * Voice Mode, Optics closed (see the header). `cameraAllowed`: the camera permission ('granted',
 * 'prompt', 'denied' or 'unknown'); the camera opens by voice alone only where the browser allows
 * it without a tap: a computer where it was already allowed (iOS asks inside a tap every time).
 */
export function voiceCameraRequest(text, { viewerOpen = false, cameraAllowed = 'unknown', ios = false } = {}) {
  if (viewerOpen || !isCameraRequest(text)) return null;
  return cameraAllowed === 'granted' && !ios ? 'look' : 'need-tap';
}

/**
 * Words said or typed while Optics is open. `frozen`: an answer is on screen (a question about
 * "this" is then a follow-up on that frame, not a new Look). Returns null for anything that is
 * not an Optics command.
 */
export function matchOpticsCommand(text, { frozen = false } = {}) {
  const n = normalizeOpticsText(text);
  if (!n || n.length > 200) return null;
  const words = String(text ?? '').trim();
  const holo = hologramOf(n);
  if (holo) return holo;
  if (PART.test(n)) return { action: 'part', question: words };
  if (MORE.test(n)) return { action: 'more', question: words };
  if (WATCH_OFF.test(n)) return { action: 'watch', on: false };
  if (WATCH_ON.test(n)) return { action: 'watch', on: true };
  for (const re of CLOSE) if (re.test(n)) return { action: 'close' };
  for (const re of LIVE) if (re.test(n)) return { action: 'live' };
  for (const re of FLIP) {
    const m = re.exec(n);
    if (m) {
      const side = m[1] === 'front' || m[1] === 'selfie' ? 'front' : m[1] === 'back' || m[1] === 'rear' ? 'rear' : null;
      return { action: 'flip', side };
    }
  }
  for (const re of LOOK) if (re.test(n)) return { action: 'look', question: words, explicit: true };
  if (DEICTIC.test(n) && (QUESTION_START.test(n) || /\?\s*$/.test(words))) return frozen ? { action: 'ask', question: words } : { action: 'look', question: words, explicit: false };
  return null;
}

/** A label as it is said after "the": "AA battery" -> "the AA battery", "Coffee mug" -> "the coffee mug". */
export function theName(label) {
  let s = String(label ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.,;:!?]+$/, '');
  if (!s) return '';
  s = s.replace(/^(?:the|a|an)\s+/i, '');
  const first = s.split(' ')[0];
  // Keep acronyms and model names ("AA", "USB-C", "iPhone"); lower-case an ordinary first word.
  if (/^[A-Z][a-z]+$/.test(first)) s = first.toLowerCase() + s.slice(first.length);
  return `the ${s}`;
}

/** The message "Hologram of this" sends: the tapped pin's object, else the first one named, else "this". */
export function hologramRequest(subject) {
  const name = theName(subject);
  return name ? `Show me a hologram of ${name}.` : 'Show me a hologram of this.';
}

/** The message "What's this part?" sends for the pin the owner tapped (its frame and pixel, for Claude). */
export function partQuestion(pin, frameId) {
  const name = theName(pin && pin.text);
  if (!name) return "What's this part?";
  const where = Number.isFinite(pin.x) && Number.isFinite(pin.y) ? `, at ${Math.round(pin.x)}, ${Math.round(pin.y)}` : '';
  const frame = typeof frameId === 'string' && /^f[1-9]\d{0,3}$/.test(frameId) ? ` on frame ${frameId}` : '';
  return `What's this part? (${name} you pinned${frame}${where})`;
}
