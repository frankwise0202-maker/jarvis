// Shared harness for the platform and markdown unit tests (node --test).
//
// The modules under test are browser code (DOM, localStorage, IndexedDB, speech, service
// workers), so tests run them in real headless Chromium:
//   1. bundle the module(s) with esbuild into one IIFE that exposes them as window.__mods,
//   2. serve it from a tiny HTTP server on 127.0.0.1 (a real origin: storage and IndexedDB
//      need one), with the app's Content-Security-Policy header so CSP problems surface,
//   3. drive it with Playwright (page.evaluate) in a fresh browser context per test.
//
// This file is named *.test.mjs so it stays inside the platform test namespace. When node
// --test runs it directly it executes a smoke test of the harness itself; when imported by
// another test file it only exports helpers.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The exact CSP from SPEC §2 (served as a header on every test page). */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.anthropic.com; worker-src 'self'; manifest-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'";

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Playwright is installed globally: ESM import may not see it, CommonJS require does (NODE_PATH). */
export async function loadPlaywright() {
  try {
    const mod = await import('playwright');
    return mod.chromium ? mod : mod.default;
  } catch {
    return createRequire(import.meta.url)('playwright');
  }
}

/**
 * Bundle repo modules for the browser. `modules` maps a name to a repo-relative path:
 *   { markdown: 'src/lib/markdown.js' }  ->  window.__mods.markdown
 */
export async function bundle(modules) {
  const esbuild = await import('esbuild');
  const names = Object.keys(modules);
  const lines = names.map((name, i) => `import * as m${i} from ${JSON.stringify('./' + modules[name].replace(/^\.\//, ''))};`);
  lines.push(`window.__mods = { ${names.map((name, i) => `${JSON.stringify(name)}: m${i}`).join(', ')} };`);
  lines.push('window.__ready = true;');
  const result = await esbuild.build({
    stdin: { contents: lines.join('\n'), resolveDir: ROOT, sourcefile: 'harness-entry.js', loader: 'js' },
    bundle: true,
    format: 'iife',
    target: ['es2020', 'safari15'],
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0].text;
}

const PAGE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>harness</title></head><body><main id="root"></main><script src="/bundle.js"></script></body></html>`;

/**
 * Start a local server. Routes map a URL path to a string/Buffer body, an object
 * { body, type, headers, status }, or a handler (req, res). `/` serves the harness page and
 * `/bundle.js` the bundle. `statics` maps a URL prefix to a repo directory.
 */
export async function startServer({ code = '', routes = {}, statics = {} } = {}) {
  const table = { ...routes };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const pathname = decodeURIComponent(url.pathname);
    const send = (status, body, type, headers = {}) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'content-security-policy': CSP, ...headers });
      res.end(body);
    };
    const route = table[pathname];
    if (typeof route === 'function') return route(req, res, url);
    if (route !== undefined) {
      if (typeof route === 'string' || Buffer.isBuffer(route)) return send(200, route, MIME[path.extname(pathname)] || 'text/plain');
      return send(route.status || 200, route.body, route.type || MIME[path.extname(pathname)] || 'text/plain', route.headers);
    }
    if (pathname === '/' || pathname === '/index.html') return send(200, PAGE_HTML, MIME['.html']);
    if (pathname === '/bundle.js') return send(200, code, MIME['.js']);
    for (const prefix of Object.keys(statics)) {
      if (!pathname.startsWith(prefix)) continue;
      const base = path.resolve(ROOT, statics[prefix]);
      const file = path.resolve(base, '.' + pathname.slice(prefix.length - 1));
      if (!file.startsWith(base + path.sep)) return send(403, 'forbidden', 'text/plain');
      try {
        return send(200, fs.readFileSync(file), MIME[path.extname(file)] || 'application/octet-stream');
      } catch {
        break;
      }
    }
    send(404, 'not found', 'text/plain');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const sockets = new Set();
  server.on('connection', (s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  return {
    url: `http://127.0.0.1:${port}`,
    origin: `http://127.0.0.1:${port}`,
    port,
    setRoute(pathname, value) {
      if (value === undefined) delete table[pathname];
      else table[pathname] = value;
    },
    close() {
      for (const s of sockets) s.destroy();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// Records console errors, uncaught page errors and CSP violations for a page.
const WATCH_SCRIPT = `(() => {
  window.__cspViolations = [];
  document.addEventListener('securitypolicyviolation', (e) => {
    window.__cspViolations.push({ directive: e.violatedDirective, blocked: e.blockedURI, sample: e.sample });
  });
})();`;

/**
 * Set up a browser + server for a test file.
 *   const h = await createHarness({ markdown: 'src/lib/markdown.js' });
 *   const page = await h.newPage({ init: () => localStorage.setItem('x', '1') });
 *   await h.close();
 */
export async function createHarness(modules, { routes, statics } = {}) {
  const [{ chromium }, code] = await Promise.all([loadPlaywright(), bundle(modules)]);
  const browser = await chromium.launch();
  const server = await startServer({ code, routes, statics });
  const contexts = new Set();
  return {
    browser,
    server,
    url: server.url,
    /**
     * A fresh context (isolated storage) + page, loaded and ready. `init` runs before any
     * page script (addInitScript); `contextOptions` go to browser.newContext().
     */
    async newPage({ init, initArg, contextOptions, path: pagePath = '/' } = {}) {
      const context = await browser.newContext(contextOptions);
      contexts.add(context);
      const page = await context.newPage();
      const problems = [];
      page.on('pageerror', (err) => problems.push('pageerror: ' + err.message));
      page.on('console', (msg) => {
        if (msg.type() === 'error') problems.push('console.error: ' + msg.text());
      });
      await page.addInitScript(WATCH_SCRIPT);
      if (init) await page.addInitScript(init, initArg);
      await page.goto(server.url + pagePath);
      await page.waitForFunction(() => window.__ready === true);
      page.problems = problems;
      page.cspViolations = () => page.evaluate(() => window.__cspViolations);
      return page;
    },
    async close() {
      for (const c of contexts) await c.close().catch(() => {});
      await browser.close().catch(() => {});
      await server.close();
    },
  };
}

// ---- smoke test of the harness itself (only when this file is the test being run) ----

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  test('harness: bundles a module, serves it on a real origin, storage + IndexedDB work under the CSP', async () => {
    const h = await createHarness({ util: 'src/platform/util.js' });
    try {
      const page = await h.newPage();
      const result = await page.evaluate(async () => {
        localStorage.setItem('k', 'v');
        const idbOk = await new Promise((resolve) => {
          const req = indexedDB.open('harness-check', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('s');
          req.onsuccess = () => {
            req.result.close();
            resolve(true);
          };
          req.onerror = () => resolve(false);
        });
        return { ls: localStorage.getItem('k'), idbOk, hasModule: typeof window.__mods.util.newId, origin: location.origin };
      });
      assert.deepEqual(result, { ls: 'v', idbOk: true, hasModule: 'function', origin: h.url });
      assert.deepEqual(await page.cspViolations(), []);
      assert.deepEqual(page.problems, []);
      // A second context starts with empty storage.
      const fresh = await h.newPage();
      assert.equal(await fresh.evaluate(() => localStorage.getItem('k')), null);
    } finally {
      await h.close();
    }
  });
}
