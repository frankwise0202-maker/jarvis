#!/usr/bin/env node
// A synthetic camera feed for the Optics tests: a desk scene (mug, AA battery, pothos, notebook,
// pen, screwdriver) rendered with three.js in headless Chromium, written as Y4M files that
// Chromium plays as its fake camera (--use-file-for-fake-video-capture), plus the exact pixel
// position of every object in each framing (test/mock/fixtures/optics-scene.json), which the mock
// Claude returns as pin_labels coordinates, so the E2E test can check that every pin lands on its
// object after the app's crop (object-fit) mapping.
//
//   node test/e2e/optics-scene.mjs [--out <dir>] [--fixture]
//   (default out: test/artifacts/optics-feed/; --fixture also rewrites the committed fixture)
//
// Files: desk-landscape.y4m (1280×720), desk-portrait.y4m (720×1280): one still frame each.
//        desk-watch-landscape.y4m: scene A for 4 s, then scene B (the mug moved, a phone added)
//        for 4 s, looping: what Watch should notice. PNG previews of every frame.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(import.meta.url);

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node22/lib/node_modules/playwright');
  }
}

const PAGE = String.raw`<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">
<canvas id="gl"></canvas><canvas id="post"></canvas>
<script type="importmap">{ "imports": { "three": "/three.module.js" } }</script>
<script type="module">
import * as THREE from 'three';

function woodTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#7a4f2e'; g.fillRect(0, 0, 1024, 1024);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 420; i++) {
    const y = rnd() * 1024; const h = 1 + rnd() * 5; const a = 0.05 + rnd() * 0.12;
    g.fillStyle = rnd() > 0.5 ? 'rgba(40,22,10,' + a + ')' : 'rgba(170,120,80,' + a * 0.8 + ')';
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 16) g.lineTo(x, y + Math.sin((x / 1024) * Math.PI * 6 + i) * 6 + Math.sin((x / 1024) * Math.PI * 22 + i * 3) * 1.2);
    g.lineTo(1024, y + h); g.lineTo(0, y + h); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function labelPlate(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#2b2b2b'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.fillText(text, 128, 80);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

window.render = async ({ width, height, variant, portrait }) => {
  const gl = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false); renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#2a2f36');
  const cam = new THREE.PerspectiveCamera(portrait ? 70 : 46, width / height, 0.05, 50);
  if (portrait) { cam.position.set(0, 0.74, 0.3); cam.lookAt(0, 0, -0.02); }
  else { cam.position.set(0, 0.46, 0.52); cam.lookAt(0, 0.02, -0.04); }

  scene.add(new THREE.HemisphereLight('#dfe8ff', '#4a3524', 0.9));
  const key = new THREE.DirectionalLight('#fff1dc', 2.6); key.position.set(-0.6, 1.2, 0.5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -1; key.shadow.camera.right = 1; key.shadow.camera.top = 1; key.shadow.camera.bottom = -1; key.shadow.radius = 4; key.shadow.bias = -0.0004;
  scene.add(key);
  const fill = new THREE.PointLight('#9fc4ff', 0.6, 4); fill.position.set(0.8, 0.5, 0.6); scene.add(fill);

  const desk = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62, metalness: 0.02 }));
  desk.rotation.x = -Math.PI / 2; desk.receiveShadow = true; scene.add(desk);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshStandardMaterial({ color: '#3b4450', roughness: 0.95 }));
  wall.position.set(0, 0.75, -0.55); scene.add(wall);

  const objects = {};
  const add = (mesh, name) => { mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh); if (name) objects[name] = mesh; return mesh; };

  // Coffee mug (moves in scene B)
  const mug = new THREE.Group();
  const ceramic = new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.28, metalness: 0 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.039, 0.095, 48, 1, true), ceramic); body.position.y = 0.0475; body.castShadow = true;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.039, 32), ceramic); bottom.rotation.x = -Math.PI / 2; bottom.position.y = 0.001;
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.04, 48), new THREE.MeshStandardMaterial({ color: '#3a2214', roughness: 0.15 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.083;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.0405, 0.038, 0.094, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#e8e4dc', side: THREE.BackSide })); inner.position.y = 0.0475;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0075, 16, 48, Math.PI * 1.15), ceramic); handle.position.set(0.046, 0.05, 0); handle.rotation.z = -Math.PI * 0.57; handle.castShadow = true;
  mug.add(body, bottom, coffee, inner, handle);
  if (variant === 'B') mug.position.set(0.17, 0, -0.05); else mug.position.set(-0.13, 0, -0.07);
  mug.rotation.y = 0.5; add(mug, 'mug');

  // AA battery lying on the desk
  const battery = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0072, 0.0072, 0.05, 32), new THREE.MeshStandardMaterial({ color: '#18191b', roughness: 0.35, metalness: 0.4 })); shell.castShadow = true;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0073, 0.0073, 0.016, 32), new THREE.MeshStandardMaterial({ color: '#c8822e', roughness: 0.3, metalness: 0.6 })); band.position.y = 0.017;
  const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.002, 16), new THREE.MeshStandardMaterial({ color: '#c9c9c9', metalness: 0.9, roughness: 0.2 })); nub.position.y = 0.026;
  battery.add(shell, band, nub); battery.rotation.z = Math.PI / 2; battery.rotation.y = 0.35; battery.position.set(-0.035, 0.0072, 0.16); add(battery, 'battery');

  // Pothos in a terracotta pot
  const plant = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.08, 40), new THREE.MeshStandardMaterial({ color: '#b5603a', roughness: 0.85 })); pot.position.y = 0.04; pot.castShadow = true;
  const soil = new THREE.Mesh(new THREE.CircleGeometry(0.046, 32), new THREE.MeshStandardMaterial({ color: '#2f2117', roughness: 1 })); soil.rotation.x = -Math.PI / 2; soil.position.y = 0.075;
  plant.add(pot, soil);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.5, side: THREE.DoubleSide });
  let s = 3; const r = () => (s = (s * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), leafMat);
    leaf.scale.set(1, 0.18, 0.62);
    const a = r() * Math.PI * 2; const d = 0.01 + r() * 0.06; const h = 0.085 + r() * 0.09;
    leaf.position.set(Math.cos(a) * d, h, Math.sin(a) * d); leaf.rotation.set(r() - 0.5, a, (r() - 0.5) * 1.2); leaf.castShadow = true;
    plant.add(leaf);
  }
  plant.position.set(0.21, 0, -0.16); add(plant, 'plant');

  // Notebook with a pen
  const notebook = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.016, 0.21), [
    new THREE.MeshStandardMaterial({ color: '#efe9dc' }), new THREE.MeshStandardMaterial({ color: '#efe9dc' }),
    new THREE.MeshStandardMaterial({ color: '#1f3a5f', roughness: 0.55 }), new THREE.MeshStandardMaterial({ color: '#1f3a5f' }),
    new THREE.MeshStandardMaterial({ color: '#efe9dc' }), new THREE.MeshStandardMaterial({ color: '#efe9dc' })]);
  notebook.position.set(-0.2, 0.008, 0.1); notebook.rotation.y = 0.28;
  if (variant !== 'B') add(notebook, 'notebook'); // scene B: the notebook and pen were taken away
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.14, 20), new THREE.MeshStandardMaterial({ color: '#b8b9bd', metalness: 0.8, roughness: 0.25 }));
  pen.rotation.z = Math.PI / 2; pen.rotation.y = 0.9; pen.position.set(-0.19, 0.021, 0.1);
  if (variant !== 'B') add(pen, 'pen');

  // Screwdriver
  const driver = new THREE.Group();
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.011, 0.075, 6), new THREE.MeshStandardMaterial({ color: '#e0761f', roughness: 0.45 })); grip.castShadow = true;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.085, 12), new THREE.MeshStandardMaterial({ color: '#c7c9cc', metalness: 0.95, roughness: 0.18 })); shaft.position.y = 0.08;
  driver.add(grip, shaft); driver.rotation.z = Math.PI / 2; driver.rotation.y = -0.5; driver.position.set(0.12, 0.012, 0.15); add(driver, 'driver');

  if (variant === 'B') {
    const phone = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.008, 0.15), [
      new THREE.MeshStandardMaterial({ color: '#111' }), new THREE.MeshStandardMaterial({ color: '#111' }),
      new THREE.MeshStandardMaterial({ color: '#0b1a2a', roughness: 0.1, metalness: 0.3, emissive: '#10324f', emissiveIntensity: 0.6 }),
      new THREE.MeshStandardMaterial({ color: '#111' }), new THREE.MeshStandardMaterial({ color: '#111' }), new THREE.MeshStandardMaterial({ color: '#111' })]);
    phone.position.set(-0.08, 0.004, -0.05); phone.rotation.y = -0.2; add(phone, 'phone');
  }

  renderer.render(scene, cam);
  // A camera look: slight vignette, sensor noise and a soft warm cast.
  const post = document.getElementById('post'); post.width = width; post.height = height;
  const g = post.getContext('2d', { willReadFrequently: true });
  g.drawImage(gl, 0, 0);
  const img = g.getImageData(0, 0, width, height); const px = img.data;
  let n = 11; const rnd = () => (n = (n * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const dx = x / width - 0.5, dy = y / height - 0.5; const v = 1 - Math.min(0.42, (dx * dx + dy * dy) * 0.95);
    const noise = (rnd() - 0.5) * 7;
    px[i] = Math.max(0, Math.min(255, px[i] * v * 1.02 + noise));
    px[i + 1] = Math.max(0, Math.min(255, px[i + 1] * v + noise));
    px[i + 2] = Math.max(0, Math.min(255, px[i + 2] * v * 0.97 + noise));
  }
  g.putImageData(img, 0, 0);

  // Where each object is in the frame (its visual center), for the mock's pin_labels.
  const point = (obj, dy = 0) => {
    const box = new THREE.Box3().setFromObject(obj); const c = box.getCenter(new THREE.Vector3()); c.y += dy;
    const p = c.project(cam); return { x: Math.round((p.x + 1) / 2 * width), y: Math.round((1 - p.y) / 2 * height) };
  };
  const labels = [
    { text: 'Coffee mug', ...point(objects.mug, 0.01) },
    { text: 'AA battery', ...point(objects.battery) },
    { text: 'Pothos', ...point(objects.plant, 0.03) },
    ...(objects.notebook ? [{ text: 'Notebook', ...point(objects.notebook) }] : []),
    { text: 'Screwdriver', ...point(objects.driver) },
  ];
  if (objects.phone) labels.push({ text: 'Phone', ...point(objects.phone) });

  // I420 for Y4M.
  const Y = new Uint8Array(width * height); const U = new Uint8Array(width * height / 4); const V = new Uint8Array(width * height / 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4; const r0 = px[i], g0 = px[i + 1], b0 = px[i + 2];
    Y[y * width + x] = Math.max(0, Math.min(255, Math.round(0.257 * r0 + 0.504 * g0 + 0.098 * b0 + 16)));
    if ((x & 1) === 0 && (y & 1) === 0) {
      const j = (y / 2) * (width / 2) + x / 2;
      U[j] = Math.max(0, Math.min(255, Math.round(-0.148 * r0 - 0.291 * g0 + 0.439 * b0 + 128)));
      V[j] = Math.max(0, Math.min(255, Math.round(0.439 * r0 - 0.368 * g0 - 0.071 * b0 + 128)));
    }
  }
  const all = new Uint8Array(Y.length + U.length + V.length); all.set(Y, 0); all.set(U, Y.length); all.set(V, Y.length + U.length);
  let bin = ''; for (let i = 0; i < all.length; i += 0x8000) bin += String.fromCharCode.apply(null, all.subarray(i, i + 0x8000));
  renderer.dispose();
  return { i420: btoa(bin), png: post.toDataURL('image/png'), labels };
};
window.ready = true;
</script>`;

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'test', 'artifacts', 'optics-feed');
  const writeFixture = args.includes('--fixture');
  await mkdir(out, { recursive: true });

  const threeFile = path.join(ROOT, 'node_modules', 'three', 'build', 'three.module.js');
  const threeCore = path.join(ROOT, 'node_modules', 'three', 'build', 'three.core.js');
  const server = http.createServer((req, res) => {
    if (req.url === '/three.module.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(threeFile));
    if (req.url === '/three.core.js' && existsSync(threeCore)) return res.writeHead(200, { 'content-type': 'text/javascript' }).end(readFileSync(threeCore));
    res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });

  const renders = {};
  for (const job of [
    { name: 'landscape', width: 1280, height: 720, variant: 'A', portrait: false },
    { name: 'portrait', width: 720, height: 1280, variant: 'A', portrait: true },
    { name: 'landscape-b', width: 1280, height: 720, variant: 'B', portrait: false },
  ]) {
    const t0 = Date.now();
    const r = await page.evaluate((j) => window.render(j), job);
    renders[job.name] = { ...job, ...r };
    await writeFile(path.join(out, `desk-${job.name}.png`), Buffer.from(r.png.split(',')[1], 'base64'));
    console.log(`rendered ${job.name} ${job.width}×${job.height} in ${Date.now() - t0} ms`);
  }
  await browser.close();
  server.close();

  const y4m = (width, height, frames, rate) => {
    const header = Buffer.from(`YUV4MPEG2 W${width} H${height} F${rate} Ip A1:1 C420jpeg\n`, 'ascii');
    const parts = [header];
    for (const f of frames) parts.push(Buffer.from('FRAME\n', 'ascii'), Buffer.from(f, 'base64'));
    return Buffer.concat(parts);
  };
  // Stills: two identical frames at 1 fps (Chromium loops the file).
  await writeFile(path.join(out, 'desk-landscape.y4m'), y4m(1280, 720, [renders.landscape.i420, renders.landscape.i420], '1:1'));
  await writeFile(path.join(out, 'desk-portrait.y4m'), y4m(720, 1280, [renders.portrait.i420, renders.portrait.i420], '1:1'));
  // Watch: scene A for 4 s, then scene B for 4 s.
  const A = renders.landscape.i420;
  const B = renders['landscape-b'].i420;
  await writeFile(path.join(out, 'desk-watch-landscape.y4m'), y4m(1280, 720, [A, A, A, A, B, B, B, B], '1:1'));

  const norm = (r) => ({ width: r.width, height: r.height, labels: r.labels.map((l) => ({ text: l.text, x: +(l.x / r.width).toFixed(4), y: +(l.y / r.height).toFixed(4) })) });
  const fixture = { note: 'Generated by test/e2e/optics-scene.mjs: where each object of the synthetic desk scene sits, as fractions of the frame (x right, y down).', landscape: norm(renders.landscape), portrait: norm(renders.portrait), 'landscape-b': norm(renders['landscape-b']) };
  const json = `${JSON.stringify(fixture, null, 2)}\n`;
  await writeFile(path.join(out, 'optics-scene.json'), json);
  if (writeFixture) await writeFile(path.join(ROOT, 'test', 'mock', 'fixtures', 'optics-scene.json'), json);
  console.log(`wrote ${out}${writeFixture ? ' and test/mock/fixtures/optics-scene.json' : ''}`);
  for (const k of ['landscape', 'portrait']) console.log(k, JSON.stringify(renders[k].labels));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
