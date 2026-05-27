import createLogger from "./utils/logger.js";
import { queryOne } from "./pg.js";

const log = createLogger("tides");

export interface TideStation {
  id: string;
  name: string;
  lat: number;
  lon: number;
  meanSeaLevel: number;
  tidalRange: number;
  phaseOffset: number;
  bomPort?: string;
  timezone: string;
}

export interface TidePrediction {
  time: string;
  height: number;
  type: "high" | "low";
}

export interface TideData {
  stationId: string;
  stationName: string;
  currentHeight: number;
  currentState: "rising" | "falling" | "high" | "low";
  percentFull: number;
  nextHigh: TidePrediction | null;
  nextLow: TidePrediction | null;
  predictions: TidePrediction[];
  fetchedAt: string;
  source: "bom" | "astronomical";
}

const STATE_TIMEZONES: Record<string, string> = {
  VIC: "Australia/Melbourne",
  NSW: "Australia/Sydney",
  QLD: "Australia/Brisbane",
  SA: "Australia/Adelaide",
  WA: "Australia/Perth",
  TAS: "Australia/Hobart",
  NT: "Australia/Darwin",
};

function getTimezoneForState(stateCode: string): string {
  return STATE_TIMEZONES[stateCode] || "Australia/Melbourne";
}

function getUtcOffsetForTimezone(tz: string, date: Date): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-AU", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    });
    const parts = fmt.formatToParts(date);
    const tzPart = parts.find(p => p.type === "timeZoneName");
    if (tzPart) {
      const match = tzPart.value.match(/GMT([+-]\d{1,2}(?::\d{2})?)/);
      if (match) {
        let offset = match[1];
        if (!offset.includes(":")) {
          offset = offset.replace(/([+-])(\d+)/, (_, sign, hrs) => `${sign}${hrs.padStart(2, "0")}:00`);
        }
        return offset;
      }
    }
  } catch {}
  return "+10:00";
}

const AUSTRALIAN_TIDE_STATIONS: TideStation[] = [
  { id: "au-melbourne", name: "Melbourne (Williamstown)", lat: -37.8567, lon: 144.8985, meanSeaLevel: 0.6, tidalRange: 0.8, phaseOffset: 0, bomPort: "VIC_TP008", timezone: "Australia/Melbourne" },
  { id: "au-geelong", name: "Geelong", lat: -38.1437, lon: 144.3600, meanSeaLevel: 0.55, tidalRange: 0.7, phaseOffset: 0.3, bomPort: "VIC_TP004", timezone: "Australia/Melbourne" },
  { id: "au-portland", name: "Portland", lat: -38.3434, lon: 141.6041, meanSeaLevel: 0.6, tidalRange: 0.9, phaseOffset: -0.8, bomPort: "VIC_TP007", timezone: "Australia/Melbourne" },
  { id: "au-warrnambool", name: "Warrnambool", lat: -38.3816, lon: 142.4800, meanSeaLevel: 0.6, tidalRange: 0.85, phaseOffset: -0.5, timezone: "Australia/Melbourne" },
  { id: "au-apollo-bay", name: "Apollo Bay", lat: -38.7590, lon: 143.6700, meanSeaLevel: 0.65, tidalRange: 1.0, phaseOffset: -0.3, timezone: "Australia/Melbourne" },
  { id: "au-lorne", name: "Lorne", lat: -38.5430, lon: 143.9790, meanSeaLevel: 0.6, tidalRange: 0.9, phaseOffset: -0.1, timezone: "Australia/Melbourne" },
  { id: "au-torquay", name: "Torquay", lat: -38.3290, lon: 144.3260, meanSeaLevel: 0.6, tidalRange: 0.85, phaseOffset: 0.1, timezone: "Australia/Melbourne" },
  { id: "au-portsea", name: "Portsea", lat: -38.3310, lon: 144.7170, meanSeaLevel: 0.7, tidalRange: 1.2, phaseOffset: 0.2, timezone: "Australia/Melbourne" },
  { id: "au-phillip-island", name: "Phillip Island", lat: -38.4830, lon: 145.2290, meanSeaLevel: 0.75, tidalRange: 1.4, phaseOffset: 0.4, bomPort: "VIC_TP012", timezone: "Australia/Melbourne" },
  { id: "au-wilsons-prom", name: "Wilsons Promontory", lat: -39.1200, lon: 146.4200, meanSeaLevel: 0.7, tidalRange: 1.3, phaseOffset: 0.6, timezone: "Australia/Melbourne" },
  { id: "au-lakes-entrance", name: "Lakes Entrance", lat: -37.8800, lon: 147.9900, meanSeaLevel: 0.5, tidalRange: 0.6, phaseOffset: 0.8, bomPort: "VIC_TP005", timezone: "Australia/Melbourne" },
  { id: "au-sydney", name: "Sydney (Fort Denison)", lat: -33.8553, lon: 151.2257, meanSeaLevel: 0.9, tidalRange: 1.4, phaseOffset: 1.2, bomPort: "NSW_TP015", timezone: "Australia/Sydney" },
  { id: "au-newcastle", name: "Newcastle", lat: -32.9272, lon: 151.7817, meanSeaLevel: 0.9, tidalRange: 1.5, phaseOffset: 1.1, bomPort: "NSW_TP012", timezone: "Australia/Sydney" },
  { id: "au-wollongong", name: "Wollongong", lat: -34.4249, lon: 150.8931, meanSeaLevel: 0.85, tidalRange: 1.3, phaseOffset: 1.3, timezone: "Australia/Sydney" },
  { id: "au-gold-coast", name: "Gold Coast", lat: -28.0000, lon: 153.4300, meanSeaLevel: 0.9, tidalRange: 1.6, phaseOffset: 1.5, bomPort: "QLD_TP007", timezone: "Australia/Brisbane" },
  { id: "au-brisbane", name: "Brisbane", lat: -27.3675, lon: 153.1100, meanSeaLevel: 1.2, tidalRange: 2.0, phaseOffset: 1.6, bomPort: "QLD_TP003", timezone: "Australia/Brisbane" },
  { id: "au-sunshine-coast", name: "Sunshine Coast (Mooloolaba)", lat: -26.6835, lon: 153.1189, meanSeaLevel: 0.9, tidalRange: 1.5, phaseOffset: 1.55, bomPort: "QLD_TP012", timezone: "Australia/Brisbane" },
  { id: "au-cairns", name: "Cairns", lat: -16.9186, lon: 145.7781, meanSeaLevel: 1.5, tidalRange: 2.5, phaseOffset: 2.0, bomPort: "QLD_TP004", timezone: "Australia/Brisbane" },
  { id: "au-townsville", name: "Townsville", lat: -19.2590, lon: 146.8169, meanSeaLevel: 1.5, tidalRange: 2.8, phaseOffset: 2.2, bomPort: "QLD_TP016", timezone: "Australia/Brisbane" },
  { id: "au-adelaide", name: "Adelaide (Outer Harbour)", lat: -34.7765, lon: 138.4811, meanSeaLevel: 1.0, tidalRange: 1.8, phaseOffset: -1.0, bomPort: "SA_TP003", timezone: "Australia/Adelaide" },
  { id: "au-hobart", name: "Hobart", lat: -42.8826, lon: 147.3281, meanSeaLevel: 0.6, tidalRange: 0.9, phaseOffset: 0.9, bomPort: "TAS_TP003", timezone: "Australia/Hobart" },
  { id: "au-perth", name: "Perth (Fremantle)", lat: -32.0569, lon: 115.7439, meanSeaLevel: 0.6, tidalRange: 0.5, phaseOffset: -2.0, bomPort: "WA_TP006", timezone: "Australia/Perth" },
  { id: "au-darwin", name: "Darwin", lat: -12.4634, lon: 130.8456, meanSeaLevel: 4.0, tidalRange: 6.0, phaseOffset: -3.0, bomPort: "NT_TP001", timezone: "Australia/Darwin" },
  { id: "au-aireys-inlet", name: "Aireys Inlet", lat: -38.4580, lon: 144.0980, meanSeaLevel: 0.6, tidalRange: 0.9, phaseOffset: 0.0, timezone: "Australia/Melbourne" },
  { id: "au-anglesea", name: "Anglesea", lat: -38.4080, lon: 144.1850, meanSeaLevel: 0.6, tidalRange: 0.85, phaseOffset: 0.05, timezone: "Australia/Melbourne" },
  { id: "au-barwon-heads", name: "Barwon Heads", lat: -38.2690, lon: 144.5140, meanSeaLevel: 0.6, tidalRange: 0.85, phaseOffset: 0.15, timezone: "Australia/Melbourne" },
  { id: "au-inverloch", name: "Inverloch", lat: -38.6340, lon: 145.7310, meanSeaLevel: 0.7, tidalRange: 1.2, phaseOffset: 0.5, timezone: "Australia/Melbourne" },
  { id: "au-cape-otway", name: "Cape Otway", lat: -38.8575, lon: 143.5130, meanSeaLevel: 0.65, tidalRange: 1.1, phaseOffset: -0.2, timezone: "Australia/Melbourne" },
  { id: "au-coffs-harbour", name: "Coffs Harbour", lat: -30.3000, lon: 153.1500, meanSeaLevel: 0.9, tidalRange: 1.5, phaseOffset: 1.35, timezone: "Australia/Sydney" },
  { id: "au-byron-bay", name: "Byron Bay", lat: -28.6430, lon: 153.6120, meanSeaLevel: 0.9, tidalRange: 1.5, phaseOffset: 1.45, timezone: "Australia/Brisbane" },
];

interface CachedPredictions {
  predictions: TidePrediction[];
  source: "bom" | "astronomical";
  cachedAt: number;
}

const predictionsCache: Map<string, CachedPredictions> = new Map();

async function getBomTideTtlMs(): Promise<number> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["cacheBomTideTtl"]);
  const hours = parseInt(row?.value || "6", 10);
  return hours * 60 * 60 * 1000;
}

async function getAstroTideTtlMs(): Promise<number> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["cacheAstroTideTtl"]);
  const minutes = parseInt(row?.value || "30", 10);
  return minutes * 60 * 1000;
}

async function fetchBomTideData(station: TideStation): Promise<TidePrediction[] | null> {
  if (!station.bomPort) return null;

  const stateCode = station.bomPort.split("_")[0];
  const stationCode = station.bomPort.split("_")[1];
  const stateMap: Record<string, string> = {
    VIC: "Victoria",
    NSW: "New_South_Wales",
    QLD: "Queensland",
    SA: "South_Australia",
    WA: "Western_Australia",
    TAS: "Tasmania",
    NT: "Northern_Territory",
  };
  const stateName = stateMap[stateCode] || stateCode;

  const now = new Date();
  const year = now.getFullYear();

  const urls = [
    `https://reg.bom.gov.au/ntc/IDO59001/IDO59001_${year}_${stateName}_${stationCode}.csv`,
    `https://www.bom.gov.au/ntc/IDO59001/IDO59001_${year}_${stateCode}_${stationCode}.csv`,
  ];

  const tz = station.timezone || getTimezoneForState(stateCode);

  for (const url of urls) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; SkyHighPGC/1.0)",
            Accept: "text/csv,text/plain,*/*",
          },
          signal: AbortSignal.timeout(8000),
        });

        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < 2) {
            const retryAfter = parseInt(res.headers.get('retry-after') || '5', 10);
            const wait = res.status === 429 ? retryAfter * 1000 : Math.pow(2, attempt + 1) * 1000;
            log.warn(`BOM tide ${url}: ${res.status} — retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 2}/3)`);
            await new Promise(r => setTimeout(r, wait));
            continue;
          }
          continue; // non-retryable status, skip to next URL
        }

        const text = await res.text();
        if (!text || text.length < 50 || text.includes("<!DOCTYPE") || text.includes("<html")) continue;

        const predictions = parseBomCsv(text, now, tz);
        if (predictions.length >= 2) {
          log.info(`BOM tide data fetched for ${station.name} from ${url}: ${predictions.length} predictions`);
          return predictions;
        }
      } catch (e) {
        if (attempt < 2) {
          const wait = Math.pow(2, attempt + 1) * 1000;
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        log.debug(`BOM fetch attempt failed for ${station.name}: ${(e as Error).message}`);
      }
      break; // success (non-retry) exit inner loop
    }
  }

  return null;
}

function parseBomDate(dateStr: string, timeStr: string, utcOffset: string): Date | null {
  // ISO format: YYYY-MM-DD
  const iso = new Date(`${dateStr}T${timeStr}:00${utcOffset}`);
  if (!isNaN(iso.getTime())) return iso;

  // BOM uses DD/MM/YYYY (e.g. "19/05/2026")
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, dd, mm, yyyy] = slashMatch;
    const d = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${timeStr}:00${utcOffset}`);
    if (!isNaN(d.getTime())) return d;
  }

  // BOM hyphen variant: DD-MM-YYYY
  const dashMatch = dateStr.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const [, dd, mm, yyyy] = dashMatch;
    const d = new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${timeStr}:00${utcOffset}`);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

function parseBomCsv(csv: string, referenceDate: Date, timezone: string): TidePrediction[] {
  const predictions: TidePrediction[] = [];
  const lines = csv.split("\n");
  const now = referenceDate.getTime();
  const windowStart = now - 12 * 60 * 60 * 1000;
  const windowEnd = now + 48 * 60 * 60 * 1000;

  const utcOffset = getUtcOffsetForTimezone(timezone, referenceDate);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("Date")) continue;

    const parts = trimmed.split(",").map(s => s.trim());
    if (parts.length < 4) continue;

    const dateStr = parts[0];
    const timeStr = parts[1];
    const heightStr = parts[2];
    const typeStr = (parts[3] || "").toUpperCase();

    if (!dateStr || !timeStr || !heightStr) continue;

    const height = parseFloat(heightStr);
    if (isNaN(height)) continue;

    const type: "high" | "low" = typeStr.includes("HIGH") || typeStr === "H" ? "high" : "low";

    const parsed = parseBomDate(dateStr, timeStr, utcOffset);
    if (!parsed) continue;

    const ts = parsed.getTime();
    if (ts >= windowStart && ts <= windowEnd) {
      predictions.push({ time: parsed.toISOString(), height, type });
    }
  }

  predictions.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return predictions;
}

function getMoonPhaseAngle(date: Date): number {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const T = (julianDate - 2451545.0) / 36525.0;
  const D = (297.8502042 + 445267.1115168 * T - 0.0016300 * T * T) % 360;
  return (D * Math.PI) / 180;
}

function getLunarHourAngle(date: Date, lon: number): number {
  const julianDate = date.getTime() / 86400000 + 2440587.5;
  const T = (julianDate - 2451545.0) / 36525.0;
  const moonLon = (218.3165 + 481267.8813 * T) % 360;
  const gmst = (280.46061837 + 360.98564736629 * (julianDate - 2451545.0)) % 360;
  const localSiderealTime = (gmst + lon) % 360;
  const hourAngle = localSiderealTime - moonLon;
  return (hourAngle * Math.PI) / 180;
}

function predictTideHeight(station: TideStation, date: Date): number {
  const lunarHA = getLunarHourAngle(date, station.lon);
  const moonPhase = getMoonPhaseAngle(date);

  const M2 = Math.cos(2 * (lunarHA + station.phaseOffset));
  const S2 = Math.cos(2 * ((date.getUTCHours() + date.getUTCMinutes() / 60) / 12 * Math.PI + station.phaseOffset * 0.5));

  const springNeapFactor = 1 + 0.27 * Math.cos(moonPhase);
  const amplitude = (station.tidalRange / 2) * springNeapFactor;

  return station.meanSeaLevel + amplitude * (0.75 * M2 + 0.25 * S2);
}

function findHighLowTidesAstronomical(station: TideStation, startDate: Date, hours: number = 48): TidePrediction[] {
  const predictions: TidePrediction[] = [];
  const intervalMinutes = 6;
  const totalSteps = (hours * 60) / intervalMinutes;
  const threshold = 0.001;
  // Filters to eliminate spurious turning points caused by the S2 solar component
  // creating brief direction reversals ("shoulders") within an otherwise smooth tide cycle.
  const minHeightDiff = station.tidalRange * 0.15;
  const minGapMs = 3 * 60 * 60 * 1000; // 3 hours minimum between turning points

  let prevHeight = predictTideHeight(station, startDate);
  let prevDirection: "rising" | "falling" | null = null;
  let extremeHeight = prevHeight;
  let extremeTime = startDate;
  let lastPushedHeight: number | null = null;
  let lastPushedTimeMs = 0;

  for (let i = 1; i <= totalSteps; i++) {
    const time = new Date(startDate.getTime() + i * intervalMinutes * 60000);
    const height = predictTideHeight(station, time);

    const diff = height - prevHeight;
    if (Math.abs(diff) < threshold) {
      prevHeight = height;
      continue;
    }

    const direction: "rising" | "falling" = diff > 0 ? "rising" : "falling";

    if (prevDirection && direction !== prevDirection) {
      const type = prevDirection === "rising" ? "high" : "low";
      const candidateTimeMs = extremeTime.getTime();
      const heightOk = lastPushedHeight === null || Math.abs(extremeHeight - lastPushedHeight) >= minHeightDiff;
      const timeOk = candidateTimeMs - lastPushedTimeMs >= minGapMs;

      if (heightOk && timeOk) {
        predictions.push({
          time: extremeTime.toISOString(),
          height: Math.round(extremeHeight * 100) / 100,
          type,
        });
        lastPushedHeight = extremeHeight;
        lastPushedTimeMs = candidateTimeMs;
      }

      extremeHeight = height;
      extremeTime = time;
    } else {
      if (
        (direction === "rising" && height > extremeHeight) ||
        (direction === "falling" && height < extremeHeight)
      ) {
        extremeHeight = height;
        extremeTime = time;
      }
    }

    prevDirection = direction;
    prevHeight = height;
  }

  return predictions;
}

function computeTideDataFromPredictions(
  station: TideStation,
  predictions: TidePrediction[],
  source: "bom" | "astronomical"
): TideData {
  const now = new Date();

  const futurePredictions = predictions.filter(p => new Date(p.time) > now);
  const pastPredictions = predictions.filter(p => new Date(p.time) <= now);

  const nextHigh = futurePredictions.find(p => p.type === "high") || null;
  const nextLow = futurePredictions.find(p => p.type === "low") || null;

  let currentHeight: number;
  let currentState: TideData["currentState"];

  if (source === "bom" && pastPredictions.length > 0 && futurePredictions.length > 0) {
    const lastPast = pastPredictions[pastPredictions.length - 1];
    const nextFuture = futurePredictions[0];
    const pastTime = new Date(lastPast.time).getTime();
    const futureTime = new Date(nextFuture.time).getTime();
    const progress = Math.max(0, Math.min(1, (now.getTime() - pastTime) / (futureTime - pastTime)));
    const eased = (1 - Math.cos(progress * Math.PI)) / 2;
    currentHeight = Math.round((lastPast.height + (nextFuture.height - lastPast.height) * eased) * 100) / 100;

    if (lastPast.type === "low") {
      currentState = "rising";
    } else {
      currentState = "falling";
    }
  } else {
    const rawHeight = predictTideHeight(station, now);
    currentHeight = Math.round(rawHeight * 100) / 100;
    const futureHeight = predictTideHeight(station, new Date(now.getTime() + 15 * 60000));
    const diff = futureHeight - rawHeight;
    if (Math.abs(diff) < 0.005) {
      currentState = currentHeight > station.meanSeaLevel ? "high" : "low";
    } else {
      currentState = diff > 0 ? "rising" : "falling";
    }
  }

  const minHeight = station.meanSeaLevel - station.tidalRange / 2;
  const maxHeight = station.meanSeaLevel + station.tidalRange / 2;
  const range = maxHeight - minHeight;
  const percentFull = range > 0 ? Math.max(0, Math.min(100, ((currentHeight - minHeight) / range) * 100)) : 50;

  return {
    stationId: station.id,
    stationName: station.name,
    currentHeight,
    currentState,
    percentFull: Math.round(percentFull),
    nextHigh,
    nextLow,
    predictions: [...pastPredictions.slice(-4), ...futurePredictions.slice(0, 8)],
    fetchedAt: now.toISOString(),
    source,
  };
}

async function fetchAndCachePredictions(station: TideStation): Promise<CachedPredictions> {
  try {
    const bomPredictions = await fetchBomTideData(station);
    if (bomPredictions && bomPredictions.length >= 2) {
      const cached: CachedPredictions = {
        predictions: bomPredictions,
        source: "bom",
        cachedAt: Date.now(),
      };
      predictionsCache.set(station.id, cached);
      log.info(`Cached BOM predictions for ${station.name}: ${bomPredictions.length} entries`);
      return cached;
    }
    throw new Error("BOM data insufficient");
  } catch {
    const now = new Date();
    const startDate = new Date(now.getTime() - 14 * 60 * 60000);
    const predictions = findHighLowTidesAstronomical(station, startDate, 62);
    const cached: CachedPredictions = {
      predictions,
      source: "astronomical",
      cachedAt: Date.now(),
    };
    predictionsCache.set(station.id, cached);
    const predSummary = predictions.map(p => `${p.type[0].toUpperCase()}${p.height}@${new Date(p.time).toISOString().slice(11, 16)}`).join(" ");
    log.info(`Cached astronomical predictions for ${station.name}: ${predictions.length} entries: ${predSummary || "(none)"}`);
    return cached;
  }
}

export async function getCachedTideData(station: TideStation): Promise<TideData> {
  const cached = predictionsCache.get(station.id);
  const ttl = cached?.source === "bom" ? await getBomTideTtlMs() : await getAstroTideTtlMs();

  let activePredictions: CachedPredictions;
  if (cached && Date.now() - cached.cachedAt < ttl) {
    activePredictions = cached;
  } else {
    activePredictions = await fetchAndCachePredictions(station);
  }

  return computeTideDataFromPredictions(station, activePredictions.predictions, activePredictions.source);
}

export function getStationById(id: string): TideStation | undefined {
  return AUSTRALIAN_TIDE_STATIONS.find(s => s.id === id);
}

export function findNearestStation(lat: number, lon: number): TideStation | null {
  if (AUSTRALIAN_TIDE_STATIONS.length === 0) return null;

  let nearest = AUSTRALIAN_TIDE_STATIONS[0];
  let minDist = haversineDistance(lat, lon, nearest.lat, nearest.lon);

  for (const station of AUSTRALIAN_TIDE_STATIONS) {
    const dist = haversineDistance(lat, lon, station.lat, station.lon);
    if (dist < minDist) {
      minDist = dist;
      nearest = station;
    }
  }

  return nearest;
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getAllStations(): TideStation[] {
  return AUSTRALIAN_TIDE_STATIONS;
}
