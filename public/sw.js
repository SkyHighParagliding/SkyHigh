// fallow-ignore-file unused-file — registered at runtime via navigator.serviceWorker.register('/sw.js'), not imported.
//
// SINGLE "/"-scope service worker for SkyHigh. This file previously coexisted
// with a second worker (public/sw-tiles.js) also registered at "/" scope; a
// scope holds only one registration, so whichever registered last won and the
// two fought — sw.js (no fetch handler, wiped every cache on activate) would
// clobber the offline tile cache that sw-tiles.js and the prefetch built. The
// two are now consolidated here and sw-tiles.js is gone.
//
// Responsibilities:
//  1. Cache map tiles (OSM / OpenTopoMap / ArcGIS + AWS terrarium elevation)
//     so the flight-tracker offline prefetch (src/lib/tileCache.ts writes the
//     same TILE_CACHE directly) and in-session panning are served from cache.
//  2. Clean up the obsolete carto-tiles-v1 cache from the old basemap SW,
//     WITHOUT touching the offline tile cache.
//
// CARTO CAVEAT — do NOT intercept CARTO CDN tiles here. CARTO's CORS policy
// blocks them when fetched via the Fetch API (Sec-Fetch-Dest: empty); they only
// load as native <img> elements (Sec-Fetch-Dest: image). The predicate below is
// deliberately narrow and excludes CARTO for exactly this reason. WindCanvas has
// its own in-memory tile cache for the CARTO basemap.

const TILE_CACHE = "skyhigh-offline-tiles";

// Caches to preserve on activate. Everything else (e.g. the legacy
// carto-tiles-v1 basemap cache) is deleted.
const KEEP_CACHES = [TILE_CACHE];

const TILE_DOMAINS = [
  "tile.openstreetmap.org",
  "tile.opentopomap.org",
  "server.arcgisonline.com",
];

// Narrow predicate for AWS terrarium elevation tiles. We deliberately do NOT
// add "s3.amazonaws.com" to TILE_DOMAINS — that would be far too broad and
// would intercept unrelated S3 traffic. Instead we match the specific bucket
// path. To add a self-hosted mirror, duplicate this check with its hostname
// and path prefix.
//
// NOTE: this cache is currently unbounded. Eviction strategy is a known,
// deliberate follow-up — do not add one here.
function isTerrainTile(url) {
  return (
    url.hostname === "s3.amazonaws.com" &&
    url.pathname.startsWith("/elevation-tiles-prod/")
  );
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !KEEP_CACHES.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isTile = TILE_DOMAINS.some((d) => url.hostname.includes(d)) || isTerrainTile(url);
  if (!isTile) return;

  event.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      try {
        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      } catch {
        return new Response("", { status: 503, statusText: "Offline" });
      }
    })
  );
});
