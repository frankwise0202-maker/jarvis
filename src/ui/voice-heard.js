// What Jarvis heard (v7.2): the "Show, then send" check and the words to listen for. Pure (no DOM).
//
//   REVIEW_MS                       how long what was heard is shown before it is sent (2 s)
//   reviewReply(text, heard)        words said while it is shown -> { kind, text? }:
//                                     'cancel'  "cancel", "never mind", "forget it", "scratch that",
//                                               also after a run of "no", "oh", "wait" ("no no, cancel")
//                                     'correct' "no, I said …", "I said …", "I meant …", "no, <words>"
//                                               or the sentence said again (text: the fix)
//                                     'send'    "send it", "yes", "go ahead", "that's right", "that's
//                                               fine", also after "no" ("no, that's fine")
//                                     'wait'    "wait", "hold on", "no", "no no" (the countdown stops)
//                                     'filler'  only "um", "uh", "hmm" (nothing changes)
//                                     'more'    anything else: the sentence goes on (text: appended)
//   planCorrection(heard, said)     { text, sure }: the sentence with the fix applied. A restatement
//                                   replaces it; a fix that shares words with it replaces only the
//                                   stretch they line up with ("oat milk" -> "buy oat milk", "for four"
//                                   -> "for four at seven"); a short fix replaces the word that sounds
//                                   most like it ("Boston" for "Austin"), or the one number for a
//                                   number; one it already says changes nothing. sure: false when it
//                                   is a guess (nothing sounds close, several numbers): the check then
//                                   waits for the owner to confirm. Never the whole sentence for a
//                                   short fix.
//   applyCorrection(heard, said)    planCorrection's text
//   pickHeard(text, alternatives, partNames)  the reading to use: an alternative that names a part of
//                                   the open hologram when the best reading names none
//   namesPart(text, partNames)      the words name a part of the open hologram
//   commandReading(text, alternatives, { isCommand, isMusic })  the reading the chat's mic acts on:
//                                   a command first (the best reading, then another), an Apple Music
//                                   command by another reading only when the best one is nothing else
//   listenPhrases({ partNames })    phrases for Chrome's contextual biasing: "Jarvis", the hologram's
//                                   part names and the command words (Apple Music's too)

export const REVIEW_MS = 2000;

function clean(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function words(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}'-]+/gu, '').replace(/^['-]+|['-]+$/g, ''))
    .filter(Boolean);
}

/** The words of `text` as one lowercase line, without "Jarvis" first or "please"/"thanks" last. */
function core(text) {
  let w = words(text);
  while (w.length && /^(?:jarvis|hey|ok|okay|oh)$/.test(w[0]) && w.length > 1) w = w.slice(1);
  while (w.length > 1 && /^(?:please|thanks|thank|you)$/.test(w[w.length - 1])) w = w.slice(0, -1);
  return w.join(' ');
}

const CANCEL = /^(?:(?:no|oh|actually|wait|sorry)\s+)?(?:cancel(?:\s+(?:that|it|this|please))?|never\s?mind(?:\s+(?:that|it))?|forget\s+(?:it|that|about\s+it)|scratch\s+that|don'?t\s+send(?:\s+(?:it|that|this))?|do\s+not\s+send(?:\s+(?:it|that|this))?|stop(?:\s+(?:it|that))?|abort)$/;
const SEND = /^(?:yes|yeah|yep|yup|send|send\s+it|send\s+that|send\s+now|send\s+it\s+now|go|go\s+ahead|that'?s\s+(?:right|correct|it|fine|good)|(?:it'?s|looks|sounds)\s+(?:fine|good|right)|fine|correct|perfect|do\s+it|yes\s+send\s+it)$/;
const WAIT = /^(?:wait|wait\s+a\s+(?:sec|second|moment)|hold\s+on|hang\s+on|one\s+(?:sec|second|moment)|just\s+a\s+(?:sec|second|moment)|no|nope|not\s+quite|wrong|that'?s\s+(?:wrong|not\s+(?:it|right)))$/;
const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'mm', 'mmm', 'ah', 'oh', 'ok', 'okay']);
// "no, I said …", "I said …", "I meant …", "no, I mean …" (original wording kept for the new text)
const CORRECTION = /^\s*(?:(?:hey\s+)?jarvis[\s,.!]+)?(?:(?:(?:no|nope|not\s+quite|wrong|sorry|oh)[\s,.!]+)*(?:i\s+said|i\s+meant|what\s+i\s+said\s+was|i\s+was\s+saying)|(?:(?:no|nope)[\s,.!]+)+i\s+mean)[\s,:]+(.+?)\s*$/i;
// Said first, before what is meant: a run of "no", "oh", "wait" … ("no no, cancel").
const LEAD = /^(?:(?:no|nope|oh|wait|actually|sorry)\s+)+/;
// "no, <words>": the words after the run of "no" (original wording kept for the new text)
const NO_THEN = /^\s*(?:(?:hey\s+)?jarvis[\s,.!]+)?(?:(?:oh|ok|okay)[\s,.!]+)?(?:(?:no|nope)[\s,.!—–-]+)+(?:(?:no|nope|oh|wait|actually|sorry)[\s,.!—–-]+)*(.+?)\s*$/i;

const unquote = (text) => clean(text).replace(/^["“”']+|["“”']+$/g, '');

/**
 * Words said while what was heard is shown for 2 seconds. `heard` is the sentence being shown (a
 * restatement that starts like it replaces it).
 */
export function reviewReply(text, heard = '') {
  const said = clean(text);
  const c = core(said);
  if (!c) return { kind: 'filler' };
  // What follows a run of "no", "oh" or "wait" ("no no, cancel"; "no, Boston").
  const rest = c.replace(LEAD, '');
  if (CANCEL.test(c) || (rest !== c && CANCEL.test(rest))) return { kind: 'cancel' };
  const m = CORRECTION.exec(said);
  if (m && clean(m[1]) && words(m[1]).length) return { kind: 'correct', text: unquote(m[1]) };
  if (SEND.test(c)) return { kind: 'send' };
  if (WAIT.test(c)) return { kind: 'wait' };
  const w = c.split(' ');
  if (w.every((x) => FILLERS.has(x))) return { kind: 'filler' };
  if (rest !== c) {
    // "no no", "no, wait", "no, um": the countdown stops.
    if (!rest || WAIT.test(rest) || rest.split(' ').every((x) => FILLERS.has(x))) return { kind: 'wait' };
    if (/^(?:no|nope)\s/.test(c)) {
      if (SEND.test(rest)) return { kind: 'send' };
      // "no, Boston": a correction (how it applies is applyCorrection's, or the owner confirms it).
      const n = NO_THEN.exec(said);
      if (n && words(n[1]).length) return { kind: 'correct', text: unquote(n[1]) };
    }
  }
  // The sentence said again ("What's the weather in Boston" after "What's the weather in Austin").
  const h = words(heard);
  const sw = words(said);
  if (h.length >= 2 && sw.length >= 3 && sw[0] === h[0] && sw[1] === h[1]) return { kind: 'correct', text: said };
  return { kind: 'more', text: said };
}

function letters(text) {
  return words(text).join('');
}

function distance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/**
 * 1 for the same letters, 0 for nothing alike: the closer of the spelling and the rhyme (misheard
 * names often differ only at the start: "Dan" for "Ann", "Austin" for "Boston").
 */
function likeness(a, b) {
  return Math.max(alike(letters(a), letters(b)), alike(sound(a), sound(b)));
}

function alike(x, y) {
  if (!x || !y) return 0;
  const longest = Math.max(x.length, y.length);
  let k = 0;
  while (k < x.length && k < y.length && x[x.length - 1 - k] === y[y.length - 1 - k]) k++;
  return Math.max(1 - distance(x, y) / longest, k >= 2 ? k / longest : 0);
}

/** A rough sound of the letters: doubled letters once, ph → f, ck/q → k, z → s ("Ann" sounds like "an"). */
function sound(text) {
  return letters(text)
    .replace(/ph/g, 'f')
    .replace(/ck|q/g, 'k')
    .replace(/z/g, 's')
    .replace(/(.)\1+/g, '$1');
}

const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand',
]);
const isNumber = (token) => {
  const w = words(token).join(' ');
  return !!w && (/^\d+(?:[.,:]\d+)*(?:st|nd|rd|th|am|pm|%)?$/.test(w) || NUMBER_WORDS.has(w));
};

// Words a correction rarely means to replace with an unlike word: small words ("in Paris" replaces
// the word after "in", not "in"), and the verbs a request starts with ("oat milk" for "buy milk" adds
// "oat", it doesn't replace "buy"). Neither is a guess for a fix that sounds like nothing.
const SMALL = new Set([
  'a', 'an', 'the', 'to', 'of', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'about', 'into', 'onto', 'over', 'under', 'and', 'or', 'but', 'so',
  'is', 'are', 'was', 'were', 'be', 'am', 'do', 'does', 'did', 'me', 'my', 'your', 'our', 'his', 'her', 'their', 'it', 'its', 'this', 'that',
  'these', 'those', 'some', 'i', 'you', 'we', 'he', 'she', 'they', 'what', "what's", 'whats', 'how', "how's", 'when', 'where', "where's", 'who',
  'why', 'which', 'can', 'could', 'would', 'will', 'should', 'please', 'hey', 'jarvis',
]);
const VERBS = new Set([
  'set', 'get', 'buy', 'call', 'text', 'play', 'show', 'tell', 'make', 'book', 'find', 'remind', 'send', 'open', 'turn', 'put', 'give', 'take', 'add',
  'start', 'check', 'look', 'read', 'search', 'email', 'message', 'order',
]);

const keyOf = (token) => words(token).join('');
/** A name: a word with a capital letter that isn't the sentence's first word (nor "I"). */
const nameLike = (token, first = false) => !first && /^\p{Lu}/u.test(String(token || '')) && !/^I(?:['’]|$)/.test(String(token || ''));
const isNumberKey = (k) => !!k && (/^\d/.test(k) || NUMBER_WORDS.has(k));

/** The runs of number words or digits in `keys` ("twenty five" is one): [{ start, end }]. */
function numberRuns(keys) {
  const runs = [];
  keys.forEach((k, i) => {
    if (!isNumberKey(k)) return;
    const last = runs[runs.length - 1];
    if (last && last.end === i) last.end = i + 1;
    else runs.push({ start: i, end: i + 1 });
  });
  return runs;
}

/**
 * The fix `fw` laid over the stretch of the sentence `ow` it lines up with best, when the two share a
 * word (keys: their normalized words): { text, sure } or null. Word by word: the same word +2, one
 * that sounds alike +1, a number for a number or a name for a name +0.5, an unlike word -0.6 (-1.5
 * for a small word or a request verb; 0.5 back when it sits right after the same small word, "in
 * Paris" for "in Austin", or right before the same word, "almond milk" for "oat milk"); a word of the
 * fix put in -0.5 ("oat milk" for "buy milk", "Nice, France" for "Nice"); a word of the sentence
 * dropped -1. Sure when it rests on a word the sentence already has, adds words only next to one
 * that isn't small, drops nothing, and no other stretch lines up as well.
 */
function alignFix(ow, ok, fw, fk) {
  const n = ow.length;
  const m = fw.length;
  const INS = -0.5;
  const DEL = -1;
  const pair = (j, k) => {
    const a = fk[j];
    const b = ok[k];
    if (a && a === b) return { s: 2, kind: 'same' };
    if (a && b && likeness(a, b) >= 0.5) return { s: 1, kind: 'alike' };
    if ((isNumberKey(a) && isNumberKey(b)) || (nameLike(fw[j]) && nameLike(ow[k], k === 0))) return { s: 0.5, kind: 'kind' };
    let s = SMALL.has(b) || VERBS.has(b) ? -1.5 : -0.6;
    let placed = false;
    if (j > 0 && k > 0 && fk[j - 1] && fk[j - 1] === ok[k - 1] && SMALL.has(ok[k - 1])) {
      s += 0.5;
      placed = true;
    }
    if (j + 1 < m && k + 1 < n && fk[j + 1] && fk[j + 1] === ok[k + 1]) {
      s += 0.5;
      placed = true;
    }
    return { s, kind: placed ? 'placed' : 'unlike' };
  };
  // d[j][k]: the best score with fix[0..j) laid over the sentence up to word k (any start).
  const d = [new Array(n + 1).fill(0)];
  const how = [new Array(n + 1).fill('')];
  for (let j = 1; j <= m; j++) {
    d.push(new Array(n + 1).fill(-Infinity));
    how.push(new Array(n + 1).fill(''));
    for (let k = 0; k <= n; k++) {
      let best = -Infinity;
      let by = '';
      if (k > 0) {
        best = d[j - 1][k - 1] + pair(j - 1, k - 1).s;
        by = 'pair';
      }
      if (d[j - 1][k] + INS > best + 1e-9) {
        best = d[j - 1][k] + INS;
        by = 'put';
      }
      if (k > 0 && d[j][k - 1] + DEL > best + 1e-9) {
        best = d[j][k - 1] + DEL;
        by = 'drop';
      }
      d[j][k] = best;
      how[j][k] = by;
    }
  }
  let end = 0;
  for (let k = 1; k <= n; k++) if (d[m][k] >= d[m][end] - 1e-9) end = k; // the later on a tie
  const top = d[m][end];
  const ties = d[m].filter((v) => Math.abs(v - top) < 1e-9).length;
  // Walk back: what each word of the fix did.
  const ops = [];
  let j = m;
  let k = end;
  while (j > 0) {
    const by = how[j][k];
    if (by === 'pair') {
      ops.push({ by, j: j - 1, k: k - 1, kind: pair(j - 1, k - 1).kind });
      j -= 1;
      k -= 1;
    } else if (by === 'put') {
      ops.push({ by, j: j - 1 });
      j -= 1;
    } else {
      ops.push({ by: 'drop', k: k - 1 });
      k -= 1;
    }
  }
  const start = k;
  const pairs = ops.filter((o) => o.by === 'pair');
  if (!pairs.some((o) => o.kind === 'same')) return null;
  const kindOf = (x) => (pairs.find((o) => o.j === x) || {}).kind;
  const putOk = ops.filter((o) => o.by === 'put').every((o) => [o.j - 1, o.j + 1].some((x) => x >= 0 && x < m && kindOf(x) === 'same' && !SMALL.has(fk[x])));
  const sure = ties === 1 && putOk && !ops.some((o) => o.by === 'drop') && !pairs.some((o) => o.kind === 'unlike');
  return { text: spliceWords(ow, start, end, fw), sure };
}

/** `ow` with words [start, end) replaced by `fw` (the replaced last word's end punctuation kept). */
function spliceWords(ow, start, end, fw) {
  const put = fw.slice();
  if (put.length) {
    const lastFix = put[put.length - 1].replace(/[.!?,;:]+$/, '');
    const tail = end > start ? (/[.!?,;:]+$/.exec(ow[end - 1] || '') || [''])[0] : '';
    put[put.length - 1] = lastFix + tail;
  }
  return [...ow.slice(0, start), ...put.filter(Boolean), ...ow.slice(end)].join(' ');
}

/**
 * How the correction `said` changes `heard`: { text, sure }. sure: false when Jarvis is guessing; the
 * 2-second check then waits for the owner to confirm ("yes", Send) or tap the words to fix them.
 *   - A fix the sentence already holds changes nothing.
 *   - A restatement replaces it all: as long as the sentence, or four words or more and most of it
 *     with no word but small ones in common (sure only when it is as long as the sentence).
 *   - A fix that shares words with the sentence is laid over the stretch it lines up with (alignFix):
 *     "oat milk" -> "buy oat milk", "for four" -> "for four at seven", "Nice, France".
 *   - A number for a number: the one number in the sentence; with several, a guess (the one that
 *     sounds most like it, else the last).
 *   - Otherwise the word or words that sound most like it ("Boston" for "Austin"; sure unless two do).
 *   - Nothing sounds close: a guess for a fix of up to three words (a name for a name, a number for a
 *     number, else the word that sounds most like it, the later the likelier; never a small word);
 *     a longer one changes nothing. Never the whole sentence for a short fix.
 */
export function planCorrection(heard, said) {
  const fix = clean(said);
  const orig = clean(heard);
  if (!fix) return { text: orig, sure: true };
  if (!orig) return { text: fix, sure: true };
  const ow = orig.split(' ');
  const fw = fix.split(' ');
  const ok = ow.map(keyOf);
  const fk = fw.map(keyOf);
  const owords = ok.filter(Boolean);
  const fwords = fk.filter(Boolean);
  if (!fwords.length) return { text: orig, sure: true };
  // It already says that.
  const line = ` ${owords.join(' ')} `;
  if (line.includes(` ${fwords.join(' ')} `)) return { text: orig, sure: true };
  const shared = fk.map((w) => !!w && ok.includes(w));
  const sharesContent = fk.some((w, i) => shared[i] && !SMALL.has(w));
  if (fwords.length >= owords.length || (fwords.length >= 4 && fwords.length >= Math.ceil(owords.length * 0.6) && !sharesContent)) {
    return { text: fix, sure: fwords.length >= owords.length };
  }
  if (shared.some(Boolean)) {
    const laid = alignFix(ow, ok, fw, fk);
    if (laid) return laid;
  }
  const keepTail = (i, n) => spliceWords(ow, i, i + n, [fw.join(' ')]);
  if (fwords.every(isNumberKey)) {
    const runs = numberRuns(ok);
    if (runs.length === 1) return { text: keepTail(runs[0].start, runs[0].end - runs[0].start), sure: true };
    if (runs.length > 1) {
      let best = runs[runs.length - 1];
      let bestScore = -1;
      for (const r of runs) {
        const score = likeness(ow.slice(r.start, r.end).join(' '), fix);
        if (score >= bestScore - 1e-9 && score > 0) {
          best = r;
          bestScore = score;
        }
      }
      return { text: keepTail(best.start, best.end - best.start), sure: false };
    }
  }
  if (fwords.length > 3) return { text: orig, sure: false }; // a long fix with nothing in common: the owner fixes it
  // The word or words that sound most like it (two or three words: only when they sound much alike).
  const spans = [];
  for (let n = Math.max(1, fw.length - 1); n <= fw.length + 1; n++) {
    for (let i = 0; i + n <= ow.length; i++) spans.push({ i, n, score: likeness(ow.slice(i, i + n).join(' '), fix) });
  }
  spans.sort((a, b) => b.score - a.score || (b.n === fw.length) - (a.n === fw.length) || b.i - a.i);
  const top = spans[0];
  if (top && top.score >= 0.5) {
    const rival = spans.some((s) => s !== top && Math.abs(s.score - top.score) < 1e-9 && (s.i + s.n <= top.i || top.i + top.n <= s.i));
    return { text: keepTail(top.i, top.n), sure: !rival && (fwords.length === 1 || top.score >= 0.7) };
  }
  // Nothing sounds close: a guess, for the owner to confirm.
  {
    const fixNumber = fwords.every(isNumberKey);
    const fixName = nameLike(fw[0]);
    let guess = null;
    ow.forEach((token, i) => {
      const w = ok[i];
      if (!w || SMALL.has(w) || VERBS.has(w)) return;
      let score = likeness(token, fix) + i * 1e-3;
      if ((fixNumber && isNumberKey(w)) || (fixName && nameLike(token, i === 0))) score += 1;
      if (!guess || score > guess.score) guess = { i, score };
    });
    if (guess) return { text: keepTail(guess.i, 1), sure: false };
  }
  return { text: orig, sure: false };
}

/** `heard` with the correction `said` applied (planCorrection's text, sure or not). */
export function applyCorrection(heard, said) {
  return planCorrection(heard, said).text;
}

/** True when `text` names `name` (whole words, any case). */
function names(text, name) {
  const t = ` ${words(text).join(' ')} `;
  const n = words(name).join(' ');
  return !!n && t.includes(` ${n} `);
}

function partList(partNames) {
  return (Array.isArray(partNames) ? partNames : []).map(clean).filter((n) => n.length >= 2);
}

/** True when `text` names one of `partNames` (the open hologram's parts and their other names). */
export function namesPart(text, partNames = []) {
  return partList(partNames).some((n) => names(text, n));
}

/**
 * The reading of what was heard to use: the best one, unless it names none of `partNames` (the
 * open hologram's parts and their other names) while an alternative does.
 */
export function pickHeard(text, alternatives = [], partNames = []) {
  const best = clean(text);
  const list = partList(partNames);
  if (!list.length || !Array.isArray(alternatives) || !alternatives.length) return best;
  const hit = (t) => list.some((n) => names(t, n));
  if (hit(best)) return best;
  for (const alt of alternatives) if (typeof alt === 'string' && clean(alt) && hit(alt)) return clean(alt);
  return best;
}

/**
 * The reading to act on when only local commands matter (the chat's mic): the best one when it is
 * a command (`isCommand`: Screens) or a music command (`isMusic`: Apple Music); else the first other
 * reading that is a command; else, as the last resort, the first other reading that is a music
 * command, so an alternative is taken for Apple Music only when the best reading is nothing else.
 */
export function commandReading(text, alternatives = [], { isCommand = () => false, isMusic = () => false } = {}) {
  const best = clean(text);
  const alts = (Array.isArray(alternatives) ? alternatives : []).filter((a) => typeof a === 'string').map(clean).filter(Boolean);
  const test = (fn, t) => {
    try {
      return !!fn(t);
    } catch {
      return false;
    }
  };
  if (!alts.length || test(isCommand, best) || test(isMusic, best)) return best;
  return alts.find((a) => test(isCommand, a)) || alts.find((a) => test(isMusic, a)) || best;
}

// The words Jarvis listens for (Chrome's contextual biasing): its name and the local commands. v8.1
// adds the words of the hands-free release (Optics, Chrome, windows, the live view, walkthroughs and
// Chrome's questions). Chrome only uses such a list with on-device recognition, which Jarvis doesn't
// ask for, and stt.js drops it when the speech service says 'phrases-not-supported': today it changes
// nothing, and it is ready for the day it does.
export const COMMAND_PHRASES = Object.freeze([
  'expand it', 'explode it', 'put it back together', 'collapse', 'isolate', 'show the', 'hide the', 'zoom in', 'zoom out', 'rotate',
  'stop rotating', 'labels on', 'labels off', 'front view', 'side view', 'top view', 'reset the view', 'parts list', 'photos of',
  'blueprint', 'close the blueprint', 'switch it to 2D', 'other screen', 'second screen', 'float it', 'bring it back', 'in a window',
  'what am I looking at', 'look at this', 'flip the camera', 'watch this', 'hologram of this',
  'Optics', 'Chrome', 'side by side', 'live view', 'video mode', 'new chat', 'walk me through', 'enclosed', 'opened', 'approve',
  'cancel', 'never mind', 'no, I said',
  'Apple Music', 'stop the music', 'play the album', 'a preview of',
]);

/** Phrases for contextual biasing: "Jarvis" first, the open hologram's part names, then the command words. */
export function listenPhrases({ partNames = [] } = {}) {
  const out = [{ phrase: 'Jarvis', boost: 2.5 }];
  const seen = new Set(['jarvis']);
  for (const n of Array.isArray(partNames) ? partNames : []) {
    const name = clean(n).slice(0, 60);
    const key = name.toLowerCase();
    if (name.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push({ phrase: name, boost: 2 });
    if (out.length >= 41) break;
  }
  for (const p of COMMAND_PHRASES) {
    if (seen.has(p.toLowerCase())) continue;
    out.push({ phrase: p, boost: 1.2 });
  }
  return out.slice(0, 80);
}
