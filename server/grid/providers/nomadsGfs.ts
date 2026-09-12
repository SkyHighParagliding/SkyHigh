/**
 * NOAA NOMADS GFS 0.25° grid provider — tier 4 (last resort).
 *
 * Fetches GRIB2 data from the NOMADS server-side filter, decoding it with the
 * project's zero-dependency GRIB2 decoder.  The NOMADS bbox subsetting is
 * essential: a single subsetted request for 4 variables over SE Australia is
 * ~14 KB versus ~874 KB unsubsetted.
 *
 * This tier exists solely to ensure the grid is never empty.  The 28 km
 * resolution is a genuine quality step down from the ECMWF 9 km tiers.
 *
 * NOMADS filter reference:
 *   https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl
 */

import createLogger from "../../utils/logger.js";
import { decodeGrib2, valueAt } from "../grib2.js";
import type { Grib2Field } from "../grib2.js";
import type { GridProvider } from "./provider.js";
import type {
  GridRequest,
  LatLon,
  PointSeries,
  ProviderResult,
  Variable,
} from "../types.js";
import { uvToSpeedDir } from "../types.js";

// ---------------------------------------------------------------------------
// Unit conversion constants
// ---------------------------------------------------------------------------

/** m/s → knots */
const MS_TO_KNOTS = 1.943844;

/** Kelvin → °Celsius offset */
const KELVIN_TO_CELSIUS = -273.15;

// ---------------------------------------------------------------------------
// GRIB2 parameter identities (discipline:category:number)
// Verified against live NOMADS data 2026-09-11.
// ---------------------------------------------------------------------------

const PARAM = {
  UGRD: { d: 0, c: 2, n: 2 },   // Wind u-component, 10 m above ground
  VGRD: { d: 0, c: 2, n: 3 },   // Wind v-component, 10 m above ground
  GUST: { d: 0, c: 2, n: 22 },  // Wind speed (gust), surface
  TMP:  { d: 0, c: 0, n: 0 },   // Temperature, 2 m above ground
  DPT:  { d: 0, c: 0, n: 6 },   // Dew point temperature, 2 m above ground
  CAPE: { d: 0, c: 7, n: 6 },   // CAPE, surface
  HPBL: { d: 0, c: 3, n: 196 }, // Boundary layer height, surface
  TCDC: { d: 0, c: 6, n: 1 },   // Total cloud cover, entire atmosphere
} as const;

function matchesParam(
  f: Grib2Field,
  p: { d: number; c: number; n: number },
): boolean {
  return (
    f.discipline === p.d &&
    f.parameterCategory === p.c &&
    f.parameterNumber === p.n
  );
}

// ---------------------------------------------------------------------------
// Supported variables
// ---------------------------------------------------------------------------

/** Variables this provider can supply, mapped to the filter params needed. */
const SUPPORTED_VARIABLES = new Set<Variable>([
  "wind_speed_10m",
  "wind_direction_10m",
  "wind_gusts_10m",
  "temperature_2m",
  "dew_point_2m",
  "cape",
  "boundary_layer_height",
  "cloud_cover",
]);

// ---------------------------------------------------------------------------
// NOMADS URL builder
// ---------------------------------------------------------------------------

const NOMADS_BASE = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl";

/** GFS cycle hours, newest first. */
const GFS_CYCLES = [18, 12, 6, 0] as const;

/** Publication lag: NOAA typically posts a cycle ~4–5 h after its reference time. */
const PUB_LAG_HOURS = 5;

interface Bbox {
  north: number;
  south: number;
  east: number;
  west: number;
}

function buildUrl(
  dateStr: string,
  cycleHour: number,
  forecastHour: number,
  bbox: Bbox,
  variables: Set<Variable>,
): string {
  const cycle = String(cycleHour).padStart(2, "0");
  const fh = String(forecastHour).padStart(3, "0");
  const file = `gfs.t${cycle}z.pgrb2.0p25.f${fh}`;
  const dir = `%2Fgfs.${dateStr}%2F${cycle}%2Fatmos`;

  const params = new URLSearchParams({
    file,
    subregion: "",
    leftlon:   String(bbox.west),
    rightlon:  String(bbox.east),
    toplat:    String(bbox.north),
    bottomlat: String(bbox.south),
    dir,
  });

  // Level switches — only those needed by the requested variable set.
  // Requesting only the levels we need avoids ambiguous duplicate parameter
  // codes (e.g. TMP exists at both surface and 2 m; requesting lev_surface=on
  // alongside lev_2_m_above_ground=on would return two TMP fields with the
  // same discipline:category:number).
  const needsWindComponents =
    variables.has("wind_speed_10m") || variables.has("wind_direction_10m");
  const needsSurface =
    variables.has("wind_gusts_10m") ||
    variables.has("cape") ||
    variables.has("boundary_layer_height");
  const needs2m =
    variables.has("temperature_2m") || variables.has("dew_point_2m");
  const needsEntireAtmos = variables.has("cloud_cover");

  if (needsWindComponents) params.set("lev_10_m_above_ground", "on");
  if (needsSurface)        params.set("lev_surface", "on");
  if (needs2m)             params.set("lev_2_m_above_ground", "on");
  if (needsEntireAtmos)    params.set("lev_entire_atmosphere", "on");

  // Variable switches
  if (needsWindComponents)                     params.set("var_UGRD", "on");
  if (needsWindComponents)                     params.set("var_VGRD", "on");
  if (variables.has("wind_gusts_10m"))         params.set("var_GUST", "on");
  if (variables.has("temperature_2m"))         params.set("var_TMP", "on");
  if (variables.has("dew_point_2m"))           params.set("var_DPT", "on");
  if (variables.has("cape"))                   params.set("var_CAPE", "on");
  if (variables.has("boundary_layer_height"))  params.set("var_HPBL", "on");
  if (variables.has("cloud_cover"))            params.set("var_TCDC", "on");

  return `${NOMADS_BASE}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Cycle resolution
// ---------------------------------------------------------------------------

/**
 * Returns {dateStr, cycleHour} for the most-recently-published GFS cycle.
 * Accounts for the ~5-hour publication lag: if it's 08:00 UTC, the 06Z cycle
 * won't be available yet, so we fall back to 00Z.
 */
function latestCycle(): { dateStr: string; cycleHour: number } {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMinute = now.getUTCMinutes();
  const fractionalHour = utcHour + utcMinute / 60;

  // Walk back through cycle hours to find the most recent published one
  for (const cycle of GFS_CYCLES) {
    if (fractionalHour >= cycle + PUB_LAG_HOURS) {
      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, "0");
      const d = String(now.getUTCDate()).padStart(2, "0");
      return { dateStr: `${y}${m}${d}`, cycleHour: cycle };
    }
  }

  // All today's cycles are still in the publication lag window — use yesterday's 18Z
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const y = yesterday.getUTCFullYear();
  const m = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
  const d = String(yesterday.getUTCDate()).padStart(2, "0");
  return { dateStr: `${y}${m}${d}`, cycleHour: 18 };
}

/** Steps back one cycle (wraps over midnight). */
function previousCycle(
  dateStr: string,
  cycleHour: number,
): { dateStr: string; cycleHour: number } {
  const prev = GFS_CYCLES[GFS_CYCLES.indexOf(cycleHour as typeof GFS_CYCLES[number]) + 1];
  if (prev !== undefined) return { dateStr, cycleHour: prev };

  // Wrap to previous day, cycle 18Z
  const d = new Date(
    parseInt(dateStr.slice(0, 4)),
    parseInt(dateStr.slice(4, 6)) - 1,
    parseInt(dateStr.slice(6, 8)),
  );
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return { dateStr: `${y}${mo}${da}`, cycleHour: 18 };
}

// ---------------------------------------------------------------------------
// Bbox computation
// ---------------------------------------------------------------------------

const GRID_MARGIN_DEG = 0.5; // ≥ 2 grid cells at 0.25°

function computeBbox(points: LatLon[]): Bbox {
  let minLat = points[0].lat,
    maxLat = points[0].lat,
    minLon = points[0].lon,
    maxLon = points[0].lon;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  return {
    north: Math.min(90, +(maxLat + GRID_MARGIN_DEG).toFixed(2)),
    south: Math.max(-90, +(minLat - GRID_MARGIN_DEG).toFixed(2)),
    east:  Math.min(360, +(maxLon + GRID_MARGIN_DEG).toFixed(2)),
    west:  Math.max(-180, +(minLon - GRID_MARGIN_DEG).toFixed(2)),
  };
}

// ---------------------------------------------------------------------------
// Melbourne local time formatting
// ---------------------------------------------------------------------------

// GRIB reference times are UTC. The persisted format is Melbourne-local
// YYYY-MM-DDTHH:mm. We use Intl.DateTimeFormat to handle DST correctly —
// Melbourne is UTC+10 in standard time (AEST) and UTC+11 during DST (AEDT).
const MELBOURNE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Melbourne",
  year:     "numeric",
  month:    "2-digit",
  day:      "2-digit",
  hour:     "2-digit",
  minute:   "2-digit",
  hour12:   false,
});

function toMelbourneLocal(utcDate: Date): string {
  // en-CA locale produces "YYYY-MM-DD, HH:mm" which we reshape to the
  // canonical "YYYY-MM-DDTHH:mm" format.
  const parts = MELBOURNE_FORMATTER.formatToParts(utcDate);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

function makeSemaphore(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  return async function <T>(fn: () => Promise<T>): Promise<T> {
    if (running >= limit) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      const next = queue.shift();
      if (next) next();
    }
  };
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

const log = createLogger("grid:nomads-gfs");

export const nomadsGfsProvider: GridProvider = {
  id:            "nomads-gfs",
  tier:          4,
  modelFamily:   "gfs",
  label:         "NOAA GFS 0.25° (NOMADS)",
  resolutionDeg: 0.25,

  supports(variable: Variable): boolean {
    return SUPPORTED_VARIABLES.has(variable);
  },

  async available(): Promise<boolean> {
    // A HEAD request against a known-recent file is cheap and doesn't pull data.
    const { dateStr, cycleHour } = latestCycle();
    const cycle = String(cycleHour).padStart(2, "0");
    // We probe for f000 (always present once a cycle is published).
    const url =
      `${NOMADS_BASE}?file=gfs.t${cycle}z.pgrb2.0p25.f000` +
      `&lev_surface=on&var_PRES=on` +
      `&subregion=&leftlon=144&rightlon=145&toplat=-37&bottomlat=-38` +
      `&dir=%2Fgfs.${dateStr}%2F${cycle}%2Fatmos`;
    try {
      const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(8000) });
      return res.ok;
    } catch {
      return false;
    }
  },

  async fetch(req: GridRequest): Promise<ProviderResult> {
    const requestedVars = new Set(
      req.variables.filter((v) => SUPPORTED_VARIABLES.has(v)),
    ) as Set<Variable>;

    if (requestedVars.size === 0) {
      return { source: "nomads-gfs", points: [] };
    }

    const bbox = computeBbox(req.points);
    const totalHours = req.forecastDays * 24;
    // GFS provides 1-hourly steps for hours 0–120, then 3-hourly.
    // We request hourly for the first 120 h and 3-hourly beyond that.
    const forecastHours: number[] = [];
    for (let h = 0; h <= Math.min(totalHours, 120); h++) {
      forecastHours.push(h);
    }
    for (let h = 123; h <= totalHours; h += 3) {
      forecastHours.push(h);
    }

    // Resolve the most recent available cycle, retrying up to 3 cycles back.
    let { dateStr, cycleHour } = latestCycle();
    let cycleResolved = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      const probeHour = forecastHours[Math.min(1, forecastHours.length - 1)];
      const probeUrl = buildUrl(dateStr, cycleHour, probeHour, bbox, requestedVars);
      try {
        const res = await fetch(probeUrl, {
          method: "HEAD",
          signal: req.signal ?? AbortSignal.timeout(8000),
        });
        if (res.ok) {
          cycleResolved = true;
          break;
        }
        log.warn("cycle not yet available, stepping back", { dateStr, cycleHour, status: res.status });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") throw err;
        log.warn("cycle probe failed, stepping back", { dateStr, cycleHour, error: String(err) });
      }
      ({ dateStr, cycleHour } = previousCycle(dateStr, cycleHour));
    }

    if (!cycleResolved) {
      throw new Error("nomads-gfs: could not resolve a published GFS cycle after 3 attempts");
    }

    log.info("fetching GFS cycle", {
      dateStr,
      cycleHour,
      forecastHours: forecastHours.length,
      bbox,
      variables: [...requestedVars],
    });

    // Download forecast hours with bounded concurrency.
    const sem = makeSemaphore(4);

    // Keyed by forecast hour; each entry maps variable → decoded field.
    const decoded = new Map<number, Map<Variable, Grib2Field>>();

    await Promise.all(
      forecastHours.map((fh) =>
        sem(async () => {
          if (req.signal?.aborted) return;

          const url = buildUrl(dateStr, cycleHour, fh, bbox, requestedVars);
          let buf: Uint8Array;
          try {
            const res = await fetch(url, { signal: req.signal });
            if (!res.ok) {
              log.warn("GRIB fetch failed", { fh, status: res.status });
              return;
            }
            buf = new Uint8Array(await res.arrayBuffer());
          } catch (err) {
            if ((err as Error)?.name === "AbortError") throw err;
            log.warn("GRIB fetch error", { fh, error: String(err) });
            return;
          }

          let fields: Grib2Field[];
          try {
            fields = decodeGrib2(buf);
          } catch (err) {
            log.warn("GRIB decode error", { fh, error: String(err) });
            return;
          }

          const byVar = new Map<Variable, Grib2Field>();

          for (const field of fields) {
            // TCDC: lev_entire_atmosphere may include an analysis field (fh=0)
            // alongside the forecast field. Keep only the one whose forecastTime
            // matches the requested hour.
            if (field.forecastTime !== fh) continue;

            if (requestedVars.has("wind_speed_10m") || requestedVars.has("wind_direction_10m")) {
              if (matchesParam(field, PARAM.UGRD)) byVar.set("wind_speed_10m", field);
              if (matchesParam(field, PARAM.VGRD)) byVar.set("wind_direction_10m", field);
            }
            if (requestedVars.has("wind_gusts_10m") && matchesParam(field, PARAM.GUST)) {
              byVar.set("wind_gusts_10m", field);
            }
            if (requestedVars.has("temperature_2m") && matchesParam(field, PARAM.TMP)) {
              byVar.set("temperature_2m", field);
            }
            if (requestedVars.has("dew_point_2m") && matchesParam(field, PARAM.DPT)) {
              byVar.set("dew_point_2m", field);
            }
            if (requestedVars.has("cape") && matchesParam(field, PARAM.CAPE)) {
              byVar.set("cape", field);
            }
            if (requestedVars.has("boundary_layer_height") && matchesParam(field, PARAM.HPBL)) {
              byVar.set("boundary_layer_height", field);
            }
            if (requestedVars.has("cloud_cover") && matchesParam(field, PARAM.TCDC)) {
              byVar.set("cloud_cover", field);
            }
          }

          if (byVar.size > 0) {
            decoded.set(fh, byVar);
          }
        }),
      ),
    );

    if (decoded.size === 0) {
      return { source: "nomads-gfs", points: [] };
    }

    // Sort forecast hours so time arrays are in ascending order.
    const sortedHours = [...decoded.keys()].sort((a, b) => a - b);

    // We need the reference time to convert forecast hours to wall-clock times.
    // Pick it from any decoded field.
    const anyField = [...decoded.values()][0].values().next().value as Grib2Field;
    const referenceTimeMs = anyField.referenceTime.getTime();

    // Assemble PointSeries per requested point.
    const points: PointSeries[] = req.points.map(({ lat, lon }) => {
      const timeStrings: string[] = [];
      const values: Partial<Record<Variable, number[]>> = {};

      for (const fh of sortedHours) {
        const byVar = decoded.get(fh)!;

        const validTime = new Date(referenceTimeMs + fh * 3_600_000);
        timeStrings.push(toMelbourneLocal(validTime));

        // Wind speed + direction are derived together from u + v components.
        const uField = byVar.get("wind_speed_10m");
        const vField = byVar.get("wind_direction_10m");
        if (uField && vField) {
          const u = valueAt(uField, lat, lon);
          const v = valueAt(vField, lat, lon);
          if (!isNaN(u) && !isNaN(v)) {
            const { speed, direction } = uvToSpeedDir(u, v);
            if (requestedVars.has("wind_speed_10m")) {
              (values.wind_speed_10m ??= []).push(speed * MS_TO_KNOTS);
            }
            if (requestedVars.has("wind_direction_10m")) {
              (values.wind_direction_10m ??= []).push(direction);
            }
          } else {
            if (requestedVars.has("wind_speed_10m"))    (values.wind_speed_10m ??= []).push(NaN);
            if (requestedVars.has("wind_direction_10m")) (values.wind_direction_10m ??= []).push(NaN);
          }
        }

        // Gusts: m/s → knots
        const gustField = byVar.get("wind_gusts_10m");
        if (gustField) {
          const raw = valueAt(gustField, lat, lon);
          (values.wind_gusts_10m ??= []).push(isNaN(raw) ? NaN : raw * MS_TO_KNOTS);
        }

        // Temperature: K → °C
        const tmpField = byVar.get("temperature_2m");
        if (tmpField) {
          const raw = valueAt(tmpField, lat, lon);
          (values.temperature_2m ??= []).push(isNaN(raw) ? NaN : raw + KELVIN_TO_CELSIUS);
        }

        // Dew point: K → °C
        const dptField = byVar.get("dew_point_2m");
        if (dptField) {
          const raw = valueAt(dptField, lat, lon);
          (values.dew_point_2m ??= []).push(isNaN(raw) ? NaN : raw + KELVIN_TO_CELSIUS);
        }

        // CAPE: already J/kg — no conversion needed
        const capeField = byVar.get("cape");
        if (capeField) {
          (values.cape ??= []).push(valueAt(capeField, lat, lon));
        }

        // Boundary layer height: already metres
        const hpblField = byVar.get("boundary_layer_height");
        if (hpblField) {
          (values.boundary_layer_height ??= []).push(valueAt(hpblField, lat, lon));
        }

        // Total cloud cover: already percent
        const tcdcField = byVar.get("cloud_cover");
        if (tcdcField) {
          (values.cloud_cover ??= []).push(valueAt(tcdcField, lat, lon));
        }
      }

      return { lat, lon, time: timeStrings, values };
    });

    log.info("fetch complete", {
      cycle: `${dateStr} ${String(cycleHour).padStart(2, "0")}Z`,
      hoursDecoded: decoded.size,
      pointsAssembled: points.length,
    });

    return {
      source:   "nomads-gfs",
      points,
      degraded: "GFS 0.25° (~28 km) — coarser than ECMWF 9 km",
    };
  },
};
