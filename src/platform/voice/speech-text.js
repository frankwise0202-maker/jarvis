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

export { SENTENCE_END_RE, newText, ingest, segment, takeChunk, splitFirst, firstCut };
