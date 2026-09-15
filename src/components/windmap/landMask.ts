/**
 * Render-time land clip for the thermal overlay.
 *
 * WHY THIS EXISTS AT ALL. The server already clips the *fetch* to land
 * (`buildLandTiles` in server/utils/gridTiles.ts), so one might assume the
 * client needs no mask. It does: `interpolateSpatial` in thermalInterpolation.ts
 * is a *relaxed* bilinear — a single non-null corner is enough to produce a
 * value — so the field bleeds up to one grid cell (~10 km) offshore from the
 * nearest land point, and further across the offshore buffer ring the server
 * deliberately fetches. This mask is what draws the visible coastline.
 *
 * The coastline itself is no longer here. It was a hand-traced polygon ring,
 * duplicated from a second hand-traced ring on the server, and the two drifted:
 * this copy ended up tracing the **Victorian state border** — straight verticals
 * at lon 140.96 (SA) and lon 149.98 (NSW) and a straight lat −33.98 "Murray" —
 * so roughly ten columns of South Australia and seven of the NSW far south coast
 * were fetched, stored, and then thrown away in the browser. Political borders
 * are not weather boundaries.
 *
 * Both copies are now one generated raster mask, baked from Geoscience
 * Australia coastline data by scripts/bake-land-mask.mjs, which makes that class
 * of drift structurally impossible. It also resolves the geography the rings
 * could not: Western Port, French Island, Phillip Island and Corner Inlet are
 * real shapes now, and Wilsons Promontory is no longer a single vertex.
 *
 * This module stays as the client's import point so callers need not reach
 * across the tree into shared/.
 */

import { isOnLand } from "../../../shared/landMask.generated";

export { isOnLand };

/**
 * Thermal paint clip: land, inset ~1.5 km from the coastline.
 *
 * `isOnLand` is the exact Mean-High-Water coastline, but the thermal overlay
 * should not paint the immediate coast or near-shore water. Open water has no
 * daytime surface heating, and the sea breeze suppresses thermals in the coastal
 * strip, so W* there is meaningless — painting it (and the cumulus glyphs riding
 * on it) reads as "the coast is working" when it almost never is. Two effects
 * also push the *visible* heat seaward of the true shore: the render blur
 * (`drawThermalOverlay` uses blurPx 5) smears the edge ~5 px into the water, and
 * a shoreline cell rounds to land at 0.01°. Insetting the paint boundary inland
 * cancels both so the heat lands on, or just inside, the coast.
 *
 * Implemented as an erosion: a point counts as paintable only if it and eight
 * points on a 1.5 km circle around it are all land — i.e. it is at least 1.5 km
 * from the nearest coast in every sampled direction. Exactness beyond this is
 * pointless because the 5 px blur softens the boundary anyway. ~9 O(1) mask
 * lookups per land cell per rebuild; water cells short-circuit on the first.
 */
const THERMAL_INSET_KM = 1.5;
const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.320;
// Eight unit offsets (east, north) evenly spaced around a circle.
const RING = Array.from({ length: 8 }, (_, k) => {
  const a = (k * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)] as const;
});

export function isThermalLand(lon: number, lat: number): boolean {
  if (!isOnLand(lon, lat)) return false;
  const dLat = THERMAL_INSET_KM / KM_PER_DEG_LAT;
  const dLon = THERMAL_INSET_KM / (KM_PER_DEG_LON_EQUATOR * Math.cos((lat * Math.PI) / 180));
  for (const [east, north] of RING) {
    if (!isOnLand(lon + east * dLon, lat + north * dLat)) return false;
  }
  return true;
}
