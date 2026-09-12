/**
 * Thermal grid — 0.09° CAPE / boundary-layer field for thermal forecasting.
 *
 * Geometry note: unlike the fine grid this one is clipped to the Victoria
 * polygon by `buildColumnTiles`. Thermal data is only rendered over land where
 * pilots fly, so fetching ocean cells at this spacing would roughly double the
 * request volume for no gain.
 *
 * Requiring `cape` + `boundary_layer_height` also excludes the S3 GFS tier,
 * which does not carry them — better to leave a gap than to fill it with
 * points that read as zeroes.
 */

import { buildColumnTiles } from "../utils/gridTiles.js";
import { MAX_POINTS_PER_TILE, THERMAL_DELTA, getGridBounds } from "./bounds.js";
import type { ThermalPoint, ThermalVictoriaGrid } from "./bounds.js";
import { fetchGrid, getCachedGrid, seriesOf, type GridKind } from "./pipeline.js";
import type { LatLon, MergedPoint, Variable } from "./types.js";

export const THERMAL_GRID_CACHE_KEY = "thermal_grid";

const THERMAL_VARIABLES: Variable[] = [
  "cape",
  "boundary_layer_height",
  "temperature_2m",
  "dew_point_2m",
];

const THERMAL_REQUIRED: Variable[] = ["cape", "boundary_layer_height"];

async function buildThermalPoints(): Promise<LatLon[]> {
  const bounds = await getGridBounds();
  const tiles = buildColumnTiles(
    { lonMin: bounds.fineLonMin, lonMax: bounds.fineLonMax, latMin: bounds.fineLatMin, latMax: bounds.fineLatMax },
    THERMAL_DELTA,
    MAX_POINTS_PER_TILE,
  );
  return tiles.flatMap(t => t.lats.map((lat, i) => ({ lat, lon: t.lons[i] })));
}

function buildThermalPoint(p: MergedPoint, time: string[]): ThermalPoint {
  const n = time.length;
  return {
    lat: p.lat,
    lon: p.lon,
    source: p.source,
    hourly: {
      time,
      cape: seriesOf(p, "cape", n),
      boundary_layer_height: seriesOf(p, "boundary_layer_height", n),
      temperature_2m: seriesOf(p, "temperature_2m", n),
      dew_point_2m: seriesOf(p, "dew_point_2m", n),
    },
  };
}

export const THERMAL_GRID: GridKind<ThermalPoint> = {
  baseKey: THERMAL_GRID_CACHE_KEY,
  progressKey: "thermalGridProgress",
  provenanceKey: "thermalGridProvenance",
  delta: THERMAL_DELTA,
  variables: THERMAL_VARIABLES,
  required: THERMAL_REQUIRED,
  buildPoints: buildThermalPoints,
  buildPoint: buildThermalPoint,
};

export function fetchThermalGrid(force = false): Promise<ThermalVictoriaGrid> {
  return fetchGrid(THERMAL_GRID, force);
}

export function getCachedThermalGrid(): Promise<ThermalVictoriaGrid | null> {
  return getCachedGrid(THERMAL_GRID);
}

export { computeCCL } from "./extract.js";
