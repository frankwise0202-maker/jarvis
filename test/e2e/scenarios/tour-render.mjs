// The walkthrough renderer (SPEC §29.2, contract (e)) in the real build: the app's own hologram
// chunk (dist/assets/chunks/hologram-*.js), loaded in the app page under its CSP and styles, drives
// a generic laptop hologram (no brand, no model) through its tour target the way a tour player
// does: the battery glowing and pulsing inside the ghosted, closed case; taken apart and flown to
// from the side it comes out of (below and in front); opened with the bottom cover hidden; enclosed
// again from below; a pointer press stopping a flight; and the usual look back at the end. The
// screenshots are for a person to look at (test/artifacts/tour-render-emphasis-*.png).
//
// The viewer's own tour wiring (tour-player.js, the bar, the words) has its own scenarios
// (tours.mjs); this one checks the renderer target and its look, so it reaches the renderer the
// way the viewer does (createHologram from the same chunk) rather than through the viewer's DOM.

import { readdirSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { ROOT } from '../../../scripts/build.mjs';
import { LAPTOP } from '../../unit/hologram.laptop.mjs';

/** The built hologram renderer's URL path (dist/assets/chunks/hologram-<hash>.js). */
function rendererChunk() {
  const dir = path.join(ROOT, 'dist', 'assets', 'chunks');
  const file = readdirSync(dir).find((f) => /^hologram-[A-Z0-9]+\.js$/i.test(f));
  if (!file) throw new Error(`no hologram chunk in ${dir}`);
  return `/assets/chunks/${file}`;
}

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

/**
 * Lit pixels (the hologram's lines and fills on the near-black stage), the total light, and the
 * centre of the bright ones, leaving out `skip` boxes (a label's white text is bright too).
 */
function light(png, skip = []) {
  const { width, data } = decodePng(png);
  let lit = 0;
  let bright = 0;
  let sx = 0;
  let sy = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    if (skip.some((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)) continue;
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += luma;
    if (data[i + 2] > 110 && data[i + 1] > 70) lit++;
    if (luma > 150) {
      bright++;
      sx += x;
      sy += y;
    }
  }
  return { lit, bright, sum, centre: bright ? { x: sx / bright, y: sy / bright } : null };
}

/** In the page: the renderer over the app, the laptop on it (window.__tour = { holo, target }). */
async function mountRenderer(page) {
  const url = rendererChunk();
  return page.evaluate(
    async ({ url, spec }) => {
      const { createHologram } = await import(url);
      const host = document.createElement('div');
      host.dataset.testid = 'tour-render-stage';
      host.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#02060b';
      document.body.append(host);
      // as the viewer makes it: labels, and the idle rotation that starts after 6 s
      const holo = createHologram(host, { labels: true, autoRotate: true, rotateAfterMs: 6000 });
      const res = holo.setSpec(spec);
      const settled = await holo.settled(10000);
      window.__tour = { holo, target: holo.tourTarget() };
      return { ok: res.ok, settled, parts: holo.getState().parts };
    },
    { url, spec: LAPTOP },
  );
}

const tour = (page, fn, arg = null) => page.evaluate(`(${fn.toString()})(window.__tour.holo, window.__tour.target, ${JSON.stringify(arg)})`);
const debug = (page) => tour(page, (holo) => holo.debugState());
const shownLabels = (page) => page.evaluate(() => Array.from(document.querySelectorAll('.holo-label.is-shown')).map((l) => l.textContent.trim()));
/** Where the battery's label leader points (its centre), and the label's box, in page pixels. */
const batteryAnchor = (page) =>
  page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('.holo-label.is-shown')).find((l) => l.textContent.trim() === 'Battery (57 Wh)');
    const dot = label && document.querySelector(`circle.holo-anchor[data-key="${label.dataset.key}"]`);
    if (!dot) return null;
    const r = dot.getBoundingClientRect();
    const b = label.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: { left: b.left - 4, top: b.top - 4, right: b.right + 4, bottom: b.bottom + 4 } };
  });

export default [
  {
    name: 'tour-render-emphasis',
    title: 'Walkthrough renderer: the battery glowing and pulsing inside the ghosted, closed laptop; apart and flown to from below and in front; opened; a press stops a flight; the usual look back',
    device: 'desktop',
    timeout: 240000,
    async run(t) {
      const page = await t.newPage();
      await t.goto('/');
      let plain;

      await t.step('the built renderer shows the generic laptop, as the viewer would', async () => {
        const r = await mountRenderer(page);
        t.assert(r.ok && r.settled && r.parts === 16, `The laptop is shown and settled (${JSON.stringify(r)})`);
        await tour(page, (holo, target) => target.holdAutoRotate(true)); // a tour holds the idle rotation
        await page.waitForTimeout(1200);
        plain = light(readFileSync(await t.screenshot('1-assembled')));
        t.assert(plain.lit > 4000, `The model is drawn (${plain.lit} lit pixels)`);
      });

      await t.step('enclosed: the battery glows and pulses where it sits, the case a see-through ghost', async () => {
        const how = await tour(page, (holo, target) => {
          target.setEmphasis({ glow: ['battery'], ghost: 'shells' });
          target.setLabels(['battery']);
          return target.flyTo({ frame: 'all', view: 'front-left' });
        });
        t.assert(how === 'arrived', `The flight arrived (${how})`);
        await page.waitForTimeout(600);
        const st = await debug(page);
        const role = Object.fromEntries(st.parts.map((p) => [p.id, p]));
        t.assert(role.battery.role === 'glow' && role.battery.pulse === 1 && role.battery.vis === 1, `The battery glows and pulses (${JSON.stringify(role.battery)})`);
        for (const id of ['bottom-cover', 'palm-rest', 'lid']) t.assert(role[id].role === 'ghost' && Math.abs(role[id].vis - 0.5) < 0.01 && Math.abs(role[id].vis * role[id].fill - 0.1) < 0.01, `${id} is a ghost (${JSON.stringify(role[id])})`);
        t.assert(Math.abs(role.motherboard.vis - 0.15) < 0.01, `The other parts step back (${role.motherboard.vis})`);
        const labels = await shownLabels(page);
        t.assert(labels.length === 1 && labels[0] === 'Battery (57 Wh)', `Only the battery is labeled (${JSON.stringify(labels)})`);
        const file = await t.screenshot('2-enclosed');
        const anchor = await batteryAnchor(page);
        t.assert(anchor, 'The battery is labeled');
        const shot = light(readFileSync(file), [anchor.label]);
        t.assert(anchor && shot.centre && Math.hypot(shot.centre.x - anchor.x, shot.centre.y - anchor.y) < 140, `The brightest light is the battery (bright centre ${JSON.stringify(shot.centre)}, battery ${JSON.stringify(anchor)})`);
        t.assert(shot.lit < plain.lit * 0.8, `The rest steps back (${shot.lit} lit pixels, ${plain.lit} before)`);
        // the pulse: the battery's light rises and falls (alpha × (1 + 0.35 sin 4t))
        const clip = { x: Math.max(0, anchor.x - 220), y: Math.max(0, anchor.y - 160), width: 440, height: 320 };
        const sums = [];
        for (let i = 0; i < 6; i++) {
          sums.push(light(await page.screenshot({ clip }), [{ left: anchor.label.left - clip.x, top: anchor.label.top - clip.y, right: anchor.label.right - clip.x, bottom: anchor.label.bottom - clip.y }]).sum);
          await page.waitForTimeout(170);
        }
        const swing = Math.max(...sums) / Math.max(1, Math.min(...sums));
        t.assert(swing > 1.06, `The battery pulses (its light swings ${swing.toFixed(3)}×: ${sums.map((s) => Math.round(s / 1000)).join(', ')}k)`);
        t.note(`pulse swing ${swing.toFixed(2)}×`);
      });

      await t.step('apart, and the camera flies to the battery from the side it comes out of', async () => {
        const how = await tour(page, async (holo, target) => {
          const parts = target.explode(1);
          const camera = target.flyTo({ ids: ['battery'], view: 'access' });
          return [await parts, await camera];
        });
        t.assert(how.join() === 'arrived,arrived', `The explode and the flight arrived together (${how})`);
        const st = await debug(page);
        t.assert(st.camera.theta === 135 && st.camera.phi === 115 && st.camera.focus.join() === 'battery', `From below and in front (${JSON.stringify(st.camera)})`);
        await page.waitForTimeout(400);
        await t.screenshot('3-apart-battery');
      });

      await t.step('opened: assembled, the bottom cover hidden, the camera on the battery from below', async () => {
        const how = await tour(page, async (holo, target) => {
          target.explode(0);
          target.setEmphasis({ glow: ['battery'], ghost: 'shells', hide: ['bottom-cover'] });
          return target.flyTo({ ids: ['battery'], view: 'access' });
        });
        t.assert(how === 'arrived', `The flight arrived (${how})`);
        await page.waitForTimeout(600);
        const st = await debug(page);
        const cover = st.parts.find((p) => p.id === 'bottom-cover');
        t.assert(cover.role === 'hide' && cover.vis === 0, `The bottom cover is hidden (${JSON.stringify(cover)})`);
        t.assert(st.explodeT === 0, 'Assembled');
        await t.screenshot('4-opened');
      });

      await t.step('enclosed again, from below and in front: the battery inside the closed laptop', async () => {
        const how = await tour(page, (holo, target) => {
          target.setEmphasis({ glow: ['battery'], ghost: 'shells' });
          return target.flyTo({ ids: ['battery'], frame: 'all', view: 'access' });
        });
        t.assert(how === 'arrived', `The flight arrived (${how})`);
        await page.waitForTimeout(600);
        const file = await t.screenshot('5-enclosed-below');
        const anchor = await batteryAnchor(page);
        t.assert(anchor, 'The battery is labeled');
        const shot = light(readFileSync(file), [anchor.label]);
        t.assert(anchor && shot.centre && Math.hypot(shot.centre.x - anchor.x, shot.centre.y - anchor.y) < 160, `The brightest light is the battery (bright centre ${JSON.stringify(shot.centre)}, battery ${JSON.stringify(anchor)})`);
      });

      await t.step('a press on the model stops a flight', async () => {
        await tour(page, (holo, target) => {
          window.__fly = null;
          target.flyTo({ frame: 'all', view: 'front-right', ms: 4000 }).then((how) => (window.__fly = how));
        });
        await page.waitForTimeout(500);
        await page.mouse.move(720, 450);
        await page.mouse.down();
        await t.waitFor(() => page.evaluate(() => window.__fly), { timeout: 3000, message: 'the flight to stop' });
        await page.mouse.up();
        const how = await page.evaluate(() => window.__fly);
        t.assert(how === 'touch', `A press stops it ('${how}')`);
      });

      await t.step('the tour ends: the usual look is back', async () => {
        await tour(page, (holo, target) => {
          target.select(null);
          target.setEmphasis(null);
          target.setLabels(true);
          target.holdAutoRotate(false);
          return target.flyTo({ frame: 'all', view: 'front-left' });
        });
        await page.waitForTimeout(800);
        const st = await debug(page);
        t.assert(st.parts.every((p) => p.role === null && p.vis === 1 && p.pulse === 0), 'Every part as before');
        t.assert(!st.rotateHeld, 'The idle rotation is given back');
        const after = light(readFileSync(await t.screenshot('6-after')));
        t.assert(Math.abs(after.lit - plain.lit) < plain.lit * 0.12, `As lit as before the tour (${after.lit} vs ${plain.lit})`);
        const labels = await shownLabels(page);
        t.assert(labels.length >= 6, `Labels are back (${labels.length})`);
      });

      await t.step('a phone: the battery in the closed laptop', async () => {
        const phone = await t.newPage({ device: 'iphone13' });
        await t.goto('/', { page: phone });
        const r = await mountRenderer(phone);
        t.assert(r.ok && r.settled, 'The laptop is shown on the phone');
        const how = await tour(phone, (holo, target) => {
          target.holdAutoRotate(true);
          target.setEmphasis({ glow: ['battery'], ghost: 'shells' });
          target.setLabels(['battery']);
          return target.flyTo({ ids: ['battery'], frame: 'all', view: 'access' });
        });
        t.assert(how === 'arrived', `The flight arrived (${how})`);
        await phone.waitForTimeout(800);
        await t.screenshot('7-phone-enclosed', phone);
      });
    },
  },
];
