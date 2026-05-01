import createLogger from "./logger.js";

const log = createLogger("garmin-mapshare");

export interface GarminPosition {
  lat: number;
  lon: number;
  altitude: number | null;
  speed: number | null;
  course: number | null;
  timestamp: string;
  timestampMs: number;
  inEmergency: boolean;
  validFix: boolean;
}

const FEED_BASE_URL = "https://share.garmin.com/Feed/Share";
const FETCH_TIMEOUT_MS = 15000;

export async function fetchGarminPosition(
  mapShareName: string,
  password?: string | null
): Promise<GarminPosition | null> {
  if (!mapShareName || !mapShareName.trim()) return null;

  const cleanName = mapShareName.trim();
  const url = `${FEED_BASE_URL}/${encodeURIComponent(cleanName)}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.google-earth.kml+xml, application/xml, text/xml",
  };

  if (password) {
    headers.Authorization = `Basic ${Buffer.from(`${cleanName}:${password}`).toString("base64")}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const res = await fetch(url, {
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      log.info(`Garmin MapShare fetch failed for "${cleanName}": HTTP ${res.status}`);
      return null;
    }

    const kml = await res.text();
    return parseKmlForLatestPosition(kml);
  } catch (err: any) {
    if (err.name === "AbortError") {
      log.info(`Garmin MapShare fetch timed out for "${cleanName}"`);
    } else {
      log.info(`Garmin MapShare fetch error for "${cleanName}": ${err.message}`);
    }
    return null;
  }
}

function parseKmlForLatestPosition(kml: string): GarminPosition | null {
  const placemarks = kml.split(/<Placemark>/i).slice(1);
  if (placemarks.length === 0) return null;

  let latest: GarminPosition | null = null;
  let latestTs = 0;

  for (const pm of placemarks) {
    const lat = extractExtendedData(pm, "Latitude");
    const lon = extractExtendedData(pm, "Longitude");
    const timeUtc = extractExtendedData(pm, "Time UTC");

    if (lat === null || lon === null) {
      const coords = extractCoordinates(pm);
      if (!coords) continue;

      const ts = timeUtc ? new Date(timeUtc).getTime() : 0;
      if (ts >= latestTs || !latest) {
        latest = {
          lat: coords.lat,
          lon: coords.lon,
          altitude: coords.alt,
          speed: null,
          course: null,
          timestamp: timeUtc || new Date().toISOString(),
          timestampMs: ts || Date.now(),
          inEmergency: false,
          validFix: true,
        };
        latestTs = ts;
      }
      continue;
    }

    const altitude = extractExtendedData(pm, "Elevation");
    const velocity = extractExtendedData(pm, "Velocity");
    const course = extractExtendedData(pm, "Course");
    const emergency = extractExtendedData(pm, "In Emergency");
    const validFix = extractExtendedData(pm, "Valid GPS Fix");

    const ts = timeUtc ? new Date(timeUtc).getTime() : 0;

    if (ts >= latestTs || !latest) {
      latest = {
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        altitude: altitude ? parseFloat(altitude) : null,
        speed: velocity ? parseFloat(velocity) : null,
        course: course ? parseFloat(course) : null,
        timestamp: timeUtc || new Date().toISOString(),
        timestampMs: ts || Date.now(),
        inEmergency: emergency?.toLowerCase() === "true",
        validFix: validFix ? validFix.toLowerCase() !== "false" : true,
      };
      latestTs = ts;
    }
  }

  if (latest && (isNaN(latest.lat) || isNaN(latest.lon))) {
    return null;
  }

  return latest;
}

function extractExtendedData(placemark: string, name: string): string | null {
  const pattern = new RegExp(
    `<Data\\s+name=["']${escapeRegex(name)}["']>\\s*<value>([^<]*)</value>`,
    "i"
  );
  const match = placemark.match(pattern);
  if (match) return match[1].trim() || null;

  const simplePattern = new RegExp(
    `<SimpleData\\s+name=["']${escapeRegex(name)}["']>([^<]*)</SimpleData>`,
    "i"
  );
  const simpleMatch = placemark.match(simplePattern);
  return simpleMatch ? simpleMatch[1].trim() || null : null;
}

function extractCoordinates(placemark: string): { lat: number; lon: number; alt: number | null } | null {
  const match = placemark.match(/<coordinates>\s*([-\d.]+),([-\d.]+)(?:,([-\d.]+))?\s*<\/coordinates>/i);
  if (!match) return null;
  return {
    lon: parseFloat(match[1]),
    lat: parseFloat(match[2]),
    alt: match[3] ? parseFloat(match[3]) : null,
  };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
