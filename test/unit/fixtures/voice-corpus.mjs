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
// Walkthroughs (SPEC §29.1): the tour's words while a tour runs (matcher `tour`), and the words that
// start one or show a part enclosed or opened (`tour.start`, registered as tour-start while the
// router's ids can't hold a dot). States: a tour playing (TOUR), at its decision (TOUR_AT, and
// TOUR_ASKED with Voice Mode's question on the stack), a step waiting (TOUR_WAIT), paused
// (TOUR_PAUSED), typed in the hologram's field (TOUR_FIELD); a part selected (HOLO_PICKED); no viewer,
// the newest reply showed a hologram (REPLY_HOLO, and CHAT_REPLY_HOLO in the chat box).
import { createRouter as tourRouterForIds } from '../../../src/lib/command-router.js';
import { choiceReply as tourChoiceReply } from '../../../src/lib/tour.js';

export const TOUR_START = (() => {
  try {
    tourRouterForIds().register({ id: 'tour.start', layer: 'top', match: () => null });
    return 'tour.start';
  } catch {
    return 'tour-start';
  }
})();
const TOUR_PARTS = [
  { id: 'battery', name: 'Battery (57 Wh)', aka: ['battery pack'] },
  { id: 'battery-connector', name: 'Battery connector', aka: [] },
  { id: 'bottom-cover', name: 'Bottom cover (D cover)', aka: ['base cover'] },
  { id: 'palm-rest', name: 'Palm rest (C cover)', aka: ['top case'] },
  { id: 'fan', name: 'Cooling fan', aka: [] },
  { id: 'speakers', name: 'Speakers', aka: [] },
  { id: 'keyboard', name: 'Keyboard', aka: [] },
];
const TOUR_HOLO = { open: true, inWindow: false, parts: TOUR_PARTS, selected: null, title: '14-inch laptop' };
const TOUR_CHOICES = [
  { id: 'enclosed', label: 'Enclosed', words: [] },
  { id: 'opened', label: 'Opened', words: [] },
  { id: 'both', label: 'Both', words: [] },
  { id: 'pick', label: 'You pick', words: [] },
];
const TOUR_VOICE = { surface: 'voice', voiceOpen: true, standby: { available: true, open: false }, homebase: { available: true, linked: true } };
const TOUR_PLAYING = { active: true, atChoice: false, choices: [], defaultId: null, stepId: 'apart', status: 'playing', paused: false, waits: false, justSaid: false };
const TOUR_DECIDING = { ...TOUR_PLAYING, atChoice: true, choices: TOUR_CHOICES, defaultId: 'enclosed', stepId: 'ask', status: 'choice', justSaid: true };
const TOUR_QUESTION = { id: 'tour:ask', say: 'Do you want to see it enclosed, or opened?', choices: TOUR_CHOICES, keep: true, check: false, match: (text) => tourChoiceReply(text, TOUR_CHOICES, { defaultId: 'enclosed' }) };
const TOUR_REPLY = { title: '14-inch laptop', parts: TOUR_PARTS };

export const TOURS = {
  must: [
    // a tour playing: free, at once, never a paid turn (u-holo §4.2; the brief's B1 list)
    ['next', 'TOUR', 'tour:tour-next'],
    ['next step', 'TOUR', 'tour:tour-next'],
    ['back', 'TOUR', 'tour:tour-back'],
    ['go back', 'TOUR', 'tour:tour-back'],
    ['previous', 'TOUR', 'tour:tour-back'],
    ['repeat', 'TOUR', 'tour:tour-repeat'],
    ['say that again', 'TOUR', 'tour:tour-repeat'],
    ['pause', 'TOUR', 'tour:tour-pause'],
    ['wait', 'TOUR', 'tour:tour-pause'],
    ['hold on', 'TOUR', 'tour:tour-pause'],
    ['continue', 'TOUR', 'tour:tour-next'],
    ['stop the tour', 'TOUR', 'tour:tour-end'],
    ["that's enough", 'TOUR', 'tour:tour-end'],
    ['skip to the fan', 'TOUR', 'tour:tour-jump'],
    ['take me to the battery', 'TOUR', 'tour:tour-jump'],
    ['show me that enclosed', 'TOUR', 'tour:tour-view'],
    ['show it opened', 'TOUR', 'tour:tour-view'],
    ['enclosed', 'TOUR', 'tour:tour-view'],
    // at the decision ("Do you want to see it enclosed, or opened?")
    ['enclosed', 'TOUR_AT', 'tour:tour-choice'],
    ['opened', 'TOUR_AT', 'tour:tour-choice'],
    ['both', 'TOUR_AT', 'tour:tour-choice'],
    ['you pick', 'TOUR_AT', 'tour:tour-choice'],
    ['show me that enclosed', 'TOUR_AT', 'tour:tour-choice'],
    ['open it up', 'TOUR_AT', 'tour:tour-choice'],
    ['next', 'TOUR_AT', 'tour:tour-next'],
    ['what does that do', 'TOUR_AT', null],
    ['enclosed', 'TOUR_ASKED', 'question'],
    ['you pick', 'TOUR_ASKED', 'question'],
    ['what does that do', 'TOUR_ASKED', null],
    // a step waits for "next"; right after a step
    ['okay', 'TOUR_WAIT', 'tour:tour-next'],
    ['got it', 'TOUR_WAIT', 'tour:tour-next'],
    ['what', 'TOUR_WAIT', 'tour:tour-repeat'],
    ['continue', 'TOUR_PAUSED', 'tour:tour-resume'],
    ['resume', 'TOUR_PAUSED', 'tour:tour-resume'],
    // typed in the hologram's field
    ['next', 'TOUR_FIELD', 'tour:tour-next'],
    ['back', 'TOUR_FIELD', 'tour:tour-back'],
    ['end the tour', 'TOUR_FIELD', 'tour:tour-end'],
    // no tour: "back" alone is still the back view, "next" still a question for Jarvis
    ['back', 'VH', 'hologram'],
    ['next', 'VH', null],
    ['okay', 'VH', null],
    // starting one: a hologram on screen, or the newest reply showed one (never an older one: L3)
    ['walk me through it', 'VH', `${TOUR_START}:tour-start`],
    ['walk me through the battery', 'VH', `${TOUR_START}:tour-start`],
    ['give me a tour', 'H0', `${TOUR_START}:tour-start`],
    ['walk me through it', 'REPLY_HOLO', `${TOUR_START}:tour-start`],
    ['walk me through the battery', 'REPLY_HOLO', `${TOUR_START}:tour-start`],
    ['walk me through it', 'CHAT_REPLY_HOLO', `${TOUR_START}:tour-start`],
    ['walk me through it', 'V0', null],
    ['walk me through it', 'C0', null],
    ['walk me through how to replace the battery', 'VH', null],
    ['walk me through replacing the battery', 'REPLY_HOLO', null],
    // "show it enclosed / opened" on the selected part, outside a tour
    ['show it enclosed', 'HOLO_PICKED', `${TOUR_START}:tour-view`],
    ['show me that opened', 'HOLO_PICKED', `${TOUR_START}:tour-view`],
    ['show it enclosed', 'VH', null],
  ],
  not: [
    'walk me through replacing the battery',
    'walk me through the steps to fix it',
    'walk me through your reasoning',
    'take it apart step by step',
    'how do I take it out',
    'why is it there',
    'is the battery glued in',
    'what is the next step for the battery industry',
    'enclosed spaces make me nervous',
    "that's enough for today",
    'stop the tour bus',
    'both of my laptops are slow',
    'you pick a movie for tonight',
  ],
  states: {
    TOUR: { ...TOUR_VOICE, hologram: TOUR_HOLO, tour: TOUR_PLAYING },
    TOUR_AT: { ...TOUR_VOICE, hologram: TOUR_HOLO, tour: TOUR_DECIDING },
    TOUR_ASKED: { ...TOUR_VOICE, hologram: TOUR_HOLO, tour: TOUR_DECIDING, questions: [TOUR_QUESTION] },
    TOUR_WAIT: { ...TOUR_VOICE, hologram: TOUR_HOLO, tour: { ...TOUR_PLAYING, stepId: 'connector', status: 'waiting', waits: true, justSaid: true } },
    TOUR_PAUSED: { ...TOUR_VOICE, hologram: TOUR_HOLO, tour: { ...TOUR_PLAYING, status: 'paused', paused: true } },
    TOUR_FIELD: { surface: 'hologram', via: 'typed', hologram: TOUR_HOLO, tour: TOUR_PLAYING },
    HOLO_PICKED: { ...TOUR_VOICE, hologram: { ...TOUR_HOLO, selected: 'battery' } },
    REPLY_HOLO: { ...TOUR_VOICE, tourReply: TOUR_REPLY },
    CHAT_REPLY_HOLO: { surface: 'chat', via: 'typed', standby: { available: true, open: false }, homebase: { available: true, linked: true }, tourReply: TOUR_REPLY },
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
export const CHROME_RELAY = {
  must: [
  ],
  not: [
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
