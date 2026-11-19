// Optics (the camera), against a fake camera: Chromium plays the synthetic desk scene
// (test/e2e/optics-scene.mjs) through --use-fake-device-for-media-stream and
// --use-fake-ui-for-media-stream, so getUserMedia and getDisplayMedia work headless.
//
//   optics-look      iPhone 13: camera key → intro card → live → LOOK → frozen frame, streamed answer,
//                    5 pins on their objects (frame → view mapping checked), the real JPEG sent in
//                    the current conversation, a 320 px check, LIVE pill off (tracks released), the
//                    chat's Optics card and pins row, and the reopened frame with its labels
//   optics-hidden    the camera is released at once when the page is hidden; resume by tap (iOS)
//   optics-denied    a blocked camera: platform steps and the system-camera fallback
//   optics-desktop   desktop: viewport + deck + answer + Optics log; Flip between two cameras
//   optics-watch     Watch on a scene that changes: first frame, change-only frames spaced by the
//                    minimum interval, the countdown and cost, the alert line, auto-off
//   optics-screen    "look at my screen": one frame, capture stopped at once, sent as a screen frame
//   optics-camtool   a follow-up where Jarvis calls look_through_camera (image inside the tool result)
// Screenshots also go to $OPTICS_SHOTS (default test/artifacts/optics-shots/).

import { existsSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tid } from '../harness.mjs';
import { imageSizeOf } from '../../../src/lib/optics.js';
import { sceneLabels } from '../../mock/optics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FEED_DIR = path.join(ROOT, 'test', 'artifacts', 'optics-feed');
const SHOTS = process.env.OPTICS_SHOTS || path.join(ROOT, 'test', 'artifacts', 'optics-shots');

function ensureFeed() {
  if (existsSync(path.join(FEED_DIR, 'desk-watch-landscape.y4m'))) return;
  execFileSync(process.execPath, [path.join(ROOT, 'test', 'e2e', 'optics-scene.mjs')], { stdio: 'inherit' });
}

export const cameraArgs = (feed, { devices = 1, extra = [] } = {}) => () => {
  ensureFeed();
  return [
    devices > 1 ? `--use-fake-device-for-media-stream=device-count=${devices}` : '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${path.join(FEED_DIR, feed)}`,
    ...extra,
  ];
};

export async function shot(t, name, page = t.page) {
  const file = await t.screenshot(name, page);
  await mkdir(SHOTS, { recursive: true });
  await copyFile(file, path.join(SHOTS, `${name}.png`));
}

/** Records every capture track the page opens, so the tests can check they are released. */
export async function instrument(page, { deny = false, devOptics = null } = {}) {
  await page.context().addInitScript(({ deny, devOptics }) => {
    window.__opticsTracks = [];
    if (devOptics) {
      try {
        localStorage.setItem('jarvis.dev.optics', JSON.stringify(devOptics));
      } catch {
        /* storage blocked */
      }
    }
    const md = navigator.mediaDevices;
    if (!md) return;
    if (deny) {
      md.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
      return;
    }
    for (const name of ['getUserMedia', 'getDisplayMedia']) {
      const orig = md[name] && md[name].bind(md);
      if (!orig) continue;
      md[name] = async (...args) => {
        const s = await orig(...args);
        for (const track of s.getTracks()) window.__opticsTracks.push({ api: name, track, label: track.label });
        return s;
      };
    }
  }, { deny, devOptics });
}

export const liveTracks = (page, api = 'getUserMedia') => page.evaluate((api) => (window.__opticsTracks || []).filter((x) => x.api === api && x.track.readyState === 'live').length, api);

export async function openFromComposer(t) {
  await (await t.visible('composer-camera')).click();
  await t.visible('optics');
}

export async function waitLive(t, page = t.page) {
  await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-camera')) === 'live', { timeout: 15000, message: 'the camera to be live' });
  await page.waitForTimeout(400); // a few frames in the preview
}

export async function waitAnswer(t, page = t.page) {
  await t.waitFor(async () => (await page.locator(tid('optics-answer')).getAttribute('data-status')) === 'done', { timeout: 30000, message: 'the Look to be answered' });
}

/** The newest lead request whose last user message carries an image (a Look). */
export function lastLook(t) {
  const reqs = t.requests('lead').filter((r) => r.status === 200);
  for (const r of [...reqs].reverse()) {
    const m = r.body.messages.findLast((x) => x.role === 'user' && Array.isArray(x.content) && x.content.some((b) => b.type === 'image'));
    if (m) return { req: r, message: m };
  }
  return null;
}

/** Checks the pins: exact frame coordinates from the scene, mapped through the frozen view. */
export async function checkPins(t, frame, page = t.page) {
  const pins = await page.locator(tid('optics-pin')).evaluateAll((els) => els.map((e) => ({ text: e.textContent, x: +e.dataset.x, y: +e.dataset.y, fx: +e.dataset.frameX, fy: +e.dataset.frameY })));
  const expected = sceneLabels(frame);
  t.assert(pins.length === expected.length, `${expected.length} pins expected, got ${pins.length}`);
  const box = await page.locator('.optics-stage').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height };
  });
  const scale = Math.min(box.w / frame.width, box.h / frame.height);
  const ox = (box.w - frame.width * scale) / 2;
  const oy = (box.h - frame.height * scale) / 2;
  let worst = 0;
  for (const e of expected) {
    const p = pins.find((x) => x.text === e.text);
    t.assert(p, `a pin for "${e.text}"`);
    t.assert(p.fx === e.x && p.fy === e.y, `"${e.text}" keeps Claude's frame pixel (${e.x}, ${e.y}), got (${p.fx}, ${p.fy})`);
    const vx = ox + e.x * scale;
    const vy = oy + e.y * scale;
    const errFrame = Math.hypot(p.x - vx, p.y - vy) / scale; // in frame pixels
    worst = Math.max(worst, errFrame / frame.width);
  }
  t.assert(worst < 0.05, `every dot within 5% of the frame width of its object (worst ${(worst * 100).toFixed(2)}%)`);
  return { pins, worst };
}

export default [
  {
    name: 'optics-look',
    title: 'Optics on iPhone 13: intro → live → LOOK → answer with pins on their objects; chat card, review, camera released',
    device: 'iphone13',
    scale: 2,
    timeout: 120000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await t.goto('/');
      await t.step('open Optics from the camera key: the intro explains before the system asks', async () => {
        await openFromComposer(t);
        await t.visible('optics-allow');
        const text = await t.text(page.locator(tid('optics-card')));
        t.assert(/only while this screen is open/.test(text) && /only when you tap Look/.test(text), `intro text: ${text}`);
        t.assert((await liveTracks(page)) === 0, 'no camera before the owner agrees');
        await shot(t, 'iphone13-1-intro');
        await page.locator(tid('optics-allow')).click();
        await waitLive(t);
        t.assert(await page.locator(tid('optics-live-pill')).isVisible(), 'the LIVE pill shows while the camera is on');
        t.assert(/^REAR · 720×1280$/.test(await t.text(page.locator(tid('optics-sub')))), 'the native portrait frame (no browser crop)');
        await shot(t, 'iphone13-2-live');
      });
      await t.step('LOOK: frozen frame, streamed answer, pins', async () => {
        await page.locator(tid('optics-ask')).fill('What is on my desk?');
        await page.locator(tid('optics-look')).click();
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-frozen')) === 'true', { timeout: 5000, message: 'the frame to freeze' });
        await page.waitForTimeout(250);
        await shot(t, 'iphone13-3-analyzing');
        await waitAnswer(t);
        await page.waitForTimeout(500);
        const answer = await t.text(page.locator(tid('optics-answer-text')));
        t.assert(/coffee mug, an AA battery, a pothos/.test(answer) && /1\.5-volt alkaline/.test(answer), `answer: ${answer}`);
        t.assert(/^This look \d/.test(await t.text(page.locator(tid('optics-answer-cost')))), 'the real cost of this look');
        const { worst } = await checkPins(t, { width: 720, height: 1280 });
        t.note(`pins within ${(worst * 100).toFixed(2)}% of frame width`);
        await shot(t, 'iphone13-4-answer');
      });
      await t.step('the request: one real camera JPEG (720×1280, no EXIF) in the current conversation, with the Optics frame line', async () => {
        const look = lastLook(t);
        t.assert(look, 'a lead request with the frame');
        const [ctx, image, text] = look.message.content;
        t.assert(/Optics frame f1: the image in this message is a live frame from the owner's rear camera, 720×1280 pixels\./.test(ctx.text), 'the frame line in <turn_context>');
        t.assert(image.type === 'image' && image.source.media_type === 'image/jpeg', 'a JPEG image block');
        const size = imageSizeOf(image.source.data);
        t.assert(size && size.width === 720 && size.height === 1280, `the JPEG is the full frame (${JSON.stringify(size)})`);
        const bytes = Buffer.from(image.source.data.slice(0, 400), 'base64');
        t.assert(!bytes.includes(Buffer.from('Exif')), 'canvas frames carry no EXIF');
        t.assert(text.text === 'What is on my desk?', 'the question follows the frame');
        t.assert(look.req.body.tools.some((x) => x.name === 'pin_labels'), 'version 5 tools');
        t.assertAppendOnly();
      });
      await t.step('320 px wide: nothing scrolls sideways', async () => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.waitForTimeout(300);
        await t.checkNoHorizontalOverflow('Optics answer at 320 px');
        await shot(t, 'phone320-answer');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(300);
      });
      await t.step('LIVE pill: camera off at once, Optics closes, the chat keeps the Look', async () => {
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 3000, message: 'Optics to close' });
        t.assert((await liveTracks(page)) === 0, 'every camera track released');
        const card = await t.visible('optics-turn');
        t.assert(card, 'the Look is a turn in the chat');
        const caption = await t.text(page.locator('.optics-turn-caption'));
        t.assert(/^OPTICS · \d\d:\d\d · REAR$/.test(caption), `caption: ${caption}`);
        const pinsRow = await t.text(page.locator(tid('segment-pins')).first());
        t.assert(/Pinned on f1/.test(pinsRow) && /Coffee mug · AA battery · Pothos · Notebook · Screwdriver/.test(pinsRow), `pins row: ${pinsRow}`);
        await page.locator(tid('optics-turn')).scrollIntoViewIfNeeded();
        await page.evaluate(() => document.querySelector('[data-testid="optics-turn"]').scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(300);
        await shot(t, 'iphone13-5-chat');
      });
      await t.step('tap the pins row: the frozen frame reopens with its labels, without the camera', async () => {
        await page.locator(tid('pins-view')).first().click();
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-state')) === 'review', { timeout: 5000, message: 'Optics in review' });
        await page.waitForTimeout(300);
        await checkPins(t, { width: 720, height: 1280 });
        t.assert((await liveTracks(page)) === 0, 'reviewing a past Look does not turn the camera on');
        await shot(t, 'iphone13-6-review');
        await page.locator(tid('optics-close')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 3000, message: 'Optics to close' });
      });
    },
  },
  {
    name: 'optics-hidden',
    title: 'Optics: Watch on the phone; the camera (and Watch) released within 500 ms of the page being hidden; resume only by tap on iPhone',
    device: 'iphone13',
    scale: 2,
    timeout: 60000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page, { devOptics: { minIntervalMs: 4000, sessionMs: 60000 } });
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await openFromComposer(t);
      await waitLive(t);
      // Watch on the phone: the first frame sets the scene; hiding the page ends Watch too.
      await page.locator(tid('optics-ask')).fill('Tell me if anyone touches my coffee');
      await page.locator(tid('optics-watch-toggle')).click();
      await t.waitFor(() => t.requests('structured').length >= 1, { timeout: 8000, message: 'the first Watch frame' });
      await t.waitFor(async () => /Watching: A desk/.test(await t.text(page.locator(tid('optics-watch-note')))), { timeout: 8000, message: 'the scene summary' });
      await shot(t, 'iphone13-8-watch');
      const ms = await page.evaluate(() => {
        const t0 = performance.now();
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        const live = window.__opticsTracks.filter((x) => x.track.readyState === 'live').length;
        return { live, ms: performance.now() - t0 };
      });
      t.assert(ms.live === 0 && ms.ms < 500, `released in ${ms.ms.toFixed(1)} ms (live tracks: ${ms.live})`);
      t.note(`camera released ${ms.ms.toFixed(1)} ms after hiding`);
      t.assert(!(await page.locator(tid('optics-live-pill')).isVisible()), 'no LIVE pill once the camera is off');
      t.assert((await page.locator(tid('optics')).getAttribute('data-watching')) === 'false', 'Watch ends when the page is hidden');
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await t.visible('optics-resume', { message: 'iPhone: a tap resumes the camera (never by itself)' });
      t.assert((await liveTracks(page)) === 0, 'still off until the tap');
      await page.locator(tid('optics-resume')).click();
      await waitLive(t);
      t.assert((await liveTracks(page)) === 1, 'one camera track after resuming');
      // pagehide releases it too.
      await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
      t.assert((await liveTracks(page)) === 0, 'pagehide releases the camera');
    },
  },
  {
    name: 'optics-denied',
    title: 'Optics with the camera blocked: iPhone steps, Try again, and the system-camera fallback',
    device: 'iphone13',
    scale: 2,
    timeout: 60000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page, { deny: true });
      await page.context().addInitScript(() => localStorage.setItem('jarvis.optics.intro.v1', '1'));
      await t.goto('/');
      await openFromComposer(t);
      await t.visible('optics-retry');
      const text = await t.text(page.locator(tid('optics-card')));
      t.assert(/Allow the camera in Safari/.test(text) && /Website Settings › Camera › Allow/.test(text), `iPhone steps: ${text}`);
      t.assert(!(await page.locator(tid('optics-live-pill')).isVisible()), 'no LIVE pill');
      await shot(t, 'iphone13-7-denied');
      const chooser = page.waitForEvent('filechooser', { timeout: 5000 });
      await page.locator(tid('optics-fallback')).click();
      const fc = await chooser;
      t.assert((await fc.element().getAttribute('capture')) === 'environment', 'the system camera (capture=environment) opens instead');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 3000, message: 'Optics to close for the fallback' });
    },
  },
  {
    name: 'optics-desktop',
    title: 'Optics on desktop: viewport, deck, answer and Optics log; one camera (Flip off); keyboard',
    device: 'desktop',
    timeout: 90000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await t.visible('optics');
      await waitLive(t);
      // A computer's webcam has no front or back: the line names the camera (Chromium's fake one is
      // named after its video file) and its frame.
      const line = await t.text(page.locator(tid('optics-sub')));
      t.assert(/ · 1280×720$/.test(line) && !/^(REAR|FRONT) /.test(line), `the camera's name and its 1280×720 frame (${line})`);
      t.assert((await page.locator(tid('optics')).getAttribute('data-mirrored')) === 'true', 'a webcam faces the owner: its preview is mirrored');
      await shot(t, 'desktop-1-live');
      t.assert(await page.locator(tid('optics-flip')).isDisabled(), 'one camera: Flip is off');
      await t.step('Space = Look; the answer streams into the side panel and the Optics log', async () => {
        await page.locator(tid('optics-ask')).fill('What is on my desk?');
        await page.locator(tid('optics-ask')).blur();
        await page.keyboard.press('Space');
        await waitAnswer(t);
        await page.waitForTimeout(500);
        await checkPins(t, { width: 1280, height: 720 });
        t.assert((await t.count('optics-log-item')) === 1, 'one Optics log entry');
        await shot(t, 'desktop-2-answer');
      });
      await t.step('Esc closes; the chat shows the Look', async () => {
        await page.keyboard.press('Escape');
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 3000, message: 'Optics to close' });
        t.assert((await liveTracks(page)) === 0, 'camera released');
        await t.visible('optics-turn');
        await page.waitForTimeout(300);
        await shot(t, 'desktop-3-chat');
      });
    },
  },
  {
    name: 'optics-flip',
    title: 'Flip between two cameras (stops the first track before opening the next; back again)',
    device: 'desktop',
    timeout: 60000,
    browserArgs: () => ['--use-fake-device-for-media-stream=device-count=2', '--use-fake-ui-for-media-stream'],
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await waitLive(t);
      const first = await page.evaluate(() => window.__opticsTracks.at(-1).label);
      t.assert(await page.locator(tid('optics-flip')).isEnabled(), 'two cameras: Flip is on');
      await page.keyboard.press('f');
      await t.waitFor(async () => (await page.evaluate(() => window.__opticsTracks.at(-1).label)) !== first, { timeout: 8000, message: 'the other camera' });
      await waitLive(t);
      t.assert((await liveTracks(page)) === 1, 'one camera open at a time');
      await page.locator(tid('optics-flip')).click();
      await t.waitFor(async () => (await page.evaluate(() => window.__opticsTracks.at(-1).label)) === first, { timeout: 8000, message: 'back to the first camera' });
      await waitLive(t);
      t.assert((await liveTracks(page)) === 1, 'still one camera');
      t.note(`flipped ${first} → other → ${first}`);
    },
  },
  {
    name: 'optics-watch',
    title: 'Watch: frames only on change, never closer than the minimum interval, countdown and cost, alert line, auto-off',
    device: 'desktop',
    timeout: 90000,
    browserArgs: cameraArgs('desk-watch-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page, { devOptics: { minIntervalMs: 4000, sessionMs: 20000, settleMs: 400, sampleMs: 250 } });
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await waitLive(t);
      const started = Date.now();
      await page.locator(tid('optics-watch-toggle')).click();
      await t.visible('optics-watch');
      t.assert(/^WATCHING 0:(19|20)$/.test(await t.text(page.locator(tid('optics-watch-clock')))), 'the countdown starts at the session length');
      t.assert(/^WATCH 0:\d\d$/.test(await t.text(page.locator('.optics-pill-text'))), 'the LIVE pill shows WATCH and the time left');
      await t.waitFor(() => t.requests('structured').length >= 1, { timeout: 8000, message: 'the first Watch frame' });
      await t.waitFor(async () => /mug has moved/.test(await t.text(page.locator(tid('optics-watch-note')))), { timeout: 25000, message: 'the alert line after the scene changed' });
      await shot(t, 'desktop-4-watch');
      const cost = await t.text(page.locator(tid('optics-watch-cost')));
      t.assert(/^\d+ looks? · [\d.]+¢$/.test(cost), `looks and cost so far: ${cost}`);
      await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-watching')) === 'false', { timeout: 25000, message: 'Watch to turn itself off' });
      const watch = t.requests('structured');
      const times = watch.map((r) => Date.parse(r.time));
      for (let i = 1; i < times.length; i++) t.assert(times[i] - times[i - 1] >= 3800, `frames at least 4 s apart (gap ${times[i] - times[i - 1]} ms)`);
      t.assert(watch.length >= 2 && watch.length <= 6, `${watch.length} frames in a 20 s session of a scene that changes every 4 s`);
      for (const r of watch) {
        const img = r.body.messages[0].content.find((b) => b.type === 'image');
        const size = imageSizeOf(img.source.data);
        t.assert(size && Math.max(size.width, size.height) <= 640, `Watch frames are small (${JSON.stringify(size)})`);
        t.assert(!r.body.tools && r.body.output_config.effort === 'low', 'one-off structured request at effort low');
      }
      t.assert(t.requests('lead').length === 0, 'Watch never touches the conversation');
      t.assert(/Watch ended after 0:20/.test(await t.text(page.locator(tid('optics-watch-note')))), 'the end is announced');
      t.assert((await t.text(page.locator('.optics-pill-text'))) === 'OPTICS', 'the pill is back to OPTICS');
      t.note(`${watch.length} Watch frames in ${Math.round((Date.now() - started) / 1000)} s; ${cost}`);
    },
  },
  {
    name: 'optics-screen',
    title: 'Look at my screen (desktop): one frame, the capture stops at once, sent as a screen frame',
    device: 'desktop',
    timeout: 60000,
    browserArgs: cameraArgs('desk-landscape.y4m', { extra: ['--auto-select-desktop-capture-source=Entire screen', '--auto-accept-this-tab-capture'] }),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await waitLive(t);
      await page.locator(tid('optics-ask')).fill('What is on my screen?');
      await page.locator(tid('optics-screen')).click();
      await waitAnswer(t);
      t.assert((await liveTracks(page, 'getDisplayMedia')) === 0, 'the screen capture stopped right after the frame');
      t.assert((await page.evaluate(() => window.__opticsTracks.filter((x) => x.api === 'getDisplayMedia').length)) >= 1, 'getDisplayMedia was used');
      const look = lastLook(t);
      const [ctx, image] = look.message.content;
      t.assert(/live frame from the owner's screen \(a screenshot of their computer\)/.test(ctx.text), 'sent as a screen frame');
      const size = imageSizeOf(image.source.data);
      t.assert(size && Math.max(size.width, size.height) <= 1568, `screen frames are at most 1,568 px (${JSON.stringify(size)})`);
      t.assert(/^SCREEN · /.test(await t.text(page.locator(tid('optics-sub')))), 'the frozen frame is labeled SCREEN');
      await page.waitForTimeout(400);
      await shot(t, 'desktop-5-screen');
    },
  },
  {
    name: 'optics-camtool',
    title: 'look_through_camera: a follow-up where Jarvis takes a fresh frame (image in the tool result)',
    device: 'desktop',
    timeout: 90000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await waitLive(t);
      await page.locator(tid('optics-look')).click();
      await waitAnswer(t);
      await page.locator(tid('optics-ask')).fill('Can you see it now? [[optics:look]]');
      await page.locator(tid('optics-ask')).press('Enter');
      await t.waitFor(async () => /Here's what I see now/.test(await t.text(page.locator(tid('optics-answer-text')))), { timeout: 30000, message: 'the follow-up answer' });
      await t.waitFor(async () => !(await page.locator(tid('optics-ask-more')).isDisabled()), { timeout: 20000, message: 'the follow-up to finish' });
      const reqs = t.requests('lead').filter((r) => r.status === 200);
      const withImageResult = reqs.find((r) => r.body.messages.at(-1).content.some?.((b) => b.type === 'tool_result' && Array.isArray(b.content) && b.content.some((c) => c.type === 'image')));
      t.assert(withImageResult, 'a tool_result carrying the fresh frame');
      const askCtx = reqs.find((r) => /Can you see it now/.test(JSON.stringify(r.body.messages.at(-1))));
      t.assert(askCtx && /Optics: the camera is live/.test(askCtx.body.messages.at(-1).content[0].text), 'the turn context said the camera is live');
      t.assert(await page.locator(tid('optics-pin')).count() === 5, 'the f1 pins stay; the f2 pins belong to the new frame');
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 3000, message: 'Optics to close' });
      await t.visible('segment-frame', { message: 'the chat shows the frame Jarvis took' });
      t.assertAppendOnly();
    },
  },
];
