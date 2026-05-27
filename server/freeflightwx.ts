import { queryOne } from "./pg.js";

const FETCH_TIMEOUT_MS = 10000;

/** Local retry helper — avoids circular dep from importing fetchWithRetry from weather.ts */
async function fetchWithRetryLocal(url: string, options: RequestInit & { signal: AbortSignal }, retries = 3, backoff = 1000): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && (response.status === 429 || response.status >= 500) && attempt < retries - 1) {
        const wait = backoff * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      const wait = backoff * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

async function getCacheTtlMs(): Promise<number> {
  const row = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = $1", ["cacheFreeFlightWxTtl"]);
  const seconds = parseInt(row?.value || "30", 10);
  return seconds * 1000;
}

export interface FreeFlightWxStation {
  slug: string;
  name: string;
  region: string;
  lat: number | null;
  lon: number | null;
}

const FREEFLIGHTWX_STATIONS: FreeFlightWxStation[] = [
  { slug: "acthpa/springhill", name: "Spring Hill", region: "Canberra", lat: -35.09398, lon: 149.08383 },
  { slug: "acthpa/lakegeorge", name: "Lake George", region: "Canberra", lat: -35.10489, lon: 149.37530 },
  { slug: "acthpa/lanyon", name: "Lanyon (Big Monks)", region: "Canberra", lat: -35.48393, lon: 149.10741 },
  { slug: "mystic", name: "Mystic", region: "North East Victoria", lat: -36.75864, lon: 146.96634 },
  { slug: "gundowring", name: "Gundowring", region: "North East Victoria", lat: -36.39604, lon: 147.08976 },
  { slug: "emu", name: "Mt Emu", region: "North East Victoria", lat: -36.67193, lon: 147.21937 },
  { slug: "buckland", name: "Buckland Ridge", region: "North East Victoria", lat: -36.40867, lon: 146.65435 },
  { slug: "porepunkah", name: "Porepunkah Airfield", region: "North East Victoria", lat: -36.71416, lon: 146.89209 },
  { slug: "acthpa/corryong", name: "Corryong (Mt Elliot)", region: "North East Victoria", lat: -36.18582, lon: 147.97560 },
  { slug: "flowerdale", name: "Flowerdale (Three Sisters)", region: "South Victoria", lat: null, lon: null },
  { slug: "mtbroughton", name: "Mt Broughton (Thistle Hill)", region: "South Victoria", lat: null, lon: null },
  { slug: "stringybark", name: "Stringybark", region: "South Queensland", lat: null, lon: null },
  { slug: "mama", name: "Ma Ma", region: "South Queensland", lat: -27.64146, lon: 152.15218 },
  { slug: "killarney", name: "Killarney SE", region: "South Queensland", lat: -28.29503, lon: 152.33848 },
  { slug: "wilsons", name: "Wilson's", region: "South Queensland", lat: -27.69151, lon: 151.99876 },
  { slug: "backyards", name: "Backyards", region: "South Queensland", lat: -28.03977, lon: 153.16210 },
  { slug: "hooleydooley", name: "Hooley Dooley", region: "New South Wales", lat: null, lon: null },
  { slug: "softys", name: "Berrigal Airstrip", region: "New South Wales", lat: null, lon: null },
  { slug: "lakestclaire", name: "Lake St Claire", region: "New South Wales", lat: null, lon: null },
  { slug: "crackneck", name: "Crackneck Lookout", region: "New South Wales", lat: -33.39433, lon: 151.48295 },
  { slug: "stanwell", name: "Stanwell Park", region: "New South Wales", lat: -34.22298, lon: 150.99847 },
  { slug: "pops", name: "Pops", region: "North Queensland", lat: null, lon: null },
  { slug: "mtinkerman", name: "Mt Inkerman", region: "North Queensland", lat: null, lon: null },
  { slug: "tunk4", name: "Tunkallila", region: "South Australia", lat: null, lon: null },
  { slug: "singlehill", name: "Single Hill", region: "Tasmania", lat: null, lon: null },
];

export function getFreeFlightWxStations(): FreeFlightWxStation[] {
  return FREEFLIGHTWX_STATIONS;
}

export function getStationIdFromSlug(slug: string): string {
  return `freeflightwx-${slug.replace(/\//g, '-')}`;
}

export function getSlugFromStationId(stationId: string): string {
  const raw = stationId.replace('freeflightwx-', '');
  const station = FREEFLIGHTWX_STATIONS.find(s => s.slug.replace(/\//g, '-') === raw);
  return station ? station.slug : raw;
}

interface FreeFlightWxRawRecord {
  id: string;
  time: string;
  Station: string;
  Windspeedmph: string;
  WindspeedmphMax: string;
  WindspeedmphMin: string;
  Winddir: string;
  QNH: string;
  Tempc: string;
  Humidity: string;
  Battery: string;
  TimeMillis: string;
  CSQ: string;
}

export interface FreeFlightWxReading {
  timestamp: number;
  dateTime: string;
  windSpeedKts: number;
  windGustKts: number;
  windLullKts: number;
  windDirectionDeg: number;
  windDirectionCardinal: string;
  temperatureC: number;
  humidity: number;
  pressureHpa: number;
  batteryV: number;
  signalStrength: number;
}

export interface FreeFlightWxData {
  stationUrl: string;
  stationName: string;
  current: FreeFlightWxReading | null;
  history: FreeFlightWxReading[];
  fetchedAt: number;
}

const MAX_CACHE_ENTRIES = 50;
const cache = new Map<string, { data: FreeFlightWxData; expiresAt: number }>();

function mphToKts(mph: number): number {
  return Math.round(mph * 0.868976 * 10) / 10;
}

function degToCardinal(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

function mapRecord(raw: FreeFlightWxRawRecord): FreeFlightWxReading {
  const windMph = parseFloat(raw.Windspeedmph) || 0;
  const gustMph = parseFloat(raw.WindspeedmphMax) || 0;
  const lullMph = parseFloat(raw.WindspeedmphMin) || 0;
  const dirDeg = parseFloat(raw.Winddir) || 0;
  const qnhRaw = parseFloat(raw.QNH) || 0;
  const pressureHpa = qnhRaw > 10000 ? Math.round(qnhRaw / 100 * 100) / 100 : qnhRaw;

  return {
    timestamp: parseInt(raw.TimeMillis) || Date.now(),
    dateTime: raw.time,
    windSpeedKts: mphToKts(windMph),
    windGustKts: mphToKts(gustMph),
    windLullKts: mphToKts(lullMph),
    windDirectionDeg: dirDeg,
    windDirectionCardinal: degToCardinal(dirDeg),
    temperatureC: parseFloat(raw.Tempc) || 0,
    humidity: parseFloat(raw.Humidity) || 0,
    pressureHpa,
    batteryV: parseFloat(raw.Battery) || 0,
    signalStrength: parseInt(raw.CSQ) || 0,
  };
}

export function parseGaugeUrl(url: string): { baseUrl: string; stationName: string } | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.hostname !== "freeflightwx.com" && parsed.hostname !== "www.freeflightwx.com") return null;
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (pathParts.length === 0) return null;
    const pagePart = pathParts[pathParts.length - 1];
    const stationParts = pagePart.endsWith('.php') ? pathParts.slice(0, -1) : pathParts;
    if (stationParts.length === 0) return null;
    if (!stationParts.every(p => /^[a-zA-Z0-9_-]+$/.test(p))) return null;
    const stationPath = stationParts.join('/');
    const baseUrl = `${parsed.origin}/${stationPath}`;
    return { baseUrl, stationName: stationPath };
  } catch {
    return null;
  }
}

export async function fetchFreeFlightWxData(gaugeUrl: string): Promise<FreeFlightWxData> {
  const parsed = parseGaugeUrl(gaugeUrl);
  if (!parsed) {
    throw new Error("Invalid freeflightwx.com URL");
  }

  const cached = cache.get(parsed.baseUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const ajaxUrl = `${parsed.baseUrl}/gauge.php?ajax=1&ts=${Date.now()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetchWithRetryLocal(ajaxUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SkyHighParagliding/1.0)" },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from freeflightwx`);
    }

    const rawData = await response.json() as FreeFlightWxRawRecord[];
    if (!Array.isArray(rawData)) {
      throw new Error("Invalid response format from freeflightwx");
    }

    const history = rawData.map(mapRecord);
    const current = history.length > 0
      ? history.reduce((latest, r) => r.timestamp > latest.timestamp ? r : latest, history[0])
      : null;

    const result: FreeFlightWxData = {
      stationUrl: gaugeUrl,
      stationName: parsed.stationName,
      current,
      history,
      fetchedAt: Date.now(),
    };

    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    const cacheTtlMs = await getCacheTtlMs();
    cache.set(parsed.baseUrl, { data: result, expiresAt: Date.now() + cacheTtlMs });
    return result;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Timeout fetching freeflightwx data");
    }
    throw err;
  }
}
