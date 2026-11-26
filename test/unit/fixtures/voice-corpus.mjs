// The command router's corpora (v8.1, u-voice §4.4), one section per builder: each adds its own
// phrases in its own section, so merges never meet. test/unit/command-router.test.mjs (the T3
// harness, voice's) reads every section, plus voice's base corpora from voice-corpus-base.mjs (the
// u-voice probes) when that file is there.
//
//   must    T2, must-match: [words, state, expected]. In that state the router must pick `expected`:
//           a matcher id ('screens'), or id:action ('tour-words:next'), or null (Claude).
//   not     T1, no-steal: ordinary sentences that must reach Claude in every state of the harness.
//   parity  (optional) T4: the section's matchers that listen on some surfaces only, on purpose:
//           [{ id, surfaces, why }]
//   states  the section's own states: { name: { surface, …fields } }, filled over the router's
//           emptyState(surface) (command-router.js documents every field). The harness's own states
//           (V0 nothing open, S speaking, VH a hologram, VL / VF Optics live / frozen, VW a window,
//           C0 the chat, H0 a hologram's field, OT / OV Optics' field typed / spoken) need no entry.
//
// Every new phrase goes into `must` with its state (rules for everyone: "Corpora"), and into
// collisions.mjs when two matchers can claim it.

// ==== mac-dev =========================================================================================
// "Which microphone are you using?" (src/ui/commands/audio.js, audio-status): Jarvis says where he listens and
// speaks. Whole sentences only: questions about microphones in general stay Claude's.
export const MAC_DEV = {
  must: [
    ['which microphone are you using', 'V0', 'audio-status'],
    ['Jarvis, which mic are you using?', 'V0', 'audio-status'],
    ['What speaker are you using?', 'V0', 'audio-status'],
    ['which microphone and speaker are you using', 'S', 'audio-status'],
    ['Is the speakerphone connected?', 'V0', 'audio-status'],
    ['are you on the speakerphone', 'VH', 'audio-status'],
    ['where are you listening', 'V0', 'audio-status'],
    ['which microphone are you using', 'C0', 'audio-status'],
  ],
  not: [
    'which microphone should I buy for podcasting',
    'what microphone does the iPhone 17 use',
    'is a speakerphone better than headphones for calls',
    'which speaker is better for a living room',
    'where are you from',
    'are you listening to me',
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
// start one or show a part enclosed or opened (`tour-start`). States: a tour playing (TOUR), at its
// decision (TOUR_AT, and TOUR_ASKED with Voice Mode's question on the stack), a step waiting (TOUR_WAIT), paused
// (TOUR_PAUSED), typed in the hologram's field (TOUR_FIELD); a part selected (HOLO_PICKED); no viewer,
// the newest reply showed a hologram (REPLY_HOLO, and CHAT_REPLY_HOLO in the chat box).
import { choiceReply as tourChoiceReply } from '../../../src/lib/tour.js';

const TOUR_START = 'tour-start';
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
// The app's own words (C2), Voice Mode's controls and "stop" (src/lib/app-commands.js); the base corpora
// (the u-voice probes) are in voice-corpus-base.mjs, with voice's states (T, TD, LV, VHW, RL, CC, CCL, H4, H4O).
export const VOICE = {
  must: [
    // the app's commands, on every surface
    ['new chat', 'V0', 'app:new-chat'],
    ['start a new chat', 'C0', 'app:new-chat'],
    ["let's start a new conversation", 'VH', 'app:new-chat'],
    ['open history', 'V0', 'app:open'],
    ['show me my history', 'C0', 'app:open'],
    ['open settings', 'V0', 'app:open'],
    ['open the voice settings', 'H0', 'app:open'],
    ['open the library', 'V0', 'app:open'],
    ['open my blueprints', 'C0', 'app:open'],
    ['show my saved holograms', 'VL', 'app:open'],
    ['show mission control', 'V0', 'app:open'],
    ['open the home base', 'V0', 'app:open'],
    ['speak slower', 'V0', 'app:voice-rate'],
    ['talk a little faster', 'S', 'app:voice-rate'],
    ['turn off continuous', 'V0', 'app:setting'],
    ['send right away', 'V0', 'app:setting'],
    ['use George', 'V0', 'app:voice'],
    ["use the Mac's voice", 'C0', 'app:voice'],
    ['how much have I spent today', 'V0', 'app:spend'],
    ['how much have I spent this month', 'C0', 'app:spend'],
    ['how much has the live view cost', 'LV', 'app:spend'],
    // Voice Mode's controls (Voice Mode only)
    ['stop talking', 'S', 'voice-controls:hush'],
    ['be quiet', 'V0', 'voice-controls:hush'],
    ["that's enough", 'S', 'voice-controls:hush'],
    ['read the full answer', 'V0', 'voice-controls:read-full'],
    ['repeat that', 'V0', 'voice-controls:repeat'],
    ['say that again', 'S', 'voice-controls:repeat'],
    ['stop listening', 'V0', 'voice-controls:mic-off'],
    ['exit voice mode', 'V0', 'voice-controls:exit-voice'],
    ['be quiet', 'C0', null],
    // "stop" (3)
    ['stop', 'V0', 'stop:stop'],
    ['stop', 'T', 'stop:stop'],
    ['okay stop', 'LV', 'stop:stop'],
    ['stop', 'C0', 'stop:stop'],
    ['stop', 'VH', 'hologram'],
    // SHOULD C5: "look at my screen" (a place the owner names, before the hologram's "look at <part>")
    ['look at my screen', 'V0', 'screen-look:screen-look'],
    ["what's on my screen", 'C0', 'screen-look:screen-look'],
    ['look at my screen', 'VH', 'screen-look'],
    ['look at my screen', 'VL', 'screen-look'],
    // SHOULD C6: "brief me" with no home base: asked first, with the price
    ['brief me', 'NB', 'briefing:brief'],
    ['brief me', 'V0', 'brain'],
    // the Standby words everywhere (C2)
    ['go to sleep', 'H0', 'standby'],
    ['standby', 'OT', 'standby'],
    ['good night', 'C0', 'standby'],
    // C3: today's steals fixed
    ['expand this in a different window', 'VH', 'screens'],
    ['bring everything back', 'VH', 'hologram'],
    ['bring everything back', 'H0', 'hologram'],
    ['bring everything back', 'VW', 'screens'],
    ['go back', 'VH', 'hologram:hologram'],
  ],
  not: [
    'speak to me about history', 'how much did I spend at the store', 'stop it from overheating', 'repeat after me',
    'read me the full story of Dune', 'exit the voice chat on discord', 'use George Foreman grill tips',
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
    ['find a 4K monitor under $300 and add it to the cart in Chrome', 'V0', 'chrome-task'],
    ['Jarvis, find a 4K monitor under $300 and add it to the cart in Chrome', 'V0', 'chrome-task'],
    ['in Chrome, add the cheapest one to the cart', 'V0', 'chrome-task'],
    ['use Jarvis for Chrome to compare the two cheapest monitors', 'V0', 'chrome-task'],
    ['have Chrome find the return policy', 'V0', 'chrome-task'],
    ['find a 4K monitor in Chrome', 'V0', 'chrome-task'],
    ['open the cheapest one in Chrome', 'V0', 'chrome-task'],
    ['in Chrome, add the cheapest one to the cart', 'C0', 'chrome-task'],
    // a Chrome context: page words
    ['add the cheapest one to the cart', 'CV-ctx', 'chrome-task'],
    ['click the first result', 'CV-ctx', 'chrome-task'],
    ['open the first result', 'CV-ctx', 'chrome-task'],
    ['scroll down', 'CV-ctx', 'chrome-task'],
    ['sort by price', 'CV-ctx', 'chrome-task'],
    ['filter by brand', 'CV-ctx', 'chrome-task'],
    ['search this site for standing desks', 'CV-ctx', 'chrome-task'],
    ['go back a page', 'CV-ctx', 'chrome-task'],
    ['pick the cheaper one', 'CV-ctx', 'chrome-task'],
    ['now add the second one too', 'CV-after', 'chrome-task'],
    ['add the cheapest one to the cart', 'CV-chat', 'chrome-task'],
    // never a task in a Chrome context: with a hologram open, its parts' names are its own (R10)
    ['click the keyboard', 'CV-holo', 'hologram'],
    // "click around for me", "stop Chrome", "what are you doing in Chrome?"
    ['click around for me', 'V0', 'chrome-ask'],
    ['click around for me in Chrome', 'C0', 'chrome-ask'],
    ['stop Chrome', 'CV-run', 'chrome-stop'],
    ['cancel the Chrome task', 'CV-run', 'chrome-stop'],
    ['what are you doing in Chrome?', 'V0', 'chrome-status'],
    ["what's Chrome doing", 'CV-run', 'chrome-status'],
    // Chrome's question open: its reserved words; a bare "cancel" or "no" (it was asked last)
    ['approve', 'CV-prompt', 'chrome-prompt'],
    ['yes, approve', 'CV-prompt', 'chrome-prompt'],
    ['deny', 'CV-prompt', 'chrome-prompt'],
    ['cancel Chrome', 'CV-prompt', 'chrome-prompt'],
    ['stop Chrome', 'CV-prompt', 'chrome-prompt'],
    ['cancel', 'CV-prompt', 'chrome-prompt'],
    ['no', 'CV-prompt', 'chrome-prompt'],
    ['approve', 'CV-buy', 'chrome-prompt'],
    ['spend more in Chrome', 'CV-budget', 'chrome-prompt'],
    // bare yes words never answer it: asked last with nothing else open, Jarvis says what to say
    ['yes', 'CV-prompt', 'chrome-prompt:chrome-hint'],
    ['continue', 'CV-prompt', 'chrome-prompt:chrome-hint'],
    ['go ahead', 'CV-prompt', 'chrome-prompt:chrome-hint'],
    // with a tour going too, "continue" is the tour's (never the prompt's, never the hint); the row waits
    // (T2's `waiting`) until tours' 'tour' entry is registered
    ['continue', 'CV-prompt-tour', 'tour'],
    // nothing asked: a yes that names Chrome is still Chrome's (every surface)
    ['spend more in Chrome', 'V0', 'chrome-answer'],
    ['allow once in Chrome', 'V0', 'chrome-answer'],
    ['spend more in Chrome', 'C0', 'chrome-answer'],
    // the check counting down (a task's, in Voice Mode)
    ['cancel', 'CV-check', 'chrome-prompt'],
    ['no', 'CV-check', 'chrome-prompt'],
    ['stop', 'CV-check', 'chrome-prompt'],
    ['no, I said add the second one to the cart', 'CV-check', 'chrome-prompt'],
    ['start now', 'CV-check', 'chrome-prompt'],
    // an affirmation lets the check count on (never other words: nothing withdrawn, nothing for Claude)
    ['yes', 'CV-check', 'chrome-prompt'],
    ['okay', 'CV-check', 'chrome-prompt'],
    ['okay, thanks', 'CV-check', 'chrome-prompt'],
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
    'CV-buy': { surface: 'voice', prompt: { ...CV_PROMPT, id: 'chrome:p2', category: 'purchase', consequential: true, voice: { allowed: false, why: 'That’s a purchase.' } } },
    'CV-budget': { surface: 'voice', prompt: { ...CV_PROMPT, id: 'chrome:p3', kind: 'budget', choices: [{ id: 'continue', label: 'Continue' }, { id: 'stop', label: 'Stop' }] } },
    'CV-check': { surface: 'voice', chromeCheck: { kind: 'task' } },
    'CV-prompt-tour': { surface: 'voice', prompt: CV_PROMPT, tour: { active: true, atChoice: false, choices: [], stepId: 's2' } },
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
    ['close that window', 'WIN2', 'windows'],
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
    ['make it bigger', 'WINH', 'windows-hologram'],
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
    ['make the window bigger', 'WINH', 'windows'],
    ['make your window bigger', 'V0', 'windows'],
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
// A Look set aside beside the live video (a Mac: Optics' mode 'aside', its card with labels), said and
// typed; the research offer open in Voice Mode; the chat with a camera (typed "open optics").
const OPTICS_CARD = { open: true, mode: 'aside', liveView: true, card: { frameId: 'f1', labels: ['USB-C charger', 'Desk lamp'], aside: true }, cameraAllowed: 'granted', sceneChanged: false };
const OPTICS_CAMERA = { supported: true, allowed: 'granted', ios: false };
const RESEARCH_CHOICES = [
  { id: 'quick', label: 'Quick · about 10¢', words: ['quick', 'quick answer', 'the quick one'], dear: false },
  { id: 'mission', label: 'Mission · about $1.70', words: ['mission', 'the mission', 'research mission'], dear: true },
  { id: 'homebase', label: 'Home base · up to $1.25', words: ['home base', 'the home base', 'in the background'], dear: true },
  { id: 'cancel', label: 'Cancel', words: ['cancel', 'no', 'never mind'], dear: false },
];
export const OPTICS = {
  must: [
    // E2: the camera opens by voice, free (Optics closed); typed in the chat too; with Optics open, said so.
    ['open optics', 'V0', 'optics-open'],
    ['hey Jarvis, open optics', 'V0', 'optics-open'],
    ['Optics', 'V0', 'optics-open'],
    ['open the camera', 'V0', 'optics-open'],
    ['turn on the camera', 'V0', 'optics-open'],
    ['camera on', 'V0', 'optics-open'],
    ['start the camera', 'V0', 'optics-open'],
    ['show me the camera', 'V0', 'optics-open'],
    ['switch cameras', 'V0', 'optics-open'],
    ['use the Logitech camera', 'V0', 'optics-open'],
    ['open optics', 'OC0', 'optics-open'],
    ['open optics', 'VL', 'optics-open'],
    // R10: a laptop hologram on screen: "open the camera" is its camera part, with the hint for Optics;
    // "open optics" still opens Optics.
    ['open the camera', 'VH', 'optics-camera-part'],
    ['camera on', 'H0', 'optics-camera-part'],
    ['open optics', 'VH', 'optics-open'],
    ['close the camera', 'V0', 'optics-close'],
    ['camera off', 'OC0', 'optics-close'],
    ['close the camera', 'VL', 'optics'],
    ['close the camera', 'OPT', 'optics-close'],
    // E2: "video mode" is the live view; "go live" and the live video are the camera.
    ['video mode', 'V0', 'camera'],
    ['start video mode', 'V0', 'camera'],
    ['video mode', 'VL', 'optics:optics'],
    ['stop video mode', 'VL', 'optics'],
    ['video mode off', 'OT', 'optics'],
    ['show the live video', 'OPA', 'optics'],
    ['back to live', 'OPA', 'optics'],
    // v8.1 fix MONEY-7: with Optics closed these have nothing to act on: a free line (optics-idle), in
    // Voice Mode and the chat alike, never a paid question.
    ...['stop video mode', 'video mode off', 'stop live view', 'stop watching', 'expand the picture', 'back to live', 'close the picture'].flatMap((w) => [
      [w, 'V0', 'optics-idle'],
      [w, 'C0', 'optics-idle'],
    ]),
    // E7: "take a picture" is a Look (the camera rules first with Optics closed).
    ['take a picture', 'V0', 'camera'],
    ['take a photo of this', 'V0', 'camera'],
    ['take a picture', 'VL', 'optics'],
    // E1: the Look's card, said or typed; "look again" always takes a new picture.
    ['expand the picture', 'OPA', 'optics-card'],
    ['show the picture big', 'OPA', 'optics-card'],
    ['put the picture aside', 'OPA', 'optics-card'],
    ['put the picture to the side', 'OPA', 'optics-card'],
    ['close the picture', 'OPA', 'optics-card'],
    ['expand the picture', 'OPT', 'optics-card'],
    ['close the picture', 'OPT', 'optics-card'],
    ['look again', 'OPA', 'optics'],
    ['new look', 'OPA', 'optics'],
    ['what about now', 'OPA', 'optics'],
    ['tell me more', 'OPA', 'optics'],
    // E3: "research this", the price first; the offer's answers (Mission and Home base through the check).
    ['research this', 'V0', 'optics-research'],
    ['research this', 'VL', 'optics-research'],
    ['research this', 'OPA', 'optics-research'],
    ['research this', 'OT', 'optics-research'],
    ['research this', 'VH', 'optics-research'],
    ['look this up', 'VL', 'optics-research'],
    ['dig into this', 'VL', 'optics-research'],
    ['find out more about this', 'VF', 'optics-research'],
    ['research this in the background', 'VL', 'optics-research'],
    ['quick', 'VQ', 'question'],
    ['cancel', 'VQ', 'question'],
    ['mission', 'VQ', 'optics-research-answer'],
    ['the home base', 'VQ', 'optics-research-answer'],
    // E4: "look" alone, "look here", "look at this" (+ up to three words) stay Looks with Optics open.
    ['look', 'VL', 'optics'],
    ['look here', 'VL', 'optics'],
    ['look at this', 'VL', 'optics'],
    ['take a look at this', 'VF', 'optics'],
  ],
  not: [
    // E4: the 16 steals of the voice study's probe (8 sentences, with the camera live and a Look on screen).
    'look up the laptop battery part number',
    'look into the warranty',
    'look into flights for me',
    'take a look at my calendar',
    'look at my calendar',
    'look at my email',
    'look it up online',
    'look it up',
    // Words near the new ones that are questions for Jarvis.
    'research the best laptops under 800 dollars',
    'should I research before buying a laptop',
    'what does research show about sleep',
    'open the camera app on my phone',
    'turn on the camera flash',
    'the camera on my phone is broken',
    'take a picture with my phone',
    'take a picture of the moon tonight',
    'video mode on a GoPro',
    'what is a live view on a camera',
    'put this aside for later',
    'the mission was a success',
  ],
  states: {
    OPA: { surface: 'voice', standby: { available: true, open: false }, homebase: { available: true, linked: true }, camera: OPTICS_CAMERA, voiceOpen: true, optics: OPTICS_CARD },
    OPT: { surface: 'optics', via: 'typed', optics: OPTICS_CARD },
    OC0: { surface: 'chat', via: 'typed', camera: OPTICS_CAMERA },
    VQ: {
      surface: 'voice',
      camera: OPTICS_CAMERA,
      voiceOpen: true,
      questions: [{ id: 'research-offer', say: 'Research this USB-C charger? …', choices: RESEARCH_CHOICES, match: (text) => (/^(?:quick|quick answer|the quick one|cancel|no|never mind)$/i.test(String(text).trim()) ? (/^(?:cancel|no|never mind)$/i.test(String(text).trim()) ? 'cancel' : 'quick') : null), check: false }],
    },
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
