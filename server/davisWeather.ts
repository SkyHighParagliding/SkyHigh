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

export async function fetchDavisObservation(token: string): Promise<DavisObservation | null> {
  const url = `https://www.weatherlink.com/embeddablePage/getData/${token}`;
  try {
    const data = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json",
        "Referer": "https://www.weatherlink.com/",
      },
    });

    if (!data) {
      log.warn(`Davis: Empty response for ${token}`);
      return null;
    }
    // The station owner can make the page private; the endpoint still returns 200.
    if (data.noAccess) {
      log.warn(`Davis: Station ${token} is no longer publicly accessible`);
      return null;
    }

    const rawSpeed = parseFloat(data.wind);
    if (!Number.isFinite(rawSpeed)) {
      log.warn(`Davis: No wind reading for ${token}`);
      return null;
    }
    const rawGust = parseFloat(data.gust);

    const speedKts = toKnots(rawSpeed, data.windUnits);
    if (speedKts === null) {
      log.error(`Davis: Unrecognised windUnits "${data.windUnits}" for ${token} — refusing to guess`);
      return null;
    }
    const gustKts = Number.isFinite(rawGust) ? toKnots(rawGust, data.windUnits) : null;

    const windSpeed = Math.round(speedKts);
    const windGust = gustKts !== null ? Math.round(gustKts) : windSpeed;

    const rawDir = Number(data.windDirection);
    const direction = Number.isFinite(rawDir) ? degreesToDirection(rawDir) : "N/A";

    // The registry name is more useful than systemLocation (e.g. "Mount Martha, VIC, AUS").
    const station = DAVIS_STATIONS.find(s => s.token.toLowerCase() === token.toLowerCase());
    const stationName = station?.name || data.systemLocation || `Davis ${token.slice(0, 8)}`;

    const lastReceived = Number(data.lastReceived);
    const timestamp = Number.isFinite(lastReceived) && lastReceived > 0
      ? new Date(lastReceived).toISOString()
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
    log.error(`Davis: Failed to fetch ${token}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
