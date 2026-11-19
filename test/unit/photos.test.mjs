// node --test: Wikimedia Commons photo search (fake fetch + a recorded-style fixture).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { searchPhotos, searchPhotosMerged, photoQueries, parseSearchResponse, buildSearchUrl, htmlToText, cleanQuery, safeUploadUrl, PhotoSearchError, COMMONS_API } from '../../src/platform/photos.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = JSON.parse(readFileSync(path.join(ROOT, 'test', 'unit', 'fixtures', 'commons-search.json'), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));

function fakeFetch(responses) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const next = typeof responses === 'function' ? responses(url, init, calls.length) : responses.shift();
    if (next instanceof Error) throw next;
    if (next && next.hang) {
      return new Promise((resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    }
    return { ok: next.status === undefined || (next.status >= 200 && next.status < 300), status: next.status || 200, json: async () => (next.badJson ? JSON.parse('{nope') : clone(next.body)) };
  };
  fn.calls = calls;
  return fn;
}

test('request: anonymous CORS GET to the Commons API with the right parameters', async () => {
  const fetch = fakeFetch([{ body: FIXTURE }]);
  await searchPhotos('car alternator', { fetch, limit: 9 });
  assert.equal(fetch.calls.length, 1);
  const { url, init } = fetch.calls[0];
  const u = new URL(url);
  assert.equal(`${u.origin}${u.pathname}`, COMMONS_API);
  const p = u.searchParams;
  assert.equal(p.get('origin'), '*');
  assert.equal(p.get('action'), 'query');
  assert.equal(p.get('format'), 'json');
  assert.equal(p.get('formatversion'), '2');
  assert.equal(p.get('generator'), 'search');
  assert.equal(p.get('gsrnamespace'), '6');
  assert.equal(p.get('gsrsearch'), 'car alternator filetype:bitmap|drawing');
  assert.equal(p.get('gsrlimit'), '9');
  assert.equal(p.get('prop'), 'imageinfo');
  assert.equal(p.get('iiprop'), 'url|size|mime|extmetadata');
  assert.equal(p.get('iiurlwidth'), '500');
  assert.match(p.get('iiextmetadatafilter'), /Artist/);
  assert.equal(init.method, 'GET');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.referrerPolicy, 'no-referrer');
  assert.equal(init.headers, undefined); // no custom headers: no preflight, nothing identifying
});

test('results: ranked by search index, unsafe or unsupported files dropped', async () => {
  const photos = await searchPhotos('alternator', { fetch: fakeFetch([{ body: FIXTURE }]) });
  assert.deepEqual(
    photos.map((p) => p.title),
    ['Alternator cutaway.jpg', 'Car alternator, 14 V 90 A.jpg', 'Alternator rotor (claw poles).png', 'Alternator schematic.svg', 'Lichtmaschine Scan.tif'],
  );
  for (const p of photos) {
    assert.ok(p.thumbUrl.startsWith('https://upload.wikimedia.org/'), p.thumbUrl);
    assert.ok(p.fullUrl.startsWith('https://upload.wikimedia.org/'), p.fullUrl);
    assert.ok(p.pageUrl.startsWith('https://commons.wikimedia.org/'), p.pageUrl);
    assert.ok(p.width > 0 && p.height > 0);
  }
});

test('full-size URL: a 1280 px thumbnail for big originals, never a raw SVG or TIFF', async () => {
  const photos = await searchPhotos('alternator', { fetch: fakeFetch([{ body: FIXTURE }]) });
  const by = Object.fromEntries(photos.map((p) => [p.title, p]));
  assert.equal(by['Alternator cutaway.jpg'].fullUrl, 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Alternator_cutaway.jpg/1280px-Alternator_cutaway.jpg');
  assert.equal(by['Alternator rotor (claw poles).png'].fullUrl, 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Alternator_rotor_%28claw_poles%29.png');
  assert.match(by['Alternator schematic.svg'].fullUrl, /500px-Alternator_schematic\.svg\.png$/);
  assert.match(by['Lichtmaschine Scan.tif'].fullUrl, /lossy-page1-1280px-Lichtmaschine_Scan\.tif\.jpg$/);
});

test('credits are plain text: tags stripped, entities decoded, scripts dropped', async () => {
  const photos = await searchPhotos('alternator', { fetch: fakeFetch([{ body: FIXTURE }]) });
  const by = Object.fromEntries(photos.map((p) => [p.title, p]));
  assert.equal(by['Car alternator, 14 V 90 A.jpg'].author, 'Gearhead Ana');
  assert.equal(by['Car alternator, 14 V 90 A.jpg'].license, 'CC BY-SA 4.0');
  assert.equal(by['Car alternator, 14 V 90 A.jpg'].licenseUrl, 'https://creativecommons.org/licenses/by-sa/4.0');
  assert.equal(by['Car alternator, 14 V 90 A.jpg'].description, 'A 14 V, 90 A automotive alternator removed from a car, showing the pulley and cooling vents.');
  assert.equal(by['Alternator cutaway.jpg'].author, 'José Müller');
  assert.equal(by['Alternator cutaway.jpg'].description, 'Sectioned alternator on a training stand: rotor, stator, slip rings & brushes.');
  assert.equal(by['Alternator rotor (claw poles).png'].author, 'Unknown author');
  assert.equal(by['Alternator schematic.svg'].author, 'Circuit Sam (talk)');
  assert.equal(by['Alternator schematic.svg'].description, 'Three-phase alternator with diode rectifier — schematic');
  assert.equal(by['Lichtmaschine Scan.tif'].licenseUrl, null); // javascript: dropped
  for (const p of photos) for (const k of ['author', 'license', 'description', 'credit', 'title']) assert.doesNotMatch(p[k] || '', /[<>]/);
});

test('htmlToText edge cases', () => {
  assert.equal(htmlToText('<a title="a > b" href="x">Name</a>'), 'Name');
  assert.equal(htmlToText("<span data-x='>>'>A</span>&amp;<b>B</b>"), 'A&B');
  assert.equal(htmlToText('x<!-- <b>hidden</b> -->y'), 'xy');
  assert.equal(htmlToText('<style>p{}</style><SCRIPT>bad()</SCRIPT>ok'), 'ok');
  assert.equal(htmlToText('line<br>break<p>para</p>'), 'line break para');
  assert.equal(htmlToText('5 < 6 and 7 > 3'), '5 < 6 and 7 > 3');
  assert.equal(htmlToText('&#x1F600;&#128512;&#0;&#xD800;&bogus;'), '\u{1F600}\u{1F600}&bogus;');
  assert.equal(htmlToText('a\u0007b'), 'a b');
  assert.equal(htmlToText('x'.repeat(50), 10).length, 10);
  assert.equal(htmlToText(null), '');
});

test('URL filter: https upload.wikimedia.org only', () => {
  assert.equal(safeUploadUrl('https://upload.wikimedia.org/a.jpg'), 'https://upload.wikimedia.org/a.jpg');
  assert.equal(safeUploadUrl('//upload.wikimedia.org/a.jpg'), 'https://upload.wikimedia.org/a.jpg');
  for (const bad of ['http://upload.wikimedia.org/a.jpg', 'https://upload.wikimedia.org.evil.example/a.jpg', 'https://evil.example/upload.wikimedia.org/a.jpg', 'https://user@upload.wikimedia.org/a.jpg', 'data:image/png;base64,AAAA', 'javascript:alert(1)', '', null]) {
    assert.equal(safeUploadUrl(bad), null, String(bad));
  }
});

test('query cleaning: operators, control characters and length', async () => {
  assert.equal(cleanQuery('  insource:/x/ alternator\u0000  intitle:pulley '), '/x/ alternator pulley');
  assert.equal(cleanQuery('a'.repeat(300)).length, 100);
  assert.equal(cleanQuery('{[|]}'), '');
  const fetch = fakeFetch([]);
  assert.deepEqual(await searchPhotos('   ', { fetch }), []);
  assert.deepEqual(await searchPhotos(42, { fetch }), []);
  assert.equal(fetch.calls.length, 0);
});

test('no hits with bitmap|drawing: retries once with bitmap only', async () => {
  const fetch = fakeFetch([{ body: { batchcomplete: true } }, { body: FIXTURE }]);
  const photos = await searchPhotos('lichtmaschine', { fetch });
  assert.equal(fetch.calls.length, 2);
  assert.equal(new URL(fetch.calls[1].url).searchParams.get('gsrsearch'), 'lichtmaschine filetype:bitmap');
  assert.equal(photos.length, 5);
  const none = fakeFetch([{ body: { batchcomplete: true } }, { body: { batchcomplete: true } }]);
  assert.deepEqual(await searchPhotos('zzzz', { fetch: none }), []);
});

test('formatversion 1 shape (pages keyed by id) is understood too', () => {
  const v1 = clone(FIXTURE);
  v1.query.pages = Object.fromEntries(v1.query.pages.map((p) => [String(p.pageid), p]));
  assert.equal(parseSearchResponse(v1).length, 5);
});

test('limit is applied', async () => {
  const photos = await searchPhotos('alternator', { fetch: fakeFetch([{ body: FIXTURE }]), limit: 2 });
  assert.equal(photos.length, 2);
  assert.equal(new URL(buildSearchUrl('x', { limit: 999 })).searchParams.get('gsrlimit'), '30');
});

test('errors: offline, HTTP, API error, bad JSON, timeout, abort', async () => {
  const kind = async (fetch, opts = {}) => {
    try {
      await searchPhotos('alternator', { fetch, ...opts });
      return 'resolved';
    } catch (err) {
      assert.ok(err instanceof PhotoSearchError);
      assert.ok(err.message.length > 10);
      return err.kind;
    }
  };
  assert.equal(await kind(fakeFetch([new TypeError('Failed to fetch')])), 'offline');
  assert.equal(await kind(fakeFetch([{ status: 503, body: {} }])), 'http');
  assert.equal(await kind(fakeFetch([{ body: { error: { code: 'badvalue', info: 'nope' } } }])), 'http');
  assert.equal(await kind(fakeFetch([{ badJson: true }])), 'invalid');
  assert.equal(await kind(fakeFetch([{ body: 'not an object' }])), 'invalid');
  assert.equal(await kind(fakeFetch([{ hang: true }]), { timeoutMs: 30 }), 'timeout');
  const controller = new AbortController();
  const pending = kind(fakeFetch([{ hang: true }]), { signal: controller.signal, timeoutMs: 5000 });
  setTimeout(() => controller.abort(), 10);
  assert.equal(await pending, 'aborted');
  assert.equal(await kind(null), 'offline');
});

test('part photo searches name the object too ("alternator rotor", "battery separator", "Toyota Camry hood"), then the part alone', () => {
  assert.deepEqual(photoQueries('Car alternator', 'Rotor (claw poles)'), ['alternator rotor', 'rotor']);
  assert.deepEqual(photoQueries('AA alkaline battery (LR6)', 'Separator'), ['battery separator', 'separator']);
  assert.deepEqual(photoQueries('AA alkaline battery (LR6)', 'Steel can (+)'), ['battery steel can', 'steel can']);
  assert.deepEqual(photoQueries('2024 Toyota Camry Hybrid (XV70)', 'Hood'), ['Toyota Camry hood', 'hood']);
  assert.deepEqual(photoQueries('2024 Toyota Camry Hybrid (XV70)', 'DC-DC converter'), ['Toyota Camry DC-DC converter', 'DC-DC converter']);
  assert.deepEqual(photoQueries('2024 Toyota Camry Hybrid (XV70)', 'Hybrid battery'), ['Toyota Camry hybrid battery', 'hybrid battery']);
  assert.deepEqual(photoQueries('2024 Toyota Camry Hybrid (XV70)', '2.5 L engine'), ['Toyota Camry 2.5 L engine', '2.5 L engine']);
  assert.deepEqual(photoQueries('Car alternator', 'Alternator housing'), ['alternator housing'], 'no repeated word, and no second query when it is the same');
  assert.deepEqual(photoQueries('Saturn V rocket', 'First stage'), ['Saturn V first stage', 'first stage']);
  // The whole object: its title without qualifiers, as before.
  assert.deepEqual(photoQueries('2024 Toyota Camry Hybrid (XV70)'), ['2024 Toyota Camry Hybrid']);
  assert.deepEqual(photoQueries('Car alternator', ''), ['Car alternator']);
  assert.deepEqual(photoQueries('', 'Rotor'), ['rotor']);
  assert.deepEqual(photoQueries('', ''), []);
  for (const q of photoQueries('An object (with) a "very" long title that goes on and on and on and on and on and on and on', 'A part with a long name too')) assert.ok(q.length <= 80, q);
});

test('a part search merges both searches: object-qualified photos first, no duplicates, at most the limit, partial results kept', async () => {
  const photo = (title) => ({ title, thumbUrl: 'https://upload.wikimedia.org/t.jpg', fullUrl: 'https://upload.wikimedia.org/f.jpg' });
  const fake = (byQuery) => {
    const calls = [];
    const fn = async (q) => {
      calls.push(q);
      const r = byQuery[q];
      if (r instanceof Error) throw r;
      return r || [];
    };
    fn.calls = calls;
    return fn;
  };
  let search = fake({ 'alternator rotor': [photo('A'), photo('B')], rotor: [photo('B'), photo('C'), photo('D')] });
  let out = await searchPhotosMerged(['alternator rotor', 'rotor'], { limit: 3, search });
  assert.deepEqual(out.map((p) => p.title), ['A', 'B', 'C']);
  assert.deepEqual(search.calls.sort(), ['alternator rotor', 'rotor']);
  // A failed second search keeps the first's photos; all failing is an error.
  search = fake({ 'alternator rotor': [photo('A')], rotor: new PhotoSearchError('http', 'Commons is busy.') });
  out = await searchPhotosMerged(['alternator rotor', 'rotor'], { search });
  assert.deepEqual(out.map((p) => p.title), ['A']);
  search = fake({ 'alternator rotor': new PhotoSearchError('offline', 'offline'), rotor: new PhotoSearchError('offline', 'offline') });
  await assert.rejects(searchPhotosMerged(['alternator rotor', 'rotor'], { search }), PhotoSearchError);
  // Through the real search: one Commons request per query, each with its own words.
  const fetch = fakeFetch(() => ({ body: FIXTURE }));
  out = await searchPhotosMerged(['battery separator', 'separator'], { fetch, limit: 12 });
  assert.ok(out.length > 0 && out.length <= 12);
  assert.deepEqual(fetch.calls.map((c) => new URL(c.url).searchParams.get('gsrsearch')).sort(), ['battery separator filetype:bitmap|drawing', 'separator filetype:bitmap|drawing']);
  assert.equal(new Set(out.map((p) => p.title)).size, out.length, 'no duplicates');
});
