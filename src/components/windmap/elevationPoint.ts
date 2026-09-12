/**
 * elevationPoint.ts — client-side point lookup for ground elevation (AMSL).
 *
 * Two-tier strategy:
 *   1. Local-first (fast path): sampleElevationSync reads a decoded terrarium
 *      tile from the in-memory LRU in terrainTiles.ts — zero network cost.
 *      A resident tile is authoritative for BOTH outcomes:
 *        - number → the answer (0–0.1 ms, instant for the user).
 *        - null   → confirmed no-data (ocean / outside dataset).  The server
 *                   samples the exact same terrarium dataset, so a round trip
 *                   would return null too; short-circuiting avoids 465 ms of
 *                   pointless Railway RTT.
 *      undefined means the tile is not yet resident — fall through to tier 2.
 *   2. API fallback (cold path): GET /api/weather/elevation-at — unchanged.
 *      When the tile is not resident, ensureTileFor is fired-and-forgotten to
 *      warm the cache for the next tap, then the API call proceeds immediately
 *      so a cold tap is never slower than the status quo (~465 ms Railway RTT).
 *
 * Module-level caches:
 *   - Result cache keyed on rounded coordinates (4 d.p. ≈ 11 m grid).
 *   - In-flight coalescing: a second tap near the same point while the
 *     first request is pending receives the same promise.
 */

import { sampleElevationSync, ensureTileFor } from "./terrainTiles";

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
 * Fetch ground elevation at (lon, lat), with a local-first fast path.
 *
 * Resolves to null on any network error, non-OK response, or confirmed
 * no-data — never throws.
 */
export function fetchElevationAt(lon: number, lat: number): Promise<number | null> {
  // --- Tier 1: local terrarium tile (fast path) ---
  // A resident tile is authoritative for both number and null.  undefined
  // means the tile is not yet loaded — only then do we fall through to the API.
  const local = sampleElevationSync(lon, lat);
  if (local !== undefined) return Promise.resolve(local);

  // Tile is not resident. Fire-and-forget a background warm so the *next* tap
  // hits the fast path.  ensureTileFor never throws (loadTile is documented as
  // "Never throws" and ensureTileFor wraps it in Promise.all — so a bare void
  // call is safe and needs no .catch()).
  void ensureTileFor(lon, lat);

  // --- Tier 2: API fallback (cold path) — unchanged ---
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
