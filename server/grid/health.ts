/**
 * Grid health classification.
 *
 * Turns a Provenance record into a severity the rest of the system can act on.
 * Kept pure and free of I/O so it can be tested directly, and so the grid layer
 * never has to know that alerting or email exist.
 *
 * The levels map onto what actually went wrong:
 *
 *   ok        Everything came from the ECMWF family (tiers 1–2). Normal, even
 *             when tier 1 is rate-limited — tier 2 is the same model at the
 *             same resolution.
 *
 *   degraded  A GFS-family source contributed (tier 3 or 4). This only happens
 *             when ECMWF fell below the orchestrator's 98% family threshold, so
 *             both Open-Meteo paths were failing at once. The rendered field may
 *             show a seam, and GFS is ~28 km against ECMWF's 9 km.
 *
 *   critical  NOAA NOMADS (tier 4) contributed. That is the last resort: every
 *             Open-Meteo path, REST and S3 alike, failed. Worth waking someone.
 */

import { PROVIDERS } from "./providers/registry.js";
import type { Provenance, SourceId } from "./types.js";

export type GridSeverity = "ok" | "degraded" | "critical";

export interface GridHealth {
  severity: GridSeverity;
  /** One line fit for an admin panel row or an email subject. */
  summary: string;
  /** Sources outside the preferred ECMWF family that supplied points. */
  fallbackSources: Array<{ source: SourceId; label: string; points: number; tier: number }>;
}

const FAMILY_BY_SOURCE = new Map<SourceId, string>(PROVIDERS.map(p => [p.id, p.modelFamily]));
const TIER_BY_SOURCE = new Map<SourceId, number>(PROVIDERS.map(p => [p.id, p.tier]));

/** The tier that means every Open-Meteo route failed. */
const LAST_RESORT: SourceId = "nomads-gfs";

export function classifyGridHealth(provenance: Provenance | undefined): GridHealth {
  if (!provenance) {
    return { severity: "ok", summary: "no provenance recorded", fallbackSources: [] };
  }

  const contributing = provenance.bySource.filter(s => s.points > 0);
  const fallbackSources = contributing
    .filter(s => FAMILY_BY_SOURCE.get(s.source) !== "ecmwf")
    .map(s => ({ ...s, tier: TIER_BY_SOURCE.get(s.source) ?? 0 }));

  if (fallbackSources.length === 0) {
    return { severity: "ok", summary: "all points from ECMWF (tiers 1–2)", fallbackSources: [] };
  }

  const detail = fallbackSources.map(s => `${s.label} — ${s.points.toLocaleString()} points`).join("; ");
  const usedLastResort = fallbackSources.some(s => s.source === LAST_RESORT);

  return {
    severity: usedLastResort ? "critical" : "degraded",
    summary: usedLastResort
      ? `fell through to NOAA NOMADS — every Open-Meteo source failed (${detail})`
      : `GFS fallback in use — ECMWF could not cover the grid (${detail})`,
    fallbackSources,
  };
}
