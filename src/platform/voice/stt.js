// Speech-to-text with the Web Speech API (SPEC §9.2).
//
//   sttSupported() -> boolean
//   startListening(options) -> { stop(), abort() }
//     lang              a BCP 47 tag; '' or missing = the device's language (resolveListenLang)
//     onPartial(text, info)  the words of this turn so far, as they come (info: { turn })
//     onFinal(text, info)    the owner has finished: once per turn. info: { alternatives, reason, turn }
//                            (alternatives: other readings of the whole turn, best first; reason:
//                            'silence' | 'stop' | 'max' | 'ended' | 'error')
//     onError({ code, message, restarted? })  code: 'not-allowed'|'no-speech'|'network'|'aborted'|'unsupported'|'other'
//                            (restarted: it happened when listening started again within a turn)
//     onEnd()                exactly once, after everything else, however listening ended
//     wait              'short' | 'normal' | 'long': the silence that ends a turn (1.0 / 1.6 / 2.6 s)
//     silenceMs         the same in milliseconds (wins over wait)
//     maxMs             a turn never runs longer than this (at most 60 s)
//     noSpeechMs        give up when nothing at all is heard for this long (10 s)
//     phrases           words to listen for: strings or { phrase, boost } (Chrome's contextual
//                       biasing where the browser has it; skipped silently elsewhere, iOS included)
//     keepListening     after a turn, keep listening for the next one until stop() or abort()
//   stop(): "I'm done": deliver what was heard now. abort(): cancel without delivering anything.
//
// Jarvis, not the browser, decides when the owner has finished (v7.2). The recognizer runs
// continuously (continuous: true, interimResults: true, maxAlternatives: 3) and a turn ends after a
// silence window with no change in the words: 1.6 s by default (Settings → Voice → Wait after I stop
// talking: 1.0 / 1.6 / 2.6 s), 1 s longer while the words so far end like an unfinished sentence
// ("…and", "…the", "um") or are only an opener ("Jarvis,", "okay so"), and never past 60 s. A recognizer
// that ends by itself before that (iOS Safari does, after a pause) is started again at once and its
// words are appended without repeating any; its 'no-speech' and 'aborted' errors are ignored within
// the turn. The first start happens inside startListening() (iOS only lets recognition begin inside
// the owner's tap); restarts need no gesture, and one the browser refuses is never retried (no
// permission-prompt loops). Callbacks never fire synchronously inside startListening(), so the caller
// always holds the handle first.

const TIMING = Object.freeze({
  silenceMs: 1600, // the default silence window ('normal')
  extendMs: 1000, // smart extension: the sentence isn't finished yet
  maxMs: 60000, // a turn never runs longer
  noSpeechMs: 10000, // nothing heard at all: give up (browsers usually say 'no-speech' sooner)
  stopGraceMs: 1500, // stop(): the recognizer's last words may still come
  abortGraceMs: 1000, // abort(): recognizers occasionally never send 'end'
  shrinkHoldMs: 350, // a revision that only drops the last words waits this long (no flicker)
  maxRestarts: 40, // recognizers started again within one listen
  fastEndMs: 500, // a session that ends this soon with no result ...
  fastEnds: 3, // ... this many times in a row: stop restarting
  retryMs: 250, // a restart whose start() threw is tried again after this long
});
export const LISTEN_TIMING = TIMING;

/** Settings → Voice → Wait after I stop talking. */
export const LISTEN_WAITS = Object.freeze({ short: 1000, normal: 1600, long: 2600 });

/** The silence window of a 'short' | 'normal' | 'long' setting (anything else: normal). */
export function listenWaitMs(wait) {
  return Object.prototype.hasOwnProperty.call(LISTEN_WAITS, wait) ? LISTEN_WAITS[wait] : LISTEN_WAITS.normal;
}

const MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow the microphone for this site in your browser settings, then try again.',
  'service-not-allowed': "Speech recognition isn't allowed on this device. On iPhone, turn on Dictation (Settings → General → Keyboard) and Siri.",
  'no-speech': "I didn't hear anything. Tap the mic and try again.",
  network: 'Voice input needs an internet connection. Check your connection and try again.',
  aborted: 'Listening was stopped.',
  'audio-capture': 'No microphone was found, or another app is using it.',
  'language-not-supported': "Voice input doesn't support the selected language here. Change the listening language in Settings.",
  unsupported: "Voice input isn't supported in this browser. Try Safari on iPhone, or Chrome or Edge on Android and desktop.",
  other: 'Voice input stopped unexpectedly. Please try again.',
};

function recognitionCtor() {
  try {
    return globalThis.SpeechRecognition || globalThis.webkitSpeechRecognition || null;
  } catch {
    return null;
  }
}

export function sttSupported() {
  return typeof recognitionCtor() === 'function';
}

/** Map a SpeechRecognitionErrorEvent.error (or DOMException name) to { code, message }. */
export function mapSttError(error) {
  switch (error) {
    case 'not-allowed':
    case 'NotAllowedError':
    case 'SecurityError':
      return { code: 'not-allowed', message: MESSAGES['not-allowed'] };
    case 'service-not-allowed':
      return { code: 'not-allowed', message: MESSAGES['service-not-allowed'] };
    case 'no-speech':
      return { code: 'no-speech', message: MESSAGES['no-speech'] };
    case 'network':
      return { code: 'network', message: MESSAGES.network };
    case 'aborted':
    case 'AbortError':
      return { code: 'aborted', message: MESSAGES.aborted };
    case 'audio-capture':
      return { code: 'other', message: MESSAGES['audio-capture'] };
    case 'language-not-supported':
      return { code: 'unsupported', message: MESSAGES['language-not-supported'] };
    case 'unsupported':
      return { code: 'unsupported', message: MESSAGES.unsupported };
    default:
      return { code: 'other', message: MESSAGES.other };
  }
}

function call(fn, ...args) {
  if (typeof fn !== 'function') return;
  try {
    fn(...args);
  } catch (err) {
    try {
      console.error('[jarvis] voice input callback failed:', err);
    } catch {
      /* ignore */
    }
  }
}

const LANG_TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$/;

function langTag(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return s.length <= 35 && LANG_TAG.test(s) ? s.replace(/_/g, '-') : '';
}

/** The device's language (navigator.language, then navigator.languages[0]), or ''. */
export function deviceLang(nav) {
  let n = nav;
  if (n === undefined) {
    try {
      n = globalThis.navigator;
    } catch {
      n = null;
    }
  }
  try {
    return langTag(n && n.language) || langTag(n && n.languages && n.languages[0]) || '';
  } catch {
    return '';
  }
}

/** The language to listen in: the Settings value when it is a language tag, else the device's, else en-US. */
export function resolveListenLang(lang, nav) {
  return langTag(lang) || deviceLang(nav) || 'en-US';
}

// ---- words ------------------------------------------------------------------------------------

function normWord(token) {
  return String(token ?? '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[^\p{L}\p{N}'-]+/gu, '')
    .replace(/^['-]+|['-]+$/g, '');
}

/** Lowercase words without punctuation (inner apostrophes and hyphens kept): how readings compare. */
export function normalWords(text) {
  const out = [];
  for (const token of String(text ?? '').split(/\s+/)) {
    const w = normWord(token);
    if (w) out.push(w);
  }
  return out;
}

function tokens(text) {
  return String(text ?? '')
    .split(/\s+/)
    .filter(Boolean);
}

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** True when the word list `words` starts with all of `prefix`. */
function startsWith(words, prefix) {
  if (prefix.length > words.length) return false;
  for (let i = 0; i < prefix.length; i++) if (words[i] !== prefix[i]) return false;
  return true;
}

/**
 * `next` appended to `prev` without repeating words: a recognizer started again may hear the end
 * of the last words again, or hand back everything so far. Compared without case or punctuation.
 */
export function joinWords(prev, next) {
  const a = clean(prev);
  const b = clean(next);
  if (!a) return b;
  if (!b) return a;
  const na = normalWords(a);
  const tb = tokens(b);
  const wb = []; // b's words with the index of the token each ends
  tb.forEach((t, i) => {
    const w = normWord(t);
    if (w) wb.push({ w, i });
  });
  if (!wb.length) return a;
  const nb = wb.map((x) => x.w);
  if (startsWith(nb, na)) return b; // it holds everything so far
  if (startsWith(na, nb)) return a; // nothing new
  for (let k = Math.min(8, na.length, nb.length); k >= 1; k--) {
    let same = true;
    for (let j = 0; j < k; j++) {
      if (na[na.length - k + j] !== nb[j]) {
        same = false;
        break;
      }
    }
    if (same) {
      const rest = tb.slice(wb[k - 1].i + 1).join(' ');
      return rest ? `${a} ${rest}` : a;
    }
  }
  return `${a} ${b}`;
}

// Words that leave a sentence hanging, and the openers people say before they know the rest.
const UNFINISHED = new Set(['and', 'or', 'but', 'so', 'because', 'the', 'a', 'an', 'to', 'of', 'for', 'with', 'in', 'on', 'my', 'your', 'is', 'are', 'was', 'if', 'that', 'which', 'then', 'um', 'uh', 'umm', 'uhh', 'erm', 'er', 'like']);
const OPENERS = new Set([
  'jarvis', 'hey', 'hi', 'ok', 'okay', 'so', 'well', 'um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'right', 'alright', 'actually', 'also', 'listen', 'now',
  'quick', 'question', 'and', 'but', 'i', "i'm", 'im', "i'd", 'we', 'can', 'could', 'would', 'will', 'should', 'do', 'does', 'did', 'is', 'are',
  'what', "what's", 'whats', 'how', "how's", 'why', 'who', 'where', 'when', 'which', 'tell', 'show', 'give', 'let', "let's", 'lets', 'me', 'please', 'you',
]);

/**
 * True when the words so far sound unfinished: the last word leaves the sentence hanging ("…and",
 * "…the", "um"), or they are only an opener ("Jarvis,", "okay so", "can you"). The turn then waits longer.
 */
export function sentenceUnfinished(text) {
  const w = normalWords(text);
  if (!w.length) return false;
  if (UNFINISHED.has(w[w.length - 1])) return true;
  return w.length <= 3 && w.every((x) => OPENERS.has(x));
}

/** The silence (ms) that ends a turn whose words so far are `text`. */
export function turnSilenceMs(text, baseMs = TIMING.silenceMs) {
  return baseMs + (sentenceUnfinished(text) ? TIMING.extendMs : 0);
}

// ---- results ----------------------------------------------------------------------------------

function altTexts(result, max = 3) {
  const out = [];
  const n = Math.min(Number(result && result.length) || 0, max);
  for (let k = 0; k < n; k++) {
    const alt = result[k];
    const t = clean(alt && typeof alt.transcript === 'string' ? alt.transcript : '');
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * The words of one recognizer session from its results list, robust to how engines differ:
 * Chrome sends several results (one per phrase, final or not) that follow each other; iOS Safari
 * often sends ONE result whose text grows (final only at the end); some engines repeat a result, or
 * send each new result with everything before it (Android). Returns the parts in order:
 * [{ text, alts, final }] (alts: the result's other readings, best first).
 */
export function readResults(results) {
  const parts = [];
  const n = Number(results && results.length) || 0;
  for (let i = 0; i < n; i++) {
    const r = results[i];
    const alts = altTexts(r);
    if (!alts.length) continue;
    const item = { text: alts[0], alts: alts.slice(1), final: !!(r && r.isFinal) };
    const words = normalWords(item.text);
    if (!words.length) continue;
    if (parts.length) {
      const prev = parts[parts.length - 1];
      if (words.length >= 2 && words.join(' ') === normalWords(prev.text).join(' ')) {
        // The same words again: keep the final copy.
        if (item.final && !prev.final) parts[parts.length - 1] = item;
        continue;
      }
      const sofar = normalWords(parts.map((p) => p.text).join(' '));
      if (words.length > sofar.length && startsWith(words, sofar)) parts.length = 0; // everything so far, and more
    }
    parts.push(item);
  }
  return parts;
}

/** The text of `parts` (readResults) and up to `max` other readings, swapping one part at a time. */
function readings(parts, fromToken = 0, max = 4) {
  const best = parts.map((p) => p.text);
  const starts = [];
  let at = 0;
  for (const p of parts) {
    starts.push(at);
    at += tokens(p.text).length;
  }
  const out = [];
  for (let i = parts.length - 1; i >= 0 && out.length < max; i--) {
    if (starts[i] < fromToken) break; // an earlier turn's words are not read again
    for (const alt of parts[i].alts) {
      if (out.length >= max) break;
      const v = best.slice();
      v[i] = alt;
      out.push(v.join(' '));
    }
  }
  return { text: best.join(' '), alternatives: out };
}

// ---- contextual biasing (Chrome) ------------------------------------------------------------------

let phrasesUnsupported = false; // the speech service said 'phrases-not-supported': don't send them again

function normalizePhrases(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const phrase = clean(typeof item === 'string' ? item : item && item.phrase).slice(0, 60);
    if (!phrase || !/[\p{L}\p{N}]/u.test(phrase)) continue;
    const key = phrase.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    let boost = item && typeof item === 'object' ? Number(item.boost) : NaN;
    if (!Number.isFinite(boost)) boost = 1.5;
    out.push({ phrase, boost: Math.min(10, Math.max(0, boost)) });
    if (out.length >= 80) break;
  }
  return out;
}

/** Give the recognizer phrases to listen for, where the browser supports it. True when it took them. */
function applyPhrases(rec, phrases) {
  if (!phrases.length || phrasesUnsupported) return false;
  let Phrase = null;
  try {
    Phrase = globalThis.SpeechRecognitionPhrase;
  } catch {
    Phrase = null;
  }
  if (typeof Phrase !== 'function' || !rec || !('phrases' in rec)) return false;
  try {
    const list = phrases.map((p) => new Phrase(p.phrase, p.boost));
    try {
      rec.phrases = list;
    } catch {
      const List = globalThis.SpeechRecognitionPhraseList;
      if (typeof List !== 'function') return false;
      rec.phrases = new List(list);
    }
    return true;
  } catch {
    return false;
  }
}

function pageHidden() {
  try {
    return typeof document !== 'undefined' && document.hidden === true;
  } catch {
    return false;
  }
}

// ---- listening ----------------------------------------------------------------------------------

export function startListening(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const { onPartial, onFinal, onEnd, onError } = opts;
  const silenceBase = Number.isFinite(opts.silenceMs) && opts.silenceMs >= 300 ? Math.min(10000, opts.silenceMs) : listenWaitMs(opts.wait);
  const maxMs = Number.isFinite(opts.maxMs) && opts.maxMs > 0 ? Math.min(TIMING.maxMs, opts.maxMs) : TIMING.maxMs;
  const noSpeechMs = Number.isFinite(opts.noSpeechMs) && opts.noSpeechMs > 0 ? opts.noSpeechMs : TIMING.noSpeechMs;
  const keep = opts.keepListening === true;
  const phrases = normalizePhrases(opts.phrases);
  const lang = resolveListenLang(opts.lang);
  const Ctor = recognitionCtor();

  const S = {
    ended: false,
    closing: '', // 'stop' | 'abort' | 'done' | 'error' while winding down
    errored: false,
    rec: null,
    sessions: 0, // recognizers started (the first one, then restarts)
    restarts: 0,
    fastEnds: 0,
    sessionStart: 0,
    sessionResults: false,
    parts: [], // readResults() of the current session
    plain: false, // start without phrases (the service refused them)
    shown: '', // the words last handed to onPartial
    turn: { n: 0, start: Date.now(), committed: '', base: 0, text: '', heard: false, last: 0 },
    turns: 0,
    timers: {},
  };
  const now = () => Date.now();

  function schedule(name, ms, fn) {
    clearTimeout(S.timers[name]);
    S.timers[name] = setTimeout(() => {
      S.timers[name] = 0;
      fn();
    }, Math.max(0, ms));
  }
  function unschedule(...names) {
    for (const name of names) {
      clearTimeout(S.timers[name]);
      S.timers[name] = 0;
    }
  }
  function clearTimers() {
    for (const name of Object.keys(S.timers)) clearTimeout(S.timers[name]);
    S.timers = {};
  }

  function newTurn(baseTokens = 0) {
    S.turn = { n: S.turns++, start: now(), committed: '', base: baseTokens, text: '', heard: false, last: 0 };
    S.shown = '';
    unschedule('silence', 'shrink');
    schedule('max', maxMs, () => endTurn('max'));
    if (S.turn.n === 0) {
      schedule('noSpeech', noSpeechMs, () => {
        if (S.ended || S.closing || S.turn.heard) return;
        fail(mapSttError('no-speech'));
        close('error');
      });
    }
  }

  function sessionTokens() {
    return tokens(S.parts.map((p) => p.text).join(' ')).length;
  }

  /** This turn's words: earlier sessions' words, then this session's (after an earlier turn's). */
  function turnReading() {
    const T = S.turn;
    const r = readings(S.parts, T.base);
    const text = joinWords(T.committed, tokens(r.text).slice(T.base).join(' '));
    const key = normalWords(text).join(' ');
    const alternatives = [];
    for (const v of r.alternatives) {
      const alt = joinWords(T.committed, tokens(v).slice(T.base).join(' '));
      if (alt && normalWords(alt).join(' ') !== key && !alternatives.includes(alt)) alternatives.push(alt);
    }
    return { text, alternatives };
  }

  function show(text) {
    S.shown = text;
    call(onPartial, text, { turn: S.turn.n });
  }

  /** Hand the words to onPartial; a revision that only drops the last words waits a moment. */
  function publish(text) {
    unschedule('shrink');
    if (!text || text === S.shown) return;
    const nw = normalWords(text);
    const shownWords = normalWords(S.shown);
    if (S.shown && nw.length < shownWords.length && startsWith(shownWords, nw)) {
      schedule('shrink', TIMING.shrinkHoldMs, () => {
        if (!S.ended && S.turn && S.turn.text === text) show(text);
      });
      return;
    }
    show(text);
  }

  function update() {
    const T = S.turn;
    const { text } = turnReading();
    if (text === T.text) return;
    T.text = text;
    if (!text) return;
    T.heard = true;
    T.last = now();
    unschedule('noSpeech');
    publish(text);
    if (!S.closing) armSilence();
  }

  function armSilence() {
    const T = S.turn;
    const due = Math.min(T.last + turnSilenceMs(T.text, silenceBase), T.start + maxMs);
    schedule('silence', due - now(), () => endTurn('silence'));
  }

  /** Deliver this turn's words (if any) and stop listening. */
  function deliverAndClose(reason) {
    const T = S.turn;
    const { text, alternatives } = turnReading();
    const words = clean(text || T.text);
    if (words) call(onFinal, words, { alternatives, reason, turn: T.n });
    close('done');
  }

  /** Jarvis decided the owner has finished this turn ('silence' or 'max'). */
  function endTurn(reason) {
    if (S.ended || S.closing) return;
    unschedule('silence', 'shrink', 'max', 'noSpeech');
    if (!keep) {
      deliverAndClose(reason);
      return;
    }
    const T = S.turn;
    const { text, alternatives } = turnReading();
    const words = clean(text || T.text);
    if (words) call(onFinal, words, { alternatives, reason, turn: T.n });
    if (S.ended || S.closing) return; // the caller stopped listening inside onFinal
    // The session goes on: its words so far belong to the turn that just ended.
    newTurn(S.rec ? sessionTokens() : 0);
  }

  function fail(err) {
    if (S.ended || S.errored) return;
    S.errored = true;
    call(onError, err);
  }

  /** Wind down: abort the recognizer (if one runs), then end. */
  function close(kind) {
    if (S.ended || (S.closing && S.closing !== 'stop')) return;
    S.closing = kind;
    unschedule('silence', 'shrink', 'max', 'noSpeech', 'restart');
    const rec = S.rec;
    if (!rec) {
      finish();
      return;
    }
    try {
      rec.abort();
    } catch {
      /* not started */
    }
    schedule('grace', TIMING.abortGraceMs, finish);
  }

  function finish() {
    if (S.ended) return;
    S.ended = true;
    clearTimers();
    detach(S.rec);
    S.rec = null;
    // stop(): deliver what was heard in this turn (some engines never flag a result final).
    if (S.closing === 'stop' && !S.errored) {
      const { text, alternatives } = turnReading();
      const words = clean(text || S.turn.text);
      if (words) call(onFinal, words, { alternatives, reason: 'stop', turn: S.turn.n });
    }
    call(onEnd);
  }

  function detach(rec) {
    if (!rec) return;
    rec.onresult = rec.onerror = rec.onend = rec.onnomatch = null;
  }

  /** The recognizer can't go on: deliver this turn's words, or report `err` (or that nothing was heard). */
  function giveUp(err = null) {
    if (clean(S.turn.text)) {
      deliverAndClose('ended');
      return;
    }
    if (err) fail(err);
    else if (S.turn.n === 0) fail(mapSttError('no-speech'));
    close(S.errored ? 'error' : 'done');
  }

  /** Start one recognizer session. `first`: inside startListening() (errors are reported async). */
  function begin(first) {
    let rec;
    try {
      rec = new Ctor();
      rec.lang = lang;
      rec.interimResults = true;
      rec.continuous = true;
      rec.maxAlternatives = 3;
    } catch (err) {
      if (first) {
        setTimeout(() => {
          fail(mapSttError(err && err.name));
          finish();
        }, 0);
      } else retryLater();
      return;
    }
    const withPhrases = !S.plain && applyPhrases(rec, phrases);
    S.rec = rec;
    S.sessions += 1;
    S.sessionStart = now();
    S.sessionResults = false;
    S.parts = [];

    rec.onresult = (event) => {
      if (rec !== S.rec || S.ended || (S.closing && S.closing !== 'stop')) return;
      S.sessionResults = true;
      S.parts = readResults(event && event.results);
      update();
    };
    // Continuous recognizers report 'nomatch' for noise: never the end of a turn.
    rec.onnomatch = () => {};
    rec.onerror = (event) => {
      if (rec !== S.rec || S.ended || S.closing) return; // winding down: our own stop() or abort()
      const code = event && event.error;
      if (code === 'phrases-not-supported') {
        // Contextual biasing isn't available here: listen without it (and never send it again).
        phrasesUnsupported = true;
        S.plain = true;
        return; // the session ends and starts again without phrases
      }
      const T = S.turn;
      const fresh = S.sessions === 1 && T.n === 0 && !T.heard;
      if (code === 'no-speech' || code === 'aborted') {
        if (!fresh) return; // within a turn: the session ends and listening starts again
        fail(mapSttError(code)); // the browser heard nobody: as before
        close('error');
        return;
      }
      // The microphone, the network or the language failed: keep what was heard.
      if (clean(T.text)) {
        deliverAndClose('error');
        return;
      }
      const err = mapSttError(code);
      if (!fresh) err.restarted = true;
      fail(err);
      close('error');
    };
    rec.onend = () => {
      if (rec !== S.rec) return;
      detach(rec);
      S.rec = null;
      if (S.ended) return;
      if (S.closing) {
        finish();
        return;
      }
      // Ended by itself before Jarvis decided the turn is over (iOS does, after a pause): keep
      // this session's words and listen again at once.
      S.turn.committed = S.turn.text;
      S.turn.base = 0;
      S.parts = [];
      const quick = now() - S.sessionStart < TIMING.fastEndMs && !S.sessionResults;
      S.fastEnds = quick ? S.fastEnds + 1 : 0;
      if (pageHidden() || S.restarts >= TIMING.maxRestarts || S.fastEnds >= TIMING.fastEnds) {
        giveUp();
        return;
      }
      S.restarts += 1;
      begin(false);
    };

    try {
      rec.start();
    } catch (err) {
      detach(rec);
      S.rec = null;
      S.sessions -= 1;
      if (withPhrases) {
        // A browser that takes the phrases but can't start with them: once more, without.
        phrasesUnsupported = true;
        S.plain = true;
        begin(first);
        return;
      }
      const refused = !!err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      if (first) {
        setTimeout(() => {
          fail(mapSttError(refused ? 'not-allowed' : 'other'));
          finish();
        }, 0);
        return;
      }
      if (refused) {
        // Listening again was refused (iOS may want a tap): never ask again in a loop.
        const e = mapSttError('not-allowed');
        e.restarted = true;
        giveUp(e);
        return;
      }
      retryLater();
    }
  }

  function retryLater() {
    S.fastEnds += 1;
    if (S.fastEnds >= TIMING.fastEnds || S.restarts >= TIMING.maxRestarts) {
      giveUp();
      return;
    }
    schedule('restart', TIMING.retryMs, () => {
      if (S.ended || S.closing) return;
      S.restarts += 1;
      begin(false);
    });
  }

  const handle = {
    /** "I'm done": deliver what was heard in this turn, then end. */
    stop() {
      if (S.ended || S.closing) return;
      S.closing = 'stop';
      unschedule('silence', 'shrink', 'max', 'noSpeech', 'restart');
      const rec = S.rec;
      if (!rec) {
        finish();
        return;
      }
      try {
        rec.stop();
      } catch {
        /* not started */
      }
      schedule('grace', TIMING.stopGraceMs, finish);
    },
    /** Cancel without delivering anything (a stop() still waiting for its words is cancelled too). */
    abort() {
      if (S.ended || (S.closing && S.closing !== 'stop')) return;
      close('abort');
    },
  };

  if (typeof Ctor !== 'function') {
    setTimeout(() => {
      fail(mapSttError('unsupported'));
      finish();
    }, 0);
    return handle;
  }

  S.turns = 0;
  newTurn(0);
  // start() synchronously: iOS Safari only lets recognition begin inside the user's tap.
  // (Recognition events are always asynchronous, so the caller still gets the handle first.)
  begin(true);
  return handle;
}
