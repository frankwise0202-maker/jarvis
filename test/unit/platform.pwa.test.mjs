// Unit tests for env.js, pwa.js, wakelock.js, the manifest, the icons and the service worker
// (SPEC §9.3, §9.4), in real Chromium (see platform.harness.test.mjs).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createHarness, bundle, loadPlaywright, ROOT, CSP } from './platform.harness.test.mjs';

let h;

before(async () => {
  h = await createHarness(
    { env: 'src/platform/env.js', pwa: 'src/platform/pwa.js', wakelock: 'src/platform/wakelock.js' },
    { statics: { '/icons/': 'public/icons/' } },
  );
});

after(async () => {
  if (h) await h.close();
});

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1',
  iphoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
  iphoneEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/131.2903.68 Mobile/15E148 Safari/605.1.15',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101 (iPhone15,2; iOS 18_1; en_US)',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.81 Mobile Safari/537.36',
  androidSamsung: 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 15; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
  androidEdge: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 EdgA/131.0.2903.70',
  androidWebView: 'Mozilla/5.0 (Linux; Android 15; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.6778.81 Mobile Safari/537.36',
  windowsEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.70',
  windowsChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  windowsOpera: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 OPR/115.0.0.0',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:132.0) Gecko/20100101 Firefox/132.0',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  chromeOS: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

// ---- env --------------------------------------------------------------------------------

test('env.parseUserAgent: platform and browser detection, including iPadOS desktop UAs', async () => {
  const page = await h.newPage();
  const r = await page.evaluate((ua) => {
    const { parseUserAgent } = window.__mods.env;
    const out = {};
    for (const [k, v] of Object.entries(ua)) {
      const p = parseUserAgent(v, k === 'ipadDesktop' ? 5 : 0);
      out[k] = `${p.os}/${p.browser}/${p.mobile ? 'm' : 'd'}`;
    }
    const mac = parseUserAgent(ua.ipadDesktop, 0);
    out.macDesktop = `${mac.os}/${mac.browser}/${mac.mobile ? 'm' : 'd'}`;
    const none = parseUserAgent(undefined);
    out.none = `${none.os}/${none.browser}/${none.mobile ? 'm' : 'd'}`;
    return out;
  }, UA);
  assert.deepEqual(r, {
    iphoneSafari: 'ios/safari/m',
    iphoneChrome: 'ios/chrome/m',
    iphoneFirefox: 'ios/firefox/m',
    iphoneEdge: 'ios/edge/m',
    iphoneInstagram: 'ios/other/m',
    ipadDesktop: 'ios/safari/m',
    androidChrome: 'android/chrome/m',
    androidSamsung: 'android/samsung/m',
    androidFirefox: 'android/firefox/m',
    androidEdge: 'android/edge/m',
    androidWebView: 'android/other/m',
    windowsEdge: 'windows/edge/d',
    windowsChrome: 'windows/chrome/d',
    windowsOpera: 'windows/other/d',
    macSafari: 'mac/safari/d',
    macFirefox: 'mac/firefox/d',
    linuxChrome: 'linux/chrome/d',
    chromeOS: 'chromeos/chrome/d',
    macDesktop: 'mac/safari/d',
    none: 'other/other/d',
  });
});

test('env: iPhone and iPad emulation, touch, standalone, reduced motion, online state', async () => {
  const iphone = await h.newPage({ contextOptions: { userAgent: UA.iphoneSafari, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } } });
  assert.deepEqual(
    await iphone.evaluate(() => {
      const e = window.__mods.env;
      return { ios: e.isIOS(), android: e.isAndroid(), touch: e.isTouch(), standalone: e.isStandalone() };
    }),
    { ios: true, android: false, touch: true, standalone: false },
  );
  const ipad = await h.newPage({
    contextOptions: { userAgent: UA.ipadDesktop },
    init: () => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }),
  });
  assert.equal(await ipad.evaluate(() => window.__mods.env.isIOS()), true);

  const desktop = await h.newPage({ contextOptions: { userAgent: UA.windowsChrome } });
  assert.deepEqual(await desktop.evaluate(() => ({ ios: window.__mods.env.isIOS(), touch: window.__mods.env.isTouch() })), { ios: false, touch: false });

  const standalone = await h.newPage({ init: () => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true }) });
  assert.equal(await standalone.evaluate(() => window.__mods.env.isStandalone()), true);

  const page = await h.newPage();
  await page.evaluate(() => {
    window.__online = [];
    window.__motion = [];
    window.__mods.env.onOnlineChange((v) => window.__online.push(v));
    window.__mods.env.onReducedMotionChange((v) => window.__motion.push(v));
  });
  assert.equal(await page.evaluate(() => window.__mods.env.prefersReducedMotion()), false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.context().setOffline(true);
  await page.waitForFunction(() => window.__online.length === 1 && window.__motion.length === 1);
  const mid = await page.evaluate(() => ({ online: window.__mods.env.isOnline(), reduced: window.__mods.env.prefersReducedMotion() }));
  await page.context().setOffline(false);
  await page.waitForFunction(() => window.__online.length === 2);
  assert.deepEqual(mid, { online: false, reduced: true });
  assert.deepEqual(await page.evaluate(() => [window.__online, window.__motion, window.__mods.env.isOnline()]), [[false, true], [true], true]);
});

// ---- install prompt ---------------------------------------------------------------------

const FAKE_PROMPT = (outcome) => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompted = 0;
  e.prompt = async () => {
    e.prompted++;
    if (outcome === 'throw') throw new Error('already used');
  };
  e.userChoice = Promise.resolve({ outcome, platform: 'web' });
  window.__promptEvent = e;
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

test('pwa: install context per platform; beforeinstallprompt is captured and promptInstall resolves outcomes', async () => {
  for (const [ua, expected] of [
    [UA.iphoneSafari, { platform: 'ios', browser: 'safari' }],
    [UA.androidSamsung, { platform: 'android', browser: 'samsung' }],
    [UA.windowsEdge, { platform: 'desktop', browser: 'edge' }],
    [UA.macSafari, { platform: 'desktop', browser: 'safari' }],
  ]) {
    const p = await h.newPage({ contextOptions: { userAgent: ua } });
    assert.deepEqual(await p.evaluate(() => window.__mods.pwa.getInstallContext()), { ...expected, standalone: false, canPrompt: false });
  }

  const page = await h.newPage({ contextOptions: { userAgent: UA.androidChrome } });
  const r = await page.evaluate(async (fake) => {
    const { onInstallAvailable, promptInstall, getInstallContext, onInstalled } = window.__mods.pwa;
    const fire = new Function('outcome', `return (${fake})(outcome)`);
    const seen = [];
    onInstallAvailable((ctx) => seen.push(['early', ctx.canPrompt, ctx.platform]));
    const before = await promptInstall();
    const prevented = fire('accepted');
    const late = [];
    const offLate = onInstallAvailable((ctx) => {
      late.push(ctx.canPrompt); // subscribing after the event still hears about it
      offLate();
    });
    await Promise.resolve();
    const ctx = getInstallContext();
    const accepted = await promptInstall();
    const prompted = window.__promptEvent.prompted;
    const again = await promptInstall();
    fire('dismissed');
    const dismissed = await promptInstall();
    fire('throw');
    const thrown = await promptInstall();
    let installed = 0;
    onInstalled(() => installed++);
    fire('accepted');
    window.dispatchEvent(new Event('appinstalled'));
    return { before, prevented, seen, late, ctx, accepted, prompted, again, dismissed, thrown, installed, after: getInstallContext().canPrompt };
  }, FAKE_PROMPT.toString());
  assert.equal(r.before, 'unavailable');
  assert.equal(r.prevented, true, 'the mini-infobar is suppressed in favour of our Install button');
  assert.deepEqual(r.seen[0], ['early', true, 'android']);
  assert.deepEqual(r.late, [true]);
  assert.equal(r.ctx.canPrompt, true);
  assert.equal(r.accepted, 'accepted');
  assert.equal(r.prompted, 1);
  assert.equal(r.again, 'unavailable');
  assert.equal(r.dismissed, 'dismissed');
  assert.equal(r.thrown, 'unavailable');
  assert.equal(r.installed, 1);
  assert.equal(r.after, false);
});

// ---- wake lock --------------------------------------------------------------------------

const FAKE_WAKELOCK = () => {
  const state = { requests: 0, releases: 0, visible: 'visible', deny: false, delay: 0, current: null };
  Object.defineProperty(document, 'visibilityState', { get: () => state.visible, configurable: true });
  const wakeLock = {
    async request(type) {
      state.requests++;
      if (type !== 'screen') throw new TypeError('bad type');
      if (state.deny) throw new DOMException('denied', 'NotAllowedError');
      if (state.delay) await new Promise((r) => setTimeout(r, state.delay));
      const sentinel = new EventTarget();
      sentinel.released = false;
      sentinel.release = async () => {
        if (sentinel.released) return;
        sentinel.released = true;
        state.releases++;
        sentinel.dispatchEvent(new Event('release'));
      };
      state.current = sentinel;
      return sentinel;
    },
  };
  Object.defineProperty(Navigator.prototype, 'wakeLock', { get: () => wakeLock, configurable: true });
  window.__wl = state;
  window.__hide = () => {
    state.visible = 'hidden';
    if (state.current) {
      // Browsers release wake locks when the page is hidden.
      state.current.released = true;
      state.current.dispatchEvent(new Event('release'));
    }
    document.dispatchEvent(new Event('visibilitychange'));
  };
  window.__show = () => {
    state.visible = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  };
};

test('wakelock: keeps the screen awake, re-acquires after the page is shown again, releases on allowSleep', async () => {
  const page = await h.newPage({ init: FAKE_WAKELOCK });
  const r = await page.evaluate(async () => {
    const { keepAwake, allowSleep, isAwake } = window.__mods.wakelock;
    const tick = () => new Promise((res) => setTimeout(res, 20));
    const out = {};
    out.first = await keepAwake();
    out.awake1 = isAwake();
    out.second = await keepAwake(); // already held: no new request
    out.requests1 = window.__wl.requests;
    window.__hide();
    await tick();
    out.awakeHidden = isAwake();
    window.__show();
    await tick();
    out.requests2 = window.__wl.requests;
    out.awake2 = isAwake();
    allowSleep();
    await tick();
    out.awake3 = isAwake();
    out.releases = window.__wl.releases;
    window.__hide();
    window.__show();
    await tick();
    out.requests3 = window.__wl.requests;
    // allowSleep() while a request is still in flight releases the late lock.
    window.__wl.delay = 30;
    const pending = keepAwake();
    allowSleep();
    out.inflight = await pending;
    await tick();
    out.awake4 = isAwake();
    out.releases2 = window.__wl.releases;
    window.__wl.delay = 0;
    window.__wl.deny = true;
    out.denied = await keepAwake();
    return out;
  });
  assert.deepEqual(r, {
    first: true, awake1: true, second: true, requests1: 1, awakeHidden: false, requests2: 2, awake2: true,
    awake3: false, releases: 1, requests3: 2, inflight: false, awake4: false, releases2: 2, denied: false,
  });
});

test('wakelock: a quiet no-op without the Wake Lock API', async () => {
  const page = await h.newPage({ init: () => Object.defineProperty(Navigator.prototype, 'wakeLock', { get: () => undefined, configurable: true }) });
  const r = await page.evaluate(async () => {
    const { keepAwake, allowSleep, isAwake } = window.__mods.wakelock;
    const res = await keepAwake();
    allowSleep();
    return { res, awake: isAwake() };
  });
  assert.deepEqual(r, { res: false, awake: false });
});

// ---- manifest and icons -----------------------------------------------------------------

function pngInfo(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.subarray(1, 4).toString('latin1'), 'PNG', file);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), colorType: b[25] };
}

test('manifest.webmanifest matches SPEC §9.4 and its icons exist with the declared sizes', () => {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, 'Jarvis');
  assert.equal(m.short_name, 'Jarvis');
  assert.ok(typeof m.description === 'string' && m.description.length > 10);
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.equal(m.orientation, 'any');
  assert.equal(m.background_color, '#04070c');
  assert.equal(m.theme_color, '#04070c');
  assert.deepEqual(
    m.icons.map((i) => [i.src, i.sizes, i.type, i.purpose]),
    [
      ['icons/icon-192.png', '192x192', 'image/png', 'any'],
      ['icons/icon-512.png', '512x512', 'image/png', 'any'],
      ['icons/icon-maskable-512.png', '512x512', 'image/png', 'maskable'],
    ],
  );
  for (const icon of m.icons) {
    const [w, hgt] = icon.sizes.split('x').map(Number);
    const info = pngInfo(path.join(ROOT, 'public', icon.src));
    assert.deepEqual([info.width, info.height], [w, hgt], icon.src);
  }
  assert.deepEqual(Object.values(pngInfo(path.join(ROOT, 'public/icons/apple-touch-icon.png'))).slice(0, 2), [180, 180]);
  assert.deepEqual(Object.values(pngInfo(path.join(ROOT, 'public/icons/favicon-32.png'))).slice(0, 2), [32, 32]);
});

test('icons: opaque where required, transparent tile corners, maskable emblem inside the 80% safe zone', async () => {
  const page = await h.newPage();
  const r = await page.evaluate(async () => {
    const load = (src) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(src));
        img.src = src;
      });
    const pixels = async (src) => {
      const img = await load(src);
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return { w: c.width, data: ctx.getImageData(0, 0, c.width, c.height).data };
    };
    const minAlpha = ({ data }) => {
      let m = 255;
      for (let i = 3; i < data.length; i += 4) m = Math.min(m, data[i]);
      return m;
    };
    const out = {};
    out.appleMinAlpha = minAlpha(await pixels('/icons/apple-touch-icon.png'));
    const mask = await pixels('/icons/icon-maskable-512.png');
    out.maskMinAlpha = minAlpha(mask);
    // Outside the safe-zone circle (radius 40% of the size) only dark background may remain.
    let brightOutside = 0;
    let brightInside = 0;
    const w = mask.w;
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = 0.2126 * mask.data[i] + 0.7152 * mask.data[i + 1] + 0.0722 * mask.data[i + 2];
        const d = Math.hypot(x + 0.5 - w / 2, y + 0.5 - w / 2);
        if (lum > 60) {
          if (d > 0.4 * w) brightOutside++;
          else brightInside++;
        }
      }
    }
    out.brightOutside = brightOutside;
    out.brightInside = brightInside;
    for (const name of ['icon-192', 'icon-512', 'favicon-32']) {
      const p = await pixels(`/icons/${name}.png`);
      out[name] = { corner: p.data[3], center: p.data[((p.w / 2) * p.w + p.w / 2) * 4 + 3] };
    }
    const svg = await load('/icons/favicon.svg');
    out.svg = svg.naturalWidth > 0;
    return out;
  });
  assert.equal(r.appleMinAlpha, 255, 'apple-touch-icon must be opaque');
  assert.equal(r.maskMinAlpha, 255, 'maskable icon must be full-bleed');
  assert.equal(r.brightOutside, 0, 'nothing bright outside the maskable safe zone');
  assert.ok(r.brightInside > 5000, 'the emblem is there');
  for (const name of ['icon-192', 'icon-512', 'favicon-32']) {
    assert.equal(r[name].corner, 0, `${name} corners are transparent`);
    assert.equal(r[name].center, 255, `${name} centre is opaque`);
  }
  assert.equal(r.svg, true);
  const svgText = fs.readFileSync(path.join(ROOT, 'public/icons/favicon.svg'), 'utf8');
  assert.match(svgText, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 512 512">/);
  assert.equal(/<script|href=|url\((?!#)|@import/i.test(svgText), false, 'favicon.svg is self-contained');
});

// ---- service worker (real) --------------------------------------------------------------

/** A miniature built site under /jarvis/ whose app script is the pwa.js bundle. */
async function startSite(extraConnect) {
  // The app's CSP, plus the second local origin used to prove cross-origin calls bypass the worker.
  const csp = CSP.replace("connect-src 'self'", `connect-src 'self' ${extraConnect}`);
  const code = await bundle({ pwa: 'src/platform/pwa.js' });
  const swSource = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(ROOT, 'public/manifest.webmanifest'));
  const icon = fs.readFileSync(path.join(ROOT, 'public/icons/icon-192.png'));
  const state = { build: 'build001', offline: false, hits: {} };
  const precache = ['index.html', 'assets/app.js', 'assets/app.css', 'manifest.webmanifest', 'icons/icon-192.png', '.nojekyll', 'assets/app.js.map'];
  const index = (b) =>
    `<!doctype html><html><head><meta charset="utf-8"><link rel="manifest" href="./manifest.webmanifest"><link rel="stylesheet" href="./assets/app.css?v=${b}"><title>Jarvis</title></head>` +
    `<body><main id="marker">shell ${b}</main><script src="./assets/app.js?v=${b}"></script></body></html>`;
  const server = http.createServer((req, res) => {
    if (state.offline) return req.socket.destroy();
    const url = new URL(req.url, 'http://x');
    const key = `${req.method} ${url.pathname}${url.search}`;
    state.hits[key] = (state.hits[key] || 0) + 1;
    const send = (status, body, type) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': csp, 'access-control-allow-origin': '*' });
      res.end(body);
    };
    switch (url.pathname) {
      case '/jarvis/':
      case '/jarvis/index.html':
        return send(200, index(state.build), 'text/html; charset=utf-8');
      case '/jarvis/assets/app.js':
        return send(200, code, 'text/javascript');
      case '/jarvis/assets/app.css':
        return send(200, `body{background:#04070c} /* ${state.build} */`, 'text/css');
      case '/jarvis/manifest.webmanifest':
        return send(200, manifest, 'application/manifest+json');
      case '/jarvis/icons/icon-192.png':
        return send(200, icon, 'image/png');
      case '/jarvis/sw.js':
        return send(200, swSource.replace('/*__PRECACHE__*/[]', JSON.stringify(precache)).replaceAll('__BUILD_ID__', state.build), 'text/javascript');
      case '/jarvis/dynamic.txt':
        return send(200, `dynamic ${state.hits[key]}`, 'text/plain');
      case '/jarvis/api':
        return send(200, `${req.method} handled by server`, 'text/plain');
      default:
        return send(404, 'not found', 'text/plain');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { state, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

async function startCrossOrigin() {
  const hits = [];
  const server = http.createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': '*' });
    res.end('cross-origin');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { hits, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((resolve) => server.close(resolve)) };
}

test('service worker: precache, cache-first vs untouched requests, offline shell, update via SKIP_WAITING', async () => {
  const remote = await startCrossOrigin();
  const site = await startSite(remote.origin);
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(site.origin + '/jarvis/');
    await page.waitForFunction(() => window.__ready === true);

    // Register through pwa.js and wait until the worker controls the page (clients.claim).
    const scope = await page.evaluate(async () => {
      const reg = await window.__mods.pwa.registerServiceWorker({
        onUpdateReady: (apply) => {
          window.__apply = apply;
        },
      });
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
      return reg.scope;
    });
    assert.equal(scope, site.origin + '/jarvis/');
    const cached = await page.evaluate(async () => ({
      names: await caches.keys(),
      urls: (await (await caches.open('jarvis-build001')).keys()).map((r) => new URL(r.url).pathname).sort(),
    }));
    assert.deepEqual(cached.names, ['jarvis-build001']);
    assert.deepEqual(cached.urls, ['/jarvis/assets/app.css', '/jarvis/assets/app.js', '/jarvis/icons/icon-192.png', '/jarvis/index.html', '/jarvis/manifest.webmanifest']);

    // Which responses came from the worker?
    const fromSw = {};
    page.on('response', (resp) => {
      fromSw[`${resp.request().method()} ${resp.url()}`] = resp.fromServiceWorker();
    });
    const appHits = site.state.hits['GET /jarvis/assets/app.js?v=build001'];
    assert.equal(appHits, 1, 'loaded once by the first page view, before the worker existed');
    const results = await page.evaluate(async (remoteOrigin) => {
      const text = async (p) => (await p).text();
      return {
        cachedAsset: (await text(fetch('./assets/app.js?v=build001'))).length > 1000,
        otherBuild: (await text(fetch('./assets/app.js?v=build999'))).length > 1000,
        dynamic1: await text(fetch('./dynamic.txt')),
        dynamic2: await text(fetch('./dynamic.txt')),
        post: await text(fetch('./api', { method: 'POST', body: 'x' })),
        cross: await text(fetch(remoteOrigin + '/v1/messages', { method: 'POST', body: '{}' })),
        crossGet: await text(fetch(remoteOrigin + '/thing')),
      };
    }, remote.origin);
    assert.deepEqual(results, { cachedAsset: true, otherBuild: true, dynamic1: 'dynamic 1', dynamic2: 'dynamic 2', post: 'POST handled by server', cross: 'cross-origin', crossGet: 'cross-origin' });
    assert.equal(site.state.hits['GET /jarvis/assets/app.js?v=build001'], appHits, 'the precached asset did not hit the network again');
    assert.equal(site.state.hits['GET /jarvis/assets/app.js?v=build999'], 1, "another build's file goes to the network");
    assert.equal(fromSw[`GET ${site.origin}/jarvis/assets/app.js?v=build001`], true, 'precached asset served by the worker');
    assert.equal(fromSw[`POST ${site.origin}/jarvis/api`], false, 'POST is never intercepted');
    assert.equal(fromSw[`POST ${remote.origin}/v1/messages`], false, 'cross-origin API calls are never intercepted');
    assert.equal(fromSw[`GET ${remote.origin}/thing`], false, 'cross-origin GETs are never intercepted');
    assert.equal(fromSw[`GET ${site.origin}/jarvis/dynamic.txt`], false, 'non-precached same-origin GETs are not intercepted');
    assert.deepEqual(remote.hits, ['POST /v1/messages', 'GET /thing']);

    // Offline: the navigation falls back to the cached shell, assets come from the cache.
    site.state.offline = true;
    await page.reload();
    await page.waitForFunction(() => window.__ready === true);
    assert.equal(await page.textContent('#marker'), 'shell build001');

    // A new build: the waiting worker is announced, apply() switches and reloads.
    site.state.offline = false;
    site.state.build = 'build002';
    await page.evaluate(async () => {
      await window.__mods.pwa.registerServiceWorker({
        onUpdateReady: (apply) => {
          window.__apply = apply;
        },
      });
      const reg = await navigator.serviceWorker.getRegistration();
      await reg.update();
    });
    await page.waitForFunction(() => typeof window.__apply === 'function', null, { timeout: 15000 });
    await Promise.all([page.waitForEvent('load', { timeout: 15000 }), page.evaluate(() => window.__apply())]);
    await page.waitForFunction(() => window.__ready === true);
    assert.equal(await page.textContent('#marker'), 'shell build002');
    const after = await page.evaluate(async () => {
      for (let i = 0; i < 50 && (await caches.keys()).includes('jarvis-build001'); i++) await new Promise((r) => setTimeout(r, 50));
      return { names: await caches.keys(), controller: new URL(navigator.serviceWorker.controller.scriptURL).pathname };
    });
    assert.deepEqual(after, { names: ['jarvis-build002'], controller: '/jarvis/sw.js' });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await site.close();
    await remote.close();
  }
});

test('service worker: registration is skipped without a secure context or service worker support', async () => {
  const page = await h.newPage({ init: () => Object.defineProperty(Navigator.prototype, 'serviceWorker', { get: () => undefined, configurable: true }) });
  assert.equal(await page.evaluate(() => window.__mods.pwa.registerServiceWorker({ onUpdateReady() {} })), null);
});
