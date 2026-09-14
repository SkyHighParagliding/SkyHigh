/**
 * Render-time land clip for the thermal overlay.
 *
 * WHY THIS EXISTS AT ALL. The server already clips the *fetch* to land
 * (`buildLandTiles` in server/utils/gridTiles.ts), so one might assume the
 * client needs no mask. It does: `interpolateSpatial` in thermalInterpolation.ts
 * is a *relaxed* bilinear — a single non-null corner is enough to produce a
 * value — so the field bleeds up to one grid cell (~10 km) offshore from the
 * nearest land point, and further across the 0.2° buffer ring the server
 * deliberately fetches. This mask is what draws the visible coastline.
 *
 * THESE RINGS ARE A COPY OF THE SERVER'S COVERAGE RINGS and must stay in step
 * with `server/utils/gridTiles.ts`. Anything the server fetches but this rejects
 * is erased before it is drawn, which is exactly the bug this file used to have:
 * it traced the **Victorian state border** — straight verticals at lon 140.96
 * (SA) and lon 149.98 (NSW) and a straight lat −33.98 "Murray" — so roughly ten
 * columns of South Australia and seven of the NSW far south coast were fetched,
 * stored, and then thrown away in the browser. The wind map, which is clipped to
 * nothing, showed them; the thermal map did not. Political borders are not
 * weather boundaries — see the same note in gridTiles.ts.
 *
 * The duplication is deliberate for now and slated for removal: the planned
 * build-time raster mask (from Geoscience Australia coastline data) replaces
 * both copies with one generated artifact, at which point the drift that caused
 * the bug above becomes structurally impossible.
 */

/** A closed ring of [lon, lat] pairs. */
type Ring = readonly (readonly [number, number])[];

/**
 * Mainland coverage: the SA/Victorian/NSW coastline on the south and east, and
 * an arbitrary line well north of any plausible bounding box on the north, so
 * the grid's own latMax governs the northern edge rather than a state border.
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

/** Tasmania. */
const TASMANIA: Ring = [
  [144.60, -40.70], [145.30, -40.75], [146.50, -41.00], [147.50, -40.80],
  [148.00, -40.70], [148.30, -40.85],
  [148.30, -41.50], [148.30, -42.00], [148.10, -42.60], [147.90, -43.00],
  [147.50, -43.10], [147.00, -43.60], [146.50, -43.50],
  [145.50, -42.50], [145.20, -42.00], [144.70, -41.50], [144.60, -41.00],
];

/** Bass Strait islands — small, but they carry real flying sites. */
const KING_ISLAND: Ring = [
  [143.85, -39.57], [144.12, -39.65], [144.10, -40.05], [143.85, -40.10],
];

const FLINDERS_ISLAND: Ring = [
  [147.90, -39.70], [148.30, -39.75], [148.35, -40.20], [147.95, -40.20],
];

const LAND_RINGS: readonly Ring[] = [MAINLAND, TASMANIA, KING_ISLAND, FLINDERS_ISLAND];

/**
 * Port Phillip Bay, traced clockwise from Point Lonsdale — subtracted as a hole.
 *
 * The server's MAINLAND ring cuts straight across the bay rather than carving it
 * out, because fetching a few dozen points of bay water is cheap and harmless.
 * Rendering thermals over it is not, so the hole is applied here only.
 */
const PORT_PHILLIP_BAY: Ring = [
  [144.67, -38.27], // Point Lonsdale (west entrance / The Heads)
  [144.66, -38.24], // Queenscliff
  [144.72, -38.17], // St Leonards
  [144.65, -38.12], // Portarlington
  [144.52, -38.09], // Edwards Point
  [144.42, -38.13], // Point Henry / Geelong South
  [144.38, -38.12], // Geelong / Rippleside
  [144.38, -38.07], // North Geelong
  [144.43, -37.97], // Lara / Little River area
  [144.55, -37.94], // Werribee South
  [144.65, -37.93], // Werribee coast
  [144.80, -37.88], // Altona / Laverton
  [144.88, -37.86], // Williamstown
  [144.97, -37.86], // Port Melbourne / Docklands
  [145.03, -37.88], // St Kilda
  [145.08, -37.95], // Brighton / Mentone
  [145.12, -38.05], // Aspendale / Edithvale
  [145.14, -38.13], // Frankston
  [145.08, -38.22], // Mornington
  [145.01, -38.29], // Mount Martha
  [144.90, -38.36], // Rosebud
  [144.83, -38.40], // Rye
  [144.76, -38.38], // Sorrento
  [144.74, -38.34], // Portsea
  [144.73, -38.51], // Point Nepean (east entrance / The Heads)
];

function isInsidePolygon(poly: Ring, lon: number, lat: number): boolean {
  const n = poly.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * True if (lon, lat) is land the thermal overlay should paint.
 *
 * Accuracy is limited by the hand-traced rings above: Western Port, French
 * Island, Phillip Island and Corner Inlet are not resolved, and the Prom is a
 * single vertex. The raster mask replaces this.
 */
export function isOnLand(lon: number, lat: number): boolean {
  if (!LAND_RINGS.some(ring => isInsidePolygon(ring, lon, lat))) return false;
  if (isInsidePolygon(PORT_PHILLIP_BAY, lon, lat)) return false;
  return true;
}
