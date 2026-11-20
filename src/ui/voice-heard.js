// What Jarvis heard (v7.2): the "Show, then send" check and the words to listen for. Pure (no DOM).
//
//   REVIEW_MS                       how long what was heard is shown before it is sent (2 s)
//   reviewReply(text, heard)        words said while it is shown -> { kind, text? }:
//                                     'cancel'  "cancel", "never mind", "forget it", "scratch that"
//                                     'correct' "no, I said …", "I said …", "I meant …", or the
//                                               sentence said again (text: what replaces it)
//                                     'send'    "send it", "yes", "go ahead", "that's right"
//                                     'wait'    "wait", "hold on", "no" (the countdown stops)
//                                     'filler'  only "um", "uh", "hmm" (nothing changes)
//                                     'more'    anything else: the sentence goes on (text: appended)
//   applyCorrection(heard, said)    the sentence with the correction applied: a restatement replaces
//                                   it; a short fix ("no, I said Boston") replaces the word or words
//                                   that sound most like it ("Austin"), or the one number for a number;
//                                   a fix it already says changes nothing
//   pickHeard(text, alternatives, partNames)  the reading to use: an alternative that names a part of
//                                   the open hologram when the best reading names none
//   listenPhrases({ partNames })    phrases for Chrome's contextual biasing: "Jarvis", the hologram's
//                                   part names and the command words

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
const SEND = /^(?:yes|yeah|yep|yup|send|send\s+it|send\s+that|send\s+now|send\s+it\s+now|go|go\s+ahead|that'?s\s+(?:right|correct|it)|correct|perfect|do\s+it|yes\s+send\s+it)$/;
const WAIT = /^(?:wait|wait\s+a\s+(?:sec|second|moment)|hold\s+on|hang\s+on|one\s+(?:sec|second|moment)|just\s+a\s+(?:sec|second|moment)|no|nope|not\s+quite|wrong|that'?s\s+(?:wrong|not\s+(?:it|right)))$/;
const FILLERS = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'mm', 'mmm', 'ah', 'oh', 'ok', 'okay']);
// "no, I said …", "I said …", "I meant …", "no, I mean …" (original wording kept for the new text)
const CORRECTION = /^\s*(?:(?:hey\s+)?jarvis[\s,.!]+)?(?:(?:(?:no|nope|not\s+quite|wrong|sorry|oh)[\s,.!]+)?(?:i\s+said|i\s+meant|what\s+i\s+said\s+was|i\s+was\s+saying)|(?:no|nope)[\s,.!]+i\s+mean)[\s,:]+(.+?)\s*$/i;

/**
 * Words said while what was heard is shown for 2 seconds. `heard` is the sentence being shown (a
 * restatement that starts like it replaces it).
 */
export function reviewReply(text, heard = '') {
  const said = clean(text);
  const c = core(said);
  if (!c) return { kind: 'filler' };
  if (CANCEL.test(c)) return { kind: 'cancel' };
  const m = CORRECTION.exec(said);
  if (m && clean(m[1]) && words(m[1]).length) return { kind: 'correct', text: clean(m[1]).replace(/^["“”']+|["“”']+$/g, '') };
  if (SEND.test(c)) return { kind: 'send' };
  if (WAIT.test(c)) return { kind: 'wait' };
  const w = c.split(' ');
  if (w.every((x) => FILLERS.has(x))) return { kind: 'filler' };
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

/**
 * `heard` with the correction `said` applied. A restatement (four or more words, or most of the
 * sentence) replaces it all. A short fix replaces the word or words that sound most like it ("no,
 * I said Boston" after "…weather in Austin"), or the one number in the sentence for a number; when
 * nothing sounds close, the fix replaces it all.
 */
export function applyCorrection(heard, said) {
  const fix = clean(said);
  const orig = clean(heard);
  if (!fix) return orig;
  if (!orig) return fix;
  const ow = orig.split(' ');
  const fw = fix.split(' ');
  if (fw.length >= 4 || fw.length >= Math.ceil(ow.length * 0.6)) return fix;
  const bare = fix.replace(/[.!?,;:]+$/, '');
  const keepTail = (i, n) => {
    const last = ow[i + n - 1] || '';
    const tail = (/[.!?,;:]+$/.exec(last) || [''])[0];
    return [...ow.slice(0, i), bare + tail, ...ow.slice(i + n)].join(' ');
  };
  if (fw.length === 1 && isNumber(fw[0])) {
    const nums = ow.map((t, i) => (isNumber(t) ? i : -1)).filter((i) => i >= 0);
    if (nums.length === 1) return keepTail(nums[0], 1);
  }
  let best = null;
  for (let n = Math.max(1, fw.length - 1); n <= fw.length + 1; n++) {
    for (let i = 0; i + n <= ow.length; i++) {
      const score = likeness(ow.slice(i, i + n).join(' '), fix);
      if (!best || score > best.score + 1e-9 || (Math.abs(score - best.score) < 1e-9 && n === fw.length && best.n !== fw.length)) best = { i, n, score };
    }
  }
  if (best && best.score >= 1) return orig; // it already says that
  if (best && best.score >= 0.5) return keepTail(best.i, best.n);
  return fix;
}

/** True when `text` names `name` (whole words, any case). */
function names(text, name) {
  const t = ` ${words(text).join(' ')} `;
  const n = words(name).join(' ');
  return !!n && t.includes(` ${n} `);
}

/**
 * The reading of what was heard to use: the best one, unless it names none of `partNames` (the
 * open hologram's parts and their other names) while an alternative does.
 */
export function pickHeard(text, alternatives = [], partNames = []) {
  const best = clean(text);
  const list = (Array.isArray(partNames) ? partNames : []).map(clean).filter((n) => n.length >= 2);
  if (!list.length || !Array.isArray(alternatives) || !alternatives.length) return best;
  const hit = (t) => list.some((n) => names(t, n));
  if (hit(best)) return best;
  for (const alt of alternatives) if (typeof alt === 'string' && clean(alt) && hit(alt)) return clean(alt);
  return best;
}

// The words Jarvis listens for (Chrome's contextual biasing): its name and the local commands.
export const COMMAND_PHRASES = Object.freeze([
  'expand it', 'explode it', 'put it back together', 'collapse', 'isolate', 'show the', 'hide the', 'zoom in', 'zoom out', 'rotate',
  'stop rotating', 'labels on', 'labels off', 'front view', 'side view', 'top view', 'reset the view', 'parts list', 'photos of',
  'blueprint', 'close the blueprint', 'switch it to 2D', 'other screen', 'second screen', 'float it', 'bring it back', 'in a window',
  'what am I looking at', 'look at this', 'flip the camera', 'watch this', 'hologram of this', 'cancel', 'never mind', 'no, I said',
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
