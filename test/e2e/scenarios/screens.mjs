// Screens (v7): "open this on my other screen", "float it", "open it in a window", "bring it back".
//
//   screens-pages      screen mode (?screen=<kind>) renders each kind in the HUD frame: hologram
//                      (WebGL), blueprint, Mission Control, report, photo, link, the camera (none here;
//                      the live camera on a screen is optics-screens)
//   screens-sync       a second page follows a live mission and a streaming answer (BroadcastChannel)
//   screens-pip        the REAL Document Picture-in-Picture of headless Chromium: the floating HUD
//                      panel with the app's stylesheets copied in and the hologram drawn by WebGL in
//                      that window; swapping content without a gesture; the snapshot fallback when
//                      the panel's WebGL fails
//   screens-monitor    a second monitor (the Window Management API stubbed: headless has one screen):
//                      the screen window on it, the permission explainer, moving out of the in-app
//                      viewer, closing hands back, "bring it back"
//   screens-fallbacks  popups blocked under a spoken command: the one-tap button and the one-time
//                      tip over Voice Mode
//   screens-no-apis    no Window Management and no PiP (Safari-like): windows, and the owner is told
//   screens-pip-snapshot  the floating panel's WebGL fails: a live-updating snapshot instead
//   screens-phone      the iPhone: the phone layout is untouched, and screens open full screen in-app
//   screens-tool       Jarvis decides (lead tools V5): open_screen through the real app and the strict
//                      mock ([[screen:<what>:<where>]]): a window on screen 2, the one tap a floating
//                      panel needs, "back"; the reply is one short sentence read from the result
//
// State is read from data-* hooks ([data-testid="screen"] data-kind/data-state/data-where, each
// panel's data-gl/data-parts/data-status…), never from pixels.

import { tid } from '../harness.mjs';
import { installFakeSpeech } from './features.mjs';

const WIKI_PHOTO = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/Toyota_Camry_Hybrid.jpg/1280px-Toyota_Camry_Hybrid.jpg';

/**
 * Init script for the main window (pages in screen mode and popups are left alone):
 *   monitors: 2 (default) or 1      a fake Window Management API (getScreenDetails, the permission)
 *   perm: 'granted' | 'prompt' | 'denied'
 *   noWm / noPip                     remove those APIs (Safari, Firefox)
 *   blockPopups                      window.open returns null unless a real click happened just
 *                                    before (a popup blocker, as for a spoken command)
 *   pipNoWebGL                       no WebGL inside the floating window (the snapshot fallback)
 * Records window.__opens = [{ url, features, recent }].
 */
export function installScreenStubs(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  if (window.opener || /[?&]screen=/.test(location.search)) return;
  const remove = (name) => {
    try {
      delete window[name];
    } catch {
      /* not configurable */
    }
    if (name in window) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
  };
  const LAPTOP = { left: 0, top: 0, width: 1440, height: 900, availLeft: 0, availTop: 25, availWidth: 1440, availHeight: 875, isPrimary: true, isInternal: true, label: 'Built-in Retina Display', devicePixelRatio: 2 };
  const DELL = { left: 1440, top: 0, width: 2560, height: 1440, availLeft: 1440, availTop: 0, availWidth: 2560, availHeight: 1415, isPrimary: false, isInternal: false, label: 'DELL U2720Q', devicePixelRatio: 1 };
  const wm = { perm: o.perm || 'granted', screens: o.monitors === 1 ? [LAPTOP] : [LAPTOP, DELL], asked: 0 };
  window.__wm = wm;
  try {
    Object.defineProperty(window.screen, 'isExtended', { configurable: true, get: () => wm.screens.length > 1 });
  } catch {
    /* read-only here */
  }
  if (o.noWm) remove('getScreenDetails');
  else {
    window.getScreenDetails = async () => {
      wm.asked += 1;
      if (wm.perm === 'denied') throw new DOMException('Permission denied.', 'NotAllowedError');
      wm.perm = 'granted';
      return { screens: wm.screens, currentScreen: wm.screens[0], addEventListener() {}, removeEventListener() {} };
    };
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (d) => (d && /^window-(management|placement)$/.test(d.name) ? Promise.resolve({ state: wm.perm, onchange: null }) : query(d));
  }
  if (o.noPip) remove('documentPictureInPicture');
  let lastClick = -Infinity;
  window.addEventListener('click', (e) => {
    if (e.isTrusted) lastClick = performance.now();
  }, true);
  window.__opens = [];
  window.__blockPopups = !!o.blockPopups;
  const realOpen = window.open.bind(window);
  window.open = function open(url, name, features) {
    const recent = performance.now() - lastClick < 400;
    window.__opens.push({ url: String(url || ''), features: String(features || ''), recent });
    if (window.__blockPopups && !recent) return null;
    return realOpen(url, name, features);
  };
  if (o.pipNoWebGL && window.documentPictureInPicture) {
    // No WebGL for canvases in the floating window, whichever realm made them.
    const patch = (proto, isFloating) => {
      const orig = proto.getContext;
      proto.getContext = function getContext(type, ...rest) {
        return /webgl/i.test(String(type)) && isFloating(this) ? null : orig.call(this, type, ...rest);
      };
    };
    patch(HTMLCanvasElement.prototype, (c) => c.ownerDocument !== document);
    const dpip = window.documentPictureInPicture;
    const request = dpip.requestWindow.bind(dpip);
    dpip.requestWindow = async (...args) => {
      const w = await request(...args);
      patch(w.HTMLCanvasElement.prototype, () => true); // before the app draws into it
      return w;
    };
  }
}

// ---- helpers ------------------------------------------------------------------------------------

export const screenAttr = (page, name, testid = 'screen') => page.locator(tid(testid)).first().getAttribute(`data-${name}`);

export async function waitAttr(t, page, testid, name, ok, { timeout = 30000, label } = {}) {
  return t.waitFor(async () => {
    const v = await screenAttr(page, name, testid);
    return (typeof ok === 'function' ? ok(v) : v === ok) ? v || true : null;
  }, { timeout, message: async () => `${label || testid} data-${name} (is "${await screenAttr(page, name, testid)}")` });
}

/** The saved library ({ id, kind, title } newest last) and the open conversation id. */
async function appIds(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const last = JSON.parse(localStorage.getItem('jarvis.ui.lastConversation') || 'null');
        const req = indexedDB.open('jarvis');
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction('library', 'readonly').objectStore('library').getAll();
          get.onsuccess = () => {
            resolve({ conversationId: last && last.id, library: get.result.sort((a, b) => a.createdAt - b.createdAt).map((x) => ({ id: x.id, kind: x.kind, title: x.title })) });
            db.close();
          };
        };
        req.onerror = () => resolve({ conversationId: last && last.id, library: [] });
      }),
  );
}

/**
 * Type words in the composer and send them (Send, or Enter while Jarvis is working and Send is a
 * Stop button): a screen command is acted on here, never sent to Jarvis.
 */
export async function typeCommand(t, text, page = t.page) {
  const before = await t.count('turn-jarvis', undefined, page);
  const leadBefore = t.requests('lead').length;
  const input = await t.visible('composer-input', { page });
  await input.fill(text);
  const send = page.locator(tid('composer-send'));
  if (await send.isVisible()) await send.click();
  else await input.press('Enter');
  await t.waitFor(async () => (await input.inputValue()) === '', { timeout: 5000, message: `the composer to take "${text}"` });
  await page.waitForTimeout(150);
  t.assert((await t.count('turn-jarvis', undefined, page)) === before, `"${text}" is a screen command: no new turn`);
  t.assert(t.requests('lead').length === leadBefore, `"${text}" costs nothing: no request to Claude`);
}

/** Run `fn` and return the page it opens (a screen window or the floating window). */
export async function opensPage(t, fn, { timeout = 15000 } = {}) {
  const context = t.page.context();
  const [popup] = await Promise.all([context.waitForEvent('page', { timeout }), fn()]);
  t.attachPageGuards(popup);
  await popup.waitForLoadState('domcontentloaded').catch(() => {});
  return popup;
}

export async function toastText(t) {
  return (await t.page.locator('.toast-text').allTextContents()).join(' | ');
}

/** Text in the HUD frame must pass AA: computed color against the frame's background (--bg). */
async function checkFrameContrast(t, page, label) {
  const bad = await page.evaluate(() => {
    const lum = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
    const L = ([r, g, b]) => 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
    const base = parse(getComputedStyle(document.querySelector('[data-testid="screen"]')).backgroundColor).slice(0, 3);
    const over = (c, under) => {
      const a = c[3] === undefined ? 1 : c[3];
      return [0, 1, 2].map((i) => c[i] * a + under[i] * (1 - a));
    };
    // The text's backdrop: the nearest mostly opaque background up the tree (on the frame's --bg).
    const bgOf = (el) => {
      for (let n = el; n && n.dataset?.testid !== 'screen'; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.length >= 3 && (c[3] === undefined || c[3] >= 0.5)) return over(c, base);
      }
      return base;
    };
    const out = [];
    for (const el of document.querySelectorAll('.scr__head *, .scr__deck *, .scr-msg *, .scr-link__card *, .scr-mini *')) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      if (el.getClientRects().length === 0) continue;
      const cs = getComputedStyle(el);
      const bg = bgOf(el);
      const fg = parse(cs.color);
      const alpha = fg[3] === undefined ? 1 : fg[3];
      const mix = [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha));
      const [a, b] = [L(mix), L(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 4.5) out.push(`${el.className || el.tagName} "${el.textContent.trim().slice(0, 30)}" ${ratio.toFixed(2)}:1`);
    }
    return out;
  });
  t.assert(!bad.length, `${label}: text in the HUD frame below 4.5:1: ${bad.join('; ')}`);
}

async function sendDone(t, text, opts) {
  const turn = await t.send(text);
  await t.waitForTurn(turn, ['done'], { timeout: 120000, ...(opts || {}) });
  return turn;
}

// ---- scenarios ----------------------------------------------------------------------------------

export default [
  {
    name: 'screens-pages',
    title: 'Screen mode renders each kind in the HUD frame: hologram (WebGL), blueprint, Mission Control, report, photo, link card, camera placeholder; header, clock, contrast, no overflow',
    device: 'desktop',
    fakeWikimedia: true,
    timeout: 300000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const holoTurn = await sendDone(t, '[[hologram:camry]] Show me a 2024 Toyota Camry Hybrid');
      await sendDone(t, '[[blueprint:alternator-part]] Draw me the alternator');
      const swarm = await sendDone(t, '[[swarm:3]] Compare the best electric SUVs of 2026');
      const ids = await appIds(t.page);
      const holo = ids.library.find((x) => x.kind === 'hologram');
      const bp = ids.library.find((x) => x.kind === 'blueprint');
      t.assert(holo && bp && ids.conversationId, `a saved hologram, blueprint and conversation (${JSON.stringify(ids)})`);
      const swarmId = await swarm.getAttribute('data-turn-id');
      const missionId = await swarm.locator(tid('mission-card')).first().getAttribute('data-mission-id');
      void holoTurn;

      const page = await t.page.context().newPage();
      t.attachPageGuards(page);
      await page.setViewportSize({ width: 1600, height: 900 });
      const open = async (query) => {
        await page.goto(`${t.url}/?${query}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(tid('app', { 'data-ready': 'true' }), { state: 'attached', timeout: 20000 });
        await waitAttr(t, page, 'screen', 'state', 'ready');
      };
      const header = async () => ({
        eyebrow: ((await page.locator('.scr__eyebrow').textContent()) || '').replace(/\s*·\s*/g, ' · ').replace(/\s+/g, ' ').trim(),
        title: ((await page.locator(tid('screen-title')).textContent()) || '').trim(),
        clock: ((await page.locator(tid('screen-clock')).textContent()) || '').trim(),
      });

      await t.step('hologram: the saved model in the frame, drawn by WebGL, with its deck', async () => {
        await open(`screen=hologram&id=${holo.id}&w=other&n=2&s=pages1`);
        await waitAttr(t, page, 'screen-hologram', 'gl', 'ready', { timeout: 45000 });
        await waitAttr(t, page, 'screen-hologram', 'parts', '43');
        const hd = await header();
        t.assert(hd.eyebrow === 'SCREEN 2 · HOLOGRAM · 43 PARTS', `eyebrow "${hd.eyebrow}" (the part count is in the header, off the stage)`);
        t.assert(/Camry/i.test(hd.title), `title "${hd.title}"`);
        t.assert(/^\d{2}:\d{2}$/.test(hd.clock), `clock "${hd.clock}" (hours and minutes)`);
        t.assert((await page.title()).startsWith('Jarvis · Hologram'), `document title "${await page.title()}"`);
        await (await t.visible('screen-hologram-explode', { page })).click();
        await waitAttr(t, page, 'screen-hologram', 'exploded', '1');
        await page.waitForTimeout(1400);
        await t.screenshot('hologram-exploded', page);
        await (await t.visible('screen-hologram-assemble', { page })).click();
        await waitAttr(t, page, 'screen-hologram', 'exploded', '0');
        await page.waitForTimeout(1400);
        await t.screenshot('hologram', page);
        await t.checkNoHorizontalOverflow('screen: hologram', page);
        await checkFrameContrast(t, page, 'hologram screen');
        // The frame follows the theme: its brackets are the theme's --accent-2 at 78% (they were
        // Arc Cyan in every theme). Ember's --accent-2 is #ffcaa6.
        const themed = await page.evaluate(() => {
          const root = document.documentElement;
          const prev = root.dataset.theme;
          const probe = document.createElement('i');
          document.body.append(probe);
          const read = (hex) => {
            probe.style.color = `color-mix(in srgb, ${hex} 78%, transparent)`;
            return [getComputedStyle(document.querySelector('.scr__corner--tl')).borderTopColor, getComputedStyle(probe).color];
          };
          const arc = read('#8af3ff');
          root.dataset.theme = 'ember';
          const ember = read('#ffcaa6');
          if (prev === undefined) delete root.dataset.theme;
          else root.dataset.theme = prev;
          probe.remove();
          return { arc, ember };
        });
        t.assert(themed.arc[0] === themed.arc[1], `Arc Cyan brackets: ${themed.arc.join(' vs ')}`);
        t.assert(themed.ember[0] === themed.ember[1], `Ember brackets follow the theme: ${themed.ember.join(' vs ')}`);
      });

      await t.step('blueprint: the sheet in the blueprint viewer (zoom, parts)', async () => {
        await open(`screen=blueprint&id=${bp.id}&w=other&n=2&s=pages2`);
        await waitAttr(t, page, 'screen-blueprint', 'state', 'ready');
        await page.locator(`${tid('screen-blueprint')} ${tid('blueprint-stage')} svg`).first().waitFor({ state: 'visible', timeout: 15000 });
        t.assert((await page.locator(`${tid('screen-blueprint')} .bpv__bar`).isVisible()) === false, 'the viewer\'s own title bar gives way to the screen header');
        t.assert((await header()).eyebrow === 'SCREEN 2 · BLUEPRINT', 'eyebrow');
        await page.waitForTimeout(800);
        await t.screenshot('blueprint', page);
        await t.checkNoHorizontalOverflow('screen: blueprint', page);
      });

      await t.step('Mission Control: the finished mission from storage', async () => {
        await open(`screen=mission&c=${ids.conversationId}&t=${swarmId}&id=${missionId}&w=other&n=2&s=pages3`);
        await waitAttr(t, page, 'screen-mission', 'agents', '3');
        await waitAttr(t, page, 'screen-mission', 'done', '3');
        t.assert((await header()).eyebrow === 'SCREEN 2 · MISSION CONTROL', 'eyebrow');
        t.assert((await page.locator(tid('screen-status')).textContent()).includes('COMPLETE · 3/3'), 'status COMPLETE · 3/3');
        await page.waitForTimeout(600);
        await t.screenshot('mission', page);
      });

      await t.step('report: the research answer, large and readable', async () => {
        await open(`screen=answer&c=${ids.conversationId}&t=${swarmId}&w=other&n=2&s=pages4`);
        const text = await t.waitFor(async () => {
          const x = await t.text(page.locator(`${tid('screen-answer')} .scr-answer__prose`));
          return x.length > 80 ? x : null;
        }, { timeout: 10000, message: 'the report text' });
        t.assert(/Sources/.test(text), 'the whole report, sources included');
        const hd = await header();
        t.assert(hd.eyebrow === 'SCREEN 2 · REPORT', `eyebrow "${hd.eyebrow}"`);
        t.assert(/electric SUVs/i.test(hd.title), `title is the question: "${hd.title}"`);
        const size = await page.locator(`${tid('screen-answer')} .scr-answer__prose p`).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
        t.assert(size >= 17, `report body at least 17px on a screen across the desk (got ${size}px)`);
        await t.screenshot('report', page);
        await t.checkNoHorizontalOverflow('screen: report', page);
        await checkFrameContrast(t, page, 'report screen');
      });

      await t.step('photo, link card, the camera (no camera in this browser: said so)', async () => {
        await open(`screen=photo&src=${encodeURIComponent(WIKI_PHOTO)}&title=Camry%20Hybrid&w=window&s=pages5`);
        await page.waitForFunction(() => document.querySelector('[data-testid="screen-photo-img"]')?.naturalWidth > 0, null, { timeout: 15000 });
        t.assert((await header()).eyebrow === 'WINDOW · PHOTO', 'eyebrow');
        await open(`screen=link&url=${encodeURIComponent('https://www.example.com/ev9-review')}&title=${encodeURIComponent('Kia EV9 review')}&w=other&n=2&s=pages6`);
        t.assert((await t.text(page.locator('.scr-link__host'))) === 'EXAMPLE.COM', 'the host');
        t.assert((await t.text(page.locator('.scr-link__title'))) === 'Kia EV9 review', 'the title');
        await t.screenshot('link', page);
        await checkFrameContrast(t, page, 'link screen');
        await open('screen=camera&w=other&n=2&s=pages7');
        // Loaded on its own (not just opened by the main window for the owner): the camera waits for
        // a tap (v7.1). This browser has no camera (the fake camera is the Optics scenarios'): the
        // tap is answered NO CAMERA with Try again. The live camera on a screen is optics-screens.
        await waitAttr(t, page, 'screen-camera', 'state', 'off', { timeout: 10000, label: 'the camera screen loaded on its own' });
        t.assert((await t.text(page.locator(tid('screen-status')))) === 'OFF', 'the status says OFF');
        await page.locator(tid('screen-camera-start')).click();
        await waitAttr(t, page, 'screen-camera', 'state', 'error', { timeout: 10000, label: 'the camera screen without a camera' });
        t.assert((await t.text(page.locator(tid('screen-status')))) === 'NO CAMERA', 'the status says so');
        t.assert(await page.locator(tid('screen-camera-start')).isVisible(), 'Try again');
        await checkFrameContrast(t, page, 'camera screen');
        // A link that is not http(s) never reaches the page.
        await page.goto(`${t.url}/?screen=link&url=${encodeURIComponent('javascript:alert(1)')}&s=pages8`, { waitUntil: 'domcontentloaded' });
        await waitAttr(t, page, 'screen', 'state', 'missing', { timeout: 8000 });
      });

      await t.step('reduced motion: the frame is static (no assemble, no scanline)', async () => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await open(`screen=answer&c=${ids.conversationId}&t=${swarmId}&w=other&n=2&s=pages9`);
        const anims = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => a.animationName || a.constructor.name));
        t.assert(anims.length === 0, `no running animations under reduced motion (got ${anims.join(', ')})`);
      });
    },
  },

  {
    name: 'screens-sync',
    title: 'A second page follows a live mission (agents, then complete) and a streaming answer over BroadcastChannel',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[swarm:4]] [[slow]] Research the fastest EV charging networks');
      const card = turn.locator(tid('mission-card')).first();
      await card.waitFor({ state: 'visible', timeout: 30000 });
      const turnId = await turn.getAttribute('data-turn-id');
      const { conversationId } = await appIds(t.page);
      const mission = await t.page.context().newPage();
      t.attachPageGuards(mission);
      await mission.setViewportSize({ width: 1280, height: 800 });
      const answer = await t.page.context().newPage();
      t.attachPageGuards(answer);
      await answer.setViewportSize({ width: 1280, height: 800 });
      // Both open while the agents work: Mission Control on screen 2, the report in a window.
      await mission.goto(`${t.url}/?screen=mission&c=${conversationId}&t=${turnId}&w=other&n=2&s=sync1`, { waitUntil: 'domcontentloaded' });
      await answer.goto(`${t.url}/?screen=answer&c=${conversationId}&t=${turnId}&w=window&s=sync2`, { waitUntil: 'domcontentloaded' });
      const lengths = new Set();
      let sawWriting = false;
      const watchAnswer = setInterval(() => {
        Promise.all([screenAttr(answer, 'status', 'screen-answer'), answer.locator(tid('screen-answer')).textContent()])
          .then(([status, text]) => {
            if (status === 'running') sawWriting = true;
            lengths.add((text || '').replace('Jarvis is writing…', '').length);
          })
          .catch(() => {});
      }, 120);

      await t.step('Mission Control on the second page moves with the agents', async () => {
        await waitAttr(t, mission, 'screen-mission', 'status', 'running', { timeout: 30000 });
        t.assert((await mission.locator(tid('screen-status')).textContent()).startsWith('WORKING'), 'status WORKING');
        t.assert((await screenAttr(mission, 'live')) === 'true', 'the frame shows it is live');
        await t.screenshot('mission-live', mission);
        const seen = new Set();
        await t.waitFor(async () => {
          seen.add(await screenAttr(mission, 'done', 'screen-mission'));
          return (await screenAttr(mission, 'done', 'screen-mission')) === '4';
        }, { timeout: 120000, interval: 150, message: 'all four agents to report on the second page' });
        t.assert(seen.size >= 3, `the count rose live on the second page (seen ${[...seen].join(', ')})`);
        t.note(`agents done on screen 2: ${[...seen].join('→')}`);
      });

      await t.step('the report streams into a third page while Jarvis writes it', async () => {
        await t.waitFor(async () => ((await screenAttr(answer, 'status', 'screen-answer')) === 'done' ? true : null), { timeout: 120000, interval: 120, message: 'the answer to finish on the third page' });
        clearInterval(watchAnswer);
        t.assert(sawWriting, 'it showed WRITING while the answer streamed');
        t.assert([...lengths].filter((n) => n > 0).length >= 2, `the text grew live (lengths ${[...lengths].join(', ')})`);
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        const norm = (x) => x.replace(/\s+/g, ' ').trim();
        const main = norm((await turn.locator(tid('segment-text')).allTextContents()).join(' '));
        const shown = await t.text(answer.locator(`${tid('screen-answer')} .scr-answer__prose`));
        t.assert(shown.length > 40 && main.includes(shown.slice(0, 40)) && main.includes(shown.slice(-30)), `the third page shows the same report as the chat ("${shown.slice(0, 40)}…")`);
        await t.screenshot('report-done', answer);
      });
    },
  },

  {
    name: 'screens-pip',
    title: 'The real Document Picture-in-Picture of headless Chromium: "float it" makes a floating HUD panel with the app\'s styles copied in and the hologram drawn there by WebGL; the next thing floats without a gesture; closing it; the snapshot fallback',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 1 });
      await t.goto('/');
      await sendDone(t, '[[hologram:camry]] Show me a 2024 Toyota Camry Hybrid');
      await sendDone(t, '[[blueprint:alternator-part]] Draw me its alternator');
      await sendDone(t, '[[search]] What does a 2024 Camry Hybrid cost?');
      let pip;

      await t.step('"float the hologram": a real floating window with the panel', async () => {
        pip = await opensPage(t, () => typeCommand(t, 'float the hologram'));
        await t.waitFor(async () => /floating beside you/i.test(await toastText(t)), { timeout: 5000, message: async () => `a toast to say so (${await toastText(t)})` });
        t.assert(pip.url() === 'about:blank', `the floating window is a document the app writes into (${pip.url()})`);
        await pip.waitForSelector(tid('screen'), { timeout: 10000 });
        t.assert((await screenAttr(pip, 'where')) === 'beside', 'data-where="beside"');
        t.assert((await screenAttr(pip, 'compact')) === 'true', 'the compact frame');
        const styles = await pip.evaluate(() => ({ sheets: document.styleSheets.length, rules: [...document.styleSheets].reduce((n, s) => n + s.cssRules.length, 0), cls: document.documentElement.className }));
        t.assert(styles.sheets >= 1 && styles.rules > 500, `the app's stylesheets were copied in (${styles.sheets} sheets, ${styles.rules} rules)`);
        t.assert(/is-pip/.test(styles.cls), 'marked as the floating document');
        await waitAttr(t, pip, 'screen-hologram', 'gl', 'ready', { timeout: 45000, label: 'the hologram in the floating window' });
        await waitAttr(t, pip, 'screen-hologram', 'parts', '43');
        const canvasDoc = await pip.evaluate(() => {
          const c = document.querySelector('.holo__canvas');
          return { inThisDoc: !!c && c.ownerDocument === document, gl: !!c && !!(c.getContext('webgl2') || c.getContext('webgl')) };
        });
        t.assert(canvasDoc.inThisDoc && canvasDoc.gl, `the hologram's canvas lives in the floating document with a WebGL context (${JSON.stringify(canvasDoc)})`);
        await pip.setViewportSize({ width: 640, height: 480 });
        await pip.waitForTimeout(1600);
        await t.screenshot('hologram-640x480', pip);
        await pip.setViewportSize({ width: 420, height: 320 });
        await pip.waitForTimeout(1600);
        await t.screenshot('hologram-420x320', pip);
        await t.checkNoHorizontalOverflow('floating panel 420×320', pip);
      });

      await t.step('the hologram keeps rendering from the floating window\'s own frames', async () => {
        await (await t.visible('screen-hologram-explode', { page: pip })).click();
        await waitAttr(t, pip, 'screen-hologram', 'exploded', '1', { timeout: 10000 });
        await (await t.visible('screen-hologram-assemble', { page: pip })).click();
        await waitAttr(t, pip, 'screen-hologram', 'exploded', '0', { timeout: 10000 });
      });

      await t.step('"float the report": the open panel takes it (no new window, no gesture needed)', async () => {
        const pages = t.page.context().pages().length;
        await t.page.evaluate(() => document.activeElement && document.activeElement.blur());
        await typeCommand(t, 'float the answer');
        await waitAttr(t, pip, 'screen', 'kind', 'answer', { timeout: 10000 });
        t.assert(t.page.context().pages().length === pages, 'no new window');
        t.assert((await t.text(pip.locator(`${tid('screen-answer')} .scr-answer__prose`))).length > 40, 'the answer shows in the panel');
        await pip.setViewportSize({ width: 460, height: 540 });
        await pip.waitForTimeout(500);
        await t.screenshot('report-460x540', pip);
        await pip.setViewportSize({ width: 420, height: 320 });
        await pip.waitForTimeout(300);
        await t.screenshot('report-420x320', pip);
        await checkFrameContrast(t, pip, 'floating report');
      });

      await t.step('"float the blueprint": the sheet itself, fitted to the panel', async () => {
        await typeCommand(t, 'float the blueprint');
        await waitAttr(t, pip, 'screen', 'kind', 'blueprint', { timeout: 10000 });
        await waitAttr(t, pip, 'screen-blueprint', 'state', 'ready', { timeout: 20000 });
        await pip.locator(`${tid('screen-blueprint')} svg.scr-bp__sheet`).waitFor({ state: 'visible', timeout: 10000 });
        await pip.setViewportSize({ width: 640, height: 480 });
        await pip.waitForTimeout(500);
        await t.screenshot('blueprint-640x480', pip);
        await pip.setViewportSize({ width: 420, height: 320 });
        await pip.waitForTimeout(500);
        await t.screenshot('blueprint-420x320', pip);
      });

      await t.step('"close the float": the panel closes', async () => {
        await typeCommand(t, 'close the floating panel');
        await t.waitFor(() => pip.isClosed(), { timeout: 8000, message: 'the floating window to close' });
      });

      await t.step('"float mission control" while agents work: a compact readout that follows them', async () => {
        const turn = await t.send('[[swarm:3]] [[slow]] Compare home battery systems');
        await turn.locator(tid('mission-card')).first().waitFor({ state: 'visible', timeout: 30000 });
        pip = await opensPage(t, () => typeCommand(t, 'float mission control'));
        await pip.waitForSelector(tid('screen-mission'), { timeout: 10000 });
        await waitAttr(t, pip, 'screen-mission', 'agents', '3', { timeout: 20000 });
        t.assert((await pip.locator('.scr-mini__row').count()) === 3, 'one row per agent');
        await pip.setViewportSize({ width: 440, height: 500 });
        await t.waitFor(async () => (await pip.locator('.scr-mini__row[data-status="searching"], .scr-mini__row[data-status="reading"], .scr-mini__row[data-status="done"]').count()) >= 2, { timeout: 60000, interval: 100, message: 'agents at work in the panel' });
        await t.screenshot('mission-440x500', pip);
        await waitAttr(t, pip, 'screen-mission', 'done', '3', { timeout: 90000, label: 'every agent reported in the panel' });
        t.assert(/COMPLETE · 3\/3/.test(await pip.locator(tid('screen-status')).textContent()), 'complete');
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        await typeCommand(t, 'close the float');
        await t.waitFor(() => pip.isClosed(), { timeout: 8000, message: 'the floating window to close' });
      });
    },
  },

  {
    name: 'screens-pip-snapshot',
    title: 'Floating panel without WebGL in its window: a snapshot of the hologram, re-rendered by the app',
    device: 'desktop',
    allowConsole: [/Error creating WebGL context/], // three.js says so when WebGL is refused (on purpose here)
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 1, pipNoWebGL: true });
      await t.goto('/');
      await sendDone(t, '[[hologram:alternator]] Show me a car alternator');
      const pip = await opensPage(t, () => typeCommand(t, 'pop it out'));
      await pip.waitForSelector(tid('screen-hologram'), { timeout: 10000 });
      await waitAttr(t, pip, 'screen-hologram', 'gl', 'snapshot', { timeout: 30000, label: 'the snapshot fallback' });
      await pip.waitForFunction(() => document.querySelector('[data-testid="screen-hologram-snapshot"]')?.naturalWidth > 0, null, { timeout: 15000 });
      await pip.setViewportSize({ width: 640, height: 480 });
      await pip.waitForTimeout(800);
      await t.screenshot('snapshot-640x480', pip);
    },
  },

  {
    name: 'screens-monitor',
    title: 'A second monitor (Window Management API stubbed): the screen window on it; the explainer before Chrome\'s prompt; moving out of the in-app viewer and handing back; "bring it back"',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 2, perm: 'prompt' });
      await t.goto('/');
      const holoTurn = await sendDone(t, '[[hologram:camry]] Show me a 2024 Toyota Camry Hybrid');
      let screen;

      await t.step('first time: a short explanation, then Chrome\'s prompt, then the window on screen 2', async () => {
        await typeCommand(t, 'put the hologram on my other screen');
        const card = await t.visible('screens-explainer');
        t.assert(/Chrome will ask once/.test(await t.text(card)), 'it explains before Chrome asks');
        t.assert((await t.page.evaluate(() => window.__wm.asked)) === 0, 'nothing asked yet');
        await t.screenshot('explainer');
        screen = await opensPage(t, async () => (await t.visible('screens-allow')).click());
        t.assert((await t.page.evaluate(() => window.__wm.asked)) === 1, 'Chrome was asked once');
        const last = await t.page.evaluate(() => window.__opens.at(-1));
        t.assert(last.features === 'popup=1,left=1440,top=0,width=2560,height=1415', `a window maximized on the second monitor (${last.features})`);
        const u = new URL(screen.url());
        t.assert(u.searchParams.get('screen') === 'hologram' && u.searchParams.get('w') === 'other' && u.searchParams.get('n') === '2', `screen mode URL ${screen.url()}`);
        await screen.setViewportSize({ width: 1600, height: 900 });
        await screen.waitForSelector(tid('app', { 'data-ready': 'true' }), { state: 'attached', timeout: 20000 });
        await waitAttr(t, screen, 'screen-hologram', 'gl', 'ready', { timeout: 45000 });
        t.assert(/Camry/.test(await screen.locator(tid('screen-title')).textContent()), 'titled');
        await screen.waitForTimeout(1500);
        await t.screenshot('screen2-hologram', screen);
      });

      await t.step('the report goes to the same screen without a new window', async () => {
        await sendDone(t, '[[search]] What does it cost?');
        const pages = t.page.context().pages().length;
        await typeCommand(t, 'show the answer on screen 2');
        await waitAttr(t, screen, 'screen', 'kind', 'answer', { timeout: 10000 });
        t.assert(t.page.context().pages().length === pages, 'the open screen took it');
        t.assert(/screen 2/i.test(await toastText(t)), `toast: ${await toastText(t)}`);
      });

      await t.step('"bring it back": the screen closes and the main window shows it', async () => {
        await typeCommand(t, 'bring it back');
        await t.waitFor(() => screen.isClosed(), { timeout: 8000, message: 'the screen window to close' });
        t.assert(/back here/i.test(await toastText(t)), `toast: ${await toastText(t)}`);
      });

      await t.step('from the in-app viewer: typed in its command field, the hologram moves out; closing the screen hands it back', async () => {
        await holoTurn.locator(tid('hologram-open')).click();
        await t.visible('hologram-viewer');
        await t.waitFor(async () => (await t.page.locator(tid('hologram-viewer')).getAttribute('data-state')) === 'ready', { timeout: 45000, message: 'the in-app viewer to be ready' });
        screen = await opensPage(t, async () => {
          const input = t.page.locator(tid('hologram-command'));
          await input.fill('put this on my other screen');
          await input.press('Enter');
        });
        await t.waitFor(async () => (await t.count('hologram-viewer')) === 0, { timeout: 8000, message: 'the in-app viewer to close (one 3D view at a time)' });
        await screen.waitForSelector(tid('screen-hologram'), { timeout: 20000 });
        await (await t.visible('screen-close', { page: screen })).click();
        await t.waitFor(() => screen.isClosed(), { timeout: 8000, message: 'the screen to close' });
        await t.visible('hologram-viewer', { timeout: 10000, message: 'Closing the screen hands the hologram back to the main window' });
        await t.page.keyboard.press('Escape');
      });
    },
  },

  {
    name: 'screens-fallbacks',
    title: 'Popups blocked under a spoken command: the one-tap button and the one-time tip over Voice Mode, Jarvis says to tap; after a reload the button comes without the tip',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 2, blockPopups: true });
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['Open this on my other screen.'];
      });
      await t.goto('/');
      await sendDone(t, '[[search]] What does a 2024 Camry Hybrid cost?');

      await t.step('spoken: blocked, so a one-tap button and the tip; Jarvis says to tap', async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        const tap = await t.visible('screens-tap', { timeout: 20000, message: 'the one-tap button appears over Voice Mode' });
        t.assert(/Open on screen 2/.test(await t.text(tap)), `button text: ${await t.text(tap)}`);
        await t.visible('screens-tip', { message: 'the first time, a tip to allow pop-ups' });
        await t.waitFor(async () => (await t.page.evaluate(() => window.__voice.said.join(' '))).includes('Tap Open on screen 2'), { timeout: 15000, message: async () => `Jarvis to say to tap (said: ${await t.page.evaluate(() => window.__voice.said.join(' | '))})` });
        const opens = await t.page.evaluate(() => window.__opens);
        t.assert(opens.length === 1 && !opens[0].recent, `one blocked attempt, without a gesture (${JSON.stringify(opens)})`);
        await t.screenshot('one-tap-over-voice');
        const screen = await opensPage(t, async () => (await t.visible('screens-tap-button')).click());
        await screen.waitForSelector(tid('screen'), { timeout: 20000 });
        t.assert((await screenAttr(screen, 'kind')) === 'answer', 'the answer opened on screen 2 after the tap');
        t.assert((await t.count('screens-tap')) === 0, 'the button went away');
        await screen.close();
        await (await t.visible('voice-close')).click();
      });

      await t.step('blocked again after a reload: the button, without the tip (it is shown once)', async () => {
        await t.reload();
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        await t.visible('screens-tap', { timeout: 20000, message: 'the one-tap button again' });
        t.assert((await t.count('screens-tip')) === 0, 'no tip the second time');
        await (await t.visible('screens-tap-dismiss')).click();
        t.assert((await t.count('screens-tap')) === 0, 'dismissed');
        await (await t.visible('voice-close')).click();
      });
    },
  },

  {
    name: 'screens-no-apis',
    title: 'No Window Management and no Picture-in-Picture (Safari-like): "other screen" and "float it" open windows, and the owner is told why',
    device: 'desktop',
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { noWm: true, noPip: true });
      await t.goto('/');
      await sendDone(t, '[[search]] What does a 2024 Camry Hybrid cost?');
      const w = await opensPage(t, () => typeCommand(t, 'open this on my other screen'));
      await w.waitForSelector(tid('screen'), { timeout: 20000 });
      t.assert((await screenAttr(w, 'where')) === 'window', 'a window');
      const last = await t.page.evaluate(() => window.__opens.at(-1).features);
      t.assert(/^popup=1,left=\d+,top=\d+,width=\d+,height=\d+$/.test(last), `placed on the right half (${last})`);
      t.assert(/can’t choose a screen.*Drag it to your other screen/.test(await toastText(t)), `toast: ${await toastText(t)}`);
      await typeCommand(t, 'float it');
      t.assert(/no floating panels|own window/i.test(await toastText(t)), `toast: ${await toastText(t)}`);
      await t.screenshot('safari-like');
    },
  },

  {
    name: 'screens-tool',
    title: 'Jarvis decides (lead tools V5): open_screen through the app and the strict mock puts the report on screen 2, asks for the one tap a floating panel needs, and brings it back; one short sentence each',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installScreenStubs, { monitors: 2, perm: 'granted' });
      await t.goto('/');
      await sendDone(t, '[[search]] What does a 2024 Camry Hybrid cost?');
      let screen;

      await t.step('words the local matcher leaves to Jarvis: he calls open_screen and the window opens on screen 2', async () => {
        const leadBefore = t.requests('lead').length;
        let turn;
        screen = await opensPage(t, async () => {
          turn = await t.send('[[screen:answer:other_screen]] Could you put that report up on my second monitor when you get a chance?');
        }, { timeout: 60000 });
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        const leads = t.requests('lead').slice(leadBefore);
        t.assert(leads.length === 2, `a tool round: the call, then its result (${leads.length} lead requests)`);
        const tools = leads[0].body.tools.map((x) => x.name);
        t.assert(tools.slice(-3).join(',') === 'pin_labels,look_through_camera,open_screen', `a new conversation has lead tools V5 (${tools.join(', ')})`);
        t.assert(/# Camera and screens/.test(leads[0].body.system[0].text), 'and the V4 prompt');
        const results = leads[1].body.messages.at(-1).content.filter((b) => b.type === 'tool_result');
        t.assert(results.length === 1 && !results[0].is_error && /^Opened the (answer|report) ".*" on screen 2 \(the owner's other monitor, DELL U2720Q\), maximized\./.test(String(results[0].content)), `the tool_result says what happened (${JSON.stringify(results)})`);
        const last = await t.page.evaluate(() => window.__opens.at(-1));
        t.assert(last.features === 'popup=1,left=1440,top=0,width=2560,height=1415', `maximized on the second monitor (${last.features})`);
        t.assert(new URL(screen.url()).searchParams.get('screen') === 'answer', `screen mode (${screen.url()})`);
        t.assert((await t.text(turn.locator(tid('segment-text')).last())).includes("It's on screen 2, sir."), 'one short sentence');
        await screen.setViewportSize({ width: 1600, height: 900 });
        await screen.waitForSelector(tid('app', { 'data-ready': 'true' }), { state: 'attached', timeout: 20000 });
        await waitAttr(t, screen, 'screen', 'kind', 'answer', { timeout: 20000 });
        await t.screenshot('screen2-from-tool', screen);
      });

      await t.step('a floating panel needs a tap: the tool says so, Jarvis says so, the button waits', async () => {
        const turn = await sendDone(t, '[[screen:answer:beside]] Actually could you float it beside what I am working on?');
        await t.visible('screens-tap', { message: 'the one-tap button for the floating panel' });
        t.assert(/Float it/.test(await t.text(t.locator('screens-tap-button'))), 'the button says what it does');
        t.assert((await t.text(turn.locator(tid('segment-text')).last())).includes('Tap “Float it” and it\'ll appear, sir.'), 'Jarvis asks for the tap once');
        await t.locator('screens-tap-dismiss').click();
      });

      await t.step('"back": the screen closes and Jarvis says so', async () => {
        const turn = await sendDone(t, '[[screen:this:back]] I am done with the second display for now, thank you');
        await t.waitFor(() => screen.isClosed(), { timeout: 10000, message: 'the screen window to close' });
        t.assert((await t.text(turn.locator(tid('segment-text')).last())).includes("It's back on your main screen, sir."), 'one short sentence');
      });
    },
  },

  {
    name: 'screens-phone',
    title: 'iPhone: the phone layout is untouched (no screen UI until asked), and screens open full screen in the app',
    device: 'iphone13',
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      await t.step('the home screen is unchanged: no screen UI', async () => {
        await t.visible('empty-state');
        t.assert((await t.page.locator('[data-testid^="screen"]').count()) === 0, 'no screen elements on the phone home');
        t.assert((await t.page.locator('.scr-prompt').count()) === 0, 'no prompts');
        await t.checkNoHorizontalOverflow('phone home');
      });
      const turn = await sendDone(t, '[[swarm:2]] Compare two electric SUVs');
      await t.step('"put the report on my other screen": full screen in the app, with the HUD frame', async () => {
        await typeCommand(t, 'put the report on my other screen');
        await t.visible('screen-inapp', { message: 'the in-app full-screen screen' });
        t.assert((await screenAttr(t.page, 'where')) === 'inapp', 'data-where="inapp"');
        t.assert((await screenAttr(t.page, 'kind')) === 'answer', 'the report');
        t.assert(t.page.context().pages().length === 1, 'no window was opened');
        await t.page.waitForTimeout(500);
        await t.checkNoHorizontalOverflow('in-app screen');
        await t.screenshot('inapp-report');
        await (await t.visible('screen-close')).click();
        await t.waitFor(async () => (await t.count('screen-inapp')) === 0, { timeout: 5000, message: 'the in-app screen to close' });
      });
      await t.step('the phone layout after: unchanged composer and chat', async () => {
        await turn.scrollIntoViewIfNeeded();
        await t.checkNoHorizontalOverflow('phone chat after a screen');
        const box = await t.page.locator(tid('composer-input')).boundingBox();
        t.assert(box && box.y > 600, `the composer stays at the bottom (y ${box && Math.round(box.y)})`);
        await t.screenshot('chat-after');
      });
    },
  },
];
