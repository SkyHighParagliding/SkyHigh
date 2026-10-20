import { useEffect } from "react";

/** Offline shell: register the till's scoped worker and hand it what this page already loaded. */
export function useTillServiceWorker(scope = "/admin/sizzle") {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sizzle-sw.js", { scope })
      .then(async (reg) => {
        await navigator.serviceWorker.ready;
        const urls = performance
          .getEntriesByType("resource")
          .map((e) => new URL(e.name))
          .filter((u) => u.origin === location.origin && u.pathname.startsWith("/assets/"))
          .map((u) => u.pathname);
        (reg.active ?? reg.waiting ?? reg.installing)?.postMessage({ type: "precache", urls });
      })
      .catch((err) => console.warn("[sizzle] service worker registration failed", err));
  }, [scope]);
}
