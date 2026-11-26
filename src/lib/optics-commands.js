// Words for Optics (pure, no DOM): what the owner says or types while the camera screen is open,
// read as commands the screen carries out itself (free: no tokens), and the follow-up questions its
// chips send.
//
//   matchOpticsCommand(text, { frozen }) -> null | { action, question?, side?, subject?, on?, name? }
//     look      "what am I looking at?", "what is this?", "what do you see?", "look at this",
//               "identify this", "what am I holding?", "can you read this?" (explicit: true), and
//               (with the camera live) any question about "this" or "these" (explicit: false): a
//               Look with these very words. "Look" alone, "look here", "look now", "look at this /
//               that / it / me" with at most three more words; never "look up …", "look into …",
//               "look at my calendar" or "look it up", which are for Jarvis (v8.1). fresh: true
//               (v8.1) for words that always take a new picture: "look again", "new look", "what
//               about now?", "take a picture", "take a photo" (question: "What am I looking at?"
//               when the words are not a question themselves)
//     ask       (an answer is on screen) a question about "this": asked about the frozen frame
//     flip      "flip", "switch cameras", "use the front camera" (side: 'front'|'rear'|null)
//     camera    (v8.1) "use the Logitech camera", "switch to the MacBook camera" (name: the word
//               to find in the cameras' names)
//     close     "close the camera", "camera off", "stop looking", "close"
//     live      "go live", "back to the camera", "unfreeze", "back to live", "show the live video"
//               (with a Look set aside on a Mac, v8.1: the picture goes back into its card)
//     expand    (v8.1) "expand the picture", "show the picture big": the Look's picture fills the
//               stage, the live video in a corner tile
//     aside     (v8.1) "put the picture aside", "put the picture to the side": back to the card
//     close-card (v8.1) "close the picture": the Look's card goes (the camera stays on)
//     more      "tell me more", "more about it"
//     hologram  "hologram of this", "make a hologram of the battery" (subject: 'battery' or null)
//     part      "what's this part?", "what part is that?" (the pin the owner tapped)
//     watch     "watch this" / "stop watching" (on: true | false)
//     liveview  (v8.0) "live view", "start live view", "turn on live view", "watch me", "keep
//               watching", and (v8.1) "video mode", "start video mode", "turn on video mode" (on:
//               true); "stop live view", "turn off live view", "that's enough", "video mode off",
//               "stop video mode" (on: false). "Stop watching" stays a watch command: it stops
//               whichever is on. "Show the live video" is Live, never the live view.
//   Anything else is null: it goes to Jarvis as a normal message (in Voice Mode, a spoken turn).
//
//   asideQuestionRoute(text, { cmd, labels, sceneChanged })
//                                     (v8.1) a question asked while a Look sits in its card beside
//                                     the live video: 'card' (a follow-up on that picture, no new
//                                     frame) or 'look' (a new Look): explicit follow-ups and the
//                                     card's own labels go to the card; "look again" and the like
//                                     always look; anything else goes to the card only while the
//                                     scene hasn't changed since the card's picture
//   voiceOpticsOpen(text, { cameraAllowed, ios, hidden })
//                                     (v8.1) "open optics", "open the camera", "camera on", "start
//                                     the camera", "show me the camera" (and the camera switches),
//                                     free, with Optics closed: 'open' (a Mac where the camera is
//                                     allowed, Jarvis on screen), 'need-front' (Jarvis hidden: the
//                                     camera only runs on screen), 'need-tap' (iPhone, or not
//                                     allowed yet: "Tap Look"), or null
//
//   isCameraRequest(text)             words plainly about seeing ("what am I looking at?", "look at
//                                     this", "what is this?" on its own): Voice Mode opens the camera
//                                     for them while it is closed. Whole short sentences only: not
//                                     "what do you see as the biggest risk…?", which only starts like
//                                     one, and not "what's that?" or "what is it?", which in a
//                                     conversation are about something Jarvis said.
//   voiceCameraRequest(text, { viewerOpen, cameraAllowed, ios, hidden })
//                                     what Voice Mode does with such words while Optics is closed:
//                                     null (Jarvis takes them as usual: not about seeing, or a
//                                     hologram or blueprint is on screen, so "what is this?" is about
//                                     it), 'need-tap' (iPhone, or the camera not allowed yet: "Tap
//                                     Look"), 'need-front' (v8.1: Jarvis hidden on a Mac) or 'look'
//                                     (open the camera and look). "Take a picture" (v8.1) too.
//
//   isLiveViewRequest(text)           (v8.0) whole sentences that start the live view ("live view",
//                                     "watch me", "keep watching"): Voice Mode opens the camera for
//                                     them while it is closed, by the same rule as a Look
//   voiceLiveViewRequest(text, { cameraAllowed, ios })
//                                     null, 'need-tap' (iPhone, or the camera not allowed yet) or
//                                     'start' (open the camera and start the live view)
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
  // "Look" alone, "look here / now", "look at this / that / it / me" with at most three more words,
  // "take a look (at this …)" (v8.1: before, any sentence starting with "look" was a Look: "look up
  // the battery part number", "look into the warranty", "take a look at my calendar").
  /^(?:look|look here|look now|(?:take|have) a (?:quick )?look)$/,
  /^(?:look|(?:take|have) a (?:quick )?look) at (?:this|that|it|these|those|me)(?: [a-z0-9']+){0,3}$/,
  /^(?:identify|recognize|recognise|read|describe) (?:this|that|it|these|those|what you see)\b/,
  /^(?:tell me what (?:this|that|these|those|it) (?:is|are)|tell me what you see)\b/,
  /^what (?:brand|model|make|kind|type|sort) (?:is|of) (?:this|that|it|these)\b/,
  /^what about (?:this|this one)\b/,
  /^(?:and )?this one$/,
];
// Words that always take a new picture, even with a Look on screen or in its card (v8.1). The
// question stays the owner's when it is one ("What about now?"); a bare command ("take a picture",
// "new look") asks the default question.
const FRESH_QUESTION = [/^what about now\b/, /^(?:and )?now$/];
const FRESH = /^(?:look again|look closer|look again now|(?:take|have) (?:another|a closer|a new|one more) look|another look|new look|new (?:picture|photo|frame)|(?:take|snap|grab) (?:a |another |one more |a new |a quick )?(?:picture|photo|pic|snapshot)(?: of (?:this|that|it|me|these|what i'm holding|what i'm looking at))?)$/;
export const FRESH_LOOK_QUESTION = 'What am I looking at?';
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
const LIVE = [/^(?:go )?live$/, /^(?:back to|resume|show(?: me)?|go back to) (?:the )?(?:camera|live view|live|picture|live video|live camera)$/, /^unfreeze(?: it)?$/, /^(?:the )?live video$/];
// v8.1, a Look set aside beside the live video (Mac): its picture big, back into its card, or gone.
const PICTURE = '(?:the |this |that )?(?:picture|photo|image|look)';
const EXPAND = new RegExp(`^(?:expand|enlarge|maximi[sz]e|blow up) ${PICTURE}$|^(?:expand|enlarge) (?:it|this)$|^(?:show|make|put) (?:me )?${PICTURE} (?:big|bigger|large|larger|full size|full screen)$`);
const ASIDE = new RegExp(`^(?:put|set|move) ${PICTURE} (?:aside|to the side|on the side|back in (?:its|the) card)$|^(?:put|set) (?:it|this) aside$|^shrink ${PICTURE}$`);
const CLOSE_CARD = new RegExp(`^(?:close|hide|dismiss|clear|remove|put away) ${PICTURE}$`);
// v8.1: a camera by name ("use the Logitech camera"), found among the cameras' names (cameras.js).
const NAMED_CAMERA = /^(?:use|switch to|change to|go to|show me) (?:the |my )?(logitech|macbook|mac|built in|builtin|iphone|continuity|external|usb|desk view|studio display) (?:camera|webcam|cam)$/;
const MORE = /^(?:tell me more|more|go on|keep going|more about (?:it|this|that)|tell me more about (?:it|this|that|them))$/;
const PART = /^(?:what(?:'s| is) (?:this|that) part|whats (?:this|that) part|what part is (?:this|that|it)|what is (?:this|that) piece|what's (?:this|that) piece)\b/;
const WATCH_ON = /^(?:start )?watch(?:ing)?(?: (?:this|it|that|for changes))?$/;
const WATCH_OFF = /^(?:stop|end|turn off) watch(?:ing)?$/;
// v8.0 Live view (Jarvis watches, live, for up to an hour): whole sentences only.
// v8.1: "video mode" is the owner's own word for it (never "go live" or "live video": those are the
// live camera).
const LIVE_VIEW_ON = /^(?:(?:start|begin|turn on|switch on|use|go into|switch to)(?: the)? (?:live view|video mode)|(?:live view|video mode)(?: on| please)?|turn(?: the)? (?:live view|video mode) on|watch me|keep watching(?: me)?)$/;
const LIVE_VIEW_OFF = /^(?:(?:stop|end|turn off|switch off|exit|leave)(?: the)? (?:live view|video mode)|(?:live view|video mode) off|turn(?: the)? (?:live view|video mode) off|that's enough|thats enough|that is enough)$/;

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
  // v8.1 (E7): "take a picture", "take a photo of this": a Look, once the camera is on.
  /^(?:take|snap|grab) (?:a |another |one more |a new |a quick )?(?:picture|photo|pic|snapshot)(?: of (?:this|that|it|me|these|what i'm holding|what i'm looking at))?$/,
];
// v8.1 (E2): open Optics, free, no Look. Whole sentences only: never "open the camera app on my phone"
// or "turn on the camera flash".
const CAMERA_THING = '(?:the |my )?(?:camera|webcam|web cam|optics|camera view)';
const OPEN_OPTICS = new RegExp(`^(?:optics|camera on|optics on|webcam on|(?:open|open up|launch|start|turn on|switch on|show me|bring up|pull up|fire up) ${CAMERA_THING}|(?:turn|switch) ${CAMERA_THING} on)$`);

/** v8.0: words that start the live view (see the header). */
export function isLiveViewRequest(text) {
  const n = normalizeOpticsText(text);
  return !!n && n.length <= 60 && LIVE_VIEW_ON.test(n);
}

/**
 * Voice Mode, Optics closed: "live view" (or "watch me", "keep watching") opens the camera by the
 * same rule as "what am I looking at?": by voice alone only on a computer where the camera is
 * already allowed ('start'); else Jarvis asks for the tap ('need-tap'). Null for other words.
 */
export function voiceLiveViewRequest(text, { cameraAllowed = 'unknown', ios = false } = {}) {
  if (!isLiveViewRequest(text)) return null;
  return cameraAllowed === 'granted' && !ios ? 'start' : 'need-tap';
}

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
export function voiceCameraRequest(text, { viewerOpen = false, cameraAllowed = 'unknown', ios = false, hidden = false } = {}) {
  if (viewerOpen || !isCameraRequest(text)) return null;
  return openRule({ cameraAllowed, ios, hidden }, 'look');
}

/** The camera opens by voice alone only on a computer where it is allowed and Jarvis is on screen. */
function openRule({ cameraAllowed, ios, hidden }, yes) {
  if (ios) return 'need-tap'; // iOS asks for the camera inside a tap, every time
  if (hidden) return 'need-front'; // the camera never runs while Jarvis is hidden (camera.js)
  return cameraAllowed === 'granted' ? yes : 'need-tap';
}

/** v8.1: "open optics", "open the camera", "camera on" … and the camera switches, as whole sentences. */
export function isOpticsOpenRequest(text) {
  const n = normalizeOpticsText(text);
  if (!n || n.length > 60) return false;
  if (OPEN_OPTICS.test(n) || NAMED_CAMERA.test(n)) return true;
  // "switch cameras", "use the front camera": Optics' own flip words open it too.
  return FLIP.some((re) => re.test(n)) && /\bcam(?:era)?s?\b/.test(n);
}

/**
 * v8.1 (E2), Optics closed: "open optics" and its cousins open the camera, free (no Look).
 * 'open' on a computer where the camera is allowed and Jarvis is on screen; 'need-front' while Jarvis
 * is hidden (the camera only runs on screen: a notification brings him up); 'need-tap' on an iPhone
 * or where the camera isn't allowed yet ("Tap Look to turn the camera on."). Null for other words.
 * Never from a reading the recognizer was less sure of (the caller passes the best reading only).
 */
export function voiceOpticsOpen(text, { cameraAllowed = 'unknown', ios = false, hidden = false } = {}) {
  if (!isOpticsOpenRequest(text)) return null;
  return openRule({ cameraAllowed, ios, hidden }, 'open');
}

/** A label as the owner would say it: lower case, words only ("USB-C charger" -> "usb c charger"). */
function labelWords(label) {
  return normalizeOpticsText(label);
}

/**
 * v8.1 (E1): a question while a Look sits in its card beside the live video. 'card' (a follow-up on
 * that picture: no new frame is sent) or 'look' (a new Look with the newest frame).
 *   - "look again", "new look", "what about now", "take a picture": always a new Look;
 *   - "tell me more", "what's this part?", "about the picture …", or a question naming one of the
 *     card's labels: the card;
 *   - anything else: the card while the scene is the card's (sceneChanged false: the live picture's
 *     64 × 36 thumbnail against the card's, at Watch's thresholds), else a new Look.
 * `cmd`: matchOpticsCommand(text, { frozen: true }) for these words (or null).
 */
export function asideQuestionRoute(text, { cmd = null, labels = [], sceneChanged = false } = {}) {
  if (cmd && cmd.action === 'look' && cmd.fresh) return 'look';
  if (cmd && (cmd.action === 'more' || cmd.action === 'part')) return 'card';
  const n = normalizeOpticsText(text);
  if (/^(?:about|on|regarding|back to) (?:the|this|that) (?:picture|photo|image|look)\b/.test(n) || /\b(?:in|from|on|of) (?:the|this|that) (?:picture|photo|image)\b/.test(n)) return 'card';
  const padded = ` ${n} `;
  for (const label of Array.isArray(labels) ? labels : []) {
    const w = labelWords(label);
    if (w.length >= 3 && padded.includes(` ${w} `)) return 'card';
  }
  return sceneChanged ? 'look' : 'card';
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
  if (LIVE_VIEW_OFF.test(n)) return { action: 'liveview', on: false };
  if (LIVE_VIEW_ON.test(n)) return { action: 'liveview', on: true };
  if (WATCH_OFF.test(n)) return { action: 'watch', on: false };
  if (WATCH_ON.test(n)) return { action: 'watch', on: true };
  if (FRESH.test(n)) return { action: 'look', question: FRESH_LOOK_QUESTION, explicit: true, fresh: true };
  if (FRESH_QUESTION.some((re) => re.test(n))) return { action: 'look', question: words, explicit: true, fresh: true };
  if (EXPAND.test(n)) return { action: 'expand' };
  if (ASIDE.test(n)) return { action: 'aside' };
  if (CLOSE_CARD.test(n)) return { action: 'close-card' };
  for (const re of CLOSE) if (re.test(n)) return { action: 'close' };
  for (const re of LIVE) if (re.test(n)) return { action: 'live' };
  const named = NAMED_CAMERA.exec(n);
  if (named) return { action: 'camera', name: named[1].replace(/^built ?in$/, 'built-in') };
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
