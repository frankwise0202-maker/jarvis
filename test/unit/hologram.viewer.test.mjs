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
const CAMRY = JSON.parse(readFileSync(path.join(ROOT, 'test', 'mock', 'fixtures', 'camry.json'), 'utf8'));
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
      // Saved part sheets by part id ('*': the whole object); __libChange(part, item|null) changes
      // the library the way another window or a finished build does (onChange subscribers hear it).
      const savedParts = new Map([['separator', saved]]);
      const libListeners = new Set();
      const lib = {
        get: async (id) => (id === 'lib_battery001' ? { id, kind: 'hologram', title: full.title, spec: full, thumbnail: null } : null),
        findPartBlueprint: async (model, part) => (model === 'lib_battery001' ? savedParts.get(part || '*') || null : null),
        setThumbnail: async (id, url) => log.thumbs.push({ id, head: url.slice(0, 22), length: url.length }),
        onChange: (fn) => {
          libListeners.add(fn);
          return () => libListeners.delete(fn);
        },
      };
      window.__libChange = (part, item) => {
        const before = savedParts.get(part);
        if (item) savedParts.set(part, item);
        else savedParts.delete(part);
        for (const fn of libListeners) fn({ type: item ? 'saved' : 'deleted', id: (item || before || {}).id || null, remote: !item });
      };
      window.__libListeners = () => libListeners.size;
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
        // the app's answer to a 2D request (the separator's blueprint is saved: it just opens; with
        // `ask`, nothing is built and the price comes back; a stopped signal starts nothing).
        Object.assign(log, { listens: 0, taps: 0, opened: [], stops: [] });
        window.__voiceOn = true;
        deps.stt = { sttSupported: () => true, startListening: () => (log.listens++, { stop() {}, abort() {} }) };
        deps.voice = { active: () => window.__voiceOn, tap: () => log.taps++ };
        deps.openBlueprint = (src) => log.opened.push(src && src.segment && src.segment.id);
        deps.stopBuild = (req) => log.stops.push(req);
        deps.openInChat = (target) => (log.inChat = target);
        deps.requestBlueprint = async (req) => {
          await new Promise((r) => setTimeout(r, 0)); // the library lookup (the app checks the signal after it)
          log.blueprints.push({ ...req, signal: req.signal ? (req.signal.aborted ? 'aborted' : 'live') : null });
          if (req.signal && req.signal.aborted) return { error: 'Stopped.', stopped: true };
          if (req.part === 'separator') return { opened: true };
          if (req.ask) return { ask: true, cost: '≈ $0.15' };
          return { run: fakeRun('turn-bp') };
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
  const searched = [];
  p.on('request', (r) => {
    if (r.url().startsWith('https://commons.wikimedia.org/')) searched.push(new URL(r.url()).searchParams.get('gsrsearch'));
  });
  await p.fill('[data-testid="hologram-command"]', 'photos of the steel can');
  await p.press('[data-testid="hologram-command"]', 'Enter');
  await p.waitState('panel', 'photos');
  // The search names the object too ("battery steel can"), then the part alone; the field shows the first.
  assert.equal(await p.inputValue('[data-testid="hologram-photo-query"]'), 'battery steel can');
  await p.waitForSelector('[data-testid="photo-thumb"]');
  assert.deepEqual(searched.slice().sort(), ['battery steel can filetype:bitmap|drawing', 'steel can filetype:bitmap|drawing']);
  const titles = await p.evaluate(() => Array.from(document.querySelectorAll('[data-testid="photo-thumb"]')).map((b) => b.getAttribute('aria-label')));
  assert.equal(new Set(titles).size, titles.length, 'each photo once');
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

test('hologram viewer under Voice Mode: a softer 2D wording is asked first; Stop starts nothing; "close the blueprint" and "isolate it" never reach Jarvis', async () => {
  const p = await open({ voice: true });
  await p.waitState('state', 'ready');
  // "anode blueprint" (not an outright request): nothing is built; the outcome is a question with
  // the price, and proceed() builds it.
  const asked = await p.evaluate(async () => {
    const r = window.__viewer.command('anode blueprint', { source: 'voice', spoken: true, confirmBuild: true });
    const o = await r.done;
    const c = o && o.confirm;
    const before = window.__log.blueprints.slice();
    const built = c ? await c.proceed() : null;
    return { action: r.command.action, part: r.command.partId, confirm: c ? { partName: c.partName, cost: c.cost, title: c.title } : null, before, ran: !!(built && built.run), after: window.__log.blueprints.slice(before.length) };
  });
  assert.equal(asked.action, 'blueprint');
  assert.equal(asked.part, 'anode');
  assert.deepEqual(asked.confirm, { partName: 'Zinc anode gel', cost: '≈ $0.15', title: 'AA alkaline battery (LR6)' });
  assert.equal(asked.before.at(-1).ask, true, 'the app was asked not to build yet');
  assert.equal(asked.ran, true, 'proceed() starts the build');
  assert.equal(asked.after.length, 1);
  assert.equal(asked.after[0].ask, false);
  // An outright request ("blueprint the …") builds at once, even with confirmBuild.
  const outright = await p.evaluate(async () => {
    const r = window.__viewer.command('blueprint the zinc anode gel', { source: 'voice', spoken: true, confirmBuild: true });
    const o = await r.done;
    return { ran: !!(o && o.run), ask: window.__log.blueprints.at(-1).ask };
  });
  assert.deepEqual(outright, { ran: true, ask: false });
  // Stop said while the library was looked up (an aborted signal): nothing starts, nothing is shown.
  const stopped = await p.evaluate(async () => {
    const ctl = new AbortController();
    const r = window.__viewer.command('blueprint the zinc anode gel', { source: 'voice', spoken: true, signal: ctl.signal });
    ctl.abort();
    const o = await r.done;
    const cap = document.querySelector('[data-testid="hologram-caption"]');
    return { out: o, signal: window.__log.blueprints.at(-1).signal, captionError: !!cap && !cap.hidden && cap.dataset.state === 'error' };
  });
  assert.deepEqual(stopped, { out: { error: 'Stopped.', stopped: true }, signal: 'aborted', captionError: false });
  // "close the blueprint" with no sheet over the viewer: handled, nothing happens, nothing is sent.
  const closing = await p.evaluate(() => window.__viewer.command('Close the blueprint.', { source: 'voice', spoken: true }));
  assert.deepEqual(closing, { handled: true, command: { action: 'close-blueprint' } });
  assert.equal(await p.locator('[data-testid="hologram-viewer"]').count(), 1, 'the hologram stays open');
  // "isolate it" with nothing selected asks which part; after a part was shown, it is that part.
  const which = await p.evaluate(() => window.__viewer.command('isolate it', { source: 'voice', spoken: true }));
  assert.deepEqual(which, { handled: true, command: { action: 'which-part', for: 'isolate' } });
  await p.evaluate(() => window.__viewer.command('show the separator', { source: 'voice', spoken: true }));
  await p.waitState('selected', 'separator');
  await p.evaluate(() => window.__viewer.command('never mind', { source: 'voice', spoken: true }));
  await p.waitState('selected', '');
  const iso = await p.evaluate(() => window.__viewer.command('isolate it', { source: 'voice', spoken: true }));
  assert.equal(iso.handled, true);
  assert.deepEqual([iso.command.action, iso.command.partId], ['isolate', 'separator']);
  await p.waitState('isolated', 'separator');
  // Voice Mode says the acknowledgement: no toast over the model; typed commands still get one.
  assert.equal(await p.isHidden('[data-testid="hologram-toast"]'), true, 'no toast for a spoken command');
  await p.evaluate(() => window.__viewer.command('show everything', { source: 'typed' }));
  await p.waitForFunction(() => !document.querySelector('[data-testid="hologram-toast"]').hidden);
  assert.deepEqual(await p.evaluate(() => window.__log.sent), [], 'none of this reached Jarvis');
  await p.done();
});

test('hologram viewer: while it builds, Stop is its own button and Voice Mode\'s mic listens; a stopped build says why it has no blueprint', async () => {
  const p = await open({ sample: ALTERNATOR, live: true, voice: true });
  await p.waitState('state', 'building');
  const stop = '[data-testid="hologram-stop"]';
  const mic = '[data-testid="hologram-mic"]';
  assert.equal(await p.isVisible(stop), true, 'a labelled Stop while it builds');
  assert.equal(await p.getAttribute(stop, 'aria-label'), 'Stop building');
  // Voice Mode works on the reply that builds it: the mic listens for a command (not a stop sign).
  await p.evaluate(() => window.__viewer.setVoice({ state: 'thinking', label: 'Stop Jarvis', listening: false, heard: '', busy: true, canListen: true }));
  assert.equal(await p.getAttribute(mic, 'aria-label'), 'Speak a command');
  assert.notEqual(await p.getAttribute(mic, 'data-icon'), 'stop');
  assert.equal(await p.getAttribute(mic, 'data-voice'), 'idle');
  // Once it is built (Jarvis still writing), the mic stops him again, as the core does.
  await p.evaluate(() => window.__viewer.setVoice({ state: 'thinking', label: 'Stop Jarvis', listening: false, heard: '', busy: true, canListen: false }));
  assert.equal(await p.getAttribute(mic, 'aria-label'), 'Stop Jarvis');
  assert.equal(await p.getAttribute(mic, 'data-icon'), 'stop');
  // A 2D request while the reply that builds it streams waits (Voice Mode takes it afterwards).
  const later = await p.evaluate(() => window.__viewer.command('switch it to 2D', { source: 'voice', later: true }));
  assert.deepEqual(later, { handled: false, later: true });
  assert.deepEqual(await p.evaluate(() => window.__log.blueprints), [], 'nothing was requested');
  // A command acts on the live model meanwhile.
  await p.evaluate(() => window.__viewer.command('expand it', { source: 'voice', later: true }));
  await p.waitState('exploded', '1');
  await p.click(stop);
  assert.deepEqual(await p.evaluate(() => window.__log.stops), [{ conversationId: 'conv-1' }]);
  // The turn stopped: the card is incomplete, unsaved; the part card says why there is no blueprint.
  await p.evaluate(() => window.__emit('end', { turn: { id: 'turn-1', status: 'stopped', segments: [{ id: 'seg-1', kind: 'hologram', status: 'error', title: window.__full.title, spec: window.__partial(6), libraryId: null }] } }));
  await p.waitState('state', 'incomplete');
  assert.equal(await p.isHidden(stop), true, 'no Stop once it is not building');
  await p.evaluate(() => window.__viewer.command('show the rotor', { source: 'typed' }));
  await p.waitState('selected', 'rotor');
  assert.equal(await p.isDisabled('[data-testid="hologram-build-blueprint"]'), true);
  assert.match(await p.textContent('.hv__card-hint'), /stopped before it finished, so it wasn’t saved/);
  assert.doesNotMatch(await p.textContent('.hv__card-hint'), /storage may be full/);
  await p.done();
});

test('hologram viewer (phone): zooming in on the exploded Camry labels what is in view instead of losing labels', async () => {
  const p = await open({ sample: CAMRY, viewport: { width: 390, height: 664 } });
  await p.waitState('state', 'ready');
  await p.evaluate(() => window.__viewer.command('expand it', { source: 'typed' }));
  await p.waitState('exploded', '1');
  const shown = () => p.evaluate(() => Array.from(document.querySelectorAll('.holo-label.is-shown')).map((l) => l.textContent));
  const settle = async () => {
    await p.waitForTimeout(1600); // the camera move and the label layout settle
    return shown();
  };
  const before = await settle();
  assert.ok(before.length >= 4, `labels are shown before zooming (${before.length})`);
  const seen = new Set(before);
  const counts = [before.length];
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => window.__viewer.command('zoom in', { source: 'typed' }));
    const now = await settle();
    counts.push(now.length);
    for (const name of now) seen.add(name);
  }
  assert.ok(counts.every((n) => n >= before.length), `zooming in never loses labels (shown: ${counts.join(' → ')})`);
  assert.ok(seen.size > before.length, `zooming in reveals labels of other parts (${seen.size} distinct, ${before.length} before)`);
  await p.done();
});

test('hologram viewer: idle auto-rotation starts by itself after the opening delay (Rotate shows on and it turns)', async () => {
  const p = await open({ viewport: { width: 390, height: 664 } });
  await p.waitState('state', 'ready');
  assert.equal(await p.state('rotate'), 'on');
  await p.waitForTimeout(7500); // rotateAfterMs is 6 s; no input meanwhile
  const canvas = p.locator('.holo__canvas');
  const a = await canvas.screenshot();
  await p.waitForTimeout(1200);
  const b = await canvas.screenshot();
  assert.ok(!a.equals(b), 'the model turns on its own (the canvas changed with no input)');
  await p.done();
});

test('hologram viewer: "Restart 3D view" brings the model back after a context loss the browser never restores', async () => {
  const p = await open();
  await p.waitState('state', 'ready');
  const lost = await p.evaluate(() => {
    const c = document.querySelector('.holo__canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) return false;
    ext.loseContext(); // and never restoreContext(): iOS memory pressure, a backgrounded app
    return true;
  });
  assert.ok(lost, 'the test can lose the WebGL context');
  const btn = p.locator('.holo__notice-btn');
  await btn.waitFor({ state: 'visible', timeout: 8000 });
  await btn.click();
  await p.waitForFunction(() => document.querySelector('.holo__notice').hidden, null, { timeout: 8000 });
  assert.equal(await p.state('state'), 'ready');
  await p.waitForTimeout(600);
  const shot = await p.locator('.holo__canvas').screenshot();
  const lit = await p.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 2] > 110 && d[i + 1] > 70) n++;
    return n;
  }, shot.toString('base64'));
  assert.ok(lit > 200, `the model is drawn again (${lit} lit pixels)`);
  assert.equal(await p.locator('.holo__canvas').count(), 1, 'one canvas');
  await p.done();
});

test('hologram viewer: the part card follows the library (a sheet saved or deleted meanwhile); Rebuild shows its price; 2D asks for a second tap before a paid build', async () => {
  const p = await open();
  await p.waitState('state', 'ready');
  const build = '[data-testid="hologram-build-blueprint"]';
  await p.evaluate(() => window.__viewer.command('show the zinc anode gel', { source: 'typed' }));
  await p.waitState('selected', 'anode');
  await p.waitForFunction((sel) => document.querySelector(sel).dataset.saved === 'false' && /Build 2D blueprint/.test(document.querySelector(sel).textContent), build);
  // Its sheet is saved meanwhile (a build that just finished, another window): the card says so at once.
  await p.evaluate(() => window.__libChange('anode', { id: 'lib_bpanode001', kind: 'blueprint', title: 'Zinc anode gel' }));
  await p.waitForFunction((sel) => document.querySelector(sel).dataset.saved === 'true' && /Open blueprint/.test(document.querySelector(sel).textContent), build, { timeout: 5000 });
  // Rebuild is a paid build: its price shows on it (not only in a tooltip).
  assert.match(await p.textContent('[data-testid="hologram-rebuild-blueprint"]'), /Rebuild.*≈ \$0\.15/);
  // The sheet is deleted elsewhere: the card no longer promises a free one.
  await p.evaluate(() => window.__libChange('anode', null));
  await p.waitForFunction((sel) => document.querySelector(sel).dataset.saved === 'false' && /Build 2D blueprint/.test(document.querySelector(sel).textContent), build, { timeout: 5000 });
  // The 2D tool: nothing saved for the whole object, so the first tap only asks (with the price).
  const tool = '[data-testid="hologram-2d"]';
  await p.click(tool);
  await p.waitForFunction((sel) => document.querySelector(sel).dataset.armed === 'true', tool);
  assert.match(await p.textContent('[data-testid="hologram-toast"]'), /Tap 2D again.*≈ \$0\.15/);
  assert.deepEqual(await p.evaluate(() => window.__log.blueprints.length), 0, 'nothing requested yet');
  await p.click(tool);
  await p.waitForFunction(() => window.__log.blueprints.length === 1);
  assert.equal(await p.evaluate(() => window.__log.blueprints[0].part), null, 'the whole object');
  // A saved whole-object sheet opens at the first tap (free).
  await p.evaluate(() => window.__libChange('*', { id: 'lib_bpwhole001', kind: 'blueprint', title: 'AA battery' }));
  await p.click(tool);
  await p.waitForFunction(() => window.__log.blueprints.length === 2);
  await p.click('[data-testid="hologram-close"]');
  assert.equal(await p.evaluate(() => window.__libListeners()), 0, 'closing the viewer stops listening to the library');
  await p.done();
});

/** In the page: boxes [top, bottom, left, right] of the viewer's chrome, and how much of each shown label is under it. */
function chromeGeometry() {
  const box = (sel) => {
    const e = document.querySelector(sel);
    if (!e || e.hidden || !e.getClientRects().length) return null;
    const b = e.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom, left: b.left, right: b.right };
  };
  const chrome = ['.hv__caption', '.hv__card', '.hv__toast'].map(box).filter(Boolean);
  const covered = (r) => {
    let worst = 0;
    for (const c of chrome) {
      const w = Math.max(0, Math.min(r.right, c.right) - Math.max(r.left, c.left));
      const h = Math.max(0, Math.min(r.bottom, c.bottom) - Math.max(r.top, c.top));
      worst = Math.max(worst, (w * h) / Math.max(1, (r.right - r.left) * (r.bottom - r.top)));
    }
    return worst;
  };
  const labels = Array.from(document.querySelectorAll('.holo-label.is-shown')).map((l) => ({ name: l.textContent, under: covered(l.getBoundingClientRect()) }));
  return { vh: window.innerHeight, top: box('.hv__top'), caption: box('.hv__caption'), card: box('.hv__card'), compact: document.querySelector('.hv__caption').dataset.compact, labels };
}

test('hologram viewer (small phone, Voice Mode): a reply caption never stacks on the part card; the model keeps a third of the screen; a said caption leaves', async () => {
  const p = await open({ voice: true, viewport: { width: 375, height: 553 } });
  await p.waitState('state', 'ready');
  await p.evaluate(() => window.__viewer.setVoice({ state: 'listening', label: 'Stop listening', listening: true, heard: '', busy: false }));
  await p.evaluate(() => window.__viewer.command('expand it', { source: 'voice', spoken: true }));
  await p.evaluate(() => window.__viewer.command('show the separator', { source: 'voice', spoken: true }));
  await p.waitState('selected', 'separator');
  assert.equal(await p.isHidden('[data-testid="hologram-toast"]'), true, 'Voice Mode says the acknowledgement: no toast on the model');
  // A question answered while the card is open (Voice Mode follows the reply into the caption).
  await p.evaluate(() => {
    window.__vrun = window.__fakeRun('turn-q');
    window.__viewer.follow(window.__vrun);
    const turn = { id: 'turn-q', status: 'running', spoken: true, segments: [{ id: 'q1', kind: 'text', req: 0, text: 'The separator is a thin porous sleeve that keeps the zinc gel and the manganese dioxide cathode apart, while letting the electrolyte ions pass, so the cell can deliver current without shorting out.' }] };
    window.__emit('segment', { turn, segment: turn.segments[0] });
  });
  await p.waitForFunction(() => /porous sleeve/.test(document.querySelector('[data-testid="hologram-caption"]').textContent));
  await p.waitForTimeout(1500); // the camera refits to the new room and the labels settle
  const g = await p.evaluate(chromeGeometry);
  assert.equal(g.compact, 'true', 'with the card open, the caption is a one-line pill');
  assert.ok(g.caption.top >= g.top.bottom - 4 && g.caption.bottom <= g.top.bottom + 44, `the pill sits under the top bar (${JSON.stringify(g.caption)})`);
  const free = g.card.top - Math.max(g.top.bottom, g.caption.bottom);
  assert.ok(free >= g.vh / 3, `the model keeps at least a third of the screen (${Math.round(free)} of ${g.vh} px)`);
  const sep = g.labels.find((l) => l.name === 'Separator');
  assert.ok(sep, `the selected part keeps its label (${g.labels.map((l) => l.name).join(', ')})`);
  for (const l of g.labels) assert.ok(l.under <= 0.3, `"${l.name}" is ${Math.round(l.under * 100)}% under the caption, card or toast`);
  // A tap on the pill shows the whole reply; another folds it again.
  await p.click('.hv__caption-text');
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-caption"]').dataset.expanded === 'true');
  await p.click('.hv__caption-text');
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-caption"]').dataset.expanded === 'false');
  // The reply ends and Voice Mode has said it: the caption leaves within a few seconds (not 20).
  await p.evaluate(() => {
    const turn = { id: 'turn-q', status: 'done', spoken: true, segments: [{ id: 'q1', kind: 'text', req: 0, text: 'The separator keeps the zinc and the cathode apart.' }] };
    window.__emit('end', { turn });
    window.__viewer.captionSpoken();
  });
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-caption"]').hidden, null, { timeout: 6000 });
  // A said reply with details in the chat (below its --- line) stays: "Open in chat" leads to them.
  await p.evaluate(() => {
    window.__zrun = window.__fakeRun('turn-z');
    window.__viewer.follow(window.__zrun);
    const turn = { id: 'turn-z', status: 'done', spoken: true, segments: [{ id: 'z1', kind: 'text', req: 0, text: 'The zinc gives up electrons.\n\n---\n\n## What it is\n\n- **Material:** zinc powder gel' }] };
    window.__emit('end', { turn });
    window.__viewer.captionSpoken();
  });
  await p.waitForFunction(() => /gives up electrons/.test(document.querySelector('[data-testid="hologram-caption"]').textContent));
  await p.waitForTimeout(4500); // longer than a said caption without details stays
  assert.equal(await p.isHidden('[data-testid="hologram-caption"]'), false, 'the reply with details is still captioned');
  assert.doesNotMatch(await p.locator('[data-testid="hologram-caption"]').textContent(), /What it is|zinc powder gel/, 'the details stay in the chat');
  // The folded pill has no room for "Open in chat"; a tap opens the whole reply with it.
  assert.equal(await p.isHidden('[data-testid="hologram-caption-open"]'), true, 'the one-line pill keeps to the reply');
  await p.click('.hv__caption-text');
  await p.waitForFunction(() => document.querySelector('[data-testid="hologram-caption"]').dataset.expanded === 'true');
  assert.equal(await p.isHidden('[data-testid="hologram-caption-open"]'), false, '"Open in chat" is there once the pill is open');
  await p.click('[data-testid="hologram-caption-open"]');
  assert.deepEqual(await p.evaluate(() => window.__log.inChat), { conversationId: 'conv-1', turnId: 'turn-z' }, '"Open in chat" shows that reply');
  await p.done();
});

test('hologram viewer (desktop): the model and its labels keep clear of a reply caption', async () => {
  const p = await open({ viewport: { width: 1280, height: 800 } });
  await p.waitState('state', 'ready');
  await p.evaluate(() => {
    window.__vrun = window.__fakeRun('turn-d');
    window.__viewer.follow(window.__vrun);
    const turn = { id: 'turn-d', status: 'running', spoken: true, segments: [{ id: 'd1', kind: 'text', req: 0, text: 'This is the AA alkaline cell: a steel can holds the manganese dioxide cathode rings, the separator and the zinc anode gel, with a brass nail collecting the current at the negative end.' }] };
    window.__emit('segment', { turn, segment: turn.segments[0] });
  });
  await p.waitForFunction(() => /steel can holds/.test(document.querySelector('[data-testid="hologram-caption"]').textContent));
  await p.waitForTimeout(1500);
  const g = await p.evaluate(chromeGeometry);
  assert.ok(g.caption, 'the caption shows');
  assert.ok(g.labels.length >= 4, `labels are placed (${g.labels.length})`);
  for (const l of g.labels) assert.ok(l.under <= 0.3, `"${l.name}" is ${Math.round(l.under * 100)}% under the caption`);
  await p.done();
});
