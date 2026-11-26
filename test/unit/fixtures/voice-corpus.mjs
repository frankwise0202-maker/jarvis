// The command router's corpora (v8.1, u-voice §4.4), one section per builder: each adds its own
// phrases in its own section, so merges never meet. test/unit/command-router.test.mjs (the T3
// harness, voice's) reads every section, plus voice's base corpora from voice-corpus-base.mjs (the
// u-voice probes) when that file is there.
//
//   must    T2, must-match: [words, state, expected]. In that state the router must pick `expected`:
//           a matcher id ('screens'), or id:action ('tour-words:next'), or null (Claude).
//   not     T1, no-steal: ordinary sentences that must reach Claude in every state of the harness.
//   states  the section's own states: { name: { surface, …fields } }, filled over the router's
//           emptyState(surface) (command-router.js documents every field). The harness's own states
//           (V0 nothing open, S speaking, VH a hologram, VL / VF Optics live / frozen, VW a window,
//           C0 the chat, H0 a hologram's field, OT / OV Optics' field typed / spoken) need no entry.
//
// Every new phrase goes into `must` with its state (rules for everyone: "Corpora"), and into
// collisions.mjs when two matchers can claim it.

// ==== mac-dev =========================================================================================
export const MAC_DEV = {
  must: [
  ],
  not: [
  ],
  states: {
  },
};

// ==== mac-hf ==========================================================================================
export const MAC_HF = {
  must: [
  ],
  not: [
  ],
  states: {
  },
};

// ==== tours ===========================================================================================
export const TOURS = {
  must: [
  ],
  not: [
  ],
  states: {
  },
};

// ==== voice ===========================================================================================
export const VOICE = {
  must: [
  ],
  not: [
  ],
  states: {
  },
};

// ==== chrome-voice ====================================================================================
export const CHROME_VOICE = {
  must: [
  ],
  not: [
  ],
  states: {
  },
};

// ==== windows =========================================================================================
export const WINDOWS = {
  must: [
  ],
  not: [
  ],
  states: {
  },
};

// ==== optics ==========================================================================================
export const OPTICS = {
  must: [
  ],
  not: [
  ],
  states: {
  },
};

// ==== chrome-relay ====================================================================================
// src/ui/commands/chrome.js: the link's own words (free, local; voice and chat). Its state doesn't change what
// matches, so the harness's states are enough.
export const CHROME_RELAY = {
  must: [
    ['is Jarvis for Chrome linked?', 'V0', 'chrome-link:chrome-link-status'],
    ['Hey Jarvis, is Chrome linked?', 'V0', 'chrome-link:chrome-link-status'],
    ['is Jarvis for Chrome online', 'V0', 'chrome-link:chrome-link-status'],
    ['is Jarvis for Chrome still connected?', 'S', 'chrome-link:chrome-link-status'],
    ['is the Chrome link working?', 'C0', 'chrome-link:chrome-link-status'],
    ['are you connected to Chrome?', 'V0', 'chrome-link:chrome-link-status'],
    ['Jarvis for Chrome status', 'V0', 'chrome-link:chrome-link-status'],
    ['what is the status of Jarvis for Chrome', 'C0', 'chrome-link:chrome-link-status'],
    ['link Jarvis for Chrome', 'V0', 'chrome-link:chrome-link-setup'],
    ['please set up Jarvis for Chrome', 'C0', 'chrome-link:chrome-link-setup'],
    ['connect Chrome to Jarvis', 'V0', 'chrome-link:chrome-link-setup'],
    ['can you link Jarvis and Chrome for me', 'VH', 'chrome-link:chrome-link-setup'],
    ['how do I link Jarvis for Chrome?', 'V0', 'chrome-link:chrome-link-setup'],
    // Not in a hologram's field or Optics': there they are the Look's question or a follow-up.
    ['is Jarvis for Chrome linked?', 'H0', null],
    ['link Jarvis for Chrome', 'OT', null],
  ],
  not: [
    'is Chrome better than Safari?',
    'is Chrome slow on a Mac',
    'how do I link two Google accounts',
    'what does the Grammarly Chrome extension do',
    'are you connected to the internet?',
    'is the link in your answer safe',
    'set up a new Chrome profile for my kids',
    'how do I connect my printer to Chrome',
  ],
  states: {
  },
};

// ==== chrome-ext ======================================================================================
export const CHROME_EXT = {
  must: [
  ],
  not: [
  ],
  states: {
  },
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
