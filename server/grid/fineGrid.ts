/**
 * Fine (wind) grid — 0.15° over the configured bounds, full variable set.
 *
 * Geometry note: the fine grid deliberately fetches every cell in the bounding
 * rectangle with no Victoria-polygon clipping. The particle renderer
 * interpolates across the whole viewport, so a clipped grid leaves dead zones.
 */

import { buildRectangularTiles } from "../utils/gridTiles.js";
import { FINE_DELTA, MAX_POINTS_PER_TILE, getGridBounds } from "./bounds.js";
import type { GridPoint, VictoriaGrid } from "./bounds.js";
import { clearOverlayCaches } from "./extract.js";
import { clearMemoryCaches, fetchGrid, getCachedGrid, seriesOf, type GridKind } from "./pipeline.js";
import type { LatLon, MergedPoint, Variable } from "./types.js";

export const FINE_GRID_CACHE_KEY = "fine_grid";

const FINE_VARIABLES: Variable[] = [
  "temperature_2m",
  "wind_speed_10m",
  "wind_gusts_10m",
  "wind_direction_10m",
  "weather_code",
  "precipitation",
  "precipitation_probability",
  "cloud_cover",
  "cloud_cover_low",
  "visibility",
  "cape",
  "boundary_layer_height",
];

/** Without wind there is no wind map; a provider lacking these is skipped. */
const FINE_REQUIRED: Variable[] = ["wind_speed_10m", "wind_direction_10m"];

async function buildFinePoints(): Promise<LatLon[]> {
  const bounds = await getGridBounds();
  const tiles = buildRectangularTiles(
    { lonMin: bounds.fineLonMin, lonMax: bounds.fineLonMax, latMin: bounds.fineLatMin, latMax: bounds.fineLatMax },
    FINE_DELTA,
    MAX_POINTS_PER_TILE,
  );
  return tiles.flatMap(t => t.lats.map((lat, i) => ({ lat, lon: t.lons[i] })));
}

function buildFinePoint(p: MergedPoint, time: string[]): GridPoint {
  const n = time.length;
  return {
    lat: p.lat,
    lon: p.lon,
    source: p.source,
    hourly: {
      time,
      wind_speed_10m: seriesOf(p, "wind_speed_10m", n),
      wind_gusts_10m: seriesOf(p, "wind_gusts_10m", n),
      wind_direction_10m: seriesOf(p, "wind_direction_10m", n),
      temperature_2m: seriesOf(p, "temperature_2m", n),
      weather_code: seriesOf(p, "weather_code", n),
      precipitation: seriesOf(p, "precipitation", n),
      precipitation_probability: seriesOf(p, "precipitation_probability", n),
      cloud_cover: seriesOf(p, "cloud_cover", n),
      cloud_cover_low: seriesOf(p, "cloud_cover_low", n),
      visibility: seriesOf(p, "visibility", n),
      cape: seriesOf(p, "cape", n),
      boundary_layer_height: seriesOf(p, "boundary_layer_height", n),
    },
  };
}

export const FINE_GRID: GridKind<GridPoint> = {
  baseKey: FINE_GRID_CACHE_KEY,
  progressKey: "fineGridProgress",
  provenanceKey: "fineGridProvenance",
  healthKey: "fineGridHealth",
  label: "Wind Grid",
  delta: FINE_DELTA,
  variables: FINE_VARIABLES,
  required: FINE_REQUIRED,
  buildPoints: buildFinePoints,
  buildPoint: buildFinePoint,
};

export function fetchFineGrid(force = false): Promise<VictoriaGrid> {
  return fetchGrid(FINE_GRID, force);
}

export function getCachedFineGrid(): Promise<VictoriaGrid | null> {
  return getCachedGrid(FINE_GRID);
}

/** Drops every in-process cache. Called when the admin changes grid bounds. */
export function clearFineGridCaches(): void {
  clearMemoryCaches();
  clearOverlayCaches();
}
