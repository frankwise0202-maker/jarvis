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
    // the short words that sound like a withdraw word only let it count on (REDTEAM-VOICE-3), and a sentence that
    // starts with a no word withdraws it (REDTEAM-VOICE-14)
    ['go', 'CV-check', 'chrome-prompt'],
    ['start it', 'CV-check', 'chrome-prompt'],
    ['no no', 'CV-check', 'chrome-prompt'],
    ['wait, no', 'CV-check', 'chrome-prompt'],
    // a sentence with "approve" that isn't a reserved one: the hint, never Claude (REDTEAM-VOICE-14)
    ['yes I approve', 'CV-prompt', 'chrome-prompt:chrome-hint'],
    // "how's it going?" is Chrome's only while a task runs (REDTEAM-VOICE-13)
    ["how's it going", 'CV-run', 'chrome-status'],
    // while a task runs, the plain ways of stopping it stop it (ROUTING-5)
    ['stop that', 'CV-run', 'chrome-stop'],
    ['stop the task', 'CV-run', 'chrome-stop'],
    ['cancel the task', 'CV-run', 'chrome-stop'],
    ['abort', 'CV-run', 'chrome-stop'],
    ["stop what you're doing", 'CV-run', 'chrome-stop'],
    ['cancel', 'CV-run', 'chrome-stop'],
    // typed: a countdown in the chat takes the check's words (REDTEAM-VOICE-5); a prompt's card waiting takes a
    // typed no as its button would, and points a typed yes to its button (REDTEAM-VOICE-14)
    ['cancel', 'CV-typed', 'chrome-typed'],
    ['no', 'CV-typed', 'chrome-typed'],
    ['stop', 'CV-typed', 'chrome-typed'],
    ['start now', 'CV-typed', 'chrome-typed'],
    ['deny', 'CV-card', 'chrome-typed'],
    ['approve', 'CV-card', 'chrome-typed'],
    // any instruction with a carrier is a task, whatever its verb; the lead carriers that ask, always (CHROME-VOICE-R2-3, ROUTING-R2-2)
    ['Cancel my Netflix subscription in Chrome.', 'V0', 'chrome-task'],
    ['Cancel the order on Amazon in Chrome.', 'V0', 'chrome-task'],
    ['Return the headphones on Amazon in Chrome.', 'V0', 'chrome-task'],
    ['Renew my library books in Chrome.', 'V0', 'chrome-task'],
    ['Upgrade my Spotify plan in Chrome.', 'V0', 'chrome-task'],
    ['Register for the webinar in Chrome.', 'V0', 'chrome-task'],
    ['Reorder the paper towels in Chrome.', 'V0', 'chrome-task'],
    ['Email the seller in Chrome.', 'V0', 'chrome-task'],
    ['Contact support in Chrome.', 'V0', 'chrome-task'],
    ['Archive the newsletter emails in Chrome.', 'V0', 'chrome-task'],
    ['Mark all as read in Gmail in Chrome.', 'V0', 'chrome-task'],
    ['Install the update in Chrome.', 'V0', 'chrome-task'],
    ['Donate five dollars to Wikipedia in Chrome.', 'V0', 'chrome-task'],
    ['Vote in the poll in Chrome.', 'V0', 'chrome-task'],
    ['Report the listing in Chrome.', 'V0', 'chrome-task'],
    ['Block the seller in Chrome.', 'V0', 'chrome-task'],
    ['Request a refund in Chrome.', 'V0', 'chrome-task'],
    ['Claim my reward in Chrome.', 'V0', 'chrome-task'],
    ['Redeem the gift card in Chrome.', 'V0', 'chrome-task'],
    ['use Jarvis for Chrome to cancel my Netflix subscription', 'V0', 'chrome-task'],
    ['have Chrome renew my library books', 'V0', 'chrome-task'],
    ['tell Chrome to email my landlord about the leak', 'V0', 'chrome-task'],
    ['ask Chrome to register me for the 5K', 'V0', 'chrome-task'],
    ['get Chrome to reorder my contact lenses', 'V0', 'chrome-task'],
    ['in Chrome, register me for the 5K', 'V0', 'chrome-task'],
    ['cancel my Netflix subscription in Chrome', 'V0', 'chrome-task'],
    ['reorder my contact lenses in Chrome', 'V0', 'chrome-task'],
    ['transfer fifty dollars to savings in Chrome', 'V0', 'chrome-task'],
    ['install the Grammarly extension in Chrome', 'V0', 'chrome-task'],
    ['RSVP to the party in Chrome.', 'V0', 'chrome-task'],
    ['Login to my bank in Chrome.', 'V0', 'chrome-task'],
    ['Proceed to checkout in Chrome.', 'V0', 'chrome-task'],
    ['use Jarvis for Chrome to cancel my Netflix subscription', 'C0', 'chrome-task'],
    ['Email the seller in Chrome.', 'C0', 'chrome-task'],
    ['in Chrome, register me for the 5K', 'C0', 'chrome-task'],
    ['Request a refund in Chrome.', 'C0', 'chrome-task'],
    // ... and the rest of both second reviews' instructions (CHROME-VOICE-R2-3, ROUTING-R2-2)
    ['Download my last invoice in Chrome.', 'V0', 'chrome-task'],
    ['Subscribe to the newsletter in Chrome.', 'V0', 'chrome-task'],
    ['Show me the reviews in Chrome.', 'V0', 'chrome-task'],
    ['Read me the first review in Chrome.', 'V0', 'chrome-task'],
    ['Write a review for the monitor in Chrome.', 'V0', 'chrome-task'],
    ['Watch the trailer in Chrome.', 'V0', 'chrome-task'],
    ['Play the video in Chrome.', 'V0', 'chrome-task'],
    ['Save the recipe in Chrome.', 'V0', 'chrome-task'],
    ['Get the cheapest flight to Denver in Chrome.', 'V0', 'chrome-task'],
    ['Grab a coffee order from Starbucks in Chrome.', 'V0', 'chrome-task'],
    ['Check the weather on weather.com in Chrome.', 'V0', 'chrome-task'],
    ['Turn on dark mode on YouTube in Chrome.', 'V0', 'chrome-task'],
    ['Message Sam on WhatsApp in Chrome.', 'V0', 'chrome-task'],
    ['Reply to the last email in Chrome.', 'V0', 'chrome-task'],
    ['Empty the cart in Chrome.', 'V0', 'chrome-task'],
    ['Remove the monitor from the cart in Chrome.', 'V0', 'chrome-task'],
    ['Apply the coupon in Chrome.', 'V0', 'chrome-task'],
    ['Enter my zip code in Chrome.', 'V0', 'chrome-task'],
    ['Type my address in Chrome.', 'V0', 'chrome-task'],
    ['Accept the cookies in Chrome.', 'V0', 'chrome-task'],
    ['Close the popup in Chrome.', 'V0', 'chrome-task'],
    ['Sign me up for the trial in Chrome.', 'V0', 'chrome-task'],
    ['Buy the monitor in Chrome.', 'V0', 'chrome-task'],
    ['Pick the second one in Chrome.', 'V0', 'chrome-task'],
    ['Choose next-day shipping in Chrome.', 'V0', 'chrome-task'],
    ['Like the post in Chrome.', 'V0', 'chrome-task'],
    ['Follow her on Twitter in Chrome.', 'V0', 'chrome-task'],
    ['Unfollow that account on Instagram in Chrome.', 'V0', 'chrome-task'],
    ['Transfer fifty dollars to savings in Chrome.', 'V0', 'chrome-task'],
    ['Join the Zoom meeting in Chrome.', 'V0', 'chrome-task'],
    ['Confirm my appointment in Chrome.', 'V0', 'chrome-task'],
    ['Move my dentist appointment to Friday in Chrome.', 'V0', 'chrome-task'],
    ['Invite Sam to the shared doc in Chrome.', 'V0', 'chrome-task'],
    ['Respond to the last email in Chrome.', 'V0', 'chrome-task'],
    ['Decline the meeting invite in Chrome.', 'V0', 'chrome-task'],
    ['Sell my old phone on eBay in Chrome.', 'V0', 'chrome-task'],
    ['Rent a car in Denver for next weekend in Chrome.', 'V0', 'chrome-task'],
    ['Dispute the charge in Chrome.', 'V0', 'chrome-task'],
    ['Complete the survey in Chrome.', 'V0', 'chrome-task'],
    ['Retweet the last post in Chrome.', 'V0', 'chrome-task'],
    ['Upvote the top comment in Chrome.', 'V0', 'chrome-task'],
    ['Finish the checkout in Chrome.', 'V0', 'chrome-task'],
    ['Re-order my usual groceries in Chrome.', 'V0', 'chrome-task'],
    ['Print my boarding pass in Chrome.', 'V0', 'chrome-task'],
    ['Pay my electric bill in Chrome.', 'V0', 'chrome-task'],
    ['Find a 4K monitor under $300 and add it to the cart in Chrome.', 'V0', 'chrome-task'],
    ['Order more paper towels in Chrome.', 'V0', 'chrome-task'],
    ['use Chrome to cancel my Netflix subscription', 'V0', 'chrome-task'],
    ['ask Chrome to reorder my contact lenses', 'V0', 'chrome-task'],
    ['get Chrome to register me for the 5K', 'V0', 'chrome-task'],
    ['in Chrome, cancel my Netflix subscription', 'V0', 'chrome-task'],
    ['in Chrome, transfer fifty dollars to savings', 'V0', 'chrome-task'],
    ['have Chrome install the Grammarly extension', 'V0', 'chrome-task'],
    ['use Chrome to block that spammer on Facebook', 'V0', 'chrome-task'],
    ['return the blender I bought on Amazon in Chrome', 'V0', 'chrome-task'],
    ['rsvp yes to the party in Chrome', 'V0', 'chrome-task'],
    ['refill my prescription at CVS in Chrome', 'V0', 'chrome-task'],
    ['reschedule my dentist appointment in Chrome', 'V0', 'chrome-task'],
    ['unsubscribe me from the Target emails in Chrome', 'V0', 'chrome-task'],
    ['renew my passport in Chrome', 'V0', 'chrome-task'],
    ['donate twenty dollars to the Red Cross in Chrome', 'V0', 'chrome-task'],
    ['archive the old emails in Chrome', 'V0', 'chrome-task'],
    ['mark all my emails as read in Chrome', 'V0', 'chrome-task'],
    ['join the zoom meeting in Chrome', 'V0', 'chrome-task'],
    ['upgrade my Spotify plan in Chrome', 'V0', 'chrome-task'],
    ['create a new Google Doc in Chrome', 'V0', 'chrome-task'],
    ['block that site in Chrome', 'V0', 'chrome-task'],
    ['report the spam account in Chrome', 'V0', 'chrome-task'],
    ['pay my electric bill in Chrome', 'V0', 'chrome-task'],
    ['book a table for two at Nobu in Chrome', 'V0', 'chrome-task'],
    ['can you cancel my Netflix subscription in Chrome', 'V0', 'chrome-task'],
    ['please cancel my Netflix subscription in Chrome', 'V0', 'chrome-task'],
    ['I want you to cancel my Netflix subscription in Chrome', 'V0', 'chrome-task'],
    ['renew my library books in Chrome', 'V0', 'chrome-task'],
    ['return the shoes I bought last week in Chrome', 'V0', 'chrome-task'],
    ['register for the 5K race in Chrome', 'V0', 'chrome-task'],
    ['donate ten dollars to the food bank in Chrome', 'V0', 'chrome-task'],
    ['email my landlord about the leak in Chrome', 'V0', 'chrome-task'],
    ['text my wife that I am late in Chrome', 'V0', 'chrome-task'],
    ['enable two factor on my Google account in Chrome', 'V0', 'chrome-task'],
    ['disable autoplay on YouTube in Chrome', 'V0', 'chrome-task'],
    ['block that spammer on Facebook in Chrome', 'V0', 'chrome-task'],
    ['report the fake listing in Chrome', 'V0', 'chrome-task'],
    ['request a refund for my order in Chrome', 'V0', 'chrome-task'],
    ['claim my free trial in Chrome', 'V0', 'chrome-task'],
    ['redeem my gift card in Chrome', 'V0', 'chrome-task'],
    ['contact Amazon support in Chrome', 'V0', 'chrome-task'],
    ['archive all my old emails in Chrome', 'V0', 'chrome-task'],
    ['mark all emails as read in Chrome', 'V0', 'chrome-task'],
    ['confirm my appointment in Chrome', 'V0', 'chrome-task'],
    ['verify my email address in Chrome', 'V0', 'chrome-task'],
    ['ship the package to my mom in Chrome', 'V0', 'chrome-task'],
    ['move the meeting to Friday in Chrome', 'V0', 'chrome-task'],
    ['star the important emails in Chrome', 'V0', 'chrome-task'],
    ['watch the new trailer in Chrome', 'V0', 'chrome-task'],
    ['listen to the podcast in Chrome', 'V0', 'chrome-task'],
    ['download my tax forms in Chrome', 'V0', 'chrome-task'],
    ['print the boarding pass in Chrome', 'V0', 'chrome-task'],
    ['save this recipe in Chrome', 'V0', 'chrome-task'],
    ['remind me to pay rent in Chrome', 'V0', 'chrome-task'],
    ['create a new playlist in Chrome', 'V0', 'chrome-task'],
    ['start a free trial of Hulu in Chrome', 'V0', 'chrome-task'],
    ['stop my Hulu subscription in Chrome', 'V0', 'chrome-task'],
    ['in Chrome, find a 4K monitor under $300', 'V0', 'chrome-task'],
    ['can you find a 4K monitor under $300 in Chrome', 'V0', 'chrome-task'],
    ['could you add the cheapest one to the cart in Chrome', 'V0', 'chrome-task'],
    ['would you book a table for two at 7 in Chrome', 'V0', 'chrome-task'],
    ['can you please find me a flight to Denver in Chrome', 'V0', 'chrome-task'],
    ['please find me a flight to Denver in Chrome', 'V0', 'chrome-task'],
    ['Jarvis, please find me a flight to Denver in Chrome', 'V0', 'chrome-task'],
    ['I want you to find a 4K monitor in Chrome', 'V0', 'chrome-task'],
    ['I need you to order more printer ink in Chrome', 'V0', 'chrome-task'],
    ['go ahead and find a 4K monitor in Chrome', 'V0', 'chrome-task'],
    ['help me find a 4K monitor in Chrome', 'V0', 'chrome-task'],
    ['get me a 4K monitor under $300 in Chrome', 'V0', 'chrome-task'],
    ['grab the cheapest charger in Chrome', 'V0', 'chrome-task'],
    ['check my order status on amazon in Chrome', 'V0', 'chrome-task'],
    ['fill out the contact form in Chrome', 'V0', 'chrome-task'],
    ['download my bank statement in Chrome', 'V0', 'chrome-task'],
    ['unsubscribe me from the newsletter in Chrome', 'V0', 'chrome-task'],
    ['look for a 4K monitor in Chrome', 'V0', 'chrome-task'],
    ['see if Best Buy has the monitor in stock in Chrome', 'V0', 'chrome-task'],
    ['make a reservation at Nobu for Friday in Chrome', 'V0', 'chrome-task'],
    ['buy more paper towels in Chrome', 'V0', 'chrome-task'],
    ['now add the second one too in Chrome', 'V0', 'chrome-task'],
    ['also add a HDMI cable in Chrome', 'V0', 'chrome-task'],
    ['then check out in Chrome', 'V0', 'chrome-task'],
    ['just find me a cheaper one in Chrome', 'V0', 'chrome-task'],
    ['maybe find a cheaper one in Chrome', 'V0', 'chrome-task'],
    ['try finding a cheaper one in Chrome', 'V0', 'chrome-task'],
    ["let's find a cheaper one in Chrome", 'V0', 'chrome-task'],
    ['can you find me a hotel in Bath in Chrome', 'V0', 'chrome-task'],
    ['Best Buy: add a 4K monitor under $300 to the cart in Chrome', 'V0', 'chrome-task'],
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
    // an everyday greeting, no task running (REDTEAM-VOICE-13)
    "how's it going",
    "how's it going, Jarvis",
    'how is it going',
    "hey Jarvis, how's it going",
    // a trouble or a request for help that ends "in Chrome" is a question, not a task (ROUTING-2)
    "my Gmail won't load in Chrome",
    'YouTube is really slow in Chrome',
    'Netflix keeps buffering in Chrome',
    "I can't log in to my bank in Chrome",
    'something is wrong in Chrome',
    'it says access denied in Chrome',
    'explain how cookies work in Chrome',
    'teach me how to use bookmarks in Chrome',
    // a trouble whose first word could be a verb is still the owner's question (CHROME-VOICE-R2-3, ROUTING-R2-2)
    'Log in doesn’t work in Chrome.',
    'Sign in fails in Chrome.',
    'Order history is empty in Chrome.',
    'Zoom keeps crashing in Chrome.',
    'Print preview is broken in Chrome.',
    'Mute doesn’t work in Chrome.',
    'Checkout keeps failing in Chrome.',
    'Update failed in Chrome.',
    'Pay button is greyed out in Chrome.',
    'Scroll bars are missing in Chrome.',
    'Check boxes don’t work in Chrome.',
    'Book covers don’t load in Chrome.',
    'Watch history is gone in Chrome.',
    'Track changes is greyed out in Chrome.',
    'Find my iPhone won’t load in Chrome.',
    'Pick up times are wrong in Chrome.',
    'Look at all these ads in Chrome.',
    'Turn by turn directions are wrong in Chrome.',
    'Post office tracking says delivered in Chrome.',
    'Download keeps failing in Chrome.',
    'Upload is stuck at 99 percent in Chrome.',
    'Pause doesn’t work on Netflix in Chrome.',
    'Refresh doesn’t help in Chrome.',
    'Reply all is missing in Gmail in Chrome.',
    'Save as PDF is missing in Chrome.',
    "in Chrome, my Gmail won't load",
    'nothing loads in Chrome',
    'the page keeps reloading in Chrome',
    'Sound not working in Chrome.',
    // ... and the rest of both second reviews' troubles
    'Pay pal won’t load in Chrome.',
    'Clear history is greyed out in Chrome.',
    'Click here buttons look broken in Chrome.',
    'Share buttons are gone in Chrome.',
    'Explore page is empty in Chrome.',
    'Play doesn’t do anything on YouTube in Chrome.',
    'My Gmail won’t load in Chrome.',
    'YouTube is really slow in Chrome.',
    'how come Gmail is slow in Chrome',
    'why does YouTube buffer in Chrome',
    'every site is slow in Chrome',
    'my bookmarks are gone in Chrome',
    'the sound is not working in Chrome',
    'this page looks broken in Chrome',
    'have Chrome open when I log in',
    'remind me how to turn on dark mode in Chrome',
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
    // typed in the chat: a task's countdown (Voice Mode closed), and a prompt's card waiting
    'CV-typed': { surface: 'chat', via: 'typed', chrome: { ...CV_CONTEXT, task: { id: '', status: 'starting', text: 'find a USB-C hub' }, checking: true } },
    'CV-card': { surface: 'chat', via: 'typed', chrome: { ...CV_CONTEXT, task: { id: 't1', status: 'waiting', text: 'find a 4K monitor' }, waiting: 1 } },
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
    // ROUTING-10: Optics on top here (live, or the live view on) keeps its own words; the hologram's window takes
    // only words that name the hologram. The same words do what they do without the window (VL, LV).
    ...['WINHO', 'WINHV'].flatMap((state) => [
      ['close', state, 'optics'],
      ['close it', state, 'optics'],
      ['expand it', state, 'optics'],
      ['expand the picture', state, 'optics'],
      ['show me the camera', state, 'optics'],
      ['look at the battery', state, null],
      ['show the cooling fan', state, null],
      ['explode the hologram', state, 'windows-hologram'],
      ['show the cooling fan in the hologram', state, 'windows-hologram'],
    ]),
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
    // ROUTING-10: Optics open here (live; the live view on) and the hologram in its own window.
    WINHO: { surface: 'voice', windows: [WIN_TWO[1]], optics: { open: true, mode: 'live', liveView: false, card: null, cameraAllowed: 'granted', sceneChanged: null } },
    WINHV: { surface: 'voice', windows: [WIN_TWO[1]], optics: { open: true, mode: 'live', liveView: true, card: null, cameraAllowed: 'granted', sceneChanged: null } },
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
    // ROUTING-7, R10's "my …": "open my camera" said over a hologram is the owner's camera (Optics), not the part.
    // Typed in the hologram's field (no "open optics" there) it stays the part, with the hint.
    ['open my camera', 'VH', 'optics-open'],
    ['show me my camera', 'VH', 'optics-open'],
    ['open my webcam', 'VH', 'optics-open'],
    ['open my camera', 'H0', 'optics-camera-part'],
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
