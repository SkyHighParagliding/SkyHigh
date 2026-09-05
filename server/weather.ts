import { fromZonedTime } from 'date-fns-tz';
import { query, queryOne, execute } from "./pg.js";
import { fetchFreeFlightWxData, getSlugFromStationId } from "./freeflightwx.js";
import { parseBomStationId, fetchBomObservation } from "./bomWeather.js";
import { parseDavisStationId, fetchDavisObservation } from "./davisWeather.js";
import { fetchWithRetry, getWeatherCodeSummary, degreesToDirection, isWuStationId } from "./weather-utils.js";
import createLogger from "./utils/logger.js";

const log = createLogger("weather");

const TWO_MIN_MS = 2 * 60 * 1000;
const HISTORY_RETENTION_HOURS = 48;

async function saveObservation(
  dbKey: string,
  windSpeed: number,
  windGust: number,
  direction: string,
  stationName: string,
  lat: number | null,
  lon: number | null,
  timestamp: string,
  historySiteId = dbKey  // real site id for history; dbKey may be 'site:alt' for alt sources
) {
  await execute('DELETE FROM weather_observations WHERE "siteId" = $1', [dbKey]);
  await execute(
    'INSERT INTO weather_observations ("siteId", "windSpeed", "windGust", direction, "stationName", "stationLat", "stationLon", timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [dbKey, windSpeed, windGust, direction, stationName, lat, lon, timestamp]
  );

  const last = await queryOne<{ timestamp: string }>(
    'SELECT timestamp FROM weather_history WHERE "siteId" = $1 AND "stationName" = $2 ORDER BY timestamp DESC LIMIT 1',
    [historySiteId, stationName]
  );
  if (!last || Date.now() - new Date(last.timestamp).getTime() >= TWO_MIN_MS) {
    await execute(
      'INSERT INTO weather_history ("siteId", "stationName", "windSpeed", "windGust", direction, timestamp) VALUES ($1, $2, $3, $4, $5, $6)',
      [historySiteId, stationName, windSpeed, windGust, direction, timestamp]
    );
    await execute(
      `DELETE FROM weather_history WHERE "siteId" = $1 AND "stationName" = $2 AND timestamp < NOW() - INTERVAL '${HISTORY_RETENTION_HOURS} hours'`,
      [historySiteId, stationName]
    );
  }
}

const LIVE_WIND_VIC_URL = "https://live-wind.com.au/windobs/v3/query_newest_obs_smart_v2.php?state=vic";

type SourceType = 'freeflightwx' | 'wu' | 'livewind' | 'bom' | 'davis';

const SOURCE_DEFAULTS: Record<SourceType, { min: number; max: number }> = {
  freeflightwx: { min: 2,  max: 3  },
  wu:           { min: 14, max: 15 },
  livewind:     { min: 5,  max: 10 },
  bom:          { min: 10, max: 20 },
  davis:        { min: 5,  max: 10 },
};

const SOURCE_KEY: Record<SourceType, string> = {
  freeflightwx: 'ffwx',
  wu:           'wu',
  livewind:     'livewind',
  bom:          'bom',
  davis:        'davis',
};

const ALL_SOURCE_TYPES: SourceType[] = ['freeflightwx', 'wu', 'livewind', 'bom', 'davis'];

const scraperTimeouts: Partial<Record<SourceType, NodeJS.Timeout>> = {};
const scraperNextRun: Partial<Record<SourceType, number>> = {};

export function getScraperNextRun(): Partial<Record<SourceType, number>> {
  return { ...scraperNextRun };
}

export interface WeatherScrapeResult {
  liveStationsUpdated: number;
  forecastsUpdated: number;
  totalSites: number;
  gridPoints: number;
  gridAgeMin: number;
  forecastError: string | null;
  skippedOutsideHours: boolean;
}

function getMelbourneHour(): number {
  return parseInt(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric',
    hour12: false,
  }).format(new Date()));
}

async function getSourceSettings(type: SourceType) {
  const key = SOURCE_KEY[type];
  const def = SOURCE_DEFAULTS[type];
  const rows = await query<{ key: string; value: string }>(
    `SELECT key, value FROM settings WHERE key IN ($1, $2, $3, $4)`,
    [`weatherScraper_${key}_min`, `weatherScraper_${key}_max`, 'weatherScraperStartHour', 'weatherScraperEndHour', 'weatherScraperRunContinuously']
  );
  const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    min:             parseInt(cfg[`weatherScraper_${key}_min`] || String(def.min)),
    max:             parseInt(cfg[`weatherScraper_${key}_max`] || String(def.max)),
    startHour:       parseInt(cfg['weatherScraperStartHour'] || '7'),
    endHour:         parseInt(cfg['weatherScraperEndHour']   || '20'),
    runContinuously: cfg['weatherScraperRunContinuously'] === 'true',
  };
}

function scheduleSourceFetch(type: SourceType, min: number, max: number) {
  const existing = scraperTimeouts[type];
  if (existing) clearTimeout(existing);
  const minutes = Math.floor(Math.random() * (max - min + 1)) + min;
  scraperNextRun[type] = Date.now() + minutes * 60 * 1000;
  console.log(`Weather scraper [${type}]: Next fetch in ${minutes} minutes.`);
  scraperTimeouts[type] = setTimeout(() => runSourceScrape(type), minutes * 60 * 1000);
}

async function updateForecasts(isManual: boolean): Promise<{ forecastsUpdated: number; totalSites: number; gridPoints: number; gridAgeMin: number; forecastError: string | null }> {
  const result = { forecastsUpdated: 0, totalSites: 0, gridPoints: 0, gridAgeMin: 0, forecastError: null as string | null };
  try {
    const { fetchFineGrid, extractSiteForecast } = await import("./victoriaGrid.js");
    const grid = await fetchFineGrid(isManual);
    result.gridPoints = grid.points.length;
    result.gridAgeMin = Math.round((Date.now() - grid.fetchedAt) / 60000);
    if (result.gridAgeMin > 60) log.warn(`Weather scraper: Fine grid is ${result.gridAgeMin}min old — forecasts may be stale`);

    const sites = await query<{ id: string; lat: number; lon: number }>("SELECT id, lat, lon FROM sites");
    result.totalSites = sites.length;
    for (const site of sites) {
      if (!site.lat || !site.lon) continue;
      try {
        const forecast = extractSiteForecast(grid, site.id, Number(site.lat), Number(site.lon));
        if (forecast) {
          await execute(
            `INSERT INTO weather_forecasts ("siteId", timestamp, temperature, "windSpeed", "windGust", "windDirection", icon, summary, forecasts)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             ON CONFLICT ("siteId") DO UPDATE SET
               timestamp = EXCLUDED.timestamp,
               temperature = EXCLUDED.temperature,
               "windSpeed" = EXCLUDED."windSpeed",
               "windGust" = EXCLUDED."windGust",
               "windDirection" = EXCLUDED."windDirection",
               icon = EXCLUDED.icon,
               summary = EXCLUDED.summary,
               forecasts = EXCLUDED.forecasts`,
            [forecast.siteId, forecast.timestamp, forecast.temperature, forecast.windSpeed, forecast.windGust, forecast.windDirection, forecast.icon, forecast.summary, forecast.forecasts]
          );
          result.forecastsUpdated++;
        }
      } catch (err) {
        log.error(`Weather scraper: Failed to extract forecast for ${site.id}:`, err);
      }
    }
    console.log(`Weather scraper: Updated ECMWF forecasts for ${result.forecastsUpdated}/${result.totalSites} sites (grid age: ${result.gridAgeMin}min, ${result.gridPoints} points)`);
  } catch (err: any) {
    const msg = err?.message || String(err);
    log.error("Weather scraper: Failed to process forecasts:", msg);
    result.forecastError = msg;
  }
  return result;
}

async function runSourceScrape(type: SourceType, isManual = false): Promise<number> {
  const { min, max, startHour, endHour, runContinuously } = await getSourceSettings(type);
  const hour = getMelbourneHour();

  if (!isManual && !runContinuously && (hour < startHour || hour >= endHour)) {
    console.log(`Weather scraper [${type}]: Outside operating hours (${startHour}am-${endHour % 24}pm). Melbourne hour: ${hour}`);
    scheduleSourceFetch(type, min, max);
    return 0;
  }

  let updated = 0;
  try {
    const sitesWithLiveWeather = await query<{ id: string; liveStationId: string; liveStationIdAlt: string | null }>(
      "SELECT id, \"liveStationId\", \"liveStationIdAlt\" FROM sites WHERE \"useLiveWeather\" = 'true' AND \"liveStationId\" IS NOT NULL"
    );

    const stationMatchesType = (id: string) => {
      switch (type) {
        case 'freeflightwx': return id.startsWith('freeflightwx-');
        case 'livewind':     return id.startsWith('livewind-');
        case 'bom':          return id.startsWith('bom-');
        case 'davis':        return id.startsWith('davis-');
        case 'wu':           return isWuStationId(id);
      }
    };

    // Fetch live-wind bulk data once if needed for this type
    let liveWindData: any = null;
    if (type === 'livewind') {
      const allIds = sitesWithLiveWeather.flatMap(s => [s.liveStationId, s.liveStationIdAlt].filter(Boolean) as string[]);
      if (allIds.some(id => id.startsWith('livewind-'))) {
        try {
          liveWindData = await fetchWithRetry(LIVE_WIND_VIC_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
          });
        } catch (err) {
          log.error("Weather scraper: Failed to fetch live-wind.com.au data:", err);
        }
      }
    }

    async function fetchStationData(stationId: string, siteId: string, dbKey: string) {
      if (stationId.startsWith('livewind-')) {
        const wmoid = stationId.replace('livewind-', '');
        const stationData = liveWindData?.find((d: any) => d.wmoid === wmoid);
        if (stationData) {
          const windSpeed = typeof stationData.speed_kt === 'number'
            ? stationData.speed_kt
            : (stationData.speed_kt ? parseInt(String(stationData.speed_kt), 10) || 0 : 0);
          const windGust = typeof stationData.gust_kt === 'number'
            ? stationData.gust_kt
            : (stationData.gust_kt ? parseInt(String(stationData.gust_kt), 10) || 0 : 0);
          const direction = stationData.direction ?? 'N';
          const siteName = stationData.site_name || 'Unknown';
          const lat = typeof stationData.lat === 'number'
            ? stationData.lat
            : (stationData.lat ? parseFloat(String(stationData.lat)) || null : null);
          const lon = typeof stationData.lon === 'number'
            ? stationData.lon
            : (stationData.lon ? parseFloat(String(stationData.lon)) || null : null);
          await saveObservation(dbKey, windSpeed, windGust, direction, siteName, lat, lon, new Date().toISOString(), siteId);
          console.log(`Weather scraper [livewind]: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${siteName}`);
        }
      } else if (stationId.startsWith('freeflightwx-')) {
        const stationSlug = getSlugFromStationId(stationId);
        const gaugeUrl = `https://www.freeflightwx.com/${stationSlug}/gauge.php`;
        console.log(`Weather scraper [freeflightwx]: Fetching ${siteId}${dbKey !== siteId ? ' (alt)' : ''} (${stationSlug})${isManual ? ' (manual)' : ''}...`);
        const wxData = await fetchFreeFlightWxData(gaugeUrl);
        if (wxData.current) {
          const windSpeed = Math.round(wxData.current.windSpeedKts);
          const windGust = Math.round(wxData.current.windGustKts);
          const direction = wxData.current.windDirectionCardinal;
          const stationName = stationSlug.charAt(0).toUpperCase() + stationSlug.slice(1) + ' (FreeFlightWx)';
          await saveObservation(dbKey, windSpeed, windGust, direction, stationName, null, null, new Date(wxData.current.timestamp).toISOString(), siteId);
          console.log(`Weather scraper [freeflightwx]: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${stationName}`);
        }
      } else if (stationId.startsWith('bom-')) {
        const parsed = parseBomStationId(stationId);
        if (!parsed) {
          log.error(`Weather scraper [bom]: Invalid station ID format: ${stationId}`);
          return;
        }
        console.log(`Weather scraper [bom]: Fetching ${siteId}${dbKey !== siteId ? ' (alt)' : ''} (${stationId})${isManual ? ' (manual)' : ''}...`);
        const bomObs = await fetchBomObservation(parsed.productCode, parsed.stationNum);
        if (bomObs) {
          await saveObservation(dbKey, bomObs.windSpeed, bomObs.windGust, bomObs.direction, bomObs.stationName, bomObs.stationLat, bomObs.stationLon, bomObs.timestamp, siteId);
          console.log(`Weather scraper [bom]: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} - ${bomObs.windSpeed}kt (Gust ${bomObs.windGust}kt) ${bomObs.direction} from ${bomObs.stationName}`);
        }
      } else if (stationId.startsWith('davis-')) {
        const parsed = parseDavisStationId(stationId);
        if (!parsed) {
          log.error(`Weather scraper [davis]: Invalid station ID format: ${stationId}`);
          return;
        }
        console.log(`Weather scraper [davis]: Fetching ${siteId}${dbKey !== siteId ? ' (alt)' : ''} (${stationId})${isManual ? ' (manual)' : ''}...`);
        const davisObs = await fetchDavisObservation(parsed.token);
        if (davisObs) {
          await saveObservation(dbKey, davisObs.windSpeed, davisObs.windGust, davisObs.direction, davisObs.stationName, davisObs.stationLat, davisObs.stationLon, davisObs.timestamp, siteId);
          console.log(`Weather scraper [davis]: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} - ${davisObs.windSpeed}kt (Gust ${davisObs.windGust}kt) ${davisObs.direction} from ${davisObs.stationName}`);
        }
      } else {
        console.log(`Weather scraper [wu]: Fetching ${siteId}${dbKey !== siteId ? ' (alt)' : ''} (${stationId})${isManual ? ' (manual)' : ''}...`);
        const wuApiKey = process.env.WU_API_KEY;
        if (!wuApiKey) {
          log.error("Weather scraper [wu]: WU_API_KEY not configured");
          return;
        }
        const wuUrl = `https://api.weather.com/v2/pws/observations/current?stationId=${stationId}&format=json&units=m&apiKey=${wuApiKey}`;
        const data = await fetchWithRetry(wuUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json',
          }
        });
        const latest = data.observations?.[0];
        if (latest) {
          const windSpeed = Math.round((latest.metric?.windSpeed ?? 0) * 0.539957);
          const windGust  = Math.round((latest.metric?.windGust  ?? 0) * 0.539957);
          const direction = degreesToDirection(latest.winddir ?? 0);
          const stationName = latest.neighborhood || stationId;
          await saveObservation(dbKey, windSpeed, windGust, direction, stationName, latest.lat, latest.lon, new Date(latest.obsTimeUtc).toISOString(), siteId);
          console.log(`Weather scraper [wu]: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${stationName}`);
        }
      }
    }

    for (const site of sitesWithLiveWeather) {
      if (stationMatchesType(site.liveStationId)) {
        try {
          await fetchStationData(site.liveStationId, site.id, site.id);
          updated++;
        } catch (err) {
          log.error(`Weather scraper [${type}]: Failed primary for ${site.id}:`, err);
        }
      }
      if (site.liveStationIdAlt && stationMatchesType(site.liveStationIdAlt)) {
        try {
          await fetchStationData(site.liveStationIdAlt, site.id, `${site.id}:alt`);
        } catch (err) {
          log.error(`Weather scraper [${type}]: Failed alt for ${site.id}:`, err);
        }
      }
    }

    await updateForecasts(isManual);

    await execute(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      [`weatherScraper_${SOURCE_KEY[type]}_lastRun`, new Date().toISOString()]
    );
  } catch (err) {
    log.error(`Weather scraper [${type}]: CRITICAL ERROR:`, err);
  }

  scheduleSourceFetch(type, min, max);
  return updated;
}

/** Start every independent scraper loop. Called once at server startup. */
export function startWeatherScrapers() {
  for (const type of ALL_SOURCE_TYPES) {
    runSourceScrape(type);
  }
}

/** Manual trigger: runs all source scrapers in parallel. Kept for /scrape-now and bulk-import. */
export async function fetchWeatherData(isManual = false): Promise<WeatherScrapeResult> {
  const counts = await Promise.all(
    ALL_SOURCE_TYPES.map(t => runSourceScrape(t, isManual))
  );
  await execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    ['weatherScraperLastRun', new Date().toISOString()]
  );
  return {
    liveStationsUpdated: counts.reduce((a, b) => a + b, 0),
    forecastsUpdated: 0,
    totalSites: 0,
    gridPoints: 0,
    gridAgeMin: 0,
    forecastError: null,
    skippedOutsideHours: false,
  };
}

async function initExtendedForecast() {
  try {
    const { scheduleExtendedForecast } = await import("./extendedForecast.js");
    scheduleExtendedForecast();
  } catch (err) {
    log.error("Weather scraper: Failed to initialize extended forecast scheduler:", err);
  }
}

initExtendedForecast();

export { LIVE_WIND_VIC_URL };
