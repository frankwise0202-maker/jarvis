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
// Windows by voice (D1-D6) and "pull this up in Chrome" (G1). The section's states: WIN2 two windows open
// (the camera's and the hologram's), WINH the hologram in a window and no viewer here, WINL the newest
// reply has links, WINC the chat with two windows open.
const WIN_PARTS = [
  { id: 'battery', name: 'Battery', aka: ['battery pack'] },
  { id: 'fan', name: 'Cooling fan', aka: [] },
  { id: 'keyboard', name: 'Keyboard', aka: [] },
];
const WIN_TWO = [
  { id: 'w-camera', kind: 'camera', label: 'WINDOW', focused: false },
  { id: 'w-holo', kind: 'hologram', label: 'WINDOW', focused: false, parts: WIN_PARTS, selected: null },
];
const WIN_LINKS = [
  { url: 'https://www.example.com/chargers/best', title: 'The best USB-C chargers' },
  { url: 'https://reviews.example.net/chargers-compared', title: 'Chargers compared' },
  { url: 'https://docs.example.com/usb-c/faq', title: 'USB-C FAQ' },
];
export const WINDOWS = {
  must: [
    // D1: several windows, each named; back and close by name
    ['put the camera in a window', 'V0', 'screens'],
    ['put the hologram in another window', 'WIN2', 'screens'],
    ['close the camera window', 'WIN2', 'windows'],
    ['close the hologram window', 'WIN2', 'windows'],
    ['close the camera window', 'WINC', 'windows'],
    ['bring the hologram back', 'WIN2', 'screens'],
    ['close that window', 'WIN2', 'screens'],
    ['close all windows', 'WIN2', 'screens'],
    ['close everything', 'WIN2', 'windows'],
    // D2: layouts
    ['side by side', 'WIN2', 'windows'],
    ['side by side', 'WINC', 'windows'],
    ['camera on the left, hologram on the right', 'V0', 'windows'],
    ['put the camera and the hologram side by side', 'V0', 'windows'],
    ['split the screen', 'WIN2', 'windows'],
    // D3: the hologram's words act in its window
    ['explode it', 'WINH', 'windows-hologram'],
    ['show the cooling fan', 'WINH', 'windows-hologram'],
    ['front view', 'WINH', 'windows-hologram'],
    ['labels off', 'WINH', 'windows-hologram'],
    // D4: this window
    ["okay, we'll do this in this window", 'WIN2', 'windows'],
    ['do this in this window', 'V0', 'windows'],
    ['show it here', 'WIN2', 'windows'],
    ['show the report here', 'WIN2', 'windows'],
    // D5, D6
    ['show me the hologram window', 'WIN2', 'windows'],
    ['swap them', 'WIN2', 'windows'],
    ['make the camera window bigger', 'WIN2', 'windows'],
    ['make it full screen', 'WIN2', 'windows'],
    ['float yourself', 'V0', 'windows'],
    // G1: Chrome
    ['pull this up in Chrome', 'V0', 'chrome-open'],
    ['pull this up in Google Chrome', 'VL', 'chrome-open'],
    ['open this in Chrome', 'VH', 'chrome-open'],
    ['open that in a new tab', 'V0', 'chrome-open'],
    ['pull it up in my Chrome', 'V0', 'chrome-open'],
    ['pull this up in Chrome', 'C0', 'chrome-open'],
    ['open the second link', 'WINL', 'chrome-open'],
    ['open link 3', 'WINL', 'chrome-open'],
    ['open the first link in Chrome', 'WINL', 'chrome-open'],
    ['google usb c chargers', 'V0', 'chrome-open'],
    ['search Google for the laptop battery part number', 'V0', 'chrome-open'],
    ['look it up on Google', 'V0', 'chrome-open'],
    ['google it', 'V0', 'chrome-open'],
    ['open youtube', 'V0', 'chrome-open'],
    ['go to amazon.com', 'V0', 'chrome-open'],
    ['close that tab', 'V0', 'chrome-open:chrome-close-tab'],
    // Lead decision D1: page words are never this matcher's (with no Chrome task here: Claude)
    ['open the second link', 'V0', null],
    ['click the first link', 'WINL', null],
    ['open the first result', 'WINL', null],
  ],
  not: [
    'put them side by side in the photo',
    'swap the windows on my house',
    'make the window bigger in my kitchen remodel',
    'close the window please the bugs are coming in',
    'how do I close everything on my Mac',
    'float yourself a loan',
    'search for flights to Denver next Friday',
    'chrome plating costs',
    'google and apple compared',
    'open youtube music on my phone',
  ],
  states: {
    WIN2: { surface: 'voice', windows: WIN_TWO },
    WINH: { surface: 'voice', windows: [WIN_TWO[1]] },
    WINL: { surface: 'voice', reply: { links: WIN_LINKS, hologram: null } },
    WINC: { surface: 'chat', via: 'typed', windows: WIN_TWO },
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
