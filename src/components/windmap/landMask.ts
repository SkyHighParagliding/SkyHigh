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

export { isOnLand } from "../../../shared/landMask.generated";
