// Microphone and speaker (Track 1: A4, A5, A10): this builder's voice and typed commands (v8.1; mac-dev writes this file).
//
// app.js calls register() once at start (registerCommandModules), with the app's shared deps plus its own:
// `audio` (src/platform/audio-devices.js's controller, or null). Keep this module importable in Node (no DOM
// at import time): the T3 harness (test/unit/command-router.test.mjs) registers every module with fake deps.
// Its phrases are in the mac-dev section of test/unit/fixtures/voice-corpus.mjs (and collisions.mjs).
//
//   audio-status  "which microphone are you using?", "which speaker are you using?", "is the speakerphone
//                 connected?": Jarvis says where he listens and speaks (free, nothing changes). Whole
//                 sentences only, so "which microphone should I buy?" stays a question for Claude.

import { audioStatusLine } from '../../lib/audio-devices.js';

/** The words, normalized: lower case, no punctuation, no "hey Jarvis" before or "please" after. */
export function normalizeAudioWords(text) {
  return String(text == null ? '' : text)
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:hey|ok|okay) )?jarvis /, '')
    .replace(/ (?:please|jarvis)$/, '')
    .trim();
}

const STATUS = [
  /^(?:which|what) (?:microphone|mic) are you (?:using|listening on|listening with|listening through)$/,
  /^(?:which|what) speakers? are you (?:using|speaking on|speaking through|playing on|playing through)$/,
  /^(?:which|what) (?:microphone|mic) and (?:which |what )?speakers? are you using$/,
  /^where are you (?:listening and speaking|listening|speaking)$/,
  /^is the speakerphone (?:connected|on)$/,
  /^are you (?:on|using) the speakerphone$/,
];

/** The status question, or null: { do: 'audio-status', free, undo }. Pure. */
export function matchAudioStatus(text) {
  const w = normalizeAudioWords(text);
  if (!w || w.split(' ').length > 12) return null;
  return STATUS.some((re) => re.test(w)) ? { do: 'audio-status', free: true, undo: true } : null;
}

/**
 * @param {{ register: Function }} router  the app's command router
 * @param {object} deps  shared: { getSettings, saveSettings, toast, voice(), routerState(surface, local), phone,
 *   demo }, plus `audio` (the device controller, or null)
 */
export function register(router, deps) {
  const audio = deps && deps.audio && typeof deps.audio === 'object' ? deps.audio : null;
  router.register({
    id: 'audio-status',
    layer: 'app',
    surfaces: ['voice', 'chat'],
    match: (text) => matchAudioStatus(text),
    run: () => {
      let plan = null;
      let devices = null;
      try {
        plan = audio && audio.supported() ? audio.plan() : null;
        devices = audio ? audio.devices() : null;
      } catch {
        plan = null;
      }
      return { say: audioStatusLine(plan, devices) };
    },
  });
}
