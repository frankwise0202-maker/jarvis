/* Jarvis service worker (SPEC §9.4): an offline-capable app shell.
 *
 * The build replaces the two placeholders: the precache list (relative URLs of the built files)
 * and the build id inside the cache name.
 *
 *   - Never touches non-GET or cross-origin requests: Claude API calls go straight to the network.
 *   - Navigations: network first (navigation preload where supported); when offline, slow
 *     (> 4 s) or answered with an error, the cached index.html of this build is served.
 *   - Same-origin GETs of precached files: cache first. A versioned URL from a different build
 *     (?v=<other id>) is left to the network, so old and new files are never mixed.
 *   - The opt-in natural voice's worker script (voice/*.js, not precached): cache first in this
 *     build's cache, filled the first time it loads, so the voice also works offline. Its big
 *     files (model, runtime) are cached by the worker itself (Cache Storage 'transformers-cache',
 *     'kokoro-voices', 'voice-runtime-v1'; names outside jarvis-* so updates keep them).
 *   - Everything else (any other same-origin GET) is not intercepted at all.
 *   - On activate, caches of older builds (jarvis-*) are deleted.
 *   - { type: 'SKIP_WAITING' } activates a waiting update; { type: 'GET_VERSION' } replies
 *     { type: 'VERSION', buildId }.
 */

self.__PRECACHE__ = ["./assets/app.css","./assets/app.js","./assets/chunks/chunk-7TFBJGWZ.js","./assets/chunks/chunk-B55IPOMJ.js","./assets/chunks/chunk-KVMUXFPB.js","./assets/chunks/chunk-OOWRP336.js","./assets/chunks/chunk-QIGXMQTC.js","./assets/chunks/hologram-3RXRFO26.js","./assets/chunks/node.browser-5YEBY7KY.js","./assets/chunks/node.browser-ORYVMMFZ.js","./assets/chunks/viewer-UUBP7EUB.js","./assets/theme-boot.js","./fonts/OFL-Rajdhani.txt","./fonts/rajdhani-latin-600-normal.woff2","./fonts/rajdhani-latin-700-normal.woff2","./icons/apple-touch-icon.png","./icons/favicon-32.png","./icons/favicon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./index.html","./manifest.webmanifest"];

const CACHE = 'jarvis-bb0de23b';
const BUILD_ID = CACHE.slice('jarvis-'.length);
const BASE = new URL('./', self.location.href).href;
const SHELL = new URL('index.html', BASE).href;
const NAV_TIMEOUT_MS = 4000;

/** Absolute, de-duplicated precache URLs (no source maps, no sw.js, no dotfiles like .nojekyll). */
function precacheUrls() {
  const list = Array.isArray(self.__PRECACHE__) ? self.__PRECACHE__ : [];
  const out = new Set();
  for (const entry of list) {
    if (typeof entry !== 'string' || !entry) continue;
    let url;
    try {
      url = new URL(entry, BASE);
    } catch {
      continue;
    }
    if (url.origin !== self.location.origin || !url.href.startsWith(BASE)) continue;
    const rel = url.pathname.slice(new URL(BASE).pathname.length);
    if (/\.map$/i.test(rel) || rel === 'sw.js' || rel.split('/').some((part) => part.startsWith('.'))) continue;
    out.add(url.origin + url.pathname);
  }
  out.add(SHELL);
  return Array.from(out);
}

let precached = null;
function isPrecached(key) {
  if (!precached) precached = new Set(precacheUrls());
  return precached.has(key);
}

function isEssential(url) {
  const rel = url.slice(BASE.length);
  return url === SHELL || rel.startsWith('assets/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const urls = precacheUrls();
      // The shell and its scripts/styles must all arrive, or this version does not install
      // (the previous version keeps serving). Icons and the manifest are best effort.
      await cache.addAll(urls.filter(isEssential).map((u) => new Request(u, { cache: 'reload' })));
      await Promise.all(
        urls
          .filter((u) => !isEssential(u))
          .map(async (u) => {
            try {
              const response = await fetch(new Request(u, { cache: 'reload' }));
              if (response.ok) await cache.put(u, response);
            } catch {
              /* optional file */
            }
          }),
      );
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name.startsWith('jarvis-') && name !== CACHE).map((name) => caches.delete(name)));
      try {
        if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      } catch {
        /* unsupported */
      }
      await self.clients.claim();
    })(),
  );
});

// Ambience (SPEC 14.3): tapping a "mission finished" notification focuses Jarvis (or opens it).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const data = event.notification.data;
  let target = scope;
  try {
    // Only ever open a page of this app.
    if (data && typeof data.url === 'string' && new URL(data.url, scope).href.startsWith(scope)) target = new URL(data.url, scope).href;
  } catch {
    target = scope;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) if (client.url.startsWith(scope) && 'focus' in client) return client.focus();
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    }),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data.type === 'GET_VERSION') {
    const reply = { type: 'VERSION', buildId: BUILD_ID };
    if (event.ports && event.ports[0]) event.ports[0].postMessage(reply);
    else if (event.source) event.source.postMessage(reply);
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // POST /v1/messages etc.: untouched
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // cross-origin (the Claude API): untouched
  if (request.headers.has('range')) return;
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') return;

  if (request.mode === 'navigate') {
    event.respondWith(navigate(event));
    return;
  }
  const version = url.searchParams.get('v');
  if (version && version !== BUILD_ID) return; // another build's file: let the network answer
  const key = url.origin + url.pathname;
  if (isPrecached(key)) {
    event.respondWith(cacheFirst(request, key));
    return;
  }
  const rel = url.href.startsWith(BASE) ? url.pathname.slice(new URL(BASE).pathname.length) : '';
  if (/^voice\/[\w.-]+\.js$/.test(rel)) event.respondWith(cacheFirst(request, key));
});

async function cacheFirst(request, key) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetch(request);
  // Repair an evicted entry. (Requests from other builds never get here, see the fetch handler.)
  if (response.ok && response.type === 'basic') cache.put(key, response.clone()).catch(() => {});
  return response;
}

async function cachedShell() {
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match(SHELL)) || (await cache.match(BASE)) || null;
  } catch {
    return null;
  }
}

async function navigate(event) {
  const network = (async () => {
    let preloaded;
    try {
      preloaded = event.preloadResponse ? await event.preloadResponse : undefined;
    } catch {
      preloaded = undefined;
    }
    return preloaded || fetch(event.request);
  })();
  const shell = await cachedShell();
  if (!shell) return network; // nothing to fall back to: plain network behavior
  try {
    const response = await withTimeout(network, NAV_TIMEOUT_MS);
    return response.ok || response.type === 'opaqueredirect' ? response : shell;
  } catch {
    network.catch(() => {}); // offline or too slow: the cached shell answers
    return shell;
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
