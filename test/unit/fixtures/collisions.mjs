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
