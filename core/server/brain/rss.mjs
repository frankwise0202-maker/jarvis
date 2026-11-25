// Headlines from public RSS and Atom feeds (general and tech news). The parser is a tolerant scanner, not
// an XML parser: it reads what it can from any text (broken markup, HTML, binary noise, huge input) in
// linear time and never throws.

import { fetchText, oneLine, httpUrl } from './util.mjs';

export const FEEDS = Object.freeze([
  Object.freeze({ name: 'NPR', kind: 'general', url: 'https://feeds.npr.org/1001/rss.xml' }),
  Object.freeze({ name: 'BBC News', kind: 'general', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' }),
  Object.freeze({ name: 'Ars Technica', kind: 'tech', url: 'https://feeds.arstechnica.com/arstechnica/index' }),
  Object.freeze({ name: 'The Verge', kind: 'tech', url: 'https://www.theverge.com/rss/index.xml' }),
]);

const MAX_INPUT = 2_000_000;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8}|#39);/gi, (m, e) => {
    const k = e.toLowerCase();
    if (k[0] === '#') {
      const cp = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ' ';
    }
    return ENTITIES[k] ?? m;
  });
}

function textOf(raw) {
  let s = raw;
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<[^>]{0,500}>/g, ' ');
  return oneLine(decode(decode(s)), 300);
}

/** The inner text of the first <name …>…</name> in body (name may carry a prefix: "dc:date"). */
function tagText(body, name) {
  const lower = body.toLowerCase();
  const open = `<${name.toLowerCase()}`;
  let i = lower.indexOf(open);
  while (i >= 0) {
    const after = lower[i + open.length];
    if (after === '>' || after === ' ' || after === '\t' || after === '\n' || after === '\r' || after === '/') break;
    i = lower.indexOf(open, i + 1);
  }
  if (i < 0) return '';
  const gt = body.indexOf('>', i);
  if (gt < 0) return '';
  if (body[gt - 1] === '/') return '';
  const close = lower.indexOf(`</${name.toLowerCase()}`, gt);
  if (close < 0) return '';
  return body.slice(gt + 1, close);
}

/** The best link of an Atom entry: rel="alternate" (or no rel) href. */
function atomLink(body) {
  const re = /<link\b([^>]{0,500})>/gi;
  let m;
  let fallback = null;
  let n = 0;
  while ((m = re.exec(body)) && n < 20) {
    n += 1;
    const attrs = m[1];
    const href = /href\s*=\s*["']([^"']{1,2000})["']/i.exec(attrs)?.[1];
    if (!href) continue;
    const rel = /rel\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1]?.toLowerCase() ?? 'alternate';
    if (rel === 'alternate') return decode(href);
    fallback ??= decode(href);
  }
  return fallback;
}

/** [{ title, url, publishedAt (ms) | null }] from feed text; [] for anything unreadable. */
export function parseFeed(text, { max = 30 } = {}) {
  try {
    if (typeof text !== 'string' || !text) return [];
    const s = text.length > MAX_INPUT ? text.slice(0, MAX_INPUT) : text;
    const lower = s.toLowerCase();
    const out = [];
    let pos = 0;
    while (out.length < max) {
      const iItem = lower.indexOf('<item', pos);
      const iEntry = lower.indexOf('<entry', pos);
      let start = -1;
      let name = '';
      if (iItem >= 0 && (iEntry < 0 || iItem < iEntry)) {
        start = iItem;
        name = 'item';
      } else if (iEntry >= 0) {
        start = iEntry;
        name = 'entry';
      }
      if (start < 0) break;
      const next = lower[start + name.length + 1];
      if (next && !/[\s>/]/.test(next)) {
        pos = start + 1; // "<items>", "<entryway>": not ours
        continue;
      }
      const end = lower.indexOf(`</${name}`, start);
      if (end < 0) break;
      const body = s.slice(start, end);
      pos = end + name.length + 2;
      const title = textOf(tagText(body, 'title'));
      let link = textOf(tagText(body, 'link'));
      if (!httpUrl(link)) link = atomLink(body) ?? '';
      if (!httpUrl(link)) {
        const guid = textOf(tagText(body, 'guid'));
        link = httpUrl(guid) ? guid : '';
      }
      const url = httpUrl(link);
      if (!title || !url) continue;
      const when = textOf(tagText(body, 'pubDate') || tagText(body, 'published') || tagText(body, 'updated') || tagText(body, 'dc:date'));
      const ms = Date.parse(when);
      out.push({ title, url, publishedAt: Number.isFinite(ms) ? ms : null });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Up to `max` headlines from the feeds, alternating general and tech, newest first within each feed,
 * only items from the last 36 hours when the feed dates them. Feeds that fail are skipped.
 */
export async function fetchHeadlines(fetchFn, { feeds = FEEDS, max = 6, now = Date.now(), timeoutMs = 8000, perFeed = 8 } = {}) {
  const lists = await Promise.all(
    feeds.map(async (f) => {
      const res = await fetchText(fetchFn, f.url, { timeoutMs, maxBytes: 1_500_000, headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
      if (!res.ok) return { feed: f, items: [] };
      const items = parseFeed(res.text, { max: 40 })
        .filter((it) => it.publishedAt === null || (now - it.publishedAt < 36 * 3600_000 && it.publishedAt - now < 3600_000))
        .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
        .slice(0, perFeed);
      return { feed: f, items };
    }),
  );
  return mergeHeadlines(lists, max);
}

/** Round-robin over the feeds (general, tech, general, tech…), without repeats. */
export function mergeHeadlines(lists, max = 6) {
  const general = lists.filter((l) => l.feed.kind !== 'tech');
  const tech = lists.filter((l) => l.feed.kind === 'tech');
  const order = [];
  for (let i = 0; i < Math.max(general.length, tech.length); i += 1) {
    if (general[i]) order.push(general[i]);
    if (tech[i]) order.push(tech[i]);
  }
  const out = [];
  const seen = new Set();
  for (let round = 0; out.length < max && round < 40; round += 1) {
    let any = false;
    for (const l of order) {
      const it = l.items[round];
      if (!it) continue;
      any = true;
      const key = it.title.toLowerCase();
      if (seen.has(key) || seen.has(it.url)) continue;
      seen.add(key);
      seen.add(it.url);
      out.push({ title: it.title, source: l.feed.name, url: it.url });
      if (out.length >= max) break;
    }
    if (!any) break;
  }
  return out;
}
