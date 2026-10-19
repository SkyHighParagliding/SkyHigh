// fallow-ignore-file unused-file — registered at runtime by src/pages/AdminSizzle.tsx, not imported.
//
// Offline shell for the sausage sizzle till, scoped to /admin/sizzle only. It
// sits beside the site-wide /sw.js (scope "/"); the more specific scope wins
// for till pages, so nothing here affects the rest of the site.
//
// Goal: if the iPad refreshes with no signal, the till still loads and stays
// logged in. Sales themselves live in IndexedDB, not here.
//  - Page navigations: network first, cached shell as fallback.
//  - /assets/* (content-hashed, immutable): cache first.
//  - /api/dev-mode, /api/auth/me, /api/csrf-token: network first, last good
//    response as fallback — otherwise AuthContext treats a network error as a
//    bad session and logs the iPad out.
//  - Everything else (/api/sizzle/sync etc.) goes straight to the network.
//
// The site-wide /sw.js deletes unknown caches on activate; it keeps any cache
// whose name starts with "skyhigh-sizzle".

const CACHE = "skyhigh-sizzle-v1";
const SHELL = "/admin/sizzle";
const AUTH_PATHS = ["/api/dev-mode", "/api/auth/me", "/api/csrf-token"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll([SHELL, "/sizzle.webmanifest", "/images/sizzle-icon-192.png"]).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("skyhigh-sizzle") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page posts the URLs it has already loaded (lazy chunks, CSS) so they are
// cached on the first visit, before this worker controlled the page.
self.addEventListener("message", (event) => {
  const urls = event.data && event.data.type === "precache" && Array.isArray(event.data.urls) ? event.data.urls : [];
  if (!urls.length) return;
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(urls.filter((u) => typeof u === "string" && u.startsWith("/")).map((u) => c.add(u).catch(() => {})))
    )
  );
});

async function networkFirst(request, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(cacheKey, res.clone());
    return res;
  } catch {
    const hit = await cache.match(cacheKey);
    if (hit) return hit;
    throw new Error("offline and not cached");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, SHELL));
  } else if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/images/sizzle-icon") || url.pathname === "/sizzle.webmanifest") {
    event.respondWith(cacheFirst(req));
  } else if (AUTH_PATHS.includes(url.pathname)) {
    event.respondWith(networkFirst(req, url.pathname));
  }
});
