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
export const VOICE = {
  rows: [
  ],
};

// ==== chrome-voice ====================================================================================
// With Chrome's question open (or a Chrome check counting down), "stop Chrome" and "cancel Chrome" are
// answers first (layer answer), before the stop layer's "stop Chrome".
export const CHROME_VOICE = {
  rows: [
    { words: 'stop Chrome', state: 'CV-prompt', winner: 'chrome.prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (which closes the question)' },
    { words: 'cancel Chrome', state: 'CV-prompt', winner: 'chrome.prompt', why: 'Chrome asked: its no (Cancel, Deny or Stop), at once' },
    { words: 'stop Chrome', state: 'CV-prompt-chat', winner: 'chrome.prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (which closes the question)' },
    { words: 'cancel Chrome', state: 'CV-prompt-chat', winner: 'chrome.prompt', why: 'Chrome asked: its no (Cancel, Deny or Stop), at once' },
    { words: 'stop Chrome', state: 'CV-buy', winner: 'chrome.prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (which closes the question)' },
    { words: 'cancel Chrome', state: 'CV-buy', winner: 'chrome.prompt', why: 'Chrome asked: its no (Cancel, Deny or Stop), at once' },
    { words: 'stop Chrome', state: 'CV-budget', winner: 'chrome.prompt', why: 'Chrome asked: the answer layer takes it, and it stops the task (which closes the question)' },
    { words: 'cancel Chrome', state: 'CV-budget', winner: 'chrome.prompt', why: 'Chrome asked: its no (Cancel, Deny or Stop), at once' },
    { words: 'stop Chrome', state: 'CV-check', winner: 'chrome.prompt', why: 'the check counting down is withdrawn: nothing goes to Chrome' },
    { words: 'cancel Chrome', state: 'CV-check', winner: 'chrome.prompt', why: 'the check counting down is withdrawn: nothing goes to Chrome' },
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
    // Lead decision D1 (chrome.task before chrome.open): "open the Nth link" is the reply's link only when the
    // newest reply has links; page words are never chrome.open's. Out of a Chrome context these reach Claude;
    // the Chrome-context rows (and "… in Chrome" with a page object) have the Chrome task as winner and go in with
    // chrome-voice's matcher.
    { words: 'open the second link', state: 'WINL', winner: 'chrome-open', why: 'The newest reply has links: its second one, in Chrome.' },
    { words: 'open the second link', state: 'V0', winner: null, why: 'No links in the newest reply and no Chrome task: a question for Jarvis.' },
    { words: 'click the first link', state: 'WINL', winner: null, why: '"Click …" is a page verb: never chrome.open (a Chrome task in a Chrome context).' },
    { words: 'open the first result', state: 'WINL', winner: null, why: 'A page object: never a Google search (a Chrome task in a Chrome context).' },
    { words: 'click the first result', state: 'V0', winner: null, why: '"Click …" is a page verb: never chrome.open (a Chrome task in a Chrome context).' },
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
