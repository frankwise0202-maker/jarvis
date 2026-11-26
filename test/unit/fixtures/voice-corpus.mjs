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
