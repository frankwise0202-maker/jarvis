// Holograms, blueprints, reference photos and the saved library (lead tools version 4) against the
// mock: the live build card → the full-screen viewer (WebGL on SwiftShader) → explode by button
// and by typed command → a part's card → "Build 2D blueprint" (a new turn) → the blueprint card and
// viewer; the Blueprints library reopening both without any API request; a part whose blueprint
// is saved; photos from a faked Wikimedia Commons; words for Jarvis captioned in the viewer; the
// Blueprint protocol; the backup round trip; and the phone layout.
//
// State is read from the viewers' data-* test hooks (data-state, data-parts, data-exploded,
// data-labels, data-selected, data-panel), never from raycast pixels.

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { tid } from '../harness.mjs';

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
        t.assert(/Rotor/.test(decodeURIComponent(t.wikimedia.searches.at(-1))), 'The search names the part');
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
];
