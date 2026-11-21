// What the owner played lately (Apple Music), kept on this device only: the wake routine offers
// "Shall I put on some <artist>?" from it (else Back in Black by AC/DC). An entry is added when a
// "play …" command finds something, and when a preview starts or Open in Apple Music is tapped.
// localStorage 'jarvis.music.recent.v1' = [{ artist, title, kind, at }] newest first, at most 12, one
// per artist. Reset Jarvis removes it (it is a jarvis.* key); backups leave it out (it is this device's).
//
//   noteMusicPlayed({ artist, title, kind }, { now, storage })
//   recentMusic({ storage }) -> entries (newest first)
//   suggestedMusic({ storage, now }) -> { artist, title, query, kind, fromHistory }

export const MUSIC_RECENT_KEY = 'jarvis.music.recent.v1';
const MAX = 12;
const MAX_AGE_MS = 120 * 24 * 3600 * 1000; // an artist from four months ago is not "lately"
export const DEFAULT_SUGGESTION = Object.freeze({ artist: 'AC/DC', title: 'Back in Black', kind: 'song' });

function store(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** One line of text: no control characters, trimmed, at most `max` characters. */
function clean(v, max = 80) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function recentMusic({ storage, now = Date.now() } = {}) {
  const s = store(storage);
  if (!s) return [];
  let list;
  try {
    list = JSON.parse(s.getItem(MUSIC_RECENT_KEY) || '[]');
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && typeof e === 'object' && clean(e.artist) && Number.isFinite(e.at) && now - e.at < MAX_AGE_MS)
    .map((e) => ({ artist: clean(e.artist), title: clean(e.title, 120), kind: e.kind === 'album' ? 'album' : 'song', at: e.at }))
    .slice(0, MAX);
}

export function noteMusicPlayed(item, { storage, now = Date.now() } = {}) {
  const artist = clean(item && item.artist);
  if (!artist) return false;
  const s = store(storage);
  if (!s) return false;
  const entry = { artist, title: clean(item.title, 120), kind: item.type === 'album' || item.kind === 'album' ? 'album' : 'song', at: now };
  const list = [entry, ...recentMusic({ storage: s, now }).filter((e) => e.artist.toLowerCase() !== artist.toLowerCase())].slice(0, MAX);
  try {
    s.setItem(MUSIC_RECENT_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** The routine's offer: the artist played most recently, else Back in Black by AC/DC. */
export function suggestedMusic({ storage, now = Date.now() } = {}) {
  const last = recentMusic({ storage, now })[0];
  if (last) return { artist: last.artist, title: last.title, kind: 'artist', query: last.artist, fromHistory: true };
  return { artist: DEFAULT_SUGGESTION.artist, title: DEFAULT_SUGGESTION.title, kind: 'song', query: `${DEFAULT_SUGGESTION.title} ${DEFAULT_SUGGESTION.artist}`, fromHistory: false };
}
