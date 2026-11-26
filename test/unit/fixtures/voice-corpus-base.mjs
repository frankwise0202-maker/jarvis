// The base corpora of the one router (v8.1, SPEC §30; tests T1-T5). Plain data, no app imports.
// Taken from the hands-free study's probes (u-voice corpus.mjs: 199 ordinary sentences, 63 phrases
// the owner expects to work) and the review's Chrome-context probe, with every laptop brand made
// generic. Each builder adds its own phrases in its own section of voice-corpus.mjs and
// collisions.mjs; this file is the shared base they all must keep passing.
//
//   NO_STEAL           ordinary sentences: each reaches Claude in every state of NO_STEAL_STATES (T1)
//   ALLOWED_TAKES      the few takes T1 allows, each with why (today's harmless behaviour, or by design)
//   CHROME_CONTEXT_NOT sentences that never become a Jarvis for Chrome task, even within 2 minutes of
//                      "pull this up in Chrome" (state CC): the review's probe took 12 ordinary
//                      sentences and 8 commands (critique H3)
//   MUST_MATCH         [text, state, layer, owner, does]: who must take each phrase, in which layer (T2).
//                      owner: the builder whose matcher takes it; does: what it does, in words. Rows
//                      marked { should: true } belong to a SHOULD item and count once it is built.
//   ALTERNATIVES       { best, alts, state, want } (T5): want 'claude' (nothing taken) or { layer, does }
//   STATES             the router states the corpora run in (contract (b)'s `state`), by name
//   stateFor(name, patch)  a full state: baseState() with that state's fields (and `patch`) on top
//   LAPTOP_PARTS       a generic laptop hologram's parts (a camera and a display among them, for R10)

export const LAPTOP_PARTS = Object.freeze([
  { id: 'bottom-cover', name: 'Bottom cover', aka: ['base cover'] },
  { id: 'palm-rest', name: 'Palm rest', aka: ['top case'] },
  { id: 'lid', name: 'Display lid' },
  { id: 'display', name: 'Display panel', aka: ['screen'] },
  { id: 'webcam', name: 'Camera module', aka: ['webcam'] },
  { id: 'hinges', name: 'Hinges' },
  { id: 'keyboard', name: 'Keyboard' },
  { id: 'touchpad', name: 'Touchpad', aka: ['trackpad'] },
  { id: 'battery', name: 'Battery (57 Wh)', aka: ['battery pack'] },
  { id: 'battery-connector', name: 'Battery connector' },
  { id: 'mainboard', name: 'Mainboard', aka: ['motherboard', 'system board'] },
  { id: 'ram', name: 'RAM (SO-DIMM)', aka: ['memory'] },
  { id: 'ssd', name: 'M.2 SSD', aka: ['solid state drive'] },
  { id: 'wifi', name: 'Wi-Fi card', aka: ['wireless card'] },
  { id: 'fan', name: 'Cooling fan' },
  { id: 'heatsink', name: 'Heat pipe and heatsink' },
  { id: 'speakers', name: 'Speakers' },
]);

/** Every field of contract (b)'s state, as it is with nothing open (Voice Mode on a computer). */
export function baseState() {
  return {
    surface: 'voice',
    speaking: false,
    check: null,
    questions: [],
    prompt: null,
    tour: null,
    hologram: null,
    blueprintOpen: false,
    optics: null,
    windows: [],
    reply: { links: [], hologram: null },
    chrome: { linked: false, online: false, task: null, contextUntil: 0 },
    music: { playing: false },
    homebase: { linked: true },
    standby: false,
    hidden: false,
    phone: false,
  };
}

const HOLO = { open: true, inWindow: false, parts: LAPTOP_PARTS, selected: null };
const optics = (mode, extra = {}) => ({ open: true, mode, liveView: false, card: null, cameraAllowed: 'granted', sceneChanged: false, ...extra });
const WINDOW = { id: 'w1', kind: 'answer', label: 'the answer window', focused: false };

// The states (u-voice §4.4 T1, plus the Chrome context of critique H3 and the live view of v8.0).
export const STATES = Object.freeze({
  V0: {}, // nothing open
  S: { speaking: true }, // Jarvis speaking (heard after a tap or barge-in)
  T: { hologram: HOLO, tour: { active: true, atChoice: false, choices: [], stepId: 's3' } }, // a walkthrough
  VH: { hologram: HOLO }, // a laptop hologram open
  VL: { optics: optics('live') }, // Optics, the camera live
  VF: { optics: optics('frozen') }, // Optics, an answer on its frozen frame
  LV: { optics: optics('live', { liveView: true }) }, // Optics with v8.0's live view on
  VW: { windows: [WINDOW] }, // a Jarvis window open
  VHW: { hologram: HOLO, windows: [WINDOW] }, // a hologram and a window
  CH: { surface: 'chat' }, // the chat box
  HF: { surface: 'hologram', hologram: HOLO }, // the hologram's own field
  OF: { surface: 'optics', optics: optics('live') }, // Optics' own field
  CC: { chrome: { linked: true, online: true, task: null, contextUntil: Number.MAX_SAFE_INTEGER } }, // a Chrome context
});

/** The state called `name` (see STATES), complete, with `patch` on top. */
export function stateFor(name, patch = {}) {
  const s = STATES[name];
  if (!s) throw new Error(`no state called ${name}`);
  return { ...baseState(), ...s, ...patch };
}

export const NO_STEAL_STATES = Object.freeze(['V0', 'S', 'T', 'VH', 'VL', 'VF', 'LV', 'VW', 'VHW', 'CH', 'HF', 'OF', 'CC']);

// Ordinary things the owner might say that must reach Jarvis (Claude) in every state. Many share
// words with commands (open, close, camera, window, screen, Chrome, search, research, picture, stop,
// next, back, history, settings, new, chat, live, video, watch, read).
export const NO_STEAL = Object.freeze([
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

// Takes T1 allows: today's harmless behaviour, or Optics' own "this" questions (a Look by design).
export const ALLOWED_TAKES = Object.freeze([
  { text: 'show me a hologram of a jet engine', states: ['VL', 'VF', 'LV', 'OF'], by: 'optics', why: "Optics' \"hologram of this\": Claude still builds what was named; the frame adds about half a cent" },
  { text: 'open the hologram of the battery', states: ['T', 'VH', 'VHW', 'HF'], by: 'hologram', why: 'selects the battery part (free, undoable)' },
  { text: 'stop that', states: ['T', 'VH', 'VHW', 'HF'], by: 'hologram', why: 'holds the model still (free, undoable)' },
  { text: 'what about now', states: ['VL', 'VF', 'LV', 'OF'], by: 'optics', why: 'a Look of the scene now (by design)' },
  { text: 'is this ripe', states: ['VL', 'LV', 'OF'], by: 'optics', why: 'a question about "this" with the camera live is a Look (by design)' },
  { text: 'is this ripe', states: ['VF'], by: 'optics', why: 'a question about "this" on a frozen frame is its follow-up (by design)' },
  { text: 'this one', states: ['VL', 'VF', 'LV', 'OF'], by: 'optics', why: 'a Look of the scene now (by design)' },
]);

// Never a Jarvis for Chrome task, even in a Chrome context (critique H3: its probe took these).
export const CHROME_CONTEXT_NOT = Object.freeze([
  'compare the MacBook Pro and the MacBook Air', 'open the pod bay doors', 'go to bed', 'go to the store', 'open the hologram of the battery',
  'open the window it is hot', 'open the blinds', 'open the door', 'open the fridge', 'open the camera app on my phone',
  'open the settings app on my iPhone', 'go to amazon and buy a charger',
  'open the camera', 'open the voice settings', 'open the library', 'open the home base', 'hey Jarvis open the camera',
  'go to standby', 'open the hologram window', 'go to my other screen', 'go to the battery', 'new chat', 'open settings',
]);

// [text, state, layer, owner, does]. Layers: contract (b)'s LAYERS. Owners: the builder whose matcher takes it.
export const MUST_MATCH = Object.freeze([
  ['open optics', 'V0', 'app', 'optics', 'opens Optics'],
  ['hey Jarvis, open optics', 'V0', 'app', 'optics', 'opens Optics'],
  ['open the camera', 'V0', 'app', 'optics', 'opens Optics'],
  ['turn on the camera', 'V0', 'app', 'optics', 'opens Optics'],
  ['camera on', 'V0', 'app', 'optics', 'opens Optics'],
  ['close the camera', 'V0', 'app', 'optics', 'closes Optics'],
  ['take a picture', 'V0', 'app', 'optics', 'a Look', { should: true }],
  ['take a photo of this', 'V0', 'app', 'optics', 'a Look', { should: true }],
  ['snap a picture', 'VL', 'top', 'optics', 'a Look', { should: true }],
  ['look at my screen', 'V0', 'destination', 'voice', 'a Look at the screen', { should: true }],
  ['switch cameras', 'V0', 'app', 'optics', 'opens Optics on the next camera'],
  ['use the Logitech camera', 'V0', 'app', 'optics', 'opens Optics on that camera'],
  ['new chat', 'V0', 'app', 'voice', 'new-chat'],
  ['start a new chat', 'VH', 'app', 'voice', 'new-chat'],
  ['open history', 'V0', 'app', 'voice', 'open history'],
  ['show me my history', 'V0', 'app', 'voice', 'open history'],
  ['open settings', 'V0', 'app', 'voice', 'open settings'],
  ['open the voice settings', 'V0', 'app', 'voice', 'open settings'],
  ['open my blueprints', 'V0', 'app', 'voice', 'open library'],
  ['open the library', 'V0', 'app', 'voice', 'open library'],
  ['show mission control', 'V0', 'app', 'voice', 'open mission'],
  ['open the home base', 'V0', 'app', 'voice', 'open homebase'],
  ['stop talking', 'S', 'app', 'voice', 'hush'],
  ['be quiet', 'S', 'app', 'voice', 'hush'],
  ['read the full answer', 'V0', 'app', 'voice', 'read-full'],
  ['repeat that', 'V0', 'app', 'voice', 'repeat'],
  ['speak slower', 'V0', 'app', 'voice', 'voice-rate'],
  ['stop listening', 'V0', 'app', 'voice', 'mic-off'],
  ['exit voice mode', 'V0', 'app', 'voice', 'exit-voice'],
  ['put the camera and the hologram side by side', 'V0', 'destination', 'windows', 'side by side'],
  ['side by side', 'VW', 'destination', 'windows', 'side by side'],
  ['put the camera on the left and the hologram on the right', 'V0', 'destination', 'windows', 'left and right'],
  ['swap them', 'VW', 'destination', 'windows', 'swap'],
  ['make the window bigger', 'VW', 'destination', 'windows', 'size'],
  ['make it full screen', 'VW', 'destination', 'windows', 'size'],
  ['full screen', 'VW', 'destination', 'windows', 'size'],
  ['close that window', 'VW', 'destination', 'windows', 'close one'],
  ['close the camera window', 'VW', 'destination', 'windows', 'close one'],
  ['close everything', 'VW', 'destination', 'windows', 'close all'],
  ['show me the hologram window', 'VW', 'destination', 'windows', 'focus'],
  ["okay, we'll do this in this window", 'VW', 'destination', 'windows', 'here'],
  ['pull this up in Chrome', 'V0', 'destination', 'windows', 'Chrome: this'],
  ['pull this up in Google Chrome', 'VL', 'destination', 'windows', 'Chrome: this'],
  ['open this in Chrome', 'VH', 'destination', 'windows', 'Chrome: this'],
  ['open that in a new tab', 'V0', 'destination', 'windows', 'Chrome: this'],
  ['open the first link', 'V0', 'destination', 'windows', 'Chrome: a link'],
  ['open the second link in Chrome', 'V0', 'destination', 'windows', 'Chrome: a link'],
  ['open link 3', 'V0', 'destination', 'windows', 'Chrome: a link'],
  ['google usb c chargers', 'V0', 'destination', 'windows', 'Chrome: a search'],
  ['search Google for the MacBook Pro battery', 'V0', 'destination', 'windows', 'Chrome: a search'],
  ['search for usb c chargers in Chrome', 'V0', 'destination', 'windows', 'Chrome: a search'],
  ['look it up on Google', 'V0', 'destination', 'windows', 'Chrome: a search for this'],
  ['google it', 'V0', 'destination', 'windows', 'Chrome: a search for this'],
  ['open youtube', 'V0', 'destination', 'windows', 'Chrome: a site'],
  ['go to amazon.com', 'V0', 'destination', 'windows', 'Chrome: a site'],
  ['open the apple support page in Chrome', 'V0', 'destination', 'windows', 'Chrome: a search'],
  ['start live view', 'V0', 'app', 'optics', 'the live view on'],
  ['video mode', 'VL', 'top', 'optics', 'the live view on'],
  ['stop live view', 'LV', 'top', 'optics', 'the live view off'],
  ['how much has the live view cost', 'LV', 'app', 'voice', 'spend live'],
  ['next', 'T', 'top', 'tours', 'next step'],
  ['go back', 'T', 'top', 'tours', 'step back'],
  ['show me that enclosed', 'T', 'top', 'tours', 'a choice'],
].map(([text, state, layer, owner, does, extra = {}]) => Object.freeze({ text, state, layer, owner, does, should: !!extra.should })));

// T5: the recognizer's other readings. Taken only when the best reading isn't a question, and only
// for an action that is free, undoable, unchecked and touches neither the camera nor the microphone.
export const ALTERNATIVES = Object.freeze([
  { best: 'new jacket', alts: ['new chat'], state: 'V0', want: { layer: 'app', does: 'new-chat' } },
  { best: "what's the best camera", alts: ['open the camera'], state: 'V0', want: 'claude' },
  { best: 'take a pitcher', alts: ['take a picture'], state: 'V0', want: 'claude' },
  { best: 'google earth is cool', alts: ['google earth'], state: 'V0', want: 'claude' },
  { best: 'topics', alts: ['optics'], state: 'V0', want: 'claude' },
  { best: 'open topics', alts: ['open optics'], state: 'V0', want: 'claude' },
  { best: 'stop listing', alts: ['stop listening'], state: 'V0', want: 'claude' },
  { best: 'exit voice mod', alts: ['exit voice mode'], state: 'V0', want: 'claude' },
  { best: 'open the settings', alts: ['open the satins'], state: 'V0', want: { layer: 'app', does: 'open settings' } },
  { best: 'open my blue prince', alts: ['open my blueprints'], state: 'V0', want: { layer: 'app', does: 'open library' } },
]);
