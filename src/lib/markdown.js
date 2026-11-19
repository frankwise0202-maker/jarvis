// Safe, streaming-friendly Markdown -> DOM for model output (SPEC §2, §9.1).
//
// SECURITY BOUNDARY. The API key lives in localStorage, so any script injection here is
// key theft. Therefore:
//   - DOM construction only: createElement with fixed tag names, text nodes / textContent
//     for every piece of text, setAttribute with fixed attribute names and validated values.
//     No innerHTML, no HTML parsing, ever.
//   - Raw HTML in the Markdown renders as literal text (there is no HTML passthrough).
//   - Links: only absolute http:, https: and mailto: URLs, checked with the URL parser after
//     escapes/entities are decoded (so mixed case, whitespace, control characters and entity
//     tricks cannot sneak a javascript:/data:/vbscript: URL through). Anything else renders as
//     plain text. Links open with target="_blank" rel="noopener noreferrer".
//   - Images are rendered as links ("Image: alt"), never loaded.
//
// Supported syntax: ATX headings, paragraphs and line breaks, **bold**, *italic*, ~~strike~~,
// `code`, fenced and indented code blocks (with a Copy button), nested bullet / numbered /
// task lists, blockquotes, GFM tables with alignment, thematic breaks, autolinks
// (<https://…>, bare https://… and www.…), inline and reference links, images (as links),
// backslash escapes and common HTML entities.
//
// Streaming ({ streaming: true }), for text that is still arriving: an unclosed fence renders as
// a code block; unclosed emphasis or code spans at the end of the text render as if closed;
// dangling markers are hidden; a half-written link shows its text; a table shows as soon as its
// header row starts.
//
// Element classes (all prefixed md-), for stylesheets:
//   p.md-p · h3–h6.md-h + .md-h1…md-h6 (Markdown h1→<h3>, h2→<h4>, h3→<h5>, h4–h6→<h6>)
//   ul.md-list.md-ul / ol.md-list.md-ol (+ .md-tight or .md-loose, + .md-task-list) · li.md-li
//   li.md-task (+ .md-task-done) > input.md-task-box[type=checkbox][disabled]
//   blockquote.md-quote · hr.md-hr · strong.md-strong · em.md-em · del.md-del · code.md-code
//   a.md-link (+ .md-autolink for bare/angle URLs, + .md-image-link for images) ·
//   span.md-link-pending (streaming: a link whose URL has not fully arrived)
//   div.md-codeblock[data-lang][data-open] > div.md-code-head > span.md-code-lang +
//     button.md-copy[data-code][data-state="copied"|"error"]; then pre.md-pre > code.md-code-block
//   div.md-table-wrap > table.md-table > thead/tbody > tr > th/td (+ .md-align-left|center|right)
//
// The Copy button handles its own click (stopPropagation, so a delegated UI handler for
// button.md-copy never double-copies) and shows "Copied" for 1.6 s.
//
// Runs wherever `globalThis.document` exists (tested in real Chromium via Playwright).
// markdownToPlainText() needs no DOM.

const MAX_NESTING = 24; // container (blockquote / list) depth; deeper markers become text
const MAX_URL_LENGTH = 4096;
const COPY_RESET_MS = 1600;

// ---------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------

/**
 * Render Markdown to a DocumentFragment.
 * @param {string} md
 * @param {{ streaming?: boolean }} [options]
 * @returns {DocumentFragment}
 */
export function renderMarkdown(md, options) {
  const doc = globalThis.document;
  const frag = doc.createDocumentFragment();
  const src = normalizeSource(md);
  if (!src) return frag;
  const streaming = !!(options && options.streaming);
  try {
    const tree = parseDocument(src, streaming);
    renderBlocks(tree.blocks, frag, { doc, refs: tree.refs }, false);
  } catch (err) {
    // Last-resort safety net: never throw at the UI, never lose the text.
    reportOnce(err);
    while (frag.firstChild) frag.removeChild(frag.firstChild);
    const p = doc.createElement('p');
    p.className = 'md-p';
    p.textContent = src;
    frag.appendChild(p);
  }
  return frag;
}

/**
 * Markdown -> plain text (for copy and speech): syntax stripped, link text kept, link URLs
 * dropped, code fences' backticks dropped (code text kept). Lists keep "- " / "1. " markers
 * and nesting indentation; table cells are joined with " | ".
 *
 * Extension options (used by voice/tts.js):
 *   speech: true          -> text meant to be read aloud: no code blocks, URLs reduced to their
 *                            host name, no list markers or emoji, every block ends as a sentence
 *                            (one line per block); written for the ear: e.g./i.e./etc./vs./approx.,
 *                            &, %, °C/°F/°, number ranges (5–10 → "5 to 10"), ~, 20+, ×, 24/7 and
 *                            km/h in words; reference markers ([1], [source], [1](url)) and stray
 *                            Markdown (**, __, backticks) removed. Phone numbers, dates, times and
 *                            hyphenated words are left alone.
 *   firstParagraph: true  -> only the first paragraph (falls back to the first block with text).
 * @param {string} md
 * @param {{ speech?: boolean, firstParagraph?: boolean }} [options]
 * @returns {string}
 */
export function markdownToPlainText(md, options) {
  const src = normalizeSource(md);
  if (!src) return '';
  const speech = !!(options && options.speech);
  const first = !!(options && options.firstParagraph);
  try {
    const tree = parseDocument(src, false);
    const env = { refs: tree.refs };
    let out;
    if (first) {
      const para = tree.blocks.find((b) => b.type === 'paragraph' && b.text.trim());
      if (para) out = blockToText(para, env, speech, true);
      else {
        out = '';
        for (const b of tree.blocks) {
          out = blockToText(b, env, speech, true);
          if (out.trim()) break;
        }
      }
    } else {
      out = blocksToText(tree.blocks, env, speech, true);
    }
    return speech ? finishSpeech(out) : tidyPlain(out);
  } catch (err) {
    reportOnce(err);
    return src;
  }
}

// ---------------------------------------------------------------------------------------
// Source normalization
// ---------------------------------------------------------------------------------------

// Bidi embedding/override/isolate controls can visually reorder text (link-text spoofing);
// they are never needed in Markdown, so they are removed. (LRM/RLM marks are kept.)
const BIDI_CONTROL_RE = /[\u202A-\u202E\u2066-\u2069]/g;

function normalizeSource(md) {
  let s = typeof md === 'string' ? md : md === null || md === undefined ? '' : String(md);
  if (!s) return '';
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  if (s.indexOf('\r') !== -1) s = s.replace(/\r\n?/g, '\n');
  if (s.indexOf('\u0000') !== -1) s = s.replace(/\u0000/g, '\uFFFD');
  BIDI_CONTROL_RE.lastIndex = 0;
  if (BIDI_CONTROL_RE.test(s)) s = s.replace(BIDI_CONTROL_RE, '');
  return s;
}

let reported = false;
function reportOnce(err) {
  if (reported) return;
  reported = true;
  try {
    console.error('[jarvis] markdown renderer failed; showing plain text instead:', err);
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------------------
//
// Blocks:
//   { type: 'paragraph', text, tail? }       { type: 'heading', level, text, tail? }
//   { type: 'hr' }                           { type: 'code', lang, text, open }
//   { type: 'blockquote', children }         { type: 'list', ordered, start, loose, items: [{ children, task }] }
//   { type: 'table', align: [], head: [], rows: [[]], tail? }
// `blank` on a block = a blank line separated it from the previous sibling (list looseness).
// `tail` = streaming and this leaf block holds the (possibly unfinished) end of the text.

const BLANK_RE = /^[ \t]*$/;
const HR_RE = /^(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,})$/;
const ATX_RE = /^(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;
const ATX_CLOSE_RE = /(?:^|[ \t]+)#+$/;
const FENCE_RE = /^(`{3,}|~{3,})(.*)$/;
const BULLET_RE = /^([*+-])(?=[ \t]|$)/;
const ORDERED_RE = /^(\d{1,9})([.)])(?=[ \t]|$)/;
const TABLE_DELIM_RE = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const PARTIAL_DELIM_RE = /^[ \t]*\|[ \t:|-]*$/;
const REF_DEF_RE =
  /^\[((?:[^[\]\\]|\\.){1,999})\]:[ \t]*(<[^<>\n]*>|\S+)(?:[ \t]+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\((?:[^()\\]|\\.)*\)))?[ \t]*$/;
const LANG_RE = /^[A-Za-z0-9_+#.-]{1,32}$/;
const PARTIAL_FENCE_RE = /^ {0,3}(?:`{1,2}|~{1,2})$/;

function parseDocument(src, streaming) {
  const lines = src.split('\n');
  if (streaming && lines.length && PARTIAL_FENCE_RE.test(lines[lines.length - 1])) {
    lines.pop(); // a fence marker still being typed: hide it rather than flash backticks
  }
  const ctx = { refs: new Map(), streaming };
  const blocks = parseBlocks(lines, ctx, 0, true);
  // The last block is still "open" unless a blank line closed it.
  if (streaming && !/\n[ \t]*\n[ \t]*$/.test(src)) markTail(blocks);
  return { blocks, refs: ctx.refs };
}

function markTail(blocks) {
  let b = blocks[blocks.length - 1];
  while (b) {
    if (b.type === 'blockquote') {
      b = b.children[b.children.length - 1];
    } else if (b.type === 'list') {
      const item = b.items[b.items.length - 1];
      b = item && item.children[item.children.length - 1];
    } else {
      if (b.type === 'paragraph' || b.type === 'heading' || b.type === 'table') b.tail = true;
      return;
    }
  }
}

/** Columns of leading whitespace (tabs to 4-column stops) and the index of the first other char. */
function indentInfo(line) {
  let cols = 0;
  let i = 0;
  for (; i < line.length; i++) {
    const c = line.charCodeAt(i);
    if (c === 32) cols++;
    else if (c === 9) cols += 4 - (cols % 4);
    else break;
  }
  return { cols, idx: i };
}

/** Remove up to `n` columns of leading whitespace (a partly consumed tab becomes spaces). */
function stripCols(line, n) {
  let col = 0;
  let i = 0;
  while (i < line.length && col < n) {
    const c = line.charCodeAt(i);
    if (c === 32) {
      col++;
      i++;
    } else if (c === 9) {
      const w = 4 - (col % 4);
      if (col + w > n) return ' '.repeat(col + w - n) + line.slice(i + 1);
      col += w;
      i++;
    } else break;
  }
  return line.slice(i);
}

function isBlank(line) {
  return BLANK_RE.test(line);
}

function listMarker(rest) {
  let m = BULLET_RE.exec(rest);
  let ordered = false;
  let start = 1;
  let ch;
  if (m) ch = m[1];
  else {
    m = ORDERED_RE.exec(rest);
    if (!m) return null;
    ordered = true;
    start = parseInt(m[1], 10);
    ch = m[2];
  }
  const width = m[0].length;
  const after = rest.slice(width);
  const ind = indentInfo(after);
  const empty = ind.idx === after.length;
  let pad = ind.cols;
  if (empty || pad > 4) pad = 1; // 5+ spaces: the content is an indented code block
  return { ordered, start, ch, width, pad, empty, content: empty ? '' : stripCols(after, pad) };
}

function fenceOpen(line) {
  const ind = indentInfo(line);
  if (ind.cols > 3) return null;
  const rest = line.slice(ind.idx);
  const m = FENCE_RE.exec(rest);
  if (!m) return null;
  if (m[1][0] === '`' && m[2].indexOf('`') !== -1) return null; // backtick info strings can't hold backticks
  return { ch: m[1][0], len: m[1].length, indent: ind.cols, info: m[2] };
}

function isFenceClose(line, fence) {
  const ind = indentInfo(line);
  if (ind.cols > 3) return false;
  let k = ind.idx;
  while (k < line.length && line[k] === fence.ch) k++;
  return k - ind.idx >= fence.len && BLANK_RE.test(line.slice(k));
}

/** Track whether a run of container lines is inside a fenced code block. */
function fenceState(state, line) {
  if (state) return isFenceClose(line, state) ? null : state;
  return fenceOpen(line);
}

/** Would this line start a block that interrupts a paragraph? */
function interruptsParagraph(line) {
  const ind = indentInfo(line);
  if (ind.cols >= 4) return false;
  const rest = line.slice(ind.idx);
  const c = rest.charCodeAt(0);
  if (c === 96 || c === 126) return !!fenceOpen(line);
  if (c === 35) return ATX_RE.test(rest);
  if (c === 62) return true; // '>'
  if ((c === 42 || c === 45 || c === 95) && HR_RE.test(rest)) return true;
  const lm = listMarker(rest);
  return !!(lm && !lm.empty && (!lm.ordered || lm.start === 1));
}

/** A line that leaves a paragraph open (so the next line may be a lazy continuation). */
function isParagraphish(line) {
  if (line === undefined || isBlank(line)) return false;
  const ind = indentInfo(line);
  if (ind.cols >= 4) return false;
  const rest = line.slice(ind.idx);
  if (fenceOpen(line) || ATX_RE.test(rest) || HR_RE.test(rest)) return false;
  return true;
}

function parseBlocks(lines, ctx, depth, atEnd) {
  const out = [];
  const n = lines.length;
  let i = 0;
  let blankBefore = false;
  while (i < n) {
    const line = lines[i];
    const ind = indentInfo(line);
    if (ind.idx === line.length) {
      blankBefore = true;
      i++;
      continue;
    }
    let block = null;
    if (ind.cols >= 4) {
      // Indented code block.
      const body = [];
      let j = i;
      while (j < n) {
        const l = lines[j];
        if (isBlank(l) || indentInfo(l).cols >= 4) {
          body.push(stripCols(l, 4));
          j++;
        } else break;
      }
      while (body.length && isBlank(body[body.length - 1])) body.pop();
      block = { type: 'code', lang: '', text: body.join('\n'), open: false };
      i = j;
    } else {
      const rest = ind.idx ? line.slice(ind.idx) : line;
      const c = rest.charCodeAt(0);
      if (c === 96 || c === 126) {
        const fence = fenceOpen(line);
        if (fence) {
          const body = [];
          let j = i + 1;
          let closed = false;
          for (; j < n; j++) {
            if (isFenceClose(lines[j], fence)) {
              closed = true;
              j++;
              break;
            }
            body.push(stripCols(lines[j], fence.indent));
          }
          block = { type: 'code', lang: codeLang(fence.info), text: body.join('\n'), open: !closed };
          i = j;
        }
      }
      if (!block && c === 35) {
        const m = ATX_RE.exec(rest);
        if (m) {
          block = { type: 'heading', level: m[1].length, text: (m[2] || '').replace(ATX_CLOSE_RE, '').trim() };
          i++;
        }
      }
      if (!block && (c === 42 || c === 45 || c === 95) && HR_RE.test(rest)) {
        block = { type: 'hr' };
        i++;
      }
      if (!block && c === 62 && depth < MAX_NESTING) {
        const r = parseQuote(lines, i, ctx, depth, atEnd);
        block = r.block;
        i = r.next;
      }
      if (!block && depth < MAX_NESTING) {
        const lm = listMarker(rest);
        if (lm) {
          const r = parseList(lines, i, ctx, depth, atEnd);
          block = r.block;
          i = r.next;
        }
      }
      if (!block && c === 91) {
        const m = REF_DEF_RE.exec(rest);
        if (m) {
          const key = normLabel(m[1]);
          if (key && !ctx.refs.has(key)) {
            let dest = m[2];
            if (dest[0] === '<') dest = dest.slice(1, -1);
            ctx.refs.set(key, { dest: unescapeText(dest), title: m[3] ? unescapeText(m[3].slice(1, -1)) : '' });
          }
          i++;
          continue; // definitions produce no output
        }
      }
      if (!block) {
        const r = tableAt(lines, i, ctx, atEnd);
        if (r) {
          block = r.block;
          i = r.next;
        }
      }
    }
    if (!block) {
      // Paragraph: runs until a blank line or a block that can interrupt it.
      const parts = [line];
      let j = i + 1;
      for (; j < n; j++) {
        const l = lines[j];
        if (isBlank(l) || interruptsParagraph(l)) break;
        if (startsTableAt(lines, j, ctx, atEnd)) break;
        parts.push(l);
      }
      let text = '';
      for (let k = 0; k < parts.length; k++) text += (k ? '\n' : '') + parts[k].replace(/^[ \t]+/, '');
      block = { type: 'paragraph', text: text.replace(/[ \t]+$/, '') };
      i = j;
    }
    block.blank = blankBefore && out.length > 0;
    blankBefore = false;
    out.push(block);
  }
  return out;
}

function codeLang(info) {
  const word = unescapeText(info.trim().split(/[ \t]+/)[0] || '');
  return LANG_RE.test(word) ? word : '';
}

function parseQuote(lines, i, ctx, depth, atEnd) {
  const inner = [];
  const n = lines.length;
  let fence = null;
  let j = i;
  for (; j < n; j++) {
    const l = lines[j];
    const ind = indentInfo(l);
    if (ind.idx === l.length) break; // a blank line ends the quote
    if (ind.cols < 4 && l.charCodeAt(ind.idx) === 62) {
      const s = stripCols(l.slice(ind.idx + 1), 1);
      inner.push(s);
      fence = fenceState(fence, s);
      continue;
    }
    // Lazy continuation of a paragraph inside the quote.
    if (!fence && isParagraphish(inner[inner.length - 1]) && !interruptsParagraph(l)) {
      inner.push(l.slice(ind.idx));
      continue;
    }
    break;
  }
  return { block: { type: 'blockquote', children: parseBlocks(inner, ctx, depth + 1, atEnd && j >= n) }, next: j };
}

function parseList(lines, i, ctx, depth, atEnd) {
  const n = lines.length;
  const items = [];
  let loose = false;
  let ordered = false;
  let markerCh = '';
  let start = 1;
  let j = i;
  let end = i; // index after the last line that belongs to the list
  while (j < n) {
    const line = lines[j];
    const ind = indentInfo(line);
    if (ind.idx === line.length || ind.cols >= 4) break;
    const rest = line.slice(ind.idx);
    if (HR_RE.test(rest)) break;
    const lm = listMarker(rest);
    if (!lm) break;
    if (items.length === 0) {
      ordered = lm.ordered;
      markerCh = lm.ch;
      start = lm.start;
    } else if (lm.ordered !== ordered || lm.ch !== markerCh) break; // a different list starts
    if (items.length && j > end) loose = true; // blank line(s) between items

    const markerIndent = ind.cols;
    let contentIndent = markerIndent + lm.width + lm.pad;
    const body = [];
    if (!lm.empty) body.push(lm.content);
    let fence = lm.empty ? null : fenceState(null, lm.content);
    let blanks = 0;
    j++;
    end = j;
    for (; j < n; j++) {
      const l = lines[j];
      const li = indentInfo(l);
      if (li.idx === l.length) {
        if (body.length === 0) break; // an empty item followed by a blank line ends
        blanks++;
        continue;
      }
      let take = null;
      if (li.cols >= contentIndent) {
        take = stripCols(l, contentIndent);
      } else if (!fence) {
        const r = l.slice(li.idx);
        const sub = li.cols < 4 && !HR_RE.test(r) ? listMarker(r) : null;
        if (sub) {
          // Tolerant nesting: models often indent sub-items of "1." by only two spaces.
          if (li.cols >= markerIndent + 2) {
            contentIndent = li.cols;
            take = stripCols(l, contentIndent);
          }
        } else if (!blanks && isParagraphish(body[body.length - 1]) && !interruptsParagraph(l)) {
          take = l.slice(li.idx); // lazy paragraph continuation
        }
      }
      if (take === null) break;
      for (; blanks > 0; blanks--) body.push('');
      body.push(take);
      fence = fenceState(fence, take);
      end = j + 1;
    }
    const children = parseBlocks(body, ctx, depth + 1, atEnd && end >= n);
    let task = null;
    const first = children[0];
    if (first && first.type === 'paragraph') {
      const m = /^\[([ xX])\](?:[ \t]+|$)/.exec(first.text);
      if (m) {
        task = m[1] !== ' ';
        first.text = first.text.slice(m[0].length);
      }
    }
    for (let k = 1; k < children.length; k++) if (children[k].blank) loose = true;
    items.push({ children, task });
    j = end;
    // Skip blank lines; the list continues only if the next line is another item.
    let k = j;
    while (k < n && isBlank(lines[k])) k++;
    if (k > j && k < n) {
      const li = indentInfo(lines[k]);
      const r = lines[k].slice(li.idx);
      const next = li.cols < 4 && !HR_RE.test(r) ? listMarker(r) : null;
      if (next && next.ordered === ordered && next.ch === markerCh) j = k;
      else break;
    } else if (k > j) break;
  }
  return { block: { type: 'list', ordered, start, loose, items }, next: end };
}

/** Split a table row into cells (unescaped pipes; leading/trailing pipe optional). */
function splitRow(line) {
  let s = line.trim();
  if (s.charCodeAt(0) === 124) s = s.slice(1);
  if (s.length && s.charCodeAt(s.length - 1) === 124 && s.charCodeAt(s.length - 2) !== 92) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let k = 0; k < s.length; k++) {
    const ch = s[k];
    if (ch === '\\' && s[k + 1] === '|') {
      cur += '|';
      k++;
    } else if (ch === '|') {
      cells.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

function alignOf(cell) {
  const c = cell.trim();
  const left = c.charCodeAt(0) === 58;
  const right = c.length > 1 && c.charCodeAt(c.length - 1) === 58;
  return left && right ? 'center' : right ? 'right' : left ? 'left' : '';
}

function looksLikePipeRow(line) {
  const t = line.trim();
  if (t.charCodeAt(0) !== 124) return false;
  let pipes = 0;
  for (let k = 0; k < t.length; k++) if (t.charCodeAt(k) === 124 && t.charCodeAt(k - 1) !== 92) pipes++;
  return pipes >= 2;
}

function isDelimRow(line) {
  return line.indexOf('|') !== -1 && line.indexOf('-') !== -1 && indentInfo(line).cols < 4 && TABLE_DELIM_RE.test(line);
}

/** Cheap check used while collecting a paragraph: does a table start at line j? */
function startsTableAt(lines, j, ctx, atEnd) {
  const next = lines[j + 1];
  if (next !== undefined) {
    if (isDelimRow(next) && splitRow(lines[j]).length === splitRow(next).length) return true;
    return !!(ctx.streaming && atEnd && j + 1 === lines.length - 1 && PARTIAL_DELIM_RE.test(next) && looksLikePipeRow(lines[j]));
  }
  return !!(ctx.streaming && atEnd && looksLikePipeRow(lines[j]));
}

function tableAt(lines, i, ctx, atEnd) {
  const n = lines.length;
  const header = lines[i];
  if (indentInfo(header).cols >= 4) return null;
  if (i + 1 < n) {
    const delim = lines[i + 1];
    const head = isDelimRow(delim) ? splitRow(header) : null;
    const marks = head ? splitRow(delim) : null;
    if (head && head.length === marks.length) {
      const width = head.length;
      const rows = [];
      let j = i + 2;
      for (; j < n; j++) {
        const l = lines[j];
        if (isBlank(l) || interruptsParagraph(l)) break;
        const cells = splitRow(l);
        if (cells.length > width) cells.length = width;
        while (cells.length < width) cells.push('');
        rows.push(cells);
      }
      return { block: { type: 'table', align: marks.map(alignOf), head, rows }, next: j };
    }
    // Streaming: a header row followed by a delimiter row that is still being typed.
    if (ctx.streaming && atEnd && i + 1 === n - 1 && PARTIAL_DELIM_RE.test(delim) && looksLikePipeRow(header)) {
      const cells = splitRow(header);
      const typed = splitRow(delim);
      return { block: { type: 'table', align: cells.map((_, k) => (typed[k] ? alignOf(typed[k]) : '')), head: cells, rows: [] }, next: n };
    }
    return null;
  }
  // Streaming: the header row itself is still arriving.
  if (ctx.streaming && atEnd && looksLikePipeRow(header)) {
    const head = splitRow(header);
    return { block: { type: 'table', align: head.map(() => ''), head, rows: [] }, next: n };
  }
  return null;
}

function normLabel(s) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

// ---------------------------------------------------------------------------------------
// Inline parsing (CommonMark-style delimiter algorithm on a linked list of nodes)
// ---------------------------------------------------------------------------------------
//
// Nodes: { t: 'text', v } { t: 'code', v } { t: 'br' } { t: 'em'|'strong'|'del', children }
//        { t: 'link', href|null, title, auto?, pending?, children } { t: 'image', href|null, title, pending?, children }

const SPECIAL_RE = /[\\`*_~[\]!<&\n]/g;
const ENTITY_RE = /&(?:#[xX]([0-9a-fA-F]{1,6})|#([0-9]{1,7})|([A-Za-z][A-Za-z0-9]{1,31}));/y;
const URI_AUTOLINK_RE = /^[A-Za-z][A-Za-z0-9+.-]{1,31}:[^\s<>\u0000-\u001F\u007F]*$/;
const EMAIL_AUTOLINK_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
// Bare URLs (GFM extended autolinks). They stop at whitespace, '<' and ']' (so a URL used as
// link text, "[https://x](https://x)", still forms a normal link).
const BARE_URL_RE = /(?:https?:\/\/|www\.)[^\s<\]]+/gi;
const URL_PREV_OK_RE = /[\s*_~(["'>:]/;

const PUNCT_RE = safeRegExp('[\\p{P}\\p{S}]', 'u', /[!-/:-@[-`{-~\u00A1-\u00BF\u2010-\u2027\u2030-\u205E\u3000-\u303F]/);
const WS_RE = /\s/;

function safeRegExp(source, flags, fallback) {
  try {
    return new RegExp(source, flags);
  } catch {
    return fallback;
  }
}

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00A0', ensp: '\u2002', emsp: '\u2003',
  thinsp: '\u2009', shy: '\u00AD', zwj: '\u200D', zwnj: '\u200C', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”',
  bdquo: '„', laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', bull: '•', middot: '·', times: '×',
  divide: '÷', deg: '°', plusmn: '±', micro: 'µ', para: '¶', sect: '§', euro: '€', pound: '£',
  yen: '¥', cent: '¢', curren: '¤', larr: '←', rarr: '→', uarr: '↑', darr: '↓', harr: '↔',
  lArr: '⇐', rArr: '⇒', hArr: '⇔', le: '≤', ge: '≥', ne: '≠', asymp: '≈', equiv: '≡', infin: '∞',
  minus: '−', prime: '′', Prime: '″', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²',
  sup3: '³', iexcl: '¡', iquest: '¿', szlig: 'ß', check: '✓', hearts: '♥', alpha: 'α', beta: 'β',
  gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ', mu: 'μ', pi: 'π', sigma: 'σ',
  tau: 'τ', phi: 'φ', omega: 'ω', Delta: 'Δ', Sigma: 'Σ', Omega: 'Ω', colon: ':', lpar: '(',
  rpar: ')', lsqb: '[', rsqb: ']', lbrack: '[', rbrack: ']', num: '#', excl: '!', quest: '?',
  ast: '*', lowbar: '_', grave: '`', tilde: '~', vert: '|', sol: '/', bsol: '\\', period: '.',
  comma: ',', semi: ';', equals: '=', plus: '+', dollar: '$', percnt: '%', commat: '@', Tab: '\t',
  NewLine: '\n',
};

function decodeEntity(m) {
  if (m[1] !== undefined || m[2] !== undefined) {
    const code = m[1] !== undefined ? parseInt(m[1], 16) : parseInt(m[2], 10);
    if (!code || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '\uFFFD';
    if ((code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069)) return '';
    return String.fromCodePoint(code);
  }
  return Object.prototype.hasOwnProperty.call(ENTITIES, m[3]) ? ENTITIES[m[3]] : null;
}

function isAsciiPunct(code) {
  return (code >= 33 && code <= 47) || (code >= 58 && code <= 64) || (code >= 91 && code <= 96) || (code >= 123 && code <= 126);
}

/** Resolve backslash escapes and entities (link destinations, titles, info strings). */
function unescapeText(s) {
  if (s.indexOf('\\') === -1 && s.indexOf('&') === -1) return s;
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 92 && i + 1 < s.length && isAsciiPunct(s.charCodeAt(i + 1))) {
      out += s[i + 1];
      i++;
    } else if (c === 38) {
      ENTITY_RE.lastIndex = i;
      const m = ENTITY_RE.exec(s);
      const ch = m ? decodeEntity(m) : null;
      if (ch !== null) {
        out += ch;
        i += m[0].length - 1;
      } else out += '&';
    } else out += s[i];
  }
  return out;
}

/** An href we are willing to render, or null. Only absolute http(s) and mailto URLs. */
function safeHref(raw) {
  if (typeof raw !== 'string') return null;
  // Control characters (and the invisible bidi controls) are never legitimate in a URL;
  // dropping them first means "java\nscript:" and friends are judged by what a browser would see.
  const s = raw.replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, '').trim();
  if (!s || s.length > MAX_URL_LENGTH) return null;
  let url;
  try {
    url = new URL(s);
  } catch {
    return null; // relative or malformed: no base URL is ever applied
  }
  const p = url.protocol;
  if (p === 'http:' || p === 'https:') return url.hostname ? url.href : null;
  if (p === 'mailto:') return url.pathname || url.search ? url.href : null;
  return null;
}

function trimUrlTail(url) {
  let end = url.length;
  for (;;) {
    const c = url[end - 1];
    if (c === undefined) break;
    if ('?!.,:*_~\'"'.indexOf(c) !== -1) {
      end--;
      continue;
    }
    if (c === ')') {
      const s = url.slice(0, end);
      if (countChar(s, '(') < countChar(s, ')')) {
        end--;
        continue;
      }
    }
    if (c === ';') {
      const m = /&[A-Za-z0-9]{1,31};$/.exec(url.slice(0, end));
      if (m) {
        end -= m[0].length;
        continue;
      }
    }
    break;
  }
  return url.slice(0, end);
}

function countChar(s, ch) {
  let n = 0;
  for (let i = s.indexOf(ch); i !== -1; i = s.indexOf(ch, i + 1)) n++;
  return n;
}

function findBareUrls(src) {
  if (src.indexOf('://') === -1 && !/www\./i.test(src)) return null;
  const out = [];
  BARE_URL_RE.lastIndex = 0;
  let m;
  while ((m = BARE_URL_RE.exec(src))) {
    const start = m.index;
    if (start > 0 && !URL_PREV_OK_RE.test(src[start - 1])) continue;
    const text = trimUrlTail(m[0]);
    if (!text) continue;
    const href = safeHref(/^www\./i.test(text) ? 'https://' + text : text);
    if (!href || /^(?:https?:\/\/|www\.)$/i.test(text)) continue;
    out.push({ start, end: start + text.length, text, href });
  }
  return out.length ? out : null;
}

// ---- linked-list helpers ----

function newList() {
  return { first: null, last: null };
}

function append(list, node) {
  node.parent = list;
  node.prev = list.last;
  node.next = null;
  if (list.last) list.last.next = node;
  else list.first = node;
  list.last = node;
  return node;
}

function unlink(node) {
  const list = node.parent;
  if (node.prev) node.prev.next = node.next;
  else list.first = node.next;
  if (node.next) node.next.prev = node.prev;
  else list.last = node.prev;
  node.prev = node.next = node.parent = null;
}

function insertAfter(ref, node) {
  const list = ref.parent;
  node.parent = list;
  node.prev = ref;
  node.next = ref.next;
  if (ref.next) ref.next.prev = node;
  else list.last = node;
  ref.next = node;
}

/** Move every node after `ref` (same list) into `target`. */
function moveAfter(ref, target) {
  let node = ref.next;
  while (node) {
    const next = node.next;
    unlink(node);
    append(target, node);
    node = next;
  }
}

// ---- delimiter stack (doubly linked; state.top is the newest) ----

function removeDelim(state, d) {
  if (d.prev) d.prev.next = d.next;
  if (d.next) d.next.prev = d.prev;
  else state.top = d.prev;
  d.prev = d.next = null;
}

function processEmphasis(state, bottom) {
  const openersBottom = new Map();
  let closer = state.top;
  while (closer && closer.prev !== bottom) closer = closer.prev;
  while (closer) {
    if (!closer.canClose) {
      closer = closer.next;
      continue;
    }
    const key = closer.ch === '~' ? '~' : closer.ch + (closer.canOpen ? '1' : '0') + (closer.orig % 3);
    const limit = openersBottom.has(key) ? openersBottom.get(key) : bottom;
    let opener = closer.prev;
    let found = false;
    while (opener && opener !== bottom && opener !== limit) {
      if (opener.ch === closer.ch && opener.canOpen) {
        if (closer.ch === '~') {
          found = true;
          break;
        }
        const odd = (closer.canOpen || opener.canClose) && closer.orig % 3 !== 0 && (opener.orig + closer.orig) % 3 === 0;
        if (!odd) {
          found = true;
          break;
        }
      }
      opener = opener.prev;
    }
    const oldCloser = closer;
    if (found) {
      const use = closer.ch === '~' ? 2 : closer.count >= 2 && opener.count >= 2 ? 2 : 1;
      opener.count -= use;
      closer.count -= use;
      opener.node.v = opener.node.v.slice(0, opener.node.v.length - use);
      closer.node.v = closer.node.v.slice(0, closer.node.v.length - use);
      const wrap = { t: closer.ch === '~' ? 'del' : use === 2 ? 'strong' : 'em', children: newList() };
      let node = opener.node.next;
      while (node && node !== closer.node) {
        const next = node.next;
        unlink(node);
        append(wrap.children, node);
        node = next;
      }
      insertAfter(opener.node, wrap);
      for (let d = closer.prev; d && d !== opener; ) {
        const p = d.prev;
        removeDelim(state, d);
        d = p;
      }
      if (opener.count === 0) {
        unlink(opener.node);
        removeDelim(state, opener);
      }
      if (closer.count === 0) {
        unlink(closer.node);
        const next = closer.next;
        removeDelim(state, closer);
        closer = next;
      }
    } else {
      closer = closer.next;
      openersBottom.set(key, oldCloser.prev);
      if (!oldCloser.canOpen) removeDelim(state, oldCloser);
    }
  }
}

/** Streaming: close what is still open at the end of the text (innermost first). */
function closeOpenDelimiters(state) {
  for (let d = state.top; d; ) {
    const prev = d.prev;
    if (d.canOpen && d.count > 0) {
      if (d.node.next) {
        const strike = d.ch === '~';
        const use = strike ? 2 : Math.min(d.count, 3);
        const inner = { t: strike ? 'del' : use === 2 ? 'strong' : 'em', children: newList() };
        moveAfter(d.node, inner.children);
        let wrapper = inner;
        if (use === 3) {
          wrapper = { t: 'strong', children: newList() }; // ***x -> <strong><em>x</em></strong>
          append(wrapper.children, inner);
        }
        append(d.node.parent, wrapper);
        d.node.v = d.node.v.slice(0, d.node.v.length - use);
      } else {
        d.node.v = d.node.v.slice(0, d.node.v.length - d.count); // dangling marker at the very end
      }
    }
    d = prev;
  }
}

function parseInline(src, env, tail) {
  const list = newList();
  const len = src.length;
  if (!len) return list;
  const state = { top: null };
  const brackets = [];
  const urls = findBareUrls(src);
  const noCloser = new Set(); // backtick-run lengths with no closer further on
  let nextGt = -1; // position of the next '>' (see the '<' case)
  let urlIdx = 0;
  let text = '';
  let pos = 0;

  const flush = () => {
    if (text) {
      append(list, { t: 'text', v: text });
      text = '';
    }
  };
  const pushLink = (node, label) => {
    append(node.children, { t: 'text', v: label });
    append(list, node);
  };

  while (pos < len) {
    SPECIAL_RE.lastIndex = pos;
    const sm = SPECIAL_RE.exec(src);
    let stop = sm ? sm.index : len;
    if (urls) {
      while (urlIdx < urls.length && urls[urlIdx].start < pos) urlIdx++;
      if (urlIdx < urls.length && urls[urlIdx].start < stop) stop = urls[urlIdx].start;
    }
    if (stop > pos) {
      text += src.slice(pos, stop);
      pos = stop;
      if (pos >= len) break;
    }
    if (urls && urlIdx < urls.length && urls[urlIdx].start === pos) {
      const u = urls[urlIdx++];
      flush();
      pushLink({ t: 'link', href: u.href, title: '', auto: true, children: newList() }, u.text);
      pos = u.end;
      continue;
    }
    const c = src.charCodeAt(pos);
    switch (c) {
      case 10: {
        // Line break (hard or soft): trailing spaces before it and indentation after it go.
        text = text.replace(/[ \t]+$/, '');
        if (!text && list.last && list.last.t === 'text') list.last.v = list.last.v.replace(/[ \t]+$/, '');
        flush();
        append(list, { t: 'br' });
        pos++;
        while (pos < len && (src.charCodeAt(pos) === 32 || src.charCodeAt(pos) === 9)) pos++;
        break;
      }
      case 92: {
        // Backslash escape / hard break.
        const nc = src.charCodeAt(pos + 1);
        if (nc === 10) {
          pos++; // the newline handler emits the break
        } else if (isAsciiPunct(nc)) {
          text += src[pos + 1];
          pos += 2;
        } else {
          text += '\\';
          pos++;
        }
        break;
      }
      case 96: {
        // Code span.
        let k = pos;
        while (k < len && src.charCodeAt(k) === 96) k++;
        const run = k - pos;
        let close = -1;
        if (!noCloser.has(run)) {
          for (let s = src.indexOf('`', k); s !== -1; ) {
            let e = s;
            while (e < len && src.charCodeAt(e) === 96) e++;
            if (e - s === run) {
              close = s;
              break;
            }
            s = src.indexOf('`', e);
          }
          if (close === -1) noCloser.add(run);
        }
        if (close === -1 && tail && k >= len) {
          pos = len; // streaming: an opening run with nothing after it yet - hide it
        } else if (close !== -1 || tail) {
          flush();
          append(list, { t: 'code', v: codeSpanText(src.slice(k, close === -1 ? len : close)) });
          pos = close === -1 ? len : close + run;
        } else {
          text += src.slice(pos, k);
          pos = k;
        }
        break;
      }
      case 42:
      case 95:
      case 126: {
        // Emphasis / strikethrough delimiter run.
        const ch = src[pos];
        let k = pos;
        while (k < len && src[k] === ch) k++;
        const count = k - pos;
        if (ch === '~' && count !== 2) {
          text += src.slice(pos, k);
          pos = k;
          break;
        }
        const before = pos === 0 ? '\n' : src[pos - 1];
        const after = k >= len ? '\n' : src[k];
        const bWs = WS_RE.test(before);
        if (tail && k >= len && bWs && count <= 3) {
          pos = k; // streaming: "… **" is an opener still waiting for its text - hide it
          break;
        }
        const aWs = WS_RE.test(after);
        const bP = !bWs && PUNCT_RE.test(before);
        const aP = !aWs && PUNCT_RE.test(after);
        const left = !aWs && (!aP || bWs || bP);
        const right = !bWs && (!bP || aWs || aP);
        const canOpen = ch === '_' ? left && (!right || bP) : left;
        const canClose = ch === '_' ? right && (!left || aP) : right;
        flush();
        const node = append(list, { t: 'text', v: src.slice(pos, k) });
        if (canOpen || canClose) {
          const d = { node, ch, count, orig: count, canOpen, canClose, prev: state.top, next: null };
          if (state.top) state.top.next = d;
          state.top = d;
        }
        pos = k;
        break;
      }
      case 33: {
        if (src.charCodeAt(pos + 1) === 91) {
          flush();
          const node = append(list, { t: 'text', v: '![' });
          brackets.push({ node, image: true, start: pos + 2, active: true, bottom: state.top });
          pos += 2;
        } else {
          text += '!';
          pos++;
        }
        break;
      }
      case 91: {
        flush();
        const node = append(list, { t: 'text', v: '[' });
        brackets.push({ node, image: false, start: pos + 1, active: true, bottom: state.top });
        pos++;
        break;
      }
      case 93: {
        const op = brackets.length ? brackets[brackets.length - 1] : null;
        if (!op || !op.active) {
          if (op) brackets.pop();
          text += ']';
          pos++;
          break;
        }
        const res = inlineLinkTail(src, pos + 1, tail) || refLinkTail(src, pos + 1, src.slice(op.start, pos), env.refs);
        if (!res) {
          brackets.pop();
          text += ']';
          pos++;
          break;
        }
        flush();
        brackets.pop();
        processEmphasis(state, op.bottom);
        while (state.top && state.top !== op.bottom) removeDelim(state, state.top);
        const node = {
          t: op.image ? 'image' : 'link',
          href: res.pending ? null : safeHref(res.dest),
          title: res.title || '',
          pending: !!res.pending,
          children: newList(),
        };
        moveAfter(op.node, node.children);
        insertAfter(op.node, node);
        unlink(op.node);
        if (!op.image) for (const b of brackets) if (!b.image) b.active = false; // no links inside links
        pos = res.end;
        break;
      }
      case 60: {
        // Autolink <scheme:…> / <user@host>; anything else is a literal '<' (no raw HTML).
        if (nextGt <= pos) {
          const g = src.indexOf('>', pos + 1); // memoized: keeps "<a<a<a…>" and "<<<…" linear
          nextGt = g === -1 ? Infinity : g;
        }
        const close = nextGt === Infinity ? -1 : nextGt;
        if (close !== -1 && close - pos <= MAX_URL_LENGTH) {
          const inner = src.slice(pos + 1, close);
          let href;
          if (URI_AUTOLINK_RE.test(inner)) href = safeHref(inner);
          else if (EMAIL_AUTOLINK_RE.test(inner)) href = safeHref('mailto:' + inner);
          if (href !== undefined) {
            if (href) {
              flush();
              pushLink({ t: 'link', href, title: '', auto: true, children: newList() }, inner);
            } else text += src.slice(pos, close + 1); // unsafe scheme: literal text
            pos = close + 1;
            break;
          }
        }
        text += '<';
        pos++;
        break;
      }
      case 38: {
        ENTITY_RE.lastIndex = pos;
        const m = ENTITY_RE.exec(src);
        const ch = m ? decodeEntity(m) : null;
        if (ch !== null) {
          text += ch;
          pos += m[0].length;
        } else {
          text += '&';
          pos++;
        }
        break;
      }
      default:
        text += src[pos];
        pos++;
    }
  }
  flush();
  processEmphasis(state, null);
  if (tail) closeOpenDelimiters(state);
  return list;
}

function codeSpanText(s) {
  let v = s.indexOf('\n') === -1 ? s : s.replace(/\n/g, ' ');
  if (v.length > 2 && v[0] === ' ' && v[v.length - 1] === ' ' && /[^ ]/.test(v)) v = v.slice(1, -1);
  return v;
}

function skipSpaces(src, q, allowNewline) {
  let newline = false;
  while (q < src.length) {
    const c = src.charCodeAt(q);
    if (c === 32 || c === 9) q++;
    else if (c === 10 && allowNewline && !newline) {
      newline = true;
      q++;
    } else break;
  }
  return q;
}

/** `(dest "title")` after a `]`. Returns { dest, title, end } | { pending, end } | null. */
function inlineLinkTail(src, p, tail) {
  const len = src.length;
  if (src.charCodeAt(p) !== 40) return null;
  const pending = tail ? { pending: true, end: len } : null;
  let q = skipSpaces(src, p + 1, true);
  if (q >= len) return pending;
  let dest;
  if (src.charCodeAt(q) === 60) {
    let e = q + 1;
    for (; e < len; e++) {
      const c = src.charCodeAt(e);
      if (c === 92) e++;
      else if (c === 62 || c === 60 || c === 10) break;
    }
    if (e >= len) return pending;
    if (src.charCodeAt(e) !== 62) return null;
    dest = src.slice(q + 1, e);
    q = e + 1;
  } else {
    let depth = 0;
    let e = q;
    for (; e < len; e++) {
      const c = src.charCodeAt(e);
      if (c === 92 && e + 1 < len && isAsciiPunct(src.charCodeAt(e + 1))) {
        e++;
        continue;
      }
      if (c <= 32 || c === 127) break;
      if (c === 40) {
        if (++depth > 32) return null;
      } else if (c === 41) {
        if (depth === 0) break;
        depth--;
      }
    }
    if (e >= len) return pending;
    if (depth !== 0) return null;
    dest = src.slice(q, e);
    q = e;
  }
  const afterDest = q;
  q = skipSpaces(src, q, true);
  if (q >= len) return pending;
  let title = '';
  const tc = src[q];
  if (q > afterDest && (tc === '"' || tc === "'" || tc === '(')) {
    const closeCh = tc === '(' ? ')' : tc;
    let e = q + 1;
    for (; e < len; e++) {
      const c = src[e];
      if (c === '\\') e++;
      else if (c === closeCh) break;
      else if (tc === '(' && c === '(') return null;
    }
    if (e >= len) return pending;
    title = src.slice(q + 1, e);
    q = skipSpaces(src, e + 1, true);
    if (q >= len) return pending;
  }
  if (src.charCodeAt(q) !== 41) return null;
  return { dest: unescapeText(dest), title: unescapeText(title), end: q + 1 };
}

/** Reference links: [text][label], [label][], or a [label] shortcut. */
function refLinkTail(src, p, label, refs) {
  if (!refs.size) return null;
  if (src.charCodeAt(p) === 91) {
    const e = src.indexOf(']', p + 1);
    if (e !== -1 && e - p <= 1000) {
      const inner = src.slice(p + 1, e);
      if (inner.indexOf('[') === -1) {
        const def = refs.get(normLabel(inner || label));
        return def ? { dest: def.dest, title: def.title, end: e + 1 } : null;
      }
    }
  }
  const def = refs.get(normLabel(label));
  return def ? { dest: def.dest, title: def.title, end: p } : null;
}

// ---------------------------------------------------------------------------------------
// DOM rendering
// ---------------------------------------------------------------------------------------

function make(doc, tag, cls) {
  const el = doc.createElement(tag);
  if (cls) el.className = cls;
  return el;
}

function renderBlocks(blocks, parent, env, tight) {
  for (const b of blocks) renderBlock(b, parent, env, tight);
}

function renderBlock(b, parent, env, tight) {
  const doc = env.doc;
  switch (b.type) {
    case 'paragraph': {
      const nodes = parseInline(b.text, env, !!b.tail);
      if (tight) renderInline(nodes, parent, env, false);
      else {
        const p = make(doc, 'p', 'md-p');
        renderInline(nodes, p, env, false);
        parent.appendChild(p);
      }
      return;
    }
    case 'heading': {
      const h = make(doc, 'h' + Math.min(6, b.level + 2), 'md-h md-h' + b.level);
      renderInline(parseInline(b.text, env, !!b.tail), h, env, false);
      parent.appendChild(h);
      return;
    }
    case 'hr':
      parent.appendChild(make(doc, 'hr', 'md-hr'));
      return;
    case 'code':
      parent.appendChild(renderCodeBlock(b, doc));
      return;
    case 'blockquote': {
      const q = make(doc, 'blockquote', 'md-quote');
      renderBlocks(b.children, q, env, false);
      parent.appendChild(q);
      return;
    }
    case 'list':
      parent.appendChild(renderList(b, env));
      return;
    case 'table':
      parent.appendChild(renderTable(b, env));
      return;
    default:
  }
}

function renderList(b, env) {
  const doc = env.doc;
  const hasTasks = b.items.some((it) => it.task !== null);
  const cls =
    'md-list ' + (b.ordered ? 'md-ol' : 'md-ul') + (b.loose ? ' md-loose' : ' md-tight') + (hasTasks ? ' md-task-list' : '');
  const list = make(doc, b.ordered ? 'ol' : 'ul', cls);
  if (b.ordered && b.start !== 1) list.setAttribute('start', String(b.start));
  for (const item of b.items) {
    const li = make(doc, 'li', item.task === null ? 'md-li' : item.task ? 'md-li md-task md-task-done' : 'md-li md-task');
    renderBlocks(item.children, li, env, !b.loose);
    if (item.task !== null) {
      const box = make(doc, 'input', 'md-task-box');
      box.setAttribute('type', 'checkbox');
      box.setAttribute('disabled', '');
      if (item.task) box.setAttribute('checked', '');
      box.checked = item.task;
      const host = li.firstChild && li.firstChild.nodeName === 'P' ? li.firstChild : li;
      host.insertBefore(doc.createTextNode(' '), host.firstChild);
      host.insertBefore(box, host.firstChild);
    }
    list.appendChild(li);
  }
  return list;
}

function renderTable(b, env) {
  const doc = env.doc;
  const wrap = make(doc, 'div', 'md-table-wrap');
  wrap.setAttribute('tabindex', '0'); // scrollable region reachable by keyboard
  const table = make(doc, 'table', 'md-table');
  const thead = doc.createElement('thead');
  const headRow = doc.createElement('tr');
  const lastRow = b.rows.length - 1;
  b.head.forEach((cell, k) => {
    const tail = !!b.tail && lastRow < 0 && k === b.head.length - 1;
    headRow.appendChild(renderCell(doc, 'th', cell, b.align[k], env, tail));
  });
  thead.appendChild(headRow);
  table.appendChild(thead);
  if (b.rows.length) {
    const tbody = doc.createElement('tbody');
    b.rows.forEach((row, r) => {
      const tr = doc.createElement('tr');
      row.forEach((cell, k) => {
        const tail = !!b.tail && r === lastRow && k === row.length - 1;
        tr.appendChild(renderCell(doc, 'td', cell, b.align[k], env, tail));
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }
  wrap.appendChild(table);
  return wrap;
}

function renderCell(doc, tag, text, align, env, tail) {
  const cell = make(doc, tag, align ? 'md-align-' + align : '');
  if (tag === 'th') cell.setAttribute('scope', 'col');
  if (align) cell.style.textAlign = align; // CSSOM: allowed under the CSP, works without app CSS
  renderInline(parseInline(text, env, tail), cell, env, false);
  return cell;
}

function renderCodeBlock(b, doc) {
  const wrap = make(doc, 'div', 'md-codeblock');
  if (b.lang) wrap.setAttribute('data-lang', b.lang);
  if (b.open) wrap.setAttribute('data-open', 'true');
  const head = make(doc, 'div', 'md-code-head');
  const label = make(doc, 'span', 'md-code-lang');
  label.textContent = b.lang || 'code';
  const btn = make(doc, 'button', 'md-copy');
  btn.setAttribute('type', 'button');
  btn.setAttribute('aria-label', b.lang ? 'Copy ' + b.lang + ' code' : 'Copy code');
  btn.setAttribute('data-code', b.text);
  btn.textContent = 'Copy';
  btn.addEventListener('click', onCopyClick);
  head.appendChild(label);
  head.appendChild(btn);
  const pre = make(doc, 'pre', 'md-pre');
  pre.setAttribute('tabindex', '0');
  const code = make(doc, 'code', 'md-code-block');
  code.textContent = b.text;
  pre.appendChild(code);
  wrap.appendChild(head);
  wrap.appendChild(pre);
  return wrap;
}

function renderInline(list, parent, env, inLink) {
  const doc = env.doc;
  let buf = '';
  for (let n = list.first; n; n = n.next) {
    if (n.t === 'text') {
      buf += n.v;
      continue;
    }
    if (buf) {
      parent.appendChild(doc.createTextNode(buf));
      buf = '';
    }
    switch (n.t) {
      case 'code': {
        const code = make(doc, 'code', 'md-code');
        code.textContent = n.v;
        parent.appendChild(code);
        break;
      }
      case 'br':
        parent.appendChild(doc.createElement('br'));
        break;
      case 'em':
      case 'strong':
      case 'del': {
        const el = make(doc, n.t, 'md-' + n.t);
        renderInline(n.children, el, env, inLink);
        parent.appendChild(el);
        break;
      }
      case 'link': {
        if (n.pending) {
          const span = make(doc, 'span', 'md-link-pending');
          renderInline(n.children, span, env, true);
          parent.appendChild(span);
        } else if (inLink || !n.href) {
          renderInline(n.children, parent, env, inLink); // unsafe or nested: plain text
        } else {
          const a = make(doc, 'a', n.auto ? 'md-link md-autolink' : 'md-link');
          a.setAttribute('href', n.href);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          if (n.title) a.setAttribute('title', n.title);
          renderInline(n.children, a, env, true);
          if (!a.firstChild) a.textContent = n.href;
          parent.appendChild(a);
        }
        break;
      }
      case 'image': {
        const alt = inlineToText(n.children, false).replace(/\s+/g, ' ').trim();
        if (n.href && !inLink && !n.pending) {
          const a = make(doc, 'a', 'md-link md-image-link');
          a.setAttribute('href', n.href);
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          a.setAttribute('title', n.title || (alt ? 'Image: ' + alt : 'Image'));
          a.textContent = alt ? 'Image: ' + alt : 'Image';
          parent.appendChild(a);
        } else if (alt) {
          parent.appendChild(doc.createTextNode(alt));
        }
        break;
      }
      default:
    }
  }
  if (buf) parent.appendChild(doc.createTextNode(buf));
}

// ---- Copy button ----

const copyTimers = new WeakMap();
// Anthropic API keys never reach the clipboard from a code block (they would end up pasted
// somewhere); the block itself still shows the text as written.
const API_KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]{20,}/gi;

function onCopyClick(event) {
  const btn = event.currentTarget;
  event.preventDefault();
  event.stopPropagation();
  let code = btn.getAttribute('data-code');
  if (code === null) {
    const block = btn.closest('.md-codeblock');
    const el = block && block.querySelector('code');
    code = el ? el.textContent : '';
  }
  code = code.replace(API_KEY_PATTERN, '[API key removed]');
  copyText(code, btn).then(
    (ok) => showCopyState(btn, ok),
    () => showCopyState(btn, false),
  );
}

function copyText(text, focusBack) {
  const nav = globalThis.navigator;
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function' && globalThis.isSecureContext !== false) {
    return nav.clipboard.writeText(text).then(
      () => true,
      () => legacyCopy(text, focusBack),
    );
  }
  return Promise.resolve(legacyCopy(text, focusBack));
}

/** execCommand fallback for insecure contexts (e.g. the LAN URL on a phone). */
function legacyCopy(text, focusBack) {
  const doc = globalThis.document;
  if (!doc || !doc.body) return false;
  const ta = doc.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.setAttribute('aria-hidden', 'true');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '0';
  ta.style.opacity = '0';
  ta.style.pointerEvents = 'none';
  doc.body.appendChild(ta);
  let ok = false;
  try {
    ta.select();
    ta.setSelectionRange(0, text.length);
    ok = doc.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  try {
    if (focusBack && focusBack.isConnected) focusBack.focus({ preventScroll: true });
  } catch {
    /* ignore */
  }
  return ok;
}

function showCopyState(btn, ok) {
  btn.textContent = ok ? 'Copied' : 'Copy failed';
  btn.setAttribute('data-state', ok ? 'copied' : 'error');
  clearTimeout(copyTimers.get(btn));
  copyTimers.set(
    btn,
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.removeAttribute('data-state');
    }, COPY_RESET_MS),
  );
}

// ---------------------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------------------

function inlineToText(list, speech) {
  let s = '';
  for (let n = list.first; n; n = n.next) {
    switch (n.t) {
      case 'text':
        s += n.v;
        break;
      case 'code':
        // Speech: marked, so finishSpeech says it as written (no ear rewrites inside code).
        s += speech ? CODE_OPEN + n.v.replace(CODE_MARKS_RE, '') + CODE_CLOSE : n.v;
        break;
      case 'br':
        s += '\n';
        break;
      case 'em':
      case 'strong':
      case 'del':
        s += inlineToText(n.children, speech);
        break;
      case 'link':
        if (n.auto && speech) s += ' ' + spokenHost(n.href) + ' ';
        else if (!speech) s += inlineToText(n.children, speech);
        else s += spokenLinkText(inlineToText(n.children, speech));
        break;
      case 'image':
        if (!speech) s += inlineToText(n.children, speech);
        break;
      default:
    }
  }
  return s;
}

const SENTENCE_END_RE = /[.!?…:;]["'”’)\]]*$/;

function asSentence(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  return SENTENCE_END_RE.test(t) ? t : t + '.';
}

function blocksToText(blocks, env, speech, top) {
  const parts = [];
  for (const b of blocks) {
    const t = blockToText(b, env, speech, top);
    if (t) parts.push(t);
  }
  return parts.join(speech ? '\n' : top ? '\n\n' : '\n');
}

function blockToText(b, env, speech, top) {
  switch (b.type) {
    case 'paragraph':
    case 'heading': {
      const t = inlineToText(parseInline(b.text, env, false), speech);
      return speech ? asSentence(t) : t.trim();
    }
    case 'hr':
      return '';
    case 'code':
      return speech ? '' : b.text;
    case 'blockquote':
      return blocksToText(b.children, env, speech, top);
    case 'list': {
      const lines = [];
      b.items.forEach((item, k) => {
        const body = blocksToText(item.children, env, speech, false);
        if (speech) {
          if (body) lines.push(body);
          return;
        }
        const marker = (b.ordered ? b.start + k + '. ' : '- ') + (item.task === null ? '' : item.task ? '☑ ' : '☐ ');
        const pad = ' '.repeat(b.ordered ? String(b.start + k).length + 2 : 2);
        lines.push(marker + body.split('\n').join('\n' + pad));
      });
      return lines.join('\n');
    }
    case 'table': {
      const rows = [b.head, ...b.rows].map((cells) => cells.map((c) => inlineToText(parseInline(c, env, false), speech).replace(/\s+/g, ' ').trim()));
      if (speech) return rows.map((cells) => asSentence(cells.filter(Boolean).join(', '))).filter(Boolean).join('\n');
      return rows.map((cells) => cells.join(' | ')).join('\n');
    }
    default:
      return '';
  }
}

function tidyPlain(s) {
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const URL_IN_TEXT_RE = /\b(?:https?:\/\/|www\.)[^\s<>()[\]]+/gi;
const EMOJI_RE = safeRegExp('\\p{Extended_Pictographic}(?:\\uFE0F|\\u200D\\p{Extended_Pictographic})*\\uFE0F?', 'gu', /[\u2600-\u27BF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDC00-\uDFFF]/g);

function spokenHost(url) {
  try {
    return new URL(/^www\./i.test(url) ? 'https://' + url : url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Inline code in speech text, between these private-use marks until finishSpeech.
const CODE_OPEN = '\uE000';
const CODE_CLOSE = '\uE001';
const CODE_MARKS_RE = /[\uE000\uE001]/g;
const CODE_SPAN_RE = /\uE000([^\uE001]*)\uE001/;

function finishSpeech(s) {
  const plain = s
    .replace(URL_IN_TEXT_RE, (u) => spokenHost(trimUrlTail(u)))
    .replace(EMOJI_RE, '')
    .replace(/[→⇒➜➔⟶]/g, ' to ')
    .replace(/≈\s*/g, 'about ');
  // Inline code (odd pieces) is said as written: `HEAD~3`, `items[0]` and `a-b` keep their meaning.
  return plain
    .split(CODE_SPAN_RE)
    .map((part, i) => (i % 2 ? part : forTheEar(part)))
    .join('')
    .replace(CODE_MARKS_RE, '')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/ ([.,!?;:])/g, '$1')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

// ---- speech mode: text for the ear ----
// Conservative rewrites: each rule fires only on an unambiguous pattern, so ordinary prose, phone
// numbers, dates (2026-11-19), times (10:30) and hyphenated words are left alone. No lookbehind
// (Safari 15).

// Reference markers: [1], [2, 3], [4–6], [^1], [source], [citation needed].
const REF_MARKER_RE = /[ \t]*\[(?:\^?\d{1,3}(?:\s*[,–-]\s*\d{1,3})*|\^[A-Za-z][\w-]{0,19}|(?:sources?|citations?(?: needed)?|refs?|references?|notes?)(?:\s*\d{1,3})?)\]/gi;
// The text of a citation link such as [1](https://…): nothing to say.
const REF_LABEL_RE = /^\s*\[?\^?\d{1,3}\]?\s*$/;
// A number range with an en dash (spaces allowed) or a hyphen (none): 5–10, 5-10, $5–$10, 50%–60%
// (not one glued to a bracket: "section 5-3(b)").
const RANGE_RE = /(^|[^\w.,:/+\-–])([$£€]?)(\d{1,4}(?:,\d{3})*(?:\.\d+)?)(%?)(\s?–\s?|-)([$£€]?)(\d{1,4}(?:,\d{3})*(?:\.\d+)?)(?![\d:/\-–(]|[.,]\d)/g;
// Names that may precede a date range ("Monday 9-5", "June 5-10"), unlike a model name.
const CALENDAR_RE = /^(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sept?(?:ember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|Mon(?:day)?|Tue(?:s|sday)?|Wed(?:nesday)?|Thu(?:rs|rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)$/;

function spokenLinkText(text) {
  return REF_LABEL_RE.test(text) ? '' : text;
}

function forTheEar(s) {
  return s
    .replace(REF_MARKER_RE, '')
    .replace(/\*\*|__|`+/g, '')
    .replace(/\b([Ee])\.\s?g\.(?=[\s,;:)]|$)/g, (m, e) => (e === 'E' ? 'For example' : 'for example'))
    .replace(/\b([Ii])\.\s?e\.(?=[\s,;:)]|$)/g, (m, i) => (i === 'I' ? 'That is' : 'that is'))
    .replace(/\b([Ee])tc\.(?=([^\S\n]*)(.?))/g, (m, e, ws, next) => abbreviation(e === 'E' ? 'Et cetera' : 'et cetera', ws, next))
    .replace(/\b([Aa])pprox\.(?=([^\S\n]*)(.?))/g, (m, a, ws, next) => abbreviation(a === 'A' ? 'Approximately' : 'approximately', ws, next))
    .replace(/ vs\.? (?=\S)/g, ' versus ')
    .replace(/\b24\/7\b/g, 'twenty-four seven')
    .replace(/(\d)\s?km\/h\b/gi, '$1 kilometres per hour')
    .replace(/\bkm\/h\b/gi, 'kilometres per hour')
    .replace(RANGE_RE, spokenRange)
    .replace(/(^|[\s([{"“‘'])~\s?(?=[$£€]?\d)/g, '$1about ')
    .replace(/(\d)\+(?![\d+])/g, '$1 plus')
    .replace(/\s*×\s*/g, ' times ')
    .replace(/(\d)\s?%/g, '$1 percent')
    .replace(/\s?°\s?C\b/g, ' degrees Celsius')
    .replace(/\s?°\s?F\b/g, ' degrees Fahrenheit')
    .replace(/(\d)\s?°(?![CF])/g, '$1 degrees')
    .replace(/([A-Za-z0-9\u00C0-\u024F)'"’”])\s+&\s+(?=[A-Za-z0-9\u00C0-\u024F"'“‘(])/g, '$1 and ')
    .replace(/\b([a-z]{2,})&([a-z]{2,})\b/g, '$1 and $2');
}

/** "etc." / "approx." spelled out; the period stays when it also ends the sentence. */
function abbreviation(word, space, next) {
  return next === '' || (space && /[A-Z"“‘'(]/.test(next)) ? word + '.' : word;
}

function spokenRange(m, pre, cur1, a, pct, dash, cur2, b, offset, str) {
  if (a === b && !cur1 && !cur2) return m; // 0-0, 50-50: a score or odds, never a range
  if (dash === '-') {
    if (/^\d{3}$/.test(a) && /^\d{4}$/.test(b)) return m; // 555-1234: a phone number
    if (/^[12]\d{3}$/.test(a) && /^(?:0[1-9]|1[0-2])$/.test(b)) return m; // 2026-11: a year and month
    if (/^0\d/.test(a) || /^0\d/.test(b)) return m; // 020-7946, 08-15: codes
    if (!cur1 && !pct && /^\d{3,4}$/.test(a) && /^\d{3,4}$/.test(b) && modelName(str.slice(0, offset + pre.length))) return m; // Boeing 737-800
  }
  return `${pre}${cur1}${a}${pct} to ${cur2}${b}`;
}

/** The text ends with a capitalised name and a space, mid-sentence ("… a Boeing "): a model number follows. */
function modelName(before) {
  const w = /(?:^|[\s(])([A-Z][A-Za-z]*)[ \u00A0]$/.exec(before);
  if (!w || CALENDAR_RE.test(w[1])) return false;
  const head = before.slice(0, w.index + w[0].length - w[1].length - 1).trimEnd();
  return !!head && !/[.!?:;\n]["'”’)\]]*$/.test(head);
}
