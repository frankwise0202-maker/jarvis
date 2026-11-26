// v8.1 money and Optics fixes, end to end (the fix-money branch): what the reviews found, in the app.
//   fix-hidden-camera-note   PRIVACY-2: hidden on a Mac, camera words leave one notification that says what its
//                            click does, with the price; a click after its 30 s only opens Optics (no Look, no
//                            live view); closing Voice Mode withdraws it
//   fix-paused-look          MAC-3: a Look asked for just as Jarvis goes to the background ends there, with a
//                            line; Voice Mode goes on, and when Jarvis is shown again no stale Look is sent
//   fix-optics-mic-alternatives
//                            PRIVACY-3: Optics opened on its own; its microphone hears "Lie view." (another
//                            reading: "Live view.") and "Use the Logic tech camera." ("Use the Logitech
//                            camera."): neither the live view nor a camera switch comes from the other reading
//   fix-optics-closed-words  MONEY-7: with Optics closed, the live view's and the picture's words said in Voice
//                            Mode, and typed in the chat, get a free line: nothing is sent
//   fix811-holo-field        v8.1.1 MONEY-R2-4: a hologram opened from the chat; "stop live view" and "stop
//                            watching" typed in its field: the free line, nothing sent
//   fix811-holo-voice        v8.1.1 MONEY-R2-4: Voice Mode on a Mac, a hologram over it; "Stop live view." said:
//                            "The live view is off.", nothing sent
//   fix811-holo-mic          v8.1.1 MONEY-R2-5: a hologram opened from the chat; its own microphone hears "What is
//                            the separator made of?" (another reading: "Blueprint the separator."): the question
//                            goes to Jarvis, no blueprint is built from the other reading
// (The three hologram scenarios are ported from the second review's probes, review2/money-v-*/test/e2e.)

import { tid } from '../harness.mjs';
import { installCameraRig } from '../camera-rig.mjs';
import { configureLive, isLiveRequest } from '../../mock/optics.mjs';
import { installFakeSpeech } from './features.mjs';
import { cameraArgs, instrument, setHidden, slowCamera, waitLive } from './optics.mjs';
import { toastText, typeCommand } from './screens.mjs';

const MAC_CAMERAS = [{ label: 'FaceTime HD Camera (Built-in) (05ac:8514)' }, { label: 'Logitech BRIO (046d:085e)' }];
const said = (page) => page.evaluate(() => (window.__voice ? window.__voice.said.slice() : []));
const leads = (t) => t.requests('lead').filter((r) => r.status === 200);
const hasImage = (r) => {
  const m = r.body.messages.findLast((x) => x.role === 'user');
  return !!(m && Array.isArray(m.content) && m.content.some((b) => b.type === 'image'));
};
const looks = (t) => leads(t).filter(hasImage).length;
const liveReqs = (t) => t.requests().filter((r) => r.body && typeof r.body === 'object' && isLiveRequest(r.body));
const attr = (page, name) => page.locator(tid('optics')).getAttribute(`data-${name}`);

// v8.1.1: the hologram viewer's state hooks, and the words of a request's newest user message.
const viewerAttr = (t, name) => t.page.locator(tid('hologram-viewer')).getAttribute(`data-${name}`);
async function waitViewer(t, name, value, { timeout = 30000 } = {}) {
  await t.waitFor(async () => (await viewerAttr(t, name)) === value, { timeout, message: async () => `viewer data-${name} "${value}" (is "${await viewerAttr(t, name)}")` });
}
function newestUserTexts(body) {
  const msgs = Array.isArray(body && body.messages) ? body.messages : [];
  const msg = [...msgs].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'text'));
  return msg ? msg.content.filter((b) => b.type === 'text').map((b) => b.text) : [];
}
/** A hologram asked for in the chat, built by the mock, opened in the viewer (saved to the library). */
async function hologramFromChat(t) {
  const turn = await t.send('[[hologram:battery]] Show me an AA battery');
  const card = turn.locator(tid('hologram-card'));
  await card.waitFor({ state: 'visible', timeout: 30000 });
  await t.waitFor(async () => (await card.getAttribute('data-status')) !== 'building', { timeout: 60000, message: 'the build to finish' });
  await card.locator(tid('hologram-open')).click();
  await t.visible('hologram-viewer');
  await waitViewer(t, 'state', 'ready', { timeout: 60000 });
  t.assert(/^lib_/.test((await viewerAttr(t, 'model')) || ''), 'saved to the library');
}

/** Init script: notifications recorded (window.__notes, each with `closed`), and a page clock that can run ahead. */
function installNotesAndClock() {
  window.__notes = [];
  class FakeNotification {
    constructor(title, options) {
      this.title = title;
      this.options = options || {};
      this.onclick = null;
      this.onclose = null;
      this.closed = false;
      window.__notes.push(this);
    }
    close() {
      this.closed = true;
      if (typeof this.onclose === 'function') this.onclose();
    }
  }
  FakeNotification.permission = 'granted';
  FakeNotification.requestPermission = () => Promise.resolve('granted');
  window.Notification = FakeNotification;
  // A click "40 s later" without waiting 40 s (a hidden tab's timers can run that late).
  window.__skew = 0;
  const realNow = Date.now.bind(Date);
  Date.now = () => realNow() + (window.__skew || 0);
}

/** Init script: document.hidden on demand (Voice Mode isn't told, so it keeps listening, as A1's background listening). */
function installHiddenSwitch() {
  window.__voice.queue = [];
  window.__hiddenForTest = false;
  const real = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hiddenForTest === true || (real && real.get ? real.get.call(document) : false) });
}

async function voiceOnMac(t, { extraInit = [] } = {}) {
  const page = await t.newPage();
  await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS });
  await page.addInitScript(installFakeSpeech);
  for (const fn of extraInit) await page.addInitScript(fn);
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
  return { page, tapToTalk };
}

export default [
  {
    name: 'fix-hidden-camera-note',
    title: 'PRIVACY-2: hidden on a Mac, "what am I looking at?" and "video mode" each leave one notification saying what its click does, with the price; a click after the 30 s only opens Optics (no Look, no live view); closing Voice Mode withdraws it',
    device: 'mac',
    timeout: 150000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const { page, tapToTalk } = await voiceOnMac(t, { extraInit: [installHiddenSwitch, installNotesAndClock] });
      const notes = () => page.evaluate(() => window.__notes.map((n) => ({ title: n.title, body: n.options && n.options.body, closed: n.closed })));
      await t.step('hidden, "what am I looking at?": the line, and one notification that says it will look, with its price', async () => {
        await tapToTalk(['What am I looking at?']);
        await page.evaluate(() => (window.__hiddenForTest = true));
        await t.waitFor(async () => (await said(page)).some((s) => /The camera only runs while I’m on screen\. Click the notification to bring me up\./.test(s)), { timeout: 15000, message: 'the line about the notification' });
        const list = await notes();
        t.assert(list.length === 1, `one notification (${JSON.stringify(list)})`);
        t.assert(/look through the camera \(about \d+¢\)/.test(list[0].body), `it says what the click does, with the price (${list[0].body})`);
        t.assert((await t.count('optics')) === 0 && looks(t) === 0, 'no camera and no Look while hidden');
      });
      await t.step('clicked 40 s later: Optics opens with the camera, and nothing more (no Look)', async () => {
        await page.evaluate(() => {
          window.__hiddenForTest = false;
          window.__skew = 40000;
          const n = window.__notes[0];
          if (n && typeof n.onclick === 'function') n.onclick();
        });
        await t.visible('optics', { timeout: 15000, message: 'Optics to open from the late click' });
        await waitLive(t);
        await page.waitForTimeout(2500);
        t.assert(looks(t) === 0, `no Look sent by a late click (${looks(t)})`);
        t.assert((await attr(page, 'liveview')) !== 'on' && liveReqs(t).length === 0, 'no live view');
        await page.evaluate(() => (window.__skew = 0));
      });
      await t.step('"close the camera"; hidden, "video mode": a notification that says it starts the live view, with its cap; closing Voice Mode withdraws it', async () => {
        await tapToTalk(['Close the camera.']);
        await t.waitFor(async () => (await t.count('optics')) === 0, { timeout: 15000, message: 'Optics to close' });
        await tapToTalk(['Video mode.']);
        await page.evaluate(() => (window.__hiddenForTest = true));
        await t.waitFor(async () => (await notes()).length === 2, { timeout: 15000, message: 'the second notification' });
        const second = (await notes())[1];
        t.assert(/start the live view \(up to \$1 an hour\)/.test(second.body), `it says what the click does (${second.body})`);
        t.assert((await notes())[0].closed === true, 'the first one was withdrawn when it was clicked');
        await page.evaluate(() => (window.__hiddenForTest = false));
        await (await t.visible('voice-close')).click();
        await t.waitFor(async () => (await t.count('voice-mode')) === 0, { timeout: 10000, message: 'Voice Mode to close' });
        await t.waitFor(async () => (await notes())[1].closed === true, { timeout: 5000, message: 'the notification withdrawn with Voice Mode' });
        await page.evaluate(() => {
          const n = window.__notes[1];
          if (n && typeof n.onclick === 'function') n.onclick();
        });
        await page.waitForTimeout(2000);
        t.assert((await t.count('optics')) === 0 && liveReqs(t).length === 0, 'a click on it after Voice Mode closed does nothing');
      });
    },
  },
  {
    name: 'fix-paused-look',
    title: 'MAC-3: "what am I looking at?" just as Jarvis goes to the background: the Look ends with "The camera turns off while Jarvis is in the background.", Voice Mode goes on, and shown again no stale Look is sent',
    device: 'mac',
    timeout: 120000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const { page, tapToTalk } = await voiceOnMac(t, { extraInit: [slowCamera, installHiddenSwitch] });
      await page.evaluate(() => sessionStorage.setItem('slowCam', '3000'));
      await t.step('asked on screen; hidden before the camera is live: the Look ends with the line, nothing sent', async () => {
        await tapToTalk(['What am I looking at?']);
        await t.visible('optics', { timeout: 15000, message: 'Optics to open for the Look' });
        await setHidden(page, true);
        await t.waitFor(async () => (await said(page)).some((s) => /The camera turns off while Jarvis is in the background\./.test(s)), { timeout: 20000, message: async () => `the line (said ${JSON.stringify((await said(page)).slice(-3))}, camera ${await attr(page, 'camera')})` });
        t.assert(looks(t) === 0, 'no Look sent');
        await page.waitForTimeout(1500);
        const status = await page.locator(tid('voice-status')).textContent().catch(() => '');
        t.assert(!/One moment/.test(String(status)), `Voice Mode isn't left on "One moment…" (${status})`);
      });
      await t.step('shown again: the camera may come back, but no stale Look is sent', async () => {
        await setHidden(page, false);
        await page.waitForTimeout(5000);
        t.assert(looks(t) === 0, `no Look sent by itself (${looks(t)})`);
      });
    },
  },
  {
    name: 'fix-optics-mic-alternatives',
    title: 'PRIVACY-3: Optics opened on its own; its microphone hears "Lie view." (other reading "Live view.") and "Use the Logic tech camera." (other reading "Use the Logitech camera."): no live view, no camera switch',
    device: 'mac',
    timeout: 120000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: MAC_CAMERAS });
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await instrument(page);
      await page.context().grantPermissions(['camera', 'microphone']);
      configureLive(t.mock, { costUsd: 0.0001 });
      await t.goto('/?optics=1');
      await t.visible('optics');
      await waitLive(t);
      const cameraLabel = () => page.evaluate(() => {
        const live = (window.__opticsTracks || []).filter((x) => x.api === 'getUserMedia' && x.track.kind === 'video' && x.track.readyState === 'live');
        return live.length ? live[live.length - 1].label : '';
      });
      const before = await cameraLabel();
      const hear = async (text, alt) => {
        await page.evaluate(({ text: x, alt: a }) => window.__voice.queue.push({ parts: [{ at: 300, text: x, final: true, alts: [a] }] }), { text, alt });
        await (await t.visible('optics-mic')).click();
      };
      await t.step('"Lie view." with "Live view." as another reading: the live view doesn\'t start', async () => {
        await hear('Lie view.', 'Live view.');
        await page.waitForTimeout(4000);
        t.assert((await attr(page, 'liveview')) !== 'on', `the live view stays off (${await attr(page, 'liveview')})`);
        t.assert(liveReqs(t).length === 0, `no live frames sent (${liveReqs(t).length})`);
      });
      await t.step('"Use the Logic tech camera." with "Use the Logitech camera." as another reading: the camera stays', async () => {
        await t.waitFor(async () => (await page.locator(tid('optics-mic')).getAttribute('aria-pressed')) !== 'true', { timeout: 15000, message: 'the mic to be free again' });
        await hear('Use the Logic tech camera.', 'Use the Logitech camera.');
        await page.waitForTimeout(4000);
        const after = await cameraLabel();
        t.assert(!/Logitech/i.test(after), `the camera wasn't switched by another reading (${before} → ${after})`);
      });
    },
  },
  {
    name: 'fix-optics-closed-words',
    title: 'MONEY-7: with Optics closed, "stop video mode", "video mode off", "stop live view", "stop watching", "expand the picture", "back to live" and "close the picture" said in Voice Mode, and "stop live view" typed in the chat, each get a free line: nothing is sent',
    device: 'mac',
    timeout: 120000,
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      const LINES = {
        'Stop video mode.': 'The live view is off.',
        'Video mode off.': 'The live view is off.',
        'Stop live view.': 'The live view is off.',
        'Stop watching.': 'Watch is off.',
        'Expand the picture.': 'There’s no picture on screen.',
        'Back to live.': 'There’s no picture on screen.',
        'Close the picture.': 'There’s no picture on screen.',
      };
      await t.step('said in Voice Mode, one at a time: each its line, nothing sent', async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        for (const [words, line] of Object.entries(LINES)) {
          await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle', { timeout: 20000, message: 'Voice Mode to wait for a tap' });
          const n = (await said(page)).length;
          await page.evaluate((w) => window.__voice.queue.push(w), words);
          await page.locator(tid('voice-core')).click();
          await t.waitFor(async () => (await said(page)).slice(n).includes(line), { timeout: 15000, message: async () => `"${line}" for "${words}" (said ${JSON.stringify((await said(page)).slice(n))})` });
        }
        t.assert(t.requests('lead').length === 0, `nothing sent to Claude (${t.requests('lead').length})`);
        await (await t.visible('voice-close')).click();
        await t.waitFor(async () => (await t.count('voice-mode')) === 0, { timeout: 10000, message: 'Voice Mode to close' });
      });
      await t.step('typed in the chat: the line, nothing sent', async () => {
        await typeCommand(t, 'stop live view');
        await t.waitFor(async () => /The live view is off\./.test(await toastText(t)), { timeout: 5000, message: async () => `the line (${await toastText(t)})` });
        t.assert(t.requests('lead').length === 0, 'nothing sent to Claude');
      });
    },
  },
  {
    name: 'fix811-holo-field',
    title: 'MONEY-R2-4: a hologram opened from the chat; "stop live view" and "stop watching" typed in its field get the free line, nothing is sent',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.step('a hologram from the chat, open in the viewer', () => hologramFromChat(t));
      for (const [words, line] of [['stop live view', 'The live view is off.'], ['stop watching', 'Watch is off.']]) {
        await t.step(`"${words}" typed in the hologram's field: "${line}", nothing sent`, async () => {
          const before = t.requests('lead').length;
          const input = t.page.locator(tid('hologram-command'));
          await input.fill(words);
          await input.press('Enter');
          await t.waitFor(async () => ((await t.page.locator(tid('hologram-viewer')).textContent()) || '').includes(line), { timeout: 8000, message: `"${line}" shown in the viewer` });
          await t.page.waitForTimeout(1500);
          const sent = t.requests('lead').slice(before).map((r) => newestUserTexts(r.body).join(' | '));
          t.assert(sent.length === 0, `nothing sent to Claude (${JSON.stringify(sent)})`);
        });
      }
    },
  },
  {
    name: 'fix811-holo-voice',
    title: 'MONEY-R2-4: Voice Mode on a Mac with a hologram over it; "Stop live view." said: "The live view is off.", nothing is sent',
    device: 'mac',
    timeout: 240000,
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = ['[[hologram:battery]] Show me an AA battery'];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      await t.step('the hologram opens over Voice Mode and is said', async () => {
        await t.visible('hologram-viewer', { timeout: 30000 });
        await waitViewer(t, 'state', 'ready', { timeout: 60000 });
        await t.waitFor(async () => /Say "expand it", or tap any part\./.test((await said(page)).join(' ')), { timeout: 40000, message: 'the hologram to be said' });
      });
      await t.step('"Stop live view." said with the hologram on screen: the free line, nothing sent', async () => {
        const before = t.requests('lead').length;
        // Voice Mode drives the viewer's mic: tap once it has said the hologram and waits (a tap while it
        // speaks only stops the speech).
        await t.waitFor(async () => (await page.locator(tid('voice-mode')).getAttribute('data-state')) === 'idle' && (await viewerAttr(t, 'voice')) === 'idle', { timeout: 20000, message: 'Voice Mode to wait for a tap' });
        await page.waitForTimeout(500);
        const n = (await said(page)).length;
        await page.evaluate(() => window.__voice.queue.push('Stop live view.'));
        await (await t.visible('hologram-mic')).click();
        await t.waitFor(async () => (await said(page)).slice(n).includes('The live view is off.'), { timeout: 15000, message: async () => `"The live view is off." said (said ${JSON.stringify((await said(page)).slice(n))})` });
        await page.waitForTimeout(1500);
        const sent = t.requests('lead').slice(before).map((r) => newestUserTexts(r.body).join(' | '));
        t.assert(sent.length === 0, `nothing sent to Claude (${JSON.stringify(sent)})`);
      });
    },
  },
  {
    name: 'fix811-holo-mic',
    title: 'MONEY-R2-5: a hologram opened from the chat; its own microphone hears "What is the separator made of?" (other reading "Blueprint the separator."): the question goes to Jarvis, no blueprint is built',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await page.context().grantPermissions(['microphone']);
      await t.goto('/');
      await t.step('a hologram from the chat, open in the viewer', () => hologramFromChat(t));
      await t.step('its microphone: best "What is the separator made of?", other reading "Blueprint the separator."', async () => {
        const before = t.requests('lead').length;
        await page.evaluate(() => window.__voice.queue.push({ parts: [{ at: 300, text: 'What is the separator made of?', final: true, alts: ['Blueprint the separator.'] }] }));
        await (await t.visible('hologram-mic')).click();
        const req = await t.waitFor(() => t.requests('lead').slice(before)[0] || null, { timeout: 30000, message: 'a request to go out' });
        const texts = newestUserTexts(req.body).join('\n');
        t.assert(!/Blueprint request/i.test(texts), `no blueprint built from the other reading (${texts.slice(0, 200)})`);
        t.assert(/What is the separator made of\?/.test(texts), `the owner's question went to Jarvis (${texts.slice(0, 200)})`);
        await page.waitForTimeout(2000);
        const blueprints = t.requests('lead').slice(before).filter((r) => /Blueprint request/i.test(newestUserTexts(r.body).join('\n')));
        t.assert(blueprints.length === 0, `no blueprint request at all (${blueprints.length})`);
      });
    },
  },
];
