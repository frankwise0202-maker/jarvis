// v8.1 joins (the brief's Integration item 3): where two or more tracks meet, checked in one app.
//   join-tour-hold          Mac, woken by two claps (A2): a laptop hologram, "walk me through the battery";
//                           nobody answers "enclosed, or opened?": the tour holds the session past the usual
//                           quiet, then Jarvis goes back to Standby by himself and the tour still waits at its
//                           question (A2 + B4 + B5; the hold's 2 minutes shortened through jarvis.dev.voice)
//   join-h4                 Mac, Voice Mode, Jarvis for Chrome linked: a Chrome task running, a walkthrough at
//                           its question, Chrome's question and the research offer all open (critique H4): a
//                           bare "cancel" withdraws what was asked last (the offer), "approve" answers Chrome
//                           only, "stop" stops the task (the tour at its question already waits, and stays so),
//                           "continue" moves the tour only
//   join-pull-up-optics     Mac, Optics open, Jarvis for Chrome linked: "open YouTube in Chrome" goes to the
//                           Jarvis window placed beside Jarvis (a rectangle, not focused); with the extension
//                           offline: a window here, beside Jarvis, and Jarvis says once that he can't reach it
//                           (G1 + G3, beside Optics)
//   join-hidden-optics      Mac, Voice Mode listening, then Jarvis in the background: "open optics" heard there
//                           says the camera needs him on screen, with one notification; its click opens Optics
//                           with the camera live (A1 + E2)
//   join-hidden-prompt      Mac, Standby in the background, Jarvis for Chrome linked: Chrome's question becomes a
//                           notification; at the wake the greeting starts with it, and "approve" answers it
//                           after its check (A1 + G5 + D3)
// Barge-in during a walkthrough is tours' `tour-barge-in` (registered in run.mjs's tours block), the live
// view with a card aside and the research offer near its dollar is optics' `optics-research`, and every new
// phrase is in the corpora (test/unit/command-router.test.mjs, T1-T5).

import { tid } from '../harness.mjs';
import { CORE_URL, createFakeChromePeer, seedChromeLink, CHROME_TEST_KEY } from '../core-fakes.mjs';
import { installFakeSpeech } from './features.mjs';
import { installFakeMic } from '../fake-mic.mjs';
import { installCameraRig } from '../camera-rig.mjs';
import { cameraArgs, setHidden } from './optics.mjs';
import { installScreenStubs } from './screens.mjs';
import { installWindowGeometry } from './windows.mjs';
import { installFakeTabs } from './chrome-tab.mjs';
import * as S from '../../unit/wake.signals.mjs';

const LAPTOP = '[[hologram:laptop]] Show me a laptop.';
const LINKED_HOME = { settings: { homeBaseUrl: CORE_URL } };
// A read that waits for the relay is cut off when the page goes away (a reload): the browser logs it.
const NETWORK_NOISE = [/Failed to load resource/, /ERR_INTERNET_DISCONNECTED/, /net::ERR_ABORTED/];
const pad = (x, before = 0.4, after = 0.9) => S.concat(S.silence(before), x, S.silence(after));
const DOUBLE_CLAP = Array.from(pad(S.doubleClap({ gapMs: 420, at: 0.2, seconds: 1.0, peakDb: -10 })));
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

const CART = {
  kind: 'confirm',
  category: 'change',
  consequential: false,
  site: 'bestbuy.com',
  title: 'Approve this step?',
  spoken: 'Add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com?',
  body: 'Click the button that says “Add to Cart” next to the 27-inch 4K monitor on bestbuy.com.',
  address: '',
  choices: [
    { id: 'approve', label: 'Approve' },
    { id: 'cancel', label: 'Cancel' },
  ],
  voice: { allowed: true, why: '' },
};

// ---- probes and helpers ----------------------------------------------------------------------------------

/** Notifications (window.Notification and the service worker's), recorded in window.__notes. */
function installNotifyProbe() {
  const notes = [];
  window.__notes = notes;
  class FakeNotification {
    constructor(title, options = {}) {
      this.title = String(title);
      this.body = String(options.body || '');
      this.tag = String(options.tag || '');
      this.closed = false;
      this.onclick = null;
      this.onclose = null;
      notes.push(this);
    }
    close() {
      if (this.closed) return;
      this.closed = true;
      if (typeof this.onclose === 'function') this.onclose();
    }
    static get permission() {
      return 'granted';
    }
    static requestPermission() {
      return Promise.resolve('granted');
    }
  }
  window.Notification = FakeNotification;
  try {
    const proto = window.ServiceWorkerRegistration && window.ServiceWorkerRegistration.prototype;
    if (proto) {
      proto.showNotification = function showNotification(title, options = {}) {
        for (const n of notes) if (options.tag && n.tag === options.tag && !n.closed) n.closed = true;
        new FakeNotification(title, options);
        return Promise.resolve();
      };
      proto.getNotifications = function getNotifications(filter = {}) {
        return Promise.resolve(notes.filter((n) => !n.closed && (!filter || !filter.tag || n.tag === filter.tag)));
      };
    }
  } catch {
    /* no service worker API */
  }
}

const notes = (page) => page.evaluate(() => window.__notes.map((n) => ({ title: n.title, body: n.body, tag: n.tag, closed: n.closed })));
const said = (page) => page.evaluate(() => window.__voice.said.map((s) => String(s).replace(/\s+/g, ' ').trim()));
const queue = (page, ...items) => page.evaluate((list) => window.__voice.queue.push(...list), items);
const leadCount = (t) => t.requests('lead').length;
const voiceState = (page) => page.evaluate(() => document.querySelector('[data-testid="voice-mode"]')?.getAttribute('data-state') || null);
const viewerAttr = (page, name) => page.locator(tid('hologram-viewer')).getAttribute(`data-${name}`);
const kinds = (peer, kind) => peer.received.filter((m) => m.kind === kind);

async function waitSaid(t, test, what, { timeout = 20000, page = t.page, from = 0 } = {}) {
  const ok = (line) => (typeof test === 'string' ? line.includes(test) : test.test(line));
  await t.waitFor(async () => (await said(page)).slice(from).some(ok), { timeout, message: async () => `Jarvis to say ${what} (said: ${JSON.stringify((await said(page)).slice(from))})` });
}

async function waitViewer(t, name, value, { timeout = 30000, page = t.page } = {}) {
  await t.waitFor(async () => (await viewerAttr(page, name)) === value, { timeout, message: async () => `the viewer's data-${name} to be "${value}" (is "${await viewerAttr(page, name)}")` });
}

async function standbyState(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="standby"]');
    if (!el || el.hidden) return null;
    return { listening: el.dataset.listening, word: el.dataset.word };
  });
}

async function enterStandby(t, page = t.page, { word = false } = {}) {
  await (await t.visible('quick-key-standby', { page, message: 'Home offers Standby' })).click();
  await t.visible('standby', { page, message: 'Standby opens' });
  await t.waitFor(async () => (await standbyState(page))?.listening === 'live', { timeout: 15000, message: async () => `Standby to listen (${JSON.stringify(await standbyState(page))})` });
  if (word) await t.waitFor(async () => (await standbyState(page))?.word === 'ready', { timeout: 15000, message: 'the "Hey Jarvis" stand-in ready' });
}

async function wakeByClaps(t, page = t.page) {
  await page.evaluate((x) => window.__fakeMic.play(x), DOUBLE_CLAP);
  await page.locator(tid('voice-mode')).waitFor({ state: 'attached', timeout: 8000 });
}

/**
 * The owner says `words` to Voice Mode: heard by the listen running now, or (Voice Mode waiting for a tap) after
 * a tap on its core. `alts`: the recognizer's other readings.
 */
async function sayToVoice(t, words, { page = t.page, alts = [] } = {}) {
  await t.waitFor(async () => ['listening', 'idle'].includes(await voiceState(page)), { timeout: 30000, message: async () => `Voice Mode to listen or wait for a tap before "${words}" (it is ${await voiceState(page)})` });
  if ((await voiceState(page)) === 'idle') {
    await page.evaluate(({ w, a }) => window.__voice.queue.push(a.length ? { parts: [{ at: 400, text: w, final: true, alts: a }] } : w), { w: words, a: alts });
    // A hologram over Voice Mode has its own mic (Voice Mode's talk button there), as tours' scenarios tap it.
    const holoMic = page.locator(tid('hologram-mic'));
    if ((await page.locator(tid('hologram-viewer')).count()) && (await holoMic.isVisible().catch(() => false))) await holoMic.click();
    else await page.locator(tid('voice-core')).click();
  } else {
    await page.evaluate(({ w, a }) => window.__voice.say({ parts: [{ at: 300, text: w, final: true, alts: a }] }), { w: words, a: alts });
  }
}

/** A linked Mac page (CHROME_TEST_KEY) with the fake extension online: { page, peer }. */
async function linkedPage(t, { init = [], autoTask = true } = {}) {
  const page = await t.newPage();
  await seedChromeLink(page.context(), { key: CHROME_TEST_KEY });
  for (const [fn, arg] of init) await page.addInitScript(fn, arg);
  await t.goto('/');
  const peer = createFakeChromePeer(t.core.relay, { autoTask }).start();
  await t.waitFor(() => peer.received.some((m) => m.kind === 'hello'), { timeout: 15000, message: 'the app’s hello' });
  await page.waitForTimeout(1500); // online once the extension's hello back has arrived
  return { page, peer };
}

async function withPeer(peer, fn) {
  try {
    await fn();
  } finally {
    await peer.stop();
  }
}

export default [
  {
    name: 'join-tour-hold',
    title: 'Mac, woken by two claps: a laptop hologram, "walk me through the battery"; nobody answers "enclosed, or opened?": the tour holds the session past the usual quiet, then Jarvis goes back to Standby by himself, at least the hold\'s cap after the owner\'s last words, and the tour still waits at its question (A2 + B4 + B5)',
    device: 'mac',
    fakeMusic: true,
    timeout: 300000,
    async run(t) {
      const CAP_MS = 30000; // the hold's 2 minutes, shortened (jarvis.dev.voice only shortens)
      const page = await t.newPage();
      await page.addInitScript(installFakeSpeech, { cps: 80 });
      await page.addInitScript(installFakeMic, { wakeLock: true });
      await page.addInitScript((cap) => {
        window.__voice.queue = [];
        try {
          localStorage.setItem('jarvis.dev.voice', JSON.stringify({ holdCapMs: cap }));
        } catch {
          /* storage unavailable */
        }
      }, CAP_MS);
      await t.goto('/', { page });
      await enterStandby(t, page);
      // The wake window hears nobody; the offer's listen hears the hologram request; the follow-up, the tour.
      await queue(page, '', LAPTOP, 'Walk me through the battery.');
      await wakeByClaps(t, page);
      let startedAt = 0;
      let step = '';
      await t.step('the hologram, then the walkthrough at its question, holding the woken session', async () => {
        await t.visible('hologram-viewer', { page, timeout: 60000, message: 'the laptop opens' });
        await waitViewer(t, 'state', 'ready', { timeout: 60000, page });
        await t.waitFor(async () => ['starting', 'playing', 'choice'].includes(await viewerAttr(page, 'tour-status')), { timeout: 60000, message: 'the tour to start' });
        startedAt = Date.now(); // just after the owner's last words ("walk me through the battery")
        await waitViewer(t, 'tour-status', 'choice', { timeout: 90000, page });
        step = await viewerAttr(page, 'tour-step');
        t.assert(step === 'ask', `at the question (${step})`);
        t.assert((await viewerAttr(page, 'tour-hold')) === 'on', 'the tour holds the woken session');
      });
      const lead = leadCount(t);
      await t.step('back to Standby by itself, no sooner than the hold allows; the tour still waits where it was', async () => {
        await page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: CAP_MS + 120000 });
        const took = Date.now() - startedAt;
        await t.visible('standby', { page, message: 'Standby comes back' });
        t.note(`back in Standby ${Math.round(took / 1000)} s after the tour started (the hold's cap: ${CAP_MS / 1000} s)`);
        t.assert(took >= CAP_MS - 1000, `held at least its cap (${Math.round(took / 1000)} s)`);
        t.assert(await page.locator(tid('hologram-viewer')).count(), 'the hologram is still there');
        t.assert((await viewerAttr(page, 'tour-status')) === 'choice' && (await viewerAttr(page, 'tour-step')) === step, `the tour still at its question (${await viewerAttr(page, 'tour-status')}, ${await viewerAttr(page, 'tour-step')})`);
        t.assert(leadCount(t) === lead, 'nothing was sent');
        await t.screenshot('1-standby-tour-waits', page);
      });
    },
  },
  {
    name: 'join-h4',
    title: 'Mac, Voice Mode, Jarvis for Chrome linked: a Chrome task running, a walkthrough at its question, Chrome’s question and the research offer all open: a bare "cancel" withdraws the offer (asked last), "approve" answers Chrome only, "stop" stops the task and leaves the tour’s question waiting, "continue" moves the tour only (critique H4)',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 300000,
    async run(t) {
      const { page, peer } = await linkedPage(t, { init: [[installFakeSpeech, { cps: 80, noSpeechMs: 4000 }], [() => (window.__voice.queue = []), null]] });
      await withPeer(peer, async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        await t.step('a Chrome task: its check, then it runs', async () => {
          await sayToVoice(t, 'Find a 4K monitor under $300 and add it to the cart in Chrome.');
          await waitSaid(t, 'Chrome, up to a dollar: find a 4K monitor under $300 and add it to the cart.', 'the task’s check');
          await peer.waitFor('start');
          await waitSaid(t, 'Chrome is on it.', '"Chrome is on it."');
        });
        await t.step('the laptop, and the walkthrough at its question', async () => {
          await sayToVoice(t, LAPTOP);
          await t.visible('hologram-viewer', { timeout: 60000, message: 'the laptop opens' });
          await waitViewer(t, 'state', 'ready', { timeout: 60000 });
          await sayToVoice(t, 'Walk me through the battery.');
          await waitViewer(t, 'tour-status', 'choice', { timeout: 90000 });
          await waitSaid(t, /enclosed, or opened\?/, 'the tour’s question');
        });
        const lead = leadCount(t);
        let prompt;
        await t.step('Chrome asks (said in full), then "research this" (the offer, asked last)', async () => {
          prompt = await peer.prompt(CART);
          await waitSaid(t, 'Chrome asks: Add the 27-inch 4K monitor, $279.99, to the cart on bestbuy.com?', 'Chrome’s question', { timeout: 30000 });
          await sayToVoice(t, 'Research this.');
          await waitSaid(t, /^Research this .*about 10¢.*\$1\.70/, 'the research offer with its prices', { timeout: 30000 });
          t.assert(kinds(peer, 'answer').length === 0, 'nothing answered Chrome');
          t.assert((await viewerAttr(t.page, 'tour-status')) === 'choice', 'the tour still at its question');
        });
        await t.step('a bare "cancel": the offer (asked last) is withdrawn; Chrome’s question and the tour stay', async () => {
          const n = (await said(t.page)).length;
          await sayToVoice(t, 'Cancel.');
          await t.waitFor(async () => (await said(t.page)).length > n, { timeout: 15000, message: 'a line after "cancel"' });
          await t.page.waitForTimeout(2500);
          t.assert(kinds(peer, 'answer').length === 0, `Chrome's question wasn't answered (${JSON.stringify(kinds(peer, 'answer'))})`);
          t.assert((await viewerAttr(t.page, 'tour-status')) === 'choice', 'the tour still at its question');
          t.assert(leadCount(t) === lead, 'no research was sent');
        });
        await t.step('"approve": Chrome’s question only, after its check, bound to its hash', async () => {
          const from = (await said(t.page)).length;
          await sayToVoice(t, 'Approve.');
          // A yes counts within 30 s of the question said in full: past that, Jarvis asks it again first.
          await t.waitFor(async () => (await said(t.page)).slice(from).some((x) => /Approving\. Say cancel to stop\.|Let me ask again\./.test(x)), { timeout: 15000, message: async () => `the check, or the question again (${JSON.stringify((await said(t.page)).slice(from))})` });
          if ((await said(t.page)).slice(from).some((x) => /Let me ask again\./.test(x))) {
            t.note('Chrome’s question was said again before "approve" counted (its 30-s window)');
            await waitSaid(t, 'Chrome asks: Add the 27-inch 4K monitor', 'the question again', { timeout: 20000, from });
            await sayToVoice(t, 'Approve.');
            await waitSaid(t, 'Approving. Say cancel to stop.', 'the approval’s check', { timeout: 15000, from });
          }
          const answer = await peer.waitFor('answer');
          t.assert(answer.body.promptId === prompt.promptId && answer.body.hash === prompt.hash && answer.body.choice === 'approve' && answer.body.via === 'voice', `one decision bound to the prompt (${JSON.stringify(answer.body)})`);
          t.assert((await viewerAttr(t.page, 'tour-status')) === 'choice', 'the tour untouched');
          await peer.promptClosed(prompt.promptId, 'voice');
        });
        await t.step('"stop": the Chrome task stops; the tour at its question already waits, and stays so (unanswered)', async () => {
          await sayToVoice(t, 'Stop.');
          await peer.waitFor('stop');
          await t.page.waitForTimeout(1500);
          t.assert((await viewerAttr(t.page, 'tour-status')) === 'choice' && (await viewerAttr(t.page, 'tour-step')) === 'ask', `the tour's question still waits (${await viewerAttr(t.page, 'tour-status')}, ${await viewerAttr(t.page, 'tour-step')})`);
        });
        await t.step('"continue": the tour goes on (its default choice); nothing else answers; none of it went to Claude', async () => {
          await sayToVoice(t, 'Continue.');
          await t.waitFor(async () => (await viewerAttr(t.page, 'tour-step')) !== 'ask', { timeout: 30000, message: async () => `the tour to go on (${await viewerAttr(t.page, 'tour-status')}, ${await viewerAttr(t.page, 'tour-step')})` });
          t.assert(kinds(peer, 'answer').length === 1, 'no second answer to Chrome');
          t.assert(leadCount(t) === lead, 'none of it went to Claude');
        });
      });
    },
  },
  {
    name: 'join-pull-up-optics',
    title: 'Mac, Optics open, Jarvis for Chrome linked: "open YouTube in Chrome" goes to the Jarvis window placed beside Jarvis (a rectangle, not focused), the camera live; with the extension offline, a window here beside Jarvis, and Jarvis says once that he can’t reach it (G1 + G3)',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    allowConsole: NETWORK_NOISE,
    timeout: 240000,
    browserArgs: () => ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    async run(t) {
      const page = await t.newPage();
      await seedChromeLink(page.context(), { key: CHROME_TEST_KEY });
      await page.addInitScript(installScreenStubs, { monitors: 1 });
      await page.addInitScript(installWindowGeometry);
      await page.addInitScript(installFakeTabs);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      const peer = createFakeChromePeer(t.core.relay).start();
      const tabs = () => page.evaluate(() => window.__tabs.map((x) => ({ ...x })));
      const announced = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="optics"] [aria-live]')].map((e) => e.textContent).join(' | '));
      const ask = async (words) => {
        const field = page.locator(tid('optics-ask'));
        await field.fill(words);
        await field.press('Enter');
      };
      const openOptics = async () => {
        await t.goto('/?optics=1');
        await t.visible('optics');
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-camera')) === 'live', { timeout: 20000, message: 'the camera to go live' });
      };
      await withPeer(peer, async () => {
        await t.waitFor(() => peer.received.some((m) => m.kind === 'hello'), { timeout: 15000, message: 'the app’s hello' });
        await page.waitForTimeout(1500);
        await openOptics();
        await t.step('linked: the Jarvis window, placed beside Jarvis and not focused; nothing opens here', async () => {
          await ask('open YouTube in Chrome');
          const open = await peer.waitFor('open');
          t.assert(open.body.url === 'https://www.youtube.com/', `the address (${open.body.url})`);
          const r = open.body.rect;
          t.assert(r && r.width >= 100 && r.height >= 100 && open.body.focus === false, `a rectangle, not focused (${JSON.stringify(open.body)})`);
          await t.waitFor(async () => /open in the Jarvis window, beside me/i.test(await announced()), { timeout: 8000, message: async () => `Optics to say so (${await announced()})` });
          t.assert((await tabs()).filter((x) => x.sent).length === 0, 'no page opened here');
          t.assert((await page.locator(tid('optics')).getAttribute('data-camera')) === 'live', 'the camera stays live');
        });
        await t.step('the extension offline: a window here beside Jarvis, said once', async () => {
          peer.setOnline(false, { seenAgoMs: 5 * 60_000 });
          await page.waitForTimeout(800);
          await page.addInitScript(() => {
            try {
              const r = JSON.parse(localStorage.getItem('jarvis.chromeLink.v1') || 'null');
              if (r) {
                r.extSeenAt = Date.now() - 2 * 60_000;
                localStorage.setItem('jarvis.chromeLink.v1', JSON.stringify(r));
              }
            } catch {
              /* storage unavailable */
            }
          });
          const sent = kinds(peer, 'open').length;
          await openOptics();
          await ask('open YouTube in Chrome');
          const tab = await t.waitFor(async () => (await tabs()).find((x) => x.sent) || null, { timeout: 10000, message: 'the page to open here' });
          t.assert(/^jarvis-link-/.test(tab.name) && /^popup=1,/.test(tab.features || ''), `a window placed beside Jarvis (${tab.name}, ${tab.features})`);
          t.assert(tab.sent === 'https://www.youtube.com/', `the same address (${tab.sent})`);
          await t.waitFor(async () => /can’t reach (Jarvis for Chrome|the Jarvis window)/i.test(await announced()), { timeout: 8000, message: async () => `Jarvis to say he can't reach it (${await announced()})` });
          t.assert(kinds(peer, 'open').length === sent, 'nothing sent to the offline extension');
          t.assert(t.requests('lead').length === 0, 'free: nothing went to Claude');
        });
      });
    },
  },
  {
    name: 'join-hidden-optics',
    title: 'Mac, Voice Mode listening, then Jarvis goes into the background (another app in front): "open optics" heard there says the camera needs him on screen, with one notification; its click, Jarvis in front again, opens Optics with the camera live; free (A1 + E2)',
    device: 'mac',
    timeout: 240000,
    browserArgs: cameraArgs('desk-landscape.y4m'),
    async run(t) {
      const page = await t.newPage();
      await page.context().addInitScript(installCameraRig, { devices: [{ label: 'FaceTime HD Camera (Built-in) (05ac:8514)' }] });
      await page.addInitScript(installFakeSpeech, { noSpeechMs: 15000 });
      await page.addInitScript(installNotifyProbe);
      await page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await page.context().grantPermissions(['camera']);
      await t.goto('/', { page });
      await (await t.visible('voice-open', { page })).click();
      await t.visible('voice-mode', { page });
      await t.waitFor(async () => (await voiceState(page)) === 'listening', { timeout: 15000, message: 'Voice Mode to listen' });
      await setHidden(page, true);
      await page.waitForTimeout(500);
      await t.step('heard in the background: the line and one notification, no camera', async () => {
        t.assert((await voiceState(page)) === 'listening', `still listening in the background (${await voiceState(page)})`);
        await page.evaluate(() => window.__voice.say({ parts: [{ at: 300, text: 'Open optics.', final: true }] }));
        await waitSaid(t, 'The camera only runs while I’m on screen. Click the notification to bring me up.', 'the line about the notification', { timeout: 30000, page });
        const n = (await notes(page)).filter((x) => /camera/i.test(x.title + x.body));
        t.assert(n.length === 1, `one notification about the camera (${JSON.stringify(await notes(page))})`);
        t.assert((await t.count('optics')) === 0, 'no Optics while hidden');
      });
      await t.step('its click, Jarvis in front: Optics opens, the camera live', async () => {
        await setHidden(page, false);
        await page.evaluate(() => {
          const n = window.__notes.find((x) => /camera/i.test(x.title + x.body));
          if (n && typeof n.onclick === 'function') n.onclick();
        });
        await t.visible('optics', { page, timeout: 15000, message: 'Optics to open from the notification' });
        await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-camera')) === 'live', { timeout: 20000, message: 'the camera to go live' });
        t.assert(leadCount(t) === 0, 'nothing sent to Claude');
      });
    },
  },
  {
    name: 'join-hidden-prompt',
    title: 'Mac, Standby in the background, Jarvis for Chrome linked: Chrome’s question becomes a notification ("Chrome asks"); at the wake the greeting starts with "Chrome is waiting for you: …", and "approve" answers it after its check (A1 + G5 + D3)',
    device: 'mac',
    seed: LINKED_HOME,
    fakeCore: true,
    fakeMusic: true,
    allowConsole: NETWORK_NOISE,
    timeout: 240000,
    async run(t) {
      const { page, peer } = await linkedPage(t, {
        init: [
          [installFakeSpeech, { noSpeechMs: 4000 }],
          [installFakeMic, { wakeLock: true }],
          [installNotifyProbe, null],
          [() => (window.__voice.queue = []), null],
        ],
      });
      await withPeer(peer, async () => {
        await enterStandby(t, page);
        await setHidden(page, true);
        let prompt;
        await t.step('Chrome asks while Jarvis sleeps in the background: a notification, nothing said', async () => {
          prompt = await peer.prompt(CART);
          await t.waitFor(async () => (await notes(page)).some((n) => n.title === 'Chrome asks' && /27-inch 4K monitor/.test(n.body)), { timeout: 15000, message: async () => `the notification (${JSON.stringify(await notes(page))})` });
          t.assert((await said(page)).length === 0, 'nothing said yet');
        });
        await t.step('the wake: the greeting starts with Chrome’s question; "approve" answers it after its check', async () => {
          await queue(page, '');
          await wakeByClaps(t, page);
          await waitSaid(t, /^Chrome is waiting for you: .*27-inch 4K monitor/, 'the greeting to start with Chrome', { timeout: 20000, page });
          await sayToVoice(t, 'Approve.', { page });
          await waitSaid(t, 'Approving. Say cancel to stop.', 'the approval’s check', { timeout: 15000, page });
          const answer = await peer.waitFor('answer');
          t.assert(answer.body.promptId === prompt.promptId && answer.body.hash === prompt.hash && answer.body.choice === 'approve', `one decision bound to the prompt (${JSON.stringify(answer.body)})`);
          t.assert(leadCount(t) === 0, 'nothing sent to Claude');
        });
      });
    },
  },
];
