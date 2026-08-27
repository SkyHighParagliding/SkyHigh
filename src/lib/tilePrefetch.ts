const CACHE_NAME = 'carto-tiles-v1';
const ZOOM_LEVELS = [5, 6, 7, 8, 9, 10];
const VICTORIA = { minLat: -39.2, maxLat: -33.9, minLon: 140.9, maxLon: 150.0 };

function lonToX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function latToY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

function buildTileUrls(key: string): string[] {
  const urls: string[] = [];
  for (const z of ZOOM_LEVELS) {
    const x0 = lonToX(VICTORIA.minLon, z);
    const x1 = lonToX(VICTORIA.maxLon, z);
    const y0 = latToY(VICTORIA.maxLat, z); // north = smaller y in tile coords
    const y1 = latToY(VICTORIA.minLat, z);
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(`https://basemaps.cartocdn.com/rastertiles/light_nolabels/${z}/${x}/${y}.png?key=${key}`);
  }
  return urls;
}

export async function prefetchVictoriaTiles(): Promise<void> {
  if (!('caches' in window)) return;
  const key = import.meta.env.VITE_CARTO_API_KEY;
  if (!key) return;

  const cache = await caches.open(CACHE_NAME);
  const urls = buildTileUrls(key);

  const BATCH = 8;
  for (let i = 0; i < urls.length; i += BATCH) {
    await Promise.all(
      urls.slice(i, i + BATCH).map(async (url) => {
        if (await cache.match(url)) return;
        try {
          const res = await fetch(url, { mode: 'cors' });
          if (res.ok) await cache.put(url, res);
        } catch {
          // individual tile failures are non-fatal
        }
      })
    );
  }
}
