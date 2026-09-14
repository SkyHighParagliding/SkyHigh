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
 *
 * The coastline itself used to live here as hand-traced polygon rings, with a
 * second hand-traced copy in the client's landMask.ts. They drifted, and the
 * client copy ended up tracing the *Victorian state border*, erasing ground
 * this file had correctly fetched. Both are now replaced by one generated
 * raster mask — see shared/landMask.generated.ts and the build script that
 * produces it, scripts/bake-land-mask.mjs.
 */

import { isCovered } from "../../shared/landMask.generated.js";

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
 * Every lattice point inside the bounding box that falls on land, or within the
 * mask's baked offshore buffer (COVERAGE_BUFFER_DEG, 0.2°) of a coast, chunked
 * into Open-Meteo batch tiles of at most `maxPerTile` points each.
 *
 * The buffer used to be a parameter here. It is now baked into the mask, which
 * is why the parameter is gone: both call sites only ever used the 0.2° default,
 * and a runtime distance query against a raster is far more expensive than the
 * polygon one it replaced. Needing a second buffer width means baking a second
 * dilated mask, not reintroducing the argument.
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
      if (isCovered(lon, lat)) points.push({ lat, lon });
    }
  }

  const tiles: { lats: number[]; lons: number[] }[] = [];
  for (let i = 0; i < points.length; i += maxPerTile) {
    const chunk = points.slice(i, i + maxPerTile);
    tiles.push({ lats: chunk.map(p => p.lat), lons: chunk.map(p => p.lon) });
  }
  return tiles;
}
