// The full-screen hologram viewer (src/ui/hologram/viewer.js) in real headless Chromium with the
// app's CSP (platform harness; WebGL runs on SwiftShader): opening a saved item, explode by button
// and by typed command, labels, the parts list and part card, a saved part blueprint, words for
// Jarvis captioned from a (fake) run, the live build from segment updates, photos through a faked
// Wikimedia Commons, Escape order, and closing; and under Voice Mode (v6): the mic is Voice Mode's,
// follow() captions only what is spoken, a blueprint command reports its outcome. State is read
// from the viewer's data-* test hooks.
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
async function open({ sample = BATTERY, viewport = { width: 1280, height: 800 }, live = false, voice = false } = {}) {
  const p = await harness.newPage({ contextOptions: { viewport, hasTouch: viewport.width < 500 } });
  await p.route('https://commons.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: FIXTURE }));
  await p.route('https://upload.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PIXEL }));
  await p.addStyleTag({ content: CSS });
  await p.evaluate(
    ({ raw, live, voice }) => {
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
      if (voice) {
        // Voice Mode open under the viewer (app.js): a microphone, Voice Mode's talk button, and
        // the app's answer to a 2D request (the separator's blueprint is saved: it just opens).
        Object.assign(log, { listens: 0, taps: 0, opened: [] });
        window.__voiceOn = true;
        deps.stt = { sttSupported: () => true, startListening: () => (log.listens++, { stop() {}, abort() {} }) };
        deps.voice = { active: () => window.__voiceOn, tap: () => log.taps++ };
        deps.openBlueprint = (src) => log.opened.push(src && src.segment && src.segment.id);
        deps.requestBlueprint = async (req) => {
          log.blueprints.push(req);
          return req.part === 'separator' ? { opened: true } : { run: fakeRun('turn-bp') };
        };
      }
      window.__fakeRun = fakeRun;
      window.__full = full;
      window.__partial = (n) => normalizeHologramSpec({ ...raw, parts: raw.parts.slice(0, n) }, { partial: true, stable: false }).spec;
      const source = live
        ? { segment: { id: 'seg-1', kind: 'hologram', status: 'building', title: full.title, spec: window.__partial(2), libraryId: null }, conversationId: 'conv-1', turnId: 'turn-1', run: fakeRun('turn-1') }
        : { item: { id: 'lib_battery001', kind: 'hologram', title: full.title, spec: full, conversationId: 'conv-1' } };
      window.__viewer = openHologramViewer({ source, deps });
    },
    { raw: sample, live, voice },
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

test('hologram viewer under Voice Mode: its mic is Voice Mode\'s and shows its state; follow() captions only what is spoken; a blueprint command reports its outcome', async () => {
  const p = await open({ voice: true });
  await p.waitState('state', 'ready');
  const mic = '[data-testid="hologram-mic"]';
  const field = '[data-testid="hologram-command"]';
  // Voice Mode listens: the button is pressed and the field shows the words as they are heard.
  await p.evaluate(() => window.__viewer.setVoice({ state: 'listening', label: 'Stop listening and send', listening: true, heard: 'show the', busy: false }));
  assert.equal(await p.getAttribute(mic, 'aria-pressed'), 'true');
  assert.equal(await p.getAttribute(mic, 'aria-label'), 'Stop listening and send');
  assert.equal(await p.getAttribute(mic, 'data-voice'), 'listening');
  assert.equal(await p.inputValue(field), 'show the');
  assert.equal(await p.getAttribute(field, 'placeholder'), 'Listening…');
  assert.equal(await p.state('voice'), 'listening');
  // Jarvis works: a stop sign (a tap stops him, as the core does); the heard words are cleared.
  await p.evaluate(() => window.__viewer.setVoice({ state: 'thinking', label: 'Stop Jarvis', listening: false, heard: '', busy: true }));
  assert.equal(await p.getAttribute(mic, 'aria-pressed'), 'false');
  assert.equal(await p.getAttribute(mic, 'data-voice'), 'busy');
  assert.equal(await p.getAttribute(mic, 'data-icon'), 'stop');
  assert.equal(await p.getAttribute(mic, 'aria-label'), 'Stop Jarvis');
  assert.equal(await p.inputValue(field), '');
  assert.equal(await p.getAttribute(field, 'placeholder'), 'Type or say a command…');
  // The button taps Voice Mode; the viewer's own recognizer never starts.
  await p.click(mic);
  assert.deepEqual(await p.evaluate(() => [window.__log.taps, window.__log.listens]), [1, 0]);
  // Words the owner types are theirs: what Voice Mode hears never replaces them.
  await p.fill(field, 'labels o');
  await p.evaluate(() => window.__viewer.setVoice({ state: 'listening', label: 'Stop listening', listening: true, heard: 'expand', busy: false }));
  assert.equal(await p.inputValue(field), 'labels o');
  await p.fill(field, '');

  // follow(): a Voice Mode reply is captioned up to its --- line; a hologram or blueprint in it is
  // Voice Mode's to open (the viewer neither switches nor opens anything).
  await p.evaluate(() => {
    window.__vrun = window.__fakeRun('turn-v');
    window.__viewer.follow(window.__vrun);
    window.__viewer.follow(window.__vrun); // once per run
  });
  const caption = p.locator('[data-testid="hologram-caption"]');
  await caption.waitFor({ state: 'visible' });
  assert.equal(await caption.getAttribute('data-state'), 'thinking');
  await p.evaluate(() => {
    const turn = { id: 'turn-v', status: 'running', spoken: true, segments: [{ id: 't1', kind: 'text', req: 0, text: 'It keeps the zinc and the cathode apart.\n\n---\n\n## Details\n\n- **Material:** cellulose' }] };
    window.__emit('segment', { turn, segment: turn.segments[0] });
    window.__emit('segment', { turn, segment: { id: 'h2', kind: 'hologram', status: 'building', title: 'Another', spec: window.__partial(1), libraryId: null } });
    window.__emit('segment', { turn, segment: { id: 'b2', kind: 'blueprint', status: 'done', title: 'Sheet', spec: null, libraryId: null } });
  });
  await p.waitForFunction(() => /keeps the zinc and the cathode apart/.test(document.querySelector('[data-testid="hologram-caption"]').textContent));
  assert.equal(await caption.getAttribute('data-state'), 'streaming');
  assert.doesNotMatch(await caption.textContent(), /Details|Material|cellulose/, 'the details below --- are for the chat');
  assert.equal(await p.state('parts'), '9', 'still the battery: no switch to the reply\'s hologram');
  assert.equal(await p.state('model'), 'lib_battery001');
  assert.deepEqual(await p.evaluate(() => window.__log.opened), [], 'nothing opened by the viewer');
  await p.evaluate(() => {
    const turn = { id: 'turn-v', status: 'done', spoken: true, segments: [{ id: 't1', kind: 'text', req: 0, text: 'It keeps the zinc and the cathode apart, so the cell cannot short.\n\n---\n\nDetails.' }] };
    window.__emit('end', { turn });
  });
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-caption"]').dataset.state === 'done');
  assert.equal((await caption.textContent()).match(/so the cell cannot short/g)?.length, 1, 'one caption, followed once');

  // "blueprint the separator": the command returns at once; its outcome follows (a saved sheet opened).
  const out = await p.evaluate(async () => {
    const r = window.__viewer.command('blueprint the separator', { source: 'voice' });
    return { handled: r.handled, action: r.command.action, part: r.command.partId, outcome: await r.done };
  });
  assert.deepEqual(out, { handled: true, action: 'blueprint', part: 'separator', outcome: { opened: true } });
  assert.equal(await p.state('last-source'), 'voice');
  const other = await p.evaluate(async () => {
    const r = window.__viewer.command('blueprint the zinc anode gel', { source: 'voice' });
    const o = await r.done;
    return { part: r.command.partId, run: !!(o && o.run) };
  });
  assert.deepEqual(other, { part: 'anode', run: true }, 'a new part blueprint starts a turn');

  // Voice Mode closed: the viewer's own mic again.
  await p.evaluate(() => {
    window.__voiceOn = false;
    window.__viewer.setVoice(null);
  });
  assert.equal(await p.getAttribute(mic, 'aria-label'), 'Speak a command');
  assert.equal(await p.getAttribute(mic, 'data-voice'), null);
  assert.equal(await p.state('voice'), '');
  await p.click(mic);
  assert.deepEqual(await p.evaluate(() => [window.__log.taps, window.__log.listens]), [1, 1]);
  await p.done();
});
