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
// While a tour runs, its words come before the hologram's (layer top: `tour` before `hologram`); at its
// decision with Voice Mode's question on the stack, the question takes the choice (layer answer).
const TOUR_STATES = ['TOUR', 'TOUR_AT', 'TOUR_ASKED', 'TOUR_WAIT', 'TOUR_PAUSED', 'TOUR_FIELD'];
const TOUR_OVER_HOLOGRAM = [
  ['back', 'the previous step, not the back view'],
  ['go back', 'the previous step (no blueprint to close)'],
  ['pause', 'pauses the tour (the hologram would only stop spinning)'],
  ['take me to the battery', "the battery's step, or the camera on it with the tour paused"],
];
const TOUR_ASKED_WORDS = ['enclosed', 'opened', 'both', 'you pick', 'show me that enclosed', 'show it opened', 'show it enclosed', 'show me that opened', 'open it up'];
export const TOURS = {
  rows: [
    ...TOUR_STATES.flatMap((state) => TOUR_OVER_HOLOGRAM.map(([words, why]) => ({ words, state, winner: 'tour', why }))),
    { words: 'open it up', state: 'TOUR_AT', winner: 'tour', why: 'the "opened" choice at the decision (the hologram would explode)' },
    ...TOUR_ASKED_WORDS.map((words) => ({ words, state: 'TOUR_ASKED', winner: 'question', why: "the tour's decision, answered as Voice Mode's question" })),
    // While a tour runs, its "repeat", "say that again", "repeat that" and "that's enough" are the tour's: they come
    // before Voice Mode's own controls (top before app). In voice's tour states too (T, TD, H4, H4O).
    ...[...TOUR_STATES.filter((st) => st !== 'TOUR_FIELD'), 'T', 'TD', 'H4', 'H4O'].flatMap((state) =>
      ['repeat', 'say that again', 'repeat that', "that's enough"]
        .filter((words) => !(state === 'T' && (words === 'repeat that' || words === "that's enough"))) // voice's rows
        .map((words) => ({ words, state, winner: 'tour', why: "the tour's word while it runs (Voice Mode's control otherwise)" })),
    ),
    // voice's tour states: the tour's words over the hologram's (as in this section's own states)
    ...['T', 'TD', 'H4', 'H4O'].flatMap((state) =>
      [...TOUR_OVER_HOLOGRAM.filter(([words]) => !(state === 'T' && (words === 'back' || words === 'go back'))), ['open it up', 'the opened choice at the decision']]
        .filter(([words]) => !(state === 'T' && words === 'open it up'))
        .map(([words, why]) => ({ words, state, winner: 'tour', why })),
    ),
    // voice's tour decision with its question on the stack (TD): the question takes the choice words first
    ...['show me that enclosed', 'show it opened', 'opened', 'both', 'you pick'].map((words) => ({ words, state: 'TD', winner: 'question', why: "the tour's decision, answered as Voice Mode's question" })),
    // A bare "stop" is the stop layer's in a tour state (it stops the voice; the tour pauses with it)
    ...TOUR_STATES.flatMap((state) => ['stop', 'okay stop'].map((words) => ({ words, state, winner: 'stop', why: 'the stop layer: everything that runs stops, the tour pauses' }))),
    // Today's harmless takes with a hologram on screen (voice's base allows them in its hologram states): the same
    // in these states, where a hologram is on screen too.
    ...[...TOUR_STATES, 'HOLO_PICKED'].flatMap((state) => [
      { words: 'stop that', state, winner: 'hologram', why: 'holds the model still (free, undoable), as with any hologram on screen' },
      { words: 'open the hologram of the battery', state, winner: 'hologram', why: 'selects the battery part (free, undoable), as with any hologram on screen' },
      { words: 'expand this in a different window', state, winner: 'screens', why: 'a window, as with any hologram on screen (C3)' },
    ]),
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
    // ROUTING-R2-4: the emphatic no's are bare no's: with Chrome's question asked last (H4) they are its no, as "no" is
    // (voice's prompt entry first; chrome-voice's chrome-prompt says the same).
    ...['no no no', 'No, no, no.', 'no, cancel that', 'Jarvis, no, cancel that.', 'no wait', 'nope, nope', 'no no, never mind', 'nah nah', 'no no'].map((w) => r(w, 'H4', 'prompt', 'asked last: the prompt (its no)')),
    // ROUTING-R2-7: the laptop shown last and closed (VLC) still opens again for a command about the model.
    r('open the hologram of the battery', 'VLC', 'hologram', 'opens the laptop again on its battery (free, undoable)'),
    r('open the hologram of the battery', 'VLCW', 'hologram', 'opens the laptop again on its battery (free, undoable), as in VLC'),
    // ROUTING-R3-1's VLCW (a camera window open): windows' and Screens' words first, as with any window open.
    r('expand this in a different window', 'VLCW', 'screens', 'a window (C3)'),
    r('bring everything back', 'VLCW', 'screens', 'a window is open: it comes back'),
    r('close that window', 'VLCW', 'windows', 'the window with the focus, else the newest'),
    r('make it bigger', 'VLCW', 'windows', 'the window, as with any window open and no hologram on screen'),
    // ROUTING-R3-3's no's with Chrome's question asked last (H4): its no, as "no" is.
    ...['nope', 'nah'].map((w) => r(w, 'H4', 'prompt', 'asked last: the prompt (its no)')),
    r('expand this in a different window', 'VLC', 'screens', 'a window (C3), as with nothing shown last'),
    r('bring everything back', 'VLC', 'screens', "Screens' words with no hologram on screen, as in V0"),
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
    // REDTEAM-VOICE-13: "how's it going?" asks about the Chrome task only while one runs, waits or is starting (with
    // nothing running it is a greeting for Jarvis: the section's `not` rows).
    ...['H4', 'H4O', 'CV-run', 'CV-prompt', 'CV-typed', 'CV-card'].flatMap((state) =>
      ["how's it going", "how's it going, Jarvis", 'how is it going', "hey Jarvis, how's it going"].map((words) => ({ words, state, winner: 'chrome-status', why: 'a Chrome task runs (or waits): the question is about it (free, local)' })),
    ),
    // ROUTING-5: while a Chrome task runs (or waits, or starts), "stop that" stops it (with no hologram open; with one,
    // its own "stop that" holds the model still).
    ...['CV-run', 'CV-prompt', 'CV-typed', 'CV-card'].map((state) => ({ words: 'stop that', state, winner: 'chrome-stop', why: 'a Chrome task runs: the plain way of stopping it stops it (never Claude)' })),
    // A bare "cancel" while a task runs stops it, unless something asked for it: Chrome's question asked last (its
    // no), a countdown typed in the chat (withdrawn), a prompt's card waiting in the chat (its no).
    { words: 'cancel', state: 'CV-prompt', winner: 'chrome-prompt', why: "Chrome's question was asked last: a bare cancel is its no" },
    { words: 'cancel', state: 'CV-typed', winner: 'chrome-typed', why: 'the countdown in the chat is withdrawn: nothing goes to Chrome' },
    { words: 'cancel', state: 'CV-card', winner: 'chrome-typed', why: "the card's no, as its button" },
    // REDTEAM-VOICE-5: typed during a countdown, the check's own words come first (the answer layer): "stop" withdraws
    // it (and stops a task that runs) before voice's bare stop.
    { words: 'stop', state: 'CV-typed', winner: 'chrome-typed', why: 'the countdown in the chat is withdrawn: nothing goes to Chrome' },
    { words: 'okay stop', state: 'CV-typed', winner: 'chrome-typed', why: 'the countdown in the chat is withdrawn: nothing goes to Chrome' },
    { words: 'stop Chrome', state: 'CV-typed', winner: 'chrome-typed', why: 'the countdown in the chat is withdrawn, and a task that runs stops (as by voice during a check)' },
    { words: 'cancel Chrome', state: 'CV-typed', winner: 'chrome-typed', why: 'the countdown in the chat is withdrawn: nothing goes to Chrome' },
    // REDTEAM-VOICE-14: typed with a prompt's card waiting (SPEC §32.3.5): a no goes out as the card's would, a yes
    // points to the card's button.
    { words: 'cancel Chrome', state: 'CV-card', winner: 'chrome-typed', why: "the card's no, as its button (Voice Mode's prompt takes it the same way)" },
    { words: 'spend more in Chrome', state: 'CV-card', winner: 'chrome-typed', why: "a yes typed: the card's button answers it (typing isn't the check)" },
    { words: 'allow once in Chrome', state: 'CV-card', winner: 'chrome-typed', why: "a yes typed: the card's button answers it (typing isn't the check)" },
    // CHROME-VOICE-R4-1: during a check, "tell Chrome to cancel …" is the check's cancel: withdrawn, never a stop for the
    // task that runs (nor, typed, for the countdown's).
    // CHROME-VOICE-R6-1: "tell Chrome to cancel everything" during a check withdraws it and stops the task that runs too
    // (the check's own stop words); typed during a countdown, the same.
    { words: 'Tell Chrome to cancel everything.', state: 'CV-check', winner: 'chrome-prompt', why: 'the check is withdrawn and the task that runs stops too, as with "cancel everything in Chrome"' },
    { words: 'Tell Chrome to cancel everything.', state: 'CV-typed', winner: 'chrome-typed', why: 'the countdown is withdrawn and the task that runs stops too' },
    // "Chrome, stop." with a question or a check open: its own stop (the prompt's stop answer, or the check's).
    ...['CV-budget', 'CV-buy', 'CV-check', 'CV-prompt', 'CV-prompt-tour'].map((state) => ({ words: 'Chrome, stop.', state, winner: 'chrome-prompt', why: "the question's (or the check's) own stop, which stops the task too" })),
    { words: 'Chrome, stop.', state: 'CV-typed', winner: 'chrome-typed', why: "the countdown's own stop, typed" },
    ...['Tell Chrome to cancel.', 'Tell Chrome to cancel that.', 'Tell Chrome to cancel the task.'].flatMap((words) => [
      { words, state: 'CV-check', winner: 'chrome-prompt', why: "the check's own cancel: nothing sent, and the task that runs goes on" },
      { words, state: 'CV-typed', winner: 'chrome-typed', why: "the countdown's own cancel, typed: nothing sent, and the task that runs goes on" },
    ]),
  ],
};

// ==== windows =========================================================================================
// Window words and Chrome's are explicit destinations: they come before the thing on top (Optics here).
const WINDOWS_OVER_OPTICS = ['VL', 'VF', 'OV', 'LV'].flatMap((state) => [
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
      // The layers in order: "stop" stops Jarvis first, window words before the hologram's own.
      { words: 'stop', state, winner: 'stop', why: 'Stop comes first, as with the hologram in the main window.' },
      { words: 'okay stop', state, winner: 'stop', why: 'Stop comes first, as with the hologram in the main window.' },
      { words: 'expand this in a different window', state, winner: 'screens', why: 'A window (C3), never the explode of the hologram in its window.' },
      { words: 'bring everything back', state, winner: 'screens', why: 'Windows are open: they come back (as in VHW), not every part shown.' },
    ]),
    // ROUTING-10: with Optics on top here, the hologram's window takes only words that name the hologram; the rest
    // go where they go with Optics alone (VL, LV), as declared there.
    ...['WINHO', 'WINHV'].flatMap((state) => [
      { words: 'open the hologram of the battery', state, winner: 'windows-hologram', why: 'It names the hologram: the battery part in its window (free, undoable), Optics open or not.' },
      { words: "that's enough", state, winner: 'optics', why: "Optics' live view words come first while it is on top (v8.0), as in VL and LV." },
      { words: "what's on my screen", state, winner: 'screen-look', why: "The owner's screen, not a Look of the camera (C5), as in VL and LV." },
      { words: 'close that window', state, winner: 'windows', why: 'The window with the focus, else the newest; not every window.' },
      { words: 'do this in this window', state, winner: 'windows', why: 'The owner picks the window to work in, even with the camera open.' },
      { words: 'show me the hologram window', state, winner: 'windows', why: 'Bring the hologram window to the front; not a question about the camera picture.' },
      { words: 'put the picture to the side', state, winner: 'screens', why: 'No Look on screen: a Screens float, as in VL and LV.' },
    ]),
    // "Close that window" names a window: the one with the focus, else the newest (windows comes before screens).
    ...['VHW', 'WIN2', 'WINH', 'WINC'].map((state) => ({ words: 'close that window', state, winner: 'windows', why: 'The window with the focus, else the newest; not every window.' })),
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
    // ROUTING-R2-1: with Optics open here, the hologram's window takes what it takes without Optics (D3), Optics' own
    // words aside: "stop that" holds the model in its window still, as in WIN2 and WINH.
    ...['WINHO', 'WINHV', 'WINHF'].map((state) => ({ words: 'stop that', state, winner: 'windows-hologram', why: 'Holds the model in its window still (free, undoable), as without Optics (D3).' })),
    // WINHF (a Look frozen in Optics) as WINHO: it names the hologram.
    { words: 'open the hologram of the battery', state: 'WINHF', winner: 'windows-hologram', why: 'It names the hologram: the battery part in its window (free, undoable), Optics open or not.' },
    // The layers in order, as in WIN2 and WINH: "stop" first, then the windows' own words, then the hologram's.
    ...['WINHO', 'WINHV', 'WINHF'].flatMap((state) => [
      { words: 'stop', state, winner: 'stop', why: 'Stop comes first, as with the hologram in the main window.' },
      { words: 'okay stop', state, winner: 'stop', why: 'Stop comes first, as with the hologram in the main window.' },
      { words: 'expand this in a different window', state, winner: 'screens', why: 'A window (C3), never the explode of the hologram in its window.' },
      { words: 'bring everything back', state, winner: 'screens', why: 'Windows are open: they come back (as in VHW), not every part shown.' },
    ]),
    // WINHF as WINHO and WINHV for the words Optics and the windows share (the same winners as in VF).
    { words: "that's enough", state: 'WINHF', winner: 'optics', why: "Optics' live view words come first while it is on top (v8.0), as in VF." },
    { words: "what's on my screen", state: 'WINHF', winner: 'screen-look', why: "The owner's screen, not a Look of the camera (C5), as in VF." },
    { words: 'close that window', state: 'WINHF', winner: 'windows', why: 'The window with the focus, else the newest; not every window.' },
    { words: 'do this in this window', state: 'WINHF', winner: 'windows', why: 'The owner picks the window to work in, even with the camera open.' },
    { words: 'show me the hologram window', state: 'WINHF', winner: 'windows', why: 'Bring the hologram window to the front; not a question about the camera picture.' },
    { words: 'put the picture to the side', state: 'WINHF', winner: 'screens', why: 'No Look card on screen: a Screens float, as in VF.' },
  ],
};

// ==== optics ==========================================================================================
export const OPTICS = {
  rows: [
    // E2 and R10: with a laptop hologram on screen, its camera part, selected as today, and Jarvis adds
    // "Say 'open Optics' for your camera." (optics-camera-part, before the hologram's own entry);
    // "open Optics" always opens Optics.
    { words: 'open the camera', state: 'VH', winner: 'optics-camera-part', why: 'A laptop hologram is on screen: its camera part, with the hint for Optics.' },
    { words: 'camera on', state: 'VH', winner: 'optics-camera-part', why: 'A laptop hologram is on screen: its camera part, with the hint for Optics.' },
    { words: 'show me the camera', state: 'VH', winner: 'optics-camera-part', why: 'A laptop hologram is on screen: its camera part, with the hint for Optics.' },
    { words: 'open the camera', state: 'H0', winner: 'optics-camera-part', why: 'Typed in the hologram\'s field: its camera part, with the hint for Optics.' },

    { words: 'camera on', state: 'H0', winner: 'optics-camera-part', why: 'Typed in the hologram\'s field: its camera part, with the hint for Optics.' },
    { words: 'show me the camera', state: 'H0', winner: 'optics-camera-part', why: 'Typed in the hologram\'s field: its camera part, with the hint for Optics.' },
    { words: 'open optics', state: 'VH', winner: 'optics-open', why: '"Open Optics" always opens Optics, a hologram on screen or not.' },
    // E1: with no Look on screen, "put the picture to the side" stays a Screens float, as today.
    { words: 'put the picture to the side', state: 'VL', winner: 'screens', why: 'No Look on screen: a picture floated beside, as today.' },
    { words: 'put the picture to the side', state: 'VF', winner: 'screens', why: 'No Look card known to the router: a Screens float, as today.' },
    { words: 'put the picture to the side', state: 'OV', winner: 'screens', why: 'No Look on screen: a Screens float, as today.' },
    // E1: with a Look's card (aside on a Mac), its words are the card's, before Screens and Optics' own.
    { words: 'expand the picture', state: 'OPA', winner: 'optics-card', why: 'The picture in the card, big.' },
    { words: 'show the picture big', state: 'OPA', winner: 'optics-card', why: 'The picture in the card, big.' },
    { words: 'put the picture aside', state: 'OPA', winner: 'optics-card', why: 'Back into the card beside the live video.' },
    { words: 'put the picture to the side', state: 'OPA', winner: 'optics-card', why: 'A Look is on screen: back into its card, not a Screens float.' },
    { words: 'close the picture', state: 'OPA', winner: 'optics-card', why: 'The card goes; the camera stays on.' },
    { words: 'put the picture to the side', state: 'OPT', winner: 'optics-card', why: 'Typed with a Look on screen: back into its card.' },
    // ROUTING-R2-10: Optics' microphone with the research offer's card up (OVQ) is OV for everything but the offer's words.
    { words: "what's on my screen", state: 'OVQ', winner: 'screen-look', why: "The owner's screen, not a Look of the camera (C5), as in OV." },
    { words: 'do this in this window', state: 'OVQ', winner: 'windows', why: 'The owner picks the window to work in, as in OV.' },
    { words: 'show me the hologram window', state: 'OVQ', winner: 'windows', why: 'Bring the hologram window to the front, as in OV.' },
    { words: 'put the picture to the side', state: 'OVQ', winner: 'screens', why: 'No Look on screen: a Screens float, as in OV.' },
    // ROUTING-R3-S1's OVLV (Optics' microphone, the live view on) is OV for these.
    { words: "what's on my screen", state: 'OVLV', winner: 'screen-look', why: "The owner's screen, not a Look of the camera (C5), as in OV." },
    { words: 'do this in this window', state: 'OVLV', winner: 'windows', why: 'The owner picks the window to work in, as in OV.' },
    { words: 'show me the hologram window', state: 'OVLV', winner: 'windows', why: 'Bring the hologram window to the front, as in OV.' },
    { words: 'put the picture to the side', state: 'OVLV', winner: 'screens', why: 'No Look on screen: a Screens float, as in OV.' },
    // v8.1.1 (MONEY-R2-4's states): a hologram over Optics is a hologram on screen, for its words as for VH and H0.
    ...['OHO', 'OHOT'].map((state) => ({ words: 'expand this in a different window', state, winner: 'screens', why: 'A window (C3), as with any hologram on screen (Optics under it).' })),
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
