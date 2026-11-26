// Hands-free on a Mac (v8.1, SPEC §28): the pure rules of a session the owner started (a wake, a tap or a
// key) and that may run with Jarvis's window in the background, and of interrupting him by voice.
//
//   HANDS_FREE                        the numbers below (each owner choice in one place)
//   followUp({ woken, away, continuous, asking, asked }) -> { listen, brake, noSpeechMs, tries }
//                                     what Voice Mode does after an answer (A6)
//   bargeInAllowed({ computer, setup, test }) -> boolean
//                                     "Hey Jarvis" or two claps may stop him while George speaks (A8)
//   readHandsFreeTest(storage) -> { at, hiddenWords, selfTrigger, heardSpeaker } | null
//                                     the hands-free Test's last results (Settings → Voice → Microphone and
//                                     speaker writes them: src/lib/audio-devices.js normalizeHandsFreeTest)
//   startsWithWakeWords(text) -> boolean      a heard sentence starts with "Hey Jarvis" (MAC-V-1: the owner calling
//                                     him; the hidden count starts again)
//   jarvisSpans(text) -> [{ start, end }]    where "Jarvis" is in a text he says
//   createSelfMask({ cps, beforeMs, afterMs, now }) -> mask
//                                     while he speaks, whether a "Hey Jarvis" heard now may be his own
//
// The follow-up window (A6, owner question 3): after an answer, a woken session, and every session while
// Jarvis is in the background, listens once for HANDS_FREE.followUpMs; nobody speaks: back to Standby (or
// idle). While he is in the background, at most HANDS_FREE.hiddenQuestions questions in a row are taken
// without "Hey Jarvis", a tap or a key (claps are the weak signal: they don't count); then no more follow-up
// listens (the brake: a TV left on can't run up paid questions). On screen, a session the owner tapped keeps today's Continuous rule.
//
// Barge-in (A8): only on a computer, only in the setups where the wake microphone is the Mac's own
// (HANDS_FREE.bargeInSetups; owner question 10), and only once the hands-free Test's self-trigger step has
// passed (George saying "Jarvis" did not wake the detector). Voice Mode adds the rest at the moment it
// hears one: George is the voice speaking (the Mac's own voice is played by macOS, outside Chrome's echo
// reference), and the self-mask is clear.

import { HANDS_FREE_TEST_KEY, normalizeHandsFreeTest } from './audio-devices.js';

export const HANDS_FREE = Object.freeze({
  followUpMs: 8000, // owner question 3: how long the listen after an answer waits for words
  hiddenQuestions: 3, // owner question 3: questions in a row while hidden, without the wake words or a tap
  bargeInSetups: Object.freeze(['speaker-mac-mic', 'switch']), // owner question 10: add 'speakerphone-both' to allow it there
  maskBeforeMs: 1000, // the wake detector doesn't count from this long before each "Jarvis" he says ...
  maskAfterMs: 1000, // ... to this long after it
  charsPerSecond: 14.5, // speech at rate 1 (Voice Mode's caption estimate)
});

/**
 * After an answer: listen for a follow-up, and how. `woken`: a session opened from Standby; `away`: Jarvis
 * is not on screen and listens there (a computer, the setting on); `continuous`: Settings (Continuous);
 * `asking`: the wake routine just made its offer (it listens for the answer, Continuous or not); `asked`:
 * the questions taken since the last wake words, tap or key.
 *   { listen: false, brake: false }       today's rule says no (Continuous off)
 *   { listen: false, brake: true }        the brake: hidden, and `asked` reached HANDS_FREE.hiddenQuestions
 *   { listen: true, noSpeechMs, tries }   noSpeechMs 0 and tries 0 mean today's (two tries of up to 12 s)
 */
export function followUp({ woken = false, away = false, continuous = true, asking = false, asked = 0 } = {}) {
  if (!continuous && !asking) return { listen: false, brake: false, noSpeechMs: 0, tries: 0 };
  if (away && asked >= HANDS_FREE.hiddenQuestions) return { listen: false, brake: true, noSpeechMs: 0, tries: 0 };
  if (woken || away) return { listen: true, brake: false, noSpeechMs: HANDS_FREE.followUpMs, tries: 1 };
  return { listen: true, brake: false, noSpeechMs: 0, tries: 0 };
}

/**
 * Barge-in may be on: a computer, one of HANDS_FREE.bargeInSetups chosen (Settings `audioSetup`), and the
 * hands-free Test's self-trigger step passed (`test`: readHandsFreeTest()).
 */
export function bargeInAllowed({ computer = false, setup = '', test = null } = {}) {
  return computer === true && HANDS_FREE.bargeInSetups.includes(setup) && !!test && test.selfTrigger === 'passed';
}

/** The hands-free Test's last results from `storage` (localStorage), or null when there are none. */
export function readHandsFreeTest(storage) {
  try {
    return normalizeHandsFreeTest(storage && typeof storage.getItem === 'function' ? storage.getItem(HANDS_FREE_TEST_KEY) : null);
  } catch {
    return null;
  }
}

/**
 * MAC-V-1: a heard sentence starts with the wake words: "Hey Jarvis, …" as the recognizer writes it ("hi", "OK",
 * "okay" or "a" for "hey"; "Jervis"). A bare "Jarvis, …" doesn't count: a film or the TV says that more often.
 */
export function startsWithWakeWords(text) {
  if (typeof text !== 'string') return false;
  const s = text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:hey|hi|ok|okay|a) (?:jarvis|jervis)(?: |$)/.test(s);
}

/** Where "Jarvis" is in `text`, as character offsets [{ start, end }] (any case; "Jarvis's" too). */
export function jarvisSpans(text) {
  const out = [];
  const s = String(text ?? '');
  const re = /(^|[^\p{L}\p{N}])(jarvis)(?![\p{L}\p{N}])/giu;
  let m;
  while ((m = re.exec(s))) {
    const start = m.index + m[1].length;
    out.push({ start, end: start + m[2].length });
  }
  return out;
}

/**
 * The self-mask (A8, critique M8): while Jarvis speaks, the wake detector must not take his own "Jarvis"
 * for the owner's. It follows what is being said through the speech's own events, as they are heard:
 *   mask.begin(text, rate)    a new speech: everything he will say (offsets in its events are into it)
 *   mask.text(text)           the same speech, with more text appended (a reply that streams)
 *   mask.chunk({ start })     a chunk starts playing at offset `start`
 *   mask.boundary({ charIndex })   a word starts playing
 *   mask.masked()             true from about beforeMs before each "Jarvis" to afterMs after it (the
 *                             position between events is estimated at `cps` characters a second × rate)
 *   mask.end()                he stopped speaking: nothing is masked
 */
export function createSelfMask({ cps = HANDS_FREE.charsPerSecond, beforeMs = HANDS_FREE.maskBeforeMs, afterMs = HANDS_FREE.maskAfterMs, now = () => Date.now() } = {}) {
  let spans = [];
  let rate = 1;
  let pos = -1; // the offset playing at `at` (-1: nothing has played yet)
  let at = 0;
  const speed = () => (cps * rate) / 1000; // characters per millisecond
  return {
    begin(text, r = 1) {
      spans = jarvisSpans(text);
      rate = Number.isFinite(r) && r > 0 ? r : 1;
      pos = -1;
    },
    text(text) {
      spans = jarvisSpans(text);
    },
    chunk(c) {
      const start = Number(c && c.start);
      if (!Number.isFinite(start)) return;
      pos = start;
      at = now();
    },
    boundary(b) {
      const ci = Number(b && b.charIndex);
      if (!Number.isFinite(ci)) return;
      pos = ci;
      at = now();
    },
    masked() {
      if (pos < 0 || !spans.length) return false;
      const p = pos + Math.max(0, now() - at) * speed();
      const before = beforeMs * speed();
      const after = afterMs * speed();
      return spans.some((x) => p >= x.start - before && p <= x.end + after);
    },
    end() {
      spans = [];
      pos = -1;
    },
  };
}
