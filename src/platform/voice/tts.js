// Spoken replies with speechSynthesis (SPEC §9.2).
//
//   ttsSupported()
//   getVoices() -> Promise<SpeechSynthesisVoice[]>   after 'voiceschanged' or 1.5 s
//   pickDefaultVoice(voices) -> voice | null           British-butler preference (see below)
//   unlockSpeech()     speak an empty utterance; call from the first click/keydown/touchend
//                      handler (not touchstart/pointerdown) so iOS allows speech later on
//   speak(text, { voiceURI, rate, onStart, onEnd, onBoundary }) -> { cancel() }
//        Text is split into ≤ 220-character sentence chunks spoken one after another (Chrome
//        cuts off long utterances). onStart() once when audio begins; onEnd({ reason }) exactly
//        once (reason: 'done'|'cancelled'|'interrupted'|'error'|'empty'|'unsupported');
//        onBoundary({ charIndex, charLength, name, chunkIndex }) with charIndex relative to the
//        whitespace-normalized text. A new speak() replaces whatever is being spoken.
//   stopSpeaking(), isSpeaking()
//   toSpeech(markdown, mode)   'summary' = first paragraph as plain text, ≤ ~400 chars;
//                              'full' = all plain text without code blocks or URLs; 'off' = ''
//   chunkText(text, max = 220), splitSentences(text)   pure helpers (exported for tests)

import { markdownToPlainText } from '../../lib/markdown.js';

const MAX_CHUNK = 220;
const SUMMARY_MAX = 400;
const VOICES_TIMEOUT_MS = 1500;
const STALL_TICKS = 3; // seconds of silence without an 'end' event before moving on

// Voice preference, in order (SPEC §9.2). Matched case-insensitively against voice names.
const PREFERRED_VOICES = [/\bdaniel\b/i, /\barthur\b/i, /\boliver\b/i, /google uk english male/i, /microsoft ryan/i, /microsoft george/i];
// Used only to rank otherwise-equal fallbacks ("male-sounding" first).
const FEMALE_HINT =
  /\b(female|woman|samantha|karen|moira|tessa|fiona|serena|kate|stephanie|martha|libby|sonia|hazel|susan|mia|maisie|victoria|allison|ava|zoe|kathy|vicki|catherine|emily|jenny|aria|zira|nicky|joanna|kendra|kimberly|salli|amy|emma|olivia|google us english|google uk english female)\b/i;
const QUALITY_HINT = /\b(enhanced|premium|natural|neural)\b/i;

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

function langOf(v) {
  return String((v && v.lang) || '').replace(/_/g, '-').toLowerCase();
}

const isBritish = (v) => langOf(v).startsWith('en-gb');
const isAmerican = (v) => langOf(v).startsWith('en-us');
const isEnglish = (v) => langOf(v).startsWith('en');

function best(list, score) {
  let top = null;
  let topScore = -Infinity;
  for (const v of list) {
    const s = score(v);
    if (s > topScore) {
      top = v;
      topScore = s;
    }
  }
  return top;
}

const quality = (v) => (QUALITY_HINT.test(v.name) ? 1 : 0) + (v.localService ? 0.25 : 0);

/**
 * The default voice: a preferred British male voice by name (Daniel, Arthur, Oliver, Google UK
 * English Male, Microsoft Ryan, Microsoft George - in that order, English variants only), then
 * any en-GB voice, then any en-US voice (male-sounding names first in both), then the
 * browser's default voice, then the first voice. Null for an empty list.
 */
export function pickDefaultVoice(voices) {
  const list = Array.isArray(voices) ? voices.filter((v) => v && typeof v.name === 'string') : [];
  if (!list.length) return null;
  for (const re of PREFERRED_VOICES) {
    const hits = list.filter((v) => re.test(v.name) && isEnglish(v));
    if (hits.length) return best(hits, (v) => (isBritish(v) ? 2 : 0) + quality(v));
  }
  const rank = (v) => (FEMALE_HINT.test(v.name) ? 0 : 2) + quality(v) + (v.default ? 0.5 : 0);
  const gb = list.filter(isBritish);
  if (gb.length) return best(gb, rank);
  const us = list.filter(isAmerican);
  if (us.length) return best(us, rank);
  return list.find((v) => v.default) || list[0];
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

/** Unlock speech for later use (iOS needs the first speak() inside a user gesture). */
export function unlockSpeech() {
  if (unlocked || !ttsSupported()) return;
  unlocked = true;
  if (session) return; // already speaking, nothing to unlock
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

let session = null;

function call(fn, arg) {
  if (typeof fn !== 'function') return;
  try {
    fn(arg);
  } catch (err) {
    try {
      console.error('[jarvis] speech callback failed:', err);
    } catch {
      /* ignore */
    }
  }
}

function clampRate(rate) {
  const n = typeof rate === 'number' && Number.isFinite(rate) ? rate : 1;
  return Math.min(2, Math.max(0.5, n));
}

export function speak(text, options) {
  const opts = options || {};
  const s = { opts, chunks: [], offsets: [], index: 0, voice: null, rate: clampRate(opts.rate), utterance: null, started: false, ended: false, idle: 0, timer: 0 };
  const handle = { cancel: () => cancelSession(s) };
  if (!ttsSupported()) {
    s.ended = true;
    setTimeout(() => call(opts.onEnd, { reason: 'unsupported' }), 0);
    return handle;
  }
  stopSpeaking();
  s.chunks = chunkText(text);
  if (!s.chunks.length) {
    s.ended = true;
    setTimeout(() => call(opts.onEnd, { reason: 'empty' }), 0);
    return handle;
  }
  let offset = 0;
  for (const c of s.chunks) {
    s.offsets.push(offset);
    offset += c.length + 1;
  }
  session = s;
  s.timer = setInterval(() => watchdog(s), 1000);
  const voices = voicesNow();
  if (voices.length) {
    s.voice = resolveVoice(opts.voiceURI, voices);
    next(s); // synchronously: keeps the user gesture on iOS
  } else {
    getVoices().then((list) => {
      if (s.ended || session !== s) return;
      s.voice = resolveVoice(opts.voiceURI, list);
      next(s);
    });
  }
  return handle;
}

function next(s) {
  if (s.ended || session !== s) return;
  if (s.index >= s.chunks.length) {
    end(s, 'done');
    return;
  }
  const i = s.index;
  let u;
  try {
    u = new globalThis.SpeechSynthesisUtterance(s.chunks[i]);
  } catch {
    end(s, 'error');
    return;
  }
  if (s.voice) {
    u.voice = s.voice;
    u.lang = s.voice.lang;
  }
  u.rate = s.rate;
  const stale = () => s.ended || session !== s || s.utterance !== u;
  u.onstart = () => {
    if (stale()) return;
    s.idle = 0;
    if (!s.started) {
      s.started = true;
      call(s.opts.onStart);
    }
  };
  u.onend = () => {
    if (stale()) return;
    s.index = i + 1;
    next(s);
  };
  u.onerror = (event) => {
    if (stale()) return;
    const code = event && event.error;
    if (code === 'interrupted' || code === 'canceled') end(s, 'interrupted'); // stopped by someone else
    else if (code === 'not-allowed') end(s, 'error'); // iOS before unlockSpeech()
    else {
      s.index = i + 1; // skip a chunk that failed (e.g. synthesis-failed) and carry on
      next(s);
    }
  };
  u.onboundary = (event) => {
    if (stale()) return;
    call(s.opts.onBoundary, {
      charIndex: s.offsets[i] + ((event && event.charIndex) || 0),
      charLength: (event && event.charLength) || 0,
      name: (event && event.name) || 'word',
      chunkIndex: i,
    });
  };
  s.utterance = u; // also keeps a reference: Chrome drops events of garbage-collected utterances
  s.idle = 0;
  try {
    synth().speak(u);
  } catch {
    end(s, 'error');
  }
}

/** Some engines occasionally never fire 'end'; never leave the app stuck in "speaking". */
function watchdog(s) {
  if (s.ended || session !== s) {
    clearInterval(s.timer);
    return;
  }
  if (!s.utterance) return; // still waiting for voices
  let busy = true;
  try {
    busy = !!(synth().speaking || synth().pending);
  } catch {
    busy = false;
  }
  if (busy) {
    s.idle = 0;
    return;
  }
  if (++s.idle >= STALL_TICKS) {
    s.index++;
    next(s);
  }
}

function end(s, reason) {
  if (s.ended) return;
  s.ended = true;
  clearInterval(s.timer);
  if (session === s) session = null;
  s.utterance = null;
  call(s.opts.onEnd, { reason });
}

function cancelSession(s) {
  if (s.ended) return;
  const wasCurrent = session === s;
  end(s, 'cancelled'); // first, so the cancel's own error events are ignored
  if (wasCurrent) cancelSynth();
}

function cancelSynth() {
  try {
    const sy = synth();
    if (sy.speaking || sy.pending) sy.cancel();
  } catch {
    /* ignore */
  }
}

/** Stop whatever Jarvis is saying. */
export function stopSpeaking() {
  if (!ttsSupported()) return;
  if (session) cancelSession(session);
  else cancelSynth();
}

export function isSpeaking() {
  return !!session && !session.ended;
}

// ---------------------------------------------------------------------------------------
// Text preparation (pure)
// ---------------------------------------------------------------------------------------

/** Markdown -> text to read aloud. mode: 'summary' | 'full' | 'off'. */
export function toSpeech(markdown, mode = 'full') {
  if (mode === 'off') return '';
  if (mode === 'summary') return clampSummary(markdownToPlainText(markdown, { speech: true, firstParagraph: true }), SUMMARY_MAX);
  return markdownToPlainText(markdown, { speech: true }).replace(/\s+/g, ' ').trim();
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
 * Sentence chunks of at most `max` characters: whole sentences are packed together; a longer
 * sentence is split at a clause boundary (, ; : — –), else at a space, else hard.
 */
export function chunkText(text, max = MAX_CHUNK) {
  const limit = Math.max(20, Math.floor(Number(max)) || MAX_CHUNK);
  const chunks = [];
  let cur = '';
  for (const sentence of splitSentences(text)) {
    const pieces = sentence.length > limit ? splitLong(sentence, limit) : [sentence];
    for (const p of pieces) {
      if (!cur) cur = p;
      else if (cur.length + 1 + p.length <= limit) cur += ' ' + p;
      else {
        chunks.push(cur);
        cur = p;
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function splitLong(sentence, limit) {
  const out = [];
  let rest = sentence;
  while (rest.length > limit) {
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
    if (code >= 0xdc00 && code <= 0xdfff) cut--; // never split a surrogate pair
    const piece = rest.slice(0, cut).trim();
    if (piece) out.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}
