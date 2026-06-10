import createLogger from "./logger.js";

const log = createLogger("osrm");

export interface OSRMRouteResult {
  distanceKm: number;
  durationMin: number;
}

const osrmCache = new Map<string, { result: OSRMRouteResult; expiry: number }>();
const inFlightRequests = new Map<string, Promise<OSRMRouteResult | null>>();
const CACHE_TTL_MS = 30_000;

function cacheKey(from: { lat: number; lon: number }, to: { lat: number; lon: number }): string {
  return `${from.lat.toFixed(4)},${from.lon.toFixed(4)}->${to.lat.toFixed(4)},${to.lon.toFixed(4)}`;
}

function pruneCache() {
  const now = Date.now();
  for (const [k, v] of osrmCache) {
    if (v.expiry < now) osrmCache.delete(k);
  }
  if (osrmCache.size > 200) {
    const entries = Array.from(osrmCache.entries()).sort((a, b) => a[1].expiry - b[1].expiry);
    const toRemove = entries.slice(0, osrmCache.size - 200);
    for (const [k] of toRemove) {
      osrmCache.delete(k);
    }
  }
}

async function fetchOSRMDrivingETA(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<OSRMRouteResult | null> {
  const key = cacheKey(from, to);
  const cached = osrmCache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.result;
  }

  const inFlight = inFlightRequests.get(key);
  if (inFlight) return inFlight;

  const promise = _fetchOSRM(key, from, to);
  inFlightRequests.set(key, promise);
  promise.finally(() => inFlightRequests.delete(key));
  return promise;
}

async function _fetchOSRM(
  key: string,
  from: { lat: number; lon: number },
  to: { lat: number; lon: number }
): Promise<OSRMRouteResult | null> {
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
    const res = await fetch(url, { signal: controller.signal });
    const elapsed = Date.now() - start;

    if (!res.ok) {
      log.info(`OSRM ${res.status} in ${elapsed}ms`);
      return null;
    }
    const data = await res.json();
    if (data.code !== "Ok" || !data.routes?.length) return null;
    const route = data.routes[0];
    const result: OSRMRouteResult = {
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    };

    osrmCache.set(key, { result, expiry: Date.now() + CACHE_TTL_MS });
    pruneCache();

    if (elapsed > 2000) {
      log.info(`OSRM slow response: ${elapsed}ms`);
    }
    return result;
  } catch (e) {
    const elapsed = Date.now() - start;
    log.info(`OSRM fetch error after ${elapsed}ms: ${e}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export interface SequentialETA {
  pilotId: string;
  etaMinutes: number;
}

export async function calculateSequentialETAs(
  driverPos: { lat: number; lon: number },
  pilots: Array<{ pilotId: string; lat: number; lon: number }>
): Promise<SequentialETA[]> {
  if (pilots.length === 0) return [];

  const fetches = await Promise.all(
    pilots.map((pilot, i) => {
      const from = i === 0 ? driverPos : { lat: pilots[i - 1].lat, lon: pilots[i - 1].lon };
      return fetchOSRMDrivingETA(from, { lat: pilot.lat, lon: pilot.lon });
    })
  );

  const results: SequentialETA[] = [];
  let cumulativeMinutes = 0;

  for (let i = 0; i < pilots.length; i++) {
    const route = fetches[i];
    if (route) {
      cumulativeMinutes += route.durationMin;
    } else {
      const from = i === 0 ? driverPos : { lat: pilots[i - 1].lat, lon: pilots[i - 1].lon };
      const distKm = haversineDistance(from.lat, from.lon, pilots[i].lat, pilots[i].lon);
      cumulativeMinutes += (distKm / 60) * 60;
    }
    results.push({ pilotId: pilots[i].pilotId, etaMinutes: Math.round(cumulativeMinutes) });
  }

  return results;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
