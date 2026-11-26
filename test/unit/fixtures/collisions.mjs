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
