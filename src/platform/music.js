// Apple Music search (free, no account): the iTunes Search API, called from the browser
// (Access-Control-Allow-Origin: *). Results are parsed strictly by src/lib/music.js (Apple's own
// hosts only), cached in memory for a few minutes, and time out instead of hanging.
//
//   searchMusic('back in black', { kind: 'song' | 'album' | 'artist' | 'playlist', limit, country, fetch, signal })
//     -> { ok: true, items: [MusicItem], kind, country, query, artist? }
//      | { ok: false, error: 'empty' | 'offline' | 'timeout' | 'aborted' | 'network' | 'bad_response', message }
//   topSongs(artistId, { limit, country, fetch, signal }) -> the same shape (kind 'artist')
//
// kind 'artist' finds the artist, then their top songs (lookup?id=…&entity=song). kind 'playlist'
// is searched as albums, then songs: Apple Music has no free playlist search. Privacy: the words
// searched go to Apple (itunes.apple.com), with no cookies and no referrer; nothing else does.
//
// CSP (public/index.html): connect-src https://itunes.apple.com; img-src https://*.mzstatic.com;
// media-src https://audio-ssl.itunes.apple.com.

import { MAX_MUSIC_ITEMS, artistFromResults, cleanQuery, parseItunesResults, rankItems } from '../lib/music.js';

export const ITUNES_SEARCH_URL = 'https://itunes.apple.com/search';
export const ITUNES_LOOKUP_URL = 'https://itunes.apple.com/lookup';
export const MUSIC_TIMEOUT_MS = 8000;
const CACHE_MS = 10 * 60 * 1000;
const CACHE_MAX = 60;
const DEFAULT_COUNTRY = 'us';
const ENTITY = { song: 'song', album: 'album', artist: 'musicArtist' };

const cache = new Map(); // key -> { at, value }

/** The App Store country of this device, from its locale ("en-GB" -> "gb"); 'us' when unknown. */
export function deviceCountry(nav = typeof navigator !== 'undefined' ? navigator : null) {
  const langs = [];
  try {
    if (nav && Array.isArray(nav.languages)) langs.push(...nav.languages);
    if (nav && typeof nav.language === 'string') langs.push(nav.language);
  } catch {
    /* no navigator */
  }
  for (const tag of langs) {
    const m = /^[a-z]{2,3}[-_](?:[a-z]{4}[-_])?([a-z]{2})\b/i.exec(String(tag || ''));
    if (m) return m[1].toLowerCase();
  }
  return DEFAULT_COUNTRY;
}

function cleanCountry(value) {
  const s = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return /^[a-z]{2}$/.test(s) ? s : deviceCountry();
}

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return structuredCloneSafe(hit.value);
}

function cachePut(key, value) {
  cache.set(key, { at: Date.now(), value: structuredCloneSafe(value) });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

function structuredCloneSafe(v) {
  return JSON.parse(JSON.stringify(v));
}

/** Forget every cached search (tests). */
export function clearMusicCache() {
  cache.clear();
}

class MusicError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isOffline = () => typeof navigator !== 'undefined' && navigator && navigator.onLine === false;

/** GET one iTunes URL as JSON, within `timeoutMs`; aborted by `signal`. */
async function getJson(url, { fetch: fetchFn, signal, timeoutMs }) {
  const doFetch = fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) throw new MusicError('network', 'This browser cannot search Apple Music.');
  if (signal && signal.aborted) throw new MusicError('aborted', 'Stopped.');
  const ctl = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    ctl.abort();
  }, timeoutMs);
  const onAbort = () => ctl.abort();
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    let res;
    try {
      res = await doFetch(url, { method: 'GET', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal, headers: { Accept: 'application/json' } });
    } catch (err) {
      if (timedOut) throw new MusicError('timeout', 'Apple Music did not answer in time.');
      if (signal && signal.aborted) throw new MusicError('aborted', 'Stopped.');
      if (isOffline()) throw new MusicError('offline', 'You’re offline.');
      throw new MusicError('network', 'Apple Music could not be reached.');
    }
    if (!res || !res.ok) throw new MusicError('network', `Apple Music answered with an error${res && res.status ? ` (HTTP ${res.status})` : ''}.`);
    let text;
    try {
      text = await res.text();
    } catch {
      if (timedOut) throw new MusicError('timeout', 'Apple Music did not answer in time.');
      if (signal && signal.aborted) throw new MusicError('aborted', 'Stopped.');
      throw new MusicError('network', 'Apple Music could not be reached.');
    }
    if (text.length > 2_000_000) throw new MusicError('bad_response', 'Apple Music sent an unexpected answer.');
    try {
      return JSON.parse(text);
    } catch {
      throw new MusicError('bad_response', 'Apple Music sent an unexpected answer.');
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function searchUrl(term, entity, limit, country) {
  const p = new URLSearchParams({ term, media: 'music', entity, limit: String(limit), country });
  return `${ITUNES_SEARCH_URL}?${p.toString()}`;
}

function failure(err) {
  if (err instanceof MusicError) return { ok: false, error: err.code, message: err.message };
  if (err instanceof TypeError) return { ok: false, error: 'bad_response', message: 'Apple Music sent an unexpected answer.' };
  return { ok: false, error: 'network', message: 'Apple Music could not be reached.' };
}

/** The top songs of an artist (iTunes lookup). */
export async function topSongs(artistId, { limit = 5, country, fetch: fetchFn, signal, timeoutMs = MUSIC_TIMEOUT_MS, artist = '' } = {}) {
  const id = typeof artistId === 'number' ? String(artistId) : String(artistId || '').trim();
  if (!/^\d{1,20}$/.test(id)) return { ok: false, error: 'empty', message: 'No artist to look up.' };
  const cc = cleanCountry(country);
  const n = Math.max(1, Math.min(MAX_MUSIC_ITEMS, Math.round(Number(limit) || 5)));
  const key = `top|${cc}|${n}|${id}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  try {
    const p = new URLSearchParams({ id, entity: 'song', limit: String(n), country: cc });
    const json = await getJson(`${ITUNES_LOOKUP_URL}?${p.toString()}`, { fetch: fetchFn, signal, timeoutMs });
    const items = parseItunesResults(json, { max: n }).filter((i) => i.type === 'song');
    const named = artist || (artistFromResults(json) || {}).name || (items[0] && items[0].artist) || '';
    const value = { ok: true, items, kind: 'artist', country: cc, query: named, artist: named };
    cachePut(key, value);
    return value;
  } catch (err) {
    return failure(err);
  }
}

/**
 * Search Apple Music. `title` and `artist` (from "play X by Y") only rank the results.
 */
export async function searchMusic(query, { kind = 'song', limit = 5, country, fetch: fetchFn, signal, timeoutMs = MUSIC_TIMEOUT_MS, title = '', artist = '' } = {}) {
  const term = cleanQuery(query);
  if (!term) return { ok: false, error: 'empty', message: 'There was nothing to search for.' };
  const k = ['song', 'album', 'artist', 'playlist'].includes(kind) ? kind : 'song';
  const n = Math.max(1, Math.min(MAX_MUSIC_ITEMS, Math.round(Number(limit) || 5)));
  const cc = cleanCountry(country);
  const key = `search|${k}|${cc}|${n}|${term.toLowerCase()}|${String(title).toLowerCase()}|${String(artist).toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const opts = { fetch: fetchFn, signal, timeoutMs };
  try {
    let value;
    if (k === 'artist') {
      const found = artistFromResults(await getJson(searchUrl(term, ENTITY.artist, 3, cc), opts));
      if (found) {
        const top = await topSongs(found.id, { limit: n, country: cc, fetch: fetchFn, signal, timeoutMs, artist: found.name });
        if (!top.ok) return top;
        value = { ...top, query: term };
      } else {
        // No artist by that name: the words may be a song after all ("play some Back in Black").
        const items = parseItunesResults(await getJson(searchUrl(term, ENTITY.song, n, cc), opts), { max: n });
        value = { ok: true, items, kind: 'song', country: cc, query: term };
      }
    } else if (k === 'playlist') {
      // No free playlist search: the closest albums, then songs.
      const albums = parseItunesResults(await getJson(searchUrl(term, ENTITY.album, n, cc), opts), { max: n });
      const items = albums.length ? albums : parseItunesResults(await getJson(searchUrl(term, ENTITY.song, n, cc), opts), { max: n });
      value = { ok: true, items: rankItems(items, { title: title || term, artist }), kind: 'playlist', country: cc, query: term };
    } else {
      // Ask for a few more than shown, so the ranking can lift the right one ("by AC/DC").
      const items = parseItunesResults(await getJson(searchUrl(term, ENTITY[k], Math.min(25, n + 5), cc), opts), { max: n + 5 });
      value = { ok: true, items: rankItems(items, { title, artist }).slice(0, n), kind: k, country: cc, query: term };
    }
    cachePut(key, value);
    return value;
  } catch (err) {
    return failure(err);
  }
}
