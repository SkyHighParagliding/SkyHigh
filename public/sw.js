// CARTO CDN tiles are blocked by CARTO's CORS policy when fetched via the
// Fetch API (Sec-Fetch-Dest: empty). They only load correctly as native
// <img> elements (Sec-Fetch-Dest: image). Attempting to intercept and
// re-fetch them from SW context always fails, leaving the cache empty and
// returning synthetic 503s that break the basemap.
//
// This SW stays registered (so the old carto-tiles-v1 cache gets cleaned up)
// but does not intercept any fetch requests. WindCanvas has its own in-memory
// tile cache that handles within-session caching.

const CACHE_NAME = 'carto-tiles-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
