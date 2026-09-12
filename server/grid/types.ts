/**
 * Canonical types for the multi-source weather grid layer.
 *
 * The app fetches gridded forecast data from several providers of differing
 * quality. Providers are tiered: the orchestrator fills as much of the grid as
 * it can from tier 1, then asks lower tiers for only the points still missing.
 * Every point carries the id of the source that supplied it.
 */

/**
 * Canonical variable names. Providers translate their native naming to these.
 *
 * CANONICAL UNITS — providers MUST convert to these before returning.
 * These match what is already persisted in wind_grid_data; changing them would
 * invalidate every cached grid.
 *   wind_speed_10m, wind_gusts_10m   knots       (GRIB sources are m/s — convert)
 *   wind_direction_10m               degrees, meteorological (FROM)
 *   temperature_2m, dew_point_2m     degrees Celsius (GRIB sources are Kelvin)
 *   cape                             J/kg
 *   boundary_layer_height            metres
 *   precipitation                    mm
 *   precipitation_probability        percent
 *   cloud_cover, cloud_cover_low     percent
 *   visibility                       metres
 *   weather_code                     WMO code
 */
export type Variable =
  | "wind_speed_10m"
  | "wind_direction_10m"
  | "wind_gusts_10m"
  | "temperature_2m"
  | "dew_point_2m"
  | "cape"
  | "boundary_layer_height"
  | "weather_code"
  | "precipitation"
  | "precipitation_probability"
  | "cloud_cover"
  | "cloud_cover_low"
  | "visibility";

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * Source identifiers, ordered by tier in providers/registry.ts.
 * Tier 1-2 are the same ECMWF IFS HRES model and may be mixed freely.
 * Tier 3-4 are GFS; mixing them with ECMWF introduces a visible seam in the
 * rendered field, so the orchestrator only does so as a last resort.
 */
export type SourceId =
  | "openmeteo-api"
  | "openmeteo-s3-ecmwf"
  | "openmeteo-s3-gfs"
  | "nomads-gfs";

/**
 * Hourly series for one grid point.
 * `time` entries are Melbourne-local `YYYY-MM-DDTHH:mm`, matching the format
 * persisted in wind_grid_data and expected by the extraction helpers.
 */
export interface PointSeries {
  lat: number;
  lon: number;
  time: string[];
  values: Partial<Record<Variable, number[]>>;
}

export interface GridRequest {
  points: LatLon[];
  variables: Variable[];
  /** Forecast horizon in days from today (Melbourne). */
  forecastDays: number;
  signal?: AbortSignal;
}

export interface ProviderResult {
  source: SourceId;
  /** Only the points this provider could supply. May be empty. */
  points: PointSeries[];
  /**
   * Set when the data is usable but below the provider's normal fidelity —
   * e.g. temporally interpolated from coarser steps. Surfaced in admin UI.
   */
  degraded?: string;
}

/** Key used to match a point across providers. 4dp ~= 11 m, well below any grid spacing. */
export function pointKey(p: LatLon): string {
  return `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
}

/** Meteorological wind convention: direction is where the wind blows FROM. */
export function uvToSpeedDir(u: number, v: number): { speed: number; direction: number } {
  return {
    speed: Math.hypot(u, v),
    direction: (((Math.atan2(-u, -v) * 180) / Math.PI) + 360) % 360,
  };
}
