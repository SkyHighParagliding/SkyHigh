import { query } from "../pg.js";
import { STATION_POSITION_OVERRIDES } from "../weather-utils.js";
import {
  compassToDeg, STALE_AFTER_MIN, UNCHANGED_MIN_READINGS, UNCHANGED_SUSPECT_MIN,
  type LiveStation, type StationHistoryPoint,
} from "../../shared/stations.js";

export interface RawReading { t: number; speed: unknown; gust: unknown; dir: unknown }

/**
 * Start time (ms) of the current run of identical readings, when that run looks
 * stuck: wind > 0, at least UNCHANGED_MIN_READINGS readings spanning at least
 * UNCHANGED_SUSPECT_MIN. `rows` newest first. Otherwise null.
 */
export function unchangedSince(rows: RawReading[]): number | null {
  if (!rows.length) return null;
  const key = (r: RawReading) => `${r.speed == null ? "" : Number(r.speed)}|${r.gust == null ? "" : Number(r.gust)}|${r.dir ?? ""}`;
  const head = rows[0];
  if (head.speed == null || !(Number(head.speed) > 0)) return null;
  const k = key(head);
  let n = 0;
  let start = head.t;
  for (const r of rows) {
    if (key(r) !== k) break;
    n++;
    start = r.t;
  }
  return n >= UNCHANGED_MIN_READINGS && head.t - start >= UNCHANGED_SUSPECT_MIN * 60_000 ? start : null;
}

/** A site station within this distance of a BOM station is dropped (BOM's own feed covers it). */
export const NEAR_BOM_KM = 0.5;
const MAX_OBS_AGE_MS = 6 * 3600_000;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

/** Attribution text from the station id prefix (see NON_WU_STATION_PREFIXES). */
export function siteAttribution(stationId: string): string {
  if (stationId.startsWith("livewind-")) return "LiveWind";
  if (stationId.startsWith("freeflightwx-")) return "FreeFlightWx";
  if (stationId.startsWith("davis-")) return "Davis WeatherLink";
  if (stationId.startsWith("wdl-") || stationId.startsWith("wport-")) return "Weather Display Live";
  return "Weather Underground";
}

/** Keep a site station only if it isn't a BOM id, isn't LiveWind's copy of a BOM station
 *  (`livewind-<WMO>`), and isn't within NEAR_BOM_KM of a BOM station. */
export function keepSiteStation(
  s: { id: string; lat: number; lon: number },
  bom: { lat: number; lon: number; stationNum?: string }[],
): boolean {
  if (s.id.startsWith("bom-")) return false;
  const lw = s.id.match(/^livewind-(\d+)$/);
  if (lw && bom.some(b => b.stationNum === lw[1])) return false;
  return !bom.some(b => haversineKm(s.lat, s.lon, b.lat, b.lon) < NEAR_BOM_KM);
}

export interface SiteStationInternal {
  station: LiveStation;
  /** Real site id and observation stationName, for weather_history lookups. */
  siteId: string;
  stationName: string;
}

interface SiteRow { id: string; name: string | null; lat: number | null; lon: number | null; liveStationId: string | null; liveStationIdAlt: string | null }
interface ObsRow { siteId: string; windSpeed: number | null; windGust: number | null; direction: string | null; stationName: string | null; stationLat: number | null; stationLon: number | null; timestamp: string | Date }

let cache: { at: number; key: number; list: SiteStationInternal[] } | null = null;

/** Our own live-enabled site stations with a fresh (<6 h) observation. Cached 2 min. */
export async function loadSiteStations(bom: { lat: number; lon: number; stationNum?: string }[]): Promise<SiteStationInternal[]> {
  if (cache && cache.key === bom.length && Date.now() - cache.at < 120_000) return cache.list;
  const sites = await query<SiteRow>(
    `SELECT id, name, lat, lon, "liveStationId", "liveStationIdAlt" FROM sites WHERE "useLiveWeather" = 'true' AND "liveStationId" IS NOT NULL`,
  );
  const obs = await query<ObsRow>(
    `SELECT "siteId", "windSpeed", "windGust", direction, "stationName", "stationLat", "stationLon", timestamp FROM weather_observations WHERE timestamp > NOW() - INTERVAL '6 hours'`,
  );
  const obsByKey = new Map(obs.map(o => [o.siteId, o]));
  // Saved readings (newest first) per real site id + station name, for the
  // "unchanged" check. History is keyed by the real site id even for alt stations.
  const hist = await query<{ siteId: string; stationName: string; timestamp: string | Date; windSpeed: unknown; windGust: unknown; direction: unknown }>(
    `SELECT "siteId", "stationName", timestamp, "windSpeed", "windGust", direction FROM weather_history
     WHERE timestamp > NOW() - INTERVAL '6 hours' ORDER BY timestamp DESC`,
  );
  const histByKey = new Map<string, RawReading[]>();
  for (const h of hist) {
    const k = `${h.siteId}\u0000${h.stationName}`;
    let list = histByKey.get(k);
    if (!list) histByKey.set(k, (list = []));
    list.push({ t: new Date(h.timestamp).getTime(), speed: h.windSpeed, gust: h.windGust, dir: h.direction });
  }
  const out = new Map<string, SiteStationInternal>();
  for (const s of sites) {
    const pairs: [string | null, string][] = [[s.liveStationId, s.id], [s.liveStationIdAlt, `${s.id}:alt`]];
    for (const [stationId, obsKey] of pairs) {
      if (!stationId || out.has(stationId)) continue;
      const o = obsByKey.get(obsKey);
      if (!o || o.windSpeed == null) continue;
      const ts = new Date(o.timestamp).getTime();
      if (!Number.isFinite(ts) || Date.now() - ts > MAX_OBS_AGE_MS) continue;
      const fixed = STATION_POSITION_OVERRIDES[stationId];
      const lat = fixed?.lat ?? (Number(o.stationLat) || Number(s.lat));
      const lon = fixed?.lon ?? (Number(o.stationLon) || Number(s.lon));
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) continue;
      if (!keepSiteStation({ id: stationId, lat, lon }, bom)) continue;
      const speed = Number(o.windSpeed);
      // The current observation goes first: it can be newer than the last saved
      // history row (history is saved at most every 2 min).
      const since = unchangedSince([
        { t: ts, speed: o.windSpeed, gust: o.windGust, dir: o.direction },
        ...(histByKey.get(`${s.id}\u0000${o.stationName ?? ""}`) ?? []).filter(r => r.t < ts), // same time = the same saved reading
      ]);
      out.set(stationId, {
        siteId: s.id,
        stationName: o.stationName ?? "",
        station: {
          id: stationId,
          name: o.stationName || s.name || stationId,
          lat,
          lon,
          source: "site",
          speedKt: speed,
          gustKt: o.windGust == null ? null : Number(o.windGust),
          dirDeg: speed === 0 ? null : compassToDeg(o.direction),
          obsTime: new Date(ts).toISOString(),
          stale: Date.now() - ts > STALE_AFTER_MIN * 60_000,
          ...(since != null ? { unchangedSince: new Date(since).toISOString() } : {}),
          attribution: siteAttribution(stationId),
          siteName: s.name ?? undefined,
        },
      });
    }
  }
  const list = [...out.values()];
  cache = { at: Date.now(), key: bom.length, list };
  return list;
}

export async function siteStationHistory(s: SiteStationInternal, hours: number): Promise<StationHistoryPoint[]> {
  const rows = await query<{ timestamp: string | Date; windSpeed: number | null; windGust: number | null; direction: string | null }>(
    `SELECT timestamp, "windSpeed", "windGust", direction FROM weather_history
     WHERE "siteId" = $1 AND ("stationName" = $2 OR "stationName" = '') AND timestamp >= NOW() - ($3 * INTERVAL '1 hour')
     ORDER BY timestamp ASC`,
    [s.siteId, s.stationName, hours],
  );
  const seen = new Set<string>();
  const pts: StationHistoryPoint[] = [];
  for (const r of rows) {
    if (r.windSpeed == null) continue;
    const t = new Date(r.timestamp).toISOString();
    if (seen.has(t)) continue;
    seen.add(t);
    const speed = Number(r.windSpeed);
    pts.push({ t, speedKt: speed, gustKt: r.windGust == null ? null : Number(r.windGust), dirDeg: speed === 0 ? null : compassToDeg(r.direction) });
  }
  return pts;
}
