// Text normalisation for the status assistant: lower case, plain letters, expanded contractions and chat
// shorthand, and typo correction against the assistant's own vocabulary (so "temprature", "grpahics" and
// "memroy" still land). Pure functions.

const SHORTHAND = [
  [/\bwhat'?s\b/g, 'what is'],
  [/\bwats\b|\bwat'?s\b|\bwhats\b/g, 'what is'],
  [/\bwat\b/g, 'what'],
  [/\bhow'?s\b|\bhows\b/g, 'how is'],
  [/\bwho'?s\b/g, 'who is'],
  [/\bwhere'?s\b/g, 'where is'],
  [/\bthere'?s\b/g, 'there is'],
  [/\bthat'?s\b/g, 'that is'],
  [/\bit'?s\b/g, 'it is'],
  [/\byou'?re\b|\byour\s+(?=(ok|okay|good|alright|doing|fine|well|up)\b)/g, 'you are '],
  [/\bi'?m\b|\bim\b/g, 'i am'],
  [/\bisn'?t\b/g, 'is not'],
  [/\baren'?t\b/g, 'are not'],
  [/\bdon'?t\b/g, 'do not'],
  [/\bdoesn'?t\b/g, 'does not'],
  [/\bcan'?t\b|\bcannot\b/g, 'can not'],
  [/\bwon'?t\b/g, 'will not'],
  [/\bwhat'?re\b/g, 'what are'],
  [/\bhow'?re\b/g, 'how are'],
  [/\bya\b|\bu\b|\byou all\b|\by'?all\b/g, 'you'],
  [/\bur\b/g, 'your'],
  [/\br\b/g, 'are'],
  [/\bwhat'?s up\b|\bwhatsup\b|\bwassup\b|\bsup\b/g, 'what is up'],
  [/\bthx\b|\bthnx\b|\bthanx\b|\bthanks\b|\bthank u\b|\bty\b|\btyvm\b/g, 'thanks'],
  [/\bpls\b|\bplz\b|\bplease\b/g, 'please'],
  [/\bok+a*y*\b|\bk\b/g, 'ok'],
  [/\bgud\b/g, 'good'],
  [/\bcuz\b|\bcos\b/g, 'because'],
  [/\bgonna\b/g, 'going to'],
  [/\bhd\b/g, 'hard drive'],
  [/\bwi ?-?fi\b/g, 'wifi'],
  [/\bgpus?'?\b/g, 'gpu'],
  [/\bcpus?'?\b/g, 'cpu'],
  [/\btemps\b/g, 'temp'],
];

/** Lower case, plain ASCII letters and digits, expanded shorthand, single spaces. */
export function normalize(text) {
  let s = String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/°\s*c\b/g, ' degrees ');
  for (const [re, to] of SHORTHAND) s = s.replace(re, to);
  return s
    .replace(/'/g, '')
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Damerau-Levenshtein (optimal string alignment) distance, stopping early above `max`. */
export function editDistance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length;
  const n = b.length;
  let prev2 = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i += 1) {
    const cur = new Array(n + 1);
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[n];
}

/**
 * Correct each word that is not in `vocab` to the single closest vocabulary word: a swap of two letters for
 * four-letter words, one edit for 5-7 letters, two for longer ones. Shorter words and ties are left alone
 * (a wrong guess is worse than none).
 */
export function correctTypos(normalized, vocab) {
  const sorted = (x) => [...x].sort().join('');
  const words = normalized.split(' ');
  const out = words.map((w) => {
    if (w.length < 4 || vocab.has(w) || /\d/.test(w)) return w;
    // Four-letter words are too easy to confuse ("main" is one letter from "rain"): only swapped letters
    // are fixed there ("tmep" → "temp"). Longer words allow one edit, and two from eight letters up.
    const swapOnly = w.length === 4;
    const max = w.length >= 8 ? 2 : 1;
    let best = null;
    let bestD = max + 1;
    let tie = false;
    for (const v of vocab) {
      if (Math.abs(v.length - w.length) > max || v.length < 3) continue;
      if (swapOnly && (v.length !== 4 || sorted(v) !== sorted(w))) continue;
      const d = editDistance(w, v, max);
      if (d < bestD) {
        best = v;
        bestD = d;
        tie = false;
      } else if (d === bestD) tie = true;
    }
    return best && bestD <= max && !tie ? best : w;
  });
  return out.join(' ');
}
