// v8.1 Optics (Track 5), against the fake camera and the strict mock:
//
//   optics-aside              Mac: after LOOK the live video stays big (its track live) and the Look sits
//                             in its card (the picture with its labels, the answer, NEW LOOK); Expand
//                             (the picture big, the live video a corner tile, still live), Live and the
//                             tile go back; typed "expand the picture", "put the picture aside", "close
//                             the picture" (free); the log reopens it as the card; Hologram of this, and
//                             once the viewer closes the card is back aside, the camera live again
//   optics-aside-followups    Mac, a scene that changes (A for 4 s, B for 4 s): with the scene of the
//                             card's picture a question is a follow-up (no frame, ABOUT THIS PICTURE);
//                             with a changed scene a new Look (NEW LOOK); "look again" always looks
//   optics-aside-live-view    Mac: the live view keeps looking while a Look is aside, pauses while it is
//                             expanded, goes on with Live; the hour counts the Look
//   optics-aside-live-cap     Mac, replies read aloud: at 97¢ in the hour a follow-up is refused out loud
//                             and nothing is sent; after "stop live view" the same question is answered
//   optics-aside-screen       Mac, two monitors: the card's Other screen puts the Look on screen 2; Optics
//                             stays open and live here, the card folds ("On your other screen"); "bring it
//                             back" opens the card again, the camera still live
//   optics-open-by-voice      Mac, Voice Mode: "open optics" opens the camera (no request to Claude, the
//                             camera track live, "Optics is on."); "close the camera"; "video mode" starts
//                             the live view; with Jarvis hidden, the line and one notification, whose click
//                             opens Optics; a Look aside, then "look again": "New look." said first
//   optics-open-by-voice-iphone  iPhone 13, Voice Mode: "open optics" asks for the tap ("Tap Look to turn
//                             the camera on."); the tap opens Optics with no Look
//   optics-research           Mac, the home base linked: "research this" with a Look aside: the offer with
//                             its prices, shown and said; Cancel sends nothing; Quick: one quick-mode
//                             request with a web search; Mission: one swarm turn; Home base: one job on
//                             the Core; with the live view on, the offer says the other two are outside
//                             its dollar, and at 97¢ the quick answer isn't offered
//   optics-research-voice     Mac, Voice Mode over Optics: "research this" with nothing looked at: "Let me
//                             look first: about 3¢." said whole, a Look, then the offer asked aloud with its
//                             prices; "cancel" said back; "mission" through the 2-second check, then one
//                             swarm turn in words
// Screenshots also go to $OPTICS_SHOTS (default test/artifacts/optics-shots/).

import { tid } from '../harness.mjs';
import { CORE_URL } from '../core-fakes.mjs';
import { installCameraRig } from '../camera-rig.mjs';
import { configureLive, isLiveRequest } from '../../mock/optics.mjs';
import { installFakeSpeech } from './features.mjs';
import { installScreenStubs, opensPage, typeCommand, waitAttr } from './screens.mjs';
import { cameraArgs, checkPins, instrument, liveTracks, pinClashes, shot, waitAnswer, waitLive } from './optics.mjs';

const attr = (page, name) => page.locator(tid('optics')).getAttribute(`data-${name}`);
const said = (page) => page.evaluate(() => (window.__voice ? window.__voice.said.slice() : []));
const liveReqs = (t) => t.requests().filter((r) => r.body && typeof r.body === 'object' && isLiveRequest(r.body));
const leads = (t) => t.requests('lead').filter((r) => r.status === 200);
const lastUser = (r) => r.body.messages.findLast((m) => m.role === 'user');
const hasImage = (r) => {
  const m = lastUser(r);
  return !!(m && Array.isArray(m.content) && m.content.some((b) => b.type === 'image'));
};
const userText = (r) => {
  const m = lastUser(r);
  return m && Array.isArray(m.content) ? m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : String((m && m.content) || '');
};
// The camera's own tracks (Voice Mode's microphone may hold an audio track meanwhile).
const liveVideoTracks = (page) => page.evaluate(() => (window.__opticsTracks || []).filter((x) => x.api === 'getUserMedia' && x.track.kind === 'video' && x.track.readyState === 'live').length);

async function typed(t, words, page = t.page) {
  const ask = page.locator(tid('optics-ask'));
  await ask.fill(words);
  await ask.press('Enter');
}

async function waitAside(t, aside = true, page = t.page) {
  await t.waitFor(async () => (await attr(page, 'aside')) === String(aside), { timeout: 8000, message: `the Look ${aside ? 'aside' : 'not aside'}` });
}

async function lookAside(t, page = t.page) {
  await page.locator(tid('optics-look')).click();
  await waitAside(t, true, page);
  await waitAnswer(t, page);
  await page.waitForTimeout(400);
}

/** The live video on the stage: shown (not hidden behind a frozen picture), its box. */
function videoBox(page) {
  return page.evaluate(() => {
    const v = document.querySelector('[data-testid="optics-video"]');
    const s = document.querySelector('.optics-stage').getBoundingClientRect();
    const r = v.getBoundingClientRect();
    return { visibility: getComputedStyle(v).visibility, w: Math.round(r.width), h: Math.round(r.height), stageW: Math.round(s.width), right: Math.round(s.right - r.right), bottom: Math.round(s.bottom - r.bottom) };
  });
}

/**
 * How different the live picture is from the card's picture now: the share of a 64 × 36 gray
 * thumbnail's pixels that moved by more than 25 (Watch's own measure), drawn in the page.
 */
function sceneDiff(page) {
  return page.evaluate(() => {
    const gray = (src, w, h) => {
      const c = document.createElement('canvas');
      c.width = 64;
      c.height = 36;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(src, 0, 0, w, h, 0, 0, 64, 36);
      const d = g.getImageData(0, 0, 64, 36).data;
      const out = new Uint8Array(64 * 36);
      for (let i = 0, j = 0; j < out.length; i += 4, j++) out[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
      return out;
    };
    const v = document.querySelector('[data-testid="optics-video"]');
    const card = document.querySelector('[data-testid="optics-aside-picture"] .optics-frozen-media');
    if (!v || !card || !v.videoWidth) return 1;
    const cw = card.width || card.naturalWidth;
    const ch = card.height || card.naturalHeight;
    const a = gray(v, v.videoWidth, v.videoHeight);
    const b = gray(card, cw, ch);
    let n = 0;
    for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 25) n++;
    return n / a.length;
  });
}

async function seedSpend(page, usd) {
  await page.evaluate((usd) => localStorage.setItem('jarvis.liveView.spend', JSON.stringify([{ t: Date.now() - 60000, usd }])), usd);
}

const MAC_CAMERAS = [{ label: 'FaceTime HD Camera (Built-in) (05ac:8514)' }, { label: 'Logitech BRIO (046d:085e)' }];

export default [
  {
    name: 'optics-aside',
    title: 'Mac: after LOOK the live video stays big and the Look sits in its card (picture, labels, answer, NEW LOOK); Expand puts the picture big with the live video in a corner tile, still live; Live and the tile go back; typed "expand the picture", "put the picture aside", "close the picture" are free; the log reopens it as the card; after Hologram of this the card is back aside beside the live camera',
    device: 'mac',
    timeout: 180000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await waitLive(t);
      await t.step('LOOK: the live video stays big, the Look sits in its card at the top of the right column', async () => {
        await lookAside(t);
        t.assert((await attr(page, 'frozen')) === 'false' && (await attr(page, 'state')) === 'aside', `aside, not frozen (${await attr(page, 'state')})`);
        const v = await videoBox(page);
        t.assert(v.visibility === 'visible' && v.w >= v.stageW - 2, `the live video fills the stage (${JSON.stringify(v)})`);
        t.assert((await liveVideoTracks(page)) === 1, 'the camera track stays live');
        const pic = await page.locator(tid('optics-aside-picture')).boundingBox();
        t.assert(pic && pic.width >= 300 && pic.width <= 440, `the card's picture is about 400 px wide (${JSON.stringify(pic)})`);
        await checkPins(t, { width: 1280, height: 720 });
        // The card's picture is small (about 400 px): its plates still clear of each other and of every dot.
        const clash = await pinClashes(page);
        t.note(`the card's pins: ${JSON.stringify(clash)}`);
        t.assert(!clash.overlaps.length && !clash.covered.length, `no plate overlaps another or covers a dot in the card (${JSON.stringify(clash)})`);
        t.assert((await t.text(page.locator(tid('optics-answer-mark')))) === 'NEW LOOK', 'the answer is marked NEW LOOK');
        for (const id of ['optics-expand', 'optics-other-screen', 'optics-close-card']) t.assert(await page.locator(tid(id)).isVisible(), `${id} on the card`);
        // The follow-up chips in the card, a pin tapped (What's this part? too): each whole on screen.
        await page.locator(tid('optics-pin')).first().click();
        await t.waitFor(async () => await page.locator(tid('optics-part')).isVisible(), { timeout: 3000, message: 'What\'s this part? for the tapped pin' });
        const chips = await page.evaluate(() =>
          [...document.querySelectorAll('[data-testid="optics-followups"] .optics-chip')]
            .filter((b) => !b.hidden && b.offsetParent)
            .map((b) => {
              const r = b.getBoundingClientRect();
              return { id: b.dataset.testid, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight };
            }),
        );
        t.assert(chips.length >= 3, `the card's follow-up chips (${JSON.stringify(chips)})`);
        for (const c of chips) t.assert(c.left >= 0 && c.right <= c.vw && c.top >= 0 && c.bottom <= c.vh, `the ${c.id} chip is whole on screen (${JSON.stringify(c)})`);
        await shot(t, 'mac-aside-1-card');
      });
      await t.step('Expand: the picture big, the live video a tile in its corner, still live; Live and the tile go back', async () => {
        await page.locator(tid('optics-expand')).click();
        await t.waitFor(async () => (await attr(page, 'frozen')) === 'true', { timeout: 5000, message: 'expanded' });
        t.assert((await attr(page, 'tile')) === 'true', 'the live video in its tile');
        await page.waitForTimeout(400);
        const v = await videoBox(page);
        t.assert(v.visibility === 'visible' && v.w > 120 && v.w < v.stageW * 0.4 && v.right < 40 && v.bottom < 40, `a corner tile (${JSON.stringify(v)})`);
        t.assert((await liveVideoTracks(page)) === 1, 'the camera still live');
        await checkPins(t, { width: 1280, height: 720 });
        await shot(t, 'mac-aside-2-expanded');
        await page.locator(tid('optics-live')).click();
        await waitAside(t);
        await page.locator(tid('optics-expand')).click();
        await t.waitFor(async () => (await attr(page, 'tile')) === 'true', { timeout: 5000, message: 'expanded again' });
        await page.locator(tid('optics-tile')).click();
        await waitAside(t);
      });
      await t.step('typed words, free: "expand the picture", "put the picture aside", "close the picture"', async () => {
        const before = leads(t).length;
        await typed(t, 'expand the picture');
        await t.waitFor(async () => (await attr(page, 'frozen')) === 'true', { timeout: 5000, message: '"expand the picture"' });
        await typed(t, 'put the picture aside');
        await waitAside(t);
        await typed(t, 'close the picture');
        await t.waitFor(async () => (await attr(page, 'state')) === 'live', { timeout: 5000, message: '"close the picture"' });
        t.assert(!(await page.locator(tid('optics-answer')).isVisible()), 'the card is gone');
        t.assert((await liveVideoTracks(page)) === 1, 'the camera stays on');
        await page.waitForTimeout(800);
        t.assert(leads(t).length === before, `no request for those words (${leads(t).length - before})`);
      });
      await t.step('the Optics log reopens the Look as its card', async () => {
        t.assert((await t.count('optics-log-item')) === 1, 'one Look in the log');
        await page.locator(tid('optics-log-item')).click();
        await waitAside(t);
        await t.waitFor(async () => (await t.count('optics-pin')) === 5, { timeout: 5000, message: 'its labels on the card' });
      });
      await t.step('Hologram of this from the card: the viewer over Optics, no camera under it; closed, the Look is back aside beside the live camera', async () => {
        await page.locator(tid('optics-hologram')).click();
        await t.visible('hologram-viewer', { timeout: 30000, message: 'the hologram viewer over Optics' });
        await t.waitFor(async () => (await liveVideoTracks(page)) === 0, { timeout: 5000, message: 'no camera under the viewer' });
        await t.waitFor(async () => (await page.locator(tid('hologram-viewer')).getAttribute('data-state')) === 'ready', { timeout: 60000, message: 'the hologram to finish' });
        await page.locator(tid('hologram-close')).click();
        await t.waitFor(async () => (await t.count('hologram-viewer')) === 0, { timeout: 5000, message: 'the viewer to close' });
        await waitAside(t);
        await t.waitFor(async () => (await liveVideoTracks(page)) === 1, { timeout: 8000, message: 'the camera live again' });
        t.assert((await t.count('optics-pin')) >= 5, `the card keeps its labels (${await t.count('optics-pin')})`);
        await shot(t, 'mac-aside-3-after-hologram');
      });
    },
  },
  {
    name: 'optics-aside-followups',
    title: 'Mac, a scene that changes (A 4 s, B 4 s): with the card\'s scene a question is a follow-up (no new frame, ABOUT THIS PICTURE); with a changed scene, a new Look (NEW LOOK); "look again" always takes a new Look',
    device: 'mac',
    timeout: 150000,
    browserArgs: cameraArgs('desk-watch-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await waitLive(t);
      await lookAside(t);
      // The feed's two scenes differ in about 9% of the thumbnail (Watch's measure: more than 6% is a
      // change); the same scene, well under 2%.
      let lastDiff = 0;
      const sceneIs = async (same) =>
        t.waitFor(async () => {
          const d = (lastDiff = await sceneDiff(page));
          return same ? d < 0.02 : d > 0.06;
        }, { timeout: 12000, interval: 100, message: () => `the scene to be ${same ? 'the card\'s' : 'a new one'} (difference ${lastDiff.toFixed(3)})` });
      // The feed shows each scene for 4 s: wait for the change into the one wanted, so the question is
      // asked near the start of its 4 s (never as it is about to change again).
      const waitScene = async (same) => {
        await sceneIs(!same);
        await sceneIs(same);
      };
      await t.step('the same scene: "What is this?" is a follow-up on the card, no frame sent', async () => {
        await waitScene(true);
        const before = leads(t).length;
        await typed(t, 'What is this?');
        await t.waitFor(() => leads(t).length > before, { timeout: 8000, message: 'the follow-up to be sent' });
        const r = leads(t).at(-1);
        t.assert(!hasImage(r), 'no new frame');
        t.assert(/What is this\?$/.test(userText(r)), `the words (${userText(r).slice(-60)})`);
        await t.waitFor(async () => (await page.locator(tid('optics-answer')).getAttribute('data-busy')) === 'false', { timeout: 30000, message: 'the follow-up answered' });
        const marks = await page.locator(tid('optics-answer-mark')).allTextContents();
        t.assert(marks.includes('ABOUT THIS PICTURE'), `marked ABOUT THIS PICTURE (${marks.join(', ')})`);
      });
      await t.step('a changed scene: "What is this?" takes a new Look, marked NEW LOOK', async () => {
        await waitScene(false);
        const before = leads(t).length;
        await typed(t, 'What is this?');
        await t.waitFor(() => leads(t).length > before, { timeout: 8000, message: 'the new Look to be sent' });
        t.assert(hasImage(leads(t).at(-1)), 'a new frame');
        await waitAside(t);
        await waitAnswer(t);
        t.assert((await t.text(page.locator(tid('optics-answer-mark')))) === 'NEW LOOK', 'marked NEW LOOK');
        t.assert((await t.count('optics-log-item')) === 2, 'the first Look folded into the log');
      });
      await t.step('"look again" always takes a new Look, even with the card\'s scene', async () => {
        await waitScene(true);
        const before = leads(t).length;
        await typed(t, 'Look again');
        await t.waitFor(() => leads(t).length > before, { timeout: 8000, message: 'the Look' });
        t.assert(hasImage(leads(t).at(-1)), 'a new frame');
        await waitAnswer(t);
      });
    },
  },
  {
    name: 'optics-aside-live-view',
    title: 'Mac: the live view keeps looking while a Look is aside, pauses while it is expanded and goes on with Live; the hour counts the Look',
    device: 'mac',
    timeout: 150000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { costUsd: 0.0005 });
      await t.goto('/?optics=1');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await t.waitFor(async () => (await attr(page, 'liveview')) === 'on', { timeout: 8000, message: 'the live view on' });
      await t.waitFor(() => liveReqs(t).length >= 2, { timeout: 15000, message: 'two live looks' });
      const spentOf = async () => Number(await page.locator(tid('optics-liveview-meter')).getAttribute('data-spent-usd')) || 0;
      const spentBefore = await spentOf();
      await t.step('a Look aside: the live view keeps looking', async () => {
        await lookAside(t);
        t.assert((await attr(page, 'liveview-paused')) === '', 'not paused');
        const n = liveReqs(t).length;
        await t.waitFor(() => liveReqs(t).length >= n + 2, { timeout: 8000, message: 'live looks go on beside the card' });
        await shot(t, 'mac-aside-live-view');
      });
      await t.step('the hour counts the Look (its requests settled through the gate)', async () => {
        const costText = await t.text(page.locator(tid('optics-answer-cost')));
        const m = /([\d.]+)¢/.exec(costText);
        const lookUsd = m ? Number(m[1]) / 100 : 0;
        await page.waitForTimeout(1200);
        const after = await spentOf();
        t.note(`hour ${spentBefore.toFixed(4)} → ${after.toFixed(4)}; the Look ${costText}`);
        t.assert(lookUsd > 0 && after - spentBefore >= lookUsd * 0.85, `counted (${spentBefore} → ${after}, Look ${lookUsd})`);
      });
      await t.step('expanded: paused ("Paused while you look at this"); Live: it goes on', async () => {
        await page.locator(tid('optics-expand')).click();
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'look', { timeout: 5000, message: 'paused while expanded' });
        const n = liveReqs(t).length;
        await page.waitForTimeout(2500);
        t.assert(liveReqs(t).length <= n + 1, `no live look while expanded (${liveReqs(t).length - n})`);
        await page.locator(tid('optics-live')).click();
        await waitAside(t);
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === '', { timeout: 5000, message: 'going on' });
        const m = liveReqs(t).length;
        await t.waitFor(() => liveReqs(t).length >= m + 2, { timeout: 8000, message: 'live looks again' });
      });
    },
  },
  {
    name: 'optics-aside-live-cap',
    title: 'Mac, replies read aloud: with 97¢ spent in the live view\'s hour a follow-up is refused out loud and nothing is sent; after "stop live view" the same question is answered',
    device: 'mac',
    timeout: 150000,
    settings: { speakReplies: 'summary' },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { costUsd: 0.0001 });
      await t.goto('/?optics=1');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await t.waitFor(async () => (await attr(page, 'liveview')) === 'on', { timeout: 8000, message: 'the live view on' });
      await lookAside(t);
      await t.step('97¢ in the hour: "Tell me more" is refused out loud, nothing sent', async () => {
        await seedSpend(page, 0.97);
        await page.waitForTimeout(300);
        const before = leads(t).length;
        await typed(t, 'Tell me more');
        await t.waitFor(async () => /That would take the live view past its dollar this hour\./.test(await t.text(page.locator(tid('optics-answer-text')))), { timeout: 10000, message: 'the refusal in the card' });
        const text = await t.text(page.locator(tid('optics-answer-text')));
        t.assert(/It can go on at \d{1,2}:\d{2}\s?(AM|PM), or say 'stop live view' and ask again\./.test(text), `the line names the time (${text.slice(-200)})`);
        await t.waitFor(async () => (await said(page)).some((s) => /past its dollar this hour/.test(s)), { timeout: 15000, message: 'said out loud' });
        await page.waitForTimeout(800);
        t.assert(leads(t).length === before, `no request was sent (${leads(t).length - before})`);
        await shot(t, 'mac-aside-live-cap');
      });
      await t.step('"stop live view", then the same question: answered', async () => {
        await typed(t, 'stop live view');
        await t.waitFor(async () => (await attr(page, 'liveview')) === 'off', { timeout: 5000, message: 'the live view off' });
        const before = leads(t).length;
        await typed(t, 'Tell me more');
        await t.waitFor(() => leads(t).length === before + 1, { timeout: 8000, message: 'one request' });
        await t.waitFor(async () => /worth keeping for the remote/.test(await t.text(page.locator(tid('optics-answer-text')))), { timeout: 30000, message: 'the answer' });
        t.assert(/Tell me more/.test(userText(leads(t).at(-1))), 'the same question');
      });
    },
  },
  {
    name: 'optics-aside-screen',
    title: 'Mac, two monitors: the card\'s Other screen puts the Look on screen 2; Optics stays open and live here and the card folds ("On your other screen"); "bring it back" opens the card again, the camera still live',
    device: 'mac',
    timeout: 120000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS });
      await instrument(page);
      await page.addInitScript(installScreenStubs, { monitors: 2, perm: 'granted' });
      await page.context().grantPermissions(['camera']);
      await t.goto('/?optics=1');
      await waitLive(t);
      await lookAside(t);
      const screen = await opensPage(t, async () => {
        await page.locator(tid('optics-other-screen')).click();
      });
      const u = new URL(screen.url());
      t.assert(u.searchParams.get('screen') === 'look' && u.searchParams.get('id') === 'f1', `the Look goes to screen 2 (${screen.url()})`);
      await screen.setViewportSize({ width: 1600, height: 900 });
      await waitAttr(t, screen, 'screen-look', 'state', 'ready', { timeout: 20000, label: 'the Look on screen 2' });
      await t.step('Optics stays open and live here; the card folds', async () => {
        await t.waitFor(async () => (await attr(page, 'state')) === 'live', { timeout: 5000, message: 'the card folded' });
        t.assert((await t.count('optics')) === 1, 'Optics is still open');
        t.assert((await liveVideoTracks(page)) === 1, 'the camera is still live here');
        t.assert(/On your other screen/.test(await t.text(page.locator(tid('optics-notice')))), 'says where the Look went');
        t.assert(/ON YOUR OTHER SCREEN/.test(await t.text(page.locator(tid('optics-log-item')))), 'and its log row');
        t.assert((await liveTracks(screen)) === 0, 'no camera on screen 2');
      });
      await t.step('"bring it back": the card opens again, the camera still live', async () => {
        await typed(t, 'bring it back');
        await t.waitFor(() => screen.isClosed(), { timeout: 8000, message: 'screen 2 to close' });
        await waitAside(t);
        await t.waitFor(async () => (await t.count('optics-pin')) === 5, { timeout: 5000, message: 'with its labels' });
        t.assert((await liveVideoTracks(page)) === 1, 'the camera still live');
      });
    },
  },
  {
    name: 'optics-open-by-voice',
    title: 'Mac, Voice Mode: "open optics" opens the camera (no request to Claude, the camera track live, "Optics is on."); "close the camera"; "video mode" starts the live view; Jarvis hidden, a notification first, and its click opens Optics; with a Look aside, "look again" is said "New look." first',
    device: 'mac',
    timeout: 150000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS });
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
        // Jarvis hidden on demand (document.hidden only: Voice Mode isn't told, so it keeps listening
        // as Track 1's background listening would), and notifications recorded instead of shown.
        window.__hiddenForTest = false;
        const real = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hiddenForTest === true || (real && real.get ? real.get.call(document) : false) });
        window.__notes = [];
        class FakeNotification {
          constructor(title, options) {
            this.title = title;
            this.options = options || {};
            this.onclick = null;
            this.onclose = null;
            window.__notes.push(this);
          }
          close() {
            if (typeof this.onclose === 'function') this.onclose();
          }
        }
        FakeNotification.permission = 'granted';
        FakeNotification.requestPermission = () => Promise.resolve('granted');
        window.Notification = FakeNotification;
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { costUsd: 0.0001 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      const tapToTalk = async (words) => {
        await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle', { timeout: 20000, message: 'Voice Mode to wait for a tap' });
        await page.evaluate((w) => window.__voice.queue.push(...w), words);
        const mic = page.locator(tid('optics-mic'));
        if ((await t.count('optics')) && (await mic.isVisible())) await mic.click();
        else await page.locator(tid('voice-core')).click();
      };
      await t.step('"open optics": the camera opens over Voice Mode, free, and Jarvis says so', async () => {
        await tapToTalk(['Jarvis, open optics.']);
        await t.visible('optics', { timeout: 15000, message: 'Optics to open by voice' });
        await waitLive(t);
        t.assert((await liveVideoTracks(page)) === 1, 'the camera track live');
        await t.waitFor(async () => (await said(page)).some((s) => /Optics is on/.test(s)), { timeout: 10000, message: '"Optics is on."' });
        t.assert(t.requests('lead').length === 0, 'nothing sent to Claude');
        t.assert(!(await page.locator(tid('optics-answer')).isVisible()), 'no Look');
      });
      await t.step('"close the camera", then "video mode": Optics again, with the live view', async () => {
        await tapToTalk(['Close the camera.']);
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 15000, message: 'Optics to close' });
        await tapToTalk(['Video mode.']);
        await t.visible('optics', { timeout: 15000, message: 'Optics for video mode' });
        await t.waitFor(async () => (await attr(page, 'liveview')) === 'on', { timeout: 15000, message: 'the live view to start' });
        await t.waitFor(() => liveReqs(t).length >= 1, { timeout: 15000, message: 'a live look' });
        t.assert(t.requests('lead').length === 0, 'still no question sent to Claude');
      });
      await t.step('Jarvis hidden (another app in front): "open optics" says the camera needs him on screen, with one notification; its click opens Optics', async () => {
        await tapToTalk(['Close the camera.']);
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 15000, message: 'Optics to close' });
        await tapToTalk(['Open optics.']);
        await page.evaluate(() => (window.__hiddenForTest = true)); // the words are heard while Jarvis is hidden
        await t.waitFor(async () => (await said(page)).some((s) => /The camera only runs while I’m on screen\. Click the notification to bring me up\./.test(s)), { timeout: 15000, message: 'the line about the notification' });
        const notes = await page.evaluate(() => window.__notes.map((n) => ({ title: n.title, body: n.options && n.options.body })));
        t.assert(notes.length === 1 && /camera/i.test(notes[0].title + notes[0].body), `one notification (${JSON.stringify(notes)})`);
        t.assert((await t.count('optics')) === 0 && (await liveVideoTracks(page)) === 0, 'no camera while hidden');
        await page.evaluate(() => {
          window.__hiddenForTest = false;
          const n = window.__notes[0];
          if (n && typeof n.onclick === 'function') n.onclick();
        });
        await t.visible('optics', { timeout: 15000, message: 'Optics to open from the notification' });
        await waitLive(t);
        t.assert((await liveVideoTracks(page)) === 1, 'the camera track live');
        t.assert(t.requests('lead').length === 0, 'nothing sent to Claude');
      });
      await t.step('a Look aside, then "look again": Jarvis says "New look." first, then the new Look goes', async () => {
        const looks = () => leads(t).filter((r) => hasImage(r)).length;
        await tapToTalk(['What am I looking at?']);
        await waitAside(t);
        await waitAnswer(t);
        t.assert(looks() === 1, `one Look (${looks()})`);
        // Only what is said after "look again" counts: the first answer said in full first.
        await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle', { timeout: 30000, message: 'Voice Mode to have said the answer' });
        const n = (await said(page)).length;
        await tapToTalk(['Look again.']);
        await t.waitFor(() => looks() === 2, { timeout: 20000, message: 'the new Look' });
        await t.waitFor(async () => (await said(page)).length > n, { timeout: 10000, message: 'something said' });
        const after = (await said(page)).slice(n);
        t.assert(/^New look\.$/.test(after[0]), `"New look." said first (${JSON.stringify(after)})`);
        await waitAnswer(t);
        t.assert((await t.text(page.locator(tid('optics-answer-mark')))) === 'NEW LOOK', 'the answer is marked NEW LOOK');
      });
    },
  },
  {
    name: 'optics-open-by-voice-iphone',
    title: 'iPhone 13, Voice Mode: "open optics" asks for the tap ("Tap Look to turn the camera on."); the tap on Look opens Optics with no Look',
    device: 'iphone13',
    timeout: 120000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = ['Open optics.'];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.waitFor(async () => (await said(page)).some((s) => /Tap Look to turn the camera on/.test(s)), { timeout: 20000, message: '"Tap Look to turn the camera on."' });
      t.assert((await t.count('optics')) === 0, 'the camera waits for the tap');
      await page.locator(tid('voice-look')).click();
      await t.visible('optics');
      await waitLive(t);
      await page.waitForTimeout(1500);
      t.assert(!(await page.locator(tid('optics-answer')).isVisible()) && t.requests('lead').length === 0, 'the camera, and no Look');
    },
  },
  {
    name: 'optics-research',
    title: 'Mac, the home base linked: "research this" with a Look aside: the offer with its prices, shown and said; Cancel sends nothing; Quick is one quick-mode request with a web search; Mission one swarm turn; Home base one job on the Core; with the live view on, the other two are outside its dollar, and at 97¢ the quick answer is not offered',
    device: 'mac',
    timeout: 240000,
    seed: { settings: { homeBaseUrl: CORE_URL, speakReplies: 'summary' } },
    fakeCore: { brain: { key: true } },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { costUsd: 0.0001 });
      await t.goto('/?optics=1');
      await waitLive(t);
      await lookAside(t);
      const offerText = () => t.text(page.locator(tid('optics-card')));
      const offer = async () => {
        await typed(t, 'research this');
        await t.waitFor(async () => (await page.locator(tid('optics-card')).getAttribute('data-kind')) === 'research', { timeout: 8000, message: 'the offer' });
        return offerText();
      };
      const idle = () => t.waitFor(async () => (await page.locator(tid('optics-answer')).getAttribute('data-busy')) === 'false', { timeout: 30000, message: 'Jarvis to be free' });
      await t.step('the offer: the subject and each way with its price, shown and said; Cancel sends nothing', async () => {
        const before = leads(t).length;
        const text = await offer();
        t.assert(/Research this coffee mug\? A quick answer with a web search, about 10¢\. A research mission with 8 agents, about \$1\.70\. Or the home base can do it in the background, up to \$1\.25\./.test(text), `the offer (${text})`);
        for (const id of ['quick', 'mission', 'homebase', 'cancel']) t.assert(await page.locator(tid(`optics-research-${id}`)).isVisible(), `${id} button`);
        await t.waitFor(async () => (await said(page)).some((s) => /A research mission with 8 agents/.test(s)), { timeout: 15000, message: 'the offer said' });
        await shot(t, 'mac-research-offer');
        await page.locator(tid('optics-research-cancel')).click();
        await page.waitForTimeout(1000);
        t.assert(leads(t).length === before && t.core.brain.jobs.length === 0, 'nothing sent');
      });
      await t.step('Quick: one quick-mode request with a web search, a follow-up on the card', async () => {
        const before = leads(t).length;
        await offer();
        await page.locator(tid('optics-research-quick')).click();
        await t.waitFor(() => leads(t).length > before, { timeout: 8000, message: 'the quick answer' });
        const r = leads(t).at(-1);
        t.assert(/Research this with a web search and give me a quick answer: Coffee mug/.test(userText(r)), `the words (${userText(r).slice(-160)})`);
        t.assert(/Mode: quick/.test(JSON.stringify(r.body.messages.at(-1))), 'quick mode');
        t.assert((r.body.tools || []).some((x) => x.name === 'web_search'), 'web search allowed');
        await t.waitFor(async () => /Research: Coffee mug/.test(await t.text(page.locator(tid('optics-answer-text')))), { timeout: 30000, message: 'the answer on the card' });
        await idle();
      });
      await t.step('Mission: one swarm turn with the subject in words', async () => {
        const before = leads(t).length;
        await offer();
        await page.locator(tid('optics-research-mission')).click();
        await t.waitFor(() => leads(t).length > before, { timeout: 8000, message: 'the mission' });
        const r = leads(t).at(-1);
        t.assert(/^Research Coffee mug/.test(userText(r).split('\n').at(-1)), `the words (${userText(r).slice(-160)})`);
        t.assert(/Mode: swarm/.test(JSON.stringify(r.body.messages.at(-1))), 'swarm mode');
        t.assert(!hasImage(r), 'words only');
        t.assert(/The research mission is under way/.test(await t.text(page.locator(tid('optics-notice')))), 'Optics says where it is');
        await page.waitForTimeout(3000); // the mission's answer, in the chat behind Optics
      });
      await t.step('Home base: one research job on the Core (words only)', async () => {
        await offer();
        await page.locator(tid('optics-research-homebase')).click();
        await t.waitFor(() => t.core.brain.jobs.length === 1, { timeout: 8000, message: 'the job on the Core' });
        const job = t.core.brain.jobs[0];
        t.assert(/^Coffee mug/.test(job.prompt) && job.depth === 'quick', `the job (${JSON.stringify(job).slice(0, 200)})`);
      });
      await t.step('with the live view on: the other two are outside its dollar; at 97¢ the quick answer is not offered', async () => {
        await page.locator(tid('optics-liveview-toggle')).click();
        await t.waitFor(async () => (await attr(page, 'liveview')) === 'on', { timeout: 8000, message: 'the live view on' });
        let text = await offer();
        t.assert(/Those two are outside the live view’s dollar an hour\./.test(text), `the offer says so (${text})`);
        await page.locator(tid('optics-research-cancel')).click();
        await seedSpend(page, 0.97);
        text = await offer();
        t.assert(/A quick answer would take the live view past its dollar this hour\./.test(text), `quick not offered (${text})`);
        t.assert(!(await page.locator(tid('optics-research-quick')).count()), 'no Quick button');
        await page.locator(tid('optics-research-cancel')).click();
      });
    },
  },
  {
    name: 'optics-research-voice',
    title: 'Mac, Voice Mode over Optics: "research this" with nothing looked at says "Let me look first: about 3¢.", looks, then asks the offer aloud with its prices; "cancel" says so; "mission" goes through the 2-second check, then one swarm turn in words',
    device: 'mac',
    timeout: 180000,
    seed: { settings: { homeBaseUrl: CORE_URL } },
    fakeCore: { brain: { key: true } },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS });
      await page.addInitScript(installFakeSpeech, { cps: 30 }); // lines take their time, so a cut one shows
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      // The words are heard by the next listen: Voice Mode's own (after a question it listens), or one
      // opened by a tap on Optics' mic (Voice Mode's) when it waits for a tap.
      const speak = async (words) => {
        await page.evaluate((w) => window.__voice.queue.push(...w), words);
        await t.waitFor(
          async () => {
            if (!(await page.evaluate(() => window.__voice.queue.length))) return true;
            if ((await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle') await page.locator(tid('optics-mic')).click().catch(() => {});
            return false;
          },
          { timeout: 30000, interval: 700, message: `"${words.join(' ')}" heard` },
        );
      };
      const OFFER = /Research this coffee mug\? A quick answer with a web search, about 10¢\. A research mission with 8 agents, about \$1\.70\. Or the home base can do it in the background, up to \$1\.25\./;
      const offers = async () => (await said(page)).filter((s) => OFFER.test(s)).length;
      await page.locator(tid('voice-look')).click();
      await t.visible('optics');
      await waitLive(t);
      await t.step('"research this" with nothing looked at yet: "Let me look first: about 3¢." said whole, one Look, then the offer asked aloud, prices first', async () => {
        await speak(['Research this.']);
        await t.waitFor(async () => (await said(page)).some((s) => /^Let me look first: about 3¢\.$/.test(s)), { timeout: 15000, message: async () => `the line (${JSON.stringify((await said(page)).slice(-3))})` });
        await waitAside(t);
        await waitAnswer(t);
        t.assert(leads(t).filter((r) => hasImage(r)).length === 1, 'one Look');
        await t.waitFor(async () => (await offers()) === 1, { timeout: 30000, message: async () => `the offer said (${JSON.stringify((await said(page)).slice(-3))})` });
        // Said to its end (an utterance cut by cancel() never gets its endAt).
        const log = await page.evaluate(() => (window.__voice.log || []).map((e) => ({ text: String(e.text).slice(0, 40), at: Math.round(e.at), endAt: Math.round(e.endAt || 0) })));
        const line = log.find((e) => /^Let me look first/.test(e.text));
        t.assert(line && line.endAt > 0, `the line was said to its end, not cut by the Look (${JSON.stringify(line)})`);
        t.assert((await page.locator(tid('optics-card')).getAttribute('data-kind')) === 'research', 'the offer on Optics\' card too');
        const before = leads(t).length;
        await page.waitForTimeout(500);
        t.assert(leads(t).length === before && t.core.brain.jobs.length === 0, 'nothing more sent');
      });
      await t.step('"cancel": "Okay, no research.", nothing sent', async () => {
        const before = leads(t).length;
        await speak(['Cancel.']);
        await t.waitFor(async () => (await said(page)).some((s) => /^Okay, no research\.$/.test(s)), { timeout: 15000, message: '"Okay, no research."' });
        t.assert(leads(t).length === before, 'nothing sent');
      });
      await t.step('"mission": the 2-second check, then one swarm turn with the subject in words', async () => {
        await speak(['Research this.']);
        await t.waitFor(async () => (await offers()) === 2, { timeout: 20000, message: 'the offer said again' });
        const before = leads(t).length;
        await speak(['Mission.']);
        await t.waitFor(async () => /mission/i.test(await t.text(page.locator(tid('voice-review-text')))), { timeout: 10000, message: 'the 2-second check shows "mission"' });
        t.assert(leads(t).length === before, 'nothing sent during the check');
        await t.waitFor(() => leads(t).length > before, { timeout: 20000, message: 'the mission' });
        const r = leads(t)[before];
        t.assert(/^Research Coffee mug/.test(userText(r).split('\n').at(-1)), `the words (${userText(r).slice(-160)})`);
        t.assert(/Mode: swarm/.test(JSON.stringify(r.body.messages.at(-1))), 'swarm mode');
        t.assert(!hasImage(r), 'words only');
        t.assert(t.core.brain.jobs.length === 0, 'no home base job');
      });
    },
  },
];
