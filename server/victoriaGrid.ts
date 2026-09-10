import { query, queryOne, execute } from "./pg.js";
import { fetchWithRetry, getWeatherCodeSummary, degreesToDirection } from "./weather-utils.js";
import { fromZonedTime } from 'date-fns-tz';
import { buildOpenMeteoParams } from "./utils/openMeteo.js";

const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY || "";
const OPEN_METEO_URL = OPEN_METEO_API_KEY
  ? `https://customer-api.open-meteo.com/v1/forecast`
  : `https://api.open-meteo.com/v1/forecast`;

const FINE_GRID_CACHE_KEY = "fine_grid";
const THERMAL_GRID_CACHE_KEY = "thermal_grid";
const GRID_CACHE_EXPIRY = 26 * 60 * 60 * 1000;
const TILE_DELAY_MS = 3000;

// Exported so the weather scraper can yield during grid fetches
export let gridFetchActive = false;

function melbourneToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
}

/** Escape underscores in a LIKE pattern to prevent SQL wildcard collisions. */
function escapeLike(key: string): string {
  return key.replace(/_/g, '\\_');
}

export interface GridFetchStatus {
  success: boolean;
  message: string;
  pointsFetched?: number;
  pointsExpected?: number;
  fetchPercentage?: number;
  cacheAgeMinutes?: number;
}

// Default bounds — Victoria + surrounds, covering all club sites
const FINE_LAT_MIN = -39.5;
const FINE_LAT_MAX = -33.5;
const FINE_LON_MIN = 140.0;
const FINE_LON_MAX = 151.0;
const FINE_DELTA = 0.15;

// Thermal grid: same bounds, finer resolution, CAPE + BLH only
const THERMAL_DELTA = 0.09;
const THERMAL_MAX_PER_TILE = 300;

export interface GridBounds {
  fineLatMin: number; fineLatMax: number; fineLonMin: number; fineLonMax: number;
}

export async function getGridBounds(): Promise<GridBounds> {
  const keys = ['gridFineLatMin', 'gridFineLatMax', 'gridFineLonMin', 'gridFineLonMax'];
  try {
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM settings WHERE key IN (${keys.map((_k, i) => `$${i + 1}`).join(',')})`,
      keys
    );
    const s: Record<string, number> = {};
    for (const r of rows) s[r.key] = parseFloat(r.value);
    return {
      fineLatMin: Number.isFinite(s.gridFineLatMin) ? s.gridFineLatMin : FINE_LAT_MIN,
      fineLatMax: Number.isFinite(s.gridFineLatMax) ? s.gridFineLatMax : FINE_LAT_MAX,
      fineLonMin: Number.isFinite(s.gridFineLonMin) ? s.gridFineLonMin : FINE_LON_MIN,
      fineLonMax: Number.isFinite(s.gridFineLonMax) ? s.gridFineLonMax : FINE_LON_MAX,
    };
  } catch {
    return {
      fineLatMin: FINE_LAT_MIN, fineLatMax: FINE_LAT_MAX,
      fineLonMin: FINE_LON_MIN, fineLonMax: FINE_LON_MAX,
    };
  }
}

async function cleanupOldGridData(baseKey: string): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const safePrefix = escapeLike(baseKey);
    const result = await execute(`DELETE FROM wind_grid_data WHERE "siteId" LIKE $1 ESCAPE '\\' AND "siteId" < $2`, [`${safePrefix}\\_%`, `${baseKey}_${sevenDaysAgo}`]);
    if (result.rowCount > 0) {
      console.log(`${baseKey}: Cleaned up ${result.rowCount} old grid records`);
    }
  } catch (e) {
    console.error(`${baseKey}: Cleanup error`, e);
  }
}

// ─── Fine wind/weather grid ───────────────────────────────────────────────────

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
    precipitation: number[];
    precipitation_probability: number[];
    cloud_cover: number[];
    cloud_cover_low: number[];
    visibility: number[];
    cape: number[];
    boundary_layer_height: number[];
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
    tiles.push({ lats: chunk.map(p => p.lat), lons: chunk.map(p => p.lon) });
  }
  return tiles;
}

const MEM_CACHE_TTL_MS = 30 * 60 * 1000;
let memFineGrid: VictoriaGrid | null = null;
let memFineGridAt = 0;

let cachedFullWindOverlay: any = null;
let cachedFullWindOverlayKey = '';
let cachedThermalOverlay: any = null;
let cachedThermalOverlayKey = '';

let inflightFetch: Promise<VictoriaGrid> | null = null;

export async function fetchFineGrid(force = false): Promise<VictoriaGrid> {
  if (!force) {
    try {
      const today = melbourneToday();
      const cached = await queryOne<{ gridData: string; updatedAt: string }>(`SELECT "gridData", "updatedAt" FROM wind_grid_data WHERE "siteId" = $1`, [`${FINE_GRID_CACHE_KEY}_${today}`]);
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
  gridFetchActive = true;
  try {
    return await inflightFetch;
  } finally {
    inflightFetch = null;
    gridFetchActive = false;
  }
}

async function doFetchFineGrid(): Promise<VictoriaGrid> {
  console.log("Fine grid: Fetching fresh data from Open-Meteo (ecmwf_ifs, ~0.07deg)...");

  const bounds = await getGridBounds();
  const tiles = await buildFineTiles();
  console.log(`Fine grid: ${tiles.reduce((s, t) => s + t.lats.length, 0)} total points in ${tiles.length} tiles`);

  const allPoints: GridPoint[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const params = buildOpenMeteoParams({
      lats: tile.lats,
      lons: tile.lons,
      hourlyFields: 'temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code,precipitation,precipitation_probability,cloud_cover,cloud_cover_low,visibility,cape,boundary_layer_height',
      forecastDays: 2,
      apiKey: OPEN_METEO_API_KEY || undefined,
    });

    const url = `${OPEN_METEO_URL}?${params.toString()}`;

    try {
      const rawData = await fetchWithRetry(url);
      const results = Array.isArray(rawData) ? rawData : [rawData];

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (!r?.hourly) continue;
        const h = r.hourly;
        if (!Array.isArray(h.wind_speed_10m) || !Array.isArray(h.wind_direction_10m)) {
          console.warn(`Fine grid: Skipping point ${tile.lats[j]},${tile.lons[j]} — missing hourly arrays`);
          continue;
        }
        allPoints.push({
          lat: tile.lats[j],
          lon: tile.lons[j],
          hourly: {
            time: h.time ?? [],
            wind_speed_10m: h.wind_speed_10m,
            wind_gusts_10m: h.wind_gusts_10m ?? [],
            wind_direction_10m: h.wind_direction_10m,
            temperature_2m: h.temperature_2m ?? [],
            weather_code: h.weather_code ?? [],
            precipitation: h.precipitation ?? [],
            precipitation_probability: h.precipitation_probability ?? [],
            cloud_cover: h.cloud_cover ?? [],
            cloud_cover_low: h.cloud_cover_low ?? [],
            visibility: h.visibility ?? [],
            cape: h.cape ?? [],
            boundary_layer_height: h.boundary_layer_height ?? [],
          }
        });
      }

      console.log(`Fine grid: Tile ${i + 1}/${tiles.length} fetched (${tile.lats.length} points)`);

      if (i < tiles.length - 1) {
        await new Promise(r => setTimeout(r, TILE_DELAY_MS));
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
    const today = melbourneToday();
    let cached = await queryOne<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" = $1`, [`${FINE_GRID_CACHE_KEY}_${today}`]);
    if (!cached) {
      const rows = await query<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" LIKE $1 ESCAPE '\\' ORDER BY "siteId" DESC LIMIT 1`, [`${escapeLike(FINE_GRID_CACHE_KEY)}\\_%`]);
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

  const jsonStr = JSON.stringify(grid);
  const today = melbourneToday();
  const cacheKey = `${FINE_GRID_CACHE_KEY}_${today}`;
  await execute(
    `INSERT INTO wind_grid_data ("siteId", "gridData", "gridSize", "gridSpacing", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) ON CONFLICT ("siteId") DO UPDATE SET "gridData" = EXCLUDED."gridData", "gridSize" = EXCLUDED."gridSize", "gridSpacing" = EXCLUDED."gridSpacing", "updatedAt" = EXCLUDED."updatedAt"`,
    [cacheKey, jsonStr, ni, FINE_DELTA]
  );
  console.log(`Fine grid: Cached for ${today} ${allPoints.length}/${expectedPoints} points (${(jsonStr.length / 1024 / 1024).toFixed(1)}MB)`);
  try {
    await cleanupOldGridData(FINE_GRID_CACHE_KEY);
  } catch (e) {
    console.error("Fine grid: Cleanup error (non-fatal):", e);
  }

  memFineGrid = grid;
  memFineGridAt = Date.now();
  return grid;
}

export async function getCachedFineGrid(): Promise<VictoriaGrid | null> {
  if (memFineGrid && Date.now() - memFineGridAt < MEM_CACHE_TTL_MS) {
    return memFineGrid;
  }
  try {
    const today = melbourneToday();
    let cached = await queryOne<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" = $1`, [`${FINE_GRID_CACHE_KEY}_${today}`]);

    if (!cached) {
      const rows = await query<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" LIKE $1 ESCAPE '\\' ORDER BY "siteId" DESC LIMIT 1`, [`${escapeLike(FINE_GRID_CACHE_KEY)}\\_%`]);
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

// ─── Thermal grid (CAPE + BLH at 0.09°) ─────────────────────────────────────

interface ThermalPoint {
  lat: number;
  lon: number;
  hourly: {
    time: string[];
    cape: number[];
    boundary_layer_height: number[];
    surface_sensible_heat_flux: number[];
    temperature_2m: number[];
    dew_point_2m: number[];
  };
}

function computeWstar(blh: number, ishf: number): number {
  if (blh < 50 || ishf <= 0) return 0;
  // W* = (g/(Θ·ρ·Cp) · BLH · Hs)^(1/3), coefficient ≈ 2.824e-5
  return Math.cbrt(2.824e-5 * blh * ishf);
}

function computeCCL(t2m: number, td2m: number): number {
  // Empirical: 1°C T-Td spread ≈ 125 m cloud base AGL
  return Math.max(0, t2m - td2m) * 125;
}

interface ThermalVictoriaGrid {
  latMin: number; latMax: number;
  lonMin: number; lonMax: number;
  delta: number; ni: number; nj: number;
  points: ThermalPoint[];
  fetchedAt: number;
}

let memThermalGrid: ThermalVictoriaGrid | null = null;
let memThermalGridAt = 0;
let inflightThermalFetch: Promise<ThermalVictoriaGrid> | null = null;

async function buildThermalTiles(): Promise<{ lats: number[]; lons: number[] }[]> {
  const bounds = await getGridBounds();
  const allLats: number[] = [];
  const allLons: number[] = [];

  for (let lat = bounds.fineLatMin; lat <= bounds.fineLatMax; lat += THERMAL_DELTA) {
    allLats.push(parseFloat(lat.toFixed(4)));
  }
  for (let lon = bounds.fineLonMin; lon <= bounds.fineLonMax; lon += THERMAL_DELTA) {
    allLons.push(parseFloat(lon.toFixed(4)));
  }

  const allPoints: { lat: number; lon: number }[] = [];
  for (const lat of allLats) {
    for (const lon of allLons) {
      allPoints.push({ lat, lon });
    }
  }

  const tiles: { lats: number[]; lons: number[] }[] = [];
  for (let i = 0; i < allPoints.length; i += THERMAL_MAX_PER_TILE) {
    const chunk = allPoints.slice(i, i + THERMAL_MAX_PER_TILE);
    tiles.push({ lats: chunk.map(p => p.lat), lons: chunk.map(p => p.lon) });
  }
  return tiles;
}

export async function fetchThermalGrid(force = false): Promise<ThermalVictoriaGrid> {
  if (!force) {
    try {
      const today = melbourneToday();
      const cached = await queryOne<{ gridData: string; updatedAt: string }>(`SELECT "gridData", "updatedAt" FROM wind_grid_data WHERE "siteId" = $1`, [`${THERMAL_GRID_CACHE_KEY}_${today}`]);
      if (cached) {
        const age = Date.now() - new Date(cached.updatedAt).getTime();
        if (age < GRID_CACHE_EXPIRY) {
          const grid = JSON.parse(cached.gridData) as ThermalVictoriaGrid;
          console.log(`Thermal grid: Using cached data (age: ${Math.round(age / 60000)}min)`);
          memThermalGrid = grid;
          memThermalGridAt = Date.now();
          return grid;
        }
      }
    } catch (e) {
      console.error("Thermal grid: Cache read error, will re-fetch", e);
    }
  }

  if (inflightThermalFetch) {
    console.log("Thermal grid: Waiting for in-flight fetch...");
    return inflightThermalFetch;
  }

  inflightThermalFetch = doFetchThermalGrid();
  gridFetchActive = true;
  try {
    return await inflightThermalFetch;
  } finally {
    inflightThermalFetch = null;
    gridFetchActive = false;
  }
}

async function setThermalProgress(value: string) {
  try {
    await execute(
      `INSERT INTO settings (key, value) VALUES ('thermalGridProgress', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [value]
    );
  } catch { /* non-fatal */ }
}

async function doFetchThermalGrid(): Promise<ThermalVictoriaGrid> {
  console.log("Thermal grid: Fetching fresh data from Open-Meteo (ecmwf_ifs, ~0.07deg, CAPE+BLH only)...");

  const bounds = await getGridBounds();
  const tiles = await buildThermalTiles();
  const totalPoints = tiles.reduce((s, t) => s + t.lats.length, 0);
  const totalTiles = tiles.length;
  console.log(`Thermal grid: ${totalPoints} total points in ${totalTiles} tiles`);
  await setThermalProgress(`0 / ${totalTiles} tiles`);

  const allPoints: ThermalPoint[] = [];
  let failedTiles = 0;

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const params = buildOpenMeteoParams({
      lats: tile.lats,
      lons: tile.lons,
      hourlyFields: 'cape,boundary_layer_height,surface_sensible_heat_flux,temperature_2m,dew_point_2m',
      forecastDays: 2,
      apiKey: OPEN_METEO_API_KEY || undefined,
    });

    const url = `${OPEN_METEO_URL}?${params.toString()}`;

    try {
      const rawData = await fetchWithRetry(url);
      const results = Array.isArray(rawData) ? rawData : [rawData];

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (!r?.hourly) continue;
        const h = r.hourly;
        allPoints.push({
          lat: tile.lats[j],
          lon: tile.lons[j],
          hourly: {
            time: h.time ?? [],
            cape: h.cape ?? [],
            boundary_layer_height: h.boundary_layer_height ?? [],
            surface_sensible_heat_flux: h.surface_sensible_heat_flux ?? [],
            temperature_2m: h.temperature_2m ?? [],
            dew_point_2m: h.dew_point_2m ?? [],
          }
        });
      }

      console.log(`Thermal grid: Tile ${i + 1}/${totalTiles} fetched (${tile.lats.length} points)`);
      await setThermalProgress(`${i + 1} / ${totalTiles} tiles`);

      if (i < tiles.length - 1) {
        await new Promise(r => setTimeout(r, TILE_DELAY_MS));
      }
    } catch (err) {
      failedTiles++;
      console.error(`Thermal grid: Tile ${i + 1}/${totalTiles} failed:`, err);
      await setThermalProgress(`${i + 1} / ${totalTiles} tiles (${failedTiles} failed)`);
    }
  }

  const ni = Math.round((bounds.fineLonMax - bounds.fineLonMin) / THERMAL_DELTA) + 1;
  const nj = Math.round((bounds.fineLatMax - bounds.fineLatMin) / THERMAL_DELTA) + 1;
  const completeness = allPoints.length / totalPoints;

  if (completeness < 0.8) {
    console.warn(`Thermal grid: Only ${allPoints.length}/${totalPoints} points fetched (${Math.round(completeness * 100)}%), keeping previous cache`);
    await setThermalProgress('');
    if (completeness === 0) throw new Error(`All thermal tiles failed — rate limited or no connectivity`);
    const today = melbourneToday();
    let cached = await queryOne<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" = $1`, [`${THERMAL_GRID_CACHE_KEY}_${today}`]);
    if (!cached) {
      const rows = await query<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" LIKE $1 ESCAPE '\\' ORDER BY "siteId" DESC LIMIT 1`, [`${escapeLike(THERMAL_GRID_CACHE_KEY)}\\_%`]);
      if (rows.length > 0) cached = rows[0];
    }
    if (cached) {
      try {
        const fallbackGrid = JSON.parse(cached.gridData) as ThermalVictoriaGrid;
        memThermalGrid = fallbackGrid;
        memThermalGridAt = Date.now();
        return fallbackGrid;
      } catch (e: any) {
        console.error("Thermal grid: Failed to parse cached data:", e.message);
      }
    }
    throw new Error(`Thermal grid too incomplete (${Math.round(completeness * 100)}%) and no previous cache available`);
  }

  const grid: ThermalVictoriaGrid = {
    latMin: bounds.fineLatMin, latMax: bounds.fineLatMax,
    lonMin: bounds.fineLonMin, lonMax: bounds.fineLonMax,
    delta: THERMAL_DELTA, ni, nj,
    points: allPoints,
    fetchedAt: Date.now()
  };

  const jsonStr = JSON.stringify(grid);
  const today = melbourneToday();
  const cacheKey = `${THERMAL_GRID_CACHE_KEY}_${today}`;
  await execute(
    `INSERT INTO wind_grid_data ("siteId", "gridData", "gridSize", "gridSpacing", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) ON CONFLICT ("siteId") DO UPDATE SET "gridData" = EXCLUDED."gridData", "gridSize" = EXCLUDED."gridSize", "gridSpacing" = EXCLUDED."gridSpacing", "updatedAt" = EXCLUDED."updatedAt"`,
    [cacheKey, jsonStr, ni, THERMAL_DELTA]
  );
  await setThermalProgress('');
  console.log(`Thermal grid: Cached for ${today} ${allPoints.length}/${totalPoints} points (${(jsonStr.length / 1024 / 1024).toFixed(1)}MB)`);
  try {
    await cleanupOldGridData(THERMAL_GRID_CACHE_KEY);
  } catch (e) {
    console.error("Thermal grid: Cleanup error (non-fatal):", e);
  }

  memThermalGrid = grid;
  memThermalGridAt = Date.now();
  return grid;
}

export async function getCachedThermalGrid(): Promise<ThermalVictoriaGrid | null> {
  if (memThermalGrid && Date.now() - memThermalGridAt < MEM_CACHE_TTL_MS) {
    return memThermalGrid;
  }
  try {
    const today = melbourneToday();
    let cached = await queryOne<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" = $1`, [`${THERMAL_GRID_CACHE_KEY}_${today}`]);
    if (!cached) {
      const rows = await query<{ gridData: string }>(`SELECT "gridData" FROM wind_grid_data WHERE "siteId" LIKE $1 ESCAPE '\\' ORDER BY "siteId" DESC LIMIT 1`, [`${escapeLike(THERMAL_GRID_CACHE_KEY)}\\_%`]);
      if (rows.length > 0) cached = rows[0];
    }
    if (cached) {
      const grid = JSON.parse(cached.gridData) as ThermalVictoriaGrid;
      memThermalGrid = grid;
      memThermalGridAt = Date.now();
      return grid;
    }
  } catch (e) {
    console.error("Thermal grid: Cache read error", e);
  }
  return null;
}

// ─── Cache invalidation ───────────────────────────────────────────────────────

export function clearFineGridCaches(): void {
  memFineGrid = null;
  memFineGridAt = 0;
  memThermalGrid = null;
  memThermalGridAt = 0;
  cachedFullWindOverlay = null;
  cachedFullWindOverlayKey = '';
  cachedThermalOverlay = null;
  cachedThermalOverlayKey = '';
}

// ─── Thermal overlay extraction ───────────────────────────────────────────────

export function extractThermalGrid(grid: ThermalVictoriaGrid): any | null {
  if (!grid.points.length) return null;
  const firstPoint = grid.points[0];
  if (!firstPoint.hourly?.time) return null;

  const cacheKey = `thermal_${grid.fetchedAt}`;
  if (cachedThermalOverlay && cacheKey === cachedThermalOverlayKey) {
    return cachedThermalOverlay;
  }

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);

  const subLons = [...new Set(grid.points.map(p => p.lon))].sort((a, b) => a - b);
  const subLats = [...new Set(grid.points.map(p => p.lat))].sort((a, b) => a - b);
  const ni = subLons.length;
  const nj = subLats.length;

  const pointMap = new Map<string, ThermalPoint>();
  for (const p of grid.points) {
    pointMap.set(`${p.lat.toFixed(4)},${p.lon.toFixed(4)}`, p);
  }

  const data: { cape: number; blh: number; wstar?: number; ccl?: number }[][] = [];

  for (let t = 0; t < selectedTimes.length; t++) {
    const timeIdx = startIdx + t;
    const timeStepData: { cape: number; blh: number; wstar?: number; ccl?: number }[] = [];
    for (const lat of subLats) {
      for (const lon of subLons) {
        const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
        const point = pointMap.get(key);
        if (point && timeIdx < (point.hourly.cape?.length ?? 0)) {
          const blh      = point.hourly.boundary_layer_height[timeIdx] ?? 0;
          const ishfArr  = point.hourly.surface_sensible_heat_flux;
          const t2mArr   = point.hourly.temperature_2m;
          const td2mArr  = point.hourly.dew_point_2m;
          const hasNewFields = Array.isArray(ishfArr) && ishfArr.length > 0;
          timeStepData.push({
            cape:  point.hourly.cape[timeIdx] ?? 0,
            blh,
            wstar: hasNewFields ? computeWstar(blh, ishfArr[timeIdx] ?? 0) : undefined,
            ccl:   hasNewFields ? computeCCL(t2mArr?.[timeIdx] ?? 15, td2mArr?.[timeIdx] ?? 10) : undefined,
          });
        } else {
          timeStepData.push({ cape: 0, blh: 0 });
        }
      }
    }
    data.push(timeStepData);
  }

  const result = {
    lonMin: parseFloat(subLons[0].toFixed(4)),
    lonMax: parseFloat(subLons[subLons.length - 1].toFixed(4)),
    latMin: parseFloat(subLats[0].toFixed(4)),
    latMax: parseFloat(subLats[subLats.length - 1].toFixed(4)),
    deltaLon: grid.delta,
    deltaLat: grid.delta,
    ni, nj,
    times: selectedTimes,
    data,
  };

  cachedThermalOverlay = result;
  cachedThermalOverlayKey = cacheKey;
  return result;
}

// ─── Wind grid utilities ──────────────────────────────────────────────────────

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

  let hourIdx = nearest.hourly.time.indexOf(dateStr);
  if (hourIdx === -1) {
    let fallbackIdx = -1;
    for (let i = nearest.hourly.time.length - 1; i >= 0; i--) {
      if (nearest.hourly.time[i] <= dateStr) { fallbackIdx = i; break; }
    }
    if (fallbackIdx === -1) fallbackIdx = 0;
    const gridEnd = nearest.hourly.time[nearest.hourly.time.length - 1];
    console.warn(`extractSiteForecast: ${dateStr} not in grid (grid ends ${gridEnd}), using ${nearest.hourly.time[fallbackIdx]} — fine grid is stale`);
    hourIdx = fallbackIdx;
  }

  if (hourIdx < 0 || hourIdx >= nearest.hourly.wind_speed_10m.length) {
    console.warn(`extractSiteForecast: hourIdx ${hourIdx} out of bounds for ${siteId}`);
    return null;
  }
  const temp = nearest.hourly.temperature_2m[hourIdx] ?? 0;
  const windSpeed = Math.round(nearest.hourly.wind_speed_10m[hourIdx] ?? 0);
  const windGust = Math.round(nearest.hourly.wind_gusts_10m[hourIdx] ?? 0);
  const windDirection = degreesToDirection(nearest.hourly.wind_direction_10m[hourIdx] ?? 0);
  const weatherCode = nearest.hourly.weather_code[hourIdx] ?? 0;
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
          time: hTime.split('T')[1]?.slice(0, 5) ?? '',
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
        if (!hTime.startsWith(melbDateStr)) break;
        const hUtcDate = fromZonedTime(hTime, 'Australia/Melbourne');
        const hCode = nearest.hourly.weather_code[idx];
        forecastHours.push({
          timestamp: hUtcDate.toISOString(),
          time: hTime.split('T')[1]?.slice(0, 5) ?? '',
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

export function extractFullWindGrid(grid: VictoriaGrid): any | null {
  if (!grid.points.length) return null;

  const firstPoint = grid.points[0];
  if (!firstPoint.hourly?.time) return null;

  const melbNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
  const melbDate = `${melbNow.getFullYear()}-${String(melbNow.getMonth() + 1).padStart(2, '0')}-${String(melbNow.getDate()).padStart(2, '0')}`;
  const cacheKey = `${grid.fetchedAt}|${melbDate}`;

  if (cachedFullWindOverlay && cacheKey === cachedFullWindOverlayKey) {
    return cachedFullWindOverlay;
  }

  const { startIdx, selectedTimes } = getTimeWindow(firstPoint.hourly.time);
  const result = gridToWindData(grid.points, grid.delta, startIdx, selectedTimes);

  cachedFullWindOverlay = result;
  cachedFullWindOverlayKey = cacheKey;
  return result;
}

export function extractWindParticles(grid: VictoriaGrid, siteLat: number, siteLon: number): any | null {
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
  return gridToWindData(relevantPoints, grid.delta, startIdx, selectedTimes);
}
