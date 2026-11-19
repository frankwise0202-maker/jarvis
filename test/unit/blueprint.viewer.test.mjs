// The blueprint viewer, its exports and the photo strip/viewer in real headless Chromium, served
// with the app's CSP (platform harness). Wikimedia Commons is answered by a fixture and a 1×1 image
// (tests never reach the network).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHarness, ROOT } from './platform.harness.test.mjs';

const FIXTURE = readFileSync(path.join(ROOT, 'test', 'unit', 'fixtures', 'commons-search.json'), 'utf8');
const SAMPLES = Object.fromEntries(['alternator-part', 'battery-cutaway', 'battery-process', 'camry-assembly'].map((n) => [n, JSON.parse(readFileSync(path.join(ROOT, 'test', 'mock', 'fixtures', `${n}.json`), 'utf8'))]));
const CSS = ['src/styles/tokens.css', 'src/styles/blueprint.css'].map((f) => readFileSync(path.join(ROOT, f), 'utf8')).join('\n') + '\nhtml,body,#root{height:100%;margin:0}';
// 1x1 transparent PNG.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const DATE = '2026-11-19';

let harness;
before(async () => {
  harness = await createHarness({ viewer: 'src/ui/blueprint/viewer.js', photos: 'src/ui/photos.js', search: 'src/platform/photos.js' });
});
after(async () => {
  if (harness) await harness.close();
});

/** A page with the viewer (or the photo strip) mounted full size in #root. */
async function open(what, viewport = { width: 1280, height: 800 }) {
  const p = await harness.newPage({ contextOptions: { viewport, hasTouch: viewport.width < 500, acceptDownloads: true } });
  await p.route('https://commons.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: FIXTURE }));
  await p.route('https://upload.wikimedia.org/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PIXEL }));
  await p.addStyleTag({ content: CSS });
  if (what === 'photos') {
    await p.evaluate(() => {
      const { createPhotoStrip, createPhotoViewer } = window.__mods.photos;
      let viewer = null;
      const strip = createPhotoStrip({
        onOpen: (photos, index) => {
          if (viewer) viewer.destroy();
          viewer = createPhotoViewer({ photos, index, onClose: () => (viewer.destroy(), (viewer = null)) });
          Object.assign(viewer.el.style, { position: 'fixed', inset: '0' });
          document.body.append(viewer.el);
        },
      });
      document.getElementById('root').append(strip.el);
      window.__photosReady = strip.search('car alternator');
    });
  } else {
    await p.evaluate(
      ({ spec, date }) => {
        const v = window.__mods.viewer.createBlueprintViewer({ spec, date, onClose: () => {} });
        document.getElementById('root').append(v.el);
        window.__viewer = v;
      },
      { spec: SAMPLES[what], date: DATE },
    );
    await p.waitForSelector('.bpv__sheet');
    await p.waitForTimeout(80);
  }
  p.done = async () => {
    assert.deepEqual(await p.cspViolations(), [], 'CSP violations');
    assert.deepEqual(p.problems, [], 'console errors');
    await p.context().close();
  };
  return p;
}

const viewBox = (p) => p.evaluate(() => document.querySelector('.bpv__sheet').getAttribute('viewBox').split(' ').map(Number));

test('blueprint viewer: layout follows the viewer width', async () => {
  const wide = await open('alternator-part');
  assert.equal(await wide.getAttribute('[data-testid="blueprint-viewer"]', 'data-layout'), 'wide');
  await wide.done();
  const narrow = await open('alternator-part', { width: 390, height: 844 });
  await narrow.waitForFunction(() => document.querySelector('[data-testid="blueprint-viewer"]').getAttribute('data-layout') === 'narrow');
  assert.equal(await narrow.getAttribute('[data-testid="blueprint-parts-toggle"]', 'aria-expanded'), 'true');
  await narrow.done();
});

test('blueprint viewer: a parts row highlights its callouts and flies to them; a bubble selects its row', async () => {
  const p = await open('alternator-part');
  const before = await viewBox(p);
  await p.click('.bpv__part[data-n="3"]');
  await p.waitForTimeout(400);
  const state = await p.evaluate(() => ({
    callouts: document.querySelectorAll('.bp-callout.is-active[data-n="3"]').length,
    row: document.querySelectorAll('.bp-part-row.is-active[data-n="3"]').length,
    pressed: document.querySelector('.bpv__part[data-n="3"]').getAttribute('aria-pressed'),
  }));
  assert.equal(state.callouts, 2); // part 3 is called out in both views
  assert.equal(state.row, 1);
  assert.equal(state.pressed, 'true');
  const after = await viewBox(p);
  assert.ok(after[2] < before[2], 'zoomed in on the callout');
  await p.evaluate(() => window.__viewer.fit());
  await p.waitForTimeout(350);
  const box = await p.evaluate(() => {
    const r = document.querySelector('.bp-callout[data-n="12"] .bp-bubble').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await p.mouse.click(box.x, box.y);
  await p.waitForTimeout(100);
  assert.equal(await p.getAttribute('.bpv__part[data-n="12"]', 'aria-pressed'), 'true');
  assert.equal(await p.getAttribute('.bpv__part[data-n="3"]', 'aria-pressed'), 'false');
  await p.done();
});

test('blueprint viewer: keyboard, wheel and buttons zoom; fit restores', async () => {
  const p = await open('battery-cutaway');
  const fit = await viewBox(p);
  await p.focus('[data-testid="blueprint-stage"]');
  await p.keyboard.press('+');
  await p.waitForTimeout(350);
  const plus = await viewBox(p);
  assert.ok(plus[2] < fit[2] * 0.8);
  await p.mouse.move(500, 400);
  await p.mouse.wheel(0, 400);
  await p.waitForTimeout(100);
  const wheel = await viewBox(p);
  assert.ok(wheel[2] > plus[2]);
  await p.click('[data-testid="blueprint-zoom-in"]');
  await p.waitForTimeout(350);
  assert.ok((await viewBox(p))[2] < wheel[2]);
  await p.click('[data-testid="blueprint-fit"]');
  await p.waitForTimeout(350);
  const back = await viewBox(p);
  assert.ok(Math.abs(back[2] - fit[2]) < 1);
  await p.done();
});

test('blueprint viewer: exports are a standalone SVG, a PNG blob and a small thumbnail', async () => {
  const p = await open('alternator-part');
  await p.click('.bpv__part[data-n="7"]');
  const r = await p.evaluate(async () => {
    const m = window.__mods.viewer;
    const svg = window.__viewer.svg;
    const text = m.serializeSVG(svg);
    const png = await m.toPNG(svg, 1);
    const thumb = await m.thumbnail(svg, { width: 320 });
    return { svgChars: text.length, pngBytes: png.size, xmlHeader: text.startsWith('<?xml'), hasActive: /is-active/.test(text), thumbHead: thumb.slice(0, 24), thumbLen: thumb.length };
  });
  assert.equal(r.xmlHeader, true);
  assert.equal(r.hasActive, false, 'selection state stripped from the export');
  assert.ok(r.svgChars > 50000);
  assert.ok(r.pngBytes > 50000);
  assert.ok(r.thumbLen <= 60000);
  assert.match(r.thumbHead, /^data:image\/(png|jpeg);base64,/);
  await p.done();
});

test('blueprint viewer: panel links are safe and open in a new tab without a referrer', async () => {
  const p = await open('camry-assembly');
  const links = await p.evaluate(() => Array.from(document.querySelectorAll('.bpv__sources a')).map((a) => ({ href: a.href, target: a.target, rel: a.rel })));
  assert.equal(links.length, 3);
  for (const l of links) {
    assert.match(l.href, /^https:\/\//);
    assert.equal(l.target, '_blank');
    assert.equal(l.rel, 'noopener noreferrer');
  }
  // The sheet itself carries no links at all.
  assert.equal(await p.evaluate(() => document.querySelectorAll('.bpv__sheet a, .bpv__sheet [href]').length), 0);
  await p.done();
});

test('photo strip: shows only upload.wikimedia.org images, without a referrer; the viewer credits them', async () => {
  const p = await open('photos');
  await p.waitForSelector('[data-testid="photo-thumb"]');
  const imgs = await p.evaluate(() => Array.from(document.querySelectorAll('[data-testid="photo-thumb"] img')).map((i) => ({ src: i.src, rp: i.getAttribute('referrerpolicy'), lazy: i.getAttribute('loading') })));
  assert.equal(imgs.length, 5);
  for (const i of imgs) {
    assert.match(i.src, /^https:\/\/upload\.wikimedia\.org\//);
    assert.equal(i.rp, 'no-referrer');
    assert.equal(i.lazy, 'lazy');
  }
  await p.click('[data-testid="photo-thumb"] >> nth=0');
  await p.waitForSelector('[data-testid="photo-viewer"]');
  const credit = await p.textContent('[data-testid="photo-credit"]');
  assert.match(credit, /Photo: José Müller · CC BY 3\.0 · Wikimedia Commons/);
  assert.match(await p.getAttribute('[data-testid="photo-source"]', 'href'), /^https:\/\/commons\.wikimedia\.org\/wiki\/File:Alternator_cutaway\.jpg$/);
  await p.click('[data-testid="photo-next"]');
  assert.match(await p.textContent('.ph-viewer__kicker'), /2 of 5/);
  await p.click('[data-testid="photo-close"]');
  assert.equal(await p.locator('[data-testid="photo-viewer"]').count(), 0);
  await p.done();
});

test('blueprint viewer touch: double-tap zooms in then back to fit; a two-finger pinch zooms', async () => {
  const p = await open('alternator-part', { width: 390, height: 844 });
  await p.waitForFunction(() => document.querySelector('[data-testid="blueprint-viewer"]').getAttribute('data-layout') === 'narrow');
  await p.tap('[data-testid="blueprint-parts-toggle"]'); // full-height stage
  await p.waitForTimeout(300);
  const stage = await p.evaluate(() => {
    const r = document.querySelector('[data-testid="blueprint-stage"]').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  const fit = await viewBox(p);
  await p.touchscreen.tap(stage.x, stage.y);
  await p.touchscreen.tap(stage.x, stage.y);
  await p.waitForTimeout(400);
  const zoomed = await viewBox(p);
  assert.ok(zoomed[2] < fit[2] / 2, `double-tap zoom: ${fit[2]} -> ${zoomed[2]}`);
  await p.waitForTimeout(400);
  await p.touchscreen.tap(stage.x, stage.y);
  await p.touchscreen.tap(stage.x, stage.y);
  await p.waitForTimeout(400);
  assert.ok(Math.abs((await viewBox(p))[2] - fit[2]) < 1, 'second double-tap fits');
  // Pinch: two fingers moving apart around the centre.
  const cdp = await p.context().newCDPSession(p);
  const pts = (d) => [
    { x: stage.x - d, y: stage.y, id: 1 },
    { x: stage.x + d, y: stage.y, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(40) });
  for (let d = 50; d <= 120; d += 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(d) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(150);
  const pinched = await viewBox(p);
  const ratio = fit[2] / pinched[2];
  assert.ok(ratio > 2.5 && ratio < 3.5, `pinch 80 px -> 240 px should zoom about 3x, got ${ratio.toFixed(2)}`);
  // The content point under the fingers stays put (centre of the stage).
  const centreBefore = fit[0] + fit[2] / 2;
  const centreAfter = pinched[0] + pinched[2] / 2;
  assert.ok(Math.abs(centreAfter - centreBefore) < fit[2] * 0.02, 'pinch keeps the point between the fingers');
  await p.done();
});

test('blueprint viewer: the download buttons save an SVG and a PNG under the CSP', async () => {
  const p = await open('battery-cutaway');
  const [svgDl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid="blueprint-download-svg"]')]);
  assert.match(svgDl.suggestedFilename(), /^jarvis-blueprint-aa-alkaline-cell-lr6-2026-11-19\.svg$/);
  const svgText = readFileSync(await svgDl.path(), 'utf8');
  assert.match(svgText, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.doesNotMatch(svgText, /is-active|bpv__sheet|preserveAspectRatio/);
  const [pngDl] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid="blueprint-download-png"]')]);
  assert.match(pngDl.suggestedFilename(), /\.png$/);
  const png = readFileSync(await pngDl.path());
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  await p.done();
});
