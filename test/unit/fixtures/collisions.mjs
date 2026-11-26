// The collision table (v8.1, T3: u-voice §4.4), one section per builder. Run alone, every matcher is
// asked about every corpus sentence in every state; a sentence that two matchers claim must be
// declared here, with the winner the router must pick (test/unit/command-router.test.mjs, voice's
// harness, checks both). Each builder declares the rows its own phrases create; voice owns the order.
//
//   rows: [{ words, state, winner, why }]
//     words   the sentence
//     state   a state name (the harness's, or a section's own in voice-corpus.mjs)
//     winner  the matcher id the router must pick, or null (Claude)
//     why     one plain sentence (the owner's meaning), for the reader

// ==== mac-dev =========================================================================================
export const MAC_DEV = {
  rows: [
  ],
};

// ==== mac-hf ==========================================================================================
export const MAC_HF = {
  rows: [
  ],
};

// ==== tours ===========================================================================================
export const TOURS = {
  rows: [
  ],
};

// ==== voice ===========================================================================================
// The order's own rows (src/lib/command-order.js): words that mean different things in different states
// (u-voice §4.2), the steals v8.1 fixes (C3), lead decision D1 (a Chrome task before a page in Chrome),
// a Chrome prompt, a tour decision and a research offer all open (critique H4), and today's takes that
// stay on purpose. States: test/unit/fixtures/voice-corpus-base.mjs.
// by: the builder whose change makes the row true (it waits until that builder's module registers something).
const r = (words, state, winner, why, by = null) => ({ words, state, winner, why, ...(by ? { by } : {}) });
const ALL_LOOKS = ['VL', 'VF', 'LV', 'OV'];
const ALL_HOLOS = ['VH', 'H0', 'T', 'TD', 'VHW', 'H4', 'H4O'];
export const VOICE = {
  rows: [
    // "stop" (3): stops what runs; a hologram on top with nothing running holds still.
    r('stop', 'S', 'stop', 'stops the voice'),
    r('stop', 'T', 'stop', 'pauses the tour'),
    r('stop', 'TD', 'stop', 'pauses the tour at its decision'),
    r('stop', 'VH', 'hologram', 'holds the model still'),
    r('stop', 'V0', 'stop', '"Okay." (free; never a paid question)'),
    r('stop', 'LV', 'stop', 'the live view off (stopping is the safe direction)'),
    r('stop', 'C0', 'stop', 'the same in the chat box'),
    r('stop', 'H4', 'stop', 'pauses the tour and stops the Chrome task, with a prompt, a tour decision and a research offer open (H4)'),
    ...['T', 'TD', 'H4', 'H4O'].map((s) => r('okay stop', s, 'stop', 'pauses the tour (and stops a Chrome task)')),
    // back (C3)
    r('go back', 'T', 'tour', 'the step before'),
    r('go back', 'VH', 'hologram', '"There\'s nothing to go back to." (no longer swallowed)'),
    r('back', 'T', 'tour', 'the step before'),
    r('back', 'VH', 'hologram', 'the back view'),
    r('bring everything back', 'VW', 'screens', 'the window comes back'),
    r('bring everything back', 'VH', 'hologram', 'every part shown (no window open)'),
    r('bring everything back', 'H0', 'hologram', 'the same in the hologram\'s field'),
    r('bring everything back', 'VHW', 'screens', 'a window is open: it comes back'),
    r('bring it back', 'V0', 'screens', 'Screens says what it can bring back'),
    // size and windows
    r('make it bigger', 'VH', 'hologram', 'zoom in'),
    r('make it bigger', 'VHW', 'hologram', 'zoom in: "it" is the hologram'),
    r('make the window bigger', 'VHW', 'windows', 'a window noun'),
    ...['VH', 'H0', 'T', 'TD', 'VHW', 'H4', 'H4O'].map((s) => r('expand this in a different window', s, 'screens', 'a window (C3: no longer explodes the hologram)')),
    r('expand it', 'VH', 'hologram', 'explode'),
    r('open the hologram in a window', 'VH', 'screens', 'a window'),
    r('close that window', 'VW', 'windows', 'that window'),
    r('close it', 'VH', 'hologram', 'closes the hologram'),
    r('close it', 'VL', 'optics', 'camera off'),
    // the camera, Optics and the live view
    r('open the camera', 'V0', 'optics-open', 'opens Optics'),
    r('open the camera', 'VH', 'hologram', "R10: the laptop's camera part, with \"Say 'open Optics' for your camera.\""),
    r('open optics', 'VH', 'optics-open', '"Optics" is never a part (R10)'),
    r('show me the camera', 'VF', 'optics', 'back to live'),
    r('look at this', 'VL', 'optics', 'a Look'),
    r('look at this battery', 'VL', 'optics', 'a Look'),
    r('video mode', 'VL', ['optics', 'optics-open'], 'the live view, in the owner\'s own words (E2)', 'optics'),
    r('watch this', 'VL', 'optics', 'Watch, not the live view'),
    r("that's enough", 'T', 'tour', 'ends the tour'),
    r("that's enough", 'LV', 'optics', 'the live view off (v8.0)'),
    r("that's enough", 'VL', 'optics', "Optics' live view words come first while it is on top (v8.0)"),
    r("that's enough", 'VF', 'optics', "Optics' live view words come first while it is on top (v8.0)"),
    r("that's enough", 'S', 'voice-controls', 'stop talking'),
    r('what is this', 'VH', null, 'about the hologram, for Claude'),
    r('what is this', 'V0', 'camera', 'opens the camera and looks'),
    r('how much has the live view cost', 'LV', 'app', 'the readout, free'),
    ...['VL', 'VF', 'LV', 'OV'].map((s) => r('how much have I spent this month', s, 'app', '"this month" is a time, not the scene: the readout, not a Look')),
    // tours and Voice Mode's controls
    r('next', 'T', 'tour', 'the next step'),
    r('next', 'V0', null, 'a question for Claude'),
    r('repeat that', 'T', 'tour', 'says the step again'),
    r('repeat that', 'V0', 'voice-controls', 'says the last answer again'),
    r('new chat', 'T', 'app', 'a new chat (the tour stays where it is)'),
    r('open the library', 'VH', 'app', 'no part is called that'),
    r('enclosed', 'TD', 'question', 'the tour decision, on top'),
    r('no', 'TD', 'question', 'asked last: the tour decision, set aside (it has no "no" of its own)'),
    // Chrome, music, the home base, Standby
    r('pull this up in Chrome', 'VH', 'chrome-open', "opens the hologram's title in Chrome"),
    r('open that in a new tab', 'V0', 'chrome-open', 'a tab, not a popup window (W8)'),
    r('play Back in Black', 'VH', 'music', 'Apple Music'),
    r('brief me', 'V0', 'brain', 'the home base briefing'),
    r('brief me', 'NB', 'briefing', 'no home base: the briefing protocol, its price asked first (C6)'),
    r('look at my screen', 'VH', 'screen-look', 'R10: "my screen" is the owner\'s, not the laptop\'s display (C5)'),
    r('look at my screen', 'H0', 'screen-look', 'R10: "my screen" is the owner\'s (C5)'),
    r('look at my screen', 'VL', 'screen-look', 'a place the owner names comes before Optics\' own "look …" (C5)'),
    r('look at my screen', 'VF', 'screen-look', 'a place the owner names comes before Optics\' own "look …" (C5)'),
    r('look at my screen', 'LV', 'screen-look', 'a place the owner names comes before Optics\' own "look …" (C5)'),
    r('look at my screen', 'OV', 'screen-look', 'a place the owner names comes before Optics\' own "look …" (C5)'),
    ...['T', 'TD', 'VHW', 'H4', 'H4O'].map((s) => r('look at my screen', s, 'screen-look', 'R10: "my screen" is the owner\'s (C5)')),
    ...['VL', 'VF', 'LV', 'OV'].map((s) => r("what's on my screen", s, 'screen-look', 'the owner\'s screen, not a Look of the camera (C5)')),
    r('go to standby', 'VH', 'standby', 'Standby words everywhere'),
    r('go to standby', 'H0', 'standby', "the hologram's field too (C2)"),
    r('go to sleep', 'OT', 'standby', "Optics' field too (C2)"),
    // Lead decision D1: a Chrome task before a page in Chrome; each declines the other's sentences.
    r('open the cheapest one in Chrome', 'V0', 'chrome-task', 'a page object: a task'),
    r('open the second result in Chrome', 'V0', 'chrome-task', 'a page object: a task'),
    r('click the first result', 'CC', 'chrome-task', 'a page verb in a Chrome context'),
    r('click the first link', 'CC', 'chrome-task', 'a page verb in a Chrome context'),
    r('open the first result', 'CC', 'chrome-task', 'a page object in a Chrome context'),
    r('click the first link', 'V0', null, 'no Chrome context, no "in Chrome": a question for Jarvis'),
    r('open the cheapest one', 'V0', null, 'no Chrome context, no "in Chrome": a question for Jarvis'),
    r('open the second link', 'RL', 'chrome-open', "the newest reply's second link"),
    r('open the second link', 'CCL', 'chrome-open', "the reply's link, in a Chrome context too"),
    r('open the second link', 'CC', 'chrome-task', 'no reply links, in a Chrome context: a task'),
    r('open the second link', 'V0', null, 'no reply links, no Chrome context: a question for Jarvis'),
    r('open youtube', 'CC', 'chrome-open', 'a site, in a Chrome context too'),
    r('google usb c chargers', 'CC', 'chrome-open', 'a search, never a task'),
    r('pull this up in Chrome', 'CC', 'chrome-open', '"this", never a task'),
    r('sort by price', 'CC', 'chrome-task', 'a page verb in a Chrome context'),
    r('sort by price', 'V0', null, 'no Chrome context: a question for Jarvis'),
    r('open the camera', 'CC', 'optics-open', 'a Jarvis thing is never a task (H3)'),
    r('open the library', 'CC', 'app', 'a Jarvis thing is never a task (H3)'),
    // A Chrome prompt, a tour decision and a research offer all open (critique H4).
    r('continue', 'H4', 'tour', 'the tour only: never the prompt, never the offer'),
    r('approve', 'H4', 'prompt', 'the Chrome prompt only'),
    r('cancel', 'H4', 'prompt', 'asked last: the prompt'),
    r('no', 'H4', 'prompt', 'asked last: the prompt'),
    r('cancel', 'H4O', 'question', 'asked last: the research offer'),
    r('no', 'H4O', 'question', 'asked last: the research offer'),
    r('cancel Chrome', 'H4O', 'prompt', 'names Chrome'),
    r('deny', 'H4O', 'prompt', "the prompt's own word"),
    r('stop', 'H4O', 'stop', 'pauses the tour and stops the Chrome task'),
    r('enclosed', 'H4', 'tour', "the tour's own word (the research offer covers its decision)"),
    r('quick', 'H4O', 'question', 'the research offer'),
    // Today's takes that stay on purpose (T1 lets them through).
    ...ALL_HOLOS.flatMap((s) => [
      r('is the camera on', s, 'hologram', "R10: the laptop's camera part is selected (free, undoable)"),
      r('open the hologram of the battery', s, 'hologram', 'selects the battery part (free, undoable)'),
      r('stop that', s, 'hologram', 'holds the model still (free, undoable)'),
    ]),
    ...ALL_LOOKS.flatMap((s) => [
      r('show me a hologram of a jet engine', s, 'optics', "Optics' \"hologram of\": Claude still builds what was named"),
      r('what about now', s, 'optics', 'a Look of the scene now (by design)'),
      r('this one', s, 'optics', 'a Look of the scene now (by design)'),
      r('is this ripe', s, 'optics', 'a question about "this" with the camera on is a Look (by design)'),
    ]),
  ],
};

// ==== chrome-voice ====================================================================================
// With Chrome's question open (or a Chrome check counting down), "stop Chrome" and "cancel Chrome" are
// answers first (layer answer), before the stop layer's "stop Chrome".
export const CHROME_VOICE = {
  rows: [
    { words: 'stop Chrome', state: 'CV-prompt', winner: 'chrome-prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (which closes the question)' },
    { words: 'cancel Chrome', state: 'CV-prompt', winner: 'chrome-prompt', why: 'Chrome asked: its no (Cancel, Deny or Stop), at once' },
    { words: 'stop Chrome', state: 'CV-buy', winner: 'chrome-prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (which closes the question)' },
    { words: 'cancel Chrome', state: 'CV-buy', winner: 'chrome-prompt', why: 'Chrome asked: its no (Cancel, Deny or Stop), at once' },
    { words: 'stop Chrome', state: 'CV-budget', winner: 'chrome-prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (which closes the question)' },
    { words: 'cancel Chrome', state: 'CV-budget', winner: 'chrome-prompt', why: 'Chrome asked: its no (Cancel, Deny or Stop), at once' },
    { words: 'stop Chrome', state: 'CV-prompt-tour', winner: 'chrome-prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (the tour is the bare "stop"\'s)' },
    { words: 'cancel Chrome', state: 'CV-prompt-tour', winner: 'chrome-prompt', why: 'Chrome asked: its no, at once' },
    { words: 'stop Chrome', state: 'CV-check', winner: 'chrome-prompt', why: 'the check counting down is withdrawn: nothing goes to Chrome' },
    { words: 'cancel Chrome', state: 'CV-check', winner: 'chrome-prompt', why: 'the check counting down is withdrawn: nothing goes to Chrome' },
    { words: 'stop', state: 'CV-check', winner: 'chrome-prompt', why: 'the check counting down is withdrawn (nothing goes to Chrome); no task runs yet for the stop layer' },
    { words: 'okay stop', state: 'CV-check', winner: 'chrome-prompt', why: 'the check counting down is withdrawn (nothing goes to Chrome)' },
    // Voice's H4 states (a Chrome prompt with its answers, a tour's decision, the research offer): the prompt's
    // own words go to voice's 'prompt' first in the answer layer; Voice Mode carries both ids out the same way
    // (answerPrompt: a no at once, a yes in its window and then its check).
    ...['H4', 'H4O'].flatMap((state) => [
      { words: 'stop Chrome', state, winner: 'prompt', why: "the prompt's Stop: the task stops (never the stop layer's, never a tour's)" },
      { words: 'yes, approve', state, winner: 'prompt', why: "the prompt's Approve, then its check" },
    ]),
    { words: 'deny', state: 'H4', winner: 'prompt', why: "the prompt's own word: its no, at once" },
    { words: 'cancel Chrome', state: 'H4', winner: 'prompt', why: 'names Chrome: the prompt\'s no, at once' },
    { words: 'approve', state: 'H4O', winner: 'prompt', why: "the prompt's Approve, then its check (the research offer was asked last, but approve is never its word)" },
    // A hologram open in a Chrome context: today's hologram and screen takes stay (R10, C3).
    { words: 'stop that', state: 'CV-holo', winner: 'hologram', why: 'holds the model still (free, undoable), as with any hologram open' },
    { words: 'expand this in a different window', state: 'CV-holo', winner: 'screens', why: 'a window (C3), as with any hologram open' },
  ],
};

// ==== windows =========================================================================================
// Window words and Chrome's are explicit destinations: they come before the thing on top (Optics here).
const WINDOWS_OVER_OPTICS = ['VL', 'VF', 'OV'].flatMap((state) => [
  { words: 'do this in this window', state, winner: 'windows', why: 'The owner picks the window to work in, even with the camera open.' },
  { words: 'show me the hologram window', state, winner: 'windows', why: 'Bring the hologram window to the front; not a question about the camera picture.' },
  { words: 'look it up on Google', state, winner: 'chrome-open', why: 'A Google search in a tab, not a Look at the camera.' },
]);
export const WINDOWS = {
  rows: [
    ...WINDOWS_OVER_OPTICS,
    // The hologram in a window takes what it takes in the main window (voice's ALL_HOLOS rows), by design.
    ...['WIN2', 'WINH'].flatMap((state) => [
      { words: 'stop that', state, winner: 'windows-hologram', why: 'Holds the model in its window still (free, undoable), as in the main window.' },
      { words: 'open the hologram of the battery', state, winner: 'windows-hologram', why: 'Selects the battery part in its window (free, undoable), as in the main window.' },
    ]),
    // Lead decision D1 (chrome.task before chrome.open): "open the Nth link" is the reply's link only when the
    // newest reply has links; page words are never chrome.open's, links or not. Out of a Chrome context they reach
    // Claude, unless they say "in Chrome" (a Chrome task). voice's rows cover the Chrome context (CC, CCL).
    { words: 'open the second link', state: 'WINL', winner: 'chrome-open', why: 'The newest reply has links: its second one, in Chrome.' },
    { words: 'open the second link', state: 'V0', winner: null, why: 'No links in the newest reply and no Chrome task: a question for Jarvis.' },
    { words: 'click the first link', state: 'WINL', winner: null, why: '"Click …" is a page verb: never chrome.open (a Chrome task in a Chrome context).' },
    { words: 'open the first result', state: 'WINL', winner: null, why: 'A page object: never a Google search (a Chrome task in a Chrome context).' },
    { words: 'click the first result', state: 'V0', winner: null, why: '"Click …" is a page verb: never chrome.open (a Chrome task in a Chrome context).' },
    { words: 'click the first result', state: 'WINL', winner: null, why: 'The reply\'s links don\'t make "click …" chrome.open\'s.' },
    { words: 'open the first result', state: 'V0', winner: null, why: 'A page object with no Chrome context: a question for Jarvis.' },
    { words: 'open the cheapest one in Chrome', state: 'WINL', winner: 'chrome-task', why: 'A page object "in Chrome": a Chrome task, even when the reply has links.' },
    { words: 'open the second result in Chrome', state: 'WINL', winner: 'chrome-task', why: 'A page object "in Chrome": a Chrome task, even when the reply has links.' },
  ],
};

// ==== optics ==========================================================================================
export const OPTICS = {
  rows: [
  ],
};

// ==== chrome-relay ====================================================================================
export const CHROME_RELAY = {
  rows: [
  ],
};

// ==== chrome-ext ======================================================================================
export const CHROME_EXT = {
  rows: [
  ],
};

/** Every section by builder (the harness reads this). */
export const SECTIONS = Object.freeze({
  'mac-dev': MAC_DEV,
  'mac-hf': MAC_HF,
  'tours': TOURS,
  'voice': VOICE,
  'chrome-voice': CHROME_VOICE,
  'windows': WINDOWS,
  'optics': OPTICS,
  'chrome-relay': CHROME_RELAY,
  'chrome-ext': CHROME_EXT,
});
