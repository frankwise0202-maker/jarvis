// A fake Apple Music for the E2E suite (scenarios with `fakeMusic: true`): the iTunes Search API
// (itunes.apple.com/search and /lookup), artwork (isN-ssl.mzstatic.com) and the 30-second previews
// (audio-ssl.itunes.apple.com) answered through context.route(), so nothing reaches the network and
// those origins are not third-party requests for the guard. "back in black" answers with the real
// sample saved from the API (test/unit/fixtures/itunes-back-in-black.json); other terms get small
// realistic results. A preview is a short generated WAV (Playwright's Chromium has no AAC decoder).
// t.music counts what was asked: { searches: [url], artwork: n, previews: n }.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ITUNES_FIXTURE = path.join(HERE, '..', 'unit', 'fixtures', 'itunes-back-in-black.json');
export const MUSIC_ORIGIN_RE = /^https:\/\/(?:itunes\.apple\.com|audio-ssl\.itunes\.apple\.com|is\d{1,2}-ssl\.mzstatic\.com)$/;

const ART = (id) => `https://is${(id % 5) + 1}-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/${id}/cover.jpg/100x100bb.jpg`;
const PREVIEW = (id) => `https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview/v4/aa/bb/${id}/mzaf_${id}.plus.aac.p.m4a`;

function song({ id, title, artist, artistId, album, collectionId, year, ms = 240000, genre = 'Rock' }) {
  return {
    wrapperType: 'track', kind: 'song', artistId, collectionId, trackId: id, artistName: artist, collectionName: album, trackName: title,
    artistViewUrl: `https://music.apple.com/us/artist/x/${artistId}?uo=4`,
    collectionViewUrl: `https://music.apple.com/us/album/x/${collectionId}?i=${id}&uo=4`,
    trackViewUrl: `https://music.apple.com/us/album/x/${collectionId}?i=${id}&uo=4`,
    previewUrl: PREVIEW(id), artworkUrl100: ART(id), releaseDate: `${year}-06-01T07:00:00Z`, trackTimeMillis: ms, primaryGenreName: genre,
    trackExplicitness: 'notExplicit', country: 'USA', currency: 'USD', isStreamable: true,
  };
}
function album({ id, title, artist, artistId, year, tracks = 10, genre = 'Jazz' }) {
  return {
    wrapperType: 'collection', collectionType: 'Album', artistId, collectionId: id, artistName: artist, collectionName: title,
    collectionViewUrl: `https://music.apple.com/us/album/x/${id}?uo=4`, artworkUrl100: ART(id), releaseDate: `${year}-02-26T08:00:00Z`,
    trackCount: tracks, primaryGenreName: genre, collectionExplicitness: 'notExplicit', country: 'USA', currency: 'USD',
  };
}

const KNOWN = {
  'riders on the storm the doors': () => [song({ id: 640047583, title: 'Riders On the Storm', artist: 'The Doors', artistId: 1352449, album: 'L.A. Woman', collectionId: 640047463, year: 1971, ms: 434000 })],
  'come away with me norah jones': () => [album({ id: 1440787218, title: 'Come Away With Me', artist: 'Norah Jones', artistId: 1527036, year: 2002, tracks: 14 })],
};

const ACDC_TOP = () => [
  { wrapperType: 'artist', artistType: 'Artist', artistName: 'AC/DC', artistId: 5040714 },
  song({ id: 574050602, title: 'Back In Black', artist: 'AC/DC', artistId: 5040714, album: 'Back In Black', collectionId: 574050396, year: 1980, ms: 256000, genre: 'Hard Rock' }),
  song({ id: 574043989, title: 'Thunderstruck', artist: 'AC/DC', artistId: 5040714, album: 'The Razors Edge', collectionId: 574043881, year: 1990, ms: 292000, genre: 'Hard Rock' }),
  song({ id: 574044055, title: 'Highway to Hell', artist: 'AC/DC', artistId: 5040714, album: 'Highway to Hell', collectionId: 574043912, year: 1979, ms: 208000, genre: 'Hard Rock' }),
];

const titleCase = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The JSON the fake API answers for one request URL. */
export function fakeItunesAnswer(url) {
  const u = new URL(url);
  const term = (u.searchParams.get('term') || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const entity = u.searchParams.get('entity') || 'song';
  const limit = Math.max(1, Math.min(25, Number(u.searchParams.get('limit')) || 5));
  let results = [];
  if (u.pathname === '/lookup') {
    results = u.searchParams.get('id') === '5040714' ? ACDC_TOP() : [];
  } else if (entity === 'musicArtist') {
    if (/ac\/?dc|ac dc/.test(term)) results = [{ wrapperType: 'artist', artistType: 'Artist', artistName: 'AC/DC', artistId: 5040714, primaryGenreName: 'Hard Rock' }];
  } else if (/back in black/.test(term) && entity === 'song') {
    results = JSON.parse(readFileSync(ITUNES_FIXTURE, 'utf8')).results;
  } else if (KNOWN[term]) {
    results = KNOWN[term]();
  } else if (/zzz|nothing/.test(term)) {
    results = [];
  } else if (entity === 'album') {
    results = [album({ id: 900000001, title: titleCase(term), artist: 'Test Artist', artistId: 900, year: 2001 })];
  } else {
    results = [
      song({ id: 900000011, title: titleCase(term), artist: 'Test Artist', artistId: 900, album: `${titleCase(term)} - Single`, collectionId: 900000010, year: 2019 }),
      song({ id: 900000021, title: `${titleCase(term)} (Live)`, artist: 'Test Artist', artistId: 900, album: 'Live at the Test Hall', collectionId: 900000020, year: 2021 }),
    ];
  }
  results = results.slice(0, u.pathname === '/lookup' ? limit + 1 : limit);
  return { resultCount: results.length, results };
}

/** A short WAV: `seconds` of a quiet 440 Hz tone, 8 kHz mono 16-bit. */
export function previewWav(seconds = 3) {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0, 'ascii');
  head.writeUInt32LE(36 + data.length, 4);
  head.write('WAVE', 8, 'ascii');
  head.write('fmt ', 12, 'ascii');
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write('data', 36, 'ascii');
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}

/** Route the three Apple origins of a browser context; returns the counter object. */
export async function routeFakeMusic(context, { png, delayMs = 0 } = {}) {
  const counts = { searches: [], artwork: 0, previews: 0 };
  const cors = { 'access-control-allow-origin': '*' };
  const wav = previewWav(3);
  await context.route(/^https:\/\/itunes\.apple\.com\//, async (route) => {
    counts.searches.push(route.request().url());
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', headers: cors, body: JSON.stringify(fakeItunesAnswer(route.request().url())) });
  });
  await context.route(/^https:\/\/is\d{1,2}-ssl\.mzstatic\.com\//, (route) => {
    counts.artwork += 1;
    return route.fulfill({ status: 200, contentType: 'image/png', headers: cors, body: png });
  });
  await context.route(/^https:\/\/audio-ssl\.itunes\.apple\.com\//, (route) => {
    counts.previews += 1;
    return route.fulfill({ status: 200, contentType: 'audio/wav', headers: { ...cors, 'accept-ranges': 'none' }, body: wav });
  });
  return counts;
}
