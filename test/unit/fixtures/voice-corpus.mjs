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
