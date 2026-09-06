import { fromZonedTime } from "date-fns-tz";
import { fetchWithRetry, degreesToDirection } from "./weather-utils.js";
import createLogger from "./utils/logger.js";

const log = createLogger("wdl-weather");

export interface WdlStation {
  id: number;
  name: string;
  lat: number;
  lon: number;
  url: string;
}

export interface WportStation {
  id: number;
  name: string;
  lat: number;
  lon: number;
  url: string;
}

export interface WdlObservation {
  windSpeed: number;
  windGust: number;
  direction: string;
  stationName: string;
  stationLat: number;
  stationLon: number;
  timestamp: string;
}

const WDL_STATIONS: WdlStation[] = [
  {
    id: 103,
    name: "Somers Yacht Club — Western Port",
    lat: -38.393863,
    lon: 145.1569358,
    url: "http://www.somersyc.com.au/weather/somers/clientraw.txt",
  },
];

const WPORT_STATIONS: WportStation[] = [
  {
    id: 104,
    name: "Westernport Yacht Club Buoy — Western Port",
    lat: -38.405162,
    lon: 145.1285453,
    url: "https://www.weather.westernport.org.au/YWP/Weather/Data/CurrentDB.txt",
  },
];

export function getWdlStations(): WdlStation[] {
  return WDL_STATIONS;
}

export function getWportStations(): WportStation[] {
  return WPORT_STATIONS;
}

export function getWdlStationId(station: WdlStation): string {
  return `wdl-${station.id}`;
}

export function getWportStationId(station: WportStation): string {
  return `wport-${station.id}`;
}

export function parseWdlStationId(stationId: string): { id: number } | null {
  const match = stationId.match(/^wdl-(\d+)$/);
  if (!match) return null;
  return { id: parseInt(match[1], 10) };
}

export function parseWportStationId(stationId: string): { id: number } | null {
  const match = stationId.match(/^wport-(\d+)$/);
  if (!match) return null;
  return { id: parseInt(match[1], 10) };
}

// clientraw.txt field indices (space-delimited):
// [0]=header, [1]=wind speed (kt), [2]=gust (kt), [3]=direction (degrees),
// [4]=temp (°C), [5]=humidity (%), [6]=pressure (hPa)
export async function fetchWdlObservation(stationId: number): Promise<WdlObservation | null> {
  const station = WDL_STATIONS.find(s => s.id === stationId);
  if (!station) {
    log.error(`WDL: Unknown station ID ${stationId}`);
    return null;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(station.url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const fields = text.trim().split(/\s+/);
    const windSpeed = Math.round(parseFloat(fields[1]) || 0);
    const windGust = Math.round(parseFloat(fields[2]) || 0);
    const dirDeg = parseFloat(fields[3]);
    const direction = Number.isFinite(dirDeg) ? degreesToDirection(dirDeg) : "N/A";
    return {
      windSpeed,
      windGust,
      direction,
      stationName: station.name,
      stationLat: station.lat,
      stationLon: station.lon,
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    log.error(`WDL: Failed to fetch station ${stationId}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

// Westernport buoy pipe-delimited format:
// ID|Date|Time|MinKnt|MeanKnt|MaxKnt|...|DirMeanTrue|DirStrTrue|TempC|Humid|Pressure|
// Date = YYYY/MM/DD, Time = HH:MM, timezone = Australia/Melbourne (AEST/AEDT)
export async function fetchWportObservation(stationId: number): Promise<WdlObservation | null> {
  const station = WPORT_STATIONS.find(s => s.id === stationId);
  if (!station) {
    log.error(`Wport: Unknown station ID ${stationId}`);
    return null;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(station.url, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();

    // Find the data row (skip the header line)
    const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
    const dataLine = lines.find(l => !l.startsWith('ID') && l.includes('|'));
    if (!dataLine) {
      log.warn(`Wport: No data row found for station ${stationId}`);
      return null;
    }

    const parts = dataLine.split('|');
    // Header: ID|Date|Time|MinKnt|MeanKnt|MaxKnt|...|DirMeanTrue|DirStrTrue|TempC|Humid|Pressure|
    // Find columns by reading the header line
    const headerLine = lines.find(l => l.startsWith('ID'));
    if (!headerLine) {
      log.warn(`Wport: No header line found for station ${stationId}`);
      return null;
    }
    const headers = headerLine.split('|');
    const col = (name: string) => headers.indexOf(name);

    const dateStr = parts[col('Date')]?.trim();  // YYYY/MM/DD
    const timeStr = parts[col('Time')]?.trim();  // HH:MM
    const meanKnt = parseFloat(parts[col('MeanKnt')] || '0');
    const maxKnt  = parseFloat(parts[col('MaxKnt')]  || '0');
    const dirMean = parseFloat(parts[col('DirMeanTrue')] || '0');

    const windSpeed = Math.round(meanKnt);
    const windGust  = Math.round(maxKnt);
    const direction = Number.isFinite(dirMean) ? degreesToDirection(dirMean) : "N/A";

    let timestamp: string;
    if (dateStr && timeStr) {
      // Date is YYYY/MM/DD — convert to ISO for parsing
      const isoDate = dateStr.replace(/\//g, '-');
      try {
        timestamp = fromZonedTime(`${isoDate}T${timeStr}:00`, "Australia/Melbourne").toISOString();
      } catch {
        timestamp = new Date().toISOString();
      }
    } else {
      timestamp = new Date().toISOString();
    }

    return {
      windSpeed,
      windGust,
      direction,
      stationName: station.name,
      stationLat: station.lat,
      stationLon: station.lon,
      timestamp,
    };
  } catch (err) {
    log.error(`Wport: Failed to fetch station ${stationId}: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
