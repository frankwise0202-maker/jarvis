// Windows by voice (v8.1, SPEC §31): several named windows, layouts that keep Jarvis in view, voice that
// follows the hologram into its window, "do this in this window".
//
//   windows-several         "put the hologram in a window", "put the report in another window": two windows,
//                           the first moved over so a strip of Jarvis stays in view; asked again, the
//                           hologram's window is raised, not doubled; "do this in this window" names the
//                           window with the focus, else the main one
//   windows-close-by-name   spoken: "close the report window", "bring the hologram back" act on that one
//                           only, and Jarvis says which; "close the window" closes the newest
//   windows-side-by-side    "side by side", "report on the left, hologram on the right": on one monitor (a
//                           strip of Jarvis kept) and with two (on the other monitor, Jarvis in full view)
//   windows-swap-resize     D5: "swap them", "make the report window smaller", "… fill the screen" (Jarvis's
//                           strip kept); a floating panel says to drag its corner
//   windows-float-jarvis    D6: "float yourself": Jarvis in the real floating panel, in place of a floating
//                           hologram (said); it follows Voice Mode; "close the float"
//   windows-follow-content  the hologram in a window: "explode it", "show the hybrid battery" said in Voice
//                           Mode act there (no viewer opens here, nothing goes to Claude); its window
//                           closed by hand, "expand it" opens it here again, as before
//
// The windows are real screen windows (the app in screen mode). A 1440×900 laptop screen is stubbed with
// Jarvis maximized on it; each popup keeps its own place on that screen, and moveTo / resizeTo are
// recorded in window.__moves (headless Chromium has no desktop to place windows on).

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';
import { installScreenStubs, opensPage, screenAttr, toastText, typeCommand, waitAttr } from './screens.mjs';

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Init script for the main window: a 1440×900 laptop screen (menu bar 25 px), Jarvis maximized on
 * it, and each popup's place kept as on a desktop (where it opened, then where it was moved), with
 * every moveTo / resizeTo recorded: window.__moves = [[name, 'move' | 'size', x, y]].
 */
export function installWindowGeometry() {
  if (window.opener || /[?&]screen=/.test(location.search)) return;
  const def = (obj, name, value) => {
    try {
      Object.defineProperty(obj, name, { configurable: true, get: () => value });
    } catch {
      /* read-only here */
    }
  };
  for (const [k, v] of Object.entries({ width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875 })) def(window.screen, k, v);
  for (const [k, v] of Object.entries({ screenX: 0, screenY: 25, screenLeft: 0, screenTop: 25, outerWidth: 1440, outerHeight: 875 })) def(window, k, v);
  window.__moves = [];
  window.__geo = {}; // name -> the popup's place (installPopupGeometry reads it in the popup itself)
  const open = window.open;
  window.open = function openPlaced(url, name, features) {
    const w = open.call(window, url, name, features);
    if (!w) return w;
    const n = String(name || '');
    try {
      const f = Object.fromEntries(String(features || '').split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), Number(v)]));
      const geo = { left: f.left || 0, top: f.top || 0, width: f.width || 800, height: f.height || 600 };
      window.__geo[n] = geo;
      for (const [prop, key] of [['screenX', 'left'], ['screenLeft', 'left'], ['screenY', 'top'], ['screenTop', 'top'], ['outerWidth', 'width'], ['outerHeight', 'height']]) Object.defineProperty(w, prop, { configurable: true, get: () => geo[key] });
      w.moveTo = (x, y) => {
        window.__moves.push([n, 'move', x, y]);
        geo.left = x;
        geo.top = y;
      };
      w.resizeTo = (x, y) => {
        window.__moves.push([n, 'size', x, y]);
        geo.width = x;
        geo.height = y;
      };
    } catch {
      /* a page from another site */
    }
    return w;
  };
}

/**
 * Init script for the whole context: in a screen window, its own moveTo / resizeTo and place follow the
 * main window's record of it (installWindowGeometry), once its page has loaded.
 */
export function installPopupGeometry() {
  let main = null;
  try {
    main = window.opener;
  } catch {
    main = null;
  }
  if (!main || !/[?&]screen=/.test(location.search)) return;
  const name = window.name;
  const geo = main.__geo && main.__geo[name];
  if (!geo) return;
  for (const [prop, key] of [['screenX', 'left'], ['screenLeft', 'left'], ['screenY', 'top'], ['screenTop', 'top'], ['outerWidth', 'width'], ['outerHeight', 'height']]) {
    try {
      Object.defineProperty(window, prop, { configurable: true, get: () => geo[key] });
    } catch {
      /* read-only here */
    }
  }
  window.moveTo = (x, y) => {
    main.__moves.push([name, 'move', x, y]);
    geo.left = x;
    geo.top = y;
  };
  window.resizeTo = (x, y) => {
    main.__moves.push([name, 'size', x, y]);
    geo.width = x;
    geo.height = y;
  };
}

/** Where a screen window was last put: [left, top, width, height] from its opening features and moves. */
async function placeOf(t, popup) {
  const name = await popup.evaluate(() => window.name);
  return t.page.evaluate((name) => {
    const open = window.__opens.filter((o) => o.name === name || (o.url && o.url.includes(`s=${name.replace(/^jarvis-/, '')}`))).at(-1);
    const f = Object.fromEntries(String((open && open.features) || '').split(',').map((kv) => kv.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k, Number(v)]));
    const place = [f.left, f.top, f.width, f.height];
    for (const [n, kind, x, y] of window.__moves) {
      if (n !== name) continue;
      if (kind === 'move') [place[0], place[1]] = [x, y];
      else [place[2], place[3]] = [x, y];
    }
    return place;
  }, name);
}

async function sendDone(t, text) {
  const turn = await t.send(text);
  await t.waitForTurn(turn, ['done'], { timeout: 120000 });
  return turn;
}

/** The app with a hologram and a report to put in windows. */
async function start(t, { monitors = 1, perm = 'prompt', voice = false } = {}) {
  t.page = await t.newPage(); // a fresh page each time (windows-side-by-side starts twice)
  await t.page.addInitScript(installScreenStubs, { monitors, perm });
  await t.page.addInitScript(installWindowGeometry);
  await t.page.context().addInitScript(installPopupGeometry);
  if (voice) {
    await t.page.addInitScript(installFakeSpeech);
    await t.page.addInitScript(() => {
      window.__voice.queue = [];
    });
  }
  await t.goto('/');
  await sendDone(t, '[[hologram:camry]] Show me a 2024 Toyota Camry Hybrid');
  await sendDone(t, '[[search]] What does a 2024 Camry Hybrid cost?');
}

async function openBoth(t) {
  const holo = await opensPage(t, () => typeCommand(t, 'put the hologram in a window'));
  await holo.waitForSelector(tid('app', { 'data-ready': 'true' }), { state: 'attached', timeout: 20000 });
  await waitAttr(t, holo, 'screen', 'kind', 'hologram');
  const report = await opensPage(t, () => typeCommand(t, 'put the report in another window'));
  await report.waitForSelector(tid('app', { 'data-ready': 'true' }), { state: 'attached', timeout: 20000 });
  await waitAttr(t, report, 'screen', 'kind', 'answer');
  return { holo, report };
}

/** Say words in Voice Mode (it listens for the next queued words) and wait for Jarvis's line. */
async function speak(t, words, expect, { timeout = 20000 } = {}) {
  const before = await t.page.evaluate(() => window.__voice.said.length);
  await t.page.evaluate((w) => window.__voice.queue.push(w), words);
  const vm = t.page.locator(tid('voice-mode'));
  if ((await vm.getAttribute('data-state')) === 'idle') await (await t.visible('voice-core')).click();
  return t.waitFor(async () => {
    const said = await t.page.evaluate((n) => window.__voice.said.slice(n), before);
    const line = said.map(norm).find((x) => (typeof expect === 'string' ? x === expect : expect.test(x)));
    return line || null;
  }, { timeout, message: async () => `Jarvis to say ${expect} after "${words}" (said: ${(await t.page.evaluate(() => window.__voice.said)).slice(-4).join(' | ')})` });
}

export default [
  {
    name: 'windows-several',
    title: 'Several windows, each named: the hologram, then the report in another window (the first moves over, a strip of Jarvis stays in view); asked again, raised not doubled; "do this in this window" names the window with the focus, else the main one',
    device: 'desktop',
    timeout: 300000,
    async run(t) {
      await start(t);
      let holo;
      let report;

      await t.step('two windows: the first on the right half, then both side by side beside a strip of Jarvis', async () => {
        ({ holo, report } = await openBoth(t));
        t.assert(!holo.isClosed() && !report.isClosed(), 'both windows are open');
        const holoPlace = await placeOf(t, holo);
        const reportPlace = await placeOf(t, report);
        t.assert(JSON.stringify(holoPlace) === JSON.stringify([320, 25, 560, 875]), `the hologram's window moved over (${holoPlace})`);
        t.assert(JSON.stringify(reportPlace) === JSON.stringify([880, 25, 560, 875]), `the report's window beside it (${reportPlace})`);
        t.assert(/own window/i.test(await toastText(t)), `a toast says so (${await toastText(t)})`);
        await t.screenshot('two-windows', report);
      });

      await t.step('the hologram again: its window is raised, not opened twice', async () => {
        const pages = t.page.context().pages().length;
        await typeCommand(t, 'put the hologram in another window');
        await t.page.waitForTimeout(400);
        t.assert(t.page.context().pages().length === pages, 'no new window');
        t.assert(/already in its own window/i.test(await toastText(t)), `said so (${await toastText(t)})`);
      });

      await t.step('"do this in this window": the window with the focus, else the main one', async () => {
        await report.evaluate(() => {
          document.hasFocus = () => true;
        });
        await holo.evaluate(() => {
          document.hasFocus = () => false;
        });
        await typeCommand(t, 'do this in this window');
        await t.waitFor(async () => /Working in the report window/.test(await toastText(t)), { timeout: 5000, message: async () => `the report window named (${await toastText(t)})` });
        await report.evaluate(() => {
          document.hasFocus = () => false;
        });
        await typeCommand(t, "we'll do this in this window");
        // The main window: the window "we" were working in comes back here.
        await t.waitFor(() => report.isClosed(), { timeout: 8000, message: 'the report window to come back' });
        t.assert(/back in the main window/i.test(await toastText(t)), `said so (${await toastText(t)})`);
        t.assert(!holo.isClosed(), 'the hologram window stays');
      });
    },
  },

  {
    name: 'windows-close-by-name',
    title: 'Spoken: "close the report window" and "bring the hologram back" act on that one only (Jarvis says which); "close the window" closes the newest; nothing goes to Claude',
    device: 'desktop',
    timeout: 300000,
    async run(t) {
      await start(t, { voice: true });
      let { holo, report } = await openBoth(t);
      const lead = t.requests('lead').length;
      const openVoice = async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
      };
      const closeVoice = async () => {
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
      };

      await t.step('"close the report window": that one only', async () => {
        await openVoice();
        await speak(t, 'Close the report window.', 'Closed the report window.');
        await t.waitFor(() => report.isClosed(), { timeout: 8000, message: 'the report window to close' });
        t.assert(!holo.isClosed(), 'the hologram window stays open');
        await closeVoice();
      });

      await t.step('"bring the hologram back": its window closes and the hologram shows here; the other stays', async () => {
        report = await opensPage(t, () => typeCommand(t, 'put the report in another window'));
        await openVoice();
        await speak(t, 'Bring the hologram back.', 'Brought it back.');
        await t.waitFor(() => holo.isClosed(), { timeout: 8000, message: 'the hologram window to close' });
        await t.visible('hologram-viewer', { timeout: 15000, message: 'the hologram shows in the main window' });
        t.assert(!report.isClosed(), 'the report window stays');
      });

      await t.step('"close the window": the newest one', async () => {
        await speak(t, 'Close the window.', /^Closed\.$/);
        await t.waitFor(() => report.isClosed(), { timeout: 8000, message: 'the newest window to close' });
        t.assert(t.requests('lead').length === lead, `nothing went to Claude (${t.requests('lead').length - lead} requests)`);
        holo = null;
      });
    },
  },

  {
    name: 'windows-side-by-side',
    title: '"Side by side", "report on the left, hologram on the right": on one monitor beside a strip of Jarvis; with two monitors (window placement allowed) on the other one, Jarvis in full view',
    device: 'desktop',
    timeout: 300000,
    async run(t) {
      await t.step('one monitor: the strip of Jarvis is kept', async () => {
        await start(t);
        const { holo, report } = await openBoth(t);
        await typeCommand(t, 'report on the left, hologram on the right');
        await t.waitFor(async () => /on the left, hologram on the right/i.test(await toastText(t)), { timeout: 5000, message: async () => `said so (${await toastText(t)})` });
        const r = await placeOf(t, report);
        const h = await placeOf(t, holo);
        t.assert(JSON.stringify(r) === JSON.stringify([320, 25, 560, 875]) && JSON.stringify(h) === JSON.stringify([880, 25, 560, 875]), `report left, hologram right (${r} / ${h})`);
        await typeCommand(t, 'side by side');
        t.assert(/side by side/i.test(await toastText(t)), `said so (${await toastText(t)})`);
        for (const place of [await placeOf(t, report), await placeOf(t, holo)]) t.assert(place[0] >= 320, `nothing over Jarvis's strip (${place})`);
      });

      await t.step('two monitors: the windows go to the other one', async () => {
        await start(t, { monitors: 2, perm: 'granted' });
        const { holo, report } = await openBoth(t);
        await typeCommand(t, 'side by side');
        await t.waitFor(async () => /other screen/i.test(await toastText(t)), { timeout: 5000, message: async () => `said so (${await toastText(t)})` });
        const h = await placeOf(t, holo);
        const r = await placeOf(t, report);
        t.assert(JSON.stringify([h, r]) === JSON.stringify([[1440, 0, 1280, 1415], [2720, 0, 1280, 1415]]), `halves of the second monitor (${h} / ${r})`);
      });
    },
  },

  {
    name: 'windows-swap-resize',
    title: '"Swap them", "make the report window smaller", "make the report window fill the screen" (a strip of Jarvis kept); a floating panel can\'t be resized by script, and Jarvis says to drag its corner',
    device: 'desktop',
    timeout: 300000,
    async run(t) {
      await start(t);
      const { holo, report } = await openBoth(t);

      await t.step('"swap them": the two windows change places', async () => {
        await typeCommand(t, 'swap them');
        await t.waitFor(async () => /Swapped/.test(await toastText(t)), { timeout: 5000, message: async () => `said so (${await toastText(t)})` });
        t.assert(JSON.stringify(await placeOf(t, holo)) === JSON.stringify([880, 25, 560, 875]), `the hologram on the right (${await placeOf(t, holo)})`);
        t.assert(JSON.stringify(await placeOf(t, report)) === JSON.stringify([320, 25, 560, 875]), `the report on the left (${await placeOf(t, report)})`);
      });

      await t.step('smaller, then filling the screen beside Jarvis', async () => {
        await typeCommand(t, 'make the report window smaller');
        t.assert(JSON.stringify(await placeOf(t, report)) === JSON.stringify([376, 113, 448, 700]), `smaller around its centre (${await placeOf(t, report)})`);
        await typeCommand(t, 'make the report window fill the screen');
        t.assert(JSON.stringify(await placeOf(t, report)) === JSON.stringify([320, 25, 1120, 875]), `all but Jarvis's strip (${await placeOf(t, report)})`);
        t.assert(/fills the screen/i.test(await toastText(t)), `said so (${await toastText(t)})`);
      });

      await t.step('a floating panel: "drag its corner"', async () => {
        await typeCommand(t, 'close all windows');
        await t.waitFor(() => holo.isClosed() && report.isClosed(), { timeout: 8000, message: 'the windows to close' });
        const pip = await opensPage(t, () => typeCommand(t, 'float the report'));
        await pip.waitForSelector(tid('screen'), { timeout: 10000 });
        await typeCommand(t, 'make the report window bigger');
        await t.waitFor(async () => /Drag its corner/.test(await toastText(t)), { timeout: 5000, message: async () => `said why (${await toastText(t)})` });
        await typeCommand(t, 'close the float');
      });
    },
  },

  {
    name: 'windows-float-jarvis',
    title: '"Float yourself": Jarvis in the real floating panel (his core, the state word), in place of a floating hologram (said); it follows Voice Mode (LISTENING); typed, no extra tap; closing it',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 1 });
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await sendDone(t, '[[hologram:camry]] Show me a 2024 Toyota Camry Hybrid');
      let pip;

      await t.step('a floating hologram, then "float yourself": Jarvis takes its place, and says so', async () => {
        pip = await opensPage(t, () => typeCommand(t, 'float the hologram'));
        await pip.waitForSelector(tid('screen-hologram'), { timeout: 10000 });
        const pages = t.page.context().pages().length;
        await typeCommand(t, 'float yourself');
        await pip.waitForSelector(tid('float-jarvis'), { timeout: 10000 });
        t.assert(t.page.context().pages().length === pages, 'the same floating panel');
        t.assert(/Jarvis is floating, in place of the hologram/.test(await toastText(t)), `said so (${await toastText(t)})`);
        t.assert((await screenAttr(pip, 'kind')) === 'jarvis', 'the panel shows Jarvis');
        await t.waitFor(async () => (await pip.locator(tid('float-jarvis-word')).textContent()) === 'ONLINE', { timeout: 5000, message: 'the state word' });
        await pip.setViewportSize({ width: 300, height: 260 });
        await pip.waitForTimeout(400);
        await t.screenshot('float-jarvis', pip);
      });

      await t.step('it follows Jarvis: Voice Mode listening shows LISTENING there', async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        await t.waitFor(async () => (await pip.locator(tid('float-jarvis')).getAttribute('data-state')) === 'listening', { timeout: 10000, message: async () => `the panel to say LISTENING (${await pip.locator(tid('float-jarvis')).getAttribute('data-state')})` });
        t.assert((await pip.locator(tid('float-jarvis-word')).textContent()) === 'LISTENING', 'the state word');
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
      });

      await t.step('"close the float": the panel closes', async () => {
        await typeCommand(t, 'close the float');
        await t.waitFor(() => pip.isClosed(), { timeout: 8000, message: 'the floating panel to close' });
      });
    },
  },

  {
    name: 'windows-follow-content',
    title: 'Voice follows the hologram into its window: shown over Voice Mode, then "put it in a window"; "explode it" and "show the hybrid battery" act there (nothing to Claude); closed by hand it comes back here, and "expand it" acts here, as before',
    device: 'desktop',
    timeout: 300000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 1 });
      await t.page.addInitScript(installWindowGeometry);
      await t.page.context().addInitScript(installPopupGeometry);
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = [];
      });
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');
      let holo;

      await t.step('a hologram over Voice Mode, then "put it in a window": it moves out (the viewer here closes)', async () => {
        await t.page.evaluate(() => window.__voice.queue.push('[[hologram:camry]] Show me a 2024 Toyota Camry Hybrid'));
        const vm = t.page.locator(tid('voice-mode'));
        if ((await vm.getAttribute('data-state')) === 'idle') await (await t.visible('voice-core')).click();
        await t.visible('hologram-viewer', { timeout: 60000, message: 'the hologram over Voice Mode' });
        await t.waitFor(async () => (await t.page.locator(tid('hologram-viewer')).getAttribute('data-state')) === 'ready', { timeout: 60000, message: 'the hologram to be built' });
        holo = await opensPage(t, () => speak(t, 'Put it in a window.', /own window/i, { timeout: 30000 }), { timeout: 30000 });
        await holo.setViewportSize({ width: 720, height: 800 });
        await holo.waitForSelector(tid('app', { 'data-ready': 'true' }), { state: 'attached', timeout: 20000 });
        await waitAttr(t, holo, 'screen-hologram', 'gl', 'ready', { timeout: 45000, label: 'the hologram in its window' });
        await t.waitFor(async () => (await t.count('hologram-viewer')) === 0, { timeout: 8000, message: 'the viewer here to close (one 3D view)' });
      });

      const lead = t.requests('lead').length;
      await t.step('"explode it": the hologram in its window explodes; no viewer opens here', async () => {
        await speak(t, 'Explode it.', /./);
        await waitAttr(t, holo, 'screen-hologram', 'exploded', '1', { timeout: 20000, label: "the window's hologram" });
        t.assert((await t.count('hologram-viewer')) === 0, 'no hologram viewer opened in the main window');
      });

      await t.step('"show the hybrid battery": picked in that window', async () => {
        await speak(t, 'Show the hybrid battery.', /hybrid battery/i);
        await waitAttr(t, holo, 'screen-hologram', 'selected', 'hybrid-battery', { timeout: 20000, label: 'the part picked in the window' });
        t.assert((await t.count('hologram-viewer')) === 0, 'still no viewer here');
        t.assert(t.requests('lead').length === lead, 'nothing went to Claude');
        await t.screenshot('battery-in-window', holo);
      });

      await t.step('its window closed by hand: the hologram comes back here, and "expand it" acts here, as before', async () => {
        await (await t.visible('screen-close', { page: holo })).click();
        await t.waitFor(() => holo.isClosed(), { timeout: 8000, message: 'the window to close' });
        await t.visible('hologram-viewer', { timeout: 15000, message: 'the hologram handed back to the main window' });
        await t.waitFor(async () => (await t.page.locator(tid('hologram-viewer')).getAttribute('data-state')) === 'ready', { timeout: 30000, message: 'the viewer to be ready' });
        await speak(t, 'Expand it.', /./);
        await t.waitFor(async () => (await t.page.locator(tid('hologram-viewer')).getAttribute('data-exploded')) === '1', { timeout: 15000, message: 'the viewer here to explode' });
        t.assert(t.requests('lead').length === lead, 'nothing went to Claude');
      });
    },
  },
];
