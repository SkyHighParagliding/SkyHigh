import createLogger from "../../utils/logger.js";
import { fetchWithRetry } from "../../weather-utils.js";
import {
  OPEN_METEO_API_KEY,
  OPEN_METEO_URL,
  buildOpenMeteoBody,
} from "../../utils/openMeteo.js";
import type { GridProvider } from "./provider.js";
import type {
  GridRequest,
  PointSeries,
  ProviderResult,
  Variable,
} from "../types.js";

const log = createLogger("grid:openmeteo-api");

/** Inter-tile pause tuned against Open-Meteo's volume-based rate limiting. */
const TILE_DELAY_MS = 5000;

/** Open-Meteo batch limit — exceeding this returns an error. */
const MAX_POINTS_PER_TILE = 1000;

/**
 * Maps each canonical Variable to the Open-Meteo hourly field name.
 * For this API the names are identical, but the mapping is made explicit
 * so that any future divergence is caught here rather than silently wrong.
 */
const VARIABLE_TO_FIELD: Record<Variable, string> = {
  wind_speed_10m: "wind_speed_10m",
  wind_direction_10m: "wind_direction_10m",
  wind_gusts_10m: "wind_gusts_10m",
  temperature_2m: "temperature_2m",
  dew_point_2m: "dew_point_2m",
  cape: "cape",
  boundary_layer_height: "boundary_layer_height",
  weather_code: "weather_code",
  precipitation: "precipitation",
  precipitation_probability: "precipitation_probability",
  cloud_cover: "cloud_cover",
  cloud_cover_low: "cloud_cover_low",
  visibility: "visibility",
};

/** Parsed shape of a single point's hourly block in the Open-Meteo response. */
interface HourlyBlock {
  time?: string[];
  wind_speed_10m?: number[];
  wind_direction_10m?: number[];
  wind_gusts_10m?: number[];
  temperature_2m?: number[];
  dew_point_2m?: number[];
  cape?: number[];
  boundary_layer_height?: number[];
  weather_code?: number[];
  precipitation?: number[];
  precipitation_probability?: number[];
  cloud_cover?: number[];
  cloud_cover_low?: number[];
  visibility?: number[];
}

interface OpenMeteoResponseItem {
  hourly?: HourlyBlock;
}

function isRateLimit(err: unknown): boolean {
  return err instanceof Error && err.message.includes("429");
}

/** Resolves after `ms`, but rejects immediately if `signal` fires. */
function sleepAbortable(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

/**
 * Extracts canonical PointSeries values from a single Open-Meteo hourly block.
 * Units are already canonical from this API — Open-Meteo returns wind in knots
 * (via wind_speed_unit=kn), temperature in °C, and all other fields in the
 * units specified in types.ts. No conversion needed.
 */
function extractValues(
  h: HourlyBlock,
  variables: Variable[],
): Partial<Record<Variable, number[]>> {
  const values: Partial<Record<Variable, number[]>> = {};
  for (const v of variables) {
    const raw = h[VARIABLE_TO_FIELD[v] as keyof HourlyBlock];
    if (Array.isArray(raw)) {
      values[v] = raw as number[];
    }
  }
  return values;
}

/**
 * Tier-1 GridProvider backed by the Open-Meteo REST API (ECMWF IFS HRES).
 *
 * Batches incoming points into tiles of ≤ 1000 and POSTs each in sequence
 * with a 5 s inter-tile delay. A partial result (some tiles succeeded, some
 * failed) is normal and returned as-is; the orchestrator will fill missing
 * points from lower tiers.
 *
 * 429 handling: fetchWithRetry already rethrows on 429 without retrying.
 * When we receive a 429 we stop immediately and return whatever was collected —
 * burning more API quota waiting for more tiles would be counterproductive, and
 * the orchestrator escalates tiers on rate limit anyway.
 */
export const openMeteoApiProvider: GridProvider = {
  id: "openmeteo-api",
  tier: 1,
  modelFamily: "ecmwf",
  label: "Open-Meteo API (ECMWF IFS HRES)",
  resolutionDeg: 0.09,

  supports(_variable: Variable): boolean {
    // Open-Meteo IFS HRES serves all canonical variables.
    return true;
  },

  async available(): Promise<boolean> {
    // A probe request costs the same quota as a real fetch (rate-limited by
    // data volume, not request count). Return true unconditionally and let
    // fetch() surface real failures.
    return true;
  },

  async fetch(req: GridRequest): Promise<ProviderResult> {
    const { points, variables, forecastDays, signal } = req;
    const hourlyFields = variables.map(v => VARIABLE_TO_FIELD[v]).join(",");

    // Chunk input points into tiles, preserving order so results map positionally.
    const tiles: Array<{ lats: number[]; lons: number[] }> = [];
    for (let i = 0; i < points.length; i += MAX_POINTS_PER_TILE) {
      const chunk = points.slice(i, i + MAX_POINTS_PER_TILE);
      tiles.push({
        lats: chunk.map(p => p.lat),
        lons: chunk.map(p => p.lon),
      });
    }

    log.info(`Fetching ${points.length} points across ${tiles.length} tiles`);

    const collected: PointSeries[] = [];
    let tilesFailed = 0;

    for (let i = 0; i < tiles.length; i++) {
      if (signal?.aborted) {
        log.info(`Aborted after tile ${i}/${tiles.length}`);
        break;
      }

      const tile = tiles[i];
      const body = buildOpenMeteoBody({
        lats: tile.lats,
        lons: tile.lons,
        hourlyFields,
        forecastDays,
        apiKey: OPEN_METEO_API_KEY || undefined,
      });

      try {
        const raw: unknown = await fetchWithRetry(OPEN_METEO_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal,
        });

        const results: OpenMeteoResponseItem[] = Array.isArray(raw) ? raw : [raw as OpenMeteoResponseItem];

        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          if (!r?.hourly) continue;
          const h = r.hourly;

          // Guard: a point without both wind arrays is unusable downstream.
          if (!Array.isArray(h.wind_speed_10m) || !Array.isArray(h.wind_direction_10m)) {
            log.warn(`Skipping point ${tile.lats[j]},${tile.lons[j]} — missing wind arrays`);
            continue;
          }

          collected.push({
            lat: tile.lats[j],
            lon: tile.lons[j],
            time: h.time ?? [],
            values: extractValues(h, variables),
          });
        }

        log.debug(`Tile ${i + 1}/${tiles.length} ok — ${results.length} points`);
      } catch (err) {
        if (isRateLimit(err)) {
          // 429: stop immediately. The orchestrator escalates tiers on rate limit;
          // continuing to burn quota serves no purpose.
          log.warn(`Rate limited on tile ${i + 1}/${tiles.length} — abandoning remaining tiles`, {
            collected: collected.length,
          });
          if (collected.length === 0) {
            throw err;
          }
          return { source: "openmeteo-api", points: collected };
        }

        tilesFailed++;
        log.error(`Tile ${i + 1}/${tiles.length} failed`, err instanceof Error ? err.message : err);
      }

      if (i < tiles.length - 1) {
        try {
          await sleepAbortable(TILE_DELAY_MS, signal);
        } catch {
          log.info(`Aborted during inter-tile sleep after tile ${i + 1}`);
          break;
        }
      }
    }

    if (collected.length === 0 && tilesFailed > 0) {
      throw new Error(`All ${tilesFailed} tiles failed — no data fetched`);
    }

    log.info(`Fetch complete — ${collected.length}/${points.length} points from ${tiles.length - tilesFailed}/${tiles.length} tiles`);
    return { source: "openmeteo-api", points: collected };
  },
};
