// Apple Music, "find & open" (free): the pure part. It reads iTunes Search API results strictly
// into MusicItems, keeps only Apple's own hosts, and words what Jarvis says and what the find_music
// tool returns. No DOM and no network: src/platform/music.js does the fetching; the engine, the UI
// and backups share these checks.
//
//   MusicItem = { type: 'song' | 'album', id, title, artist, album, year: number|null, genre,
//                 durationMs: number|null, url, previewUrl: string|null, artwork: string|null,
//                 explicit: boolean, artistId: string|null, trackCount: number|null }
//
// Hosts: links only https://music.apple.com/, previews only https://audio-ssl.itunes.apple.com/,
// artwork only https://isN-ssl.mzstatic.com/. Anything else is dropped (an item without a link is
// dropped whole: it could not be opened).

export const MUSIC_KINDS = Object.freeze(['song', 'album', 'artist']);
/** What a search can be for: the three kinds, and "playlist" (searched as albums and songs). */
export const MUSIC_SEARCH_KINDS = Object.freeze(['song', 'album', 'artist', 'playlist']);
export const MAX_MUSIC_ITEMS = 8;
export const MAX_QUERY_CHARS = 120;
export const PREVIEW_SECONDS = 30;

const LINK_HOST = 'music.apple.com';
const PREVIEW_HOST = 'audio-ssl.itunes.apple.com';
const ARTWORK_HOST = /^is\d{1,2}-ssl\.mzstatic\.com$/;
const ID = /^\d{1,20}$/;
const MAX_TEXT = 200;
const MAX_URL = 600;

// Control and invisible formatting characters (bidi overrides, zero-width, line separators).
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** One line of plain text (control characters and runs of spaces folded), capped, or ''. */
export function cleanText(value, max = MAX_TEXT) {
  if (typeof value !== 'string') return '';
  const s = value.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function httpsUrl(value, host) {
  if (typeof value !== 'string' || !value || value.length > MAX_URL) return null;
  let u;
  try {
    u = new URL(value.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  const name = u.hostname.toLowerCase();
  if (typeof host === 'string' ? name !== host : !host.test(name)) return null;
  return u;
}

/** An Apple Music link (https://music.apple.com/…) without the "uo" tracking parameter, or null. */
export function musicLink(value) {
  const u = httpsUrl(value, LINK_HOST);
  if (!u || u.pathname.length < 2) return null;
  u.searchParams.delete('uo');
  u.hash = '';
  return u.href;
}

/** The same link in the music:// form, which opens the Music app on a Mac; null when not a link. */
export function musicAppLink(value) {
  const link = musicLink(value);
  return link ? `music://${link.slice('https://'.length)}` : null;
}

/** A 30-second preview (https://audio-ssl.itunes.apple.com/…), or null. */
export function previewLink(value) {
  const u = httpsUrl(value, PREVIEW_HOST);
  return u ? u.href : null;
}

/** Artwork (https://isN-ssl.mzstatic.com/…), resized to `size` px when it carries a size, or null. */
export function artworkLink(value, size = 300) {
  const u = httpsUrl(value, ARTWORK_HOST);
  if (!u) return null;
  const px = Math.max(30, Math.min(1200, Math.round(Number(size) || 300)));
  u.pathname = u.pathname.replace(/\/\d{2,4}x\d{2,4}bb(\.[a-z]{3,4})$/i, `/${px}x${px}bb$1`);
  return u.href;
}

const yearOf = (value) => {
  const m = typeof value === 'string' ? /^(\d{4})-\d{2}-\d{2}/.exec(value) : null;
  const y = m ? Number(m[1]) : NaN;
  return y >= 1900 && y <= 2100 ? y : null;
};
const idOf = (value) => {
  const s = typeof value === 'number' && Number.isInteger(value) && value > 0 ? String(value) : typeof value === 'string' ? value.trim() : '';
  return ID.test(s) ? s : null;
};
const intIn = (value, min, max) => (typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null);

/** A song or album from one iTunes result object, or null when it is anything else or unusable. */
export function itemFromResult(r) {
  if (!isObj(r)) return null;
  let type = null;
  if (r.wrapperType === 'track' && r.kind === 'song') type = 'song';
  else if (r.wrapperType === 'collection' && (r.collectionType === undefined || r.collectionType === 'Album')) type = 'album';
  if (!type) return null;
  const id = idOf(type === 'song' ? r.trackId : r.collectionId);
  const title = cleanText(type === 'song' ? r.trackName : r.collectionName);
  const url = musicLink(type === 'song' ? r.trackViewUrl || r.collectionViewUrl : r.collectionViewUrl);
  if (!id || !title || !url) return null;
  return {
    type,
    id,
    title,
    artist: cleanText(r.artistName),
    album: type === 'song' ? cleanText(r.collectionName) : '',
    year: yearOf(r.releaseDate),
    genre: cleanText(r.primaryGenreName, 60),
    durationMs: type === 'song' ? intIn(r.trackTimeMillis, 1000, 6 * 3600 * 1000) : null,
    url,
    previewUrl: type === 'song' ? previewLink(r.previewUrl) : null,
    artwork: artworkLink(r.artworkUrl100 || r.artworkUrl60),
    explicit: (type === 'song' ? r.trackExplicitness : r.collectionExplicitness) === 'explicit',
    artistId: idOf(r.artistId),
    trackCount: type === 'album' ? intIn(r.trackCount, 1, 999) : null,
  };
}

/**
 * The songs and albums of an iTunes Search or Lookup response (parsed JSON), in order, without
 * duplicates. Throws a TypeError when the response is not the API's shape.
 */
export function parseItunesResults(json, { max = MAX_MUSIC_ITEMS } = {}) {
  if (!isObj(json) || !Array.isArray(json.results)) throw new TypeError('Apple Music sent an unexpected answer.');
  const out = [];
  const seen = new Set();
  for (const r of json.results.slice(0, 200)) {
    const item = itemFromResult(r);
    if (!item) continue;
    const key = `${item.type}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

/** The first artist of an iTunes musicArtist search: { id, name } or null. */
export function artistFromResults(json) {
  if (!isObj(json) || !Array.isArray(json.results)) throw new TypeError('Apple Music sent an unexpected answer.');
  for (const r of json.results.slice(0, 50)) {
    if (!isObj(r) || r.wrapperType !== 'artist') continue;
    const id = idOf(r.artistId);
    const name = cleanText(r.artistName);
    if (id && name) return { id, name };
  }
  return null;
}

/** A stored MusicItem re-checked field by field (backups, rendering), or null. */
export function cleanMusicItem(item) {
  if (!isObj(item) || (item.type !== 'song' && item.type !== 'album')) return null;
  const id = idOf(item.id);
  const title = cleanText(item.title);
  const url = musicLink(item.url);
  if (!id || !title || !url) return null;
  return {
    type: item.type,
    id,
    title,
    artist: cleanText(item.artist),
    album: item.type === 'song' ? cleanText(item.album) : '',
    year: intIn(item.year, 1900, 2100),
    genre: cleanText(item.genre, 60),
    durationMs: item.type === 'song' ? intIn(item.durationMs, 1000, 6 * 3600 * 1000) : null,
    url,
    previewUrl: item.type === 'song' ? previewLink(item.previewUrl) : null,
    artwork: artworkLink(item.artwork),
    explicit: item.explicit === true,
    artistId: idOf(item.artistId),
    trackCount: item.type === 'album' ? intIn(item.trackCount, 1, 999) : null,
  };
}

/** Items re-checked, without duplicates, at most MAX_MUSIC_ITEMS. */
export function cleanMusicItems(items) {
  const out = [];
  const seen = new Set();
  for (const raw of Array.isArray(items) ? items.slice(0, 50) : []) {
    const item = cleanMusicItem(raw);
    if (!item || seen.has(`${item.type}:${item.id}`)) continue;
    seen.add(`${item.type}:${item.id}`);
    out.push(item);
    if (out.length >= MAX_MUSIC_ITEMS) break;
  }
  return out;
}

/** A search query: one line, at most MAX_QUERY_CHARS, or '' when there is nothing to search. */
export function cleanQuery(value) {
  return cleanText(typeof value === 'string' ? value : '', MAX_QUERY_CHARS).replace(/…$/, '');
}

const fold = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Put the best match first: an artist named in the request ("by AC/DC") and a title equal to the
 * one asked for beat iTunes' own order, which stays the tie-break. Covers and karaoke versions sink.
 */
export function rankItems(items, { title = '', artist = '' } = {}) {
  const t = fold(title);
  const a = fold(artist);
  const tribute = /\b(?:karaoke|tribute|cover|instrumental|made famous|in the style of|originally performed)\b/;
  const score = (item) => {
    let s = 0;
    const it = fold(item.title);
    const ia = fold(item.artist);
    if (a) {
      if (ia === a) s += 40;
      else if (ia.includes(a) || a.includes(ia)) s += 25;
    }
    if (t) {
      if (it === t) s += 20;
      else if (it.startsWith(t) || t.startsWith(it)) s += 8;
    }
    if (tribute.test(`${it} ${ia} ${fold(item.album)}`)) s -= 30;
    return s;
  };
  return items
    .map((item, i) => ({ item, i, s: score(item) }))
    .sort((x, y) => y.s - x.s || x.i - y.i)
    .map((x) => x.item);
}

/** "Back In Black by AC/DC", "the album Back In Black by AC/DC". */
export function describeItem(item, { album = true } = {}) {
  if (!isObj(item)) return '';
  const what = item.type === 'album' && album ? `the album ${item.title}` : item.title;
  return item.artist ? `${what} by ${item.artist}` : what;
}

/** "4:16" from milliseconds, or ''. */
export function formatDuration(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v <= 0) return '';
  const total = Math.round(v / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "Back In Black · 1980" (a song's album and year), "Album · 10 songs · 1980" (an album). */
export function itemSubtitle(item) {
  if (!isObj(item)) return '';
  const parts = [];
  if (item.type === 'album') {
    parts.push('Album');
    if (item.trackCount) parts.push(`${item.trackCount} song${item.trackCount === 1 ? '' : 's'}`);
  } else if (item.album) parts.push(item.album);
  if (item.year) parts.push(String(item.year));
  return parts.join(' · ');
}

/**
 * The line Jarvis says (and writes) about a search. outcome: { ok, items, kind, error, message };
 * action: 'play' | 'open' | 'preview'. Short, plain and true: Jarvis never claims to play the
 * whole song; the owner taps Open in Apple Music.
 */
export function musicLine(outcome, { action = 'play', query = '', voice = false } = {}) {
  const o = isObj(outcome) ? outcome : {};
  const asked = cleanText(query, 80);
  if (!o.ok) {
    if (o.error === 'offline') return 'You’re offline, so I can’t search Apple Music right now.';
    return 'I couldn’t reach Apple Music just now. Try again in a moment.';
  }
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return asked ? `I couldn’t find “${asked}” in Apple Music.` : 'I couldn’t find that in Apple Music.';
  const top = items[0];
  const playlistNote = o.kind === 'playlist' ? 'Apple Music playlists can’t be searched for free, so here’s the closest album or song. ' : '';
  if (o.kind === 'artist' && o.artist) {
    return `${playlistNote}Here are ${possessive(o.artist)} top songs. Tap Open in Apple Music to play one.`;
  }
  const name = describeItem(top);
  if (action === 'preview') {
    if (!top.previewUrl) return `${playlistNote}Here’s ${name}. There’s no preview for it, but you can tap Open in Apple Music to play it.`;
    return voice ? `${playlistNote}Here’s ${name}. Tap Preview to hear 30 seconds, or Open in Apple Music to play it.` : `${playlistNote}Here’s a preview of ${name}.`;
  }
  return `${playlistNote}Here’s ${name}. Tap Open in Apple Music to play it.`;
}

function possessive(name) {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/**
 * The find_music tool_result for Claude: compact, no links (the owner sees the card). { content,
 * is_error? }.
 */
export function musicToolResult(outcome, input = {}) {
  const o = isObj(outcome) ? outcome : {};
  const query = cleanText(input.query, MAX_QUERY_CHARS).replace(/"/g, "'");
  if (!o.ok) {
    if (o.error === 'offline') return { content: 'The owner is offline, so Apple Music could not be searched. Tell them in a few words.', is_error: true };
    if (o.error === 'timeout') return { content: 'Apple Music did not answer in time. Tell the owner briefly; do not search again for this request.', is_error: true };
    return { content: `Apple Music could not be searched: ${cleanText(o.message, 160) || 'unknown problem'}. Tell the owner briefly.`, is_error: true };
  }
  const items = Array.isArray(o.items) ? o.items : [];
  const kind = o.kind === 'album' ? 'albums' : 'songs';
  if (!items.length) return { content: `No Apple Music results for "${query}". Try once more with fewer or different words (title and artist), or tell the owner.` };
  const lines = items.map((item, i) => {
    const bits = [`${i + 1}. ${item.type === 'album' ? 'Album' : 'Song'} "${item.title.replace(/"/g, "'")}"`];
    if (item.artist) bits.push(`by ${item.artist}`);
    const more = [];
    if (item.type === 'song' && item.album) more.push(`album "${item.album.replace(/"/g, "'")}"`);
    if (item.year) more.push(String(item.year));
    if (item.durationMs) more.push(formatDuration(item.durationMs));
    if (item.genre) more.push(item.genre);
    if (item.type === 'song') more.push(item.previewUrl ? 'preview' : 'no preview');
    return `${bits.join(' ')}${more.length ? ` (${more.join(', ')})` : ''}`;
  });
  const head = o.kind === 'artist' && o.artist ? `Top songs of ${o.artist} on Apple Music` : `Apple Music ${kind} for "${query}"`;
  const note = o.kind === 'playlist' ? ' Apple Music playlists cannot be searched for free, so these are albums and songs.' : '';
  return {
    content: `${head}, shown to the owner as a Music card (artwork, a 30-second Preview and Open in Apple Music):${note}\n${lines.join('\n')}\nYou cannot play the full song: the owner taps Open in Apple Music. Mention what you found in a sentence.`,
  };
}
