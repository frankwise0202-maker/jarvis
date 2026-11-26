// "Pull this up in Chrome" (v8.1, G1): the local, free matcher for opening a web page by voice, and
// the pure logic around it: which address, whether it is safe, and what Jarvis says. No DOM.
//
//   matchChromeCommand('pull this up in Chrome')     -> { do: 'chrome-open', target: { kind: 'this' }, where: 'auto', … }
//   matchChromeCommand('open the second link')       -> { …, target: { kind: 'link', ordinal: 2 } }
//   matchChromeCommand('google USB-C chargers')      -> { …, target: { kind: 'search', query: 'usb-c chargers' }, check: true }
//   matchChromeCommand('open YouTube')               -> { …, target: { kind: 'site', url: 'https://www.youtube.com/', name: 'YouTube' } }
//   matchChromeCommand('look it up on Google')       -> { …, target: { kind: 'this-search' } }
//   matchChromeCommand('open it in my Chrome')       -> { …, where: 'mine' } (the owner's usual window, never the Jarvis window)
//   matchChromeCommand('close that tab')             -> { do: 'chrome-close-tab' }
//   matchChromeCommand('search for flights to Denver') -> null (no browser word: a question for Jarvis)
//
// Only browser words open the browser: "Chrome", "Google", "tab", "browser", a link, a site's name or
// address. "Look it up", "look it up online", "research …" stay Jarvis's own (paid) answers.
// A search sends the owner's words to Google, so it goes through the 2-second check (check: true);
// "this", links and sites act at once.
//
//   planChromeOpen(target, { thisTarget, links })  -> { url, kind, words?, title?, note? } | { error, say }
//     thisTarget: resolveThis()'s result (src/lib/this-target.js): { kind: 'link' | 'look' | 'live' |
//     'hologram' | 'reply' | 'question' | 'none', words, url?, urls? }; links: the newest reply's links
//     [{ url, title }] in order (screen-targets.js linksOf).
//   safeAddress(raw)       http(s) only, no user name or password, at most 2,048 characters -> href | null
//   searchUrl(words)       the Google search address for the words
//   addressAction(url)     whether opening it looks like it does something (the extension's own
//                          classifyAddress): { category, word, does: 'adds to a cart' } | null
//   chromeLine(outcome)    the one line Jarvis says about an outcome

import { classifyAddress } from '../../extension/src/background/address.js';

const MAX_WORDS = 20;
const ORDINALS = { first: 1, '1st': 1, one: 1, second: 2, '2nd': 2, two: 2, third: 3, '3rd': 3, three: 3, fourth: 4, '4th': 4, four: 4, fifth: 5, '5th': 5, five: 5, last: -1, top: 1 };

/** Sites people name aloud (the name -> its address). Anything else must be said as an address. */
export const CHROME_SITES = Object.freeze({
  youtube: ['https://www.youtube.com/', 'YouTube'],
  amazon: ['https://www.amazon.com/', 'Amazon'],
  google: ['https://www.google.com/', 'Google'],
  'google maps': ['https://maps.google.com/', 'Google Maps'],
  gmail: ['https://mail.google.com/', 'Gmail'],
  wikipedia: ['https://www.wikipedia.org/', 'Wikipedia'],
  netflix: ['https://www.netflix.com/', 'Netflix'],
  github: ['https://github.com/', 'GitHub'],
  reddit: ['https://www.reddit.com/', 'Reddit'],
  ebay: ['https://www.ebay.com/', 'eBay'],
  'best buy': ['https://www.bestbuy.com/', 'Best Buy'],
});

// A plain domain said aloud ("amazon.com", "bestbuy.com"); the speech recognizer writes the dot.
const DOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.(?:com|org|net|io|co|uk|de|fr|edu|gov|ai|app|dev|tv|me|us|ca|au|info|shop|store)$/;

const LEAD = /^(?:(?:hey|hi|ok|okay|so|um|uh|and|alright|all right|well|oh|yo|now)\s+)*(?:jarvis\s+)?(?:(?:hey|ok|okay|so|um|uh|now)\s+)*(?:(?:please|can you please|could you please|would you please|can you|could you|would you|will you|go ahead and|i want you to|id like you to|i would like you to|i need you to|lets|let us)\s+)?(?:just\s+)?/;
const TAIL = /(?:\s+(?:please|jarvis|for me|thanks|thank you|now|right now|real quick|sir))+$/;

/** Lower case, apostrophes joined ("what's" -> "whats"), dots and hyphens kept inside words (amazon.com, usb-c). */
export function normalizeChromeText(text) {
  let s = String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/(\w)'(\w)/g, '$1$2')
    .replace(/[^a-z0-9.\- ]+/g, ' ')
    .replace(/(^|\s)[.\-]+|[.\-]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (let i = 0; i < 3; i++) s = s.replace(LEAD, '').replace(TAIL, '').trim();
  return s;
}

const QUESTION = /^(?:what|whats|why|how|hows|which|who|whos|when|where|wheres|is|are|was|were|does|do|did|should|could i|can i|has|have|had|isnt|arent|doesnt|dont|am|will|would)\b/;
// Where it opens. "In my Chrome", "in a normal tab": the owner's usual window (their sign-ins), even
// when Jarvis for Chrome is linked. Anything else: the Jarvis window when linked, else a tab.
const BROWSER = '(?:google chrome|chrome|my chrome|my google chrome|the chrome|my browser|the browser|a browser|my normal chrome|my usual chrome|my own chrome|my regular chrome|a new tab|new tab|another tab|a tab|a normal tab|a regular tab|a new chrome tab|a chrome tab|chrome tab|a browser tab|my normal browser|my usual browser)';
const IN_BROWSER = `(?:in|on|into|with|using|over in|up in|up on) (${BROWSER})`;
const MINE = /\b(?:my|normal|regular|usual|own)\b/;
const THIS = '(?:this|that|it)(?: (?:page|link|one|thing|up))?';
const THIS_RE = [
  new RegExp(`^(?:pull|bring|put|open|show|load|get|throw|send|take)(?: me)? ${THIS}(?: up)? ${IN_BROWSER}$`),
  new RegExp(`^(?:pull|bring|open|show) up ${THIS} ${IN_BROWSER}$`),
];
const THIS_SEARCH_RE = [
  /^google (?:it|this|that|them)$/,
  /^(?:look|search) (?:it|this|that) up (?:on|in|with) google$/,
  /^search google for (?:it|this|that)$/,
  new RegExp(`^(?:look|search) (?:it|this|that) up ${IN_BROWSER}$`),
];
const LINK_RE = new RegExp(`^(?:open|pull up|bring up|show me|go to|load|click|click on|follow|visit)(?: up)? (?:the )?(?:(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|last|top) )?(?:link|source|result|website|site|article|page)(?: (?:number )?(\\d|one|two|three|four|five))?(?: ${IN_BROWSER})?$`);
// "google … is a company", "google maps is down again": a statement about Google, not a search.
const NOT_QUERY = /^(?:is|was|are|were|has|have|had|does|did|do|will|would|can|could|should|bought|buys|owns|makes|made|said|says|announced|reported|and|or|but|vs|versus)\b/;
// A search that goes on to act on the page is a job for Jarvis for Chrome (a task), not a search tab.
const TASKISH = /\b(?:and|then)\s+(?:add|buy|order|click|put|compare|pick|sort|filter|tell|show|open|find|check|book|reserve|purchase|get|sign|log|fill)\b|\bto (?:the|my) (?:cart|basket|bag)\b/;
const SEARCH_RE = [
  // "search for USB-C chargers in Chrome", "look up the E14 battery on Google", "look them up in Chrome"
  new RegExp(`^(?:search(?: for)?|look up|google) (.+?) (?:${IN_BROWSER}|on google|in google|with google)$`),
  new RegExp(`^(?:search|look) (.+?) up (?:${IN_BROWSER}|on google|in google|with google)$`),
  // "search Google for …", "search Chrome for …"
  /^(?:search|look) (?:on )?(?:google|chrome) (?:for )?(.+)$/,
];
// "google USB-C chargers"
const GOOGLE_RE = /^google (.+)$/;
const SITE_RE = new RegExp(`^(?:open|go to|pull up|bring up|load|take me to|show me)(?: up)? ([a-z0-9. -]+?)(?: ${IN_BROWSER})?$`);
// Things with names of their own in Jarvis: never a web search when "opened in Chrome".
const NOT_A_SITE = /^(?:it|this|that|them|the camera|camera|optics|settings|history|the library|library|voice mode|standby|mission control|the hologram|the blueprint|the report|the answer)$/;
const CLOSE_TAB_RE = /^(?:close|shut) (?:that|the|this|my|the new|that new|the chrome|that chrome) (?:browser |chrome )?tab$/;

function chromeAction(target, where, { check = false } = {}) {
  // Opening a page can't be taken back by an alternative reading: the best reading only (undo false).
  return { do: 'chrome-open', target, where, free: true, undo: false, check, camera: false };
}

const whereOf = (said) => (said && MINE.test(said) ? 'mine' : 'auto');

/** A search for the owner's words (checked first), "this" for "search for it", or null for a task. */
function searchAction(query, said) {
  const q = String(query || '')
    .replace(/^(?:for|up) /, '')
    .replace(/^(?:google|chrome) (?:for )?/, '')
    .trim();
  if (!q || /^(?:it|this|that|them)$/.test(q)) return chromeAction({ kind: 'this-search' }, whereOf(said));
  if (q.split(' ').length > 16 || TASKISH.test(q)) return null;
  return chromeAction({ kind: 'search', query: q }, whereOf(said), { check: true });
}

/** The Chrome command in `text`, or null (see the header). */
export function matchChromeCommand(text) {
  const s = normalizeChromeText(text);
  if (!s || s.split(' ').length > MAX_WORDS) return null;
  if (CLOSE_TAB_RE.test(s)) return { do: 'chrome-close-tab', free: true, undo: false, check: false, camera: false };
  if (QUESTION.test(s)) return null;
  let m;
  for (const re of THIS_RE) {
    m = re.exec(s);
    if (m) return chromeAction({ kind: 'this' }, whereOf(m[1]));
  }
  for (const re of THIS_SEARCH_RE) {
    m = re.exec(s);
    if (m) return chromeAction({ kind: 'this-search' }, whereOf(m[1]));
  }
  m = LINK_RE.exec(s);
  if (m) {
    const ordinal = m[1] ? ORDINALS[m[1]] : m[2] ? Number(ORDINALS[m[2]] || m[2]) : 1;
    return chromeAction({ kind: 'link', ordinal }, whereOf(m[3]));
  }
  for (const re of SEARCH_RE) {
    m = re.exec(s);
    if (m) return searchAction(m[1], m[2]);
  }
  m = GOOGLE_RE.exec(s);
  if (m) {
    const q = m[1].trim();
    // A query has no "is/are/was" unless it is itself a question ("google what is a heat pipe").
    const statement = NOT_QUERY.test(q) || (/\b(?:is|are|was|were|has been|have been)\b/.test(q) && !/^(?:what|how|why|who|when|where|which)\b/.test(q));
    if (!statement) {
      if (q === 'maps') return chromeAction({ kind: 'site', url: CHROME_SITES['google maps'][0], name: CHROME_SITES['google maps'][1] }, 'auto');
      return searchAction(q, '');
    }
  }
  m = SITE_RE.exec(s);
  if (m) {
    const site = m[1].trim().replace(/^the /, '');
    const named = Object.prototype.hasOwnProperty.call(CHROME_SITES, site) ? CHROME_SITES[site] : null;
    const said = m[2] || '';
    if (named) return chromeAction({ kind: 'site', url: named[0], name: named[1] }, whereOf(said));
    if (DOMAIN.test(site)) return chromeAction({ kind: 'site', url: `https://${site}/`, name: site }, whereOf(said));
    // "Open the Lenovo support page in Chrome": not an address, so a search for those words.
    if (said && !NOT_A_SITE.test(m[1].trim()) && site.split(' ').length <= 8 && !TASKISH.test(site)) return chromeAction({ kind: 'search', query: site }, whereOf(said), { check: true });
  }
  return null;
}

// ---- addresses ---------------------------------------------------------------------------------------

/** http(s) only, no user name or password, at most 2,048 characters: the address, or null. */
export function safeAddress(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s) || s.length > 2048) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.href;
  } catch {
    return null;
  }
}

/** The Google search for the words (trimmed to 200 characters). */
export function searchUrl(words) {
  const q = String(words || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

const DOES = {
  delete: 'deletes or cancels something',
  purchase: 'buys or pays for something',
  send: 'sends something',
  post: 'posts something',
  account: 'changes something about an account',
  agreement: 'accepts or agrees to something',
  download: 'downloads something',
  change: 'changes something',
};
const CART = /(?:^|-)(?:cart|basket|bag|trolley|atc|addtocart)$|^add-to-(?:cart|basket|bag)$/;

/**
 * Whether opening `url` looks like it does something ("?add-to-cart=42", "/orders/7/cancel"): the
 * extension's own classifier (extension/src/background/address.js), so a page opened by voice
 * follows the same rule as Jarvis for Chrome. -> { category, word, does } | null
 */
export function addressAction(url) {
  let found = null;
  try {
    found = classifyAddress(url);
  } catch {
    found = null;
  }
  if (!found) return null;
  const word = String(found.word || '').toLowerCase();
  const does = CART.test(word) || (found.category === 'change' && /cart|basket/.test(String(url).toLowerCase())) ? 'adds to a cart' : DOES[found.category] || DOES.change;
  return { category: found.category, word: found.word, does };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The address for a target (see the header): { url, kind: 'page' | 'search' | 'site', words?, title?,
 * note? } or { error: 'nothing' | 'no-link' | 'bad-url', say }. `note` is a line to say as well
 * ("That reply has 3 links; I opened the first.").
 */
export function planChromeOpen(target, { thisTarget = null, links = [] } = {}) {
  const t = target && typeof target === 'object' ? target : {};
  const page = (url, extra = {}) => {
    const href = safeAddress(url);
    return href ? { url: href, kind: 'page', ...extra } : { error: 'bad-url', say: 'I can’t open that address.' };
  };
  const search = (words) => {
    const w = String(words || '').replace(/\s+/g, ' ').trim();
    return w ? { url: searchUrl(w), kind: 'search', words: w } : { error: 'nothing', say: 'There’s nothing to pull up yet.' };
  };
  if (t.kind === 'site') {
    const href = safeAddress(t.url);
    return href ? { url: href, kind: 'site', title: t.name || '' } : { error: 'bad-url', say: 'I can’t open that address.' };
  }
  if (t.kind === 'search') return search(t.query);
  if (t.kind === 'link') {
    const list = Array.isArray(links) ? links.filter((l) => l && typeof l.url === 'string') : [];
    if (!list.length) return { error: 'no-link', say: 'There’s no link in my last answer.' };
    const n = Number.isInteger(t.ordinal) ? t.ordinal : 1;
    const link = n === -1 ? list[list.length - 1] : list[n - 1];
    if (!link) return { error: 'no-link', say: `That reply has ${plural(list.length, 'link')}.` };
    return page(link.url, { title: link.title || '' });
  }
  if (t.kind === 'this' || t.kind === 'this-search') {
    const it = thisTarget && typeof thisTarget === 'object' ? thisTarget : { kind: 'none' };
    const words = typeof it.words === 'string' ? it.words.trim() : '';
    // "Google it": the words of what is on screen, even when it is a link (its title).
    if (t.kind === 'this-search' && words && it.kind !== 'reply') return search(words);
    if (it.kind === 'link' && it.url) return page(it.url, { title: words });
    if (it.kind === 'reply') {
      const urls = (Array.isArray(it.urls) ? it.urls : []).filter((u) => typeof u === 'string');
      if (urls.length === 1) return page(urls[0]);
      if (urls.length > 1) return page(urls[0], { note: `That reply has ${urls.length} links; I opened the first.` });
      return search(words);
    }
    if (it.kind === 'look' || it.kind === 'live' || it.kind === 'hologram' || it.kind === 'question') return search(words);
    return { error: 'nothing', say: 'There’s nothing to pull up yet.' };
  }
  return { error: 'nothing', say: 'There’s nothing to pull up yet.' };
}

/**
 * What Jarvis says about an outcome (one short line). outcome: { status: 'opened' | 'needs_click' |
 * 'needs_tap' | 'nothing' | 'error' | 'closed', via: 'jarvis' | 'tab' | 'window', kind, words,
 * does, beside, hidden, fellBack, note, say, why }
 */
export function chromeLine(o) {
  if (!o || typeof o !== 'object') return '';
  const note = o.note ? ` ${o.note}` : '';
  const fell = o.fellBack ? 'I can’t reach Jarvis for Chrome, so it’s in a normal tab. ' : '';
  switch (o.status) {
    case 'opened': {
      if (o.via === 'jarvis') return `${o.beside ? 'It’s open in the Jarvis window, beside me.' : 'It’s open in the Jarvis window.'}${note}`;
      if (o.kind === 'search' && o.words) return `${fell}${o.via === 'window' ? `Searching Google for ${o.words}, beside me.` : `Searching Google for ${o.words}.`}${note}`;
      if (o.via === 'window') return `${fell}It’s open beside me.${note}`;
      return `${fell}It’s open in Chrome.${note}`;
    }
    case 'needs_click':
      if (o.via === 'jarvis') return 'That address looks like it does something, so it waits for your click in the Jarvis window.';
      return `That address looks like it ${o.does || 'does something'}, so it opens only when you click Open.`;
    case 'needs_tap':
      return o.hidden ? 'I couldn’t open it: allow pop-ups for Jarvis once.' : 'Tap Open in Chrome, and it’ll open.';
    case 'closed':
      return o.count ? 'Closed the tab.' : 'I can only close a tab I opened.';
    case 'nothing':
    case 'error':
    default:
      return o.say || (o.why ? `I can’t open that address: ${o.why}.` : 'I can’t open that address.');
  }
}
