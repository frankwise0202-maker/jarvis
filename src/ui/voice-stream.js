// Voice Mode's streamed speech (SPEC §14.1, §16): which parts of a reply are read aloud, and when.
// Pure functions with no DOM, so they run in plain Node (test/unit/voice.stream.test.mjs).
//
//   spokenSource(segments)    the reply's text segments, in order, joined with blank lines (what
//                             the chat shows)
//   textClosed(segments)      true once the last text segment is followed by a search, a mission,
//                             a memory change or thinking: that text is complete
//   cutAtBreak(md, final)     { text, cut }: the Markdown above the first thematic break (---, ***
//                             or ___ alone on a line, outside code fences). Text below it is for
//                             the screen and is never spoken.
//   splitSentences(text)      sentence ranges [{ start, end }] that tile the text
//   createSpokenFeed(options) decides which complete sentences to speak next, never one twice
//   SPOKEN_CAP, SPOKEN_CLOSING
//
// The feed is given the whole turn on every change (a streamed delta, a segment removed before a
// retry, the end of the turn). It cuts the text at the first thematic break, converts it to speech
// text (Markdown for the ear) and returns the complete sentences that come after the ones it has
// already handed out, each with its separator (" ", or "\n\n" at the end of a paragraph or list
// item). The unfinished last sentence waits for more text, or for the end of the turn. It tracks
// what it handed out by its text and by its sentence count: while the text only grows it continues
// right after what was said; if an earlier part changes (Markdown read differently once more text
// arrives, or a segment removed by a retry), what was said stays said and it continues after the
// same number of sentences of the new text. Past about SPOKEN_CAP characters it stops and closes
// with SPOKEN_CLOSING ("The rest is on screen."), only when something was left out.

/** About this many characters of a reply are read aloud in Voice Mode. */
export const SPOKEN_CAP = 1500;
/** Said after the last sentence when the cap left part of the spoken reply out. */
export const SPOKEN_CLOSING = 'The rest is on screen.';

// Segments after which the text before them is finished (the model moved on to something else).
// A notice or an error is not one: a retry may still remove and replace that text.
const CLOSERS = new Set(['tool', 'mission', 'memory', 'thinking']);

const isText = (s) => !!s && s.kind === 'text' && typeof s.text === 'string' && s.text.trim() !== '';

/** The turn's text segments, in order, joined with blank lines (each one is a block in the chat). */
export function spokenSource(segments) {
  const out = [];
  for (const s of Array.isArray(segments) ? segments : []) if (isText(s)) out.push(s.text);
  return out.join('\n\n');
}

/** True when the last text segment is followed by a search, a mission, a memory change or thinking. */
export function textClosed(segments) {
  const list = Array.isArray(segments) ? segments : [];
  let last = -1;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (isText(list[i])) {
      last = i;
      break;
    }
  }
  if (last < 0) return false;
  for (let i = last + 1; i < list.length; i += 1) if (list[i] && CLOSERS.has(list[i].kind)) return true;
  return false;
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const BREAK_RE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

/**
 * The Markdown above the first thematic-break line: `---`, `***` or `___` (three or more, spaces
 * allowed between them, up to three spaces of indentation) alone on a line, outside fenced code.
 * Only complete lines count: the last line is complete when a line break follows it, or when
 * `final` (no more text will come). Returns { text, cut }.
 */
export function cutAtBreak(md, final = false) {
  const src = String(md ?? '');
  let fence = null; // { ch, len } while inside a fenced code block
  let pos = 0;
  while (pos < src.length) {
    const nl = src.indexOf('\n', pos);
    if (nl < 0 && !final) break; // still being written
    const end = nl < 0 ? src.length : nl;
    const line = src.slice(pos, end).replace(/\r$/, '');
    const f = FENCE_RE.exec(line);
    if (fence) {
      if (f && f[1][0] === fence.ch && f[1].length >= fence.len && !line.slice(f[0].length).trim()) fence = null;
    } else if (f) {
      // A backtick fence's info string can't contain a backtick (``` `x` ``` is inline code).
      if (f[1][0] === '~' || !line.slice(f[0].length).includes('`')) fence = { ch: f[1][0], len: f[1].length };
    } else if (BREAK_RE.test(line)) {
      return { text: src.slice(0, pos), cut: true };
    }
    pos = end + 1;
  }
  return { text: src, cut: false };
}

// A trailing period after these is not the end of a sentence.
const ABBREVIATION = /(?:^|[\s(“"'])(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|corp|approx|no|fig|e\.g|i\.e|a\.m|p\.m|u\.s|u\.k|[a-z])\.$/i;

/**
 * Split plain text into sentence ranges [{ start, end }] that tile the whole string (trailing
 * spaces and line breaks stay with their sentence). A line break always ends a sentence.
 * Decimals, domains and common abbreviations do not.
 */
export function splitSentences(text) {
  const s = String(text ?? '');
  const out = [];
  let start = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    let end = -1;
    if (c === '\n') {
      end = i + 1;
    } else if (c === '.' || c === '!' || c === '?' || c === '…') {
      let j = i + 1;
      while (j < s.length && /[.!?…"'”’)\]]/.test(s[j])) j += 1;
      if (j < s.length && !/\s/.test(s[j])) continue; // "3.5", "example.com"
      if (c === '.' && ABBREVIATION.test(s.slice(Math.max(start, i - 8), i + 1))) continue;
      end = j;
    }
    if (end < 0) continue;
    while (end < s.length && /\s/.test(s[end])) end += 1;
    if (s.slice(start, end).trim()) {
      out.push({ start, end });
      start = end;
    }
    i = end - 1;
  }
  if (start < s.length) {
    if (s.slice(start).trim() || !out.length) out.push({ start, end: s.length });
    else out[out.length - 1].end = s.length;
  }
  return out;
}

/** Single spaces inside a line, single line breaks between lines, nothing at either end. */
function tidy(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n\s*/g, '\n')
    .trim();
}

/**
 * Which sentences of a streaming reply to speak next.
 *
 *   const feed = createSpokenFeed({ convert: (md) => markdownToPlainText(md, { speech: true }) });
 *   const { pieces, finish } = feed.update({ segments: turn.segments, done: false });
 *   // stream.append(piece) for each piece; stream.finish() when finish is true
 *
 * options:
 *   convert(markdown) -> plain speech text (default: the text as it is)
 *   cap       about this many characters are spoken (default SPOKEN_CAP); the first sentence always is
 *   closing   said when the cap left something out (default SPOKEN_CLOSING; '' for nothing)
 * update({ segments, done }) -> { pieces: string[], finish: boolean }
 *   segments  the turn's segments (live; read, never changed)
 *   done      the turn has ended: every sentence is complete
 *   pieces    complete sentences not handed out before, each ending with " " or "\n\n"
 *   finish    nothing more will ever be spoken (the cut was reached, the cap, or the end of the turn)
 * skip(segments)   treat what is complete now as already said (Voice Mode opened mid-reply)
 * state() -> { spoken, said, chars, count, cut, capped, finished }
 *   spoken    everything handed out, joined (the caption text); said: the same with single spaces
 */
export function createSpokenFeed(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const convert = typeof opts.convert === 'function' ? opts.convert : (md) => md;
  const cap = Number.isFinite(opts.cap) && opts.cap > 0 ? opts.cap : SPOKEN_CAP;
  const closing = typeof opts.closing === 'string' ? opts.closing.trim() : SPOKEN_CLOSING;
  const st = { spoken: '', said: '', chars: 0, count: 0, cut: false, capped: false, finished: false };
  let lastKey = null;

  function read(segments, done) {
    const closed = !!done || textClosed(segments);
    const { text, cut } = cutAtBreak(spokenSource(segments), closed);
    let speech = '';
    if (text.trim()) {
      try {
        speech = tidy(convert(text));
      } catch {
        speech = '';
      }
    }
    const ranges = splitSentences(speech).filter((r) => speech.slice(r.start, r.end).trim());
    return { speech, flat: speech.replace(/\n/g, ' '), ranges, final: closed || cut, cut };
  }

  /** The first range not yet handed out. */
  function resume(flat, ranges) {
    if (!st.said) return st.count;
    // Streaming as usual: what was said is still the start of the text; continue right after it.
    if (flat.startsWith(st.said) && (flat.length === st.said.length || flat[st.said.length] === ' ')) {
      const k = ranges.findIndex((r) => r.start > st.said.length);
      return k < 0 ? ranges.length : k;
    }
    // An earlier part changed: what was said stays said; continue after as many sentences.
    return st.count;
  }

  function update({ segments, done = false } = {}) {
    if (st.finished) return { pieces: [], finish: false };
    const r = read(segments, done);
    // Thinking deltas and other events that leave the spoken text as it was: nothing to do.
    const key = `${r.final ? 1 : 0}|${r.speech}`;
    if (key === lastKey && !done) return { pieces: [], finish: false };
    lastKey = key;
    const { flat, ranges, final } = r;
    const usable = final ? ranges.length : Math.max(0, ranges.length - 1);
    const from = resume(flat, ranges);
    const pieces = [];
    let next = from;
    for (let k = from; k < usable; k += 1) {
      const range = ranges[k];
      const raw = r.speech.slice(range.start, range.end);
      const body = raw.trim();
      if (st.chars > 0 && st.chars + body.length > cap) {
        st.capped = true;
        break;
      }
      // A line break ends a paragraph or list item: a pause, and a new line in the captions.
      const endsBlock = raw.includes('\n') || (final && k === ranges.length - 1);
      const piece = body + (endsBlock ? '\n\n' : ' ');
      pieces.push(piece);
      st.spoken += piece;
      st.chars += body.length + 1;
      next = k + 1;
    }
    if (next > from) {
      st.count = next;
      st.said = flat.slice(0, ranges[next - 1].end).trim();
    }
    if (r.cut) st.cut = true;
    if (st.capped) {
      if (closing) {
        pieces.push(closing);
        st.spoken += closing;
      }
      st.finished = true;
    } else if ((r.cut || done) && Math.max(next, st.count) >= ranges.length) {
      st.finished = true;
    }
    return { pieces, finish: st.finished };
  }

  function skip(segments) {
    if (st.finished) return;
    const r = read(segments, false);
    const usable = r.final ? r.ranges.length : Math.max(0, r.ranges.length - 1);
    if (r.cut) st.cut = true;
    if (!usable) return;
    st.count = usable;
    st.said = r.flat.slice(0, r.ranges[usable - 1].end).trim();
    if (r.cut && usable >= r.ranges.length) st.finished = true;
  }

  function state() {
    return { spoken: st.spoken, said: st.said, chars: st.chars, count: st.count, cut: st.cut, capped: st.capped, finished: st.finished };
  }

  return { update, skip, state };
}
