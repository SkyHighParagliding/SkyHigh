import { fetchWithRetry, degreesToDirection } from "./weather-utils.js";
import createLogger from "./utils/logger.js";

const log = createLogger("davis-weather");

export interface DavisStation {
  /** 32-char hex token from the station's public WeatherLink embeddable page URL. */
  token: string;
  name: string;
  lat: number;
  lon: number;
}

export interface DavisObservation {
  windSpeed: number;
  windGust: number;
  direction: string;
  stationName: string;
  stationLat: number;
  stationLon: number;
  timestamp: string;
}

// Davis stations published via a public WeatherLink embeddable page.
// To add one: open the club's public WeatherLink page and copy the token from the URL
// (https://www.weatherlink.com/embeddablePage/show/<token>/slim).
const DAVIS_STATIONS: DavisStation[] = [
  { token: "82c002b05de74cc5ab177b0ba2b73c80", name: "Mount Martha Yacht Club", lat: -38.2758, lon: 145.0055 },
];

export function getDavisStations(): DavisStation[] {
  return DAVIS_STATIONS;
}

export function getDavisStationId(station: DavisStation): string {
  return `davis-${station.token}`;
}

export function parseDavisStationId(stationId: string): { token: string } | null {
  // Format: davis-{token}  e.g. davis-82c002b05de74cc5ab177b0ba2b73c80
  const match = stationId.match(/^davis-([a-f0-9]{32})$/i);
  if (!match) return null;
  return { token: match[1].toLowerCase() };
}

/** Extracts the station token from a pasted WeatherLink embeddable page URL. */
export function parseDavisEmbedUrl(url: string): { token: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.hostname !== "weatherlink.com" && parsed.hostname !== "www.weatherlink.com") return null;
    // .../embeddablePage/show/{token}/slim  or  .../embeddablePage/getData/{token}
    const match = parsed.pathname.match(/\/embeddablePage\/(?:show|getData)\/([a-f0-9]{32})/i);
    if (!match) return null;
    return { token: match[1].toLowerCase() };
  } catch {
    return null;
  }
}

// windUnits is a per-station display preference, so the payload's units vary by station.
const TO_KNOTS: Record<string, number> = {
  "knots": 1,
  "kts": 1,
  "kt": 1,
  "mph": 0.868976,
  "km/h": 0.539957,
  "kmh": 0.539957,
  "kph": 0.539957,
  "m/s": 1.94384,
  "ms": 1.94384,
};

function toKnots(value: number, units: string | undefined): number | null {
  const key = String(units ?? "").toLowerCase().trim();
  const factor = TO_KNOTS[key];
  if (factor === undefined) return null;
  return value * factor;
}

// WeatherLink summaryData sensor type IDs for wind
const SENSOR_WIND_SPEED = 72;   // Current wind speed
const SENSOR_WIND_DIR = 73;     // Current wind direction (degrees)
const SENSOR_10MIN_AVG = 82;    // 10-min avg wind speed (fallback speed source)
const SENSOR_10MIN_HIGH = 85;   // 10-min high wind speed — this is the current observation gust

interface SummaryCondition {
  sensorDataTypeId: number | null;
  reportedValue: number | null;
  convertedValue: string | null;
  unitLabel: string | null;
}

interface SummaryData {
  lastReceived: number;
  currConditionValues: SummaryCondition[];
  noAccess?: boolean | null;
}

function findSensor(values: SummaryCondition[], id: number): SummaryCondition | undefined {
  return values.find(s => s.sensorDataTypeId === id);
}

const DAVIS_FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  "Accept": "application/json",
  "Referer": "https://www.weatherlink.com/",
};

export async function fetchDavisObservation(token: string): Promise<DavisObservation | null> {
  // summaryData exposes per-observation sensor readings including 10-min high wind (gust).
  // getData only exposes the daily maximum gust, which stays stuck for the rest of the day.
  const url = `https://www.weatherlink.com/embeddablePage/summaryData/${token}`;
  try {
    const data: SummaryData = await fetchWithRetry(url, { headers: DAVIS_FETCH_HEADERS });

    if (!data || !Array.isArray(data.currConditionValues)) {
      log.warn(`Davis summaryData: Empty or unexpected response for ${token}`);
      return fetchDavisObservationFallback(token);
    }
    if (data.noAccess) {
      log.warn(`Davis: Station ${token} is no longer publicly accessible`);
      return null;
    }

    const cv = data.currConditionValues;
    const speedSensor = findSensor(cv, SENSOR_WIND_SPEED) ?? findSensor(cv, SENSOR_10MIN_AVG);
    const dirSensor = findSensor(cv, SENSOR_WIND_DIR);
    const gustSensor = findSensor(cv, SENSOR_10MIN_HIGH);

    if (!speedSensor || speedSensor.convertedValue === null) {
      log.warn(`Davis summaryData: No wind speed sensor for ${token}`);
      return fetchDavisObservationFallback(token);
    }

    const rawSpeed = parseFloat(speedSensor.convertedValue);
    if (!Number.isFinite(rawSpeed)) {
      log.warn(`Davis summaryData: Non-numeric wind speed for ${token}`);
      return fetchDavisObservationFallback(token);
    }

    const speedKts = toKnots(rawSpeed, speedSensor.unitLabel ?? undefined);
    if (speedKts === null) {
      log.error(`Davis summaryData: Unrecognised windUnits "${speedSensor.unitLabel}" for ${token}`);
      return fetchDavisObservationFallback(token);
    }

    const rawGust = gustSensor?.convertedValue != null ? parseFloat(gustSensor.convertedValue) : null;
    const gustKts = rawGust !== null && Number.isFinite(rawGust)
      ? toKnots(rawGust, gustSensor!.unitLabel ?? undefined)
      : null;

    const windSpeed = Math.round(speedKts);
    const windGust = gustKts !== null ? Math.round(gustKts) : windSpeed;

    // Direction reportedValue is in degrees; convertedValue is a scaled integer (degrees * 22.5)
    const rawDir = dirSensor?.reportedValue ?? null;
    const direction = rawDir !== null && Number.isFinite(rawDir) ? degreesToDirection(rawDir) : "N/A";

    const station = DAVIS_STATIONS.find(s => s.token.toLowerCase() === token.toLowerCase());
    const stationName = station?.name ?? `Davis ${token.slice(0, 8)}`;

    const timestamp = Number.isFinite(data.lastReceived) && data.lastReceived > 0
      ? new Date(data.lastReceived).toISOString()
      : new Date().toISOString();

    return {
      windSpeed,
      windGust,
      direction,
      stationName,
      stationLat: station?.lat ?? 0,
      stationLon: station?.lon ?? 0,
      timestamp,
    };
  } catch (err) {
    log.error(`Davis summaryData: Failed to fetch ${token}: ${err instanceof Error ? err.message : err}`);
    return fetchDavisObservationFallback(token);
  }
}

// Fallback to the getData endpoint if summaryData is unavailable.
// NOTE: getData's "gust" field is the daily maximum, not the current observation gust.
async function fetchDavisObservationFallback(token: string): Promise<DavisObservation | null> {
  const url = `https://www.weatherlink.com/embeddablePage/getData/${token}`;
  try {
    const data = await fetchWithRetry(url, { headers: DAVIS_FETCH_HEADERS });
    if (!data || data.noAccess) return null;

    const rawSpeed = parseFloat(data.wind);
    if (!Number.isFinite(rawSpeed)) return null;

    const speedKts = toKnots(rawSpeed, data.windUnits);
    if (speedKts === null) return null;

    const windSpeed = Math.round(speedKts);

    const rawDir = Number(data.windDirection);
    const direction = Number.isFinite(rawDir) ? degreesToDirection(rawDir) : "N/A";

    const station = DAVIS_STATIONS.find(s => s.token.toLowerCase() === token.toLowerCase());
    const stationName = station?.name || data.systemLocation || `Davis ${token.slice(0, 8)}`;

    const lastReceived = Number(data.lastReceived);
    const timestamp = Number.isFinite(lastReceived) && lastReceived > 0
      ? new Date(lastReceived).toISOString()
      : new Date().toISOString();

    return {
      windSpeed,
      windGust: windSpeed, // getData gust is daily max — use speed as conservative fallback
      direction,
      stationName,
      stationLat: station?.lat ?? 0,
      stationLon: station?.lon ?? 0,
      timestamp,
    };
  } catch (err) {
    log.error(`Davis getData fallback: Failed for ${token}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
