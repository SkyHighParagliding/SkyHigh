import createLogger from "./utils/logger.js";

const log = createLogger("weather");
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchWithRetry(url: string, options: any = {}, retries = 5, backoff = 1000) {
  let lastStatusCode = 0;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout per attempt
    lastStatusCode = 0; // per-attempt: a previous attempt's status must not classify this one
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const statusCode = response.status;
        lastStatusCode = statusCode;
        // Include the body: APIs explain themselves there, and discarding it
        // turned a one-line Open-Meteo schema complaint into an opaque
        // "status: 400" that went unnoticed through many daily grid fetches.
        const detail = await response.text().catch(() => "");
        throw new Error(`HTTP error! status: ${statusCode}${detail ? ` — ${detail.slice(0, 300)}` : ""}`);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON but got ${contentType}: ${text.slice(0, 200)}`);
      }
      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (i === retries - 1) throw err;
      // 4xx means the request itself is wrong — retrying sends the identical
      // bad request again. Only transient failures (5xx, network, timeout)
      // deserve a retry. 429 is a 4xx too: back off at a higher level, or in
      // the grid's case escalate to another provider.
      if (lastStatusCode >= 400 && lastStatusCode < 500) throw err;
      const wait = backoff * Math.pow(2, i);
      log.warn(`Fetch failed (attempt ${i + 1}/${retries}). Retrying in ${wait}ms...`, err instanceof Error ? err.message : err);
      await delay(wait);
    }
  }
}

export function getWeatherCodeSummary(code: number): { text: string, icon: string } {
  const map: Record<number, { text: string, icon: string }> = {
    0: { text: "Clear sky", icon: "Sun" },
    1: { text: "Mainly clear", icon: "CloudSun" },
    2: { text: "Partly cloudy", icon: "CloudSun" },
    3: { text: "Overcast", icon: "Cloudy" },
    45: { text: "Fog", icon: "Cloud" },
    48: { text: "Depositing rime fog", icon: "Cloud" },
    51: { text: "Light drizzle", icon: "CloudDrizzle" },
    53: { text: "Moderate drizzle", icon: "CloudDrizzle" },
    55: { text: "Dense drizzle", icon: "CloudDrizzle" },
    61: { text: "Slight rain", icon: "CloudRain" },
    63: { text: "Moderate rain", icon: "CloudRain" },
    65: { text: "Heavy rain", icon: "CloudRain" },
    80: { text: "Slight rain showers", icon: "CloudRain" },
    81: { text: "Moderate rain showers", icon: "CloudRain" },
    82: { text: "Violent rain showers", icon: "CloudRain" },
    95: { text: "Thunderstorm", icon: "CloudLightning" },
  };
  return map[code] || { text: "Unknown", icon: "CloudSun" };
}

/**
 * Presentation (icon + text) for a forecast hour, resilient to a missing
 * `weather_code`.
 *
 * `weather_code` is not carried by the S3 grid mirror; it is restored by a
 * REST-API top-up (see fineGrid.ts FINE_TOP_UP) that is gap-tolerant — when the
 * top-up is unavailable the field is absent, NOT zero. Deriving the icon from
 * `weather_code` alone then collapses every hour to `getWeatherCodeSummary(undefined)`
 * = {"Unknown","CloudSun"}, i.e. a sunny icon during overcast rain, because the
 * `precipitation` and `cloud_cover` fields that ARE present were never consulted.
 *
 * When the code is present we defer to it (richest classification — drizzle vs
 * rain vs thunder vs snow); behaviour is then identical to before. When it is
 * absent we fall back to the core fields so the icon stays honest. Thresholds
 * validated against live ECMWF: 82 (showers)→CloudRain matches ≥0.5 mm; 51
 * (drizzle)→CloudDrizzle matches >0 mm; 3 (overcast)→Cloudy matches ≥85% cloud.
 */
/**
 * Synthesise a WMO weather code from the two fields the S3 grid mirror always
 * carries — precipitation (mm/hr) and total cloud cover (%). Used to fill
 * `weather_code` when the REST-API top-up that normally supplies it was
 * unavailable (rate-limited or its run cancelled — see fineGrid.ts / the
 * 2026-09-22 Open-Meteo incident). Deliberately coarse: it cannot distinguish
 * fog / thunder / snow (those need visibility / CAPE / temperature), so it maps
 * only to the precip+cloud codes and defers to the real code whenever present.
 * Thresholds validated against live ECMWF (0.5 mm ≈ showers, >0 ≈ drizzle,
 * ≥85% ≈ overcast). Codes chosen so getWeatherCodeSummary renders the right icon.
 */
export function deriveWeatherCode(
  precipitation: number | null | undefined,
  cloudCover: number | null | undefined,
): number {
  const p = Number.isFinite(precipitation as number) ? (precipitation as number) : 0;
  const c = Number.isFinite(cloudCover as number) ? (cloudCover as number) : 0;
  if (p >= 4)   return 65; // Heavy rain       → CloudRain
  if (p >= 1)   return 63; // Moderate rain    → CloudRain
  if (p >= 0.3) return 61; // Slight rain      → CloudRain
  if (p > 0)    return 51; // Light drizzle    → CloudDrizzle
  if (c >= 85)  return 3;  // Overcast         → Cloudy
  if (c >= 40)  return 2;  // Partly cloudy    → CloudSun
  return 0;                // Clear sky        → Sun
}

/**
 * Presentation (icon + text) for a forecast hour, resilient to a missing
 * `weather_code` — defers to the real code when present, else derives one from
 * precipitation + cloud_cover. See deriveWeatherCode for why the code can be
 * absent. Everything funnels through getWeatherCodeSummary so a derived code and
 * a real code render identically.
 */
export function deriveWeatherPresentation(
  weatherCode: number | null | undefined,
  precipitation: number | null | undefined,
  cloudCover: number | null | undefined,
): { text: string; icon: string } {
  const code = (weatherCode != null && Number.isFinite(weatherCode))
    ? weatherCode
    : deriveWeatherCode(precipitation, cloudCover);
  return getWeatherCodeSummary(code);
}

/**
 * Station-ID prefixes for the explicitly-handled live weather sources.
 * Weather Underground is the catch-all — any ID *without* one of these prefixes is a WU
 * station ID. Adding a new source means adding its prefix here, or WU will try to fetch it.
 */
export const NON_WU_STATION_PREFIXES = ['livewind-', 'freeflightwx-', 'bom-', 'davis-'];

export function isWuStationId(stationId: string): boolean {
  return !NON_WU_STATION_PREFIXES.some(prefix => stationId.startsWith(prefix));
}

export function degreesToDirection(degrees: number): string {
  const val = Math.floor((degrees / 22.5) + 0.5);
  const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return arr[(val % 16)];
}
