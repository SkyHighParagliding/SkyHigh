import createLogger from "./logger.js";

const log = createLogger("spot-tracker");

export interface SpotPosition {
  lat: number;
  lon: number;
  altitude: number | null;
  speed: number | null;
  course: number | null;
  timestamp: string;
  timestampMs: number;
  inEmergency: boolean;
  validFix: boolean;
  batteryState: string | null;
  messageType: string | null;
}

const FEED_BASE_URL = "https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed";
const FETCH_TIMEOUT_MS = 15000;

export async function fetchSpotPosition(
  feedId: string,
  feedPassword?: string | null
): Promise<SpotPosition | null> {
  if (!feedId || !feedId.trim()) return null;

  const cleanId = feedId.trim();
  let url = `${FEED_BASE_URL}/${encodeURIComponent(cleanId)}/latest.json`;
  if (feedPassword) {
    url += `?feedPassword=${encodeURIComponent(feedPassword)}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      log.info(`SPOT feed fetch failed for "${cleanId}": HTTP ${res.status}`);
      return null;
    }

    const json = await res.json();
    return parseSpotResponse(json);
  } catch (err: any) {
    if (err.name === "AbortError") {
      log.info(`SPOT feed fetch timed out for "${cleanId}"`);
    } else {
      log.info(`SPOT feed fetch error for "${cleanId}": ${err.message}`);
    }
    return null;
  }
}

function parseSpotResponse(data: any): SpotPosition | null {
  try {
    const feedResponse = data?.response?.feedMessageResponse;
    if (!feedResponse) return null;

    const messages = feedResponse.messages?.message;
    if (!messages) return null;

    const msgList = Array.isArray(messages) ? messages : [messages];
    if (msgList.length === 0) return null;

    let latest: SpotPosition | null = null;
    let latestTs = 0;

    for (const msg of msgList) {
      const lat = msg.latitude;
      const lon = msg.longitude;
      if (lat == null || lon == null) continue;
      if (isNaN(lat) || isNaN(lon)) continue;

      const ts = (msg.unixTime || 0) * 1000;
      if (!ts || isNaN(ts)) continue;

      if (ts >= latestTs || !latest) {
        const messageType = msg.messageType || null;
        latest = {
          lat,
          lon,
          altitude: msg.altitude != null ? msg.altitude : null,
          speed: null,
          course: null,
          timestamp: new Date(ts).toISOString(),
          timestampMs: ts,
          inEmergency: messageType === "SOS" || messageType === "NEWMOVEMENT",
          validFix: true,
          batteryState: msg.batteryState || null,
          messageType,
        };
        latestTs = ts;
      }
    }

    return latest;
  } catch (err: any) {
    log.info(`SPOT response parse error: ${err.message}`);
    return null;
  }
}
