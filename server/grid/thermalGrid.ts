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
 * Cloud cover:
 *
 * `cloud_cover` (total, %) and `cloud_cover_low` (below ~2 km, %) are fetched
 * by the fine/wind grid (`fineGrid.ts`) but were never forwarded to clients —
 * `gridToWindData` only emits {u, v}. This grid adds them so the thermal
 * renderer can distinguish stratiform overcast (advected above the boundary
 * layer, invisible to the BLH/CCL test) from genuine cumulus. Both fields live
 * in THERMAL_OPTIONAL for the same reason as `lifted_index`: a run of NaN must
 * not veto or shorten the forecast axis.
 *
 * Overdevelopment signal:
 *
 * The OD triangle is driven by `lifted_index` + `cape`. ECMWF publishes no lifted
 * index under any name, so tier 2 derives it from the `ecmwf_ifs025` pressure-level
 * bucket by parcel ascent (see providers/ecmwfLiftedIndex.ts and grid/parcel.ts).
 * That means LI is available on tiers 1 AND 2 — only the GFS fallback tiers
 * lack it, where `convective_inhibition` acts as a degraded stand-in.
 *
 * Both `lifted_index` and `convective_inhibition` are listed in THERMAL_OPTIONAL
 * rather than THERMAL_REQUIRED. This — not THERMAL_REQUIRED — is what permits
 * their gaps: the orchestrator excludes them from the axis-coverage check so a
 * run of NaN values does not veto or shorten the forecast, and `seriesOf` emits
 * NaN for them instead of throwing.
 *
 * `convective_inhibition` is non-finite on roughly a third to two-thirds of
 * Victoria points in the ECMWF bucket (2,294/6,173 measured 2026-09-13), so it
 * must never be treated as reliably present. Adding it to THERMAL_REQUIRED would
 * cause the orchestrator to throw on nearly every run.
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
  // Cloud cover — deliberately optional (see module doc above).
  "cloud_cover",
  "cloud_cover_low",
  // Precipitation — optional; drives the rain wash on the thermal map.
  "precipitation",
  // WMO weather code — optional; distinguishes drizzle / rain / showers / snow.
  "weather_code",
];

const THERMAL_REQUIRED: Variable[] = ["cape", "boundary_layer_height"];

/**
 * Variables permitted to contain gaps. The orchestrator excludes these from the
 * axis-coverage check; `seriesOf` emits NaN for missing hours rather than
 * throwing. `extract.ts` normalises NaN (and JSON null) to `undefined`, so
 * absence stays absence and is never shown as a value on the client.
 *
 * `convective_inhibition` is non-finite on roughly a third to two-thirds of
 * Victoria points in the ECMWF bucket (2,294/6,173 measured 2026-09-13).
 *
 * `cloud_cover` and `cloud_cover_low` are new from TASK-036. They are
 * supported on tiers 1 and 2 (the same ECMWF source the thermal grid already
 * uses), but production rows cached before TASK-036 lack them — so they must
 * live here rather than in THERMAL_REQUIRED, or every cached grid becomes
 * invalid the moment the new code is deployed.
 */
const THERMAL_OPTIONAL: Variable[] = [
  "lifted_index",
  "convective_inhibition",
  "cloud_cover",
  "cloud_cover_low",
  "precipitation",
  "weather_code",
];

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
  // `gaps` drives the allowGaps flag on seriesOf from the single source of truth
  // (THERMAL_OPTIONAL), so the two can never drift apart.
  const gaps = (v: Variable) => THERMAL_OPTIONAL.includes(v);
  return {
    lat: p.lat,
    lon: p.lon,
    source: p.source,
    hourly: {
      time,
      cape: seriesOf(p, "cape", n, gaps("cape")),
      boundary_layer_height: seriesOf(p, "boundary_layer_height", n, gaps("boundary_layer_height")),
      temperature_2m: seriesOf(p, "temperature_2m", n, gaps("temperature_2m")),
      dew_point_2m: seriesOf(p, "dew_point_2m", n, gaps("dew_point_2m")),
      shortwave_radiation: seriesOf(p, "shortwave_radiation", n, gaps("shortwave_radiation")),
      soil_moisture_0_to_7cm: seriesOf(p, "soil_moisture_0_to_7cm", n, gaps("soil_moisture_0_to_7cm")),
      // All four of these are declared in THERMAL_OPTIONAL: the orchestrator
      // excluded them from the axis-coverage check so NaN values do not shorten
      // or destroy the forecast. seriesOf emits NaN for missing hours (rather
      // than throwing), which JSON.stringify turns into null on the wire;
      // extract.ts normalises both null and NaN to undefined, so absence stays
      // absence on the client.
      // lifted_index is available on tiers 1 and 2 (tier 2 derives it by parcel
      // ascent); convective_inhibition is non-finite on ~a third to two-thirds of
      // Victoria points in the ECMWF bucket.
      // cloud_cover and cloud_cover_low were first fetched by this grid in
      // TASK-036; any row stored before then will simply have no entry for them.
      lifted_index: seriesOf(p, "lifted_index", n, gaps("lifted_index")),
      convective_inhibition: seriesOf(p, "convective_inhibition", n, gaps("convective_inhibition")),
      cloud_cover: seriesOf(p, "cloud_cover", n, gaps("cloud_cover")),
      cloud_cover_low: seriesOf(p, "cloud_cover_low", n, gaps("cloud_cover_low")),
      precipitation: seriesOf(p, "precipitation", n, gaps("precipitation")),
      weather_code: seriesOf(p, "weather_code", n, gaps("weather_code")),
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
  optional: THERMAL_OPTIONAL,
  buildPoints: buildThermalPoints,
  buildPoint: buildThermalPoint,
};

export function fetchThermalGrid(force = false): Promise<ThermalVictoriaGrid> {
  return fetchGrid(THERMAL_GRID, force);
}

export function getCachedThermalGrid(): Promise<ThermalVictoriaGrid | null> {
  return getCachedGrid(THERMAL_GRID);
}
