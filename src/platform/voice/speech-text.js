// The speech engines' shared text handling (pure, no DOM): whitespace normalisation, complete
// sentences and chunks for a stream of appended text.
//
// Moved out of tts.js unchanged (v7), so the device voice (tts.js) and the natural voice
// (natural/natural-stream.js) cut text exactly the same way, and the stream offsets
// (onChunk/onBoundary/spokenUpTo, offsets into text()) mean the same thing in both. Covered by
// platform.voice.speechtext.test.mjs and platform.voice.stream.test.mjs (through tts.js).
//
//   newText()                    a fresh text state { norm, spans, finished, ... }
//   ingest(tx, str)              append raw text (whitespace runs become single spaces; a line
//                                break is remembered as a break)
//   segment(tx, limit)           move complete sentences / lines into tx.spans
//   takeChunk(tx, limit)         the next chunk { start, end } (offsets into tx.norm) or null
//   firstCut(t, s, b, limit)     where to cut a sentence that is longer than `limit`
//   takeFirstClause(tx, opts)    v7.8: a short first chunk for a voice made far away (the home base):
//                                cut at the first clause or sentence end 40-60 characters in

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

const CLAUSE_END_RE = /[,;:](?=\s)|\s[—–](?=\s)/g;
const ENDS_SENTENCE_RE = /[.!?…]+["'”’)\]]*$/;
const ENDS_CLAUSE_RE = /(?:[,;:]|\s[—–])$/;

/**
 * v7.8 (SPEC §26): the first chunk of a reply spoken by a voice that is made far away and slower than
 * the device's (George from the home base): short, so its audio comes back quickly, and cut where a
 * speaker pauses anyway. From the queued spans (complete sentences or lines, never across a line break):
 *   1. the first clause or sentence end at `min`..`max` characters (40-60);
 *   2. else the last sentence end before `min` (a short sentence such as "Certainly, Frank.");
 *   3. else the last clause end at `floor`..`min` ("Good evening, Frank,");
 *   4. else the last space within `max`, else a hard cut at `max` (never inside a surrogate pair).
 * The spans it covers are taken; the rest of a span it cuts stays queued. Returns { start, end } or null.
 */
function takeFirstClause(tx, { min = 40, max = 60, floor = 16 } = {}) {
  const q = tx.spans;
  if (!q.length) return null;
  const t = tx.norm;
  const start = q[0].start;
  const cands = []; // { at, kind: 'sentence' | 'clause' | 'piece', span }
  for (let i = 0; i < q.length; i++) {
    const sp = q[i];
    if (sp.start - start > max) break;
    const seg = t.slice(sp.start, sp.end);
    CLAUSE_END_RE.lastIndex = 0;
    let m;
    while ((m = CLAUSE_END_RE.exec(seg))) {
      const at = sp.start + m.index + m[0].length;
      if (at - start > max) break;
      if (at < sp.end) cands.push({ at, kind: 'clause', span: i });
    }
    if (sp.end - start <= max) {
      const kind = sp.breakAfter || ENDS_SENTENCE_RE.test(seg) ? 'sentence' : ENDS_CLAUSE_RE.test(seg) ? 'clause' : 'piece';
      cands.push({ at: sp.end, kind, span: i });
    }
    if (sp.breakAfter) break;
  }
  const len = (c) => c.at - start;
  let pick = cands.find((c) => c.kind !== 'piece' && len(c) >= min);
  if (!pick) pick = cands.filter((c) => c.kind === 'sentence' && len(c) < min).pop();
  if (!pick) pick = cands.filter((c) => c.kind === 'clause' && len(c) >= floor && len(c) < min).pop();
  if (!pick) pick = cands.filter((c) => c.kind === 'piece').pop();
  if (pick) return cutSpans(tx, pick.span, pick.at);
  // One long stretch without a pause: at the last space within `max`, else hard.
  const sp = q[0];
  const rest = t.slice(sp.start, sp.end);
  let cut = rest.lastIndexOf(' ', max);
  if (cut < floor) cut = Math.min(rest.length, max);
  const code = rest.charCodeAt(cut);
  if (code >= 0xdc00 && code <= 0xdfff) cut -= 1;
  return cutSpans(tx, 0, sp.start + cut);
}

/** Take spans 0..k-1 and span k up to `at`; what is left of span k stays first in the queue. */
function cutSpans(tx, k, at) {
  const q = tx.spans;
  const t = tx.norm;
  const start = q[0].start;
  const sp = q[k];
  let end = at;
  while (end > start && t.charCodeAt(end - 1) === 32) end -= 1;
  let next = at;
  while (next < sp.end && t.charCodeAt(next) === 32) next += 1;
  if (next >= sp.end) q.splice(0, k + 1);
  else q.splice(0, k + 1, { start: next, end: sp.end, breakAfter: sp.breakAfter });
  return { start, end };
}

export { SENTENCE_END_RE, newText, ingest, segment, takeChunk, splitFirst, firstCut, takeFirstClause };
