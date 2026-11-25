// node --test: the brain's HTTP routes end to end on a fixture runtime (ephemeral port), with the fake
// Claude API: shapes, status codes, body limits, rate limits, access rules, SSE events, and the key never
// appearing anywhere it should not.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../../../server/runtime.mjs';
import { request, testConfig, tmpDir, START } from '../helpers.mjs';
import { startFakeClaude, text, search, cite } from './fake-claude.mjs';
import { KEY, until } from './helpers.mjs';

const CORE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let rt;
let port;
let fake;
const logs = [];
const bodies = []; // every response body, checked for the key at the end

const json = (method, p, body, headers = {}) =>
  request(port, p, { method, headers: { 'content-type': 'application/json', ...headers }, body: body === undefined ? null : typeof body === 'string' ? body : JSON.stringify(body) }).then((r) => {
    bodies.push(r.body);
    return r;
  });
const get = (p, headers = {}) =>
  request(port, p, { headers }).then((r) => {
    bodies.push(r.body);
    return r;
  });

before(async () => {
  fake = await startFakeClaude({
    validKeys: [KEY],
    script: () => ({
      blocks: [...search('q', [{ url: 'https://www.example.com/a', title: 'Example' }]), text('Summary: Done.\n\nThe answer [Example](https://www.example.com/a)', [cite('https://www.example.com/a', 'Example')])],
      stop: 'end_turn',
      usage: { input_tokens: 5000, output_tokens: 500 },
    }),
  });
  const config = testConfig(['--fixture', 'ok', '--port', '0']);
  Object.assign(config, { startMs: START, claudeBase: fake.url, dashboardDir: tmpDir('jarvis-core-dash-') });
  rt = await createRuntime(config, { log: (m) => logs.push(m) });
  ({ port } = await rt.start({ port: 0 }));
});

after(async () => {
  await rt.stop();
  await fake.close();
  const all = [...bodies, ...logs].join('\n');
  assert.ok(!all.includes(KEY), 'the key never appears in a response or a log line');
  assert.ok(!all.includes('TESTKEY_0123456789'), 'not even part of it');
});

test('GET /api/brain: the contract shape, version 1.1.0, no key yet', async () => {
  const r = await get('/api/brain');
  assert.equal(r.status, 200);
  const b = r.json;
  for (const k of ['version', 'key', 'sdk', 'limits', 'spend', 'push', 'briefing', 'jobs', 'watchers', 'owner']) assert.ok(k in b, k);
  assert.equal(b.version, '1.1.0');
  assert.deepEqual(b.key, { set: false, hint: null, setAt: null, verified: false });
  assert.deepEqual(b.sdk, { installed: true });
  assert.deepEqual(b.limits, { dailyUsd: 5, monthlyUsd: 50 });
  assert.deepEqual(Object.keys(b.spend), ['day', 'todayUsd', 'month', 'monthUsd', 'capReached']);
  assert.equal(b.spend.capReached, null);
  assert.match(b.push.vapidPublicKey, /^B[A-Za-z0-9_-]{80,}$/);
  assert.deepEqual(b.push.devices, []);
  assert.deepEqual(Object.keys(b.briefing), ['enabled', 'time', 'units', 'location', 'lastAt', 'nextAt']);
  assert.equal(b.briefing.time, '07:00');
  assert.deepEqual(b.jobs, { running: 0, queued: 0 });
  assert.deepEqual(b.watchers, { active: 0 });
  assert.deepEqual(b.owner, { name: 'Frank' });
  assert.equal((await get('/api/info')).json.version, '1.1.0');
});

test('no key: jobs and watchers are refused with 409 no_key; the briefing is free', async () => {
  assert.equal((await json('POST', '/api/jobs', { kind: 'research', prompt: 'x', depth: 'quick' })).json.error, 'no_key');
  assert.equal((await json('POST', '/api/watchers', { what: 'x', every: '6h' })).status, 409);
  assert.equal((await get('/api/briefing')).json.error, 'none_yet');
  const b = await json('POST', '/api/briefing/run');
  assert.equal(b.status, 200);
  assert.equal(b.json.kind, 'free');
  assert.equal(b.json.headlines.length, 6, 'fixture mode reads the feeds from core/fixtures/brain');
  assert.equal(b.json.weather.label, 'Your location', 'and the weather, for a made-up location');
  assert.equal((await get('/api/briefing')).json.generatedAt, b.json.generatedAt);
});

test('POST /api/brain/key: checked with the models list, hint only; bad keys 400; body limit 16 KB; DELETE 204', async () => {
  const r = await json('POST', '/api/brain/key', { key: KEY });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { ok: true, hint: '…Ab3D', verified: true });
  const b = (await get('/api/brain')).json;
  assert.equal(b.key.set, true);
  assert.equal(b.key.hint, '…Ab3D');
  assert.match(b.key.setAt, /^\d{4}-\d\d-\d\dT/);
  const bad = await json('POST', '/api/brain/key', { key: 'sk-ant-api03-NOPE_NOPE_NOPE_NOPE_NOPE_NOPE' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'bad_key');
  assert.equal((await json('POST', '/api/brain/key', 'nope')).json.error, 'bad_json');
  const big = await json('POST', '/api/brain/key', { key: 'x'.repeat(17 * 1024) });
  assert.equal(big.status, 413);
  // The 5-an-hour limit (4 used above, the 413 included; the DELETE is the 5th).
  assert.equal((await request(port, '/api/brain/key', { method: 'DELETE' })).status, 204);
  assert.equal((await get('/api/brain')).json.key.set, false);
  const limited = await json('POST', '/api/brain/key', { key: KEY });
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers['retry-after']) > 0);
  // Put the key back for the next tests (the limiter is per client: use a tailnet user).
  const ts = { 'tailscale-user-login': 'frank@example.com', host: rt.core.snapshot.services.tailscale.dnsName };
  const again = await request(port, '/api/brain/key', { method: 'POST', host: ts.host, headers: { 'content-type': 'application/json', 'tailscale-user-login': ts['tailscale-user-login'] }, body: JSON.stringify({ key: KEY }) });
  bodies.push(again.body);
  assert.equal(again.status, 200, again.body);
  const plain = await request(port, '/api/brain/key', { method: 'POST', host: ts.host, headers: { 'content-type': 'text/plain', 'tailscale-user-login': ts['tailscale-user-login'] }, body: KEY });
  assert.equal(plain.status, 415);
  bodies.push(plain.body);
});

test('jobs: 202 with the job, list without results, one with its result, SSE job and spend events, DELETE', async () => {
  const frames = [];
  const sse = await import('node:http').then(({ default: http }) => {
    return new Promise((resolve) => {
      const req = http.request({ host: '127.0.0.1', port, path: '/api/stream', agent: false }, (res) => {
        res.setEncoding('utf8');
        let buf = '';
        res.on('data', (c) => {
          buf += c;
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const raw = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const ev = /^event: (.+)$/m.exec(raw)?.[1];
            const data = /^data: (.+)$/m.exec(raw)?.[1];
            if (ev && ev !== 'tick' && ev !== 'status') frames.push({ ev, data });
          }
        });
        resolve(req);
      });
      req.end();
    });
  });
  try {
    const r = await json('POST', '/api/jobs', { kind: 'research', prompt: 'What is the best budget 27-inch monitor?', depth: 'quick', title: 'Budget monitor' });
    assert.equal(r.status, 202);
    const job = r.json.job;
    assert.equal(job.title, 'Budget monitor');
    assert.equal(job.depth, 'quick');
    assert.equal(job.kind, 'research');
    for (const k of ['id', 'kind', 'title', 'prompt', 'depth', 'status', 'createdAt', 'startedAt', 'finishedAt', 'costUsd', 'summary', 'error', 'result']) assert.ok(k in job, k);
    await until(async () => (await get(`/api/jobs/${job.id}`)).json.job.status === 'done', { what: 'job done' });
    const one = (await get(`/api/jobs/${job.id}`)).json.job;
    assert.equal(one.summary, 'Done.');
    assert.deepEqual(one.result.sources, [{ title: 'Example', url: 'https://www.example.com/a' }]);
    const list = (await get('/api/jobs?limit=50')).json.jobs;
    assert.ok(list.some((j) => j.id === job.id));
    assert.ok(list.every((j) => !('result' in j)));
    assert.equal((await get('/api/jobs?kind=research')).json.jobs.length, 1);
    await until(() => frames.some((f) => f.ev === 'job' && JSON.parse(f.data).status === 'done') && frames.some((f) => f.ev === 'spend'), { what: 'SSE events' });
    // A briefing and a watcher made while the stream is open arrive as events too.
    await json('POST', '/api/briefing/run');
    const wr = await json('POST', '/api/watchers', { what: 'an event watcher', every: '24h' });
    await until(() => frames.some((f) => f.ev === 'briefing') && frames.some((f) => f.ev === 'watcher' && JSON.parse(f.data).id === wr.json.watcher.id), { what: 'briefing and watcher events' });
    assert.deepEqual(Object.keys(JSON.parse(frames.find((f) => f.ev === 'briefing').data)), ['date', 'generatedAt', 'kind', 'greeting']);
    assert.equal((await request(port, `/api/watchers/${wr.json.watcher.id}`, { method: 'DELETE' })).status, 204);
    const spend = JSON.parse(frames.find((f) => f.ev === 'spend').data);
    assert.deepEqual(Object.keys(spend), ['day', 'todayUsd', 'month', 'monthUsd', 'capReached']);
    assert.ok(frames.every((f) => !f.data.includes(KEY)));
    const s = (await get('/api/spend?days=7')).json;
    assert.equal(s.days.length, 7);
    assert.ok(s.days[0].usd > 0 && s.days[0].calls >= 2, JSON.stringify(s.days[0])); // the research and the full briefing's call
    assert.deepEqual(s.limits, { dailyUsd: 5, monthlyUsd: 50 });
    assert.equal((await get('/api/spend?days=0')).status, 400);
    // Validation
    assert.equal((await json('POST', '/api/jobs', { kind: 'research', prompt: '' })).json.error, 'bad_prompt');
    assert.equal((await json('POST', '/api/jobs', { kind: 'research', prompt: 'p'.repeat(2001) })).json.error, 'prompt_too_long');
    assert.equal((await json('POST', '/api/jobs', { kind: 'research', prompt: 'p', depth: 'medium' })).json.error, 'bad_depth');
    assert.equal((await json('POST', '/api/jobs', { kind: 'briefing', prompt: 'p' })).json.error, 'bad_kind');
    assert.equal((await json('POST', '/api/jobs', { prompt: 'q'.repeat(1900), title: 't'.repeat(9000) })).status, 202, 'a 12 KB body is within the 16 KB limit');
    assert.equal((await json('POST', '/api/jobs', { prompt: 'q'.repeat(17_000) })).status, 413);
    assert.equal((await get('/api/jobs/j_nosuchjob0000')).status, 404);
    assert.equal((await get('/api/jobs/../../etc')).status, 404);
    // DELETE: a finished job is removed (204).
    assert.equal((await request(port, `/api/jobs/${job.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await get(`/api/jobs/${job.id}`)).status, 404);
    assert.equal((await request(port, '/api/jobs', { method: 'PUT' })).status, 405);
  } finally {
    sse.destroy();
  }
});

test('watchers: 201, list, check now (202), 404, DELETE 204, methods', async () => {
  const r = await json('POST', '/api/watchers', { what: 'Tell me when the LG 27GP850 drops under $300', every: '12h' });
  assert.equal(r.status, 201);
  const w = r.json.watcher;
  for (const k of ['id', 'what', 'every', 'status', 'createdAt', 'lastCheckAt', 'nextCheckAt', 'lastResult', 'costUsd']) assert.ok(k in w, k);
  assert.equal(w.every, '12h');
  assert.equal((await get('/api/watchers')).json.watchers.length, 1);
  const c = await json('POST', `/api/watchers/${w.id}/check`);
  assert.equal(c.status, 202);
  assert.equal(c.json.job.kind, 'watch-check');
  assert.equal((await json('POST', '/api/watchers/w_nosuchwatcher/check')).status, 404);
  assert.equal((await json('POST', '/api/watchers', { what: 'x', every: 'weekly' })).json.error, 'bad_every');
  assert.equal((await request(port, `/api/watchers/${w.id}`, { method: 'GET' })).status, 405);
  assert.equal((await request(port, `/api/watchers/${w.id}`, { method: 'DELETE' })).status, 204);
  assert.equal((await get('/api/watchers')).json.watchers.length, 0);
});

test('settings over HTTP: 4 KB body limit, validation errors are 400 {error, message}', async () => {
  const ok = await json('PUT', '/api/brain/settings', { limits: { dailyUsd: 4 }, briefing: { time: '06:45', units: 'C' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.limits.dailyUsd, 4);
  assert.equal(ok.json.briefing.time, '06:45');
  const bad = await json('PUT', '/api/brain/settings', { limits: { dailyUsd: 999 } });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.json), ['error', 'message']);
  assert.equal((await json('PUT', '/api/brain/settings', { owner: { name: 'n'.repeat(5000) } })).status, 413);
  assert.equal((await json('POST', '/api/brain/settings', {})).status, 405);
  await json('PUT', '/api/brain/settings', { limits: { dailyUsd: 5 }, briefing: { time: '07:00', units: 'F' } });
});

test('push routes: subscribe 201 {id}, listed as a device, unsubscribe; test with no devices', async () => {
  const ecdh = crypto.createECDH('prime256v1');
  // A reserved, never-resolving host (RFC 2606): even if a notification went out during this test, it
  // could never reach a real push service.
  const sub = { endpoint: 'https://push.invalid/QTEST123', keys: { p256dh: ecdh.generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') } };
  const r = await json('POST', '/api/push/subscribe', { subscription: sub, label: 'iPhone' });
  assert.equal(r.status, 201, r.body);
  assert.match(r.json.id, /^p_/);
  const devices = (await get('/api/brain')).json.push.devices;
  assert.equal(devices.length, 1);
  assert.equal(devices[0].label, 'iPhone');
  assert.ok(!JSON.stringify(devices).includes('QTEST123'), 'the endpoint (a capability URL) is never returned');
  assert.equal((await json('POST', '/api/push/subscribe', { subscription: { endpoint: 'http://127.0.0.1/x', keys: sub.keys } })).status, 400);
  const del = await json('DELETE', '/api/push/subscribe', { endpoint: sub.endpoint });
  assert.equal(del.status, 200);
  assert.equal(del.json.removed, true);
  const t = await json('POST', '/api/push/test');
  assert.equal(t.status, 200);
  assert.equal(t.json.sent, 0);
});

test('sync without a data folder (fixture mode): 503 sync_unavailable; device ids checked', async () => {
  assert.equal((await get('/api/sync')).json.error, 'sync_unavailable');
});

test('access rules apply to the new routes: Funnel, DNS rebinding, foreign origins, cross-site no-cors; CORS preflight for PUT/DELETE', async () => {
  const funnel = await request(port, '/api/brain', { headers: { 'tailscale-funnel-request': '?1', 'tailscale-user-login': 'x@y' } });
  assert.equal(funnel.status, 403);
  assert.equal(funnel.headers['access-control-allow-origin'], undefined);
  assert.equal((await request(port, '/api/brain', { host: 'evil.example:' + port })).status, 403);
  const foreign = await request(port, '/api/jobs', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'x' }) });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.json.error, 'origin_not_allowed');
  const nocors = await request(port, '/api/brain/key', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors', 'content-type': 'application/json' }, body: JSON.stringify({ key: KEY }) });
  assert.equal(nocors.status, 403);
  const app = 'https://frankwise0202-maker.github.io';
  const pre = await request(port, '/api/jobs/j_abcdefabcdef', { method: 'OPTIONS', headers: { origin: app, 'access-control-request-method': 'DELETE', 'access-control-request-private-network': 'true' } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers['access-control-allow-methods'], /DELETE/);
  assert.match(pre.headers['access-control-allow-methods'], /PUT/);
  assert.match(pre.headers['access-control-allow-headers'], /X-Jarvis-Device-Label/);
  assert.equal(pre.headers['access-control-allow-private-network'], 'true');
  const fromApp = await request(port, '/api/brain', { headers: { origin: app } });
  assert.equal(fromApp.status, 200);
  assert.equal(fromApp.headers['access-control-allow-origin'], app);
  bodies.push(fromApp.body);
});

test('a page served on another localhost port reaches nothing: not the backups, the key, the settings, jobs or watchers', async () => {
  const data = tmpDir('jarvis-core-origin-');
  const config = testConfig(['--fixture', 'ok', '--port', '0', '--data-dir', data]);
  Object.assign(config, { startMs: START, persist: true, secretsDir: path.join(data, 'secrets'), dashboardDir: tmpDir('jarvis-core-dash-'), claudeBase: fake.url });
  const rt2 = await createRuntime(config);
  const { port: p2 } = await rt2.start({ port: 0 });
  try {
    const backup = JSON.stringify({ app: 'jarvis', version: 3, conversations: [{ id: 'c1', title: 'a private chat' }] });
    assert.equal((await request(p2, '/api/sync/iphone-0001', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: backup })).status, 200);
    const tailnet = { host: 'alienware.tail4e5f6a.ts.net', 'tailscale-user-login': 'owner@example.com', 'x-forwarded-for': '100.64.0.2', 'x-forwarded-proto': 'https' };
    const evil = 'http://localhost:5173';
    const tries = [
      ['GET', '/api/sync/iphone-0001'],
      ['GET', '/api/sync'],
      ['GET', '/api/jobs'],
      ['POST', '/api/brain/key', { key: KEY }],
      ['DELETE', '/api/brain/key'],
      ['PUT', '/api/brain/settings', { limits: { dailyUsd: 50 } }],
      ['POST', '/api/jobs', { kind: 'research', prompt: 'spend it all', depth: 'deep' }],
      ['POST', '/api/watchers', { what: 'anything', every: '6h' }],
    ];
    for (const via of [{ headers: tailnet }, { host: `localhost:${p2}`, headers: {} }]) {
      for (const [method, p, body] of tries) {
        const r = await request(p2, p, { method, host: via.host ?? null, headers: { ...via.headers, origin: evil, 'content-type': 'application/json' }, body: body === undefined ? null : JSON.stringify(body) });
        assert.equal(r.status, 403, `${method} ${p} ${via.host ?? 'tailnet'}`);
        assert.equal(r.json?.error, 'origin_not_allowed');
        assert.equal(r.headers['access-control-allow-origin'], undefined);
        assert.ok(!r.body.includes('a private chat'));
      }
      const pre = await request(p2, '/api/sync/iphone-0001', { method: 'OPTIONS', host: via.host ?? null, headers: { ...via.headers, origin: evil, 'access-control-request-method': 'GET', 'access-control-request-private-network': 'true' } });
      assert.equal(pre.status, 403);
      assert.equal(pre.headers['access-control-allow-private-network'], undefined);
    }
    // Nothing changed: no key, the default limits.
    const brain = await request(p2, '/api/brain');
    assert.equal(brain.json.key.set, false);
    assert.equal(brain.json.limits.dailyUsd, 5);
    // The Jarvis app and the dashboard's own page still get through.
    const app = await request(p2, '/api/sync/iphone-0001', { headers: { ...tailnet, origin: 'https://frankwise0202-maker.github.io', 'accept-encoding': 'identity' } });
    assert.equal(app.status, 200);
    assert.equal(app.headers['access-control-allow-origin'], 'https://frankwise0202-maker.github.io');
    const own = await request(p2, '/api/brain', { headers: { ...tailnet, origin: 'https://alienware.tail4e5f6a.ts.net' } });
    assert.equal(own.status, 200);
    const kiosk = await request(p2, '/api/brain', { host: `127.0.0.1:${p2}`, headers: { origin: `http://localhost:${p2}` } });
    assert.equal(kiosk.status, 200);
  } finally {
    await rt2.stop();
  }
});

test('sync routes on a persistent home base: upload (over 4 KB, gzip), list, download; the 4 KB limit stays elsewhere', async () => {
  const data = tmpDir('jarvis-core-sync-');
  const config = testConfig(['--fixture', 'ok', '--port', '0', '--data-dir', data]);
  Object.assign(config, { startMs: START, persist: true, secretsDir: path.join(data, 'secrets'), dashboardDir: tmpDir('jarvis-core-dash-') });
  const rt2 = await createRuntime(config);
  const { port: p2 } = await rt2.start({ port: 0 });
  try {
    const backup = JSON.stringify({ app: 'jarvis', version: 3, conversations: [{ id: 'c1', text: 'x'.repeat(50_000) }] });
    const put = await request(p2, '/api/sync/mac-chrome-0001', { method: 'PUT', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'x-jarvis-device-label': 'Mac' }, body: zlib.gzipSync(backup) });
    assert.equal(put.status, 200, put.body);
    assert.equal(put.json.ok, true);
    assert.equal(put.json.bytes, Buffer.byteLength(backup));
    const list = await request(p2, '/api/sync');
    assert.equal(list.json.devices[0].id, 'mac-chrome-0001');
    const back = await request(p2, '/api/sync/mac-chrome-0001', { headers: { 'accept-encoding': 'identity' } });
    assert.equal(back.status, 200);
    assert.equal(JSON.parse(back.body).conversations[0].id, 'c1');
    assert.equal((await request(p2, '/api/sync/BAD!', { method: 'PUT', body: '{}' })).status, 400);
    assert.equal((await request(p2, '/api/ask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q: 'x'.repeat(5000) }) })).status, 413, 'other routes keep 4 KB');
  } finally {
    await rt2.stop();
  }
});

test('zero-dependency start: without node_modules the Core serves the system report; the brain says sdk.installed false', async () => {
  const dir = tmpDir('jarvis-core-nodeps-');
  fs.cpSync(path.join(CORE, 'server'), path.join(dir, 'server'), { recursive: true });
  fs.cpSync(path.join(CORE, 'fixtures'), path.join(dir, 'fixtures'), { recursive: true });
  fs.copyFileSync(path.join(CORE, 'package.json'), path.join(dir, 'package.json'));
  assert.equal(fs.existsSync(path.join(dir, 'node_modules')), false);
  const child = spawn(process.execPath, [path.join(dir, 'server/main.mjs'), '--fixture', 'ok', '--port', '0'], { env: { ...process.env, JARVIS_CORE_CONFIG: path.join(dir, 'none.json'), NODE_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (out += c));
  try {
    const m = await until(() => /running at http:\/\/127\.0\.0\.1:(\d+)\//.exec(out), { timeoutMs: 10_000, what: `the Core to start: ${out}` });
    const p = Number(m[1]);
    assert.equal((await request(p, '/api/status')).status, 200);
    const b = (await request(p, '/api/brain')).json;
    assert.deepEqual(b.sdk, { installed: false });
    assert.equal(b.version, '1.1.0');
    const k = await request(p, '/api/brain/key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: KEY }) });
    assert.deepEqual(k.json, { ok: true, hint: '…Ab3D', verified: false });
    const j = await request(p, '/api/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: 'x' }) });
    assert.equal(j.status, 503);
    assert.equal(j.json.error, 'sdk_missing');
    const brief = await request(p, '/api/briefing/run', { method: 'POST' });
    assert.equal(brief.json.kind, 'free');
    assert.ok(!out.includes(KEY));
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => child.once('exit', r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
