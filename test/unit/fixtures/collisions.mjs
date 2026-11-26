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
    // R10: the laptop's camera part, with "Say 'open Optics' for your camera." (optics' optics-camera-part
    // once merged, before the hologram's own entry; the hologram's entry and its hint until then).
    r('open the camera', 'VH', ['optics-camera-part', 'hologram'], "R10: the laptop's camera part, with \"Say 'open Optics' for your camera.\""),
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
    // Every builder together (found by a trial merge of every branch): rows for one builder's state or
    // matcher next to another's. Each waits until the builder named is merged (its state, its matcher).
    ...['T', 'TD', 'VHW', 'H4', 'H4O'].flatMap((st) => ['open the camera', 'camera on', 'show me the camera'].map((w) => r(w, st, 'optics-camera-part', "R10: a laptop hologram is on screen: its camera part, with the hint for Optics", 'optics'))),
    r('put the picture to the side', 'LV', 'screens', 'no Look on screen: a Screens float, as today', 'optics'),
    r("that's enough", 'OPA', 'optics', "Optics' own words come first while it is on top (v8.0)", 'optics'),
    r("what's on my screen", 'OPA', 'screen-look', "the owner's screen, not a Look of the camera (C5)", 'optics'),
    r('do this in this window', 'OPA', 'windows', 'a window the owner names, not a question about "this"', 'optics'),
    r('show me the hologram window', 'OPA', 'windows', 'a window the owner names, not a question about the picture', 'optics'),
    r('expand it', 'OPA', 'optics-card', "a Look is on screen: its picture, big", 'optics'),
    ...['repeat', 'say that again', 'repeat that'].map((w) => r(w, 'CV-prompt-tour', 'tour', "the tour's step again: the tour is on top (Chrome's question waits)", 'chrome-voice')),
    r("that's enough", 'CV-prompt-tour', 'tour', 'ends the tour (Chrome\'s question waits)', 'chrome-voice'),
    r('stop', 'CV-prompt-tour', 'stop', 'pauses the tour; a bare "stop" is never an answer to Chrome', 'chrome-voice'),
    r('okay stop', 'CV-prompt-tour', 'stop', 'pauses the tour; a bare "stop" is never an answer to Chrome', 'chrome-voice'),
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
export const CHROME_VOICE = {
  rows: [
  ],
};

// ==== windows =========================================================================================
export const WINDOWS = {
  rows: [
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
