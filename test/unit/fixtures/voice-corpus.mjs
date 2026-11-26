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
// Jarvis for Chrome by voice (G4, G5): tasks ("… in Chrome", page words in a Chrome context), "click
// around for me", "stop Chrome", "what are you doing in Chrome?", and the answers to Chrome's questions
// (the reserved words, a bare "cancel" asked last, the words of the check that counts down).
const CV_CONTEXT = { linked: true, online: true, task: null, contextUntil: Number.MAX_SAFE_INTEGER };
const CV_PROMPT = {
  id: 'chrome:p1', askedAt: 3000, kind: 'confirm', category: 'change', consequential: false, site: 'example-shop.com',
  spoken: 'add the 27-inch monitor, $279.99, to the cart on example-shop.com?', choices: [{ id: 'approve', label: 'Approve' }, { id: 'cancel', label: 'Cancel' }],
  voice: { allowed: true, why: '' },
};
export const CHROME_VOICE = {
  must: [
    // any time: the carriers
    ['find a 4K monitor under $300 and add it to the cart in Chrome', 'V0', 'chrome.task'],
    ['Jarvis, find a 4K monitor under $300 and add it to the cart in Chrome', 'V0', 'chrome.task'],
    ['in Chrome, add the cheapest one to the cart', 'V0', 'chrome.task'],
    ['use Jarvis for Chrome to compare the two cheapest monitors', 'V0', 'chrome.task'],
    ['have Chrome find the return policy', 'V0', 'chrome.task'],
    ['find a 4K monitor in Chrome', 'V0', 'chrome.task'],
    ['open the cheapest one in Chrome', 'V0', 'chrome.task'],
    ['in Chrome, add the cheapest one to the cart', 'C0', 'chrome.task'],
    // a Chrome context: page words
    ['add the cheapest one to the cart', 'CV-ctx', 'chrome.task'],
    ['click the first result', 'CV-ctx', 'chrome.task'],
    ['open the first result', 'CV-ctx', 'chrome.task'],
    ['scroll down', 'CV-ctx', 'chrome.task'],
    ['sort by price', 'CV-ctx', 'chrome.task'],
    ['filter by brand', 'CV-ctx', 'chrome.task'],
    ['search this site for standing desks', 'CV-ctx', 'chrome.task'],
    ['go back a page', 'CV-ctx', 'chrome.task'],
    ['pick the cheaper one', 'CV-ctx', 'chrome.task'],
    ['now add the second one too', 'CV-after', 'chrome.task'],
    ['add the cheapest one to the cart', 'CV-chat', 'chrome.task'],
    // never a task in a Chrome context: with a hologram open, its parts' names are its own (R10)
    ['click the keyboard', 'CV-holo', 'hologram'],
    // "click around for me", "stop Chrome", "what are you doing in Chrome?"
    ['click around for me', 'V0', 'chrome.ask'],
    ['click around for me in Chrome', 'C0', 'chrome.ask'],
    ['stop Chrome', 'CV-run', 'chrome.stop'],
    ['cancel the Chrome task', 'CV-run', 'chrome.stop'],
    ['what are you doing in Chrome?', 'V0', 'chrome.status'],
    ["what's Chrome doing", 'CV-run', 'chrome.status'],
    // Chrome's question open: its reserved words; a bare "cancel" or "no" (it was asked last)
    ['approve', 'CV-prompt', 'chrome.prompt'],
    ['yes, approve', 'CV-prompt', 'chrome.prompt'],
    ['deny', 'CV-prompt', 'chrome.prompt'],
    ['cancel Chrome', 'CV-prompt', 'chrome.prompt'],
    ['stop Chrome', 'CV-prompt', 'chrome.prompt'],
    ['cancel', 'CV-prompt', 'chrome.prompt'],
    ['no', 'CV-prompt', 'chrome.prompt'],
    ['approve', 'CV-buy', 'chrome.prompt'],
    ['spend more in Chrome', 'CV-budget', 'chrome.prompt'],
    ['approve', 'CV-prompt-chat', 'chrome.prompt'],
    // bare yes words never answer it
    ['yes', 'CV-prompt', null],
    ['continue', 'CV-prompt', null],
    ['go ahead', 'CV-prompt', null],
    // nothing asked: a yes that names Chrome is still Chrome's
    ['spend more in Chrome', 'V0', 'chrome.prompt'],
    ['allow once in Chrome', 'V0', 'chrome.prompt'],
    // the check counting down (a task's, in Voice Mode)
    ['cancel', 'CV-check', 'chrome.prompt'],
    ['no', 'CV-check', 'chrome.prompt'],
    ['stop', 'CV-check', 'chrome.prompt'],
    ['no, I said add the second one to the cart', 'CV-check', 'chrome.prompt'],
    ['start now', 'CV-check', 'chrome.prompt'],
  ],
  not: [
    'how do I clear my cookies in Chrome',
    'what is Chrome',
    'is Chrome free',
    'chrome wheels for my car',
    'add milk to my shopping list',
    'what does clickbait mean',
    'scroll through the history of Rome',
    'what is the cheapest monitor',
    'should I approve the budget',
    'deny everything',
    'what does allow once mean',
  ],
  states: {
    'CV-ctx': { surface: 'voice', chrome: CV_CONTEXT },
    'CV-after': { surface: 'voice', chrome: { ...CV_CONTEXT, task: { id: 't1', status: 'done', text: 'find a 4K monitor' } } },
    'CV-run': { surface: 'voice', chrome: { linked: true, online: true, task: { id: 't1', status: 'running', text: 'find a 4K monitor' }, contextUntil: 0 } },
    'CV-chat': { surface: 'chat', via: 'typed', chrome: CV_CONTEXT },
    'CV-holo': { surface: 'voice', chrome: CV_CONTEXT, hologram: { open: true, inWindow: false, parts: [{ id: 'keyboard', name: 'Keyboard', aka: [] }], selected: null } },
    'CV-prompt': { surface: 'voice', chrome: { ...CV_CONTEXT, task: { id: 't1', status: 'waiting' } }, prompt: CV_PROMPT },
    'CV-prompt-chat': { surface: 'chat', via: 'typed', chrome: { ...CV_CONTEXT, task: { id: 't1', status: 'waiting' } }, prompt: CV_PROMPT },
    'CV-buy': { surface: 'voice', prompt: { ...CV_PROMPT, id: 'chrome:p2', category: 'purchase', consequential: true, voice: { allowed: false, why: 'That’s a purchase.' } } },
    'CV-budget': { surface: 'voice', prompt: { ...CV_PROMPT, id: 'chrome:p3', kind: 'budget', choices: [{ id: 'continue', label: 'Continue' }, { id: 'stop', label: 'Stop' }] } },
    'CV-check': { surface: 'voice', chromeCheck: { kind: 'task' } },
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
