// A small, safe Markdown renderer for Jarvis's answers (they are short): paragraphs, line
// breaks, headings (shown as bold lines), bullet and numbered lists, **bold**, *italic*, `code`,
// [links](https://…) and bare https:// URLs. DOM construction only (no HTML parsing): model and
// page-derived text can never inject markup. Links must be absolute http(s) URLs and open in a
// new tab without a referrer. A link never shows one address and opens another: text that looks
// like an address (or a site) other than where the link goes is replaced by the real address,
// and the site a link opens is shown after it when its text doesn't say.

import { h, safeUrl } from './dom.js';

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\s][^*]*\*|_[^_\s][^_]*_|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

/** The host a link's text names, when the text looks like an address or a site ("shop.com/orders"), else ''. */
export function textHost(text) {
  const t = String(text ?? '').trim();
  const m = /^(?:[a-z][a-z0-9+.-]*:\/\/)?((?:[a-z0-9-]+\.)+[a-z0-9-]{2,})(?::\d+)?(?:[/?#]\S*)?$/i.exec(t);
  return m ? m[1].toLowerCase().replace(/^www\./, '') : '';
}

/** A link: [text](href). Returns its nodes (the link, and the site it opens when its text doesn't say). */
export function link(href, text) {
  const url = safeUrl(href);
  if (!url) return [document.createTextNode(text)];
  const host = hostOf(url);
  const named = textHost(text);
  // Text that names another address than the one the link opens shows the real one instead.
  const shown = named && named !== host ? url.replace(/^https?:\/\/(www\.)?/, '') : text;
  const a = h('a', { class: 'md-link', href: url, attrs: { target: '_blank', rel: 'noopener noreferrer', title: url }, text: shown });
  if (host && !String(shown).toLowerCase().includes(host)) return [a, h('span', { class: 'md-host', text: ` (${host})` })];
  return [a];
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
      if (mm) out.push(...link(mm[2], mm[1]));
      else out.push(document.createTextNode(tok));
    } else if (/^https?:/.test(tok)) out.push(...link(tok, tok.replace(/^https?:\/\/(www\.)?/, '')));
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
