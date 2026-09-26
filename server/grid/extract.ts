/**
 * Read-side extraction helpers.
 *
 * These turn a persisted grid into the payload shapes the client renderers
 * expect (wind overlay, particle field, thermal overlay, per-site forecast).
 * These are the read side of the grid layer and are deliberately independent
 * of how the grid was fetched: they operate on the persisted shape only.
 */

import { fromZonedTime } from "date-fns-tz";
import createLogger from "../utils/logger.js";
import { deriveWeatherPresentation, degreesToDirection } from "../weather-utils.js";
import type { GridPoint, ThermalPoint, ThermalVictoriaGrid, VictoriaGrid } from "./bounds.js";
import { FORECAST_DAYS } from "./pipeline.js";

/** Hours the wind/thermal MAP overlays expose on the slider — the full fetched
 *  window (FORECAST_DAYS × 24, from 05:00). The site-point forecast/tide window
 *  keeps the 36 h default. Computed at each call (not module load) so it is
 *  immune to import-order edge cases. */
const mapWindowHours = () => FORECAST_DAYS * 24;

const log = createLogger("grid:extract");

// ---------------------------------------------------------------------------
// Overlay memoisation
// ---------------------------------------------------------------------------

let cachedFullWindOverlay: unknown = null;
let cachedFullWindOverlayKey = "";
let cachedThermalOverlay: unknown = null;
let cachedThermalOverlayKey = "";

export function clearOverlayCaches(): void {
  cachedFullWindOverlay = null;
  cachedFullWindOverlayKey = "";
  cachedThermalOverlay = null;
  cachedThermalOverlayKey = "";
}

// ---------------------------------------------------------------------------
// Time window
// ---------------------------------------------------------------------------

/**
 * Selects a render window of `windowHours` hourly steps starting at 05:00
 * Melbourne today (default 36 h for the site-point forecast / tide window; the
 * map overlays pass the full fetched window, MAP_WINDOW_HOURS). Falls back to
 * index 0 when the grid does not reach today (stale data). `slice` naturally
 * caps at the end of the grid, so overshooting the last stored hour is harmless.
 */
export function getTimeWindow(allTimes: string[], windowHours = 36): { startIdx: number; selectedTimes: string[] } {
  const now = new Date();
  const melbourneFormatter = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateParts: Record<string, string> = {};
  melbourneFormatter.formatToParts(now).forEach(p => { dateParts[p.type] = p.value; });
  const todayStr = `${dateParts.year}-${dateParts.month}-${dateParts.day}T05:00`;

  let startIdx = allTimes.findIndex(t => t >= todayStr);
  if (startIdx === -1) startIdx = 0;

  return { startIdx, selectedTimes: allTimes.slice(startIdx, startIdx + windowHours) };
}

// ---------------------------------------------------------------------------
// Nearest-point lookup
// ---------------------------------------------------------------------------

export function findNearestPoint(grid: VictoriaGrid, lat: number, lon: number): GridPoint | null {
  let bestPoint: GridPoint | null = null;
  let bestDist = Infinity;

  for (const p of grid.points) {
    const dlat = p.lat - lat;
    const dlon = p.lon - lon;
    const dist = dlat * dlat + dlon * dlon;
    if (dist < bestDist) {
      bestDist = dist;
      bestPoint = p;
    }
  }

  return bestPoint;
}

// ---------------------------------------------------------------------------
// Per-site forecast
// ---------------------------------------------------------------------------

export interface SiteForecast {
  siteId: string;
  timestamp: string;
  temperature: number;
  windSpeed: number;
  windGust: number;
  windDirection: string;
  icon: string;
  summary: string;
  /** Pre-serialised hourly array — stored directly in weather_forecasts.forecasts. */
  forecasts: string;
}

export function extractSiteForecast(
  grid: VictoriaGrid,
  siteId: string,
  siteLat: number,
  siteLon: number,
): SiteForecast | null {
  const nearest = findNearestPoint(grid, siteLat, siteLon);
  if (!nearest || !nearest.hourly?.time) return null;

  const now = new Date();
  const melbourneTime = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    hour: "numeric",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const parts: Record<string, string> = {};
  melbourneTime.forEach(p => { parts[p.type] = p.value; });
  const hour = parseInt(parts.hour || "0");
  const dateStr = `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, "0")}:00`;

  let hourIdx = nearest.hourly.time.indexOf(dateStr);
  if (hourIdx === -1) {
    let fallbackIdx = -1;
    for (let i = nearest.hourly.time.length - 1; i >= 0; i--) {
      if (nearest.hourly.time[i] <= dateStr) { fallbackIdx = i; break; }
    }
    if (fallbackIdx === -1) fallbackIdx = 0;
    const gridEnd = nearest.hourly.time[nearest.hourly.time.length - 1];
    log.warn(`${dateStr} not in grid (grid ends ${gridEnd}), using ${nearest.hourly.time[fallbackIdx]} — fine grid is stale`);
    hourIdx = fallbackIdx;
  }

  if (hourIdx < 0 || hourIdx >= nearest.hourly.wind_speed_10m.length) {
    log.warn(`hourIdx ${hourIdx} out of bounds for ${siteId}`);
    return null;
  }

  const temp = nearest.hourly.temperature_2m[hourIdx] ?? 0;
  const windSpeed = Math.round(nearest.hourly.wind_speed_10m[hourIdx] ?? 0);
  const windGust = Math.round(nearest.hourly.wind_gusts_10m[hourIdx] ?? 0);
  const windDirection = degreesToDirection(nearest.hourly.wind_direction_10m[hourIdx] ?? 0);
  // weather_code is not on the S3 mirror; it arrives via a gap-tolerant REST
  // top-up and is frequently absent. Derive from precipitation + cloud_cover
  // (both core fields, always present) when the code is missing, so an overcast
  // rainy hour never renders as a sun icon. See deriveWeatherPresentation.
  const weatherCode = nearest.hourly.weather_code[hourIdx];
  const time = nearest.hourly.time[hourIdx];

  const { text: summary, icon } = deriveWeatherPresentation(
    weatherCode,
    nearest.hourly.precipitation?.[hourIdx],
    nearest.hourly.cloud_cover?.[hourIdx],
  );
  const timestamp = fromZonedTime(time, "Australia/Melbourne").toISOString();

  const melbDateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const dayStart = nearest.hourly.time.indexOf(`${melbDateStr}T08:00`);

  // Prefer the fixed 08:00–20:00 window; if the grid does not contain 08:00
  // (stale grid), fall back to the next six hours from "now".
  const windowStart = dayStart !== -1 ? dayStart : hourIdx;
  const windowLength = dayStart !== -1 ? 13 : 6;

  const forecastHours: Array<{
    timestamp: string;
    time: string;
    temperature: number;
    windSpeed: number;
    windGust: number;
    windDirection: string;
    icon: string;
    summary: string;
  }> = [];

  for (let h = 0; h < windowLength; h++) {
    const idx = windowStart + h;
    if (idx >= nearest.hourly.time.length) break;
    const hTime = nearest.hourly.time[idx];
    if (!hTime.startsWith(melbDateStr)) break;
    const hCode = nearest.hourly.weather_code[idx];
    const { icon: hIcon, text: hSummary } = deriveWeatherPresentation(
      hCode,
      nearest.hourly.precipitation?.[idx],
      nearest.hourly.cloud_cover?.[idx],
    );
    forecastHours.push({
      timestamp: fromZonedTime(hTime, "Australia/Melbourne").toISOString(),
      time: hTime.split("T")[1]?.slice(0, 5) ?? "",
      temperature: nearest.hourly.temperature_2m[idx],
      windSpeed: Math.round(nearest.hourly.wind_speed_10m[idx]),
      windGust: Math.round(nearest.hourly.wind_gusts_10m[idx]),
      windDirection: degreesToDirection(nearest.hourly.wind_direction_10m[idx]),
      icon: hIcon,
      summary: hSummary,
    });
  }

  return {
    siteId,
    timestamp,
    temperature: temp,
    windSpeed,
    windGust,
    windDirection,
    icon,
    summary,
    forecasts: JSON.stringify(forecastHours),
  };
}

// ---------------------------------------------------------------------------
// Wind overlay
// ---------------------------------------------------------------------------

export interface WindOverlay {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  deltaLon: number;
  deltaLat: number;
  ni: number;
  nj: number;
  times: string[];
  data: Array<Array<{ u: number; v: number }>>;
}

/** Converts hourly speed/direction into the u/v component matrix the renderer consumes. */
export function gridToWindData(
  points: GridPoint[],
  delta: number,
  startIdx: number,
  selectedTimes: string[],
): WindOverlay {
  const subLons = [...new Set(points.map(p => p.lon))].sort((a, b) => a - b);
  const subLats = [...new Set(points.map(p => p.lat))].sort((a, b) => a - b);

  const pointMap = new Map<string, GridPoint>();
  for (const p of points) {
    pointMap.set(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, p);
  }

  const gridDataByTime: Array<Array<{ u: number; v: number }>> = [];

  for (let t = 0; t < selectedTimes.length; t++) {
    const timeIdx = startIdx + t;
    const timeStepData: Array<{ u: number; v: number }> = [];

    for (const lat of subLats) {
      for (const lon of subLons) {
        const point = pointMap.get(`${lat.toFixed(4)},${lon.toFixed(4)}`);

        if (point && timeIdx < point.hourly.wind_speed_10m.length) {
          const speedMs = point.hourly.wind_speed_10m[timeIdx] * 0.514444;
          const angleRad = (point.hourly.wind_direction_10m[timeIdx] * Math.PI) / 180;
          timeStepData.push({
            u: parseFloat((-speedMs * Math.sin(angleRad)).toFixed(3)),
            v: parseFloat((-speedMs * Math.cos(angleRad)).toFixed(3)),
          });
        } else {
          timeStepData.push({ u: 0, v: 0 });
        }
      }
    }

    gridDataByTime.push(timeStepData);
  }

  return {
    lonMin: parseFloat(subLons[0].toFixed(4)),
    lonMax: parseFloat(subLons[subLons.length - 1].toFixed(4)),
    latMin: parseFloat(subLats[0].toFixed(4)),
    latMax: parseFloat(subLats[subLats.length - 1].toFixed(4)),
    deltaLon: delta,
    deltaLat: delta,
    ni: subLons.length,
    nj: subLats.length,
    times: selectedTimes,
    data: gridDataByTime,
  };
}

export function extractFullWindGrid(grid: VictoriaGrid): WindOverlay | null {
  if (!grid.points.length) return null;

  const firstPoint = grid.points[0];
  if (!firstPoint.hourly?.time) return null;

  const melbNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
  const melbDate = `${melbNow.getFullYear()}-${String(melbNow.getMonth() + 1).padStart(2, "0")}-${String(melbNow.getDate()).padStart(2, "0")}`;
  const cacheKey = `${grid.fetchedAt}|${melbDate}`;

  if (cachedFullWindOverlay && cacheKey === cachedFullWindOverlayKey) {
    return cachedFullWindOverlay as WindOverlay;
  }

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time, mapWindowHours());
  const result = gridToWindData(grid.points, grid.delta, startIdx, selectedTimes);

  cachedFullWindOverlay = result;
  cachedFullWindOverlayKey = cacheKey;
  return result;
}

export function extractWindParticles(grid: VictoriaGrid, siteLat: number, siteLon: number): WindOverlay | null {
  const spread = 1.5;

  const relevantPoints = grid.points.filter(p =>
    p.lat >= siteLat - spread - grid.delta && p.lat <= siteLat + spread + grid.delta &&
    p.lon >= siteLon - spread - grid.delta && p.lon <= siteLon + spread + grid.delta
  );

  if (relevantPoints.length === 0) return null;

  const firstPoint = relevantPoints[0];
  if (!firstPoint.hourly?.time) return null;

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time, mapWindowHours());
  return gridToWindData(relevantPoints, grid.delta, startIdx, selectedTimes);
}

// ---------------------------------------------------------------------------
// Thermal overlay
// ---------------------------------------------------------------------------

export interface ThermalCell {
  cape: number;
  blh: number;
  wstar?: number;
  ccl?: number;
  /** Lifted Index (°C). Negative values indicate instability — the parcel is
   *  warmer than the environment aloft. Tier-1 (Open-Meteo REST API) only;
   *  undefined when the grid was supplied by a lower tier. */
  li?: number;
  /** Convective inhibition (J/kg). Measures the energy cap that must be
   *  overcome before free convection begins. Tier-1 and tier-2. */
  cin?: number;
  /** Total cloud cover, %. Undefined on grids cached before TASK-036; the
   *  renderer treats absence as "data not available" and degrades to today's
   *  behaviour (no grey overlay, full cumulus lattice). */
  cloud?: number;
  /** Low cloud cover (below ~2 km), %. Same provenance caveat as `cloud`.
   *  Low cloud is the sheet that actually shades the ground — stratiform
   *  overcast at altitude can have high total cover with negligible low cover. */
  cloudLow?: number;
  /** Precipitation, mm/hr. Optional; absent on grids cached before it was added.
   *  Drives the translucent blue rain wash on the thermal map. */
  precip?: number;
  /** WMO weather code. Optional; distinguishes drizzle / rain / showers / snow.
   *  Categorical — must be nearest-sampled, never interpolated. */
  weatherCode?: number;
}

export interface ThermalOverlay {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  deltaLon: number;
  deltaLat: number;
  ni: number;
  nj: number;
  times: string[];
  data: Array<Array<ThermalCell | null>>;
}

/** Empirical convective condensation level: 1 °C of T−Td spread ≈ 125 m cloud base AGL. */
export function computeCCL(t2m: number, td2m: number): number {
  return Math.max(0, t2m - td2m) * 125;
}

// --- W* (Deardorff convective velocity scale) -------------------------------
//
// W* is the quantity soaring forecasts (RASP, SkySight) actually colour their
// thermal maps by: it scales with the average climb a well-centred thermal will
// give. Until now this grid carried no W* at all and the renderer fell back to
// sqrt(CAPE/100), which is a poor stand-in — CAPE measures deep-convection
// energy, so it reads near zero on plenty of excellent blue XC days and reads
// high on storm days that are unflyable.
//
// The textbook form needs the surface sensible heat flux H:
//
//     w* = [ (g / θ) · (H / (ρ·cp)) · z_i ]^(1/3)
//
// Open-Meteo does publish sensible_heat_flux, but only for GFS — ECMWF returns
// null for it. Tiers 1 and 2 are both ECMWF, and mixing model families across
// the grid produces a visible seam, so H has to be derived from fields ECMWF
// does carry. Everything below uses only shortwave_radiation, soil moisture,
// boundary_layer_height and temperature_2m, all of which are served by BOTH the
// tier-1 REST API and the tier-2 S3 archive. (ECMWF's own `albedo` field is in
// the S3 archive but returns null from the REST API, so a constant is used
// instead rather than leaving a 1000-point hole wherever tier 1 supplied data.)

/** Typical broadleaf/pasture albedo. ECMWF's own albedo field is not available on tier 1. */
const LAND_ALBEDO = 0.20;
/** Representative daytime net longwave loss, W/m². Also what makes w* fall to 0 near dawn/dusk. */
const NET_LONGWAVE_LOSS = 90;
/** Ground heat flux as a fraction of net radiation. */
const GROUND_FLUX_FRACTION = 0.1;
/** Volumetric soil moisture (m³/m³) at which the ground behaves as fully wet. */
const SOIL_SATURATION = 0.35;
/** Bowen ratio endpoints: parched ground partitions most energy into heat, wet ground into evaporation. */
const BOWEN_DRY = 5.0;
const BOWEN_WET = 0.3;

const AIR_DENSITY = 1.2;      // kg/m³
const AIR_HEAT_CAPACITY = 1005; // J/(kg·K)
const GRAVITY = 9.81;

/**
 * Boundary layers shallower than this are not usable lift regardless of what the
 * flux arithmetic says — without it, a 60 m nocturnal layer under weak sun still
 * produces a non-zero w* and paints colour on the map before sunrise.
 */
const MIN_USABLE_BLH = 300;

/**
 * Deardorff convective velocity scale, m/s. Returns undefined when any input is
 * missing, and 0 when conditions cannot support convection.
 *
 * @param swDown       Downward shortwave radiation at the surface, W/m². Already
 *                     attenuated by the model's forecast cloud, which is why an
 *                     overcast day yields weak w* without needing a cloud term.
 * @param soilMoisture Volumetric soil moisture 0–7 cm, m³/m³. Sets the Bowen
 *                     ratio: a wet paddock after rain puts its energy into
 *                     evaporation and barely thermals even in full sun.
 * @param blh          Boundary layer height, m.
 * @param t2m          2 m temperature, °C — stands in for the mixed-layer potential temperature.
 */
export function computeWstar(
  swDown: number | undefined,
  soilMoisture: number | undefined,
  blh: number | undefined,
  t2m: number | undefined,
): number | undefined {
  if (![swDown, soilMoisture, blh, t2m].every(v => Number.isFinite(v))) return undefined;
  if (blh! < MIN_USABLE_BLH) return 0;

  const netRadiation = swDown! * (1 - LAND_ALBEDO) - NET_LONGWAVE_LOSS;
  if (netRadiation <= 0) return 0; // Surface losing heat — stable, no thermals.

  const wetness = Math.max(0, Math.min(1, soilMoisture! / SOIL_SATURATION));
  const bowen = BOWEN_DRY + (BOWEN_WET - BOWEN_DRY) * wetness;

  // Available energy splits between sensible and latent heat in the Bowen ratio.
  const sensibleHeatFlux =
    netRadiation * (1 - GROUND_FLUX_FRACTION) * (bowen / (1 + bowen));

  const kinematicFlux = sensibleHeatFlux / (AIR_DENSITY * AIR_HEAT_CAPACITY); // K·m/s
  const theta = t2m! + 273.15;

  return Math.cbrt((GRAVITY / theta) * kinematicFlux * blh!);
}

export function extractThermalGrid(grid: ThermalVictoriaGrid): ThermalOverlay | null {
  if (!grid.points.length) return null;
  const firstPoint = grid.points[0];
  if (!firstPoint.hourly?.time) return null;

  const cacheKey = `thermal_${grid.fetchedAt}`;
  if (cachedThermalOverlay && cacheKey === cachedThermalOverlayKey) {
    return cachedThermalOverlay as ThermalOverlay;
  }

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time, mapWindowHours());

  // The overlay is addressed by the renderer as a uniform lattice: it computes a
  // cell index from (lon - lonMin) / deltaLon. So ni and nj must come from the
  // lattice spacing, NOT from the count of distinct values present. The grid is
  // clipped to land, and a latitude band that happens to be all water (Bass
  // Strait) contributes no points at all — counting distinct values would drop
  // that row and slide everything south of it northward.
  // The lattice is anchored to the absolute 0-origin lattice that buildLandTiles
  // generates (every point is a multiple of `delta`), and each point is placed by
  // its rounded step index rather than by an exact coordinate-string match.
  //
  // Deriving the origin from Math.min(lon) instead makes the whole overlay hostage
  // to a single point: anything not sitting exactly on `lonMin + i * delta` shifts
  // the reconstructed origin off the lattice, and then every other point misses the
  // lookup and renders as a hole. That is what blanked ~90% of the overlay — the
  // stored latitudes were on-lattice (latMin/delta = -495.0000) while the longitude
  // extreme was not (lonMin/delta = 1544.4444). Index arithmetic cannot drift.
  const iOf = (lon: number) => Math.round(lon / grid.delta);
  const jOf = (lat: number) => Math.round(lat / grid.delta);

  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (const p of grid.points) {
    const i = iOf(p.lon), j = jOf(p.lat);
    if (i < i0) i0 = i;
    if (i > i1) i1 = i;
    if (j < j0) j0 = j;
    if (j > j1) j1 = j;
  }

  const ni = i1 - i0 + 1;
  const nj = j1 - j0 + 1;
  const lonMin = i0 * grid.delta;
  const lonMax = i1 * grid.delta;
  const latMin = j0 * grid.delta;
  const latMax = j1 * grid.delta;

  // Keyed by lattice step index, so a point that is a few decimals off its cell
  // centre still lands in the right cell instead of vanishing.
  const pointMap = new Map<string, ThermalPoint>();
  for (const p of grid.points) {
    pointMap.set(`${jOf(p.lat)},${iOf(p.lon)}`, p);
  }

  const data: Array<Array<ThermalCell | null>> = [];

  for (let t = 0; t < selectedTimes.length; t++) {
    const timeIdx = startIdx + t;
    const timeStepData: Array<ThermalCell | null> = [];
    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const point = pointMap.get(`${j0 + j},${i0 + i}`);
        if (point && timeIdx < (point.hourly.cape?.length ?? 0)) {
          // Both readings must be real. An earlier version defaulted to 15/10 °C,
          // which manufactured a 5 °C spread — a confident 625 m cloud base for a
          // point that carried no temperature at all. Absent is better than wrong.
          const t2m = point.hourly.temperature_2m?.[timeIdx];
          const td2m = point.hourly.dew_point_2m?.[timeIdx];
          const hasTd = Number.isFinite(t2m) && Number.isFinite(td2m);
          const blh = point.hourly.boundary_layer_height[timeIdx] ?? 0;
          const wstar = computeWstar(
            point.hourly.shortwave_radiation?.[timeIdx],
            point.hourly.soil_moisture_0_to_7cm?.[timeIdx],
            blh,
            t2m,
          );
          // NaN → undefined: seriesOf fills NaN for hours where a provider had
          // no data. Letting NaN reach the client would silently break `!= null`
          // guards (NaN != null is true), so we normalise here at the boundary.
          // This applies to all optional fields: li, cin, and the new cloud pair.
          const liRaw       = point.hourly.lifted_index?.[timeIdx];
          const cinRaw      = point.hourly.convective_inhibition?.[timeIdx];
          const cloudRaw    = point.hourly.cloud_cover?.[timeIdx];
          const cloudLowRaw = point.hourly.cloud_cover_low?.[timeIdx];
          const precipRaw   = point.hourly.precipitation?.[timeIdx];
          const wcRaw       = point.hourly.weather_code?.[timeIdx];
          // Every float below is emitted for every cell of every hour, so full
          // precision inflates the JSON (and the brotli output) for no visible
          // gain — the renderer buckets/rounds all of these anyway. Round at the
          // boundary: cape/blh/ccl/cin to whole units, wstar/precip to what the
          // legend resolves, li to 1 dp. (Same reasoning that already trimmed
          // wstar.) This roughly halves the payload vs raw floats.
          timeStepData.push({
            cape: Math.round(point.hourly.cape[timeIdx] ?? 0),
            blh: Math.round(blh),
            wstar: wstar === undefined ? undefined : Math.round(wstar * 100) / 100,
            ccl: hasTd ? Math.round(computeCCL(t2m!, td2m!)) : undefined,
            li:       (liRaw       != null && !Number.isNaN(liRaw))       ? Math.round(liRaw * 10) / 10 : undefined,
            cin:      (cinRaw      != null && !Number.isNaN(cinRaw))      ? Math.round(cinRaw)          : undefined,
            // cloud_cover and cloud_cover_low are absent on grids cached before
            // TASK-036 (their arrays won't exist on old ThermalPoint rows). The
            // optional-chained index already produces undefined in that case, but
            // an explicit NaN guard here keeps the contract watertight.
            cloud:    (cloudRaw    != null && !Number.isNaN(cloudRaw))    ? Math.round(cloudRaw)        : undefined,
            cloudLow: (cloudLowRaw != null && !Number.isNaN(cloudLowRaw)) ? Math.round(cloudLowRaw)     : undefined,
            precip:   (precipRaw   != null && !Number.isNaN(precipRaw))   ? Math.round(precipRaw * 10) / 10 : undefined,
            weatherCode: (wcRaw    != null && !Number.isNaN(wcRaw))       ? wcRaw       : undefined,
          });
        } else {
          timeStepData.push(null);
        }
      }
    }
    data.push(timeStepData);
  }

  // Fill isolated missing wstar/ccl by vertical interpolation. A provider can drop
  // a single latitude row of an input (e.g. temperature_2m missing at one lat
  // leaves BOTH wstar and ccl undefined across that whole row) — which renders as
  // a pale horizontal band on the thermal map. These fields are spatially smooth,
  // so when a cell is empty but both its N/S neighbours have a value, the mean is
  // a faithful fill. Only fills when both neighbours are present (isolated gaps),
  // never a large hole. Runs once per grid build (the overlay is cached).
  for (let t = 0; t < data.length; t++) {
    const layer = data[t];
    for (let j = 1; j < nj - 1; j++) {
      for (let i = 0; i < ni; i++) {
        const cell = layer[j * ni + i];
        if (!cell) continue;
        if (cell.wstar === undefined) {
          const a = layer[(j - 1) * ni + i]?.wstar, b = layer[(j + 1) * ni + i]?.wstar;
          if (a !== undefined && b !== undefined) cell.wstar = Math.round((a + b) * 50) / 100;
        }
        if (cell.ccl === undefined) {
          const a = layer[(j - 1) * ni + i]?.ccl, b = layer[(j + 1) * ni + i]?.ccl;
          if (a !== undefined && b !== undefined) cell.ccl = Math.round((a + b) / 2);
        }
      }
    }
  }

  const result: ThermalOverlay = {
    lonMin: parseFloat(lonMin.toFixed(4)),
    lonMax: parseFloat(lonMax.toFixed(4)),
    latMin: parseFloat(latMin.toFixed(4)),
    latMax: parseFloat(latMax.toFixed(4)),
    deltaLon: grid.delta,
    deltaLat: grid.delta,
    ni,
    nj,
    times: selectedTimes,
    data,
  };

  cachedThermalOverlay = result;
  cachedThermalOverlayKey = cacheKey;
  return result;
}
