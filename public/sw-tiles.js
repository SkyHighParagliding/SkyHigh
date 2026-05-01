const TILE_CACHE = "skyhigh-offline-tiles";

const TILE_DOMAINS = [
  "tile.openstreetmap.org",
  "tile.opentopomap.org",
  "server.arcgisonline.com",
];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isTile = TILE_DOMAINS.some((d) => url.hostname.includes(d));
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
