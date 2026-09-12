// fallow-ignore-file unused-file
const TILE_CACHE = "skyhigh-offline-tiles";

const TILE_DOMAINS = [
  "tile.openstreetmap.org",
  "tile.opentopomap.org",
  "server.arcgisonline.com",
];

// Narrow predicate for AWS terrarium elevation tiles.  We deliberately do NOT
// add "s3.amazonaws.com" to TILE_DOMAINS — that would be far too broad and
// would intercept unrelated S3 traffic.  Instead we match the specific bucket
// path.  To add a self-hosted mirror, duplicate this check with its hostname
// and path prefix.
//
// SCOPE CAVEAT — read before relying on this.  This worker is only registered by
// src/hooks/useXCMapState.ts (the XC map), whereas src/main.tsx registers
// public/sw.js at the same "/" scope.  A scope holds one registration, so
// whichever registered last wins: on a normal site page the controller is sw.js,
// which has no fetch handler at all, so terrain tiles are NOT persisted there.
// Worse, sw.js's activate handler deletes every cache, so it wipes this one when
// it takes over.  Terrain tiles therefore still re-download once per session on
// most pages.  That is survivable — the in-memory LRU in terrainTiles.ts plus the
// map-centre prefetch already remove the tap latency — but consolidating the two
// workers is a known follow-up.
//
// NOTE: this cache is currently unbounded (identical to the basemap cache above).
// Eviction strategy is a known, deliberate follow-up — do not add one here.
function isTerrainTile(url) {
  return (
    url.hostname === "s3.amazonaws.com" &&
    url.pathname.startsWith("/elevation-tiles-prod/")
  );
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
