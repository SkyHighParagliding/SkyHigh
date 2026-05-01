import createLogger from "./logger.js";

const log = createLogger("zoleo-tracker");

export interface ZoleoPosition {
  lat: number;
  lon: number;
  altitude: number | null;
  speed: number | null;
  timestamp: string;
  timestampMs: number;
  inEmergency: boolean;
  validFix: boolean;
  batteryPercent: number | null;
}

const FETCH_TIMEOUT_MS = 15000;

export async function fetchZoleoPosition(
  imei: string,
  apiKey?: string | null
): Promise<ZoleoPosition | null> {
  if (!imei || !imei.trim()) return null;
  if (!apiKey) {
    return null;
  }

  const cleanImei = imei.trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const url = `https://api.zoleo.com/api/v1/devices/${encodeURIComponent(cleanImei)}/location`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      log.info(`ZOLEO fetch failed for "${cleanImei}": HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    return parseZoleoResponse(data);
  } catch (err: any) {
    if (err.name === "AbortError") {
      log.info(`ZOLEO fetch timed out for "${cleanImei}"`);
    } else {
      log.info(`ZOLEO fetch error for "${cleanImei}": ${err.message}`);
    }
    return null;
  }
}

function parseZoleoResponse(data: any): ZoleoPosition | null {
  try {
    const lat = data?.latitude ?? data?.lat;
    const lon = data?.longitude ?? data?.lon ?? data?.lng;
    if (lat == null || lon == null) return null;
    if (isNaN(lat) || isNaN(lon)) return null;

    const tsRaw = data?.timestamp || data?.dateTime || data?.time;
    let ts = 0;
    if (typeof tsRaw === "number") {
      ts = tsRaw > 1e12 ? tsRaw : tsRaw * 1000;
    } else if (typeof tsRaw === "string") {
      ts = new Date(tsRaw).getTime();
    }

    if (!ts || isNaN(ts)) {
      log.info("ZOLEO response missing valid timestamp — rejecting fix");
      return null;
    }

    return {
      lat,
      lon,
      altitude: data?.altitude != null ? data.altitude : null,
      speed: data?.speed != null ? data.speed : null,
      timestamp: new Date(ts).toISOString(),
      timestampMs: ts,
      inEmergency: data?.sos === true || data?.messageType === "SOS",
      validFix: true,
      batteryPercent: data?.battery != null ? data.battery : null,
    };
  } catch (err: any) {
    log.info(`ZOLEO response parse error: ${err.message}`);
    return null;
  }
}
