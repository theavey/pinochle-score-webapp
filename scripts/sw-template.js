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
  const activated = (async () => {
    const old = (await caches.keys()).filter((k) => k.startsWith('pinochle-') && k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    return old.length > 0;
  })();
  event.waitUntil(activated);
  // An older version was installed, so open windows are still running it.
  // Reload them into this version now rather than on some later launch: iOS
  // home-screen apps are usually resumed, not relaunched, so "next launch" can
  // be days away. All app state is saved on every change, so a reload loses
  // nothing. (First install: nothing to reload.)
  // Deliberately not part of waitUntil: the reload's own requests wait for
  // activation to finish, so awaiting it inside activation would deadlock.
  void activated.then(async (updated) => {
    if (!updated) return;
    const windows = await self.clients.matchAll({ type: 'window' });
    for (const client of windows) client.navigate(client.url).catch(() => undefined);
  });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // The sync API must always reach the network (never cached).
  if (url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    // App shell: serve the cached page instantly (works offline at the table).
    // A new deploy arrives via a new sw.js and is used on the next launch.
    event.respondWith(caches.match('./', { ignoreSearch: true }).then((hit) => hit || fetch(req)));
    return;
  }

  event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
