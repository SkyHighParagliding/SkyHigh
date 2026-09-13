/**
 * Derives lifted_index for a set of points from the ecmwf_ifs025 pressure-level bucket.
 *
 * Why this file exists:
 *   The ecmwf_ifs 9 km bucket (openMeteoS3.ts) does NOT carry lifted_index — the field
 *   was confirmed absent by listing every prefix under data/ecmwf_ifs/. The ecmwf_ifs025
 *   bucket (0.25 ° regular lat/lon) carries temperature_500hPa, which is everything we
 *   need to derive LI from first principles using the validated parcel routines in parcel.ts.
 *
 * Validated against GFS's own published lifted_index: r = 0.9962, residual sd = 0.170 °C
 * (n = 160, spike/probe-ecmwf-ascent.mts). The derivation is reliable; use it.
 *
 * ecmwf_ifs025 layout (confirmed empirically — see spike/probe-ifs025*.mts):
 *   url    https://openmeteo.s3.amazonaws.com/data/ecmwf_ifs025/${variable}/chunk_${chunk}.om
 *   dims   [721, 1440, 104] — 3-D, 0.25 °
 *   lat    SOUTH-FIRST: iLat = round((lat + 90) / 0.25)          ← OPPOSITE of the GFS
 *                                                                    convention in openMeteoS3.ts
 *   lon    -180..180:   iLon = round((lon + 180) / 0.25)
 *   time   104 steps @ 3-hourly = 312 h per chunk
 *          chunk = floor(epochSec / (312 × 3600))
 *   HSURF  static grid, no time dim, dims [721, 1440]:
 *          https://openmeteo.s3.amazonaws.com/data/ecmwf_ifs025/static/HSURF.om
 *          Value -999 (or any value < -100) is the ocean/missing sentinel; treat as 0 m.
 *
 * surface_pressure is NOT read from this bucket because it is stale — frozen at chunk 1555
 * (~May 2025) while temperature is at chunk 1593+. Surface pressure is derived instead from
 * pressure_msl + model orography via the standard barometric formula (see deriveSurfP below).
 */

import { OmFileReader, OmHttpBackend, OmDataType } from "@openmeteo/file-reader";
import createLogger from "../../utils/logger.js";
import type { LatLon } from "../types.js";
import { pointKey } from "../types.js";
import {
  READ_PARALLELISM,
  IO_SIZE_MAX,
  IO_SIZE_MERGE,
  withSlowDownRetry,
  makeSemaphore,
} from "./openMeteoS3.js";
import { dewpointFromRH, liftParcel } from "../parcel.js";

// ---------------------------------------------------------------------------
// Constants — ecmwf_ifs025
// ---------------------------------------------------------------------------

const S3_BASE    = "https://openmeteo.s3.amazonaws.com";
const IFS025_STEP = 0.25;         // degrees
const IFS025_NSTEPS = 104;        // time steps per chunk
const IFS025_STEP_H = 3;          // hours per step
const IFS025_CHUNK_H = IFS025_NSTEPS * IFS025_STEP_H; // 312 h

/** South-first latitude index. Note: OPPOSITE of GFS convention. */
function ifs025ILat(lat: number): number {
  return Math.round((lat + 90) / IFS025_STEP);
}
function ifs025ILon(lon: number): number {
  return Math.round((lon + 180) / IFS025_STEP);
}
function ifs025ChunkFor(epochSec: number): number {
  return Math.floor(epochSec / (IFS025_CHUNK_H * 3600));
}
function ifs025ChunkStart(chunk: number): number {
  return chunk * IFS025_CHUNK_H * 3600;
}
function ifs025Url(variable: string, chunk: number): string {
  return `${S3_BASE}/data/ecmwf_ifs025/${variable}/chunk_${chunk}.om`;
}
const HSURF_URL = `${S3_BASE}/data/ecmwf_ifs025/static/HSURF.om`;

// ---------------------------------------------------------------------------
// HSURF cache — the static elevation grid never changes between fetches.
// Keyed by "${iLat},${iLon}" so we only hit the remote once per grid cell
// for the lifetime of the process.
// ---------------------------------------------------------------------------
const hsurfCache = new Map<string, number>();

async function readHsurf(iLat: number, iLon: number): Promise<number> {
  const key = `${iLat},${iLon}`;
  if (hsurfCache.has(key)) return hsurfCache.get(key)!;

  const backend = new OmHttpBackend({ url: HSURF_URL, debug: false });
  try {
    const raw = await withSlowDownRetry(async () => {
      const reader = await OmFileReader.create(
        backend as unknown as Parameters<typeof OmFileReader.create>[0],
      );
      try {
        return await reader.read({
          type: OmDataType.FloatArray,
          ranges: [
            { start: iLat, end: iLat + 1 },
            { start: iLon, end: iLon + 1 },
          ],
          ioSizeMax:  IO_SIZE_MAX,
          ioSizeMerge: IO_SIZE_MERGE,
        }) as Float32Array;
      } finally {
        reader.dispose();
      }
    });
    // -999 (or any value < -100) is the ocean/missing sentinel.
    // Treating it as 0 m gives a sensible coastal surface pressure rather than garbage.
    const z = (raw[0] < -100) ? 0 : raw[0];
    hsurfCache.set(key, z);
    return z;
  } finally {
    await backend.close().catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Read a single ifs025 3-D cell: [iLat..iLat+1, iLon..iLon+1, tStart..tEnd].
// Returns Float32Array of length (tEnd - tStart).
// ---------------------------------------------------------------------------
async function readIfs025Cell(
  backend: OmHttpBackend,
  iLat: number,
  iLon: number,
  tStart: number,
  tEnd: number,
): Promise<Float32Array> {
  return withSlowDownRetry(async () => {
    const reader = await OmFileReader.create(
      backend as unknown as Parameters<typeof OmFileReader.create>[0],
    );
    try {
      return await reader.read({
        type: OmDataType.FloatArray,
        ranges: [
          { start: iLat, end: iLat + 1 },
          { start: iLon, end: iLon + 1 },
          { start: tStart, end: tEnd },
        ],
        ioSizeMax:          IO_SIZE_MAX,
        ioSizeMerge:        IO_SIZE_MERGE,
        prefetch:           true,
        prefetchConcurrency: 4,
      }) as Float32Array;
    } finally {
      reader.dispose();
    }
  });
}

// ---------------------------------------------------------------------------
// Surface pressure via the standard barometric formula using model orography.
//
// We derive pSurf rather than reading the surface_pressure field because that
// field is stale in this bucket (frozen at chunk 1555, ~May 2025). The formula:
//
//   pSurf = pMSL × (1 − 0.0065 × z / (T2m + 273.15 + 0.0065 × z)) ^ 5.257
//
// where z = HSURF in metres (sentinel-corrected). This is the ISA hypsometric
// approximation accurate to ~0.5 hPa for typical Australian terrain.
// ---------------------------------------------------------------------------
function deriveSurfP(pMsl_hPa: number, t2m_celsius: number, z_m: number): number {
  const TK = t2m_celsius + 273.15;
  return pMsl_hPa * Math.pow(1 - 0.0065 * z_m / (TK + 0.0065 * z_m), 5.257);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Logger type inferred from createLogger so callers don't have to import it. */
type Logger = ReturnType<typeof createLogger>;

/**
 * Fetches derived lifted_index for a set of points from ecmwf_ifs025.
 *
 * @param points           The spatial points to fetch. Must be non-empty.
 * @param timeAxisEpochSec The HOURLY time axis the caller wants (ascending).
 *                         LI is derived at 3-hourly ECMWF steps then linearly
 *                         interpolated onto this axis.  Values outside the
 *                         available data window are emitted as NaN — we do NOT
 *                         extrapolate. LI is a slowly-varying upper-air field,
 *                         so linear temporal interpolation is acceptable unlike
 *                         for surface fields (wind speed etc.).
 * @param log              Logger instance from the parent fetch.
 * @param signal           Optional AbortSignal (propagated from the caller).
 * @returns Map<pointKey, number[]> aligned to timeAxisEpochSec; a point is
 *          omitted entirely if its read fails (we never emit silent zeroes —
 *          a zero LI reads as "neutral stability", a dangerous false signal).
 */
export async function fetchEcmwfLiftedIndex(
  points:           LatLon[],
  timeAxisEpochSec: number[],
  log:              Logger,
  signal?:          AbortSignal,
): Promise<Map<string, number[]>> {
  if (points.length === 0 || timeAxisEpochSec.length === 0) return new Map();

  const tMin = timeAxisEpochSec[0];
  const tMax = timeAxisEpochSec[timeAxisEpochSec.length - 1];

  // Determine the chunk(s) that span the requested window.
  // A window straddling a 312-h chunk boundary is handled by reading both chunks
  // and concatenating — the spike confirmed both are readable.
  const chunkMin = ifs025ChunkFor(tMin);
  const chunkMax = ifs025ChunkFor(tMax);

  // Per-point, per-chunk raw series: { epochSec, t500, t2m, rh2m, pMsl, hsurf }
  // We collect 3-hourly raw values then interpolate once at the end.
  type RawStep = { epochSec: number; t500: number; t2m: number; rh2m: number; pMsl: number };
  const rawByPoint = new Map<string, RawStep[]>();
  for (const p of points) rawByPoint.set(pointKey(p), []);

  const sem = makeSemaphore(READ_PARALLELISM);

  // Variables we need from ifs025 (all time-varying, 3-hourly).
  const TIME_VARS = [
    "temperature_500hPa",
    "temperature_2m",
    "relative_humidity_2m",
    "pressure_msl",
  ] as const;
  type TimeVar = typeof TIME_VARS[number];

  let failedPoints = 0;

  for (let chunk = chunkMin; chunk <= chunkMax; chunk++) {
    if (signal?.aborted) break;
    const chunkStart = ifs025ChunkStart(chunk);
    const chunkEnd   = chunkStart + IFS025_CHUNK_H * 3600;

    // The slice of this chunk that overlaps our requested window.
    // We expand by one 3-hourly step on each side so that the interpolation
    // always has a bracket at each end of the hourly axis: without the padding,
    // the first/last 1-2 hourly axis values would fall outside the data range
    // and become NaN. The extra steps add negligible network cost.
    const tStart = Math.max(0, Math.round((tMin - chunkStart) / (IFS025_STEP_H * 3600)) - 1);
    const tEnd   = Math.min(IFS025_NSTEPS, Math.round((tMax - chunkStart) / (IFS025_STEP_H * 3600)) + 2);
    if (tStart >= tEnd || chunkEnd <= tMin) continue;

    // For each point × each variable: read in parallel, bounded by the shared semaphore.
    const tasks: Array<Promise<void>> = [];
    const backends: OmHttpBackend[] = [];

    // Collect raw values per-point for this chunk so we can assemble RawStep entries.
    type PointVarData = Partial<Record<TimeVar, Float32Array>>;
    const chunkData = new Map<string, PointVarData>();
    for (const p of points) chunkData.set(pointKey(p), {});

    for (const varName of TIME_VARS) {
      const url     = ifs025Url(varName, chunk);
      const backend = new OmHttpBackend({ url, debug: false });
      backends.push(backend);

      for (const pt of points) {
        if (signal?.aborted) break;
        const key  = pointKey(pt);
        const iLat = ifs025ILat(pt.lat);
        const iLon = ifs025ILon(pt.lon);

        tasks.push(sem(async () => {
          if (signal?.aborted) return;
          try {
            const data = await readIfs025Cell(backend, iLat, iLon, tStart, tEnd);
            chunkData.get(key)![varName] = data;
          } catch (err) {
            // One retry (matching openMeteoS3.ts discipline).
            if (signal?.aborted) return;
            await new Promise(r => setTimeout(r, 250));
            try {
              const data = await readIfs025Cell(backend, iLat, iLon, tStart, tEnd);
              chunkData.get(key)![varName] = data;
            } catch (err2) {
              log.warn(`ecmwfLiftedIndex: read failed`, {
                chunk, varName, lat: pt.lat, lon: pt.lon, error: String(err2),
              });
            }
          }
        }));
      }
    }

    try {
      await Promise.all(tasks);
    } finally {
      await Promise.all(backends.map(b => b.close().catch(() => {})));
    }

    // Assemble RawStep entries for each point from this chunk.
    for (const pt of points) {
      const key  = pointKey(pt);
      const pvd  = chunkData.get(key)!;
      const t500 = pvd["temperature_500hPa"];
      const t2m  = pvd["temperature_2m"];
      const rh2m = pvd["relative_humidity_2m"];
      const pMsl = pvd["pressure_msl"];

      // If any variable failed for this point, we silently skip it here. The
      // point will end up with partial or no data and is omitted from results.
      if (!t500 || !t2m || !rh2m || !pMsl) continue;

      const existing = rawByPoint.get(key)!;
      const nSteps   = t500.length;
      for (let i = 0; i < nSteps; i++) {
        const epochSec = chunkStart + (tStart + i) * IFS025_STEP_H * 3600;
        existing.push({ epochSec, t500: t500[i], t2m: t2m[i], rh2m: rh2m[i], pMsl: pMsl[i] });
      }
    }
  }

  // Read HSURF for each unique grid cell (cached after the first read per cell).
  const hsurfByPoint = new Map<string, number>();
  await Promise.all(
    points.map(async (pt) => {
      const key  = pointKey(pt);
      const iLat = ifs025ILat(pt.lat);
      const iLon = ifs025ILon(pt.lon);
      try {
        hsurfByPoint.set(key, await readHsurf(iLat, iLon));
      } catch (err) {
        log.warn(`ecmwfLiftedIndex: HSURF read failed`, { lat: pt.lat, lon: pt.lon, error: String(err) });
        // Leave absent — point will be omitted below.
      }
    }),
  );

  // Derive LI at each 3-hourly raw step, then interpolate onto the hourly axis.
  const result = new Map<string, number[]>();

  for (const pt of points) {
    const key   = pointKey(pt);
    const steps = rawByPoint.get(key)!;
    const z     = hsurfByPoint.get(key);

    if (z === undefined || steps.length === 0) {
      failedPoints++;
      continue;
    }

    // Compute LI at each 3-hourly step.
    // li = T_env_500 − T_parcel_500
    // Sign convention: POSITIVE = stable (environment warmer than parcel aloft),
    // NEGATIVE = unstable (parcel warmer than environment = buoyant).
    // This matches the canonical definition in types.ts and GFS's published field.
    const liSteps: { epochSec: number; li: number }[] = [];

    for (const s of steps) {
      if (!isFinite(s.t500) || !isFinite(s.t2m) || !isFinite(s.rh2m) || !isFinite(s.pMsl)) continue;
      const pSurf = deriveSurfP(s.pMsl, s.t2m, z);
      if (!isFinite(pSurf) || pSurf < 400 || pSurf > 1100) continue;  // guard against bad values
      const td      = dewpointFromRH(s.t2m, s.rh2m);
      const tParcel = liftParcel(pSurf, s.t2m, td, 500);
      const li      = s.t500 - tParcel;
      if (!isFinite(li)) continue;
      liSteps.push({ epochSec: s.epochSec, li });
    }

    if (liSteps.length < 2) {
      // Cannot interpolate with fewer than 2 anchor points.
      failedPoints++;
      continue;
    }

    // Linear interpolation of LI (3-hourly) onto the hourly caller axis.
    // LI is a slowly-varying upper-air field — linear temporal interpolation is
    // acceptable here in a way it would not be for surface fields like wind speed.
    // We deliberately do NOT extrapolate beyond the available data: NaN is emitted
    // for any hour outside [liSteps[0].epochSec, liSteps[last].epochSec].
    const liFirst = liSteps[0].epochSec;
    const liLast  = liSteps[liSteps.length - 1].epochSec;
    const hourlyLI: number[] = [];

    for (const tSec of timeAxisEpochSec) {
      if (tSec < liFirst || tSec > liLast) {
        hourlyLI.push(NaN);
        continue;
      }
      // Binary search for the bracketing pair.
      let lo = 0, hi = liSteps.length - 1;
      while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (liSteps[mid].epochSec <= tSec) lo = mid; else hi = mid;
      }
      const s0 = liSteps[lo], s1 = liSteps[hi];
      const span = s1.epochSec - s0.epochSec;
      const frac = span > 0 ? (tSec - s0.epochSec) / span : 0;
      hourlyLI.push(s0.li + frac * (s1.li - s0.li));
    }

    result.set(key, hourlyLI);
  }

  if (failedPoints > 0) {
    log.warn(`ecmwfLiftedIndex: ${failedPoints} point(s) omitted due to read or derivation failure`);
  }

  log.info(`ecmwfLiftedIndex: ${result.size}/${points.length} points succeeded`);
  return result;
}
