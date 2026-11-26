// "Pull this up in Chrome" (v8.1 G1, SPEC §31.6): free, local, a normal tab (or a window beside Jarvis).
//
//   chrome-tab-open          after a reply with links: "pull this up in Chrome" opens a tab (no window
//                            features, blank first, opener cut, then the first link: "That reply has N links;
//                            I opened the first."); "open the second link"; spoken with pop-ups blocked, the
//                            one-tap "Open in Chrome" button; nothing goes to Claude
//   chrome-tab-search-check  "google USB-C chargers" spoken: the 2-second check shows the words before
//                            anything opens; "no, I said …" fixes them; cancel opens nothing
//   chrome-tab-beside        Optics open (the camera live): "pull this up in Chrome" opens a window placed
//                            beside Jarvis (a strip of him in view), not a tab; the camera stays live
//
// Web pages never load here (the E2E guard allows no third-party request): window.open('about:blank', …),
// the way the app opens a page, returns a recorder (installFakeTabs) that keeps the window name, the
// features, the opener and where location.replace sent it. The app's own screen windows open for real.

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';
import { installScreenStubs, toastText, typeCommand } from './screens.mjs';
import { installWindowGeometry } from './windows.mjs';

/**
 * Init script for the main window: window.open('about:blank', …) returns a recorder instead of a real
 * window (window.__tabs: [{ name, features, opener, sent, blocked, closed }]). With { block: true } (or
 * window.__blockTabs), an open without a click in the last 400 ms is refused, like Chrome's pop-up blocker.
 */
export function installFakeTabs(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (window.opener || /[?&]screen=/.test(location.search)) return;
  let lastClick = -Infinity;
  window.addEventListener('click', (e) => {
    if (e.isTrusted) lastClick = performance.now();
  }, true);
  window.__tabs = [];
  window.__blockTabs = !!o.block;
  const open = window.open;
  window.open = function openRecorded(url, name, features) {
    if (String(url) !== 'about:blank') return open.call(window, url, name, features);
    const recent = performance.now() - lastClick < 400;
    const rec = { name: String(name || ''), features: features === undefined ? null : String(features), opener: 'kept', sent: null, blocked: false, closed: false };
    window.__tabs.push(rec);
    if (window.__blockTabs && !recent) {
      rec.blocked = true;
      return null;
    }
    return {
      get opener() {
        return rec.opener === 'kept' ? window : null;
      },
      set opener(v) {
        rec.opener = v === null ? null : 'kept';
      },
      get closed() {
        return rec.closed;
      },
      location: {
        replace(u) {
          rec.sent = String(u);
        },
      },
      close() {
        rec.closed = true;
      },
      focus() {},
      moveTo() {},
      resizeTo() {},
      document: { hasFocus: () => false },
    };
  };
}

const tabs = (t) => t.page.evaluate(() => window.__tabs.map((x) => ({ ...x })));

async function sendDone(t, text) {
  const turn = await t.send(text);
  await t.waitForTurn(turn, ['done'], { timeout: 120000 });
  return turn;
}

/** The newest reply's links, in order, as the app reads them (absolute http(s) hrefs). */
async function replyLinks(turn) {
  return turn.locator(`${tid('segment-text')} a[href^="http"]`).evaluateAll((as) => [...new Set(as.map((a) => a.href))]);
}

export default [
  {
    name: 'chrome-tab-open',
    title: '"Pull this up in Chrome" after a reply with links: a tab (no features, opener cut) with the first link, and Jarvis says so; "open the second link"; spoken with pop-ups blocked, the one-tap "Open in Chrome" button; all free',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 1 });
      await t.page.addInitScript(installFakeTabs);
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      const turn = await sendDone(t, '[[search]] What are the best USB-C chargers?');
      const links = await replyLinks(turn);
      t.assert(links.length >= 2, `the reply has links (${links.length})`);
      const lead = t.requests('lead').length;

      await t.step('"pull this up in Chrome": a tab with the first link; said that it was the first of several', async () => {
        await typeCommand(t, 'pull this up in Chrome');
        const [tab] = await t.waitFor(async () => {
          const list = await tabs(t);
          return list.length && list[0].sent ? list : null;
        }, { timeout: 8000, message: 'a tab to open' });
        t.assert(tab.name === '_blank' && tab.features === null, `a plain tab, no window features (${JSON.stringify(tab)})`);
        t.assert(tab.opener === null, 'the page can\'t reach Jarvis (opener cut)');
        t.assert(tab.sent === links[0], `the first link (${tab.sent} vs ${links[0]})`);
        t.assert(new RegExp(`That reply has ${links.length} links; I opened the first`).test(await toastText(t)), `said which (${await toastText(t)})`);
      });

      await t.step('"open the second link": that one', async () => {
        await typeCommand(t, 'open the second link');
        await t.waitFor(async () => (await tabs(t)).length === 2, { timeout: 8000, message: 'a second tab' });
        t.assert((await tabs(t))[1].sent === links[1], 'the second link');
      });

      await t.step('spoken, pop-ups blocked: the one-tap "Open in Chrome" button opens it', async () => {
        await t.page.evaluate(() => {
          window.__blockTabs = true;
        });
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        await t.page.evaluate(() => window.__voice.queue.push('Open the first link.'));
        const vm = t.page.locator(tid('voice-mode'));
        if ((await vm.getAttribute('data-state')) === 'idle') await (await t.visible('voice-core')).click();
        await t.visible('chrome-tap', { timeout: 20000, message: 'the one-tap button' });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.map((x) => x.replace(/\s+/g, ' ')).join(' | '))).includes('Tap Open in Chrome'), { timeout: 15000, message: 'Jarvis to say to tap' });
        t.assert((await tabs(t)).at(-1).blocked, 'the spoken open was blocked');
        await (await t.visible('chrome-tap-button')).click();
        await t.waitFor(async () => (await tabs(t)).at(-1).sent === links[0], { timeout: 8000, message: 'the tap to open it' });
        t.assert((await t.count('chrome-tap')) === 0, 'the button went away');
        t.assert(t.requests('lead').length === lead, `nothing went to Claude (${t.requests('lead').length - lead})`);
        await (await t.visible('voice-close')).click();
      });
    },
  },

  {
    name: 'chrome-tab-beside',
    title: 'Optics open, the camera live: "pull this up in Chrome" opens a window placed beside Jarvis (a strip of him in view), not a tab; the camera stays live; free',
    device: 'mac',
    timeout: 240000,
    browserArgs: () => ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(installScreenStubs, { monitors: 1 });
      await page.addInitScript(installWindowGeometry);
      await page.addInitScript(installFakeTabs);
      await page.context().grantPermissions(['camera']);
      await t.goto('/');
      await sendDone(t, '[[search]] What are the best USB-C chargers?');
      const lead = t.requests('lead').length;
      await t.goto('/?optics=1');
      await t.visible('optics');
      await t.waitFor(async () => (await page.locator(tid('optics')).getAttribute('data-camera')) === 'live', { timeout: 20000, message: 'the camera to go live' });

      await t.step('a window beside Jarvis, placed with a strip of him in view', async () => {
        const ask = page.locator(tid('optics-ask'));
        await ask.fill('pull this up in Chrome');
        await ask.press('Enter');
        const tab = await t.waitFor(async () => (await tabs(t)).find((x) => x.sent) || null, { timeout: 8000, message: 'the page to open' });
        t.assert(/^jarvis-link-/.test(tab.name), `a window of Jarvis's, not a tab (${tab.name})`);
        t.assert(tab.features === 'popup=1,left=720,top=25,width=720,height=875', `placed beside Jarvis (${tab.features})`);
        t.assert(tab.opener === null, 'the page can\'t reach Jarvis');
        t.assert(/open beside me/i.test(await toastText(t)), `said so (${await toastText(t)})`);
        t.assert((await page.locator(tid('optics')).getAttribute('data-camera')) === 'live', 'the camera stays live');
        t.assert(t.requests('lead').length === lead, 'nothing went to Claude');
      });
    },
  },
];
