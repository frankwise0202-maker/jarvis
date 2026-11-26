// The walkthrough renderer (SPEC §29.2: src/ui/hologram/hologram.js and shaders.js) on a generic
// laptop hologram, in real headless Chromium with the app's CSP (platform harness; WebGL on
// SwiftShader) and Playwright's fake clock, so every move is timed exactly:
//   - setEmphasis's per-part goals: glow (full, brighter, pulsing), ghost (edges about 0.5, fill
//     about 0.1), others (0.15), hide; several glowing parts; the case by tone or, without tones,
//     by name; unknown ids ignored; a live build's later parts; null is the usual look again;
//   - the pulse keeps frames coming, stops after 2 minutes, and never runs with reduced motion;
//   - labelsFor; flyTo resolving 'arrived' on the fake clock, 'touch' on a pointer press or a
//     wheel, 'replaced' by another move; 'access' from below and in front for the battery; parts a
//     step hides left out of the framing; explode then focus, and explode then flyTo, without the
//     chase; auto-rotation held and given back; reduced motion as cuts;
//   - the target of contract (e) (also without WebGL), and the usual look pixel for pixel after an
//     emphasis comes and goes.
// The pure helpers (shellIdsOf, accessAngles, anglesOfDir) and the shaders' pulse run in Node.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHarness, ROOT } from './platform.harness.test.mjs';
import { LAPTOP, LAPTOP_SHELLS } from './hologram.laptop.mjs';
import { accessAngles, anglesOfDir, shellIdsOf } from '../../src/ui/hologram/hologram.js';
import { FILL_FS, LINE_FS, PULSE_AMPLITUDE, PULSE_RATE } from '../../src/ui/hologram/shaders.js';

const DEG = 180 / Math.PI;
// the hologram's own styles: the renderer's box fills its host, labels are placed boxes (without
// them its height would follow the unstyled labels, and every resize refits the camera)
const CSS = ['tokens.css', 'base.css', 'hologram.css'].map((f) => readFileSync(path.join(ROOT, 'src', 'styles', f), 'utf8')).join('\n');
const SLOW = { timeout: 120000 }; // a browser test that hangs fails instead of holding the browser
const TARGET_KEYS = ['explode', 'flyTo', 'focus', 'getState', 'holdAutoRotate', 'parts', 'select', 'setEmphasis', 'setLabels', 'settled'];
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

let harness;
before(async () => {
  harness = await createHarness({ hologram: 'src/ui/hologram/hologram.js' });
});
after(async () => {
  if (harness) await harness.close();
});

/**
 * A page with the laptop (or `spec`) in a 560×360 box (no MSAA: SwiftShader draws every frame on
 * the CPU): window.__holo is the renderer. The clock is Playwright's, paused: time moves only with
 * page.clock.runFor().
 */
async function open({ spec = LAPTOP, reduced = false, options = {}, init } = {}) {
  const page = await harness.newPage({ init, contextOptions: { reducedMotion: reduced ? 'reduce' : 'no-preference' } });
  await page.addStyleTag({ content: CSS });
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 5000);
  await page.evaluate(
    ({ spec, options }) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:560px;height:360px';
      document.body.append(host);
      const holo = window.__mods.hologram.createHologram(host, { labels: true, autoRotate: false, reveal: false, antialias: false, ...options });
      window.__holo = holo;
      if (spec) holo.setSpec(spec);
    },
    { spec, options },
  );
  await page.clock.runFor(100);
  return page;
}
const debug = (page) => page.evaluate(() => window.__holo.debugState());
const partOf = (st, id) => st.parts.find((p) => p.id === id);
/**
 * Runs `fn` in the page with the renderer and its target: (holo, target, arg) => value (awaited
 * when it is a promise). The source goes in as an expression (the page's CSP has no unsafe-eval).
 */
const run = (page, fn, arg = null) => page.evaluate(`(${fn.toString()})(window.__holo, window.__holo.tourTarget(), ${JSON.stringify(arg)})`);

// ---- pure helpers (Node) ----------------------------------------------------------------------

test('shells: the parts toned secondary; by name only in a hologram that marks none', () => {
  assert.deepEqual([...shellIdsOf(LAPTOP.parts)].sort(), [...LAPTOP_SHELLS].sort());
  // the same laptop without tones: its covers and lid by name, nothing else
  const untoned = LAPTOP.parts.map(({ tone, ...p }) => p);
  assert.deepEqual([...shellIdsOf(untoned)].sort(), [...LAPTOP_SHELLS].sort());
  const byName = (name, aka = []) => shellIdsOf([{ id: 'x', name, aka }]).has('x');
  for (const name of ['Bottom cover', 'Fan housing', 'Palm rest (C cover)', 'Housing, left', 'Battery case', 'Shell', 'Engine cowling', 'Steel can (+)', 'Label sleeve', 'Side covers', 'Core casing']) {
    assert.equal(byName(name), true, name);
  }
  for (const name of ['Case fan', 'Lid switch', 'CAN bus module', 'Battery', 'Keyboard', 'Coverage map', 'Cases']) {
    assert.equal(byName(name), name === 'Cases', name);
  }
  assert.equal(byName('Palm rest', ['top case']), true, 'another name counts');
  // a toned hologram: the tone decides (a truck's transfer case is a gearbox, not a shell)
  const truck = JSON.parse(readFileSync(path.join(ROOT, 'test', 'mock', 'fixtures', 'v2', 'f150.json'), 'utf8'));
  const shells = shellIdsOf(truck.parts);
  assert.equal(shells.has('transfer-case'), false);
  assert.deepEqual([...shells].sort(), truck.parts.filter((p) => p.tone === 'secondary').map((p) => p.id).sort());
  assert.equal(shellIdsOf(null).size, 0);
});

test('access: from the side a part comes out of, turned towards the model\'s own view', () => {
  const deg = (a) => a.map((r) => Math.round(r * DEG * 10) / 10);
  // the battery comes out downwards: from below (25° under the horizon) and in front (front-left)
  assert.deepEqual(deg(accessAngles([0, -45, 0], 'front-left')), [135, 115]);
  assert.deepEqual(deg(accessAngles([0, -1, 0], 'front')), [90, 115]);
  // a keyboard that lifts off, a part that comes out at the front or to the left: the model's own view
  assert.deepEqual(deg(accessAngles([0, 120, 0], 'front-left')), [135, 65]);
  assert.deepEqual(deg(accessAngles([40, 0, 0], 'front-left')), [135, 66]);
  // the lid comes off backwards: from behind and to the left, above; a part to the right: front-right
  assert.deepEqual(deg(accessAngles([-60, 0, 0], 'front-left')), [-151.1, 61.1]);
  assert.deepEqual(deg(accessAngles([0, 0, 40], 'front-left')), [61.1, 61.1]);
  // never past the poles, and nothing for no direction
  const [, phi] = accessAngles([-1, -0.8, 1], 'front-left');
  assert.ok(phi * DEG <= 179.4 + 1e-9);
  assert.equal(accessAngles([0, 0, 0]), null);
  assert.equal(accessAngles(null), null);
  assert.deepEqual(deg(anglesOfDir([0, -1, 0], 1)), [57.3, 179.4], 'straight down keeps the azimuth, stops short of the pole');
  assert.deepEqual(deg(anglesOfDir([1, 0, 0])), [90, 90]);
  assert.equal(anglesOfDir([0, 'x', 1]), null);
  assert.equal(anglesOfDir([0, 0, 0]), null);
});

test('shaders: a part pulses only with uPulse (alpha × (1 + 0.35 · sin 4t)); without it the math is as before', () => {
  assert.equal(PULSE_AMPLITUDE, 0.35);
  assert.equal(PULSE_RATE, 4);
  const pulse = '(1.0 + 0.35 * uPulse * sin(4.0 * uTime))';
  for (const [name, fs] of [['fill', FILL_FS], ['line', LINE_FS]]) {
    assert.match(fs, /uniform float uPulse;/, name);
    assert.ok(fs.includes(pulse), name);
  }
  assert.ok(FILL_FS.includes(`a *= fade * uVis * uFlicker * ${pulse};`));
  assert.ok(LINE_FS.includes(`float a = uAlpha * vW * fade * uVis * uFlicker * (1.0 + 0.8 * uSel + 0.45 * uHover) * ${pulse};`));
});

// ---- setEmphasis --------------------------------------------------------------------------------

test('setEmphasis: the battery glows and pulses, the case is a ghost, the rest steps back; null is the usual look', SLOW, async () => {
  const page = await open();
  const plain = await debug(page);
  for (const p of plain.parts) assert.deepEqual([p.visGoal, p.fillGoal, p.selGoal, p.pulseGoal, p.role], [1, 1, 0, 0, null], p.id);

  await run(page, (holo, target) => target.setEmphasis({ glow: ['battery'], ghost: 'shells' }));
  await page.clock.runFor(1000);
  const st = await debug(page);
  const battery = partOf(st, 'battery');
  assert.deepEqual([battery.role, battery.visGoal, battery.fillGoal, battery.selGoal, battery.pulseGoal], ['glow', 1, 1, 1, 1]);
  for (const id of LAPTOP_SHELLS) {
    const p = partOf(st, id);
    assert.equal(p.role, 'ghost', id);
    assert.ok(near(p.visGoal, 0.5) && near(p.visGoal * p.fillGoal, 0.1), `${id}: edges 0.5, fill 0.1 (${p.visGoal}, ${p.fillGoal})`);
    assert.deepEqual([p.selGoal, p.pulseGoal], [0, 0], id);
  }
  for (const p of st.parts.filter((x) => x.id !== 'battery' && !LAPTOP_SHELLS.includes(x.id))) {
    assert.deepEqual([p.role, p.visGoal, p.fillGoal, p.selGoal, p.pulseGoal], ['other', 0.15, 1, 0, 0], p.id);
  }
  // eased there in about a third of a second, and the pulse keeps frames coming
  for (const p of st.parts) assert.ok(near(p.vis, p.visGoal, 0.005) && near(p.fill, p.fillGoal, 0.005) && near(p.pulse, p.pulseGoal, 0.005), p.id);
  assert.equal(st.pulseLive, true);
  const state = await run(page, (holo) => holo.getState());
  assert.deepEqual(state.emphasis, { glow: ['battery'], ghost: ['shells'], hide: [], others: 0.15 });

  // several glowing parts, a part named as glow and ghost glows, hide wins, a custom level for the others
  await run(page, (holo, target) => target.setEmphasis({ glow: ['battery', 'battery-connector', 'palm-rest', 'warp-drive'], ghost: ['shells', 'keyboard'], hide: ['bottom-cover'], others: 0.3 }));
  const st2 = await debug(page);
  const roles = Object.fromEntries(st2.parts.map((p) => [p.id, p.role]));
  assert.deepEqual([roles.battery, roles['battery-connector'], roles['palm-rest'], roles.keyboard, roles.lid, roles['bottom-cover'], roles.fan], ['glow', 'glow', 'glow', 'ghost', 'ghost', 'hide', 'other']);
  assert.deepEqual([partOf(st2, 'battery-connector').pulseGoal, partOf(st2, 'palm-rest').selGoal], [1, 1]);
  assert.equal(partOf(st2, 'bottom-cover').visGoal, 0);
  assert.equal(partOf(st2, 'fan').visGoal, 0.3);

  // a selected part glows too (no pulse), and isolate still wins
  await run(page, (holo, target) => {
    target.setEmphasis({ glow: ['battery'], ghost: 'shells' });
    target.select('fan');
  });
  const st3 = await debug(page);
  assert.deepEqual([partOf(st3, 'fan').visGoal, partOf(st3, 'fan').selGoal, partOf(st3, 'fan').pulseGoal], [1, 1, 0]);
  await run(page, (holo) => holo.isolate('fan'));
  assert.equal(partOf(await debug(page), 'battery').visGoal, 0);
  await run(page, (holo) => holo.isolate(null));

  // null: the usual look (a selection dims the rest to 0.38, as before)
  await run(page, (holo, target) => target.setEmphasis(null));
  await page.clock.runFor(1000);
  const st4 = await debug(page);
  for (const p of st4.parts) {
    assert.deepEqual([p.role, p.visGoal, p.fillGoal, p.pulseGoal], [null, p.id === 'fan' ? 1 : 0.38, 1, 0], p.id);
    assert.ok(near(p.pulse, 0) && near(p.fill, 1), p.id);
  }
  assert.equal(st4.pulseLive, false);
  // nothing named is no emphasis at all
  await run(page, (holo, target) => target.setEmphasis({ glow: [], ghost: null }));
  assert.equal((await run(page, (holo) => holo.getState())).emphasis, null);
  assert.deepEqual(page.problems, []);
  assert.deepEqual(await page.cspViolations(), []);
});

test('setEmphasis: without tones the case is found by name; parts that arrive later take their role', SLOW, async () => {
  const untoned = { ...LAPTOP, parts: LAPTOP.parts.map(({ tone, ...p }) => p) };
  const page = await open({ spec: null });
  await run(page, (holo, target) => target.setEmphasis({ glow: 'battery', ghost: 'shells' }));
  await run(page, (holo, target, spec) => holo.setSpec(spec), untoned);
  await page.clock.runFor(500);
  const st = await debug(page);
  assert.deepEqual(st.parts.filter((p) => p.role === 'ghost').map((p) => p.id).sort(), [...LAPTOP_SHELLS].sort());
  assert.equal(partOf(st, 'battery').role, 'glow');
  const shells = (await run(page, (holo, target) => target.parts())).filter((p) => p.shell).map((p) => p.id);
  assert.deepEqual(shells.sort(), [...LAPTOP_SHELLS].sort());
  assert.deepEqual(page.problems, []);
});

test('the pulse: frames keep coming while a glow pulses, stop when it goes, and it stops by itself after 2 minutes', SLOW, async () => {
  const page = await open();
  const frames = () => run(page, (holo) => holo.debugInfo().frames);
  await page.clock.runFor(1000);
  const idle = await frames();
  await page.clock.runFor(1000);
  assert.equal(await frames(), idle, 'nothing moves: no frames');
  await run(page, (holo, target) => target.setEmphasis({ glow: ['battery'] }));
  await page.clock.runFor(1000);
  const a = await frames();
  await page.clock.runFor(1000);
  const b = await frames();
  assert.ok(b - a >= 20 && b - a <= 34, `about 30 frames a second while it pulses (${b - a})`);
  // two minutes later: a steady glow, and frames on demand again
  await page.clock.fastForward(121000);
  await page.clock.runFor(1000);
  const st = await debug(page);
  assert.deepEqual([partOf(st, 'battery').selGoal, partOf(st, 'battery').pulseGoal, st.pulseLive], [1, 0, false]);
  const c = await frames();
  await page.clock.runFor(1000);
  assert.equal(await frames(), c, 'no frames once the pulse stopped');
  // a new step pulses again
  await run(page, (holo, target) => target.setEmphasis({ glow: ['fan'] }));
  await page.clock.runFor(500);
  assert.equal((await debug(page)).pulseLive, true);
  assert.deepEqual(page.problems, []);
});

// ---- labels ---------------------------------------------------------------------------------------

test('labelsFor: only the named parts are labeled (and the selected one); the target\'s setLabels takes a list', SLOW, async () => {
  const page = await open();
  const shown = async () => (await debug(page)).parts.filter((p) => p.label).map((p) => p.id).sort();
  await page.clock.runFor(300);
  const all = await shown();
  assert.ok(all.length >= 4, `labels before: ${all}`);
  await run(page, (holo) => holo.labelsFor(['battery', 'fan', 'no-such-part']));
  await page.clock.runFor(300);
  assert.deepEqual(await shown(), ['battery', 'fan']);
  assert.deepEqual((await run(page, (holo) => holo.getState())).labelsFor, ['battery', 'fan', 'no-such-part']);
  await run(page, (holo) => holo.select('ssd'));
  await page.clock.runFor(300);
  assert.deepEqual(await shown(), ['battery', 'fan', 'ssd']);
  await run(page, (holo) => holo.select(null));
  await run(page, (holo, target) => target.setLabels(['speakers']));
  await page.clock.runFor(300);
  assert.deepEqual(await shown(), ['speakers']);
  await run(page, (holo, target) => target.setLabels(false));
  await page.clock.runFor(300);
  assert.deepEqual(await shown(), []);
  await run(page, (holo, target) => target.setLabels(true));
  await page.clock.runFor(300);
  assert.ok((await shown()).length >= 4, 'every label may show again');
  assert.equal((await run(page, (holo) => holo.getState())).labelsFor, null);
  // a glowing part's label is kept (pinned) and drawn as the selected one
  await run(page, (holo, target) => target.setEmphasis({ glow: ['battery-connector'], ghost: 'shells' }));
  await page.clock.runFor(500);
  assert.ok((await shown()).includes('battery-connector'));
  const cls = await page.evaluate(() => Array.from(document.querySelectorAll('.holo-label.is-shown.is-selected')).map((l) => l.textContent));
  assert.deepEqual(cls, ['Battery connector']);
  assert.deepEqual(page.problems, []);
});

// ---- flyTo ----------------------------------------------------------------------------------------

test('flyTo resolves on arrival (fake clock): target, distance and direction in one move', SLOW, async () => {
  const page = await open();
  await run(page, (holo, target) => {
    window.__fly = null;
    target.flyTo({ ids: ['battery'], view: 'access' }).then((how) => (window.__fly = how));
  });
  await page.clock.runFor(500);
  let st = await debug(page);
  assert.equal(await page.evaluate(() => window.__fly), null, 'not there after 500 ms');
  assert.equal(st.flying, true);
  assert.equal((await run(page, (holo) => holo.getState())).flying, true);
  await page.clock.runFor(300);
  assert.equal(await page.evaluate(() => window.__fly), 'arrived');
  st = await debug(page);
  assert.deepEqual([st.camera.theta, st.camera.phi, st.camera.fitMode, st.camera.focus, st.flying], [135, 115, 'part', ['battery'], false]);
  assert.ok(dist(st.camera.target, st.fit.target) < 1e-6 * st.fit.radius && near(st.camera.radius, st.fit.radius, 1e-6 * st.fit.radius), 'framed: the battery');

  // a view and a length; frame 'all'
  await run(page, (holo, target) => {
    window.__fly = null;
    target.flyTo({ frame: 'all', ids: ['battery'], view: 'front', ms: 2000 }).then((how) => (window.__fly = how));
  });
  await page.clock.runFor(1700);
  assert.equal(await page.evaluate(() => window.__fly), null, 'a 2-second move is still under way');
  await page.clock.runFor(400);
  assert.equal(await page.evaluate(() => window.__fly), 'arrived');
  st = await debug(page);
  assert.deepEqual([st.camera.theta, st.camera.phi, st.camera.fitMode, st.camera.focus, st.camera.view], [90, 80, 'auto', null, 'front']);

  // a direction; no direction keeps it; unknown ids frame everything
  await run(page, (holo, target) => { target.flyTo({ dir: [0, 1, 0], ms: 300 }); });
  await page.clock.runFor(400);
  st = await debug(page);
  assert.deepEqual([st.camera.theta, st.camera.phi], [90, 0.6]);
  await run(page, (holo, target) => { target.flyTo({ ids: ['fan', 'nothing'], ms: 300 }); });
  await page.clock.runFor(400);
  st = await debug(page);
  assert.deepEqual([st.camera.theta, st.camera.phi, st.camera.focus], [90, 0.6, ['fan']]);
  await run(page, (holo, target) => { target.flyTo({ ids: ['nothing'], ms: 300 }); });
  await page.clock.runFor(400);
  st = await debug(page);
  assert.deepEqual([st.camera.fitMode, st.camera.focus], ['auto', null]);
  assert.deepEqual(page.problems, []);
});

test('flyTo is cancelled by a pointer press or a wheel (\'touch\'), and replaced by another move', SLOW, async () => {
  const page = await open();
  const start = (opts) => run(page, (holo, target, opts) => {
    window.__fly = null;
    target.flyTo(opts).then((how) => (window.__fly = how));
  }, opts);
  const result = () => page.evaluate(() => window.__fly);
  const press = (type) => page.evaluate((type) => {
    const root = document.querySelector('.holo');
    const r = root.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, clientX: r.left + 200, clientY: r.top + 150 };
    if (type === 'wheel') root.dispatchEvent(new WheelEvent('wheel', { ...at, deltaY: 120 }));
    else {
      root.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerId: 7, button: 0, pointerType: 'mouse' }));
      root.dispatchEvent(new PointerEvent('pointercancel', { ...at, pointerId: 7, pointerType: 'mouse' }));
    }
  }, type);

  await start({ ids: ['battery'], view: 'access', ms: 2000 });
  await page.clock.runFor(400);
  const mid = await debug(page);
  await press('pointer');
  assert.equal(await result(), 'touch');
  await page.clock.runFor(2500);
  const after1 = await debug(page);
  assert.equal(after1.flying, false);
  assert.ok(after1.camera.phi < 115 - 5, `the camera stopped short of the goal (phi ${after1.camera.phi}, mid ${mid.camera.phi})`);

  await start({ frame: 'all', view: 'back', ms: 2000 });
  await page.clock.runFor(300);
  await press('wheel');
  assert.equal(await result(), 'touch');

  await start({ frame: 'all', view: 'front', ms: 2000 });
  await page.clock.runFor(200);
  await run(page, (holo, target) => {
    window.__second = null;
    target.flyTo({ ids: ['fan'], view: 'top', ms: 300 }).then((how) => (window.__second = how));
  });
  assert.equal(await result(), 'replaced');
  await page.clock.runFor(400);
  assert.equal(await page.evaluate(() => window.__second), 'arrived');

  await start({ frame: 'all', view: 'left', ms: 2000 });
  await page.clock.runFor(200);
  await run(page, (holo, target) => target.focus('ssd'));
  assert.equal(await result(), 'replaced');
  await start({ frame: 'all', view: 'right', ms: 2000 });
  await page.clock.runFor(200);
  await run(page, (holo) => holo.dispose());
  assert.equal(await result(), 'replaced');
  assert.deepEqual(page.problems, []);
});

test('flyTo frame \'all\' leaves out the parts a step hides', SLOW, async () => {
  const page = await open();
  const radiusFor = async (emphasis) => {
    await run(page, (holo, target, e) => {
      target.setEmphasis(e);
      target.flyTo({ frame: 'all', view: 'front-left', ms: 0 });
    }, emphasis);
    await page.clock.runFor(50);
    return (await debug(page)).camera.radius;
  };
  const whole = await radiusFor(null);
  const onlyBattery = await radiusFor({ glow: ['battery'], others: 0 });
  assert.ok(onlyBattery < whole * 0.8, `framing the battery alone is closer (${onlyBattery} vs ${whole})`);
  assert.ok(near(await radiusFor({ glow: ['battery'], ghost: 'shells' }), whole, whole * 1e-6), 'ghosts and dimmed parts still count');
  assert.deepEqual(page.problems, []);
});

test('explode, then flyTo or focus: the camera arrives where the parts stop, with no chase', SLOW, async () => {
  for (const second of ['flyTo', 'focus', 'focus-first']) {
    const page = await open();
    const final = await run(page, (holo, target, second) => {
      window.__fly = null;
      window.__exploded = null;
      if (second === 'focus-first') {
        target.focus('battery');
        target.explode(1).then((how) => (window.__exploded = how));
      } else {
        target.explode(1).then((how) => (window.__exploded = how));
        if (second === 'flyTo') target.flyTo({ ids: ['battery'] }).then((how) => (window.__fly = how));
        else target.focus('battery');
      }
      return holo.debugState();
    }, second);
    if (second === 'focus') assert.equal(final.moving, false, 'focus during an explode starts no tween of its own');
    const path = [];
    for (let t = 0; t < 1100; t += 50) {
      await page.clock.runFor(50);
      path.push((await debug(page)).camera.target);
    }
    const st = await debug(page);
    assert.equal(await page.evaluate(() => window.__exploded), 'arrived', second);
    if (second === 'flyTo') assert.equal(await page.evaluate(() => window.__fly), 'arrived');
    assert.deepEqual([st.explodeT, st.camera.fitMode, st.camera.focus, st.moving, st.exploding], [1, 'part', ['battery'], false, false], second);
    assert.ok(dist(st.camera.target, st.fit.target) < 1e-6 * st.fit.radius, `${second}: framed on the exploded battery`);
    // every step gets closer to where it ends (a chase would go past it, or back)
    const end = path[path.length - 1];
    for (let i = 1; i < path.length; i++) assert.ok(dist(path[i], end) <= dist(path[i - 1], end) + 1e-6 * st.fit.radius, `${second}: step ${i} moves away from the end (${JSON.stringify(path)})`);
    await page.clock.runFor(500);
    assert.deepEqual((await debug(page)).camera.target, st.camera.target, `${second}: nothing moves after`);
    assert.deepEqual(page.problems, []);
  }
});

test('explode resolves when the parts stop, or when another explode takes over', SLOW, async () => {
  const page = await open();
  await run(page, (holo, target) => {
    window.__a = null;
    window.__b = null;
    target.explode(1).then((how) => (window.__a = how));
  });
  await page.clock.runFor(400);
  await run(page, (holo, target) => { target.explode(0).then((how) => (window.__b = how)); });
  assert.equal(await page.evaluate(() => window.__a), 'replaced');
  await page.clock.runFor(1000);
  assert.equal(await page.evaluate(() => window.__b), 'arrived');
  assert.equal(await run(page, (holo, target) => target.explode(1, false)), 'arrived');
  assert.deepEqual(page.problems, []);
});

// ---- auto-rotation, reduced motion ----------------------------------------------------------------

test('holdAutoRotate: no idle rotation during a tour; given back after the usual quiet time; "spin it" wins', SLOW, async () => {
  const page = await open({ options: { autoRotate: true } });
  await page.clock.runFor(500);
  let st = await debug(page);
  assert.equal(st.rotating, true, 'it rotates by itself');
  await run(page, (holo, target) => target.holdAutoRotate(true));
  const theta = (await debug(page)).camera.theta;
  await page.clock.runFor(10000);
  st = await debug(page);
  assert.deepEqual([st.rotating, st.rotateHeld, st.camera.theta], [false, true, theta]);
  const held = await run(page, (holo) => holo.getState());
  assert.deepEqual([held.autoRotate, held.rotateHeld], [true, true], 'the setting is kept');
  await run(page, (holo, target) => target.holdAutoRotate(false));
  await page.clock.runFor(3000);
  assert.equal((await debug(page)).rotating, false, 'not at once');
  await page.clock.runFor(5000);
  assert.equal((await debug(page)).rotating, true, 'after the quiet time');
  await run(page, (holo, target) => target.holdAutoRotate(true));
  await run(page, (holo) => holo.autoRotate(true));
  await page.clock.runFor(200);
  st = await debug(page);
  assert.deepEqual([st.rotateHeld, st.rotating], [false, true], 'the owner asked for it');
  assert.deepEqual(page.problems, []);
});

test('reduced motion: flights and explodes are cuts, and a glow does not pulse', SLOW, async () => {
  const page = await open({ reduced: true });
  const how = await run(page, (holo, target) => {
    target.setEmphasis({ glow: ['battery'], ghost: 'shells' });
    target.explode(1);
    return target.flyTo({ ids: ['battery'], view: 'access' });
  });
  assert.equal(how, 'arrived', 'at once, without any time passing');
  const st = await debug(page);
  assert.deepEqual([st.camera.theta, st.camera.phi, st.explodeT, st.moving], [135, 115, 1, false]);
  assert.ok(dist(st.camera.target, st.fit.target) < 1e-6 * st.fit.radius);
  await page.clock.runFor(20); // one frame
  const after = await debug(page);
  assert.deepEqual([partOf(after, 'battery').selGoal, partOf(after, 'battery').pulseGoal, after.pulseLive], [1, 0, false]);
  assert.deepEqual([partOf(after, 'bottom-cover').vis, partOf(after, 'fan').vis], [0.5, 0.15], 'no fades either');
  assert.deepEqual(page.problems, []);
});

// ---- the target (contract (e)) and the usual look --------------------------------------------------

test('tourTarget: one object with the contract\'s methods, also without WebGL', SLOW, async () => {
  const page = await open();
  const shape = await run(page, (holo, target) => ({
    keys: Object.keys(target).sort(),
    same: holo.tourTarget() === target,
    frozen: Object.isFrozen(target),
    parts: target.parts().map((p) => [p.id, p.shell, p.tone]),
  }));
  assert.deepEqual(shape.keys, TARGET_KEYS);
  assert.equal(shape.same, true);
  assert.equal(shape.frozen, true);
  assert.equal(shape.parts.length, 16);
  assert.deepEqual(shape.parts.filter((p) => p[1]).map((p) => p[0]).sort(), [...LAPTOP_SHELLS].sort());
  assert.equal(await run(page, (holo, target) => target.settled(1000)), true);
  assert.deepEqual([await run(page, (holo, target) => target.select('nope')), await run(page, (holo, target) => target.focus('nope'))], [false, false]);

  // no WebGL: no viewer, as today; the target is there and nothing waits on it
  const nogl = await harness.newPage({ init: () => { HTMLCanvasElement.prototype.getContext = () => null; } });
  const r = await nogl.evaluate(async () => {
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:400px;height:300px';
    document.body.append(host);
    const holo = window.__mods.hologram.createHologram(host, {});
    const target = holo.tourTarget();
    target.setEmphasis({ glow: ['battery'] });
    target.setLabels(['battery']);
    target.holdAutoRotate(true);
    return { keys: Object.keys(target).sort(), state: holo.getState(), fly: await target.flyTo({ ids: ['battery'] }), explode: await target.explode(1), settled: await target.settled(10) };
  });
  assert.deepEqual(r.keys, TARGET_KEYS);
  assert.deepEqual([r.state.error, r.fly, r.explode, r.settled], ['webgl', 'arrived', 'arrived', false]);
  assert.deepEqual(page.problems, []);
});

test('the usual look is unchanged after an emphasis comes and goes (pixel for pixel)', SLOW, async () => {
  const page = await open();
  const shot = () => run(page, (holo) => holo.snapshot({ width: 320, height: 240 }));
  const before = await shot();
  await run(page, (holo, target) => {
    target.setEmphasis({ glow: ['battery'], ghost: 'shells', hide: ['fan'] });
    target.setLabels(['battery']);
  });
  await page.clock.runFor(1000);
  const during = await shot();
  await run(page, (holo, target) => {
    target.setEmphasis(null);
    target.setLabels(true);
  });
  await page.clock.runFor(1000);
  const again = await shot();
  assert.ok(before && before.startsWith('data:image/png'));
  assert.notEqual(during, before, 'the emphasis shows');
  assert.equal(again, before, 'back to the usual look');
  assert.deepEqual(page.problems, []);
});
