import fs from "fs";
import path from "path";
import createLogger from "./logger.js";
import db from "../db.js";

const log = createLogger("siteguide-zone-data");

const XCTRACK_JSON_URL = "https://siteguide.org.au/Downloads/XCTrackJson";
const OPENAIR_URL = "https://siteguide.org.au/Downloads/OpenAir?type=Default&includeAirspaceBelowFl=125";

const DATA_DIR = path.join(process.cwd(), "server", "data");
const XCTRACK_FILE = path.join(DATA_DIR, "siteguide_zones.json");
const OPENAIR_FILE = path.join(DATA_DIR, "siteguide_airspace.txt");

const CACHE_TTL = 24 * 60 * 60 * 1000;

interface XCTrackZone {
  airclass?: string;
  airname?: string;
  airchecktype?: string;
  components?: number[][];
  airupper?: XCTrackAltitude | number;
  airlower?: XCTrackAltitude | number;
  airpen?: number[] | null;
  airbrush?: number[] | null;
  descriptions?: { en?: string };
}

interface XCTrackAltitude {
  type?: string;
  height?: number;
}

interface XCTrackResponse {
  airspaces?: XCTrackZone[];
  zones?: XCTrackZone[];
  data?: XCTrackZone[];
}

interface AirspaceProperties {
  name: string;
  typeName: string;
  icaoClass: string;
  lowerFt: number;
  upperFt: number;
  lowerRef: number;
  upperRef: number;
  isCertified: boolean;
  isUncertified: boolean;
}

interface ZoneCache {
  data: GeoJSON.FeatureCollection;
  fetchedAt: number;
}

let zoneCache: ZoneCache | null = null;
let airspaceCache: ZoneCache | null = null;

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const ZONE_TYPE_COLORS: Record<string, { fill: string; stroke: string }> = {
  LZ: { fill: "#22c55e", stroke: "#16a34a" },
  NoLZ: { fill: "#ef4444", stroke: "#dc2626" },
  EmgyLZ: { fill: "#f97316", stroke: "#ea580c" },
  NoFly: { fill: "#dc2626", stroke: "#b91c1c" },
  Powerline: { fill: "#eab308", stroke: "#ca8a04" },
  Haz: { fill: "#f59e0b", stroke: "#d97706" },
  NoLaunch: { fill: "#a855f7", stroke: "#9333ea" },
  Feature: { fill: "#6366f1", stroke: "#4f46e5" },
};

function parseZoneAltitude(alt: XCTrackAltitude | number | undefined | null): number | null {
  if (alt == null) return null;
  if (typeof alt === "number") return Math.round(alt * 3.28084);
  if (typeof alt === "object" && alt.height != null) {
    return Math.round(Number(alt.height) * 3.28084);
  }
  return null;
}

function xcTrackJsonToGeoJSON(raw: XCTrackZone[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const zone of raw) {
    if (!zone.components || !Array.isArray(zone.components) || zone.components.length < 2) continue;

    const airclass = zone.airclass || "Feature";
    const coords = zone.components.map((c: number[]) => [c[1], c[0]]);

    const colors = ZONE_TYPE_COLORS[airclass] || ZONE_TYPE_COLORS.Feature;
    const isPowerline = airclass === "Powerline";

    let geometry: GeoJSON.Geometry;
    if (isPowerline || coords.length < 3) {
      geometry = { type: "LineString", coordinates: coords };
    } else {
      if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
        coords.push([...coords[0]]);
      }
      geometry = { type: "Polygon", coordinates: [coords] };
    }

    const description = zone.descriptions?.en || null;

    features.push({
      type: "Feature",
      geometry,
      properties: {
        name: zone.airname || "Unknown Zone",
        zoneType: airclass,
        checkType: zone.airchecktype || "unknown",
        fillColor: colors.fill,
        strokeColor: colors.stroke,
        penColor: zone.airpen || null,
        brushColor: zone.airbrush || null,
        upperFt: parseZoneAltitude(zone.airupper),
        lowerFt: parseZoneAltitude(zone.airlower),
        description,
      },
    });
  }

  return { type: "FeatureCollection", features };
}

const OPENAIR_TYPE_MAP: Record<string, string> = {
  A: "CTA", B: "CTA", C: "CTA", D: "CTR", E: "CTA",
  F: "OTHER", G: "OTHER",
  CTR: "CTR", CTA: "CTA", TMA: "TMA",
  R: "RESTRICTED", RESTRICTED: "RESTRICTED",
  P: "PROHIBITED", PROHIBITED: "PROHIBITED",
  DANGER: "DANGER",
  Q: "DANGER",
  W: "WARNING", WARNING: "WARNING",
  GP: "GLIDING_SECTOR",
  RMZ: "RMZ", TMZ: "TMZ", MBZ: "MBZ",
  GSEC: "GLIDING_SECTOR",
  WAVE: "WAVE_WINDOW",
};

function parseAltitude(val: string): { ft: number; ref: number } {
  if (!val) return { ft: 0, ref: 0 };
  const s = val.trim().toUpperCase();
  if (s === "SFC" || s === "GND") return { ft: 0, ref: 0 };
  if (s === "UNL" || s === "UNLIM" || s === "UNLIMITED") return { ft: 99999, ref: 0 };

  const flMatch = s.match(/^FL\s*(\d+)/);
  if (flMatch) return { ft: parseInt(flMatch[1]) * 100, ref: 1 };

  const ftMatch = s.match(/(\d+)\s*(?:FT|')/);
  if (ftMatch) {
    const ft = parseInt(ftMatch[1]);
    const ref = s.includes("AMSL") || s.includes("MSL") ? 1 : s.includes("AGL") || s.includes("ASFC") ? 0 : 1;
    return { ft, ref };
  }

  const numMatch = s.match(/^(\d+)/);
  if (numMatch) return { ft: parseInt(numMatch[1]), ref: 1 };

  return { ft: 0, ref: 0 };
}

function destinationPointRad(latRad: number, lonRad: number, bearingRad: number, distNm: number): [number, number] {
  const R = 3440.065;
  const d = distNm / R;
  const lat2 = Math.asin(Math.sin(latRad) * Math.cos(d) + Math.cos(latRad) * Math.sin(d) * Math.cos(bearingRad));
  const lon2 = lonRad + Math.atan2(Math.sin(bearingRad) * Math.sin(d) * Math.cos(latRad), Math.cos(d) - Math.sin(latRad) * Math.sin(lat2));
  return [lat2, lon2];
}

function parseCoord(s: string): [number, number] | null {
  const m = s.trim().match(/(\d+):(\d+):(\d+(?:\.\d+)?)\s*([NS])\s+(\d+):(\d+):(\d+(?:\.\d+)?)\s*([EW])/);
  if (!m) return null;
  let lat = parseInt(m[1]) + parseInt(m[2]) / 60 + parseFloat(m[3]) / 3600;
  if (m[4] === "S") lat = -lat;
  let lon = parseInt(m[5]) + parseInt(m[6]) / 60 + parseFloat(m[7]) / 3600;
  if (m[8] === "W") lon = -lon;
  return [lon, lat];
}

function generateCircle(centerLon: number, centerLat: number, radiusNm: number, numPoints = 72): [number, number][] {
  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;
  const latRad = toRad(centerLat);
  const lonRad = toRad(centerLon);
  const points: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const bearing = toRad((360 / numPoints) * i);
    const [lat2, lon2] = destinationPointRad(latRad, lonRad, bearing, radiusNm);
    points.push([toDeg(lon2), toDeg(lat2)]);
  }
  return points;
}

function generateArc(
  centerLon: number, centerLat: number,
  startLon: number, startLat: number,
  endLon: number, endLat: number,
  clockwise: boolean
): [number, number][] {
  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;

  const cLatR = toRad(centerLat);
  const cLonR = toRad(centerLon);

  const startBearing = Math.atan2(
    Math.sin(toRad(startLon) - cLonR) * Math.cos(toRad(startLat)),
    Math.cos(cLatR) * Math.sin(toRad(startLat)) - Math.sin(cLatR) * Math.cos(toRad(startLat)) * Math.cos(toRad(startLon) - cLonR)
  );
  const endBearing = Math.atan2(
    Math.sin(toRad(endLon) - cLonR) * Math.cos(toRad(endLat)),
    Math.cos(cLatR) * Math.sin(toRad(endLat)) - Math.sin(cLatR) * Math.cos(toRad(endLat)) * Math.cos(toRad(endLon) - cLonR)
  );

  const dLat = toRad(startLat) - cLatR;
  const dLon = toRad(startLon) - cLonR;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(cLatR) * Math.cos(toRad(startLat)) * Math.sin(dLon / 2) ** 2;
  const radiusNm = 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  let startDeg = toDeg(startBearing);
  let endDeg = toDeg(endBearing);
  if (startDeg < 0) startDeg += 360;
  if (endDeg < 0) endDeg += 360;

  let sweep: number;
  if (clockwise) {
    sweep = endDeg - startDeg;
    if (sweep <= 0) sweep += 360;
  } else {
    sweep = startDeg - endDeg;
    if (sweep <= 0) sweep += 360;
    sweep = -sweep;
  }

  const steps = Math.max(Math.abs(Math.round(sweep / 5)), 4);
  const stepSize = sweep / steps;
  const points: [number, number][] = [];

  for (let i = 0; i <= steps; i++) {
    const bearing = toRad(startDeg + stepSize * i);
    const [lat2, lon2] = destinationPointRad(cLatR, cLonR, bearing, radiusNm);
    points.push([toDeg(lon2), toDeg(lat2)]);
  }

  return points;
}

function parseOpenAirToGeoJSON(text: string): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const lines = text.split(/\r?\n/);

  let currentClass = "";
  let currentName = "";
  let lowerAlt = { ft: 0, ref: 0 };
  let upperAlt = { ft: 0, ref: 0 };
  let coords: [number, number][] = [];
  let centerX: [number, number] | null = null;
  let direction = true;

  function commitAirspace() {
    if (coords.length < 3) {
      coords = [];
      return;
    }

    if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) {
      coords.push([...coords[0]]);
    }

    const typeName = OPENAIR_TYPE_MAP[currentClass] || "OTHER";
    const icaoClass = ["A", "B", "C", "D", "E", "F", "G"].includes(currentClass) ? currentClass : "UNCLASSIFIED";
    const isCert = currentName.includes("CERT");
    const isUncr = currentName.includes("UNCR");

    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [coords] },
      properties: {
        name: currentName || "Unknown",
        typeName,
        icaoClass,
        lowerFt: lowerAlt.ft,
        upperFt: Math.min(upperAlt.ft, 10000),
        lowerRef: lowerAlt.ref,
        upperRef: upperAlt.ref,
        isCertified: isCert,
        isUncertified: isUncr,
      },
    });

    coords = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("*")) continue;

    if (line.startsWith("AC ")) {
      if (coords.length > 0 || currentName) commitAirspace();
      currentClass = line.substring(3).trim();
      currentName = "";
      lowerAlt = { ft: 0, ref: 0 };
      upperAlt = { ft: 0, ref: 0 };
      coords = [];
      centerX = null;
      direction = true;
      continue;
    }

    if (line.startsWith("AN ")) {
      currentName = line.substring(3).trim();
      continue;
    }

    if (line.startsWith("AL ")) {
      lowerAlt = parseAltitude(line.substring(3));
      continue;
    }

    if (line.startsWith("AH ")) {
      upperAlt = parseAltitude(line.substring(3));
      continue;
    }

    if (line.startsWith("V ")) {
      const vContent = line.substring(2).trim();
      if (vContent.startsWith("X=")) {
        const coordStr = vContent.substring(2).trim();
        centerX = parseCoord(coordStr);
      } else if (vContent.startsWith("D=")) {
        direction = vContent.includes("+");
      }
      continue;
    }

    if (line.startsWith("DP ")) {
      const coord = parseCoord(line.substring(3));
      if (coord) coords.push(coord);
      continue;
    }

    if (line.startsWith("DC ")) {
      const radius = parseFloat(line.substring(3).trim());
      if (centerX && !isNaN(radius)) {
        coords = generateCircle(centerX[0], centerX[1], radius);
      }
      continue;
    }

    if (line.startsWith("DB ")) {
      const parts = line.substring(3).split(",");
      if (parts.length === 2 && centerX) {
        const start = parseCoord(parts[0].trim());
        const end = parseCoord(parts[1].trim());
        if (start && end) {
          const arcPts = generateArc(centerX[0], centerX[1], start[0], start[1], end[0], end[1], direction);
          coords.push(...arcPts);
        }
      }
      continue;
    }
  }

  commitAirspace();

  const filtered = features.filter((f) => {
    const props = f.properties as AirspaceProperties | null;
    const lower = props?.lowerFt ?? 0;
    return lower <= 10000;
  });

  return { type: "FeatureCollection", features: filtered };
}

async function downloadFile(url: string, filePath: string): Promise<string> {
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(30000),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} from ${url}`);
  const text = await resp.text();
  ensureDataDir();
  fs.writeFileSync(filePath, text, "utf-8");
  return text;
}

export async function downloadAndParseZones(): Promise<GeoJSON.FeatureCollection> {
  log.info("Downloading Siteguide XCTrack JSON zones...");
  const text = await downloadFile(XCTRACK_JSON_URL, XCTRACK_FILE);
  const raw = JSON.parse(text) as XCTrackZone[] | XCTrackResponse;
  const zones: XCTrackZone[] = Array.isArray(raw)
    ? raw
    : (raw as XCTrackResponse).airspaces || (raw as XCTrackResponse).zones || (raw as XCTrackResponse).data || [];
  const geojson = xcTrackJsonToGeoJSON(zones);
  zoneCache = { data: geojson, fetchedAt: Date.now() };
  log.info(`Parsed ${geojson.features.length} zone features from XCTrack JSON`);
  return geojson;
}

export async function downloadAndParseAirspace(): Promise<GeoJSON.FeatureCollection> {
  log.info("Downloading Siteguide OpenAir airspace...");
  const text = await downloadFile(OPENAIR_URL, OPENAIR_FILE);
  const geojson = parseOpenAirToGeoJSON(text);
  airspaceCache = { data: geojson, fetchedAt: Date.now() };
  log.info(`Parsed ${geojson.features.length} airspace features from OpenAir`);
  return geojson;
}

export async function downloadAllZoneData(): Promise<{ zones: number; airspace: number }> {
  const [zones, airspace] = await Promise.all([
    downloadAndParseZones(),
    downloadAndParseAirspace(),
  ]);
  return { zones: zones.features.length, airspace: airspace.features.length };
}

export function getZoneData(): GeoJSON.FeatureCollection | null {
  if (zoneCache && (Date.now() - zoneCache.fetchedAt) < CACHE_TTL) {
    return zoneCache.data;
  }

  if (fs.existsSync(XCTRACK_FILE)) {
    try {
      const text = fs.readFileSync(XCTRACK_FILE, "utf-8");
      const raw = JSON.parse(text) as XCTrackZone[] | XCTrackResponse;
      const zones: XCTrackZone[] = Array.isArray(raw)
        ? raw
        : (raw as XCTrackResponse).airspaces || (raw as XCTrackResponse).zones || (raw as XCTrackResponse).data || [];
      const geojson = xcTrackJsonToGeoJSON(zones);
      zoneCache = { data: geojson, fetchedAt: Date.now() };
      return geojson;
    } catch (e: unknown) {
      log.error(`Failed to load cached zone data: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return null;
}

export function getAirspaceData(): GeoJSON.FeatureCollection | null {
  if (airspaceCache && (Date.now() - airspaceCache.fetchedAt) < CACHE_TTL) {
    return airspaceCache.data;
  }

  if (fs.existsSync(OPENAIR_FILE)) {
    try {
      const text = fs.readFileSync(OPENAIR_FILE, "utf-8");
      const geojson = parseOpenAirToGeoJSON(text);
      airspaceCache = { data: geojson, fetchedAt: Date.now() };
      return geojson;
    } catch (e: unknown) {
      log.error(`Failed to load cached airspace data: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return null;
}

export function invalidateCache() {
  zoneCache = null;
  airspaceCache = null;
}

export async function getZoneDataVersion(): string | null {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'zoneDataVersion'").get() as { value: string } | undefined;
  return row?.value ?? null;
}

export async function setZoneDataVersion(version: string) {
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('zoneDataVersion', ?)").run(version);
}
