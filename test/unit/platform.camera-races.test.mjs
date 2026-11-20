// createCamera (src/platform/camera.js) against a slow camera, in real headless Chromium with its fake
// camera (two devices, no permission prompt). getUserMedia can take seconds (a USB webcam waking up),
// and the owner can hide the page or turn the camera off meanwhile:
//   - the page hidden while the camera is starting: it never goes live (paused 'hidden', no live
//     track), and it starts normally once shown and asked again;
//   - Camera off (stop) or closing (destroy) while it is starting: the camera that arrives is released
//     at once, with no error shown; a new start after that works;
//   - a switch to another camera still under way when the page is hidden or the camera turned off.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { bundle, loadPlaywright, startServer } from './platform.harness.test.mjs';

let browser;
let server;
const contexts = new Set();

before(async () => {
  const [{ chromium }, code] = await Promise.all([loadPlaywright(), bundle({ camera: 'src/platform/camera.js' })]);
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream=device-count=2', '--use-fake-ui-for-media-stream'] });
  server = await startServer({ code });
});
after(async () => {
  for (const c of contexts) await c.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close();
});

async function newPage() {
  const context = await browser.newContext();
  contexts.add(context);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (err) => problems.push(err.message));
  await page.addInitScript(() => {
    // A slow camera: getUserMedia answers window.__delay ms late; every track it opens is recorded.
    window.__tracks = [];
    window.__delay = 0;
    const md = navigator.mediaDevices;
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      const s = await gum(c);
      window.__tracks.push(...s.getTracks());
      if (window.__delay) await new Promise((r) => setTimeout(r, window.__delay));
      return s;
    };
  });
  await page.goto(server.url);
  await page.waitForFunction(() => window.__ready === true);
  await page.evaluate(() => {
    const video = document.createElement('video');
    document.body.append(video);
    window.__states = [];
    window.__cam = window.__mods.camera.createCamera({
      video,
      os: 'mac',
      onState: (s, info) => window.__states.push(info && info.reason ? `${s}:${info.reason}` : s),
    });
  });
  page.problems = problems;
  return page;
}

const setVisibility = (page, state) =>
  page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);

/** The camera's state, its live tracks (every track ever opened), the states it went through. */
const read = (page) =>
  page.evaluate(() => ({
    state: window.__cam.state,
    live: window.__cam.live,
    liveTracks: window.__tracks.filter((t) => t.readyState === 'live').length,
    opened: window.__tracks.length,
    states: window.__states.slice(),
  }));

/** Starts something on the camera without waiting for it: `window.__res` is its promise. */
const begin = (page, what, delay) =>
  page.evaluate(
    ({ what, delay }) => {
      window.__delay = delay;
      const cam = window.__cam;
      window.__res = what === 'start' ? cam.start() : cam.select(cam.cameras.find((c) => c.id && c.id !== cam.deviceId).id);
      return true;
    },
    { what, delay },
  );
const result = (page) => page.evaluate(() => window.__res);

test('the page hidden while the camera is starting: it never goes live (paused, hidden), and starts once shown and asked again', async () => {
  const page = await newPage();
  await begin(page, 'start', 800);
  await page.waitForTimeout(200);
  await setVisibility(page, 'hidden');
  const res = await result(page);
  assert.deepEqual(res, { ok: false, paused: true });
  let r = await read(page);
  assert.equal(r.opened, 1, 'the camera did arrive');
  assert.equal(r.liveTracks, 0, 'and was released at once');
  assert.equal(r.state, 'paused');
  assert.equal(r.live, false);
  assert.ok(!r.states.includes('live'), `never live while hidden (${r.states})`);
  assert.equal(r.states.at(-1), 'paused:hidden', 'paused for the page being hidden (Optics resumes it on a computer)');

  await setVisibility(page, 'visible');
  await begin(page, 'start', 0);
  assert.deepEqual(await result(page), { ok: true });
  r = await read(page);
  assert.equal(r.state, 'live');
  assert.equal(r.liveTracks, 1);
  assert.deepEqual(page.problems, []);
});

test('Camera off while the camera is starting: the late camera is released, no error; a new start works', async () => {
  const page = await newPage();
  await begin(page, 'start', 800);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__cam.stop('owner'));
  assert.deepEqual(await result(page), { ok: false, cancelled: true });
  let r = await read(page);
  assert.equal(r.opened, 1);
  assert.equal(r.liveTracks, 0, 'released on arrival');
  assert.equal(r.state, 'off');
  assert.ok(!r.states.includes('live') && !r.states.includes('error'), `neither live nor an error (${r.states})`);

  await begin(page, 'start', 0);
  assert.deepEqual(await result(page), { ok: true });
  r = await read(page);
  assert.equal(r.state, 'live');
  assert.equal(r.liveTracks, 1);
});

test('off and on again while the first start is still pending: only the second camera runs', async () => {
  const page = await newPage();
  await begin(page, 'start', 800);
  await page.waitForTimeout(100);
  await page.evaluate(() => window.__cam.stop('owner'));
  await page.evaluate(() => {
    window.__second = window.__cam.start();
  });
  const [first, second] = await page.evaluate(() => Promise.all([window.__res, window.__second]));
  assert.deepEqual(first, { ok: false, cancelled: true });
  assert.deepEqual(second, { ok: true }, 'the second start is not swallowed by the cancelled one');
  const r = await read(page);
  assert.equal(r.state, 'live');
  assert.equal(r.liveTracks, 1, `one camera running (${r.opened} opened)`);
});

test('closed (destroy) while the camera is starting: released on arrival', async () => {
  const page = await newPage();
  await begin(page, 'start', 800);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__cam.destroy());
  assert.deepEqual(await result(page), { ok: false, cancelled: true });
  const r = await read(page);
  assert.equal(r.opened, 1);
  assert.equal(r.liveTracks, 0);
  assert.ok(!r.states.includes('live'), `never live (${r.states})`);
});

test('a switch to another camera under way when the page is hidden, or when the camera is turned off: nothing left running', async () => {
  const page = await newPage();
  await begin(page, 'start', 0);
  assert.deepEqual(await result(page), { ok: true });
  assert.equal((await read(page)).liveTracks, 1);

  await begin(page, 'select', 800);
  await page.waitForTimeout(200);
  await setVisibility(page, 'hidden');
  assert.deepEqual(await result(page), { ok: false, paused: true });
  let r = await read(page);
  assert.equal(r.liveTracks, 0, `released (${r.opened} opened)`);
  assert.equal(r.state, 'paused');
  assert.equal(r.states.at(-1), 'paused:hidden');

  await setVisibility(page, 'visible');
  await begin(page, 'start', 0);
  assert.deepEqual(await result(page), { ok: true });
  await begin(page, 'select', 800);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__cam.stop('owner'));
  assert.deepEqual(await result(page), { ok: false, cancelled: true });
  r = await read(page);
  assert.equal(r.liveTracks, 0, 'released after Camera off during the switch');
  assert.equal(r.state, 'off');
  assert.ok(!r.states.slice(-2).includes('error'), `no error for a switch the owner cancelled (${r.states})`);
});
