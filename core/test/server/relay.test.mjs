// node --test: Jarvis for Chrome's relay (Core 1.3.0, http/relay-routes.mjs, SPEC §32.1, wire v1). The two boxes
// hold the shared vectors' sealed envelopes (test/fixtures/relay-vectors.json) without reading them; the shape and
// size checks; the 2-minute life and the 50-message cap; the long poll; 120 requests a minute per box; the status;
// the relay-only origin rule (chrome-extension:// origins and their private-network preflight, while every other
// route keeps checkOrigin); and nothing on disk or in the log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiServer } from '../../server/http/server.mjs';
import { createRuntime } from '../../server/runtime.mjs';
import { checkOrigin, checkRelayOrigin } from '../../server/http/access.mjs';
import { createRelayStore, isRelayEnvelope, isRelayRoute, RELAY_BODY_BYTES, RELAY_MAX_MESSAGES, RELAY_TTL_MS, RELAY_PER_MINUTE, CT_MAX_CHARS } from '../../server/http/relay-routes.mjs';
import { VERSION } from '../../server/version.mjs';
import { fixtureCore, request, testConfig, tmpDir, START } from './helpers.mjs';

const VECTORS = JSON.parse(fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../test/fixtures/relay-vectors.json'), 'utf8'));
const APP = 'https://frankwise0202-maker.github.io';
const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop';
const OUR_NAME = 'alienware.tail4e5f6a.ts.net';
const TS = { host: OUR_NAME, 'x-forwarded-for': '100.88.21.7', 'x-forwarded-host': OUR_NAME, 'x-forwarded-proto': 'https', 'tailscale-user-login': 'owner@example.com' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const envOf = (c) => ({ id: c.id, iv: c.iv, ct: c.ct });
const id22 = (n) => `${'A'.repeat(20)}${String(n).padStart(2, '0').replace(/\d/g, (d) => 'ABCDEFGHIJ'[d])}`;
const fake = (n, ct = 'C'.repeat(96)) => ({ id: id22(n), iv: 'I'.repeat(16), ct });

// ------------------------------------------------------------------------------------------------ pure parts

test('routes and shapes: the three relay routes; exactly { id, iv, ct } of the envelope\'s lengths (the vectors)', () => {
  for (const r of ['/api/relay/to-ext', '/api/relay/to-app', '/api/relay/status', '/api/relay/to-app/']) assert.equal(isRelayRoute(r), true, r);
  for (const r of ['/api/relay', '/api/relay/', '/api/relay/to-x', '/api/relay/to-ext/1', '/api/status', '/relay/to-ext']) assert.equal(isRelayRoute(r), false, r);
  for (const c of VECTORS.valid) assert.equal(isRelayEnvelope(envOf(c)), true, c.name);
  // What the relay can tell: the shape. Sealed contents it never reads (a changed byte, the wrong box, too old…).
  for (const c of VECTORS.drop) {
    const shapeOnly = c.reason === 'shape' && !/non-canonically/.test(c.name);
    assert.equal(isRelayEnvelope(c.envelope), !shapeOnly, c.name);
  }
  const big = VECTORS.drop.find((c) => /too big/.test(c.name)).envelope;
  assert.equal(big.ct.length, CT_MAX_CHARS + 1, 'a plaintext of 16,385 bytes is one character over');
  for (const bad of [null, [], 'x', { id: 1, iv: 'I'.repeat(16), ct: 'C'.repeat(96) }, { ...fake(1), extra: true }, { ...fake(1), ct: 'C'.repeat(23) }, { ...fake(1), ct: 'C'.repeat(97) }]) {
    assert.equal(isRelayEnvelope(bad), false, JSON.stringify(bad));
  }
});

test('store: oldest first, after/last, a repeated id kept once, 50 a box, 2 minutes each, the boxes apart', () => {
  let t = START;
  const s = createRelayStore({ now: () => t });
  try {
    assert.deepEqual(s.read('to-ext'), { messages: [], last: null });
    assert.deepEqual(s.read('to-ext', id22(9)), { messages: [], last: id22(9) }, 'nothing held: last is after');
    s.post('to-ext', fake(1));
    t += 1000;
    s.post('to-ext', fake(2));
    assert.equal(s.post('to-ext', fake(2)).stored, false, 'the same id again: kept once');
    assert.deepEqual(s.read('to-ext').messages.map((m) => m.id), [id22(1), id22(2)]);
    assert.deepEqual(s.read('to-ext', id22(1)), { messages: [fake(2)], last: id22(2) });
    assert.deepEqual(s.read('to-ext', id22(2)), { messages: [], last: id22(2) });
    assert.deepEqual(s.read('to-ext', id22(77)).messages.length, 2, 'an id no longer held: everything held');
    assert.deepEqual(s.read('to-app'), { messages: [], last: null }, 'the other box is apart');
    // The 2-minute life.
    t = START + RELAY_TTL_MS - 1;
    assert.equal(s.read('to-ext').messages.length, 2);
    t = START + RELAY_TTL_MS;
    assert.deepEqual(s.read('to-ext').messages.map((m) => m.id), [id22(2)]);
    t += 1000;
    assert.deepEqual(s.read('to-ext'), { messages: [], last: null });
    // At most 50: the oldest go first.
    for (let i = 0; i < RELAY_MAX_MESSAGES + 5; i++) s.post('to-app', fake(i));
    const held = s.read('to-app').messages;
    assert.equal(held.length, RELAY_MAX_MESSAGES);
    assert.equal(held[0].id, id22(5));
    assert.deepEqual(s.sizes(), { 'to-ext': { messages: 0, waiting: 0 }, 'to-app': { messages: 50, waiting: 0 } });
    // sweep() drops expired messages without any request.
    t += RELAY_TTL_MS;
    s.sweep();
    assert.equal(s.sizes()['to-app'].messages, 0);
  } finally {
    s.close();
  }
});

test('store: the status counts reads; a read waiting now counts as now; a post wakes the waiting read', async () => {
  let t = START;
  const s = createRelayStore({ now: () => t });
  try {
    assert.deepEqual(s.status(), { extSeenAt: null, appSeenAt: null });
    s.read('to-ext');
    t += 5000;
    assert.deepEqual(s.status(), { extSeenAt: START, appSeenAt: null });
    const waiting = s.wait('to-app', null, 5000);
    t += 1000;
    assert.equal(s.status().appSeenAt, t, 'waiting on its box right now');
    assert.equal(s.sizes()['to-app'].waiting, 1);
    s.post('to-ext', fake(3)); // the other box: no wake
    s.post('to-app', fake(4));
    assert.deepEqual(await waiting, { messages: [fake(4)], last: id22(4) });
    assert.equal(s.sizes()['to-app'].waiting, 0);
    // An aborted wait lets go at once; close() answers whoever still waits.
    const ac = new AbortController();
    const aborted = s.wait('to-ext', id22(3), 5000, ac.signal);
    ac.abort();
    assert.deepEqual(await aborted, { messages: [], last: id22(3) });
    const left = s.wait('to-ext', id22(3), 60_000);
    s.close();
    assert.deepEqual(await left, { messages: [], last: id22(3) });
  } finally {
    s.close();
  }
});

test('origins: the relay also takes chrome-extension:// and an extension\'s own fetch; every other route keeps checkOrigin', () => {
  const access = { ok: true, via: 'tailscale', host: OUR_NAME, scheme: 'https' };
  const req = (headers) => ({ headers });
  const opts = { allowedOrigins: [APP] };
  const both = (headers) => [checkOrigin(req(headers), access, opts), checkRelayOrigin(req(headers), access, opts)];
  // The app: both.
  assert.deepEqual(both({ origin: APP }).map((r) => r.allow), [APP, APP]);
  // Jarvis for Chrome: the relay only.
  const [plain, relay] = both({ origin: EXT });
  assert.equal(plain.ok, false);
  assert.deepEqual(relay, { ok: true, allow: EXT });
  for (const bad of ['chrome-extension://abc', `${EXT}a`, 'chrome-extension://ABCDEFGHIJKLMNOPABCDEFGHIJKLMNOP', 'chrome-extension://qrstuvwxyzqrstuvwxyzqrstuvwxyzqr', `${EXT}/`, 'moz-extension://abcdefghijklmnopabcdefghijklmnop', 'https://evil.example', 'null']) {
    assert.equal(checkRelayOrigin(req({ origin: bad }), access, opts).ok, false, bad);
  }
  // No Origin: an extension's CORS fetch passes on the relay; a page's no-cors request (an <img>) never does.
  assert.equal(checkRelayOrigin(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }), access, opts).ok, true);
  assert.equal(checkOrigin(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' }), access, opts).ok, false);
  assert.equal(checkRelayOrigin(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' }), access, opts).ok, false);
  assert.equal(checkRelayOrigin(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'script' }), access, opts).ok, false);
});

// ------------------------------------------------------------------------------------- over HTTP, a fake clock

let api;
let port;
let clock = START;

before(async () => {
  const { core, config } = fixtureCore('ok', { warmupSec: 5 });
  // The API's general limit (20 a second per client) stays out of the way of the relay's own.
  config.limits = { ...config.limits, apiBurst: 100_000, apiPerSecond: 100_000 };
  api = createApiServer({ getCore: () => core, config, ask: () => ({ answer: 'ok' }), info: () => ({ name: 'jarvis-core' }), relay: { now: () => clock } });
  ({ port } = await api.listen(0, '127.0.0.1'));
});

after(async () => {
  await api.close();
});

const post = (box, body, headers = {}) => request(port, `/api/relay/${box}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const get = (p, headers = {}) => request(port, p, { headers });

test('HTTP: the vectors\' envelopes go through both boxes as they are, oldest first, with after and last', async () => {
  clock = START + 10 * 60_000;
  const toExt = VECTORS.valid.filter((c) => c.box === 'to-ext');
  const toApp = VECTORS.valid.filter((c) => c.box === 'to-app');
  for (const c of toExt) assert.deepEqual((await post('to-ext', envOf(c))).json, { ok: true }, c.name);
  for (const c of toApp) assert.equal((await post('to-app', envOf(c))).status, 200, c.name);
  const all = await get('/api/relay/to-ext');
  assert.equal(all.status, 200);
  assert.equal(all.headers['cache-control'], 'no-store');
  assert.deepEqual(all.json, { messages: toExt.map(envOf), last: toExt.at(-1).id });
  const next = await get(`/api/relay/to-ext?after=${toExt[0].id}`);
  assert.deepEqual(next.json.messages.map((m) => m.id), toExt.slice(1).map((c) => c.id));
  assert.deepEqual((await get(`/api/relay/to-ext?after=${toExt.at(-1).id}&wait=0`)).json, { messages: [], last: toExt.at(-1).id });
  const app = await get('/api/relay/to-app');
  assert.deepEqual(app.json.messages, toApp.map(envOf), 'the largest (16,384 bytes of plaintext) included');
  // The relay can't read what it holds: a tampered or too-old message is held like any other; its reader drops it.
  const tampered = VECTORS.drop.find((c) => /changed byte in the ciphertext/.test(c.name));
  assert.equal((await post('to-ext', tampered.envelope)).status, 200);
  clock += RELAY_TTL_MS; // let them all go
});

test('HTTP: 24 KB at most (declared or streamed); exactly the envelope\'s shape; JSON only; errors never echo the body', async () => {
  clock = START + 20 * 60_000;
  const big = VECTORS.drop.find((c) => /too big/.test(c.name));
  const tooBig = await post('to-app', big.envelope);
  assert.equal(tooBig.status, 400, 'a ct one character over the largest plaintext');
  assert.equal(tooBig.json.error, 'bad_envelope');
  const huge = JSON.stringify({ ...fake(1), ct: 'C'.repeat(RELAY_BODY_BYTES) });
  const declared = await post('to-app', huge);
  assert.equal(declared.status, 413);
  assert.equal(declared.json.error, 'too_large');
  // Streamed without a Content-Length: cut off at 24 KB all the same.
  const streamed = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/relay/to-app', method: 'POST', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' }, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    for (let i = 0; i < 30; i++) req.write('x'.repeat(1024));
    req.end();
  });
  assert.equal(streamed.status, 413);
  for (const bad of [{ ...fake(1), extra: 1 }, { id: fake(1).id, iv: fake(1).iv }, { ...fake(1), id: 'short' }, { ...fake(1), iv: `${'I'.repeat(14)}==` }, { ...fake(1), ct: `${'C'.repeat(95)}+` }, [fake(1)], 'null', '"text"']) {
    const r = await post('to-ext', bad);
    assert.equal(r.status, 400, JSON.stringify(bad));
    assert.equal(r.json.error, 'bad_envelope');
  }
  const secretish = '{"id": "SECRET-BODY-TEXT", ';
  const notJson = await post('to-ext', secretish);
  assert.deepEqual(notJson.json, { error: 'bad_json', message: 'the body is not valid JSON' });
  assert.ok(!notJson.body.includes('SECRET'), 'the parser\'s message (which quotes the body) is never sent');
  const form = await post('to-ext', JSON.stringify(fake(1)), { 'content-type': 'text/plain' });
  assert.equal(form.status, 415);
  assert.equal((await get('/api/relay/to-ext')).json.messages.length, 0, 'nothing refused was kept');
});

test('HTTP: each message lives 2 minutes; 50 a box', async () => {
  clock = START + 30 * 60_000;
  assert.equal((await post('to-ext', fake(1))).status, 200);
  clock += RELAY_TTL_MS - 1000;
  assert.equal((await get('/api/relay/to-ext')).json.messages.length, 1, 'still there after 1:59');
  clock += 1000;
  assert.deepEqual((await get('/api/relay/to-ext')).json, { messages: [], last: null }, 'gone at 2:00');
  for (let i = 0; i < 52; i++) await post('to-app', fake(i));
  const held = (await get('/api/relay/to-app')).json.messages;
  assert.equal(held.length, 50);
  assert.equal(held[0].id, id22(2));
  clock += RELAY_TTL_MS;
});

test('HTTP: 120 requests a minute per box, both methods; the other box and the status are apart; Retry-After', async () => {
  clock = START + 40 * 60_000;
  for (let i = 0; i < RELAY_PER_MINUTE; i++) {
    const r = i % 2 ? await post('to-ext', fake(i % 50)) : await get('/api/relay/to-ext');
    assert.equal(r.status, 200, `request ${i + 1}`);
  }
  const limited = await get('/api/relay/to-ext');
  assert.equal(limited.status, 429);
  assert.equal(limited.json.error, 'rate_limited');
  assert.ok(Number(limited.headers['retry-after']) >= 1);
  assert.equal((await post('to-ext', fake(60))).status, 429, 'posting counts too');
  assert.equal((await get('/api/relay/to-app')).status, 200, 'the other box has its own minute');
  assert.equal((await get('/api/relay/status')).status, 200);
  clock += 30_000; // half a minute refills 60
  assert.equal((await get('/api/relay/to-ext')).status, 200);
  clock += 10 * 60_000;
});

test('HTTP: the long poll answers when a message arrives, or with nothing after `wait`; bad after and wait are refused', async () => {
  clock = START + 60 * 60_000;
  const t0 = Date.now();
  const waiting = get('/api/relay/to-app?wait=5');
  await sleep(150);
  assert.equal(api.relay.store.sizes()['to-app'].waiting, 1);
  assert.equal((await get('/api/relay/status')).json.appSeenAt, clock, 'the app is reading its box right now');
  await post('to-app', fake(7));
  const got = await waiting;
  assert.deepEqual(got.json, { messages: [fake(7)], last: id22(7) });
  assert.ok(Date.now() - t0 < 2500, `answered when the message came (${Date.now() - t0} ms)`);
  const t1 = Date.now();
  const empty = await get(`/api/relay/to-app?after=${id22(7)}&wait=1`);
  assert.deepEqual(empty.json, { messages: [], last: id22(7) });
  assert.ok(Date.now() - t1 >= 900, 'waited its second');
  for (const q of ['wait=26', 'wait=-1', 'wait=1.5', 'wait=abc', 'wait=100']) {
    const r = await get(`/api/relay/to-app?${q}`);
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error, 'bad_wait');
  }
  for (const q of ['after=short', `after=${id22(1)}x`, 'after=%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B%2B']) {
    const r = await get(`/api/relay/to-app?${q}`);
    assert.equal(r.status, 400, q);
    assert.equal(r.json.error, 'bad_after');
  }
  // A reader that hangs up lets go of its place at once.
  await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: `/api/relay/to-ext?wait=20`, agent: false }, () => {});
    req.on('error', () => resolve());
    req.end();
    setTimeout(() => {
      req.destroy();
      resolve();
    }, 150);
  });
  const freed = Date.now();
  while (api.relay.store.sizes()['to-ext'].waiting && Date.now() - freed < 2000) await sleep(20);
  assert.equal(api.relay.store.sizes()['to-ext'].waiting, 0);
  clock += RELAY_TTL_MS;
});

test('HTTP: a long poll outlives the 15-second receive deadline (it only covers receiving the request)', async () => {
  const { REQUEST_RECEIVE_MS } = await import('../../server/http/server.mjs');
  const wait = Math.ceil(REQUEST_RECEIVE_MS / 1000) + 1;
  const t0 = Date.now();
  const r = await get(`/api/relay/to-ext?after=${id22(98)}&wait=${wait}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { messages: [], last: id22(98) });
  assert.ok(Date.now() - t0 >= REQUEST_RECEIVE_MS, `answered after its wait (${Date.now() - t0} ms), not cut at the deadline`);
});

test('HTTP: the status says when each side last read its box', async () => {
  clock = START + 70 * 60_000;
  const s0 = (await get('/api/relay/status')).json;
  assert.deepEqual(Object.keys(s0).sort(), ['appSeenAt', 'extSeenAt']);
  await get('/api/relay/to-ext');
  assert.equal((await get('/api/relay/status')).json.extSeenAt, clock);
  clock += 1000;
  await get('/api/relay/to-app');
  assert.deepEqual((await get('/api/relay/status')).json, { extSeenAt: clock - 1000, appSeenAt: clock });
});

test('HTTP: methods', async () => {
  for (const [method, p] of [['PUT', '/api/relay/to-ext'], ['DELETE', '/api/relay/to-app'], ['HEAD', '/api/relay/to-ext'], ['POST', '/api/relay/status']]) {
    const r = await request(port, p, { method, headers: { 'content-type': 'application/json' }, body: method === 'HEAD' ? null : '{}' });
    assert.equal(r.status, 405, `${method} ${p}`);
    if (method !== 'HEAD') assert.equal(r.json.error, 'method_not_allowed');
  }
  assert.equal((await get('/api/relay')).status, 404);
});

test('HTTP: origins — the app and Jarvis for Chrome on the relay (preflights answered, private network too); elsewhere the extension is refused', async () => {
  clock = START + 80 * 60_000;
  const preflight = (origin, p = '/api/relay/to-ext', method = 'POST') => request(port, p, { method: 'OPTIONS', headers: { ...TS, origin, 'access-control-request-method': method, 'access-control-request-headers': 'content-type', 'access-control-request-private-network': 'true' } });
  for (const origin of [APP, EXT]) {
    for (const p of ['/api/relay/to-ext', '/api/relay/to-app', '/api/relay/status']) {
      const pre = await preflight(origin, p, p.endsWith('status') ? 'GET' : 'POST');
      assert.equal(pre.status, 204, `${origin} ${p}`);
      assert.equal(pre.headers['access-control-allow-origin'], origin);
      assert.equal(pre.headers['access-control-allow-private-network'], 'true');
      assert.match(pre.headers['access-control-allow-headers'], /Content-Type/);
      assert.match(pre.headers['access-control-allow-methods'], /POST/);
    }
    const sent = await post('to-ext', fake(11), { ...TS, origin });
    assert.equal(sent.status, 200, origin);
    assert.equal(sent.headers['access-control-allow-origin'], origin);
    const read = await get('/api/relay/to-ext', { ...TS, origin });
    assert.equal(read.status, 200);
    assert.equal(read.headers['access-control-allow-origin'], origin);
  }
  // Jarvis for Chrome reaches nothing else: every other route keeps checkOrigin.
  for (const p of ['/api/status', '/api/info', '/api/sync', '/api/brain', '/api/events', '/api/senses']) {
    const r = await get(p, { ...TS, origin: EXT });
    assert.equal(r.status, 403, p);
    assert.equal(r.json.error, 'origin_not_allowed');
    assert.equal(r.headers['access-control-allow-origin'], undefined);
    const pre = await preflight(EXT, p, 'GET');
    assert.equal(pre.status, 403, `preflight ${p}`);
    assert.equal(pre.headers['access-control-allow-private-network'], undefined);
  }
  // Other origins, malformed extension ids, a page's no-cors request: refused on the relay too.
  for (const origin of ['https://evil.example', 'http://localhost:5173', 'chrome-extension://short', 'null']) {
    const r = await post('to-ext', fake(12), { ...TS, origin });
    assert.equal(r.status, 403, origin);
    assert.equal(r.headers['access-control-allow-origin'], undefined);
    assert.equal((await preflight(origin)).status, 403);
  }
  const img = await get('/api/relay/to-ext?wait=0', { ...TS, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' });
  assert.equal(img.status, 403);
  const extFetch = await get('/api/relay/to-ext', { ...TS, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors', 'sec-fetch-dest': 'empty' });
  assert.equal(extFetch.status, 200, 'an extension\'s own fetch without an Origin');
  // Still only the tailnet or this computer: Funnel and a rebinding Host are refused before any origin rule.
  const funnel = await post('to-ext', fake(13), { host: OUR_NAME, 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https', 'tailscale-funnel-request': '?1', origin: EXT });
  assert.equal(funnel.status, 403);
  assert.match(funnel.json.message, /Funnel/);
  assert.equal(funnel.headers['access-control-allow-origin'], undefined);
  const rebound = await request(port, '/api/relay/to-ext', { host: `attacker.example:${port}`, headers: { origin: EXT } });
  assert.equal(rebound.status, 403);
  // A refusal on the relay is readable by Jarvis for Chrome (it can tell "refused" from a Core that is down).
  const noLogin = await get('/api/relay/to-ext', { host: OUR_NAME, 'x-forwarded-for': '100.88.21.7', 'x-forwarded-proto': 'https', origin: EXT });
  assert.equal(noLogin.status, 403);
  assert.equal(noLogin.headers['access-control-allow-origin'], EXT);
  clock += RELAY_TTL_MS;
});

// -------------------------------------------------------------------------- the real runtime: disk and log

test('nothing on disk or in the log: a persistent home base relays the vectors and keeps none of it', async () => {
  const data = tmpDir('jarvis-core-relay-');
  const logs = [];
  const start = async () => {
    const config = testConfig(['--fixture', 'ok', '--port', '0', '--data-dir', data]);
    Object.assign(config, { startMs: START, persist: true, secretsDir: path.join(data, 'secrets'), dashboardDir: tmpDir('jarvis-core-dash-') });
    const rt = await createRuntime(config, { log: (m) => logs.push(String(m)) });
    const { port: p } = await rt.start({ port: 0 });
    return { rt, p };
  };
  const { rt, p } = await start();
  const pieces = [];
  try {
    const send = (box, body, headers = {}) => request(p, `/api/relay/${box}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: EXT, ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    for (const c of VECTORS.valid) {
      assert.equal((await send(c.box, envOf(c))).status, 200, c.name);
      pieces.push(c.id, c.iv, c.ct.slice(0, 24), c.ct.slice(-24));
    }
    for (const c of VECTORS.drop.slice(0, 6)) await send(c.box, c.envelope);
    // Refused ones too: not JSON, too big, a bad shape.
    await send('to-ext', '{"id":"NOT-JSON-RELAY-SECRET"');
    await send('to-ext', JSON.stringify({ ...fake(1), ct: 'Q'.repeat(30_000) }));
    await send('to-ext', { id: 'SHAPE-RELAY-SECRET', iv: 'x', ct: 'y' });
    pieces.push('NOT-JSON-RELAY-SECRET', 'SHAPE-RELAY-SECRET', 'Q'.repeat(64));
    for (const box of ['to-ext', 'to-app']) assert.ok((await request(p, `/api/relay/${box}?wait=1`, { headers: { origin: EXT } })).json.messages.length > 0);
    await request(p, '/api/relay/status');
  } finally {
    await rt.stop(); // a clean stop saves everything the Core keeps
  }
  const leaks = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else {
        const text = fs.readFileSync(f).toString('latin1');
        for (const piece of pieces) if (text.includes(piece)) leaks.push(`${path.relative(data, f)} holds ${piece.slice(0, 12)}…`);
      }
    }
  };
  walk(data);
  assert.deepEqual(leaks, [], 'no relayed message is ever written to disk');
  for (const line of logs) for (const piece of pieces) assert.ok(!line.includes(piece), `the log never holds a message: ${line.slice(0, 120)}`);
  // A restart starts with empty boxes: nothing was kept.
  const again = await start();
  try {
    assert.deepEqual((await request(again.p, '/api/relay/to-ext')).json, { messages: [], last: null });
    assert.deepEqual((await request(again.p, '/api/relay/to-app')).json, { messages: [], last: null });
  } finally {
    await again.rt.stop();
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('the Core is 1.3.0 or later: the relay\'s version', () => {
  const [major, minor] = VERSION.split('.').map(Number);
  assert.ok(major > 1 || (major === 1 && minor >= 3), VERSION);
});

// ------------------------------------------------------------- REDTEAM-LINK-2: outside waiters, its own limiter

test('LINK-2: 8 outside waiters hold to-ext; the extension\'s own long poll is refused with 429 and Retry-After (never answered at once), short reads still work, and relay traffic never takes from the API\'s limit', async () => {
  // A home base with the API's real limits (60 at once, 20 a second, one bucket per Tailscale login).
  const { core: fc, config } = fixtureCore('ok', { warmupSec: 5 });
  const srv = createApiServer({ getCore: () => fc, config, ask: () => ({ answer: 'ok' }), info: () => ({ name: 'jarvis-core' }) });
  const { port: p } = await srv.listen(0, '127.0.0.1');
  const OTHER = (c) => `chrome-extension://${c.repeat(32)}`; // other extensions, in other Chrome profiles
  const open = [];
  const hold = (origin) => {
    const req = http.request({ host: '127.0.0.1', port: p, path: '/api/relay/to-ext?wait=20', headers: { ...TS, origin }, agent: false }, () => {});
    req.on('error', () => {});
    req.end();
    open.push(req);
  };
  try {
    // One outside client may hold at most 4 waiting reads; a fifth is refused at once.
    for (let i = 0; i < 4; i++) hold(OTHER('b'));
    await waitUntil(() => srv.relay.store.sizes()['to-ext'].waiting === 4);
    const fifth = await request(p, '/api/relay/to-ext?wait=20', { headers: { ...TS, origin: OTHER('b') } });
    assert.equal(fifth.status, 429, 'one client holds at most 4 of the 8 places');
    for (let i = 0; i < 4; i++) hold(OTHER('c'));
    await waitUntil(() => srv.relay.store.sizes()['to-ext'].waiting === 8);
    // The box is full: Jarvis for Chrome's own long poll is refused, not answered at once with nothing.
    const t0 = Date.now();
    const mine = await request(p, '/api/relay/to-ext?wait=20', { headers: { ...TS, origin: EXT } });
    assert.equal(mine.status, 429, `refused (${mine.status} ${mine.body})`);
    assert.equal(mine.json.error, 'busy');
    assert.ok(Number(mine.headers['retry-after']) >= 1, 'with Retry-After');
    assert.ok(Date.now() - t0 < 2000, 'at once');
    assert.equal(srv.relay.store.sizes()['to-ext'].waiting, 8);
    // A short read (wait=0) still reads the box; the app can still post.
    assert.equal((await request(p, '/api/relay/to-ext', { headers: { ...TS, origin: EXT } })).status, 200);
    // Relay traffic has its own limits: 150 relay requests from the owner's login leave the API's 60 untouched.
    for (let i = 0; i < 150; i++) await request(p, '/api/relay/status', { headers: { ...TS, origin: i % 2 ? EXT : APP } });
    for (let i = 0; i < 10; i++) {
      const ping = await request(p, '/api/ping', { headers: { ...TS, origin: APP } });
      assert.equal(ping.status, 200, `the API's own routes are not starved (ping ${i + 1}: ${ping.status})`);
    }
    const stop = await request(p, '/api/relay/to-ext', { method: 'POST', headers: { ...TS, origin: APP, 'content-type': 'application/json' }, body: JSON.stringify(fake(1)) });
    assert.equal(stop.status, 200, 'the app\'s post still goes in');
  } finally {
    for (const r of open) r.destroy();
    await srv.close();
  }
});

async function waitUntil(fn, ms = 3000) {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await sleep(10);
  }
}
