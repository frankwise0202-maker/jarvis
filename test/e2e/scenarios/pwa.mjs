// PWA: index.html head (CSP, iOS meta), manifest + icons, service worker, offline reload.

export const SPEC_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://upload.wikimedia.org; font-src 'self'; connect-src 'self' https://api.anthropic.com https://commons.wikimedia.org; worker-src 'self'; manifest-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b)) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export default [
  {
    name: 'pwa',
    title: 'PWA: head tags + CSP, valid manifest and icons, service worker registers, offline reload shows the shell',
    device: 'desktop',
    timeout: 90000,
    // While offline, failed network attempts and the SW update check are expected to log errors.
    allowConsole: [/ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED|Failed to load resource/, /Failed to update a ServiceWorker|An unknown error occurred when fetching the script/],
    async run(t) {
      const srv = await t.startExtraServer(); // shut down later to go truly offline
      const page = await t.newPage({ serverUrl: srv.url });
      await t.goto('/', { serverUrl: srv.url });
      const req = page.context().request;
      const abs = (href) => new URL(href, `${srv.url}/`).href;
      let manifestHref = '';

      await t.step('index.html head', async () => {
        const head = await page.evaluate(() => {
          const meta = (sel) => document.querySelector(sel)?.getAttribute('content') ?? null;
          return {
            csp: meta('meta[http-equiv="Content-Security-Policy"]'),
            viewport: meta('meta[name="viewport"]'),
            theme: meta('meta[name="theme-color"]'),
            capable: meta('meta[name="apple-mobile-web-app-capable"]'),
            statusBar: meta('meta[name="apple-mobile-web-app-status-bar-style"]'),
            appTitle: meta('meta[name="apple-mobile-web-app-title"]'),
            touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href') ?? null,
            manifest: document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
            script: document.querySelector('script[type="module"][src*="assets/app.js"]')?.getAttribute('src') ?? null,
            css: document.querySelector('link[rel="stylesheet"][href*="assets/app.css"]')?.getAttribute('href') ?? null,
          };
        });
        t.assert(head.csp === SPEC_CSP, `The CSP meta tag must equal SPEC §2 exactly; got: ${head.csp}`);
        t.assert(/viewport-fit=cover/.test(head.viewport || ''), 'viewport meta needs viewport-fit=cover');
        t.assert(head.theme, 'theme-color meta is missing');
        t.assert(head.capable === 'yes', 'apple-mobile-web-app-capable should be "yes"');
        t.assert(head.statusBar === 'black-translucent', 'apple-mobile-web-app-status-bar-style should be black-translucent');
        t.assert(head.appTitle, 'apple-mobile-web-app-title is missing');
        t.assert(/^\.\/assets\/app\.js\?v=[0-9a-f]{8}$/.test(head.script || ''), `app.js should be referenced relatively with the build id (got ${head.script})`);
        t.assert(/^\.\/assets\/app\.css\?v=[0-9a-f]{8}$/.test(head.css || ''), `app.css should be referenced relatively with the build id (got ${head.css})`);
        t.assert(head.manifest && !/^(https?:)?\/\//.test(head.manifest), 'The manifest link should be relative');
        t.assert(head.touchIcon, 'apple-touch-icon link is missing');
        const touch = await req.get(abs(head.touchIcon));
        const size = touch.ok() ? pngSize(await touch.body()) : null;
        t.assert(size && size.width === 180 && size.height === 180, `apple-touch-icon should be a 180×180 PNG (got ${touch.status()} ${JSON.stringify(size)})`);
        manifestHref = head.manifest;
      });

      await t.step('manifest and icons (SPEC §9.4)', async () => {
        const res = await req.get(abs(manifestHref));
        t.assert(res.ok(), `The manifest should be fetchable (HTTP ${res.status()})`);
        t.assert(/manifest\+json|application\/json/.test(res.headers()['content-type'] || ''), `Unexpected manifest content-type ${res.headers()['content-type']}`);
        let m;
        try {
          m = JSON.parse(await res.text());
        } catch {
          throw new Error('The manifest is not valid JSON');
        }
        const expect = { name: 'Jarvis', short_name: 'Jarvis', start_url: './', scope: './', display: 'standalone', background_color: '#04070c', theme_color: '#04070c' };
        for (const [k, v] of Object.entries(expect)) t.assert(m[k] === v, `manifest.${k} should be ${JSON.stringify(v)} (got ${JSON.stringify(m[k])})`);
        t.assert(Array.isArray(m.icons) && m.icons.length >= 3, 'manifest.icons needs the 192, 512 and maskable 512 icons');
        const want = [['192x192', false], ['512x512', false], ['512x512', true]];
        for (const [sizes, maskable] of want) {
          const icon = m.icons.find((i) => i.sizes === sizes && /maskable/.test(i.purpose || '') === maskable);
          t.assert(icon, `manifest icon ${sizes}${maskable ? ' (maskable)' : ''} is missing`);
          const r = await req.get(new URL(icon.src, abs(manifestHref)).href);
          const dim = r.ok() ? pngSize(await r.body()) : null;
          const [w, h] = sizes.split('x').map(Number);
          t.assert(dim && dim.width === w && dim.height === h, `Icon ${icon.src} should be a ${sizes} PNG (got HTTP ${r.status()}, ${JSON.stringify(dim)})`);
        }
      });

      await t.step('built service worker', async () => {
        const res = await req.get(abs('./sw.js'));
        t.assert(res.ok(), 'sw.js should be served');
        const sw = await res.text();
        t.assert(!sw.includes('__BUILD_ID__') && !sw.includes('/*__PRECACHE__*/'), 'The build should have replaced the sw.js placeholders');
        t.assert(sw.includes('./index.html') && sw.includes('./assets/app.js'), 'The precache list should include index.html and app.js');
      });

      await t.step('service worker registers and controls the page', async () => {
        const reg = await page.evaluate(() =>
          Promise.race([
            navigator.serviceWorker.ready.then((r) => ({ scope: r.scope, active: !!r.active })),
            new Promise((resolve) => setTimeout(() => resolve(null), 20000)),
          ]),
        );
        t.assert(reg && reg.active, 'A service worker should register and activate within 20 s');
        await t.waitFor(() => page.evaluate(async () => {
          const keys = (await caches.keys()).filter((k) => k.startsWith('jarvis-'));
          if (!keys.length) return false;
          const cache = await caches.open(keys[0]);
          return (await cache.keys()).length > 0;
        }), { timeout: 20000, message: 'the precache (a jarvis-* cache with entries)' });
        await t.reload(page);
        const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
        t.assert(controlled, 'After a reload the page should be controlled by the service worker');
      });

      await t.step('offline reload shows the app shell', async () => {
        await srv.close(); // the server is gone: only the service worker can answer now
        await page.context().setOffline(true);
        try {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
        } catch (err) {
          throw new Error(`Offline reload failed (the service worker did not serve the shell): ${err.message.split('\n')[0]}`);
        }
        await t.waitReady(page);
        await t.visible('composer-input', { page, message: 'The composer should render offline' });
        await t.visible('banner-offline', { page, timeout: 8000, message: 'The offline banner should show while offline' });
        await t.screenshot('offline-shell', page);
        await page.context().setOffline(false);
      });
    },
  },
];

