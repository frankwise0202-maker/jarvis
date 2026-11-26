// voice's base corpora of the one router (v8.1, SPEC §30; T1-T5 in test/unit/command-router.test.mjs).
// Taken from the hands-free study's probes (u-voice corpus.mjs: 199 ordinary sentences, 63 phrases the
// owner expects to work) and the review's Chrome-context probe, with every laptop brand made generic.
// Each builder adds its own phrases in its own section of voice-corpus.mjs and collisions.mjs; this
// file is the shared base every builder's matchers must keep passing.
//
//   HARNESS_STATES     the harness's own states (other sections name them): V0 nothing open, S Jarvis
//                      speaking, VH a laptop hologram, VL / VF Optics live / frozen, VW a Jarvis window,
//                      C0 the chat box, H0 a hologram's field, OT / OV Optics' field typed / spoken
//   STATES             voice's own: T a tour, TD a tour at its decision, LV the live view on, VHW a
//                      hologram and a window, RL the newest reply has links, CC a Chrome context, CCL a
//                      Chrome context with reply links, H4 a Chrome prompt, a tour decision and a research
//                      offer all open (the prompt said last), H4O the same with the offer said last, NB no
//                      home base linked
//   stateFor(name, patch)  a full state: emptyState(surface) with that state's fields (and `patch`)
//   NOT                T1: ordinary sentences that reach Claude in every state (unless the collision
//                      table declares a winner for one in a state)
//   MUST_BASE          T2: { words, state, layer, owner, id, does, should }: the layer (and, for voice's own,
//                      the id) that must take each phrase. owner: the builder whose matcher takes it
//                      ('today': a matcher Phase 0 moved in); a row waits until that builder's module
//                      registers something. should: a SHOULD item's phrase (it waits until it is built)
//   ALTERNATIVES       T5: { best, alts, state, want: 'claude' | { id }, by? } (by: waits for that builder's fix)
//   CHROME_CONTEXT_NOT never a Jarvis for Chrome task, even in a Chrome context (critique H3)
//   PARITY_EXCEPTIONS  T4: matchers that listen on some surfaces only, on purpose: { id, surfaces, why }
//   WAITING_FIXES      T1: sentences a matcher takes until another builder's fix lands ({ words, states, by })
//   KEPT_TAKES         T1: today's takes that stay, in any state where the hologram or Optics is open
//   LAPTOP_PARTS       the generic laptop hologram's parts (a camera and a display among them, for R10)

import { emptyState } from '../../../src/lib/command-router.js';

export const LAPTOP_PARTS = Object.freeze([
  { id: 'bottom-cover', name: 'Bottom cover', aka: ['base cover'] },
  { id: 'palm-rest', name: 'Palm rest', aka: ['top case'] },
  { id: 'lid', name: 'Display lid' },
  { id: 'display', name: 'Display panel', aka: ['screen'] },
  { id: 'webcam', name: 'Camera module', aka: ['webcam', 'camera'] },
  { id: 'hinges', name: 'Hinges' },
  { id: 'keyboard', name: 'Keyboard' },
  { id: 'touchpad', name: 'Touchpad', aka: ['trackpad'] },
  { id: 'battery', name: 'Battery (57 Wh)', aka: ['battery pack', 'battery'] },
  { id: 'battery-connector', name: 'Battery connector' },
  { id: 'mainboard', name: 'Mainboard', aka: ['motherboard', 'system board'] },
  { id: 'ram', name: 'RAM (SO-DIMM)', aka: ['memory'] },
  { id: 'ssd', name: 'M.2 SSD', aka: ['solid state drive'] },
  { id: 'wifi', name: 'Wi-Fi card', aka: ['wireless card'] },
  { id: 'fan', name: 'Cooling fan', aka: ['fan'] },
  { id: 'heatsink', name: 'Heat pipe and heatsink' },
  { id: 'speakers', name: 'Speakers' },
]);

// ---------------------------------------------------------------------------------------------- states

const HOLO = Object.freeze({ open: true, inWindow: false, parts: LAPTOP_PARTS, selected: null });
const LIVE = Object.freeze({ open: true, mode: 'live', liveView: false, card: null, cameraAllowed: 'granted', sceneChanged: null });
const WINDOW = Object.freeze({ id: 'w1', kind: 'camera', label: 'Camera', focused: false });
const VOICE_BASE = Object.freeze({
  standby: { available: true, open: false },
  homebase: { available: true, linked: true },
  camera: { supported: true, allowed: 'granted', ios: false },
  voiceOpen: true,
});
const LINKS = Object.freeze([
  { url: 'https://example.com/monitors', title: 'Monitors' },
  { url: 'https://example.org/review', title: 'A review' },
]);
const CONTEXT = Object.freeze({ linked: true, online: true, task: null, contextUntil: Number.MAX_SAFE_INTEGER });

const CHOICE = (id, ...words) => ({ id, label: words[0], words });
/** A tour's decision on the question stack (contract (a)); askedAt: when it was last said. */
export const TOUR_DECISION = Object.freeze({
  id: 'tour-choice', say: 'Do you want to see it enclosed, or opened?', keep: true, check: false, askedAt: 1000,
  choices: [CHOICE('enclosed', 'enclosed', 'show me that enclosed'), CHOICE('opened', 'opened', 'show it opened'), CHOICE('both', 'both'), CHOICE('pick', 'you pick')],
});
/** The research offer (E3) on the stack. */
export const RESEARCH_OFFER = Object.freeze({
  id: 'research-offer', say: 'Research this? A quick answer with a web search, about 10 cents. A research mission, about $1.70.', keep: false, check: false, askedAt: 2000,
  choices: [CHOICE('quick', 'quick', 'a quick answer'), CHOICE('mission', 'mission', 'a mission'), CHOICE('homebase', 'home base'), CHOICE('cancel', 'cancel', 'no')],
});
/** A Chrome prompt (G5) with its answers as chrome-voice makes them (a `negative` one is its no). */
export const CHROME_PROMPT = Object.freeze({
  id: 'p1', say: 'Chrome asks: add the 27-inch monitor, $279.99, to the cart on example-shop.com? Say approve, or cancel.', askedAt: 3000,
  answers: [
    { id: 'approve', words: ['approve', 'approve it', 'yes approve'], check: true },
    { id: 'deny', words: ['deny', 'deny it', 'cancel chrome', 'cancel in chrome'], check: false, negative: true },
    { id: 'stop', words: ['stop chrome', 'stop the chrome task'], check: false, negative: true },
  ],
});
const RUNNING_TASK = Object.freeze({ id: 't1', status: 'running', text: 'find a 4K monitor under $300 and add it to the cart' });
const TOURING = Object.freeze({ active: true, atChoice: false, choices: [], stepId: 's3' });
const DECIDING = Object.freeze({ active: true, atChoice: true, choices: TOUR_DECISION.choices.map((c) => c.id), stepId: 'ask' });

/** The harness's own states (each section of voice-corpus.mjs may name them). */
export const HARNESS_STATES = Object.freeze({
  V0: { surface: 'voice', ...VOICE_BASE },
  S: { surface: 'voice', ...VOICE_BASE, speaking: true },
  VH: { surface: 'voice', ...VOICE_BASE, hologram: HOLO },
  VL: { surface: 'voice', ...VOICE_BASE, optics: LIVE },
  VF: { surface: 'voice', ...VOICE_BASE, optics: { ...LIVE, mode: 'frozen' } },
  VW: { surface: 'voice', ...VOICE_BASE, windows: [WINDOW] },
  C0: { surface: 'chat', via: 'typed', standby: { available: true, open: false }, homebase: { available: true, linked: true } },
  H0: { surface: 'hologram', via: 'typed', standby: { available: true, open: false }, hologram: HOLO },
  OT: { surface: 'optics', via: 'typed', standby: { available: true, open: false }, optics: LIVE },
  OV: { surface: 'optics', via: 'voice', standby: { available: true, open: false }, optics: LIVE },
});

/** voice's own states (see the header). */
export const STATES = Object.freeze({
  T: { surface: 'voice', ...VOICE_BASE, hologram: HOLO, tour: TOURING },
  TD: { surface: 'voice', ...VOICE_BASE, hologram: HOLO, tour: DECIDING, questions: [TOUR_DECISION] },
  LV: { surface: 'voice', ...VOICE_BASE, optics: { ...LIVE, liveView: true } },
  VHW: { surface: 'voice', ...VOICE_BASE, hologram: HOLO, windows: [WINDOW] },
  RL: { surface: 'voice', ...VOICE_BASE, reply: { links: LINKS, hologram: null } },
  CC: { surface: 'voice', ...VOICE_BASE, chrome: CONTEXT },
  CCL: { surface: 'voice', ...VOICE_BASE, chrome: CONTEXT, reply: { links: LINKS, hologram: null } },
  H4: { surface: 'voice', ...VOICE_BASE, hologram: HOLO, tour: DECIDING, questions: [RESEARCH_OFFER, TOUR_DECISION], prompt: CHROME_PROMPT, chrome: { ...CONTEXT, task: RUNNING_TASK } },
  H4O: { surface: 'voice', ...VOICE_BASE, hologram: HOLO, tour: DECIDING, questions: [RESEARCH_OFFER, TOUR_DECISION], prompt: { ...CHROME_PROMPT, askedAt: 1500 }, chrome: { ...CONTEXT, task: RUNNING_TASK } },
  NB: { surface: 'voice', ...VOICE_BASE, homebase: { available: true, linked: false } },
});

/** A full state by name (HARNESS_STATES or STATES): emptyState(surface) with its fields, then `patch`. */
export function stateFor(name, patch = {}) {
  const over = HARNESS_STATES[name] || STATES[name];
  if (!over) throw new Error(`no state called ${name}`);
  return { ...emptyState(over.surface || 'voice'), ...over, ...patch };
}

/** Every state name, the harness's and voice's. */
export const ALL_STATE_NAMES = Object.freeze([...Object.keys(HARNESS_STATES), ...Object.keys(STATES)]);

// -------------------------------------------------------------------------------------- the corpora

// Ordinary things the owner might say that must reach Jarvis (Claude) in every state. Many share
// words with commands (open, close, camera, window, screen, Chrome, search, research, picture, stop,
// next, back, history, settings, new, chat, live, video, watch, read).
export const NOT = Object.freeze([
  // everyday questions
  'what is the weather tomorrow', 'how far is the moon', 'what should I cook tonight', 'is it going to rain this weekend',
  'how do I reset my router', 'tell me a joke', 'what time is it in Tokyo', 'who won the game last night',
  'summarize the news', 'give me three ideas for a birthday present', 'how many calories are in an apple',
  // command words inside questions
  'how do I open a new window in Chrome', 'how do I close all my Chrome tabs', 'can I open two windows side by side on a Mac',
  'what is the best webcam for streaming', 'why is my camera blurry', 'how do I switch cameras on Zoom',
  'what does full screen mode do', 'how do I make the text bigger on my Mac', 'how do I split my screen on a MacBook',
  'is it safe to open links in emails', 'what is a browser tab', 'which browser is fastest', 'is Chrome better than Safari',
  'how do I search for a file on my Mac', 'how do I take a screenshot on a Mac', 'how do I take a picture of the moon',
  'should I research before buying a laptop', 'what does research show about sleep', 'how long does battery research take',
  'what is the history of the MacBook', 'what settings should I use for night photos', 'what is a new chat in ChatGPT',
  'how do I stop my dog from barking', 'what is next for Apple', 'when are they coming back', 'how do I go back in time machine',
  'what is a live view on a camera', 'how much does a video camera cost', 'can you watch my house while I am away',
  'how do I read faster', 'why do people repeat themselves', 'can you speak Spanish', 'how do I listen to podcasts',
  'what voice do you use', 'how do I mute my microphone in Zoom', 'what is a side by side refrigerator',
  'how big is a 14 inch laptop screen', 'how do I swap the battery in my old laptop', 'what is mission control on a Mac',
  'what is a home base in baseball', 'what is in my library at home', 'which blueprint is best for a shed',
  'how do I make it bigger', 'how do I close a bank account', 'is the camera on', 'are you listening',
  // requests for Jarvis himself (paid on purpose)
  'search for flights to Denver next Friday', 'research the best laptops under 800 dollars', 'find me a 4K monitor under 300 dollars',
  'look up the MacBook Pro battery part number', 'compare the MacBook Pro and the MacBook Air', 'find the cheapest USB C charger',
  'show me a hologram of a jet engine', 'show me how a car alternator works', 'what is inside an AA battery',
  'explain how the hinge works', 'why is the battery glued', 'remember that my laptop is a MacBook Pro',
  'forget my old address', 'write an email to my boss saying I am late', 'translate good morning into French',
  'draft a reply saying thanks', 'make me a packing list for a camping trip', 'plan a three day trip to Chicago',
  // statements that start like commands
  'open a bank account online', 'close the garage door', 'start the dishwasher', 'turn on the lights',
  'turn off the TV', 'open the pod bay doors', 'close the deal', 'take a picture with my iPhone', 'take a break',
  'take me home', 'show me the money', 'show me the way to go home', 'bring me a coffee', 'pull up a chair',
  'get me a pizza', 'go to bed', 'go to the store', 'start the car', 'stop the war', 'stop worrying',
  'swap the tires', 'switch the lights off', 'flip a coin', 'make it shorter', 'make it rhyme', 'make it funnier',
  'read me a poem', 'read the news', 'repeat after me hello', 'speak like a pirate', 'say something nice',
  'new idea for a startup', 'new year resolutions', 'chat with me about movies', 'history of the camera',
  'settings for my router', 'library hours today', 'next week schedule', 'back pain remedies', 'side by side comparison of iPhones',
  'full screen ahead', 'video of cats', 'live music near me', 'watch the movie Dune', 'look into the warranty',
  'look into flights for me', 'search the house for my keys', 'google is a company', 'chrome plating costs',
  'open the hologram of the battery', 'the camera on my phone is broken', 'my screen is cracked', 'I left the window open',
  'the window is open', 'close the window please the bugs are coming in', 'open the window it is hot', 'open the blinds',
  'pull this up', 'put this aside for later', 'show me something cool', 'take a look at my calendar', 'look at my calendar',
  'look at my email', 'watch out for ice tomorrow', 'stop that', 'go back to the first idea', 'go back to what you said about batteries',
  'back to the drawing board', 'the next step is to order the parts', 'keep going with the story', 'continue the story',
  'what about now', 'now what', 'this one', 'that one', 'is this ripe',
  // owner-ish phrases that are questions for Claude
  'look it up online', 'look it up', 'search it up online', 'google maps is down again', 'google and apple compared',
  'open my email', 'open the door', 'open the fridge', 'close the fridge', 'open the camera app on my phone', 'turn on the camera flash',
  'turn off the camera sound on my iPhone', 'show me the camera settings on a Sony A7', 'start a new conversation with my boss',
  'new conversation starters for a date', 'show me my history of purchases', 'open the settings app on my iPhone',
  'take a picture of the moon tonight', 'take a picture with flash', 'snap a picture tips', 'switch cameras on my iPhone',
  'repeat the alphabet', 'repeat after me', 'read me the rest of the poem', 'speak slower to children tips', 'stop listening to music at night',
  'exit the highway', 'close the tab on my phone', 'open a new tab in my life', 'swap the windows on my house', 'put them side by side in the photo',
  'make the window bigger in my kitchen remodel', 'full screen protector for iPhone', 'side by side fridge prices', 'video mode on a GoPro',
  'live view on Google Maps', 'start live streaming on YouTube', 'open youtube music on my phone', 'go to amazon and buy a charger',
  'search for a new job', 'search for my keys', 'pull up a chair and listen',
  'walk me through how to replace the battery', 'what tools do I need to open it', 'is it hard to open the bottom cover',
  'show me where to buy a new battery', 'how much is a new battery', 'which battery fits a 2019 MacBook Pro',
  // v8.1 additions: near misses of the new app commands (each must stay a question for Jarvis)
  'how much have I spent on groceries this month', 'what did you say about the battery earlier', 'stop it from overheating',
  'start over with the recipe', 'speak to me about history', 'be quiet in the library', 'read me the full story of Dune',
  'exit the voice chat on discord', 'use George Foreman grill tips', 'repeat the last step of the recipe',
]);

// Never a Jarvis for Chrome task, even in a Chrome context (critique H3: its probe took these).
export const CHROME_CONTEXT_NOT = Object.freeze([
  'compare the MacBook Pro and the MacBook Air', 'open the pod bay doors', 'go to bed', 'go to the store', 'open the hologram of the battery',
  'open the window it is hot', 'open the blinds', 'open the door', 'open the fridge', 'open the camera app on my phone',
  'open the settings app on my iPhone', 'go to amazon and buy a charger',
  'open the camera', 'open the voice settings', 'open the library', 'open the home base', 'hey Jarvis open the camera',
  'go to standby', 'open the hologram window', 'go to my other screen', 'go to the battery', 'new chat', 'open settings',
]);

// [words, state, layer, owner, id (when known), does, extra]: who must take each phrase (T2).
export const MUST_BASE = Object.freeze(
  [
    ['open optics', 'V0', 'app', 'optics', null, 'opens Optics'],
    ['hey Jarvis, open optics', 'V0', 'app', 'optics', null, 'opens Optics'],
    ['open the camera', 'V0', 'app', 'optics', null, 'opens Optics'],
    ['turn on the camera', 'V0', 'app', 'optics', null, 'opens Optics'],
    ['camera on', 'V0', 'app', 'optics', null, 'opens Optics'],
    ['close the camera', 'V0', 'app', 'optics', null, 'closes Optics'],
    // A Look: optics teaches these words to today's camera and Optics matchers (its module adds no Look
    // of its own), so the rows wait for optics' branch and then name those entries.
    ['take a picture', 'V0', 'camera', 'optics', 'camera', 'a Look (Optics opens)'],
    ['take a photo of this', 'V0', 'camera', 'optics', 'camera', 'a Look (Optics opens)'],
    ['snap a picture', 'VL', 'top', 'optics', 'optics', 'a Look'],
    ['look at my screen', 'V0', 'destination', 'voice', 'screen-look', 'a Look at the screen', { should: true }],
    ['switch cameras', 'V0', 'app', 'optics', null, 'opens Optics on the next camera'],
    ['use the Logitech camera', 'V0', 'app', 'optics', null, 'opens Optics on that camera'],
    ['new chat', 'V0', 'app', 'voice', 'app', 'a new chat'],
    ['start a new chat', 'VH', 'app', 'voice', 'app', 'a new chat'],
    ['open history', 'V0', 'app', 'voice', 'app', 'history'],
    ['show me my history', 'V0', 'app', 'voice', 'app', 'history'],
    ['open settings', 'V0', 'app', 'voice', 'app', 'settings'],
    ['open the voice settings', 'V0', 'app', 'voice', 'app', 'settings'],
    ['open my blueprints', 'V0', 'app', 'voice', 'app', 'the library'],
    ['open the library', 'V0', 'app', 'voice', 'app', 'the library'],
    ['show mission control', 'V0', 'app', 'voice', 'app', 'Mission Control'],
    ['open the home base', 'V0', 'app', 'voice', 'app', 'the home base'],
    ['stop talking', 'S', 'app', 'voice', 'voice-controls', 'hush'],
    ['be quiet', 'S', 'app', 'voice', 'voice-controls', 'hush'],
    ['read the full answer', 'V0', 'app', 'voice', 'voice-controls', 'reads the details'],
    ['repeat that', 'V0', 'app', 'voice', 'voice-controls', 'says it again'],
    ['speak slower', 'V0', 'app', 'voice', 'app', 'slower'],
    ['stop listening', 'V0', 'app', 'voice', 'voice-controls', 'the microphone off'],
    ['exit voice mode', 'V0', 'app', 'voice', 'voice-controls', 'leaves Voice Mode'],
    ['put the camera and the hologram side by side', 'V0', 'destination', 'windows', null, 'side by side'],
    ['side by side', 'VW', 'destination', 'windows', null, 'side by side'],
    ['put the camera on the left and the hologram on the right', 'V0', 'destination', 'windows', null, 'left and right'],
    ['swap them', 'WIN2', 'destination', 'windows', null, 'swap (two windows open: windows\' state WIN2)'],
    ['make the window bigger', 'VW', 'destination', 'windows', null, 'size', { should: true }],
    ['make it full screen', 'VW', 'destination', 'windows', null, 'size', { should: true }],
    ['full screen', 'VW', 'destination', 'windows', null, 'size', { should: true }],
    ['close that window', 'VW', 'destination', 'windows', null, 'close one'],
    ['close the camera window', 'VW', 'destination', 'windows', null, 'close one'],
    ['close everything', 'VW', 'destination', 'windows', null, 'close all'],
    ['show me the hologram window', 'VW', 'destination', 'windows', null, 'focus', { should: true }],
    ["okay, we'll do this in this window", 'VW', 'destination', 'windows', null, 'here'],
    ['pull this up in Chrome', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: this'],
    ['pull this up in Google Chrome', 'VL', 'destination', 'windows', 'chrome-open', 'Chrome: this'],
    ['open this in Chrome', 'VH', 'destination', 'windows', 'chrome-open', 'Chrome: this'],
    ['open that in a new tab', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: this'],
    ['open the first link', 'RL', 'destination', 'windows', 'chrome-open', 'Chrome: a link'],
    ['open the second link in Chrome', 'RL', 'destination', 'windows', 'chrome-open', 'Chrome: a link'],
    ['open link 2', 'RL', 'destination', 'windows', 'chrome-open', 'Chrome: a link'],
    ['google usb c chargers', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a search'],
    ['search Google for the MacBook Pro battery', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a search'],
    ['search for usb c chargers in Chrome', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a search'],
    ['look it up on Google', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a search for this'],
    ['google it', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a search for this'],
    ['open youtube', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a site'],
    ['go to amazon.com', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a site'],
    ['open the apple support page in Chrome', 'V0', 'destination', 'windows', 'chrome-open', 'Chrome: a search'],
    ['start live view', 'V0', 'camera', 'today', 'camera', 'the live view on (v8.0: opens Optics)'],
    ['video mode', 'VL', 'top', 'optics', 'optics', 'the live view on (E2)'],
    ['stop live view', 'LV', 'top', 'today', 'optics', 'the live view off (v8.0)'],
    ['how much has the live view cost', 'LV', 'app', 'voice', 'app', 'the readout'],
    ['next', 'T', 'top', 'tours', null, 'the next step'],
    ['go back', 'T', 'top', 'tours', null, 'the step before'],
    ['show me that enclosed', 'T', 'top', 'tours', null, 'a choice'],
  ].map(([words, state, layer, owner, id, does, extra = {}]) => Object.freeze({ words, state, layer, owner, id, does, should: !!extra.should })),
);

// T5: the recognizer's other readings. Taken only when the best reading isn't a question, and only
// for an action that is free, undoable, unchecked and touches neither the camera nor the microphone.
export const ALTERNATIVES = Object.freeze(
  [
    { best: 'new jacket', alts: ['new chat'], state: 'V0', want: { id: 'app' } },
    { best: "what's the best camera", alts: ['open the camera'], state: 'V0', want: 'claude' },
    { best: 'take a pitcher', alts: ['take a picture'], state: 'V0', want: 'claude' },
    { best: 'google earth is cool', alts: ['google earth'], state: 'V0', want: 'claude' },
    { best: 'topics', alts: ['optics'], state: 'V0', want: 'claude' },
    { best: 'open topics', alts: ['open optics'], state: 'V0', want: 'claude' },
    { best: 'stop listing', alts: ['stop listening'], state: 'V0', want: 'claude' },
    { best: 'exit voice mod', alts: ['exit voice mode'], state: 'V0', want: 'claude' },
    { best: 'open my blue prince', alts: ['open my blueprints'], state: 'V0', want: { id: 'app' } },
    { best: 'what am I looking hat', alts: ['what am I looking at'], state: 'V0', want: 'claude' },
    { best: 'what is this', alts: ['what is that'], state: 'VL', want: { id: 'optics' } },
    { best: 'look at dis', alts: ['look at this'], state: 'VL', want: 'claude', by: 'optics' }, // E4: "look …" no longer a Look by itself
    { best: 'yes', alts: ['no'], state: 'V0', want: 'claude' },
    { best: 'yep', alts: ['yes'], state: 'TD', want: 'claude' },
    { best: 'clay Back in Black', alts: ['play Back in Black'], state: 'V0', want: { id: 'music' } },
    { best: 'what role does OPEC play in oil prices', alts: ['play oil prices'], state: 'V0', want: 'claude' },
    // v8.1 fixes: camera words never from another reading (rule 4, R7).
    // PRIVACY-5: Screens' camera views and the camera's window.
    { best: 'put the cameras on my other screen', alts: ['put the camera on my other screen'], state: 'V0', want: 'claude' },
    { best: 'put the cameras on my other screen', alts: ['put the camera on my other screen'], state: 'C0', want: 'claude' },
    { best: 'show the camera on my brother screen', alts: ['show the camera on my other screen'], state: 'V0', want: 'claude' },
    { best: 'put the camera in a widow', alts: ['put the camera in a window'], state: 'V0', want: 'claude' },
    { best: 'put the life you on my other screen', alts: ['put the live view on my other screen'], state: 'V0', want: 'claude' },
    { best: 'make the camera widow bigger', alts: ['make the camera window bigger'], state: 'VW', want: 'claude' },
    // PRIVACY-4: with Optics live and nothing looked at, "research this" takes a Look first.
    { best: 'we search this', alts: ['research this'], state: 'VL', want: 'claude' },
    // PRIVACY-3: Optics' own microphone gives the router every reading (the live view, a camera switch).
    { best: 'lie view', alts: ['live view'], state: 'OV', want: 'claude' },
    { best: 'use the logic tech camera', alts: ['use the logitech camera'], state: 'OV', want: 'claude' },
  ].map((r) => Object.freeze(r)),
);

// T1: ordinary sentences another builder's fix takes back from a matcher (they wait until its module
// registers something, then must reach Claude): Optics' "look …" (E4, Track 5).
const LOOK_STATES = ['VL', 'VF', 'LV', 'OV'];
export const WAITING_FIXES = Object.freeze(
  [
    'look up the MacBook Pro battery part number', 'look into the warranty', 'look into flights for me', 'take a look at my calendar',
    'look at my calendar', 'look at my email', 'look it up online', 'look it up',
  ].map((words) => Object.freeze({ words, states: LOOK_STATES, by: 'optics', why: 'E4: Optics\' "look …" no longer steals' })),
);

// T1: today's takes that stay on purpose, in any state where the thing is open (a builder's own states too).
export const KEPT_TAKES = Object.freeze(
  [
    ['is the camera on', 'hologram', "R10: the laptop's camera part is selected (free, undoable)"],
    ['open the hologram of the battery', 'hologram', 'selects the battery part (free, undoable)'],
    ['stop that', 'hologram', 'holds the model still (free, undoable)'],
    ['show me a hologram of a jet engine', 'optics', 'Optics\' "hologram of": Claude still builds what was named'],
    ['what about now', 'optics', 'a Look of the scene now (by design)'],
    ['this one', 'optics', 'a Look of the scene now (by design)'],
    ['is this ripe', 'optics', 'a question about "this" with the camera on is a Look (by design)'],
  ].map(([words, by, why]) => Object.freeze({ words, by, when: by, why })),
);

// T4: matchers that listen on some surfaces only, on purpose (R1's declared exceptions). A section of
// voice-corpus.mjs may add its own: `parity: [{ id, surfaces, why }]`.
export const PARITY_EXCEPTIONS = Object.freeze(
  [
    { id: 'voice-controls', surfaces: ['voice'], why: "Voice Mode's own controls (stop talking, read the full answer, exit Voice Mode)" },
    { id: 'briefing', surfaces: ['voice'], why: '"brief me" with no home base: Voice Mode asks with the price first (C6); typed, it is a question as before' },
    { id: 'camera', surfaces: ['voice'], why: 'camera words with Optics closed open the camera only in Voice Mode (R1)' },
    { id: 'prompt', surfaces: ['voice'], why: "Chrome's questions are answered in Voice Mode or on their card" },
    { id: 'question', surfaces: ['voice'], why: "Voice Mode's own questions" },
    { id: 'reply-building', surfaces: ['voice'], why: "words said while Voice Mode's reply builds a hologram" },
    { id: 'homebase', surfaces: ['voice', 'chat'], why: "the home base's answers are said in Voice Mode or written in the chat" },
    { id: 'brain', surfaces: ['voice', 'chat'], why: "the home base's answers are said in Voice Mode or written in the chat" },
    { id: 'optics', surfaces: ['voice', 'optics'], why: "Optics' own words, where Optics is (typed in its field, the Look's question)" },
    { id: 'hologram', surfaces: ['voice', 'hologram'], why: "the hologram's own words, where it is" },
    { id: 'blueprint', surfaces: ['voice'], why: "a blueprint sheet over Voice Mode (the viewer's field closes its own)" },
    { id: 'music', surfaces: ['voice', 'chat'], why: "typed in a hologram's field over Voice Mode it is Voice Mode's (its card shows there); Optics' field is the Look's question" },
    { id: 'chrome-link', surfaces: ['voice', 'chat'], why: "Jarvis for Chrome's link status and setup (chrome-relay): said in Voice Mode or written in the chat" },
    // Declared here from the surfaces optics' and mac-dev's modules register (their branches predate T4):
    { id: 'optics-card', surfaces: ['voice', 'optics'], why: "a Look's picture card, where Optics shows it (optics)" },
    { id: 'optics-camera-part', surfaces: ['voice', 'hologram'], why: "R10: camera words that name a hologram's camera part, where the hologram is (optics)" },
    { id: 'optics-research', surfaces: ['voice', 'optics'], why: '"research this": the price first, in Voice Mode and Optics\' field; typed in the chat it is a question (optics)' },
    { id: 'optics-research-answer', surfaces: ['voice'], why: "a dear way for Voice Mode's research offer (optics)" },
    { id: 'optics-open', surfaces: ['voice', 'chat', 'optics'], why: "\"open optics\": typed in a hologram's field it is the hologram's question (optics)" },
    { id: 'optics-close', surfaces: ['voice', 'chat', 'optics'], why: "\"close the camera\": typed in a hologram's field it is the hologram's question (optics)" },
    { id: 'audio-status', surfaces: ['voice', 'chat'], why: "\"which microphone are you using\": typed in a viewer's field it is that viewer's question (mac-dev)" },
  ].map((r) => Object.freeze(r)),
);
