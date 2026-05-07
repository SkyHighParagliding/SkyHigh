import db from "./db.js";
import { fetchWithRetry, getWeatherCodeSummary, degreesToDirection } from "./weather.js";
import { fromZonedTime } from 'date-fns-tz';

const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY || "";
const OPEN_METEO_URL = OPEN_METEO_API_KEY
  ? `https://customer-api.open-meteo.com/v1/forecast`
  : `https://api.open-meteo.com/v1/forecast`;

const FINE_GRID_CACHE_KEY = "fine_grid";
const COARSE_GRID_CACHE_KEY = "coarse_grid";
const GRID_CACHE_EXPIRY = 26 * 60 * 60 * 1000;
const COARSE_GRID_CACHE_EXPIRY = 26 * 60 * 60 * 1000;

export interface GridFetchStatus {
  success: boolean;
  message: string;
  pointsFetched?: number;
  pointsExpected?: number;
  fetchPercentage?: number;
  cacheAgeMinutes?: number;
}

// Default bounds — used as fallback when no grid bounds saved in settings
const FINE_LAT_MIN = -39.2;
const FINE_LAT_MAX = -34.0;
const FINE_LON_MIN = 141.0;
const FINE_LON_MAX = 150.0;
export const FINE_DELTA = 0.35;

const COARSE_LAT_MIN = -50;
const COARSE_LAT_MAX = -5;
const COARSE_LON_MIN = 105;
const COARSE_LON_MAX = 165;
export const COARSE_DELTA = 2.0;

export interface GridBounds {
  fineLatMin: number; fineLatMax: number; fineLonMin: number; fineLonMax: number;
  coarseLatMin: number; coarseLatMax: number; coarseLonMin: number; coarseLonMax: number;
}

export async function getGridBounds(): Promise<GridBounds> {
  const keys = ['gridFineLatMin','gridFineLatMax','gridFineLonMin','gridFineLonMax',
                 'gridCoarseLatMin','gridCoarseLatMax','gridCoarseLonMin','gridCoarseLonMax'];
  try {
    const rows = await db.prepare(
      `SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`
    ).all(...keys) as { key: string; value: string }[];
    const s: Record<string, number> = {};
    for (const r of rows) s[r.key] = parseFloat(r.value);
    return {
      fineLatMin:   Number.isFinite(s.gridFineLatMin)   ? s.gridFineLatMin   : FINE_LAT_MIN,
      fineLatMax:   Number.isFinite(s.gridFineLatMax)   ? s.gridFineLatMax   : FINE_LAT_MAX,
      fineLonMin:   Number.isFinite(s.gridFineLonMin)   ? s.gridFineLonMin   : FINE_LON_MIN,
      fineLonMax:   Number.isFinite(s.gridFineLonMax)   ? s.gridFineLonMax   : FINE_LON_MAX,
      coarseLatMin: Number.isFinite(s.gridCoarseLatMin) ? s.gridCoarseLatMin : COARSE_LAT_MIN,
      coarseLatMax: Number.isFinite(s.gridCoarseLatMax) ? s.gridCoarseLatMax : COARSE_LAT_MAX,
      coarseLonMin: Number.isFinite(s.gridCoarseLonMin) ? s.gridCoarseLonMin : COARSE_LON_MIN,
      coarseLonMax: Number.isFinite(s.gridCoarseLonMax) ? s.gridCoarseLonMax : COARSE_LON_MAX,
    };
  } catch {
    return {
      fineLatMin: FINE_LAT_MIN, fineLatMax: FINE_LAT_MAX,
      fineLonMin: FINE_LON_MIN, fineLonMax: FINE_LON_MAX,
      coarseLatMin: COARSE_LAT_MIN, coarseLatMax: COARSE_LAT_MAX,
      coarseLonMin: COARSE_LON_MIN, coarseLonMax: COARSE_LON_MAX,
    };
  }
}

async function cleanupOldGridData(baseKey: string): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const result = await db.prepare(`DELETE FROM wind_grid_data WHERE siteId LIKE ? AND siteId < ?`).run(`${baseKey}_%`, `${baseKey}_${sevenDaysAgo}`);
    if ((result as any).changes > 0) {
      console.log(`${baseKey}: Cleaned up ${(result as any).changes} old grid records`);
    }
  } catch (e) {
    console.error(`${baseKey}: Cleanup error`, e);
  }
}

interface GridPoint {
  lat: number;
  lon: number;
  hourly: {
    time: string[];
    wind_speed_10m: number[];
    wind_gusts_10m: number[];
    wind_direction_10m: number[];
    temperature_2m: number[];
    weather_code: number[];
  };
}

interface VictoriaGrid {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  delta: number;
  ni: number;
  nj: number;
  points: GridPoint[];
  fetchedAt: number;
}

async function buildFineTiles(): Promise<{ lats: number[]; lons: number[] }[]> {
  const bounds = await getGridBounds();
  const allLats: number[] = [];
  const allLons: number[] = [];

  for (let lat = bounds.fineLatMin; lat <= bounds.fineLatMax; lat += FINE_DELTA) {
    allLats.push(parseFloat(lat.toFixed(4)));
  }
  for (let lon = bounds.fineLonMin; lon <= bounds.fineLonMax; lon += FINE_DELTA) {
    allLons.push(parseFloat(lon.toFixed(4)));
  }

  const allPoints: { lat: number; lon: number }[] = [];
  for (const lat of allLats) {
    for (const lon of allLons) {
      allPoints.push({ lat, lon });
    }
  }

  const MAX_PER_TILE = 90;
  const tiles: { lats: number[]; lons: number[] }[] = [];

  for (let i = 0; i < allPoints.length; i += MAX_PER_TILE) {
    const chunk = allPoints.slice(i, i + MAX_PER_TILE);
    tiles.push({
      lats: chunk.map(p => p.lat),
      lons: chunk.map(p => p.lon)
    });
  }

  return tiles;
}

const MEM_CACHE_TTL_MS = 30 * 60 * 1000;
let memFineGrid: VictoriaGrid | null = null;
let memFineGridAt = 0;
let memCoarseGrid: VictoriaGrid | null = null;
let memCoarseGridAt = 0;

let cachedFullWindOverlay: any = null;
let cachedFullWindOverlayKey = '';

let inflightFetch: Promise<VictoriaGrid> | null = null;

export async function fetchFineGrid(force = false): Promise<VictoriaGrid> {
  if (!force) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${FINE_GRID_CACHE_KEY}_${today}`) as any;
      if (cached) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (age < GRID_CACHE_EXPIRY) {
          const grid = JSON.parse(cached.gridData) as VictoriaGrid;
          console.log(`Fine grid: Using cached data (age: ${Math.round(age / 60000)}min)`);
          memFineGrid = grid;
          memFineGridAt = Date.now();
          return grid;
        }
      }
    } catch (e) {
      console.error("Fine grid: Cache read error, will re-fetch", e);
    }
  }

  if (inflightFetch) {
    console.log("Fine grid: Waiting for in-flight fetch...");
    return inflightFetch;
  }

  inflightFetch = doFetchFineGrid();
  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
  }
}

async function doFetchFineGrid(): Promise<VictoriaGrid> {
  console.log("Fine grid: Fetching fresh data from Open-Meteo...");

  const bounds = await getGridBounds();
  const tiles = await buildFineTiles();
  console.log(`Fine grid: ${tiles.reduce((s, t) => s + t.lats.length, 0)} total points in ${tiles.length} tiles`);

  const allPoints: GridPoint[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const params = new URLSearchParams({
      latitude: tile.lats.join(','),
      longitude: tile.lons.join(','),
      hourly: 'temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code',
      models: 'ecmwf_ifs025',
      wind_speed_unit: 'kn',
      timezone: 'Australia/Melbourne',
      forecast_days: '2'
    });
    if (OPEN_METEO_API_KEY) params.set('apikey', OPEN_METEO_API_KEY);

    const url = `${OPEN_METEO_URL}?${params.toString()}`;

    try {
      const rawData = await fetchWithRetry(url);
      const results = Array.isArray(rawData) ? rawData : [rawData];

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (!r?.hourly) continue;
        allPoints.push({
          lat: tile.lats[j],
          lon: tile.lons[j],
          hourly: {
            time: r.hourly.time,
            wind_speed_10m: r.hourly.wind_speed_10m,
            wind_gusts_10m: r.hourly.wind_gusts_10m,
            wind_direction_10m: r.hourly.wind_direction_10m,
            temperature_2m: r.hourly.temperature_2m,
            weather_code: r.hourly.weather_code
          }
        });
      }

      console.log(`Fine grid: Tile ${i + 1}/${tiles.length} fetched (${tile.lats.length} points)`);

      if (i < tiles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error(`Fine grid: Tile ${i + 1}/${tiles.length} failed:`, err);
    }
  }

  const ni = Math.round((bounds.fineLonMax - bounds.fineLonMin) / FINE_DELTA) + 1;
  const nj = Math.round((bounds.fineLatMax - bounds.fineLatMin) / FINE_DELTA) + 1;
  const expectedPoints = tiles.reduce((s, t) => s + t.lats.length, 0);
  const completeness = allPoints.length / expectedPoints;

  if (completeness < 0.8) {
    console.warn(`Fine grid: Only ${allPoints.length}/${expectedPoints} points fetched (${Math.round(completeness * 100)}%), keeping previous cache`);
    if (completeness === 0) throw new Error(`All tiles failed (429 rate limited) — no data fetched`);
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${FINE_GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${FINE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    if (cached) {
      try {
        const fallbackGrid = JSON.parse(cached.gridData) as VictoriaGrid;
        memFineGrid = fallbackGrid;
        memFineGridAt = Date.now();
        return fallbackGrid;
      } catch (e: any) {
        console.error("Fine grid: Failed to parse cached data:", e.message);
      }
    }
  }

  const grid: VictoriaGrid = {
    latMin: bounds.fineLatMin,
    latMax: bounds.fineLatMax,
    lonMin: bounds.fineLonMin,
    lonMax: bounds.fineLonMax,
    delta: FINE_DELTA,
    ni, nj,
    points: allPoints,
    fetchedAt: Date.now()
  };

  try {
    const jsonStr = JSON.stringify(grid);
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${FINE_GRID_CACHE_KEY}_${today}`;
    await db.prepare("INSERT OR REPLACE INTO wind_grid_data (siteId, gridData, gridSize, gridSpacing, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .run(cacheKey, jsonStr, ni, FINE_DELTA);
    console.log(`Fine grid: Cached for ${today} ${allPoints.length}/${expectedPoints} points (${(jsonStr.length / 1024 / 1024).toFixed(1)}MB)`);
    await cleanupOldGridData(FINE_GRID_CACHE_KEY);
  } catch (e) {
    console.error("Fine grid: Failed to cache:", e);
  }

  memFineGrid = grid;
  memFineGridAt = Date.now();
  return grid;
}

async function buildCoarseTiles(): Promise<{ lats: number[]; lons: number[] }[]> {
  const bounds = await getGridBounds();
  const allLats: number[] = [];
  const allLons: number[] = [];

  for (let lat = bounds.coarseLatMin; lat <= bounds.coarseLatMax; lat += COARSE_DELTA) {
    allLats.push(parseFloat(lat.toFixed(4)));
  }
  for (let lon = bounds.coarseLonMin; lon <= bounds.coarseLonMax; lon += COARSE_DELTA) {
    allLons.push(parseFloat(lon.toFixed(4)));
  }

  const allPoints: { lat: number; lon: number }[] = [];
  for (const lat of allLats) {
    for (const lon of allLons) {
      allPoints.push({ lat, lon });
    }
  }

  const MAX_PER_TILE = 90;
  const tiles: { lats: number[]; lons: number[] }[] = [];

  for (let i = 0; i < allPoints.length; i += MAX_PER_TILE) {
    const chunk = allPoints.slice(i, i + MAX_PER_TILE);
    tiles.push({
      lats: chunk.map(p => p.lat),
      lons: chunk.map(p => p.lon)
    });
  }

  return tiles;
}

let inflightCoarseFetch: Promise<VictoriaGrid> | null = null;

export async function fetchCoarseGrid(force = false): Promise<VictoriaGrid> {
  if (!force) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${COARSE_GRID_CACHE_KEY}_${today}`) as any;
      if (cached) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (age < COARSE_GRID_CACHE_EXPIRY) {
          const grid = JSON.parse(cached.gridData) as VictoriaGrid;
          console.log(`Coarse grid: Using cached data (age: ${Math.round(age / 60000)}min)`);
          memCoarseGrid = grid;
          memCoarseGridAt = Date.now();
          return grid;
        }
      }
    } catch (e) {
      console.error("Coarse grid: Cache read error, will re-fetch", e);
    }
  }

  if (inflightCoarseFetch) {
    console.log("Coarse grid: Waiting for in-flight fetch...");
    return inflightCoarseFetch;
  }

  inflightCoarseFetch = doFetchCoarseGrid();
  try {
    return await inflightCoarseFetch;
  } finally {
    inflightCoarseFetch = null;
  }
}

async function doFetchCoarseGrid(): Promise<VictoriaGrid> {
  console.log("Coarse grid: Fetching fresh data from Open-Meteo...");

  const bounds = await getGridBounds();
  const tiles = await buildCoarseTiles();
  const totalPoints = tiles.reduce((s, t) => s + t.lats.length, 0);
  console.log(`Coarse grid: ${totalPoints} total points in ${tiles.length} tiles`);

  const allPoints: GridPoint[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const params = new URLSearchParams({
      latitude: tile.lats.join(','),
      longitude: tile.lons.join(','),
      hourly: 'wind_speed_10m,wind_direction_10m',
      models: 'ecmwf_ifs025',
      wind_speed_unit: 'kn',
      timezone: 'Australia/Melbourne',
      forecast_days: '2'
    });
    if (OPEN_METEO_API_KEY) params.set('apikey', OPEN_METEO_API_KEY);

    const url = `${OPEN_METEO_URL}?${params.toString()}`;

    try {
      const rawData = await fetchWithRetry(url);
      const results = Array.isArray(rawData) ? rawData : [rawData];

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (!r?.hourly) continue;
        allPoints.push({
          lat: tile.lats[j],
          lon: tile.lons[j],
          hourly: {
            time: r.hourly.time,
            wind_speed_10m: r.hourly.wind_speed_10m,
            wind_gusts_10m: [],
            wind_direction_10m: r.hourly.wind_direction_10m,
            temperature_2m: [],
            weather_code: []
          }
        });
      }

      console.log(`Coarse grid: Tile ${i + 1}/${tiles.length} fetched (${tile.lats.length} points)`);

      if (i < tiles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error(`Coarse grid: Tile ${i + 1}/${tiles.length} failed:`, err);
    }
  }

  const ni = Math.round((bounds.coarseLonMax - bounds.coarseLonMin) / COARSE_DELTA) + 1;
  const nj = Math.round((bounds.coarseLatMax - bounds.coarseLatMin) / COARSE_DELTA) + 1;
  const completeness = allPoints.length / totalPoints;

  if (completeness < 0.8) {
    console.warn(`Coarse grid: Only ${allPoints.length}/${totalPoints} points fetched (${Math.round(completeness * 100)}%), keeping previous cache`);
    if (completeness === 0) throw new Error(`All tiles failed (429 rate limited) — no data fetched`);
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${COARSE_GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${COARSE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    if (cached) {
      try {
        const fallbackGrid = JSON.parse(cached.gridData) as VictoriaGrid;
        memCoarseGrid = fallbackGrid;
        memCoarseGridAt = Date.now();
        return fallbackGrid;
      } catch (e: any) {
        console.error("Coarse grid: Failed to parse cached data:", e.message);
      }
    }
  }

  const grid: VictoriaGrid = {
    latMin: bounds.coarseLatMin,
    latMax: bounds.coarseLatMax,
    lonMin: bounds.coarseLonMin,
    lonMax: bounds.coarseLonMax,
    delta: COARSE_DELTA,
    ni, nj,
    points: allPoints,
    fetchedAt: Date.now()
  };

  try {
    const jsonStr = JSON.stringify(grid);
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${COARSE_GRID_CACHE_KEY}_${today}`;
    await db.prepare("INSERT OR REPLACE INTO wind_grid_data (siteId, gridData, gridSize, gridSpacing, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .run(cacheKey, jsonStr, ni, COARSE_DELTA);
    console.log(`Coarse grid: Cached for ${today} ${allPoints.length}/${totalPoints} points (${(jsonStr.length / 1024).toFixed(0)}KB)`);
    await cleanupOldGridData(COARSE_GRID_CACHE_KEY);
  } catch (e) {
    console.error("Coarse grid: Failed to cache:", e);
  }

  memCoarseGrid = grid;
  memCoarseGridAt = Date.now();
  return grid;
}

export async function getCachedFineGrid(): Promise<VictoriaGrid | null> {
  if (memFineGrid && Date.now() - memFineGridAt < MEM_CACHE_TTL_MS) {
    return memFineGrid;
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${FINE_GRID_CACHE_KEY}_${today}`) as any;

    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${FINE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }

    if (cached) {
      const grid = JSON.parse(cached.gridData) as VictoriaGrid;
      memFineGrid = grid;
      memFineGridAt = Date.now();
      return grid;
    }
  } catch (e) {
    console.error("Fine grid: Cache read error", e);
  }
  return null;
}

export async function getCachedCoarseGrid(): Promise<VictoriaGrid | null> {
  if (memCoarseGrid && Date.now() - memCoarseGridAt < MEM_CACHE_TTL_MS) {
    return memCoarseGrid;
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${COARSE_GRID_CACHE_KEY}_${today}`) as any;

    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${COARSE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }

    if (cached) {
      const grid = JSON.parse(cached.gridData) as VictoriaGrid;
      memCoarseGrid = grid;
      memCoarseGridAt = Date.now();
      return grid;
    }
  } catch (e) {
    console.error("Coarse grid: Cache read error", e);
  }
  return null;
}

export function clearFineGridCaches(): void {
  memFineGrid = null;
  memFineGridAt = 0;
  memCoarseGrid = null;
  memCoarseGridAt = 0;
  cachedFullWindOverlay = null;
  cachedFullWindOverlayKey = '';
}

function findNearestPoint(grid: VictoriaGrid, lat: number, lon: number): GridPoint | null {
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

export function extractSiteForecast(grid: VictoriaGrid, siteId: string, siteLat: number, siteLon: number): any | null {
  const nearest = findNearestPoint(grid, siteLat, siteLon);
  if (!nearest || !nearest.hourly?.time) return null;

  const now = new Date();
  const melbourneTime = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);

  const parts: Record<string, string> = {};
  melbourneTime.forEach(p => { parts[p.type] = p.value; });
  const hour = parseInt(parts.hour || '0');
  const dateStr = `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, '0')}:00`;

  const hourIdx = nearest.hourly.time.indexOf(dateStr);
  if (hourIdx === -1) return null;

  const temp = nearest.hourly.temperature_2m[hourIdx];
  const windSpeed = Math.round(nearest.hourly.wind_speed_10m[hourIdx]);
  const windGust = Math.round(nearest.hourly.wind_gusts_10m[hourIdx]);
  const windDirection = degreesToDirection(nearest.hourly.wind_direction_10m[hourIdx]);
  const weatherCode = nearest.hourly.weather_code[hourIdx];
  const time = nearest.hourly.time[hourIdx];

  const { text: summary, icon } = getWeatherCodeSummary(weatherCode);

  const utcDate = fromZonedTime(time, 'Australia/Melbourne');
  const timestamp = utcDate.toISOString();

  const melbDateStr = `${parts.year}-${parts.month}-${parts.day}`;
  const dayStart = nearest.hourly.time.indexOf(`${melbDateStr}T08:00`);
  const forecastHours = [];
  if (dayStart !== -1) {
    for (let h = 0; h <= 12; h++) {
      const idx = dayStart + h;
      if (idx < nearest.hourly.time.length) {
        const hTime = nearest.hourly.time[idx];
        if (!hTime.startsWith(melbDateStr)) break;
        const hUtcDate = fromZonedTime(hTime, 'Australia/Melbourne');
        const hCode = nearest.hourly.weather_code[idx];
        forecastHours.push({
          timestamp: hUtcDate.toISOString(),
          temperature: nearest.hourly.temperature_2m[idx],
          windSpeed: Math.round(nearest.hourly.wind_speed_10m[idx]),
          windGust: Math.round(nearest.hourly.wind_gusts_10m[idx]),
          windDirection: degreesToDirection(nearest.hourly.wind_direction_10m[idx]),
          icon: getWeatherCodeSummary(hCode).icon,
          summary: getWeatherCodeSummary(hCode).text
        });
      }
    }
  } else {
    for (let i = 0; i < 6; i++) {
      const idx = hourIdx + i;
      if (idx < nearest.hourly.time.length) {
        const hTime = nearest.hourly.time[idx];
        const hUtcDate = fromZonedTime(hTime, 'Australia/Melbourne');
        const hCode = nearest.hourly.weather_code[idx];
        forecastHours.push({
          timestamp: hUtcDate.toISOString(),
          temperature: nearest.hourly.temperature_2m[idx],
          windSpeed: Math.round(nearest.hourly.wind_speed_10m[idx]),
          windGust: Math.round(nearest.hourly.wind_gusts_10m[idx]),
          windDirection: degreesToDirection(nearest.hourly.wind_direction_10m[idx]),
          icon: getWeatherCodeSummary(hCode).icon,
          summary: getWeatherCodeSummary(hCode).text
        });
      }
    }
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
    forecasts: JSON.stringify(forecastHours)
  };
}

function gridToWindData(points: GridPoint[], delta: number, startIdx: number, selectedTimes: string[]) {
  const subLons = [...new Set(points.map(p => p.lon))].sort((a, b) => a - b);
  const subLats = [...new Set(points.map(p => p.lat))].sort((a, b) => a - b);

  const actualLonMin = subLons[0];
  const actualLonMax = subLons[subLons.length - 1];
  const actualLatMin = subLats[0];
  const actualLatMax = subLats[subLats.length - 1];
  const ni = subLons.length;
  const nj = subLats.length;

  const pointMap = new Map<string, GridPoint>();
  for (const p of points) {
    pointMap.set(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, p);
  }

  const gridDataByTime: { u: number; v: number }[][] = [];

  for (let t = 0; t < selectedTimes.length; t++) {
    const timeIdx = startIdx + t;
    const timeStepData: { u: number; v: number }[] = [];

    for (const lat of subLats) {
      for (const lon of subLons) {
        const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        const point = pointMap.get(key);

        if (point && timeIdx < point.hourly.wind_speed_10m.length) {
          const speedKn = point.hourly.wind_speed_10m[timeIdx];
          const speedMs = speedKn * 0.514444;
          const dir = point.hourly.wind_direction_10m[timeIdx];
          const angleRad = (dir * Math.PI) / 180;
          timeStepData.push({
            u: parseFloat((-speedMs * Math.sin(angleRad)).toFixed(3)),
            v: parseFloat((-speedMs * Math.cos(angleRad)).toFixed(3))
          });
        } else {
          timeStepData.push({ u: 0, v: 0 });
        }
      }
    }

    gridDataByTime.push(timeStepData);
  }

  return {
    lonMin: parseFloat(actualLonMin.toFixed(4)),
    lonMax: parseFloat(actualLonMax.toFixed(4)),
    latMin: parseFloat(actualLatMin.toFixed(4)),
    latMax: parseFloat(actualLatMax.toFixed(4)),
    deltaLon: delta,
    deltaLat: delta,
    ni, nj,
    times: selectedTimes,
    data: gridDataByTime
  };
}

export function getTimeWindow(allTimes: string[]) {
  const now = new Date();
  const melbourneFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const dateParts: Record<string, string> = {};
  melbourneFormatter.formatToParts(now).forEach(p => { dateParts[p.type] = p.value; });
  const todayStr = `${dateParts.year}-${dateParts.month}-${dateParts.day}T05:00`;

  let startIdx = allTimes.findIndex((t: string) => t >= todayStr);
  if (startIdx === -1) startIdx = 0;

  const selectedTimes = allTimes.slice(startIdx, startIdx + 36);
  return { startIdx, selectedTimes };
}

export function extractFullWindGrid(grid: VictoriaGrid, coarseGrid?: VictoriaGrid | null): any | null {
  if (!grid.points.length) return null;

  const firstPoint = grid.points[0];
  if (!firstPoint.hourly?.time) return null;

  const melbNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
  const melbDate = `${melbNow.getFullYear()}-${String(melbNow.getMonth() + 1).padStart(2, '0')}-${String(melbNow.getDate()).padStart(2, '0')}`;
  const cacheKey = `${grid.fetchedAt}|${coarseGrid?.fetchedAt ?? 0}|${melbDate}`;

  if (cachedFullWindOverlay && cacheKey === cachedFullWindOverlayKey) {
    return cachedFullWindOverlay;
  }

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);
  const result = gridToWindData(grid.points, grid.delta, startIdx, selectedTimes);

  if (coarseGrid && coarseGrid.points.length > 0) {
    const coarseFirstPoint = coarseGrid.points[0];
    if (coarseFirstPoint?.hourly?.time) {
      const coarseTimeWindow = getTimeWindow(coarseFirstPoint.hourly.time);
      const coarseResult = gridToWindData(coarseGrid.points, coarseGrid.delta, coarseTimeWindow.startIdx, coarseTimeWindow.selectedTimes);
      (result as any).wideGrid = coarseResult;
    }
  }

  cachedFullWindOverlay = result;
  cachedFullWindOverlayKey = cacheKey;
  return result;
}

export function extractWindParticles(grid: VictoriaGrid, siteLat: number, siteLon: number, coarseGrid?: VictoriaGrid | null): any | null {
  const spread = 1.5;
  const lonMin = siteLon - spread;
  const lonMax = siteLon + spread;
  const latMin = siteLat - spread;
  const latMax = siteLat + spread;

  const relevantPoints = grid.points.filter(p =>
    p.lat >= latMin - grid.delta && p.lat <= latMax + grid.delta &&
    p.lon >= lonMin - grid.delta && p.lon <= lonMax + grid.delta
  );

  if (relevantPoints.length === 0) return null;

  const firstPoint = relevantPoints[0];
  if (!firstPoint.hourly?.time) return null;

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);

  const result = gridToWindData(relevantPoints, grid.delta, startIdx, selectedTimes);

  if (coarseGrid && coarseGrid.points.length > 0) {
    const coarseFirstPoint = coarseGrid.points[0];
    if (coarseFirstPoint?.hourly?.time) {
      const coarseTimeWindow = getTimeWindow(coarseFirstPoint.hourly.time);
      const coarseResult = gridToWindData(coarseGrid.points, coarseGrid.delta, coarseTimeWindow.startIdx, coarseTimeWindow.selectedTimes);
      (result as any).wideGrid = coarseResult;
    }
  }

  return result;
}

export async function fetchFineGridWithStatus(): Promise<GridFetchStatus> {
  try {
    const bounds = await getGridBounds();
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${FINE_GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${FINE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    const cacheAgeMs = cached ? Date.now() - new Date(cached.updatedAt).getTime() : null;
    const cacheAgeMinutes = cacheAgeMs ? Math.round(cacheAgeMs / 60000) : null;

    const grid = await fetchFineGrid(true);

    const expectedPoints = Math.round((bounds.fineLonMax - bounds.fineLonMin) / FINE_DELTA + 1) * Math.round((bounds.fineLatMax - bounds.fineLatMin) / FINE_DELTA + 1);

    if (!grid.points || grid.points.length === 0) {
      if (cacheAgeMinutes && cacheAgeMinutes < 26 * 60) {
        return {
          success: true,
          message: `Rate limited — using cache from ${cacheAgeMinutes} minutes ago (still valid)`,
          cacheAgeMinutes,
          pointsFetched: 0,
          pointsExpected: expectedPoints,
          fetchPercentage: 0
        };
      }
      return {
        success: false,
        message: 'Rate limited and no cached data available',
        pointsFetched: 0,
        pointsExpected: expectedPoints,
        fetchPercentage: 0
      };
    }

    const percentage = Math.round((grid.points.length / expectedPoints) * 100);

    if (percentage < 100) {
      return {
        success: true,
        message: `Partial fetch — ${percentage}% of ${expectedPoints} points (${grid.points.length} points)`,
        pointsFetched: grid.points.length,
        pointsExpected: expectedPoints,
        fetchPercentage: percentage
      };
    }

    return {
      success: true,
      message: `Downloaded fresh data — ${grid.points.length} points (100%)`,
      pointsFetched: grid.points.length,
      pointsExpected: expectedPoints,
      fetchPercentage: 100
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Error fetching data: ${errorMsg}`
    };
  }
}

export async function fetchCoarseGridWithStatus(): Promise<GridFetchStatus> {
  try {
    const bounds = await getGridBounds();
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${COARSE_GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${COARSE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    const cacheAgeMs = cached ? Date.now() - new Date(cached.updatedAt).getTime() : null;
    const cacheAgeMinutes = cacheAgeMs ? Math.round(cacheAgeMs / 60000) : null;

    const grid = await fetchCoarseGrid(true);

    const expectedPoints = Math.round((bounds.coarseLonMax - bounds.coarseLonMin) / COARSE_DELTA + 1) * Math.round((bounds.coarseLatMax - bounds.coarseLatMin) / COARSE_DELTA + 1);

    if (!grid.points || grid.points.length === 0) {
      if (cacheAgeMinutes && cacheAgeMinutes < 26 * 60) {
        return {
          success: true,
          message: `Rate limited — using cache from ${cacheAgeMinutes} minutes ago (still valid)`,
          cacheAgeMinutes,
          pointsFetched: 0,
          pointsExpected: expectedPoints,
          fetchPercentage: 0
        };
      }
      return {
        success: false,
        message: 'Rate limited and no cached data available',
        pointsFetched: 0,
        pointsExpected: expectedPoints,
        fetchPercentage: 0
      };
    }

    const percentage = Math.round((grid.points.length / expectedPoints) * 100);

    if (percentage < 100) {
      return {
        success: true,
        message: `Partial fetch — ${percentage}% of ${expectedPoints} points (${grid.points.length} points)`,
        pointsFetched: grid.points.length,
        pointsExpected: expectedPoints,
        fetchPercentage: percentage
      };
    }

    return {
      success: true,
      message: `Downloaded fresh data — ${grid.points.length} points (100%)`,
      pointsFetched: grid.points.length,
      pointsExpected: expectedPoints,
      fetchPercentage: 100
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Error fetching data: ${errorMsg}`
    };
  }
}

// Legacy aliases — kept so weather.ts routes referencing old names still compile
export { fetchFineGrid as fetchVictoriaGrid, fetchCoarseGrid as fetchWideGrid,
         getCachedFineGrid as getCachedVictoriaGrid, getCachedCoarseGrid as getCachedWideGrid };
