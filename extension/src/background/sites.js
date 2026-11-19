// URL policy and sites: which URLs Jarvis may open or act on, and the "site" (registrable domain)
// that site permissions are keyed by. Pure functions, no chrome.* access.

// Public suffixes with more than one label that people commonly meet. Chrome does not expose its
// Public Suffix List to extensions, so this is a compact subset: country second-level domains and
// hosting platforms where every customer gets a subdomain. A host under a suffix missing here is
// grouped one level too broadly (e.g. "a.example.xy" and "b.example.xy" count as one site), which
// only means one permission prompt covers both.
const MULTI_LABEL_SUFFIXES = new Set(
  `
  co.uk org.uk me.uk ltd.uk plc.uk net.uk ac.uk gov.uk nhs.uk sch.uk police.uk
  com.au net.au org.au edu.au gov.au asn.au id.au
  co.nz net.nz org.nz govt.nz ac.nz
  co.jp ne.jp or.jp ac.jp go.jp gr.jp ed.jp lg.jp
  co.kr or.kr ne.kr go.kr ac.kr
  com.cn net.cn org.cn gov.cn edu.cn
  com.hk org.hk net.hk edu.hk gov.hk
  com.tw org.tw net.tw edu.tw gov.tw
  com.sg org.sg net.sg edu.sg gov.sg
  com.my org.my net.my edu.my gov.my
  co.in firm.in net.in org.in gen.in ind.in ac.in edu.in gov.in
  co.id or.id ac.id go.id web.id
  co.th or.th ac.th go.th in.th
  com.ph org.ph net.ph gov.ph edu.ph
  com.vn net.vn org.vn edu.vn gov.vn
  com.br net.br org.br gov.br edu.br art.br
  com.mx org.mx gob.mx edu.mx net.mx
  com.ar org.ar gob.ar net.ar edu.ar
  com.co org.co net.co gov.co edu.co
  com.pe org.pe gob.pe net.pe
  co.za org.za gov.za ac.za net.za
  com.tr org.tr gov.tr edu.tr net.tr
  com.sa org.sa gov.sa edu.sa net.sa
  co.il org.il gov.il ac.il net.il
  com.eg org.eg gov.eg edu.eg
  com.ng org.ng gov.ng edu.ng
  co.ke or.ke go.ke ac.ke
  com.pk org.pk gov.pk edu.pk net.pk
  com.ua org.ua gov.ua net.ua edu.ua
  com.pl net.pl org.pl
  co.at or.at gv.at ac.at
  com.es org.es gob.es nom.es
  com.pt org.pt gov.pt
  com.gr org.gr gov.gr edu.gr
  co.it
  github.io githubusercontent.com gitlab.io vercel.app netlify.app pages.dev workers.dev
  herokuapp.com appspot.com web.app firebaseapp.com blogspot.com wordpress.com
  azurewebsites.net cloudfront.net amazonaws.com s3.amazonaws.com onrender.com fly.dev
  myshopify.com squarespace.com wixsite.com webflow.io glitch.me repl.co replit.app
  `
    .split(/\s+/)
    .filter(Boolean),
);

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
 * bbc.co.uk for www.bbc.co.uk, shop.localhost for shop.localhost, 127.0.0.1 for 127.0.0.1.
 */
export function siteOf(urlOrHost) {
  let host = String(urlOrHost || '');
  if (/^[a-z][a-z0-9+.-]*:/i.test(host)) host = hostOf(host);
  host = host.toLowerCase().replace(/\.$/, '');
  if (!host) return '';
  if (host.startsWith('[') || IPV4.test(host)) return host; // IP addresses are their own site
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  for (let take = Math.min(4, labels.length - 1); take >= 2; take--) {
    const suffix = labels.slice(-take).join('.');
    if (MULTI_LABEL_SUFFIXES.has(suffix)) return labels.slice(-(take + 1)).join('.');
  }
  return labels.slice(-2).join('.');
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
  const reason = blockedReason(parsed.href);
  if (reason) return { error: `Error: Navigation refused: ${reason}.` };
  return { url: parsed.href };
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
