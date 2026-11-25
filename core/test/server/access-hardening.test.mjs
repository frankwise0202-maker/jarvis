// node --test: the access hardening for the installed Core: the Host must be localhost on the Core's own
// port or a *.ts.net name (DNS rebinding), Chrome's private-network preflights are answered for allowed
// origins only, and public Tailscale Funnel traffic is refused even though it arrives from localhost.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRuntime } from '../../server/runtime.mjs';
import { checkAccess, checkOrigin, parseHost, isTailnetHostname } from '../../server/http/access.mjs';
import { request, testConfig, START } from './helpers.mjs';

const req = (headers = {}, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } });
const OUR_NAME = 'alienware.tail4e5f6a.ts.net';
const TS = { host: OUR_NAME, 'x-forwarded-for': '100.88.21.7', 'x-forwarded-host': OUR_NAME, 'x-forwarded-proto': 'https', 'tailscale-user-login': 'owner@example.com', 'tailscale-user-name': 'Owner' };
const APP = 'https://frankwise0202-maker.github.io';

// ------------------------------------------------------------------------------------------------ unit

test('parseHost: hostname and port, lower case, trailing dot, IPv6 brackets, malformed', () => {
  assert.deepEqual(parseHost('LocalHost:8788'), { hostname: 'localhost', port: '8788' });
  assert.deepEqual(parseHost('127.0.0.1:08788'), { hostname: '127.0.0.1', port: '8788' });
  assert.deepEqual(parseHost('[::1]:8788'), { hostname: '[::1]', port: '8788' });
  assert.deepEqual(parseHost('[::1]'), { hostname: '[::1]', port: '' });
  assert.deepEqual(parseHost('Alienware.Tail4e5f6a.ts.net.'), { hostname: 'alienware.tail4e5f6a.ts.net', port: '' });
  assert.deepEqual(parseHost('alienware.tail4e5f6a.ts.net:443'), { hostname: 'alienware.tail4e5f6a.ts.net', port: '443' });
  for (const bad of ['', '::1', 'localhost:', 'localhost:abc', 'localhost:8788:1', 'evil@localhost:8788', 'localhost/x', 'local host', '[::1', '[::1]x', 'localhost:123456']) {
    assert.equal(parseHost(bad).hostname, '', `"${bad}" should not parse`);
  }
});

test('isTailnetHostname: MagicDNS names only', () => {
  assert.equal(isTailnetHostname('alienware.tail4e5f6a.ts.net'), true);
  assert.equal(isTailnetHostname('jarvis-core.cat-crocodile.ts.net'), true);
  for (const bad of ['ts.net', '.ts.net', 'evil.example', 'alienware.ts.net.evil.example', 'alienware-.tail.ts.net', 'alien_ware.tail.ts.net', 'a..ts.net', 'evilts.net']) {
    assert.equal(isTailnetHostname(bad), false, bad);
  }
});

test('Host: localhost, 127.0.0.1 and [::1] only on the Core\'s own port', () => {
  const opts = { port: 8788 };
  assert.equal(checkAccess(req({ host: 'localhost:8788' }), opts).via, 'local');
  assert.equal(checkAccess(req({ host: '127.0.0.1:8788' }), opts).ok, true);
  assert.equal(checkAccess(req({ host: '[::1]:8788' }, '::1'), opts).ok, true);
  assert.equal(checkAccess(req({ host: 'LOCALHOST:8788' }), opts).ok, true);
  assert.equal(checkAccess(req({ host: 'localhost.:8788' }), opts).ok, true);
  // another port: a forwarder or another local web server that kept the Host it was given
  const other = checkAccess(req({ host: 'localhost:9999' }), opts);
  assert.equal(other.ok, false);
  assert.match(other.reason, /listens on port 8788/);
  assert.equal(checkAccess(req({ host: '127.0.0.1:80' }), opts).ok, false);
  assert.equal(checkAccess(req({ host: 'localhost' }), opts).ok, false); // no port means port 80
  assert.equal(checkAccess(req({}), opts).ok, false); // no Host at all (HTTP/1.0)
  assert.equal(checkAccess(req({ host: '' }), opts).ok, false);
  // the port is only checked when the server says which one it is
  assert.equal(checkAccess(req({ host: 'localhost:9999' })).ok, true);
});

test('DNS rebinding: any other name pointing at 127.0.0.1 is refused, with or without forged headers', () => {
  const opts = { port: 8788 };
  for (const host of ['evil.example:8788', 'localhost.evil.example:8788', '127.0.0.1.nip.io:8788', 'alienware.tail4e5f6a.ts.net.evil.example:8788', 'evilts.net:8788', '[::2]:8788', '0.0.0.0:8788', '127.0.0.2:8788', 'localhost:8788@evil.example']) {
    const r = checkAccess(req({ host }), opts);
    assert.equal(r.ok, false, host);
    // a rebinding page is same-origin with itself, so it can add any header it likes: still refused
    assert.equal(checkAccess(req({ host, 'tailscale-user-login': 'owner@example.com' }), opts).ok, false, `${host} + forged login`);
  }
  // a *.ts.net Host that did not come through Tailscale serve (no login header) is refused too
  const bare = checkAccess(req({ host: OUR_NAME }), opts);
  assert.equal(bare.ok, false);
  assert.match(bare.reason, /unexpected host/);
});

test('*.ts.net through Tailscale serve: this machine\'s name (any while it is not known yet)', () => {
  const opts = { port: 8788, tailscaleDnsName: OUR_NAME };
  const ok = checkAccess(req(TS), opts);
  assert.deepEqual([ok.ok, ok.via, ok.login, ok.scheme], [true, 'tailscale', 'owner@example.com', 'https']);
  assert.equal(checkAccess(req({ ...TS, host: 'ALIENWARE.tail4e5f6a.ts.net.' }), opts).ok, true);
  assert.equal(checkAccess(req({ ...TS, host: `${OUR_NAME}:8443` }), opts).ok, true); // serve --https=8443
  assert.equal(checkAccess(req(TS), { port: 8788, tailscaleDnsName: `${OUR_NAME}.` }).ok, true); // name with its dot
  const wrong = checkAccess(req({ ...TS, host: 'other.tail9999.ts.net' }), opts);
  assert.equal(wrong.ok, false);
  assert.match(wrong.reason, /tailnet name is alienware\.tail4e5f6a\.ts\.net/);
  assert.equal(checkAccess(req({ ...TS, host: 'other.tail9999.ts.net' }), { port: 8788 }).ok, true);
  // a serve that rewrote Host to the backend's address is still fine, on the right port only
  assert.equal(checkAccess(req({ ...TS, host: '127.0.0.1:8788' }), opts).ok, true);
  assert.equal(checkAccess(req({ ...TS, host: '127.0.0.1:9999' }), opts).ok, false);
});

test('Tailscale Funnel traffic is refused even though it arrives from localhost', () => {
  const funnel = { host: OUR_NAME, 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': OUR_NAME, 'x-forwarded-proto': 'https', 'tailscale-funnel-request': '?1' };
  const r = checkAccess(req(funnel), { port: 8788, tailscaleDnsName: OUR_NAME });
  assert.equal(r.ok, false);
  assert.match(r.reason, /Funnel/);
  // whatever else it carries
  assert.equal(checkAccess(req({ ...funnel, 'tailscale-user-login': 'owner@example.com' }), { port: 8788 }).ok, false);
  assert.equal(checkAccess(req({ host: 'localhost:8788', 'tailscale-funnel-request': '?1' }), { port: 8788 }).ok, false);
  assert.equal(checkAccess(req({ host: 'localhost:8788', 'tailscale-funnel-request': '' }), { port: 8788 }).ok, false);
});

test('CORS with the hardened access: the app and the Core\'s own pages; other localhost pages refused', () => {
  const local = checkAccess(req({ host: 'localhost:8788' }), { port: 8788 });
  const allow = (origin, access = local) => checkOrigin(req({ origin }), access, { allowedOrigins: [APP] });
  assert.equal(allow(APP).allow, APP);
  assert.equal(allow('http://localhost:8788').ok, true);
  assert.equal(allow('http://localhost:5173').ok, false);
  assert.equal(allow('https://evil.example').ok, false);
  const ts = checkAccess(req(TS), { port: 8788, tailscaleDnsName: OUR_NAME });
  assert.equal(allow(`https://${OUR_NAME}`, ts).ok, true);
  assert.equal(allow('https://other.tail9999.ts.net', ts).ok, false);
  assert.equal(allow('http://localhost:5173', ts).ok, false);
});

// ------------------------------------------------------------------------------------- the real server

let rt;
let port;

before(async () => {
  const config = testConfig(['--fixture', 'ok', '--port', '0']);
  Object.assign(config, { startMs: START });
  rt = await createRuntime(config);
  ({ port } = await rt.start({ port: 0 }));
});

after(async () => {
  await rt.stop();
});

test('server: Host must name the Core\'s port; rebinding names get 403 JSON', async () => {
  assert.equal((await request(port, '/api/ping', { host: `localhost:${port}` })).status, 200);
  assert.equal((await request(port, '/api/ping', { host: `127.0.0.1:${port}` })).status, 200);
  const wrongPort = await request(port, '/api/ping', { host: `localhost:${port === 65535 ? port - 1 : port + 1}` });
  assert.equal(wrongPort.status, 403);
  assert.equal(wrongPort.json.error, 'forbidden');
  assert.match(wrongPort.json.message, new RegExp(`listens on port ${port}`));
  assert.equal((await request(port, '/api/ping', { host: 'localhost' })).status, 403);
  const rebound = await request(port, '/api/status', { host: `attacker.example:${port}`, headers: { origin: `http://attacker.example:${port}` } });
  assert.equal(rebound.status, 403);
  assert.equal(rebound.headers['access-control-allow-origin'], undefined);
  assert.equal((await request(port, '/', { host: `attacker.example:${port}` })).status, 403); // the page too
});

test('server: Tailscale serve requests are allowed; Funnel requests are refused (API and page)', async () => {
  const viaTs = await request(port, '/api/info', { headers: TS });
  assert.equal(viaTs.status, 200);
  assert.equal(viaTs.json.you.via, 'tailscale');
  const funnel = { host: OUR_NAME, 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https', 'tailscale-funnel-request': '?1', origin: APP };
  for (const p of ['/api/status', '/api/info', '/']) {
    const r = await request(port, p, { headers: funnel });
    assert.equal(r.status, 403, p);
    assert.equal(r.json.error, 'forbidden');
    assert.match(r.json.message, /Funnel/);
    assert.equal(r.headers['access-control-allow-origin'], undefined);
  }
  const ask = await request(port, '/api/ask', { method: 'POST', headers: { ...funnel, 'content-type': 'application/json' }, body: '{"q":"how are you"}' });
  assert.equal(ask.status, 403);
});

test('server: a refused API request is readable by the Jarvis app (CORS on the 403), not by other pages', async () => {
  // Proxied by Tailscale serve but without a tailnet identity (e.g. a tagged device): refused.
  const noLogin = { host: OUR_NAME, 'x-forwarded-for': '100.88.21.7', 'x-forwarded-host': OUR_NAME, 'x-forwarded-proto': 'https' };
  const app = await request(port, '/api/status', { headers: { ...noLogin, origin: APP } });
  assert.equal(app.status, 403);
  assert.equal(app.json.error, 'forbidden');
  assert.equal(app.headers['access-control-allow-origin'], APP);
  const other = await request(port, '/api/status', { headers: { ...noLogin, origin: 'https://evil.example' } });
  assert.equal(other.status, 403);
  assert.equal(other.headers['access-control-allow-origin'], undefined);
  const page = await request(port, '/', { headers: { ...noLogin, origin: APP } });
  assert.equal(page.status, 403);
  assert.equal(page.headers['access-control-allow-origin'], undefined);
});

test('server: private-network preflights are answered for allowed origins only', async () => {
  const preflight = (origin, extra = {}, pathName = '/api/status', method = 'GET') => request(port, pathName, {
    method: 'OPTIONS',
    headers: { ...TS, origin, 'access-control-request-method': method, 'access-control-request-private-network': 'true', ...extra },
  });
  // the Jarvis app on github.io calling the Alienware's 100.x Tailscale address
  const app = await preflight(APP);
  assert.equal(app.status, 204);
  assert.equal(app.headers['access-control-allow-origin'], APP);
  assert.equal(app.headers['access-control-allow-private-network'], 'true');
  assert.match(app.headers['access-control-allow-methods'], /GET/);
  assert.match(app.headers.vary, /Access-Control-Request-Private-Network/);
  const askPre = await preflight(APP, { 'access-control-request-headers': 'content-type' }, '/api/ask', 'POST');
  assert.equal(askPre.status, 204);
  assert.equal(askPre.headers['access-control-allow-private-network'], 'true');
  assert.match(askPre.headers['access-control-allow-headers'], /Content-Type/);
  // the Core's own page asks too (directly, on the Core's port)
  const local = await request(port, '/api/status', { method: 'OPTIONS', host: `localhost:${port}`, headers: { origin: `http://localhost:${port}`, 'access-control-request-method': 'GET', 'access-control-request-private-network': 'true' } });
  assert.equal(local.status, 204);
  assert.equal(local.headers['access-control-allow-private-network'], 'true');
  // a page another program serves on another localhost port does not get an answer, directly or through the tailnet
  for (const host of [`localhost:${port}`, OUR_NAME]) {
    const via = host === OUR_NAME ? { headers: TS } : { host, headers: {} };
    const other = await request(port, '/api/status', { method: 'OPTIONS', host: via.host ?? null, headers: { ...via.headers, origin: 'http://localhost:5173', 'access-control-request-method': 'GET', 'access-control-request-private-network': 'true' } });
    assert.equal(other.status, 403, host);
    assert.equal(other.headers['access-control-allow-private-network'], undefined, host);
    assert.equal(other.headers['access-control-allow-origin'], undefined, host);
  }
  // other origins: refused, and nothing that would let the browser go ahead
  for (const origin of ['https://evil.example', 'https://frankwise0202-maker.github.io.evil.example', 'http://frankwise0202-maker.github.io', 'null']) {
    const r = await preflight(origin);
    assert.equal(r.status, 403, origin);
    assert.equal(r.headers['access-control-allow-private-network'], undefined, origin);
    assert.equal(r.headers['access-control-allow-origin'], undefined, origin);
  }
  // allowed origin, but on a rebinding Host: refused before CORS
  const rebound = await request(port, '/api/status', { method: 'OPTIONS', host: `attacker.example:${port}`, headers: { origin: APP, 'access-control-request-method': 'GET', 'access-control-request-private-network': 'true' } });
  assert.equal(rebound.status, 403);
  assert.equal(rebound.headers['access-control-allow-private-network'], undefined);
  // no private-network question, no private-network answer
  const plain = await request(port, '/api/status', { method: 'OPTIONS', headers: { ...TS, origin: APP, 'access-control-request-method': 'GET' } });
  assert.equal(plain.status, 204);
  assert.equal(plain.headers['access-control-allow-private-network'], undefined);
});
