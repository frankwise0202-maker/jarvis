// Realistic holograms (show_hologram version 2, lead tools V7) against the mock: a hull car (the v2
// Camry: a body carved from side, top and front views, 16 panels on it, real seats) streams live,
// its hulls and panels meshed in the worker (assets/hull-worker.js) and settled within 10 s on
// SwiftShader; the exploded view moves the doors outward; tapping a door in 3D selects it; the
// card and library thumbnails show the finished model. Also: the phone layout, an offline reload
// that meshes again with the worker served from the service worker's precache, and a run without
// Worker (the main-thread fallback) that still settles.
//
// State comes from the viewer's data-* test hooks (data-state, data-parts, data-meshing,
// data-mesher, data-exploded, data-selected) and the labels' anchor dots (data-key), never from
// raycast pixels alone.

import { tid } from '../harness.mjs';
import { showHologramToolV2 } from '../../../src/lib/hologram-spec.js';

const viewerAttr = (t, name, page = t.page) => page.locator(tid('hologram-viewer')).getAttribute(`data-${name}`);
async function waitViewer(t, name, value, { timeout = 30000, page = t.page } = {}) {
  await t.waitFor(async () => (await viewerAttr(t, name, page)) === value, { timeout, message: async () => `the hologram viewer's data-${name} to be "${value}" (is "${await viewerAttr(t, name, page)}")` });
}

async function command(t, text, page = t.page) {
  const input = page.locator(tid('hologram-command'));
  await input.fill(text);
  await input.press('Enter');
}

/** Where a labeled part's anchor is on screen (its leader's dot), or null while it has no label. */
async function anchorOf(t, name, page = t.page) {
  return page.evaluate((name) => {
    const label = Array.from(document.querySelectorAll('.holo-label')).find((el) => el.textContent.trim() === name && el.classList.contains('is-shown'));
    if (!label) return null;
    const dot = document.querySelector(`circle.holo-anchor[data-key="${label.dataset.key}"]`);
    if (!dot || dot.style.display === 'none') return null;
    const r = dot.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, name);
}

/** Selects a part by typed words and returns its anchor (the selected part's label is always shown). */
async function selectAndLocate(t, words, id, name, page = t.page) {
  await command(t, words, page);
  await waitViewer(t, 'selected', id, { timeout: 8000, page });
  await page.waitForTimeout(500); // the label layout follows the next frames
  return t.waitFor(() => anchorOf(t, name, page), { timeout: 8000, message: `the "${name}" label's anchor` });
}

/** Records hull worker script requests (and who answered them) on a page. */
function watchWorker(page) {
  const seen = { requests: [], fromServiceWorker: [], workers: [] };
  page.on('request', (r) => {
    if (/\/assets\/hull-worker\.js(\?|$)/.test(r.url())) seen.requests.push(r.url());
  });
  page.on('response', (r) => {
    if (/\/assets\/hull-worker\.js(\?|$)/.test(r.url())) seen.fromServiceWorker.push(r.fromServiceWorker());
  });
  page.on('worker', (w) => seen.workers.push(w.url()));
  return seen;
}

async function openSavedHologram(t, page = t.page) {
  await (await t.visible('library-button', { page })).click();
  await t.visible('library-sheet', { page });
  await t.waitFor(async () => (await t.count('library-item', undefined, page)) > 0, { timeout: 10000, message: 'the library to list the saved hologram' });
  await page.locator(`${tid('library-item')}[data-kind="hologram"] ${tid('library-open')}`).first().click();
  await t.visible('hologram-viewer', { page });
}

export default [
  {
    name: 'holograms-real',
    title: 'Realistic holograms (V7): a hull car streams live with its body and panels meshed in the worker, settles within 10 s, explodes with the doors moving outward, a tapped door is selected, and its thumbnails show it',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      const page = await t.newPage();
      const worker = watchWorker(page);
      await t.goto('/');
      let turn;
      let readyAt = 0;

      await t.step('a new conversation sends show_hologram version 2; the card and the viewer follow the live build', async () => {
        turn = await t.send('[[hologram:v2/camry]] Show me a 2024 Toyota Camry, less boxy and more realistic');
        const card = turn.locator(tid('hologram-card'));
        await card.waitFor({ state: 'visible', timeout: 20000 });
        await t.waitFor(async () => (await card.getAttribute('data-status')) === 'building', { timeout: 5000, message: 'the card to show the live build' });
        t.assert(/hologram · building/i.test(await t.text(card)), `The live card says it is building: "${await t.text(card)}"`);
        const lead = t.requests('lead')[0];
        const tool = lead.body.tools.find((x) => x.name === 'show_hologram');
        t.assert(JSON.stringify(tool) === JSON.stringify(showHologramToolV2()), 'The request carries show_hologram version 2 (lead tools V7)');
        await card.locator(tid('hologram-open')).click();
        await t.visible('hologram-viewer');
        const seen = new Set();
        await t.waitFor(
          async () => {
            const state = await viewerAttr(t, 'state');
            if (state === 'building') seen.add(await viewerAttr(t, 'parts'));
            return state === 'ready';
          },
          { timeout: 60000, interval: 60, message: async () => `the viewer to finish the live build (state "${await viewerAttr(t, 'state')}")` },
        );
        readyAt = Date.now();
        t.assert(seen.size >= 2, `The viewer followed the live build (parts seen while building: ${[...seen].join(', ')})`);
        t.assert((await viewerAttr(t, 'parts')) === '43', `The Camry has 43 parts (got ${await viewerAttr(t, 'parts')})`);
        t.note(`live build: parts ${[...seen].slice(0, 6).join('→')}…`);
      });

      await t.step('the body and panels are meshed in the worker and settle within 10 s', async () => {
        await waitViewer(t, 'meshing', 'settled', { timeout: 10000 });
        const ms = Date.now() - readyAt;
        t.assert(worker.requests.some((u) => /\/assets\/hull-worker\.js\?v=[0-9a-f]{8}$/.test(u)), `The page requested assets/hull-worker.js?v=<build> (${JSON.stringify(worker.requests)})`);
        t.assert((await viewerAttr(t, 'mesher')) === 'worker', `Meshed in the worker (data-mesher "${await viewerAttr(t, 'mesher')}")`);
        await command(t, 'stop rotating');
        await page.waitForTimeout(900);
        await t.screenshot('1-assembled');
        await command(t, 'left view');
        await page.waitForTimeout(1300);
        await t.screenshot('2-side');
        t.note(`settled ${ms} ms after the final spec`);
      });

      await t.step('tapping the left front door in 3D selects it', async () => {
        const at = await selectAndLocate(t, 'select the left front door', 'door-fl', 'Front door (L)');
        await command(t, 'deselect');
        await waitViewer(t, 'selected', '');
        await page.mouse.click(at.x, at.y);
        await waitViewer(t, 'selected', 'door-fl', { timeout: 5000 });
        const card = await t.visible('hologram-part-card');
        t.assert(/Front door \(L\)/.test(await t.text(card)), `The part card shows the door: "${await t.text(card)}"`);
        await t.screenshot('3-door-selected');
      });

      await t.step('the exploded view moves the doors outward', async () => {
        await command(t, 'top view');
        await page.waitForTimeout(1200);
        const la = await selectAndLocate(t, 'select the left front door', 'door-fl', 'Front door (L)');
        const ra = await selectAndLocate(t, 'select the right front door', 'door-fr', 'Front door (R)');
        await (await t.visible('hologram-explode')).click();
        await waitViewer(t, 'exploded', '1');
        await page.waitForTimeout(1500);
        const re = await selectAndLocate(t, 'select the right front door', 'door-fr', 'Front door (R)');
        const le = await selectAndLocate(t, 'select the left front door', 'door-fl', 'Front door (L)');
        const before = Math.abs(la.y - ra.y);
        const after = Math.abs(le.y - re.y);
        t.assert(after > before * 1.15, `The doors move apart, outward (seen from above: ${Math.round(before)} px apart assembled, ${Math.round(after)} px exploded)`);
        await command(t, 'deselect');
        await command(t, 'reset view');
        await page.waitForTimeout(1400);
        await t.screenshot('4-exploded');
        await (await t.visible('hologram-assemble')).click();
        await waitViewer(t, 'exploded', '0');
        t.note(`doors ${Math.round(before)} → ${Math.round(after)} px apart`);
      });

      await t.step('the card and the library show a thumbnail of the finished model', async () => {
        await (await t.visible('hologram-close')).click();
        await page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        await t.waitForTurn(turn, ['done'], { timeout: 45000 });
        const card = turn.locator(tid('hologram-card'));
        await t.waitFor(async () => (await card.locator('img').count()) > 0, { timeout: 30000, message: 'the card thumbnail' });
        await (await t.visible('library-button')).click();
        await t.visible('library-sheet');
        const img = page.locator(`${tid('library-sheet')} .lib-thumb img`).first();
        await img.waitFor({ state: 'visible', timeout: 30000 });
        const info = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight, src: el.currentSrc || el.src }));
        t.assert(info.w > 0 && info.h > 0, `The library thumbnail decodes (${info.w}×${info.h})`);
        // not blank: a thumbnail of the glowing model has bright cyan pixels
        const lit = await img.evaluate(async (el) => {
          const c = document.createElement('canvas');
          c.width = el.naturalWidth;
          c.height = el.naturalHeight;
          const ctx = c.getContext('2d');
          ctx.drawImage(el, 0, 0);
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 110 && d[i + 1] > 70) n++;
          return n;
        });
        t.assert(lit > 400, `The thumbnail shows the model (${lit} lit pixels)`);
        await t.screenshot('5-library');
        t.note(`thumbnail ${info.w}×${info.h}, ${lit} lit pixels`);
      });
    },
  },

  {
    name: 'holograms-real-phone',
    title: 'Realistic holograms on a phone: the hull F-150 builds live, settles in the worker, the phone layout fits (no horizontal overflow), it explodes and a part card sits above the bar',
    device: 'iphone13',
    timeout: 200000,
    async run(t) {
      const page = await t.newPage();
      watchWorker(page);
      await t.goto('/');
      const turn = await t.send('[[hologram:v2/f150]] Show me a 2024 Ford F-150');
      const card = turn.locator(tid('hologram-card'));
      await card.waitFor({ state: 'visible', timeout: 20000 });
      await card.locator(tid('hologram-open')).click();
      await t.visible('hologram-viewer');
      await waitViewer(t, 'state', 'ready', { timeout: 60000 });
      t.assert((await viewerAttr(t, 'layout')) === 'phone', 'The viewer uses its phone layout');
      t.assert((await viewerAttr(t, 'parts')) === '39', `The F-150 has 39 parts (got ${await viewerAttr(t, 'parts')})`);
      await waitViewer(t, 'meshing', 'settled', { timeout: 15000 });
      t.assert((await viewerAttr(t, 'mesher')) === 'worker', 'Meshed in the worker');
      await command(t, 'stop rotating');
      await page.waitForTimeout(900);
      await t.checkNoHorizontalOverflow('hologram viewer');
      await t.screenshot('1-viewer');
      await (await t.visible('hologram-explode')).click();
      await waitViewer(t, 'exploded', '1');
      await page.waitForTimeout(1400);
      await t.screenshot('2-exploded');
      await command(t, 'show me the cab');
      await t.waitFor(async () => !!(await viewerAttr(t, 'selected')), { timeout: 5000, message: '"show me the cab" to select a part' });
      const partCard = await t.visible('hologram-part-card');
      const box = await partCard.boundingBox();
      const bar = await page.locator('.hv__bar').boundingBox();
      t.assert(box && bar && box.y + box.height <= bar.y + 2, 'The part card sits above the bottom bar');
      await page.waitForTimeout(600);
      await t.screenshot('3-part-card');
      await t.checkNoHorizontalOverflow('part card');
      await (await t.visible('hologram-close')).click();
      await t.waitForTurn(turn, ['done'], { timeout: 45000 });
    },
  },

  {
    name: 'holograms-real-offline',
    title: 'Realistic holograms offline: after an offline reload through the service worker, a saved hull car reopens and meshes again with the worker served from the precache',
    device: 'desktop',
    timeout: 200000,
    // While offline, failed network attempts and the SW update check are expected to log errors.
    allowConsole: [/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED|Failed to load resource/, /Failed to update a ServiceWorker|An unknown error occurred when fetching the script/],
    async run(t) {
      const srv = await t.startExtraServer(); // shut down later to go truly offline
      const page = await t.newPage({ serverUrl: srv.url });
      const worker = watchWorker(page);
      await t.goto('/', { serverUrl: srv.url });

      await t.step('the service worker precaches the hull worker', async () => {
        const reg = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then((r) => !!r.active), new Promise((resolve) => setTimeout(() => resolve(false), 20000))]));
        t.assert(reg, 'A service worker activates');
        await t.waitFor(
          () =>
            page.evaluate(async () => {
              const keys = (await caches.keys()).filter((k) => k.startsWith('jarvis-'));
              if (!keys.length) return false;
              const cache = await caches.open(keys[0]);
              return (await cache.keys()).some((r) => new URL(r.url).pathname.endsWith('/assets/hull-worker.js'));
            }),
          { timeout: 20000, message: 'assets/hull-worker.js in the jarvis-* precache' },
        );
        await t.reload(page);
        t.assert(await page.evaluate(() => !!navigator.serviceWorker.controller), 'The page is controlled by the service worker');
      });

      await t.step('online: a hull car is built, meshed in the worker and saved', async () => {
        const turn = await t.send('[[hologram:v2/model3]] Show me a Tesla Model 3', { page });
        await t.waitForTurn(turn, ['done'], { timeout: 60000 });
        await turn.locator(tid('hologram-open')).click();
        await t.visible('hologram-viewer', { page });
        await waitViewer(t, 'state', 'ready', { timeout: 30000, page });
        await waitViewer(t, 'meshing', 'settled', { timeout: 15000, page });
        t.assert((await viewerAttr(t, 'model', page)).startsWith('lib_'), 'Saved to the library');
        await (await t.visible('hologram-close', { page })).click();
      });

      await t.step('offline reload: the saved hull car meshes again, with the worker from the precache', async () => {
        await srv.close(); // the server is gone: only the service worker can answer now
        await page.context().setOffline(true);
        const before = worker.fromServiceWorker.length;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        await t.waitReady(page);
        await openSavedHologram(t, page);
        await waitViewer(t, 'state', 'ready', { timeout: 30000, page });
        await waitViewer(t, 'meshing', 'settled', { timeout: 15000, page });
        t.assert((await viewerAttr(t, 'mesher', page)) === 'worker', `Meshed in the worker offline (data-mesher "${await viewerAttr(t, 'mesher', page)}")`);
        const offline = worker.fromServiceWorker.slice(before);
        t.assert(offline.length >= 1 && offline.every(Boolean), `The worker script came from the service worker (${JSON.stringify(offline)})`);
        await page.waitForTimeout(800);
        await t.screenshot('offline-hull-car', page);
        await page.context().setOffline(false);
      });
    },
  },

  {
    name: 'holograms-real-noworker',
    title: 'Realistic holograms without Worker: the hull Camry meshes on the main thread (one job per task) and still settles, with no errors',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      const page = await t.newPage();
      await page.addInitScript(() => Object.defineProperty(window, 'Worker', { value: undefined, configurable: true }));
      const worker = watchWorker(page);
      await t.goto('/');
      const turn = await t.send('[[hologram:v2/camry]] Show me a 2024 Toyota Camry');
      const card = turn.locator(tid('hologram-card'));
      await card.waitFor({ state: 'visible', timeout: 20000 });
      await card.locator(tid('hologram-open')).click();
      await t.visible('hologram-viewer');
      await waitViewer(t, 'state', 'ready', { timeout: 60000 });
      await waitViewer(t, 'meshing', 'settled', { timeout: 90000 });
      t.assert((await viewerAttr(t, 'mesher')) === 'main', `Meshed on the main thread (data-mesher "${await viewerAttr(t, 'mesher')}")`);
      t.assert(worker.requests.length === 0, 'No worker script was requested');
      await command(t, 'stop rotating');
      await page.waitForTimeout(900);
      await t.screenshot('1-main-thread');
      await (await t.visible('hologram-close')).click();
      await t.waitForTurn(turn, ['done'], { timeout: 45000 });
      await t.waitFor(async () => (await card.locator('img').count()) > 0, { timeout: 40000, message: 'the card thumbnail' });
    },
  },
];
