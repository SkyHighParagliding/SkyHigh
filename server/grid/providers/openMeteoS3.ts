/**
 * Open-Meteo S3 archive providers — tier 2 (ECMWF IFS HRES) and tier 3 (NCEP GFS).
 *
 * Data source: s3://openmeteo (us-west-2), anonymous HTTP, CC-BY-4.0.
 * File format: .om, read via @openmeteo/file-reader (GPL-2.0-only, WASM).
 *   GPL distribution obligations do not apply — SkyHigh is hosted-only.
 * Pinned dependency: @openmeteo/file-reader@0.0.18
 *
 * Key constraints established empirically in spike/prove.mjs:
 *  - Bulk reads (whole spatial dimension at once) cause WASM OOM. Read row-by-row.
 *  - S3 returns SlowDown throttling under burst traffic; bounded retry handles this.
 *  - Parallelism P≈20 is safe without triggering SlowDown under normal load.
 */

import { OmFileReader, OmHttpBackend, OmDataType } from "@openmeteo/file-reader";
import createLogger from "../../utils/logger.js";
import type { GridProvider } from "./provider.js";
import type {
  GridRequest,
  LatLon,
  ModelFamily,
  PointSeries,
  ProviderResult,
  SourceId,
  Variable,
} from "../types.js";
import { uvToSpeedDir } from "../types.js";
import { currentAxisOrigin, toMelbourneLocal } from "../time.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const S3_BASE = "https://openmeteo.s3.amazonaws.com";

/** m/s → knots. Wind U/V components and gusts are m/s in both models. */
const MS_TO_KNOTS = 1.943844;

/** Available probe cache TTL. S3 has no quota pressure, but a repeated
 *  cold HEAD on every orchestrator call is pointless noise. */
const AVAILABILITY_CACHE_MS = 3 * 60 * 1000; // 3 minutes

/** Bounded parallelism for row-by-row reads. The spike found P=20 is safe
 *  without triggering S3 SlowDown. */
const READ_PARALLELISM = 20;

/** HTTP reader tuning, matching the spike. */
const IO_SIZE_MAX  = BigInt(512 * 1024); // 512 KB per HTTP range request
const IO_SIZE_MERGE = BigInt(128 * 1024); // merge adjacent chunks within 128 KB


// ---------------------------------------------------------------------------
// Concurrency limiter (reused by both providers)
// ---------------------------------------------------------------------------

function makeSemaphore(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (running >= limit) {
      await new Promise<void>(resolve => queue.push(resolve));
    }
    running++;
    try {
      return await fn();
    } finally {
      running--;
      queue.shift()?.();
    }
  };
}

// ---------------------------------------------------------------------------
// S3 SlowDown retry
// ---------------------------------------------------------------------------

/** Retries fn up to maxAttempts when the S3 returns a SlowDown error.
 *  Uses exponential backoff with jitter. Does NOT retry on AbortError. */
async function withSlowDownRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T> {
  let delay = 500;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if ((err as { name?: string }).name === "AbortError") throw err;
      if (!msg.includes("SlowDown") || attempt === maxAttempts) throw err;
      await new Promise(r => setTimeout(r, delay + Math.random() * 200));
      delay *= 2;
    }
  }
  // TypeScript: unreachable, but satisfies exhaustive flow
  throw new Error("withSlowDownRetry: exhausted");
}

// ---------------------------------------------------------------------------
// ECMWF IFS — O1280 Reduced Gaussian Grid
// ---------------------------------------------------------------------------

/**
 * The ECMWF IFS HRES native grid is an O1280 Reduced Gaussian Grid (RGG).
 * It is NOT regular lat/lon: each latitude ring has a different number of
 * longitude points, and the latitude positions are Gaussian (not uniform).
 *
 * The linearised spatial index used by the .om files packs rows from north
 * to south: index(i, j) = rowStartOffset[i] + j, where:
 *   - i ∈ [0, 2559]: latitude row, 0 = North Pole
 *   - j ∈ [0, ringSize(i)-1]: longitude index within the ring
 *   - ringSize(i) = 20 + 4*i  for i < 1280
 *                = 20 + 4*(2559-i) for i ≥ 1280
 *
 * Latitude approximation: the true Gaussian quadrature points require
 * numerical root-finding; we use the uniform approximation
 *   lat(i) ≈ 90 − (i + 0.5) × 180/2560
 * which has error ≤ ~0.035°, well within the 0.09° grid spacing.
 *
 * Total spatial points: sum_{i=0}^{2559} ringSize(i) = 6,599,680. ✓
 */
const ECMWF_N    = 1280;         // Gaussian parameter — half the lat rows
const ECMWF_NLAT = 2 * ECMWF_N; // 2560 latitude rows

function ecmwfRingSize(i: number): number {
  return i < ECMWF_N ? 20 + 4 * i : 20 + 4 * (ECMWF_NLAT - 1 - i);
}

function ecmwfApproxLat(i: number): number {
  return 90 - (i + 0.5) * 180 / ECMWF_NLAT;
}

function ecmwfLatToRow(lat: number): number {
  // Inverse of approxLat: i ≈ (90 - lat) * NLAT/180 - 0.5
  return (90 - lat) * ECMWF_NLAT / 180 - 0.5;
}

/** Precomputed cumulative row offsets for O1280, built once at module load.
 *  Entry [i] is the first linearised index of row i. Length = NLAT+1. */
const ECMWF_ROW_OFFSET: number[] = new Array(ECMWF_NLAT + 1);
ECMWF_ROW_OFFSET[0] = 0;
for (let i = 0; i < ECMWF_NLAT; i++) {
  ECMWF_ROW_OFFSET[i + 1] = ECMWF_ROW_OFFSET[i] + ecmwfRingSize(i);
}

interface EcmwfGridPoint {
  /** Nearest-neighbour row index into the O1280 grid. */
  row: number;
  /** Longitude column within that row. */
  col: number;
  /** Linearised spatial index: ECMWF_ROW_OFFSET[row] + col. */
  spatIdx: number;
  /** Approximate latitude of the matched grid cell. */
  gridLat: number;
  /** Exact longitude of the matched grid cell. */
  gridLon: number;
}

/** Maps a (lat, lon) to its nearest O1280 grid point. */
function ecmwfNearestPoint(lat: number, lon: number): EcmwfGridPoint {
  const rowF = ecmwfLatToRow(lat);
  const row  = Math.max(0, Math.min(ECMWF_NLAT - 1, Math.round(rowF)));
  const ni   = ecmwfRingSize(row);
  // Normalise longitude to [0, 360)
  const lonNorm = ((lon % 360) + 360) % 360;
  const col = Math.round(lonNorm * ni / 360) % ni;
  return {
    row,
    col,
    spatIdx:  ECMWF_ROW_OFFSET[row] + col,
    gridLat:  ecmwfApproxLat(row),
    gridLon:  (col * 360 / ni + 360) % 360 > 180
                ? col * 360 / ni - 360
                : col * 360 / ni,
  };
}

/** ECMWF chunk formula: chunk = floor(epochSec / (504 * 3600)). */
function ecmwfChunkForTime(epochSec: number): number {
  return Math.floor(epochSec / (504 * 3600));
}

function ecmwfChunkStartEpoch(chunk: number): number {
  return chunk * 504 * 3600;
}

/** S3 path for a given ECMWF variable chunk. */
function ecmwfChunkUrl(variable: string, chunk: number): string {
  return `${S3_BASE}/data/ecmwf_ifs/${variable}/chunk_${chunk}.om`;
}

// ---------------------------------------------------------------------------
// GFS 0.117° — Regular lat/lon grid
// ---------------------------------------------------------------------------

/**
 * ncep_gfs013 uses a regular lat/lon grid: 1536 × 3072 points at ~0.117°.
 * CRS BBOX: lat [-89.912125, 89.912125], lon [-180, 179.88281].
 *
 * File layout:
 *  - Current chunks (≥ ~1033) use 3D dims [1536, 3072, time_steps].
 *  - Older archive chunks used flat 2D dims [4718592, time_steps].
 *    The provider targets the current chunk only, so the 3D layout is primary.
 *    If a flat chunk is encountered (e.g. during a chunk boundary transition),
 *    we fall back gracefully.
 *
 * GFS chunk_time_length = 481, so chunk = floor(epochSec / (481 * 3600)).
 */
const GFS_NLAT    = 1536;
const GFS_NLON    = 3072;
const GFS_LAT_MAX = 89.912125;
const GFS_LAT_MIN = -89.912125;
const GFS_LON_MIN = -180.0;
const GFS_LON_MAX = 179.88281;
const GFS_LAT_STEP = (GFS_LAT_MAX - GFS_LAT_MIN) / (GFS_NLAT - 1);
const GFS_LON_STEP = (GFS_LON_MAX - GFS_LON_MIN) / (GFS_NLON - 1);
const GFS_CHUNK_HOURS = 481;

interface GfsGridPoint {
  iLat: number;
  iLon: number;
  /** Only valid for 3D chunks. For 2D flat chunks use iLat*GFS_NLON+iLon. */
  gridLat: number;
  gridLon: number;
}

/** Maps a (lat, lon) to its nearest GFS grid indices. */
function gfsNearestPoint(lat: number, lon: number): GfsGridPoint {
  const iLat = Math.max(0, Math.min(GFS_NLAT - 1,
    Math.round((GFS_LAT_MAX - lat) / GFS_LAT_STEP)));
  // Normalise lon to [-180, 180)
  const lonNorm = ((lon + 180) % 360 + 360) % 360 - 180;
  const iLon = Math.max(0, Math.min(GFS_NLON - 1,
    Math.round((lonNorm - GFS_LON_MIN) / GFS_LON_STEP)));
  return {
    iLat,
    iLon,
    gridLat: GFS_LAT_MAX - iLat * GFS_LAT_STEP,
    gridLon: GFS_LON_MIN + iLon * GFS_LON_STEP,
  };
}

function gfsChunkForTime(epochSec: number): number {
  return Math.floor(epochSec / (GFS_CHUNK_HOURS * 3600));
}

function gfsChunkStartEpoch(chunk: number): number {
  return chunk * GFS_CHUNK_HOURS * 3600;
}

function gfsChunkUrl(variable: string, chunk: number): string {
  return `${S3_BASE}/data/ncep_gfs013/${variable}/chunk_${chunk}.om`;
}

// ---------------------------------------------------------------------------
// Variable mappings
// ---------------------------------------------------------------------------

/**
 * ECMWF IFS variables available in the S3 archive and their native names.
 * Verified by listing s3://openmeteo/data/ecmwf_ifs/ prefixes.
 *
 * Absent from archive (do NOT add): precipitation_probability, weather_code,
 *   wind_speed_10m (archive stores U/V components, not derived speed/direction).
 *
 * Native units (verified by reading actual values):
 *   wind U/V, gusts: m/s  → convert to knots (× 1.943844)
 *   temperature_2m, dew_point_2m: °C (already canonical)
 *   cape: J/kg, boundary_layer_height: m, precipitation: mm,
 *   cloud_cover, cloud_cover_low: %, visibility: m  — all already canonical.
 */
const ECMWF_SUPPORTED = new Set<Variable>([
  "wind_speed_10m",       // derived from wind_u_component_10m + wind_v_component_10m
  "wind_direction_10m",   // derived from same
  "wind_gusts_10m",
  "temperature_2m",
  "dew_point_2m",
  "cape",
  "boundary_layer_height",
  "precipitation",
  "cloud_cover",
  "cloud_cover_low",
  "visibility",
]);

/**
 * GFS variables available in the S3 archive.
 * Verified by listing s3://openmeteo/data/ncep_gfs013/ prefixes.
 *
 * Absent: wind_gusts_10m, dew_point_2m, cape, visibility,
 *         precipitation_probability, weather_code.
 * Same native unit rules apply as ECMWF.
 */
const GFS_SUPPORTED = new Set<Variable>([
  "wind_speed_10m",
  "wind_direction_10m",
  "temperature_2m",
  "boundary_layer_height",
  "precipitation",
  "cloud_cover",
  "cloud_cover_low",
]);

// ---------------------------------------------------------------------------
// Shared read helpers
// ---------------------------------------------------------------------------

/**
 * Reads a single spatial slice from an ECMWF .om file (3D: [1, spatial, time]).
 * Reuses a single OmHttpBackend across reads; creates a fresh OmFileReader per
 * read to avoid WASM state accumulation that would cause OOM on bulk reads.
 */
async function ecmwfReadRow(
  backend: OmHttpBackend,
  spatStart: number,
  spatEnd: number,
  tStart: number,
  tEnd: number,
): Promise<Float32Array | null> {
  return withSlowDownRetry(async () => {
    const reader = await OmFileReader.create(backend as unknown as Parameters<typeof OmFileReader.create>[0]);
    try {
      return await reader.read({
        type:  OmDataType.FloatArray,
        ranges: [
          { start: 0, end: 1 },          // dim0: model run (always 1)
          { start: spatStart, end: spatEnd },
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

/**
 * Reads a single lat/lon cell from a GFS .om file.
 * Handles both 3D chunks [lat, lon, time] and legacy flat chunks [spatial, time].
 */
async function gfsReadCell(
  backend: OmHttpBackend,
  iLat: number,
  iLon: number,
  tStart: number,
  tEnd: number,
  is3D: boolean,
): Promise<Float32Array | null> {
  return withSlowDownRetry(async () => {
    const reader = await OmFileReader.create(backend as unknown as Parameters<typeof OmFileReader.create>[0]);
    try {
      // Chunks are 481-hour blocks aligned to the epoch, so the forecast window
      // almost always starts mid-chunk. Reading from index 0 would return data
      // from weeks ago, silently labelled with today's timestamps.
      const ranges = is3D
        ? [
            { start: iLat, end: iLat + 1 },
            { start: iLon, end: iLon + 1 },
            { start: tStart, end: tEnd },
          ]
        : [
            { start: iLat * GFS_NLON + iLon, end: iLat * GFS_NLON + iLon + 1 },
            { start: tStart, end: tEnd },
          ];
      return await reader.read({
        type:  OmDataType.FloatArray,
        ranges,
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
// Factory
// ---------------------------------------------------------------------------

type Variant = "ecmwf" | "gfs";

interface VariantConfig {
  id:            SourceId;
  tier:          number;
  modelFamily:   ModelFamily;
  label:         string;
  resolutionDeg: number;
  supported:     Set<Variable>;
  availabilityUrl: () => string;
}

const CONFIGS: Record<Variant, VariantConfig> = {
  ecmwf: {
    id:            "openmeteo-s3-ecmwf",
    tier:          2,
    modelFamily:   "ecmwf",
    label:         "Open-Meteo S3 archive (ECMWF IFS HRES 9 km)",
    resolutionDeg: 0.09,
    supported:     ECMWF_SUPPORTED,
    availabilityUrl: () => {
      const chunk = ecmwfChunkForTime(Math.floor(Date.now() / 1000));
      return ecmwfChunkUrl("boundary_layer_height", chunk);
    },
  },
  gfs: {
    id:            "openmeteo-s3-gfs",
    tier:          3,
    modelFamily:   "gfs",
    label:         "Open-Meteo S3 archive (NCEP GFS 0.13°)",
    resolutionDeg: 0.117,
    supported:     GFS_SUPPORTED,
    availabilityUrl: () => {
      const chunk = gfsChunkForTime(Math.floor(Date.now() / 1000));
      return gfsChunkUrl("temperature_2m", chunk);
    },
  },
};

// Per-variant availability cache.
const availCache = new Map<Variant, { ok: boolean; expiresAt: number }>();

// ---------------------------------------------------------------------------
// ECMWF fetch implementation
// ---------------------------------------------------------------------------

async function fetchEcmwf(req: GridRequest, log: ReturnType<typeof createLogger>): Promise<ProviderResult> {
  const { points, variables, forecastDays, signal } = req;

  // Only handle variables this model carries.
  const vars = variables.filter(v => ECMWF_SUPPORTED.has(v));
  if (vars.length === 0) return { source: "openmeteo-s3-ecmwf", points: [] };

  const originEpoch = currentAxisOrigin();
  const endEpoch    = originEpoch + forecastDays * 86400;
  const startChunk = ecmwfChunkForTime(originEpoch);
  const endChunk   = ecmwfChunkForTime(endEpoch);

  // Determine which native S3 variable names we need.
  const needsWind  = vars.includes("wind_speed_10m") || vars.includes("wind_direction_10m");
  const needsGusts = vars.includes("wind_gusts_10m");
  const s3Vars: string[] = [];
  if (needsWind) s3Vars.push("wind_u_component_10m", "wind_v_component_10m");
  if (needsGusts) s3Vars.push("wind_gusts_10m");
  for (const v of vars) {
    if (v !== "wind_speed_10m" && v !== "wind_direction_10m" && v !== "wind_gusts_10m") {
      s3Vars.push(v);
    }
  }

  // Map each requested point to its nearest O1280 grid cell.
  const gridPoints = points.map(p => ({ ...p, grid: ecmwfNearestPoint(p.lat, p.lon) }));

  // Group points by row so we can read each row once and serve multiple points.
  const rowGroups = new Map<number, typeof gridPoints>();
  for (const gp of gridPoints) {
    const row = gp.grid.row;
    if (!rowGroups.has(row)) rowGroups.set(row, []);
    rowGroups.get(row)!.push(gp);
  }

  log.info(`ECMWF S3 fetch: ${points.length} points → ${rowGroups.size} row(s), chunks ${startChunk}–${endChunk}, vars: ${s3Vars.join(",")}`);

  // Collected raw values per point: varName → time-indexed float array.
  const rawByPoint = new Map<string, Map<string, number[]>>();
  const pointKey = (p: LatLon) => `${p.lat},${p.lon}`;
  for (const p of points) rawByPoint.set(pointKey(p), new Map());

  const sem = makeSemaphore(READ_PARALLELISM);

  for (let chunk = startChunk; chunk <= endChunk; chunk++) {
    if (signal?.aborted) break;
    const chunkStart = ecmwfChunkStartEpoch(chunk);
    const chunkEnd   = chunkStart + 504 * 3600;

    // Time slice within this chunk that falls in our forecast window.
    const tStart = Math.max(0, Math.round((originEpoch - chunkStart) / 3600));
    const tEnd   = Math.min(504, Math.round((endEpoch - chunkStart) / 3600) + 1);
    if (tStart >= tEnd || chunkEnd < originEpoch) continue;

    const tCount = tEnd - tStart;

    // Read each S3 variable × each row group in parallel, bounded by sem.
    const tasks: Array<Promise<void>> = [];

    for (const s3Var of s3Vars) {
      const url = ecmwfChunkUrl(s3Var, chunk);
      const backend = new OmHttpBackend({ url, debug: false });

      for (const [row, rowPts] of rowGroups) {
        if (signal?.aborted) break;
        const ni = ecmwfRingSize(row);

        // Find the lon range within this row that covers all points in the group.
        const colMin = Math.min(...rowPts.map(p => p.grid.col));
        const colMax = Math.max(...rowPts.map(p => p.grid.col));
        const spatStart = ECMWF_ROW_OFFSET[row] + colMin;
        const spatEnd   = ECMWF_ROW_OFFSET[row] + colMax + 1;

        tasks.push(sem(async () => {
          if (signal?.aborted) return;
          let data: Float32Array | null = null;
          try {
            data = await ecmwfReadRow(backend, spatStart, spatEnd, tStart, tEnd);
          } catch (err) {
            log.warn(`ECMWF row read failed`, { chunk, s3Var, row, error: String(err) });
            return;
          }
          if (!data) return;

          // Distribute values to each point in this row group.
          const nCols = colMax - colMin + 1;
          for (const gp of rowPts) {
            const colOffset = gp.grid.col - colMin;
            const store = rawByPoint.get(pointKey(gp))!;
            const existing = store.get(s3Var) ?? [];
            for (let t = 0; t < tCount; t++) {
              // Layout: [1 × nCols × tCount], flat index = colOffset*tCount + t
              existing.push(data[colOffset * tCount + t]);
            }
            store.set(s3Var, existing);
          }

          void ni; // silence unused-variable warning (ni used implicitly above)
        }));
      }

      tasks.push(sem(async () => { await backend.close(); }));
    }

    await Promise.all(tasks);
  }

  // Build time strings for the full forecast window.
  const totalHours = forecastDays * 24;
  const timeStrings: string[] = [];
  for (let h = 0; h < totalHours; h++) {
    timeStrings.push(toMelbourneLocal(originEpoch + h * 3600));
  }

  // Assemble PointSeries.
  const collected: PointSeries[] = [];
  for (const origPt of points) {
    const key  = pointKey(origPt);
    const raw  = rawByPoint.get(key)!;
    const values: Partial<Record<Variable, number[]>> = {};

    const uArr = raw.get("wind_u_component_10m");
    const vArr = raw.get("wind_v_component_10m");
    if (needsWind && uArr && vArr && uArr.length === vArr.length) {
      const speeds: number[] = [];
      const dirs: number[] = [];
      for (let i = 0; i < uArr.length; i++) {
        const { speed, direction } = uvToSpeedDir(uArr[i], vArr[i]);
        speeds.push(speed * MS_TO_KNOTS);
        dirs.push(direction);
      }
      if (vars.includes("wind_speed_10m"))    values.wind_speed_10m    = speeds;
      if (vars.includes("wind_direction_10m")) values.wind_direction_10m = dirs;
    }

    if (needsGusts) {
      const gArr = raw.get("wind_gusts_10m");
      if (gArr) values.wind_gusts_10m = gArr.map(v => v * MS_TO_KNOTS);
    }

    // Scalar variables — already in canonical units.
    for (const v of vars) {
      if (v === "wind_speed_10m" || v === "wind_direction_10m" || v === "wind_gusts_10m") continue;
      const arr = raw.get(v);
      if (arr?.length) values[v] = arr;
    }

    // Only include the point if we got at least some data.
    if (Object.keys(values).length > 0) {
      collected.push({
        lat:    origPt.lat,
        lon:    origPt.lon,
        time:   timeStrings.slice(0, Math.max(...Object.values(values).map(a => a!.length))),
        values,
      });
    }
  }

  log.info(`ECMWF S3 fetch complete: ${collected.length}/${points.length} points`);
  return { source: "openmeteo-s3-ecmwf", points: collected };
}

// ---------------------------------------------------------------------------
// GFS fetch implementation
// ---------------------------------------------------------------------------

async function fetchGfs(req: GridRequest, log: ReturnType<typeof createLogger>): Promise<ProviderResult> {
  const { points, variables, forecastDays, signal } = req;

  const vars = variables.filter(v => GFS_SUPPORTED.has(v));
  if (vars.length === 0) return { source: "openmeteo-s3-gfs", points: [] };

  const originEpoch = currentAxisOrigin();
  const endEpoch    = originEpoch + forecastDays * 86400;
  const startChunk = gfsChunkForTime(originEpoch);
  const endChunk   = gfsChunkForTime(endEpoch);

  const needsWind = vars.includes("wind_speed_10m") || vars.includes("wind_direction_10m");
  const s3Vars: string[] = [];
  if (needsWind) s3Vars.push("wind_u_component_10m", "wind_v_component_10m");
  for (const v of vars) {
    if (v !== "wind_speed_10m" && v !== "wind_direction_10m") s3Vars.push(v);
  }

  const gridPoints = points.map(p => ({ ...p, grid: gfsNearestPoint(p.lat, p.lon) }));

  log.info(`GFS S3 fetch: ${points.length} points, chunks ${startChunk}–${endChunk}, vars: ${s3Vars.join(",")}`);

  const pointKey = (p: LatLon) => `${p.lat},${p.lon}`;
  const rawByPoint = new Map<string, Map<string, number[]>>();
  for (const p of points) rawByPoint.set(pointKey(p), new Map());

  const sem = makeSemaphore(READ_PARALLELISM);

  for (let chunk = startChunk; chunk <= endChunk; chunk++) {
    if (signal?.aborted) break;
    const chunkStart = gfsChunkStartEpoch(chunk);
    const chunkEnd   = chunkStart + GFS_CHUNK_HOURS * 3600;
    if (chunkEnd < originEpoch) continue;

    const tStart = Math.max(0, Math.round((originEpoch - chunkStart) / 3600));
    const tEnd   = Math.min(GFS_CHUNK_HOURS, Math.round((endEpoch - chunkStart) / 3600) + 1);
    if (tStart >= tEnd) continue;

    const tCount = tEnd - tStart;

    // Determine layout of this chunk (3D vs flat) by inspecting dims once.
    // We probe with the first variable; if the probe fails we skip the chunk.
    let is3D = true;
    {
      const probeUrl = gfsChunkUrl(s3Vars[0], chunk);
      const probeBackend = new OmHttpBackend({ url: probeUrl, debug: false });
      try {
        const probeReader = await OmFileReader.create(probeBackend as unknown as Parameters<typeof OmFileReader.create>[0]);
        const dims = probeReader.getDimensions();
        is3D = dims.length === 3;
        probeReader.dispose();
      } catch (err) {
        log.warn(`GFS chunk probe failed`, { chunk, error: String(err) });
        await probeBackend.close();
        continue;
      }
      await probeBackend.close();
    }

    const tasks: Array<Promise<void>> = [];

    for (const s3Var of s3Vars) {
      const url     = gfsChunkUrl(s3Var, chunk);
      const backend = new OmHttpBackend({ url, debug: false });

      for (const gp of gridPoints) {
        if (signal?.aborted) break;

        tasks.push(sem(async () => {
          if (signal?.aborted) return;
          let data: Float32Array | null = null;
          try {
            data = await gfsReadCell(backend, gp.grid.iLat, gp.grid.iLon, tStart, tEnd, is3D);
          } catch (err) {
            log.warn(`GFS cell read failed`, { chunk, s3Var, iLat: gp.grid.iLat, iLon: gp.grid.iLon, error: String(err) });
            return;
          }
          if (!data) return;

          const store   = rawByPoint.get(pointKey(gp))!;
          const existing = store.get(s3Var) ?? [];
          for (let t = 0; t < tCount; t++) existing.push(data[t]);
          store.set(s3Var, existing);
        }));
      }

      tasks.push(sem(async () => { await backend.close(); }));
    }

    await Promise.all(tasks);
  }

  // Build time strings.
  const totalHours = forecastDays * 24;
  const timeStrings: string[] = [];
  for (let h = 0; h < totalHours; h++) {
    timeStrings.push(toMelbourneLocal(originEpoch + h * 3600));
  }

  const collected: PointSeries[] = [];
  for (const origPt of points) {
    const key  = pointKey(origPt);
    const raw  = rawByPoint.get(key)!;
    const values: Partial<Record<Variable, number[]>> = {};

    const uArr = raw.get("wind_u_component_10m");
    const vArr = raw.get("wind_v_component_10m");
    if (needsWind && uArr && vArr && uArr.length === vArr.length) {
      const speeds: number[] = [];
      const dirs: number[] = [];
      for (let i = 0; i < uArr.length; i++) {
        const { speed, direction } = uvToSpeedDir(uArr[i], vArr[i]);
        speeds.push(speed * MS_TO_KNOTS);
        dirs.push(direction);
      }
      if (vars.includes("wind_speed_10m"))    values.wind_speed_10m    = speeds;
      if (vars.includes("wind_direction_10m")) values.wind_direction_10m = dirs;
    }

    for (const v of vars) {
      if (v === "wind_speed_10m" || v === "wind_direction_10m") continue;
      const arr = raw.get(v);
      if (arr?.length) values[v] = arr;
    }

    if (Object.keys(values).length > 0) {
      collected.push({
        lat:    origPt.lat,
        lon:    origPt.lon,
        time:   timeStrings.slice(0, Math.max(...Object.values(values).map(a => a!.length))),
        values,
      });
    }
  }

  log.info(`GFS S3 fetch complete: ${collected.length}/${points.length} points`);
  return {
    source:   "openmeteo-s3-gfs",
    points:   collected,
    // GFS is a different model (not merely coarser resolution) — flag it.
    degraded: "NCEP GFS model (not ECMWF); visible seam if mixed with tier-1/2",
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Creates a GridProvider backed by the Open-Meteo S3 archive.
 *
 * @param variant  "ecmwf" → ECMWF IFS HRES 9 km (tier 2)
 *                 "gfs"   → NCEP GFS ~0.117° (tier 3)
 */
export function createOpenMeteoS3Provider(variant: Variant): GridProvider {
  const config = CONFIGS[variant];
  const log    = createLogger(`grid:s3-${variant}`);

  return {
    id:            config.id,
    tier:          config.tier,
    modelFamily:   config.modelFamily,
    label:         config.label,
    resolutionDeg: config.resolutionDeg,

    supports(variable: Variable): boolean {
      return config.supported.has(variable);
    },

    async available(): Promise<boolean> {
      const cached = availCache.get(variant);
      if (cached && Date.now() < cached.expiresAt) return cached.ok;

      const url = config.availabilityUrl();
      let ok = false;
      try {
        const res = await fetch(url, {
          method: "HEAD",
          signal: AbortSignal.timeout(8000),
        });
        ok = res.ok;
      } catch {
        ok = false;
      }

      availCache.set(variant, { ok, expiresAt: Date.now() + AVAILABILITY_CACHE_MS });
      log.debug(`availability check: ${ok}`, { url });
      return ok;
    },

    async fetch(req: GridRequest): Promise<ProviderResult> {
      return variant === "ecmwf"
        ? fetchEcmwf(req, log)
        : fetchGfs(req, log);
    },
  };
}

/** Tier-2 provider: ECMWF IFS HRES via Open-Meteo S3. Same model as tier-1
 *  REST API — tier 1↔2 mixing is seamless and lossless. */
export const openMeteoS3EcmwfProvider = createOpenMeteoS3Provider("ecmwf");

/** Tier-3 provider: NCEP GFS via Open-Meteo S3. Different model from ECMWF;
 *  the orchestrator uses this only after tier-1 and tier-2 are exhausted. */
export const openMeteoS3GfsProvider = createOpenMeteoS3Provider("gfs");
