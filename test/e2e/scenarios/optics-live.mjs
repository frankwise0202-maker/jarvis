// Optics' live view (v8.0), against the fake camera and the strict mock's live answers
// (test/mock/optics.mjs configureLive: a scripted scene, a cost per look, 429/529, slow replies):
//
//   optics-live           Mac (Chrome), replies read aloud: Live view by the button; about one look a
//                         second (Haiku 5.5, thinking off, a 640×360 JPEG, the scene so far and the
//                         lines said); the caption follows the scene; a worth-saying line is listed
//                         and spoken once, the next one within 15 s only listed; the meter counts up
//                         and the month's spending too; stop by the button, the Optics mic ("stop
//                         live view"), typed words ("watch me", "that's enough"), Esc and the LIVE pill
//   optics-live-voice     iPhone 13, Voice Mode: "live view" with the camera closed asks for the tap;
//                         Look then opens Optics and starts it; Voice Mode says the line; "that's
//                         enough" stops it; the keys fit portrait and held sideways
//   optics-live-voice-mac Mac, Voice Mode, the camera allowed: "keep watching" with Optics closed opens it
//                         over Voice Mode and the live view starts by itself; the LIVE pill ends it
//   optics-live-cap       Mac: 95¢ already spent this hour (another tab): one look every 5 s, then
//                         paused at $1 with the time it can go on; a reload keeps the spend (it
//                         starts paused); Resume works from then, back to one look a second
//   optics-live-hidden    iPhone 13, slow replies (1.5 s): never two looks in flight; the page hidden
//                         while one is under way: stopped, the camera released, no request after
//   optics-live-ratelimit Mac: a 429 with retry-after 3 s, then a 529: the note, the waits, recovery;
//                         offline: paused with a note, on again once back online
//   optics-live-look      iPhone 13: a question during the live view is a Look on the main model; the
//                         looks pause ("Paused while you look at this"); Live resumes them; the Look's
//                         cost counts in the hour
//   optics-live-hour      iPhone 13: a session shortened to 8 s (dev override) stops by itself and says
//                         so; Live view starts it again
//   optics-live-watch     Mac: Watch stops the live view and the live view stops Watch; "stop
//                         watching" stops the live view
// Screenshots also go to $OPTICS_SHOTS (default test/artifacts/optics-shots/).

import { tid } from '../harness.mjs';
import { imageSizeOf } from '../../../src/lib/optics.js';
import { configureLive, isLiveRequest, isWatchRequest } from '../../mock/optics.mjs';
import { installFakeSpeech } from './features.mjs';
import { cameraArgs, instrument, lastLook, liveTracks, setHidden, shot, waitAnswer, waitLive } from './optics.mjs';

const LINE_1 = 'That’s a Duracell AA, 1.5 volts.';
const LINE_2 = 'Mind the polarity: the flat end goes on the spring.';
const SCENE = [
  { summary: 'A desk with a coffee mug, an AA battery and a pothos.', worth_saying: false, line: '' },
  { summary: 'A desk with a coffee mug, an AA battery and a pothos.', worth_saying: false, line: '' },
  { summary: 'The owner holds up an AA battery to the camera.', worth_saying: true, line: LINE_1 },
  { summary: 'The owner holds the battery next to an open TV remote.', worth_saying: true, line: LINE_2 },
  { summary: 'The owner puts the battery into the remote.', worth_saying: false, line: '' },
];
const NETWORK_NOISE = [/Failed to load resource: the server responded with a status of (429|529)/, /ERR_INTERNET_DISCONNECTED|Failed to load resource: net::/];

const liveReqs = (t) => t.requests().filter((r) => r.body && typeof r.body === 'object' && isLiveRequest(r.body));
const liveTimes = (t) => liveReqs(t).map((r) => Date.parse(r.time));
const attr = (page, name) => page.locator(tid('optics')).getAttribute(`data-${name}`);
const meterText = (t, page = t.page) => t.text(page.locator(tid('optics-liveview-meter')));
const spentOf = async (page) => Number(await page.locator(tid('optics-liveview-meter')).getAttribute('data-spent-usd')) || 0;
const noteText = (t, page = t.page) => t.text(page.locator(tid('optics-liveview-note')));
const said = (page) => page.evaluate(() => (window.__voice ? window.__voice.said.slice() : []));
// The camera's own tracks (Voice Mode's microphone may hold an audio track meanwhile).
const liveVideoTracks = (page) => page.evaluate(() => (window.__opticsTracks || []).filter((x) => x.api === 'getUserMedia' && x.track.kind === 'video' && x.track.readyState === 'live').length);
const userText = (r) => (r.body.messages[0].content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');

async function waitOn(t, on, page = t.page, message = '') {
  await t.waitFor(async () => (await attr(page, 'liveview')) === (on ? 'on' : 'off'), { timeout: 8000, message: message || `the live view to be ${on ? 'on' : 'off'}` });
}

async function waitRequests(t, n, timeout = 15000) {
  await t.waitFor(() => liveReqs(t).length >= n, { timeout, message: () => `${n} live looks (${liveReqs(t).length} so far)` });
}

/** No live request for `ms` after now. */
async function noMoreLooks(t, label, ms = 3000, page = t.page) {
  const before = liveReqs(t).length;
  await page.waitForTimeout(ms);
  t.assert(liveReqs(t).length === before, `${label}: no live look after (${liveReqs(t).length - before} more)`);
}

/** Every Optics key is on screen, whole, and none overlaps another. */
async function checkKeys(t, label, page = t.page) {
  const keys = await page.evaluate(() =>
    [...document.querySelectorAll('.optics-keys > *')]
      .filter((k) => !k.hidden && k.getClientRects().length)
      .map((k) => {
        const r = k.getBoundingClientRect();
        return { id: k.dataset.testid || k.className, left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: innerWidth, vh: innerHeight };
      }),
  );
  t.assert(keys.some((k) => k.id === 'optics-liveview-toggle'), `${label}: the Live view key shows (${JSON.stringify(keys)})`);
  for (const k of keys) t.assert(k.left >= 0 && k.right <= k.vw && k.top >= 0 && k.bottom <= k.vh, `${label}: ${k.id} is whole on screen (${JSON.stringify(k)})`);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      const overlap = Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;
      t.assert(!overlap, `${label}: ${a.id} and ${b.id} overlap (${JSON.stringify([a, b])})`);
    }
  }
  t.note(`${label}: keys ${keys.map((k) => `${k.id.replace('optics-', '')} ${k.left}–${k.right}`).join(', ')}`);
}

/** The request shape of a live look (the contract with src/engine/live.js). */
function checkLiveRequest(t, r, { width, height }) {
  const b = r.body;
  t.assert(b.model === 'claude-haiku-5-5', `the cheap model (${b.model})`);
  t.assert(b.thinking && b.thinking.type === 'disabled', `thinking off (${JSON.stringify(b.thinking)})`);
  t.assert(b.output_config && b.output_config.effort === 'low' && b.output_config.format && b.output_config.format.type === 'json_schema', `effort low, JSON schema (${JSON.stringify(b.output_config && { effort: b.output_config.effort, type: b.output_config.format && b.output_config.format.type })})`);
  const props = Object.keys(b.output_config.format.schema.properties || {}).sort().join(',');
  t.assert(props === 'line,summary,worth_saying', `{ summary, worth_saying, line } (${props})`);
  t.assert(!b.tools && b.stream !== true, 'a one-off request: no tools, no stream');
  t.assert(/^You are Jarvis Live view/.test(typeof b.system === 'string' ? b.system : b.system.map((x) => x.text).join('')), 'the live view prompt');
  t.assert(b.messages.length === 1, `one message, no conversation (${b.messages.length})`);
  const img = b.messages[0].content.find((x) => x.type === 'image');
  t.assert(img && img.source.media_type === 'image/jpeg', 'a JPEG frame');
  const size = imageSizeOf(img.source.data);
  t.assert(size && size.width === width && size.height === height, `the frame is ${width}×${height} (${JSON.stringify(size)})`);
}

async function seedSpend(page, entries) {
  await page.evaluate((list) => {
    const now = Date.now();
    localStorage.setItem('jarvis.liveView.spend', JSON.stringify(list.map((e) => ({ t: now - e.agoMs, usd: e.usd }))));
  }, entries);
}

export default [
  {
    name: 'optics-live',
    title: 'Live view on a Mac (replies read aloud): about one look a second on Haiku 5.5, the caption, a line listed and spoken once, the meter; stop by the button, by voice, typed, Esc and the LIVE pill',
    device: 'mac',
    timeout: 180000,
    settings: { speakReplies: 'summary' },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = []; // nothing is heard until a step queues it
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { scene: SCENE, costUsd: 0.002 });
      await t.goto('/?optics=1');
      await waitLive(t);
      await t.step('the Live view key sits beside Watch; nothing is sent before it is pressed', async () => {
        await checkKeys(t, 'Mac');
        const order = await page.evaluate(() => [...document.querySelectorAll('.optics-keys > *')].map((k) => k.dataset.testid || k.className));
        t.assert(order.indexOf('optics-liveview-toggle') === order.indexOf('optics-watch-toggle') + 1, `Live view right after Watch (${order.join(', ')})`);
        await page.waitForTimeout(1500);
        t.assert(liveReqs(t).length === 0, 'no live look before the owner starts it');
      });
      await t.step('Live view by the button: about one look a second, the request shape, the caption, the meter', async () => {
        const started = Date.now();
        await page.locator(tid('optics-liveview-toggle')).click();
        await waitOn(t, true);
        t.assert((await page.locator(tid('optics-liveview-toggle')).getAttribute('aria-pressed')) === 'true', 'the key is pressed');
        t.assert(/^LIVE VIEW · 0 min · .+ this hour · limit \$1$/.test(await meterText(t)), `the meter (${await meterText(t)})`);
        t.assert((await t.text(page.locator('.optics-pill-text'))) === 'VIEW', `the LIVE pill reads LIVE VIEW (${await t.text(page.locator(tid('optics-live-pill')))})`);
        t.assert(/^Live view is on/.test(await page.locator(tid('optics-live-pill')).getAttribute('aria-label')), 'and says so to a screen reader');
        await waitRequests(t, 6);
        const times = liveTimes(t);
        const gaps = times.slice(1).map((x, i) => x - times[i]);
        t.note(`gaps between looks: ${gaps.join(', ')} ms; first look ${times[0] - started} ms after the tap`);
        for (const g of gaps) t.assert(g >= 900 && g <= 2600, `looks about once a second (gap ${g} ms)`);
        checkLiveRequest(t, liveReqs(t)[0], { width: 640, height: 360 });
        // The second look carries the scene so far (the first look's summary).
        t.assert(userText(liveReqs(t)[1]).includes(SCENE[0].summary), `the scene so far goes with the next look (${userText(liveReqs(t)[1]).slice(0, 160)})`);
        await t.waitFor(async () => (await t.text(page.locator(tid('optics-liveview-caption')))) === SCENE[4].summary, { timeout: 10000, message: async () => `the caption to follow the scene ("${await t.text(page.locator(tid('optics-liveview-caption')))}")` });
        t.assert(await page.locator(tid('optics-liveview-caption')).isVisible(), 'the caption is on screen');
      });
      await t.step('the worth-saying lines: listed newest first; the first spoken once, the second (within 15 s) only listed', async () => {
        await t.waitFor(async () => (await t.count('optics-liveview-line')) === 2, { timeout: 8000, message: 'two lines in the list' });
        const lines = await page.locator(tid('optics-liveview-line')).evaluateAll((els) => els.map((e) => ({ text: e.querySelector('.optics-liveview-text').textContent, spoken: e.dataset.spoken })));
        t.assert(lines[0].text === LINE_2 && lines[1].text === LINE_1, `newest first (${JSON.stringify(lines)})`);
        t.assert(lines[1].spoken === 'true' && lines[0].spoken === 'false', `the first spoken, the second only shown (${JSON.stringify(lines)})`);
        await page.waitForTimeout(1200);
        const spoken = await said(page);
        t.assert(spoken.filter((s) => s.includes('Duracell AA')).length === 1, `the first line spoken once (${JSON.stringify(spoken)})`);
        t.assert(!spoken.some((s) => s.includes('polarity')), `the second line is not spoken within 15 s (${JSON.stringify(spoken)})`);
        // The lines said go with the next looks (never repeated).
        const last = liveReqs(t).at(-1);
        t.assert(userText(last).includes(LINE_1) && userText(last).includes(LINE_2), `the lines said go with the next look (${userText(last).slice(0, 240)})`);
        await shot(t, 'mac-live-view');
      });
      await t.step('the meter counts up; each look is in the month too', async () => {
        const a = await spentOf(page);
        const looksA = liveReqs(t).length;
        await waitRequests(t, looksA + 3);
        await page.waitForTimeout(300);
        const b = await spentOf(page);
        t.assert(b > a, `the hour's spend grows (${a} → ${b})`);
        t.assert(/^LIVE VIEW · 0 min · \d+(\.\d)?¢ this hour · limit \$1$/.test(await meterText(t)), `the meter in cents (${await meterText(t)})`);
        const month = await page.evaluate(() => JSON.parse(localStorage.getItem('jarvis.spend.v1') || '{}').monthUsd || 0);
        t.assert(month >= b - 0.0005, `the looks are in the month's spending (${month} vs ${b})`);
      });
      await t.step('stop by the button: no look after', async () => {
        await page.locator(tid('optics-liveview-toggle')).click();
        await waitOn(t, false);
        await noMoreLooks(t, 'stopped by the button', 2500);
        t.assert((await liveTracks(page)) === 1, 'the camera stays on');
      });
      await t.step('by voice (the Optics mic): "live view" starts it, "stop live view" stops it', async () => {
        await page.evaluate(() => window.__voice.queue.push('Live view.'));
        await page.locator(tid('optics-mic')).click();
        await waitOn(t, true, page, 'the live view by voice');
        const n = liveReqs(t).length;
        await waitRequests(t, n + 2);
        await page.evaluate(() => window.__voice.queue.push('Stop live view.'));
        await page.locator(tid('optics-mic')).click();
        await waitOn(t, false, page, '"stop live view" to stop it');
        await noMoreLooks(t, 'stopped by voice', 2500);
        t.assert(liveReqs(t).length >= n + 2, 'it looked meanwhile');
        t.assert(t.requests('lead').length === 0, 'the words never went to Jarvis as a Look or a question');
      });
      await t.step('typed in the question box: "watch me" starts it, "that\'s enough" stops it', async () => {
        await page.locator(tid('optics-ask')).fill('Watch me');
        await page.locator(tid('optics-ask')).press('Enter');
        await waitOn(t, true, page, '"watch me" typed');
        await waitRequests(t, liveReqs(t).length + 1);
        await page.locator(tid('optics-ask')).fill("That's enough");
        await page.locator(tid('optics-ask')).press('Enter');
        await waitOn(t, false, page, '"that\'s enough" typed');
        t.assert(t.requests('lead').length === 0, 'no Look was sent for those words');
      });
      await t.step('Esc closes Optics: stopped, the camera released, no look after', async () => {
        await page.locator(tid('optics-liveview-toggle')).click();
        await waitOn(t, true);
        await waitRequests(t, liveReqs(t).length + 1);
        await page.keyboard.press('Escape');
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
        t.assert((await liveTracks(page)) === 0, 'the camera is released');
        await noMoreLooks(t, 'after Esc', 3000);
      });
      await t.step('the LIVE pill: stopped, the camera off, no look after', async () => {
        await page.keyboard.press('Control+Shift+L');
        await waitLive(t);
        await page.locator(tid('optics-liveview-toggle')).click();
        await waitOn(t, true);
        await waitRequests(t, liveReqs(t).length + 1);
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
        t.assert((await liveTracks(page)) === 0, 'the camera is released');
        await noMoreLooks(t, 'after the LIVE pill', 3000);
      });
    },
  },
  {
    name: 'optics-live-voice',
    title: 'Live view on an iPhone in Voice Mode: "live view" asks for the tap, Look opens Optics and starts it, Voice Mode says the line, "that\'s enough" stops it; the keys fit portrait and held sideways',
    device: 'iphone13',
    timeout: 150000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = ['Live view.'];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { scene: SCENE, costUsd: 0.002 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.step('"live view" with the camera closed on an iPhone: Jarvis asks for the tap (the camera stays off)', async () => {
        await t.waitFor(async () => (await said(page)).some((s) => /Tap Look, and I.ll keep watching/.test(s)), { timeout: 20000, message: async () => `the ask for the tap (${JSON.stringify(await said(page))})` });
        t.assert((await t.count('optics')) === 0 && (await liveTracks(page)) === 0, 'the camera is not opened by voice on an iPhone');
        t.assert(liveReqs(t).length === 0 && t.requests('lead').length === 0, 'nothing was sent');
      });
      await t.step('the tap on Look: Optics opens over Voice Mode and the live view starts by itself', async () => {
        await page.locator(tid('voice-look')).click();
        await t.visible('optics');
        await waitLive(t);
        await waitOn(t, true, page, 'the live view to start after the tap');
        await waitRequests(t, 2);
        checkLiveRequest(t, liveReqs(t)[0], { width: 360, height: 640 });
      });
      await t.step('Voice Mode says the first line (once); the second within 15 s is only listed', async () => {
        await t.waitFor(async () => (await said(page)).some((s) => s.includes('Duracell AA')), { timeout: 20000, message: async () => `Voice Mode to say the line (${JSON.stringify(await said(page))})` });
        await t.waitFor(async () => (await t.count('optics-liveview-line')) === 2, { timeout: 10000, message: 'two lines listed' });
        await page.waitForTimeout(1000);
        const spoken = await said(page);
        t.assert(spoken.filter((s) => s.includes('Duracell AA')).length === 1, `said once (${JSON.stringify(spoken)})`);
        t.assert(!spoken.some((s) => s.includes('polarity')), `the second line only shown (${JSON.stringify(spoken)})`);
        t.assert(t.requests('lead').length === 0, 'the line Jarvis said was never heard as the owner\'s words (no turn)');
        await page.waitForTimeout(300);
        await shot(t, 'iphone13-live-view');
      });
      await t.step('the keys fit: portrait and held sideways', async () => {
        await checkKeys(t, 'iPhone 13 portrait');
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(500);
        await checkKeys(t, 'iPhone 13 sideways');
        await shot(t, 'iphone13-live-view-sideways');
        await page.setViewportSize({ width: 320, height: 568 });
        await page.waitForTimeout(500);
        await checkKeys(t, '320 px phone');
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(400);
      });
      await t.step('"that\'s enough" (Voice Mode, through Optics\' mic): stopped, no look after', async () => {
        await t.waitFor(async () => !(await page.evaluate(() => !!document.querySelector('[data-testid="optics-mic"][aria-pressed="true"]'))), { timeout: 30000, message: 'Voice Mode to stop listening' });
        await page.evaluate(() => window.__voice.queue.push("That's enough."));
        await page.locator(tid('optics-mic')).click();
        await waitOn(t, false, page, '"that\'s enough" to stop the live view');
        await noMoreLooks(t, 'stopped by voice', 3000);
        t.assert((await liveTracks(page)) === 1, 'the camera stays on (Optics is still open)');
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      });
    },
  },
  {
    name: 'optics-live-voice-mac',
    title: 'Live view by voice on a Mac (Voice Mode, the camera allowed): "keep watching" with Optics closed opens it over Voice Mode and the live view starts by itself; the LIVE pill turns it all off',
    device: 'mac',
    timeout: 90000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = ['Keep watching.'];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { scene: SCENE });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('optics', { timeout: 20000, message: 'Optics to open by voice (the camera is allowed on this Mac)' });
      await waitLive(t);
      await waitOn(t, true, page, 'the live view to start by itself once the camera is live');
      await waitRequests(t, 2);
      t.assert(t.requests('lead').length === 0, 'the words were not sent to Jarvis');
      await t.waitFor(async () => (await said(page)).some((s) => /^Live view on\./.test(s)), { timeout: 15000, message: async () => `Voice Mode to say the live view is on (${JSON.stringify(await said(page))})` });
      t.assert((await t.count('voice-mode')) === 1, 'Voice Mode stays open underneath');
      // The LIVE pill: Optics closes, the live view stops, the camera is released.
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      t.assert((await liveVideoTracks(page)) === 0, `the camera is released (${await liveVideoTracks(page)} live video tracks)`);
      await noMoreLooks(t, 'Optics closed', 2500);
    },
  },
  {
    name: 'optics-live-cap',
    title: 'Live view at the $1-an-hour limit: from 90¢ one look every 5 s; paused at $1 with the time it can go on; a reload keeps the spend; Resume works from then',
    device: 'mac',
    timeout: 150000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { costUsd: 0.02 });
      await t.goto('/?optics=1');
      await waitLive(t);
      // 95¢ spent this hour (another tab, a live view just before): it falls out of the hour in 30 s.
      await seedSpend(page, [{ agoMs: 3600000 - 30000, usd: 0.95 }]);
      await t.step('from 90 cents: one look every 5 s, then paused at $1 with the time it can go on', async () => {
        await page.locator(tid('optics-liveview-toggle')).click();
        await waitOn(t, true);
        t.assert(/95¢ this hour/.test(await meterText(t)), `the hour's spend from the other tab (${await meterText(t)})`);
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'cap', { timeout: 20000, message: async () => `the pause at $1 (${liveReqs(t).length} looks, ${await meterText(t)})` });
        const times = liveTimes(t);
        t.note(`looks before the limit: ${times.length}, gaps ${times.slice(1).map((x, i) => x - times[i]).join(', ')} ms`);
        t.assert(times.length === 2, `two looks of 2¢ fit under $1 (${times.length})`);
        for (let i = 1; i < times.length; i++) t.assert(times[i] - times[i - 1] >= 4800, `one look every 5 s from 90 cents (gap ${times[i] - times[i - 1]} ms)`);
        const note = await noteText(t);
        t.assert(/^Live view paused: it has spent \$1 in the last hour\. It can go on at \d{1,2}:\d{2}\s?(AM|PM)\.$/.test(note), `the note (${note})`);
        // The minute named is one Resume already works at: rounded up (2:40:30 reads 2:41 PM, never 2:40 PM).
        const named = await page.evaluate(() => {
          const text = document.querySelector('[data-testid="optics-liveview-note"]').textContent;
          const at = Number(document.querySelector('[data-testid="optics-liveview-resume"]').dataset.resumeAt);
          const m = /(\d{1,2}):(\d{2})\s?(AM|PM)/.exec(text);
          if (!m || !Number.isFinite(at) || at <= 0) return { text, at, diff: null };
          const d = new Date(at);
          let shown = new Date(d.getFullYear(), d.getMonth(), d.getDate(), (Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0), Number(m[2])).getTime();
          if (shown - at < -12 * 3600000) shown += 24 * 3600000; // over midnight
          return { text, at, diff: shown - at };
        });
        t.assert(named.diff !== null && named.diff >= 0 && named.diff < 60000, `the time named is the next whole minute from when Resume works (${JSON.stringify(named)})`);
        t.assert(await page.locator(tid('optics-liveview-resume')).isVisible(), 'a Resume button');
        t.assert(await page.locator(tid('optics-liveview-resume')).isDisabled(), 'which works only from then');
        t.assert(/99¢ this hour/.test(await meterText(t)), `the meter (${await meterText(t)})`);
        // Paused for up to an hour: nothing says Jarvis is watching (no caption of the scene; the pill says paused).
        t.assert(!(await page.locator(tid('optics-liveview-caption')).isVisible()), 'no caption of the scene while paused at the limit');
        t.assert((await t.text(page.locator('.optics-pill-text'))) === 'VIEW PAUSED', `the pill reads LIVE VIEW PAUSED (${await t.text(page.locator('.optics-pill-text'))})`);
        t.assert(/^Live view is paused/.test(await page.locator(tid('optics-live-pill')).getAttribute('aria-label')), 'and says so to a screen reader');
        await shot(t, 'mac-live-view-cap');
        await noMoreLooks(t, 'paused at the limit', 2500);
      });
      await t.step('a reload keeps the spend: the live view starts paused at the limit', async () => {
        await t.reload();
        await t.waitFor(async () => (await t.count('optics')) === 1, { timeout: 8000, message: 'Optics after the reload' });
        await waitLive(t);
        const before = liveReqs(t).length;
        await page.locator(tid('optics-liveview-toggle')).click();
        await waitOn(t, true);
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'cap', { timeout: 5000, message: 'paused at the limit after the reload' });
        t.assert(liveReqs(t).length === before, 'no look past the limit after the reload');
        t.assert(/99¢ this hour/.test(await meterText(t)), `the spend survived the reload (${await meterText(t)})`);
      });
      await t.step('when the 95¢ leaves the hour: Resume works, one look a second again', async () => {
        await t.waitFor(async () => !(await page.locator(tid('optics-liveview-resume')).isDisabled()), { timeout: 40000, message: 'Resume to work' });
        const before = liveReqs(t).length;
        await page.locator(tid('optics-liveview-resume')).click();
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === '', { timeout: 5000, message: 'resumed' });
        await waitRequests(t, before + 3);
        const times = liveTimes(t).slice(before);
        for (let i = 1; i < times.length; i++) t.assert(times[i] - times[i - 1] < 3000, `back to about one a second (gap ${times[i] - times[i - 1]} ms)`);
        await page.keyboard.press('Escape');
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      });
    },
  },
  {
    name: 'optics-live-hidden',
    title: 'Live view with slow replies (1.5 s) on an iPhone: never two looks in flight; hidden while one is under way, it stops, the camera is released and nothing is sent after',
    device: 'iphone13',
    timeout: 90000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { delayMs: 1500 });
      await t.goto('/');
      await (await t.visible('composer-camera')).click();
      await t.visible('optics');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, true);
      await waitRequests(t, 3, 20000);
      const times = liveTimes(t);
      for (let i = 1; i < times.length; i++) t.assert(times[i] - times[i - 1] >= 1450, `one look in flight at a time (gap ${times[i] - times[i - 1]} ms with 1.5 s replies)`);
      // Hide while a look is under way.
      await t.waitFor(() => liveReqs(t).some((r) => r.outcome === 'pending' || (r.status === 200 && r.outcome !== 'ok')), { timeout: 5000, interval: 50, message: 'a look in flight' }).catch(() => {});
      await setHidden(page, true);
      await page.waitForTimeout(300);
      t.assert((await liveTracks(page)) === 0, 'the camera is released');
      t.assert((await attr(page, 'liveview')) === 'off', 'the live view stopped (not paused)');
      await noMoreLooks(t, 'hidden', 4000);
      // A look sent and then given up may still be billed: the hour counts its estimate, and so does
      // the month (Settings → Spending), so the two agree (only live looks were spent here).
      const money = await page.evaluate(() => {
        const now = Date.now();
        let list = [];
        try {
          list = JSON.parse(localStorage.getItem('jarvis.liveView.spend') || '[]');
        } catch {
          list = [];
        }
        const hour = (Array.isArray(list) ? list : []).filter((e) => now - Number(e.t) < 3600000).reduce((x, e) => x + (Number(e.usd) || 0), 0);
        let month = 0;
        try {
          month = Number(JSON.parse(localStorage.getItem('jarvis.spend.v1') || 'null').monthUsd) || 0;
        } catch {
          month = 0;
        }
        return { hour, month };
      });
      t.note(`hour $${money.hour.toFixed(6)}, month $${money.month.toFixed(6)} (${liveReqs(t).map((r) => r.outcome).join(', ')})`);
      t.assert(Math.abs(money.hour - money.month) < 2e-5, `the month counts the look given up as the hour does (hour $${money.hour.toFixed(6)}, month $${money.month.toFixed(6)})`);
      await setHidden(page, false);
      await page.waitForTimeout(1500);
      t.assert((await attr(page, 'liveview')) === 'off', 'shown again, it does not start by itself');
      t.assert((await liveTracks(page)) === 0, 'iPhone: the camera waits for a tap');
      await noMoreLooks(t, 'shown again', 1500);
    },
  },
  {
    name: 'optics-live-ratelimit',
    title: 'Live view and the Anthropic speed limit: a 429 with retry-after 3 s, then a 529: the note, the waits, never a tight loop; the note goes when a look succeeds; offline it pauses and goes on when back',
    device: 'mac',
    timeout: 90000,
    allowConsole: NETWORK_NOISE,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { errors: { 3: { status: 429, retryAfter: 3 }, 4: { status: 529 } } });
      await t.goto('/?optics=1');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, true);
      await waitRequests(t, 3);
      await t.waitFor(async () => /^Looking less often: your Anthropic account.s speed limit\.$/.test(await noteText(t)), { timeout: 5000, message: async () => `the speed-limit note ("${await noteText(t)}")` });
      await shot(t, 'mac-live-view-ratelimit');
      await waitRequests(t, 5, 30000);
      const reqs = liveReqs(t);
      const times = reqs.map((r) => Date.parse(r.time));
      t.assert(reqs[2].status === 429 && reqs[3].status === 529, `scripted: 429 then 529 (${reqs.map((r) => r.status).join(', ')})`);
      t.assert(times[3] - times[2] >= 2900, `retry-after 3 s honoured (${times[3] - times[2]} ms)`);
      t.assert(times[4] - times[3] >= 1900, `a 529 without retry-after waits at least 2 s (${times[4] - times[3]} ms)`);
      t.note(`gaps: ${times.slice(1).map((x, i) => x - times[i]).join(', ')} ms`);
      await t.waitFor(async () => (await noteText(t)) === '', { timeout: 5000, message: 'the note to go once a look succeeds' });
      t.assert((await attr(page, 'liveview')) === 'on', 'still on');
      await t.step('offline: paused with a note, no look; back online: it goes on', async () => {
        await page.context().setOffline(true);
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'offline', { timeout: 5000, message: 'the offline pause' });
        t.assert(/offline/i.test(await noteText(t)), `the note (${await noteText(t)})`);
        await page.waitForTimeout(300);
        await noMoreLooks(t, 'offline', 2500);
        await page.context().setOffline(false);
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === '', { timeout: 5000, message: 'on again once online' });
        await waitRequests(t, liveReqs(t).length + 2);
      });
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
  {
    name: 'optics-live-look',
    title: 'A question during the live view (iPhone 13): a Look on the main model with the newest frame; the looks pause meanwhile; Live resumes them; the Look\'s cost counts in the hour',
    device: 'iphone13',
    timeout: 120000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { costUsd: 0.0001 });
      await t.goto('/');
      await (await t.visible('composer-camera')).click();
      await t.visible('optics');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, true);
      await waitRequests(t, 2);
      const spentBefore = await spentOf(page);
      await page.locator(tid('optics-ask')).fill('What brand is this battery?');
      await page.locator(tid('optics-ask')).press('Enter');
      await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'look', { timeout: 5000, message: 'the live view to pause for the Look' });
      t.assert(/^Paused while you look at this$/.test(await noteText(t)), `the note (${await noteText(t)})`);
      const atLook = liveReqs(t).length;
      await waitAnswer(t);
      const look = lastLook(t);
      t.assert(look && look.req.body.model === 'claude-opus-5-5', `a Look on the main model (${look && look.req.body.model})`);
      t.assert(look.message.content.at(-1).text === 'What brand is this battery?', 'with the question');
      await page.waitForTimeout(2500);
      t.assert(liveReqs(t).length <= atLook + 1, `no live look while the Look is on screen (${liveReqs(t).length - atLook} more; one may have been under way)`);
      await shot(t, 'iphone13-live-view-look');
      const costText = await t.text(page.locator(tid('optics-answer-cost')));
      const m = /([\d.]+)¢/.exec(costText);
      const lookUsd = m ? Number(m[1]) / 100 : 0;
      t.assert(lookUsd > 0, `the Look's cost (${costText})`);
      const spentAfter = await spentOf(page);
      t.note(`hour's spend ${spentBefore.toFixed(4)} → ${spentAfter.toFixed(4)}; the Look ${costText}`);
      t.assert(spentAfter - spentBefore >= lookUsd * 0.85, `the Look's cost counts in the hour (${spentBefore} → ${spentAfter}, Look ${lookUsd})`);
      const before = liveReqs(t).length;
      await page.locator(tid('optics-live')).click();
      await t.waitFor(async () => (await attr(page, 'liveview-paused')) === '', { timeout: 5000, message: 'Live to resume the live view' });
      await waitRequests(t, before + 2);
      t.assert((await attr(page, 'liveview')) === 'on', 'still on');
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      t.assert((await liveTracks(page)) === 0, 'the camera is released');
    },
  },
  {
    name: 'optics-live-hour',
    title: 'Live view stops by itself at the end of its session (shortened to 8 s here) and says so; Live view starts it again',
    device: 'iphone13',
    timeout: 90000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page, { devOptics: { liveSessionMs: 8000 } });
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, {});
      await t.goto('/');
      await (await t.visible('composer-camera')).click();
      await t.visible('optics');
      await waitLive(t);
      const started = Date.now();
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, true);
      await t.waitFor(async () => (await attr(page, 'liveview')) === 'off', { timeout: 15000, message: 'the live view to stop by itself' });
      const ms = Date.now() - started;
      t.assert(ms >= 7500 && ms <= 11000, `it ran for its session (${ms} ms)`);
      t.assert((await noteText(t)) === 'Live view stopped after 8 seconds. Tap Live view to keep going.', `says so (${await noteText(t)})`);
      t.assert(await page.locator(tid('optics-liveview')).isVisible(), 'the note stays on screen');
      t.assert((await liveTracks(page)) === 1, 'the camera stays on');
      await noMoreLooks(t, 'after the session', 2500);
      await shot(t, 'iphone13-live-view-hour');
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, true, page, 'Live view to start again');
      await waitRequests(t, liveReqs(t).length + 1);
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
  {
    name: 'optics-live-watch',
    title: 'Live view and Watch never run together: starting Watch stops the live view, starting the live view stops Watch; "stop watching" stops the live view',
    device: 'mac',
    timeout: 90000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page, { devOptics: { minIntervalMs: 4000, sessionMs: 60000 } });
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, {});
      await t.goto('/?optics=1');
      await waitLive(t);
      const watchReqs = () => t.requests().filter((r) => r.body && typeof r.body === 'object' && isWatchRequest(r.body)).length;
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, true);
      await waitRequests(t, 2);
      await page.locator(tid('optics-watch-toggle')).click();
      await t.waitFor(async () => (await attr(page, 'watching')) === 'true', { timeout: 5000, message: 'Watch on' });
      t.assert((await attr(page, 'liveview')) === 'off', 'starting Watch stopped the live view');
      await noMoreLooks(t, 'Watch on', 2500);
      t.assert(watchReqs() >= 1, 'Watch looks');
      // "Keep watching" (or "watch me") while Watch is on means "go on": Watch goes on.
      const leadBefore = t.requests('lead').length;
      await page.locator(tid('optics-ask')).fill('Keep watching');
      await page.locator(tid('optics-ask')).press('Enter');
      await page.waitForTimeout(1500);
      t.assert((await attr(page, 'watching')) === 'true' && (await attr(page, 'liveview')) === 'off', `"keep watching" leaves Watch on (watching ${await attr(page, 'watching')}, live view ${await attr(page, 'liveview')})`);
      t.assert(t.requests('lead').length === leadBefore, 'and sends nothing to Jarvis');
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, true, page, 'the live view');
      t.assert((await attr(page, 'watching')) === 'false', 'starting the live view stopped Watch');
      const w = watchReqs();
      await waitRequests(t, liveReqs(t).length + 2);
      t.assert(watchReqs() === w, 'no Watch frame while the live view is on');
      await page.evaluate(() => window.__voice.queue.push('Stop watching.'));
      await page.locator(tid('optics-mic')).click();
      await waitOn(t, false, page, '"stop watching" to stop the live view');
      await noMoreLooks(t, 'stopped by "stop watching"', 2500);
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
];
