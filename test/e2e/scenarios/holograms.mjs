// Holograms, blueprints, reference photos and the saved library (lead tools version 4) against the
// mock: the live build card → the full-screen viewer (WebGL on SwiftShader) → explode by button
// and by typed command → a part's card → "Build 2D blueprint" (a new turn) → the blueprint card and
// viewer; the Blueprints library reopening both without any API request; a part whose blueprint
// is saved; photos from a faked Wikimedia Commons; words for Jarvis captioned in the viewer; the
// Blueprint protocol; the backup round trip; and the phone layout. Voice Mode × holograms
// (voice-holograms): spoken requests open the viewer over Voice Mode, spoken commands act on it.
//
// State is read from the viewers' data-* test hooks (data-state, data-parts, data-exploded,
// data-labels, data-selected, data-panel), never from raycast pixels.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { tid } from '../harness.mjs';
import { turnContextOf } from '../../mock/content.mjs';
import { installFakeSpeech } from './features.mjs';
import { LEAD_SYSTEM_V2, leadToolsV3 } from '../../../src/engine/prompts.js';

// ---- helpers -------------------------------------------------------------------------------------

/** Decode a PNG screenshot (8-bit RGB or RGBA) into { width, height, data: RGBA }. */
function decodePng(buf) {
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colorType = body[9];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? line[i - bpp] : 0;
      const b = prev[i];
      const c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = line[x * bpp];
      out[(y * width + x) * 4 + 1] = line[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = line[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? line[x * bpp + 3] : 255;
    }
    prev = line;
  }
  return { width, height, data: out };
}

/** Pixels that glow (the hologram's cyan lines and fills on the near-black stage). */
function litPixels(png) {
  const { data } = decodePng(png);
  let lit = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i + 2] > 110 && data[i + 1] > 70) lit++;
  return lit;
}

const viewerAttr = (t, name) => t.page.locator(tid('hologram-viewer')).getAttribute(`data-${name}`);
async function waitViewer(t, name, value, { timeout = 30000, message } = {}) {
  await t.waitFor(async () => (await viewerAttr(t, name)) === value, { timeout, message: message || (async () => `the hologram viewer's data-${name} to be "${value}" (is "${await viewerAttr(t, name)}")`) });
}

/** Type in the viewer's command field and press Enter. */
async function command(t, text) {
  const input = t.page.locator(tid('hologram-command'));
  await input.fill(text);
  await input.press('Enter');
}

/** The newest lead request's last user text (turn context + message). */
function lastLeadText(t) {
  const lead = t.requests('lead').at(-1);
  const msgs = lead?.body?.messages || [];
  const user = [...msgs].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'text'));
  return user ? user.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') : '';
}

/** The library sheet's rows as { id, kind, title }. */
async function libraryRows(t) {
  return t.page.locator(tid('library-item')).evaluateAll((els) => els.map((e) => ({ id: e.dataset.id, kind: e.dataset.kind, title: (e.querySelector('.lib-title')?.textContent || '').trim() })));
}

async function openLibrary(t, { viaHistory = false } = {}) {
  if (viaHistory) {
    await (await t.visible('history-button')).click();
    await (await t.visible('history-library')).click();
  } else {
    await (await t.visible('library-button')).click();
  }
  await t.visible('library-sheet');
  await t.waitFor(async () => (await t.count('library-item')) > 0 || (await t.count('library-empty')) > 0, { timeout: 10000, message: 'the library to list its items' });
  // Settled: the sheet finished opening (the History drawer, when used, finished closing).
  await t.waitFor(() => t.page.evaluate(() => Array.from(document.querySelectorAll('.sheet-wrap')).every((w) => w.dataset.state === 'open')), { timeout: 5000, message: 'the library sheet to finish opening' });
}

async function closeLibrary(t) {
  await t.page.locator(`${tid('library-sheet')} ${tid('sheet-close')}`).click();
  await t.page.locator(tid('library-sheet')).waitFor({ state: 'detached', timeout: 5000 });
}

// ---- Voice Mode × holograms helpers -------------------------------------------------------------

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const voiceState = (t) => t.page.evaluate(() => JSON.parse(JSON.stringify(window.__voice)));
const holoLog = (t) => t.page.evaluate(() => JSON.parse(JSON.stringify(window.__holo.log)));

/**
 * In the page: every 40 ms, record what changed in the hologram viewer's test hooks and caption,
 * the blueprint viewer's state, Voice Mode's state and whether a viewer covers it (inert), so the
 * scenario can check the order of things after the fact instead of racing them.
 */
function recordViewers() {
  const rec = { log: [] };
  window.__holo = rec;
  let last = '';
  setInterval(() => {
    const v = document.querySelector('[data-testid="hologram-viewer"]');
    const vm = document.querySelector('[data-testid="voice-mode"]');
    const cap = v ? v.querySelector('[data-testid="hologram-caption"]') : null;
    const bp = document.querySelector('[data-testid="blueprint-overlay"]');
    const mic = v ? v.querySelector('[data-testid="hologram-mic"]') : null;
    const e = {
      viewer: v ? v.getAttribute('data-state') || '' : null,
      parts: v ? v.getAttribute('data-parts') || '' : '',
      exploded: v ? v.getAttribute('data-exploded') || '' : '',
      selected: v ? v.getAttribute('data-selected') || '' : '',
      voice: v ? v.getAttribute('data-voice') || '' : '',
      mic: mic ? mic.getAttribute('aria-pressed') || '' : '',
      caption: cap && !cap.hidden ? ((cap.querySelector('.hv__caption-text') || {}).textContent || '').replace(/\s+/g, ' ').trim() : '',
      captionState: cap && !cap.hidden ? cap.getAttribute('data-state') || '' : '',
      blueprint: bp ? bp.getAttribute('data-state') || '' : null,
      vm: vm ? vm.getAttribute('data-state') || '' : null,
      covered: vm ? !!vm.inert : false,
      level: vm ? vm.getAttribute('data-level-loop') || '' : '',
    };
    const key = JSON.stringify(e);
    if (key === last) return;
    last = key;
    rec.log.push({ at: performance.now(), ...e });
  }, 40);
}

/** The newest owner message (with text) of a request body, and its text without the turn context. */
function newestUserMessage(body) {
  const msgs = Array.isArray(body?.messages) ? body.messages : [];
  return [...msgs].reverse().find((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b.type === 'text')) || null;
}
function newestUserText(body) {
  const msg = newestUserMessage(body);
  return msg ? msg.content.filter((b) => b.type === 'text' && !/<turn_context>/.test(b.text)).map((b) => b.text).join('\n') : '';
}
function newestTurnContext(body) {
  const msg = newestUserMessage(body);
  return msg ? (msg.content.find((b) => b.type === 'text' && /<turn_context>/.test(b.text)) || {}).text || '' : '';
}

/**
 * In the page: how much of each shown hologram label is under the viewer's caption, part card or
 * toast, and how much of the screen the model keeps between the top chrome and the bottom chrome.
 */
function viewerGeometry() {
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e || e.hidden || !e.getClientRects().length) return null;
    const b = e.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
  };
  const top = box('.hv__top');
  const caption = box('.hv__caption');
  const card = box('.hv__card');
  const toast = box('.hv__toast');
  const bar = box('.hv__bar');
  const chrome = [caption, card, toast].filter(Boolean);
  const under = (r) => {
    let worst = 0;
    for (const c of chrome) {
      const w = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left));
      const h = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
      worst = Math.max(worst, (w * h) / Math.max(1, (r.right - r.left) * (r.bottom - r.top)));
    }
    return worst;
  };
  const labels = Array.from(document.querySelectorAll('.holo-label.is-shown')).map((l) => ({ name: (l.textContent || '').trim(), under: Math.round(under(l.getBoundingClientRect()) * 100) / 100 }));
  const vh = window.innerHeight;
  const compact = caption && document.querySelector('.hv__caption').dataset.compact === 'true';
  const upper = Math.max(top ? top.bottom : 0, compact && caption ? caption.bottom : 0);
  const lowerCands = [bar && bar.top, card && card.top, !compact && caption ? caption.top : null].filter((v) => typeof v === 'number');
  const lower = lowerCands.length ? Math.min(...lowerCands) : vh;
  return { vh, free: Math.round(lower - upper), compact: !!compact, caption: !!caption, card: !!card, labels };
}

/** The model keeps a third of the screen and no label is more than 30% under the chrome. */
async function checkRoom(t, when) {
  const g = await t.page.evaluate(viewerGeometry);
  t.assert(g.free >= g.vh / 3, `${when}: the model keeps at least a third of the screen (${g.free} of ${g.vh} px)`);
  const hidden = g.labels.filter((l) => l.under > 0.3);
  t.assert(g.labels.length > 0 && !hidden.length, `${when}: no label is under the caption, card or toast (${JSON.stringify(g.labels)})`);
  return g;
}

/** Make the current conversation one from before holograms (v5: the V2 prompt, the V3 tools). */
async function refreezeAsV5(t) {
  return t.page.evaluate(async ({ system, tools }) => {
    const req = indexedDB.open('jarvis');
    const db = await new Promise((resolve) => (req.onsuccess = () => resolve(req.result)));
    const all = await new Promise((resolve) => {
      const q = db.transaction('conversations').objectStore('conversations').getAll();
      q.onsuccess = () => resolve(q.result);
    });
    const conv = all.find((x) => typeof x.id === 'string' && x.system);
    const hist = all.find((x) => Array.isArray(x.apiMessages));
    conv.system = system;
    conv.tools = tools;
    // A v5 conversation's history was written under the v5 prompt: no thinking blocks signed under v6.
    if (hist) for (const m of hist.apiMessages) if (m.role === 'assistant' && Array.isArray(m.content)) m.content = m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking');
    await new Promise((resolve) => {
      const tx = db.transaction('conversations', 'readwrite');
      tx.objectStore('conversations').put(conv);
      if (hist && hist !== conv) tx.objectStore('conversations').put(hist);
      tx.oncomplete = resolve;
    });
    db.close();
    return conv.id;
  }, { system: LEAD_SYSTEM_V2, tools: leadToolsV3() });
}

// ---- scenarios -------------------------------------------------------------------------------------

export default [
  {
    name: 'holograms',
    title: 'Hologram: live build card → 3D viewer (explode by button and by words) → part card → 2D blueprint turn → blueprint card and viewer; library reopens both for free; saved part blueprint; photos; words for Jarvis',
    device: 'desktop',
    timeout: 300000,
    fakeWikimedia: true,
    // SwiftShader reports GPU stalls for the thumbnail read-back as warnings, never errors.
    async run(t) {
      await t.newPage();
      await t.goto('/');
      let turn;
      let modelId = '';

      await t.step('the live build card opens the viewer, which follows the build', async () => {
        turn = await t.send('[[hologram:alternator]] Show me how a car alternator works');
        const card = turn.locator(tid('hologram-card'));
        await card.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {
          throw new Error('A hologram card should appear while show_hologram streams');
        });
        await t.waitFor(async () => (await card.getAttribute('data-status')) === 'building', { timeout: 5000, message: 'the card to show the live build (data-status="building")' });
        t.assert(/hologram · building/i.test(await t.text(card)), `The live card says it is building: "${await t.text(card)}"`);
        await t.screenshot('1-card-building');
        await card.locator(tid('hologram-open')).click();
        await t.visible('hologram-viewer');
        // Opened while building: the parts count grows with the stream, then the model is ready.
        const seen = new Set();
        await t.waitFor(
          async () => {
            const parts = await viewerAttr(t, 'parts');
            const state = await viewerAttr(t, 'state');
            if (state === 'building') seen.add(parts);
            return state === 'ready' ? state : null;
          },
          { timeout: 45000, interval: 60, message: async () => `the viewer to finish the live build (state "${await viewerAttr(t, 'state')}")` },
        );
        t.assert(seen.size >= 2, `The viewer followed the live build (part counts seen while building: ${[...seen].join(', ') || 'none'})`);
        t.assert((await viewerAttr(t, 'parts')) === '19', `The finished alternator has 19 parts (got ${await viewerAttr(t, 'parts')})`);
        modelId = await viewerAttr(t, 'model');
        t.assert(/^lib_[a-z0-9]{6,16}$/.test(modelId || ''), `The finished hologram is saved to the library (data-model "${modelId}")`);
        t.note(`live build: parts seen ${[...seen].join('→')}`);
      });

      await t.step('the WebGL canvas renders the model', async () => {
        await (await t.visible('hologram-labels')).click();
        await waitViewer(t, 'labels', 'off');
        await t.page.waitForTimeout(400);
        const vp = t.page.viewportSize();
        const png = await t.page.screenshot({ clip: { x: vp.width * 0.25, y: vp.height * 0.2, width: vp.width * 0.5, height: vp.height * 0.5 } });
        const lit = litPixels(png);
        t.assert(lit > 2500, `The 3D canvas shows a glowing model (${lit} lit pixels in the centre)`);
        await command(t, 'labels on');
        await waitViewer(t, 'labels', 'on');
        await t.page.waitForTimeout(500);
        await t.screenshot('2-viewer-assembled');
        t.note(`canvas: ${lit} lit pixels`);
      });

      await t.step('explode by button and by typed command (no request)', async () => {
        const before = t.requests('lead').length;
        await (await t.visible('hologram-explode')).click();
        await waitViewer(t, 'exploded', '1');
        await t.page.waitForTimeout(1300);
        await t.screenshot('3-viewer-exploded');
        await (await t.visible('hologram-assemble')).click();
        await waitViewer(t, 'exploded', '0');
        await command(t, 'take it apart');
        await waitViewer(t, 'exploded', '1');
        await command(t, 'put it back together');
        await waitViewer(t, 'exploded', '0');
        t.assert(t.requests('lead').length === before, 'Viewer commands are local: no API request');
      });

      await t.step('a part → its card → Build 2D blueprint → a new turn, the blueprint card and viewer', async () => {
        await t.waitForTurn(turn, ['done'], { timeout: 45000 });
        await (await t.visible('hologram-parts-button')).click();
        await waitViewer(t, 'panel', 'parts');
        await t.page.locator(`${tid('hologram-part')}[data-part-id="rotor"]`).click();
        await waitViewer(t, 'selected', 'rotor');
        const card = await t.visible('hologram-part-card');
        t.assert(/Rotor \(claw poles\)/.test(await t.text(card)) && /Low-carbon steel/.test(await t.text(card)), `The part card shows the name and material: "${await t.text(card)}"`);
        const build = t.page.locator(tid('hologram-build-blueprint'));
        await t.waitFor(async () => !(await build.isDisabled()) && /Build 2D blueprint/.test(await t.text(build)), { timeout: 10000, message: async () => `"Build 2D blueprint" to be ready (got "${await t.text(build)}")` });
        t.assert(/≈ \$\d+\.\d\d/.test(await t.text(build)), `The button shows the approximate cost: "${await t.text(build)}"`);
        await t.screenshot('4-part-card');
        const before = t.requests('lead').length;
        await build.click();
        const overlay = await t.visible('blueprint-overlay', { timeout: 30000, message: 'The blueprint viewer opens while Jarvis draws' });
        t.assert(t.requests('lead').length > before, 'Building a blueprint sends a new request');
        const sent = lastLeadText(t);
        t.assert(/Blueprint request/.test(sent) && /Blueprint: Rotor \(claw poles\)/.test(sent), 'The request carries the Blueprint request block and the visible "Blueprint: Rotor (claw poles) (…)" message');
        await t.waitFor(async () => (await overlay.getAttribute('data-state')) === 'done', { timeout: 45000, message: 'the blueprint to finish drawing' });
        t.assert((await t.count('blueprint-part')) >= 5, 'The finished blueprint lists its parts');
        await t.page.waitForTimeout(600);
        await t.screenshot('5-blueprint-viewer');
        await t.page.locator(`${tid('blueprint-overlay')} ${tid('blueprint-close')}`).click();
        await t.page.locator(tid('blueprint-overlay')).waitFor({ state: 'detached', timeout: 5000 });
        await t.visible('hologram-viewer', { message: 'Closing the blueprint returns to the hologram' });
        await (await t.visible('hologram-close')).click();
        await t.page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        const bpTurn = t.page.locator(tid('turn-jarvis')).last();
        await t.waitForTurn(bpTurn, ['done'], { timeout: 45000 });
        const bpCard = bpTurn.locator(tid('blueprint-card'));
        await bpCard.waitFor({ state: 'visible', timeout: 5000 });
        t.assert((await bpCard.getAttribute('data-status')) === 'done', 'The blueprint card is done');
        t.assert(/Blueprint: Rotor \(claw poles\)/.test(await t.text(t.page.locator(tid('turn-user')).last())), 'The visible user message names the part');
        await t.waitFor(async () => (await bpCard.locator('img').count()) > 0, { timeout: 30000, message: 'the blueprint card to get its thumbnail' });
        await t.screenshot('6-chat-cards');
        const n = t.requests('lead').length;
        await bpCard.locator(tid('blueprint-open')).click();
        await t.visible('blueprint-overlay');
        await (await t.visible('blueprint-close')).click();
        t.assert(t.requests('lead').length === n, 'Reopening a blueprint from its card sends nothing');
        t.assertAppendOnly();
      });

      await t.step('the library lists both and reopens them with no API request', async () => {
        const before = t.mock.requests.length;
        await openLibrary(t);
        const rows = await libraryRows(t);
        t.assert(rows.length === 2 && rows.some((r) => r.kind === 'hologram') && rows.some((r) => r.kind === 'blueprint'), `The library lists the hologram and the blueprint: ${JSON.stringify(rows)}`);
        t.assert(rows.find((r) => r.kind === 'hologram').id === modelId, 'The library hologram is the one shown in the chat');
        await t.waitFor(async () => (await t.page.locator(`${tid('library-sheet')} .lib-thumb img`).count()) === 2, { timeout: 40000, message: 'both library thumbnails' });
        await t.screenshot('7-library');
        await t.page.locator(`${tid('library-item')}[data-kind="hologram"] ${tid('library-open')}`).click();
        await t.visible('hologram-viewer');
        await waitViewer(t, 'state', 'ready');
        t.assert((await viewerAttr(t, 'parts')) === '19', 'The saved hologram reopens in full');
        await (await t.visible('hologram-close')).click();
        await t.page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        await t.visible('library-sheet', { message: 'Closing the viewer returns to the library' });
        await t.page.locator(`${tid('library-item')}[data-kind="blueprint"] ${tid('library-open')}`).click();
        const bp = await t.visible('blueprint-overlay');
        t.assert((await bp.getAttribute('data-state')) === 'done', 'The saved blueprint opens finished');
        await (await t.visible('blueprint-close')).click();
        // Download: the blueprint as SVG, the hologram as a PNG picture.
        const [svgDl] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }), t.page.locator(`${tid('library-item')}[data-kind="blueprint"] ${tid('library-download')}`).click()]);
        t.assert(/^jarvis-blueprint-.+\.svg$/.test(svgDl.suggestedFilename()) && /^<\?xml[\s\S]*<svg/.test(readFileSync(await svgDl.path(), 'utf8')), `The blueprint downloads as SVG (${svgDl.suggestedFilename()})`);
        const [pngDl] = await Promise.all([t.page.waitForEvent('download', { timeout: 45000 }), t.page.locator(`${tid('library-item')}[data-kind="hologram"] ${tid('library-download')}`).click()]);
        const png = readFileSync(await pngDl.path());
        t.assert(/^jarvis-hologram-.+\.png$/.test(pngDl.suggestedFilename()) && png[1] === 0x50 && png.length > 20000, `The hologram downloads as a PNG picture (${pngDl.suggestedFilename()}, ${png.length} bytes)`);
        t.assert(t.mock.requests.length === before, `Reopening and downloading saved items sends no API request (${t.mock.requests.length - before} sent)`);
      });

      await t.step('a part with a saved blueprint opens it with no request; photos come from Commons', async () => {
        const before = t.mock.requests.length;
        await t.page.locator(`${tid('library-item')}[data-kind="hologram"] ${tid('library-open')}`).click();
        await waitViewer(t, 'state', 'ready');
        await command(t, 'select the rotor');
        await waitViewer(t, 'selected', 'rotor');
        const build = t.page.locator(tid('hologram-build-blueprint'));
        await t.waitFor(async () => (await build.getAttribute('data-saved')) === 'true', { timeout: 10000, message: 'the part card to offer the saved blueprint' });
        t.assert(/Open blueprint/.test(await t.text(build)), `The button opens the saved blueprint: "${await t.text(build)}"`);
        await build.click();
        await t.visible('blueprint-overlay');
        await (await t.visible('blueprint-close')).click();
        await t.visible('hologram-viewer');
        t.assert(t.mock.requests.length === before, 'Opening a saved part blueprint sends nothing');

        await (await t.visible('hologram-part-photos')).click();
        await waitViewer(t, 'panel', 'photos');
        await t.page.locator(tid('photo-thumb')).first().waitFor({ state: 'visible', timeout: 15000 });
        t.assert(t.wikimedia.searches.length >= 1 && t.wikimedia.searches.every((u) => u.startsWith('https://commons.wikimedia.org/w/api.php?')), 'Photos are searched on Wikimedia Commons');
        // The part's search names the object too ("alternator rotor"); the bare part name is merged in after it.
        const words = t.wikimedia.searches.map((u) => new URL(u).searchParams.get('gsrsearch'));
        t.assert(words.includes('alternator rotor filetype:bitmap|drawing') && words.includes('rotor filetype:bitmap|drawing'), `The search names the object and the part (searched: ${JSON.stringify(words)})`);
        t.assert((await t.page.locator(tid('hologram-photo-query')).inputValue()) === 'alternator rotor', 'The search field shows the object-qualified words');
        await t.page.waitForTimeout(400);
        await t.screenshot('8-photos');
        await t.page.locator(tid('photo-thumb')).first().click();
        const credit = await t.visible('photo-credit');
        t.assert(/Photo: .+ · Wikimedia Commons/.test(await t.text(credit)), 'The photo viewer credits the author and Commons');
        await (await t.visible('photo-close')).click();
        t.assert(t.mock.requests.length === before, 'Photos cost no API request');
      });

      await t.step('words that are not a command go to Jarvis; the reply is captioned in the viewer', async () => {
        const before = t.requests('lead').length;
        await command(t, 'What does the voltage regulator actually do?');
        const caption = await t.visible('hologram-caption');
        await t.waitFor(async () => t.requests('lead').length > before, { timeout: 10000, message: 'the question to be sent' });
        t.assert(/What does the voltage regulator actually do\?/.test(lastLeadText(t)), 'The words were sent as a message');
        const msgs = t.requests('lead').at(-1).body.messages;
        t.assert(msgs.some((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use' && b.name === 'show_hologram')), "It went to the hologram's conversation");
        await t.waitFor(async () => (await caption.getAttribute('data-state')) === 'done', { timeout: 30000, message: async () => `the caption to show the finished reply (state "${await caption.getAttribute('data-state')}")` });
        t.assert((await t.text(caption)).length > 20, 'The caption shows the reply');
        t.assert((await viewerAttr(t, 'state')) === 'ready', 'The viewer stays open');
        await t.screenshot('9-caption');
        await (await t.visible('hologram-close')).click();
        await closeLibrary(t);
        t.assertAppendOnly();
      });
    },
  },

  {
    name: 'holograms-phone',
    title: 'Hologram viewer on a phone: card → viewer, explode, a part card, the parts list, no horizontal overflow; the library from History',
    device: 'iphone13',
    timeout: 180000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[hologram:camry]] Show me a 2024 Toyota Camry Hybrid');
      await t.waitForTurn(turn, ['done'], { timeout: 60000 });
      const card = turn.locator(tid('hologram-card'));
      await t.waitFor(async () => (await card.locator('img').count()) > 0, { timeout: 30000, message: 'the card thumbnail' });
      await t.screenshot('1-card');
      await card.locator(tid('hologram-open')).click();
      await t.visible('hologram-viewer');
      await waitViewer(t, 'state', 'ready', { timeout: 45000 });
      t.assert((await viewerAttr(t, 'layout')) === 'phone', 'The viewer uses its phone layout');
      t.assert((await viewerAttr(t, 'parts')) === '43', `The Camry has 43 parts (got ${await viewerAttr(t, 'parts')})`);
      await t.page.waitForTimeout(1200);
      await t.checkNoHorizontalOverflow('hologram viewer');
      await t.screenshot('2-viewer');
      await (await t.visible('hologram-explode')).click();
      await waitViewer(t, 'exploded', '1');
      await t.page.waitForTimeout(1300);
      await t.screenshot('3-exploded');
      await command(t, 'show me the alternator');
      await t.waitFor(async () => !!(await viewerAttr(t, 'selected')), { timeout: 5000, message: '"show me the alternator" to select a part' });
      const card2 = await t.visible('hologram-part-card');
      t.assert(/DC-DC converter/i.test(await t.text(card2)), 'On the Camry, "the alternator" finds the DC-DC converter (its aka)');
      // On a phone the card replaces the tool row and stays clear of the bottom bar.
      const box = await card2.boundingBox();
      const bar = await t.page.locator('.hv__bar').boundingBox();
      t.assert(box && bar && box.y + box.height <= bar.y + 2, 'The part card sits above the bottom bar');
      await t.page.waitForTimeout(800);
      await t.screenshot('4-part-card');
      await command(t, 'parts list');
      await waitViewer(t, 'panel', 'parts');
      await t.page.waitForTimeout(500);
      await t.screenshot('5-parts');
      await t.checkNoHorizontalOverflow('parts panel');
      await t.page.keyboard.press('Escape');
      await waitViewer(t, 'panel', '');
      await (await t.visible('hologram-close')).click();
      await openLibrary(t, { viaHistory: true });
      t.assert((await libraryRows(t)).length === 1, 'The library lists the Camry');
      await t.screenshot('6-library');
      await t.checkNoHorizontalOverflow('library');
    },
  },

  {
    name: 'blueprint-protocol',
    title: 'The Blueprint protocol: swarm research, then a labeled hologram and a how-it-works / how-it-is-made write-up with sources, and no 2D sheet',
    device: 'desktop',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const grid = await t.visible('protocol-grid');
      const tile = grid.locator(tid('protocol-tile', { 'data-id': 'blueprint' }));
      await tile.scrollIntoViewIfNeeded();
      t.assert(/Blueprint/.test(await t.text(tile)), 'The home screen has a Blueprint tile');
      await tile.click();
      const input = await t.visible('protocol-input');
      t.assert(/blueprint/i.test((await input.getAttribute('aria-label')) || (await input.getAttribute('placeholder')) || '') || /What should I blueprint\?/.test(await t.text(grid)), 'The tile asks "What should I blueprint?"');
      // The mock researches with [[swarm:3]], then builds the [[hologram:…]] sample (see test/mock/visuals.mjs).
      await input.fill('a car alternator [[swarm:3]] [[hologram:alternator]]');
      await t.screenshot('1-input');
      const before = await t.count('turn-jarvis');
      await t.page.locator(tid('protocol-run')).click();
      await t.waitFor(async () => (await t.count('turn-jarvis')) > before, { timeout: 10000, message: 'the protocol to start a turn' });
      const turn = t.page.locator(tid('turn-jarvis')).last();
      await turn.locator(tid('mission-card')).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {
        throw new Error('The Blueprint protocol researches with a swarm first');
      });
      await t.waitForTurn(turn, ['done'], { timeout: 120000 });
      const card = turn.locator(tid('hologram-card'));
      t.assert((await card.count()) === 1 && (await card.getAttribute('data-status')) === 'done', 'Then a hologram');
      t.assert((await turn.locator(tid('blueprint-card')).count()) === 0, 'No 2D sheet is drawn');
      const firstLead = t.requests('lead').find((r) => JSON.stringify(r.body.messages.at(-1)).includes('Protocol: Blueprint'));
      t.assert(firstLead, 'The lead request carries the Blueprint protocol brief');
      const brief = JSON.stringify(firstLead.body.messages.at(-1));
      t.assert(/show_hologram/.test(brief) && /Do not draw any 2D blueprint/.test(brief) && /How it works/.test(brief), 'The brief asks for research, one hologram, the write-up and no 2D');
      t.assert(t.requests('lead').every((r) => !JSON.stringify(r.body.messages).includes('"name":"draw_blueprint"')), 'draw_blueprint is never called');
      const text = await t.text(turn);
      t.assert(/sources?/i.test(text), 'The write-up cites sources');
      await t.screenshot('2-done');
      t.note(`turn: ${t.requests('lead').length} lead requests, ${t.requests('worker').length} agents`);
    },
  },

  {
    name: 'holograms-saved',
    title: 'open_saved shows a saved hologram as a "Saved" card (no rebuild); a hologram that cannot be built leaves an error card',
    device: 'iphone13',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const first = await t.send('[[hologram:battery]] Show me an AA battery');
      await t.waitForTurn(first, ['done'], { timeout: 45000 });

      await t.step('open_saved reopens it with a Saved badge', async () => {
        const turn = await t.send('[[open-saved]] Show me that battery again');
        await t.waitForTurn(turn, ['done'], { timeout: 30000 });
        const sent = lastLeadText(t);
        t.assert(/Saved holograms and blueprints/.test(sent) && /lib_[a-z0-9]{6,16} · hologram · "AA alkaline battery/.test(sent), 'The turn context lists the saved hologram');
        const card = turn.locator(tid('hologram-card'));
        await card.waitFor({ state: 'visible', timeout: 5000 });
        t.assert((await card.getAttribute('data-status')) === 'done' && /Saved/.test(await t.text(card)), `The reopened hologram is a "Saved" card: "${await t.text(card)}"`);
        t.assert(t.requests('lead').every((r) => !JSON.stringify(r.body.messages.at(-1)).includes('"name":"show_hologram"')), 'Nothing was rebuilt');
        await card.locator(tid('hologram-open')).click();
        await waitViewer(t, 'state', 'ready');
        t.assert((await viewerAttr(t, 'parts')) === '9', 'The saved hologram opens in full');
        await t.screenshot('1-saved-viewer');
        await (await t.visible('hologram-close')).click();
      });

      await t.step('a hologram that cannot be built leaves an error card', async () => {
        const turn = await t.send('[[hologram:broken]] Show me a warp drive');
        await t.waitForTurn(turn, ['done'], { timeout: 30000 });
        const card = turn.locator(tid('hologram-card'));
        await card.waitFor({ state: 'visible', timeout: 5000 });
        t.assert((await card.getAttribute('data-status')) === 'error', `The card shows the failure (data-status ${await card.getAttribute('data-status')})`);
        t.assert(/incomplete/i.test(await t.text(card)), 'It says the hologram is incomplete');
        t.assert(!(await card.locator(tid('hologram-open')).isVisible()), 'Nothing to open');
        await t.screenshot('2-error-card');
      });
      t.assertAppendOnly();
    },
  },

  {
    name: 'holograms-backup',
    title: 'A backup carries the saved library: export, import on a fresh device, reopen the hologram with no API request',
    device: 'desktop',
    timeout: 120000,
    async run(t) {
      await t.newPage();
      await t.goto('/');
      const turn = await t.send('[[hologram:battery]] Show me an AA battery');
      await t.waitForTurn(turn, ['done'], { timeout: 45000 });
      await t.waitFor(async () => (await turn.locator(`${tid('hologram-card')} img`).count()) > 0, { timeout: 30000, message: 'the saved hologram thumbnail' });
      await (await t.visible('settings-button')).click();
      await t.visible('settings-sheet');
      const exportBtn = t.page.locator(tid('export-backup'));
      await exportBtn.scrollIntoViewIfNeeded();
      const [download] = await Promise.all([t.page.waitForEvent('download', { timeout: 15000 }), exportBtn.click()]);
      const json = readFileSync(await download.path(), 'utf8');
      const backup = JSON.parse(json);
      const items = Array.isArray(backup.library) ? backup.library : Array.isArray(backup.library?.items) ? backup.library.items : [];
      t.assert(items.length === 1 && items[0].kind === 'hologram' && /AA alkaline battery/.test(items[0].title), `The backup carries the saved hologram (library: ${JSON.stringify(Object.keys(backup))})`);
      t.assert(!/sk-ant-/.test(json), 'No API key in the backup');

      // A fresh device: import, then the library has it and it opens for free.
      const page2 = await t.newPage();
      t.page = page2;
      await t.goto('/', { page: page2 });
      await (await t.visible('settings-button', { page: page2 })).click();
      await t.visible('settings-sheet', { page: page2 });
      await page2.locator(tid('import-file')).setInputFiles({ name: 'jarvis-backup.json', mimeType: 'application/json', buffer: Buffer.from(json) });
      await (await t.visible('import-confirm', { page: page2 })).click();
      await t.visible('toast', { page: page2 });
      await page2.locator(`${tid('settings-sheet')} ${tid('settings-close')}`).click();
      const before = t.mock.requests.length;
      await openLibrary(t);
      const rows = await libraryRows(t);
      t.assert(rows.length === 1 && rows[0].kind === 'hologram' && rows[0].id === items[0].id, `The imported library lists the hologram: ${JSON.stringify(rows)}`);
      await t.page.locator(tid('library-open')).first().click();
      await waitViewer(t, 'state', 'ready');
      t.assert((await viewerAttr(t, 'parts')) === '9', 'It opens in full');
      await t.screenshot('1-imported');
      t.assert(t.mock.requests.length === before, 'Opening the imported hologram sends nothing');
      await (await t.visible('hologram-close')).click();
      // Delete asks first (a second tap), then the library is empty.
      const del = t.page.locator(tid('library-delete')).first();
      await del.click();
      t.assert(/Delete/.test(await t.text(del)) && (await t.count('library-item')) === 1, 'The first tap only asks to confirm');
      await del.click();
      await t.visible('library-empty', { message: 'Deleting the only item empties the library' });
    },
  },
  {
    name: 'voice-holograms',
    title: 'Voice Mode × holograms: "show me an AA battery" opens the viewer over Voice Mode with the live build while Jarvis speaks; "expand it" and "show the separator" act at once with a spoken acknowledgement; a question is a spoken-channel turn, spoken and captioned in the viewer; "blueprint the separator" builds the part blueprint, which opens when ready and is announced; "close the blueprint" closes it free; "anode blueprint" is asked first and "no" drops it; the viewer\'s mic is Voice Mode\'s; closing returns to Voice Mode, where "expand it" opens the hologram again free; outside it the viewer\'s own mic works',
    device: 'iphone13',
    timeout: 300000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      // One phrase per listen, in order (the fake recognizer hears the next one each time).
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[hologram:battery]] Show me an AA battery', 'Expand it.', 'Show the separator.', 'How does the separator work?', 'Blueprint the separator.', 'Close the blueprint.', 'Anode blueprint.', 'No.'];
      });
      await t.page.addInitScript(recordViewers);
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      const vm = await t.visible('voice-mode');
      let leadAfterBlueprint = 0;

      await t.step('"show me an AA battery": the viewer opens over Voice Mode with the live build while Jarvis speaks', async () => {
        await t.visible('hologram-viewer', { timeout: 30000, message: 'The hologram viewer opens over Voice Mode as soon as the hologram starts building' });
        await waitViewer(t, 'state', 'ready', { timeout: 60000 });
        t.assert((await viewerAttr(t, 'parts')) === '9', `The finished AA battery has its 9 parts (got ${await viewerAttr(t, 'parts')})`);
        const v = await t.waitFor(async () => {
          const st = await voiceState(t);
          return /Say "expand it", or tap any part\./.test(norm(st.said.join(' '))) ? st : null;
        }, { timeout: 30000, message: async () => `Jarvis to say the hologram is up (said: ${norm((await voiceState(t)).said.join(' | '))})` });
        const log = await holoLog(t);
        const building = log.filter((e) => e.viewer === 'building');
        t.assert(building.length > 0, 'The viewer was open while the hologram was still building');
        t.assert(building.every((e) => e.vm !== null && e.covered), 'It showed the build over Voice Mode, which stayed open (inert) underneath');
        const counts = [...new Set(building.map((e) => e.parts))];
        t.assert(counts.length >= 2, `The live build grew in the viewer (part counts seen while building: ${counts.join(', ')})`);
        const builtAt = log.find((e, i) => i > log.indexOf(building[0]) && e.viewer !== 'building')?.at ?? Infinity;
        const pulling = v.log.find((e) => /Pulling up the AA alkaline battery now\./.test(e.text));
        t.assert(pulling, `Jarvis said what he was doing (said: ${norm(v.said.join(' | '))})`);
        t.assert(pulling.at < builtAt, 'He said it while the hologram was still building');
        t.assert(norm(v.said.join(' ')).includes('Here\'s the AA alkaline battery. Say "expand it", or tap any part.'), 'Then the spoken reply: "Here\'s the AA alkaline battery. Say "expand it", or tap any part."');
        t.note(`live build in the viewer: ${counts.join('→')} parts`);
        await t.screenshot('1-viewer-over-voice');
      });

      await t.step('"expand it" and "show the separator": local commands act at once, each with a short spoken acknowledgement', async () => {
        await waitViewer(t, 'exploded', '1', { timeout: 30000, message: async () => `"Expand it." to explode the hologram (data-exploded "${await viewerAttr(t, 'exploded')}")` });
        await waitViewer(t, 'selected', 'separator', { timeout: 30000, message: async () => `"Show the separator." to select it (data-selected "${await viewerAttr(t, 'selected')}")` });
        await t.visible('hologram-part-card');
        const v = await t.waitFor(async () => {
          const st = await voiceState(t);
          return st.said.some((x) => norm(x) === "Here's the separator.") ? st : null;
        }, { timeout: 15000, message: async () => `"Here's the separator." to be said (said: ${norm((await voiceState(t)).said.join(' | '))})` });
        const expanding = v.log.findIndex((e) => norm(e.text) === 'Expanding.');
        const separator = v.log.findIndex((e) => norm(e.text) === "Here's the separator.");
        t.assert(expanding >= 0 && separator > expanding, `"Expanding." then "Here's the separator." were said (said: ${norm(v.said.join(' | '))})`);
        const sent = t.requests('lead').map((r) => newestUserText(r.body));
        t.assert(!sent.some((x) => /Expand it|Show the separator/.test(x)), 'Viewer commands never reach the API');
        await t.screenshot('2-commands');
      });

      await t.step('a question is a spoken-channel turn in the same conversation, spoken and captioned in the viewer', async () => {
        const req = await t.waitFor(() => t.requests('lead').find((r) => /How does the separator work\?/.test(newestUserText(r.body))), { timeout: 30000, message: 'the question to be sent to Jarvis' });
        t.assert(turnContextOf(newestUserMessage(req.body)).spoken, 'It is sent on the spoken reply channel');
        t.assert(req.body.messages.some((m) => m.role === 'assistant' && Array.isArray(m.content) && m.content.some((b) => b.type === 'tool_use' && b.name === 'show_hologram')), "It went to the hologram's conversation");
        // The next request (the blueprint) shows the reply was over; read what was said and shown.
        await t.waitFor(() => t.requests('lead').some((r) => /Blueprint request/.test(newestTurnContext(r.body))), { timeout: 45000, message: 'the reply to finish and the next request to go out' });
        const v = await voiceState(t);
        const said = norm(v.said.join(' '));
        t.assert(/Here's the short version on .*separator/i.test(said) && /I've put the details on screen/.test(said), `The reply was spoken (said: ${said})`);
        t.assert(!/What it is|Next step|\*\*/.test(said), 'Nothing below its --- line was spoken');
        const caps = (await holoLog(t)).filter((e) => e.caption && /short version on .*separator/i.test(e.caption));
        t.assert(caps.length > 0, 'The reply was captioned in the viewer');
        t.assert(caps.some((e) => e.captionState === 'done' && /I've put the details on screen/.test(e.caption)), 'The caption ended with the whole spoken part');
        t.assert(!caps.some((e) => /What it is|Next step/.test(e.caption)), 'The caption shows what was said, not the details for the screen');
      });

      await t.step('"blueprint the separator": the part blueprint is a Voice Mode turn; its viewer opens when it is ready, and Jarvis says so', async () => {
        const req = t.requests('lead').find((r) => /Blueprint request/.test(newestTurnContext(r.body)));
        t.assert(turnContextOf(newestUserMessage(req.body)).spoken, 'The blueprint request is on the spoken reply channel');
        t.assert(/^Blueprint: Separator \(AA alkaline battery/.test(newestUserText(req.body)), `The message names the part ("${newestUserText(req.body)}")`);
        const overlay = await t.visible('blueprint-overlay', { timeout: 60000, message: 'The blueprint viewer opens once the sheet is drawn' });
        await t.waitFor(async () => (await overlay.getAttribute('data-state')) === 'done', { timeout: 10000, message: 'the blueprint to be finished' });
        // (Checked while the sheet is up: "Close the blueprint." is heard about a second after the line.)
        t.assert((await t.count('blueprint-part')) >= 5, 'The blueprint lists its parts');
        await t.screenshot('3-blueprint-over-voice');
        const v = await t.waitFor(async () => {
          const st = await voiceState(t);
          return st.log.find((e) => /it's open on your screen/.test(e.text)) ? st : null;
        }, { timeout: 30000, message: async () => `Jarvis to say the blueprint is open (said: ${norm((await voiceState(t)).said.join(' | '))})` });
        const log = await holoLog(t);
        const first = log.find((e) => e.blueprint !== null);
        t.assert(first && first.blueprint === 'done', `The blueprint viewer opened when the sheet was ready, not while it was drawn (first seen "${first && first.blueprint}")`);
        const line = v.log.find((e) => /it's open on your screen/.test(e.text));
        t.assert(/The blueprint of the separator is ready/.test(norm(v.said.join(' '))), 'The spoken line names the part');
        t.assert(line.at > first.at - 100, 'The line was said once the blueprint was open');
        leadAfterBlueprint = t.requests('lead').length;
      });

      await t.step('"close the blueprint" closes the sheet by voice (free; never read as a part); "anode blueprint" is asked first, and "no" drops it', async () => {
        await t.page.locator(tid('blueprint-overlay')).waitFor({ state: 'detached', timeout: 20000 });
        await t.visible('hologram-viewer', { message: 'Closing the blueprint shows the hologram again' });
        const v = await t.waitFor(async () => {
          const st = await voiceState(t);
          return st.said.some((x) => norm(x) === 'Okay, no blueprint.') ? st : null;
        }, { timeout: 30000, message: async () => `"Okay, no blueprint." to be said (said: ${norm((await voiceState(t)).said.join(' | '))})` });
        const said = norm(v.said.join(' | '));
        t.assert(/Shall I draw a blueprint of the zinc anode gel\? It costs about \d+ cents\./.test(said), `Before a paid build from a softer wording, Jarvis asks, with the price (said: ${said})`);
        t.assert(t.requests('lead').length === leadAfterBlueprint, `Closing the sheet, the question and "no" sent nothing to the API (${t.requests('lead').length - leadAfterBlueprint} requests)`);
        t.assert((await t.count('blueprint-overlay')) === 0, 'No blueprint was drawn');
      });

      await t.step("the viewer's mic is Voice Mode's: after a quiet spell, a tap listens and the words act", async () => {
        // Nothing more was said, so Voice Mode stopped listening after its quiet tries and waits.
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'idle', { timeout: 30000, message: async () => `Voice Mode to wait after its quiet tries (data-state "${await vm.getAttribute('data-state')}")` });
        const listening = (await holoLog(t)).filter((e) => e.voice === 'listening' && e.mic === 'true');
        t.assert(listening.length > 0, "While Voice Mode listened, the viewer's mic showed it");
        await t.page.evaluate(() => window.__voice.queue.push('Put it back together.'));
        const before = await voiceState(t);
        await (await t.visible('hologram-mic')).click();
        await waitViewer(t, 'exploded', '0', { timeout: 15000, message: async () => `"Put it back together." to collapse the hologram (data-exploded "${await viewerAttr(t, 'exploded')}")` });
        const v = await t.waitFor(async () => {
          const st = await voiceState(t);
          return st.said.slice(before.said.length).some((x) => norm(x) === 'Putting it back together.') ? st : null;
        }, { timeout: 15000, message: 'the acknowledgement for "Put it back together."' });
        t.assert(v.listens === before.listens + 1, `The tap made Voice Mode listen (${v.listens - before.listens} listens)`);
        // Under the viewer nobody sees the core: its level animation stays off while Voice Mode listens.
        const covered = (await holoLog(t)).filter((e) => e.viewer !== null && e.vm === 'listening');
        t.assert(covered.length > 0 && covered.every((e) => e.level === 'off'), `The core's level animation is off while a viewer covers Voice Mode (${[...new Set(covered.map((e) => e.level))].join(', ')})`);
      });

      await t.step('closing the viewer returns to Voice Mode, where "expand it" opens the hologram again (free); Exit closes it as before', async () => {
        await (await t.visible('hologram-close')).click();
        await t.page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        await vm.waitFor({ state: 'visible', timeout: 5000 });
        t.assert(!(await vm.evaluate((el) => el.inert)), 'Voice Mode is usable again');
        await t.screenshot('4-back-to-voice');
        // Voice Mode finishes its quiet tries and waits; then a tap listens.
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'idle', { timeout: 30000, message: async () => `Voice Mode to wait (data-state "${await vm.getAttribute('data-state')}")` });
        const lead = t.requests('lead').length;
        await t.page.evaluate(() => window.__voice.queue.push('Expand it.'));
        await (await t.visible('voice-core')).click();
        await t.visible('hologram-viewer', { timeout: 15000, message: '"Expand it." to open the last hologram again' });
        await waitViewer(t, 'exploded', '1', { timeout: 30000 });
        t.assert(t.requests('lead').length === lead, '"Expand it." with the viewer closed sent nothing to the API');
        const shown = (await holoLog(t)).filter((e) => e.viewer === null && e.vm === 'listening');
        t.assert(shown.length > 0 && shown.some((e) => e.level === 'on'), "Voice Mode's level animation runs again while it shows and listens");
        await (await t.visible('hologram-close')).click();
        await t.page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
      });

      await t.step("outside Voice Mode the viewer's own mic and commands work as before (nothing is spoken)", async () => {
        const turns = t.page.locator(tid('turn-jarvis'));
        t.assert((await turns.count()) === 3, `Three replies in the chat: the hologram, the answer and the blueprint (got ${await turns.count()})`);
        await turns.first().locator(tid('hologram-open')).click();
        await waitViewer(t, 'state', 'ready', { timeout: 30000 });
        t.assert(!(await viewerAttr(t, 'voice')), 'No Voice Mode behind this viewer');
        await t.page.evaluate(() => window.__voice.queue.push('Expand it.'));
        const before = await voiceState(t);
        await (await t.visible('hologram-mic')).click();
        await waitViewer(t, 'exploded', '1', { timeout: 15000 });
        t.assert((await viewerAttr(t, 'last-source')) === 'voice', "The words came through the viewer's own mic");
        await t.page.waitForTimeout(800);
        t.assert((await voiceState(t)).said.length === before.said.length, 'Outside Voice Mode, commands are not spoken');
        await (await t.visible('hologram-close')).click();
        t.assertAppendOnly();
      });
    },
  },
  {
    name: 'voice-holograms-stop',
    title: 'Voice Mode × holograms while it builds: the viewer\'s mic listens ("expand it" acts on the live build, a question waits for the reply) and Stop is its own button; Stop during "Getting the blueprint…" starts nothing; a stopped build stays, incomplete, and says why it has no blueprint',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[hologram:camry]] [[slowbuild]] Show me a 2024 Toyota Camry Hybrid'];
      });
      await t.page.addInitScript(recordViewers);
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      const vm = await t.visible('voice-mode');
      const mic = t.page.locator(tid('hologram-mic'));

      await t.step('while the Camry builds, the viewer\'s mic listens: "expand it" acts on the live build; a question waits for the reply', async () => {
        await t.visible('hologram-viewer', { timeout: 30000, message: 'The hologram viewer opens over Voice Mode while it builds' });
        await t.waitFor(async () => (await viewerAttr(t, 'state')) === 'building' && Number(await viewerAttr(t, 'parts')) >= 2, { timeout: 20000, interval: 50, message: 'the live build to be under way' });
        await t.waitFor(async () => (await mic.getAttribute('aria-label')) === 'Speak a command', { timeout: 5000, message: async () => `the viewer's mic to listen while it builds (aria-label "${await mic.getAttribute('aria-label')}")` });
        t.assert(await t.page.locator(tid('hologram-stop')).isVisible(), 'Stop is its own labelled button while it builds');
        const lead = t.requests('lead').length;
        const before = await voiceState(t);
        await t.page.evaluate(() => window.__voice.queue.push('Expand it.'));
        await mic.click();
        await waitViewer(t, 'exploded', '1', { timeout: 10000, message: async () => `"Expand it." to explode the live build (data-exploded "${await viewerAttr(t, 'exploded')}")` });
        t.assert((await viewerAttr(t, 'state')) === 'building', 'It exploded while still building');
        t.assert((await voiceState(t)).listens === before.listens + 1, 'The tap made Voice Mode listen');
        t.assert((await holoLog(t)).some((e) => e.viewer === 'building' && e.vm === 'listening'), 'Voice Mode listened during the build');
        // A question while it builds waits for the reply (nothing is cut, nothing is lost).
        await t.waitFor(async () => (await mic.getAttribute('aria-label')) === 'Speak a command', { timeout: 5000, message: 'the mic to listen again' });
        await t.page.evaluate(() => window.__voice.queue.push('What is the hybrid battery made of?'));
        await mic.click();
        await t.waitFor(async () => (await holoLog(t)).some((e) => /once the hologram is built/.test(e.caption)), { timeout: 10000, message: async () => `the viewer to say the question waits (captions: ${JSON.stringify([...new Set((await holoLog(t)).map((e) => `${e.viewer}/${e.vm}/${e.captionState}:${e.caption.slice(0, 40)}`))])})` });
        t.assert(t.requests('lead').length === lead, 'Nothing was sent during the build');
        await waitViewer(t, 'state', 'ready', { timeout: 60000 });
        t.assert(/^lib_/.test((await viewerAttr(t, 'model')) || ''), 'The whole Camry was built and saved');
        const asked = await t.waitFor(() => t.requests('lead').find((r) => /What is the hybrid battery made of\?/.test(newestUserText(r.body))), { timeout: 45000, message: 'the held question to be sent after the reply' });
        t.assert(turnContextOf(newestUserMessage(asked.body)).spoken, 'It went on the spoken channel');
        const said = norm((await voiceState(t)).said.join(' | '));
        t.assert(/Here's the 2024 Toyota Camry Hybrid/.test(said), `The hologram's reply was said first (said: ${said})`);
        await t.screenshot('1-built-while-listening');
      });

      await t.step('Stop during "Getting the blueprint…" starts nothing (the library is slow)', async () => {
        // Back to waiting: the question's reply is said, then the quiet tries.
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'idle', { timeout: 45000, message: async () => `Voice Mode to wait (data-state "${await vm.getAttribute('data-state')}")` });
        const lead = t.requests('lead').length;
        const turns = await t.count('turn-user');
        // Hold the library store (a big save on a slow phone) until the owner has said Stop: the
        // lookup waits. The hold is in place before he speaks.
        await t.page.evaluate(
          () =>
            new Promise((resolve, reject) => {
              window.__holdLibrary = true;
              const req = indexedDB.open('jarvis');
              req.onerror = () => reject(new Error('The test could not open the database'));
              req.onsuccess = () => {
                const db = req.result;
                const store = db.transaction('library', 'readwrite').objectStore('library');
                const until = performance.now() + 20000;
                const spin = () => {
                  if (window.__holdLibrary && performance.now() < until) store.get('lib_hold000000').onsuccess = spin;
                  else db.close();
                };
                store.get('lib_hold000000').onsuccess = () => {
                  resolve();
                  spin();
                };
              };
            }),
        );
        await t.page.evaluate(() => window.__voice.queue.push('Blueprint the hood.'));
        await mic.click();
        await t.waitFor(async () => /Getting the blueprint/.test(await t.text(t.page.locator(tid('voice-status')))), { timeout: 10000, interval: 20, message: 'Voice Mode to look for the blueprint' });
        await mic.click(); // Stop
        await t.waitFor(async () => (await vm.getAttribute('data-state')) === 'idle' && /Stopped/.test(await t.text(t.page.locator(tid('voice-status')))), { timeout: 5000, message: 'Voice Mode to stop' });
        await t.page.evaluate(() => {
          window.__holdLibrary = false; // the library answers now: nothing is there, a build would start
        });
        await t.page.waitForTimeout(3000);
        t.assert(t.requests('lead').length === lead, `Nothing was sent after Stop (${t.requests('lead').length - lead} requests)`);
        t.assert((await t.count('turn-user')) === turns, `No turn started (${(await t.count('turn-user')) - turns} new)`);
        t.assert((await t.count('blueprint-overlay')) === 0, 'No blueprint opened');
        t.assert(/Stopped/.test(await t.text(t.page.locator(tid('voice-status')))), 'Voice Mode still says Stopped');
      });

      await t.step('"Stop building" stops a build: the hologram stays, incomplete and unsaved, and its part card says why there is no blueprint', async () => {
        await t.page.evaluate(() => window.__voice.queue.push('[[hologram:alternator]] [[slowbuild]] Show me a car alternator'));
        await mic.click();
        await t.waitFor(async () => (await viewerAttr(t, 'state')) === 'building' && Number(await viewerAttr(t, 'parts')) >= 3, { timeout: 30000, interval: 50, message: 'the alternator to build' });
        await (await t.visible('hologram-stop')).click();
        await waitViewer(t, 'state', 'incomplete', { timeout: 15000 });
        const parts = Number(await viewerAttr(t, 'parts'));
        t.assert(parts >= 3 && parts < 19, `The viewer keeps what was built (${parts} of 19 parts)`);
        t.assert(!(await viewerAttr(t, 'model')), 'Nothing was saved');
        t.assert(await t.page.locator(tid('hologram-stop')).isHidden(), 'No Stop once it stopped');
        await t.waitFor(async () => /idle|listening/.test((await vm.getAttribute('data-state')) || ''), { timeout: 10000, message: 'Voice Mode to stop the turn' });
        await t.page.locator(tid('hologram-command')).fill('show the front housing');
        await t.page.locator(tid('hologram-command')).press('Enter');
        await waitViewer(t, 'selected', 'front-housing', { timeout: 10000 });
        const hint = await t.text(t.page.locator('.hv__card-hint'));
        t.assert(/stopped before it finished, so it wasn’t saved/.test(hint) && !/storage may be full/.test(hint), `The part card says why there is no blueprint ("${hint}")`);
        await t.screenshot('2-stopped-in-viewer');
      });

      await t.step('closing the viewer shows Voice Mode; Exit leaves the stopped turn and its card in the chat', async () => {
        await (await t.visible('hologram-close')).click();
        await t.page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        t.assert(!(await vm.evaluate((el) => el.inert)), 'Voice Mode is usable again');
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        const turn = t.page.locator(tid('turn-jarvis')).last();
        await t.waitForTurn(turn, ['stopped'], { timeout: 15000 });
        const card = turn.locator(tid('hologram-card'));
        await card.waitFor({ state: 'visible', timeout: 5000 });
        t.assert((await card.getAttribute('data-status')) === 'error', 'The card stays, marked incomplete');
        t.assert((await t.count('turn-user')) === 3, `The spoken requests stay in the conversation (keepOnStop): ${await t.count('turn-user')}`);
        t.assertAppendOnly();
      });
    },
  },
  {
    name: 'voice-holograms-small',
    title: 'Voice Mode × holograms on a Safari tab of a small phone (375×553): with the part card open the model keeps a third of the screen and no label is under the chrome, a reply caption is a one-line pill; "switch it to 2D" builds the whole-object sheet, then reopens it free; "Open in chat" leaves Voice Mode for the reply',
    device: 'safaritab',
    timeout: 240000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[hologram:battery]] Show me an AA battery', 'Expand it.', 'Show the separator.', 'How does the separator work?', 'Switch it to 2D.', 'Close the blueprint.', 'Switch it to 2D.', 'Never mind.', 'What does the zinc do?'];
      });
      await t.page.addInitScript(recordViewers);
      await t.goto('/');
      await (await t.visible('voice-open')).click();
      await t.visible('voice-mode');

      await t.step('"show the separator" with the card open: the model keeps a third of the screen; no label is under the chrome', async () => {
        await t.visible('hologram-viewer', { timeout: 30000 });
        await waitViewer(t, 'selected', 'separator', { timeout: 60000 });
        await t.visible('hologram-part-card');
        await t.page.waitForTimeout(1200); // the camera refits to the room left; the labels settle
        await checkRoom(t, 'Separator selected');
        await t.screenshot('1-separator');
      });

      await t.step('a question answered with the card open: the reply is a one-line pill under the top bar, never stacked on the card', async () => {
        await t.waitFor(async () => /short version on .*separator/i.test(await t.text(t.page.locator(tid('hologram-caption')))), { timeout: 30000, message: 'the reply to be captioned' });
        await t.page.waitForTimeout(800);
        const cap = t.page.locator(tid('hologram-caption'));
        if (await cap.isVisible()) {
          t.assert((await cap.getAttribute('data-compact')) === 'true', 'The caption is a one-line pill while the card is open');
          await checkRoom(t, 'Reply captioned');
          await t.screenshot('2-reply-pill');
        }
        const log = await holoLog(t);
        t.assert(log.some((e) => /short version on .*separator/i.test(e.caption)), 'The reply was captioned');
      });

      await t.step('"switch it to 2D" draws the whole-object sheet; "close the blueprint" closes it; "switch it to 2D" again reopens it free', async () => {
        const req = await t.waitFor(() => t.requests('lead').find((r) => /Blueprint request/.test(newestTurnContext(r.body))), { timeout: 45000, message: 'the 2D request' });
        t.assert(/^Blueprint: AA alkaline battery/.test(newestUserText(req.body)), `The whole object ("${newestUserText(req.body)}")`);
        t.assert(/- Target: the whole object/.test(newestTurnContext(req.body)), 'The Blueprint request is for the whole object');
        await t.visible('blueprint-overlay', { timeout: 60000 });
        // The 2D turn is over once Jarvis has said the sheet is open (its last request is out).
        await t.waitFor(async () => (await voiceState(t)).said.some((x) => /it's open on your screen/.test(x)), { timeout: 30000, message: 'Jarvis to say the sheet is open' });
        const lead = t.requests('lead').length;
        const v = await t.waitFor(async () => {
          const st = await voiceState(t);
          return st.said.some((x) => norm(x) === "Here's your saved blueprint.") ? st : null;
        }, { timeout: 60000, message: async () => `"Here's your saved blueprint." (said: ${norm((await voiceState(t)).said.join(' | '))})` });
        t.assert(t.requests('lead').length === lead, `"Close the blueprint" and the second "switch it to 2D" sent nothing (${t.requests('lead').length - lead} requests)`);
        const log = await holoLog(t);
        const shown = log.map((e) => e.blueprint);
        const closedAt = shown.findIndex((b, i) => i > 0 && shown[i - 1] !== null && b === null);
        t.assert(closedAt > 0 && shown.slice(closedAt).some((b) => b !== null), 'The sheet closed by voice, then opened again');
        t.note(`said: ${norm(v.said.slice(-3).join(' | '))}`);
      });

      await t.step('"Open in chat" leaves Voice Mode and shows the reply, details included', async () => {
        await t.waitFor(async () => (await t.count('blueprint-overlay')) === 0, { timeout: 30000, message: '"Never mind." to close the sheet' });
        const open = t.page.locator(tid('hologram-caption-open'));
        const cap = t.page.locator(tid('hologram-caption'));
        // Once the reply is written: on this small screen a long caption is a one-line pill whose
        // "Open in chat" shows after a tap on it (it may turn into one while it streams).
        await t.waitFor(async () => /short version on .*zinc/i.test(await t.text(cap)) && (await cap.getAttribute('data-state')) === 'done', { timeout: 30000, interval: 50, message: 'the reply about the zinc to be captioned' });
        if ((await cap.getAttribute('data-compact')) === 'true' && !(await open.isVisible())) await cap.locator('.hv__caption-text').click();
        await t.waitFor(() => open.isVisible(), { timeout: 5000, message: '"Open in chat" on the reply' });
        await open.click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        await t.page.locator(tid('hologram-viewer')).waitFor({ state: 'detached', timeout: 5000 });
        const last = t.page.locator(tid('turn-jarvis')).last();
        await t.waitForTurn(last, ['done'], { timeout: 30000 });
        t.assert(/What it is/.test(await t.text(last)), 'The chat shows the reply with its details');
        t.assertAppendOnly();
      });
    },
  },
  {
    name: 'holograms-old-chat',
    title: 'After the update, a chat from before holograms: not reopened at launch; in it, "show me…" gets a "new chat" hint; Voice Mode asks in a new chat, which shows the hologram',
    device: 'iphone13',
    timeout: 150000,
    async run(t) {
      await t.newPage();
      await t.page.addInitScript(installFakeSpeech);
      await t.page.addInitScript(() => {
        window.__voice.queue = ['[[hologram:battery]] Show me an AA battery'];
      });
      await t.goto('/');
      const first = await t.send('What is the capital of France?');
      await t.waitForTurn(first, ['done'], { timeout: 30000 });
      await t.page.waitForTimeout(1200); // the throttled save lands
      const oldId = await refreezeAsV5(t);

      await t.step('the first launch after the update starts on the home screen; the old chat waits in History', async () => {
        await t.reload();
        await t.page.waitForTimeout(1500);
        t.assert((await t.count('turn-jarvis')) === 0, 'The chat from before holograms is not reopened');
        if (!(await t.page.locator(tid('history-item')).first().isVisible())) await (await t.visible('history-button')).click();
        const item = t.page.locator(`${tid('history-item')}[data-id="${oldId}"]`);
        await item.waitFor({ state: 'visible', timeout: 10000 });
        await item.locator('.history-open').click();
        await t.page.locator(tid('turn-jarvis')).first().waitFor({ state: 'visible', timeout: 10000 });
      });

      await t.step('in the old chat, "show me…" is answered in words, and a hint offers a new chat', async () => {
        const turn = await t.send('[[hologram:alternator]] Show me a car alternator');
        await t.waitForTurn(turn, ['done'], { timeout: 30000 });
        const req = t.requests('lead').at(-1);
        t.assert(!(req.body.tools || []).some((x) => x.name === 'show_hologram'), 'Its frozen tools have no show_hologram');
        t.assert((await turn.locator(tid('hologram-card')).count()) === 0, 'No hologram in it');
        const hint = await t.visible('banner-new-chat', { message: 'The chat says holograms need a new chat' });
        t.assert(/need a new chat/.test(await t.text(hint)), 'It says why');
        await t.screenshot('1-new-chat-hint');
      });

      await t.step('Voice Mode from the old chat asks in a new chat, which shows the hologram', async () => {
        await (await t.visible('voice-open')).click();
        await t.visible('voice-mode');
        await t.visible('hologram-viewer', { timeout: 30000, message: 'The hologram opens over Voice Mode' });
        const req = t.requests('lead').find((r) => /Show me an AA battery/.test(newestUserText(r.body)));
        t.assert(req && (req.body.tools || []).some((x) => x.name === 'show_hologram'), 'The request has show_hologram (a new chat)');
        t.assert(req.body.messages.filter((m) => m.role === 'user').length === 1, 'It is the first message of a new chat');
        await waitViewer(t, 'state', 'ready', { timeout: 60000 });
        await (await t.visible('hologram-close')).click();
        await (await t.visible('voice-close')).click();
        await t.page.locator(tid('voice-mode')).waitFor({ state: 'detached', timeout: 5000 });
        if (!(await t.page.locator(tid('history-item')).first().isVisible())) await (await t.visible('history-button')).click();
        await t.waitFor(async () => (await t.count('history-item')) === 2, { timeout: 10000, message: 'both chats in History' });
        t.assert(await t.page.locator(`${tid('history-item')}[data-id="${oldId}"]`).isVisible(), 'The old chat stays in History');
      });
    },
  },
];
