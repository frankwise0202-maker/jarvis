// Optics × the owner's cameras and follow-ups (v7), against Chromium's fake cameras dressed up by
// test/e2e/camera-rig.mjs (real-world labels, facing modes, hot-plug):
//
//   optics-picker      desktop with the MacBook camera and a Logitech webcam: the picker lists both
//                      by name, a pick stops the old camera first and is remembered (reopening starts
//                      on it); the webcam preview is mirrored, the frame sent is not
//   optics-hotplug     the chosen Logitech is unplugged at the start: Optics opens on the MacBook
//                      camera; plugged in, it is switched to; pulled out while live, Optics falls back
//                      to the MacBook camera and says so; a camera never chosen is only listed
//   optics-phone-cams  iPhone 13 with Back, Back Ultra Wide and Front: Flip goes front (mirrored
//                      preview, remembered), the Look sent from the front camera is unmirrored and
//                      so is the frozen frame; the picker reaches the extra back lens
//   optics-followups   a pin tapped → "What's this part?"; "Tell me more"; "Hologram of this": the
//                      schematic, then the hologram viewer over Optics (camera off underneath),
//                      back to the frozen answer when it closes; ANALYZING while each runs, and each
//                      new question and its answer scroll into view in the sheet
//   optics-followups-small  the same on a 375×667 phone: the chips wrap (none off the edge) and
//                      each follow-up's answer is in view
//   optics-tool-camera(-float)  Jarvis's open_screen for the camera never turns it on: the owner's
//                      Turn on camera does (iPhone: Optics; Mac: the open floating panel); a live
//                      camera may be moved back to Optics
//   optics-float-camera-off  a floating camera turned off with its own button: the main window's
//                      OPTICS LIVE and OPTICS pill go (and come back when it is on again)
//   optics-voice       Voice Mode → Look → "what am I looking at?" is a Look whose answer is spoken
//                      and pinned; "tell me more" is a spoken follow-up; "close the camera"; then,
//                      with the camera closed on a computer, "what am I looking at?" opens it and looks
//                      ("what's that?" stays a question for Jarvis); "Open in chat" in a hologram over
//                      Optics leaves Voice Mode and closes the Optics it opened

import { tid } from '../harness.mjs';
import { imageSizeOf } from '../../../src/lib/optics.js';
import { installCameraRig } from '../camera-rig.mjs';
import { installFakeSpeech } from './features.mjs';
import { cameraArgs, checkFollowUpInView, checkPins, instrument, lastLook, liveTracks, openFromComposer, shot, waitAnswer, waitLive } from './optics.mjs';
import { installScreenStubs, opensPage, toastText, typeCommand, waitAttr } from './screens.mjs';

/** The newest lead request's last user text block (the owner's words). */
async function lastUserQuestion(t) {
  const r = t.requests('lead').filter((x) => x.status === 200).at(-1);
  const m = r && r.body.messages.findLast((x) => x.role === 'user');
  const parts = m && Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text') : [];
  return parts.length ? parts.at(-1).text : '';
}

const MAC_CAMERAS = [
  { label: 'FaceTime HD Camera (Built-in) (05ac:8514)' },
  { label: 'Logitech BRIO (046d:085e)' },
  { label: 'OBS Virtual Camera' },
];
const PHONE_CAMERAS = [
  { label: 'Back Camera', facing: 'environment' },
  { label: 'Front Camera', facing: 'user' },
  { label: 'Back Ultra Wide Camera', facing: 'environment' },
];

const sub = (t, page = t.page) => t.text(page.locator(tid('optics-sub')));
const settingsOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.settings.v1') || '{}'));

async function openPicker(t, page = t.page) {
  await page.locator(tid('optics-camera')).click();
  await t.visible('optics-camera-menu', { page });
  return page.locator(tid('optics-camera-option')).evaluateAll((els) => els.map((e) => ({ name: e.querySelector('.optics-cam-name')?.textContent || '', detail: e.querySelector('.optics-cam-detail')?.textContent || '', id: e.dataset.deviceId, current: e.dataset.current === 'true' })));
}

async function waitSub(t, re, message, page = t.page) {
  await t.waitFor(async () => re.test(await sub(t, page)), { timeout: 15000, message: async () => `${message} (the camera line reads "${await sub(t, page)}")` });
}

/**
 * Whether the frame sent to Claude is the camera's own picture or its mirror image: a small
 * grayscale copy of the sent JPEG compared with the video drawn as the camera gives it, straight
 * and flipped (the scene is a still with objects off-center, so one is clearly closer).
 */
async function mirrorCheck(page, b64) {
  return page.evaluate(async (data) => {
    const video = document.querySelector('[data-testid="optics-video"]');
    const img = new Image();
    img.src = `data:image/jpeg;base64,${data}`;
    await img.decode();
    const portrait = img.naturalHeight > img.naturalWidth;
    const w = portrait ? 18 : 32;
    const h = portrait ? 32 : 18;
    const gray = (src) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d');
      x.drawImage(src, 0, 0, w, h);
      const d = x.getImageData(0, 0, w, h).data;
      const g = new Float32Array(w * h);
      for (let i = 0; i < g.length; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
      return g;
    };
    const sent = gray(img);
    const raw = gray(video);
    let same = 0;
    let flipped = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        same += Math.abs(sent[y * w + x] - raw[y * w + x]);
        flipped += Math.abs(sent[y * w + x] - raw[y * w + (w - 1 - x)]);
      }
    }
    return { same: same / (w * h), flipped: flipped / (w * h) };
  }, b64);
}

const transformOf = (page, selector) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).transform);

/** Every follow-up chip shown is whole on screen (none slides off the edge of a phone). */
async function checkChipsInView(t, label, page = t.page) {
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="optics-followups"] .optics-chip')]
      .filter((b) => !b.hidden)
      .map((b) => {
        const r = b.getBoundingClientRect();
        return { id: b.dataset.testid, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight };
      }),
  );
  t.assert(chips.length >= 2, `${label}: follow-up chips (${chips.length})`);
  for (const c of chips) t.assert(c.left >= 0 && c.right <= c.vw && c.top >= 0 && c.bottom <= c.vh, `${label}: the ${c.id} chip is whole on screen (${JSON.stringify(c)})`);
}

export default [
  {
    name: 'optics-picker',
    title: 'Camera picker (desktop): the MacBook camera and the Logitech webcam by name; a pick stops the old camera first and is remembered; mirrored preview, unmirrored frame',
    device: 'mac',
    timeout: 120000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS.slice(0, 2) });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await t.visible('optics');
      await waitLive(t);
      await t.step('Optics opens on the built-in camera, named, its preview mirrored like a mirror', async () => {
        await waitSub(t, /^MACBOOK CAMERA · 1280×720$/, 'the line names the MacBook camera');
        t.assert((await page.locator(tid('optics')).getAttribute('data-mirrored')) === 'true', 'a webcam faces the owner: mirrored preview');
        t.assert(/^matrix\(-1, 0, 0, 1, 0, 0\)$/.test(await transformOf(page, tid('optics-video'))), 'the video is drawn mirrored');
      });
      let logitechId = '';
      await t.step('the picker lists every camera by a friendly name; the one in use is checked', async () => {
        const list = await openPicker(t);
        t.assert(list.map((c) => c.name).join(' | ') === 'MacBook camera | Logitech webcam', `cameras: ${JSON.stringify(list)}`);
        t.assert(list[0].current && !list[1].current, 'the MacBook camera is in use');
        t.assert(list[1].detail === 'BRIO', `the webcam's model shows under its name (${list[1].detail})`);
        logitechId = list[1].id;
        await page.waitForTimeout(200);
        await shot(t, 'desktop-picker-two-webcams');
      });
      await t.step('choosing the Logitech: the MacBook camera stops before the webcam starts; the choice is saved on this device', async () => {
        const before = await page.evaluate(() => window.__opticsTracks.length);
        await page.locator(`${tid('optics-camera-option')}[data-device-id="${logitechId}"]`).click();
        await waitSub(t, /^LOGITECH WEBCAM · 1280×720$/, 'the Logitech is in use');
        t.assert((await t.count('optics-camera-menu', undefined)) === 0 || (await page.locator(tid('optics-camera-menu')).isHidden()), 'the menu closes');
        t.assert((await liveTracks(page)) === 1, 'one camera at a time');
        const tracks = await page.evaluate((n) => window.__opticsTracks.slice(n).map((x) => x.label), before);
        t.assert(tracks.length === 1 && tracks[0] === 'Logitech BRIO (046d:085e)', `the webcam was opened (${tracks.join(', ')})`);
        const s = await settingsOf(page);
        t.assert(s.opticsCameraId === logitechId && s.opticsCameraLabel === 'Logitech BRIO (046d:085e)', `remembered: ${JSON.stringify([s.opticsCameraId, s.opticsCameraLabel])}`);
        await shot(t, 'desktop-logitech-live');
      });
      await t.step('a Look from the webcam: the frame sent is the camera’s own picture, not the mirrored preview', async () => {
        await page.locator(tid('optics-look')).click();
        await waitAnswer(t);
        const look = lastLook(t);
        const image = look.message.content[1];
        const size = imageSizeOf(image.source.data);
        t.assert(size && size.width === 1280 && size.height === 720, `a 1280×720 frame (${JSON.stringify(size)})`);
        t.assert(/live frame from the owner's camera, 1280×720 pixels/.test(look.message.content[0].text), 'a computer camera is "the owner\'s camera" for Claude');
        const m = await mirrorCheck(page, image.source.data);
        t.assert(m.same < m.flipped * 0.6, `the frame matches the camera, not its mirror image (difference ${m.same.toFixed(1)} vs ${m.flipped.toFixed(1)} flipped)`);
        t.assert(/^none$/.test(await transformOf(page, '.optics-frozen-media')), 'the frozen frame is shown as sent (not mirrored)');
        await checkPins(t, { width: 1280, height: 720 });
        t.note(`sent frame vs camera: ${m.same.toFixed(1)} (mirror ${m.flipped.toFixed(1)})`);
      });
      await t.step('closing and opening Optics again starts straight on the remembered Logitech', async () => {
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 3000, message: 'Optics to close' });
        const opened = await page.evaluate(() => window.__cameraRig.opened.length);
        await page.keyboard.press('Control+Shift+L');
        await t.visible('optics');
        await waitLive(t);
        await waitSub(t, /^LOGITECH WEBCAM · /, 'the remembered webcam');
        const first = await page.evaluate((n) => window.__cameraRig.opened[n], opened);
        t.assert(first && first.index === 1 && first.how === 'deviceId', `the first camera opened was the Logitech, by its id (${JSON.stringify(first)})`);
        t.assert((await liveTracks(page)) === 1, 'one live camera');
      });
      await t.step("the home's Look key opens Optics the same way, on the remembered webcam (a Mac's home also has Screen)", async () => {
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0 && (await liveTracks(page)) === 0, { timeout: 3000, message: 'Optics to close and the camera to stop' });
        await page.locator(tid('header-new-chat')).click(); // the home, with its quick keys
        await t.visible('quick-key-look');
        t.assert(await page.locator(tid('quick-key-screen')).isVisible(), 'the Screen key (look at my screen) on a Mac');
        await page.locator(tid('quick-key-look')).click();
        await t.visible('optics');
        await waitLive(t);
        await waitSub(t, /^LOGITECH WEBCAM · /, 'the remembered webcam');
      });
    },
  },
  {
    name: 'optics-hotplug',
    title: 'Hot-plug: the chosen Logitech plugged in is switched to; pulled out while live, Optics falls back to the MacBook camera and says so; a new camera never chosen is only listed',
    device: 'mac',
    timeout: 120000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    // The owner chose the Logitech last time (its label is enough when the id is unknown).
    settings: { opticsCameraLabel: 'Logitech BRIO (046d:085e)' },
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS, present: [0] });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await t.visible('optics');
      await waitLive(t);
      await t.step('the Logitech is unplugged: Optics opens on the MacBook camera; the picker invites a webcam', async () => {
        await waitSub(t, /^MACBOOK CAMERA · /, 'the built-in camera');
        const list = await openPicker(t);
        t.assert(list.length === 1 && list[0].name === 'MacBook camera', `one camera (${JSON.stringify(list)})`);
        t.assert(/Plug in a USB webcam/.test(await t.text(page.locator('.optics-cam-hint'))), 'a hint to plug one in');
        await page.keyboard.press('Escape');
        t.assert(await page.locator(tid('optics-camera-menu')).isHidden(), 'Esc closes the list');
        t.assert((await t.count('optics')) === 1, '… and only the list: Optics stays open');
      });
      await t.step('plugged in: the chosen webcam is switched to, with a short notice', async () => {
        await page.evaluate(() => window.__cameraRig.plug(1));
        await waitSub(t, /^LOGITECH WEBCAM · /, 'Optics to switch to the Logitech');
        const notice = await t.text(await t.visible('optics-notice'));
        t.assert(/^Logitech webcam connected: switched to it\.$/.test(notice), `notice: ${notice}`);
        t.assert(JSON.stringify(await page.evaluate(() => window.__cameraRig.live())) === '[1]', 'only the webcam is live');
        await shot(t, 'desktop-hotplug-connected');
      });
      await t.step('pulled out while live: back to the MacBook camera, and Optics says which camera went away', async () => {
        await page.evaluate(() => window.__cameraRig.unplug(1));
        await waitSub(t, /^MACBOOK CAMERA · /, 'Optics to fall back to the MacBook camera');
        await t.waitFor(async () => /^Logitech webcam was unplugged\. Using the MacBook camera\.$/.test(await t.text(page.locator(tid('optics-notice')))), { timeout: 5000, message: 'the unplug notice' });
        t.assert((await page.locator(tid('optics')).getAttribute('data-camera')) === 'live', 'the camera stays live');
        t.assert(JSON.stringify(await page.evaluate(() => window.__cameraRig.live())) === '[0]', 'the MacBook camera is live');
        const s = await settingsOf(page);
        t.assert(s.opticsCameraLabel === 'Logitech BRIO (046d:085e)', 'the remembered choice is still the Logitech (a fallback is not a choice)');
        await shot(t, 'desktop-hotplug-unplugged');
      });
      await t.step('a camera the owner never chose (a virtual camera) is only listed; the remembered one plugged back in is switched to again', async () => {
        await page.evaluate(() => window.__cameraRig.plug(2));
        await page.waitForTimeout(800);
        t.assert(/^MACBOOK CAMERA · /.test(await sub(t)), 'no switch to a camera never chosen');
        const list = await openPicker(t);
        t.assert(list.map((c) => c.name).join(' | ') === 'MacBook camera | OBS Virtual Camera', `listed: ${JSON.stringify(list.map((c) => c.name))}`);
        await page.keyboard.press('Escape');
        await page.evaluate(() => window.__cameraRig.plug(1));
        await waitSub(t, /^LOGITECH WEBCAM · /, 'Optics to switch to the Logitech again');
        t.assert((await liveTracks(page)) === 1, 'one live camera');
      });
    },
  },
  {
    name: 'optics-phone-cams',
    title: 'iPhone 13 cameras: Back, then Flip to Front (mirrored preview, remembered); the Look from the front camera is sent and frozen unmirrored; the picker reaches Back Ultra Wide',
    device: 'iphone13',
    scale: 2,
    timeout: 120000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: PHONE_CAMERAS });
      await instrument(page);
      await t.goto('/');
      await openFromComposer(t);
      await page.locator(tid('optics-allow')).click();
      await waitLive(t);
      await t.step('the back camera first, not mirrored', async () => {
        await waitSub(t, /^BACK · 720×1280$/, 'the back camera');
        t.assert((await page.locator(tid('optics')).getAttribute('data-mirrored')) === 'false', 'not mirrored');
        t.assert(!(await page.locator(tid('optics-flip')).isDisabled()), 'Flip is on (two sides)');
      });
      await t.step('Flip: the front camera, previewed mirrored; the choice is remembered', async () => {
        await page.locator(tid('optics-flip')).click();
        await waitSub(t, /^FRONT · 720×1280$/, 'the front camera');
        t.assert((await page.locator(tid('optics')).getAttribute('data-mirrored')) === 'true', 'mirrored');
        t.assert(/^matrix\(-1, 0, 0, 1, 0, 0\)$/.test(await transformOf(page, tid('optics-video'))), 'the preview is drawn mirrored');
        t.assert((await liveTracks(page)) === 1, 'the back camera was stopped first');
        const s = await settingsOf(page);
        t.assert(s.opticsCameraLabel === 'Front Camera', `remembered: ${s.opticsCameraLabel}`);
        await page.waitForTimeout(300);
        await shot(t, 'iphone13-front-live');
      });
      await t.step('a Look from the front camera: the frame sent and the frozen frame are the camera’s own picture', async () => {
        await page.locator(tid('optics-ask')).fill('What is on my desk?');
        await page.locator(tid('optics-look')).click();
        await waitAnswer(t);
        await page.waitForTimeout(400);
        const look = lastLook(t);
        t.assert(/live frame from the owner's front camera, 720×1280 pixels/.test(look.message.content[0].text), 'Claude is told it is the front camera');
        const m = await mirrorCheck(page, look.message.content[1].source.data);
        t.assert(m.same < m.flipped * 0.6, `the frame sent is not mirrored (difference ${m.same.toFixed(1)} vs ${m.flipped.toFixed(1)} flipped)`);
        t.assert(/^none$/.test(await transformOf(page, '.optics-frozen-media')), 'the frozen frame is not mirrored either');
        t.assert(/^FRONT · 720×1280 · FROZEN$/.test(await sub(t)), `the frozen frame is labeled (${await sub(t)})`);
        await checkPins(t, { width: 720, height: 1280 });
        t.note(`front frame vs camera: ${m.same.toFixed(1)} (mirror ${m.flipped.toFixed(1)})`);
        await shot(t, 'iphone13-front-answer');
      });
      await t.step('the picker covers the extra back lens', async () => {
        await page.locator(tid('optics-live')).click();
        await waitSub(t, /^FRONT · 720×1280$/, 'live again');
        const list = await openPicker(t);
        t.assert(list.map((c) => c.name).join(' | ') === 'Back | Back Ultra Wide | Front', `lenses: ${list.map((c) => c.name).join(' | ')}`);
        await shot(t, 'iphone13-camera-picker');
        await page.locator(tid('optics-camera-option')).nth(1).click();
        await waitSub(t, /^BACK ULTRA WIDE · /, 'the ultra wide lens');
        t.assert((await page.locator(tid('optics')).getAttribute('data-mirrored')) === 'false', 'a back lens is not mirrored');
        t.assert((await settingsOf(page)).opticsCameraLabel === 'Back Ultra Wide Camera', 'remembered');
        await t.checkNoHorizontalOverflow('Optics with the picker on a phone');
      });
    },
  },
  {
    name: 'optics-followups',
    title: 'Follow-ups: a tapped pin asks "What\'s this part?"; "Tell me more"; "Hologram of this" shows the schematic, then the hologram viewer over Optics (camera off underneath), and back',
    device: 'iphone13',
    scale: 2,
    timeout: 180000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await openFromComposer(t);
      await waitLive(t);
      await page.locator(tid('optics-look')).click();
      await waitAnswer(t);
      await page.waitForTimeout(500);
      await t.step('the answer offers Tell me more and Hologram of this (with its price)', async () => {
        await t.visible('optics-followups');
        t.assert(await page.locator(tid('optics-more')).isVisible(), 'Tell me more');
        const holo = await t.text(page.locator(tid('optics-hologram')));
        t.assert(/^Hologram of this\s*≈\d+¢$/.test(holo.trim()), `Hologram of this, priced (${holo})`);
        t.assert(await page.locator(tid('optics-part')).isHidden(), 'no part question before a pin is tapped');
      });
      await t.step('a tapped pin: selected, and "What\'s this part?" asks about it (its frame and pixel go to Claude)', async () => {
        const pin = page.locator(tid('optics-pin'), { hasText: 'Screwdriver' });
        await pin.click();
        t.assert((await pin.getAttribute('data-selected')) === 'true', 'the pin is selected');
        await t.visible('optics-part');
        await checkChipsInView(t, 'a pin tapped');
        t.assert(/^Hologram of the screwdriver\s*≈\d+¢$/.test((await t.text(page.locator(tid('optics-hologram')))).trim()), 'the hologram chip names the tapped object');
        await shot(t, 'iphone13-pin-selected');
        await page.locator(tid('optics-part')).click();
        // While Jarvis works on the follow-up the sheet's header says so (not the first answer's ANSWER).
        await t.waitFor(async () => (await t.text(page.locator(tid('optics-answer-status')))) === 'ANALYZING', { timeout: 5000, message: 'ANALYZING in the sheet while the follow-up runs' });
        await t.waitFor(async () => /flat-head screwdriver/.test(await t.text(page.locator(tid('optics-answer-text')))), { timeout: 30000, message: 'the answer about the screwdriver' });
        const req = t.requests('lead').filter((r) => r.status === 200).find((r) => /What's this part\?/.test(JSON.stringify(r.body.messages.at(-1))));
        const words = req.body.messages.at(-1).content.at(-1).text;
        t.assert(/^What's this part\? \(the screwdriver you pinned on frame f1, at 466, 810\)$/.test(words), `the question names the pin (${words})`);
        await t.waitFor(async () => !(await page.locator(tid('optics-more')).isDisabled()), { timeout: 30000, message: 'the follow-up to finish' });
        await page.waitForTimeout(200);
        t.assert((await t.text(page.locator(tid('optics-answer-status')))) === 'ANSWER', 'ANSWER again once it is done');
        await checkFollowUpInView(t, 'What’s this part?');
        t.assert((await t.count('optics-pin')) === 5, `Jarvis pinned the screwdriver again; the other labels stay (${await t.count('optics-pin')} pins)`);
        t.assert((await page.locator(tid('optics-pin'), { hasText: 'Screwdriver' }).getAttribute('data-selected')) === 'true', 'the tapped pin stays selected');
      });
      await t.step('Tell me more: a follow-up in the same conversation, answered in the sheet', async () => {
        await page.locator(tid('optics-more')).click();
        await t.waitFor(async () => /worth keeping for the remote/.test(await t.text(page.locator(tid('optics-answer-text')))), { timeout: 30000, message: 'the longer answer' });
        await t.waitFor(async () => !(await page.locator(tid('optics-hologram')).isDisabled()), { timeout: 30000, message: 'the follow-up to finish' });
        await page.waitForTimeout(200);
        await checkFollowUpInView(t, 'Tell me more');
        t.assertAppendOnly();
        await shot(t, 'iphone13-followups');
      });
      await t.step('Hologram of this: the schematic while Jarvis builds, then the hologram viewer opens over Optics with the live build', async () => {
        await page.locator(tid('optics-pin'), { hasText: 'AA battery' }).click();
        await page.locator(tid('optics-hologram')).click();
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-schematic')) === 'true', { timeout: 5000, message: 'the schematic' });
        t.assert(/^BUILDING HOLOGRAM · AA BATTERY$/.test(await t.text(page.locator(tid('optics-schematic-label')))), 'BUILDING HOLOGRAM label');
        await shot(t, 'iphone13-schematic');
        const req = t.requests('lead').filter((r) => r.status === 200).at(-1);
        t.assert(req.body.messages.at(-1).content.at(-1).text === 'Show me a hologram of the AA battery.', 'the request names the object');
        await t.visible('hologram-viewer', { timeout: 30000, message: 'the hologram viewer opens while it builds' });
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-camera')) !== 'live', { timeout: 5000, message: 'the camera to stop while Optics is covered' });
        t.assert((await liveTracks(page)) === 0, 'no camera runs under the viewer');
        await t.waitFor(async () => (await page.locator(tid('hologram-viewer')).getAttribute('data-state')) === 'ready', { timeout: 60000, message: 'the hologram to finish' });
        await shot(t, 'iphone13-hologram-from-optics');
      });
      await t.step('closing the viewer shows the frozen answer again (the schematic gone, the pins back)', async () => {
        await page.locator(tid('hologram-close')).click();
        await t.waitFor(async () => (await t.count('hologram-viewer')) === 0, { timeout: 5000, message: 'the viewer to close' });
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-schematic')) !== 'true', { timeout: 10000, message: 'the schematic to end with the turn' });
        t.assert((await page.locator(tid('optics')).getAttribute('data-frozen')) === 'true', 'still frozen on the Look');
        t.assert((await t.count('optics-pin')) >= 1, 'the pins are back');
        await checkFollowUpInView(t, 'Hologram of the AA battery');
        await page.locator(tid('optics-close')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 3000, message: 'Optics to close' });
        t.assert((await t.count('hologram-card')) === 1, 'the hologram is a card in the chat');
      });
    },
  },
  {
    name: 'optics-followups-small',
    title: 'Follow-ups on a small phone (375×667): every chip whole on screen with a pin tapped; each new question and its answer scroll into view in the sheet',
    device: 'small',
    timeout: 120000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await openFromComposer(t);
      await waitLive(t);
      await page.locator(tid('optics-look')).click();
      await waitAnswer(t);
      await page.waitForTimeout(400);
      await page.locator(tid('optics-pin'), { hasText: 'Screwdriver' }).click();
      await checkChipsInView(t, 'a pin tapped');
      const done = () => t.waitFor(async () => (await page.locator(tid('optics-answer')).getAttribute('data-busy')) === 'false', { timeout: 30000, message: 'the follow-up to finish' });
      await page.locator(tid('optics-part')).click();
      await done();
      await page.waitForTimeout(200);
      await checkFollowUpInView(t, 'What’s this part?');
      await page.locator(tid('optics-more')).click();
      await done();
      await page.waitForTimeout(200);
      await checkFollowUpInView(t, 'Tell me more');
      await shot(t, 'small-followups');
      await t.checkNoHorizontalOverflow('Optics follow-ups on a small phone');
      t.assert(await page.locator(tid('optics-live')).isVisible(), 'Live (back to the camera) stays one tap away, in the deck');
    },
  },
  {
    name: 'optics-voice',
    title: 'Voice Mode × Optics: Look opens the camera over Voice Mode; "what am I looking at?" is a Look, spoken and pinned; "tell me more" is spoken; "close the camera"; "what\'s that?" stays a question; on a computer the words alone open the camera and look; "Open in chat" closes Voice Mode and its Optics',
    device: 'mac',
    timeout: 180000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS.slice(0, 2) });
      await page.addInitScript(installFakeSpeech);
      // Nothing is heard until the camera is up (the phrases are queued then).
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.step('Voice Mode has a Look button; it opens Optics over Voice Mode', async () => {
        await page.locator(tid('voice-look')).click();
        await t.visible('optics');
        await waitLive(t);
        t.assert((await t.count('voice-mode')) === 1, 'Voice Mode stays open underneath');
        t.assert(await page.locator(tid('voice-mode')).evaluate((el) => el.inert === true), 'Voice Mode is covered (inert)');
        await shot(t, 'desktop-voice-optics');
      });
      await t.step('"what am I looking at?" is a Look: the frame goes with a spoken turn; the answer is spoken and pinned', async () => {
        // Voice Mode stops listening after two silent tries; then a tap on Optics' mic (Voice
        // Mode's own: the core's tap) listens, and the phrases are heard one per listen.
        await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle', { timeout: 15000, message: 'Voice Mode to wait for a tap' });
        await page.evaluate(() => window.__voice.queue.push('Jarvis, what am I looking at?', 'Tell me more.', 'Close the camera.', "What's that?", 'What am I looking at?'));
        await page.locator(tid('optics-mic')).click();
        await waitAnswer(t);
        const look = lastLook(t);
        t.assert(look && /Reply channel: spoken/.test(look.message.content[0].text), 'a spoken (Voice Mode) turn');
        t.assert(/Optics frame f1:/.test(look.message.content[0].text) && look.message.content[1].type === 'image', 'with the Optics frame');
        t.assert(look.message.content[2].text === 'Jarvis, what am I looking at?', 'the words are the question');
        await checkPins(t, { width: 1280, height: 720 });
        await t.waitFor(async () => /That's your desk, sir/.test((await page.evaluate(() => window.__voice.said)).join(' ')), { timeout: 30000, message: 'Jarvis to say the answer' });
        await shot(t, 'desktop-voice-look-answer');
      });
      await t.step('"tell me more": a spoken follow-up about the same frame', async () => {
        await t.waitFor(async () => /worth keeping for the remote/.test(await t.text(page.locator(tid('optics-answer-text')))), { timeout: 45000, message: 'the follow-up in the Optics sheet' });
        await t.waitFor(async () => /worth keeping for the remote/.test((await page.evaluate(() => window.__voice.said)).join(' ')), { timeout: 30000, message: 'the follow-up to be spoken' });
        const req = t.requests('lead').filter((r) => r.status === 200).at(-1);
        t.assert(/Reply channel: spoken/.test(req.body.messages.at(-1).content[0].text), 'spoken');
      });
      await t.step('"close the camera": Optics closes (camera off), Voice Mode is back', async () => {
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 30000, message: 'Optics to close by voice' });
        t.assert((await liveTracks(page)) === 0, 'camera released');
        await t.waitFor(async () => /Camera off\./.test((await page.evaluate(() => window.__voice.said)).join(' ')), { timeout: 10000, message: 'the acknowledgement' });
        t.assert(!(await page.locator(tid('voice-mode')).evaluate((el) => el.inert === true)), 'Voice Mode is in front again');
      });
      await t.step('with the camera closed, "what\'s that?" is a question for Jarvis; "what am I looking at?" opens the camera and looks (a computer where the camera is allowed)', async () => {
        await t.visible('optics', { timeout: 45000, message: 'Optics to open by voice' });
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-frozen')) === 'true', { timeout: 15000, message: 'the Look' });
        await waitAnswer(t);
        const look = lastLook(t);
        t.assert(/Optics frame f2:/.test(look.message.content[0].text), 'a second frame (f2) in the same conversation');
        t.assert(look.message.content[2].text === 'What am I looking at?', `the Look's question ("${look.message.content[2].text}")`);
        const userText = (r) => {
          const m = r.body.messages.findLast((x) => x.role === 'user');
          const parts = m && Array.isArray(m.content) ? m.content : [];
          return { text: parts.filter((b) => b.type === 'text').map((b) => b.text).join('\n'), image: parts.some((b) => b.type === 'image') };
        };
        const plain = t.requests('lead').filter((r) => r.status === 200).map(userText).find((u) => /\bWhat's that\?$/.test(u.text));
        t.assert(plain, '"What\'s that?" went to Jarvis');
        t.assert(!plain.image && /Reply channel: spoken/.test(plain.text), 'as a spoken turn without a frame: the camera stayed closed');
        t.assertAppendOnly();
      });
      await t.step('a hologram over Optics, then "Open in chat": Voice Mode closes and takes its Optics with it; the chat shows the reply', async () => {
        await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle', { timeout: 30000, message: 'Voice Mode to wait for a tap' });
        await page.evaluate(() => window.__voice.queue.push('Hologram of this.', 'Who invented it?'));
        await page.locator(tid('optics-mic')).click();
        await t.visible('hologram-viewer', { timeout: 60000, message: 'the hologram over Optics' });
        t.assert((await t.count('optics')) === 1, 'Optics is still open under the viewer');
        const open = page.locator(tid('hologram-caption-open'));
        await t.waitFor(async () => (await open.isVisible()) && /invent/i.test(await lastUserQuestion(t)), { timeout: 60000, interval: 100, message: 'the reply to "Who invented it?" captioned with "Open in chat"' });
        await open.click();
        await page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        await page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'the Optics Voice Mode opened to close with it' });
        t.assert((await liveTracks(page)) === 0, 'camera released');
        const last = page.locator(tid('turn-jarvis')).last();
        await t.waitForTurn(last, ['done'], { timeout: 30000 });
        t.assert(await last.isVisible(), 'the chat shows the reply');
        t.assertAppendOnly();
      });
    },
  },
  {
    name: 'optics-tool-camera',
    title: "iPhone: Jarvis's own open_screen for the camera (no tap) never turns it on: the reply asks, Turn on camera waits; the owner's tap opens Optics live",
    device: 'iphone13',
    timeout: 90000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await page.context().addInitScript(() => {
        try {
          localStorage.setItem('jarvis.optics.intro.v1', '1'); // the owner has used Optics before
        } catch {
          /* ignore */
        }
      });
      await t.goto('/');
      const turn = await t.send('Tell me a joke [[screen:camera:beside]]');
      await t.waitForTurn(turn, ['done'], { timeout: 45000 });
      const results = t.requests('lead').filter((r) => r.status === 200).flatMap((r) => r.body.messages.at(-1).content || []).filter((b) => b && b.type === 'tool_result');
      const text = results.map((b) => (typeof b.content === 'string' ? b.content : JSON.stringify(b.content))).join(' | ');
      t.assert(/The camera is off, and only the owner can turn it on/.test(text), `the tool_result says the camera is off (${text})`);
      await page.waitForTimeout(1500);
      t.assert((await t.count('optics')) === 0 && (await liveTracks(page)) === 0, `a tool call alone never turns the camera on (Optics open: ${await t.count('optics')}, live tracks: ${await liveTracks(page)})`);
      await t.visible('screens-camera-tap', { message: 'the owner sees Turn on camera' });
      await shot(t, 'iphone13-tool-camera-tap');
      await page.locator(tid('screens-camera-on')).click();
      await t.visible('optics');
      await waitLive(t);
      t.assert((await liveTracks(page)) === 1, 'the owner tapped: the camera is on in Optics');
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      t.assert((await liveTracks(page)) === 0, 'released');
    },
  },
  {
    name: 'optics-tool-camera-float',
    title: "Mac: with a floating panel open, Jarvis's open_screen for the camera never swaps it to a live camera by itself; after the owner's Turn on camera it does, and Jarvis may bring that live camera back to Optics",
    device: 'mac',
    timeout: 120000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.addInitScript(installScreenStubs, { monitors: 1, perm: 'granted' });
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      const first = await t.send('What is a good name for a robot butler?');
      await t.waitForTurn(first, ['done'], { timeout: 45000 });
      const pip = await opensPage(t, async () => {
        const input = await t.visible('composer-input');
        await input.fill('float the answer'); // the owner floats the answer (one gesture)
        await page.locator(tid('composer-send')).click();
      });
      await waitAttr(t, pip, 'screen', 'kind', 'answer', { timeout: 15000, label: 'the floating answer' });
      const second = await t.send('Thanks. [[screen:camera:beside]]');
      await t.waitForTurn(second, ['done'], { timeout: 45000 });
      await page.waitForTimeout(1500);
      const kind = await pip.evaluate(() => (document.querySelector('[data-testid="screen"]') || {}).dataset?.kind || null);
      t.assert(kind === 'answer' && (await liveTracks(page)) === 0, `the floating panel still shows the answer, no camera (${kind}, ${await liveTracks(page)} live tracks)`);
      await t.visible('screens-camera-tap', { message: 'Turn on camera waits for the owner' });
      await page.locator(tid('screens-camera-on')).click();
      await waitAttr(t, pip, 'screen-camera', 'state', 'live', { timeout: 20000, label: 'the floating camera after the tap' });
      t.assert((await liveTracks(page)) === 1, 'one camera, in the panel');
      // The camera is on: Jarvis may bring it back to Optics ("back"), where it stays on.
      const third = await t.send('Bring that back please [[screen:camera:back]]');
      await t.waitForTurn(third, ['done'], { timeout: 45000 });
      await t.waitFor(() => pip.isClosed(), { timeout: 8000, message: 'the floating panel to close' });
      await t.visible('optics', { message: 'a live camera handed back opens Optics' });
      await waitLive(t);
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      t.assert((await liveTracks(page)) === 0, 'released');
    },
  },
  {
    name: 'optics-float-camera-off',
    title: "The indicator tells the truth: a floating camera turned off with its own Camera off leaves OPTICS LIVE and the OPTICS pill; turned on again, they come back",
    device: 'mac',
    timeout: 90000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.addInitScript(installScreenStubs, { monitors: 1, perm: 'granted' });
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await t.visible('optics');
      await waitLive(t);
      const pip = await opensPage(t, async () => {
        const ask = page.locator(tid('optics-ask'));
        await ask.fill('float the camera');
        await ask.press('Enter');
      });
      await waitAttr(t, pip, 'screen-camera', 'state', 'live', { timeout: 20000, label: 'the floating camera' });
      const main = () =>
        page.evaluate(() => ({
          word: (document.querySelector('[data-testid="state-word"]') || {}).textContent || '',
          pills: [...document.querySelectorAll('[data-testid="live-pill"]')].map((p) => `${p.dataset.kind}:${p.textContent.trim()}`),
          core: document.querySelector('[data-testid="app"]').dataset.core,
        }));
      await t.waitFor(async () => (await main()).pills.includes('optics:OPTICS'), { timeout: 5000, message: async () => `the OPTICS pill while the floating camera runs (${JSON.stringify(await main())})` });
      await pip.locator(tid('screen-camera-toggle')).click();
      await waitAttr(t, pip, 'screen-camera', 'state', 'off', { timeout: 10000, label: 'the floating camera off' });
      t.assert((await liveTracks(page)) === 0, 'no camera runs');
      await t.waitFor(async () => {
        const m = await main();
        return !m.pills.includes('optics:OPTICS') && m.word !== 'OPTICS LIVE' && m.core !== 'optics';
      }, { timeout: 5000, message: async () => `the camera is off, so no OPTICS LIVE and no OPTICS pill (${JSON.stringify(await main())})` });
      await pip.locator(tid('screen-camera-toggle')).click();
      await waitAttr(t, pip, 'screen-camera', 'state', 'live', { timeout: 20000, label: 'the floating camera on again' });
      await t.waitFor(async () => (await main()).pills.includes('optics:OPTICS'), { timeout: 5000, message: async () => `the OPTICS pill again (${JSON.stringify(await main())})` });
      await pip.close();
      await t.waitFor(async () => !(await main()).pills.includes('optics:OPTICS'), { timeout: 8000, message: 'the pill to go when the panel closes' });
    },
  },
  {
    name: 'optics-screens',
    title: 'Optics × Presence × Screens (Mac): OPTICS LIVE and WATCHING under Optics; "put this on my other screen" moves the camera to screen 2 (Optics closes), where it is LIVE; the header\'s OPTICS pill turns it off; floated beside, then "bring it back" reopens Optics; a Look is ANALYZING',
    device: 'mac',
    timeout: 180000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS.slice(0, 2) });
      await instrument(page, { devOptics: { sessionMs: 60000 } });
      await page.addInitScript(installScreenStubs, { monitors: 2, perm: 'granted' });
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await t.visible('optics');
      await waitLive(t);
      // Under Optics (it covers the window): the app's core, the header and the home say what the camera does.
      const presence = () =>
        page.evaluate(() => ({
          core: document.querySelector('[data-testid="app"]').dataset.core,
          header: document.querySelector('[data-testid="header-state"]').dataset.state,
          word: (document.querySelector('[data-testid="state-word"]') || {}).textContent || '',
          pills: [...document.querySelectorAll('[data-testid="live-pill"]')].map((p) => `${p.dataset.kind}:${p.textContent.trim()}`),
          systems: document.querySelector('[data-testid="rail-systems"] button')?.getAttribute('aria-label') || '',
        }));

      await t.step('Optics live: OPTICS LIVE, the optics core, the OPTICS pill and the Systems glance', async () => {
        await t.waitFor(async () => (await presence()).word === 'OPTICS LIVE', { timeout: 5000, message: async () => `the state word (${JSON.stringify(await presence())})` });
        const p = await presence();
        t.assert(p.core === 'optics' && p.header === 'optics', `the cores show the optics state (${JSON.stringify(p)})`);
        t.assert(p.pills.includes('optics:OPTICS'), `the OPTICS privacy pill (${p.pills})`);
        t.assert(/optics live/.test(p.systems), `the Systems glance says optics live (${p.systems})`);
      });

      await t.step('Watch: WATCHING m:ss counting down, and the WATCH pill beside OPTICS', async () => {
        await page.locator(tid('optics-watch-toggle')).click();
        const first = await t.waitFor(async () => {
          const w = (await presence()).word;
          return /^WATCHING \d:\d\d$/.test(w) ? w : null;
        }, { timeout: 5000, message: async () => `WATCHING m:ss (${JSON.stringify(await presence())})` });
        await t.waitFor(async () => (await presence()).word !== first, { timeout: 4000, message: 'the countdown to move' });
        const p = await presence();
        t.assert(p.core === 'optics', `the core keeps the optics look while watching (${p.core})`);
        t.assert(p.pills.some((x) => /^watch:WATCH \d:\d\d$/.test(x)) && p.pills.includes('optics:OPTICS'), `both pills (${p.pills})`);
        await page.locator(tid('optics-watch-toggle')).click();
        await t.waitFor(async () => (await presence()).word === 'OPTICS LIVE', { timeout: 5000, message: 'Watch off: OPTICS LIVE again' });
      });

      let screen;
      await t.step('"put this on my other screen", typed in Optics: the camera moves to screen 2, LIVE there; Optics closes here', async () => {
        screen = await opensPage(t, async () => {
          const ask = page.locator(tid('optics-ask'));
          await ask.fill('put this on my other screen');
          await ask.press('Enter');
        });
        const u = new URL(screen.url());
        t.assert(u.searchParams.get('screen') === 'camera' && u.searchParams.get('n') === '2', `a camera screen on monitor 2 (${screen.url()})`);
        const last = await page.evaluate(() => window.__opens.at(-1));
        t.assert(last.features === 'popup=1,left=1440,top=0,width=2560,height=1415', `maximized on the second monitor (${last.features})`);
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close here (one view holds the camera)' });
        t.assert(t.requests('lead').length === 0, 'a screen command: no request to Claude');
        await screen.setViewportSize({ width: 1600, height: 900 });
        await waitAttr(t, screen, 'screen-camera', 'state', 'live', { timeout: 20000, label: 'the camera on screen 2' });
        t.assert((await screen.locator(tid('screen-status')).getAttribute('data-tone')) === 'rec', 'LIVE in the privacy color');
        t.assert((await t.text(screen.locator(tid('screen-status')))) === 'LIVE', 'LIVE');
        t.assert((await t.text(screen.locator(tid('screen-detail')))) === 'MACBOOK CAMERA', 'the camera named in the header');
        t.assert((await screen.locator(tid('screen-camera')).getAttribute('data-mirrored')) === 'true', 'a webcam: mirrored preview, as in Optics');
        t.assert((await liveTracks(screen)) === 1, 'the screen holds the camera');
        t.assert((await liveTracks(page)) === 0, 'the main window does not');
        await screen.waitForTimeout(500);
        await t.screenshot('screen2-camera', screen);
      });

      await t.step('the main window: no Optics, but OPTICS LIVE and the OPTICS pill (the camera is on screen 2); one tap turns it off', async () => {
        const pill = page.locator(`${tid('live-pill')}[data-kind="optics"]`);
        await pill.waitFor({ state: 'visible', timeout: 5000 });
        await t.visible('state-word');
        await t.waitFor(async () => (await presence()).word === 'OPTICS LIVE', { timeout: 5000, message: async () => `the home's state word (${JSON.stringify(await presence())})` });
        t.assert((await presence()).core === 'optics', 'the core shows it too');
        t.assert(/optics live/.test((await presence()).systems), 'the Systems glance agrees');
        await pill.click();
        await t.waitFor(() => screen.isClosed(), { timeout: 8000, message: 'the camera screen to close' });
        t.assert(/Camera off/.test(await toastText(t)), `toast: ${await toastText(t)}`);
        await t.waitFor(async () => !(await presence()).pills.includes('optics:OPTICS'), { timeout: 5000, message: 'the pill to go' });
        await t.waitFor(async () => (await presence()).word === 'STANDING BY', { timeout: 5000, message: 'STANDING BY again' });
        await page.waitForTimeout(600);
        t.assert((await t.count('optics')) === 0, 'Optics stays closed: the camera stays off');
      });

      let pip;
      await t.step('"float the camera" in Optics: a floating panel with the live camera; "bring it back" reopens Optics here', async () => {
        await page.keyboard.press('Control+Shift+L');
        await t.visible('optics');
        await waitLive(t);
        pip = await opensPage(t, async () => {
          const ask = page.locator(tid('optics-ask'));
          await ask.fill('float the camera');
          await ask.press('Enter');
        });
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close here' });
        await waitAttr(t, pip, 'screen', 'where', 'beside', { timeout: 10000, label: 'the floating panel' });
        await waitAttr(t, pip, 'screen-camera', 'state', 'live', { timeout: 20000, label: 'the camera in the floating panel' });
        const inPip = await pip.evaluate(() => {
          const v = document.querySelector('[data-testid="screen-camera-video"]');
          return { here: !!v && v.ownerDocument === document, playing: !!v && !!v.srcObject && v.videoWidth > 0 };
        });
        t.assert(inPip.here && inPip.playing, `the preview plays in the floating window (${JSON.stringify(inPip)})`);
        await pip.setViewportSize({ width: 560, height: 420 });
        await pip.waitForTimeout(500);
        await t.screenshot('float-camera-560x420', pip);
        await typeCommand(t, 'bring it back');
        await t.waitFor(() => pip.isClosed(), { timeout: 8000, message: 'the floating panel to close' });
        await t.visible('optics', { timeout: 8000, message: '"bring it back" opens Optics here again' });
        await waitLive(t);
        t.assert((await liveTracks(page)) === 1, 'one live camera');
      });

      await t.step('a Look: ANALYZING (the core thinking) while Jarvis answers, then OPTICS LIVE again', async () => {
        const header = () => page.evaluate(() => {
          const el = document.querySelector('[data-testid="header-state"]');
          return { state: el.dataset.state, label: el.querySelector('.status-label').textContent };
        });
        await page.locator(tid('optics-look')).click();
        await t.waitFor(async () => {
          const hd = await header();
          return hd.label === 'ANALYZING' && hd.state === 'thinking';
        }, { timeout: 5000, interval: 40, message: async () => `ANALYZING while the Look is answered (${JSON.stringify(await header())})` });
        await waitAnswer(t);
        await t.waitFor(async () => (await header()).label === 'OPTICS LIVE', { timeout: 5000, message: async () => `OPTICS LIVE after the answer (${JSON.stringify(await header())})` });
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0 && (await liveTracks(page)) === 0, { timeout: 5000, message: 'camera off' });
      });
    },
  },
];
