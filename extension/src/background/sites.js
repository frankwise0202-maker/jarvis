// URL policy and sites: which URLs Jarvis may open or act on, and the "site" (registrable domain)
// that site permissions are keyed by. Pure functions, no chrome.* access.

import PSL_RULES from './psl-data.js';
import { decodeDeep } from './address.js';
import { hiddenText, revealText } from '../shared/util.js';

// Sites follow the Public Suffix List, as Chrome does (a dated snapshot, both its ICANN and its
// private sections: see extension/build/psl.mjs). Hosting and tunnel services where strangers get
// subdomains (ngrok.io, duckdns.org, readthedocs.io, github.io, ...) are public suffixes there, so
// victim.ngrok.io and attacker.ngrok.io are two different sites, each asked about separately.
let rules = null;
function pslRules() {
  if (!rules) {
    rules = { exact: new Set(), wild: new Set(), except: new Set() };
    for (const r of PSL_RULES.split(' ')) {
      if (!r) continue;
      if (r.startsWith('!')) rules.except.add(r.slice(1));
      else if (r.startsWith('*.')) rules.wild.add(r.slice(2));
      else rules.exact.add(r);
    }
  }
  return rules;
}

/**
 * The public suffix of a (lowercase, ASCII) host by the Public Suffix List algorithm: an exception
 * rule wins, then the matching rule with the most labels; with no rule, the last label ("*").
 * `listed` tells whether a rule of the list matched (not just the default).
 */
export function publicSuffix(host) {
  const labels = String(host || '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (!labels.length) return { suffix: '', listed: false };
  const { exact, wild, except } = pslRules();
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.');
    if (except.has(candidate)) return { suffix: labels.slice(i + 1).join('.'), listed: true };
    if (exact.has(candidate)) return { suffix: candidate, listed: true };
    if (i + 1 < labels.length && wild.has(labels.slice(i + 1).join('.'))) return { suffix: candidate, listed: true };
  }
  return { suffix: labels[labels.length - 1], listed: false };
}

/** Whether `site` is itself a public suffix named by the list (a grant for it would cover strangers). */
export function isListedPublicSuffix(site) {
  const host = String(site || '').toLowerCase();
  if (!host || host.startsWith('[') || IPV4.test(host)) return false;
  const { suffix, listed } = publicSuffix(host);
  return listed && suffix === host;
}

/** The URL's hostname in lowercase without a trailing dot, or '' when it has none. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/**
 * The registrable domain ("site") of a URL or host: bestbuy.com for www.bestbuy.com,
 * bbc.co.uk for www.bbc.co.uk, victim.ngrok.io for victim.ngrok.io, shop.localhost for
 * shop.localhost, 127.0.0.1 for 127.0.0.1. A host that is itself a public suffix is its own site.
 */
export function siteOf(urlOrHost) {
  let host = String(urlOrHost || '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(host)) host = hostOf(host);
  host = host.toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  if (host.startsWith('[') || IPV4.test(host)) return host; // IP addresses are their own site
  const { suffix } = publicSuffix(host);
  if (!suffix || suffix === host) return host;
  const labels = host.split('.');
  const take = suffix.split('.').length + 1;
  return labels.slice(-take).join('.');
}

const WEB_STORE_HOSTS = new Set(['chromewebstore.google.com']);

/**
 * Why Jarvis must never act on this URL, or null when it may. Only http(s) pages (and blank
 * tabs) are allowed: never chrome://, other extensions, file://, the Chrome Web Store, data:,
 * javascript: or view-source:.
 */
export function blockedReason(url) {
  const raw = String(url ?? '').trim();
  if (!raw || /^about:blank$/i.test(raw)) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return 'that address is not a valid web address';
  }
  const scheme = parsed.protocol;
  if (scheme === 'chrome:' || scheme === 'chrome-untrusted:' || scheme === 'devtools:' || scheme === 'edge:' || scheme === 'brave:') return "Chrome's own pages are off limits";
  if (scheme === 'chrome-extension:' || scheme === 'moz-extension:') return 'extension pages are off limits';
  if (scheme === 'file:' || scheme === 'filesystem:') return 'files on this computer are off limits';
  if (scheme !== 'http:' && scheme !== 'https:') return `${scheme.replace(/:$/, '')}: addresses are not allowed (only http and https)`;
  const host = parsed.hostname.toLowerCase();
  if (WEB_STORE_HOSTS.has(host) || (host === 'chrome.google.com' && /^\/webstore(\/|$)/i.test(parsed.pathname))) {
    return 'the Chrome Web Store is off limits';
  }
  return null;
}

/** True for tabs Jarvis can work in: http(s) pages and blank tabs. */
export function isActionableUrl(url) {
  const raw = String(url ?? '');
  return (/^https?:/i.test(raw) && blockedReason(raw) === null) || /^about:blank$/i.test(raw);
}

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:/i;
export const HISTORY_KEYWORDS = new Set(['back', 'forward', 'reload']);

/**
 * The `navigate` member's URL rule (browser use tool docs): accept "back" / "forward" / "reload",
 * treat a URL without a scheme as https://, then parse it and refuse every scheme other than
 * http and https. Returns { history } | { url } | { error } (error text is shown to Claude).
 */
export function normalizeNavigateUrl(input) {
  const raw = String(input ?? '').trim();
  if (!raw) return { error: 'Error: navigate needs a url.' };
  const keyword = raw.toLowerCase();
  if (HISTORY_KEYWORDS.has(keyword)) return { history: keyword };
  // A host:port with no scheme ("localhost:8080/x") parses as scheme "localhost:", so only treat
  // the prefix as a scheme when it is followed by "//" or is a known non-hierarchical scheme.
  const looksSchemed = SCHEME_PREFIX.test(raw) && (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) || /^(javascript|data|about|blob|mailto|view-source|chrome|file|filesystem|tel|sms):/i.test(raw));
  const withScheme = looksSchemed ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(withScheme.replace(/\\/g, '/'));
  } catch {
    return { error: `Error: "${truncateUrl(raw)}" is not a valid URL.` };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { error: 'Error: Navigation refused. Only http and https URLs are allowed.' };
  }
  // A user name or password in the address (user:pass@site) reaches the site (Chrome sends it
  // when the site asks for a sign-in) without showing on the page: never opened.
  if (parsed.username || parsed.password) {
    return { error: 'Error: Navigation refused: addresses with a user name or password in them (user:pass@site) are not allowed. Open the address without that part.' };
  }
  const reason = blockedReason(parsed.href);
  if (reason) return { error: `Error: Navigation refused: ${reason}.` };
  // An address the owner is shown is shown whole: one too long to read on a card is not opened.
  if (parsed.href.length > MAX_NAVIGATE_URL) {
    return { error: `Error: Navigation refused: that address is ${parsed.href.length} characters long; Jarvis opens addresses of at most ${MAX_NAVIGATE_URL} characters (the owner may need to read all of it). Use a shorter address.` };
  }
  return { url: parsed.href };
}

/** The longest address navigate opens (an address the owner approves is always shown whole). */
export const MAX_NAVIGATE_URL = 2000;

/**
 * An address as an approval card shows it: whole and exactly as it is sent (scheme, any user
 * name, the full host with any port, the path with its ;params, the query and the #fragment,
 * which the page there can read), with what it reads as when decoded ("%64elete" is "delete",
 * "%F3%A0%80%B4" an invisible character) after it when that differs. Nothing is left out or
 * shortened; what would not show on screen is made visible (revealText).
 */
export function cardAddress(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return revealText(String(url ?? ''));
  }
  const raw = revealText(u.href);
  let reading = u.href;
  try {
    const user = u.username || u.password ? `${decodeDeep(u.username)}${u.password ? `:${decodeDeep(u.password)}` : ''}@` : '';
    const query = u.search ? decodeDeep(u.search.replace(/\+/g, ' ')) : '';
    const hash = u.hash ? decodeDeep(u.hash) : '';
    reading = `${u.protocol}//${user}${u.host}${decodeDeep(u.pathname)}${query}${hash}`;
  } catch {
    reading = u.href;
  }
  return reading === u.href ? raw : `${raw} (reads as: ${revealText(reading)})`;
}

const UNRESERVED = /[A-Za-z0-9\-._~]/;

/**
 * Whether an address Claude built writes something the owner could not see on its card: hidden
 * characters once decoded (see hiddenText), or letters written in a roundabout way that a plain
 * address never uses ("%61" for "a", lowercase "%2f", "%2561" for a doubly written one), any of
 * which can carry data while the address reads the same. Returns what, in words, or ''.
 */
export function addressConcern(url) {
  let u;
  try {
    u = new URL(String(url));
  } catch {
    return '';
  }
  const tail = `${u.pathname}${u.search}${u.hash}`;
  for (const m of tail.matchAll(/%([0-9A-Fa-f]{2})/g)) {
    const hex = m[1];
    if (UNRESERVED.test(String.fromCharCode(parseInt(hex, 16)))) return `a letter or digit written as a code ("%${hex}")`;
    if (/[a-f]/.test(hex)) return `a lowercase escape ("%${hex}")`;
    if (hex.toUpperCase() === '25' && /^%25[0-9A-Fa-f]{2}/.test(tail.slice(m.index))) return 'a doubly written escape ("%25…")';
  }
  const decoded = `${decodeDeep(u.pathname)}${u.search ? decodeDeep(u.search.replace(/\+/g, ' ')) : ''}${u.hash ? decodeDeep(u.hash) : ''}`;
  return hiddenText(decoded, { newlines: false });
}

function truncateUrl(s) {
  return s.length > 200 ? `${s.slice(0, 199)}…` : s;
}

/**
 * A page URL made safe to report to Claude in browser_state: no user:password@, no control or
 * line-separator characters (the API rejects them), at most 2,048 characters.
 */
export function sanitizeUrl(url) {
  let s = String(url ?? '');
  try {
    const u = new URL(s);
    if (u.username || u.password) {
      u.username = '';
      u.password = '';
    }
    s = u.href;
  } catch {
    /* keep as is */
  }
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, '');
  return s.length > 2048 ? s.slice(0, 2048) : s;
}

/** A tab title made safe for browser_state: one line, no control characters, ≤ 300 characters. */
export function sanitizeTitle(title) {
  const s = String(title ?? '')
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 300 ? `${s.slice(0, 299)}…` : s;
}

/**
 * An address for the owner's prompt with its query (which often says what it does:
 * "shop.example/product/42?add-to-cart=42"), decoded as the server reads it ("%64elete" shows
 * "delete"), without the scheme or #fragment, invisible and direction-changing characters
 * removed, shortened.
 */
export function showUrl(url, max = 90) {
  try {
    const u = new URL(url);
    const path = u.pathname === '/' && !u.search ? '' : decodeDeep(u.pathname);
    const query = u.search ? decodeDeep(u.search.replace(/\+/g, ' ')) : '';
    const s = `${u.hostname.replace(/^www\./, '')}${path}${query}`.replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return String(url ?? '').slice(0, max);
  }
}

/** A short, friendly form of a URL for step labels: "bestbuy.com/site/monitors". */
export function shortUrl(url, max = 48) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '');
    const s = `${host}${path}`;
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  } catch {
    return String(url ?? '').slice(0, max);
  }
}
