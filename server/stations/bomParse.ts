import { compassToDeg, type StationHistoryPoint } from "../../shared/stations.js";
import { parseBomTimestamp } from "../bomWeather.js";

export interface BomReading {
  /** ISO time of the reading. */
  t: string;
  speedKt: number;
  gustKt: number | null;
  dirDeg: number | null;
  tempC?: number;
  pressureHpa?: number;
  humidityPct?: number;
}

export interface BomParsed {
  name: string | null;
  lat: number | null;
  lon: number | null;
  latest: BomReading;
  /** Readings within `historyHours` of the newest one, oldest first. */
  history: StationHistoryPoint[];
}

const num = (v: unknown): number | null =>
  v === null || v === undefined || v === "" || v === "-" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

function toReading(row: any): BomReading | null {
  const speed = num(row?.wind_spd_kt);
  if (speed === null || !row?.local_date_time_full) return null;
  let t: string;
  try {
    t = parseBomTimestamp(String(row.local_date_time_full));
  } catch {
    return null;
  }
  if (Number.isNaN(Date.parse(t))) return null;
  const r: BomReading = {
    t,
    speedKt: speed,
    gustKt: num(row.gust_kt),
    // CALM, "-" and anything unrecognised -> null
    dirDeg: speed === 0 ? null : compassToDeg(row.wind_dir),
  };
  const temp = num(row.air_temp);
  if (temp !== null) r.tempC = temp;
  const p = num(row.press_qnh) ?? num(row.press_msl) ?? num(row.press);
  if (p !== null) r.pressureHpa = p;
  const h = num(row.rel_hum);
  if (h !== null) r.humidityPct = h;
  return r;
}

/** Parse one BOM per-station JSON document. Returns null when it has no usable reading. */
export function parseBomStation(json: any, historyHours = 6): BomParsed | null {
  const rows: any[] = json?.observations?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const readings = rows.map(toReading).filter((r): r is BomReading => r !== null);
  if (readings.length === 0) return null;
  readings.sort((a, b) => Date.parse(b.t) - Date.parse(a.t)); // newest first
  const latest = readings[0];
  const cutoff = Date.parse(latest.t) - historyHours * 3600_000;
  const seen = new Set<string>();
  const history: StationHistoryPoint[] = [];
  for (const r of readings) {
    if (Date.parse(r.t) < cutoff || seen.has(r.t)) continue;
    seen.add(r.t);
    history.push({ t: r.t, speedKt: r.speedKt, gustKt: r.gustKt, dirDeg: r.dirDeg });
  }
  history.reverse();
  const first = rows[0]; // lat/lon here are rounded to 1 dp; callers prefer the static list
  return {
    name: json?.observations?.header?.[0]?.name ?? first?.name ?? null,
    lat: num(first?.lat),
    lon: num(first?.lon),
    latest,
    history,
  };
}
