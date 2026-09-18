interface WindGridCacheEntry {
  data: any;
  timestamp: number;
}

const cache = new Map<string, WindGridCacheEntry>();
const pending = new Map<string, Promise<any>>();
const CACHE_TTL = 30 * 60 * 1000;

export async function fetchWindGridCached(siteId: string): Promise<any> {
  const cached = cache.get(siteId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const inflight = pending.get(siteId);
  if (inflight) return inflight;

  const promise = fetch(`/api/weather/${siteId}/wind-particles`)
    .then(async (response) => {
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to load wind data: ${response.status}`);
      }
      const data = await response.json();
      cache.set(siteId, { data, timestamp: Date.now() });
      pending.delete(siteId);
      return data;
    })
    .catch((err) => {
      pending.delete(siteId);
      throw err;
    });

  pending.set(siteId, promise);
  return promise;
}

// Speculative warming of per-site wind caches (used by the Sites list + home
// page so the FIRST site-detail open is instant). This is NOT what the overview
// wind map renders from — the map fetches one combined grid
// (/api/weather/wind-overlay/full). Firing all ~50 per-site fetches at once
// (~6MB) starves that visible fetch on mobile and stalled first paint ~27s.
// So: defer until the browser is idle (after the visible map has had first call
// on the network) and cap concurrency so it drips rather than bursts.
const PREFETCH_CONCURRENCY = 2;

function runPrefetchQueue(queue: string[]) {
  let active = 0;
  const pump = () => {
    while (active < PREFETCH_CONCURRENCY && queue.length > 0) {
      const siteId = queue.shift()!;
      active++;
      fetchWindGridCached(siteId)
        .catch(() => {})
        .finally(() => { active--; pump(); });
    }
  };
  pump();
}

export function prefetchWindGrids(siteIds: string[]) {
  const queue = [...siteIds];
  const start = () => runPrefetchQueue(queue);
  // requestIdleCallback yields to the visible map's fetch/paint first; the
  // setTimeout fallback covers Safari (no rIC on older iOS).
  if (typeof (globalThis as any).requestIdleCallback === 'function') {
    (globalThis as any).requestIdleCallback(start, { timeout: 3000 });
  } else {
    setTimeout(start, 1500);
  }
}
