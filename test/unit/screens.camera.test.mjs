// Screens × Optics (v7 merge): the live camera on a screen (src/ui/optics/screen-camera.js inside the
// HUD frame of src/ui/screens/frame.js), in real headless Chromium with its fake camera (two
// devices, no permission prompt). Checks: live with LIVE in the privacy color and the camera's name,
// a webcam previewed mirrored, Camera off and on, the camera chosen last in Optics, the camera
// released when the panel's own window is hidden (and back when it is shown) while the app's window
// does not matter to a panel in another window, a blocked camera explained, and the camera released
// when the screen closes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, bundle, loadPlaywright, startServer } from './platform.harness.test.mjs';

// The app's stylesheets that draw a screen (the LIVE status color is checked as drawn).
const CSS = ['tokens', 'base', 'hud', 'presence', 'screens', 'themes'].map((f) => fs.readFileSync(path.join(ROOT, 'src/styles', `${f}.css`), 'utf8')).join('\n');

let browser;
let server;
const contexts = new Set();

before(async () => {
  const [{ chromium }, code] = await Promise.all([
    loadPlaywright(),
    bundle({ frame: 'src/ui/screens/frame.js', cam: 'src/ui/optics/screen-camera.js', settings: 'src/platform/settings.js' }),
  ]);
  browser = await chromium.launch({ args: ['--use-fake-device-for-media-stream=device-count=2', '--use-fake-ui-for-media-stream'] });
  server = await startServer({ code });
});
after(async () => {
  for (const c of contexts) await c.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (server) await server.close();
});

async function newPage({ init } = {}) {
  const context = await browser.newContext();
  contexts.add(context);
  const page = await context.newPage();
  const problems = [];
  page.on('pageerror', (err) => problems.push(`pageerror: ${err.message}`));
  if (init) await page.addInitScript(init);
  await page.goto(server.url);
  await page.waitForFunction(() => window.__ready === true);
  await page.addStyleTag({ content: CSS });
  page.problems = problems;
  return page;
}

/** Mounts a camera screen (frame + panel) in `where` ('main' or a same-origin popup) as window.__scr. */
function mount(page, where = 'main') {
  return page.evaluate((where) => {
    const { frame: F, cam: C } = window.__mods;
    const win = where === 'popup' ? window.open('', 'camera-screen', 'popup,width=640,height=480') : window;
    if (!win) throw new Error('no popup');
    const frame = F.createScreenFrame({ win, label: 'SCREEN 2', kind: 'camera', title: 'Optics', where: 'other' });
    win.document.body.append(frame.el);
    const panel = C.createCameraScreenPanel({ win, frame });
    frame.body.append(panel.el);
    window.__scr = { win, frame, panel };
    return true;
  }, where);
}

/** What the screen shows: state, status word and tone, detail, the preview's live track. */
function read(page) {
  return page.evaluate(() => {
    const { win } = window.__scr;
    const doc = win.document;
    const el = doc.querySelector('[data-testid="screen-camera"]');
    const video = el && el.querySelector('video');
    const stream = video && video.srcObject;
    const track = stream ? stream.getVideoTracks()[0] : null;
    const status = doc.querySelector('[data-testid="screen-status"]') || doc.querySelector('.scr__status');
    return {
      state: el ? el.dataset.state : null,
      mirrored: el ? el.dataset.mirrored : null,
      status: status && !status.hidden ? status.textContent.trim() : '',
      tone: status ? status.dataset.tone : null,
      frameLive: doc.querySelector('.scr') ? doc.querySelector('.scr').dataset.live : null,
      kind: (doc.querySelector('.scr__kind') || {}).textContent || '',
      detail: (() => {
        const d = doc.querySelector('[data-testid="screen-detail"]');
        return d && !d.hidden ? d.textContent : '';
      })(),
      track: track ? { state: track.readyState, deviceId: track.getSettings().deviceId } : null,
      card: (() => {
        const c = el && el.querySelector('.scr-camera__card');
        return c && !c.hidden ? c.textContent : '';
      })(),
      toggle: (doc.querySelector('[data-testid="screen-camera-toggle"]') || {}).getAttribute ? doc.querySelector('[data-testid="screen-camera-toggle"]').getAttribute('aria-label') : null,
    };
  });
}

async function waitState(page, want, label) {
  await page.waitForFunction((want) => {
    const s = window.__scr;
    const el = s && s.win.document.querySelector('[data-testid="screen-camera"]');
    return !!el && el.dataset.state === want;
  }, want, { timeout: 10000 }).catch(async () => {
    assert.fail(`${label}: expected ${want}, got ${JSON.stringify(await read(page))}`);
  });
}

/** Pretends the page (or the popup) is hidden or shown, as when the window is minimized. */
function setVisibility(page, state, where = 'main') {
  return page.evaluate(({ state, where }) => {
    const doc = where === 'popup' ? window.__scr.win.document : document;
    Object.defineProperty(doc, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(doc, 'hidden', { configurable: true, get: () => state === 'hidden' });
    doc.dispatchEvent(new Event('visibilitychange'));
  }, { state, where });
}

test('a camera screen: live, LIVE in the privacy color with the camera name, a webcam mirrored; Camera off and on; closed = released', async () => {
  const page = await newPage();
  await mount(page);
  await waitState(page, 'live', 'starts by itself');
  let r = await read(page);
  assert.equal(r.status, 'LIVE');
  assert.equal(r.tone, 'rec', 'the privacy color (--live), like the LIVE pills');
  assert.equal(r.frameLive, 'true', 'the frame is live (its glyph breathes)');
  assert.equal(r.mirrored, 'true', 'a computer webcam faces the owner: mirrored preview');
  assert.equal(r.track && r.track.state, 'live');
  assert.equal(r.kind, 'OPTICS');
  assert.ok(r.detail.length > 0 && r.detail === r.detail.toUpperCase(), `the camera's name in the header, after OPTICS (${r.detail})`);
  assert.equal(r.card, '', 'no card over the live view');
  const color = await page.evaluate(() => getComputedStyle(document.querySelector('.scr__status')).color);
  assert.equal(color, 'rgb(255, 92, 114)', 'LIVE is drawn in --live');

  await page.click('[data-testid="screen-camera-toggle"]');
  await waitState(page, 'off', 'Camera off');
  r = await read(page);
  assert.equal(r.status, 'OFF');
  assert.equal(r.detail, '', 'no camera name while it is off');
  assert.equal(r.track, null, 'the preview has no stream');
  assert.match(r.card, /Camera off/);
  assert.equal(r.toggle, 'Turn the camera on');
  const ended = await page.evaluate(() => window.__scr.win.document.querySelector('video').srcObject === null);
  assert.ok(ended, 'released');

  await page.click('[data-testid="screen-camera-toggle"]');
  await waitState(page, 'live', 'Camera on');

  const track = await page.evaluateHandle(() => window.__scr.win.document.querySelector('video').srcObject.getVideoTracks()[0]);
  await page.evaluate(() => {
    window.__scr.panel.destroy();
    window.__scr.frame.destroy();
  });
  assert.equal(await track.evaluate((t) => t.readyState), 'ended', 'closing the screen releases the camera');
  assert.deepEqual(page.problems, []);
});

test('the camera chosen last in Optics on this device opens on the screen too', async () => {
  const page = await newPage();
  const second = await page.evaluate(async () => {
    const s = await navigator.mediaDevices.getUserMedia({ video: true });
    s.getTracks().forEach((t) => t.stop());
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const pick = cams[1];
    window.__mods.settings.saveSettings({ opticsCameraId: pick.deviceId, opticsCameraLabel: pick.label });
    return { id: pick.deviceId, count: cams.length };
  });
  assert.equal(second.count, 2, 'two fake cameras');
  await mount(page);
  await waitState(page, 'live', 'starts');
  const r = await read(page);
  assert.equal(r.track.deviceId, second.id, 'the remembered camera, by its id');
});

test('hidden, the camera is released; shown again on a computer, it comes back by itself', async () => {
  const page = await newPage();
  await mount(page);
  await waitState(page, 'live', 'starts');
  await setVisibility(page, 'hidden');
  await waitState(page, 'paused', 'hidden');
  let r = await read(page);
  assert.equal(r.track, null, 'released while hidden');
  assert.equal(r.status, 'PAUSED');
  assert.match(r.card, /Camera paused/);
  await setVisibility(page, 'visible');
  await waitState(page, 'live', 'shown again');
  r = await read(page);
  assert.equal(r.track.state, 'live');
});

test('a screen in another window (the floating panel) follows that window: the app tab hidden behind it changes nothing', async () => {
  const page = await newPage();
  await mount(page, 'popup');
  await waitState(page, 'live', 'starts in the other window');
  await setVisibility(page, 'hidden', 'main');
  await page.waitForTimeout(400);
  let r = await read(page);
  assert.equal(r.state, 'live', 'still live: the app tab is hidden, not the panel');
  assert.equal(r.track.state, 'live');
  await setVisibility(page, 'hidden', 'popup');
  await waitState(page, 'paused', 'its own window hidden');
  r = await read(page);
  assert.equal(r.track, null, 'released');
  await page.evaluate(() => window.__scr.win.close());
});

test('a blocked camera: NO CAMERA, the reason in words and Try again', async () => {
  const page = await newPage({
    init: () => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    },
  });
  await mount(page);
  await waitState(page, 'error', 'blocked');
  const r = await read(page);
  assert.equal(r.status, 'NO CAMERA');
  assert.equal(r.tone, 'warn');
  assert.match(r.card, /Camera access is blocked for Jarvis\./);
  assert.match(r.card, /Allow the camera for Jarvis in your browser/);
  assert.ok(await page.isVisible('[data-testid="screen-camera-start"]'), 'Try again');
  assert.match(await page.textContent('[data-testid="screen-camera-start"]'), /Try again/);
});
