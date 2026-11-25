// A speech stream spoken by the natural voice (Kokoro in a Worker, played through Web Audio),
// with the same contract as tts.js createSpeechStream (v5):
//
//   const stream = createNaturalStream({ engine, audio, voice, onHandoff }, { rate, onStart,
//                                       onChunk, onBoundary, onIdle, onEnd });
//   stream.append(text) / finish() / cancel() / text() / spokenUpTo() / active()
//   onStart()                               once, when audio first starts
//   onChunk({ index, start, end, text })    a chunk starts playing (offsets into text())
//   onBoundary({ charIndex, charLength, name: 'word', chunkIndex })   ESTIMATED word starts
//   onIdle()                                caught up, finish() not called yet (once per lull)
//   onEnd({ reason })                       exactly once: done | cancelled | error | empty
//
// Text is cut exactly like the device voice (speech-text.js, the code tts.js uses): whole
// sentences, never across a line break, a too-long sentence at a clause. Chunk sizes adapt
// (limitFor): a short first chunk so the first audio comes fast, then chunks that grow with the
// measured real-time factor up to 260 characters, so each one is ready before the previous ends.
// v7.8: an engine whose status() names `firstCut` ({ min, max }: the home base's voice, made far away)
// gets an even shorter first chunk, cut at the first clause or sentence end 40-60 characters in
// (speech-text.js takeFirstClause; a long first sentence still being written is released at 60), and
// may name `minChunk` and `assumedRtf` so the chunks after it grow from there without a gap: each one as
// long as the one before can cover while it is made (takeGrowingChunk: a long sentence gives one piece at a
// time; releasePiece: a sentence still being written gives its next piece as soon as it can't change).
//
// Pipeline: a chunk is sent to the worker as soon as it is complete, at most `prefetch` (2)
// chunks ahead of the one playing. Each result is trimmed of its leading/trailing silence and
// scheduled on the audio clock right after the previous one plus a pause that depends on how the
// previous chunk ended (sentence 140 ms, clause 60 ms, line break 280 ms; divided by the speed):
// gapless, with even pacing. Events are driven by the audio clock (out.now()), so they pause
// with the audio when iOS suspends it, and 'done' comes only after the last sample has played.
//
// Word boundaries are estimated: each word's share of the chunk's voiced audio is proportional
// to its length plus pauses for its punctuation. Kokoro reports no word timing.
//
// Handoff: when the engine turns 'slow' (synthesis slower than real time) or fails twice on a
// chunk, the stream stops synthesizing, lets the audio already made play out, then calls
// onHandoff(offset) with the text() offset where the rest begins; the router speaks the rest
// with the device voice. Without onHandoff a failed chunk is skipped and two failures in a row
// end the stream with 'error'.
//
// v7.8.1, the stall watchdog (with onHandoff): words, chunk ends and the end of the reply follow the
// audio clock, so a clock that stops (iOS: an audio interruption, a route change, the microphone holding
// the audio session; a context never unlocked by a tap) would leave the owner in silence with no end.
// While a chunk is on the clock (scheduled or playing) and the page is visible, each tick checks that the
// clock itself moved since the last one. It counts only the wall time of ticks in which it did not, each
// tick at most stallStepMs: a late timer or a blocked page, after which the clock has moved on, counts
// nothing, and one long gap counts no more than a short one. Stopped for stallKickMs: the audio output
// is kicked once (audio.kick(): resume). Still stopped at stallMs: the stream stops and drops its audio
// and synthesis now (unlike a 'slow' handoff, nothing made can play any more) and calls
// onHandoff({ reason: 'stall' }) from what wasn't heard: the last word boundary heard (or the one before
// it when that one came less than stallBackS before the stop: the speaker can lag the clock by more than
// latency() says, e.g. Bluetooth where outputLatency isn't reported, and a word said twice beats a word
// lost), or the start of the chunk that never started. Hidden, it never counts; back in view it starts
// again from fresh readings. Without onHandoff there is no watchdog: the stream waits for the clock, as before.

import { newText, ingest, segment, takeChunk, takeFirstClause, takeGrowingChunk, releasePiece } from '../speech-text.js';

export const NATURAL_TIMING = Object.freeze({
  firstMin: 60, // the first chunk: the first sentence, packed with the next ones up to 60 characters,
  firstChunk: 140, // ... and a longer first sentence is cut at a clause within 140
  minChunk: 100, // later chunks may grow to (previous chunk ÷ real-time factor), within 100…260,
  chunk: 260, // so each is made while the previous one plays (no gap) and prosody gets whole sentences
  assumedRtf: 0.5, // until the engine has measured one
  prefetch: 2,
  leadS: 0.06, // a chunk with nothing before it starts this far ahead of the clock
  tickMs: 40,
  pauseSentence: 0.14,
  pauseClause: 0.06,
  pauseSpace: 0.03,
  pauseBreak: 0.28,
  trimThreshold: 0.008, // ≈ −42 dBFS
  keepHeadS: 0.02,
  keepTailS: 0.05,
  deadChunks: 2,
  // v7.8.1, the stall watchdog: the clock stopped this long (wall time of ticks in which it didn't move) …
  stallKickMs: 1500, // … kick the audio output once (resume);
  stallMs: 3500, // … hand what wasn't heard to the device voice;
  stallStepMs: 250, // one tick counts at most this much (a late timer or a blocked page never adds up)
  stallBackS: 0.3, // a word boundary this recent when the clock stopped may not have been heard yet: one more back
});
const T = NATURAL_TIMING;

let current = null;
let userDepth = 0;

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

/** Kokoro speed for the app's speaking speed (voiceRate 0.7–1.5). */
export function speedFor(rate) {
  const n = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1;
  return Math.min(2, Math.max(0.5, n));
}

/**
 * The voiced part of a chunk's audio: { from, to } sample offsets after keeping a little silence
 * at either end (headS / tailS seconds), and where the voice starts/ends inside that window.
 */
export function trimSilence(pcm, sampleRate, { threshold = T.trimThreshold, headS = T.keepHeadS, tailS = T.keepTailS } = {}) {
  let first = -1;
  let last = -1;
  for (let i = 0; i < pcm.length; i++) {
    if (Math.abs(pcm[i]) > threshold) {
      first = i;
      break;
    }
  }
  if (first < 0) return { from: 0, to: pcm.length, voicedFrom: 0, voicedTo: pcm.length, silent: true };
  for (let i = pcm.length - 1; i >= first; i--) {
    if (Math.abs(pcm[i]) > threshold) {
      last = i + 1;
      break;
    }
  }
  const from = Math.max(0, first - Math.round(headS * sampleRate));
  const to = Math.min(pcm.length, last + Math.round(tailS * sampleRate));
  return { from, to, voicedFrom: first - from, voicedTo: last - from, silent: false };
}

/**
 * Estimated word start times inside [t0, t1] (seconds): [{ at, ci, len }] with ci/len offsets in
 * `text`. A word weighs its length plus 1.5 for the gap after it, plus 3 after , ; : and dashes,
 * plus 5 after . ! ? …
 */
export function estimateWords(text, t0, t1) {
  const words = [];
  const re = /\S+/g;
  let m;
  let total = 0;
  while ((m = re.exec(text))) {
    const w = m[0];
    let weight = w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5;
    if (/[,;:]["'”’)\]]*$/.test(w) || /^[—–-]$/.test(w)) weight += 3;
    if (/[.!?…]["'”’)\]]*$/.test(w)) weight += 5;
    words.push({ ci: m.index, len: w.length, weight, at: 0 });
    total += weight;
  }
  let acc = 0;
  const span = Math.max(0, t1 - t0);
  for (const w of words) {
    w.at = t0 + (total ? (span * acc) / total : 0);
    acc += w.weight;
  }
  return words;
}

function pauseAfter(chunk, speed) {
  let p;
  if (chunk.breakAfter) p = T.pauseBreak;
  else if (/[.!?…]["'”’)\]]*$/.test(chunk.text)) p = T.pauseSentence;
  else if (/[,;:—–]$/.test(chunk.text)) p = T.pauseClause;
  else p = T.pauseSpace;
  return p / speed;
}

/** Stop whatever the natural voice is saying (the router also stops the device voice). */
export function stopNatural() {
  if (current) current.handle.cancel();
}

export function naturalSpeaking() {
  return !!current && !current.ended;
}

export function createNaturalStream(deps, options) {
  const s = open(deps, options);
  return s.handle;
}

/** Speak `text` at once (a stream given all its text). Returns { cancel() }. */
export function speakNatural(deps, text, options) {
  const s = open(deps, options);
  userDepth += 1;
  s.hold += 1;
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

function open(deps, options) {
  const opts = options && typeof options === 'object' ? options : {};
  const { engine, audio } = deps;
  const s = {
    deps,
    opts,
    engine,
    audio,
    voice: deps.voice,
    speed: speedFor(opts.rate),
    tx: newText(),
    chunks: [],
    nextSched: 0, // next chunk to put on the audio clock
    playIdx: 0, // the chunk playing now (or next to play)
    ended: false,
    started: false,
    idle: false,
    hold: 0,
    spokenUpTo: 0,
    failures: 0,
    handoff: null, // { reason, cut, from? } once the device voice is to take over
    handedOff: false,
    timer: 0,
    pumping: false,
    again: false,
    wd: null, // v7.8.1, the stall watchdog: { clock, wall, stalled, kicked } while it watches, else null
    onVisibility: null,
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
    cancel: () => endStream(s, 'cancelled', true),
    text: () => s.tx.norm,
    spokenUpTo: () => s.spokenUpTo,
    active: () => !s.ended,
    // v7.8.1 (second review): how long (ms) the watchdog has counted the clock standing still while the listener
    // waits on it, now; 0 when it moves or nothing waits. The router counts a cancel past the kick as a stall.
    stalledMs: () => (s.wd ? s.wd.stalled : 0),
  };
  for (let guard = 0; current && guard < 8; guard++) current.handle.cancel(); // one stream at a time
  current = s;
  s.timer = setInterval(() => tick(s), T.tickMs);
  if (deps.onHandoff) {
    // The watchdog starts again from fresh readings whenever the page is hidden or shown (iOS stops
    // Web Audio in the background; that is not a stall).
    s.onVisibility = () => {
      s.wd = null;
    };
    try {
      const d = globalThis.document;
      if (d && typeof d.addEventListener === 'function') d.addEventListener('visibilitychange', s.onVisibility);
    } catch {
      /* no document: ticks still check document.hidden */
    }
  }
  return s;
}

function append(s, text) {
  if (s.ended || s.tx.finished) return;
  const str = typeof text === 'string' ? text : text === null || text === undefined ? '' : String(text);
  if (!str) return;
  ingest(s.tx, str);
  segment(s.tx, segmentLimit(s));
  pump(s);
}

/** v7.8: what the engine asks of the first chunk ({ min, max }), or null. */
function firstCutOf(s) {
  let st = null;
  try {
    st = s.engine.status();
  } catch {
    return null;
  }
  const fc = st && st.firstCut;
  return fc && fc.max > 0 && fc.min > 0 && fc.min <= fc.max ? fc : null;
}

/** Until the first chunk is out, a long first sentence still being written is released at firstCut.max. */
function segmentLimit(s) {
  if (s.chunks.length) return T.chunk;
  const fc = firstCutOf(s);
  return fc ? Math.min(T.chunk, fc.max) : T.chunk;
}

function finish(s) {
  if (s.ended || s.tx.finished) return;
  s.tx.finished = true;
  segment(s.tx, segmentLimit(s));
  if (!s.tx.norm) {
    endStream(s, 'empty', false, true);
    return;
  }
  pump(s);
}

function endStream(s, reason, stopAudio = false, later = false) {
  if (s.ended) return;
  s.ended = true;
  clearInterval(s.timer);
  s.wd = null;
  if (s.onVisibility) {
    try {
      const d = globalThis.document;
      if (d && typeof d.removeEventListener === 'function') d.removeEventListener('visibilitychange', s.onVisibility);
    } catch {
      /* ignore */
    }
    s.onVisibility = null;
  }
  const ids = [];
  for (const c of s.chunks) {
    if (c.job && c.state === 'synth') ids.push(c.job.id);
    if (stopAudio && c.handle) c.handle.stop();
  }
  if (ids.length) {
    try {
      s.engine.cancel(ids);
    } catch {
      /* ignore */
    }
  }
  if (current === s) current = null;
  if (reason === null) return; // handed off: the router owns onEnd
  if (later) setTimeout(() => call(s.opts.onEnd, { reason }), 0);
  else call(s.opts.onEnd, { reason });
}

/**
 * How long the next chunk may be. The first: its first sentence (≥ 60 characters with the next
 * sentences packed in, ≤ 140 with a long one cut at a clause), so audio starts fast. After that:
 * as long as the previous chunk can cover while this one is made, (previous length ÷ real-time
 * factor), between 100 and 260 characters: chunks grow while the voice plays, without gaps. An
 * engine whose status() names a smaller firstChunk or maxChunk (the home base's voice) gets those.
 */
function limitFor(s) {
  let st = null;
  try {
    st = s.engine.status();
  } catch {
    /* keep the defaults */
  }
  // An engine may ask for shorter chunks (the home base's voice, homebase-voice.js HOMEBASE_CHUNKS).
  const firstChunk = st && st.firstChunk > 0 ? Math.min(T.firstChunk, st.firstChunk) : T.firstChunk;
  // v7.8: and grow them from a shorter first one (minChunk), assuming a slower voice until measured.
  const minChunk = st && st.minChunk > 0 ? Math.min(T.minChunk, st.minChunk) : T.minChunk;
  const assumed = st && st.assumedRtf > 0 ? st.assumedRtf : T.assumedRtf;
  const chunk = st && st.maxChunk > 0 ? Math.min(T.chunk, Math.max(minChunk, st.maxChunk)) : T.chunk;
  if (!s.chunks.length) {
    const sp = s.tx.spans[0];
    const len = sp ? sp.end - sp.start : firstChunk;
    return Math.max(Math.min(T.firstMin, firstChunk), Math.min(firstChunk, len));
  }
  const prev = s.chunks[s.chunks.length - 1];
  const rtf = st && st.rtf > 0 ? Math.max(0.15, st.rtf) : assumed;
  return Math.max(minChunk, Math.min(chunk, Math.floor(prev.text.length / rtf)));
}

function ahead(s) {
  let n = 0;
  for (let i = s.playIdx; i < s.chunks.length; i++) {
    const st = s.chunks[i].state;
    if (st === 'synth' || st === 'ready' || st === 'scheduled') n++;
  }
  return n;
}

function pump(s) {
  if (s.ended || s.hold) return;
  if (s.pumping) {
    s.again = true;
    return;
  }
  s.pumping = true;
  try {
    do {
      s.again = false;
      pumpOnce(s);
    } while (s.again && !s.ended);
  } finally {
    s.pumping = false;
  }
}

function pumpOnce(s) {
  // 1. Synthesize the next complete chunks (none once a handoff is decided).
  if (!s.handoff) {
    const playing = s.playIdx < s.chunks.length && s.chunks[s.playIdx].state === 'playing';
    while (ahead(s) < T.prefetch + (playing ? 0 : 1)) {
      const fc = firstCutOf(s);
      let range;
      if (fc && !s.chunks.length) range = takeFirstClause(s.tx, fc);
      else if (fc) {
        // v7.8 (R78-2): a voice made far away (the home base), after its short first chunk: each chunk as
        // long as the previous one can cover while it is made, a sentence still being written included.
        const limit = limitFor(s);
        releasePiece(s.tx, limit);
        range = takeGrowingChunk(s.tx, limit);
      } else range = takeChunk(s.tx, limitFor(s));
      if (!range) break;
      const chunk = {
        index: s.chunks.length,
        start: range.start,
        end: range.end,
        text: s.tx.norm.slice(range.start, range.end),
        breakAfter: s.tx.breaks.includes(range.end),
        state: 'queued',
        tries: 0,
        job: null,
        handle: null,
        fired: false,
      };
      s.chunks.push(chunk);
      s.idle = false;
      dispatch(s, chunk);
      if (s.ended || s.handoff) return;
    }
  }
  // 2. Put ready chunks on the audio clock, in order.
  schedule(s);
  if (s.ended) return;
  // 3. Handoff once the audio already made has played.
  if (s.handoff && !hasAudioLeft(s)) {
    doHandoff(s);
    return;
  }
  // 4. Idle or end.
  const busy = s.chunks.some((c) => c.state === 'queued' || c.state === 'synth' || c.state === 'ready' || c.state === 'scheduled' || c.state === 'playing');
  if (busy || s.tx.spans.length) return;
  if (s.tx.finished) {
    if (userDepth > 0) {
      setTimeout(() => pump(s), 0); // never end inside finish() itself
      return;
    }
    const played = s.chunks.some((c) => c.state === 'done');
    endStream(s, played || !s.chunks.length ? 'done' : 'error');
    return;
  }
  if (!s.idle && s.chunks.length) {
    s.idle = true;
    call(s.opts.onIdle);
  }
}

function hasAudioLeft(s) {
  const end = s.handoff ? s.handoff.cut : s.chunks.length;
  for (let i = 0; i < end; i++) {
    const st = s.chunks[i].state;
    if (st === 'ready' || st === 'scheduled' || st === 'playing') return true;
  }
  return false;
}

function dispatch(s, chunk) {
  chunk.state = 'synth';
  chunk.tries += 1;
  let job;
  try {
    job = s.engine.synth(chunk.text, { voice: s.voice, speed: s.speed, first: chunk.index === 0 }); // first: nothing plays yet
  } catch (err) {
    onSynthError(s, chunk, err);
    return;
  }
  chunk.job = job;
  job.promise.then(
    (res) => onAudio(s, chunk, job, res),
    (err) => {
      if (chunk.job === job) onSynthError(s, chunk, err);
    },
  );
}

function onAudio(s, chunk, job, res) {
  if (s.ended || chunk.job !== job || chunk.state !== 'synth') return;
  const pcm = res && res.pcm;
  const sr = (res && res.sampleRate) || 24000;
  if (!pcm || !pcm.length) {
    onSynthError(s, chunk, Object.assign(new Error('Empty audio'), { code: 'synth' }));
    return;
  }
  const cut = trimSilence(pcm, sr);
  chunk.pcm = pcm.subarray(cut.from, cut.to);
  chunk.sampleRate = sr;
  chunk.voicedFrom = cut.voicedFrom / sr;
  chunk.voicedTo = cut.voicedTo / sr;
  chunk.state = 'ready';
  s.failures = 0;
  // Real-time factor: would the listener have waited for this chunk?
  const prev = chunk.index > 0 ? s.chunks[chunk.index - 1] : null;
  const underrun = !!prev && prev.endAt > 0 && s.audio.now() > prev.endAt + pauseAfter(prev, s.speed);
  try {
    s.engine.noteTiming(res.synthMs, pcm.length / sr, { underrun });
  } catch {
    /* ignore */
  }
  const st = typeof s.engine.status === 'function' ? s.engine.status() : null;
  if (st && st.state === 'slow' && s.deps.onHandoff) requestHandoff(s, 'slow');
  pump(s);
}

function onSynthError(s, chunk, err) {
  if (s.ended || chunk.state !== 'synth') return;
  const code = err && err.code;
  if (code === 'cancelled') return;
  if (code !== 'not-ready' && code !== 'stopped' && chunk.tries < 2) {
    dispatch(s, chunk); // one retry
    return;
  }
  if (s.deps.onHandoff) {
    requestHandoff(s, code || 'error'); // the device voice says this chunk and the rest
    pump(s);
    return;
  }
  chunk.state = 'skipped';
  s.failures += 1;
  if (s.failures >= T.deadChunks) {
    endStream(s, 'error', true);
    return;
  }
  advance(s);
  pump(s);
}

function requestHandoff(s, reason) {
  if (s.handoff) return;
  // The device voice starts at the first chunk that has no audio yet; anything after it that was
  // already made is dropped (it would come out of order).
  let cut = s.chunks.findIndex((c) => c.state === 'queued' || c.state === 'synth');
  if (cut < 0) cut = s.chunks.length;
  s.handoff = { reason, cut };
  const ids = [];
  for (let i = cut; i < s.chunks.length; i++) {
    const c = s.chunks[i];
    if (c.job && c.state === 'synth') ids.push(c.job.id);
    if (c.handle) c.handle.stop();
    c.job = null;
    c.handle = null;
    c.pcm = null;
    c.state = 'dropped';
  }
  if (ids.length) {
    try {
      s.engine.cancel(ids);
    } catch {
      /* ignore */
    }
  }
}

function doHandoff(s) {
  // Everything before the cut has been heard: the device voice says the rest, from `from` (a stall
  // names its own: the last word heard).
  const h = s.handoff;
  const cut = h.cut;
  const from = typeof h.from === 'number' ? h.from : cut < s.chunks.length ? s.chunks[cut].start : s.chunks.length ? s.chunks[s.chunks.length - 1].end : 0;
  s.handedOff = true;
  endStream(s, null);
  call(s.deps.onHandoff, { from, reason: h.reason, stream: s.handle });
}

// ---- v7.8.1: the stall watchdog -----------------------------------------------------------------

function pageHidden() {
  try {
    const d = globalThis.document;
    return !!d && (d.hidden === true || d.visibilityState === 'hidden');
  } catch {
    return false;
  }
}

/** The chunk the listener is waiting for is on the audio clock (scheduled, or playing). */
function onTheClock(s) {
  const c = s.chunks[s.playIdx];
  return !!c && (c.state === 'scheduled' || c.state === 'playing');
}

/**
 * Once a tick: has the audio clock moved since the last tick? Counts the wall time of ticks in which it
 * didn't (each at most stallStepMs), kicks the output at stallKickMs, hands off at stallMs.
 */
function watch(s) {
  if (!s.deps.onHandoff || s.ended || (s.handoff && s.handoff.reason === 'stall')) return;
  if (!onTheClock(s) || pageHidden()) {
    s.wd = null; // nothing waits on the clock (or the page is hidden): fresh readings next time
    return;
  }
  let clock = NaN;
  try {
    clock = Number(s.audio.now());
  } catch {
    clock = NaN;
  }
  const wall = Date.now();
  const w = s.wd;
  if (!w || !Number.isFinite(clock)) {
    s.wd = Number.isFinite(clock) ? { clock, wall, stalled: 0, kicked: false } : null;
    return;
  }
  const step = wall - w.wall;
  w.wall = wall;
  if (clock !== w.clock) {
    // It moves (a late tick after a blocked page included: the clock moved on meanwhile).
    w.clock = clock;
    w.stalled = 0;
    w.kicked = false;
    return;
  }
  w.stalled += Math.min(T.stallStepMs, Math.max(0, step));
  if (w.stalled >= T.stallMs) {
    stallHandoff(s);
    return;
  }
  if (!w.kicked && w.stalled >= T.stallKickMs) {
    w.kicked = true;
    try {
      if (typeof s.audio.kick === 'function') s.audio.kick();
    } catch {
      /* ignore */
    }
  }
}

/**
 * The clock stopped for good: nothing scheduled will play. Unlike requestHandoff (which lets the audio
 * already made play out), everything stops now; the device voice says what wasn't heard: from the last
 * word boundary heard (the clock stopped mid-chunk; one boundary further back when that one came less
 * than stallBackS before the stop; the next chunk if its voice had all been heard), or from the start of
 * the chunk that never started. Second review: a chunk whose voice ended by the clock less than stallBackS
 * before the stop (the stop in its kept silence, in the pause after it, or as the next chunk's first word
 * began) may not have reached the owner either: from its last word.
 */
function stallHandoff(s) {
  if (s.ended) return;
  const cut = s.playIdx;
  const c = s.chunks[cut];
  let from = c ? c.start : s.tx.norm.length;
  let t = NaN;
  try {
    t = s.audio.now() - s.audio.latency();
  } catch {
    t = NaN;
  }
  // A chunk's last word, when its voice ended (by the clock) less than stallBackS before the stop; else null.
  const lastWordIfJustEnded = (x) => (x && x.words && x.words.length && Number.isFinite(t) && t - (x.startAt + x.voicedTo) < T.stallBackS ? x.start + x.words[x.words.length - 1].ci : null);
  const prev = cut > 0 && s.chunks[cut - 1].state === 'done' ? s.chunks[cut - 1] : null;
  if (c && c.state === 'playing') {
    if (Number.isFinite(t) && t >= c.startAt + c.voicedTo) from = lastWordIfJustEnded(c) ?? c.end;
    else if (c.words && c.wordIdx > 0) {
      let k = c.wordIdx - 1; // the last word boundary heard, by the clock
      // Only just begun (or not yet heard: a speaker lagging the clock more than latency() says, the end of
      // the word before it possibly cut): from the word before it, the chunk before's last one included.
      if (Number.isFinite(t) && t - c.words[k].at < T.stallBackS) k -= 1;
      from = k >= 0 ? c.start + c.words[k].ci : (lastWordIfJustEnded(prev) ?? c.start + c.words[0].ci);
    }
  } else if (c && c.state === 'scheduled') from = lastWordIfJustEnded(prev) ?? from; // in the pause before it
  s.handoff = { reason: 'stall', cut, from };
  s.wd = null;
  const ids = [];
  for (let i = cut; i < s.chunks.length; i++) {
    const x = s.chunks[i];
    if (x.job && x.state === 'synth') ids.push(x.job.id);
    if (x.handle) {
      try {
        x.handle.stop();
      } catch {
        /* ignore */
      }
    }
    x.job = null;
    x.handle = null;
    x.pcm = null;
    x.state = 'dropped';
  }
  if (ids.length) {
    try {
      s.engine.cancel(ids);
    } catch {
      /* ignore */
    }
  }
  doHandoff(s);
}

function schedule(s) {
  while (s.nextSched < s.chunks.length) {
    const c = s.chunks[s.nextSched];
    if (c.state === 'skipped') {
      s.nextSched++;
      continue;
    }
    if (c.state !== 'ready') break;
    let prev = null;
    for (let i = s.nextSched - 1; i >= 0; i--) {
      if (s.chunks[i].endAt) {
        prev = s.chunks[i];
        break;
      }
    }
    const now = s.audio.now();
    let at = now + T.leadS;
    if (prev) at = Math.max(at, prev.endAt + pauseAfter(prev, s.speed));
    try {
      c.handle = s.audio.play(c.pcm, c.sampleRate, at);
    } catch (err) {
      report(err);
      if (s.deps.onHandoff) {
        c.state = 'queued';
        requestHandoff(s, 'audio');
        return;
      }
      endStream(s, 'error', true);
      return;
    }
    c.startAt = c.handle.when;
    c.endAt = c.startAt + c.handle.duration;
    c.words = estimateWords(c.text, c.startAt + c.voicedFrom, c.startAt + c.voicedTo);
    c.wordIdx = 0;
    c.pcm = null;
    c.state = 'scheduled';
    s.nextSched++;
  }
}

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

function advance(s) {
  while (s.playIdx < s.chunks.length) {
    const c = s.chunks[s.playIdx];
    if (c.state !== 'done' && c.state !== 'skipped') break;
    s.spokenUpTo = c.end;
    s.playIdx++;
  }
}

/** The clock: chunk starts, word boundaries and chunk ends, as the listener hears them. */
function tick(s) {
  if (s.ended) {
    clearInterval(s.timer);
    return;
  }
  const t = s.audio.now() - s.audio.latency();
  let changed = false;
  for (let guard = 0; guard < 64 && s.playIdx < s.chunks.length && !s.ended; guard++) {
    const c = s.chunks[s.playIdx];
    if (c.state === 'skipped') {
      advance(s);
      changed = true;
      continue;
    }
    if (c.state === 'scheduled' && t >= c.startAt + c.voicedFrom) {
      c.state = 'playing';
      play(s, c);
      if (s.ended) return;
    }
    if (c.state !== 'playing') break;
    while (c.wordIdx < c.words.length && c.words[c.wordIdx].at <= t) {
      const w = c.words[c.wordIdx++];
      call(s.opts.onBoundary, { charIndex: c.start + w.ci, charLength: w.len, name: 'word', chunkIndex: c.index });
      if (s.ended) return;
    }
    if (t < c.endAt) break;
    c.state = 'done';
    c.handle = null;
    advance(s);
    changed = true;
  }
  if (changed) pump(s);
  if (!s.ended) watch(s);
}
