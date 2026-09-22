# Plan — move bulk grid fetch to the S3 mirror (option A), keep API for top-up + soundings

**Branch:** `fix/grid-mirror-primary` (off `main` @ 6295be5). Not started — this is the design.
**Why:** 2026-09-22 prod incident — Open-Meteo free-tier daily quota exhausted (HTTP 429 on SkewT soundings). Root: the grid provider chain is **API-first** (rate-limited) + the volume-full crash-loop hammered the API. Move bulk grid to the unlimited S3 mirror; reserve the API for the two fields S3 lacks + soundings. Decision: option **A** (keep weather_code + precipitation_probability via a targeted top-up). No paid API key (free tier is fine once bulk is off it).

## Current state (verified in code)
- `server/grid/providers/registry.ts` — tier order is **1 API, 2 S3-ECMWF, 3 S3-GFS, 4 NOMADS**. API is most-preferred.
- S3-ECMWF (tier 2) lacks `weather_code`, `precipitation_probability` (registry comment). It HAS wind, precip amount, cape, BLH, cloud cover, temp, visibility(?).
- Merge is **per-point** (`orchestrator.ts:303` `if (filled.has(key)) continue`) — once a point is filled, later tiers are skipped for it. So a plain reorder would leave S3 points **without** weather_code/precip_prob.
- `fineGrid.ts:18` FINE_VARIABLES includes weather_code + precipitation_probability; `FINE_REQUIRED` = wind only; no `optional` list.
- `pipeline.ts:426` `seriesOf(allowGaps=false)` **throws** on non-finite for non-optional vars; `if (!raw) return []` when the variable is entirely absent. So S3 points with absent weather_code → empty array (degraded), present-but-NaN → throw.

## Implementation steps
1. **Reorder registry** → S3-ECMWF primary, API demoted below it (tier numbers: S3-ECMWF 1, API 2, S3-GFS 3, NOMADS 4). Keeps API as fallback for points S3 can't fill.
2. **Field top-up pass** (the substantive part): after the merged grid is built, run a dedicated API fetch for **only** `[weather_code, precipitation_probability]` across the grid points and merge those two series **per-variable** into the already-filled MergedPoints (overwrite `values[weather_code]` / `values[precipitation_probability]`). Likely a new function in `pipeline.ts` (runs inside `runFetch` after `fetchMergedGrid`, before `buildPoint`). Must:
   - Reindex the top-up series onto `merged.time` (canonical axis) — reuse `reindexOntoCanonical`.
   - Degrade gracefully: if the top-up 429s or errors, leave the fields absent (empty) rather than throw — and DO NOT fail the whole grid. (Consider adding weather_code + precipitation_probability to the fine grid's `optional` list so `seriesOf` writes NaN→null instead of throwing when the top-up is unavailable.)
   - Be quota-light: 2 vars vs the old ~12, so ~1/6 the volume.
3. **Startup-fetch guard** (prevents a crash-loop from re-draining the API): on boot, don't unconditionally run catch-up Open-Meteo fetches; skip/cooldown if a fetch ran recently or if the process is restarting repeatedly. Location: startup path in `server/index.ts` / `server/utils/scheduledJobs.ts`.

## VERIFICATION (mandatory before deploy — safety-critical path)
- Run a real fine-grid fetch locally (force) with API demoted; confirm:
  - wind/gust/precip/cape/BLH/cloud come from S3 (check provenance/source), grid completeness ≥ 0.8.
  - weather_code + precipitation_probability are **populated** (not all-0, not all-NaN) on S3-sourced points after the top-up.
  - With the top-up deliberately disabled/429'd: the fetch still SUCCEEDS (no throw) and those two fields degrade to absent, not to 0. (This is the "dangerous lie" guard — 0 = clear sky / no rain.)
- Inspect the decoded field, don't trust typecheck (project rule: verify the decoded artifact).
- Confirm Open-Meteo daily volume drops sharply (bulk now on S3).

## Deploy
- Push branch → PR → merge to `main` = Railway auto-deploy. Jon's call; do not deploy the live weather path without sign-off.

## Optional / follow-up
- Open-Meteo API key (`OPEN_METEO_API_KEY`, already supported) — not required now; future headroom.
- The extended (7-day) per-site forecast (`extendedForecast.ts`) also hits the API directly — separate path; could move later but out of scope here.
