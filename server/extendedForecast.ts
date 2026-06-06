import { query, queryOne, execute } from "./pg.js";
import { fetchWithRetry, getWeatherCodeSummary, degreesToDirection } from "./weather-utils.js";
import { fromZonedTime } from 'date-fns-tz';
import { getCachedFineGrid, getTimeWindow, getGridBounds, type GridFetchStatus } from "./victoriaGrid.js";

const OPEN_METEO_API_KEY = process.env.OPEN_METEO_API_KEY || "";
const OPEN_METEO_URL = OPEN_METEO_API_KEY
  ? `https://customer-api.open-meteo.com/v1/forecast`
  : `https://api.open-meteo.com/v1/forecast`;

const EXT_DELTA = 0.5;

interface ExtendedGridPoint {
  lat: number;
  lon: number;
  times: string[];
  windSpeed: number[];
  windGust: number[];
  windDirection: number[];
  temperature: number[];
  weatherCode: number[];
}

interface ExtendedGrid {
  latMin: number;
  latMax: number;
  lonMin: number;
  lonMax: number;
  delta: number;
  points: ExtendedGridPoint[];
  fetchedAt: number;
}

interface SiteExtendedForecast {
  siteId: string;
  days: {
    date: string;
    dayName: string;
    slots: {
      time: string;
      windSpeed: number;
      windGust: number;
      windDirection: string;
      windDirectionDeg: number;
      temperature: number;
      weatherCode: number;
      weatherSummary: string;
      weatherIcon: string;
    }[];
    bestSpeed: number;
    bestDirection: string;
    bestWeatherCode: number;
    bestWeatherIcon: string;
    bestWeatherSummary: string;
  }[];
  updatedAt: string;
}

async function buildExtendedTiles(): Promise<{ lats: number[]; lons: number[] }[]> {
  const bounds = await getGridBounds();
  const allPoints: { lat: number; lon: number }[] = [];
  for (let lat = bounds.fineLatMin; lat <= bounds.fineLatMax; lat += EXT_DELTA) {
    for (let lon = bounds.fineLonMin; lon <= bounds.fineLonMax; lon += EXT_DELTA) {
      allPoints.push({
        lat: parseFloat(lat.toFixed(4)),
        lon: parseFloat(lon.toFixed(4))
      });
    }
  }

  const MAX_PER_TILE = 50;
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

function getMelbourneDate(daysOffset = 0): string {
  const now = new Date();
  const melb = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
  melb.setDate(melb.getDate() + daysOffset);
  const y = melb.getFullYear();
  const m = String(melb.getMonth() + 1).padStart(2, '0');
  const d = String(melb.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMelbourneDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Melbourne' });
}

function filterToExtendedSlots(times: string[], data: {
  windSpeed: number[];
  windGust: number[];
  windDirection: number[];
  temperature: number[];
  weatherCode: number[];
}): { filteredTimes: string[]; filteredData: typeof data } {
  const today = getMelbourneDate(0);
  const tomorrow = getMelbourneDate(1);
  const targetHours = [7, 11, 15, 19];

  const filteredIndices: number[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const dateStr = t.substring(0, 10);
    const hour = parseInt(t.substring(11, 13));

    if (dateStr < tomorrow) continue;

    if (targetHours.includes(hour)) {
      filteredIndices.push(i);
    }
  }

  return {
    filteredTimes: filteredIndices.map(i => times[i]),
    filteredData: {
      windSpeed: filteredIndices.map(i => data.windSpeed[i]),
      windGust: filteredIndices.map(i => data.windGust[i]),
      windDirection: filteredIndices.map(i => data.windDirection[i]),
      temperature: filteredIndices.map(i => data.temperature[i]),
      weatherCode: filteredIndices.map(i => data.weatherCode[i]),
    }
  };
}

let extendedFetchInProgress = false;

export async function fetchExtendedForecast(): Promise<void> {
  if (extendedFetchInProgress) {
    console.log("Extended forecast: Fetch already in progress, skipping");
    return;
  }

  extendedFetchInProgress = true;
  console.log("Extended forecast: Starting daily fetch for days 3-7...");

  try {
    const fineBounds = await getGridBounds();
    const tiles = await buildExtendedTiles();
    const totalPoints = tiles.reduce((s, t) => s + t.lats.length, 0);
    console.log(`Extended forecast: ${totalPoints} points in ${tiles.length} tiles`);

    const allPoints: ExtendedGridPoint[] = [];

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const params = new URLSearchParams({
        latitude: tile.lats.join(','),
        longitude: tile.lons.join(','),
        hourly: 'temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,weather_code',
        models: 'ecmwf_ifs025',
        wind_speed_unit: 'kn',
        timezone: 'Australia/Melbourne',
        forecast_days: '8'
      });
      if (OPEN_METEO_API_KEY) params.set('apikey', OPEN_METEO_API_KEY);

      const url = `${OPEN_METEO_URL}?${params.toString()}`;

      try {
        const rawData = await fetchWithRetry(url);
        const results = Array.isArray(rawData) ? rawData : [rawData];

        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (!r?.hourly) continue;

          const { filteredTimes, filteredData } = filterToExtendedSlots(r.hourly.time, {
            windSpeed: r.hourly.wind_speed_10m,
            windGust: r.hourly.wind_gusts_10m,
            windDirection: r.hourly.wind_direction_10m,
            temperature: r.hourly.temperature_2m,
            weatherCode: r.hourly.weather_code,
          });

          if (filteredTimes.length > 0) {
            allPoints.push({
              lat: tile.lats[j],
              lon: tile.lons[j],
              times: filteredTimes,
              windSpeed: filteredData.windSpeed,
              windGust: filteredData.windGust,
              windDirection: filteredData.windDirection,
              temperature: filteredData.temperature,
              weatherCode: filteredData.weatherCode,
            });
          }
        }

        console.log(`Extended forecast: Tile ${i + 1}/${tiles.length} fetched`);

        if (i < tiles.length - 1) {
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (err) {
        console.error(`Extended forecast: Tile ${i + 1}/${tiles.length} failed:`, err);
      }
    }

    if (allPoints.length < totalPoints * 0.5) {
      throw new Error(`Only ${allPoints.length}/${totalPoints} grid points returned — API may be rate-limited or grid config changed. site_extended_forecasts NOT updated.`);
    }

    const grid: ExtendedGrid = {
      latMin: fineBounds.fineLatMin,
      latMax: fineBounds.fineLatMax,
      lonMin: fineBounds.fineLonMin,
      lonMax: fineBounds.fineLonMax,
      delta: EXT_DELTA,
      points: allPoints,
      fetchedAt: Date.now()
    };

    const gridJson = JSON.stringify(grid);
    const today = new Date().toISOString().split('T')[0];
    await execute(
      `INSERT INTO extended_forecasts (id, "gridData", "fetchedAt") VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (id) DO UPDATE SET "gridData" = EXCLUDED."gridData", "fetchedAt" = EXCLUDED."fetchedAt"`,
      [`extended_grid_${today}`, gridJson]
    );
    console.log(`Extended forecast: Saved grid for ${today} (${allPoints.length} points, ${(gridJson.length / 1024).toFixed(0)}KB)`);

    await cleanupOldExtendedForecasts();

    await extractAllSiteExtendedForecasts(grid);

    console.log("Extended forecast: Computing wind grid for the day...");
    const windGrid = await computeExtendedWindGrid(grid);
    cacheWindGrid(windGrid);
    console.log("Extended forecast: Wind grid cached in memory (24h TTL)");

  } catch (err) {
    console.error("Extended forecast: CRITICAL ERROR:", err);
  } finally {
    extendedFetchInProgress = false;
  }
}

function findNearestExtendedPoint(grid: ExtendedGrid, lat: number, lon: number): ExtendedGridPoint | null {
  let best: ExtendedGridPoint | null = null;
  let bestDist = Infinity;
  for (const p of grid.points) {
    const dlat = p.lat - lat;
    const dlon = p.lon - lon;
    const dist = dlat * dlat + dlon * dlon;
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

async function extractAllSiteExtendedForecasts(extendedGrid: ExtendedGrid): Promise<void> {
  const sites = await query<{ id: string; lat: number; lon: number; windSpeed: string | null; windDir: string | null }>("SELECT id, lat, lon, \"windSpeed\", \"windDir\" FROM sites");

  const existingForecasts = await query<{ siteId: string; forecasts: string }>(`SELECT "siteId", forecasts FROM weather_forecasts`);
  const forecastMap = new Map(existingForecasts.map(f => [f.siteId, f.forecasts]));

  const vicGrid = await getCachedFineGrid();

  let updated = 0;
  const skippedNoCoords: string[] = [];
  const skippedNullForecast: string[] = [];

  for (const site of sites) {
    if (!site.lat || !site.lon) {
      skippedNoCoords.push(site.id);
      continue;
    }

    try {
      const forecast = buildSiteExtendedForecast(site.id, site.lat, site.lon, extendedGrid, forecastMap.get(site.id), vicGrid, site);
      if (forecast) {
        await execute(
          `INSERT INTO site_extended_forecasts ("siteId", "forecastData", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT ("siteId") DO UPDATE SET "forecastData" = EXCLUDED."forecastData", "updatedAt" = EXCLUDED."updatedAt"`,
          [site.id, JSON.stringify(forecast)]
        );
        updated++;
      } else {
        skippedNullForecast.push(site.id);
      }
    } catch (err) {
      console.error(`Extended forecast: Failed for site ${site.id}:`, err);
    }
  }

  console.log(`Extended forecast: Updated ${updated}/${sites.length} site forecasts`);
  if (skippedNoCoords.length > 0) console.warn(`Extended forecast: Skipped (no lat/lon): ${skippedNoCoords.join(', ')}`);
  if (skippedNullForecast.length > 0) console.warn(`Extended forecast: Skipped (null forecast — no grid match): ${skippedNullForecast.join(', ')}`);
}

function pickBestSlotIdx(slots: { windSpeed: number; windDirection: string }[], siteInfo?: { windSpeed: string | null; windDir: string | null }): number {
  if (!siteInfo || slots.length === 0) return Math.min(Math.floor(slots.length / 2), Math.max(slots.length - 1, 0));

  let minSpeed: number | null = null;
  let maxSpeed: number | null = null;
  const speedText = siteInfo.windSpeed || siteInfo.windDir || '';
  const nums = speedText.match(/\d+/g);
  if (nums && nums.length >= 2) {
    minSpeed = parseInt(nums[0]);
    maxSpeed = parseInt(nums[1]);
  } else if (nums && nums.length === 1) {
    minSpeed = parseInt(nums[0]);
    maxSpeed = parseInt(nums[0]);
  }

  let idealDirs: string[] = [];
  if (siteInfo.windDir) {
    const allDirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    const parts = siteInfo.windDir.replace(/\s/g, '').split(/[-,]/);
    for (const p of parts) {
      const upper = p.toUpperCase();
      if (allDirs.includes(upper) && !idealDirs.includes(upper)) idealDirs.push(upper);
    }
    if (parts.length === 2) {
      const startIdx = allDirs.indexOf(parts[0]?.toUpperCase());
      const endIdx = allDirs.indexOf(parts[1]?.toUpperCase());
      if (startIdx !== -1 && endIdx !== -1 && siteInfo.windDir.includes('-')) {
        idealDirs = [];
        let i = startIdx;
        while (true) {
          if (!idealDirs.includes(allDirs[i])) idealDirs.push(allDirs[i]);
          if (i === endIdx) break;
          i = (i + 1) % 16;
        }
      }
    }
  }

  const hasRange = minSpeed != null && maxSpeed != null;
  const hasDirs = idealDirs.length > 0;
  if (!hasRange && !hasDirs) return Math.min(Math.floor(slots.length / 2), slots.length - 1);

  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < slots.length; i++) {
    let score = 0;
    if (hasDirs && idealDirs.includes(slots[i].windDirection)) score += 2;
    if (hasRange) {
      const spd = slots[i].windSpeed;
      if (spd >= minSpeed! && spd <= maxSpeed!) score += 2;
      else if (spd < minSpeed!) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function buildSiteExtendedForecast(
  siteId: string,
  siteLat: number,
  siteLon: number,
  extendedGrid: ExtendedGrid,
  existingHourlyJson?: string,
  vicGrid?: any,
  siteInfo?: { windSpeed: string | null; windDir: string | null }
): SiteExtendedForecast | null {
  const nearest = findNearestExtendedPoint(extendedGrid, siteLat, siteLon);
  if (!nearest || nearest.times.length === 0) return null;

  const today = getMelbourneDate(0);
  const tomorrow = getMelbourneDate(1);

  const days: SiteExtendedForecast['days'] = [];

  let hourlyData: any[] = [];
  if (existingHourlyJson) {
    try {
      hourlyData = JSON.parse(existingHourlyJson);
    } catch {}
  }

  let vicNearestPoint: any = null;
  let vicTimeWindow: { startIdx: number; selectedTimes: string[] } | null = null;
  if (vicGrid?.points?.length > 0) {
    let bestDist = Infinity;
    for (const p of vicGrid.points) {
      const dlat = p.lat - siteLat;
      const dlon = p.lon - siteLon;
      const dist = dlat * dlat + dlon * dlon;
      if (dist < bestDist) {
        bestDist = dist;
        vicNearestPoint = p;
      }
    }
    if (vicNearestPoint?.hourly?.time) {
      vicTimeWindow = getTimeWindow(vicNearestPoint.hourly.time);
    }
  }

  const coveredDates = new Set<string>();

  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    const dateStr = getMelbourneDate(dayOffset);
    const dayName = getMelbourneDayName(dateStr);

    const dayHourly = hourlyData.filter((h: any) => {
      const hDate = new Date(h.timestamp);
      const hStr = hDate.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
      return hStr === dateStr;
    });

    let vicSlots: any[] = [];
    if (vicNearestPoint && vicTimeWindow) {
      for (let ti = 0; ti < vicTimeWindow.selectedTimes.length; ti++) {
        const t = vicTimeWindow.selectedTimes[ti];
        if (!t.startsWith(dateStr)) continue;
        const idx = vicTimeWindow.startIdx + ti;
        if (idx >= vicNearestPoint.hourly.time.length) continue;
        const wc = vicNearestPoint.hourly.weather_code[idx];
        const { text, icon } = getWeatherCodeSummary(wc);
        vicSlots.push({
          time: t,
          windSpeed: Math.round(vicNearestPoint.hourly.wind_speed_10m[idx]),
          windGust: Math.round(vicNearestPoint.hourly.wind_gusts_10m[idx]),
          windDirection: degreesToDirection(vicNearestPoint.hourly.wind_direction_10m[idx]),
          windDirectionDeg: vicNearestPoint.hourly.wind_direction_10m[idx],
          temperature: vicNearestPoint.hourly.temperature_2m[idx],
          weatherCode: wc,
          weatherSummary: text,
          weatherIcon: icon,
        });
      }
    }

    if (dayHourly.length >= 3) {
      const slots = dayHourly.map((h: any) => ({
        time: h.timestamp,
        windSpeed: Math.round(h.windSpeed || 0),
        windGust: Math.round(h.windGust || 0),
        windDirection: h.windDirection || 'N',
        windDirectionDeg: 0,
        temperature: h.temperature || 0,
        weatherCode: 0,
        weatherSummary: h.summary || '',
        weatherIcon: h.icon || 'CloudSun',
      }));

      const bestIdx = pickBestSlotIdx(slots, siteInfo);
      days.push({
        date: dateStr,
        dayName,
        slots,
        bestSpeed: slots[bestIdx]?.windSpeed || 0,
        bestDirection: slots[bestIdx]?.windDirection || 'N',
        bestWeatherCode: 0,
        bestWeatherIcon: slots[bestIdx]?.weatherIcon || 'CloudSun',
        bestWeatherSummary: slots[bestIdx]?.weatherSummary || '',
      });
      coveredDates.add(dateStr);
    } else if (vicSlots.length > 0) {
      const bestIdx = pickBestSlotIdx(vicSlots, siteInfo);
      days.push({
        date: dateStr,
        dayName,
        slots: vicSlots,
        bestSpeed: vicSlots[bestIdx].windSpeed,
        bestDirection: vicSlots[bestIdx].windDirection,
        bestWeatherCode: vicSlots[bestIdx].weatherCode,
        bestWeatherIcon: vicSlots[bestIdx].weatherIcon,
        bestWeatherSummary: vicSlots[bestIdx].weatherSummary,
      });
      coveredDates.add(dateStr);
    }
  }

  const dateGroups = new Map<string, number[]>();
  for (let i = 0; i < nearest.times.length; i++) {
    const dateStr = nearest.times[i].substring(0, 10);
    if (dateStr < tomorrow) continue; // skip today (phase 1 handles it)
    if (coveredDates.has(dateStr)) continue; // skip if phase 1 already provided this day
    if (!dateGroups.has(dateStr)) dateGroups.set(dateStr, []);
    dateGroups.get(dateStr)!.push(i);
  }

  for (const [dateStr, indices] of dateGroups) {
    const dayName = getMelbourneDayName(dateStr);
    const slots = indices.map(i => {
      const wc = nearest.weatherCode[i];
      const { text, icon } = getWeatherCodeSummary(wc);
      return {
        time: nearest.times[i],
        windSpeed: Math.round(nearest.windSpeed[i]),
        windGust: Math.round(nearest.windGust[i]),
        windDirection: degreesToDirection(nearest.windDirection[i]),
        windDirectionDeg: nearest.windDirection[i],
        temperature: nearest.temperature[i],
        weatherCode: wc,
        weatherSummary: text,
        weatherIcon: icon,
      };
    });

    const bestIdx = pickBestSlotIdx(slots, siteInfo);
    days.push({
      date: dateStr,
      dayName,
      slots,
      bestSpeed: slots[bestIdx].windSpeed,
      bestDirection: slots[bestIdx].windDirection,
      bestWeatherCode: slots[bestIdx].weatherCode,
      bestWeatherIcon: slots[bestIdx].weatherIcon,
      bestWeatherSummary: slots[bestIdx].weatherSummary,
    });
  }

  days.sort((a, b) => a.date.localeCompare(b.date));

  return {
    siteId,
    days: days.slice(0, 7),
    updatedAt: new Date().toISOString()
  };
}

async function computeExtendedWindGrid(grid: ExtendedGrid): Promise<any> {
  const allTimes = grid.points[0].times;
  const fineBounds = await getGridBounds();
  const VIC_LON_MIN = fineBounds.fineLonMin;
  const VIC_LON_MAX = fineBounds.fineLonMax;
  const VIC_LAT_MIN = fineBounds.fineLatMin;
  const VIC_LAT_MAX = fineBounds.fineLatMax;
  const VIC_DELTA = 0.35;

  const srcLons = [...new Set(grid.points.map((p: ExtendedGridPoint) => p.lon))].sort((a, b) => a - b);
  const srcLats = [...new Set(grid.points.map((p: ExtendedGridPoint) => p.lat))].sort((a, b) => a - b);

  const pointMap = new Map<string, ExtendedGridPoint>();
  for (const p of grid.points) {
    pointMap.set(`${p.lat.toFixed(2)},${p.lon.toFixed(2)}`, p);
  }

  function getSourceUV(lat: number, lon: number, t: number): { u: number; v: number } {
    const fi = (lon - srcLons[0]) / grid.delta;
    const fj = (lat - srcLats[0]) / grid.delta;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    const i1 = Math.min(i0 + 1, srcLons.length - 1);
    const j1 = Math.min(j0 + 1, srcLats.length - 1);
    const di = fi - i0, dj = fj - j0;

    const corners = [
      { lat: srcLats[Math.max(0, j0)], lon: srcLons[Math.max(0, i0)] },
      { lat: srcLats[Math.max(0, j0)], lon: srcLons[i1] },
      { lat: srcLats[j1], lon: srcLons[Math.max(0, i0)] },
      { lat: srcLats[j1], lon: srcLons[i1] },
    ];

    const uvs = corners.map(c => {
      const key = `${c.lat.toFixed(2)},${c.lon.toFixed(2)}`;
      const pt = pointMap.get(key);
      if (!pt || t >= pt.windSpeed.length) return { u: 0, v: 0 };
      const speedMs = pt.windSpeed[t] * 0.514444;
      const dir = pt.windDirection[t];
      const rad = (dir * Math.PI) / 180;
      return {
        u: -speedMs * Math.sin(rad),
        v: -speedMs * Math.cos(rad)
      };
    });

    const top = { u: uvs[0].u * (1 - di) + uvs[1].u * di, v: uvs[0].v * (1 - di) + uvs[1].v * di };
    const bot = { u: uvs[2].u * (1 - di) + uvs[3].u * di, v: uvs[2].v * (1 - di) + uvs[3].v * di };
    return {
      u: parseFloat((top.u * (1 - dj) + bot.u * dj).toFixed(3)),
      v: parseFloat((top.v * (1 - dj) + bot.v * dj).toFixed(3))
    };
  }

  const outLons: number[] = [];
  for (let lon = VIC_LON_MIN; lon <= VIC_LON_MAX + 0.001; lon += VIC_DELTA) {
    outLons.push(parseFloat(lon.toFixed(4)));
  }
  const outLats: number[] = [];
  for (let lat = VIC_LAT_MIN; lat <= VIC_LAT_MAX + 0.001; lat += VIC_DELTA) {
    outLats.push(parseFloat(lat.toFixed(4)));
  }

  const data: { u: number; v: number }[][] = [];
  for (let t = 0; t < allTimes.length; t++) {
    const timeStep: { u: number; v: number }[] = [];
    for (const lat of outLats) {
      for (const lon of outLons) {
        timeStep.push(getSourceUV(lat, lon, t));
      }
    }
    data.push(timeStep);
  }

  return {
    lonMin: outLons[0],
    lonMax: outLons[outLons.length - 1],
    latMin: outLats[0],
    latMax: outLats[outLats.length - 1],
    deltaLon: VIC_DELTA,
    deltaLat: VIC_DELTA,
    ni: outLons.length,
    nj: outLats.length,
    times: allTimes,
    data,
  };
}

let cachedWindGrid: any = null;
let cachedWindGridTime: number = 0;
const WIND_GRID_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function getExtendedWindGrid(): Promise<any | null> {
  const now = Date.now();
  if (cachedWindGrid && (now - cachedWindGridTime) < WIND_GRID_TTL_MS) {
    return cachedWindGrid;
  }

  const grid = await getCachedExtendedGrid();
  if (!grid || !grid.points.length) return null;

  const allTimes = grid.points[0].times;
  if (!allTimes?.length) return null;

  const windGrid = await computeExtendedWindGrid(grid);
  cacheWindGrid(windGrid);
  return windGrid;
}

function cacheWindGrid(windGrid: any): void {
  cachedWindGrid = windGrid;
  cachedWindGridTime = Date.now();
}

export async function getCachedExtendedGrid(): Promise<ExtendedGrid | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    let row = await queryOne<{ id?: string; gridData: string }>(`SELECT "gridData" FROM extended_forecasts WHERE id = $1`, [`extended_grid_${today}`]);

    if (!row) {
      const rows = await query<{ id: string; gridData: string }>(`SELECT id, "gridData" FROM extended_forecasts WHERE id LIKE 'extended_grid_%' ORDER BY id DESC LIMIT 1`);
      if (rows.length > 0) {
        row = rows[0];
        console.log(`Extended forecast: Today's cache not found, using fallback from ${rows[0].id.replace('extended_grid_', '')}`);
      }
    }

    if (row) return JSON.parse(row.gridData);
  } catch (e) {
    console.error("Extended forecast: Cache read error", e);
  }
  return null;
}

export async function getSiteExtendedForecast(siteId: string): Promise<SiteExtendedForecast | null> {
  try {
    const row = await queryOne<{ forecastData: string }>(`SELECT "forecastData" FROM site_extended_forecasts WHERE "siteId" = $1`, [siteId]);
    if (row) return JSON.parse(row.forecastData);
  } catch (e) {
    console.error(`Extended forecast: Read error for ${siteId}`, e);
  }
  return null;
}

export async function getAllSiteExtendedForecasts(): Promise<Map<string, SiteExtendedForecast>> {
  const map = new Map<string, SiteExtendedForecast>();
  try {
    const rows = await query<{ siteId: string; forecastData: string }>(`SELECT "siteId", "forecastData" FROM site_extended_forecasts`);
    for (const row of rows) {
      try {
        map.set(row.siteId, JSON.parse(row.forecastData));
      } catch {}
    }
  } catch (e) {
    console.error("Extended forecast: Bulk read error", e);
  }
  return map;
}

async function cleanupOldExtendedForecasts(): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const result = await execute(`DELETE FROM extended_forecasts WHERE id LIKE 'extended_grid_%' AND id < $1`, [`extended_grid_${sevenDaysAgo}`]);
    if (result.rowCount > 0) {
      console.log(`Extended forecast: Cleaned up ${result.rowCount} old forecast records`);
    }
  } catch (e) {
    console.error("Extended forecast: Cleanup error", e);
  }
}

let extendedScheduleTimeout: NodeJS.Timeout | null = null;

async function getSettingInt(key: string, fallback: number): Promise<number> {
  const row = await queryOne<{ value: string }>(`SELECT value FROM settings WHERE key = $1`, [key]);
  const val = parseInt(row?.value || String(fallback), 10);
  return Number.isFinite(val) ? val : fallback;
}

export async function scheduleExtendedForecast(): Promise<void> {
  const now = new Date();
  const targetHour = await getSettingInt("schedExtendedForecastHour", 5);
  const targetMinute = await getSettingInt("schedExtendedForecastMinute", 30);

  const melbFormatter = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
  const parts: Record<string, string> = {};
  melbFormatter.formatToParts(now).forEach(p => { parts[p.type] = p.value; });
  const currentMelbHour = parseInt(parts.hour);
  const currentMelbMinute = parseInt(parts.minute);

  let daysUntilNext = 0;
  if (currentMelbHour > targetHour || (currentMelbHour === targetHour && currentMelbMinute >= targetMinute)) {
    daysUntilNext = 1;
  }

  const nextDateStr = getMelbourneDate(daysUntilNext);
  const nextTimeStr = `${nextDateStr}T${String(targetHour).padStart(2, '0')}:${String(targetMinute).padStart(2, '0')}:00`;

  const nextRunUtc = fromZonedTime(nextTimeStr, 'Australia/Melbourne');

  const msUntilNext = nextRunUtc.getTime() - now.getTime();
  const hoursUntilNext = (msUntilNext / 3600000).toFixed(1);

  console.log(`Extended forecast: Next daily fetch in ${hoursUntilNext} hours (${nextTimeStr} Melbourne time)`);

  if (extendedScheduleTimeout) clearTimeout(extendedScheduleTimeout);
  extendedScheduleTimeout = setTimeout(async () => {
    const ts = new Date().toISOString();
    try {
      await fetchExtendedForecast();
      await execute(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, ["extendedForecastLastRun", ts]);
      await execute(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, ["extendedForecastLastResult", "ok"]);
    } catch (e: any) {
      await execute(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, ["extendedForecastLastRun", ts]);
      await execute(`INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, ["extendedForecastLastResult", e.message || "Unknown error"]);
    }
    scheduleExtendedForecast();
  }, Math.max(msUntilNext, 60000));

  const today = new Date().toISOString().split('T')[0];
  let cached = await queryOne<{ fetchedAt: string }>(`SELECT "fetchedAt" FROM extended_forecasts WHERE id = $1`, [`extended_grid_${today}`]);
  if (!cached) {
    const rows = await query<{ fetchedAt: string }>(`SELECT "fetchedAt" FROM extended_forecasts WHERE id LIKE 'extended_grid_%' ORDER BY id DESC LIMIT 1`);
    if (rows.length > 0) cached = rows[0];
  }
  if (!cached) {
    console.log("Extended forecast: No cached data found, triggering initial fetch in 60s...");
    setTimeout(() => fetchExtendedForecast(), 60000);
  } else {
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age > 24 * 60 * 60 * 1000) {
      console.log("Extended forecast: Cached data is stale (>24h), triggering fetch in 60s...");
      setTimeout(() => fetchExtendedForecast(), 60000);
    }
  }
}

export async function fetchExtendedForecastWithStatus(): Promise<GridFetchStatus> {
  try {
    const today = new Date().toISOString().split('T')[0];
    let cached = await queryOne<{ fetchedAt: string }>(`SELECT "fetchedAt" FROM extended_forecasts WHERE id = $1`, [`extended_grid_${today}`]);
    if (!cached) {
      const rows = await query<{ fetchedAt: string }>(`SELECT "fetchedAt" FROM extended_forecasts WHERE id LIKE 'extended_grid_%' ORDER BY id DESC LIMIT 1`);
      if (rows.length > 0) cached = rows[0];
    }
    const cacheAgeMs = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : null;
    const cacheAgeMinutes = cacheAgeMs ? Math.round(cacheAgeMs / 60000) : null;

    if (extendedFetchInProgress) {
      return {
        success: true,
        message: "Fetch already in progress — using existing cache",
        cacheAgeMinutes
      };
    }

    await fetchExtendedForecast();

    let updated = await queryOne<{ fetchedAt: string }>(`SELECT "fetchedAt" FROM extended_forecasts WHERE id = $1`, [`extended_grid_${today}`]);
    if (!updated) {
      const rows = await query<{ fetchedAt: string }>(`SELECT "fetchedAt" FROM extended_forecasts WHERE id LIKE 'extended_grid_%' ORDER BY id DESC LIMIT 1`);
      if (rows.length > 0) updated = rows[0];
    }
    const newCacheAgeMs = updated ? Date.now() - new Date(updated.fetchedAt).getTime() : null;

    if (newCacheAgeMs && newCacheAgeMs < 60000) {
      return {
        success: true,
        message: "Downloaded fresh extended forecast data",
        cacheAgeMinutes: 0
      };
    }

    if (cacheAgeMinutes && cacheAgeMinutes < 24 * 60) {
      return {
        success: true,
        message: `Rate limited — using cache from ${cacheAgeMinutes} minutes ago (still valid)`,
        cacheAgeMinutes
      };
    }

    return {
      success: false,
      message: "Extended forecast unavailable — no cached data"
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Error fetching extended forecast: ${errorMsg}`
    };
  }
}

export async function precomputeWindGridIfNeeded(): Promise<void> {
  try {
    // Only pre-compute on startup if cache is missing (e.g., server restarted between daily fetches)
    // Normal flow: wind grid is computed during fetchExtendedForecast() at 5:30am
    if (cachedWindGrid) {
      console.log("Extended wind grid: Cache present at startup");
      return;
    }

    const grid = await getCachedExtendedGrid();
    if (!grid || !grid.points.length) {
      console.log("Extended wind grid: No source grid available to pre-compute");
      return;
    }

    const allTimes = grid.points[0].times;
    if (!allTimes?.length) {
      console.log("Extended wind grid: Source grid has no times");
      return;
    }

    console.log("Extended wind grid: Pre-computing at startup (fallback)...");
    const windGrid = await computeExtendedWindGrid(grid);
    cacheWindGrid(windGrid);
    console.log("Extended wind grid: Pre-computation complete");
  } catch (err) {
    console.warn("Extended wind grid: Pre-computation skipped:", err);
  }
}
