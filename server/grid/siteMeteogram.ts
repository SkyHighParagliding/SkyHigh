// Per-site meteogram series: a single-point hourly time series assembled for the
// site-page Thermal panel's chart view. This is the data half of Stage 1 of the
// SkyHigh meteogram (see wiki/future/meteogram-plan.md).
//
// Two sources are merged, exactly as scoped:
//   - Thermal grid (extractThermalGrid): blh, cape, wstar, ccl, li, cloud,
//     cloudLow — sampled at the nearest cell to the site. Using the same overlay
//     the wind map renders guarantees the chart's thermal-strength band matches
//     the map's colours (both feed getThermalStrength(effectiveWstar(...))).
//   - Fine grid (findNearestPoint): wind_speed_10m, wind_direction_10m,
//     precipitation, precipitation_probability — the surface wind strip and
//     rain/overdevelopment icons. W* cannot come from the fine grid: it lacks
//     the shortwave_radiation + soil_moisture inputs computeWstar needs.
//
// No new fetch: both grids are already cached for the wind/thermal map.

import { getCachedThermalGrid, fetchThermalGrid } from "./thermalGrid.js";
import { getCachedFineGrid } from "./fineGrid.js";
import { extractThermalGrid, findNearestPoint, type ThermalCell, type ThermalOverlay } from "./extract.js";

export interface MeteogramHour {
  /** Melbourne-local `YYYY-MM-DDTHH:mm`, matching both grids' time axes. */
  time: string;
  /** Boundary-layer top, m above ground (the thermal ceiling). */
  blh: number | null;
  /** Thermal ceiling in m AMSL (blh + launch elevation), when launch height is known. */
  ceilingAmsl: number | null;
  cape: number | null;
  /** Deardorff convective velocity, m/s — drives the thermal-strength colour. */
  wstar: number | null;
  /** Convective condensation level (cumulus base), m above ground. */
  ccl: number | null;
  /** Lifted index, °C (negative = unstable). Absent on lower-tier grids. */
  li: number | null;
  /** Total cloud cover, %. */
  cloud: number | null;
  /** Low cloud cover, %. */
  cloudLow: number | null;
  /** Surface wind speed, knots. */
  windSpeed: number | null;
  /** Surface wind direction, degrees FROM. */
  windDir: number | null;
  /** Precipitation, mm/hr. */
  precip: number | null;
  /** Precipitation probability, %. */
  precipProb: number | null;
  /** WMO weather code — distinguishes drizzle / rain / showers / snow. */
  weatherCode: number | null;
}

export interface SiteMeteogram {
  siteId: string;
  /** Launch altitude AMSL, m (from sites.launchHeight); null when unset. */
  launchElevation: number | null;
  times: string[];
  hours: MeteogramHour[];
  source: "ecmwf";
}

/** Finite number or null — NaN gaps (optional vars on some tiers) become null. */
function num(v: number | undefined | null): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Nearest thermal-overlay cell to (lat, lon) at a given time index. */
function sampleThermalCell(
  overlay: ThermalOverlay,
  timeIdx: number,
  lat: number,
  lon: number,
): ThermalCell | null {
  const i = Math.round((lon - overlay.lonMin) / overlay.deltaLon);
  const j = Math.round((lat - overlay.latMin) / overlay.deltaLat);
  if (i < 0 || i >= overlay.ni || j < 0 || j >= overlay.nj) return null;
  return overlay.data[timeIdx]?.[j * overlay.ni + i] ?? null;
}

export async function buildSiteMeteogram(
  siteId: string,
  lat: number,
  lon: number,
  launchElevation: number | null,
): Promise<SiteMeteogram | null> {
  let thermal = await getCachedThermalGrid();
  if (!thermal) {
    try { thermal = await fetchThermalGrid(); } catch { /* handled below */ }
  }
  if (!thermal) return null;

  const overlay = extractThermalGrid(thermal);
  if (!overlay) return null;

  // Fine grid is best-effort: the chart still renders (ceiling + band + cloud)
  // if it is missing, just without the wind strip / rain icons.
  const fine = await getCachedFineGrid();
  const nearestFine = fine ? findNearestPoint(fine, lat, lon) : null;
  const fineHourly = nearestFine?.hourly ?? null;

  const fineTimeIdx = new Map<string, number>();
  fineHourly?.time.forEach((t, i) => fineTimeIdx.set(t, i));

  const hours: MeteogramHour[] = overlay.times.map((time, tIdx) => {
    const cell = sampleThermalCell(overlay, tIdx, lat, lon);
    const blh = cell ? num(cell.blh) : null;
    const fi = fineTimeIdx.get(time);
    const hasFine = fi !== undefined && fineHourly != null;

    return {
      time,
      blh,
      ceilingAmsl: blh !== null && launchElevation !== null ? Math.round(blh + launchElevation) : null,
      cape: cell ? num(cell.cape) : null,
      wstar: cell ? num(cell.wstar) : null,
      ccl: cell ? num(cell.ccl) : null,
      li: cell ? num(cell.li) : null,
      cloud: cell ? num(cell.cloud) : null,
      cloudLow: cell ? num(cell.cloudLow) : null,
      windSpeed: hasFine ? num(fineHourly!.wind_speed_10m[fi!]) : null,
      windDir: hasFine ? num(fineHourly!.wind_direction_10m[fi!]) : null,
      precip: hasFine ? num(fineHourly!.precipitation[fi!]) : null,
      precipProb: hasFine ? num(fineHourly!.precipitation_probability[fi!]) : null,
      weatherCode: hasFine ? num(fineHourly!.weather_code[fi!]) : null,
    };
  });

  return { siteId, launchElevation, times: overlay.times, hours, source: "ecmwf" };
}
