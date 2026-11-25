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
 *     'kokoro-voices', 'voice-runtime-v1'; names outside jarvis-* so updates keep them). The same
 *     for the opt-in "Hey Jarvis" worker (wake/*.js and its runtime's glue wake/ort/*.mjs; its
 *     models and runtime binary: 'wake-word-v1').
 *   - Everything else (any other same-origin GET) is not intercepted at all.
 *   - On activate, caches of older builds (jarvis-*) are deleted.
 *   - { type: 'SKIP_WAITING' } activates a waiting update; { type: 'GET_VERSION' } replies
 *     { type: 'VERSION', buildId }.
 *   - Home base (v7.6, SPEC §24): a push from the Jarvis Core ({ title, body, url, tag }) is shown as a
 *     notification. Of its url only the home base link is kept (?homebase=job:<id> | briefing |
 *     watch:<id>); tapping the notification focuses Jarvis and hands it the link (a HOMEBASE_LINK
 *     message), or opens Jarvis at it. Never another page.
 */

self.__PRECACHE__ = ["./assets/app.css","./assets/app.js","./assets/chunks/chunk-B55IPOMJ.js","./assets/chunks/chunk-I2T6UIOM.js","./assets/chunks/chunk-KVMUXFPB.js","./assets/chunks/chunk-KVT35Y6D.js","./assets/chunks/chunk-OOWRP336.js","./assets/chunks/hologram-M5RHAZZJ.js","./assets/chunks/node.browser-5YEBY7KY.js","./assets/chunks/node.browser-ORYVMMFZ.js","./assets/chunks/viewer-4THVUPK6.js","./assets/hull-worker.js","./assets/theme-boot.js","./assets/wake-worklet.js","./fonts/OFL-Rajdhani.txt","./fonts/rajdhani-latin-600-normal.woff2","./fonts/rajdhani-latin-700-normal.woff2","./icons/apple-touch-icon.png","./icons/favicon-32.png","./icons/favicon.svg","./icons/icon-192.png","./icons/icon-512.png","./icons/icon-maskable-512.png","./index.html","./manifest.webmanifest"];

const CACHE = 'jarvis-8e3f7a19';
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

// Home base (v7.6): ?homebase=job:<id> | briefing | watch:<id>, the only part of a push's url kept.
const HOME_LINK = /^(?:briefing|(?:job|watch):[A-Za-z0-9_-]{1,80})$/;

function homeBaseLink(url) {
  try {
    const v = new URL(String(url || ''), BASE).searchParams.get('homebase') || '';
    return HOME_LINK.test(v) ? v : '';
  } catch {
    return '';
  }
}

function pushLine(value, max) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// Home base (v7.6): the Jarvis Core's push ({ title, body, url, tag }): research done, a watcher
// fired, the morning briefing. Always shown (iOS ends a subscription that receives silent pushes).
self.addEventListener('push', (event) => {
  let data = null;
  try {
    data = event.data ? event.data.json() : null;
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object') {
    let text = '';
    try {
      text = event.data ? event.data.text() : '';
    } catch {
      text = '';
    }
    data = { body: text };
  }
  const link = homeBaseLink(data.url);
  const tag = pushLine(data.tag, 64).replace(/[^\w:.-]/g, '');
  const options = {
    body: pushLine(data.body, 300),
    icon: new URL('icons/icon-192.png', BASE).href,
    data: { url: link ? `${BASE}?homebase=${link}` : BASE, homebase: link },
    timestamp: Date.now(),
  };
  if (tag) {
    options.tag = `homebase-${tag}`;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(pushLine(data.title, 80) || 'Jarvis', options));
});

// Ambience (SPEC 14.3): tapping a "mission finished" notification focuses Jarvis (or opens it).
// A home base notification (v7.6) also hands Jarvis its link: an open Jarvis gets a HOMEBASE_LINK
// message (it opens the Home base sheet there); otherwise Jarvis opens at ?homebase=<link>.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  const data = event.notification.data;
  const link = data && typeof data.homebase === 'string' && HOME_LINK.test(data.homebase) ? data.homebase : '';
  let target = scope;
  try {
    // Only ever open a page of this app.
    if (link) target = `${scope}?homebase=${link}`;
    else if (data && typeof data.url === 'string' && new URL(data.url, scope).href.startsWith(scope)) target = new URL(data.url, scope).href;
  } catch {
    target = scope;
  }
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (!client.url.startsWith(scope) || !('focus' in client)) continue;
        if (link) {
          try {
            client.postMessage({ type: 'HOMEBASE_LINK', link });
          } catch {
            /* the page reads it from the address next time */
          }
        }
        return client.focus();
      }
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
  if (/^voice\/[\w.-]+\.js$/.test(rel) || /^wake\/(?:ort\/)?[\w.-]+\.m?js$/.test(rel)) event.respondWith(cacheFirst(request, key));
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
