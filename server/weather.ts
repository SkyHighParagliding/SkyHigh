import { fromZonedTime } from 'date-fns-tz';
import { query, queryOne, execute } from "./pg.js";
import { fetchFreeFlightWxData, getSlugFromStationId } from "./freeflightwx.js";
import { parseBomStationId, fetchBomObservation } from "./bomWeather.js";
import { fetchWithRetry, getWeatherCodeSummary, degreesToDirection } from "./weather-utils.js";
import createLogger from "./utils/logger.js";

const log = createLogger("weather");

const LIVE_WIND_VIC_URL = "https://live-wind.com.au/windobs/v3/query_newest_obs_smart_v2.php?state=vic";
let scraperTimeout: NodeJS.Timeout | null = null;

export interface WeatherScrapeResult {
  liveStationsUpdated: number;
  forecastsUpdated: number;
  totalSites: number;
  gridPoints: number;
  gridAgeMin: number;
  forecastError: string | null;
  skippedOutsideHours: boolean;
}

export async function fetchWeatherData(isManual = false): Promise<WeatherScrapeResult | null> {
  const settings = await query<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key LIKE 'weatherScraper%'");
  const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as any);
  
  const minInterval = parseInt(config.weatherScraperMinInterval || '15');
  const maxInterval = parseInt(config.weatherScraperMaxInterval || '30');
  const startHour = parseInt(config.weatherScraperStartHour || '7');
  const endHour = parseInt(config.weatherScraperEndHour || '20');

  const result: WeatherScrapeResult = {
    liveStationsUpdated: 0,
    forecastsUpdated: 0,
    totalSites: 0,
    gridPoints: 0,
    gridAgeMin: 0,
    forecastError: null,
    skippedOutsideHours: false,
  };

  try {
    const now = new Date();
    const melbourneTime = new Intl.DateTimeFormat('en-AU', {
      timeZone: 'Australia/Melbourne',
      hour: 'numeric',
      hour12: false
    }).format(now);

    const hour = parseInt(melbourneTime);

    if (!isManual && (hour < startHour || hour >= endHour)) {
      console.log(`Weather scraper: Outside operating hours (${startHour}am-${endHour % 24}pm). Current hour in Melbourne: ${hour}`);
      scheduleNextFetch(minInterval, maxInterval);
      result.skippedOutsideHours = true;
      return result;
    }

    const sitesWithLiveWeather = await query<{ id: string; liveStationId: string; liveStationIdAlt: string | null }>(
      "SELECT id, \"liveStationId\", \"liveStationIdAlt\" FROM sites WHERE \"useLiveWeather\" = 'true' AND \"liveStationId\" IS NOT NULL"
    );
    
    const allStationIds = sitesWithLiveWeather.flatMap(s => [s.liveStationId, s.liveStationIdAlt].filter(Boolean) as string[]);
    let liveWindData: any = null;
    if (allStationIds.some(id => id.startsWith('livewind-'))) {
      try {
        liveWindData = await fetchWithRetry(LIVE_WIND_VIC_URL, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          }
        });
      } catch (err) {
        log.error("Weather scraper: Failed to fetch live-wind.com.au data:", err);
      }
    }

    async function fetchStationData(stationId: string, siteId: string, dbKey: string, isManualTrigger: boolean) {
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
          await execute("DELETE FROM weather_observations WHERE \"siteId\" = $1", [dbKey]);
          const timestamp = new Date().toISOString();
          await execute(
            "INSERT INTO weather_observations (\"siteId\", \"windSpeed\", \"windGust\", direction, \"stationName\", \"stationLat\", \"stationLon\", timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [dbKey, windSpeed, windGust, direction, siteName, lat, lon, timestamp]
          );
          console.log(`Weather scraper: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} weather - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${siteName} (Live-Wind)`);
        }
      } else if (stationId.startsWith('freeflightwx-')) {
        const stationSlug = getSlugFromStationId(stationId);
        const gaugeUrl = `https://www.freeflightwx.com/${stationSlug}/gauge.php`;
        console.log(`Weather scraper: Fetching FreeFlightWx data for site ${siteId}${dbKey !== siteId ? ' (alt)' : ''} (Station: ${stationSlug})${isManualTrigger ? ' (Manual Trigger)' : ''}...`);
        const wxData = await fetchFreeFlightWxData(gaugeUrl);
        if (wxData.current) {
          const windSpeed = Math.round(wxData.current.windSpeedKts);
          const windGust = Math.round(wxData.current.windGustKts);
          const direction = wxData.current.windDirectionCardinal;
          const stationName = stationSlug.charAt(0).toUpperCase() + stationSlug.slice(1) + ' (FreeFlightWx)';
          await execute("DELETE FROM weather_observations WHERE \"siteId\" = $1", [dbKey]);
          const timestamp = new Date(wxData.current.timestamp).toISOString();
          await execute(
            "INSERT INTO weather_observations (\"siteId\", \"windSpeed\", \"windGust\", direction, \"stationName\", \"stationLat\", \"stationLon\", timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [dbKey, windSpeed, windGust, direction, stationName, null, null, timestamp]
          );
          console.log(`Weather scraper: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} weather - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${stationName}`);
        }
      } else if (stationId.startsWith('bom-')) {
        const parsed = parseBomStationId(stationId);
        if (!parsed) {
          log.error(`Weather scraper: Invalid BOM station ID format: ${stationId}`);
          return;
        }
        console.log(`Weather scraper: Fetching BOM data for site ${siteId}${dbKey !== siteId ? ' (alt)' : ''} (Station: ${stationId})${isManualTrigger ? ' (Manual Trigger)' : ''}...`);
        const bomObs = await fetchBomObservation(parsed.productCode, parsed.stationNum);
        if (bomObs) {
          await execute("DELETE FROM weather_observations WHERE \"siteId\" = $1", [dbKey]);
          await execute(
            "INSERT INTO weather_observations (\"siteId\", \"windSpeed\", \"windGust\", direction, \"stationName\", \"stationLat\", \"stationLon\", timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [dbKey, bomObs.windSpeed, bomObs.windGust, bomObs.direction, bomObs.stationName, bomObs.stationLat, bomObs.stationLon, bomObs.timestamp]
          );
          console.log(`Weather scraper: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} weather - ${bomObs.windSpeed}kt (Gust ${bomObs.windGust}kt) ${bomObs.direction} from ${bomObs.stationName} (BOM)`);
        }
      } else {
        console.log(`Weather scraper: Fetching WU data for site ${siteId}${dbKey !== siteId ? ' (alt)' : ''} (Station: ${stationId})${isManualTrigger ? ' (Manual Trigger)' : ''}...`);
        const wuApiKey = process.env.WU_API_KEY;
        if (!wuApiKey) {
          log.error("Weather scraper: WU_API_KEY not configured in secrets");
          return;
        }
        const wuUrl = `https://api.weather.com/v2/pws/observations/current?stationId=${stationId}&format=json&units=m&apiKey=${wuApiKey}`;
        const data = await fetchWithRetry(wuUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': 'application/json'
          }
        });
        const latest = data.observations?.[0];
        if (latest) {
          const windSpeed = Math.round((latest.metric?.windSpeed ?? 0) * 0.539957);
          const windGust = Math.round((latest.metric?.windGust ?? 0) * 0.539957);
          const direction = degreesToDirection(latest.winddir ?? 0);
          const stationName = latest.neighborhood || stationId;
          await execute("DELETE FROM weather_observations WHERE \"siteId\" = $1", [dbKey]);
          const timestamp = new Date(latest.obsTimeUtc).toISOString();
          await execute(
            "INSERT INTO weather_observations (\"siteId\", \"windSpeed\", \"windGust\", direction, \"stationName\", \"stationLat\", \"stationLon\", timestamp) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            [dbKey, windSpeed, windGust, direction, stationName, latest.lat, latest.lon, timestamp]
          );
          console.log(`Weather scraper: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} weather - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${stationName} (WU)`);
        }
      }
    }

    for (const site of sitesWithLiveWeather) {
      try {
        await fetchStationData(site.liveStationId, site.id, site.id, isManual);
        result.liveStationsUpdated++;
      } catch (err) {
        log.error(`Weather scraper: Failed to fetch primary weather data for ${site.id}:`, err);
      }
      if (site.liveStationIdAlt) {
        try {
          await fetchStationData(site.liveStationIdAlt, site.id, `${site.id}:alt`, isManual);
        } catch (err) {
          log.error(`Weather scraper: Failed to fetch alt weather data for ${site.id}:`, err);
        }
      }
    }

    try {
      const { fetchFineGrid, extractSiteForecast } = await import("./victoriaGrid.js");
      // Force-refresh the grid when triggered manually so stale/missing cache can't block forecasts
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

    await execute(
      "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
      ['weatherScraperLastRun', new Date().toISOString()]
    );
  } catch (err) {
    log.error("Weather scraper: CRITICAL ERROR in fetchWeatherData:", err);
  }

  scheduleNextFetch(minInterval, maxInterval);
  return result;
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

function scheduleNextFetch(min: number, max: number) {
  if (scraperTimeout) {
    clearTimeout(scraperTimeout);
  }
  const minutes = Math.floor(Math.random() * (max - min + 1)) + min;
  const ms = minutes * 60 * 1000;
  console.log(`Weather scraper: Next fetch in ${minutes} minutes.`);
  scraperTimeout = setTimeout(() => fetchWeatherData(), ms);
}

export { LIVE_WIND_VIC_URL, fetchWithRetry };
