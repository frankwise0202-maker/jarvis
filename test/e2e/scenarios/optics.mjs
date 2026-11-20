// Optics (the camera), against a fake camera: Chromium plays the synthetic desk scene
// (test/e2e/optics-scene.mjs) through --use-fake-device-for-media-stream and
// --use-fake-ui-for-media-stream, so getUserMedia and getDisplayMedia work headless.
//
//   optics-look      iPhone 13: camera key → intro card → live → LOOK → frozen frame, streamed answer,
//                    5 pins on their objects (frame → view mapping checked), the real JPEG sent in
//                    the current conversation, a 320 px check, LIVE pill off (tracks released), the
//                    chat's Optics card and pins row, and the reopened frame with its labels
//   optics-hidden    the camera is released at once when the page is hidden; resume by tap (iOS)
//   optics-hidden-start  a slow camera (2 s) and the page hidden while it starts: it never runs in
//                    the background; shown again on a computer, it comes back by itself
//   optics-landscape an iPhone held sideways: the frozen frame and a readable answer side by side
//   optics-old-chat  a Look in a chat from before the camera goes to a new chat, with labels
//   optics-viewfinder  phones: the live viewfinder shows the whole frame a Look sends, bracketed
//                    (portrait, a Safari tab, held sideways)
//   optics-denied    a blocked camera: platform steps and the system-camera fallback
//   optics-desktop   desktop: viewport + deck + answer + Optics log; Flip between two cameras
//   optics-watch     Watch on a scene that changes: first frame, change-only frames spaced by the
//                    minimum interval, the countdown and cost, the alert line, auto-off
//   optics-screen    "look at my screen": one frame, capture stopped at once, sent as a screen frame
//   optics-screen-cancel  the home's Screen key with the picker cancelled: the webcam never turns on;
//                    No screen shared (macOS hint), Try again, Use the camera via the first-use card
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
import { LEAD_SYSTEM_V3, leadToolsV4 } from '../../../src/engine/prompts.js';

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

/** Init script: getUserMedia resolves `sessionStorage.slowCam` ms late (a USB webcam waking up). */
export function slowCamera() {
  const md = navigator.mediaDevices;
  if (!md) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (...args) => {
    const s = await orig(...args);
    const ms = Number(sessionStorage.getItem('slowCam') || 0);
    if (ms) await new Promise((r) => setTimeout(r, ms));
    return s;
  };
}

/** Pretends the page is hidden (another tab or app, the window minimized) or shown again. */
export const setHidden = (page, hidden) =>
  page.evaluate((hidden) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hidden ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

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

/**
 * Where the newest follow-up sits in the answer sheet's scrolling body: whether its "› question"
 * line shows, and how many pixels of its answer are inside the body's visible rectangle (above the
 * 18 px fade at its foot).
 */
export function followUpView(page) {
  return page.evaluate(() => {
    const body = document.querySelector('[data-testid="optics-answer-text"]');
    if (!body) return null;
    const qs = body.querySelectorAll('.optics-answer-q--follow');
    const q = qs[qs.length - 1];
    if (!q) return null;
    const b = body.getBoundingClientRect();
    const seen = (top, bottom) => Math.max(0, Math.min(bottom, b.bottom - 18) - Math.max(top, b.top));
    let top = Infinity;
    let bottom = -Infinity;
    for (let n = q.nextElementSibling; n && !n.classList.contains('optics-answer-q--follow'); n = n.nextElementSibling) {
      const r = n.getBoundingClientRect();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
    }
    const qr = q.getBoundingClientRect();
    return {
      question: q.textContent,
      bodyHeight: Math.round(b.height),
      scrollTop: Math.round(body.scrollTop),
      questionShown: seen(qr.top, qr.bottom) >= qr.height - 1,
      answerHeight: Number.isFinite(top) ? Math.round(bottom - top) : 0,
      answerShownPx: Number.isFinite(top) ? Math.round(seen(top, bottom)) : 0,
    };
  });
}

/** The newest follow-up is in view: its question line, and its answer (all of it, or at least 40 px). */
export async function checkFollowUpInView(t, label, page = t.page) {
  const v = await followUpView(page);
  t.assert(v, `${label}: a follow-up in the answer sheet`);
  t.note(`${label}: ${v.answerShownPx} of ${v.answerHeight} px of the answer in view (body ${v.bodyHeight} px, scrolled ${v.scrollTop})`);
  t.assert(v.questionShown, `${label}: its question line is in view (${JSON.stringify(v)})`);
  t.assert(v.answerShownPx >= Math.min(v.answerHeight, 40), `${label}: its answer is in view (${JSON.stringify(v)})`);
  return v;
}

/**
 * The live viewfinder against the frame a Look sends (the camera's whole frame): the share of that
 * frame the owner can see (drawn inside the video element, not under the top bar or the deck) and the
 * share inside the brackets, by sampling a 24 × 24 grid over the frame as displayed.
 */
export function viewfinder(page) {
  return page.evaluate(() => {
    const v = document.querySelector('[data-testid="optics-video"]');
    const vb = v.getBoundingClientRect();
    const fit = getComputedStyle(v).objectFit;
    const fw = v.videoWidth;
    const fh = v.videoHeight;
    const s = fit === 'cover' ? Math.max(vb.width / fw, vb.height / fh) : Math.min(vb.width / fw, vb.height / fh);
    const dw = fw * s;
    const dh = fh * s;
    const ox = vb.x + (vb.width - dw) / 2;
    const oy = vb.y + (vb.height - dh) / 2;
    const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
    const top = rect('.optics-top');
    const deck = rect('.optics-deck');
    const br = rect('.optics-stage .optics-brackets');
    const inside = (r, x, y) => x >= r.left - 0.5 && x <= r.right + 0.5 && y >= r.top - 0.5 && y <= r.bottom + 0.5;
    let seen = 0;
    let bracketed = 0;
    const n = 24;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const x = ox + ((i + 0.5) / n) * dw;
        const y = oy + ((j + 0.5) / n) * dh;
        if (inside(vb, x, y) && x >= 0 && x <= innerWidth && y >= 0 && y <= innerHeight && !inside(top, x, y) && !inside(deck, x, y)) seen++;
        if (inside(br, x, y)) bracketed++;
      }
    }
    return { frame: `${fw}×${fh}`, shown: `${Math.round(dw)}×${Math.round(dh)}`, visible: +(seen / (n * n)).toFixed(3), insideBrackets: +(bracketed / (n * n)).toFixed(3) };
  });
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
        t.assert(/^BACK · 720×1280$/.test(await t.text(page.locator(tid('optics-sub')))), 'the native portrait frame (no browser crop)');
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
        t.assert(/^OPTICS · \d\d:\d\d · BACK$/.test(caption), `caption: ${caption}`);
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
    name: 'optics-hidden-start',
    title: 'Optics on a Mac with a slow camera (2 s to start, like a USB webcam waking up): hidden while it starts, it never runs in the background, and comes back by itself when shown',
    device: 'mac',
    timeout: 90000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().addInitScript(slowCamera);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await page.evaluate(() => sessionStorage.setItem('slowCam', '2000'));
      await page.keyboard.press('Control+Shift+L');
      await t.visible('optics');
      await page.waitForTimeout(400); // getUserMedia is under way
      t.assert((await page.locator(tid('optics')).getAttribute('data-camera')) !== 'live', 'still starting');
      await setHidden(page, true);
      await page.waitForTimeout(3000);
      const camera = await page.locator(tid('optics')).getAttribute('data-camera');
      const tracks = await liveTracks(page);
      t.note(`4 s after hiding mid-start: data-camera=${camera}, live tracks ${tracks}`);
      t.assert(tracks === 0, `hidden while starting, the camera must not run (${tracks} live track(s), data-camera=${camera})`);
      t.assert(camera === 'paused', `Optics shows the camera paused (${camera})`);
      await page.evaluate(() => sessionStorage.removeItem('slowCam'));
      await setHidden(page, false);
      await waitLive(t);
      t.assert((await liveTracks(page)) === 1, 'shown again on a computer: the camera comes back by itself');
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      t.assert((await liveTracks(page)) === 0, 'released after closing');
    },
  },
  {
    name: 'optics-landscape',
    title: 'Optics on an iPhone held sideways (844×390): after a Look the frame and a readable answer side by side (the body at least 120 px tall, the chips whole), the pins on their objects',
    device: 'iphone13',
    scale: 2,
    timeout: 90000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.setViewportSize({ width: 844, height: 390 });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await openFromComposer(t);
      await waitLive(t);
      await page.locator(tid('optics-look')).click();
      await waitAnswer(t);
      await page.waitForTimeout(600);
      const box = await page.evaluate(() => {
        const b = (sel) => {
          const e = document.querySelector(sel);
          if (!e) return null;
          const r = e.getBoundingClientRect();
          return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right), bottom: Math.round(r.bottom) };
        };
        return { stage: b('.optics-stage'), answer: b('[data-testid="optics-answer"]'), body: b('[data-testid="optics-answer-text"]'), follow: b('[data-testid="optics-followups"]'), deck: b('.optics-deck'), vw: innerWidth, vh: innerHeight };
      });
      t.note(`stage ${box.stage.w}×${box.stage.h}, answer body ${box.body.w}×${box.body.h}`);
      t.assert(box.body.h >= 120, `the answer body is readable (${box.body.h} px tall)`);
      t.assert(box.stage.h >= 250, `the frame keeps the height (${box.stage.h} px)`);
      t.assert(box.stage.right <= box.answer.x + 1, `frame and answer side by side (${JSON.stringify(box)})`);
      t.assert(box.follow.bottom <= box.answer.bottom + 1 && box.follow.right <= box.vw, `the follow-up chips are whole (${JSON.stringify(box.follow)})`);
      t.assert(box.deck.bottom <= box.vh + 1, 'the ask row on screen');
      await checkPins(t, { width: 1280, height: 720 });
      await t.checkNoHorizontalOverflow('Optics sideways');
      await shot(t, 'iphone13-landscape-answer');
      await page.locator(tid('optics-live')).click();
      await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-state')) === 'live', { timeout: 5000, message: 'back to live' });
    },
  },
  {
    name: 'optics-old-chat',
    title: 'A Look in a chat from before the camera (v6: tools V4, the one the app reopens at launch after the update) goes to a new chat, with labels; Optics says so; the old chat stays in History',
    device: 'iphone13',
    timeout: 120000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      const first = await t.send('What is the capital of France?');
      await t.waitForTurn(first, ['done'], { timeout: 30000 });
      await page.waitForTimeout(1200);
      // Make it a v6 conversation (the V3 prompt, the V4 tools: holograms, no Optics tools).
      const oldId = await page.evaluate(async ({ system, tools }) => {
        const req = indexedDB.open('jarvis');
        const db = await new Promise((resolve) => (req.onsuccess = () => resolve(req.result)));
        const all = await new Promise((resolve) => {
          const q = db.transaction('conversations').objectStore('conversations').getAll();
          q.onsuccess = () => resolve(q.result);
        });
        const conv = all.find((x) => typeof x.id === 'string' && x.system);
        const hist = all.find((x) => Array.isArray(x.apiMessages));
        conv.system = system;
        conv.tools = tools;
        if (hist) for (const m of hist.apiMessages) if (m.role === 'assistant' && Array.isArray(m.content)) m.content = m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
        await new Promise((resolve) => {
          const tx = db.transaction('conversations', 'readwrite');
          tx.objectStore('conversations').put(conv);
          if (hist && hist !== conv) tx.objectStore('conversations').put(hist);
          tx.oncomplete = resolve;
        });
        db.close();
        return conv.id;
      }, { system: LEAD_SYSTEM_V3, tools: leadToolsV4() });
      await t.reload();
      await t.waitFor(async () => (await t.count('turn-jarvis')) === 1, { timeout: 10000, message: 'the v6 chat reopened at launch' });
      await openFromComposer(t);
      await waitLive(t);
      await page.locator(tid('optics-look')).click();
      await waitAnswer(t);
      await page.waitForTimeout(500);
      const look = lastLook(t);
      const names = (look.req.body.tools || []).map((x) => x.name);
      t.assert(names.includes('pin_labels'), `the Look went to a new chat with the camera's tools (${names.join(', ')})`);
      const opening = look.req.body.messages[0];
      t.assert(Array.isArray(opening.content) && opening.content.some((b) => b.type === 'image'), 'a new conversation: the Look is its first message');
      t.assert((await t.count('optics-pin')) === 5, `labels pinned (${await t.count('optics-pin')})`);
      t.assert(/New chat: labels need one/.test(await t.text(page.locator(tid('optics-notice')))), 'Optics says why');
      await shot(t, 'iphone13-old-chat-look');
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      const ids = await page.evaluate(async () => {
        const req = indexedDB.open('jarvis');
        const db = await new Promise((resolve) => (req.onsuccess = () => resolve(req.result)));
        const all = await new Promise((resolve) => {
          const q = db.transaction('conversations').objectStore('conversations').getAll();
          q.onsuccess = () => resolve(q.result);
        });
        db.close();
        return all.filter((x) => typeof x.id === 'string' && x.system).map((x) => x.id);
      });
      t.assert(ids.includes(oldId) && ids.length === 2, `the old chat is kept, beside the new one (${ids.length} conversations)`);
    },
  },
  {
    name: 'optics-viewfinder',
    title: 'Phones: the live viewfinder shows the whole frame a Look sends (letterboxed between the top bar and the deck; sideways, beside the deck), with the brackets on its edges',
    device: 'iphone13',
    timeout: 90000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await openFromComposer(t);
      await waitLive(t);
      const check = async (label) => {
        await page.waitForTimeout(300);
        const v = await viewfinder(page);
        t.note(`${label}: ${v.visible * 100}% of the ${v.frame} frame visible, ${v.insideBrackets * 100}% inside the brackets (shown ${v.shown})`);
        t.assert(v.visible >= 0.99, `${label}: the whole frame a Look sends is visible (${JSON.stringify(v)})`);
        t.assert(v.insideBrackets >= 0.99, `${label}: and inside the brackets (${JSON.stringify(v)})`);
        return v;
      };
      await check('iPhone 13 portrait');
      await page.setViewportSize({ width: 390, height: 664 }); // the Safari tab
      await check('Safari tab');
      await shot(t, 'iphone13-viewfinder-safari-tab');
      await page.setViewportSize({ width: 844, height: 390 }); // held sideways
      const side = await check('sideways');
      t.assert(parseInt(side.shown.split('×')[1], 10) >= 300, `sideways, the picture keeps its height (${side.shown})`);
      t.assert(!(await page.locator(tid('optics-look')).isDisabled()), 'LOOK is reachable');
      await shot(t, 'iphone13-viewfinder-sideways');
      await t.checkNoHorizontalOverflow('the sideways viewfinder');
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
      t.assert(/ · 1280×720$/.test(line) && !/^(BACK|FRONT) /.test(line), `the camera's name and its 1280×720 frame (${line})`);
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
    title: 'Look at my screen (a Mac): one frame, the capture stops at once, sent as a screen frame; the home\'s Screen key opens Optics straight into it',
    device: 'mac',
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
      await t.step("the home's Screen key: Optics opens straight into the screen look (one frame, sent as a screen frame)", async () => {
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
        await page.locator(tid('header-new-chat')).click();
        const before = t.requests('lead').length;
        const shots = await page.evaluate(() => window.__opticsTracks.filter((x) => x.api === 'getDisplayMedia').length);
        await (await t.visible('quick-key-screen')).click();
        await t.visible('optics');
        await waitAnswer(t);
        t.assert((await page.evaluate(() => window.__opticsTracks.filter((x) => x.api === 'getDisplayMedia').length)) === shots + 1, 'one more screen capture');
        t.assert((await liveTracks(page, 'getDisplayMedia')) === 0, 'stopped right after the frame');
        t.assert(t.requests('lead').length > before, 'a Look was sent');
        t.assert(/live frame from the owner's screen/.test(lastLook(t).message.content[0].text), 'as a screen frame');
        t.assert(/^SCREEN · /.test(await t.text(page.locator(tid('optics-sub')))), 'labeled SCREEN');
        t.assert((await liveTracks(page)) === 0 && (await page.locator(tid('optics')).getAttribute('data-camera')) === 'off', 'the webcam stays off');
      });
    },
  },
  {
    name: 'optics-screen-cancel',
    title: "The home's Screen key on a Mac, with the screen picker cancelled (or macOS not letting Chrome record the screen): the webcam never turns on; No screen shared, Try again, or Use the camera through the first-use card",
    device: 'mac',
    timeout: 60000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().addInitScript(() => {
        // The owner cancels Chrome's "Choose what to share" (a missing macOS permission looks the same).
        window.__gum = 0;
        const md = navigator.mediaDevices;
        const gum = md.getUserMedia.bind(md);
        md.getUserMedia = (...a) => {
          window.__gum += 1;
          return gum(...a);
        };
        window.__screens = 0;
        md.getDisplayMedia = () => {
          window.__screens += 1;
          return Promise.reject(new DOMException('Permission denied by user', 'NotAllowedError'));
        };
      });
      await t.goto('/'); // the camera permission is still 'prompt', as on a first use
      const gumCalls = () => page.evaluate(() => window.__gum);
      await (await t.visible('quick-key-screen')).click();
      await t.visible('optics');
      await page.waitForTimeout(2500);
      t.assert((await gumCalls()) === 0 && (await liveTracks(page)) === 0, `the camera is never asked for (${await gumCalls()} getUserMedia calls, ${await liveTracks(page)} live tracks)`);
      await t.waitFor(async () => (await page.locator(tid('optics-card')).getAttribute('data-kind')) === 'screen-failed', { timeout: 8000, message: 'the No screen shared card' });
      t.assert((await page.locator(tid('optics')).getAttribute('data-camera')) === 'off', 'Optics says the camera is off');
      const card = await t.text(page.locator(tid('optics-card')));
      t.assert(/No screen shared/.test(card) && /camera stays off/.test(card), `says what happened (${card})`);
      t.assert(/System Settings › Privacy & Security › Screen Recording/.test(card), 'the macOS Screen Recording hint');
      t.assert(t.requests('lead').length === 0, 'nothing was sent');
      await shot(t, 'mac-screen-cancelled');
      await page.locator(tid('optics-screen-retry')).click();
      await t.waitFor(async () => (await page.evaluate(() => window.__screens)) === 2, { timeout: 5000, message: 'the picker asked again' });
      await t.waitFor(async () => (await page.locator(tid('optics-card')).getAttribute('data-kind')) === 'screen-failed', { timeout: 5000, message: 'the card again' });
      t.assert((await gumCalls()) === 0, 'still no camera');
      await page.locator(tid('optics-use-camera')).click();
      await t.visible('optics-allow', { message: 'Use the camera goes through the first-use card' });
      t.assert((await gumCalls()) === 0, 'the card first, the camera only after it');
      await page.locator(tid('optics-allow')).click();
      await waitLive(t);
      t.assert((await liveTracks(page)) === 1, 'the camera is on once the owner chose it');
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      t.assert((await liveTracks(page)) === 0, 'released');
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
      await page.waitForTimeout(200);
      await checkFollowUpInView(t, 'a follow-up in the side column');
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
