// Voice bands (SPEC 2.4.13): the log-spaced band math in plain Node, then the real thing in
// headless Chromium with a fake microphone: live bands into the core, and the mic released within
// 500 ms of the page being hidden or closed (SPEC 2.4.20 rule 7, 2.4.21).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bandEdges, bandBins, dbToUnit, computeBands, smoothBands, BAND_COUNT } from '../../src/ui/hud/voice-bands.js';
import { bundle, startServer, loadPlaywright } from './platform.harness.test.mjs';

test('band edges are log-spaced from 100 Hz to 4 kHz', () => {
  const e = bandEdges();
  assert.equal(e.length, BAND_COUNT + 1);
  assert.equal(Math.round(e[0]), 100);
  assert.equal(Math.round(e[8]), 4000);
  const ratio = e[1] / e[0];
  for (let i = 1; i < 8; i++) assert.ok(Math.abs(e[i + 1] / e[i] - ratio) < 1e-3, 'constant ratio');
});

test('bins: every band gets at least one FFT bin, in order, inside the spectrum', () => {
  for (const rate of [44100, 48000]) {
    const { lo, hi, binHz } = bandBins(512, rate);
    assert.equal(binHz, rate / 512);
    for (let i = 0; i < 8; i++) {
      assert.ok(hi[i] > lo[i], `band ${i} has bins`);
      assert.ok(lo[i] >= 1 && hi[i] <= 256);
      if (i) assert.ok(lo[i] >= lo[i - 1], 'ordered');
    }
    assert.ok(hi[7] * binHz >= 4000, 'the top band reaches 4 kHz');
  }
});

test('levels: −90…−30 dB map to 0…1; silence (-Infinity) is 0, never NaN', () => {
  assert.equal(dbToUnit(-90), 0);
  assert.equal(dbToUnit(-60), 0.5);
  assert.equal(dbToUnit(-30), 1);
  assert.equal(dbToUnit(-10), 1);
  assert.equal(dbToUnit(-Infinity), 0);
  assert.equal(dbToUnit(NaN), 0);
  const bins = bandBins(512, 48000);
  const freq = new Float32Array(256).fill(-Infinity);
  const out = new Float32Array(8);
  computeBands(freq, bins, out);
  assert.deepEqual([...out], new Array(8).fill(0));
  for (let k = bins.lo[3]; k < bins.hi[3]; k++) freq[k] = -45;
  computeBands(freq, bins, out);
  assert.ok(Math.abs(out[3] - 0.75) < 1e-6, `band 3 = ${out[3]}`);
  assert.equal(out[0], 0);
});

test('smoothing: 50 ms rise, 250 ms fall', () => {
  const cur = new Float32Array(1);
  smoothBands(cur, new Float32Array([1]), 50);
  assert.ok(Math.abs(cur[0] - (1 - Math.exp(-1))) < 1e-6, 'one rise time constant: 63%');
  const down = new Float32Array([1]);
  smoothBands(down, new Float32Array([0]), 250);
  assert.ok(Math.abs(down[0] - Math.exp(-1)) < 1e-6, 'one fall time constant: 37% left');
});

// ---- in Chromium with a fake microphone --------------------------------------------------------------

let browser;
let server;
before(async () => {
  const { chromium } = await loadPlaywright();
  const code = await bundle({ bands: 'src/ui/hud/voice-bands.js', core: 'src/ui/hud/core.js' });
  server = await startServer({ code });
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await server.close();
});

async function page() {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const p = await context.newPage();
  const problems = [];
  p.on('pageerror', (e) => problems.push(e.message));
  await p.goto(server.url + '/');
  await p.waitForFunction(() => window.__ready === true);
  p.problems = problems;
  return p;
}

test('a fake mic drives live bands into the core; stop() releases the track and clears the bands', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createMicBands } = window.__mods.bands;
    const { createCore } = window.__mods.core;
    const c = document.createElement('canvas');
    c.style.width = '184px';
    document.body.append(c);
    const core = createCore(c, { mode: 'hero' });
    core.setState('listening');
    let streamSeen = null;
    const pushes = [];
    const states = [];
    const mic = createMicBands({
      getUserMedia: async (cons) => (streamSeen = await navigator.mediaDevices.getUserMedia(cons)),
      onBands: (b) => {
        pushes.push(b ? Math.max(...b) : null);
        core.setBands(b);
      },
      onState: (s) => states.push(s),
    });
    const ok = await mic.start();
    const t0 = performance.now();
    await new Promise((res) => setTimeout(res, 1000));
    const elapsed = performance.now() - t0;
    const live = streamSeen.getTracks().map((t) => t.readyState);
    const n = pushes.length;
    mic.stop();
    const after = streamSeen.getTracks().map((t) => t.readyState);
    return { ok, states, n, rate: n / (elapsed / 1000), maxLevel: Math.max(...pushes.filter((x) => x !== null)), last: pushes[pushes.length - 1], live, after, isLive: mic.isLive() };
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.states, ['live', 'off']);
  assert.ok(r.rate <= 31.5, `at most 30 pushes a second (${r.rate.toFixed(1)})`);
  assert.ok(r.n >= 15, `pushes: ${r.n}`);
  assert.ok(r.maxLevel > 0.05, `the fake mic's tone registers (${r.maxLevel.toFixed(2)})`);
  assert.equal(r.last, null, 'bands are cleared on stop');
  assert.deepEqual(r.live, ['live']);
  assert.deepEqual(r.after, ['ended']);
  assert.equal(r.isLive, false);
  assert.deepEqual(p.problems, []);
});

test('the mic is released within 500 ms of the page being hidden, and on pagehide', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createMicBands } = window.__mods.bands;
    const run = async (fire) => {
      let stream = null;
      const states = [];
      const mic = createMicBands({ getUserMedia: async (c) => (stream = await navigator.mediaDevices.getUserMedia(c)), onState: (s) => states.push([s, performance.now()]) });
      await mic.start();
      const t0 = performance.now();
      fire();
      // Poll the track state until it ends (or 500 ms pass).
      let ended = -1;
      while (performance.now() - t0 < 500) {
        if (stream.getTracks().every((t) => t.readyState === 'ended')) {
          ended = performance.now() - t0;
          break;
        }
        await new Promise((res) => setTimeout(res, 5));
      }
      return { ended, states: states.map((s) => s[0]) };
    };
    const hidden = await run(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Hidden pages never start the mic.
    const { createMicBands: mk } = window.__mods.bands;
    const blocked = await mk({}).start();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    const pagehide = await run(() => window.dispatchEvent(new Event('pagehide')));
    return { hidden, blocked, pagehide };
  });
  assert.ok(r.hidden.ended >= 0 && r.hidden.ended < 500, `released ${r.hidden.ended} ms after hidden`);
  assert.deepEqual(r.hidden.states, ['live', 'off']);
  assert.equal(r.blocked, false);
  assert.ok(r.pagehide.ended >= 0 && r.pagehide.ended < 500, `released ${r.pagehide.ended} ms after pagehide`);
});

test('a refused or missing mic reports an error and leaves nothing running', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createMicBands } = window.__mods.bands;
    const states = [];
    const mic = createMicBands({ getUserMedia: () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })), onState: (s, e) => states.push([s, e && e.name]) });
    const ok = await mic.start();
    return { ok, states, live: mic.isLive() };
  });
  assert.deepEqual(r, { ok: false, states: [['error', 'NotAllowedError']], live: false });
});
