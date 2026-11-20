// Presence in real headless Chromium (the repo's unit harness: esbuild bundle + the app's CSP):
// the Living Core v2 API and its performance rules, and the Presence controller and views.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHarness, ROOT } from './platform.harness.test.mjs';

const CSS = ['src/styles/tokens.css', 'src/styles/themes.css', 'src/styles/hud.css', 'src/styles/presence.css'].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');

let h;
before(async () => {
  h = await createHarness({
    core: 'src/ui/hud/core.js',
    views: 'src/ui/presence/views.js',
    presence: 'src/ui/presence/presence.js',
    hud: 'src/ui/presence/hud-prefs.js',
  });
});
after(async () => {
  if (h) await h.close();
});

async function page(opts = {}) {
  const p = await h.newPage(opts);
  await p.addStyleTag({ content: CSS });
  await p.evaluate(() => {
    window.mkCanvas = (size = 184) => {
      const c = document.createElement('canvas');
      c.style.width = `${size}px`;
      c.style.height = `${size}px`;
      document.body.append(c);
      return c;
    };
    window.sleep = (ms) => new Promise((res) => setTimeout(res, ms));
  });
  return p;
}

// ---- Living Core v2 --------------------------------------------------------------------------------

test('core v2: every state, the real-data setters and alpha events; unknown states fall back to idle', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createCore } = window.__mods.core;
    const core = createCore(mkCanvas(), { mode: 'hero' });
    const seen = [];
    for (const s of ['idle', 'listening', 'thinking', 'working', 'speaking', 'optics', 'error', 'offline', 'call', 'nonsense']) {
      core.setState(s);
      seen.push(core.debugStats().state);
    }
    core.setBands(new Float32Array([0.9, 0.7, 0.5, 0.3, 0.2, 0.3, 0.5, 0.8]));
    core.setBands(null);
    core.setBands([1, 2]); // too short: synthetic bands
    core.setTelemetry({ spend: 1.4, agents: [3, 8], mission: [2, 6] });
    core.setTelemetry({ spend: null, mission: null });
    core.setSensors({ mic: 'live', optics: 'ready' });
    core.setSensors({ mic: 'bogus' });
    core.setAlert(2);
    core.setAlert(-4);
    core.cue('answer');
    core.cue('capture');
    core.cue('nope');
    core.setLevel(0.6);
    await sleep(300);
    const stats = core.debugStats();
    core.destroy();
    return { seen, frames: stats.frames, awake: stats.awake };
  });
  assert.deepEqual(r.seen, ['idle', 'listening', 'thinking', 'working', 'speaking', 'optics', 'error', 'offline', 'idle', 'idle']);
  assert.ok(r.frames > 5, `the hero animates (${r.frames} frames)`);
  assert.deepEqual(p.problems, []);
});

test('core v2: the 1.6 s boot resolves true when it plays, false when skipped; a no-canvas core has the whole API', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createCore } = window.__mods.core;
    const a = createCore(mkCanvas(), { mode: 'hero' });
    const t0 = performance.now();
    const played = await a.boot();
    const took = performance.now() - t0;
    const b = createCore(mkCanvas(), { mode: 'hero' });
    const pending = b.boot();
    const second = await b.boot(); // already booting: the second caller is told no
    await sleep(200);
    b.skipBoot();
    const skipped = await pending;
    const mini = createCore(mkCanvas(32), { mode: 'mini' });
    const miniBoot = await mini.boot(); // only the hero boots
    const fake = { getContext: () => null, classList: { add() {} }, style: { setProperty() {} }, hasAttribute: () => false, getAttribute: () => null, setAttribute() {} };
    const noop = createCore(fake, { mode: 'hero' });
    const api = ['setState', 'setAgents', 'setLevel', 'setBands', 'setTelemetry', 'setSensors', 'setAlert', 'cue', 'boot', 'skipBoot', 'celebrate', 'destroy', 'debugStats'];
    return { played, took, second, skipped, miniBoot, noopApi: api.filter((k) => typeof noop[k] !== 'function'), noopBoot: await noop.boot() };
  });
  assert.equal(r.played, true);
  assert.ok(r.took >= 1500 && r.took < 2600, `boot took ${Math.round(r.took)} ms`);
  assert.equal(r.second, false);
  assert.equal(r.skipped, false);
  assert.equal(r.miniBoot, false);
  assert.deepEqual(r.noopApi, []);
  assert.equal(r.noopBoot, false);
});

test('reduced motion: no frames while idle, one static frame per real change, no boot, bands never redraw', async () => {
  const p = await page({ contextOptions: { reducedMotion: 'reduce' } });
  const r = await p.evaluate(async () => {
    const { createCore } = window.__mods.core;
    const core = createCore(mkCanvas(), { mode: 'hero' });
    await sleep(150);
    const s0 = core.debugStats();
    await sleep(800);
    const s1 = core.debugStats();
    core.setState('thinking');
    const s2 = core.debugStats();
    for (let i = 0; i < 30; i++) core.setBands(new Float32Array(8).fill(i / 30));
    core.setLevel(0.8);
    const s3 = core.debugStats();
    core.setTelemetry({ spend: 0.5, agents: [1, 8], mission: null });
    core.setTelemetry({ spend: 0.5, agents: [1, 8], mission: null }); // unchanged: no frame
    const s4 = core.debugStats();
    const booted = await core.boot();
    return { frames: s1.frames, awake: s1.awake, idleDraws: s1.staticDraws - s0.staticDraws, change: s2.staticDraws - s1.staticDraws, bands: s3.staticDraws - s2.staticDraws, tele: s4.staticDraws - s3.staticDraws, booted };
  });
  assert.equal(r.frames, 0, 'no animated frames at all');
  assert.equal(r.awake, false);
  assert.equal(r.idleDraws, 0, 'nothing is drawn while idle');
  assert.equal(r.change, 1, 'one static frame for a state change');
  assert.equal(r.bands, 0, 'voice bands (30/s) never redraw a static core');
  assert.equal(r.tele, 1, 'one frame per real telemetry change');
  assert.equal(r.booted, false, 'the boot is skipped entirely');
});

test('HUD motion: "Still" stops every core at once, "Full" wakes them, "Reduced" lets the hero rest at idle', async () => {
  const p = await page();
  const r = await p.evaluate(async () => {
    const { createCore, setCoreMotion } = window.__mods.core;
    const a = createCore(mkCanvas(), { mode: 'hero' });
    const b = createCore(mkCanvas(220), { mode: 'orbit' });
    await sleep(120);
    const before = [a.debugStats().awake, b.debugStats().awake];
    setCoreMotion('still');
    const still = [a.debugStats().awake, b.debugStats().awake];
    setCoreMotion('full');
    await sleep(60);
    const full = [a.debugStats().awake, b.debugStats().awake];
    setCoreMotion('reduced');
    a.setState('thinking'); // working: never rests
    await sleep(4300);
    const working = a.debugStats().awake;
    a.setState('idle');
    await sleep(4300);
    const rested = a.debugStats();
    setCoreMotion('full');
    return { before, still, full, working, rested: [rested.awake, rested.dozing] };
  });
  assert.deepEqual(r.before, [true, true]);
  assert.deepEqual(r.still, [false, false]);
  assert.deepEqual(r.full, [true, true]);
  assert.equal(r.working, true);
  assert.deepEqual(r.rested, [false, true]);
});

test('frame cost: a 184px hero in its busiest state stays well under 2 ms (p95) here', async () => {
  const p = await page({ contextOptions: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true } });
  const r = await p.evaluate(async () => {
    const { createCore } = window.__mods.core;
    const core = createCore(mkCanvas(184), { mode: 'hero' });
    core.setState('working');
    core.setTelemetry({ spend: 0.4, agents: [12, 12], mission: [3, 12] });
    core.setSensors({ mic: 'live', optics: 'live' });
    core.setAlert(3);
    await sleep(400);
    core.debugStats({ reset: true });
    await sleep(2000);
    const s = core.debugStats();
    core.destroy();
    return s;
  });
  assert.equal(r.fpsCap, 30, 'phones are capped at 30 fps');
  assert.deepEqual(r.backing, [368, 368], 'the backing store is capped at 2× on phones');
  assert.ok(r.frames >= 40, `frames: ${r.frames}`);
  assert.ok(r.p95Ms < 2, `p95 ${r.p95Ms.toFixed(3)} ms`);
});

// ---- views ------------------------------------------------------------------------------------------

test('privacy pills: one per live sensor with a stop label; below 360px they merge into LIVE ×n', async () => {
  const p = await page({ contextOptions: { viewport: { width: 390, height: 844 } } });
  const r = await p.evaluate(() => {
    const stopped = [];
    const pills = window.__mods.views.createLivePills({ onStop: (k) => stopped.push(k) });
    document.body.append(pills.el);
    pills.set({ mic: false });
    const none = pills.el.hidden;
    pills.set({ mic: true, optics: true, watchLeft: '4:12' });
    const list = [...pills.el.querySelectorAll('[data-testid="live-pill"]')].map((b) => [b.dataset.kind, b.textContent, b.getAttribute('aria-label'), Math.round(b.getBoundingClientRect().height)]);
    pills.el.querySelector('[data-kind="optics"]').click();
    return { none, list, stopped };
  });
  assert.equal(r.none, true);
  assert.deepEqual(r.list, [
    ['mic', 'MIC', 'Microphone is on. Turn it off', 28],
    ['optics', 'OPTICS', 'Camera is on. Turn it off', 28],
    ['watch', 'WATCH 4:12', 'Watch is on, 4:12 left. Turn it off', 28],
  ]);
  assert.deepEqual(r.stopped, ['optics']);
  const narrow = await page({ contextOptions: { viewport: { width: 320, height: 568 } } });
  const n = await narrow.evaluate(() => {
    const pills = window.__mods.views.createLivePills({});
    document.body.append(pills.el);
    pills.set({ mic: true, optics: true });
    return [...pills.el.querySelectorAll('[data-testid="live-pill"]')].map((b) => [b.dataset.kind, b.textContent]);
  });
  assert.deepEqual(n, [['all', 'LIVE ×2']]);
});

test('Needs-you list: at most three cards, "+n more", one action each; hidden when empty', async () => {
  const p = await page();
  const r = await p.evaluate(() => {
    const acted = [];
    let more = 0;
    const list = window.__mods.views.createNeedsList({ onAction: (i) => acted.push(i.id), onMore: () => more++ });
    document.body.append(list.el);
    list.set([]);
    const hiddenEmpty = list.el.hidden;
    const items = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id, kind: 'finished', tone: 'ok', icon: 'check', title: `Mission ${id}`, detail: 'DONE', action: 'View' }));
    list.set(items);
    const cards = [...list.el.querySelectorAll('[data-testid="needs-card"]')];
    const action = cards[1].querySelector('[data-testid="needs-action"]');
    const box = action.getBoundingClientRect();
    action.click();
    list.el.querySelector('[data-testid="needs-more"]').click();
    return { hiddenEmpty, cards: cards.length, more: list.el.querySelector('[data-testid="needs-more"]').textContent, acted, moreClicks: more, actionSize: [Math.round(box.width), Math.round(box.height)], minHeight: Math.round(cards[0].getBoundingClientRect().height) };
  });
  assert.equal(r.hiddenEmpty, true);
  assert.equal(r.cards, 3);
  assert.equal(r.more, '+2 more');
  assert.deepEqual(r.acted, ['b']);
  assert.equal(r.moreClicks, 1);
  assert.ok(r.actionSize[0] >= 44 && r.actionSize[1] >= 44, `action ${r.actionSize}`);
  assert.ok(r.minHeight >= 56, `card ${r.minHeight}px`);
});

// ---- the controller ---------------------------------------------------------------------------------

test('presence controller: state word, situation, Needs-you ledger, core feeds and the legend, from real inputs', async () => {
  const p = await page({ contextOptions: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } });
  const r = await p.evaluate(async () => {
    const { createPresence } = window.__mods.presence;
    const root = document.createElement('div');
    document.body.append(root);
    const conv = { id: 'c1', title: 'EV SUVs', turns: [{ id: 'u', role: 'user', text: 'x' }, { id: 'j', role: 'jarvis', status: 'done', endedAt: Date.now(), missions: { m: { title: 'Family EV SUVs', status: 'done', agents: [{ status: 'done' }, { status: 'done' }] } } }] };
    const opened = [];
    const presence = createPresence({
      root,
      demo: false,
      sttOk: true,
      getSettings: () => ({ spendWarnUsd: 20, maxAgents: 8 }),
      getSpend: () => ({ monthUsd: 4 }),
      getTodaySpend: () => 0.42,
      modelLabel: () => 'Opus 5.5 · balanced',
      store: { list: async () => [], get: async () => null },
      canResume: () => false,
      actions: { openConversation: (id) => opened.push(id) },
    });
    root.append(presence.home.stateWordEl, presence.home.situationEl, presence.home.needsEl, presence.home.keysEl, presence.rail.el, presence.tape.el);
    const fed = [];
    const fakeCore = { setTelemetry: (t) => fed.push(['t', JSON.stringify(t)]), setSensors: (s) => fed.push(['s', JSON.stringify(s)]), setAlert: (n) => fed.push(['a', n]) };
    presence.attachCore(fakeCore);
    const running = { missions: { m: { status: 'running', title: 'Family EV SUVs', agents: [{ status: 'searching' }, { status: 'reading' }, { status: 'done' }] } } };
    presence.update({ coreState: 'working', agents: 2, turns: [running], titles: ['EV SUVs'], online: true });
    presence.flush();
    const working = { word: presence.home.stateWordEl.textContent, situation: presence.home.situationEl.textContent, tape: presence.tape.el.textContent };
    presence.update({ coreState: 'idle', agents: 0, turns: [], titles: [] });
    presence.noteRunEnded(conv, conv.turns[1], { away: true });
    presence.flush();
    const card = presence.home.needsEl.querySelector('[data-testid="needs-card"]');
    const away = { word: presence.home.stateWordEl.textContent, situation: presence.home.situationEl.textContent, card: card && card.textContent, lastAlert: fed.filter((f) => f[0] === 'a').pop()[1] };
    card.querySelector('[data-testid="needs-action"]').click();
    presence.noteSeen('c1');
    presence.flush();
    const seen = { cards: presence.home.needsEl.querySelectorAll('[data-testid="needs-card"]').length, hidden: presence.home.needsEl.hidden };
    const tele = JSON.parse(fed.filter((f) => f[0] === 't').pop()[1]);
    const sensors = JSON.parse(fed.filter((f) => f[0] === 's').pop()[1]);
    // The legend: opened from the hero, closed with Escape.
    const hero = document.createElement('button');
    root.append(hero, presence.home.legendEl);
    presence.home.openLegend(hero);
    const legend = { open: !presence.home.legendEl.hidden, text: presence.home.legendEl.textContent };
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    legend.closed = presence.home.legendEl.hidden;
    const stored = JSON.parse(localStorage.getItem('jarvis.needs.v1'));
    presence.destroy();
    return { working, away, opened, seen, tele, sensors, legend, stored: { unread: stored.unread.length, seen: Object.keys(stored.seen) } };
  });
  assert.equal(r.working.word, 'WORKING · 2 AGENTS');
  assert.equal(r.working.situation, '2 agents still working on “Family EV SUVs”.');
  assert.match(r.working.tape, /NET\s*ONLINE/);
  assert.match(r.working.tape, /SPEND\s*\$0\.42 TODAY/);
  assert.equal(r.away.word, 'STANDING BY');
  assert.equal(r.away.situation, 'One thing needs you.');
  assert.match(r.away.card, /Family EV SUVs/);
  assert.match(r.away.card, /DONE · 2 AGENTS/);
  assert.equal(r.away.lastAlert, 1, 'the core gets the Needs-you count');
  assert.deepEqual(r.opened, ['c1'], 'View opens the conversation');
  assert.deepEqual(r.seen, { cards: 0, hidden: true });
  assert.deepEqual(r.tele, { spend: 0.2, agents: [0, 8], mission: null });
  assert.equal(r.sensors.mic, 'ready');
  assert.equal(r.legend.open, true);
  assert.match(r.legend.text, /SPEND: 20% of your \$20 monthly alert/);
  assert.match(r.legend.text, /MISSION: none running/);
  assert.equal(r.legend.closed, true);
  assert.deepEqual(r.stored, { unread: 0, seen: ['c1'] });
  assert.deepEqual(p.problems, []);
});

test('HUD frames: each frame draws its own arm, color and weight; full-screen modes get the screen-window brackets only on wide screens', async () => {
  const measure = () => {
    const first = (el, pseudo) => getComputedStyle(el, pseudo).backgroundSize.split(',')[0].trim();
    // The bracket color as [r, g, b, a] (0–255, alpha to 3 places), from rgba() or color(srgb …).
    const color = (el, pseudo) => {
      const s = getComputedStyle(el, pseudo).backgroundImage;
      const m = s.match(/rgba?\(([^)]*)\)/) || s.match(/color\(srgb ([^)]*)\)/);
      if (!m) return null;
      const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      const k = m[0].startsWith('color(') ? 255 : 1;
      return [Math.round(v[0] * k), Math.round(v[1] * k), Math.round(v[2] * k), Math.round((v[3] ?? 1) * 1000) / 1000];
    };
    const mk = (cls) => {
      const el = document.createElement('div');
      el.className = cls;
      el.style.cssText = 'width:200px;height:80px';
      document.body.append(el);
      return el;
    };
    const plain = mk('hud-frame');
    const needs = mk('needs-card hud-frame');
    const rail = mk('rail-live hud-frame');
    const viewport = mk('hud-viewport');
    const vm = mk('vm');
    const hv = mk('hv');
    return {
      plain: first(plain, '::before'),
      needs: first(needs, '::before'),
      rail: first(rail, '::before'),
      viewport: first(viewport, '::before'),
      viewportColor: color(viewport, '::before'),
      vmColor: color(vm, '::after'),
      vm: { content: getComputedStyle(vm, '::after').content, size: first(vm, '::after'), events: getComputedStyle(vm, '::after').pointerEvents },
      hv: { content: getComputedStyle(hv, '::after').content, size: first(hv, '::after'), z: getComputedStyle(hv, '::after').zIndex },
    };
  };
  const wide = await page({ contextOptions: { viewport: { width: 1440, height: 900 } } });
  const w = await wide.evaluate(measure);
  // Before the fix every frame drew the :root defaults (12px arms in --line-3).
  assert.equal(w.plain, '12px 1px', 'the default bracket');
  assert.equal(w.needs, '9px 1px', 'a Needs-you card draws its own 9px arms');
  assert.equal(w.rail, '14px 1px', 'the rail\'s live slot draws 14px arms');
  assert.equal(w.viewport, '28px 1px', 'the shared viewport draws 28px arms');
  assert.deepEqual(w.viewportColor, [138, 243, 255, 0.7], 'in its own color: the theme\'s --accent-2 at 70% (Arc Cyan #8af3ff)');
  assert.deepEqual(w.vmColor, [138, 243, 255, 0.6], 'the full-screen brackets: --accent-2 at 60%');
  assert.deepEqual(w.vm, { content: '""', size: '34px 2px', events: 'none' }, 'Voice Mode: the screen-window brackets, never in the way of a tap');
  assert.deepEqual(w.hv, { content: '""', size: '34px 2px', z: '4' }, 'the hologram viewer: above its top bar and deck, under its cards');
  // The brackets follow the theme (they were Arc Cyan in every theme): Ember's --accent-2 is #ffcaa6.
  await wide.evaluate(() => {
    document.documentElement.dataset.theme = 'ember';
  });
  const e = await wide.evaluate(measure);
  assert.deepEqual(e.viewportColor, [255, 202, 166, 0.7], 'Ember: the viewport brackets are Ember\'s --accent-2');
  assert.deepEqual(e.vmColor, [255, 202, 166, 0.6], 'Ember: so are the full-screen brackets');
  const phone = await page({ contextOptions: { viewport: { width: 390, height: 844 } } });
  const n = await phone.evaluate(measure);
  assert.equal(n.needs, '9px 1px');
  assert.equal(n.vm.content, 'none', 'phones skip the full-screen brackets (rounded display corners)');
  assert.equal(n.hv.content, 'none');
  assert.deepEqual(wide.problems, []);
  assert.deepEqual(phone.problems, []);
});
