/**
 * Grid-rectangle geometry for the map viewport.
 *
 * These functions decide how far the user may zoom out and how far they may pan.
 * They live outside MapCanvas so the invariant they encode — *the viewport never
 * shows anything outside the configured grid rectangle, at every viewport aspect
 * ratio and every rectangle shape* — can be tested directly rather than inferred
 * from a rendered map. See mapExtent.test.mjs.
 *
 * The admin bounds editor lets the rectangle be any shape, and the map is used
 * on everything from a 375-px-wide phone in portrait to a wide desktop panel, so
 * the two aspect ratios are independent and either can be the binding one.
 */

import { geoMercator } from 'd3-geo';

export interface GridBoundsLL {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

/** The projection MapCanvas draws with: world coordinates in roughly [-0.5, 0.5]. */
export function createMapProjection() {
  return geoMercator()
    .scale(1 / (2 * Math.PI))
    .translate([0, 0]);
}

/** The grid rectangle in projected world coordinates. */
export function gridWorldExtent(
  projection: ReturnType<typeof createMapProjection>,
  bounds: GridBoundsLL,
) {
  const tl = projection([bounds.lonMin, bounds.latMax])!;
  const br = projection([bounds.lonMax, bounds.latMin])!;
  return { tl, br, extW: Math.abs(br[0] - tl[0]), extH: Math.abs(br[1] - tl[1]) };
}

/**
 * The zoom scale `k` at which the rectangle exactly COVERS the viewport.
 *
 * At this scale the viewport is inscribed in the rectangle: whichever axis is
 * the tighter fit lines up edge to edge, and the other axis overflows and is
 * reached by panning. So the user can never zoom out far enough to see past the
 * edge of the data — no blank map margin, on any viewport shape.
 *
 * `Math.max` of the two ratios is cover; `Math.min` would be contain, which fits
 * the whole rectangle on screen but letterboxes the slack axis with dead map.
 * Contain is the intuitive-sounding choice and is wrong here: on a portrait
 * phone against a wide, short rectangle (12.7° × 6.4° on 375 × 733) it leaves
 * roughly 60% of the screen height showing empty basemap above and below the
 * data band.
 *
 * Which axis binds falls out of the two aspect ratios, so portrait, landscape
 * and square viewports are all handled without special-casing: portrait against
 * a wide rectangle binds on height (full latitude, pan for longitude), a wide
 * desktop panel binds on width (full longitude, pan for latitude).
 *
 * There is deliberately no absolute floor clamped underneath this. Any constant
 * floor silently re-breaks the invariant as soon as the rectangle grows past the
 * point where cover-k drops below it — precisely what the admin bounds editor is
 * free to do.
 */
export function coverScale(extW: number, extH: number, width: number, height: number): number {
  return Math.max(width / extW, height / extH);
}

/**
 * The centre of the rectangle in projected world coordinates.
 *
 * Deliberately not `projection([midLon, midLat])`. Mercator is non-linear in
 * latitude, so the geographic mid-latitude projects *above* the midpoint of the
 * projected box — by 0.07° on the production rectangle, and by a full degree on
 * a tall one. At the zoom floor there is zero slack on the binding axis, so that
 * offset lands the viewport off-centre against a rectangle it exactly fits,
 * leaving a sliver of blank map on one side. Longitude is linear and unaffected,
 * which is why the error only ever showed up on latitude-bound viewports.
 */
export function gridWorldCenter(
  projection: ReturnType<typeof createMapProjection>,
  bounds: GridBoundsLL,
): [number, number] {
  const { tl, br } = gridWorldExtent(projection, bounds);
  return [(tl[0] + br[0]) / 2, (tl[1] + br[1]) / 2];
}
