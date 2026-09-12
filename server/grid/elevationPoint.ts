/**
 * elevationPoint.ts — on-demand ground elevation lookup from AWS terrarium PNG tiles.
 *
 * Fetches a single z12 terrarium tile, decodes it with sharp, and returns the
 * bilinear-interpolated elevation (metres AMSL) at the requested coordinate.
 * Cross-tile bilinear sampling is handled correctly by resolving each of the
 * four surrounding pixels through its own tile key, so samples near a tile
 * edge do not clamp at the boundary.
 *
 * Tile source: https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png
 * Encoding:    elevation_m = R * 256 + G + B / 256 - 32768
 * Zoom level:  12 (~30 m/px at Victorian latitudes) — nearest-pixel error <10 m
 *              (verified against OpenTopoData SRTM 30m).
 *
 * Cache: decoded Int16Array(256*256) per tile, LRU-capped at 128 tiles (~17 MB).
 * In-flight coalescing: duplicate concurrent fetches for the same tile share
 * one network request and resolve from the same promise.
 */

import sharp from "sharp";
import createLogger from "../utils/logger.js";

const log = createLogger("grid:elevationPoint");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ZOOM = 12;
const TILE_SIZE = 256;
/** Terrarium nodata sentinel — the value an all-zero RGB pixel decodes to. */
const NODATA = -32768;
const TILE_URL = (z: number, x: number, y: number) =>
  `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const LRU_MAX = 128;
const RETRY_MAX = 3;
const RETRY_BASE_MS = 500;
const USER_AGENT = "SkyHigh/1.0 (paragliding club weather platform)";

// ---------------------------------------------------------------------------
// LRU tile cache
// ---------------------------------------------------------------------------

/** Decoded elevation data for a single 256×256 tile. */
type DecodedTile = Int16Array; // length = TILE_SIZE * TILE_SIZE

const lruCache = new Map<string, DecodedTile>();

function lruGet(key: string): DecodedTile | undefined {
  const value = lruCache.get(key);
  if (value !== undefined) {
    // Re-insert at tail (most-recently-used position).
    lruCache.delete(key);
    lruCache.set(key, value);
  }
  return value;
}

function lruSet(key: string, value: DecodedTile): void {
  if (lruCache.has(key)) lruCache.delete(key);
  lruCache.set(key, value);
  if (lruCache.size > LRU_MAX) {
    // Evict least-recently-used (first Map entry).
    lruCache.delete(lruCache.keys().next().value!);
  }
}

// ---------------------------------------------------------------------------
// In-flight coalescing
// ---------------------------------------------------------------------------

/** Pending fetches keyed by tile key. Removed once the promise settles. */
const inFlight = new Map<string, Promise<DecodedTile | null>>();

// ---------------------------------------------------------------------------
// Tile geometry
// ---------------------------------------------------------------------------

interface TilePixel {
  /** Tile column index. */
  tx: number;
  /** Tile row index. */
  ty: number;
  /** Sub-pixel x within the tile (0 … TILE_SIZE). */
  px: number;
  /** Sub-pixel y within the tile (0 … TILE_SIZE). */
  py: number;
}

/**
 * Convert (lon, lat) to a tile index and fractional pixel position at zoom z.
 * Follows the standard Mercator web-tile convention used by terrarium tiles.
 */
function lonLatToTilePx(lon: number, lat: number, z: number): TilePixel {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return {
    tx: Math.floor(x),
    ty: Math.floor(y),
    px: (x - Math.floor(x)) * TILE_SIZE,
    py: (y - Math.floor(y)) * TILE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Network fetch + decode
// ---------------------------------------------------------------------------

/**
 * Fetch a terrarium tile and decode it into an Int16Array of elevations.
 * Returns null if the tile cannot be fetched after all retries.
 */
async function fetchTile(z: number, tx: number, ty: number): Promise<DecodedTile | null> {
  const url = TILE_URL(z, tx, ty);

  for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
    if (attempt > 0) {
      await new Promise(res => setTimeout(res, RETRY_BASE_MS * 2 ** (attempt - 1)));
    }
    try {
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!response.ok) {
        log.warn(`elevationPoint: tile ${z}/${tx}/${ty} HTTP ${response.status} (attempt ${attempt + 1})`);
        continue;
      }
      const arrayBuffer = await response.arrayBuffer();
      const buf = Buffer.from(arrayBuffer);

      // Decode PNG → raw RGB(A) via sharp; respect actual channel count.
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      const channels = info.channels; // 3 (RGB) or 4 (RGBA)

      const elevations = new Int16Array(TILE_SIZE * TILE_SIZE);
      for (let i = 0; i < TILE_SIZE * TILE_SIZE; i++) {
        const base = i * channels;
        const r = data[base];
        const g = data[base + 1];
        const b = data[base + 2];
        // Terrarium: elevation_m = R * 256 + G + B / 256 - 32768
        // Int16 stores the rounded metre value; sub-metre precision is lost
        // but is irrelevant compared to the ~10 m SRTM source accuracy.
        elevations[i] = Math.round(r * 256 + g + b / 256 - 32768);
      }

      return elevations;
    } catch (err) {
      log.warn(
        `elevationPoint: tile ${z}/${tx}/${ty} fetch error (attempt ${attempt + 1})`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  log.error(`elevationPoint: tile ${z}/${tx}/${ty} unavailable after ${RETRY_MAX} attempts`);
  return null;
}

// ---------------------------------------------------------------------------
// Cached tile loader with in-flight coalescing
// ---------------------------------------------------------------------------

async function loadTile(tx: number, ty: number): Promise<DecodedTile | null> {
  const key = `${ZOOM}/${tx}/${ty}`;

  const cached = lruGet(key);
  if (cached !== undefined) return cached;

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = fetchTile(ZOOM, tx, ty).then(tile => {
    inFlight.delete(key);
    if (tile !== null) lruSet(key, tile);
    return tile;
  });

  inFlight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Pixel sampler — resolves through the tile cache so cross-tile samples work
// ---------------------------------------------------------------------------

/**
 * Read the elevation at absolute pixel coordinates (X, Y) in the z12 pixel
 * grid, fetching the appropriate tile if needed.
 * Returns null if the tile is unavailable.
 */
async function sampleAbsolutePixel(X: number, Y: number): Promise<number | null> {
  const tx = Math.floor(X / TILE_SIZE);
  const ty = Math.floor(Y / TILE_SIZE);
  const ix = X - tx * TILE_SIZE;
  const iy = Y - ty * TILE_SIZE;

  const tile = await loadTile(tx, ty);
  if (tile === null) return null;

  const idx = iy * TILE_SIZE + ix;
  return tile[idx];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Return the bilinear-interpolated ground elevation (metres AMSL) at the
 * given (lon, lat).
 *
 * - Uses z12 terrarium tiles (~30 m/px at Victorian latitudes).
 * - Bilinear interpolation over the four surrounding pixel centres, with
 *   correct cross-tile sampling (each pixel fetched by its own absolute
 *   tile index so no clamping at tile boundaries).
 * - Pixel centres sit at (px + 0.5, py + 0.5) in tile space; we shift by
 *   0.5 before flooring to locate the bracketing pixels.
 * - Caches decoded tiles in an LRU map (128 tiles, ~17 MB).
 * - Coalesces concurrent fetches for the same tile.
 * - Returns null if coordinates are non-finite, or if a required tile
 *   cannot be fetched after retries. Never throws to the caller.
 */
export async function getElevationAt(lon: number, lat: number): Promise<number | null> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  // Absolute pixel coords in the z12 pixel plane.
  const { tx, ty, px, py } = lonLatToTilePx(lon, lat, ZOOM);
  const absX = tx * TILE_SIZE + px;
  const absY = ty * TILE_SIZE + py;

  // Shift by 0.5 so we interpolate between pixel centres, not corners.
  // Then floor to get the top-left bracketing pixel.
  const shiftedX = absX - 0.5;
  const shiftedY = absY - 0.5;
  const x0 = Math.floor(shiftedX);
  const y0 = Math.floor(shiftedY);
  const x1 = x0 + 1;
  const y1 = y0 + 1;
  const dx = shiftedX - x0;
  const dy = shiftedY - y0;

  // Fetch the four surrounding pixels, potentially from different tiles.
  const [v00, v10, v01, v11] = await Promise.all([
    sampleAbsolutePixel(x0, y0),
    sampleAbsolutePixel(x1, y0),
    sampleAbsolutePixel(x0, y1),
    sampleAbsolutePixel(x1, y1),
  ]);

  // Require all four pixels; any null means the tile was unavailable.
  if (v00 === null || v10 === null || v01 === null || v11 === null) return null;

  // Treat the nodata sentinel as missing, not as an elevation. Blending even a
  // single -32768 corner into the average would yield a wildly negative result
  // that still looks like a plausible number, so substitute from a valid
  // corner instead — the same relaxed-bilinear approach used for the thermal
  // grid in extract.ts. All four missing means we have nothing to report.
  const s00 = v00 === NODATA ? null : v00;
  const s10 = v10 === NODATA ? null : v10;
  const s01 = v01 === NODATA ? null : v01;
  const s11 = v11 === NODATA ? null : v11;
  if ((s00 ?? s10 ?? s01 ?? s11) === null) return null;

  const c00 = s00 ?? s10 ?? s01 ?? s11!;
  const c10 = s10 ?? s00 ?? s11 ?? s01!;
  const c01 = s01 ?? s00 ?? s11 ?? s10!;
  const c11 = s11 ?? s10 ?? s01 ?? s00!;

  const r0 = c00 * (1 - dx) + c10 * dx;
  const r1 = c01 * (1 - dx) + c11 * dx;
  return r0 * (1 - dy) + r1 * dy;
}
