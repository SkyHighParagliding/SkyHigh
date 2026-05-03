import { fromZonedTime } from 'date-fns-tz';
import db from "./db.js";
import { fetchFreeFlightWxData, getSlugFromStationId } from "./freeflightwx.js";
import createLogger from "./utils/logger.js";

const log = createLogger("weather");

const LIVE_WIND_VIC_URL = "https://live-wind.com.au/windobs/v3/query_newest_obs_smart_v2.php?state=vic";
const OPEN_METEO_URL = "http://api.open-meteo.com/v1/forecast";
let scraperTimeout: NodeJS.Timeout | null = null;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: any = {}, retries = 3, backoff = 1000) {
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout per attempt
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (i === retries - 1) throw err;
      const wait = backoff * Math.pow(2, i);
      log.warn(`Fetch failed (attempt ${i + 1}/${retries}). Retrying in ${wait}ms...`, err instanceof Error ? err.message : err);
      await delay(wait);
    }
  }
}

export function getWeatherCodeSummary(code: number): { text: string, icon: string } {
  const map: Record<number, { text: string, icon: string }> = {
    0: { text: "Clear sky", icon: "Sun" },
    1: { text: "Mainly clear", icon: "CloudSun" },
    2: { text: "Partly cloudy", icon: "CloudSun" },
    3: { text: "Overcast", icon: "Cloudy" },
    45: { text: "Fog", icon: "Cloud" },
    48: { text: "Depositing rime fog", icon: "Cloud" },
    51: { text: "Light drizzle", icon: "CloudDrizzle" },
    53: { text: "Moderate drizzle", icon: "CloudDrizzle" },
    55: { text: "Dense drizzle", icon: "CloudDrizzle" },
    61: { text: "Slight rain", icon: "CloudRain" },
    63: { text: "Moderate rain", icon: "CloudRain" },
    65: { text: "Heavy rain", icon: "CloudRain" },
    80: { text: "Slight rain showers", icon: "CloudRain" },
    81: { text: "Moderate rain showers", icon: "CloudRain" },
    82: { text: "Violent rain showers", icon: "CloudRain" },
    95: { text: "Thunderstorm", icon: "CloudLightning" },
  };
  return map[code] || { text: "Unknown", icon: "CloudSun" };
}

export function degreesToDirection(degrees: number): string {
  const val = Math.floor((degrees / 22.5) + 0.5);
  const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return arr[(val % 16)];
}

export async function fetchWeatherData(isManual = false) {
  const settings = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'weatherScraper%'").all() as { key: string, value: string }[];
  const config = settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {} as any);
  
  const minInterval = parseInt(config.weatherScraperMinInterval || '15');
  const maxInterval = parseInt(config.weatherScraperMaxInterval || '30');
  const startHour = parseInt(config.weatherScraperStartHour || '7');
  const endHour = parseInt(config.weatherScraperEndHour || '20');

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
      return;
    }

    const sitesWithLiveWeather = await db.prepare("SELECT id, liveStationId, liveStationIdAlt FROM sites WHERE useLiveWeather = 'true' AND liveStationId IS NOT NULL").all() as { id: string, liveStationId: string, liveStationIdAlt: string | null }[];
    
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
          await db.prepare("DELETE FROM weather_observations WHERE siteId = ?").run(dbKey);
          const timestamp = new Date().toISOString();
          await db.prepare("INSERT INTO weather_observations (siteId, windSpeed, windGust, direction, stationName, stationLat, stationLon, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
            dbKey, stationData.speed_kt, stationData.gust_kt, stationData.direction, stationData.site_name, stationData.lat, stationData.lon, timestamp
          );
          console.log(`Weather scraper: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} weather - ${stationData.speed_kt}kt (Gust ${stationData.gust_kt}kt) ${stationData.direction} from ${stationData.site_name} (Live-Wind)`);
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
          await db.prepare("DELETE FROM weather_observations WHERE siteId = ?").run(dbKey);
          const timestamp = new Date(wxData.current.timestamp).toISOString();
          await db.prepare("INSERT INTO weather_observations (siteId, windSpeed, windGust, direction, stationName, stationLat, stationLon, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
            dbKey, windSpeed, windGust, direction, stationName, null, null, timestamp
          );
          console.log(`Weather scraper: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} weather - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${stationName}`);
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
          const windSpeed = Math.round(latest.metric.windSpeed * 0.539957);
          const windGust = Math.round(latest.metric.windGust * 0.539957);
          const direction = degreesToDirection(latest.winddir);
          const stationName = latest.neighborhood || stationId;
          await db.prepare("DELETE FROM weather_observations WHERE siteId = ?").run(dbKey);
          const timestamp = new Date(latest.obsTimeUtc).toISOString();
          await db.prepare("INSERT INTO weather_observations (siteId, windSpeed, windGust, direction, stationName, stationLat, stationLon, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
            dbKey, windSpeed, windGust, direction, stationName, latest.lat, latest.lon, timestamp
          );
          console.log(`Weather scraper: Updated ${siteId}${dbKey !== siteId ? ' (alt)' : ''} weather - ${windSpeed}kt (Gust ${windGust}kt) ${direction} from ${stationName} (WU)`);
        }
      }
    }

    for (const site of sitesWithLiveWeather) {
      try {
        await fetchStationData(site.liveStationId, site.id, site.id, isManual);
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
      const { fetchVictoriaGrid, extractSiteForecast } = await import("./victoriaGrid.js");
      const grid = await fetchVictoriaGrid();

      const sites = await db.prepare("SELECT id, lat, lon FROM sites").all() as { id: string, lat: number, lon: number }[];
      for (const site of sites) {
        if (!site.lat || !site.lon) continue;

        try {
          const forecast = extractSiteForecast(grid, site.id, site.lat, site.lon);
          if (forecast) {
            await db.prepare("INSERT OR REPLACE INTO weather_forecasts (siteId, timestamp, temperature, windSpeed, windGust, windDirection, icon, summary, forecasts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
              forecast.siteId, forecast.timestamp, forecast.temperature, forecast.windSpeed, forecast.windGust, forecast.windDirection, forecast.icon, forecast.summary, forecast.forecasts
            );
            console.log(`Weather scraper: Updated ECMWF forecast for ${site.id} (Hour: ${hour})`);
          }
        } catch (err) {
          log.error(`Weather scraper: Failed to extract forecast for ${site.id}:`, err);
        }
      }
    } catch (err) {
      log.error("Weather scraper: Failed to process forecasts:", err);
    }

    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('weatherScraperLastRun', new Date().toISOString());
  } catch (err) {
    log.error("Weather scraper: CRITICAL ERROR in fetchWeatherData:", err);
  }

  scheduleNextFetch(minInterval, maxInterval);
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
