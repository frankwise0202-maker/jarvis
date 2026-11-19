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

import { newText, ingest, segment, takeChunk } from '../speech-text.js';

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
    handoff: null, // { from } once the device voice is to take over
    handedOff: false,
    timer: 0,
    pumping: false,
    again: false,
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
  };
  for (let guard = 0; current && guard < 8; guard++) current.handle.cancel(); // one stream at a time
  current = s;
  s.timer = setInterval(() => tick(s), T.tickMs);
  return s;
}

function append(s, text) {
  if (s.ended || s.tx.finished) return;
  const str = typeof text === 'string' ? text : text === null || text === undefined ? '' : String(text);
  if (!str) return;
  ingest(s.tx, str);
  segment(s.tx, T.chunk);
  pump(s);
}

function finish(s) {
  if (s.ended || s.tx.finished) return;
  s.tx.finished = true;
  segment(s.tx, T.chunk);
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
 * factor), between 100 and 260 characters: chunks grow while the voice plays, without gaps.
 */
function limitFor(s) {
  if (!s.chunks.length) {
    const sp = s.tx.spans[0];
    const len = sp ? sp.end - sp.start : T.firstChunk;
    return Math.max(T.firstMin, Math.min(T.firstChunk, len));
  }
  const prev = s.chunks[s.chunks.length - 1];
  let rtf = T.assumedRtf;
  try {
    const st = s.engine.status();
    if (st && st.rtf > 0) rtf = Math.max(0.15, st.rtf);
  } catch {
    /* keep the assumption */
  }
  return Math.max(T.minChunk, Math.min(T.chunk, Math.floor(prev.text.length / rtf)));
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
      const range = takeChunk(s.tx, limitFor(s));
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
    job = s.engine.synth(chunk.text, { voice: s.voice, speed: s.speed });
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
  // Everything before the cut has been heard: the device voice says the rest, from `from`.
  const cut = s.handoff.cut;
  const from = cut < s.chunks.length ? s.chunks[cut].start : s.chunks.length ? s.chunks[s.chunks.length - 1].end : 0;
  s.handedOff = true;
  endStream(s, null);
  call(s.deps.onHandoff, { from, reason: s.handoff.reason, stream: s.handle });
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
}
