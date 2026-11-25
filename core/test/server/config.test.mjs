// node --test: configuration, access rules, CORS and rate limits (pure functions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, parseArgs } from '../../server/config.mjs';
import { resolveLocale, systemLocale } from '../../server/format.mjs';
import { checkAccess, checkOrigin, corsHeaders, hostnameOf } from '../../server/http/access.mjs';
import { createRateLimiter } from '../../server/http/ratelimit.mjs';

const noFile = () => {
  const e = new Error('none');
  e.code = 'ENOENT';
  throw e;
};

test('defaults: 127.0.0.1:8788, Frank, night 23:00-07:00, persistence on', () => {
  const { config, warnings, errors } = loadConfig({ env: {}, argv: [], readFile: noFile });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 8788);
  assert.equal(config.ownerName, 'Frank');
  assert.deepEqual(config.night, { enabled: true, start: '23:00', end: '07:00' });
  assert.equal(config.persist, true);
  assert.match(config.dataDir, /jarvis-core$/);
  assert.deepEqual(config.allowedOrigins, ['https://frankwise0202-maker.github.io']);
});

test('env, flags (flags win) and the config file', () => {
  const file = JSON.stringify({ ownerName: 'Tony', night: { start: '22:30' }, thresholds: { cpuTemp: { warn: 75 } }, bogus: 1 });
  const { config, warnings } = loadConfig({
    env: { JARVIS_CORE_PORT: '9000', JARVIS_CORE_FIXTURE: 'warn', JARVIS_CORE_TIME_SCALE: '60', JARVIS_CORE_START: '2026-11-25T23:30:00Z', JARVIS_CORE_NIGHT: '22:00-06:30' },
    argv: ['--port=9100', '--owner', 'Pepper'],
    readFile: () => file,
  });
  assert.equal(config.port, 9100);
  assert.equal(config.ownerName, 'Pepper');
  assert.equal(config.fixture, 'warn');
  assert.equal(config.timeScale, 60);
  assert.equal(config.startMs, Date.parse('2026-11-25T23:30:00Z'));
  assert.deepEqual(config.night, { enabled: true, start: '22:00', end: '06:30' });
  assert.equal(config.thresholds.cpuTemp.warn, 75);
  assert.equal(config.persist, false); // fixture mode keeps history in memory by default
  assert.ok(warnings.some((w) => /"bogus" is not supported/.test(w)));
  assert.equal(loadConfig({ env: { JARVIS_CORE_NIGHT: 'off' }, readFile: noFile }).config.night.enabled, false);
});

test("locale: the system's by default; a configured one in English; an unknown one warned about", () => {
  const none = () => {
    const e = new Error('none');
    e.code = 'ENOENT';
    throw e;
  };
  const load = (env, argv = [], readFile = none) => loadConfig({ env, argv, readFile });
  assert.equal(load({}).config.locale, resolveLocale(systemLocale()));
  assert.equal(load({ JARVIS_CORE_LOCALE: 'en_GB.UTF-8' }).config.locale, 'en-GB');
  assert.equal(load({}, ['--locale', 'en-US']).config.locale, 'en-US');
  assert.equal(load({}, ['--locale', 'de-DE']).config.locale, 'en-DE', 'German order and 24 hours, English words');
  assert.equal(load({}, [], () => JSON.stringify({ locale: 'en-AU' })).config.locale, 'en-AU');
  const bad = load({ JARVIS_CORE_LOCALE: 'not a locale' });
  assert.match(bad.warnings.join('\n'), /locale "not a locale" is not one I know/);
  assert.equal(bad.config.locale, resolveLocale(systemLocale()));
});

test('refuses a public host, a bad fixture and a bad port; ignores time scale outside fixture mode', () => {
  assert.match(loadConfig({ env: { JARVIS_CORE_HOST: '0.0.0.0' }, readFile: noFile }).errors[0], /only listens on this computer/);
  assert.match(loadConfig({ argv: ['--fixture', 'party'], env: {}, readFile: noFile }).errors[0], /not one of ok, warn, alert, nogpu, offline/);
  assert.match(loadConfig({ argv: ['--port', '99999'], env: {}, readFile: noFile }).errors[0], /not a valid port/);
  const live = loadConfig({ argv: ['--time-scale', '60'], env: {}, readFile: noFile });
  assert.equal(live.config.timeScale, 1);
  assert.ok(live.warnings.some((w) => /only applies to fixture mode/.test(w)));
  const broken = loadConfig({ env: {}, readFile: () => '{ not json' });
  assert.deepEqual(broken.errors, []);
  assert.ok(broken.warnings.some((w) => /could not read/.test(w)));
  assert.deepEqual(parseArgs(['--once', '--nope']).unknown, ['--nope']);
});

// ------------------------------------------------------------------------------------------------- access

const req = (headers = {}, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } });
const TS = { host: 'alienware.tail4e5f6a.ts.net', 'x-forwarded-for': '100.88.21.7', 'x-forwarded-proto': 'https', 'tailscale-user-login': 'owner@example.com', 'tailscale-user-name': 'Owner' };

test('access: direct localhost; Tailscale serve with a login; everything else refused', () => {
  assert.equal(checkAccess(req({ host: 'localhost:8788' })).via, 'local');
  assert.equal(checkAccess(req({ host: '127.0.0.1:8788' })).ok, true);
  assert.equal(checkAccess(req({ host: '[::1]:8788' }, '::1')).ok, true);
  const ts = checkAccess(req(TS), { tailscaleDnsName: 'alienware.tail4e5f6a.ts.net' });
  assert.deepEqual([ts.ok, ts.via, ts.login, ts.name, ts.key, ts.scheme], [true, 'tailscale', 'owner@example.com', 'Owner', 'tailscale:owner@example.com', 'https']);
  // DNS rebinding: an attacker's name pointing at 127.0.0.1
  assert.equal(checkAccess(req({ host: 'evil.example:8788' })).ok, false);
  assert.equal(checkAccess(req({ host: 'evil.example:8788', 'tailscale-user-login': 'x@y' })).ok, false);
  // a proxy that is not Tailscale serve
  assert.match(checkAccess(req({ host: 'localhost:8788', 'x-forwarded-for': '10.0.0.5' })).reason, /through Tailscale serve/);
  // another tailnet machine's name, once ours is known
  assert.equal(checkAccess(req({ ...TS, host: 'other.tail9999.ts.net' }), { tailscaleDnsName: 'alienware.tail4e5f6a.ts.net' }).ok, false);
  assert.equal(checkAccess(req({ ...TS, host: 'other.tail9999.ts.net' })).ok, true); // our name not known yet: any *.ts.net
  // allowed logins
  assert.equal(checkAccess(req(TS), { tailscaleLogins: ['someone@else.com'] }).ok, false);
  assert.equal(checkAccess(req(TS), { tailscaleLogins: ['OWNER@example.com'] }).ok, true);
  // never from another address (the server only listens on loopback anyway)
  assert.equal(checkAccess(req({ host: 'localhost' }, '192.168.1.20')).ok, false);
  assert.equal(hostnameOf('[::1]:8788'), '[::1]');
  assert.equal(hostnameOf('LOCALHOST:8788'), 'localhost');
});

test('CORS: github.io and the Core\'s own pages only (not other localhost ports); others refused; preflight with private network', () => {
  const local = checkAccess(req({ host: 'localhost:8788' }));
  const allow = (origin, access = local, extra = {}) => checkOrigin(req({ origin, ...extra }), access, { allowedOrigins: ['https://frankwise0202-maker.github.io'] });
  assert.equal(allow('https://frankwise0202-maker.github.io').allow, 'https://frankwise0202-maker.github.io');
  assert.equal(allow('http://localhost:8788').ok, true, 'the dashboard on this computer');
  assert.equal(allow('http://127.0.0.1:8788').ok, true, 'the same page under another loopback name');
  assert.equal(allow('http://[::1]:8788').ok, true);
  assert.equal(allow('http://localhost:5173').ok, false, 'a page another program serves on this computer');
  assert.equal(allow('http://127.0.0.1:3000').ok, false);
  assert.equal(allow('https://localhost:8788').ok, false);
  // A developer's dev server, added in config.json, is allowed.
  assert.equal(checkOrigin(req({ origin: 'http://localhost:5173' }), local, { allowedOrigins: ['https://frankwise0202-maker.github.io', 'http://localhost:5173'] }).ok, true);
  assert.equal(allow('https://evil.example').ok, false);
  assert.equal(allow('https://frankwise0202-maker.github.io.evil.example').ok, false);
  assert.equal(allow('null').ok, false);
  assert.equal(allow('not a url').ok, false);
  const ts = checkAccess(req(TS));
  assert.equal(allow('https://alienware.tail4e5f6a.ts.net', ts).ok, true); // the dashboard opened through Tailscale
  assert.equal(allow('https://frankwise0202-maker.github.io', ts).ok, true);
  // Through the tailnet, a localhost page on the viewer's device is never this Core's.
  for (const o of ['http://localhost:5173', 'http://localhost:8788', 'http://127.0.0.1:8788', 'https://other.tail4e5f6a.ts.net']) assert.equal(allow(o, ts).ok, false, o);
  assert.equal(checkOrigin(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'no-cors' }), local, {}).ok, false);
  assert.equal(checkOrigin(req({ 'sec-fetch-site': 'same-site', 'sec-fetch-mode': 'no-cors' }), local, {}).ok, false, 'another port of this computer, no-cors');
  assert.equal(checkOrigin(req({ 'sec-fetch-site': 'same-origin', 'sec-fetch-mode': 'cors' }), local, {}).ok, true);
  assert.equal(checkOrigin(req({ 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' }), local, {}).ok, true);
  assert.equal(checkOrigin(req({}), local, {}).allow, null);
  const pre = corsHeaders('https://frankwise0202-maker.github.io', req({ 'access-control-request-private-network': 'true' }), { preflight: true });
  assert.equal(pre['Access-Control-Allow-Private-Network'], 'true');
  assert.equal(pre['Access-Control-Allow-Methods'], 'GET, POST, PUT, DELETE, OPTIONS');
  assert.equal(pre['Access-Control-Allow-Headers'], 'Content-Type, Content-Encoding, Last-Event-ID, X-Jarvis-Device-Label');
  assert.deepEqual(corsHeaders(null, req()), {});
});

test('rate limiter: burst, refill, retry-after, bounded keys', () => {
  let now = 0;
  const rl = createRateLimiter({ capacity: 3, refillPerSec: 0.5, maxKeys: 10, now: () => now });
  assert.equal(rl.take('a').ok, true);
  assert.equal(rl.take('a').ok, true);
  assert.equal(rl.take('a').ok, true);
  const no = rl.take('a');
  assert.deepEqual([no.ok, no.retryAfterSec], [false, 2]);
  assert.equal(rl.take('b').ok, true); // per key
  now += 2000;
  assert.equal(rl.take('a').ok, true);
  for (let i = 0; i < 50; i += 1) rl.take(`k${i}`);
  assert.ok(rl.size <= 11);
});
