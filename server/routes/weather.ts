import { Router } from "express";
import { query, queryOne, execute } from "../pg.js";
import { fetchWeatherData, fetchWithRetry, degreesToDirection, LIVE_WIND_VIC_URL } from "../weather.js";
import { getFreeFlightWxStations, getStationIdFromSlug } from "../freeflightwx.js";
import { getBomStations, getBomStationId, parseBomStationId } from "../bomWeather.js";
import asyncHandler from "../utils/asyncHandler.js";
import createLogger from "../utils/logger.js";
import { requireAuth } from "../middleware/auth.js";
import { getCachedFineGrid, getCachedCoarseGrid, extractWindParticles, fetchFineGrid, fetchCoarseGrid, extractFullWindGrid, getGridBounds, clearFineGridCaches } from "../victoriaGrid.js";
import { getSiteExtendedForecast, getCachedExtendedGrid, getExtendedWindGrid } from "../extendedForecast.js";
import { fetchExtendedForecast } from "../extendedForecast.js";

const router = Router();
const log = createLogger("weather");

interface SiteRow {
  id: string;
  useLiveWeather: string;
  liveStationIdAlt: string | null;
}

interface SiteCoordRow {
  id: string;
  lat: number | null;
  lon: number | null;
}

interface WeatherForecastRow {
  siteId: string;
  forecasts: string | null;
  icon: string | null;
  windSpeed: number | null;
  windGust: number | null;
  windDirection: string | null;
  timestamp: string | null;
}

interface WeatherObservationRow {
  siteId: string;
  windSpeed: number | null;
  windGust: number | null;
  direction: string | null;
  stationName: string | null;
  stationLat: number | null;
  stationLon: number | null;
  timestamp: string | null;
}

interface WindGridRow {
  siteId: string;
  gridData: string;
  gridSize: number;
  gridSpacing: number;
  updatedAt: string;
}

interface BulkWeatherRow {
  id: string;
  useLiveWeather: string;
  liveStationIdAlt: string | null;
  forecast_siteId: string | null;
  forecast_forecasts: string | null;
  forecast_icon: string | null;
  forecast_windSpeed: number | null;
  forecast_windGust: number | null;
  forecast_direction: string | null;
  forecast_timestamp: string | null;
  observation_siteId: string | null;
  windSpeed: number | null;
  windGust: number | null;
  direction: string | null;
  stationName: string | null;
  stationLat: number | null;
  stationLon: number | null;
  timestamp: string | null;
  alt_windSpeed: number | null;
  alt_windGust: number | null;
  alt_direction: string | null;
  alt_stationName: string | null;
  alt_stationLat: number | null;
  alt_stationLon: number | null;
  alt_timestamp: string | null;
}

router.get("/stations/nearby", asyncHandler(async (req, res) => {
  const _radius = Array.isArray(req.query.radius) ? req.query.radius[0] : (req.query.radius || '20');
  const { lat, lon, currentStationId } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "Missing lat or lon" });
  }

  const radiusKm = parseFloat(_radius as string);
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
    return res.status(400).json({ error: "radius must be a positive number" });
  }
  const targetLat = parseFloat(lat as string);
  const targetLon = parseFloat(lon as string);

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const stations = [];

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const liveWindResponse = await fetch(LIVE_WIND_VIC_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (liveWindResponse.ok) {
      const liveWindData = await liveWindResponse.json();
      for (const station of liveWindData) {
        if (station.lat && station.lon) {
          const distance = getDistance(targetLat, targetLon, parseFloat(station.lat), parseFloat(station.lon));
          if (distance <= radiusKm) {
            stations.push({
              id: `livewind-${station.wmoid}`,
              name: `${station.site_name} (Live-Wind)`,
              distanceKm: distance,
              lat: parseFloat(station.lat),
              lon: parseFloat(station.lon),
              source: 'live-wind'
            });
          }
        }
      }
    }
  } catch (e) {
    log.error("Error fetching live-wind stations:", e);
  }

  try {
    const wuApiKey = process.env.WU_API_KEY;
    if (!wuApiKey) {
      throw new Error("WU_API_KEY not configured");
    }
    const wuUrl = `https://api.weather.com/v3/location/near?geocode=${lat},${lon}&product=pws&format=json&apiKey=${wuApiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const wuResponse = await fetch(wuUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (wuResponse.ok) {
      const wuData = await wuResponse.json();
      if (wuData.location && wuData.location.stationId) {
        const count = wuData.location.stationId.length;
        for (let i = 0; i < count; i++) {
          if (wuData.location.distanceKm[i] <= radiusKm) {
            stations.push({
              id: wuData.location.stationId[i],
              name: `${wuData.location.stationName[i]} (WU)`,
              distanceKm: wuData.location.distanceKm[i],
              lat: wuData.location.latitude[i],
              lon: wuData.location.longitude[i],
              source: 'wu'
            });
          }
        }
      }
    }
  } catch (e) {
    log.error("Error fetching WU stations:", e);
  }

  if (currentStationId && typeof currentStationId === 'string' && !stations.find(s => s.id === currentStationId)) {
    try {
      const wuApiKey = process.env.WU_API_KEY;
      if (wuApiKey && !currentStationId.startsWith('livewind-') && !currentStationId.startsWith('freeflightwx-')) {
        const obsUrl = `https://api.weather.com/v2/pws/observations/current?stationId=${currentStationId}&format=json&units=m&apiKey=${wuApiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const obsRes = await fetch(obsUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (obsRes.ok) {
          const obsData = await obsRes.json();
          const obs = obsData?.observations?.[0];
          if (obs && obs.lat != null && obs.lon != null) {
            const distance = getDistance(targetLat, targetLon, obs.lat, obs.lon);
            stations.push({
              id: currentStationId,
              name: `${obs.neighborhood || currentStationId} (WU)`,
              distanceKm: distance,
              lat: obs.lat,
              lon: obs.lon,
              source: 'wu'
            });
          }
        }
      } else if (currentStationId.startsWith('livewind-')) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const liveWindResponse = await fetch(LIVE_WIND_VIC_URL, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (liveWindResponse.ok) {
          const liveWindData = await liveWindResponse.json();
          const wmoid = currentStationId.replace('livewind-', '');
          const station = liveWindData.find((s: any) => String(s.wmoid) === wmoid);
          if (station && station.lat && station.lon) {
            const distance = getDistance(targetLat, targetLon, parseFloat(station.lat), parseFloat(station.lon));
            stations.push({
              id: currentStationId,
              name: `${station.site_name} (Live-Wind)`,
              distanceKm: distance,
              lat: parseFloat(station.lat),
              lon: parseFloat(station.lon),
              source: 'live-wind'
            });
          }
        }
      } else if (currentStationId.startsWith('freeflightwx-')) {
        const ffwx = getFreeFlightWxStations().find(s => getStationIdFromSlug(s.slug) === currentStationId);
        if (ffwx) {
          const distance = (ffwx.lat != null && ffwx.lon != null) ? getDistance(targetLat, targetLon, ffwx.lat, ffwx.lon) : 0;
          stations.push({
            id: currentStationId,
            name: `${ffwx.name} (FreeFlightWx)`,
            distanceKm: distance,
            lat: ffwx.lat || targetLat,
            lon: ffwx.lon || targetLon,
            source: 'freeflightwx'
          });
        }
      } else if (currentStationId.startsWith('bom-')) {
        const parsed = parseBomStationId(currentStationId);
        if (parsed) {
          const bom = getBomStations().find(s => s.stationNum === parsed.stationNum);
          if (bom) {
            const distance = getDistance(targetLat, targetLon, bom.lat, bom.lon);
            stations.push({
              id: currentStationId,
              name: `${bom.name} (BOM)`,
              distanceKm: distance,
              lat: bom.lat,
              lon: bom.lon,
              source: 'bom'
            });
          }
        }
      }
    } catch (e) {
      log.error("Error looking up current station:", e);
    }
  }

  const ffwxStations = getFreeFlightWxStations();
  for (const ffwx of ffwxStations) {
    const stationId = getStationIdFromSlug(ffwx.slug);
    if (stations.find(s => s.id === stationId)) continue;
    if (ffwx.lat != null && ffwx.lon != null) {
      const distance = getDistance(targetLat, targetLon, ffwx.lat, ffwx.lon);
      if (distance <= radiusKm) {
        stations.push({
          id: stationId,
          name: `${ffwx.name} (FreeFlightWx)`,
          distanceKm: distance,
          lat: ffwx.lat,
          lon: ffwx.lon,
          source: 'freeflightwx'
        });
      }
    }
  }

  for (const bom of getBomStations()) {
    const stationId = getBomStationId(bom);
    if (stations.find(s => s.id === stationId)) continue;
    const distance = getDistance(targetLat, targetLon, bom.lat, bom.lon);
    if (distance <= radiusKm) {
      stations.push({
        id: stationId,
        name: `${bom.name} (BOM)`,
        distanceKm: distance,
        lat: bom.lat,
        lon: bom.lon,
        source: 'bom'
      });
    }
  }

  stations.sort((a, b) => a.distanceKm - b.distanceKm);

  res.json(stations);
}));

const extendedGridHandler = asyncHandler(async (_req: any, res: any) => {
  const grid = await getCachedExtendedGrid();
  if (!grid) {
    return res.status(404).json({ error: "No extended grid data available" });
  }
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.json(grid);
});
router.get("/extended-grid", extendedGridHandler);
router.get("/extended-grid/data", extendedGridHandler);

router.get("/extended-grid/wind-overlay", asyncHandler(async (_req: any, res: any) => {
  const result = await getExtendedWindGrid();
  if (!result) {
    return res.status(404).json({ error: "No extended wind grid data available" });
  }
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.json(result);
}));

router.post("/bulk", asyncHandler(async (req, res) => {
  const { siteIds } = req.body;
  if (!Array.isArray(siteIds) || siteIds.length === 0) {
    return res.status(400).json({ error: "siteIds array required" });
  }

  const ids = siteIds.slice(0, 50);
  const results: Record<string, any> = {};
  const placeholders = ids.map((_: any, i: number) => `$${i + 1}`).join(',');

  const allWeatherData = await query<BulkWeatherRow>(`
    SELECT
      s.id, s."useLiveWeather", s."liveStationIdAlt",
      wf."siteId" as forecast_siteId, wf.forecasts as forecast_forecasts, wf.icon as forecast_icon,
      wf."windSpeed" as forecast_windSpeed, wf."windGust" as forecast_windGust, wf."windDirection" as forecast_direction, wf.timestamp as forecast_timestamp,
      wo."siteId" as observation_siteId, wo."windSpeed", wo."windGust", wo.direction, wo."stationName", wo."stationLat", wo."stationLon", wo.timestamp,
      wo_alt."windSpeed" as alt_windSpeed, wo_alt."windGust" as alt_windGust, wo_alt.direction as alt_direction,
      wo_alt."stationName" as alt_stationName, wo_alt."stationLat" as alt_stationLat, wo_alt."stationLon" as alt_stationLon, wo_alt.timestamp as alt_timestamp
    FROM sites s
    LEFT JOIN weather_forecasts wf ON s.id = wf."siteId"
    LEFT JOIN LATERAL (
      SELECT * FROM weather_observations o2 WHERE o2."siteId" = s.id ORDER BY o2.timestamp DESC LIMIT 1
    ) wo ON true
    LEFT JOIN LATERAL (
      SELECT * FROM weather_observations o3 WHERE o3."siteId" = s.id || ':alt' ORDER BY o3.timestamp DESC LIMIT 1
    ) wo_alt ON true
    WHERE s.id IN (${placeholders})
  `, ids);

  const groupedData = new Map<string, BulkWeatherRow[]>();
  for (const row of allWeatherData) {
    if (!groupedData.has(row.id)) groupedData.set(row.id, []);
    groupedData.get(row.id)?.push(row);
  }

  const MAX_OBS_AGE = 6 * 60 * 60 * 1000;

  for (const siteId of ids) {
    const siteGroup = groupedData.get(siteId);
    const site = siteGroup?.find((item) => item.id === siteId);
    if (!site) { results[siteId] = { error: true }; continue; }

    const isLiveEnabled = site.useLiveWeather === 'true';
    const forecast = siteGroup?.find((item) => item.forecast_siteId === siteId);

    if (isLiveEnabled) {
      const observation = siteGroup?.find((item) => item.observation_siteId === siteId);
      const obsAge = observation ? Date.now() - new Date(observation.timestamp as string).getTime() : Infinity;
      if (observation && obsAge < MAX_OBS_AGE) {
        const result: any = {
          ...observation,
          type: 'live',
          forecasts: forecast?.forecast_forecasts,
          icon: forecast?.forecast_icon || 'CloudSun'
        };

        if (site.liveStationIdAlt) {
          const altObservation = siteGroup?.find((item) => item.observation_siteId === `${siteId}:alt`);
          if (altObservation) {
            result.altObservation = {
              windSpeed: altObservation.alt_windSpeed,
              windGust: altObservation.alt_windGust,
              direction: altObservation.alt_direction,
              stationName: altObservation.alt_stationName,
              stationLat: altObservation.alt_stationLat,
              stationLon: altObservation.alt_stationLon,
              timestamp: altObservation.alt_timestamp,
            };
          }
        }

        results[siteId] = result;
        continue;
      }
    }

    if (forecast) {
      results[siteId] = {
        forecasts: forecast.forecast_forecasts,
        icon: forecast.forecast_icon,
        type: 'forecast',
        siteId: forecast.forecast_siteId,
        windSpeed: forecast.forecast_windSpeed,
        windGust: forecast.forecast_windGust,
        direction: forecast.forecast_direction,
        timestamp: forecast.forecast_timestamp,
      };
    } else {
      results[siteId] = { error: true };
    }
  }

  res.json(results);
}));

router.get("/grid-bounds", requireAuth, asyncHandler(async (_req, res) => {
  const bounds = await getGridBounds();
  res.json(bounds);
}));

router.post("/grid-bounds", requireAuth, asyncHandler(async (req, res) => {
  const { fineLatMin, fineLatMax, fineLonMin, fineLonMax,
          coarseLatMin, coarseLatMax, coarseLonMin, coarseLonMax } = req.body;

  const vals = { fineLatMin, fineLatMax, fineLonMin, fineLonMax,
                 coarseLatMin, coarseLatMax, coarseLonMin, coarseLonMax };

  for (const [k, v] of Object.entries(vals)) {
    if (!Number.isFinite(Number(v))) {
      return res.status(400).json({ error: `${k} must be a number` });
    }
  }

  const f = { latMin: Number(fineLatMin), latMax: Number(fineLatMax), lonMin: Number(fineLonMin), lonMax: Number(fineLonMax) };
  const c = { latMin: Number(coarseLatMin), latMax: Number(coarseLatMax), lonMin: Number(coarseLonMin), lonMax: Number(coarseLonMax) };

  if (f.latMin >= f.latMax) return res.status(400).json({ error: "Fine grid: south boundary must be less than north boundary" });
  if (f.lonMin >= f.lonMax) return res.status(400).json({ error: "Fine grid: west boundary must be less than east boundary" });
  if (c.latMin >= c.latMax) return res.status(400).json({ error: "Coarse grid: south boundary must be less than north boundary" });
  if (c.lonMin >= c.lonMax) return res.status(400).json({ error: "Coarse grid: west boundary must be less than east boundary" });

  if (f.latMin < c.latMin || f.latMax > c.latMax || f.lonMin < c.lonMin || f.lonMax > c.lonMax) {
    return res.status(400).json({ error: "Fine grid must be fully contained within the coarse grid" });
  }

  const FINE_DELTA = 0.35;
  const COARSE_DELTA = 2.0;
  const FINE_MAX_POINTS = 2000;
  const COARSE_MAX_POINTS = 3000;

  const finePts = Math.ceil((f.latMax - f.latMin) / FINE_DELTA) * Math.ceil((f.lonMax - f.lonMin) / FINE_DELTA);
  const coarsePts = Math.ceil((c.latMax - c.latMin) / COARSE_DELTA) * Math.ceil((c.lonMax - c.lonMin) / COARSE_DELTA);

  if (finePts > FINE_MAX_POINTS) {
    return res.status(400).json({ error: `Fine grid too large: ${finePts} points exceeds limit of ${FINE_MAX_POINTS}. Reduce the area.` });
  }
  if (coarsePts > COARSE_MAX_POINTS) {
    return res.status(400).json({ error: `Coarse grid too large: ${coarsePts} points exceeds limit of ${COARSE_MAX_POINTS}. Reduce the area.` });
  }

  const entries = [
    ['gridFineLatMin', f.latMin], ['gridFineLatMax', f.latMax],
    ['gridFineLonMin', f.lonMin], ['gridFineLonMax', f.lonMax],
    ['gridCoarseLatMin', c.latMin], ['gridCoarseLatMax', c.latMax],
    ['gridCoarseLonMin', c.lonMin], ['gridCoarseLonMax', c.lonMax],
  ] as [string, number][];

  for (const [key, value] of entries) {
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, String(value)]
    );
  }

  clearFineGridCaches();

  res.json({ success: true, finePts, coarsePts, bounds: { ...f, ...c } });
}));

router.get("/:siteId", asyncHandler(async (req, res) => {
  const site = await queryOne<SiteRow>(
    `SELECT "useLiveWeather", "liveStationIdAlt" FROM sites WHERE id = $1`,
    [req.params.siteId]
  );

  const isLiveEnabled = site && site.useLiveWeather === 'true';
  const forecast = await queryOne<WeatherForecastRow>(
    `SELECT * FROM weather_forecasts WHERE "siteId" = $1`,
    [req.params.siteId]
  );

  if (isLiveEnabled) {
    const observation = await queryOne<WeatherObservationRow>(
      `SELECT * FROM weather_observations WHERE "siteId" = $1 ORDER BY timestamp DESC LIMIT 1`,
      [req.params.siteId]
    );
    const obsAge = observation ? Date.now() - new Date(observation.timestamp as string).getTime() : Infinity;
    const MAX_OBS_AGE = 6 * 60 * 60 * 1000;
    if (observation && obsAge < MAX_OBS_AGE) {
      const result: any = {
        ...observation,
        type: 'live',
        forecasts: forecast?.forecasts,
        icon: forecast?.icon || 'CloudSun'
      };

      if (site!.liveStationIdAlt) {
        const altObs = await queryOne<WeatherObservationRow>(
          `SELECT * FROM weather_observations WHERE "siteId" = $1 ORDER BY timestamp DESC LIMIT 1`,
          [`${req.params.siteId}:alt`]
        );
        if (altObs) {
          result.altObservation = {
            windSpeed: altObs.windSpeed,
            windGust: altObs.windGust,
            direction: altObs.direction,
            stationName: altObs.stationName,
            stationLat: altObs.stationLat,
            stationLon: altObs.stationLon,
            timestamp: altObs.timestamp,
          };
        }
      }

      return res.json(result);
    }
  }

  if (forecast) {
    return res.json({ ...forecast, type: 'forecast' });
  }

  res.status(404).json({ error: "No weather data found for this site" });
}));

router.get("/:siteId/wind-grid", asyncHandler(async (req, res) => {
  const site = await queryOne<SiteCoordRow>(
    `SELECT id, lat, lon FROM sites WHERE id = $1`,
    [req.params.siteId]
  );
  if (!site || !site.lat || !site.lon) {
    return res.status(404).json({ error: "Site not found or missing coordinates" });
  }

  const gridSize = parseInt(req.query.gridSize as string) || 10;
  const gridSpacing = parseFloat(req.query.gridSpacing as string) || 0.025;

  const cached = await queryOne<WindGridRow>(
    `SELECT * FROM wind_grid_data WHERE "siteId" = $1`,
    [req.params.siteId]
  );
  if (cached) {
    const age = Date.now() - new Date(cached.updatedAt).getTime();
    if (age < 30 * 60 * 1000 && cached.gridSize === gridSize && Math.abs(cached.gridSpacing - gridSpacing) < 0.001) {
      try {
        return res.json(JSON.parse(cached.gridData));
      } catch {
        // Corrupted cached data, proceed to regenerate
      }
    }
  }

  const gridBounds = await getGridBounds();
  const inFine = site.lat >= gridBounds.fineLatMin && site.lat <= gridBounds.fineLatMax && site.lon >= gridBounds.fineLonMin && site.lon <= gridBounds.fineLonMax;
  const inCoarse = site.lat >= gridBounds.coarseLatMin && site.lat <= gridBounds.coarseLatMax && site.lon >= gridBounds.coarseLonMin && site.lon <= gridBounds.coarseLonMax && !inFine;
  const baseGridCacheKey = inFine ? "fine_grid" : inCoarse ? "coarse_grid" : null;

  if (baseGridCacheKey) {
    const today = new Date().toISOString().split('T')[0];
    let gridCache = await queryOne<{ gridData: string }>(
      `SELECT "gridData" FROM wind_grid_data WHERE "siteId" = $1`,
      [`${baseGridCacheKey}_${today}`]
    );
    if (!gridCache) {
      const rows = await query<{ gridData: string }>(
        `SELECT "gridData" FROM wind_grid_data WHERE "siteId" ILIKE $1 ORDER BY "siteId" DESC LIMIT 1`,
        [`${baseGridCacheKey}_%`]
      );
      if (rows.length > 0) gridCache = rows[0];
    }
    if (gridCache) {
      try {
        const cachedGrid = JSON.parse(gridCache.gridData);
        const gridPoints = (cachedGrid.points || []).sort((a: any, b: any) => {
          const distA = Math.hypot(a.lat - site.lat!, a.lon - site.lon!);
          const distB = Math.hypot(b.lat - site.lat!, b.lon - site.lon!);
          return distA - distB;
        }).slice(0, gridSize * gridSize);

        if (gridPoints.length >= 10) {
          const result = {
            siteId: site.id,
            centerLat: site.lat,
            centerLon: site.lon,
            gridSize,
            gridSpacing,
            points: gridPoints,
            generatedAt: new Date().toISOString()
          };
          await execute(
            `INSERT INTO wind_grid_data ("siteId", "gridData", "gridSize", "gridSpacing", "updatedAt")
             VALUES ($1, $2, $3, $4, NOW())
             ON CONFLICT ("siteId") DO UPDATE SET "gridData" = EXCLUDED."gridData", "gridSize" = EXCLUDED."gridSize", "gridSpacing" = EXCLUDED."gridSpacing", "updatedAt" = NOW()`,
            [site.id, JSON.stringify(result), gridSize, gridSpacing]
          );
          return res.json(result);
        }
      } catch (e) {
        // Fall through to fresh fetch
      }
    }
  }

  const halfGrid = Math.floor(gridSize / 2);
  const lats: number[] = [];
  const lons: number[] = [];

  for (let row = -halfGrid; row <= halfGrid; row++) {
    for (let col = -halfGrid; col <= halfGrid; col++) {
      lats.push(parseFloat((site.lat + row * gridSpacing).toFixed(6)));
      lons.push(parseFloat((site.lon + col * gridSpacing).toFixed(6)));
    }
  }

  const latParam = lats.join(",");
  const lonParam = lons.join(",");
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latParam}&longitude=${lonParam}&hourly=wind_speed_10m,wind_direction_10m,wind_gusts_10m&models=ecmwf_ifs025&wind_speed_unit=kn&timezone=Australia%2FMelbourne&forecast_days=1`;

  const data = await fetchWithRetry(url);
  if (!data) {
    return res.status(502).json({ error: "Failed to fetch grid data from Open-Meteo" });
  }

  const isArray = Array.isArray(data);
  const entries = isArray ? data : [data];

  const firstEntry = entries[0];
  let startIdx = 0;
  if (firstEntry?.hourly?.time) {
    const now = new Date();
    const nowLocal = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
    const currentHourStr = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}T${String(nowLocal.getHours()).padStart(2, '0')}:00`;
    const foundIdx = firstEntry.hourly.time.indexOf(currentHourStr);
    startIdx = foundIdx >= 0 ? foundIdx : 0;
  }

  const gridPoints = entries.map((entry: any, i: number) => {
    const hourly = entry.hourly;
    if (!hourly) return null;

    const hours: any[] = [];
    for (let h = 0; h < 6; h++) {
      const idx = startIdx + h;
      if (idx < hourly.time.length) {
        hours.push({
          time: hourly.time[idx],
          windSpeed: hourly.wind_speed_10m[idx],
          windDirection: hourly.wind_direction_10m[idx],
          windGust: hourly.wind_gusts_10m[idx]
        });
      }
    }

    return {
      lat: lats[i],
      lon: lons[i],
      hours
    };
  }).filter(Boolean);

  const result = {
    siteId: site.id,
    centerLat: site.lat,
    centerLon: site.lon,
    gridSize,
    gridSpacing,
    points: gridPoints,
    generatedAt: new Date().toISOString()
  };

  await execute(
    `INSERT INTO wind_grid_data ("siteId", "gridData", "gridSize", "gridSpacing", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT ("siteId") DO UPDATE SET "gridData" = EXCLUDED."gridData", "gridSize" = EXCLUDED."gridSize", "gridSpacing" = EXCLUDED."gridSpacing", "updatedAt" = NOW()`,
    [site.id, JSON.stringify(result), gridSize, gridSpacing]
  );

  res.json(result);
}));

router.get("/:siteId/wind-particles", asyncHandler(async (req, res) => {
  const site = await queryOne<SiteCoordRow>(
    `SELECT id, lat, lon FROM sites WHERE id = $1`,
    [req.params.siteId]
  );
  if (!site || !site.lat || !site.lon) {
    return res.status(404).json({ error: "Site not found or missing coordinates" });
  }

  let grid = await getCachedFineGrid();
  let wideGrid = await getCachedCoarseGrid();

  if (!grid) {
    grid = await fetchFineGrid().catch(e => { log.error("Fine grid fetch failed:", e); return null; });
  }
  if (!grid) {
    return res.status(503).json({ error: "Wind data temporarily unavailable" });
  }

  if (!wideGrid) {
    wideGrid = await fetchCoarseGrid().catch(e => { log.warn("Coarse grid fetch failed:", e); return null; });
  }

  const particles = extractWindParticles(grid, site.lat, site.lon, wideGrid);
  if (!particles) {
    return res.status(404).json({ error: "No wind data available for this location" });
  }

  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.json(particles);
}));

router.get("/wind-overlay/full", asyncHandler(async (req, res) => {
  let grid = await getCachedFineGrid();
  let wideGrid = await getCachedCoarseGrid();

  if (!grid) {
    try {
      grid = await fetchFineGrid();
    } catch (e) {
      log.error("Fine grid fetch failed:", e);
    }
  }
  if (!grid) {
    return res.status(503).json({ error: "Wind data temporarily unavailable" });
  }

  if (!wideGrid) {
    wideGrid = await fetchCoarseGrid().catch(() => null);
  }

  const result = extractFullWindGrid(grid, wideGrid);
  if (!result) {
    return res.status(503).json({ error: "Wind data temporarily unavailable" });
  }

  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.json(result);
}));

router.get("/:siteId/extended-forecast", asyncHandler(async (req, res) => {
  const forecast = await getSiteExtendedForecast(req.params.siteId);
  if (!forecast) {
    return res.status(404).json({ error: "No extended forecast available for this site" });
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(forecast);
}));

router.post("/scrape-now", asyncHandler(async (req, res) => {
  await fetchWeatherData(true);
  res.json({ success: true, message: "Weather data updated successfully" });
}));

router.post("/extended-forecast/fetch-now", requireAuth, asyncHandler(async (_req, res) => {
  const ts = new Date().toISOString();
  try {
    await fetchExtendedForecast();
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["extendedForecastLastRun", ts]
    );
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["extendedForecastLastResult", "ok"]
    );
    res.json({ success: true, message: "Extended forecast fetch completed successfully" });
  } catch (e: any) {
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["extendedForecastLastRun", ts]
    );
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["extendedForecastLastResult", e.message || "Unknown error"]
    );
    res.status(500).json({ success: false, message: e.message || "Extended forecast fetch failed" });
  }
}));

router.post("/fine-grid/fetch-now", requireAuth, asyncHandler(async (_req, res) => {
  const ts = new Date().toISOString();
  try {
    await fetchFineGrid(true);
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["fineGridLastRun", ts]
    );
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["fineGridLastResult", "ok"]
    );
    res.json({ success: true, message: "Fine grid fetch completed" });
  } catch (e: any) {
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["fineGridLastRun", ts]
    );
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["fineGridLastResult", e.message || "Unknown error"]
    );
    log.error("Manual fine grid fetch failed:", e);
    res.status(500).json({ success: false, message: e.message || "Fine grid fetch failed" });
  }
}));

router.post("/coarse-grid/fetch-now", requireAuth, asyncHandler(async (_req, res) => {
  const ts = new Date().toISOString();
  try {
    await fetchCoarseGrid(true);
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["coarseGridLastRun", ts]
    );
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["coarseGridLastResult", "ok"]
    );
    res.json({ success: true, message: "Coarse grid fetch completed" });
  } catch (e: any) {
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["coarseGridLastRun", ts]
    );
    await execute(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ["coarseGridLastResult", e.message || "Unknown error"]
    );
    log.error("Manual coarse grid fetch failed:", e);
    res.status(500).json({ success: false, message: e.message || "Coarse grid fetch failed" });
  }
}));

export default router;
