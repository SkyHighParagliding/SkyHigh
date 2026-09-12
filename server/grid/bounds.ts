/**
 * Grid geometry: bounding box, spacing, and the persisted grid shape.
 *
 * The bounding box is admin-configurable via the `gridFine*` settings keys and
 * defaults to a box covering Victoria plus Tasmania, ACT, eastern SA and the
 * NSW coast.
 */

import { query } from "../pg.js";
import createLogger from "../utils/logger.js";
import type { SourceId } from "./types.js";

const log = createLogger("grid:bounds");

/**
 * Box edges, chosen to land useful lattice rows once `buildLandTiles` snaps to
 * multiples of the spacing (it takes ceil/floor of edge/delta, so an edge only
 * half a cell outside the target yields nothing):
 *   latMax -33.90 → northernmost 0.09° row at -33.93, covering all of the
 *     Mallee and Sunraysia. The previous -35.0 snapped to -35.01 and cut the
 *     grid off south of Swan Hill; Mildura has never had thermal data.
 *   latMin -43.70 → southernmost row at -43.65, past South East Cape, so
 *     Tasmania and the Bass Strait islands are covered rather than being dead
 *     coverage rings in gridTiles.ts.
 * Longitude is deliberately tight to the coverage rings: the old 155.0 reached
 * 400 km into the Tasman Sea, which the land clip discarded and the rectangular
 * wind grid did not.
 */
export const FINE_LAT_MIN = -43.7;
export const FINE_LAT_MAX = -33.9;
export const FINE_LON_MIN = 140.0;
export const FINE_LON_MAX = 151.0;

/** Fine (wind) grid spacing in degrees. */
export const FINE_DELTA = 0.15;

/** Thermal grid spacing in degrees — finer, fewer variables. */
export const THERMAL_DELTA = 0.09;

/** Open-Meteo batch limit per request. */
export const MAX_POINTS_PER_TILE = 1000;

export interface GridBounds {
  fineLatMin: number;
  fineLatMax: number;
  fineLonMin: number;
  fineLonMax: number;
}

const DEFAULT_BOUNDS: GridBounds = {
  fineLatMin: FINE_LAT_MIN,
  fineLatMax: FINE_LAT_MAX,
  fineLonMin: FINE_LON_MIN,
  fineLonMax: FINE_LON_MAX,
};

const BOUNDS_KEYS = ["gridFineLatMin", "gridFineLatMax", "gridFineLonMin", "gridFineLonMax"] as const;

/** Reads the admin-configured bounds, falling back to defaults on any failure. */
export async function getGridBounds(): Promise<GridBounds> {
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN (${BOUNDS_KEYS.map((_k, i) => `$${i + 1}`).join(",")})`,
      [...BOUNDS_KEYS],
    );
    const s: Record<string, number> = {};
    for (const r of rows) s[r.key] = parseFloat(r.value);
    return {
      fineLatMin: Number.isFinite(s.gridFineLatMin) ? s.gridFineLatMin : FINE_LAT_MIN,
      fineLatMax: Number.isFinite(s.gridFineLatMax) ? s.gridFineLatMax : FINE_LAT_MAX,
      fineLonMin: Number.isFinite(s.gridFineLonMin) ? s.gridFineLonMin : FINE_LON_MIN,
      fineLonMax: Number.isFinite(s.gridFineLonMax) ? s.gridFineLonMax : FINE_LON_MAX,
    };
  } catch (err) {
    log.warn("getGridBounds failed — using defaults", err instanceof Error ? err.message : err);
    return { ...DEFAULT_BOUNDS };
  }
}

// ---------------------------------------------------------------------------
// Persisted grid shape
// ---------------------------------------------------------------------------

/**
 * PERSISTED SHAPE — DO NOT RESTRUCTURE.
 *
 * Rows of this shape exist in production `wind_grid_data`. Fields may be added
 * (optionally) but never renamed, removed or nested differently, or every
 * cached grid becomes unreadable and the extraction helpers break.
 */
export interface GridPoint {
  lat: number;
  lon: number;
  /** Added by the provider layer; absent on rows written before it existed. */
  source?: SourceId;
  hourly: {
    time: string[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m: number[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation: number[];
    precipitation_probability: number[];
    cloud_cover: number[];
    cloud_cover_low: number[];
    visibility: number[];
    cape: number[];
    boundary_layer_height: number[];
  };
}

export interface ThermalPoint {
  lat: number;
  lon: number;
  source?: SourceId;
  hourly: {
    time: string[];
    cape: number[];
    boundary_layer_height: number[];
    temperature_2m: number[];
    dew_point_2m: number[];
    shortwave_radiation: number[];
    soil_moisture_0_to_7cm: number[];
  };
}

/** Common envelope shared by both persisted grid kinds. */
export interface GridEnvelope {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  delta: number;
  ni: number;
  nj: number;
  fetchedAt: number;
  /** Added by the provider layer; absent on rows written before it existed. */
  provenance?: import("./types.js").Provenance;
}

export interface VictoriaGrid extends GridEnvelope {
  points: GridPoint[];
}

export interface ThermalVictoriaGrid extends GridEnvelope {
  points: ThermalPoint[];
}

/** Nominal column/row counts for the bounding box at the given spacing. */
export function gridDimensions(bounds: GridBounds, delta: number): { ni: number; nj: number } {
  return {
    ni: Math.round((bounds.fineLonMax - bounds.fineLonMin) / delta) + 1,
    nj: Math.round((bounds.fineLatMax - bounds.fineLatMin) / delta) + 1,
  };
}
