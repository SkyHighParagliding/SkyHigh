/**
 * Shared fetch pipeline for both persisted grids.
 *
 * The fine and thermal grids differ only in geometry, variable set and point
 * shape. Everything else — day-cache read, in-flight de-duplication, progress
 * reporting, the completeness safeguard, persistence and memory caching — is
 * identical, and lives here once.
 *
 * Flow:
 *   1. Unless forced, return today's cached row if it is younger than the
 *      expiry window.
 *   2. De-duplicate concurrent callers onto a single in-flight fetch.
 *   3. Ask the orchestrator for a merged grid over this kind's point set.
 *   4. If completeness is below COMPLETENESS_THRESHOLD, prefer the previous
 *      cache over overwriting good data with a sparse grid.
 *   5. Convert to the legacy persisted shape, store, and cache in memory.
 */

import createLogger from "../utils/logger.js";
import { reportGridHealth } from "../utils/gridAlerts.js";
import { fetchMergedGrid, type OrchestratorOptions } from "./orchestrator.js";
import { cleanupOldGrids, melbourneToday, readGrid, readLatestGrid, setStatus, writeGrid } from "./store.js";
import type { GridEnvelope } from "./bounds.js";
import { getGridBounds, gridDimensions } from "./bounds.js";
import type { LatLon, MergedGrid, MergedPoint, Variable } from "./types.js";

const log = createLogger("grid:pipeline");

/** A stored grid is reused for a day plus two hours, so a late cron still hits cache. */
const GRID_CACHE_EXPIRY_MS = 26 * 60 * 60 * 1000;

/** In-process cache lifetime — bounds how stale a hot request can be. */
const MEM_CACHE_TTL_MS = 30 * 60 * 1000;

/**
 * Below this fraction of requested points we keep the previous day's cache
 * rather than publishing a sparse grid: a day-old full field renders better
 * than a fresh one full of holes.
 */
const COMPLETENESS_THRESHOLD = 0.8;

/** Days of history retained in wind_grid_data per base key. */
const RETAIN_DAYS = 7;

const FORECAST_DAYS = 2;

/** The persisted grid shape for a kind: an envelope plus an array of points. */
export type PersistedGrid<P> = GridEnvelope & { points: P[] };

/**
 * Everything that distinguishes one grid kind from the other.
 * `buildPoint` is the only place the persisted per-point shape is constructed.
 *
 * @typeParam P - the persisted per-point shape (GridPoint or ThermalPoint).
 */
export interface GridKind<P> {
  /** wind_grid_data key prefix, e.g. "fine_grid". */
  baseKey: string;
  /** Settings key for the live progress string. */
  progressKey: string;
  /** Settings key holding the last run's Provenance as JSON, for the admin panel. */
  provenanceKey: string;
  /** Settings key holding the last run's GridHealthRecord as JSON. */
  healthKey: string;
  /** Human name for this grid, used in the admin panel and alert emails. */
  label: string;
  /** Grid spacing in degrees. */
  delta: number;
  /** Everything the caller wants from the providers. */
  variables: Variable[];
  /** Without these the grid is useless; providers lacking them are skipped. */
  required: Variable[];
  /** Variables permitted to contain gaps (see GridRequest.optional). */
  optional?: Variable[];
  /** The point set to request, derived from the configured bounds. */
  buildPoints(): Promise<LatLon[]>;
  /** Converts one merged point into the persisted per-point shape. */
  buildPoint(point: MergedPoint, time: string[]): P;
}

/** Mutable per-kind runtime state, kept out of module scope so it is not exported. */
interface KindState<G> {
  memGrid: G | null;
  memGridAt: number;
  inflight: Promise<G> | null;
  /** AbortController for the running fetch, if any. Replaced each time a new fetch starts. */
  controller: AbortController | null;
  /** Wall-clock ms when the current fetch started; null when idle. */
  startedAt: number | null;
}

const states = new Map<string, KindState<unknown>>();

function stateFor<G>(baseKey: string): KindState<G> {
  let s = states.get(baseKey);
  if (!s) {
    s = { memGrid: null, memGridAt: 0, inflight: null, controller: null, startedAt: null };
    states.set(baseKey, s);
  }
  return s as KindState<G>;
}

// ---------------------------------------------------------------------------
// Cancellation
// ---------------------------------------------------------------------------

/**
 * Thrown (and re-thrown) when a grid fetch is explicitly cancelled via
 * cancelGridFetch(). Callers that need to distinguish a cancellation from a
 * real failure should check with isGridFetchCancelled() rather than catching
 * the class directly, to avoid coupling to the exact class reference across
 * module boundaries.
 */
export class GridFetchCancelledError extends Error {
  constructor(baseKey: string) {
    super(`Grid fetch cancelled: ${baseKey}`);
    this.name = "GridFetchCancelledError";
  }
}

export function isGridFetchCancelled(err: unknown): err is GridFetchCancelledError {
  return err instanceof GridFetchCancelledError;
}

/**
 * Aborts the running fetch for the given base key. Returns true when a fetch
 * was actually running, false when idle (no-op).
 */
export function cancelGridFetch(baseKey: string): boolean {
  const state = stateFor(baseKey);
  if (!state.controller) return false;
  state.controller.abort();
  return true;
}

/**
 * Current execution status for the given base key — whether a fetch is running
 * and when it started. Used by the "Fetch Now" routes to compose an accurate
 * response message before kicking off a new fetch.
 */
export function getGridFetchStatus(baseKey: string): { running: boolean; startedAt: number | null } {
  const state = stateFor(baseKey);
  return { running: state.inflight !== null, startedAt: state.startedAt };
}

// ---------------------------------------------------------------------------
// Fetch-active flag
// ---------------------------------------------------------------------------

let activeFetches = 0;

/**
 * True while any grid fetch is running. The weather scraper yields on this so
 * the two do not compete for the same Open-Meteo quota.
 */
export function isGridFetchActive(): boolean {
  return activeFetches > 0;
}

// ---------------------------------------------------------------------------
// Result flags
// ---------------------------------------------------------------------------

/**
 * Whether the last completed fetch for a base key published fresh data, as
 * opposed to falling back to a previous cache. Read by the scheduler to phrase
 * its result message; a plain accessor rather than a mutable export so the
 * value cannot be written from another module.
 */
const lastFreshByKey = new Map<string, boolean>();

export function wasLastFetchFresh(baseKey: string): boolean {
  return lastFreshByKey.get(baseKey) ?? false;
}

// ---------------------------------------------------------------------------
// Memory cache
// ---------------------------------------------------------------------------

export function clearMemoryCaches(): void {
  for (const s of states.values()) {
    s.memGrid = null;
    s.memGridAt = 0;
  }
}

/** Memory cache → today's row → newest row of any day. Null when nothing is stored. */
export async function getCachedGrid<P>(kind: GridKind<P>): Promise<PersistedGrid<P> | null> {
  type G = PersistedGrid<P>;
  const state = stateFor<G>(kind.baseKey);
  if (state.memGrid && Date.now() - state.memGridAt < MEM_CACHE_TTL_MS) {
    return state.memGrid;
  }

  try {
    const today = await readGrid<G>(kind.baseKey);
    const grid = today?.grid ?? (await readLatestGrid<G>(kind.baseKey));
    if (grid) {
      state.memGrid = grid;
      state.memGridAt = Date.now();
      return grid;
    }
  } catch (err) {
    log.error(`${kind.baseKey}: cache read failed`, err instanceof Error ? err.message : err);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

export async function fetchGrid<P>(kind: GridKind<P>, force = false): Promise<PersistedGrid<P>> {
  type G = PersistedGrid<P>;
  const state = stateFor<G>(kind.baseKey);

  if (!force) {
    try {
      const cached = await readGrid<G>(kind.baseKey);
      if (cached && Date.now() - cached.updatedAt.getTime() < GRID_CACHE_EXPIRY_MS) {
        const ageMin = Math.round((Date.now() - cached.updatedAt.getTime()) / 60000);
        log.info(`${kind.baseKey}: using cached data (age ${ageMin}min)`);
        state.memGrid = cached.grid;
        state.memGridAt = Date.now();
        return cached.grid;
      }
    } catch (err) {
      log.warn(`${kind.baseKey}: cache read failed, refetching`, err instanceof Error ? err.message : err);
    }
  }

  if (state.inflight) {
    if (!force) {
      // Non-forced callers (ordinary reads) join the in-flight fetch rather than
      // racing against it — they all want the same grid and the first one to ask
      // already triggered the work.
      log.info(`${kind.baseKey}: joining in-flight fetch`);
      return state.inflight;
    }

    // force === true with a fetch already running: the user explicitly asked for a
    // fresh start (e.g. "Fetch Now" while a previous run was wedged). Cancel the
    // running fetch and wait for its promise to settle — the finally block in the
    // outer try below will clear state.inflight and decrement activeFetches before
    // we proceed, so we never start a second fetch while the cancelled one is still
    // winding down.
    log.warn(`${kind.baseKey}: force-cancelling in-flight fetch before starting fresh`);
    state.controller?.abort();
    try {
      await state.inflight;
    } catch {
      // Expected: the cancelled fetch throws GridFetchCancelledError (or an AbortError
      // if a lower layer surfaces it first). Either way we don't care — we're about
      // to start a new fetch.
    }
    // state.inflight is now null: the owning fetchGrid call registered its finally
    // on this promise before we registered our await, and promise reactions run in
    // registration order, so its cleanup has already run.

    // Unless another forced caller got here first and started a fresh fetch while
    // we were waiting. That fetch is already newer than this request, so join it
    // instead. Without this, two near-simultaneous force calls each cancel the
    // other's brand-new fetch and neither ever completes.
    if (state.inflight) {
      log.info(`${kind.baseKey}: a fresh fetch already started — joining it`);
      return state.inflight;
    }
  }

  const controller = new AbortController();
  state.controller = controller;
  state.startedAt = Date.now();
  state.inflight = runFetch(kind, state, controller.signal);
  activeFetches++;
  try {
    return await state.inflight;
  } finally {
    state.inflight = null;
    state.controller = null;
    state.startedAt = null;
    activeFetches--;
  }
}

async function runFetch<P>(
  kind: GridKind<P>,
  state: KindState<PersistedGrid<P>>,
  signal: AbortSignal,
): Promise<PersistedGrid<P>> {
  type G = PersistedGrid<P>;
  const bounds = await getGridBounds();
  const points = await kind.buildPoints();
  const { ni, nj } = gridDimensions(bounds, kind.delta);

  log.info(`${kind.baseKey}: fetching ${points.length} points`);
  await setStatus(kind.progressKey, `Starting · ${points.length} pts`);

  let progressChain: Promise<void> = Promise.resolve();
  const opts: OrchestratorOptions = {
    onProgress: msg => {
      progressChain = progressChain.then(() => setStatus(kind.progressKey, msg));
    },
  };

  let merged: MergedGrid;
  let cancelled = false;
  try {
    merged = await fetchMergedGrid(
      { points, variables: kind.variables, required: kind.required, optional: kind.optional ?? [], forecastDays: FORECAST_DAYS, signal },
      opts,
    );

    // The orchestrator honours the signal at polling points but does not throw on
    // abort — it simply stops filling points and returns whatever it had so far.
    // Check the signal here so the persistence block below is never reached when
    // the caller has already cancelled this run.
    if (signal.aborted) cancelled = true;
  } catch (err) {
    if (signal.aborted) cancelled = true;
    // Re-throw regardless: if cancelled, the outer catch in fetchGrid handles it;
    // if a real error, the caller's catch (scheduler / route) handles it.
    throw cancelled ? new GridFetchCancelledError(kind.baseKey) : err;
  } finally {
    // Always clear progress, cancelled or not. Wait for every queued write to land
    // first so this clear cannot be overtaken by a late in-flight progress write.
    await progressChain;
    await setStatus(kind.progressKey, "");
  }

  // A cancelled run must not persist anything — no grid, no provenance, no health
  // record. This is the exit for the case where fetchMergedGrid returned normally
  // after observing the abort (it stops filling points rather than throwing); the
  // throwing case has already left via the catch above.
  if (cancelled) throw new GridFetchCancelledError(kind.baseKey);

  // Recorded regardless of which branch follows — the admin panel should see
  // what the providers actually returned, even when we then keep the old cache.
  await setStatus(kind.provenanceKey, JSON.stringify(merged.provenance));

  // Sits here rather than in the scheduler so that a manual admin fetch is held
  // to the same account as the 5am cron. A fallback to tier 4 is equally worth
  // knowing about whoever asked for the data.
  await reportGridHealth(kind.healthKey, kind.label, merged.provenance);

  const { requested, missing } = merged.provenance;
  const completeness = requested > 0 ? (requested - missing) / requested : 0;

  if (completeness < COMPLETENESS_THRESHOLD) {
    log.warn(
      `${kind.baseKey}: only ${requested - missing}/${requested} points (${Math.round(completeness * 100)}%) — preferring previous cache`,
    );
    const previous = await loadPrevious<G>(kind.baseKey);
    if (previous) {
      lastFreshByKey.set(kind.baseKey, false);
      state.memGrid = previous;
      state.memGridAt = Date.now();
      return previous;
    }
    // No previous cache to fall back to — a sparse grid still beats nothing.
    log.warn(`${kind.baseKey}: no previous cache available — storing the sparse grid`);
  }

  const grid: G = {
    latMin: bounds.fineLatMin,
    latMax: bounds.fineLatMax,
    lonMin: bounds.fineLonMin,
    lonMax: bounds.fineLonMax,
    delta: kind.delta,
    ni,
    nj,
    fetchedAt: Date.now(),
    provenance: merged.provenance,
    points: merged.points.map(p => kind.buildPoint(p, merged.time)),
  };

  const today = melbourneToday();
  await writeGrid(kind.baseKey, today, grid);
  await cleanupOldGrids(kind.baseKey, RETAIN_DAYS);

  lastFreshByKey.set(kind.baseKey, true);
  state.memGrid = grid;
  state.memGridAt = Date.now();
  log.info(`${kind.baseKey}: stored ${merged.points.length} points for ${today}`);
  return grid;
}

/** Today's row if present, otherwise the newest row of any day. */
async function loadPrevious<G>(baseKey: string): Promise<G | null> {
  try {
    const today = await readGrid<G>(baseKey);
    if (today) return today.grid;
    return await readLatestGrid<G>(baseKey);
  } catch (err) {
    log.error(`${baseKey}: fallback cache read failed`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Merged → persisted value helper
// ---------------------------------------------------------------------------

/**
 * Reads one variable off a merged point as a plain number array.
 *
 * When `allowGaps` is false (the default), the function asserts that every
 * value is finite. We assert rather than coerce: substituting a number for a
 * gap would put invented weather into the grid — 0 kn reads as dead calm —
 * and it is far better to fail the fetch and serve yesterday's cache than to
 * serve a plausible-looking lie.
 *
 * When `allowGaps` is true, the function writes NaN into `out[i]` instead of
 * throwing. This is safe only for variables declared in the grid kind's
 * `optional` list, because:
 *  - `JSON.stringify` converts NaN to `null` on the way to the client.
 *  - `extract.ts` already normalises both `null` and `NaN` to `undefined`
 *    (see the `li`/`cin` handling around extract.ts:511-521), so absence
 *    stays absence and is never shown as a value.
 * The coerce-to-0 warning still applies to non-gap-tolerant variables: a 0
 * would render as dead calm, which is a lie a pilot might act on.
 */
export function seriesOf(
  point: MergedPoint, variable: Variable, length: number, allowGaps = false,
): number[] {
  const raw = point.values[variable];
  if (!raw) return [];
  const out = new Array<number>(length);
  for (let i = 0; i < length; i++) {
    const v = raw[i];
    if (!Number.isFinite(v)) {
      if (allowGaps) {
        out[i] = NaN;
        continue;
      }
      throw new Error(
        `seriesOf: non-finite ${variable} at hour ${i} for ${point.lat},${point.lon} — orchestrator should have trimmed this`,
      );
    }
    out[i] = v;
  }
  return out;
}
