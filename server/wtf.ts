interface WtfSite {
  name: string;
  title: string;
  state: string;
  url: string;
  lat: number;
  lon: number;
  minDir: string;
  maxDir: string;
  dir: string;
  minSpeed: number;
  maxSpeed: number;
  minPGSpeed: number;
  maxPGSpeed: number;
}

interface WtfData {
  sites: WtfSite[];
}

const COMPASS_POINTS = [
  "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
  "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"
];

let cachedWtfData: WtfData | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000;

export async function fetchWtfData(): Promise<WtfData> {
  const now = Date.now();
  if (cachedWtfData && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedWtfData;
  }

  try {
    console.log("WTF: Fetching data from wheretofly.info...");
    const res = await fetch("https://wheretofly.info/run/current.json", {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    if (!res.ok) throw new Error(`WTF fetch failed: ${res.status}`);
    const data = await res.json() as WtfData;
    cachedWtfData = data;
    cacheTimestamp = now;
    console.log(`WTF: Loaded ${data.sites.length} sites`);
    return data;
  } catch (err: any) {
    console.error("WTF: Failed to fetch data:", err.message);
    if (cachedWtfData) return cachedWtfData;
    return { sites: [] };
  }
}

function normalizeUrl(url: string): string {
  if (!url) return "";
  return url
    .replace(/\.html$/, "")
    .replace(/%20/g, " ")
    .replace(/https?:\/\//, "")
    .toLowerCase()
    .trim();
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export function matchWtfSite(siteguideUrl: string | null, siteName: string, wtfData: WtfData): WtfSite | null {
  if (!wtfData.sites.length) return null;

  if (siteguideUrl) {
    const urlNorm = normalizeUrl(siteguideUrl);
    const byUrl = wtfData.sites.find(s => s.url && normalizeUrl(s.url) === urlNorm);
    if (byUrl) return byUrl;
  }

  const nameNorm = normalizeName(siteName);
  const byExactName = wtfData.sites.find(s => normalizeName(s.title) === nameNorm);
  if (byExactName) return byExactName;

  const byPartialName = wtfData.sites.find(s => {
    const wtfNorm = normalizeName(s.title);
    return (wtfNorm.length >= 4 && nameNorm.length >= 4) &&
      (wtfNorm.includes(nameNorm) || nameNorm.includes(wtfNorm));
  });
  if (byPartialName) return byPartialName;

  return null;
}

export function expandDirectionRange(minDir: string, maxDir: string): string[] {
  if (!minDir || !maxDir) return [];
  
  const minIdx = COMPASS_POINTS.indexOf(minDir);
  const maxIdx = COMPASS_POINTS.indexOf(maxDir);
  if (minIdx === -1 || maxIdx === -1) return [minDir, maxDir].filter(Boolean);

  const dirs: string[] = [];
  let i = minIdx;
  while (true) {
    dirs.push(COMPASS_POINTS[i]);
    if (i === maxIdx) break;
    i = (i + 1) % 16;
    if (dirs.length > 16) break;
  }
  return dirs;
}

export interface WtfWindData {
  windSpeed: string;
  source: "wtf";
}

export function getWtfWindData(wtfSite: WtfSite): WtfWindData {
  return {
    windSpeed: `${wtfSite.minPGSpeed}-${wtfSite.maxPGSpeed}kts`,
    source: "wtf",
  };
}
