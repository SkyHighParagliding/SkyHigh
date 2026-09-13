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
// Cell-key helper.
// Both the HSURF cache and the read-deduplication logic below are keyed by
// "${iLat},${iLon}" — the same string so the two cannot drift apart.
// ---------------------------------------------------------------------------
function cellKey(iLat: number, iLon: number): string {
  return `${iLat},${iLon}`;
}

// ---------------------------------------------------------------------------
// HSURF — the static model orography grid.
//
// It never changes (it is the model's fixed terrain), so values are cached by
// cellKey for the process lifetime. It is read as a rectangle covering the whole
// area of interest, not cell by cell: an earlier per-cell version opened
// thousands of simultaneous connections to this one file and most died with
// "TypeError: fetch failed".
//
// The reader is created once and kept. Creating one costs an HTTP round-trip for
// the file's metadata trailer, and the backend is deliberately never closed —
// closing it would invalidate the reader for subsequent grid fetches.
// ---------------------------------------------------------------------------
const hsurfCache = new Map<string, number>();
let hsurfReader: Promise<OmFileReader> | null = null;

function getHsurfReader(): Promise<OmFileReader> {
  if (!hsurfReader) {
    hsurfReader = OmFileReader.create(
      new OmHttpBackend({ url: HSURF_URL, debug: false }) as unknown as
        Parameters<typeof OmFileReader.create>[0],
    );
    // Don't cache a failed create, or one transient error disables HSURF — and
    // therefore surface pressure, and therefore LI — for the whole process.
    hsurfReader.catch(() => { hsurfReader = null; });
  }
  return hsurfReader;
}

/**
 * Read every HSURF cell in `box` into the cache. Tiles already cached are
 * skipped, so a second grid fetch over the same area costs nothing.
 */
async function loadHsurfBox(box: Box): Promise<void> {
  const tiles = tileBox(box).filter(t => !hsurfTileCached(t));
  if (tiles.length === 0) return;

  const reader = await getHsurfReader();
  for (const tile of tiles) {
    const nLon = tile.iLon1 - tile.iLon0;
    const raw = await withSlowDownRetry(async () =>
      await reader.read({
        type: OmDataType.FloatArray,
        ranges: [
          { start: tile.iLat0, end: tile.iLat1 },
          { start: tile.iLon0, end: tile.iLon1 },
        ],
        ioSizeMax:  IO_SIZE_MAX,
        ioSizeMerge: IO_SIZE_MERGE,
      }) as Float32Array,
    );
    for (let a = tile.iLat0; a < tile.iLat1; a++) {
      for (let o = tile.iLon0; o < tile.iLon1; o++) {
        const z = raw[(a - tile.iLat0) * nLon + (o - tile.iLon0)];
        // -999 (or any value < -100) is the ocean/missing sentinel. Treating it
        // as 0 m gives a sensible coastal surface pressure rather than garbage.
        hsurfCache.set(cellKey(a, o), z < -100 ? 0 : z);
      }
    }
  }
}

/** A tile is cached iff its corners are — they are only ever filled together. */
function hsurfTileCached(t: Box): boolean {
  return hsurfCache.has(cellKey(t.iLat0, t.iLon0))
      && hsurfCache.has(cellKey(t.iLat1 - 1, t.iLon1 - 1));
}

// ---------------------------------------------------------------------------
// Rectangular reads.
//
// Reading one cell at a time is the wrong shape for this format. The .om files
// are chunk-compressed, so neighbouring cells usually live in the same on-disk
// chunk: a per-cell read re-fetches and re-decodes that chunk once per cell. A
// single rectangular read of the whole area of interest fetches each chunk once.
//
// Measured on the real Victoria box (23 lat x 40 lon x 60 steps) against the
// live bucket: one box read takes ~27 s where 920 per-cell reads take ~18 min —
// a 39x saving, with all 720 spot-checked values matching bit for bit.
//
// TILE_MAX bounds the memory of one read. The Victoria box fits in a single
// tile, so in practice this is one read per variable per chunk; the tiling only
// exists so an unexpectedly large point set degrades into several bounded reads
// rather than trying to pull a global array into memory.
// ---------------------------------------------------------------------------
const TILE_MAX = 64; // cells per side

/** Half-open index box in ifs025 index space. */
type Box = { iLat0: number; iLat1: number; iLon0: number; iLon1: number };

/** Bounding box of a set of points, in ifs025 index space. */
function boundingBox(points: LatLon[]): Box {
  let iLat0 = Infinity, iLat1 = -Infinity, iLon0 = Infinity, iLon1 = -Infinity;
  for (const p of points) {
    const a = ifs025ILat(p.lat), o = ifs025ILon(p.lon);
    if (a < iLat0) iLat0 = a;
    if (a > iLat1) iLat1 = a;
    if (o < iLon0) iLon0 = o;
    if (o > iLon1) iLon1 = o;
  }
  return { iLat0, iLat1: iLat1 + 1, iLon0, iLon1: iLon1 + 1 };
}

/** Split a box into tiles of at most TILE_MAX cells per side. */
function tileBox(box: Box): Box[] {
  const tiles: Box[] = [];
  for (let a = box.iLat0; a < box.iLat1; a += TILE_MAX) {
    for (let o = box.iLon0; o < box.iLon1; o += TILE_MAX) {
      tiles.push({
        iLat0: a, iLat1: Math.min(a + TILE_MAX, box.iLat1),
        iLon0: o, iLon1: Math.min(o + TILE_MAX, box.iLon1),
      });
    }
  }
  return tiles;
}

/**
 * Read a 3-D rectangle: [iLat0..iLat1) x [iLon0..iLon1) x [tStart..tEnd).
 *
 * The result is row-major — index (a, o, t) sits at
 * ((a - iLat0) * nLon + (o - iLon0)) * nT + t — verified against per-cell reads
 * by spike/probe-box.mts.
 *
 * The reader is passed in rather than created here: OmFileReader.create() costs
 * an HTTP round-trip for the file's metadata trailer, and every tile of a
 * variable reads the same file.
 */
async function readIfs025Box(
  reader: OmFileReader,
  tile: Box,
  tStart: number,
  tEnd: number,
): Promise<Float32Array> {
  return withSlowDownRetry(async () =>
    await reader.read({
      type: OmDataType.FloatArray,
      ranges: [
        { start: tile.iLat0, end: tile.iLat1 },
        { start: tile.iLon0, end: tile.iLon1 },
        { start: tStart,     end: tEnd },
      ],
      ioSizeMax:          IO_SIZE_MAX,
      ioSizeMerge:        IO_SIZE_MERGE,
      prefetch:           true,
      prefetchConcurrency: 4,
    }) as Float32Array,
  );
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

    // -----------------------------------------------------------------------
    // Map points onto ifs025 cells.
    //
    // The thermal grid samples at 0.09°, but the ifs025 bucket is 0.25° —
    // roughly 7.5 thermal points map to the SAME (iLat, iLon) cell. Data is
    // read as rectangles covering the whole point set (see readIfs025Box) and
    // then sliced per cell, so this map serves two purposes: it tells us which
    // cells to slice out, and it fans each cell's series back out to every
    // point sharing it.
    //
    // The cell key is the same "${iLat},${iLon}" format as the HSURF cache, via
    // the same helper, so the two cannot drift apart.
    //
    // If a read fails, ALL points in the affected cells are omitted rather than
    // zero-filled: a zero LI reads as neutral stability, the dangerous direction.
    // -----------------------------------------------------------------------

    // Build cell → points mapping for this chunk.
    type CellInfo = { iLat: number; iLon: number; ptKeys: string[] };
    const cellMap = new Map<string, CellInfo>();
    for (const pt of points) {
      const iLat = ifs025ILat(pt.lat);
      const iLon = ifs025ILon(pt.lon);
      const ck   = cellKey(iLat, iLon);
      if (!cellMap.has(ck)) cellMap.set(ck, { iLat, iLon, ptKeys: [] });
      cellMap.get(ck)!.ptKeys.push(pointKey(pt));
    }

    // Collect raw values per-cell for this chunk.
    type CellVarData = Partial<Record<TimeVar, Float32Array>>;
    const chunkData = new Map<string, CellVarData>();
    for (const ck of cellMap.keys()) chunkData.set(ck, {});

    // One backend AND one reader per (variable, chunk) — never per read.
    // OmFileReader.create() costs an HTTP round-trip to fetch the file's
    // metadata trailer, and every read of a variable hits the same file.
    const backends: OmHttpBackend[] = [];
    const readers:  OmFileReader[]  = [];
    for (const varName of TIME_VARS) {
      const backend = new OmHttpBackend({ url: ifs025Url(varName, chunk), debug: false });
      backends.push(backend);
      readers.push(await OmFileReader.create(
        backend as unknown as Parameters<typeof OmFileReader.create>[0],
      ));
    }

    // For each variable × tile: one rectangular read, in parallel, bounded by
    // the shared semaphore. Values are then sliced out per cell.
    const nT    = tEnd - tStart;
    const tiles = tileBox(boundingBox(points));
    const tasks: Array<Promise<void>> = [];

    for (let v = 0; v < TIME_VARS.length; v++) {
      const varName = TIME_VARS[v];
      const reader  = readers[v];

      for (const tile of tiles) {
        if (signal?.aborted) break;

        tasks.push(sem(async () => {
          if (signal?.aborted) return;

          let box: Float32Array;
          try {
            box = await readIfs025Box(reader, tile, tStart, tEnd);
          } catch {
            // One retry (matching openMeteoS3.ts discipline).
            if (signal?.aborted) return;
            await new Promise(r => setTimeout(r, 250));
            try {
              box = await readIfs025Box(reader, tile, tStart, tEnd);
            } catch (err2) {
              log.warn(`ecmwfLiftedIndex: box read failed`, {
                chunk, varName, tile, error: String(err2),
              });
              // Every cell in this tile stays absent, so its points are omitted
              // below rather than zero-filled.
              return;
            }
          }

          // Slice the rectangle back out per cell. Row-major:
          // (a, o, t) -> ((a - iLat0) * nLon + (o - iLon0)) * nT + t.
          const nLon = tile.iLon1 - tile.iLon0;
          for (const [ck, { iLat, iLon }] of cellMap) {
            if (iLat < tile.iLat0 || iLat >= tile.iLat1) continue;
            if (iLon < tile.iLon0 || iLon >= tile.iLon1) continue;
            const base = ((iLat - tile.iLat0) * nLon + (iLon - tile.iLon0)) * nT;
            chunkData.get(ck)![varName] = box.slice(base, base + nT);
          }
        }));
      }
    }

    try {
      await Promise.all(tasks);
    } finally {
      for (const r of readers) { try { r.dispose(); } catch { /* already disposed */ } }
      await Promise.all(backends.map(b => b.close().catch(() => {})));
    }

    // Assemble RawStep entries. Fan cell data out to all points sharing that cell.
    for (const [ck, { ptKeys }] of cellMap) {
      const cvd  = chunkData.get(ck)!;
      const t500 = cvd["temperature_500hPa"];
      const t2m  = cvd["temperature_2m"];
      const rh2m = cvd["relative_humidity_2m"];
      const pMsl = cvd["pressure_msl"];

      // If any variable failed for this cell, all co-located points are skipped
      // here — they will end up with partial or no data and be omitted from results.
      if (!t500 || !t2m || !rh2m || !pMsl) continue;

      const nSteps = t500.length;
      const steps: RawStep[] = [];
      for (let i = 0; i < nSteps; i++) {
        const epochSec = chunkStart + (tStart + i) * IFS025_STEP_H * 3600;
        steps.push({ epochSec, t500: t500[i], t2m: t2m[i], rh2m: rh2m[i], pMsl: pMsl[i] });
      }

      // Each point in this cell gets its own entry (same values, separate keys).
      for (const pk of ptKeys) {
        rawByPoint.get(pk)!.push(...steps);
      }
    }
  }

  // Pull the whole HSURF rectangle covering these points in one go, then look up
  // each point's cell. A failure here leaves the cache empty for those cells, so
  // the affected points are omitted below rather than given a fabricated
  // elevation — it does not fail the whole fetch.
  try {
    await loadHsurfBox(boundingBox(points));
  } catch (err) {
    log.warn(`ecmwfLiftedIndex: HSURF read failed`, { error: String(err) });
  }

  const hsurfByPoint = new Map<string, number>();
  for (const pt of points) {
    const z = hsurfCache.get(cellKey(ifs025ILat(pt.lat), ifs025ILon(pt.lon)));
    if (z !== undefined) hsurfByPoint.set(pointKey(pt), z);
  }
  if (hsurfByPoint.size < points.length) {
    log.warn(`ecmwfLiftedIndex: HSURF missing for ${points.length - hsurfByPoint.size}/${points.length} points`);
  }

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
