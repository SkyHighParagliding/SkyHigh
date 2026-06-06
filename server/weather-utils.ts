import createLogger from "./utils/logger.js";

const log = createLogger("weather");
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function fetchWithRetry(url: string, options: any = {}, retries = 5, backoff = 1000) {
  let lastStatusCode = 0;
  for (let i = 0; i < retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout per attempt
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        const statusCode = response.status;
        lastStatusCode = statusCode;
        const errorMsg = `HTTP error! status: ${statusCode}`;
        if (statusCode === 429) {
          if (i === retries - 1) throw new Error(errorMsg);
          const retryAfter = response.headers.get('retry-after');
          let waitMs = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, i + 3) * 1000;
          waitMs = Math.min(waitMs, 60000);
          log.warn(`Rate limited (429). Retrying in ${waitMs}ms... (attempt ${i + 1}/${retries})`);
          await delay(waitMs);
          continue;
        }
        throw new Error(errorMsg);
      }
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON but got ${contentType}: ${text.slice(0, 200)}`);
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
