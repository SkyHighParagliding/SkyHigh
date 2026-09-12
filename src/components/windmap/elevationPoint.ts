/**
 * elevationPoint.ts — client-side point lookup for ground elevation (AMSL).
 *
 * Calls GET /api/weather/elevation-at?lat=<n>&lon=<n> and returns the
 * elevation in metres AMSL, or null if unavailable. Failures are silent
 * — the ground readout simply doesn't appear rather than breaking the panel.
 *
 * Module-level caches:
 *   - Result cache keyed on rounded coordinates (4 d.p. ≈ 11 m grid).
 *   - In-flight coalescing: a second tap near the same point while the
 *     first request is pending receives the same promise.
 */

/** Round a coordinate to 4 decimal places for cache key construction. */
function roundCoord(v: number): string {
  return v.toFixed(4);
}

function cacheKey(lon: number, lat: number): string {
  return `${roundCoord(lon)},${roundCoord(lat)}`;
}

// Module-level result cache: key → resolved elevation (or null).
const resultCache = new Map<string, number | null>();

// In-flight coalescing: key → pending promise.
const inFlight = new Map<string, Promise<number | null>>();

/**
 * Fetch ground elevation at (lon, lat) from the server, with caching and
 * in-flight coalescing.
 *
 * Resolves to null on any network error or non-OK response — never throws.
 */
export function fetchElevationAt(lon: number, lat: number): Promise<number | null> {
  const key = cacheKey(lon, lat);

  const cached = resultCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = (async (): Promise<number | null> => {
    try {
      const res = await fetch(
        `/api/weather/elevation-at?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { elevation: number | null };
      return typeof body.elevation === "number" ? body.elevation : null;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  })();

  // Only cache real answers. Caching a null would suppress the ground readout
  // at that point for the rest of the session after one transient failure.
  promise.then(v => { if (v !== null) resultCache.set(key, v); });

  inFlight.set(key, promise);
  return promise;
}
