// Apple Music (find & open, free): the strict iTunes parser and Apple-hosts-only whitelist
// (src/lib/music.js), the search with timeouts, country and cache (src/platform/music.js), and the
// local "play X" matcher (src/lib/music-commands.js), including Voice Mode transcription slips and
// the ordinary sentences it must never take.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  artworkLink, cleanMusicItem, cleanMusicItems, describeItem, formatDuration, itemSubtitle, musicAppLink, musicLine, musicLink, musicToolResult,
  parseItunesResults, previewLink, rankItems,
} from '../../src/lib/music.js';
import { clearMusicCache, deviceCountry, searchMusic, topSongs } from '../../src/platform/music.js';
import { matchMusicCommand, normalizeMusicText } from '../../src/lib/music-commands.js';

const SAMPLE = JSON.parse(readFileSync(new URL('./fixtures/itunes-back-in-black.json', import.meta.url), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

// ---------------------------------------------------------------------------------------------
// Parsing and the whitelist

test('the real iTunes answer for "back in black" parses into two songs, links and art from Apple only', () => {
  const items = parseItunesResults(SAMPLE);
  assert.equal(items.length, 2);
  const [acdc, cover] = items;
  assert.deepEqual(acdc, {
    type: 'song',
    id: '574050602',
    title: 'Back In Black',
    artist: 'AC/DC',
    album: 'Back In Black',
    year: 1980,
    genre: 'Hard Rock',
    durationMs: 256000,
    url: 'https://music.apple.com/us/album/back-in-black/574050396?i=574050602',
    previewUrl: 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/08/2e/ac/082eac8c-1d0e-f72f-7b37-b8e037ff1579/mzaf_7587164327744022409.plus.aac.p.m4a',
    artwork: 'https://is1-ssl.mzstatic.com/image/thumb/Music115/v4/1e/14/58/1e145814-281a-58e0-3ab1-145f5d1af421/886443673441.jpg/300x300bb.jpg',
    explicit: false,
    artistId: '5040714',
    trackCount: null,
  });
  assert.equal(cover.artist, 'Thunderstruck');
  assert.equal(itemSubtitle(acdc), 'Back In Black · 1980');
  assert.equal(describeItem(acdc), 'Back In Black by AC/DC');
  assert.equal(formatDuration(acdc.durationMs), '4:16');
  assert.equal(musicAppLink(acdc.url), 'music://music.apple.com/us/album/back-in-black/574050396?i=574050602');
});

test('the whitelist: only https on Apple\'s exact hosts, no credentials, ports or look-alikes', () => {
  assert.equal(musicLink('https://music.apple.com/us/album/x/1?i=2&uo=4'), 'https://music.apple.com/us/album/x/1?i=2');
  for (const bad of [
    'http://music.apple.com/us/album/x/1', 'javascript:alert(1)', 'https://music.apple.com.evil.com/us/album/x/1', 'https://evil.com/music.apple.com/',
    'https://user:pw@music.apple.com/us/album/x/1', 'https://music.apple.com:8443/us/album/x/1', 'https://itunes.apple.com/us/album/x/1', 'https://music.apple.com/', ' ', null, 42,
    `https://music.apple.com/${'a'.repeat(700)}`,
  ]) {
    assert.equal(musicLink(bad), null, String(bad).slice(0, 60));
    assert.equal(musicAppLink(bad), null);
  }
  assert.equal(previewLink('https://audio-ssl.itunes.apple.com/a/b.m4a'), 'https://audio-ssl.itunes.apple.com/a/b.m4a');
  for (const bad of ['http://audio-ssl.itunes.apple.com/a.m4a', 'https://audio-ssl.itunes.apple.com.evil.io/a.m4a', 'https://evil.com/a.m4a', 'data:audio/wav;base64,AAAA', 'blob:https://x/1']) assert.equal(previewLink(bad), null, bad);
  assert.equal(artworkLink('https://is5-ssl.mzstatic.com/image/thumb/a.jpg/100x100bb.jpg'), 'https://is5-ssl.mzstatic.com/image/thumb/a.jpg/300x300bb.jpg');
  assert.equal(artworkLink('https://is12-ssl.mzstatic.com/a/60x60bb.png', 120), 'https://is12-ssl.mzstatic.com/a/120x120bb.png');
  for (const bad of ['https://mzstatic.com/a.jpg', 'https://is1-ssl.mzstatic.com.evil.com/a.jpg', 'https://evil-ssl.mzstatic.com/a.jpg', 'http://is1-ssl.mzstatic.com/a.jpg', 'https://is123-ssl.mzstatic.com/a.jpg']) assert.equal(artworkLink(bad), null, bad);
});

test('strict parsing: wrong shapes throw, foreign or broken results are dropped, text is cleaned', () => {
  assert.throws(() => parseItunesResults(null), TypeError);
  assert.throws(() => parseItunesResults({ results: 'x' }), TypeError);
  assert.throws(() => parseItunesResults([]), TypeError);
  const raw = clone(SAMPLE);
  raw.results.push(
    { ...clone(SAMPLE.results[0]), trackId: 1, trackViewUrl: 'javascript:alert(1)', collectionViewUrl: 'https://evil.com/x' }, // no usable link: dropped
    { ...clone(SAMPLE.results[0]), trackId: 2, previewUrl: 'https://evil.com/a.m4a', artworkUrl100: 'https://evil.com/a.jpg', trackName: `Bad‮<img src=x onerror=alert(1)>\n${'x'.repeat(300)}` },
    { wrapperType: 'track', kind: 'music-video', trackId: 3, trackName: 'A video', trackViewUrl: 'https://music.apple.com/us/music-video/x/3' },
    { wrapperType: 'artist', artistId: 9, artistName: 'Someone' },
    'nonsense',
    { ...clone(SAMPLE.results[0]) }, // a duplicate
  );
  const items = parseItunesResults(raw);
  assert.deepEqual(items.map((i) => i.id), ['574050602', '897099334', '2']);
  const odd = items[2];
  assert.equal(odd.previewUrl, null);
  assert.equal(odd.artwork, null);
  assert.ok(odd.title.length <= 200 && !/[‮\n]/.test(odd.title), 'one line, no bidi override, capped');
  // Albums.
  const album = parseItunesResults({ results: [{ wrapperType: 'collection', collectionType: 'Album', collectionId: 574050396, collectionName: 'Back In Black', artistName: 'AC/DC', collectionViewUrl: 'https://music.apple.com/us/album/back-in-black/574050396?uo=4', artworkUrl100: SAMPLE.results[0].artworkUrl100, releaseDate: '1980-07-25T07:00:00Z', trackCount: 10 }] })[0];
  assert.equal(album.type, 'album');
  assert.equal(album.previewUrl, null);
  assert.equal(itemSubtitle(album), 'Album · 10 songs · 1980');
  assert.equal(describeItem(album), 'the album Back In Black by AC/DC');
});

test('stored items are re-checked (backups, rendering): hostile fields are dropped', () => {
  const [item] = parseItunesResults(SAMPLE);
  assert.deepEqual(cleanMusicItem(item), item);
  assert.equal(cleanMusicItem({ ...item, url: 'https://evil.com/x' }), null);
  assert.equal(cleanMusicItem({ ...item, type: 'video' }), null);
  assert.equal(cleanMusicItem({ ...item, previewUrl: 'https://evil.com/a.m4a' }).previewUrl, null);
  assert.equal(cleanMusicItem({ ...item, year: 'soon', durationMs: -5 }).year, null);
  assert.equal(cleanMusicItems([item, item, null, { ...item, id: 'x' }]).length, 1);
});

test('ranking: the artist named in the request, then the exact title, then iTunes\' order; karaoke sinks', () => {
  const items = parseItunesResults(SAMPLE);
  assert.deepEqual(rankItems(items, { title: 'back in black', artist: 'thunderstruck' }).map((i) => i.artist), ['Thunderstruck', 'AC/DC']);
  assert.deepEqual(rankItems(items, { title: 'back in black', artist: 'ac/dc' }).map((i) => i.artist), ['AC/DC', 'Thunderstruck']);
  const karaoke = { ...items[0], id: '9', artist: 'Karaoke Hits Band', title: 'Back In Black (Karaoke Version)' };
  assert.deepEqual(rankItems([karaoke, ...items], { title: 'back in black' }).map((i) => i.id), ['574050602', '897099334', '9']);
});

test('what Jarvis says, and what find_music returns to Claude (compact, no links, never "playing")', () => {
  const items = parseItunesResults(SAMPLE);
  const ok = { ok: true, items, kind: 'song' };
  assert.equal(musicLine(ok, { action: 'play' }), 'Here’s Back In Black by AC/DC. Tap Open in Apple Music to play it.');
  assert.equal(musicLine(ok, { action: 'preview' }), 'Here’s a preview of Back In Black by AC/DC.');
  assert.equal(musicLine(ok, { action: 'preview', voice: true }), 'Here’s Back In Black by AC/DC. Tap Preview to hear 30 seconds, or Open in Apple Music to play it.');
  assert.equal(musicLine({ ok: true, items: [], kind: 'song' }, { query: 'zzz' }), 'I couldn’t find “zzz” in Apple Music.');
  assert.equal(musicLine({ ok: false, error: 'offline' }), 'You’re offline, so I can’t search Apple Music right now.');
  assert.match(musicLine({ ok: true, items, kind: 'playlist' }), /^Apple Music playlists can’t be searched for free, so here’s the closest album or song\. Here’s Back In Black by AC\/DC\./);
  assert.equal(musicLine({ ok: true, items, kind: 'artist', artist: 'AC/DC' }), 'Here are AC/DC’s top songs. Tap Open in Apple Music to play one.');
  const r = musicToolResult(ok, { query: 'Back in Black AC/DC' });
  assert.equal(r.is_error, undefined);
  assert.match(r.content, /^Apple Music songs for "Back in Black AC\/DC", shown to the owner as a Music card/);
  assert.match(r.content, /\n1\. Song "Back In Black" by AC\/DC \(album "Back In Black", 1980, 4:16, Hard Rock, preview\)\n2\. Song "Back In Black" by Thunderstruck/);
  assert.match(r.content, /You cannot play the full song: the owner taps Open in Apple Music\./);
  assert.doesNotMatch(r.content, /https?:|music:\/\//);
  assert.match(musicToolResult({ ok: true, items: [], kind: 'song' }, { query: 'zzz' }).content, /^No Apple Music results for "zzz"/);
  assert.equal(musicToolResult({ ok: false, error: 'timeout' }, { query: 'x' }).is_error, true);
  assert.equal(musicToolResult({ ok: false, error: 'network', message: 'HTTP 403' }, { query: 'x' }).is_error, true);
});

// ---------------------------------------------------------------------------------------------
// The search

function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const a = typeof answers === 'function' ? answers(url, init) : answers;
    if (a instanceof Error) throw a;
    if (a && typeof a.then === 'function') return a;
    return { ok: (a.status || 200) < 400, status: a.status || 200, text: async () => (typeof a.body === 'string' ? a.body : JSON.stringify(a.body)) };
  };
  fn.calls = calls;
  return fn;
}

test('searchMusic: the iTunes URL (media=music, entity, limit, country), no cookies or referrer, the cache', async () => {
  clearMusicCache();
  const fetch = fakeFetch({ body: SAMPLE });
  const r = await searchMusic('Back in Black AC/DC', { kind: 'song', limit: 2, country: 'gb', fetch, title: 'back in black', artist: 'ac/dc' });
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].artist, 'AC/DC');
  assert.equal(r.country, 'gb');
  const u = new URL(fetch.calls[0].url);
  assert.equal(u.origin + u.pathname, 'https://itunes.apple.com/search');
  assert.deepEqual(Object.fromEntries(u.searchParams), { term: 'Back in Black AC/DC', media: 'music', entity: 'song', limit: '7', country: 'gb' });
  assert.equal(fetch.calls[0].init.credentials, 'omit');
  assert.equal(fetch.calls[0].init.referrerPolicy, 'no-referrer');
  // Cached: the same search again does not fetch.
  const again = await searchMusic('Back in Black AC/DC', { kind: 'song', limit: 2, country: 'gb', fetch, title: 'back in black', artist: 'ac/dc' });
  assert.deepEqual(again, r);
  assert.equal(fetch.calls.length, 1);
  again.items.length = 0; // a caller changing its copy does not change the cache
  assert.equal((await searchMusic('Back in Black AC/DC', { kind: 'song', limit: 2, country: 'gb', fetch, title: 'back in black', artist: 'ac/dc' })).items.length, 2);
  assert.deepEqual(await searchMusic('   ', { fetch }), { ok: false, error: 'empty', message: 'There was nothing to search for.' });
});

test('searchMusic: an artist is their top songs (lookup); a playlist is searched as albums', async () => {
  clearMusicCache();
  const fetch = fakeFetch((url) => {
    const u = new URL(url);
    if (u.pathname === '/lookup') return { body: { results: [{ wrapperType: 'artist', artistId: 5040714, artistName: 'AC/DC' }, SAMPLE.results[0]] } };
    if (u.searchParams.get('entity') === 'musicArtist') return { body: { results: [{ wrapperType: 'artist', artistId: 5040714, artistName: 'AC/DC' }] } };
    if (u.searchParams.get('entity') === 'album') return { body: { results: [] } };
    return { body: SAMPLE };
  });
  const top = await searchMusic('ac/dc', { kind: 'artist', country: 'us', fetch });
  assert.equal(top.ok, true);
  assert.equal(top.kind, 'artist');
  assert.equal(top.artist, 'AC/DC');
  assert.deepEqual(top.items.map((i) => i.title), ['Back In Black']);
  assert.match(fetch.calls[1].url, /^https:\/\/itunes\.apple\.com\/lookup\?id=5040714&entity=song&limit=5&country=us$/);
  const list = await searchMusic('workout', { kind: 'playlist', country: 'us', fetch });
  assert.equal(list.kind, 'playlist');
  assert.equal(list.items.length, 2, 'no albums: songs instead');
  assert.deepEqual((await topSongs('not-an-id', { fetch })).error, 'empty');
});

test('searchMusic: timeouts, Stop, HTTP errors, bad JSON and offline are answers, never throws', async () => {
  clearMusicCache();
  const never = () => new Promise(() => {});
  const hang = fakeFetch((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))));
  const t0 = Date.now();
  assert.equal((await searchMusic('slow', { fetch: hang, timeoutMs: 60 })).error, 'timeout');
  assert.ok(Date.now() - t0 < 1000);
  const ctl = new AbortController();
  const p = searchMusic('stopped', { fetch: hang, signal: ctl.signal, timeoutMs: 5000 });
  ctl.abort();
  assert.equal((await p).error, 'aborted');
  assert.equal((await searchMusic('forbidden', { fetch: fakeFetch({ status: 403, body: 'no' }) })).error, 'network');
  assert.equal((await searchMusic('garbled', { fetch: fakeFetch({ body: '<html>' }) })).error, 'bad_response');
  assert.equal((await searchMusic('shape', { fetch: fakeFetch({ body: { results: 5 } }) })).error, 'bad_response');
  assert.equal((await searchMusic('down', { fetch: fakeFetch(new TypeError('Failed to fetch')) })).error, 'network');
  void never;
});

test('the store country comes from the device locale, else the US store', () => {
  assert.equal(deviceCountry({ languages: ['en-GB', 'en'], language: 'en-GB' }), 'gb');
  assert.equal(deviceCountry({ languages: ['de'], language: 'de-AT' }), 'at');
  assert.equal(deviceCountry({ languages: ['zh-Hant-TW'] }), 'tw');
  assert.equal(deviceCountry({ languages: ['en'], language: 'en' }), 'us');
  assert.equal(deviceCountry(null), 'us');
});

// ---------------------------------------------------------------------------------------------
// The local matcher

const m = (s) => {
  const r = matchMusicCommand(s);
  return r && { action: r.action, kind: r.kind, query: r.query, artist: r.artist };
};

test('music commands: play, play X by Y, put on, the album, some <artist>, a playlist, open in Apple Music, a preview, stop', () => {
  assert.deepEqual(m('play Back in Black'), { action: 'play', kind: 'song', query: 'back in black', artist: '' });
  assert.deepEqual(m('Jarvis, play Back in Black by AC/DC.'), { action: 'play', kind: 'song', query: 'back in black ac/dc', artist: 'ac/dc' });
  assert.deepEqual(m('Could you play Bohemian Rhapsody please'), { action: 'play', kind: 'song', query: 'bohemian rhapsody', artist: '' });
  assert.deepEqual(m('Could you play Stand by Me'), { action: 'play', kind: 'song', query: 'stand by me', artist: '' }, '"by me" is part of the title');
  assert.deepEqual(m('put on some Miles Davis'), { action: 'play', kind: 'artist', query: 'miles davis', artist: 'miles davis' });
  assert.deepEqual(m('put on the album Thriller'), { action: 'play', kind: 'album', query: 'thriller', artist: '' });
  assert.deepEqual(m('queue up Purple Rain by Prince'), { action: 'play', kind: 'song', query: 'purple rain prince', artist: 'prince' });
  assert.deepEqual(m('play the album Rumours by Fleetwood Mac'), { action: 'play', kind: 'album', query: 'rumours fleetwood mac', artist: 'fleetwood mac' });
  assert.deepEqual(m('play the Back in Black album'), { action: 'play', kind: 'album', query: 'back in black', artist: '' });
  assert.deepEqual(m('play some AC/DC'), { action: 'play', kind: 'artist', query: 'ac/dc', artist: 'ac/dc' });
  assert.deepEqual(m('play songs by Adele'), { action: 'play', kind: 'artist', query: 'adele', artist: 'adele' });
  assert.deepEqual(m("play Taylor Swift's top songs"), { action: 'play', kind: 'artist', query: 'taylor swift', artist: 'taylor swift' });
  assert.deepEqual(m('play some of the Beatles'), { action: 'play', kind: 'artist', query: 'the beatles', artist: 'the beatles' });
  assert.deepEqual(m('play my workout playlist'), { action: 'play', kind: 'playlist', query: 'workout', artist: '' });
  assert.deepEqual(m('play the playlist Chill Vibes'), { action: 'play', kind: 'playlist', query: 'chill vibes', artist: '' });
  assert.deepEqual(m('open Thriller in Apple Music'), { action: 'open', kind: 'song', query: 'thriller', artist: '' });
  assert.deepEqual(m('show me Abbey Road in Apple Music'), { action: 'open', kind: 'song', query: 'abbey road', artist: '' });
  assert.deepEqual(m('search apple music for Purple Rain'), { action: 'open', kind: 'song', query: 'purple rain', artist: '' });
  assert.deepEqual(m('find the song Yesterday'), { action: 'open', kind: 'song', query: 'yesterday', artist: '' });
  assert.deepEqual(m('play a preview of Hey Jude'), { action: 'preview', kind: 'song', query: 'hey jude', artist: '' });
  assert.deepEqual(m('preview Purple Rain'), { action: 'preview', kind: 'song', query: 'purple rain', artist: '' });
  assert.deepEqual(m('let me hear Yesterday by The Beatles'), { action: 'play', kind: 'song', query: 'yesterday the beatles', artist: 'the beatles' });
  assert.deepEqual(m('I want to hear Hotel California'), { action: 'play', kind: 'song', query: 'hotel california', artist: '' });
  assert.deepEqual(m('play P!nk'), { action: 'play', kind: 'song', query: 'p!nk', artist: '' });
  for (const s of ['stop the music', 'Stop the preview.', 'pause the music', 'turn off the music', 'stop playing', 'music off']) assert.equal(m(s)?.action, 'stop', s);
});

test('Voice Mode slips are folded: "play list", "a c d c", "apple muse ick", "played", quotes and fillers', () => {
  assert.equal(normalizeMusicText('Play “Back in Black” by A C D C!'), 'play back in black by ac/dc');
  assert.deepEqual(m('played back in black'), { action: 'play', kind: 'song', query: 'back in black', artist: '' });
  assert.deepEqual(m('um jarvis play back in black by acdc'), { action: 'play', kind: 'song', query: 'back in black ac/dc', artist: 'ac/dc' });
  assert.deepEqual(m('play my workout play list'), { action: 'play', kind: 'playlist', query: 'workout', artist: '' });
  assert.deepEqual(m('open purple rain in apple muse ick'), { action: 'open', kind: 'song', query: 'purple rain', artist: '' });
  assert.deepEqual(m('find Thriller in iTunes'), { action: 'open', kind: 'song', query: 'thriller', artist: '' });
  assert.deepEqual(m('Hey Jarvis, can you please play Back in Black for me'), { action: 'play', kind: 'song', query: 'back in black', artist: '' });
});

test('never steals ordinary words: questions, play as a verb, Jarvis\'s own replies, generic moods (Jarvis picks), other apps', () => {
  for (const s of [
    'what role does OPEC play in oil prices', 'What role does Iran play?', 'how do I play the guitar', 'how does this play into the plan', 'who will play Batman next',
    "play devil's advocate", 'play devils advocate for a minute', 'play chess with me', 'play a game with me', 'play the role of a recruiter', 'play 20 questions', 'play it safe', 'play it by ear',
    'play out the scenario', 'play nice', 'play along', 'play it again', 'play that again', 'play back the answer', 'play back your last reply', 'play the message', 'play my voicemail', 'play the news',
    'play something relaxing', 'play some music', 'play some jazz', 'play music for a dinner party', 'play a song', 'play me something', 'play your favorite song', 'play the next song', 'play my playlist',
    'play Hello by Adele on Spotify', 'play Purple Rain on the TV', 'play the latest episode', 'play a podcast', 'play the hologram', 'play the video',
    'put on a jacket', 'put on some coffee', 'put on Thriller', 'open my calendar', 'find restaurants near me', 'show me the report', 'stop', 'play', 'pause', 'stop talking',
    'I like to play tennis', 'Could you explain how kids learn through play?', 'Tell me about the play Hamlet', 'Compare Spotify and Apple Music',
  ]) {
    assert.equal(matchMusicCommand(s), null, s);
  }
});
