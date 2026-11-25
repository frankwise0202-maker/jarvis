// Jarvis Core dashboard service worker: keeps the page itself (HTML, styles, scripts, fonts)
// available when the Core is restarting, so a kiosk that reloads at that moment shows the
// dashboard with "Connecting to the Core…" instead of a browser error page, and reconnects by
// itself. Network first: whenever the Core answers, the fresh files are used (and cached). The API
// is never touched: live data always comes from the Core or not at all.

const CACHE = 'jarvis-core-shell-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.slice(scope.pathname.length);
  if (rel.startsWith('api/') || rel.startsWith('__')) return; // live data: never cached
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      // The page is one entry whatever its query string (kiosk settings ride in it).
      const key = rel === '' || rel === 'index.html' ? new URL('./', scope).href : url.origin + url.pathname;
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res.ok && res.type === 'basic') await cache.put(key, res.clone());
        return res;
      } catch (err) {
        const hit = await cache.match(key);
        if (hit) return hit;
        throw err;
      }
    })(),
  );
});
