/**
 * Thermal grid — 0.09° CAPE / boundary-layer field for thermal forecasting.
 *
 * Geometry note: unlike the fine grid this one is clipped to coastline polygons
 * by `buildLandTiles`. Thermal data is only rendered over land where pilots fly,
 * so fetching ocean cells at this spacing would roughly double the request
 * volume for no gain.
 *
 * Requiring `cape` + `boundary_layer_height` also excludes the S3 GFS tier,
 * which does not carry them — better to leave a gap than to fill it with
 * points that read as zeroes.
 *
 * The grid also carries `shortwave_radiation` (W/m²) and `soil_moisture_0_to_7cm`
 * (m³/m³) — both served by the tier-1 and tier-2 ECMWF providers — which are
 * consumed by `computeWstar()` in extract.ts to derive the Deardorff convective
 * velocity scale. These fields are not required (not in THERMAL_REQUIRED): if a
 * fallback tier cannot supply them the point is still kept, and w* will be
 * undefined for that point rather than discarding it.
 *
 * Overdevelopment signal:
 *
 * `lifted_index` and `convective_inhibition` carry the two-rung OD signal that
 * replaced the old (structurally unreachable) `blh − ccl > 3000 m` proxy.
 * Neither is added to THERMAL_REQUIRED because:
 *  - Adding `lifted_index` would collapse the provider chain to tier-1 alone:
 *    it is absent from the ECMWF S3 archive, so tier-2 can never satisfy it.
 *  - Adding either would discard any point a fallback tier provides without
 *    these fields, turning a degraded-but-useful point into a silent gap.
 * The client renderer degrades gracefully when these are missing: it falls through
 * to CAPE-only thresholds rather than suppressing the signal entirely.
 */

import { buildLandTiles } from "../utils/gridTiles.js";
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
  "shortwave_radiation",
  "soil_moisture_0_to_7cm",
  // OD signal variables — deliberately optional (see module doc above).
  "lifted_index",
  "convective_inhibition",
];

const THERMAL_REQUIRED: Variable[] = ["cape", "boundary_layer_height"];

async function buildThermalPoints(): Promise<LatLon[]> {
  const bounds = await getGridBounds();
  const tiles = buildLandTiles(
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
      shortwave_radiation: seriesOf(p, "shortwave_radiation", n),
      soil_moisture_0_to_7cm: seriesOf(p, "soil_moisture_0_to_7cm", n),
      // seriesOf fills NaN for hours where the provider had no value.
      // lifted_index is tier-1 only; convective_inhibition is tier-1 + tier-2.
      // NaN propagates to the client as-is and is converted to undefined there
      // (see extract.ts) so downstream `!= null` checks work correctly.
      lifted_index: seriesOf(p, "lifted_index", n),
      convective_inhibition: seriesOf(p, "convective_inhibition", n),
    },
  };
}

export const THERMAL_GRID: GridKind<ThermalPoint> = {
  baseKey: THERMAL_GRID_CACHE_KEY,
  progressKey: "thermalGridProgress",
  provenanceKey: "thermalGridProvenance",
  healthKey: "thermalGridHealth",
  label: "Thermal Grid",
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
