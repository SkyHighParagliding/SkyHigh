// Per-point vertical sounding for the interactive SkewT. One Open-Meteo REST
// call (models=ecmwf_ifs025 — the only Open-Meteo ECMWF model that serves
// pressure levels, and the same model the thermal grid's lifted index derives
// from) returns the whole day's profile for a point. Pressure-level dewpoint is
// derived from T + RH (Open-Meteo has no level dewpoint). Cached ~6 h.
//
// This is user-triggered (tap a point → SkewT), so volume is tiny compared with
// the daily grid fetch — one point, cached.

import createLogger from "../utils/logger.js";
import { fetchWithRetry } from "../weather-utils.js";
import { OPEN_METEO_API_KEY, OPEN_METEO_URL } from "../utils/openMeteo.js";
import { dewpointFromRH } from "./parcel.js";

const log = createLogger("grid:sounding");

/** Pressure levels sampled, hPa — dense low down where thermals live. */
const LEVELS = [1000, 950, 925, 900, 850, 800, 700, 600, 500, 400] as const;

export interface SoundingLevel {
  p: number;       // hPa
  zAmsl: number;   // geopotential height, m AMSL
  t: number;       // °C
  td: number;      // °C (derived from RH)
  windSpd: number; // kt
  windDir: number; // deg FROM
}

export interface SoundingHour {
  time: string; // YYYY-MM-DDTHH:mm (Melbourne)
  surface: {
    pressure: number; // hPa
    t: number;        // °C
    td: number;       // °C
    windSpd: number;  // kt
    windDir: number;  // deg FROM
    cape: number | null;
    cloud: number | null;
    weatherCode: number | null;
  };
  /** Pressure-level points above the surface, ascending altitude. */
  levels: SoundingLevel[];
}

export interface PointSounding {
  lat: number;
  lon: number;
  times: string[];
  hours: SoundingHour[];
  source: "ecmwf_ifs025";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// 6 h in-memory cache keyed by ~cell (Open-Meteo's ifs025 grid is 0.25° anyway).
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { t: number; data: PointSounding }>();

export async function fetchPointSounding(
  lat: number,
  lon: number,
  forecastDays = 2,
): Promise<PointSounding | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.data;

  const surfaceFields = [
    "temperature_2m", "dew_point_2m", "wind_speed_10m", "wind_direction_10m",
    "surface_pressure", "cape", "cloud_cover", "weather_code",
  ];
  const levelFields = LEVELS.flatMap(L => [
    `temperature_${L}hPa`, `relative_humidity_${L}hPa`,
    `wind_speed_${L}hPa`, `wind_direction_${L}hPa`, `geopotential_height_${L}hPa`,
  ]);

  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    hourly: [...surfaceFields, ...levelFields].join(","),
    models: "ecmwf_ifs025",
    wind_speed_unit: "kn",
    timezone: "Australia/Melbourne",
    forecast_days: String(forecastDays),
  });
  if (OPEN_METEO_API_KEY) params.set("apikey", OPEN_METEO_API_KEY);

  let raw: any;
  try {
    raw = await fetchWithRetry(`${OPEN_METEO_URL}?${params.toString()}`);
  } catch (e) {
    log.warn(`point sounding fetch failed for ${key}: ${String(e)}`);
    return null;
  }

  const h = raw?.hourly;
  if (!h?.time?.length) {
    log.warn(`point sounding empty for ${key}`);
    return null;
  }

  const times: string[] = h.time;
  const hours: SoundingHour[] = times.map((time: string, i: number) => {
    const sfcP = num(h.surface_pressure?.[i]) ?? 1013;
    const levels: SoundingLevel[] = [];
    for (const L of LEVELS) {
      if (L > sfcP) continue; // underground at this elevation
      const t = num(h[`temperature_${L}hPa`]?.[i]);
      const z = num(h[`geopotential_height_${L}hPa`]?.[i]);
      if (t === null || z === null) continue; // level unusable
      const rh = num(h[`relative_humidity_${L}hPa`]?.[i]);
      levels.push({
        p: L,
        zAmsl: z,
        t,
        td: rh !== null ? dewpointFromRH(t, rh) : t,
        windSpd: num(h[`wind_speed_${L}hPa`]?.[i]) ?? 0,
        windDir: num(h[`wind_direction_${L}hPa`]?.[i]) ?? 0,
      });
    }
    // LEVELS descend in pressure, so `levels` is already ascending in altitude.
    return {
      time,
      surface: {
        pressure: sfcP,
        t: num(h.temperature_2m?.[i]) ?? 0,
        td: num(h.dew_point_2m?.[i]) ?? 0,
        windSpd: num(h.wind_speed_10m?.[i]) ?? 0,
        windDir: num(h.wind_direction_10m?.[i]) ?? 0,
        cape: num(h.cape?.[i]),
        cloud: num(h.cloud_cover?.[i]),
        weatherCode: num(h.weather_code?.[i]),
      },
      levels,
    };
  });

  const data: PointSounding = { lat, lon, times, hours, source: "ecmwf_ifs025" };
  cache.set(key, { t: Date.now(), data });
  return data;
}
