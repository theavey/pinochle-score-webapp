/* Service worker: offline app shell. Generated into dist/sw.js at build time. */
const VERSION = __CACHE_VERSION__;
const PRECACHE = __PRECACHE__;
const CACHE = `pinochle-${VERSION}`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('pinochle-') && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // App shell: serve the cached page instantly (works offline at the table).
    // A new deploy arrives via a new sw.js and is used on the next launch.
    event.respondWith(caches.match('./', { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
