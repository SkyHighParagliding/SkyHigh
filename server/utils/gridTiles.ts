/**
 * Land-clipped tile builder for Open-Meteo batch grid requests.
 *
 * The bounding box covers a lot of ocean. Thermals only exist over land, so the
 * request set is clipped to coastline polygons plus a buffer, which both saves
 * request volume and keeps the fetch inside the free-tier budget.
 *
 * This replaced a scheme that split the box into four longitude columns and
 * clipped each column independently to the Victoria border. Because Victoria's
 * northern edge is the Murray — which dips ~1.5° south in the centre-east —
 * neighbouring columns stopped at different latitudes, leaving hard-edged
 * rectangular voids in the rendered overlay. Clipping to a region instead of to
 * four separate bounding boxes makes that class of gap impossible.
 *
 * The old scheme also had the `no vertices in this column` case fall back to
 * *the full bounding box*, so the easternmost column fetched 4,860 points of
 * open Tasman Sea — 45% of the thermal budget — while Tasmania, which sits in
 * the clipped columns, got nothing at all.
 */

/** A closed ring of [lon, lat] pairs. */
type Ring = ReadonlyArray<readonly [number, number]>;

/**
 * Mainland coverage: the SA/Victorian/NSW coastline on the south and east, and
 * an arbitrary line well north of any plausible bounding box on the north.
 *
 * The northern edge is deliberately NOT the Murray. Victoria's border is a
 * political line, not a weather one — pilots flying the NE ranges care about
 * conditions over the border, and clipping there is what produced the void at
 * lon 147–151. The box's own latMax does the northern clipping instead.
 */
const MAINLAND: Ring = [
  // Northern edge — above any usable bounding box, so latMax governs.
  [139.00, -33.00], [150.60, -33.00],
  // NSW south coast, down to Cape Howe.
  [150.60, -35.00], [150.20, -35.70], [150.10, -36.30], [149.95, -37.00],
  [149.97, -37.55],
  // East Gippsland and the Ninety Mile Beach.
  [149.80, -37.95], [149.50, -38.10], [149.20, -38.20], [149.00, -38.30],
  [148.50, -38.40], [148.00, -38.35], [147.50, -38.55], [147.00, -38.65],
  [146.80, -38.75],
  [146.40, -39.13], // Wilsons Promontory
  [146.00, -38.85], [145.50, -38.60], [145.20, -38.50], [145.00, -38.43],
  // Port Phillip, Bellarine, Surf Coast.
  [144.85, -38.50], [144.68, -38.35], [144.55, -38.15],
  [144.38, -38.20], [144.25, -38.13], [144.10, -38.43],
  // Shipwreck Coast west to the SA border.
  [143.80, -38.68], [143.50, -38.70], [143.00, -38.58], [142.50, -38.42],
  [142.00, -38.17], [141.50, -38.10], [141.00, -38.05], [140.96, -38.05],
  // SA south-east: Mount Gambier, Robe, the Coorong.
  [140.50, -37.90], [140.00, -37.50], [139.75, -37.16], [139.85, -36.83],
  [139.34, -35.69], [139.00, -35.50],
];

/** Tasmania. Previously absent from the grid entirely. */
const TASMANIA: Ring = [
  [144.60, -40.70], [145.30, -40.75], [146.50, -41.00], [147.50, -40.80],
  [148.00, -40.70], [148.30, -40.85],
  [148.30, -41.50], [148.30, -42.00], [148.10, -42.60], [147.90, -43.00],
  [147.50, -43.10], [147.00, -43.60], [146.50, -43.50],
  [145.50, -42.50], [145.20, -42.00], [144.70, -41.50], [144.60, -41.00],
];

/** Bass Strait islands — small, but they keep the latitude lattice unbroken. */
const KING_ISLAND: Ring = [
  [143.85, -39.57], [144.12, -39.65], [144.10, -40.05], [143.85, -40.10],
];

const FLINDERS_ISLAND: Ring = [
  [147.90, -39.70], [148.30, -39.75], [148.35, -40.20], [147.95, -40.20],
];

const COVERAGE: readonly Ring[] = [MAINLAND, TASMANIA, KING_ISLAND, FLINDERS_ISLAND];

/** Standard-parallel scaling so a degree of longitude is comparable to a degree of latitude. */
const LON_SCALE = Math.cos((38.5 * Math.PI) / 180);

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to a ring's edges, in degrees of latitude. */
function distanceToRing(lon: number, lat: number, ring: Ring): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const dx = (xj - xi) * LON_SCALE;
    const dy = yj - yi;
    const len2 = dx * dx + dy * dy;
    const px = (lon - xi) * LON_SCALE;
    const py = lat - yi;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
    const ex = px - t * dx;
    const ey = py - t * dy;
    best = Math.min(best, Math.hypot(ex, ey));
  }
  return best;
}

/** True if the point is on land, or within `buffer` degrees of a coastline. */
function isCovered(lon: number, lat: number, buffer: number): boolean {
  for (const ring of COVERAGE) {
    if (inRing(lon, lat, ring)) return true;
  }
  for (const ring of COVERAGE) {
    if (distanceToRing(lon, lat, ring) <= buffer) return true;
  }
  return false;
}

/**
 * Builds a flat rectangular grid of all lat/lon points in the bounding box,
 * chunked into Open-Meteo batch tiles of at most maxPerTile points each.
 * Unlike buildLandTiles, every cell in the rectangle is fetched — no land
 * clipping — so wind particle rendering has no null dead-zones. Wind blows over
 * water; thermals do not.
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
 * Every lattice point inside the bounding box that falls on land (or within
 * `buffer` degrees of a coast), chunked into Open-Meteo batch tiles of at most
 * `maxPerTile` points each.
 *
 * Points are generated from step indices off a 0-origin lattice rather than by
 * accumulating `lat += delta`, so every point lands on an exact multiple of
 * `delta`. The renderer derives its cell size from `delta` alone and assumes a
 * uniform lattice; the previous per-column origins drifted off it and shifted
 * the overlay by up to 0.27° (~24 km) east of each column seam.
 */
export function buildLandTiles(
  bounds: TileBounds,
  delta: number,
  maxPerTile: number,
  buffer = 0.2,
): { lats: number[]; lons: number[] }[] {
  const round4 = (v: number) => parseFloat(v.toFixed(4));
  const j0 = Math.ceil(bounds.latMin / delta);
  const j1 = Math.floor(bounds.latMax / delta);
  const i0 = Math.ceil(bounds.lonMin / delta);
  const i1 = Math.floor(bounds.lonMax / delta);

  const points: { lat: number; lon: number }[] = [];
  for (let j = j0; j <= j1; j++) {
    const lat = round4(j * delta);
    for (let i = i0; i <= i1; i++) {
      const lon = round4(i * delta);
      if (isCovered(lon, lat, buffer)) points.push({ lat, lon });
    }
  }

  const tiles: { lats: number[]; lons: number[] }[] = [];
  for (let i = 0; i < points.length; i += maxPerTile) {
    const chunk = points.slice(i, i + maxPerTile);
    tiles.push({ lats: chunk.map(p => p.lat), lons: chunk.map(p => p.lon) });
  }
  return tiles;
}
