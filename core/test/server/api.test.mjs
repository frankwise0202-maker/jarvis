// node --test: the HTTP API end to end, on a fixture runtime listening on an ephemeral port.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRuntime } from '../../server/runtime.mjs';
import { request, testConfig, tmpDir, START } from './helpers.mjs';

let rt;
let port;
let dash;

before(async () => {
  dash = tmpDir('jarvis-core-dash-');
  fs.writeFileSync(path.join(dash, 'index.html'), '<!doctype html><title>dash</title>');
  fs.writeFileSync(path.join(dash, 'app.js'), 'console.log(1)');
  fs.writeFileSync(path.join(dash, '.secret'), 'no');
  const config = testConfig(['--fixture', 'ok', '--port', '0']);
  Object.assign(config, { startMs: START, dashboardDir: dash });
  rt = await createRuntime(config);
  ({ port } = await rt.start({ port: 0 }));
});

after(async () => {
  await rt.stop();
  fs.rmSync(dash, { recursive: true, force: true });
});

const ask = (q, headers = {}) => request(port, '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ q }) });

test('GET /api/status: the full snapshot with health', async () => {
  const r = await request(port, '/api/status');
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/json; charset=utf-8');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.deepEqual(Object.keys(r.json), ['v', 't', 'seq', 'mode', 'scenario', 'host', 'core', 'cpu', 'gpu', 'memory', 'disks', 'network', 'processes', 'services', 'health']);
  assert.equal(r.json.mode, 'fixture');
  assert.equal(r.json.host.hostname, 'alienware');
  assert.equal(r.json.cpu.threads, 8);
  assert.equal(r.json.gpu.name, 'NVIDIA GeForce GTX 970');
  assert.equal(r.json.health.level, 'ok');
  assert.ok(r.json.health.items.length >= 13);
  assert.equal(r.json.services.tailscale.serve, false); // the fixture's serve proxies to 8788, this test runs elsewhere
  const head = await request(port, '/api/status', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.body, '');
});

test('GET /api/history: ranges, series, points, agg and their errors', async () => {
  const r = await request(port, '/api/history?range=1h&series=cpu,cpuTemp&points=12');
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.json.series), ['cpu', 'cpuTemp']);
  assert.equal(r.json.count, 12);
  assert.ok(r.json.series.cpuTemp.every((v) => v > 30 && v < 60));
  const week = await request(port, '/api/history?range=7d&series=gpuTemp');
  assert.ok(week.json.count > 10000);
  assert.equal((await request(port, '/api/history')).json.range, '1h');
  assert.equal((await request(port, '/api/history?range=2y')).json.error, 'bad_range');
  assert.equal((await request(port, '/api/history?series=cpu,nope')).json.error, 'bad_series');
  assert.equal((await request(port, '/api/history?points=0')).json.error, 'bad_points');
  assert.equal((await request(port, '/api/history?agg=median')).json.error, 'bad_agg');
});

test('GET /api/events and /api/info and /api/ping', async () => {
  const ev = await request(port, '/api/events?limit=2');
  assert.equal(ev.status, 200);
  assert.equal(ev.json.events.length, 2);
  assert.ok(ev.json.events[0].id > ev.json.events[1].id);
  assert.equal((await request(port, `/api/events?since=${ev.json.latestId}`)).json.events.length, 0);
  assert.equal((await request(port, '/api/events?limit=abc')).status, 400);
  assert.equal((await request(port, '/api/events?level=purple')).status, 400);
  const info = await request(port, '/api/info');
  assert.equal(info.json.name, 'jarvis-core');
  assert.equal(info.json.mode, 'fixture');
  assert.deepEqual(info.json.you, { via: 'local', login: null, name: null });
  assert.deepEqual(info.json.night, { enabled: true, start: '23:00', end: '07:00' });
  assert.ok(info.json.assistant.intents.includes('how-are-you'));
  assert.equal((await request(port, '/api/ping')).json.ok, true);
});

test('POST /api/ask answers; wrong type, size, JSON and empty questions are refused', async () => {
  const r = await ask('How are you?');
  assert.equal(r.status, 200);
  assert.equal(r.json.intent, 'how-are-you');
  assert.match(r.json.answer, /^All systems normal, Frank\. CPU at \d+ percent, graphics card at \d+ °C, and \d+ GB free on the main drive\.$/);
  assert.ok(Array.isArray(r.json.suggestions));
  assert.equal(typeof r.json.facts.cpuPct, 'number');
  assert.equal((await request(port, '/api/ask', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hi' })).status, 415);
  assert.equal((await request(port, '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'x'.repeat(5000) }) })).status, 413);
  assert.equal((await request(port, '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' })).json.error, 'bad_json');
  assert.equal((await request(port, '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"q": 5}' })).json.error, 'bad_question');
  assert.equal((await ask('   ')).json.error, 'empty_question');
  assert.equal((await ask('a'.repeat(301))).json.error, 'question_too_long');
  assert.equal((await request(port, '/api/ask')).status, 405);
});

test('POST /api/ask is rate limited per client (burst 8, then 30 a minute)', async () => {
  const login = { host: 'alienware.tail4e5f6a.ts.net', 'x-forwarded-for': '100.88.21.7', 'tailscale-user-login': 'ratelimit@example.com' };
  const codes = [];
  for (let i = 0; i < 10; i += 1) codes.push((await ask('hi', login)).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 200, 200, 429, 429]);
  const limited = await ask('hi', login);
  assert.equal(limited.json.error, 'rate_limited');
  assert.ok(Number(limited.headers['retry-after']) >= 1);
});

test('access and CORS through the real server', async () => {
  assert.equal((await request(port, '/api/status', { host: 'evil.example' })).status, 403);
  assert.equal((await request(port, '/api/status', { headers: { 'x-forwarded-for': '10.0.0.9' } })).json.error, 'forbidden');
  assert.equal((await request(port, '/api/status', { headers: { origin: 'https://evil.example' } })).json.error, 'origin_not_allowed');
  const ok = await request(port, '/api/status', { headers: { origin: 'https://frankwise0202-maker.github.io' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers['access-control-allow-origin'], 'https://frankwise0202-maker.github.io');
  assert.equal(ok.headers.vary, 'Origin');
  const pre = await request(port, '/api/ask', { method: 'OPTIONS', headers: { origin: 'https://frankwise0202-maker.github.io', 'access-control-request-method': 'POST', 'access-control-request-private-network': 'true' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-private-network'], 'true');
  assert.equal((await request(port, '/api/ask', { method: 'OPTIONS' })).status, 400);
  const viaTs = await request(port, '/api/info', { headers: { host: 'alienware.tail4e5f6a.ts.net', 'x-forwarded-for': '100.88.21.7', 'x-forwarded-proto': 'https', 'tailscale-user-login': 'owner@example.com' } });
  assert.equal(viaTs.json.you.via, 'tailscale');
  assert.equal((await request(port, '/api/status', { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' } })).status, 403);
});

test('unknown endpoints, wrong methods, errors are JSON', async () => {
  assert.deepEqual((await request(port, '/api/nope')).json, { error: 'not_found', message: 'no such endpoint: /api/nope' });
  const del = await request(port, '/api/status', { method: 'DELETE' });
  assert.equal(del.status, 405);
  assert.equal(del.headers.allow, 'GET, HEAD, OPTIONS');
  assert.equal((await request(port, '/index.html', { method: 'POST', body: '' })).status, 405);
});

test('static files: index, ETag revalidation, no dotfiles, no escaping the folder', async () => {
  const home = await request(port, '/');
  assert.equal(home.status, 200);
  assert.equal(home.body, '<!doctype html><title>dash</title>');
  assert.equal(home.headers['content-type'], 'text/html; charset=utf-8');
  assert.match(home.headers['content-security-policy'], /frame-ancestors/);
  const again = await request(port, '/', { headers: { 'if-none-match': home.headers.etag } });
  assert.equal(again.status, 304);
  assert.equal((await request(port, '/app.js')).headers['content-type'], 'text/javascript; charset=utf-8');
  assert.equal((await request(port, '/.secret')).status, 404);
  assert.equal((await request(port, '/%2e%2e/%2e%2e/etc/passwd')).status, 404);
  assert.equal((await request(port, '/..%2f..%2fetc/passwd')).status, 404);
  assert.equal((await request(port, '/missing.css')).status, 404);
  assert.equal((await request(port, '/%E0%A4%A')).status, 400);
});

test('fixture mode: switch scenario at runtime', async () => {
  const before = await request(port, '/api/fixture');
  assert.equal(before.json.scenario, 'ok');
  const sw = await request(port, '/api/fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scenario: 'nogpu' }) });
  assert.equal(sw.json.scenario, 'nogpu');
  const s = await request(port, '/api/status');
  assert.equal(s.json.scenario, 'nogpu');
  assert.equal(s.json.gpu.status, 'not-installed');
  assert.equal(s.json.gpu.message, 'GPU driver not loaded');
  assert.equal((await request(port, '/api/fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"scenario":"party"}' })).status, 400);
  await request(port, '/api/fixture', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"scenario":"ok"}' });
});

test('the dashboard placeholder when the dashboard folder is missing', async () => {
  const config = testConfig(['--fixture', 'ok']);
  Object.assign(config, { startMs: START, dashboardDir: path.join(dash, 'does-not-exist') });
  const rt2 = await createRuntime(config);
  const { port: p2 } = await rt2.start({ port: 0 });
  try {
    const home = await request(p2, '/');
    assert.equal(home.status, 200);
    assert.match(home.body, /JARVIS CORE/);
    assert.equal((await request(p2, '/other.js')).status, 404);
    // live mode has no fixture endpoint; here it exists
    assert.equal((await request(p2, '/api/fixture')).status, 200);
  } finally {
    await rt2.stop();
  }
});
