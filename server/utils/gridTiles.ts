/**
 * Column-based tile builder for Open-Meteo batch grid requests.
 *
 * Rather than fetching a full bounding-box rectangle, the grid is split into
 * vertical (longitude) columns and each column's latitude range is clipped to
 * the Victoria polygon extent plus a buffer. This cuts tile count by ~30–35%
 * by excluding ocean and interstate areas from the request set.
 */

// Approximate Victoria boundary polygon (closed ring, WGS-84)
const VIC_LON = [
  140.96, 141.0,  141.5,  142.0,  142.2,  142.5,  143.0,  143.5,
  144.0,  144.5,  144.75, 145.0,  145.5,  146.0,  146.4,  146.9,
  147.3,  147.8,  148.2,  148.6,  149.0,  149.4,  149.97,
  149.97, 149.8,  149.5,  149.2,  149.0,
  148.5,  148.0,  147.5,  147.0,  146.8,
  146.4,
  146.0,  145.5,  145.2,  145.0,
  144.85, 144.68, 144.55,
  144.38, 144.25, 144.10,
  143.8,  143.5,  143.0,  142.5,  142.0,  141.5,  141.0,  140.96,
  140.96,
];

const VIC_LAT = [
  -34.00, -34.00, -34.02, -34.18, -34.25, -34.50, -35.38, -35.62,
  -36.05, -36.12, -36.13, -36.03, -36.05, -36.02, -36.00, -36.07,
  -35.98, -36.10, -36.52, -37.00, -37.30, -37.50, -37.55,
  -37.75, -37.95, -38.10, -38.20, -38.30,
  -38.40, -38.35, -38.55, -38.65, -38.75,
  -39.13,
  -38.85, -38.60, -38.50, -38.43,
  -38.50, -38.35, -38.15,
  -38.20, -38.13, -38.43,
  -38.68, -38.70, -38.58, -38.42, -38.17, -38.10, -38.05, -38.05,
  -34.00,
];

/**
 * Builds a flat rectangular grid of all lat/lon points in the bounding box,
 * chunked into Open-Meteo batch tiles of at most maxPerTile points each.
 * Unlike buildColumnTiles, every cell in the rectangle is fetched — no Victoria
 * polygon clipping — so wind particle rendering has no null dead-zones.
 */
export function buildRectangularTiles(
  bounds: TileBounds,
  delta: number,
  maxPerTile: number,
): { lats: number[]; lons: number[] }[] {
  const allPoints: { lat: number; lon: number }[] = [];
  for (let lat = bounds.latMin; lat <= bounds.latMax + delta * 0.5; lat += delta) {
    for (let lon = bounds.lonMin; lon <= bounds.lonMax + delta * 0.5; lon += delta) {
      allPoints.push({ lat: parseFloat(lat.toFixed(4)), lon: parseFloat(lon.toFixed(4)) });
    }
  }
  const tiles: { lats: number[]; lons: number[] }[] = [];
  for (let i = 0; i < allPoints.length; i += maxPerTile) {
    const chunk = allPoints.slice(i, i + maxPerTile);
    tiles.push({ lats: chunk.map(p => p.lat), lons: chunk.map(p => p.lon) });
  }
  return tiles;
}

export interface TileBounds {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/**
 * Splits the given bounding box into `numColumns` vertical strips and clips
 * each strip's lat range to the Victoria polygon extent (+ `buffer` degrees).
 * Points within each strip are chunked into Open-Meteo batch tiles of at most
 * `maxPerTile` points each.
 */
export function buildColumnTiles(
  bounds: TileBounds,
  delta: number,
  maxPerTile: number,
  numColumns = 4,
  buffer = 0.2,
): { lats: number[]; lons: number[] }[] {
  const colWidth = (bounds.lonMax - bounds.lonMin) / numColumns;
  const tiles: { lats: number[]; lons: number[] }[] = [];

  for (let c = 0; c < numColumns; c++) {
    const colLonMin = bounds.lonMin + c * colWidth;
    const colLonMax = bounds.lonMin + (c + 1) * colWidth;

    const vicLatsInCol = VIC_LAT.filter((_, i) =>
      VIC_LON[i] >= colLonMin - buffer && VIC_LON[i] <= colLonMax + buffer
    );

    const rawLatMin = vicLatsInCol.length > 0
      ? Math.max(bounds.latMin, Math.min(...vicLatsInCol) - buffer)
      : bounds.latMin;
    const rawLatMax = vicLatsInCol.length > 0
      ? Math.min(bounds.latMax, Math.max(...vicLatsInCol) + buffer)
      : bounds.latMax;

    // Snap to the global 0-origin delta grid so all columns share identical lat values.
    // Without this, each column starts at a different fractional lat, producing ~3× more
    // unique rows in the combined matrix than expected, which breaks the deltaLat indexing.
    const colLatMin = parseFloat((Math.floor(rawLatMin / delta) * delta).toFixed(4));
    const colLatMax = parseFloat((Math.ceil(rawLatMax / delta) * delta).toFixed(4));

    const allPoints: { lat: number; lon: number }[] = [];
    for (let lat = colLatMin; lat <= colLatMax + delta * 0.5; lat += delta) {
      for (let lon = colLonMin; lon <= colLonMax + delta * 0.5; lon += delta) {
        allPoints.push({
          lat: parseFloat(lat.toFixed(4)),
          lon: parseFloat(lon.toFixed(4)),
        });
      }
    }

    for (let i = 0; i < allPoints.length; i += maxPerTile) {
      const chunk = allPoints.slice(i, i + maxPerTile);
      tiles.push({
        lats: chunk.map(p => p.lat),
        lons: chunk.map(p => p.lon),
      });
    }
  }

  return tiles;
}
