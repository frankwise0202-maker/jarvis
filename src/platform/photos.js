// Free reference photos from Wikimedia Commons (no key, no tokens), searched from the browser.
// The search half (no DOM); the photo strip and viewer are in src/ui/photos.js.
//
//   searchPhotos(query, { fetch, limit = 12, thumbWidth = 500, timeoutMs = 10000, signal })
//     -> Promise<Photo[]>; rejects with PhotoSearchError { kind, message } where kind is
//        'offline' | 'timeout' | 'http' | 'invalid' | 'aborted'.
//   Photo = { title, thumbUrl, fullUrl, width, height, author, license, licenseUrl, credit,
//             description, pageUrl }
//   htmlToText(html, max) -> plain text (a tiny tag stripper and entity decoder; never innerHTML)
//   buildSearchUrl, parseSearchResponse, cleanQuery, safeUploadUrl (exported for tests)
//
// Privacy and safety:
//   - One anonymous GET to https://commons.wikimedia.org/w/api.php with origin=* (CORS without
//     credentials, no custom headers, no referrer). The search words go to Wikimedia.
//   - Only images on https://upload.wikimedia.org/ are ever shown; anything else is dropped.
//   - Credits are plain text; the only link is the file's Commons page (https only).
//   - CSP: connect-src https://commons.wikimedia.org; img-src https://upload.wikimedia.org.

export const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const UPLOAD_ORIGIN = 'https://upload.wikimedia.org';
const COMMONS_ORIGIN = 'https://commons.wikimedia.org';
const VIEW_WIDTH = 1280; // the size requested for the full-screen viewer
const SHOWABLE = /^image\/(jpeg|png|gif|webp|svg\+xml|tiff)$/;
const DIRECT = /^image\/(jpeg|png|gif|webp)$/; // originals a browser can show as they are

export class PhotoSearchError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'PhotoSearchError';
    this.kind = kind;
  }
}

export const PHOTO_MESSAGES = Object.freeze({
  offline: "Couldn't reach Wikimedia Commons. Check the connection and try again.",
  timeout: 'Wikimedia Commons took too long to answer. Try again.',
  http: 'Wikimedia Commons had a problem with the search. Try again in a moment.',
  invalid: 'Wikimedia Commons sent an answer Jarvis could not read.',
  aborted: 'The photo search was cancelled.',
});

// ---------------------------------------------------------------------------------------------
// Text helpers

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', copy: '\u00a9',
  reg: '\u00ae', middot: '\u00b7', laquo: '\u00ab', raquo: '\u00bb', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  times: '\u00d7', deg: '\u00b0', eacute: '\u00e9', egrave: '\u00e8', aacute: '\u00e1', agrave: '\u00e0', iacute: '\u00ed', oacute: '\u00f3',
  uacute: '\u00fa', auml: '\u00e4', ouml: '\u00f6', uuml: '\u00fc', Auml: '\u00c4', Ouml: '\u00d6', Uuml: '\u00dc', szlig: '\u00df',
  ntilde: '\u00f1', ccedil: '\u00e7', aring: '\u00e5', oslash: '\u00f8', ae: '\u00e6',
};
const BREAKS = new Set(['br', 'p', 'div', 'li', 'tr', 'td', 'th', 'dd', 'dt', 'ul', 'ol', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi, (m, body) => {
    if (body[0] === '#') {
      const cp = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '';
      return String.fromCodePoint(cp);
    }
    const named = Object.prototype.hasOwnProperty.call(ENTITIES, body) ? ENTITIES[body] : Object.prototype.hasOwnProperty.call(ENTITIES, body.toLowerCase()) ? ENTITIES[body.toLowerCase()] : undefined;
    return named === undefined ? m : named;
  });
}

/**
 * Plain text from a small HTML fragment (Commons metadata is HTML): tags removed (quoted '>'
 * inside attributes handled), <script>/<style> contents and comments dropped, entities decoded,
 * whitespace collapsed, cut to `max` characters. The result is only ever used as text.
 */
export function htmlToText(html, max = 300) {
  if (typeof html !== 'string' || !html) return '';
  let out = '';
  let skip = null;
  let i = 0;
  const n = html.length;
  while (i < n) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    const ch = html[i];
    if (ch === '<' && /[a-zA-Z/!]/.test(html[i + 1] || '')) {
      let j = i + 1;
      let quote = null;
      while (j < n) {
        const c = html[j];
        if (quote) {
          if (c === quote) quote = null;
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      const inner = html.slice(i + 1, j).trim().toLowerCase();
      const closing = inner.startsWith('/');
      const name = inner.replace(/^\//, '').split(/[\s/>]/)[0];
      if (skip) {
        if (closing && name === skip) skip = null;
      } else if (name === 'script' || name === 'style') {
        if (!closing) skip = name;
      } else if (BREAKS.has(name)) out += ' ';
      i = j + 1;
      continue;
    }
    if (!skip) out += ch;
    i++;
  }
  const text = decodeEntities(out).replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${Array.from(text).slice(0, Math.max(1, max - 1)).join('').trimEnd()}…`;
}

/** The search words: one clean line, search operators (word:) removed, at most 100 characters. */
export function cleanQuery(query) {
  if (typeof query !== 'string') return '';
  return query
    .replace(CONTROL, ' ')
    .replace(/\b[a-z][a-z-]*:/gi, ' ')
    .replace(/[<>{}[\]|\\^`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
    .trim();
}

/** The URL as text when it is an https URL on upload.wikimedia.org, else null. */
export function safeUploadUrl(value) {
  if (typeof value !== 'string' || !value) return null;
  let u;
  try {
    u = new URL(value.startsWith('//') ? `https:${value}` : value);
  } catch {
    return null;
  }
  if (u.origin !== UPLOAD_ORIGIN || u.username || u.password) return null;
  return u.href;
}

function safeCommonsPage(value, title) {
  try {
    const u = new URL(typeof value === 'string' && value.startsWith('//') ? `https:${value}` : value);
    if (u.origin === COMMONS_ORIGIN && !u.username && !u.password) return u.href;
  } catch {
    /* fall through */
  }
  return `${COMMONS_ORIGIN}/wiki/${encodeURIComponent(String(title || '').replace(/ /g, '_')).replace(/%3A/gi, ':')}`;
}

function safeHttps(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Search

/** The API URL for a search (exported for tests). */
export function buildSearchUrl(query, { limit = 12, thumbWidth = 500, types = 'bitmap|drawing' } = {}) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    origin: '*',
    generator: 'search',
    gsrsearch: `${query} filetype:${types}`,
    gsrnamespace: '6',
    gsrlimit: String(Math.max(1, Math.min(30, limit | 0 || 12))),
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: String(thumbWidth),
    iiextmetadatafilter: 'Artist|LicenseShortName|LicenseUrl|ImageDescription|Credit',
    iiextmetadatalanguage: 'en',
  });
  return `${COMMONS_API}?${params.toString()}`;
}

/** One API page -> Photo objects (sorted by search rank, unsafe entries dropped). */
export function parseSearchResponse(data) {
  if (!data || typeof data !== 'object') throw new PhotoSearchError('invalid', PHOTO_MESSAGES.invalid);
  if (data.error) throw new PhotoSearchError('http', PHOTO_MESSAGES.http);
  const query = data.query;
  if (!query) return []; // no hits: the API leaves out "query"
  const raw = Array.isArray(query.pages) ? query.pages : query.pages && typeof query.pages === 'object' ? Object.values(query.pages) : [];
  const pages = raw.filter((p) => p && typeof p === 'object').sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  const out = [];
  for (const page of pages) {
    const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : null;
    if (!info || typeof info !== 'object') continue;
    const mime = typeof info.mime === 'string' ? info.mime : '';
    if (!SHOWABLE.test(mime)) continue;
    const thumbUrl = safeUploadUrl(info.thumburl) || (DIRECT.test(mime) ? safeUploadUrl(info.url) : null);
    if (!thumbUrl) continue;
    const width = Number(info.width) > 0 ? Number(info.width) : Number(info.thumbwidth) || 0;
    const height = Number(info.height) > 0 ? Number(info.height) : Number(info.thumbheight) || 0;
    if (!width || !height) continue;
    let fullUrl = null;
    const thumb = safeUploadUrl(info.thumburl);
    // Thumbnail names end in "<n>px-<name>" (or "page1-<n>px-", "lossy-page1-<n>px-"): ask for a
    // viewer-sized one when the original is larger.
    if (thumb && width > VIEW_WIDTH && /(^|[/-])\d+px-[^/]+$/.test(thumb)) fullUrl = safeUploadUrl(thumb.replace(/(^|[/-])(\d+)px-([^/]+)$/, `$1${VIEW_WIDTH}px-$3`));
    if (!fullUrl && DIRECT.test(mime)) fullUrl = safeUploadUrl(info.url);
    if (!fullUrl) fullUrl = thumbUrl;
    const meta = info.extmetadata && typeof info.extmetadata === 'object' ? info.extmetadata : {};
    const field = (name, max) => htmlToText(meta[name] && typeof meta[name].value === 'string' ? meta[name].value : '', max);
    const title = htmlToText(String(page.title || ''), 160).replace(/^File:/i, '').replace(/_/g, ' ');
    out.push({
      title,
      thumbUrl,
      fullUrl,
      width,
      height,
      author: field('Artist', 120) || 'Unknown author',
      license: field('LicenseShortName', 60),
      licenseUrl: safeHttps(meta.LicenseUrl && meta.LicenseUrl.value) || null,
      credit: field('Credit', 160),
      description: field('ImageDescription', 300),
      pageUrl: safeCommonsPage(info.descriptionurl, page.title),
    });
  }
  return out;
}

async function fetchJson(url, { fetch: fetchFn, timeoutMs, signal }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    let res;
    try {
      res = await fetchFn(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'default', signal: controller.signal });
    } catch (err) {
      if (timedOut) throw new PhotoSearchError('timeout', PHOTO_MESSAGES.timeout);
      if (signal && signal.aborted) throw new PhotoSearchError('aborted', PHOTO_MESSAGES.aborted);
      throw new PhotoSearchError('offline', PHOTO_MESSAGES.offline);
    }
    if (!res || !res.ok) throw new PhotoSearchError('http', PHOTO_MESSAGES.http);
    try {
      return await res.json();
    } catch {
      if (timedOut) throw new PhotoSearchError('timeout', PHOTO_MESSAGES.timeout);
      if (signal && signal.aborted) throw new PhotoSearchError('aborted', PHOTO_MESSAGES.aborted);
      throw new PhotoSearchError('invalid', PHOTO_MESSAGES.invalid);
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

/**
 * Search Commons for photos of `query`. Resolves [] for an empty query or no results. When
 * the bitmap-or-drawing filter finds nothing, it retries once with bitmaps only.
 */
export async function searchPhotos(query, { fetch: fetchFn = globalThis.fetch, limit = 12, thumbWidth = 500, timeoutMs = 10000, signal } = {}) {
  const q = cleanQuery(query);
  if (!q) return [];
  if (typeof fetchFn !== 'function') throw new PhotoSearchError('offline', PHOTO_MESSAGES.offline);
  const opts = { fetch: fetchFn, timeoutMs, signal };
  const first = parseSearchResponse(await fetchJson(buildSearchUrl(q, { limit, thumbWidth }), opts));
  if (first.length) return first.slice(0, limit);
  return parseSearchResponse(await fetchJson(buildSearchUrl(q, { limit, thumbWidth, types: 'bitmap' }), opts)).slice(0, limit);
}

