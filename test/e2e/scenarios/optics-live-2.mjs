// Optics' live view (v8.0), second set: the money, voice and phone cases found in review (each
// failed on bc1ea5d), against the fake camera and the strict mock's live answers:
//
//   optics-live-look-early      iPhone 13: a question during the live view, then Live, the LIVE pill
//                               (Optics closed) or Tell me more + Live before its answer ends: its
//                               cost still reaches the hour's $1 (it is billed: the answer goes on in
//                               the chat)
//   optics-live-voice-hologram  Mac, Voice Mode, a hologram on screen: "keep watching" stays with
//                               Jarvis, as "what am I looking at?" does: the camera stays off
//   optics-live-voice-cap       Mac, Voice Mode, the hour's $1 already spent: "live view" opens
//                               Optics, and Jarvis says the pause at the limit, never "Live view on";
//                               the meter reads "$1.00 this hour", never "100¢"
//   optics-live-voice-busy      Mac, Voice Mode, the camera held by another app: Jarvis says so,
//                               never "Live view on"
//   optics-live-voice-words     Mac, Voice Mode over Optics: "live view" after a question goes back
//                               to Live (not "I'm already watching"); "show me the live view" and
//                               "resume live view" start it; "go live" is the camera's
//   optics-live-voice-notices   Mac, Voice Mode, a session shortened to 8 s: the pause at the limit
//                               and the end of the session are said aloud, not only shown
//   optics-live-bell            Mac, replies not read aloud: the notify cue at most once every 15 s,
//                               never while the owner talks into Optics' mic
//   optics-live-bell-voice      Mac, Voice Mode over Optics: a line held back (Jarvis or the owner
//                               speaking, the 15 s gap) is only shown: no bell over either of them
//   optics-live-mic             Mac, replies read aloud: Optics' mic stops Jarvis's line before it
//                               listens (the speakerphone would hear him)
//   optics-live-tap             Mac, Voice Mode, Continuous off: a live line never takes the owner's
//                               tap to talk; the question they ask after the tap goes out
//   optics-live-phone-panel     iPhone 13 portrait, sideways and 320 px, five long lines: the panel and
//                               the caption leave most of the picture clear; a tap shows the five
// Screenshots also go to $OPTICS_SHOTS (default test/artifacts/optics-shots/).

import { tid } from '../harness.mjs';
import { configureLive, isLiveRequest } from '../../mock/optics.mjs';
import { installFakeSpeech } from './features.mjs';
import { cameraArgs, instrument, liveTracks, shot, waitAnswer, waitLive } from './optics.mjs';

// configureLive({ costUsd: 0.0001 }): 1,000 input tokens + 1 output token on Claude Haiku 5.5.
const LIVE_LOOK_USD = 1000 * 0.1e-6 + 1 * 0.5e-6;

const liveReqs = (t) => t.requests().filter((r) => r.body && typeof r.body === 'object' && isLiveRequest(r.body));
const attr = (page, name) => page.locator(tid('optics')).getAttribute(`data-${name}`);
const said = (page) => page.evaluate(() => (window.__voice ? window.__voice.said.slice() : []));
const noteText = async (page) => ((await page.locator(tid('optics-liveview-note')).textContent()) || '').trim();
const meterText = async (page) => ((await page.locator(tid('optics-liveview-meter')).textContent()) || '').replace(/\s+/g, ' ').trim();
const videoTracks = (page) => page.evaluate(() => (window.__opticsTracks || []).filter((x) => x.track.kind === 'video' && x.track.readyState === 'live').length);

const quiet = (summary = 'A desk with a coffee mug, an AA battery and a pothos.') => ({ summary, worth_saying: false, line: '' });
const talk = (line, summary = 'The owner holds something up to the camera.') => ({ summary, worth_saying: true, line });

/** The hour's spending as stored (every entry of the last 60 minutes). */
const hourSpend = (page) =>
  page.evaluate(() => {
    const now = Date.now();
    let list = [];
    try {
      list = JSON.parse(localStorage.getItem('jarvis.liveView.spend') || '[]');
    } catch {
      list = [];
    }
    return (Array.isArray(list) ? list : []).filter((e) => now - Number(e.t) < 3600000).reduce((s, e) => s + (Number(e.usd) || 0), 0);
  });

/** The month's spending (Settings → Spending). */
const monthSpend = (page) =>
  page.evaluate(() => {
    try {
      return Number(JSON.parse(localStorage.getItem('jarvis.spend.v1') || 'null').monthUsd) || 0;
    } catch {
      return 0;
    }
  });

async function waitOn(t, page, on, message) {
  await t.waitFor(async () => (await attr(page, 'liveview')) === (on ? 'on' : 'off'), { timeout: 15000, message: message || `the live view to be ${on ? 'on' : 'off'}` });
}

async function waitRequests(t, n, timeout = 15000) {
  await t.waitFor(() => liveReqs(t).length >= n, { timeout, message: () => `${n} live looks (${liveReqs(t).length} so far)` });
}

/** Voice Mode is not listening and not speaking: a tap on Optics' mic starts a listen. */
async function voiceIdle(t, page) {
  await t.waitFor(
    async () => {
      const st = await page.evaluate(() => {
        const vm = document.querySelector('[data-testid="voice-mode"]');
        return { state: vm ? vm.getAttribute('data-state') : '', speaking: !!(window.speechSynthesis && window.speechSynthesis.speaking), mic: !!document.querySelector('[data-testid="optics-mic"][aria-pressed="true"]') };
      });
      return st.state === 'idle' && !st.speaking && !st.mic;
    },
    { timeout: 30000, message: 'Voice Mode to be idle' },
  );
}

/** The owner says `words` through Optics' mic (Voice Mode over Optics). */
async function sayInOptics(t, page, words) {
  await voiceIdle(t, page);
  await page.evaluate((w) => window.__voice.queue.push(w), words);
  await page.locator(tid('optics-mic')).click();
}

/** What Jarvis says after `n` things said so far (waits for at least one more). */
async function nextSaid(t, page, n, what) {
  await t.waitFor(async () => (await said(page)).length > n, { timeout: 20000, message: async () => `Jarvis to answer ${what} (${JSON.stringify((await said(page)).slice(n))})` });
  await page.waitForTimeout(600);
  return (await said(page)).slice(n);
}

// Every notify cue (the only sound with an E7 bell, 2637.02 Hz), with performance.now().
function recordNotify() {
  window.__notify = [];
  const orig = AudioParam.prototype.setValueAtTime;
  AudioParam.prototype.setValueAtTime = function (v, at) {
    if (typeof v === 'number' && Math.abs(v - 2637.02) < 0.01) window.__notify.push(performance.now());
    return orig.call(this, v, at);
  };
}

/** Asks a question in Optics' box with the Look's answer streamed slowly; resolves once it is under way. */
async function askSlowly(t, page, question) {
  const leadBefore = t.requests('lead').length;
  t.mock.timeScale = 12;
  await page.locator(tid('optics-ask')).fill(question);
  await page.locator(tid('optics-ask')).press('Enter');
  await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'look', { timeout: 8000, message: 'the live view to pause for the Look' });
  await t.waitFor(() => t.requests('lead').slice(leadBefore).some((r) => r.outcome === 'pending'), { timeout: 8000, message: 'the Look request to be streaming' });
}

async function waitLookTurnDone(t, page) {
  t.mock.timeScale = 1;
  const turn = page.locator(tid('turn-jarvis')).last();
  await t.waitForTurn(turn, ['done'], { timeout: 60000 });
  await page.waitForTimeout(1500);
  return t.text(turn.locator(tid('turn-stats')));
}

export default [
  {
    name: 'optics-live-look-early',
    title: 'A question during the live view, then Live, the LIVE pill or Tell me more + Live before its answer ends: its cost still counts in the hour (iPhone 13)',
    device: 'iphone13',
    timeout: 240000,
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
      await waitOn(t, page, true);
      await waitRequests(t, 2);
      await t.step('Live tapped while the answer is still coming: the Look still counts in the hour', async () => {
        const h0 = await hourSpend(page);
        const m0 = await monthSpend(page);
        const n0 = liveReqs(t).length;
        await askSlowly(t, page, 'What brand is this battery?');
        await page.locator(tid('optics-live')).click();
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === '', { timeout: 5000, message: 'Live to resume the live view' });
        const stats = await waitLookTurnDone(t, page);
        const h1 = await hourSpend(page);
        const m1 = await monthSpend(page);
        const n1 = liveReqs(t).length;
        const look = m1 - m0 - (n1 - n0) * LIVE_LOOK_USD;
        t.note(`Live before the answer ended: the chat turn "${stats}"; the Look ≈ $${look.toFixed(5)}; hour +$${(h1 - h0).toFixed(5)} (${n1 - n0} live looks)`);
        t.assert(look > 0.005, `the Look was billed (≈ $${look.toFixed(5)}, chat "${stats}")`);
        t.assert(h1 - h0 >= Math.max(0, n1 - n0 - 1) * LIVE_LOOK_USD + look * 0.85, `the Look counts in the hour: +$${(h1 - h0).toFixed(5)} for ${n1 - n0} live looks and a Look of ≈ $${look.toFixed(5)}`);
      });
      await t.step('the LIVE pill (Optics closed) while the answer is still coming: the Look still counts', async () => {
        await waitRequests(t, liveReqs(t).length + 1);
        const h0 = await hourSpend(page);
        const m0 = await monthSpend(page);
        const n0 = liveReqs(t).length;
        await askSlowly(t, page, 'What brand is this battery?');
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
        const stats = await waitLookTurnDone(t, page);
        const h1 = await hourSpend(page);
        const m1 = await monthSpend(page);
        const n1 = liveReqs(t).length;
        const look = m1 - m0 - (n1 - n0) * LIVE_LOOK_USD;
        t.note(`LIVE pill before the answer ended: the chat turn "${stats}"; the Look ≈ $${look.toFixed(5)}; hour +$${(h1 - h0).toFixed(5)}`);
        t.assert(look > 0.005 && h1 - h0 >= look * 0.85, `the Look counts in the hour although Optics closed: +$${(h1 - h0).toFixed(5)} for a Look of ≈ $${look.toFixed(5)}`);
        t.assert((await liveTracks(page)) === 0, 'the camera is released');
      });
      await t.step('Tell me more, then Live before its answer ends: the follow-up counts too', async () => {
        await (await t.visible('composer-camera')).click();
        await t.visible('optics');
        await waitLive(t);
        await page.locator(tid('optics-liveview-toggle')).click();
        await waitOn(t, page, true);
        await waitRequests(t, liveReqs(t).length + 1);
        await page.locator(tid('optics-ask')).fill('What brand is this battery?');
        await page.locator(tid('optics-ask')).press('Enter');
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'look', { timeout: 8000, message: 'the live view to pause for the Look' });
        await waitAnswer(t);
        await page.waitForTimeout(1500);
        const h0 = await hourSpend(page);
        const m0 = await monthSpend(page);
        const n0 = liveReqs(t).length;
        const leadBefore = t.requests('lead').length;
        t.mock.timeScale = 12;
        await page.locator(tid('optics-more')).click();
        await t.waitFor(() => t.requests('lead').slice(leadBefore).some((r) => r.outcome === 'pending'), { timeout: 8000, message: 'the follow-up to be streaming' });
        await page.locator(tid('optics-live')).click();
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === '', { timeout: 5000, message: 'Live to resume the live view' });
        const stats = await waitLookTurnDone(t, page);
        const h1 = await hourSpend(page);
        const m1 = await monthSpend(page);
        const n1 = liveReqs(t).length;
        const more = m1 - m0 - (n1 - n0) * LIVE_LOOK_USD;
        t.note(`Tell me more, then Live: the chat turn "${stats}"; the follow-up ≈ $${more.toFixed(5)}; hour +$${(h1 - h0).toFixed(5)} (${n1 - n0} live looks)`);
        t.assert(more > 0.001, `the follow-up was billed (≈ $${more.toFixed(5)})`);
        t.assert(h1 - h0 >= Math.max(0, n1 - n0 - 1) * LIVE_LOOK_USD + more * 0.85, `the follow-up counts in the hour: +$${(h1 - h0).toFixed(5)} for ${n1 - n0} live looks and ≈ $${more.toFixed(5)}`);
        await page.locator(tid('optics-live-pill')).click();
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
      });
    },
  },
  {
    name: 'optics-live-voice-hologram',
    title: 'Voice Mode on a Mac with a hologram on screen: "keep watching" stays with Jarvis, as "what am I looking at?" does (the camera stays off)',
    device: 'mac',
    timeout: 180000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 40 });
      await page.addInitScript(() => {
        window.__voice.queue = ['[[hologram:battery]] Show me an AA battery'];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { scene: [quiet()], costUsd: 0.0002 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('hologram-viewer', { timeout: 40000, message: 'the hologram viewer over Voice Mode' });
      await t.waitFor(async () => (await page.locator(tid('hologram-viewer')).getAttribute('data-state')) === 'ready', { timeout: 60000, message: 'the hologram to be built' });
      await t.waitFor(async () => (await said(page)).some((s) => /tap any part/.test(s)), { timeout: 40000, message: 'the reply to be said' });
      await t.waitFor(async () => !(await page.evaluate(() => window.speechSynthesis.speaking)), { timeout: 30000, message: 'Jarvis to finish speaking' });
      await page.waitForTimeout(500);
      const leadBefore = t.requests('lead').length;
      await page.evaluate(() => window.__voice.queue.push('Keep watching.'));
      await t.waitFor(async () => (await t.count('optics')) > 0 || t.requests('lead').length > leadBefore, { timeout: 30000, message: 'something to happen for "keep watching"' });
      await page.waitForTimeout(3000);
      const obs = { opticsOpen: await t.count('optics'), videoTracks: await videoTracks(page), liveLooks: liveReqs(t).length, hologramOpen: await t.count('hologram-viewer'), leadTurnsSince: t.requests('lead').length - leadBefore };
      t.note(`"keep watching" over the hologram: ${JSON.stringify(obs)}`);
      await shot(t, 'mac-live-view-voice-hologram');
      t.assert(obs.opticsOpen === 0 && obs.videoTracks === 0 && obs.liveLooks === 0, `the camera stays off with a hologram on screen (${JSON.stringify(obs)})`);
      t.assert(obs.leadTurnsSince >= 1, `the words went to Jarvis, as "what am I looking at?" does (${JSON.stringify(obs)})`);
      t.assert(obs.hologramOpen === 1, 'the hologram stays on screen');
    },
  },
  {
    name: 'optics-live-voice-cap',
    title: 'Voice Mode on a Mac, the hour\'s $1 already spent: "live view" opens Optics, and Jarvis says the pause at the limit, never "Live view on"; the meter reads $1.00',
    device: 'mac',
    timeout: 90000,
    settings: { voiceContinuous: false },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 18 });
      await page.addInitScript(() => {
        window.__voice.queue = ['Live view.'];
        // $0.9999 spent 10 minutes ago (another tab's live view): no look fits under $1 now.
        localStorage.setItem('jarvis.liveView.spend', JSON.stringify([{ t: Date.now() - 600000, usd: 0.9999 }]));
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { costUsd: 0.002 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('optics', { timeout: 20000, message: 'Optics to open by voice' });
      await waitLive(t);
      await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'cap', { timeout: 10000, message: 'the pause at the limit' });
      await t.waitFor(async () => (await said(page)).some((s) => /\$1/.test(s)), { timeout: 15000, message: async () => `Jarvis to say the pause (${JSON.stringify(await said(page))})` });
      await page.waitForTimeout(1500);
      const spoken = await said(page);
      const note = await noteText(page);
      const meter = await meterText(page);
      t.note(`said ${JSON.stringify(spoken)}; note "${note}"; meter "${meter}"`);
      await shot(t, 'mac-live-view-voice-cap');
      t.assert(!spoken.some((s) => /^Live view on/.test(s)), `never "Live view on" while it is paused at the limit (${JSON.stringify(spoken)})`);
      const all = spoken.join(' ');
      t.assert(/Live view paused: it has spent \$1 in the last hour\./.test(all) && /It can go on at \d{1,2}:\d{2}\s?(AM|PM)\./.test(all), `Jarvis says the pause and when it can go on (${JSON.stringify(spoken)})`);
      t.assert(spoken.filter((s) => /Live view paused/.test(s)).length === 1, `said once (${JSON.stringify(spoken)})`);
      t.assert(liveReqs(t).length === 0, `no look past the limit (${liveReqs(t).length})`);
      t.assert(/ \$1\.00 this hour · limit \$1$/.test(meter), `the meter reads $1.00, never 100¢ (${meter})`);
      t.assert(!(await page.locator(tid('optics-liveview-caption')).isVisible()), 'no caption while it is paused');
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
  {
    name: 'optics-live-voice-busy',
    title: 'Voice Mode on a Mac whose camera another app holds: "live view" is answered with why, never "Live view on"',
    device: 'mac',
    timeout: 90000,
    settings: { voiceContinuous: false },
    allowConsole: [/NotReadableError|Could not start video source|camera|getUserMedia/i],
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 18 });
      await page.addInitScript(() => {
        window.__voice.queue = ['Live view.'];
        const md = navigator.mediaDevices;
        const orig = md.getUserMedia.bind(md);
        // A video call holds the camera: Chrome's NotReadableError. The microphone works.
        md.getUserMedia = (c) => (c && c.video ? Promise.reject(new DOMException('Could not start video source', 'NotReadableError')) : orig(c));
      });
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, {});
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('optics', { timeout: 20000, message: 'Optics to open by voice' });
      await t.waitFor(async () => (await said(page)).some((s) => /camera/i.test(s)), { timeout: 15000, message: async () => `Jarvis to say why (${JSON.stringify(await said(page))})` });
      await page.waitForTimeout(1500);
      const spoken = await said(page);
      t.note(`said ${JSON.stringify(spoken)}`);
      t.assert(!spoken.some((s) => /^Live view on/.test(s)), `never "Live view on" when the camera couldn't start (${JSON.stringify(spoken)})`);
      t.assert(spoken.some((s) => /The camera is in use by another app/.test(s)), `Jarvis says the camera is in use (${JSON.stringify(spoken)})`);
      t.assert(liveReqs(t).length === 0 && (await attr(page, 'liveview')) !== 'on', 'nothing is watched');
    },
  },
  {
    name: 'optics-live-voice-words',
    title: 'Voice Mode over Optics on a Mac: "live view" after a question goes back to Live; "show me the live view" and "resume live view" start it; "go live" is the camera\'s',
    device: 'mac',
    timeout: 180000,
    settings: { voiceContinuous: false },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 22 });
      await page.addInitScript(() => {
        window.__voice.queue = ['Keep watching.'];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { scene: [quiet()], costUsd: 0.0002 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('optics', { timeout: 20000, message: 'Optics to open by voice' });
      await waitLive(t);
      await waitOn(t, page, true, 'the live view to start by voice');
      await t.waitFor(async () => (await said(page)).some((s) => /^Live view on\./.test(s)), { timeout: 15000, message: async () => `"Live view on" once it is (${JSON.stringify(await said(page))})` });
      await waitRequests(t, 2);
      await t.step('"live view" after a question: back to Live, and the looks go on (never "I\'m already watching" while paused)', async () => {
        await sayInOptics(t, page, 'What am I looking at?');
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'look', { timeout: 15000, message: 'paused for the Look' });
        t.assert((await t.text(page.locator('.optics-pill-text'))) === 'VIEW PAUSED', `the pill says it is paused (${await t.text(page.locator('.optics-pill-text'))})`);
        await waitAnswer(t);
        await voiceIdle(t, page); // the Look's answer said first: only what comes after the words counts
        const n = (await said(page)).length;
        const before = liveReqs(t).length;
        await sayInOptics(t, page, 'Live view.');
        const reply = await nextSaid(t, page, n, '"live view"');
        await t.waitFor(async () => (await attr(page, 'liveview-paused')) === '', { timeout: 5000, message: 'the live view to go on' });
        await waitRequests(t, before + 1, 8000);
        t.note(`"live view" after a question: ${JSON.stringify(reply)}`);
        t.assert(!reply.some((s) => /already watching/i.test(s)), `not "I'm already watching" (${JSON.stringify(reply)})`);
        t.assert(reply.some((s) => /^Back to the live view\.$/.test(s)), `says so (${JSON.stringify(reply)})`);
        t.assert((await attr(page, 'frozen')) !== 'true', 'the Look is put away');
      });
      for (const words of ['Show me the live view.', 'Resume live view.']) {
        await t.step(`"${words}" with the live view off: it starts`, async () => {
          await sayInOptics(t, page, 'Stop live view.');
          await waitOn(t, page, false, '"stop live view"');
          await voiceIdle(t, page);
          const n = (await said(page)).length;
          const before = liveReqs(t).length;
          await sayInOptics(t, page, words);
          const reply = await nextSaid(t, page, n, `"${words}"`);
          await waitOn(t, page, true, `"${words}" to start it`);
          await waitRequests(t, before + 1, 8000);
          t.note(`"${words}": ${JSON.stringify(reply)}`);
          t.assert(reply.some((s) => /^Live view on\./.test(s)), `"Live view on" (${JSON.stringify(reply)})`);
          t.assert(!reply.some((s) => /This is the live view/.test(s)), 'never "This is the live view." while nothing starts');
        });
      }
      await t.step('"go live" with the camera live: the camera\'s words, never a claim about the live view', async () => {
        await voiceIdle(t, page);
        const n = (await said(page)).length;
        await sayInOptics(t, page, 'Go live.');
        const reply = await nextSaid(t, page, n, '"go live"');
        t.note(`"go live": ${JSON.stringify(reply)}`);
        t.assert(reply.some((s) => /^This is the camera\.$/.test(s)), `"This is the camera." (${JSON.stringify(reply)})`);
        t.assert((await attr(page, 'liveview')) === 'on', 'the live view goes on');
      });
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
  {
    name: 'optics-live-voice-notices',
    title: 'Voice Mode on a Mac (a session shortened to 8 s): the pause at the hour\'s $1 and the end of the session are said aloud, not only shown',
    device: 'mac',
    timeout: 90000,
    settings: { voiceContinuous: false },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 30 });
      await page.addInitScript(() => {
        window.__voice.queue = ['Keep watching.'];
        // 97¢ spent 10 minutes ago: one look of 2¢ fits, then the live view pauses at the limit.
        localStorage.setItem('jarvis.liveView.spend', JSON.stringify([{ t: Date.now() - 600000, usd: 0.97 }]));
      });
      await instrument(page, { devOptics: { liveSessionMs: 8000 } });
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { scene: [quiet()], costUsd: 0.02 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('optics', { timeout: 20000, message: 'Optics to open by voice' });
      await waitLive(t);
      await waitOn(t, page, true, 'the live view to start by voice');
      await t.waitFor(async () => (await attr(page, 'liveview-paused')) === 'cap', { timeout: 15000, message: 'the pause at the limit' });
      await waitOn(t, page, false, 'the session to end by itself');
      await t.waitFor(async () => (await said(page)).some((s) => /^Live view stopped after 8 seconds/.test(s)), { timeout: 30000, message: async () => `the end said aloud (${JSON.stringify(await said(page))})` });
      const spoken = await said(page);
      t.note(`said ${JSON.stringify(spoken)}; note "${await noteText(page)}"`);
      t.assert(spoken.some((s) => /^Live view on\./.test(s)), 'it started');
      t.assert(spoken.some((s) => /Live view paused: it has spent \$1 in the last hour/.test(s)), `the pause at the limit said aloud (${JSON.stringify(spoken)})`);
      t.assert(spoken.filter((s) => /^Live view stopped after 8 seconds/.test(s)).length === 1, `the end said once (${JSON.stringify(spoken)})`);
      t.assert(liveReqs(t).length === 1, `one look fitted under $1 (${liveReqs(t).length})`);
    },
  },
  {
    name: 'optics-live-bell',
    title: 'Live view on a Mac with replies not read aloud: a worth-saying line rings the notify cue at most once every 15 s, never while the owner talks into Optics\' mic',
    device: 'mac',
    timeout: 120000,
    settings: { speakReplies: 'off' },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 14 });
      await page.addInitScript(recordNotify);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      const scene = [quiet(), quiet(), quiet()];
      for (let i = 1; i <= 40; i++) scene.push(talk(`Item number ${i} is a different thing again.`, `The owner shows item ${i}.`));
      configureLive(t.mock, { scene, costUsd: 0.0002 });
      await t.goto('/?optics=1');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, page, true);
      await t.waitFor(async () => (await t.count('optics-liveview-line')) >= 1, { timeout: 15000, message: 'a first line' });
      await page.waitForTimeout(6000);
      const first = await page.evaluate(() => window.__notify.map(Math.round));
      const lines = await t.count('optics-liveview-line');
      t.note(`bells ${JSON.stringify(first)} for ${lines} lines listed in about 6 s`);
      t.assert(first.length === 1, `one bell for the first line, none for the next ones within 15 s (${first.length} bells, ${lines} lines)`);
      // The owner talks into Optics' mic (about 4 s) while more lines arrive, past the 15 s.
      await page.waitForTimeout(Math.max(0, 15500 - 6000 - 4000));
      await page.evaluate(() =>
        window.__voice.queue.push({
          parts: [
            { at: 200, text: 'so what I wanted to ask', final: false },
            { at: 1200, text: 'is whether', final: false },
            { at: 2200, text: 'this one is', final: false },
            { at: 3200, text: 'the right size', final: false },
            { at: 4200, text: 'for the remote', final: true },
          ],
        }),
      );
      const tapAt = await page.evaluate(() => performance.now());
      await page.locator(tid('optics-mic')).click();
      await t.waitFor(async () => !(await page.evaluate(() => !!document.querySelector('[data-testid="optics-mic"][aria-pressed="true"]'))), { timeout: 20000, message: 'the mic to close' });
      const endAt = await page.evaluate(() => performance.now());
      const all = await page.evaluate(() => window.__notify.slice());
      const during = all.filter((n) => n >= tapAt + 150 && n <= endAt);
      t.note(`the owner talked ${Math.round(tapAt)}–${Math.round(endAt)} ms; bells ${JSON.stringify(all.map(Math.round))}`);
      t.assert(during.length === 0, `no bell while the owner talks (${during.map(Math.round).join(', ')})`);
      for (let i = 1; i < all.length; i++) t.assert(all[i] - all[i - 1] >= 14900, `at most one bell every 15 s (${Math.round(all[i] - all[i - 1])} ms apart)`);
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
  {
    name: 'optics-live-bell-voice',
    title: 'Voice Mode over Optics on a Mac: lines held back (Jarvis speaking, the owner talking, the 15 s gap) are only shown: no bell over Jarvis or over the owner',
    device: 'mac',
    timeout: 150000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 12 });
      await page.addInitScript(recordNotify);
      await page.addInitScript(() => {
        window.__voice.queue = ['Keep watching.'];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      const scene = [quiet(), quiet(), quiet(), quiet(), quiet(), quiet()];
      for (let i = 1; i <= 40; i++) scene.push(talk(`Item number ${i} is a different thing again.`, `The owner shows item ${i}.`));
      configureLive(t.mock, { scene, costUsd: 0.0002 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('optics', { timeout: 20000, message: 'Optics to open by voice' });
      await waitLive(t);
      await waitOn(t, page, true, 'the live view to start by voice');
      await t.waitFor(async () => (await said(page)).some((s) => /^Item number/.test(s)), { timeout: 30000, message: 'a live line to be spoken' });
      // The owner talks (about 4 s) while lines keep coming.
      await page.evaluate(() =>
        window.__voice.queue.push({
          parts: [
            { at: 300, text: 'so what I wanted to ask', final: false },
            { at: 1200, text: 'is whether', final: false },
            { at: 2100, text: 'this one is', final: false },
            { at: 3000, text: 'the right size', final: false },
            { at: 3900, text: 'for the remote', final: true },
          ],
        }),
      );
      await t.waitFor(() => t.requests('lead').length >= 1, { timeout: 30000, message: 'the owner\'s question to be sent' });
      await page.waitForTimeout(1500);
      const data = await page.evaluate(() => ({ notify: window.__notify.map(Math.round), speech: window.__voice.log.map((e) => ({ text: e.text.slice(0, 30), at: Math.round(e.at), endAt: Math.round(e.endAt || 0) })) }));
      const lines = await page.locator(tid('optics-liveview-line')).evaluateAll((els) => els.map((e) => e.dataset.spoken));
      t.note(`bells ${JSON.stringify(data.notify)}; lines spoken ${JSON.stringify(lines)}; speech ${JSON.stringify(data.speech)}`);
      t.assert(lines.filter((x) => x === 'false').length >= 2, `some lines were held back (${JSON.stringify(lines)})`);
      t.assert(data.notify.length === 0, `no bell for a held-back line where Jarvis may speak (${data.notify.join(', ')} ms)`);
    },
  },
  {
    name: 'optics-live-mic',
    title: 'Live view on a Mac with replies read aloud: a tap on Optics\' mic stops Jarvis\'s line before it listens (the speakerphone never hears him)',
    device: 'mac',
    timeout: 120000,
    settings: { speakReplies: 'summary' },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 6 });
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      configureLive(t.mock, { scene: [quiet(), quiet(), talk('That’s a Duracell AA, 1.5 volts; the flat end goes on the spring.'), quiet('The owner puts the battery into the remote.')], costUsd: 0.0002 });
      await t.goto('/?optics=1');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, page, true);
      await t.waitFor(async () => (await said(page)).some((s) => s.includes('Duracell')), { timeout: 20000, message: 'the live line to be read aloud' });
      await page.waitForTimeout(400);
      const before = await page.evaluate(() => ({ speaking: window.speechSynthesis.speaking, cancels: window.__voice.cancels, listens: window.__voice.listens }));
      await page.locator(tid('optics-mic')).click();
      await page.waitForTimeout(500);
      const after = await page.evaluate(() => ({ speaking: window.speechSynthesis.speaking, cancels: window.__voice.cancels, listens: window.__voice.listens, micOpen: !!document.querySelector('[data-testid="optics-mic"][aria-pressed="true"]') }));
      t.note(`before the tap ${JSON.stringify(before)}; after ${JSON.stringify(after)}`);
      t.assert(before.speaking, 'Jarvis was reading the line');
      t.assert(after.listens > before.listens, 'the mic listens');
      t.assert(!after.speaking && after.cancels > before.cancels, `Jarvis stopped before the mic listened (${JSON.stringify(after)})`);
      await page.keyboard.press('Escape');
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
  {
    name: 'optics-live-tap',
    title: 'Voice Mode over Optics on a Mac, Continuous off: a live line never takes the owner\'s tap to talk; the question asked after the tap goes out',
    device: 'mac',
    timeout: 120000,
    settings: { voiceContinuous: false },
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 18, noSpeechMs: 8000 });
      await page.addInitScript(() => {
        window.__voice.queue = ['Keep watching.'];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      const scene = [];
      for (let i = 0; i < 9; i++) scene.push(quiet());
      for (let i = 1; i <= 30; i++) scene.push(talk(`Item number ${i} is a different thing again.`, `The owner shows item ${i}.`));
      configureLive(t.mock, { scene, costUsd: 0.0002 });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.visible('optics', { timeout: 20000, message: 'Optics to open by voice' });
      await waitLive(t);
      await waitOn(t, page, true, 'the live view to start by voice');
      await voiceIdle(t, page);
      await t.waitFor(() => liveReqs(t).length >= 8, { timeout: 20000, message: 'eight quiet looks' });
      // The owner taps to talk and starts 4 s later; the first worth-saying line is due in about 2 s.
      await page.evaluate(() => window.__voice.queue.push({ parts: [{ at: 4000, text: 'What size battery does this remote take?', final: true }] }));
      const tapAt = await page.evaluate(() => performance.now());
      await page.locator(tid('optics-mic')).click();
      await t.waitFor(async () => (await t.count('optics-liveview-line')) >= 1, { timeout: 15000, message: 'a live line during the listen' });
      await t.waitFor(() => t.requests('lead').length >= 1, { timeout: 20000, message: 'the owner\'s question to go out' });
      const obs = await page.evaluate(() => ({ speech: window.__voice.log.map((e) => ({ text: e.text.slice(0, 40), at: Math.round(e.at) })) }));
      const spokenDuring = obs.speech.filter((s) => s.at > tapAt && /^Item number/.test(s.text));
      t.note(`tap at ${Math.round(tapAt)} ms; speech ${JSON.stringify(obs.speech)}; lead turns ${t.requests('lead').length}`);
      t.assert(spokenDuring.length === 0 || spokenDuring[0].at > tapAt + 4500, `no live line said while the owner's own listen was open (${JSON.stringify(spokenDuring)})`);
      const sent = t.requests('lead').at(-1);
      const text = JSON.stringify(sent.body.messages.at(-1).content);
      t.assert(/What size battery does this remote take/.test(text), `the question went out (${text.slice(0, 200)})`);
    },
  },
  {
    name: 'optics-live-phone-panel',
    title: 'Live view on an iPhone 13 (portrait, sideways, 320 px) with five long lines: the panel and caption leave most of the picture clear; a tap shows all five',
    device: 'iphone13',
    timeout: 120000,
    browserArgs: cameraArgs('desk-portrait.y4m'),
    async run(t) {
      const page = await t.newPage();
      await instrument(page);
      await page.context().grantPermissions(['camera']);
      const long = (i) => `Line ${i}: that is a cordless drill with the chuck key still in it; take the key out before you pull the trigger.`;
      const sum = 'The owner holds a cordless drill over the workbench, next to a box of screws, a tape measure and an open toolbox with sockets.';
      configureLive(t.mock, { scene: [talk(long(1), sum), talk(long(2), sum), talk(long(3), sum), talk(long(4), sum), talk(long(5), sum), quiet(sum)], costUsd: 0.0002 });
      await t.goto('/');
      await (await t.visible('composer-camera')).click();
      await t.visible('optics');
      await waitLive(t);
      await page.locator(tid('optics-liveview-toggle')).click();
      await waitOn(t, page, true);
      await t.waitFor(async () => (await t.count('optics-liveview-line')) === 5, { timeout: 20000, message: 'five lines' });
      await page.waitForTimeout(800);
      const measure = () =>
        page.evaluate(() => {
          const r = (sel) => {
            const e = document.querySelector(sel);
            if (!e || e.hidden || !e.getClientRects().length) return null;
            const b = e.getBoundingClientRect();
            return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) };
          };
          const vf = r('.optics-brackets');
          const panel = r('[data-testid="optics-liveview"]');
          const cap = r('[data-testid="optics-liveview-caption"]');
          const area = (a) => (a ? Math.max(0, a.r - a.l) * Math.max(0, a.b - a.t) : 0);
          const inter = (a, b) => (a && b ? { l: Math.max(a.l, b.l), t: Math.max(a.t, b.t), r: Math.min(a.r, b.r), b: Math.min(a.b, b.b) } : null);
          const ip = inter(vf, panel);
          const ic = inter(vf, cap);
          const covered = area(ip && ip.r > ip.l && ip.b > ip.t ? ip : null) + area(ic && ic.r > ic.l && ic.b > ic.t ? ic : null);
          const visibleLines = [...document.querySelectorAll('[data-testid="optics-liveview-line"]')].filter((li) => li.getBoundingClientRect().height > 2).length;
          return { vw: innerWidth, vh: innerHeight, coveredPct: vf ? Math.round((100 * covered) / area(vf)) : null, visibleLines, panel, caption: cap };
        });
      const out = {};
      out.portrait = await measure();
      await shot(t, 'iphone13-live-view-5lines');
      await page.setViewportSize({ width: 844, height: 390 });
      await page.waitForTimeout(800);
      out.sideways = await measure();
      await shot(t, 'iphone13-live-view-5lines-sideways');
      await page.setViewportSize({ width: 320, height: 568 });
      await page.waitForTimeout(800);
      out.small = await measure();
      await shot(t, 'phone320-live-view-5lines');
      t.note(`covered: portrait ${out.portrait.coveredPct}%, sideways ${out.sideways.coveredPct}%, 320 px ${out.small.coveredPct}% (${JSON.stringify(out)})`);
      t.assert(out.portrait.coveredPct <= 30, `portrait: the panel and caption cover at most 30% of the picture (${out.portrait.coveredPct}%)`);
      t.assert(out.sideways.coveredPct <= 40, `sideways: at most 40% (${out.sideways.coveredPct}%)`);
      t.assert(out.small.coveredPct <= 40, `320 px: at most 40% (${out.small.coveredPct}%)`);
      for (const k of ['portrait', 'sideways', 'small']) t.assert(out[k].visibleLines === 1, `${k}: only the newest line shows (${out[k].visibleLines})`);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForTimeout(500);
      await page.locator(tid('optics-liveview-lines')).click();
      await t.waitFor(async () => (await measure()).visibleLines === 5, { timeout: 3000, message: 'a tap to show the five lines' });
      await shot(t, 'iphone13-live-view-5lines-open');
      await page.locator(tid('optics-liveview-lines')).click();
      await t.waitFor(async () => (await measure()).visibleLines === 1, { timeout: 3000, message: 'a tap again for the newest only' });
      t.assert((await page.locator('[data-testid="optics-liveview-line"]').count()) === 5, 'screen readers still have the five');
      await page.locator(tid('optics-live-pill')).click();
      await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 5000, message: 'Optics to close' });
    },
  },
];
