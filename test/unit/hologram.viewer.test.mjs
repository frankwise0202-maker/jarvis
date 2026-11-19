// The full-screen hologram viewer (src/ui/hologram/viewer.js) in real headless Chromium with the
// app's CSP (platform harness; WebGL runs on SwiftShader): opening a saved item, explode by button
// and by typed command, labels, the parts list and part card, a saved part blueprint, words for
// Jarvis captioned from a (fake) run, the live build from segment updates, photos through a faked
// Wikimedia Commons, Escape order, and closing. State is read from the viewer's data-* test hooks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHarness, ROOT } from './platform.harness.test.mjs';

const FIXTURE = readFileSync(path.join(ROOT, 'test', 'unit', 'fixtures', 'commons-search.json'), 'utf8');
const BATTERY = JSON.parse(readFileSync(path.join(ROOT, 'test', 'mock', 'fixtures', 'battery.json'), 'utf8'));
const ALTERNATOR = JSON.parse(readFileSync(path.join(ROOT, 'test', 'mock', 'fixtures', 'alternator.json'), 'utf8'));
const CSS = ['tokens.css', 'base.css', 'hologram.css', 'blueprint.css', 'library.css'].map((f) => readFileSync(path.join(ROOT, 'src', 'styles', f), 'utf8')).join('\n');
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

let harness;
before(async () => {
  harness = await createHarness({ viewer: 'src/ui/hologram/viewer.js', spec: 'src/lib/hologram-spec.js' });
});
after(async () => {
  if (harness) await harness.close();
});

/** A page with the viewer open on `sample` (a saved item, or a live segment when `live`). */
async function open({ sample = BATTERY, viewport = { width: 1280, height: 800 }, live = false } = {}) {
  const p = await harness.newPage({ contextOptions: { viewport, hasTouch: viewport.width < 500 } });
  await p.route('https://commons.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: FIXTURE }));
  await p.route('https://upload.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PIXEL }));
  await p.addStyleTag({ content: CSS });
  await p.evaluate(
    ({ raw, live }) => {
      const { openHologramViewer } = window.__mods.viewer;
      const { normalizeHologramSpec } = window.__mods.spec;
      const full = normalizeHologramSpec(raw).spec;
      const log = (window.__log = { sent: [], blueprints: [], thumbs: [], closed: 0 });
      const listeners = {};
      const fakeRun = (turnId) => ({
        turn: { id: turnId, segments: [], status: 'running' },
        conversation: { id: 'conv-1' },
        on(type, fn) {
          (listeners[type] = listeners[type] || []).push(fn);
          return () => {
            listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
          };
        },
      });
      window.__emit = (type, payload) => {
        for (const fn of listeners[type] || []) fn(payload);
      };
      window.__listening = (type) => (listeners[type] || []).length > 0;
      const saved = { id: 'lib_bp00000001', kind: 'blueprint', title: 'Separator' };
      const lib = {
        get: async (id) => (id === 'lib_battery001' ? { id, kind: 'hologram', title: full.title, spec: full, thumbnail: null } : null),
        findPartBlueprint: async (model, part) => (model === 'lib_battery001' && part === 'separator' ? saved : null),
        setThumbnail: async (id, url) => log.thumbs.push({ id, head: url.slice(0, 22), length: url.length }),
      };
      const deps = {
        library: lib,
        blueprintCost: () => '≈ $0.15',
        requestBlueprint: async (req) => {
          log.blueprints.push(req);
          return { run: fakeRun('turn-bp') };
        },
        // Like the app's: resolves once the conversation is shown and the turn has started.
        sendMessage: async (text) => {
          log.sent.push(text);
          await new Promise((r) => setTimeout(r, 30));
          return { run: fakeRun('turn-2') };
        },
        onClose: () => log.closed++,
      };
      window.__full = full;
      window.__partial = (n) => normalizeHologramSpec({ ...raw, parts: raw.parts.slice(0, n) }, { partial: true, stable: false }).spec;
      const source = live
        ? { segment: { id: 'seg-1', kind: 'hologram', status: 'building', title: full.title, spec: window.__partial(2), libraryId: null }, conversationId: 'conv-1', turnId: 'turn-1', run: fakeRun('turn-1') }
        : { item: { id: 'lib_battery001', kind: 'hologram', title: full.title, spec: full, conversationId: 'conv-1' } };
      window.__viewer = openHologramViewer({ source, deps });
    },
    { raw: sample, live },
  );
  await p.waitForSelector('[data-testid="hologram-viewer"]');
  p.state = (name) => p.getAttribute('[data-testid="hologram-viewer"]', `data-${name}`);
  p.waitState = (name, value, timeout = 20000) => p.waitForFunction(([n, v]) => document.querySelector('[data-testid="hologram-viewer"]')?.getAttribute(`data-${n}`) === v, [name, value], { timeout });
  p.done = async () => {
    assert.deepEqual(await p.cspViolations(), [], 'CSP violations');
    assert.deepEqual(p.problems, [], 'console errors');
    await p.context().close();
  };
  return p;
}

test('hologram viewer: a saved item renders, explodes by button and by typed command, labels toggle', async () => {
  const p = await open();
  await p.waitState('state', 'ready');
  assert.equal(await p.state('parts'), '9');
  assert.equal(await p.state('labels'), 'on');
  assert.equal(await p.state('model'), 'lib_battery001');
  assert.match(await p.textContent('.hv__title'), /AA alkaline battery/);
  assert.equal(await p.locator('.holo__canvas').count(), 1, 'one WebGL canvas');
  assert.ok((await p.locator('.holo-label.is-shown').count()) >= 4, 'labels are placed');

  await p.click('[data-testid="hologram-explode"]');
  await p.waitState('exploded', '1');
  assert.equal(await p.getAttribute('[data-testid="hologram-explode"]', 'aria-pressed'), 'true');
  await p.click('[data-testid="hologram-assemble"]');
  await p.waitState('exploded', '0');

  await p.fill('[data-testid="hologram-command"]', 'take it apart');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitState('exploded', '1');
  assert.equal(await p.inputValue('[data-testid="hologram-command"]'), '', 'the field clears');
  await p.fill('[data-testid="hologram-command"]', 'put it back together');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitState('exploded', '0');

  await p.click('[data-testid="hologram-labels"]');
  await p.waitState('labels', 'off');
  await p.waitForFunction(() => document.querySelectorAll('.holo-label.is-shown').length === 0);
  await p.fill('[data-testid="hologram-command"]', 'labels on');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitState('labels', 'on');
  assert.deepEqual(await p.evaluate(() => window.__log.sent), [], 'local commands never reach Jarvis');

  // The first full render of a saved item without a thumbnail stores one (a small JPEG).
  await p.waitForFunction(() => window.__log.thumbs.length === 1, null, { timeout: 15000 });
  const thumb = await p.evaluate(() => window.__log.thumbs[0]);
  assert.equal(thumb.id, 'lib_battery001');
  assert.equal(thumb.head, 'data:image/jpeg;base64');
  assert.ok(thumb.length > 2000 && thumb.length <= 60000, `thumbnail size ${thumb.length}`);
  await p.done();
});

test('hologram viewer: parts list → part card; a saved part blueprint opens, a new one is requested', async () => {
  const p = await open();
  await p.waitState('state', 'ready');
  await p.click('[data-testid="hologram-parts-button"]');
  await p.waitState('panel', 'parts');
  assert.equal(await p.locator('[data-testid="hologram-part"]').count(), 9);
  await p.click('[data-testid="hologram-part"][data-part-id="separator"]');
  await p.waitState('selected', 'separator');
  const card = p.locator('[data-testid="hologram-part-card"]');
  await card.waitFor({ state: 'visible' });
  assert.match(await card.textContent(), /Separator/);
  // A saved blueprint of this part: Open blueprint (free), plus Rebuild.
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-build-blueprint"]').dataset.saved === 'true');
  assert.match(await p.textContent('[data-testid="hologram-build-blueprint"]'), /Open blueprint/);
  assert.equal(await p.isVisible('[data-testid="hologram-rebuild-blueprint"]'), true);
  // Another part: Build 2D blueprint with its cost; tapping it asks the app (which starts the turn).
  await p.fill('[data-testid="hologram-command"]', 'select the zinc anode');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-viewer"]').dataset.selected !== 'separator');
  const selected = await p.state('selected');
  assert.ok(selected && selected !== 'separator', `selected ${selected}`);
  await p.waitForFunction(() => /Build 2D blueprint/.test(document.querySelector('[data-testid="hologram-build-blueprint"]').textContent));
  assert.match(await p.textContent('[data-testid="hologram-build-blueprint"]'), /≈ \$0\.15/);
  await p.click('[data-testid="hologram-build-blueprint"]');
  await p.waitForFunction(() => window.__log.blueprints.length === 1);
  const req = await p.evaluate(() => window.__log.blueprints[0]);
  assert.equal(req.model, 'lib_battery001');
  assert.equal(req.part, selected);
  assert.equal(req.rebuild, false);
  const caption = p.locator('[data-testid="hologram-caption"]');
  await caption.waitFor({ state: 'visible' });
  assert.match(await caption.textContent(), /Drawing a 2D blueprint/);
  // Escape: the open parts panel first, then the selection, then the viewer.
  await p.keyboard.press('Escape');
  await p.waitState('panel', '');
  assert.equal(await p.state('selected'), selected);
  await p.keyboard.press('Escape');
  await p.waitState('selected', '');
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid="hologram-viewer"]', { state: 'detached' });
  assert.equal(await p.evaluate(() => window.__log.closed), 1);
  await p.done();
});

test('hologram viewer: words that are not a command go to Jarvis; the reply is captioned', async () => {
  const p = await open();
  await p.waitState('state', 'ready');
  await p.fill('[data-testid="hologram-command"]', 'Why is the cathode shaped like a ring?');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitForFunction(() => window.__log.sent.length === 1);
  assert.deepEqual(await p.evaluate(() => window.__log.sent), ['Why is the cathode shaped like a ring?']);
  const caption = p.locator('[data-testid="hologram-caption"]');
  await caption.waitFor({ state: 'visible' });
  assert.equal(await caption.getAttribute('data-state'), 'thinking');
  // The turn has started (the app resolved with its run) and the viewer follows it.
  await p.waitForFunction(() => window.__listening('segment') && window.__listening('end'));
  await p.evaluate(() => {
    const turn = { id: 'turn-2', status: 'running', segments: [{ id: 's1', kind: 'text', req: 0, text: 'The ring **surrounds** the anode gel' }] };
    window.__emit('segment', { turn, segment: turn.segments[0] });
  });
  await p.waitForFunction(() => /surrounds the anode gel/.test(document.querySelector('[data-testid="hologram-caption"]').textContent));
  assert.equal(await caption.getAttribute('data-state'), 'streaming');
  assert.doesNotMatch(await caption.textContent(), /\*\*/, 'Markdown is shown as plain text');
  await p.evaluate(() => {
    const turn = { id: 'turn-2', status: 'done', segments: [{ id: 's1', kind: 'text', req: 0, text: 'The ring surrounds the anode gel, so ions travel a short way.' }] };
    window.__emit('end', { turn });
  });
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-caption"]').dataset.state === 'done');
  assert.match(await caption.textContent(), /ions travel a short way/);
  assert.equal(await p.state('state'), 'ready', 'the viewer stays open');
  await p.done();
});

test('hologram viewer: opened while building, it follows the live segment to the finished model', async () => {
  const p = await open({ sample: ALTERNATOR, live: true });
  await p.waitState('state', 'building');
  assert.equal(await p.state('parts'), '2');
  assert.match(await p.textContent('.hv__eyebrow'), /building/i);
  for (const n of [6, 11, 15]) {
    await p.evaluate((k) => window.__emit('segment', { turn: { id: 'turn-1' }, segment: { id: 'seg-1', kind: 'hologram', status: 'building', title: window.__full.title, spec: window.__partial(k), libraryId: null } }), n);
    await p.waitState('parts', String(n));
  }
  // The part card's blueprint button waits for the finished, saved hologram.
  await p.fill('[data-testid="hologram-command"]', 'select the pulley');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitState('selected', 'pulley');
  assert.equal(await p.isDisabled('[data-testid="hologram-build-blueprint"]'), true);
  await p.evaluate(() => window.__emit('segment', { turn: { id: 'turn-1' }, segment: { id: 'seg-1', kind: 'hologram', status: 'done', title: window.__full.title, spec: window.__full, libraryId: 'lib_alt0000001' } }));
  await p.waitState('state', 'ready');
  assert.equal(await p.state('parts'), '19');
  assert.equal(await p.state('model'), 'lib_alt0000001');
  await p.waitForFunction(() => !document.querySelector('[data-testid="hologram-build-blueprint"]').disabled);
  await p.done();
});

test('hologram viewer (phone): photos of a part come from Wikimedia Commons and open in the photo viewer', async () => {
  const p = await open({ viewport: { width: 390, height: 844 } });
  await p.waitState('state', 'ready');
  assert.equal(await p.state('layout'), 'phone');
  await p.fill('[data-testid="hologram-command"]', 'photos of the steel can');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitState('panel', 'photos');
  assert.match(await p.inputValue('[data-testid="hologram-photo-query"]'), /Steel can/i);
  await p.waitForSelector('[data-testid="photo-thumb"]');
  const srcs = await p.evaluate(() => Array.from(document.querySelectorAll('[data-testid="photo-thumb"] img')).map((i) => i.src));
  assert.ok(srcs.length > 0 && srcs.every((s) => s.startsWith('https://upload.wikimedia.org/')));
  await p.click('[data-testid="photo-thumb"] >> nth=0');
  await p.waitForSelector('[data-testid="photo-viewer"]');
  // Escape closes the photo viewer first, then the panel, then the viewer.
  await p.keyboard.press('Escape');
  await p.waitForSelector('[data-testid="photo-viewer"]', { state: 'detached' });
  await p.keyboard.press('Escape');
  await p.waitState('panel', '');
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `no horizontal overflow (${overflow}px)`);
  await p.click('[data-testid="hologram-close"]');
  await p.waitForSelector('[data-testid="hologram-viewer"]', { state: 'detached' });
  await p.done();
});
