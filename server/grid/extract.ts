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
import { getWeatherCodeSummary, degreesToDirection } from "../weather-utils.js";
import type { GridPoint, ThermalPoint, ThermalVictoriaGrid, VictoriaGrid } from "./bounds.js";

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
 * Selects the 36-hour render window starting at 05:00 Melbourne today.
 * Falls back to index 0 when the grid does not reach today (stale data).
 */
export function getTimeWindow(allTimes: string[]): { startIdx: number; selectedTimes: string[] } {
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

  return { startIdx, selectedTimes: allTimes.slice(startIdx, startIdx + 36) };
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
  // No `?? 0` here: 0 is "Clear sky", and the fallback tiers do not carry
  // weather_code at all. Defaulting would show a sun icon for a point we have
  // no sky observation for. An absent code falls through to "Unknown".
  const weatherCode = nearest.hourly.weather_code[hourIdx];
  const time = nearest.hourly.time[hourIdx];

  const { text: summary, icon } = getWeatherCodeSummary(weatherCode);
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
    const { icon: hIcon, text: hSummary } = getWeatherCodeSummary(hCode);
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

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);
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

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);
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

export function extractThermalGrid(grid: ThermalVictoriaGrid): ThermalOverlay | null {
  if (!grid.points.length) return null;
  const firstPoint = grid.points[0];
  if (!firstPoint.hourly?.time) return null;

  const cacheKey = `thermal_${grid.fetchedAt}`;
  if (cachedThermalOverlay && cacheKey === cachedThermalOverlayKey) {
    return cachedThermalOverlay as ThermalOverlay;
  }

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);

  const subLons = [...new Set(grid.points.map(p => p.lon))].sort((a, b) => a - b);
  const subLats = [...new Set(grid.points.map(p => p.lat))].sort((a, b) => a - b);

  const pointMap = new Map<string, ThermalPoint>();
  for (const p of grid.points) {
    pointMap.set(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, p);
  }

  const data: Array<Array<ThermalCell | null>> = [];

  for (let t = 0; t < selectedTimes.length; t++) {
    const timeIdx = startIdx + t;
    const timeStepData: Array<ThermalCell | null> = [];
    for (const lat of subLats) {
      for (const lon of subLons) {
        const point = pointMap.get(`${lat.toFixed(4)},${lon.toFixed(4)}`);
        if (point && timeIdx < (point.hourly.cape?.length ?? 0)) {
          const t2m = point.hourly.temperature_2m?.[timeIdx] ?? 15;
          const td2m = point.hourly.dew_point_2m?.[timeIdx] ?? 10;
          const hasTd = Array.isArray(point.hourly.temperature_2m) && point.hourly.temperature_2m.length > 0;
          timeStepData.push({
            cape: point.hourly.cape[timeIdx] ?? 0,
            blh: point.hourly.boundary_layer_height[timeIdx] ?? 0,
            wstar: undefined,
            ccl: hasTd ? computeCCL(t2m, td2m) : undefined,
          });
        } else {
          timeStepData.push(null);
        }
      }
    }
    data.push(timeStepData);
  }

  const result: ThermalOverlay = {
    lonMin: parseFloat(subLons[0].toFixed(4)),
    lonMax: parseFloat(subLons[subLons.length - 1].toFixed(4)),
    latMin: parseFloat(subLats[0].toFixed(4)),
    latMax: parseFloat(subLats[subLats.length - 1].toFixed(4)),
    deltaLon: grid.delta,
    deltaLat: grid.delta,
    ni: subLons.length,
    nj: subLats.length,
    times: selectedTimes,
    data,
  };

  cachedThermalOverlay = result;
  cachedThermalOverlayKey = cacheKey;
  return result;
}
