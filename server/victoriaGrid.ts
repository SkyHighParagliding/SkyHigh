import db from "./db.js";
import { fetchWithRetry, getWeatherCodeSummary, degreesToDirection } from "./weather.js";
import { fromZonedTime } from 'date-fns-tz';

const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY || "";
const OPEN_METEO_URL = OPEN_METEO_API_KEY
  ? `https://customer-api.open-meteo.com/v1/forecast`
  : `https://api.open-meteo.com/v1/forecast`;
const GRID_CACHE_KEY = "victoria_grid";
const WIDE_GRID_CACHE_KEY = "wide_grid";
const GRID_CACHE_EXPIRY = 26 * 60 * 60 * 1000;
const WIDE_GRID_CACHE_EXPIRY = 26 * 60 * 60 * 1000;

export interface GridFetchStatus {
  success: boolean;
  message: string;
  pointsFetched?: number;
  pointsExpected?: number;
  fetchPercentage?: number;
  cacheAgeMinutes?: number;
}

const VIC_LAT_MIN = -39.2;
const VIC_LAT_MAX = -34.0;
const VIC_LON_MIN = 141.0;
const VIC_LON_MAX = 150.0;
const DELTA = 0.35;

const WIDE_LAT_MIN = -50;
const WIDE_LAT_MAX = -5;
const WIDE_LON_MIN = 105;
const WIDE_LON_MAX = 165;
const WIDE_DELTA = 2.0;

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

function buildTiles(): { lats: number[]; lons: number[] }[] {
  const allLats: number[] = [];
  const allLons: number[] = [];

  for (let lat = VIC_LAT_MIN; lat <= VIC_LAT_MAX; lat += DELTA) {
    allLats.push(parseFloat(lat.toFixed(4)));
  }
  for (let lon = VIC_LON_MIN; lon <= VIC_LON_MAX; lon += DELTA) {
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
let memVictoriaGrid: VictoriaGrid | null = null;
let memVictoriaGridAt = 0;
let memWideGrid: VictoriaGrid | null = null;
let memWideGridAt = 0;

let inflightFetch: Promise<VictoriaGrid> | null = null;

export async function fetchVictoriaGrid(force = false): Promise<VictoriaGrid> {
  if (!force) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${GRID_CACHE_KEY}_${today}`) as any;
      if (cached) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (age < GRID_CACHE_EXPIRY) {
          const grid = JSON.parse(cached.gridData) as VictoriaGrid;
          console.log(`Victoria grid: Using cached data (age: ${Math.round(age / 60000)}min)`);
          memVictoriaGrid = grid;
          memVictoriaGridAt = Date.now();
          return grid;
        }
      }
    } catch (e) {
      console.error("Victoria grid: Cache read error, will re-fetch", e);
    }
  }

  if (inflightFetch) {
    console.log("Victoria grid: Waiting for in-flight fetch...");
    return inflightFetch;
  }

  inflightFetch = doFetchVictoriaGrid();
  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
  }
}

async function doFetchVictoriaGrid(): Promise<VictoriaGrid> {
  console.log("Victoria grid: Fetching fresh data from Open-Meteo...");

  const tiles = buildTiles();
  console.log(`Victoria grid: ${tiles.reduce((s, t) => s + t.lats.length, 0)} total points in ${tiles.length} tiles`);

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

      console.log(`Victoria grid: Tile ${i + 1}/${tiles.length} fetched (${tile.lats.length} points)`);

      if (i < tiles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error(`Victoria grid: Tile ${i + 1}/${tiles.length} failed:`, err);
    }
  }

  const ni = Math.round((VIC_LON_MAX - VIC_LON_MIN) / DELTA) + 1;
  const nj = Math.round((VIC_LAT_MAX - VIC_LAT_MIN) / DELTA) + 1;
  const expectedPoints = tiles.reduce((s, t) => s + t.lats.length, 0);
  const completeness = allPoints.length / expectedPoints;

  if (completeness < 0.8) {
    console.warn(`Victoria grid: Only ${allPoints.length}/${expectedPoints} points fetched (${Math.round(completeness * 100)}%), keeping previous cache`);
    if (completeness === 0) throw new Error(`All tiles failed (429 rate limited) — no data fetched`);
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    if (cached) {
      try {
        const fallbackGrid = JSON.parse(cached.gridData) as VictoriaGrid;
        memVictoriaGrid = fallbackGrid;
        memVictoriaGridAt = Date.now();
        return fallbackGrid;
      } catch (e: any) {
        console.error("Victoria grid: Failed to parse cached data:", e.message);
      }
    }
  }

  const grid: VictoriaGrid = {
    latMin: VIC_LAT_MIN,
    latMax: VIC_LAT_MAX,
    lonMin: VIC_LON_MIN,
    lonMax: VIC_LON_MAX,
    delta: DELTA,
    ni, nj,
    points: allPoints,
    fetchedAt: Date.now()
  };

  try {
    const jsonStr = JSON.stringify(grid);
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${GRID_CACHE_KEY}_${today}`;
    await db.prepare("INSERT OR REPLACE INTO wind_grid_data (siteId, gridData, gridSize, gridSpacing, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .run(cacheKey, jsonStr, ni, DELTA);
    console.log(`Victoria grid: Cached for ${today} ${allPoints.length}/${expectedPoints} points (${(jsonStr.length / 1024 / 1024).toFixed(1)}MB)`);
    await cleanupOldGridData(GRID_CACHE_KEY);
  } catch (e) {
    console.error("Victoria grid: Failed to cache:", e);
  }

  memVictoriaGrid = grid;
  memVictoriaGridAt = Date.now();
  return grid;
}

function buildWideTiles(): { lats: number[]; lons: number[] }[] {
  const allLats: number[] = [];
  const allLons: number[] = [];

  for (let lat = WIDE_LAT_MIN; lat <= WIDE_LAT_MAX; lat += WIDE_DELTA) {
    allLats.push(parseFloat(lat.toFixed(4)));
  }
  for (let lon = WIDE_LON_MIN; lon <= WIDE_LON_MAX; lon += WIDE_DELTA) {
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

let inflightWideFetch: Promise<VictoriaGrid> | null = null;

export async function fetchWideGrid(force = false): Promise<VictoriaGrid> {
  if (!force) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${WIDE_GRID_CACHE_KEY}_${today}`) as any;
      if (cached) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (age < WIDE_GRID_CACHE_EXPIRY) {
          const grid = JSON.parse(cached.gridData) as VictoriaGrid;
          console.log(`Wide grid: Using cached data (age: ${Math.round(age / 60000)}min)`);
          memWideGrid = grid;
          memWideGridAt = Date.now();
          return grid;
        }
      }
    } catch (e) {
      console.error("Wide grid: Cache read error, will re-fetch", e);
    }
  }

  if (inflightWideFetch) {
    console.log("Wide grid: Waiting for in-flight fetch...");
    return inflightWideFetch;
  }

  inflightWideFetch = doFetchWideGrid();
  try {
    return await inflightWideFetch;
  } finally {
    inflightWideFetch = null;
  }
}

async function doFetchWideGrid(): Promise<VictoriaGrid> {
  console.log("Wide grid: Fetching fresh data from Open-Meteo...");

  const tiles = buildWideTiles();
  const totalPoints = tiles.reduce((s, t) => s + t.lats.length, 0);
  console.log(`Wide grid: ${totalPoints} total points in ${tiles.length} tiles`);

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

      console.log(`Wide grid: Tile ${i + 1}/${tiles.length} fetched (${tile.lats.length} points)`);

      if (i < tiles.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    } catch (err) {
      console.error(`Wide grid: Tile ${i + 1}/${tiles.length} failed:`, err);
    }
  }

  const ni = Math.round((WIDE_LON_MAX - WIDE_LON_MIN) / WIDE_DELTA) + 1;
  const nj = Math.round((WIDE_LAT_MAX - WIDE_LAT_MIN) / WIDE_DELTA) + 1;
  const completeness = allPoints.length / totalPoints;

  if (completeness < 0.8) {
    console.warn(`Wide grid: Only ${allPoints.length}/${totalPoints} points fetched (${Math.round(completeness * 100)}%), keeping previous cache`);
    if (completeness === 0) throw new Error(`All tiles failed (429 rate limited) — no data fetched`);
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${WIDE_GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${WIDE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    if (cached) {
      try {
        const fallbackGrid = JSON.parse(cached.gridData) as VictoriaGrid;
        memWideGrid = fallbackGrid;
        memWideGridAt = Date.now();
        return fallbackGrid;
      } catch (e: any) {
        console.error("Wide grid: Failed to parse cached data:", e.message);
      }
    }
  }

  const grid: VictoriaGrid = {
    latMin: WIDE_LAT_MIN,
    latMax: WIDE_LAT_MAX,
    lonMin: WIDE_LON_MIN,
    lonMax: WIDE_LON_MAX,
    delta: WIDE_DELTA,
    ni, nj,
    points: allPoints,
    fetchedAt: Date.now()
  };

  try {
    const jsonStr = JSON.stringify(grid);
    const today = new Date().toISOString().split('T')[0];
    const cacheKey = `${WIDE_GRID_CACHE_KEY}_${today}`;
    await db.prepare("INSERT OR REPLACE INTO wind_grid_data (siteId, gridData, gridSize, gridSpacing, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)")
      .run(cacheKey, jsonStr, ni, WIDE_DELTA);
    console.log(`Wide grid: Cached for ${today} ${allPoints.length}/${totalPoints} points (${(jsonStr.length / 1024).toFixed(0)}KB)`);
    await cleanupOldGridData(WIDE_GRID_CACHE_KEY);
  } catch (e) {
    console.error("Wide grid: Failed to cache:", e);
  }

  memWideGrid = grid;
  memWideGridAt = Date.now();
  return grid;
}

export async function getCachedVictoriaGrid(): Promise<VictoriaGrid | null> {
  if (memVictoriaGrid && Date.now() - memVictoriaGridAt < MEM_CACHE_TTL_MS) {
    return memVictoriaGrid;
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${GRID_CACHE_KEY}_${today}`) as any;

    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }

    if (cached) {
      const grid = JSON.parse(cached.gridData) as VictoriaGrid;
      memVictoriaGrid = grid;
      memVictoriaGridAt = Date.now();
      return grid;
    }
  } catch (e) {
    console.error("Victoria grid: Cache read error", e);
  }
  return null;
}

export async function getCachedWideGrid(): Promise<VictoriaGrid | null> {
  if (memWideGrid && Date.now() - memWideGridAt < MEM_CACHE_TTL_MS) {
    return memWideGrid;
  }
  try {
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData FROM wind_grid_data WHERE siteId = ?").get(`${WIDE_GRID_CACHE_KEY}_${today}`) as any;

    if (!cached) {
      const rows = await db.prepare(`SELECT gridData FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${WIDE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }

    if (cached) {
      const grid = JSON.parse(cached.gridData) as VictoriaGrid;
      memWideGrid = grid;
      memWideGridAt = Date.now();
      return grid;
    }
  } catch (e) {
    console.error("Wide grid: Cache read error", e);
  }
  return null;
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

export function extractFullWindGrid(grid: VictoriaGrid, wideGrid?: VictoriaGrid | null): any | null {
  if (!grid.points.length) return null;

  const firstPoint = grid.points[0];
  if (!firstPoint.hourly?.time) return null;

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);
  const result = gridToWindData(grid.points, DELTA, startIdx, selectedTimes);

  if (wideGrid && wideGrid.points.length > 0) {
    const wideFirstPoint = wideGrid.points[0];
    if (wideFirstPoint?.hourly?.time) {
      const wideTimeWindow = getTimeWindow(wideFirstPoint.hourly.time);
      const wideResult = gridToWindData(wideGrid.points, WIDE_DELTA, wideTimeWindow.startIdx, wideTimeWindow.selectedTimes);
      (result as any).wideGrid = wideResult;
    }
  }

  return result;
}

export function extractWindParticles(grid: VictoriaGrid, siteLat: number, siteLon: number, wideGrid?: VictoriaGrid | null): any | null {
  const spread = 1.5;
  const lonMin = siteLon - spread;
  const lonMax = siteLon + spread;
  const latMin = siteLat - spread;
  const latMax = siteLat + spread;

  const relevantPoints = grid.points.filter(p =>
    p.lat >= latMin - DELTA && p.lat <= latMax + DELTA &&
    p.lon >= lonMin - DELTA && p.lon <= lonMax + DELTA
  );

  if (relevantPoints.length === 0) return null;

  const firstPoint = relevantPoints[0];
  if (!firstPoint.hourly?.time) return null;

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);

  const result = gridToWindData(relevantPoints, DELTA, startIdx, selectedTimes);

  if (wideGrid && wideGrid.points.length > 0) {
    const wideFirstPoint = wideGrid.points[0];
    if (wideFirstPoint?.hourly?.time) {
      const wideTimeWindow = getTimeWindow(wideFirstPoint.hourly.time);
      const wideResult = gridToWindData(wideGrid.points, WIDE_DELTA, wideTimeWindow.startIdx, wideTimeWindow.selectedTimes);
      (result as any).wideGrid = wideResult;
    }
  }

  return result;
}

export async function fetchVictoriaGridWithStatus(): Promise<GridFetchStatus> {
  try {
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    const cacheAgeMs = cached ? Date.now() - new Date(cached.updatedAt).getTime() : null;
    const cacheAgeMinutes = cacheAgeMs ? Math.round(cacheAgeMs / 60000) : null;

    const grid = await fetchVictoriaGrid(true);

    if (!grid.points || grid.points.length === 0) {
      if (cacheAgeMinutes && cacheAgeMinutes < 18 * 60) {
        return {
          success: true,
          message: `Rate limited — using cache from ${cacheAgeMinutes} minutes ago (still valid)`,
          cacheAgeMinutes,
          pointsFetched: 0,
          pointsExpected: 390,
          fetchPercentage: 0
        };
      }
      return {
        success: false,
        message: 'Rate limited and no cached data available',
        pointsFetched: 0,
        pointsExpected: 390,
        fetchPercentage: 0
      };
    }

    const expectedPoints = Math.round((VIC_LON_MAX - VIC_LON_MIN) / DELTA + 1) * Math.round((VIC_LAT_MAX - VIC_LAT_MIN) / DELTA + 1);
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

export async function fetchWideGridWithStatus(): Promise<GridFetchStatus> {
  try {
    const today = new Date().toISOString().split('T')[0];
    let cached = await db.prepare("SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId = ?").get(`${WIDE_GRID_CACHE_KEY}_${today}`) as any;
    if (!cached) {
      const rows = await db.prepare(`SELECT gridData, updatedAt FROM wind_grid_data WHERE siteId LIKE ? ORDER BY siteId DESC LIMIT 1`).all(`${WIDE_GRID_CACHE_KEY}_%`) as any[];
      if (rows.length > 0) cached = rows[0];
    }
    const cacheAgeMs = cached ? Date.now() - new Date(cached.updatedAt).getTime() : null;
    const cacheAgeMinutes = cacheAgeMs ? Math.round(cacheAgeMs / 60000) : null;

    const grid = await fetchWideGrid(true);

    if (!grid.points || grid.points.length === 0) {
      if (cacheAgeMinutes && cacheAgeMinutes < 18 * 60) {
        return {
          success: true,
          message: `Rate limited — using cache from ${cacheAgeMinutes} minutes ago (still valid)`,
          cacheAgeMinutes,
          pointsFetched: 0,
          pointsExpected: 713,
          fetchPercentage: 0
        };
      }
      return {
        success: false,
        message: 'Rate limited and no cached data available',
        pointsFetched: 0,
        pointsExpected: 713,
        fetchPercentage: 0
      };
    }

    const expectedPoints = Math.round((WIDE_LON_MAX - WIDE_LON_MIN) / WIDE_DELTA + 1) * Math.round((WIDE_LAT_MAX - WIDE_LAT_MIN) / WIDE_DELTA + 1);
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

