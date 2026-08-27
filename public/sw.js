const CACHE_NAME = 'carto-tiles-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (!event.request.url.includes('basemaps.cartocdn.com')) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async cache => {
      const cached = await cache.match(event.request, { ignoreVary: true });
      if (cached) return cached;
      try {
        const response = await fetch(event.request.url);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      } catch {
        // Network failed — let the browser display a blank tile rather than
        // breaking the entire canvas render with an opaque network error.
        return new Response('', { status: 503, statusText: 'Tile unavailable' });
      }
    })
  );
});
