// A small, safe Markdown renderer for Jarvis's answers (they are short): paragraphs, line
// breaks, headings (shown as bold lines), bullet and numbered lists, **bold**, *italic*, `code`,
// [links](https://…) and bare https:// URLs. DOM construction only (no HTML parsing): model and
// page-derived text can never inject markup. Links must be absolute http(s) URLs and open in a
// new tab without a referrer.

import { h, safeUrl } from './dom.js';

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function link(href, text) {
  const url = safeUrl(href);
  if (!url) return document.createTextNode(text);
  return h('a', { class: 'md-link', href: url, attrs: { target: '_blank', rel: 'noopener noreferrer' }, text });
}

export function inline(text) {
  const out = [];
  let last = 0;
  const s = String(text ?? '');
  for (const m of s.matchAll(INLINE)) {
    if (m.index > last) out.push(document.createTextNode(s.slice(last, m.index)));
    const tok = m[0];
    if (tok.startsWith('**') || tok.startsWith('__')) out.push(h('strong', { text: tok.slice(2, -2) }));
    else if (tok.startsWith('`')) out.push(h('code', { class: 'md-code', text: tok.slice(1, -1) }));
    else if (tok.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      out.push(mm ? link(mm[2], mm[1]) : document.createTextNode(tok));
    } else if (/^https?:/.test(tok)) out.push(link(tok, tok.replace(/^https?:\/\/(www\.)?/, '')));
    else out.push(h('em', { text: tok.slice(1, -1) }));
    last = m.index + tok.length;
  }
  if (last < s.length) out.push(document.createTextNode(s.slice(last)));
  return out;
}

/** Markdown text -> a DocumentFragment. */
export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
  let para = [];
  let list = null;
  const flushPara = () => {
    if (!para.length) return;
    const p = h('p', { class: 'md-p' });
    para.forEach((line, i) => {
      if (i) p.appendChild(h('br'));
      for (const n of inline(line)) p.appendChild(n);
    });
    frag.appendChild(p);
    para = [];
  };
  const flushList = () => {
    if (list) frag.appendChild(list.el);
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const heading = /^\s*#{1,6}\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushPara();
      const kind = bullet ? 'ul' : 'ol';
      if (!list || list.kind !== kind) {
        flushList();
        list = { kind, el: h(kind, { class: `md-list md-${kind}` }) };
      }
      list.el.appendChild(h('li', null, inline(bullet ? bullet[1] : numbered[2])));
      continue;
    }
    flushList();
    if (heading) {
      flushPara();
      frag.appendChild(h('p', { class: 'md-h' }, h('strong', null, inline(heading[1]))));
      continue;
    }
    para.push(line.trim());
  }
  flushPara();
  flushList();
  return frag;
}
