// Web addresses as the safety rules see them. Pure functions, no chrome.* access (the page agent
// bundles this module too, through guard.js).
//
//   addressKey(url)       one form for every way of writing the same address: %XX decoded (more
//                         than once), case folded, dot segments and ";params" resolved, the query's
//                         order ignored, a trailing slash ignored, no #fragment. Addresses the owner
//                         declined, and the results of steps they approved, are matched by it.
//   classifyAddress(url)  whether opening the address looks like it does something (an old-style
//                         GET action link "/act/delete?id=7", an add-to-cart link "?add-to-cart=42",
//                         a link carrying a security token): { category, word } or null. The words
//                         are read in the decoded path, query names and query values, split at
//                         separators and camelCase ("addToCart" -> add, to, cart).
//
// A word list cannot know what a server does with a GET: an address with no such word can still
// act (README, Known limits). The checks are deliberately broad: a false alarm only asks.

const ROUNDS = 3;

/** %XX decoded until it stops changing (at most 3 rounds); invalid sequences are decoded byte by byte. */
export function decodeDeep(value) {
  let out = String(value ?? '');
  for (let i = 0; i < ROUNDS && out.includes('%'); i++) {
    let next;
    try {
      next = decodeURIComponent(out);
    } catch {
      next = out.replace(/%([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    }
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * The parts of an http(s) address, decoded: { origin, segments (lowercase), raw (decoded, case kept),
 * params: [[name, value]] (lowercase), rawParams } or null.
 */
export function addressParts(url) {
  let u;
  try {
    u = new URL(String(url ?? ''));
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const raw = [];
  for (const piece of u.pathname.split('/')) {
    // ";jsessionid=…" and other path parameters are not part of what the server routes on.
    const seg = decodeDeep(piece.split(';')[0]);
    // A decoded segment may hold slashes (%2F) or dot segments (%2e%2e): resolve them as a server would.
    for (const part of seg.split(/[\\/]+/)) {
      if (!part || part === '.') continue;
      if (part === '..') {
        raw.pop();
        continue;
      }
      raw.push(part);
    }
  }
  const rawParams = [];
  for (const [k, v] of new URLSearchParams(u.search)) rawParams.push([decodeDeep(k), decodeDeep(v)]);
  return {
    origin: `${u.protocol}//${host}${u.port ? `:${u.port}` : ''}`,
    segments: raw.map((s) => s.toLowerCase()),
    raw,
    params: rawParams.map(([k, v]) => [k.toLowerCase(), v.toLowerCase()]),
    rawParams,
  };
}

/** One normalised form of an address (see the module comment), or '' for anything but http(s). */
export function addressKey(url) {
  const p = addressParts(url);
  if (!p) return '';
  const query = p.params.map(([k, v]) => `${k}=${v}`).sort();
  return `${p.origin}/${p.segments.join('/')}${query.length ? `?${query.join('&')}` : ''}`;
}

// Words in an address that say a GET does something, by what it would be (the categories of
// guard.js; 'change' is anything else that acts, or a word that names a page as often as an
// action: "checkout", "order", "payment", "post", "confirm" open pages to look at too, so they
// ask as ordinary steps). Multi-word ones are joined with "-".
const VERBS = [
  ['delete', ['delete', 'del', 'remove', 'rm', 'destroy', 'trash', 'erase', 'wipe', 'purge', 'cancel', 'empty', 'clear', 'deactivate', 'unregister']],
  ['purchase', ['buy', 'purchase', 'pay', 'transfer', 'withdraw', 'withdrawal', 'donate', 'bid', 'redeem', 'charge', 'tip', 'rent', 'one-click', 'buy-now', 'place-order']],
  ['send', ['send', 'invite', 'forward']],
  ['post', ['publish', 'tweet', 'retweet', 'repost']],
  ['account', ['logout', 'log-out', 'logoff', 'log-off', 'signout', 'sign-out', 'sign-off', 'unsubscribe', 'revoke', 'authorize', 'authorise', 'grant', 'disable', 'enable', 'activate', 'reset', 'optout', 'opt-out', 'unlink', 'disconnect']],
  ['agreement', ['accept', 'agree', 'approve', 'consent']],
  ['download', ['download', 'dl', 'install', 'exec', 'execute']],
  ['change', [
    'act', 'action', 'do', 'cmd', 'op', 'run', 'add', 'add-to-cart', 'addtocart', 'atc', 'checkout', 'check-out', 'order', 'payment', 'post', 'share', 'confirm',
    'archive', 'like', 'unlike', 'follow', 'unfollow', 'vote', 'upvote', 'downvote', 'subscribe', 'star', 'unstar', 'fav', 'favorite', 'favourite', 'unfavorite',
    'block', 'unblock', 'ban', 'mute', 'unmute', 'report', 'flag', 'hide', 'unhide', 'decline', 'reject', 'rate', 'rsvp', 'join', 'leave', 'claim', 'apply',
    'reserve', 'save', 'update', 'create', 'set', 'toggle', 'mark', 'move', 'kick', 'restore', 'submit', 'enroll', 'enrol',
    'token', 'nonce', 'csrf', 'xsrf', 'wpnonce', 'authenticity-token', 'signature', 'sig', 'hmac',
  ]],
];
const VERB_CATEGORY = new Map();
for (const [category, words] of VERBS) for (const w of words) if (!VERB_CATEGORY.has(w)) VERB_CATEGORY.set(w, category);

// A cart (or wish list) address with a query adds something to it ("/cart.php?product=42").
const CART_NOUNS = new Set(['cart', 'basket', 'bag', 'trolley', 'wishlist', 'wish-list']);
// Query parameters whose values are the owner's search words, or a sort order: never read as verbs
// (a search for "delete account" opens results, it deletes nothing).
const SEARCH_PARAMS = new Set(['q', 'query', 'search', 'search_query', 'searchterm', 'search_term', 's', 'k', 'kw', 'keyword', 'keywords', 'term', 'terms', 'text', 'find', 'wd', 'w', 'p_q']);
const SORT_PARAMS = new Set(['order', 'orderby', 'order_by', 'sort', 'sortby', 'sort_by', 'dir', 'direction']);
const ORDINARY_PARAMS = new Set(['page', 'p', 'pg', 'start', 'offset', 'limit', 'per_page', 'count', 'cursor', 'after', 'before', 'lang', 'hl', 'gl', 'locale', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ref', 'ref_', 'src', 'source', 'gclid', 'fbclid', 'igshid', 'si', 'feature', 'via']);

/** Words of a piece of an address: split at separators and camelCase, lowercase. */
export function addressTokens(text) {
  return String(text ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

// The strongest reading wins: "/act/delete" deletes (not just "acts").
const PRIORITY = ['delete', 'purchase', 'send', 'post', 'account', 'agreement', 'download', 'change'];

/** Every verb in a list of words (single words, and adjacent pairs and triples joined with "-"). */
function verbsIn(words, where, out) {
  for (let i = 0; i < words.length; i++) {
    for (const n of [3, 2, 1]) {
      if (i + n > words.length) continue;
      const w = words.slice(i, i + n).join('-');
      const category = VERB_CATEGORY.get(w);
      if (category) out.push({ category, word: w, where });
    }
  }
}

/**
 * Whether opening `url` looks like it does something: { category, word, where } or null.
 * `category` is a guard category (purchase, send, post, delete, account, agreement, download) or
 * 'change' (it acts, but how is not clear); `word` is what gave it away, for the owner's prompt.
 */
export function classifyAddress(url) {
  const p = addressParts(url);
  if (!p) return null;
  const found = [];
  const pathWords = p.raw.flatMap(addressTokens);
  verbsIn(pathWords, 'path', found);
  for (const [name, value] of p.rawParams) {
    const n = name.toLowerCase();
    // A security token in a link: the link does something its site protects.
    if (/(^|[_-])(csrf|xsrf|nonce|wpnonce|token|authenticity_token|signature|sig|hmac)$/i.test(n)) found.push({ category: 'change', word: name.slice(0, 40), where: 'query' });
    if (!SORT_PARAMS.has(n) && !ORDINARY_PARAMS.has(n)) {
      const nameWords = addressTokens(name);
      verbsIn(nameWords, 'query', found);
      if (nameWords.some((w) => CART_NOUNS.has(w))) found.push({ category: 'change', word: name.slice(0, 40), where: 'query' });
    }
    if (SEARCH_PARAMS.has(n)) continue;
    const valueWords = addressTokens(value);
    verbsIn(valueWords, 'query', found);
    if (valueWords.length <= 3 && valueWords.some((w) => CART_NOUNS.has(w))) found.push({ category: 'change', word: value.slice(0, 40), where: 'query' });
  }
  if (p.rawParams.length && pathWords.some((w) => CART_NOUNS.has(w))) found.push({ category: 'change', word: pathWords.find((w) => CART_NOUNS.has(w)), where: 'path' });
  if (!found.length) return null;
  found.sort((a, b) => PRIORITY.indexOf(a.category) - PRIORITY.indexOf(b.category));
  return found[0];
}
