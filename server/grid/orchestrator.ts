/**
 * Grid orchestrator — turns four independent providers into one coherent grid.
 *
 * Merge policy summary:
 *  1. Skip providers that cannot supply all `req.required` variables.
 *  2. Walk providers family-by-family, lowest tier first.
 *  3. Within a family, each provider is asked only for the points still missing.
 *  4. If a family covers ≥ FAMILY_COMPLETE_THRESHOLD (0.98) of points, stop —
 *     the 2% ragged edge is less damaging than a visible seam through the map.
 *  5. Only if coverage is below that threshold, continue into the next family
 *     (set mixedFamilies = true).
 *  6. Time axes from different providers are NOT assumed to align — each
 *     provider's series is re-indexed onto the canonical axis established by
 *     the first provider to return data.
 *  7. A 429 ends the current provider; proceed to the next tier immediately.
 *  8. If every provider returns nothing, throw — the caller falls back to
 *     the previous day's cache.
 */

import createLogger from "../utils/logger.js";
import type { GridProvider } from "./providers/provider.js";
import { PROVIDERS } from "./providers/registry.js";
import type {
  GridRequest,
  MergedGrid,
  MergedPoint,
  ModelFamily,
  PointSeries,
  Provenance,
  SourceId,
  Variable,
} from "./types.js";
import { pointKey } from "./types.js";

const log = createLogger("grid:orchestrator");

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

/**
 * When a model family covers this fraction of requested points, we stop and
 * do NOT pull in the next family. A 2% ragged edge (unfilled coastal/corner
 * points) is invisible in practice; a family seam through the middle of the
 * map is clearly visible.
 */
const FAMILY_COMPLETE_THRESHOLD = 0.98;

// ---------------------------------------------------------------------------
// Rate-limit detection
// ---------------------------------------------------------------------------

function isRateLimit(err: unknown): boolean {
  return err instanceof Error && err.message.includes("429");
}

// ---------------------------------------------------------------------------
// Time-axis re-indexing
// ---------------------------------------------------------------------------

/**
 * Re-indexes a provider's PointSeries onto the canonical time axis.
 *
 * This is the most critical correctness guarantee in the orchestrator.
 * Providers return different time arrays: a tier-1 REST fetch, an S3 archive
 * read, and a NOMADS GRIB download will disagree on start hour, length, and
 * step. Positional alignment would silently shift every value by 1–N hours —
 * the forecast would look plausible but be wrong.
 *
 * We build a lookup from timestamp string → position in the provider's own
 * axis, then fill canonical positions by string match, writing NaN where the
 * provider has no value for that hour.
 */
function reindexOntoCanonical(
  series: PointSeries,
  canonicalTime: string[],
): Omit<MergedPoint, "source"> {
  // Build the lookup once per series.
  const providerIndexByTime = new Map<string, number>();
  for (let i = 0; i < series.time.length; i++) {
    providerIndexByTime.set(series.time[i], i);
  }

  const values: Partial<Record<Variable, number[]>> = {};
  const n = canonicalTime.length;

  for (const [variable, providerValues] of Object.entries(series.values) as [Variable, number[]][]) {
    const aligned = new Array<number>(n).fill(NaN);
    for (let ci = 0; ci < n; ci++) {
      const pi = providerIndexByTime.get(canonicalTime[ci]);
      if (pi !== undefined && pi < providerValues.length) {
        aligned[ci] = providerValues[pi];
      }
      // else NaN — provider had no data for this hour
    }
    values[variable] = aligned;
  }

  return { lat: series.lat, lon: series.lon, values };
}

/**
 * The longest contiguous run of hours for which every point has a finite value
 * in every variable it carries, as `[start, end)`.
 *
 * A window rather than a prefix, because gaps appear at either end: a source
 * whose cycle starts later than the canonical axis leaves holes at the front,
 * one with a shorter horizon leaves them at the back. Trimming to the shared
 * window is what lets a grid assembled from disagreeing axes stay dense.
 */
function coveredWindow(points: MergedPoint[], axisLength: number): [number, number] {
  const ok = new Array<boolean>(axisLength).fill(true);
  for (const p of points) {
    for (const series of Object.values(p.values) as number[][]) {
      for (let i = 0; i < axisLength; i++) {
        if (!Number.isFinite(series[i])) ok[i] = false;
      }
    }
  }

  let bestStart = 0, bestLen = 0, runStart = 0, runLen = 0;
  for (let i = 0; i < axisLength; i++) {
    if (ok[i]) {
      if (runLen === 0) runStart = i;
      runLen++;
      if (runLen > bestLen) { bestLen = runLen; bestStart = runStart; }
    } else {
      runLen = 0;
    }
  }
  return [bestStart, bestStart + bestLen];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface OrchestratorOptions {
  onProgress?: (msg: string) => void;
  /** Override the provider list (used in tests). */
  providers?: readonly GridProvider[];
}

/**
 * Fetches a merged grid from the provider chain.
 *
 * @param req   The grid request (points, variables, required subset, signal).
 * @param opts  Optional progress callback and provider override for testing.
 * @returns     A fully merged grid with provenance.
 * @throws      If no provider returns any data at all.
 */
export async function fetchMergedGrid(
  req: GridRequest,
  opts: OrchestratorOptions = {},
): Promise<MergedGrid> {
  const providers = opts.providers ?? PROVIDERS;
  const progress = opts.onProgress ?? (() => undefined);

  // ── Eligibility filtering ──────────────────────────────────────────────────
  // A provider is eligible only if it supports every required variable.
  // Ineligible providers are noted in provenance but never contacted.

  const notes: string[] = [];
  const required = req.required ?? [];

  const eligible = providers.filter(p => {
    if (required.every(v => p.supports(v))) return true;
    const missing = required.filter(v => !p.supports(v));
    notes.push(`${p.id}: skipped — does not supply required variable(s): ${missing.join(", ")}`);
    log.info(`Skipping ${p.id} — missing required: ${missing.join(", ")}`);
    return false;
  });

  if (eligible.length === 0) {
    throw new Error("No eligible provider can supply all required variables");
  }

  // ── Group into families, preserving tier order ─────────────────────────────
  // The family whose lowest-tier provider has the smallest tier number goes first.

  const familyFirstTier = new Map<ModelFamily, number>();
  for (const p of eligible) {
    const current = familyFirstTier.get(p.modelFamily);
    if (current === undefined || p.tier < current) {
      familyFirstTier.set(p.modelFamily, p.tier);
    }
  }

  // Sort families by their lowest tier, then providers within each family by tier.
  const sortedFamilies = [...familyFirstTier.entries()]
    .sort(([, a], [, b]) => a - b)
    .map(([family]) => family);

  const providersByFamily = new Map<ModelFamily, GridProvider[]>();
  for (const family of sortedFamilies) {
    providersByFamily.set(
      family,
      eligible.filter(p => p.modelFamily === family).sort((a, b) => a.tier - b.tier),
    );
  }

  // ── Merge state ───────────────────────────────────────────────────────────

  const total = req.points.length;
  const filled = new Map<string, MergedPoint>();    // pointKey → merged point
  let canonicalTime: string[] | null = null;         // set by the first successful provider

  const bySource: Array<{ source: SourceId; label: string; points: number }> = [];
  const familyBySource = new Map<SourceId, ModelFamily>(eligible.map(p => [p.id, p.modelFamily]));
  let previousFamily: ModelFamily | null = null;

  // ── Walk families ─────────────────────────────────────────────────────────

  for (const family of sortedFamilies) {
    const familyProviders = providersByFamily.get(family)!;

    if (previousFamily !== null) {
      // Reached only when the previous family finished below threshold.
      log.warn(`Crossing family boundary ${previousFamily} → ${family}`);
    }
    previousFamily = family;

    for (const provider of familyProviders) {
      if (req.signal?.aborted) break;

      const missing = req.points.filter(p => !filled.has(pointKey(p)));
      if (missing.length === 0) break;

      const coverage = filled.size / total;
      log.info(`${provider.id}: requesting ${missing.length} missing points (${(coverage * 100).toFixed(1)}% filled so far)`);
      progress(`${provider.label}: fetching ${missing.length} points`);

      const subReq: GridRequest = { ...req, points: missing };

      let result;
      try {
        result = await provider.fetch(subReq);
      } catch (err) {
        if (isRateLimit(err)) {
          notes.push(`${provider.id}: rate-limited (429) — skipped`);
          log.warn(`${provider.id} rate-limited — moving to next tier`);
          progress(`${provider.label}: rate limited, trying next tier`);
          continue;
        }
        notes.push(`${provider.id}: fetch error — ${err instanceof Error ? err.message : String(err)}`);
        log.error(`${provider.id} fetch error`, err instanceof Error ? err.message : err);
        progress(`${provider.label}: error, trying next tier`);
        continue;
      }

      if (result.degraded) {
        notes.push(`${provider.id}: ${result.degraded}`);
      }

      // The first provider to return data sets the canonical time axis.
      // Every later provider's series is re-indexed onto this axis by matching
      // timestamp strings, with NaN where it has no value for a given hour.
      if (canonicalTime === null && result.points.length > 0) {
        canonicalTime = result.points[0].time;
        log.info(`Canonical time axis set by ${provider.id}: ${canonicalTime.length} hours, ${canonicalTime[0]} – ${canonicalTime[canonicalTime.length - 1]}`);
      }

      let newCount = 0;
      for (const series of result.points) {
        const key = pointKey(series);
        if (filled.has(key)) continue; // already filled by a better tier

        const { lat, lon, values } = reindexOntoCanonical(series, canonicalTime!);
        filled.set(key, { lat, lon, source: provider.id, values });
        newCount++;
      }

      if (newCount > 0) {
        bySource.push({ source: provider.id, label: provider.label, points: newCount });
        log.info(`${provider.id}: contributed ${newCount} points (total filled: ${filled.size}/${total})`);
      }

      progress(`${provider.label}: contributed ${newCount} points (${filled.size}/${total} filled)`);
    }

    // After exhausting this family, stop if it got us far enough. Otherwise the
    // loop falls through to the next family — a seam beats a hole.
    const coverage = filled.size / total;
    if (coverage >= FAMILY_COMPLETE_THRESHOLD) {
      // Good enough — a 2% ragged edge beats a cross-family seam.
      log.info(`Family "${family}" complete: ${(coverage * 100).toFixed(1)}% coverage — stopping`);
      break;
    }

    log.info(`Family "${family}" ended at ${(coverage * 100).toFixed(1)}% coverage — escalating to next family`);
  }

  // ── Guard: nothing returned ───────────────────────────────────────────────

  if (filled.size === 0 || canonicalTime === null) {
    throw new Error(
      "fetchMergedGrid: no provider returned any data — caller should fall back to previous day's cache",
    );
  }

  // ── Assemble result ───────────────────────────────────────────────────────

  const points: MergedPoint[] = [...filled.values()];
  const missingCount = total - filled.size;

  if (missingCount > 0) {
    notes.push(`${missingCount} point(s) not covered by any provider`);
  }

  // Re-indexing leaves NaN at any hour a source could not cover. Those holes
  // must not survive into the grid: downstream the arrays are plain numbers,
  // and a gap that reads as 0 would render as dead calm — indistinguishable
  // from genuinely still air, in a tool people use to decide whether to fly.
  // So we trim the axis to the leading run of fully-covered hours instead of
  // encoding absence as a value. A shorter honest forecast beats a longer one
  // with invented calm in it.
  const [from, to] = coveredWindow(points, canonicalTime.length);
  if (to === 0) {
    throw new Error("fetchMergedGrid: no hour was covered by every point — refusing to emit a grid with holes");
  }
  if (to - from < canonicalTime.length) {
    const dropped = canonicalTime.length - (to - from);
    notes.push(`Forecast trimmed by ${dropped}h to ${canonicalTime[from]} – ${canonicalTime[to - 1]} — not every source covered the full horizon`);
    log.warn(`Trimming canonical axis ${canonicalTime.length}h → ${to - from}h (incomplete coverage)`);
    canonicalTime = canonicalTime.slice(from, to);
    for (const p of points) {
      for (const key of Object.keys(p.values) as Variable[]) {
        p.values[key] = p.values[key]!.slice(from, to);
      }
    }
  }

  // Derived from what actually contributed, not from which families we walked:
  // entering a second family whose providers all then failed leaves the grid
  // single-family, and the admin panel should not warn about a seam that is
  // not there.
  const contributingFamilies = new Set(bySource.map(s => familyBySource.get(s.source)));
  const mixedFamilies = contributingFamilies.size > 1;
  if (mixedFamilies) {
    notes.push(`Mixed model families (${[...contributingFamilies].join(" + ")}) — the rendered field may show a seam`);
  }

  const provenance: Provenance = {
    bySource,
    missing: missingCount,
    requested: total,
    mixedFamilies,
    notes,
  };

  progress(`Done: ${filled.size}/${total} points, ${bySource.length} source(s)${mixedFamilies ? ", mixed families" : ""}`);
  log.info(`fetchMergedGrid complete`, {
    filled: filled.size,
    total,
    missing: missingCount,
    sources: bySource.map(s => `${s.source}:${s.points}`).join(", "),
    mixedFamilies,
  });

  return { time: canonicalTime, points, provenance };
}
