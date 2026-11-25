// Home base (v7.5, SPEC §23): the Jarvis Core's address, what the tile shows from the Core's real
// answers (test/unit/fixtures/homebase/), the failure states, "how's the home base", the polling
// lifecycle, the HTTP client (with a fake fetch) and the controller.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeHomeBaseUrl,
  isHomeBaseUrl,
  homeBaseApi,
  homeBaseName,
  homeBaseView,
  gpuReading,
  formatBytes,
  failureState,
  matchHomeBaseCommand,
  createPoller,
  UNREACHABLE_MESSAGE,
  POLL_MS,
} from '../../src/lib/homebase.js';
import { requestHomeBase, getHomeBaseStatus, testHomeBase, askHomeBase } from '../../src/platform/homebase.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../../src/platform/settings.js';
import { RESTORED_SETTINGS } from '../../src/platform/backup.js';
import { createHomeBase, homeBaseGlance } from '../../src/ui/homebase.js';
import { appendHomeBaseTurn } from '../../src/engine/index.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'homebase');
const fixture = (name) => JSON.parse(readFileSync(path.join(FIX, name), 'utf8'));
const STATUS = Object.fromEntries(['ok', 'warn', 'alert', 'nogpu', 'offline'].map((s) => [s, fixture(`status-${s}.json`)]));
const INFO = fixture('info.json');
const ASK = fixture('ask.json');
const BASE = 'https://alienware.tail4e5f6a.ts.net/';
const NBSP = ' ';

// ---- the address -------------------------------------------------------------------------------

test('home base address: pasted with or without https://, a trailing slash or a path, it becomes the Core’s root', () => {
  const good = [
    'https://alienware.tail4e5f6a.ts.net/',
    'https://alienware.tail4e5f6a.ts.net',
    'alienware.tail4e5f6a.ts.net',
    '  https://alienware.tail4e5f6a.ts.net/api/status  ',
    'https://alienware.tail4e5f6a.ts.net/some/path/?q=1#top',
    'HTTPS://AlienWare.Tail4E5F6A.TS.NET/',
    'https://alienware.tail4e5f6a.ts.net.:443/',
    'alienware.tail4e5f6a.ts.net/api',
  ];
  for (const g of good) assert.deepEqual(normalizeHomeBaseUrl(g), { ok: true, url: BASE }, g);
  assert.equal(normalizeHomeBaseUrl('https://my-pc-2.tailnet-abc.ts.net').url, 'https://my-pc-2.tailnet-abc.ts.net/');
});

test('home base address: https only, a Tailscale machine name only (no other host, no port, no password)', () => {
  const bad = {
    '': 'empty',
    '   ': 'empty',
    'http://alienware.tail4e5f6a.ts.net/': 'http',
    'https://example.com/': 'host',
    'https://alienware.tail4e5f6a.ts.net.evil.com/': 'host',
    'https://ts.net/': 'host',
    'https://tail4e5f6a.ts.net/': 'host',
    'https://alienware.tail4e5f6a.ts.net:8443/': 'port',
    'https://frank:secret@alienware.tail4e5f6a.ts.net/': 'invalid',
    'https://100.101.102.103/': 'host',
    'javascript:alert(1)': 'invalid',
    'ftp://alienware.tail4e5f6a.ts.net/': 'invalid',
    'https://alien ware.tail4e5f6a.ts.net/': 'invalid',
    'https://-alienware.tail4e5f6a.ts.net/': 'host',
    'https://alien_ware.tail4e5f6a.ts.net/': 'host',
  };
  for (const [input, error] of Object.entries(bad)) {
    const r = normalizeHomeBaseUrl(input);
    assert.equal(r.ok, false, input);
    assert.equal(r.error, error, `${input}: ${r.error}`);
    assert.ok(typeof r.message === 'string' && r.message.length > 10, input);
  }
  assert.match(normalizeHomeBaseUrl('http://alienware.tail4e5f6a.ts.net/').message, /https:\/\//);
  assert.match(normalizeHomeBaseUrl('https://example.com').message, /\.ts\.net/);
  assert.equal(normalizeHomeBaseUrl(null).ok, false);
  assert.equal(normalizeHomeBaseUrl(42).ok, false);
});

test('home base address: what is stored, the API paths and the machine name', () => {
  assert.equal(isHomeBaseUrl(BASE), true);
  assert.equal(isHomeBaseUrl('https://alienware.tail4e5f6a.ts.net'), false, 'stored only normalized');
  assert.equal(isHomeBaseUrl(''), false);
  assert.equal(homeBaseApi(BASE, 'status'), 'https://alienware.tail4e5f6a.ts.net/api/status');
  assert.equal(homeBaseApi(BASE, '/ask'), 'https://alienware.tail4e5f6a.ts.net/api/ask');
  assert.equal(homeBaseName(BASE), 'alienware');
  assert.equal(homeBaseName(''), '');
});

test('settings: homeBaseUrl is stored normalized; anything else keeps the current value; "" unlinks', () => {
  assert.equal(DEFAULT_SETTINGS.homeBaseUrl, '');
  const base = normalizeSettings({}, DEFAULT_SETTINGS);
  assert.equal(normalizeSettings({ homeBaseUrl: 'alienware.tail4e5f6a.ts.net/api/status' }, base).homeBaseUrl, BASE);
  const linked = normalizeSettings({ homeBaseUrl: BASE }, base);
  assert.equal(linked.homeBaseUrl, BASE);
  for (const bad of ['http://alienware.tail4e5f6a.ts.net/', 'https://evil.example/', 42, null, { url: BASE }, 'https://alienware.tail4e5f6a.ts.net:8080/']) {
    assert.equal(normalizeSettings({ ...linked, homeBaseUrl: bad }, linked).homeBaseUrl, BASE, String(bad));
  }
  assert.equal(normalizeSettings({ ...linked, homeBaseUrl: '' }, linked).homeBaseUrl, '');
  assert.equal(normalizeSettings({ ...linked, homeBaseUrl: '   ' }, linked).homeBaseUrl, '');
  // Backups carry it (every setting except the excluded ones) and an import restores a valid one.
  assert.ok(RESTORED_SETTINGS.includes('homeBaseUrl'));
});

// ---- what the tile shows -------------------------------------------------------------------------

test('tile: the Core’s real answers map to the level word, its summary and four readings (ok, warn, alert, no GPU driver, internet down)', () => {
  const v = Object.fromEntries(Object.entries(STATUS).map(([k, s]) => [k, homeBaseView(s)]));
  assert.deepEqual(
    { level: v.ok.level, word: v.ok.word, summary: v.ok.summary, host: v.ok.host, version: v.ok.version, cpu: v.ok.cpu, gpu: v.ok.gpu, ram: v.ok.ram, disk: v.ok.disk },
    { level: 'ok', word: 'OK', summary: 'All systems normal', host: 'alienware', version: '1.0.0', cpu: '5%', gpu: '40 °C', ram: '33%', disk: '492 GB' },
  );
  assert.equal(v.warn.level, 'warn');
  assert.equal(v.warn.word, 'WARNING');
  assert.equal(v.warn.disk, '108 GB');
  assert.equal(v.warn.summary.replace(/ /g, ' '), STATUS.warn.health.summary);
  assert.deepEqual([v.alert.level, v.alert.word, v.alert.cpu, v.alert.gpu, v.alert.ram, v.alert.disk], ['alert', 'ALERT', '85%', '85 °C', '96%', '35 GB']);
  assert.ok(v.alert.summary.includes(`91${NBSP}°C`), 'a temperature never breaks from its unit');
  assert.deepEqual([v.nogpu.level, v.nogpu.gpu], ['warn', 'driver not loaded'], 'no driver: words, not the nouveau number');
  assert.deepEqual([v.offline.level, v.offline.summary], ['alert', '1 alert: Internet down']);
});

test('tile: never invents a number (missing, null, first-sample and GPU states)', () => {
  const s = structuredClone(STATUS.ok);
  s.cpu.usagePct = null; // the first sample after the Core starts
  delete s.memory.usedPct;
  s.disks.mounts = [];
  s.gpu = { status: 'pending', available: false, message: 'Checking the graphics card', tempC: null };
  const v = homeBaseView(s);
  assert.deepEqual([v.cpu, v.ram, v.disk, v.gpu], [null, null, null, 'checking']);
  assert.equal(gpuReading({ status: 'ok', available: true, tempC: null }), null);
  assert.equal(gpuReading({ status: 'driver-not-loaded', available: false, tempC: 37 }), 'driver not loaded');
  assert.equal(gpuReading({ status: 'no-device', available: false }), 'no NVIDIA card');
  assert.equal(gpuReading({ status: 'error', available: false }), 'not answering');
  assert.equal(gpuReading(null), null);
  // An unknown level is shown as such, not as OK.
  const odd = structuredClone(STATUS.ok);
  odd.health.level = 'purple';
  assert.deepEqual([homeBaseView(odd).level, homeBaseView(odd).word], ['unknown', 'UNKNOWN']);
  // Not a Jarvis Core's status at all.
  for (const notCore of [null, {}, { v: 2, health: {} }, { v: 1 }, [], 'ok']) assert.equal(homeBaseView(notCore), null, JSON.stringify(notCore));
  // Only "/" counts as the main drive when there is one; otherwise the first mount.
  const disks = structuredClone(STATUS.ok);
  disks.disks.mounts.reverse();
  assert.equal(homeBaseView(disks).disk, '492 GB');
  // Percentages are clamped and rounded; disk sizes are decimal (as drives are sold).
  const big = structuredClone(STATUS.ok);
  big.cpu.usagePct = 140.2;
  assert.equal(homeBaseView(big).cpu, '100%');
  assert.deepEqual([formatBytes(1.2e12), formatBytes(4.56e9), formatBytes(503320576), formatBytes(999), formatBytes(-1), formatBytes(null)], ['1.2 TB', '4.6 GB', '503 MB', '999 B', null, null]);
  // Text from the Core is one plain line.
  const weird = structuredClone(STATUS.ok);
  weird.health.summary = 'All\u0000 systems\n\nnormal\u202e';
  assert.equal(homeBaseView(weird).summary, 'All systems normal');
});

test('tile: failures map to clear states and words', () => {
  assert.deepEqual(failureState({ kind: 'unreachable' }), { phase: 'unreachable', message: 'Can’t reach the home base. Is Tailscale on on this device?' });
  assert.equal(UNREACHABLE_MESSAGE, 'Can’t reach the home base. Is Tailscale on on this device?');
  const refused = failureState({ kind: 'refused', status: 403, message: 'origin https://evil.example is not allowed' });
  assert.equal(refused.phase, 'refused');
  assert.match(refused.message, /refused the connection/);
  assert.match(refused.message, /origin https:\/\/evil\.example is not allowed/);
  assert.equal(failureState({ kind: 'refused' }).phase, 'refused');
  assert.equal(failureState({ kind: 'starting' }).phase, 'starting');
  assert.match(failureState({ kind: 'notcore' }).message, /isn’t a Jarvis Core/);
  assert.match(failureState({ kind: 'http', status: 500, message: 'something went wrong inside the Core' }).message, /error \(500\): something went wrong/);
  assert.match(failureState({ kind: 'rate', message: 'too many questions at once; try again in a moment' }).message, /slow down/);
  assert.equal(failureState(undefined).phase, 'error');
});

test('glance and tape: the Systems glance row and the CORE reading follow the tile', () => {
  const online = { phase: 'online', view: homeBaseView(STATUS.alert), message: '' };
  assert.deepEqual(
    { text: homeBaseGlance(online).text, tone: homeBaseGlance(online).tone, tape: homeBaseGlance(online).tape },
    { text: 'ALERT · online', tone: 'warn', tape: 'ALERT' },
  );
  assert.equal(homeBaseGlance({ phase: 'online', view: homeBaseView(STATUS.ok) }).tone, 'ok');
  assert.deepEqual([homeBaseGlance({ phase: 'unset' }).text, homeBaseGlance({ phase: 'unset' }).tape], ['Not set up', '—']);
  assert.deepEqual([homeBaseGlance({ phase: 'unreachable', message: 'x' }).text, homeBaseGlance({ phase: 'unreachable', message: 'x' }).tape], ['Offline', 'OFFLINE']);
  assert.equal(homeBaseGlance({ phase: 'refused', message: 'x' }).tape, 'REFUSED');
  assert.equal(homeBaseGlance(null).text, 'Not set up');
});

// ---- "how's the home base" ------------------------------------------------------------------------

test('local command: "how’s the home base" / "home base status" (the whole sentence) are answered by the Core', () => {
  const yes = [
    'How’s the home base?',
    "how's the home base",
    'hows the homebase',
    'How is the home base doing?',
    'how is my home base',
    'Home base status',
    'home base status report',
    'Home base report.',
    'Jarvis, how’s the home base?',
    'Hey Jarvis, home base status please',
    "What's the home base status?",
    'what is the status of the home base',
    'Status of my home base',
    'give me the status of the home base',
    'check on the home base',
    'Is the home base OK?',
    'is the home base online',
    'Jarvis Core status',
    'how’s jarvis core',
    'home-base status',
  ];
  for (const s of yes) assert.equal(matchHomeBaseCommand(s), true, s);
  const no = [
    '',
    'home base',
    'how are you',
    'status report',
    'what is a home base in baseball',
    'write a poem about my home base',
    'how do I set up the home base',
    'how is the base',
    'how is the core of the earth',
    'move my home base to the garage',
    'home base status and then search the web for GPU prices',
    null,
    42,
    'x'.repeat(200),
  ];
  for (const s of no) assert.equal(matchHomeBaseCommand(s), false, String(s));
});

test('local exchange: the Core’s answer is a free local turn; what Claude sees (apiMessages) is untouched', () => {
  const conv = { id: 'c1', title: '', turns: [], apiMessages: [{ role: 'user', content: 'hi' }], updatedAt: 0 };
  const { userTurn, turn, textSegment } = appendHomeBaseTurn(conv, { text: '  How’s the home base?  ', line: 'Asking the home base…', now: 1000 });
  assert.equal(userTurn.text, 'How’s the home base?');
  assert.deepEqual([turn.local, turn.status, turn.costUsd, turn.leadModel], ['homebase', 'done', 0, 'local']);
  assert.equal(textSegment.text, 'Asking the home base…');
  assert.equal(conv.turns.length, 2);
  assert.equal(conv.apiMessages.length, 1, 'apiMessages untouched');
  assert.equal(conv.title, 'How’s the home base?');
  assert.throws(() => appendHomeBaseTurn(conv, { text: '   ' }), TypeError);
  assert.throws(() => appendHomeBaseTurn({}, { text: 'x' }), TypeError);
});

// ---- polling lifecycle ------------------------------------------------------------------------------

function fakeClock() {
  let t = 0;
  let seq = 0;
  const timers = new Map();
  return {
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.set(id, { at: t + ms, fn });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    pending: () => timers.size,
    /** Advance time, running due timers in order (and the promises they start). */
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        for (let i = 0; i < 10; i++) await Promise.resolve();
        let next = null;
        for (const [id, tm] of timers) if (tm.at <= end && (!next || tm.at < next[1].at)) next = [id, tm];
        if (!next) break;
        timers.delete(next[0]);
        t = Math.max(t, next[1].at);
        next[1].fn();
        for (let i = 0; i < 5; i++) await Promise.resolve();
      }
      t = end;
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
  };
}

test('polling: every 30 s only while active; at once when it becomes active after 30 s; never two at once', async () => {
  const clock = fakeClock();
  let runs = 0;
  const p = createPoller({ run: async () => runs++, intervalMs: POLL_MS, ...clock });
  await clock.advance(120000);
  assert.equal(runs, 0, 'inactive: nothing runs');
  assert.equal(clock.pending(), 0, 'no timer while inactive');
  p.setActive(true);
  await clock.advance(0);
  assert.equal(runs, 1, 'becoming active polls at once');
  await clock.advance(29999);
  assert.equal(runs, 1);
  await clock.advance(1);
  assert.equal(runs, 2, 'then every 30 s');
  p.setActive(false);
  assert.equal(clock.pending(), 0, 'hidden: the timer is cancelled');
  await clock.advance(10000);
  p.setActive(true); // visible again 10 s after the last poll: the next one is due in 20 s
  await clock.advance(19999);
  assert.equal(runs, 2);
  await clock.advance(1);
  assert.equal(runs, 3);
  p.setActive(false);
  await clock.advance(90000);
  assert.equal(runs, 3, 'nothing while hidden');
  p.setActive(true); // long gone: at once
  await clock.advance(0);
  assert.equal(runs, 4);
  p.destroy();
  await clock.advance(120000);
  assert.equal(runs, 4, 'destroyed: never again');
  assert.equal(clock.pending(), 0);
});

test('polling: a slow answer is never overlapped; poke() polls now (or once more right after the one in flight)', async () => {
  const clock = fakeClock();
  let runs = 0;
  let release = null;
  const p = createPoller({
    run: () => {
      runs++;
      return new Promise((r) => {
        release = r;
      });
    },
    ...clock,
  });
  p.setActive(true);
  await clock.advance(0);
  assert.equal(runs, 1);
  assert.equal(p.state().inFlight, true);
  await clock.advance(60000);
  assert.equal(runs, 1, 'still waiting for the first answer: no second request');
  p.poke();
  release();
  await clock.advance(0);
  assert.equal(runs, 2, 'poked during the request: once more right after');
  release();
  await clock.advance(0);
  assert.equal(p.state().scheduled, true);
  p.poke();
  await clock.advance(0);
  assert.equal(runs, 3, 'poke polls now');
  release();
  // A poll in flight when the page hides finishes but schedules nothing.
  p.poke();
  await clock.advance(0);
  assert.equal(runs, 4);
  p.setActive(false);
  release();
  await clock.advance(0);
  assert.equal(p.state().scheduled, false);
  await clock.advance(120000);
  assert.equal(runs, 4);
  // A run that throws is survived.
  const q = createPoller({ run: async () => { throw new Error('boom'); }, ...clock });
  q.setActive(true);
  await clock.advance(0);
  assert.equal(q.state().scheduled, true);
  q.destroy();
});

// ---- the HTTP client (fake fetch) ---------------------------------------------------------------------

function jsonResponse(status, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { status, ok: status >= 200 && status < 300, text: async () => text };
}

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    const route = routes(url, init, calls);
    if (route instanceof Error) throw route;
    if (route && typeof route.then === 'function') return route;
    return route;
  };
  fn.calls = calls;
  return fn;
}

test('client: GET api/status with credentials omitted, no referrer, no cache; the JSON comes back', async () => {
  const f = fakeFetch((url) => (url.endsWith('/api/status') ? jsonResponse(200, STATUS.ok) : jsonResponse(404, {})));
  const r = await getHomeBaseStatus(BASE, { fetchImpl: f });
  assert.equal(r.ok, true);
  assert.equal(r.data.health.summary, 'All systems normal');
  const { url, init } = f.calls[0];
  assert.equal(url, 'https://alienware.tail4e5f6a.ts.net/api/status');
  assert.deepEqual([init.method, init.credentials, init.cache, init.referrerPolicy, init.mode], ['GET', 'omit', 'no-store', 'no-referrer', 'cors']);
  assert.equal(init.headers, undefined, 'a simple GET: no preflight needed');
});

test('client: unreachable vs refused (a no-cors ping tells a CORS refusal from no answer), 403, 503, 429, other errors', async () => {
  // The browser can't read the answer (TypeError) but something answers the no-cors ping: refused.
  let f = fakeFetch((url, init) => (init.mode === 'no-cors' ? { type: 'opaque', status: 0 } : new TypeError('Failed to fetch')));
  let r = await requestHomeBase(BASE, 'status', { fetchImpl: f });
  assert.equal(r.kind, 'refused');
  assert.equal(f.calls[1].url, 'https://alienware.tail4e5f6a.ts.net/api/ping');
  assert.equal(f.calls[1].init.credentials, 'omit');
  // Nothing answers at all: unreachable (Tailscale off on this device).
  f = fakeFetch(() => new TypeError('Load failed'));
  r = await requestHomeBase(BASE, 'status', { fetchImpl: f });
  assert.equal(r.kind, 'unreachable');
  assert.equal(failureState(r).message, UNREACHABLE_MESSAGE);
  // A readable 403 (forbidden / origin_not_allowed).
  f = fakeFetch(() => jsonResponse(403, { error: 'forbidden', message: 'requests from other devices must come through Tailscale serve' }));
  r = await requestHomeBase(BASE, 'status', { fetchImpl: f });
  assert.deepEqual([r.kind, r.status, r.code], ['refused', 403, 'forbidden']);
  assert.match(r.message, /Tailscale serve/);
  f = fakeFetch(() => jsonResponse(503, { error: 'starting', message: 'the Core is starting, try again in a second' }));
  assert.equal((await requestHomeBase(BASE, 'status', { fetchImpl: f })).kind, 'starting');
  f = fakeFetch(() => jsonResponse(429, { error: 'rate_limited', message: 'too many requests, slow down' }));
  assert.equal((await requestHomeBase(BASE, 'status', { fetchImpl: f })).kind, 'rate');
  f = fakeFetch(() => jsonResponse(500, { error: 'internal', message: 'something went wrong inside the Core' }));
  r = await requestHomeBase(BASE, 'status', { fetchImpl: f });
  assert.deepEqual([r.kind, r.status], ['http', 500]);
  f = fakeFetch(() => jsonResponse(200, '<html>a captive portal</html>'));
  assert.equal((await requestHomeBase(BASE, 'status', { fetchImpl: f })).kind, 'notcore');
});

test('client: no answer in time is unreachable; an outside abort is "aborted"', async () => {
  const hang = fakeFetch(
    (url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
  );
  const r = await requestHomeBase(BASE, 'status', { fetchImpl: hang, timeoutMs: 30 });
  assert.equal(r.kind, 'unreachable');
  assert.equal(hang.calls.length, 1, 'a timeout needs no ping: nothing answered');
  const ctl = new AbortController();
  const p = requestHomeBase(BASE, 'status', { fetchImpl: hang, timeoutMs: 5000, signal: ctl.signal });
  ctl.abort();
  assert.equal((await p).kind, 'aborted');
});

test('client: ask posts {q} as JSON (trimmed, at most 300 characters) and returns the Core’s answer; free', async () => {
  const f = fakeFetch((url, init) => (url.endsWith('/api/ask') && init.method === 'POST' ? jsonResponse(200, ASK.ok['How are you?']) : jsonResponse(404, {})));
  const r = await askHomeBase(BASE, '   How are you?   ', { fetchImpl: f });
  assert.deepEqual(r, { ok: true, answer: ASK.ok['How are you?'].answer, intent: 'how-are-you', suggestions: ['Status report', 'GPU temp?', 'Anything wrong?'] });
  const { init } = f.calls[0];
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(init.body), { q: 'How are you?' });
  assert.equal(init.credentials, 'omit');
  await askHomeBase(BASE, 'x'.repeat(400), { fetchImpl: f });
  assert.equal(JSON.parse(f.calls[1].init.body).q.length, 300);
  assert.deepEqual(await askHomeBase(BASE, '   ', { fetchImpl: f }), { ok: false, kind: 'empty' });
  assert.equal(f.calls.length, 2, 'an empty question is not sent');
  const bad = fakeFetch(() => jsonResponse(200, { answer: '' }));
  assert.equal((await askHomeBase(BASE, 'hi', { fetchImpl: bad })).kind, 'notcore');
  const rate = fakeFetch(() => jsonResponse(429, { error: 'rate_limited', message: 'too many questions at once; try again in a moment' }));
  assert.equal((await askHomeBase(BASE, 'hi', { fetchImpl: rate })).kind, 'rate');
});

test('client: Test reads api/info (host, version) and api/status (health)', async () => {
  const f = fakeFetch((url) => (url.endsWith('/api/info') ? jsonResponse(200, INFO) : url.endsWith('/api/status') ? jsonResponse(200, STATUS.warn) : jsonResponse(404, {})));
  const r = await testHomeBase(BASE, { fetchImpl: f });
  assert.deepEqual({ ok: r.ok, host: r.host, version: r.version, level: r.level }, { ok: true, host: 'alienware', version: '1.0.0', level: 'warn' });
  assert.equal(r.summary, STATUS.warn.health.summary);
  assert.deepEqual(f.calls.map((c) => c.url.replace(BASE, '')), ['api/info', 'api/status']);
  const other = fakeFetch(() => jsonResponse(200, { name: 'something-else', version: '9' }));
  assert.equal((await testHomeBase(BASE, { fetchImpl: other })).kind, 'notcore');
  const down = fakeFetch(() => new TypeError('Failed to fetch'));
  assert.equal((await testHomeBase(BASE, { fetchImpl: down })).kind, 'unreachable');
});

// ---- the controller ------------------------------------------------------------------------------------

function fakeSettings(url = '') {
  let s = { homeBaseUrl: url };
  const fns = new Set();
  return {
    getSettings: () => s,
    onSettingsChange: (fn) => {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    set(next) {
      s = { ...s, homeBaseUrl: next };
      for (const fn of fns) fn(s);
    },
  };
}
const shownEl = { isConnected: true, getClientRects: () => [1] };
/** Let the poller's timer (0 ms) and the promises it starts run. */
const tick = async () => {
  await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

test('controller: not set up asks nothing; once linked and on screen it polls and maps the answer; failures become states', async () => {
  const settings = fakeSettings('');
  const calls = [];
  let answer = { ok: true, data: STATUS.ok };
  const client = {
    status: async (base) => {
      calls.push(base);
      return answer;
    },
    ask: async (base, q) => ({ ok: true, answer: `answer to ${q}`, suggestions: [] }),
  };
  const hb = createHomeBase({ ...settings, client });
  const seen = [];
  hb.subscribe((s) => seen.push(s.phase));
  hb.setViewShown('t1', shownEl, true);
  await tick();
  assert.equal(hb.getState().phase, 'unset');
  assert.equal(calls.length, 0, 'not set up: nothing is asked');
  assert.deepEqual(await hb.ask('How are you?'), { ok: false, kind: 'unset', message: 'Link your home base first: Settings → Home base.' });

  settings.set(BASE);
  await tick();
  assert.deepEqual(calls, [BASE], 'linked and on screen: polled at once');
  assert.equal(hb.getState().phase, 'online');
  assert.equal(hb.getState().view.summary, 'All systems normal');
  assert.ok(seen.includes('connecting'));

  answer = { ok: false, kind: 'unreachable' };
  hb.refresh();
  await tick();
  assert.deepEqual([hb.getState().phase, hb.getState().message, hb.getState().view], ['unreachable', UNREACHABLE_MESSAGE, null]);

  answer = { ok: false, kind: 'refused', status: 403 };
  hb.refresh();
  await tick();
  assert.equal(hb.getState().phase, 'refused');

  answer = { ok: true, data: { hello: 'world' } };
  hb.refresh();
  await tick();
  assert.equal(hb.getState().phase, 'error');

  answer = { ok: true, data: STATUS.nogpu };
  hb.refresh();
  await tick();
  assert.equal(hb.getState().view.gpu, 'driver not loaded');
  // Asked to slow down: the last reading stays.
  answer = { ok: false, kind: 'rate', status: 429 };
  hb.refresh();
  await tick();
  assert.equal(hb.getState().phase, 'online');
  assert.equal((await hb.ask('GPU temp?')).answer, 'answer to GPU temp?');
  hb.destroy();
});

test('controller: no tile on screen, no polling; unlinking stops it; a new address starts over', async () => {
  const settings = fakeSettings(BASE);
  const calls = [];
  const client = { status: async (base) => (calls.push(base), { ok: true, data: STATUS.ok }), ask: async () => ({ ok: true, answer: 'x' }) };
  const hb = createHomeBase({ ...settings, client });
  await tick();
  assert.equal(calls.length, 0, 'no tile registered: nothing polls');
  hb.setViewShown('t1', shownEl, false);
  await tick();
  assert.equal(calls.length, 0, 'a tile off screen: nothing polls');
  hb.setViewShown('t1', { isConnected: false, getClientRects: () => [1] }, true);
  await tick();
  assert.equal(calls.length, 0, 'a detached tile does not count');
  hb.setViewShown('t1', { isConnected: true, getClientRects: () => [] }, true);
  await tick();
  assert.equal(calls.length, 0, 'a display: none tile does not count');
  hb.setViewShown('t1', shownEl, true);
  await tick();
  assert.equal(calls.length, 1);
  hb.setViewShown('t2', shownEl, true); // a second tile: still one poll
  await tick();
  assert.equal(calls.length, 1);
  settings.set('');
  await tick();
  assert.equal(hb.getState().phase, 'unset');
  settings.set('https://other-pc.tail4e5f6a.ts.net/');
  await tick();
  assert.deepEqual(calls, [BASE, 'https://other-pc.tail4e5f6a.ts.net/']);
  assert.equal(hb.name(), 'other-pc');
  hb.forgetView('t1');
  hb.forgetView('t2');
  hb.destroy();
});
