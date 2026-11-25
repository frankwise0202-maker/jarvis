// Home base senses (v7.7, beta, SPEC §25): hearing (Whisper) and George's voice (Kokoro) made on the
// owner's Alienware by Jarvis Core instead of on this device. Pure helpers: no DOM, no network, no
// storage.
//
//   encodeWav(samples, sampleRate)    -> Uint8Array: a WAV, mono PCM16 (what POST api/hear takes)
//   decodeWav(bytes)                  -> { sampleRate, channels, pcm: Float32Array (mono) } | null
//   createVad(options)                -> the energy VAD that finds the end of an utterance
//   sensesView(json)                  -> GET api/senses checked: { hear, speak, deps } | null
//   sensesProblem(failure)            -> { state, message } for a request that failed
//   hearText(json)                    -> the words of a POST api/hear answer ('' for none)
//   contextPrompt({ names, title, texts }) -> up to 200 characters of context words (?prompt=)
//   hearEndSilenceMs(wait)            -> the silence that ends an utterance for Settings' wait
//   HEAR_TIMEOUT_MS                   -> slower than this, the device's own recognizer takes over
//
// Nothing here decides what the owner hears: the app keeps its own recognizer and voice as the
// fallback, and everything is off until the owner turns it on (Settings → Home base → Hearing and
// voice (beta)).

import { cleanLine, failureState } from './homebase.js';

export const HEAR_SAMPLE_RATE = 16000;
export const HEAR_MAX_MS = 30000; // the Core takes at most 30 s of audio (and 2 MB)
export const HEAR_TIMEOUT_MS = 4000; // the home base answers slower than this: the device's recognizer
export const HEAR_PROMPT_MAX = 200; // ?prompt= context words, at most 200 characters
export const SPEAK_MAX_CHARS = 1000; // POST api/speak takes at most 1000 characters
export const HEAR_MODELS = Object.freeze([
  Object.freeze({ id: 'base.en', label: 'Fast', help: 'Whisper base: about a second for a sentence.' }),
  Object.freeze({ id: 'small.en', label: 'Accurate', help: 'Whisper small: hears more, takes a little longer.' }),
]);
export const SENSES_STATES = Object.freeze(['off', 'downloading', 'loading', 'warming', 'ready', 'error']);
export const OLD_SENSES_MESSAGE = 'Your home base needs an update for hearing and voice: run jarvis-core update on the Alienware.';
export const NO_DEPS_MESSAGE = 'The home base is missing its speech software. Run jarvis-core update on the Alienware, then try again.';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// ---- WAV ----------------------------------------------------------------------------------------

function writeTag(view, at, tag) {
  for (let i = 0; i < 4; i++) view.setUint8(at + i, tag.charCodeAt(i));
}

/** Mono PCM16 WAV of `samples` (-1..1 floats; anything outside is clipped, NaN is silence). */
export function encodeWav(samples, sampleRate = HEAR_SAMPLE_RATE) {
  const n = samples && typeof samples.length === 'number' ? samples.length : 0;
  const rate = Math.max(1, Math.round(num(sampleRate) || HEAR_SAMPLE_RATE));
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  writeTag(v, 0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  writeTag(v, 8, 'WAVE');
  writeTag(v, 12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // bytes per second
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeTag(v, 36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    let s = Number(samples[i]);
    if (!(s === s)) s = 0; // NaN
    s = s > 1 ? 1 : s < -1 ? -1 : s;
    v.setInt16(44 + i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return new Uint8Array(buf);
}

function tagAt(view, at) {
  let s = '';
  for (let i = 0; i < 4; i++) s += String.fromCharCode(view.getUint8(at + i));
  return s;
}

/**
 * A WAV from the home base (api/speak: 24 kHz mono PCM16) as floats. PCM 8/16/24/32-bit and 32-bit
 * float, any number of channels (mixed to mono). A data chunk that claims more bytes than there are
 * (a streamed WAV) is read to the end. Anything else (not a WAV, no samples) is null.
 */
export function decodeWav(bytes, { maxSeconds = 120 } = {}) {
  let u8;
  if (bytes instanceof Uint8Array) u8 = bytes;
  else if (bytes instanceof ArrayBuffer) u8 = new Uint8Array(bytes);
  else if (bytes && bytes.buffer instanceof ArrayBuffer) u8 = new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
  else return null;
  if (u8.byteLength < 44) return null;
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (tagAt(view, 0) !== 'RIFF' || tagAt(view, 8) !== 'WAVE') return null;
  let fmt = null;
  let dataAt = -1;
  let dataLen = 0;
  let at = 12;
  while (at + 8 <= u8.byteLength) {
    const id = tagAt(view, at);
    const size = view.getUint32(at + 4, true);
    const body = at + 8;
    if (id === 'fmt ' && size >= 16 && body + 16 <= u8.byteLength) {
      fmt = { format: view.getUint16(body, true), channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bits: view.getUint16(body + 14, true) };
      if (fmt.format === 0xfffe && size >= 26 && body + 26 <= u8.byteLength) fmt.format = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
    } else if (id === 'data') {
      dataAt = body;
      dataLen = Math.min(size, u8.byteLength - body);
      break;
    }
    at = body + size + (size % 2);
  }
  if (!fmt || dataAt < 0 || !(fmt.channels >= 1 && fmt.channels <= 8) || !(fmt.sampleRate >= 4000 && fmt.sampleRate <= 192000)) return null;
  const isFloat = fmt.format === 3 && fmt.bits === 32;
  const isPcm = fmt.format === 1 && [8, 16, 24, 32].includes(fmt.bits);
  if (!isFloat && !isPcm) return null;
  const width = fmt.bits / 8;
  const frame = width * fmt.channels;
  let frames = Math.floor(dataLen / frame);
  frames = Math.min(frames, Math.floor(maxSeconds * fmt.sampleRate));
  if (frames <= 0) return null;
  const pcm = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const p = dataAt + i * frame + c * width;
      let s;
      if (isFloat) s = view.getFloat32(p, true);
      else if (fmt.bits === 16) s = view.getInt16(p, true) / 32768;
      else if (fmt.bits === 8) s = (view.getUint8(p) - 128) / 128;
      else if (fmt.bits === 24) {
        let x = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getUint8(p + 2) << 16);
        if (x & 0x800000) x -= 0x1000000;
        s = x / 8388608;
      } else s = view.getInt32(p, true) / 2147483648;
      sum += Number.isFinite(s) ? s : 0;
    }
    pcm[i] = sum / fmt.channels;
  }
  return { sampleRate: fmt.sampleRate, channels: fmt.channels, pcm };
}

// ---- the end of an utterance (an energy VAD) -------------------------------------------------------

export const VAD_DEFAULTS = Object.freeze({
  sampleRate: HEAR_SAMPLE_RATE,
  subMs: 20, // judged in 20 ms steps
  endSilenceMs: 1200, // speech, then this much silence: the utterance is over
  maxMs: HEAR_MAX_MS, // an utterance (with its lead-in) never runs longer
  noSpeechMs: 10000, // nothing said at all for this long: no speech
  preRollMs: 300, // kept from before the speech started (its first sound)
  tailMs: 300, // kept after the last speech
  onsetSteps: 4, // speech starts with 4 loud steps among the last 6 (a click is shorter)
  onsetWindow: 6,
  minSpeechSteps: 6, // fewer loud steps than this in all (120 ms) is a noise, not words
  riseDb: 10, // loud: this far above the room's level ...
  keepDb: 6, // ... and, once talking, still this far above it
  minDb: -60, // and never quieter than this (dBFS)
  floorUp: 0.0008, // the room's level rises slowly (about 25 s) ...
  floorDown: 0.25, // ... and falls fast
});

function levelDb(x, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += x[i] * x[i];
  const rms = Math.sqrt(sum / Math.max(1, to - from));
  return 20 * Math.log10(rms + 1e-9);
}

/**
 * The end of what the owner says, by loudness against the room: speech starts with a few loud
 * 20 ms steps close together, and is over after `endSilenceMs` without one; never longer than
 * `maxMs`. Feed it 16 kHz mono floats in any block sizes:
 *
 *   const vad = createVad({ endSilenceMs: 1200 });
 *   for (const ev of vad.push(block)) …   ev: { type: 'speech' } once the owner starts talking,
 *                                          { type: 'end', reason: 'silence' | 'max' | 'stop', samples }
 *                                          (the utterance: a little before the speech to a little
 *                                          after it), { type: 'noise' } (too short to be words: the
 *                                          VAD listens on), { type: 'nospeech' } (nothing for
 *                                          noSpeechMs)
 *   vad.finish()   -> the 'end' event of an utterance under way (reason 'stop'), or null
 *   vad.reset()    the next utterance (the room's level is kept)
 *   vad.speaking   true between 'speech' and its 'end'
 */
export function createVad(options = {}) {
  const o = { ...VAD_DEFAULTS, ...(isObj(options) ? options : {}) };
  const rate = o.sampleRate;
  const sub = Math.max(16, Math.round((rate * o.subMs) / 1000));
  const stepMs = (sub / rate) * 1000;
  const preSteps = Math.ceil(o.preRollMs / stepMs);
  const tailSteps = Math.ceil(o.tailMs / stepMs);
  const endSteps = Math.ceil(o.endSilenceMs / stepMs);
  const maxSteps = Math.floor(o.maxMs / stepMs);
  const noSpeechSteps = Math.ceil(o.noSpeechMs / stepMs);
  let pending = new Float32Array(sub);
  let fill = 0;
  let floor = null;
  let recent = []; // loud or not, the last onsetWindow steps
  let pre = []; // the last preSteps steps before speech (Float32Array each)
  let kept = []; // the utterance's steps since its lead-in
  let speaking = false;
  let loudSteps = 0;
  let quietRun = 0;
  let waited = 0; // steps without speech since the start (or the last reset)
  let noSpeechSent = false;

  function judge(step) {
    const db = levelDb(step, 0, step.length);
    if (floor === null) floor = Math.min(db, -40);
    const loud = db > Math.max(floor + (speaking ? o.keepDb : o.riseDb), o.minDb);
    floor += (db - floor) * (db < floor ? o.floorDown : o.floorUp);
    return loud;
  }

  function endEvent(reason) {
    // The utterance without most of its trailing silence: up to tailMs after the last loud step.
    const drop = Math.max(0, quietRun - tailSteps);
    const steps = kept.slice(0, kept.length - drop);
    let n = 0;
    for (const s of steps) n += s.length;
    const samples = new Float32Array(n);
    let at = 0;
    for (const s of steps) {
      samples.set(s, at);
      at += s.length;
    }
    const words = loudSteps >= o.minSpeechSteps;
    speaking = false;
    kept = [];
    pre = [];
    recent = [];
    loudSteps = 0;
    quietRun = 0;
    waited = 0;
    noSpeechSent = false;
    return words ? { type: 'end', reason, samples, ms: Math.round((n / rate) * 1000) } : { type: 'noise' };
  }

  function step(s, out) {
    const loud = judge(s);
    if (!speaking) {
      recent.push(loud);
      if (recent.length > o.onsetWindow) recent.shift();
      pre.push(s);
      if (pre.length > preSteps + o.onsetWindow) pre.shift();
      const n = recent.reduce((a, b) => a + (b ? 1 : 0), 0);
      if (n >= o.onsetSteps) {
        speaking = true;
        kept = pre.slice();
        pre = [];
        loudSteps = n;
        quietRun = 0;
        out.push({ type: 'speech' });
        return;
      }
      waited += 1;
      if (!noSpeechSent && waited >= noSpeechSteps) {
        noSpeechSent = true;
        out.push({ type: 'nospeech' });
      }
      return;
    }
    kept.push(s);
    if (loud) {
      loudSteps += 1;
      quietRun = 0;
    } else quietRun += 1;
    if (quietRun >= endSteps) out.push(endEvent('silence'));
    else if (kept.length >= maxSteps) out.push(endEvent('max'));
  }

  return {
    push(block) {
      const out = [];
      if (!block || !block.length) return out;
      let i = 0;
      while (i < block.length) {
        const n = Math.min(sub - fill, block.length - i);
        for (let k = 0; k < n; k++) {
          const v = Number(block[i + k]);
          pending[fill + k] = v === v ? v : 0;
        }
        fill += n;
        i += n;
        if (fill === sub) {
          const s = pending;
          pending = new Float32Array(sub);
          fill = 0;
          step(s, out);
        }
      }
      return out;
    },
    finish() {
      return speaking ? endEvent('stop') : null;
    },
    reset() {
      speaking = false;
      kept = [];
      pre = [];
      recent = [];
      loudSteps = 0;
      quietRun = 0;
      waited = 0;
      noSpeechSent = false;
      fill = 0;
    },
    get speaking() {
      return speaking;
    },
    get floorDb() {
      return floor;
    },
  };
}

/** Settings → Voice → Wait after I stop talking, for the home base's VAD: Short and Normal 1.2 s, Long 2.2 s. */
export function hearEndSilenceMs(wait) {
  return wait === 'long' ? 2200 : 1200;
}

// ---- GET api/senses -------------------------------------------------------------------------------

function stateOf(v) {
  if (typeof v !== 'string') return 'off';
  return SENSES_STATES.includes(v) ? v : 'loading';
}

function errorText(v) {
  if (typeof v === 'string') return cleanLine(v, 200) || null;
  if (isObj(v)) return cleanLine(typeof v.message === 'string' ? v.message : typeof v.code === 'string' ? v.code : '', 200) || null;
  return null;
}

function part(v, extra) {
  const p = isObj(v) ? v : {};
  const progress = num(p.progress);
  const sizeMb = num(p.sizeMb);
  return {
    enabled: p.enabled === true,
    state: stateOf(p.state),
    progress: progress === null ? null : Math.min(1, Math.max(0, progress)),
    sizeMb: sizeMb !== null && sizeMb >= 0 && sizeMb < 100000 ? Math.round(sizeMb) : null,
    error: errorText(p.error),
    ...extra(p),
  };
}

const MODEL_ID = /^[a-z0-9][a-z0-9.-]{0,23}$/;
const VOICE_ID = /^[a-z]{2}_[a-z]{2,20}$/;

/**
 * GET api/senses, checked: { hear: { enabled, model, state, progress, sizeMb, error }, speak: {
 * enabled, voice, state, progress, sizeMb, error }, deps: { installed } }, or null when it isn't
 * the Core's answer. A missing number is null (never 0); an unknown state is 'loading' (not ready).
 */
export function sensesView(json) {
  if (!isObj(json) || !isObj(json.hear) || !isObj(json.speak)) return null;
  const hear = part(json.hear, (p) => ({ model: typeof p.model === 'string' && MODEL_ID.test(p.model) ? p.model : 'base.en' }));
  const speak = part(json.speak, (p) => ({ voice: typeof p.voice === 'string' && VOICE_ID.test(p.voice) ? p.voice : 'bm_george' }));
  const deps = { installed: !(isObj(json.deps) && json.deps.installed === false) };
  return { hear, speak, deps };
}

/** A part (hear or speak) the app may use right now: on at the home base and ready. */
export function senseReady(view, which) {
  const p = view && isObj(view[which]) ? view[which] : null;
  return !!p && p.enabled === true && p.state === 'ready' && !(view.deps && view.deps.installed === false);
}

/** The model's label ("Fast" / "Accurate") for an id, or the id itself. */
export function hearModelLabel(id) {
  const m = HEAR_MODELS.find((x) => x.id === id);
  return m ? m.label : cleanLine(String(id || ''), 24);
}

/** Words for a failed senses request: { state, message }. */
export function sensesProblem(failure) {
  const f = isObj(failure) ? failure : {};
  if (f.kind === 'http' && f.status === 404 && (f.code === 'not_found' || !f.code)) return { state: 'old', message: OLD_SENSES_MESSAGE };
  if (f.kind === 'timeout') return { state: 'slow', message: 'The home base took too long to answer.' };
  if (f.kind === 'unset') return { state: 'unset', message: 'Link your home base first: Settings → Home base.' };
  if (f.kind === 'nodeps') return { state: 'nodeps', message: NO_DEPS_MESSAGE };
  if (f.kind === 'unreachable' || f.kind === 'down' || f.kind === 'starting') return { state: 'offline', message: failureState(f).message };
  if (f.kind === 'http' && typeof f.message === 'string' && f.message && f.code && f.code !== 'internal') {
    const said = cleanLine(f.message, 200);
    return { state: 'said', message: said.replace(/^./, (c) => c.toUpperCase()) };
  }
  return { state: 'error', message: failureState(f).message };
}

// ---- POST api/hear ---------------------------------------------------------------------------------

// What Whisper writes for a sound that isn't words ("[BLANK_AUDIO]", "(music)", "[Applause]", "*cough*").
const NOT_WORDS = /\[[^\]]{0,40}\]|\([^)]{0,40}\)|\*[^*]{0,40}\*|♪+/g;

/** The words of a POST api/hear answer, as one clean line ('' when it heard no words). */
export function hearText(json) {
  if (!isObj(json) || typeof json.text !== 'string') return '';
  const t = cleanLine(json.text.replace(NOT_WORDS, ' '), 2000);
  return /[\p{L}\p{N}]/u.test(t) ? t : '';
}

// ---- ?prompt= ----------------------------------------------------------------------------------------

const STOP = new Set(
  'a an and are as at be but by can could did do does for from had has have he her his how i if in into is it its just me my no not of on or our she so than that the their them then there these they this to too up us was we were what when where which who why will with would you your yes ok okay please tell show me let get got make'.split(
    ' ',
  ),
);

function cleanWord(w) {
  return String(w || '')
    .replace(/[^\p{L}\p{N}'’ -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Context words for Whisper (?prompt=, at most 200 characters): the names given first (Jarvis, the
 * owner's name, the parts of the hologram on screen), then the conversation's title, then names,
 * places and model numbers from its latest messages (capitalized words, words with digits). Each
 * once, in that order, as a comma-separated list. Nothing personal leaves the owner's own devices:
 * this goes only to the home base.
 */
export function contextPrompt({ names = [], title = '', texts = [] } = {}, max = HEAR_PROMPT_MAX) {
  const out = [];
  const seen = new Set();
  let len = 0;
  const add = (raw) => {
    const w = cleanWord(raw);
    if (!w || w.length > 40) return true;
    const key = w.toLowerCase();
    if (seen.has(key) || STOP.has(key)) return true;
    const extra = (out.length ? 2 : 0) + w.length;
    if (len + extra > max) return false;
    seen.add(key);
    out.push(w);
    len += extra;
    return true;
  };
  for (const n of Array.isArray(names) ? names : []) if (!add(typeof n === 'string' ? n : n && n.phrase)) return out.join(', ');
  for (const w of cleanWord(title).split(' ')) if (w.length > 2 && !add(w)) return out.join(', ');
  const list = Array.isArray(texts) ? texts : [texts];
  for (const text of list) {
    if (typeof text !== 'string') continue;
    // Capitalized words not at the start of a sentence, and anything with a digit (LG 27GP850).
    const words = text.replace(/[`*_#>[\]()]/g, ' ').split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (!w) continue;
      const prev = i > 0 ? words[i - 1] : '';
      const sentenceStart = i === 0 || /[.!?:]["'”’)]*$/.test(prev);
      const named = /^\p{Lu}[\p{L}'’-]+$/u.test(w) && !sentenceStart;
      const coded = /\p{N}/u.test(w) && /\p{L}/u.test(w);
      if ((named || coded) && !add(w)) return out.join(', ');
    }
  }
  return out.join(', ');
}
