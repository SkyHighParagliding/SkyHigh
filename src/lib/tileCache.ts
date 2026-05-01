const TILE_CACHE_NAME = "skyhigh-offline-tiles";

const TILE_URLS: Record<string, string> = {
  streets: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  topo: "https://tile.opentopomap.org/{z}/{x}/{y}.png",
  satellite: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
};

function lonToTile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function latToTile(lat: number, zoom: number): number {
  return Math.floor(
    ((1 -
      Math.log(
        Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)
      ) /
        Math.PI) /
      2) *
      Math.pow(2, zoom)
  );
}

function getTilesInRadius(
  lat: number,
  lon: number,
  radiusKm: number,
  zoom: number
): { x: number; y: number; z: number }[] {
  const latDeg = radiusKm / 111.32;
  const lonDeg = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));

  const minLat = lat - latDeg;
  const maxLat = lat + latDeg;
  const minLon = lon - lonDeg;
  const maxLon = lon + lonDeg;

  const minX = lonToTile(minLon, zoom);
  const maxX = lonToTile(maxLon, zoom);
  const minY = latToTile(maxLat, zoom);
  const maxY = latToTile(minLat, zoom);

  const tiles: { x: number; y: number; z: number }[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

export function estimateTileCount(
  radiusKm: number,
  zoomMin: number,
  zoomMax: number,
  layerCount: number
): number {
  let count = 0;
  for (let z = zoomMin; z <= zoomMax; z++) {
    const tilesPerSide = Math.ceil((radiusKm * 2) / (40075 / Math.pow(2, z)));
    count += tilesPerSide * tilesPerSide;
  }
  return count * layerCount;
}

export interface CacheProgress {
  total: number;
  cached: number;
  failed: number;
  done: boolean;
}

export async function cacheTilesForLocation(
  lat: number,
  lon: number,
  radiusKm: number,
  zoomMin: number,
  zoomMax: number,
  layers: string[],
  onProgress?: (progress: CacheProgress) => void
): Promise<CacheProgress> {
  const cache = await caches.open(TILE_CACHE_NAME);

  const allUrls: string[] = [];
  for (let z = zoomMin; z <= zoomMax; z++) {
    const tiles = getTilesInRadius(lat, lon, radiusKm, z);
    for (const tile of tiles) {
      for (const layer of layers) {
        const urlTemplate = TILE_URLS[layer];
        if (!urlTemplate) continue;
        const url = urlTemplate
          .replace("{z}", String(tile.z))
          .replace("{x}", String(tile.x))
          .replace("{y}", String(tile.y));
        allUrls.push(url);
      }
    }
  }

  const progress: CacheProgress = {
    total: allUrls.length,
    cached: 0,
    failed: 0,
    done: false,
  };

  onProgress?.(progress);

  const BATCH_SIZE = 6;
  for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
    const batch = allUrls.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (url) => {
        const existing = await cache.match(url);
        if (existing) return;
        const resp = await fetch(url, { mode: "cors" });
        if (resp.ok) {
          await cache.put(url, resp);
        } else {
          throw new Error(`HTTP ${resp.status}`);
        }
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled") progress.cached++;
      else progress.failed++;
    }
    onProgress?.({ ...progress });
  }

  progress.done = true;
  onProgress?.(progress);
  return progress;
}

export async function getCachedTileCount(): Promise<number> {
  try {
    const cache = await caches.open(TILE_CACHE_NAME);
    const keys = await cache.keys();
    return keys.length;
  } catch {
    return 0;
  }
}

export async function clearTileCache(): Promise<void> {
  await caches.delete(TILE_CACHE_NAME);
}
