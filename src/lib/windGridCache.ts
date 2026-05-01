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

export function prefetchWindGrids(siteIds: string[]) {
  for (const siteId of siteIds) {
    fetchWindGridCached(siteId).catch(() => {});
  }
}
