// "This" (v8.1 contract (c)), pure: what "pull this up", "research this" or "search for this" means
// right now. Used by Tracks 3, 4 and 5 (u-voice §3.2).
//
//   resolveThis({ linkOnScreen, look, liveSummary, hologram, reply, lastQuestion })
//     -> { kind: 'link'|'look'|'live'|'hologram'|'reply'|'question'|'none', words, url?, urls? }
//
// The first that is there wins, in this order:
//   linkOnScreen  a link window or panel on screen: 'https://…' or { url, title }     -> 'link' (url)
//   look          a Look on screen: { labels: ['AA battery' | { text }], selected: index | null,
//                 answer? }: the tapped label, else the first one                    -> 'look' (words)
//   liveSummary   the live view's latest summary (v8.0)                               -> 'live' (words)
//   hologram      a hologram on screen: { title, part? } ("Laptop battery")           -> 'hologram' (words)
//   reply         the newest reply: { links: ['https://…', …] }: its first link, and all of them in
//                 urls (several: "That reply has 3 links; I opened the first.")       -> 'reply' (url, urls)
//   lastQuestion  the owner's last question                                           -> 'question' (words)
//   nothing                                                                           -> 'none'
// Only http and https addresses without a user name or password count as links (never javascript:,
// data: or file:). Words are one plain line, at most 200 characters.

const MAX_WORDS = 200;

/** An http(s) address without credentials, or ''. */
export function safeUrl(raw) {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s) || s.length > 2048) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    if (u.username || u.password) return '';
    return u.href;
  } catch {
    return '';
  }
}

function line(value) {
  const s = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > MAX_WORDS ? s.slice(0, MAX_WORDS).trimEnd() : s;
}

function labelText(label) {
  if (typeof label === 'string') return line(label);
  if (label && typeof label === 'object') return line(label.text ?? label.label ?? label.name ?? '');
  return '';
}

export function resolveThis({ linkOnScreen = null, look = null, liveSummary = '', hologram = null, reply = null, lastQuestion = '' } = {}) {
  const link = typeof linkOnScreen === 'string' ? { url: linkOnScreen } : linkOnScreen && typeof linkOnScreen === 'object' ? linkOnScreen : null;
  const linkUrl = link ? safeUrl(link.url) : '';
  if (linkUrl) return { kind: 'link', words: line(link.title) || linkUrl, url: linkUrl };

  if (look && typeof look === 'object') {
    const labels = (Array.isArray(look.labels) ? look.labels : []).map(labelText).filter(Boolean);
    const at = Number.isInteger(look.selected) ? look.selected : -1;
    const picked = at >= 0 && at < labels.length ? labels[at] : labels[0] || '';
    if (picked) return { kind: 'look', words: picked };
  }

  const live = line(liveSummary);
  if (live) return { kind: 'live', words: live };

  if (hologram && typeof hologram === 'object') {
    const words = line([hologram.title, hologram.part].map(line).filter(Boolean).join(' '));
    if (words) return { kind: 'hologram', words };
  }

  if (reply && typeof reply === 'object') {
    const urls = [];
    for (const u of Array.isArray(reply.links) ? reply.links : []) {
      const url = safeUrl(typeof u === 'string' ? u : u && u.url);
      if (url && !urls.includes(url)) urls.push(url);
    }
    if (urls.length) return { kind: 'reply', words: '', url: urls[0], urls };
  }

  const asked = line(lastQuestion);
  if (asked) return { kind: 'question', words: asked };

  return { kind: 'none', words: '' };
}
