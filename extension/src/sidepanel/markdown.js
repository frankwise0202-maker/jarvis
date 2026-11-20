// A small, safe Markdown renderer for Jarvis's answers (they are short): paragraphs, line
// breaks, headings (shown as bold lines), bullet and numbered lists, **bold**, *italic*, `code`,
// [links](https://…) and bare https:// URLs. DOM construction only (no HTML parsing): model and
// page-derived text can never inject markup. Links must be absolute http(s) URLs and open in a
// new tab without a referrer. A link never shows one address and opens another: text that looks
// like an address (or a site) is kept only when it names exactly the address the link opens
// (host, port, path, query and #fragment); otherwise the real address is shown instead, whole,
// decoded, with anything invisible in it made visible. The site a link opens is shown after it
// when its text doesn't say.

import { h, safeUrl } from './dom.js';
import { revealText } from '../shared/util.js';
import { decodeDeep } from '../background/address.js';

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

/** Whether link text that looks like an address names exactly `url` (scheme optional, "www." and a trailing "/" alone aside). */
export function namesAddress(text, url) {
  const t = String(text ?? '').trim();
  let a;
  let b;
  try {
    a = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `${new URL(url).protocol}//${t}`);
    b = new URL(url);
  } catch {
    return false;
  }
  const host = (u) => u.hostname.toLowerCase().replace(/^www\./, '');
  return a.protocol === b.protocol && host(a) === host(b) && a.port === b.port && a.pathname === b.pathname && a.search === b.search && a.hash === b.hash && !a.username && !a.password && !b.username && !b.password;
}

/** An address shown in an answer: whole, decoded, with anything invisible made visible. */
export function shownAddress(url) {
  try {
    const u = new URL(url);
    const user = u.username || u.password ? `${decodeDeep(u.username)}${u.password ? `:${decodeDeep(u.password)}` : ''}@` : '';
    return revealText(`${u.protocol}//${user}${u.host}${decodeDeep(u.pathname)}${u.search ? decodeDeep(u.search) : ''}${u.hash ? decodeDeep(u.hash) : ''}`);
  } catch {
    return revealText(String(url ?? ''));
  }
}

/** A link: [text](href). Returns its nodes (the link, and the site it opens when its text doesn't say). */
export function link(href, text) {
  const url = safeUrl(href);
  if (!url) return [document.createTextNode(text)];
  const host = hostOf(url);
  const named = textHost(text);
  // Text that names an address (or a site) other than exactly the one the link opens (another
  // site, or the same one with another path, query or port) shows the real one instead.
  const shown = named && !namesAddress(text, url) ? shownAddress(url) : text;
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
    } else if (/^https?:/.test(tok)) out.push(...link(tok, tok));
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
