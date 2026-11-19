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
//
// Speech streams. Real engines break a simple "speak the next chunk from the previous chunk's
// onend" chain in many ways (WebKit leaves speaking/pending stuck, onend goes missing or comes
// early or twice, speak() inside onend is dropped, Chrome drops an utterance queued right after
// cancel() and stops long online utterances, iOS pauses in the background, our own cancel()
// produces 'interrupted' errors). So the engine:
//   - keeps the next chunk already queued in speechSynthesis while the current one plays
//     (queued at the current chunk's start, or when it is assumed to be playing), never more
//     than 2 of ours at a time, and keeps a reference to every queued utterance;
//   - never calls speechSynthesis.speak() from inside an engine event (it waits 30 ms);
//   - treats a chunk as started on 'start', on a boundary event, or when the engine says it is
//     speaking with nothing pending 3 s after the chunk should have started; a later chunk's
//     start means every earlier chunk has finished;
//   - treats a started chunk as ended when 'end' comes, when its time is up
//     (max(4 s, 2.5 × expected + 1.5 s) from its start, expected = chars / (15 × rate) s; a
//     boundary event moves that to at least 3 s after the boundary), or after the engine has
//     reported 3 s of silence;
//   - retries a chunk that never started (cancel(), 250 ms, speak() again) once, then skips it;
//     if the engine still says it is speaking or has something pending, it first waits once more
//     (3 s, or until the previous chunk's time is up); an 'interrupted'/'canceled' error within
//     1 s of our own cancel() on a chunk that never started is the same drop and is retried at
//     once; after two chunks in a row were given up the stream ends with 'error';
//   - processes each utterance's events at most once and ignores events of utterances it has
//     cancelled or given up (a generation counter); any other 'interrupted'/'canceled' error
//     means someone else stopped speech: the stream ends with 'interrupted';
//   - after an 'end' that came early (before 70 % of the expected time) on the last chunk, waits
//     while the engine still says it is speaking (at most until the expected end + 0.5 s) before
//     onEnd, so a listening microphone never opens over the voice;
//   - once unlockSpeech() has run, waits 250 ms after our own cancel() before the next speak();
//   - counts time only while the page is visible (iOS pauses speech in the background), and
//     calls speechSynthesis.resume() if the engine is paused while the page is visible.
//
// Chunks pack whole sentences: ≤ 220 characters for an online or unknown voice (fewer below rate
// 1, so a chunk stays under ~15 s), up to 360 for an on-device voice. A sentence longer than the
// limit is split at a clause boundary. A line break in the text always ends a chunk, so
// paragraphs and list items get a natural pause.

import { markdownToPlainText } from '../../lib/markdown.js';

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
  deferMs: 30, // speak() is never called inside an engine event (WebKit drops it); it waits this long
  tickMs: 250, // watchdog period
  cancelGraceMs: 1000, // an 'interrupted'/'canceled' error this soon after our own cancel() is a drop
  maxClockStepMs: 1000, // a longer gap between two clock readings (a suspended page) counts as this
  maxQueued: 2, // our utterances in speechSynthesis at once
  deadChunks: 2, // chunks in a row that never played before the stream ends with 'error'
  earlyEndFraction: 0.7, // an 'end' before this share of the expected time is early (quirk f) ...
  drainExtraMs: 500, // ... so the last one's onEnd waits while speaking, up to expected + this
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
  return NOVELTY_NAME.test(v.name) || NOVELTY_URI.test(String(v.voiceURI || ''));
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
let eventDepth = 0; // > 0 while one of our utterance event handlers runs
let userDepth = 0; // > 0 while append()/finish()/speak() run (their caller expects no onEnd inside)

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

function isHidden() {
  try {
    const d = globalThis.document;
    return !!(d && d.hidden === true);
  } catch {
    return false;
  }
}

/** Milliseconds of visible time (a gap is counted in the state it started in). */
function vnow() {
  const t = Date.now();
  if (clock.last < 0) clock.last = t;
  const step = t - clock.last;
  if (!clock.hidden && step > 0) clock.acc += Math.min(step, T.maxClockStepMs);
  clock.last = t;
  clock.hidden = isHidden();
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
  if (current && !isHidden()) resumeEngine();
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
 *   onChunk({ index, start, end, text })    a chunk starts playing; start/end are offsets in text().
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
    idle: false, // onIdle was called for the current lull
    settledTo: 0,
    spokenUpTo: 0,
    failures: 0,
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
  if (!s.inflight.length && unlocked && now < lastOwnCancelAt + T.retryDelayMs) return wakeAt(s, lastOwnCancelAt + T.retryDelayMs);
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
    const played = s.started || !s.chunks.some((c) => c.state === 'skipped');
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
  const rec = { u, chunk, gen: s.gen, started: false, startedAt: 0, progressAt: 0, headSince: head ? now : -1, due: head ? now + T.startTimeoutMs : 0, extended: false, quietSince: -1, settled: false };
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
  return !s.ended;
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

/** onStart once, then onChunk for a chunk that starts playing. */
function play(s, chunk) {
  if (chunk.fired) return;
  chunk.fired = true;
  if (!s.started) {
    s.started = true;
    call(s.opts.onStart);
    if (s.ended) return;
  }
  call(s.opts.onChunk, { index: chunk.index, start: chunk.start, end: chunk.end, text: chunk.text });
}

/** The engine plays in order: when `rec` shows life, every utterance before it has finished. */
function settleBefore(s, rec, now) {
  if (!s.inflight.includes(rec)) return;
  while (s.inflight.length && s.inflight[0] !== rec) settleHead(s, 'done', now);
}

function markStarted(s, rec, at) {
  if (rec.started) return;
  rec.started = true;
  rec.startedAt = at;
  rec.progressAt = at;
  s.failures = 0;
  play(s, rec.chunk);
}

function started(s, rec, assumed) {
  const now = vnow();
  settleBefore(s, rec, now);
  markStarted(s, rec, assumed && rec.headSince >= 0 ? rec.headSince : now);
  pump(s); // queue the next chunk now, while this one plays
}

function boundary(s, rec, event) {
  if (!rec.started) started(s, rec, false); // a boundary event means it is playing
  if (s.ended || rec.settled) return;
  rec.progressAt = vnow();
  const text = rec.chunk.text;
  let ci = Number(event && event.charIndex);
  ci = Number.isFinite(ci) && ci > 0 ? Math.min(Math.floor(ci), text.length) : 0;
  const name = (event && typeof event.name === 'string' && event.name) || 'word';
  let len = Number(event && event.charLength);
  if (!Number.isFinite(len) || len <= 0) len = name === 'word' ? wordLength(text, ci) : 0;
  call(s.opts.onBoundary, { charIndex: rec.chunk.start + ci, charLength: len, name, chunkIndex: rec.chunk.index });
}

function wordLength(text, at) {
  const m = /^\S+/.exec(text.slice(at));
  return m ? m[0].length : 0;
}

function ended(s, rec) {
  const now = vnow();
  settleBefore(s, rec, now);
  markStarted(s, rec, rec.headSince >= 0 ? rec.headSince : now); // 'end' without 'start' (quirk f): it played
  if (s.ended || rec.settled) return;
  rec.endedEarly = now < rec.startedAt + T.earlyEndFraction * expectedMs(rec.chunk, s.rate);
  settleHead(s, 'done', now);
  pump(s);
}

function failed(s, rec, event) {
  const code = String((event && event.error) || '');
  if (code === 'interrupted' || code === 'canceled') {
    // Right after our own cancel(), an utterance that never played was dropped with it (quirk d).
    if (!rec.started && Date.now() - lastOwnCancelAt < T.cancelGraceMs) {
      recover(s, rec, false);
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
  if (i === 0) settleHead(s, rec.started ? 'done' : 'skipped', now);
  else if (i > 0) {
    s.inflight.splice(i, 1);
    rec.settled = true;
    rec.chunk.state = 'skipped';
  }
  if (!rec.started && fail(s)) return;
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
    head.headSince = now;
    head.due = now + T.startTimeoutMs;
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
 * `rec` never started: speak it again once (after a short wait), else skip it. With cancelFirst
 * (the watchdog; rec is the head) speechSynthesis is cancelled first, which also drops whatever
 * else of ours it held; those chunks are queued again in order. Without it (the engine already
 * dropped rec with an error), only rec and the chunks after it are queued again.
 */
function recover(s, rec, cancelFirst) {
  const i = s.inflight.indexOf(rec);
  if (i < 0) return;
  const dropped = s.inflight.splice(cancelFirst ? 0 : i);
  const chunks = dropped.map((r) => {
    r.settled = true; // their late 'interrupted'/'canceled' errors are ours: ignored (quirk h)
    return r.chunk;
  });
  if (!s.inflight.length) s.gen += 1;
  if (rec.chunk.retried) {
    rec.chunk.state = 'skipped';
    chunks.splice(chunks.indexOf(rec.chunk), 1);
  } else rec.chunk.retried = true;
  for (const c of chunks) c.state = 'queued';
  s.requeue = chunks.concat(s.requeue);
  if (cancelFirst) cancelEngine(true);
  s.retryUntil = Date.now() + T.retryDelayMs;
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
  if (paused && !isHidden()) resumeEngine();
  if (head.started) {
    if (speaking || pending) head.quietSince = -1;
    else if (head.quietSince < 0) head.quietSince = now;
    const due = Math.max(head.startedAt + endTimeout(head.chunk, s.rate), head.progressAt + T.engineQuietMs);
    if (now >= due || (head.quietSince >= 0 && now - head.quietSince >= T.engineQuietMs)) {
      settleHead(s, 'done', now); // its 'end' never came (quirks a, b, e): treat it as ended, move on
      pump(s);
    }
    return;
  }
  if (head.headSince < 0 || now < head.due) return;
  if (speaking && !pending) {
    started(s, head, true); // audio without a start event (quirk f)
    return;
  }
  if ((speaking || pending) && !head.extended) {
    // Something is still playing or loading (an earlier chunk whose 'end' came early, an online
    // voice fetching audio, or flags stuck on): wait once more, at most until the earlier chunk's
    // own time is up.
    head.extended = true;
    const prev = s.prev && s.prev.started ? s.prev.startedAt + endTimeout(s.prev.chunk, s.rate) : 0;
    head.due = Math.max(now + T.startTimeoutMs, prev);
    return;
  }
  recover(s, head, true);
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

// ---------------------------------------------------------------------------------------
// Speech text: whitespace normalisation, sentences and chunks (pure)
// ---------------------------------------------------------------------------------------

const SENTENCE_END_RE = /[.!?…]+["'”’)\]]*(?= |$)/g;

function newText() {
  // norm: the text with whitespace runs as single spaces; breaks: offsets of the spaces that stand
  // for a line break; spans: complete sentences (or lines) not yet put into a chunk.
  return { norm: '', pendingWs: false, pendingBreak: false, breaks: [], breakIdx: 0, scan: 0, spans: [], finished: false };
}

function ingest(tx, str) {
  const re = /(\s+)|(\S+)/g;
  let m;
  while ((m = re.exec(str))) {
    if (m[1]) {
      if (tx.norm) {
        tx.pendingWs = true;
        if (/[\n\r\u2028\u2029]/.test(m[1])) tx.pendingBreak = true;
      }
      continue;
    }
    if (tx.pendingWs) {
      if (tx.pendingBreak) tx.breaks.push(tx.norm.length);
      tx.norm += ' ';
    }
    tx.pendingWs = false;
    tx.pendingBreak = false;
    tx.norm += m[2];
  }
}

/** Moves complete sentences (and lines) from the unscanned text into tx.spans. */
function segment(tx, limit) {
  const t = tx.norm;
  let pos = tx.scan;
  for (;;) {
    if (t.charCodeAt(pos) === 32) pos += 1;
    if (pos >= t.length) break;
    while (tx.breakIdx < tx.breaks.length && tx.breaks[tx.breakIdx] < pos) tx.breakIdx += 1;
    const brk = tx.breakIdx < tx.breaks.length ? tx.breaks[tx.breakIdx] : -1;
    SENTENCE_END_RE.lastIndex = pos;
    const m = SENTENCE_END_RE.exec(t);
    let end = -1;
    if (m) {
      const e = m.index + m[0].length;
      if (e < t.length || tx.pendingWs || tx.finished) end = e; // at the very end: only once whitespace followed
    }
    let breakAfter = false;
    if (brk >= 0 && (end < 0 || brk <= end)) {
      end = brk;
      breakAfter = true;
    }
    if (end < 0) {
      if (!tx.finished) {
        // A sentence longer than a chunk that is still growing: release the pieces that can no
        // longer change (each cut depends only on the next `limit + 1` characters).
        while (t.length - pos > limit + 1) {
          const [pieceEnd, next] = firstCut(t, pos, t.length, limit);
          tx.spans.push({ start: pos, end: pieceEnd, breakAfter: false });
          pos = next;
        }
        break;
      }
      end = t.length;
    }
    if (end === t.length && tx.pendingBreak) breakAfter = true;
    tx.spans.push({ start: pos, end, breakAfter });
    pos = end;
  }
  tx.scan = pos;
}

/** The next chunk: whole spans packed up to `limit`, never across a line break. */
function takeChunk(tx, limit) {
  const q = tx.spans;
  if (!q.length) return null;
  splitFirst(tx, limit);
  const first = q.shift();
  let start = first.start;
  let end = first.end;
  let brk = first.breakAfter;
  while (!brk && q.length) {
    splitFirst(tx, limit);
    const next = q[0];
    if (next.end - start > limit) break;
    end = next.end;
    brk = next.breakAfter;
    q.shift();
  }
  return { start, end };
}

function splitFirst(tx, limit) {
  const sp = tx.spans[0];
  if (sp.end - sp.start <= limit) return;
  const pieces = [];
  let s = sp.start;
  while (sp.end - s > limit) {
    const [pieceEnd, next] = firstCut(tx.norm, s, sp.end, limit);
    if (pieceEnd > s) pieces.push({ start: s, end: pieceEnd, breakAfter: false });
    s = next;
  }
  if (sp.end > s) pieces.push({ start: s, end: sp.end, breakAfter: false });
  if (pieces.length) pieces[pieces.length - 1].breakAfter = sp.breakAfter;
  tx.spans.splice(0, 1, ...pieces);
}

/**
 * Where to cut a too-long sentence t[s, b): at the last clause boundary (, ; : — –) within the
 * limit, else at the last space, else hard (never inside a surrogate pair).
 * Returns [end of the first piece, start of the rest].
 */
function firstCut(t, s, b, limit) {
  const rest = t.slice(s, b);
  let cut = -1;
  const re = /[,;:](?=\s)|\s[—–](?=\s)/g;
  let m;
  while ((m = re.exec(rest))) {
    const e = m.index + m[0].length;
    if (e > limit) break;
    cut = e;
  }
  if (cut < limit * 0.4) {
    const space = rest.lastIndexOf(' ', limit);
    cut = space > 0 ? space : limit;
  }
  const code = rest.charCodeAt(cut);
  if (code >= 0xdc00 && code <= 0xdfff) cut -= 1;
  let pieceEnd = s + cut;
  while (pieceEnd > s && t.charCodeAt(pieceEnd - 1) === 32) pieceEnd -= 1;
  let next = s + cut;
  while (next < b && t.charCodeAt(next) === 32) next += 1;
  return [pieceEnd, next];
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
