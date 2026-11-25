// Text helpers for the senses. Pure, no dependencies.
//
//   splitSentences(text, { maxChars })  → ['Good morning, Frank.', 'It is 41 degrees.', …]
//   cleanPrompt(value)                  → up to 200 characters of context words for Whisper, or ''
//   cleanSpeech(value)                  → the text to speak: one paragraph, control characters removed

// Control and invisible formatting characters (bidi overrides, zero-width, line separators).
// eslint-disable-next-line no-control-regex
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2066-\\u2069\\ufeff]', 'g');

export const PROMPT_MAX = 200;
export const SPEAK_MAX = 1000;
/** Kokoro reads at most ~510 phonemes at once; a sentence longer than this is split at commas, then words. */
export const CHUNK_MAX = 280;

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'inc', 'ltd', 'co', 'no', 'approx', 'e.g', 'i.e', 'a.m', 'p.m']);

export function cleanSpeech(value) {
  if (typeof value !== 'string') return '';
  return value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanPrompt(value) {
  if (typeof value !== 'string') return '';
  const s = value.replace(CONTROL, ' ').replace(/[<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length <= PROMPT_MAX ? s : s.slice(0, PROMPT_MAX).replace(/\s+\S*$/, '').trim();
}

/** Split a long piece at the last comma/semicolon/dash before maxChars, else at the last space. */
function splitLong(piece, maxChars) {
  const out = [];
  let rest = piece.trim();
  while (rest.length > maxChars) {
    const head = rest.slice(0, maxChars);
    let cut = Math.max(head.lastIndexOf(', '), head.lastIndexOf('; '), head.lastIndexOf(': '), head.lastIndexOf(' - '), head.lastIndexOf(' — '));
    if (cut < maxChars * 0.4) cut = head.lastIndexOf(' ');
    if (cut <= 0) cut = maxChars - 1; // one enormous word: cut it
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

/**
 * Sentences in order, none longer than maxChars. Ends at . ! ? … (with closing quotes or brackets), not after
 * common abbreviations ("Dr. Smith"), initials ("J. R. R."), or a decimal point ("4.30").
 */
export function splitSentences(text, { maxChars = CHUNK_MAX } = {}) {
  const s = cleanSpeech(text);
  if (!s) return [];
  const sentences = [];
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue;
    let end = i;
    while (end + 1 < s.length && '.!?…'.includes(s[end + 1])) end++;
    while (end + 1 < s.length && '"\')]}”’»'.includes(s[end + 1])) end++;
    const next = s[end + 1];
    if (next !== undefined && next !== ' ') continue; // "4.30", "e.g.x", "example.com"
    if (ch === '.') {
      const word = s.slice(start, i).split(' ').pop().toLowerCase().replace(/^[("'“‘«]+/, '');
      if (ABBREVIATIONS.has(word) || /^[a-z]$/.test(word)) continue; // "Dr." or an initial "J."
    }
    const sentence = s.slice(start, end + 1).trim();
    if (sentence) sentences.push(sentence);
    start = end + 1;
    i = end;
  }
  const tail = s.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences.flatMap((x) => (x.length > maxChars ? splitLong(x, maxChars) : [x])).filter((x) => /[\p{L}\p{N}]/u.test(x));
}
