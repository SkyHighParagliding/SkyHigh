/**
 * terrainTiles.ts — browser-side sampler for AWS "terrarium" elevation tiles.
 *
 * Fetches and decodes z12 terrarium PNG tiles in the browser, stores them as
 * Int16Array(256×256) per tile, and provides a synchronous sample function so
 * map taps can read ground elevation from a resident tile with zero network
 * round-trip.  Tiles are fetched asynchronously via ensureTileFor / prefetchTile;
 * once resident, sampleElevationSync returns immediately.
 *
 * This module is a direct port of server/grid/elevationPoint.ts — the sampling
 * maths are intentionally identical so client and server agree to within the
 * Int16 rounding (~0.5 m), which is negligible against the ~10 m SRTM source
 * accuracy.  Any change to the maths here must be mirrored there.
 *
 * Tile source: VITE_TERRAIN_TILE_URL env var (default: AWS terrarium S3 bucket).
 * A Cloudflare R2 mirror can be substituted by setting that env var without
 * touching this file.
 *
 * Encoding (terrarium):  elevation_m = R * 256 + G + B / 256 − 32768
 * Zoom level:            12  (~30 m/px at Victorian latitudes)
 * NODATA sentinel:       −32768  (all-zero RGB pixel)
 * Cache:                 LRU, max 64 tiles (~8 MB), Map re-insertion ordering
 * In-flight coalescing:  concurrent requests for the same tile share one Promise
 * Retry:                 up to 3 attempts, exponential backoff from 500 ms;
 *                        404 is treated as a permanently absent tile and cached
 *                        so it is never retried (ocean/missing tiles are common)
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZOOM = 12;
const TILE_SIZE = 256;
/** Terrarium nodata sentinel — the value decoded from an all-zero RGB pixel. */
const NODATA = -32768;
const LRU_MAX = 64;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 500;

// `||` not `??` on purpose: an env var present but set to "" must fall back
// rather than produce "/12/x/y.png".
const TILE_BASE: string =
  (import.meta.env.VITE_TERRAIN_TILE_URL as string | undefined) ||
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

function tileUrl(z: number, x: number, y: number): string {
  return `${TILE_BASE}/${z}/${x}/${y}.png`;
}

// ---------------------------------------------------------------------------
// LRU tile cache
// ---------------------------------------------------------------------------

/** Decoded elevation data for a single 256×256 tile, in row-major order. */
type DecodedTile = Int16Array; // length = TILE_SIZE * TILE_SIZE

/**
 * We use Map re-insertion ordering as an LRU: the oldest (least-recently-used)
 * entry is always first in insertion order, so we can evict it by deleting the
 * first key.  This is identical to the server module's strategy.
 */
const lruCache = new Map<string, DecodedTile>();

function lruGet(key: string): DecodedTile | undefined {
  const value = lruCache.get(key);
  if (value !== undefined) {
    // Re-insert at tail to mark as most-recently-used.
    lruCache.delete(key);
    lruCache.set(key, value);
  }
  return value;
}

function lruSet(key: string, value: DecodedTile): void {
  if (lruCache.has(key)) lruCache.delete(key);
  lruCache.set(key, value);
  if (lruCache.size > LRU_MAX) {
    // Evict the least-recently-used entry (first insertion-order key).
    lruCache.delete(lruCache.keys().next().value!);
  }
}

// ---------------------------------------------------------------------------
// Permanent-absence cache (404 / consistently-missing tiles)
// ---------------------------------------------------------------------------

/**
 * Tiles that returned 404 or failed all retries are recorded here so we never
 * retry them.  Ocean tiles and tiles outside the dataset coverage are legitimately
 * absent — retrying them wastes bandwidth and delays the caller.
 */
const absentTiles = new Set<string>();

// ---------------------------------------------------------------------------
// In-flight coalescing
// ---------------------------------------------------------------------------

/** Pending fetches keyed by tile key.  Removed once the promise settles. */
const inFlight = new Map<string, Promise<DecodedTile | null>>();

// ---------------------------------------------------------------------------
// Tile geometry helpers
// ---------------------------------------------------------------------------

/**
 * Convert (lon, lat) to fractional tile coordinates at zoom z using the
 * standard Mercator web-tile convention used by the terrarium dataset.
 */
function lonLatToTileFloat(lon: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

/**
 * The four pixel centres bracketing (lon, lat), as absolute addresses in the
 * z12 pixel plane, plus the interpolation weights.
 *
 * Pixel centres sit at (px + 0.5, py + 0.5), so we shift by −0.5 before
 * flooring. Kept in one place because both the sampler and the prefetcher need
 * to agree on exactly which pixels — and therefore which tiles — a sample
 * touches; if they disagreed, ensureTileFor could fetch tiles the sampler then
 * reported as not resident, and a tap would never resolve.
 */
function bracketingPixels(lon: number, lat: number) {
  const { x: fx, y: fy } = lonLatToTileFloat(lon, lat, ZOOM);
  const shiftedX = fx * TILE_SIZE - 0.5;
  const shiftedY = fy * TILE_SIZE - 0.5;
  const x0 = Math.floor(shiftedX);
  const y0 = Math.floor(shiftedY);
  return { x0, y0, x1: x0 + 1, y1: y0 + 1, dx: shiftedX - x0, dy: shiftedY - y0 };
}

// ---------------------------------------------------------------------------
// PNG decoding — colour-managed canvas readback
// ---------------------------------------------------------------------------

/**
 * Decode a terrarium PNG blob into an Int16Array of elevations.
 *
 * WHY these specific options matter (they look removable; they are NOT):
 *
 *   colorSpaceConversion: 'none'  — tells the browser to skip colour management
 *     when creating the ImageBitmap.  Without this, browsers may silently apply
 *     a sRGB transfer curve or ICC profile embedded in the PNG, altering the RGB
 *     values and producing plausible-looking but numerically wrong elevations.
 *     The terrarium format encodes elevation data as raw integers in the RGB
 *     channels; those bytes must reach the canvas pixel array unchanged.
 *
 *   premultiplyAlpha: 'none'  — terrarium PNGs have no meaningful alpha, but if
 *     the browser treats them as RGBA and pre-multiplies, the RGB channels are
 *     scaled by the alpha value, corrupting the encoded elevation.
 *
 *   colorSpace: 'srgb' on the 2D context  — locks the backing store to sRGB so
 *     the pixel readback from getImageData is in the same space we requested.
 *     Without this, wide-gamut displays may convert the values a second time.
 *
 *   willReadFrequently: true  — allows the browser to keep the backing store in
 *     CPU memory rather than on the GPU, making getImageData significantly faster
 *     when we read every pixel (which we always do for decode).
 */
async function decodePngBlob(blob: Blob): Promise<DecodedTile | null> {
  try {
    let imageData: ImageData;

    if (typeof createImageBitmap !== "undefined" && typeof OffscreenCanvas !== "undefined") {
      // Preferred path: OffscreenCanvas avoids touching the DOM and supports
      // the colour-space options we need directly.
      const bitmap = await createImageBitmap(blob, {
        colorSpaceConversion: "none",
        premultiplyAlpha: "none",
      });
      const canvas = new OffscreenCanvas(TILE_SIZE, TILE_SIZE);
      const ctx = canvas.getContext("2d", {
        colorSpace: "srgb",
        willReadFrequently: true,
      }) as OffscreenCanvasRenderingContext2D | null;
      if (!ctx) return null;
      ctx.drawImage(bitmap, 0, 0);
      imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
      bitmap.close();
    } else {
      // Fallback: HTMLImageElement + regular <canvas>.  The colour-space options
      // are set on the context for the same reasons described above.
      const url = URL.createObjectURL(blob);
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });
        const canvas = document.createElement("canvas");
        canvas.width = TILE_SIZE;
        canvas.height = TILE_SIZE;
        const ctx = canvas.getContext("2d", {
          colorSpace: "srgb",
          willReadFrequently: true,
        });
        if (!ctx) return null;
        ctx.drawImage(img, 0, 0);
        imageData = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    const { data } = imageData;
    const elevations = new Int16Array(TILE_SIZE * TILE_SIZE);
    for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
      const base = i * 4; // getImageData always returns RGBA (4 bytes per pixel)
      const r = data[base];
      const g = data[base + 1];
      const b = data[base + 2];
      // Terrarium encoding: elevation_m = R * 256 + G + B / 256 − 32768
      // Int16 stores the rounded metre value; sub-metre precision is lost but
      // is irrelevant compared to the ~10 m SRTM source accuracy.
      elevations[i] = Math.round(r * 256 + g + b / 256 - 32768);
    }
    return elevations;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Network fetch with retry
// ---------------------------------------------------------------------------

/**
 * Outcome of a tile fetch. The distinction between the two failure modes is
 * load-bearing: "absent" is a fact about the dataset and may be cached forever,
 * whereas "failed" is a fact about the network and must NOT be, because the
 * relaxed-bilinear substitution downstream would then quietly report a
 * neighbouring tile's elevation — up to 9 km away — instead of showing nothing.
 */
type FetchOutcome =
  | { status: "ok"; tile: DecodedTile }
  /** Confirmed 404: outside the dataset. Safe to remember. */
  | { status: "absent" }
  /** Retries exhausted or decode failed. Transient — must stay retryable. */
  | { status: "failed" };

async function fetchAndDecodeTile(tx: number, ty: number): Promise<FetchOutcome> {
  const url = tileUrl(ZOOM, tx, ty);

  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    if (attempt > 0) {
      await new Promise<void>(res => setTimeout(res, RETRY_BASE_MS * 2 ** (attempt - 1)));
    }
    try {
      const response = await fetch(url);
      if (response.status === 404) {
        // Genuinely outside dataset coverage. Note ocean tiles are NOT 404 —
        // they return 200 and decode to 0 m — so this really is the edge case.
        return { status: "absent" };
      }
      if (!response.ok) {
        // Transient server error — retry.
        continue;
      }
      const blob = await response.blob();
      const tile = await decodePngBlob(blob);
      if (tile !== null) return { status: "ok", tile };
      // decodePngBlob returned null — treat as transient decode failure, retry.
    } catch {
      // Network error — retry.
    }
  }

  return { status: "failed" };
}

// ---------------------------------------------------------------------------
// Cached tile loader with in-flight coalescing
// ---------------------------------------------------------------------------

function tileKey(tx: number, ty: number): string {
  return `${ZOOM}/${tx}/${ty}`;
}

/**
 * Load a tile from cache, or fetch and decode it if not present.
 * Returns null if the tile is absent (404) or all fetch attempts failed.
 * Never throws.
 */
async function loadTile(tx: number, ty: number): Promise<DecodedTile | null> {
  const key = tileKey(tx, ty);

  if (absentTiles.has(key)) return null;

  const cached = lruGet(key);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetchAndDecodeTile(tx, ty).then(outcome => {
    inFlight.delete(key);
    if (outcome.status === "ok") {
      lruSet(key, outcome.tile);
      return outcome.tile;
    }
    if (outcome.status === "absent") {
      // A fact about the dataset — remember it so we never ask again.
      absentTiles.add(key);
    }
    // 'failed' is deliberately NOT recorded: leaving the tile neither cached nor
    // absent keeps the sampler reporting "not ready", so the next tap retries.
    return null;
  });

  inFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Pixel sampler — synchronous read from resident tiles
// ---------------------------------------------------------------------------

/**
 * Read the elevation at absolute pixel coordinates (X, Y) in the z12 pixel
 * grid from the in-memory cache only (synchronous).
 *
 * Returns:
 *   number     — elevation in metres AMSL
 *   null       — tile is absent (404 or all retries failed); no data here
 *   undefined  — tile not yet resident; caller should retry after ensureTileFor
 */
function sampleAbsolutePixelSync(X: number, Y: number): number | null | undefined {
  const tx = Math.floor(X / TILE_SIZE);
  const ty = Math.floor(Y / TILE_SIZE);
  const ix = X - tx * TILE_SIZE;
  const iy = Y - ty * TILE_SIZE;
  const key = tileKey(tx, ty);

  if (absentTiles.has(key)) return null;

  const tile = lruGet(key);
  if (tile === undefined) return undefined; // not yet fetched

  const idx = iy * TILE_SIZE + ix;
  return tile[idx];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return tile coordinates for (lon, lat) at this module's zoom level.
 * Useful for prefetch callers that want to warm tiles before a hover starts.
 */
export function tileCoordsFor(lon: number, lat: number): { x: number; y: number } {
  const { x, y } = lonLatToTileFloat(lon, lat, ZOOM);
  return { x: Math.floor(x), y: Math.floor(y) };
}

/**
 * Fetch and decode a specific tile by its tile-grid coordinates.
 * Safe to call speculatively; duplicate calls coalesce via the in-flight map.
 * Never throws.
 */
export async function prefetchTile(x: number, y: number): Promise<void> {
  await loadTile(x, y);
}

/**
 * Ensure the tile(s) required to sample (lon, lat) are fetched and decoded,
 * so that a subsequent sampleElevationSync call will not return undefined.
 *
 * Because the bilinear sample may straddle a tile boundary, up to four tiles
 * can be involved.  This function fetches all of them in parallel.
 *
 * Resolves when all needed tiles have settled (present or confirmed absent).
 * Never throws.
 */
export async function ensureTileFor(lon: number, lat: number): Promise<void> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;

  const { x0, y0, x1, y1 } = bracketingPixels(lon, lat);

  // Collect the unique tiles those four pixels resolve to.
  const needed = new Set<string>();
  for (const X of [x0, x1]) {
    for (const Y of [y0, y1]) {
      const tx = Math.floor(X / TILE_SIZE);
      const ty = Math.floor(Y / TILE_SIZE);
      needed.add(`${tx},${ty}`);
    }
  }

  await Promise.all(
    [...needed].map(k => {
      const [tx, ty] = k.split(",").map(Number);
      return loadTile(tx, ty);
    }),
  );
}

/**
 * Synchronously sample ground elevation (metres AMSL) at (lon, lat).
 *
 * Return values:
 *   number     — elevation in metres AMSL (bilinear-interpolated)
 *   undefined  — needed tile(s) not yet resident; call ensureTileFor and retry
 *   null       — tile is permanently absent (ocean or outside dataset); no data
 *
 * Both undefined and null cause callers to render nothing, but only undefined
 * should trigger a retry — null means the tile was genuinely missing and
 * retrying would be pointless.
 *
 * Uses the exact same bilinear maths as server/grid/elevationPoint.ts:
 *   - Pixel centres at (px + 0.5, py + 0.5) in tile space
 *   - Shift by −0.5 before flooring to locate the bracketing pixel pair
 *   - Each of the four corners resolved via its own absolute pixel address
 *     so cross-tile samples are correct — NOT clamped at the tile edge
 *   - NODATA (−32768) corners substituted with the nearest valid corner
 *     (relaxed bilinear); return null only when all four are nodata
 */
export function sampleElevationSync(lon: number, lat: number): number | null | undefined {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  const { x0, y0, x1, y1, dx, dy } = bracketingPixels(lon, lat);

  // Sample all four surrounding pixel centres.  Each resolves through its own
  // absolute tile index so corners straddling a tile boundary are correct.
  const v00 = sampleAbsolutePixelSync(x0, y0);
  const v10 = sampleAbsolutePixelSync(x1, y0);
  const v01 = sampleAbsolutePixelSync(x0, y1);
  const v11 = sampleAbsolutePixelSync(x1, y1);

  // If any tile is not yet resident, signal "not ready".
  if (v00 === undefined || v10 === undefined || v01 === undefined || v11 === undefined) {
    return undefined;
  }

  // All four settled — now handle absent tiles (null) and the NODATA sentinel.
  // Convert null (absent tile) to null-as-nodata so the substitution logic below
  // can treat them uniformly with the −32768 sentinel.
  const s00 = v00 === null || v00 === NODATA ? null : v00;
  const s10 = v10 === null || v10 === NODATA ? null : v10;
  const s01 = v01 === null || v01 === NODATA ? null : v01;
  const s11 = v11 === null || v11 === NODATA ? null : v11;

  // All four are nodata — nothing to report.
  if ((s00 ?? s10 ?? s01 ?? s11) === null) return null;

  // Relaxed bilinear: substitute each missing corner from the nearest valid
  // neighbour rather than averaging in −32768, which would produce a wildly
  // wrong result that still looks like a plausible elevation.  This matches
  // the server module's strategy exactly.
  const c00 = s00 ?? s10 ?? s01 ?? s11!;
  const c10 = s10 ?? s00 ?? s11 ?? s01!;
  const c01 = s01 ?? s00 ?? s11 ?? s10!;
  const c11 = s11 ?? s10 ?? s01 ?? s00!;

  const r0 = c00 * (1 - dx) + c10 * dx;
  const r1 = c01 * (1 - dx) + c11 * dx;
  return r0 * (1 - dy) + r1 * dy;
}
