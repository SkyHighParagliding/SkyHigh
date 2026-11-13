/**
 * Live stations overlay: the contract shared by server and client.
 * Plan: wiki/future/station-overlay-plan.md. Speeds are always knots here; the
 * client converts with the map's kt/mph/kph setting.
 */

/** Where a station's reading came from. */
export type StationSource = 'bom' | 'site' | 'adhoc';

/** One station as returned by GET /api/weather/stations/live. */
export interface LiveStation {
  /** Stable id. BOM: `bom-IDV60801-94860`. Our site stations: their station id
   *  (e.g. `livewind-94860`, `IFLINDER3`). Adhoc (later): `ww-<STN>`. */
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Station height, metres AMSL, when known. */
  elevation?: number;
  source: StationSource;
  speedKt: number;
  /** Null when the station reports no gust. */
  gustKt: number | null;
  /** Direction the wind comes FROM, degrees true. Null when calm or unknown. */
  dirDeg: number | null;
  tempC?: number;
  /** QNH (or station pressure if that's all there is), hPa. */
  pressureHpa?: number;
  humidityPct?: number;
  /** ISO time of the reading. */
  obsTime: string;
  /** True when the reading is older than STALE_AFTER_MIN. */
  stale: boolean;
  /** Our site stations only: ISO time the reading stopped changing, set when
   *  speed, gust and direction have been identical (wind > 0) for at least
   *  UNCHANGED_SUSPECT_MIN over UNCHANGED_MIN_READINGS saved readings. Catches
   *  feeds with no per-station time (LiveWind) that keep reposting a dead
   *  station's last reading. Shown as "possibly stuck", not dropped. */
  unchangedSince?: string;
  /** Attribution text shown in the card, e.g. "Bureau of Meteorology". */
  attribution: string;
  /** For our site stations: the flying site it serves. */
  siteName?: string;
}

/** GET /api/weather/stations/live response. */
export interface LiveStationsResponse {
  stations: LiveStation[];
  /** ISO time the server last finished a refresh. */
  updatedAt: string | null;
}

/** One point in GET /api/weather/stations/history?id=…&hours=6 (oldest first). */
export interface StationHistoryPoint {
  t: string;
  speedKt: number;
  gustKt: number | null;
  dirDeg: number | null;
}

export interface StationHistoryResponse {
  id: string;
  points: StationHistoryPoint[];
}

export const STALE_AFTER_MIN = 90;
/** Prod, 48 h to 13 Nov 2026: healthy LiveWind stations repeated a reading for
 *  at most ~45 min (one 60); stuck ones held for 85–99 min. */
export const UNCHANGED_SUSPECT_MIN = 75;
export const UNCHANGED_MIN_READINGS = 4;

const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** "NNW" → 337.5. Calm / unknown / "CALM" / "N/A" → null. Numbers pass through. */
export function compassToDeg(dir: string | number | null | undefined): number | null {
  if (typeof dir === 'number') return Number.isFinite(dir) ? ((dir % 360) + 360) % 360 : null;
  if (!dir) return null;
  const i = COMPASS_16.indexOf(dir.trim().toUpperCase());
  return i < 0 ? null : i * 22.5;
}
