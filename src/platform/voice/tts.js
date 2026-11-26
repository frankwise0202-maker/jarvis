// Spoken replies with speechSynthesis (SPEC §9.2, §16).
//
//   ttsSupported()
//   getVoices() -> Promise<SpeechSynthesisVoice[]>   after 'voiceschanged' or 1.5 s
//   voiceQuality(voice) -> 'premium' | 'enhanced' | 'natural' | 'standard'
//   rankVoices(voices) -> a new array, best first (the Settings picker; order below)
//   pickDefaultVoice(voices) -> voice | null           the best of rankVoices (privacy rule below)
//   resolveVoice(voiceURI, voices)                     the stored voice, else the default pick
//   unlockSpeech()     speak an empty utterance; call from the first click/keydown/touchend
//                      handler (not touchstart/pointerdown) so iOS allows speech later on
//   createSpeechStream({ voiceURI, rate, onStart, onChunk, onBoundary, onIdle, onEnd }) -> stream
//        Text can be appended while it is being spoken (see "Speech streams" below).
//   speak(text, { voiceURI, rate, onStart, onChunk, onBoundary, onEnd }) -> { cancel() }
//        A stream that is given all its text at once (append + finish).
//   stopSpeaking(), isSpeaking()      cover streams too
//   toSpeech(markdown, mode)   'summary' = first paragraph as plain text, ≤ ~400 chars;
//                              'full' = all plain text without code blocks or URLs, one line per
//                              block (the line breaks become pauses); 'off' = ''
//   chunkText(text, max = 220), splitSentences(text)   pure helpers (exported for tests)
//   SPEECH_TIMING              the engine's timing constants (read-only)
//   setPausesWhenHidden(on)    v8.1: false on a computer (app.js, once): the watchdogs count time while
//                              the page is hidden too (speech goes on there); true (the default): the
//                              iPhone's rule, only visible time counts (iOS pauses speech in the background)
//
// Speech streams. Real engines break a simple "speak the next chunk from the previous chunk's
// onend" chain in many ways (WebKit leaves speaking/pending stuck, onend goes missing or comes
// early or twice, speak() inside onend is dropped, Chrome drops an utterance queued right after
// cancel() and stops long online utterances, iOS pauses in the background, our own cancel()
// produces 'interrupted' errors). Chromium and WebKit keep a FIFO queue: `speaking` is true while
// anything is queued (from the moment speak() is called, audio or not, so a silently dropped
// utterance looks "speaking" until cancel()), `pending` while more than one is, and the next
// utterance goes to the platform only once the current one has completed (a lost completion
// stalls the queue). So the engine:
//   - keeps the next chunk already queued in speechSynthesis while the current one plays
//     (queued at the current chunk's start, or when it is assumed to be playing), never more
//     than 2 of ours at a time, and keeps a reference to every queued utterance;
//   - never calls speechSynthesis.speak() from inside an engine event (it waits 30 ms);
//   - treats a chunk as playing on 'start' or a boundary event (proof), and also, tentatively,
//     when the engine says it is speaking with nothing pending 3 s after the chunk should have
//     started (quirk f; onChunk fires and the next chunk is queued behind it, but this is never
//     proof: a dropped utterance looks the same); a later chunk's start, or `pending` going false
//     while our next chunk waited behind it (the engine moved on), means every earlier chunk has
//     finished;
//   - treats a started chunk as ended when 'end' comes, when its time is up
//     (max(4 s, 2.5 × expected + 1.5 s) from its start, expected = chars / (15 × rate) s; a
//     boundary event moves that to at least 3 s after the boundary), or after the engine has
//     reported 3 s of silence; while the engine's flags stay on, sooner when it is known: 1.5 ×
//     the rest's expected time + 1 s after a boundary reached the chunk's last word, the stream's
//     measured speed for its last chunk (max(1.3 × measured, expected) + 1 s; measured on chunks
//     with a real start that played to their end, ≥ 24 characters, kept per voice and rate), and
//     1.6 × expected + 1.5 s for a chunk with our next one waiting behind it once this stream
//     has had a stall;
//   - a stall: when a chunk is settled that way while our next chunk still waits behind it
//     (`pending`), the engine is stuck on it: cancel() and queue the waiting chunks again at once
//     (this costs no retry); when nothing of ours waited, the next chunk queued behind something
//     gets 1 s to start before the same;
//   - a chunk that was only assumed to be playing and shows no event is a silent drop (quirk d)
//     when our next chunk still waits behind it 1.5 × its expected time + 3 s after it should
//     have started, or when its time is up while the engine still says it is busy: it is
//     retried like a chunk that never started;
//   - retries a chunk that never started (cancel(), a short wait, speak() again) once, then skips
//     it; if the engine still says it is speaking or has something pending, it first waits once
//     more (3 s, or until the previous chunk's time is up); an 'interrupted'/'canceled' error
//     within 1 s of our own cancel() on a chunk that never played is the same drop and is retried
//     at once; after two chunks in a row were given up the stream ends with 'error', and a stream
//     that skipped chunks and never showed a real sign of playing ends with 'error' too;
//   - the wait before a retry: 250 ms; 500 ms for a drop the engine held; 1 s when the dropped
//     attempt was itself spoken 250 ms to 2 s after our cancel() by an engine known to be alive
//     (Chrome's drop window is longer here: later waits after our cancel() grow to match, up to 1 s);
//   - an on-device voice known to send word boundaries (one comes as soon as audio starts) that
//     shows no event at all 3 s after a chunk should have started has dropped it: retried at once;
//   - processes each utterance's events at most once and ignores events of utterances it has
//     cancelled or given up (a generation counter); any other 'interrupted'/'canceled' error
//     means someone else stopped speech: the stream ends with 'interrupted';
//   - after an 'end' that came early (before 70 % of the expected time) on the last chunk, waits
//     while the engine still says it is speaking (at most until the expected end + 0.5 s) before
//     onEnd, so a listening microphone never opens over the voice;
//   - once unlockSpeech() has run, waits 250 ms (or the learned drop window) after our own
//     cancel() before the next speak();
//   - counts time only while the page is visible (iOS pauses speech in the background), and
//     calls speechSynthesis.resume() if the engine is paused while the page is visible; v8.1: on a
//     computer (setPausesWhenHidden(false)) hidden time counts too and a paused engine is resumed
//     there as well, so a reply whose 'end' is lost in the background still ends.
//
// Chunks pack whole sentences: ≤ 220 characters for an online or unknown voice (fewer below rate
// 1, so a chunk stays under ~15 s), up to 360 for an on-device voice. A sentence longer than the
// limit is split at a clause boundary. A line break in the text always ends a chunk, so
// paragraphs and list items get a natural pause.

import { markdownToPlainText } from '../../lib/markdown.js';
// Sentences and chunks of a stream of appended text: shared with the natural voice, so both cut
// text the same way and stream offsets mean the same thing (speech-text.js).
import { ingest, newText, segment, takeChunk } from './speech-text.js';

const ONLINE_CHUNK = 220;
const LOCAL_CHUNK = 360;
const MIN_ONLINE_CHUNK = 100;
const SUMMARY_MAX = 400;
const VOICES_TIMEOUT_MS = 1500;

/** Timing of the speech engine (milliseconds of visible time unless noted). */
export const SPEECH_TIMING = Object.freeze({
  charsPerSecond: 15, // expected speed at rate 1
  endMinMs: 4000, // a started chunk is over after max(endMinMs, endFactor × expected + endExtraMs)
  endFactor: 2.5,
  endExtraMs: 1500,
  engineQuietMs: 3000, // ... or after the engine has said it is not speaking for this long
  startTimeoutMs: 3000, // a chunk with no sign of playing after this long is retried once, then skipped
  retryDelayMs: 250, // between our cancel() and the next speak() (Chrome drops one queued right after)
  dropRetryMs: 500, // a chunk the engine held but never played (a silent drop) is retried after this ...
  retryBackoffMs: 1000, // ... or this once a drop came that late after our cancel() (Chrome's window is longer)
  deferMs: 30, // speak() is never called inside an engine event (WebKit drops it); it waits this long
  tickMs: 250, // watchdog period
  cancelGraceMs: 1000, // an 'interrupted'/'canceled' error this soon after our own cancel() is a drop
  maxClockStepMs: 1000, // a longer gap between two clock readings (a suspended page) counts as this
  maxQueued: 2, // our utterances in speechSynthesis at once
  deadChunks: 2, // chunks in a row that never played before the stream ends with 'error'
  earlyEndFraction: 0.7, // an 'end' before this share of the expected time is early (quirk f) ...
  drainExtraMs: 500, // ... so the last one's onEnd waits while speaking, up to expected + this
  dropFactor: 1.5, // an assumed chunk with our next one still behind it this × expected + startTimeoutMs on was dropped
  lastWordFactor: 1.5, // flags stuck on: a chunk is over this × the rest's expected time ...
  lastWordExtraMs: 1000, // ... + this after a boundary reached its last word
  calFactor: 1.3, // flags stuck on, last chunk: over after max(this × its measured time, expected) ...
  calExtraMs: 1000, // ... + this
  stallFactor: 1.6, // after a stall in this stream: a chunk with our next one behind it is over after this × expected ...
  stallExtraMs: 1500, // ... + this
  stallStartMs: 1000, // queued behind an utterance we settled while the engine stayed busy: this long to start
});
const T = SPEECH_TIMING;

// Voice preference among English voices (SPEC §9.2), matched case-insensitively against names.
const PREFERRED_NAMES = ['daniel', 'arthur', 'oliver', 'jamie', 'malcolm', 'george', 'ryan', 'thomas'].map((n) => new RegExp(`\\b${n}\\b`, 'i'));
// Used only to rank otherwise-equal voices ("male-sounding" first).
const FEMALE_HINT =
  /\b(female|woman|samantha|karen|moira|tessa|fiona|serena|kate|stephanie|martha|libby|sonia|hazel|susan|mia|maisie|victoria|allison|ava|zoe|kathy|vicki|catherine|emily|jenny|aria|zira|nicky|joanna|kendra|kimberly|salli|amy|emma|olivia|google us english|google uk english female)\b/i;
// Apple's novelty voices and the old Eloquence voices sound like toys or robots: last resort only.
const NOVELTY_NAME = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|jester|organ|princess|superstar|trinoids|whisper|wobble|zarvox)\b/i;
const NOVELTY_URI = /\b(eloquence|novelty)\b/i;
// Chrome on a Mac names the Eloquence voices "Eddy (English (UK))" (voiceURI = name, no "eloquence").
const ELOQUENCE_NAME = /^(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley) \(/i;
const QUALITY_RANK = { premium: 0, enhanced: 1, natural: 2, standard: 3 };

function synth() {
  return globalThis.speechSynthesis;
}

export function ttsSupported() {
  try {
    const s = synth();
    return !!(s && typeof s.speak === 'function' && typeof globalThis.SpeechSynthesisUtterance === 'function');
  } catch {
    return false;
  }
}

function voicesNow() {
  try {
    const list = synth().getVoices();
    return list ? Array.from(list) : [];
  } catch {
    return [];
  }
}

/** Installed voices; waits for the browser to load them (Chrome loads them asynchronously). */
export function getVoices() {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = voicesNow();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const s = synth();
    let done = false;
    let timer = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        if (typeof s.removeEventListener === 'function') s.removeEventListener('voiceschanged', finish);
      } catch {
        /* ignore */
      }
      resolve(voicesNow());
    };
    timer = setTimeout(finish, VOICES_TIMEOUT_MS);
    try {
      if (typeof s.addEventListener === 'function') s.addEventListener('voiceschanged', finish);
      else {
        const previous = s.onvoiceschanged;
        s.onvoiceschanged = (e) => {
          if (typeof previous === 'function') previous.call(s, e);
          finish();
        };
      }
    } catch {
      /* the timeout still resolves */
    }
  });
}

// ---------------------------------------------------------------------------------------
// Voices
// ---------------------------------------------------------------------------------------

function langOf(v) {
  return String((v && v.lang) || '').replace(/_/g, '-').toLowerCase();
}

const isBritish = (v) => langOf(v).startsWith('en-gb');
const isEnglish = (v) => langOf(v).startsWith('en');

function hasWord(text, word) {
  return new RegExp(`(?:^|[^a-z])${word}(?![a-z])`, 'i').test(text);
}

/**
 * The quality tier a voice's name or voiceURI advertises (case-insensitive): "Premium" /
 * "-premium" / ".premium." → 'premium'; "Enhanced" / ".enhanced." → 'enhanced'; "Natural" or
 * "Neural" (Edge's online voices) → 'natural'; anything else → 'standard'.
 */
export function voiceQuality(voice) {
  if (!voice || typeof voice !== 'object') return 'standard';
  const text = `${typeof voice.name === 'string' ? voice.name : ''} ${typeof voice.voiceURI === 'string' ? voice.voiceURI : ''}`;
  if (hasWord(text, 'premium')) return 'premium';
  if (hasWord(text, 'enhanced')) return 'enhanced';
  if (hasWord(text, 'natural') || hasWord(text, 'neural')) return 'natural';
  return 'standard';
}

function isNovelty(v) {
  return NOVELTY_NAME.test(v.name) || ELOQUENCE_NAME.test(v.name) || NOVELTY_URI.test(String(v.voiceURI || ''));
}

function preferredRank(name) {
  const i = PREFERRED_NAMES.findIndex((re) => re.test(name));
  return i < 0 ? PREFERRED_NAMES.length : i;
}

function voiceKey(v) {
  const english = isEnglish(v);
  return [
    english ? 0 : 1, // 1. English first ...
    v.localService === true ? 0 : v.localService === false ? 2 : 1, // ... then on-device before online
    english && isNovelty(v) ? 1 : 0, // (novelty and Eloquence voices last)
    QUALITY_RANK[voiceQuality(v)], // 2. quality tier
    english && !isBritish(v) ? 1 : 0, // 3. en-GB,
    english ? preferredRank(v.name) : 0, //    the preferred British names, in order,
    english && FEMALE_HINT.test(v.name) ? 1 : 0, //    male-sounding before the female list
    v.default ? 0 : 1, // then the browser's default, then the browser's order
  ];
}

/**
 * Voices best first (for the Settings picker): English before other languages and on-device
 * before online; then the quality tier (premium, enhanced, natural, standard); then en-GB, the
 * preferred British names (Daniel, Arthur, Oliver, Jamie, Malcolm, George, Ryan, Thomas) and
 * male-sounding names before the FEMALE_HINT list. Novelty voices (Apple's "Bubbles", the
 * Eloquence voices) come after the other voices of their group. Ties keep the browser's default
 * first, then the browser's order. Entries without a name are dropped.
 */
export function rankVoices(voices) {
  const list = Array.isArray(voices) ? voices.filter((v) => v && typeof v === 'object' && typeof v.name === 'string') : [];
  const keyed = list.map((v, i) => ({ v, i, k: voiceKey(v) }));
  keyed.sort((a, b) => {
    for (let j = 0; j < a.k.length; j++) if (a.k[j] !== b.k[j]) return a.k[j] - b.k[j];
    return a.i - b.i;
  });
  return keyed.map((x) => x.v);
}

/**
 * The default voice: the best of rankVoices, so a downloaded "Daniel (Enhanced)" or
 * "Arthur (Premium)" beats the compact "Daniel". Null for an empty list.
 *
 * Privacy: an online voice (localService false, e.g. "Google UK English Male" in Chrome or
 * "Microsoft Ryan Online (Natural)" in Edge) sends the text it speaks to Google or Microsoft.
 * The ranking puts every on-device English voice (localService === true) before them, so an
 * online voice is only picked when the device has no on-device English voice. The owner can
 * still choose an online voice in Settings.
 */
export function pickDefaultVoice(voices) {
  return rankVoices(voices)[0] || null;
}

/** The voice for a stored voiceURI (falls back to the default pick when missing). */
export function resolveVoice(voiceURI, voices) {
  const list = Array.isArray(voices) ? voices : [];
  if (typeof voiceURI === 'string' && voiceURI) {
    const hit = list.find((v) => v && v.voiceURI === voiceURI) || list.find((v) => v && v.name === voiceURI);
    if (hit) return hit;
  }
  return pickDefaultVoice(list);
}

let unlocked = false;
let unlockedAt = -Infinity;

/** Unlock speech for later use (iOS needs the first speak() inside a user gesture). */
export function unlockSpeech() {
  if (unlocked || !ttsSupported()) return;
  unlocked = true;
  if (current) return; // already speaking, nothing to unlock
  unlockedAt = Date.now();
  try {
    const u = new globalThis.SpeechSynthesisUtterance('');
    u.volume = 0;
    synth().speak(u);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------
// Speaking
// ---------------------------------------------------------------------------------------

let current = null; // the stream being spoken (one at a time)
let lastOwnCancelAt = -Infinity; // Date.now() of our last speechSynthesis.cancel()
let cancelWaitMs = T.retryDelayMs; // how long a speak() waits after our cancel(); grows when Chrome's drop window is longer
let eventDepth = 0; // > 0 while one of our utterance event handlers runs
let userDepth = 0; // > 0 while append()/finish()/speak() run (their caller expects no onEnd inside)
const speeds = new Map(); // `${voiceURI}|${rate}` -> slowest measured ms per character (calibration)
const wordVoices = new Set(); // voices that send word boundary events (one comes as soon as audio starts)
let everPlayed = false; // the engine has shown a real sign of playing (it works: a drop is a drop, not a dead engine)

function report(err) {
  try {
    console.error('[jarvis] speech callback failed:', err);
  } catch {
    /* ignore */
  }
}

function call(fn, arg) {
  if (typeof fn !== 'function') return;
  try {
    fn(arg);
  } catch (err) {
    report(err);
  }
}

function clampRate(rate) {
  const n = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1;
  return Math.min(2, Math.max(0.5, n));
}

function chunkLimit(voice, rate) {
  if (voice && voice.localService === true) return LOCAL_CHUNK;
  return Math.max(MIN_ONLINE_CHUNK, Math.min(ONLINE_CHUNK, Math.floor(ONLINE_CHUNK * rate)));
}

function expectedMs(chunk, rate) {
  return (chunk.text.length / (T.charsPerSecond * rate)) * 1000;
}

function endTimeout(chunk, rate) {
  return Math.max(T.endMinMs, T.endFactor * expectedMs(chunk, rate) + T.endExtraMs);
}

// ---- visible time (quirk g: speech pauses while the page is hidden) ----

const clock = { acc: 0, last: -1, hidden: false, watching: false };
let pausesWhenHidden = true; // v8.1: false on a computer, where speech goes on in the background

/**
 * v8.1 (SPEC §26 note, §28.1): whether speech pauses while the page is hidden. True (the default) on an
 * iPhone or iPad: hidden time doesn't count. False on a computer: it counts, like visible time.
 */
export function setPausesWhenHidden(on) {
  vnow(); // the time so far counts under the old rule
  pausesWhenHidden = on !== false;
}

/** The page is hidden, and speech pauses there (an iPhone). */
function pausedHidden() {
  return pausesWhenHidden && isHidden();
}

function isHidden() {
  try {
    const d = globalThis.document;
    return !!(d && d.hidden === true);
  } catch {
    return false;
  }
}

/** Milliseconds of visible time (a gap is counted in the state it started in); hidden time too on a computer. */
function vnow() {
  const t = Date.now();
  if (clock.last < 0) clock.last = t;
  const step = t - clock.last;
  if (!clock.hidden && step > 0) clock.acc += Math.min(step, T.maxClockStepMs);
  clock.last = t;
  clock.hidden = pausedHidden();
  return clock.acc;
}

function watchVisibility() {
  if (clock.watching) return;
  clock.watching = true;
  vnow();
  try {
    const d = globalThis.document;
    if (d && typeof d.addEventListener === 'function') d.addEventListener('visibilitychange', onVisibility);
  } catch {
    /* the watchdog still samples document.hidden */
  }
}

function onVisibility() {
  vnow();
  if (current && !pausedHidden()) resumeEngine();
}

function resumeEngine() {
  try {
    const sy = synth();
    if (sy && sy.paused && typeof sy.resume === 'function') sy.resume();
  } catch {
    /* ignore */
  }
}

function engineSpeaking() {
  try {
    return !!synth().speaking;
  } catch {
    return false;
  }
}

function cancelEngine(force) {
  try {
    const sy = synth();
    if (!sy) return;
    if (force || sy.speaking || sy.pending) {
      lastOwnCancelAt = Date.now();
      sy.cancel();
    }
  } catch {
    /* ignore */
  }
}

/**
 * A speech stream: text can be appended while it is being spoken.
 *
 *   createSpeechStream({ voiceURI, rate, onStart, onChunk, onBoundary, onIdle, onEnd }) -> stream
 *   stream.append(text)  plain speech text. Complete sentences (end punctuation followed by
 *                        whitespace) and lines (text before a line break) are queued as soon as
 *                        they are complete; an unfinished tail waits for more text or finish().
 *                        Pieces are joined as given: include the spaces and line breaks.
 *   stream.finish()      no more text: speak the tail; onEnd({ reason: 'done' }) after the last chunk.
 *   stream.cancel()      stop now (idempotent); onEnd({ reason: 'cancelled' }).
 *   stream.text()        everything appended so far, whitespace-normalised (the offsets are into this).
 *   stream.spokenUpTo()  char offset in text() up to which audio has finished.
 *   stream.active()      false once ended.
 * Events (each optional; exceptions in callbacks are caught and logged):
 *   onStart()                               once, when audio first starts.
 *   onChunk({ index, start, end, text, at })  a chunk starts playing; start/end are offsets in text();
 *                                           at: Date.now() when it started (earlier than now when
 *                                           it is only known later, e.g. a voice without start events).
 *   onBoundary({ charIndex, charLength, name, chunkIndex })  charIndex is an offset in text().
 *   onIdle()                                caught up: every complete sentence appended so far was
 *                                           spoken and finish() isn't called yet (once per lull).
 *   onEnd({ reason })                       exactly once: 'done'|'cancelled'|'interrupted'|'error'|'empty'|'unsupported'.
 * Only one stream or speak() at a time: starting one cancels the previous (reason 'cancelled').
 */
export function createSpeechStream(options) {
  return openStream(options).handle;
}

/** Speak `text` (a stream given all its text at once). Returns { cancel() }. */
export function speak(text, options) {
  const s = openStream(options);
  userDepth += 1;
  s.hold += 1; // chunk the whole text at once (like chunkText), then start synchronously (iOS gesture)
  try {
    s.handle.append(text);
    s.handle.finish();
  } finally {
    s.hold -= 1;
    userDepth -= 1;
  }
  userDepth += 1;
  try {
    pump(s);
  } finally {
    userDepth -= 1;
  }
  return { cancel: s.handle.cancel };
}

function openStream(options) {
  const opts = options && typeof options === 'object' ? options : {};
  const s = {
    opts,
    rate: clampRate(opts.rate),
    voice: null,
    voiceReady: false,
    limit: ONLINE_CHUNK,
    tx: newText(),
    chunks: [],
    inflight: [], // our utterances in speechSynthesis, oldest (the head) first
    requeue: [], // chunks to speak again after a recovery, in order
    keep: [], // recent utterances (Chrome drops events of garbage-collected ones)
    gen: 0,
    ended: false,
    hold: 0,
    started: false,
    evidence: false, // a real sign of playing came (an event, or the engine's queue moving on)
    idle: false, // onIdle was called for the current lull
    settledTo: 0,
    spokenUpTo: 0,
    failures: 0,
    msPerChar: 0, // slowest measured speed of this voice (calibration; 0: none yet)
    voiceKey: '',
    speedKey: '',
    suspectStall: false, // we settled a chunk while the engine stayed busy and nothing of ours waited behind it
    stallCheck: false, // a stall recovery waits for a real start to confirm it
    stalls: 0, // confirmed stalls in this stream
    prev: null, // the last settled utterance
    retryUntil: 0,
    draining: 0, // visible time until which a finished stream waits for its last audio
    wake: 0,
    wakeTime: 0,
    timer: 0,
  };
  const user = (fn) => (arg) => {
    userDepth += 1;
    try {
      return fn(arg);
    } finally {
      userDepth -= 1;
    }
  };
  s.handle = {
    append: user((text) => append(s, text)),
    finish: user(() => finish(s)),
    cancel: () => cancelStream(s),
    text: () => s.tx.norm,
    spokenUpTo: () => s.spokenUpTo,
    active: () => !s.ended,
  };
  if (!ttsSupported()) {
    s.ended = true;
    setTimeout(() => call(opts.onEnd, { reason: 'unsupported' }), 0);
    return s;
  }
  const replacing = !!current;
  for (let guard = 0; current && guard < 8; guard++) cancelStream(current); // an onEnd above may start speech re-entrantly: this call wins
  // Something else may still be speaking; but not our silent unlock utterance of the same gesture
  // (cancelling it would delay the first chunk past the gesture iOS needs).
  if (!replacing && Date.now() - unlockedAt > 1000) cancelEngine(false);
  current = s;
  watchVisibility();
  s.timer = setInterval(() => tick(s), T.tickMs);
  const voices = voicesNow();
  if (voices.length) setVoice(s, resolveVoice(opts.voiceURI, voices));
  else {
    getVoices().then(
      (list) => {
        if (s.ended) return;
        setVoice(s, resolveVoice(opts.voiceURI, list));
        pump(s);
      },
      () => {
        if (s.ended) return;
        setVoice(s, null);
        pump(s);
      },
    );
  }
  return s;
}

function setVoice(s, voice) {
  s.voice = voice || null;
  s.voiceReady = true;
  s.limit = chunkLimit(s.voice, s.rate);
  s.voiceKey = (s.voice && (s.voice.voiceURI || s.voice.name)) || '';
  s.speedKey = `${s.voiceKey}|${s.rate}`;
  s.msPerChar = speeds.get(s.speedKey) || 0;
}

/** An on-device voice known to send word boundaries: its audio never plays without one. */
function sendsWords(s) {
  return !!s.voice && s.voice.localService === true && wordVoices.has(s.voiceKey);
}

function append(s, text) {
  if (s.ended || s.tx.finished) return;
  const str = typeof text === 'string' ? text : text === null || text === undefined ? '' : String(text);
  if (!str) return;
  ingest(s.tx, str);
  segment(s.tx, s.limit);
  pump(s);
}

function finish(s) {
  if (s.ended || s.tx.finished) return;
  s.tx.finished = true;
  segment(s.tx, s.limit);
  if (!s.tx.norm) {
    endStream(s, 'empty', false, true);
    return;
  }
  pump(s);
}

function cancelStream(s) {
  endStream(s, 'cancelled', true);
}

/** Ends a stream exactly once. Events of its utterances are ignored from here on. */
function endStream(s, reason, cancelIt = false, later = false) {
  if (s.ended) return;
  const had = s.inflight.length > 0;
  s.ended = true;
  clearInterval(s.timer);
  clearTimeout(s.wake);
  for (const r of s.inflight) r.settled = true;
  s.inflight = [];
  s.requeue = [];
  const wasCurrent = current === s;
  if (wasCurrent) current = null;
  if (cancelIt && wasCurrent) cancelEngine(had); // before onEnd: it may start new speech
  if (later) setTimeout(() => call(s.opts.onEnd, { reason }), 0);
  else call(s.opts.onEnd, { reason });
}

function wakeAt(s, at) {
  if (s.ended) return;
  if (s.wake && s.wakeTime <= at) return; // an earlier wake-up checks again
  clearTimeout(s.wake);
  s.wakeTime = at;
  s.wake = setTimeout(
    () => {
      s.wake = 0;
      s.wakeTime = 0;
      pump(s);
    },
    Math.max(0, at - Date.now()),
  );
}

/** Queue what can be queued now; end or report idle when there is nothing left. */
function pump(s) {
  if (s.ended || current !== s || s.hold || !s.voiceReady) return;
  const now = Date.now();
  if (eventDepth > 0) return wakeAt(s, now + T.deferMs); // quirk c: never speak() inside an engine event
  if (now < s.retryUntil) return wakeAt(s, s.retryUntil);
  if (s.draining) return;
  // Quirk d: Chrome drops an utterance queued right after cancel(). Once speech is unlocked (iOS
  // allows speak() outside a gesture from then on), wait a moment; otherwise the retry handles it.
  if (!s.inflight.length && unlocked && now < lastOwnCancelAt + cancelWaitMs) return wakeAt(s, lastOwnCancelAt + cancelWaitMs);
  while (s.inflight.length < T.maxQueued) {
    const last = s.inflight[s.inflight.length - 1];
    if (last && !last.started) break; // queue ahead only behind a chunk that is playing
    const chunk = nextChunk(s);
    if (!chunk) break;
    if (!submit(s, chunk)) return;
  }
  if (s.inflight.length || s.requeue.length || s.tx.spans.length) return;
  if (s.tx.finished) {
    if (userDepth > 0) return wakeAt(s, now); // not inside finish() itself
    // The last 'end' came early (quirk f) and the engine still speaks: end when it stops, at the
    // latest when that chunk's audio should be over (the watchdog checks).
    const p = s.prev;
    if (p && p.endedEarly && engineSpeaking() && vnow() < p.startedAt + expectedMs(p.chunk, s.rate) + T.drainExtraMs) {
      s.draining = p.startedAt + expectedMs(p.chunk, s.rate) + T.drainExtraMs;
      return;
    }
    // 'error' when chunks were given up and nothing ever really played (onStart may have fired for
    // a chunk only assumed to be playing): the app tells the owner instead of a silent 'done'.
    const played = s.evidence || !s.chunks.some((c) => c.state === 'skipped');
    endStream(s, played ? 'done' : 'error');
    return;
  }
  if (!s.idle && s.chunks.length) {
    s.idle = true;
    call(s.opts.onIdle);
  }
}

function nextChunk(s) {
  if (s.requeue.length) return s.requeue.shift();
  const c = takeChunk(s.tx, s.limit);
  if (!c) return null;
  const chunk = { index: s.chunks.length, start: c.start, end: c.end, text: s.tx.norm.slice(c.start, c.end), state: 'queued', retried: false, fired: false };
  s.chunks.push(chunk);
  s.idle = false;
  return chunk;
}

function submit(s, chunk) {
  let u;
  try {
    u = new globalThis.SpeechSynthesisUtterance(chunk.text);
    if (s.voice) {
      u.voice = s.voice;
      if (s.voice.lang) u.lang = s.voice.lang;
    }
    u.rate = s.rate;
  } catch {
    endStream(s, 'error', true);
    return false;
  }
  const now = vnow();
  const head = !s.inflight.length;
  const rec = {
    u,
    chunk,
    gen: s.gen,
    started: false,
    startedAt: 0,
    progressAt: 0,
    assumed: false, // started only tentatively: no event, the engine said it was speaking (quirk f)
    evidence: false, // a real sign it played: its own event, a later chunk's, or the engine moving on
    realStart: false, // its start was a real 'start' or boundary event (calibration)
    lastWordAt: -1, // when a boundary reached its last word
    lastWordMs: 0, // the expected time of the rest from there
    sawPending: false, // the engine said pending while our next chunk waited behind this one
    stall: false, // queued behind an utterance we settled while the engine stayed busy
    submittedAt: now,
    sinceCancel: Date.now() - lastOwnCancelAt, // spoken this long after our last cancel()
    headSince: head ? now : -1,
    due: head ? now + T.startTimeoutMs : 0,
    extended: false,
    quietSince: -1,
    settled: false,
  };
  bind(s, rec);
  s.inflight.push(rec);
  s.keep.push(u);
  if (s.keep.length > 8) s.keep.shift();
  chunk.state = 'inflight';
  try {
    synth().speak(u);
  } catch {
    endStream(s, 'error', true);
    return false;
  }
  if (s.ended) return false;
  const pending = enginePending();
  if (!head) {
    if (pending) s.inflight[0].sawPending = true;
    else if (s.inflight[0].assumed) {
      // Nothing waits in the engine besides the chunk just queued: the one before it, only assumed
      // to be playing, has left the queue, so it has completed (Chromium and WebKit keep even a
      // dropped utterance queued until cancel()). It played without any event.
      proof(s, s.inflight[0]);
      settleHead(s, 'done', now);
    }
  } else if (s.suspectStall) {
    // We settled the previous chunk by the clock while the engine still said it was busy: if this
    // one is queued behind something, it is likely the stalled utterance (no completion ever came).
    s.suspectStall = false;
    if (pending) {
      rec.stall = true;
      rec.due = now + T.stallStartMs;
    }
  }
  return true;
}

function enginePending() {
  try {
    return !!synth().pending;
  } catch {
    return false;
  }
}

function bind(s, rec) {
  const on = (fn) => (event) => {
    // Late events: an utterance already processed (an early or second 'end'), one we cancelled or
    // gave up on (its generation is over), or a stream that has ended.
    if (s.ended || current !== s || rec.settled || rec.gen !== s.gen) return;
    eventDepth += 1;
    try {
      fn(event);
    } catch (err) {
      report(err);
    } finally {
      eventDepth -= 1;
    }
  };
  rec.u.onstart = on(() => started(s, rec, false));
  rec.u.onboundary = on((event) => boundary(s, rec, event));
  rec.u.onend = on(() => ended(s, rec));
  rec.u.onerror = on((event) => failed(s, rec, event));
}

/** onStart once, then onChunk for a chunk that starts playing (or is assumed to); `at`: Date.now() it started. */
function play(s, chunk, at) {
  if (chunk.fired) return;
  chunk.fired = true;
  if (!s.started) {
    s.started = true;
    call(s.opts.onStart);
    if (s.ended) return;
  }
  call(s.opts.onChunk, { index: chunk.index, start: chunk.start, end: chunk.end, text: chunk.text, at });
}

/** A real sign that `rec` plays or played: its own event, or the engine's queue moving past it. */
function proof(s, rec) {
  rec.evidence = true;
  s.evidence = true;
  everPlayed = true;
  s.failures = 0;
  if (s.stallCheck) {
    s.stallCheck = false; // what we queued again after a stall plays: the engine really had stalled
    s.stalls += 1;
  }
}

/**
 * The engine plays in order: when `rec` shows life, every utterance before it has finished. With
 * `real` (rec's own event), they really played, and the one just before it is measured: its audio
 * lasted until now, give or take the engine's gap (when rec was queued while it played).
 */
function settleBefore(s, rec, now, real) {
  if (!s.inflight.includes(rec)) return;
  while (s.inflight.length && s.inflight[0] !== rec) {
    const h = s.inflight[0];
    if (real) {
      h.evidence = true;
      if (s.inflight[1] === rec && rec.submittedAt <= h.startedAt + T.earlyEndFraction * expectedMs(h.chunk, s.rate)) measure(s, h, now);
    }
    settleHead(s, 'done', now);
  }
}

/**
 * Calibration: the speed of a chunk that really started ('start' or a boundary) and played to its
 * end (never an early 'end'), at least 24 characters; implausible speeds are ignored. The stream
 * keeps the slowest; so does the voice (per rate) for later streams.
 */
function measure(s, rec, now) {
  if (!rec.started || !rec.realStart || rec.endedEarly || rec.chunk.text.length < 24) return;
  const ms = (now - rec.startedAt) / rec.chunk.text.length;
  const nominal = 1000 / (T.charsPerSecond * s.rate);
  if (!(ms >= 0.7 * nominal && ms <= T.endFactor * nominal) || ms <= s.msPerChar) return;
  s.msPerChar = ms;
  if (s.speedKey) speeds.set(s.speedKey, Math.max(speeds.get(s.speedKey) || 0, ms));
}

function markStarted(s, rec, at) {
  if (rec.started) return;
  rec.started = true;
  rec.startedAt = at;
  rec.progressAt = at;
  play(s, rec.chunk, Date.now() - Math.max(0, vnow() - at)); // an assumed start is backdated
}

/**
 * `rec` starts playing: a 'start' or boundary event, or (assumed) the watchdog's guess when the
 * engine says it is speaking with nothing pending (quirk f). An assumption is never proof:
 * Chromium's `speaking` is true from speak() on, so a silently dropped utterance looks the same.
 */
function started(s, rec, assumed) {
  const now = vnow();
  if (!assumed) proof(s, rec);
  settleBefore(s, rec, now, !assumed);
  if (!rec.started) {
    rec.assumed = assumed;
    rec.realStart = !assumed;
    markStarted(s, rec, assumed && rec.headSince >= 0 ? rec.headSince : now);
  } else if (!assumed && rec.assumed) {
    // Only assumed so far; it really starts now (late): its time counts from here.
    rec.assumed = false;
    rec.realStart = true;
    rec.startedAt = now;
    rec.progressAt = now;
  }
  pump(s); // queue the next chunk now, while this one plays
}

function boundary(s, rec, event) {
  if (!rec.started || rec.assumed) started(s, rec, false); // a boundary event means it is playing
  else proof(s, rec);
  if (s.ended || rec.settled) return;
  if (s.voiceKey) wordVoices.add(s.voiceKey);
  const now = vnow();
  rec.progressAt = now;
  const text = rec.chunk.text;
  let ci = Number(event && event.charIndex);
  ci = Number.isFinite(ci) && ci > 0 ? Math.min(Math.floor(ci), text.length) : 0;
  const name = (event && typeof event.name === 'string' && event.name) || 'word';
  let len = Number(event && event.charLength);
  if (!Number.isFinite(len) || len <= 0) len = name === 'word' ? wordLength(text, ci) : 0;
  if (ci >= lastWordStart(text)) {
    // The last word is being said: its audio is nearly over (used when 'end' never comes).
    rec.lastWordAt = now;
    rec.lastWordMs = ((text.length - ci) / (T.charsPerSecond * s.rate)) * 1000;
  }
  call(s.opts.onBoundary, { charIndex: rec.chunk.start + ci, charLength: len, name, chunkIndex: rec.chunk.index });
}

function wordLength(text, at) {
  const m = /^\S+/.exec(text.slice(at));
  return m ? m[0].length : 0;
}

function lastWordStart(text) {
  const t = text.trimEnd();
  const m = /\S+$/.exec(t);
  return m ? m.index : t.length;
}

function ended(s, rec) {
  const now = vnow();
  proof(s, rec);
  settleBefore(s, rec, now, true);
  markStarted(s, rec, rec.headSince >= 0 ? rec.headSince : now); // 'end' without 'start' (quirk f): it played
  if (s.ended || rec.settled) return;
  rec.endedEarly = now < rec.startedAt + T.earlyEndFraction * expectedMs(rec.chunk, s.rate);
  measure(s, rec, now);
  settleHead(s, 'done', now);
  pump(s);
}

function failed(s, rec, event) {
  const code = String((event && event.error) || '');
  if (code === 'interrupted' || code === 'canceled') {
    // Right after our own cancel(), an utterance that never played was dropped with it (quirk d).
    if (!rec.evidence && Date.now() - lastOwnCancelAt < T.cancelGraceMs) {
      recover(s, rec, { reported: true });
      return;
    }
    endStream(s, 'interrupted'); // someone else stopped speech: don't talk over them
    return;
  }
  if (code === 'not-allowed') {
    endStream(s, 'error', true); // iOS before unlockSpeech()
    return;
  }
  // This chunk failed (synthesis-failed, network, voice-unavailable, ...): skip it, carry on.
  const now = vnow();
  const i = s.inflight.indexOf(rec);
  if (i === 0) settleHead(s, rec.evidence ? 'done' : 'skipped', now);
  else if (i > 0) {
    s.inflight.splice(i, 1);
    rec.settled = true;
    rec.chunk.state = 'skipped';
  }
  if (!rec.evidence && fail(s)) return;
  pump(s);
}

/** Counts a chunk that never played; true when the stream ended because speech seems broken. */
function fail(s) {
  s.failures += 1;
  if (s.failures < T.deadChunks) return false;
  endStream(s, 'error', true);
  return true;
}

function settleHead(s, how, now) {
  const rec = s.inflight.shift();
  if (!rec) return;
  rec.settled = true;
  rec.chunk.state = how;
  s.prev = rec;
  const head = s.inflight[0];
  if (head && head.headSince < 0) {
    // After an early 'end' (quirk f) the audio plays on: the next one can't start before it is over.
    const since = rec.endedEarly ? Math.max(now, rec.startedAt + expectedMs(rec.chunk, s.rate)) : now;
    head.headSince = since;
    head.due = since + T.startTimeoutMs;
  }
  advance(s);
}

function advance(s) {
  while (s.settledTo < s.chunks.length && (s.chunks[s.settledTo].state === 'done' || s.chunks[s.settledTo].state === 'skipped')) {
    s.spokenUpTo = s.chunks[s.settledTo].end;
    s.settledTo += 1;
  }
}

/**
 * `rec` never played: speak it again once (after a short wait), else skip it. With `cancel` (the
 * watchdog; rec is the head) speechSynthesis is cancelled first, which also drops whatever else of
 * ours it held; those chunks are queued again in order. Without it (the engine already dropped rec
 * with an error), only rec and the chunks after it are queued again.
 *   stall: rec (the head) waited behind an utterance the engine never completed: cancel() unsticks
 *          the engine and rec is queued again without using up its retry (once per chunk).
 *   held:  the engine kept rec (it said it was speaking) but never played it, a silent drop by an
 *          engine that is alive: retried after dropRetryMs, or 1 s once Chrome's drop window has
 *          shown to be longer than our wait (a drop that came that late after our cancel()).
 *   reported: the engine reported dropping it ('interrupted'/'canceled' right after our cancel()).
 */
function recover(s, rec, { cancel = false, stall = false, held = false, reported = false } = {}) {
  const i = s.inflight.indexOf(rec);
  if (i < 0) return;
  const dropped = s.inflight.splice(cancel ? 0 : i);
  const chunks = dropped.map((r) => {
    r.settled = true; // their late 'interrupted'/'canceled' errors are ours: ignored (quirk h)
    return r.chunk;
  });
  if (!s.inflight.length) s.gen += 1;
  let wait = Math.max(T.retryDelayMs, cancelWaitMs);
  if (stall && !rec.chunk.stalled) {
    rec.chunk.stalled = true;
    s.stallCheck = true;
  } else {
    if (rec.chunk.retried) {
      rec.chunk.state = 'skipped';
      chunks.splice(chunks.indexOf(rec.chunk), 1);
    } else rec.chunk.retried = true;
    // Dropped although it was spoken this long after our cancel(), by an engine that is alive:
    // Chrome's drop window is longer here. Wait longer now, and after our later cancel()s too.
    const late = (held || reported || everPlayed) && rec.sinceCancel >= T.retryDelayMs && rec.sinceCancel < 2000;
    if (late) cancelWaitMs = Math.min(T.retryBackoffMs, Math.max(cancelWaitMs, rec.sinceCancel + T.retryDelayMs));
    if (late) wait = T.retryBackoffMs;
    else if (held) wait = Math.max(T.dropRetryMs, cancelWaitMs);
  }
  for (const c of chunks) c.state = 'queued';
  s.requeue = chunks.concat(s.requeue);
  s.suspectStall = false;
  if (cancel) cancelEngine(true);
  s.retryUntil = Date.now() + wait;
  advance(s);
  if (rec.chunk.state === 'skipped' && fail(s)) return;
  pump(s);
}

/** The watchdog: time-based, because speaking/pending and the events can't be trusted. */
function tick(s) {
  if (s.ended || current !== s) {
    clearInterval(s.timer);
    return;
  }
  const now = vnow();
  if (s.draining) {
    if (now >= s.draining || !engineSpeaking()) {
      s.draining = 0;
      pump(s);
    }
    return;
  }
  const head = s.inflight[0];
  if (!head) return;
  let speaking = false;
  let pending = false;
  let paused = false;
  try {
    const sy = synth();
    speaking = !!sy.speaking;
    pending = !!sy.pending;
    paused = !!sy.paused;
  } catch {
    /* treat as quiet */
  }
  if (paused && !pausedHidden()) resumeEngine();
  const busy = speaking || pending;
  const behind = s.inflight.length > 1; // our next chunk is queued behind the head
  if (head.started) {
    if (behind && pending) head.sawPending = true;
    else if (behind && head.sawPending) {
      // `pending` went off while our next chunk waited behind the head: the engine moved on to it
      // (it starts the next one only once the current one has completed). Its 'end' was lost.
      proof(s, head);
      measure(s, head, now); // it played until about now (at most a tick ago)
      settleHead(s, 'done', now);
      pump(s);
      return;
    }
    if (busy) head.quietSince = -1;
    else if (head.quietSince < 0) head.quietSince = now;
    const expected = expectedMs(head.chunk, s.rate);
    let due = Math.max(head.startedAt + endTimeout(head.chunk, s.rate), head.progressAt + T.engineQuietMs);
    if (busy) {
      // The flags can't tell us it has ended: use what is known about this chunk.
      if (head.lastWordAt >= 0) due = Math.min(due, head.lastWordAt + T.lastWordFactor * head.lastWordMs + T.lastWordExtraMs);
      if (head.realStart && !behind && s.msPerChar > 0 && s.tx.finished && !s.requeue.length && !s.tx.spans.length) {
        // The last chunk, at this voice's measured speed (quirks a+b: no later chunk can settle it).
        const cal = head.startedAt + Math.max(T.calFactor * head.chunk.text.length * s.msPerChar, expected) + T.calExtraMs;
        due = Math.min(due, Math.max(cal, head.progressAt + T.engineQuietMs));
      }
      if (head.realStart && behind && pending && s.stalls > 0) due = Math.min(due, head.startedAt + T.stallFactor * expected + T.stallExtraMs);
    }
    if (head.assumed && !head.evidence && behind && pending && now >= head.headSince + T.dropFactor * expected + T.startTimeoutMs) {
      // Only assumed to be playing, and the engine still hasn't moved on to our next chunk long
      // after this one would have ended: it was dropped silently (quirk d). Speak it again.
      recover(s, head, { cancel: true, held: true });
      return;
    }
    const quiet = head.quietSince >= 0 && now - head.quietSince >= T.engineQuietMs;
    if (now < due && !quiet) return;
    if (head.assumed && !head.evidence && busy) {
      recover(s, head, { cancel: true, held: true }); // no sign of playing ever came and the engine still holds it: dropped
      return;
    }
    settleHead(s, 'done', now); // its 'end' never came (quirks a, b, e): treat it as ended, move on
    if (busy && !quiet) {
      // The engine may be stuck on the chunk we just settled (its completion never came, so it
      // never moves on). Our next chunk waiting behind it says so: unstick the engine now.
      const next = s.inflight[0];
      if (next && pending) {
        recover(s, next, { cancel: true, stall: true });
        return;
      }
      if (!next) s.suspectStall = true; // the next chunk we queue may wait behind it
    }
    pump(s);
    return;
  }
  if (head.headSince < 0 || now < head.due) return;
  if (head.stall) {
    head.stall = false;
    if (pending) {
      recover(s, head, { cancel: true, stall: true }); // still behind the utterance the engine is stuck on
      return;
    }
    head.due = head.headSince + T.startTimeoutMs;
    if (now < head.due) return;
  }
  if (speaking && !pending) {
    // Nothing else is queued, so it should be playing. A voice that sends word boundaries would
    // have sent one: it was dropped (quirk d; Chromium still says "speaking"). Otherwise assume it
    // plays without a start event (quirk f), or, on its retry, that a drop can't be told apart.
    if (sendsWords(s) && !head.chunk.retried) recover(s, head, { cancel: true, held: true });
    else started(s, head, true);
    return;
  }
  if (busy && !head.extended) {
    // Something is still playing or loading (an earlier chunk whose 'end' came early, an online
    // voice fetching audio, or flags stuck on): wait once more, at most until the earlier chunk's
    // own time is up.
    head.extended = true;
    const prev = s.prev && s.prev.started ? s.prev.startedAt + endTimeout(s.prev.chunk, s.rate) : 0;
    head.due = Math.max(now + T.startTimeoutMs, prev);
    return;
  }
  // Still behind something in the engine (`pending`): an utterance it never completed, not this
  // chunk's fault. Otherwise this one never started: a drop the engine held (busy) or forgot.
  if (pending) recover(s, head, { cancel: true, stall: true });
  else recover(s, head, { cancel: true, held: busy });
}

/** Stop whatever Jarvis is saying. */
export function stopSpeaking() {
  if (!ttsSupported()) return;
  if (current) cancelStream(current);
  else cancelEngine(false);
}

/** True while a stream or speak() is active (including a stream waiting for more text). */
export function isSpeaking() {
  return !!current && !current.ended;
}


/** Markdown -> text to read aloud. mode: 'summary' | 'full' | 'off'. */
export function toSpeech(markdown, mode = 'full') {
  if (mode === 'off') return '';
  if (mode === 'summary') return clampSummary(markdownToPlainText(markdown, { speech: true, firstParagraph: true }), SUMMARY_MAX);
  return markdownToPlainText(markdown, { speech: true })
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim();
}

function clampSummary(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  let end = -1;
  const re = /[.!?…]["'”’)\]]*(?=\s)/g;
  let m;
  while ((m = re.exec(t)) && m.index < max) {
    const e = m.index + m[0].length;
    if (e <= max) end = e;
  }
  if (end >= max * 0.4) return t.slice(0, end);
  const space = t.lastIndexOf(' ', max - 1);
  return t.slice(0, space > 0 ? space : max - 1).replace(/[\s,;:–—-]+$/, '') + '…';
}

/** Split text into sentences (after . ! ? … plus closing quotes/brackets, before whitespace). */
export function splitSentences(text) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  const out = [];
  const re = /[.!?…]+["'”’)\]]*(?=\s|$)/g;
  let start = 0;
  let m;
  while ((m = re.exec(s))) {
    const end = m.index + m[0].length;
    const piece = s.slice(start, end).trim();
    if (piece) out.push(piece);
    start = end;
  }
  const rest = s.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}

/**
 * Sentence chunks of at most `max` characters, as the engine speaks them: whole sentences are
 * packed together, never across a line break; a longer sentence is split at a clause boundary
 * (, ; : — –), else at a space, else hard.
 */
export function chunkText(text, max = ONLINE_CHUNK) {
  const limit = Math.max(20, Math.floor(Number(max)) || ONLINE_CHUNK);
  const tx = newText();
  ingest(tx, String(text ?? ''));
  tx.finished = true;
  segment(tx, limit);
  const out = [];
  for (let c = takeChunk(tx, limit); c; c = takeChunk(tx, limit)) out.push(tx.norm.slice(c.start, c.end));
  return out;
}
