# RESUME_HERE — Last updated: 2026-09-12 (session 56)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 56 — diagnosed the production Wind Grid failure and began building a
tiered multi-source weather-grid layer so a rate-limited Open-Meteo can never
again leave the map with no data.

**The production bug (fixed, commit `2d6357e`):** `startupGridCheck` decided
whether to fetch using a last-run timestamp. A *failed* run still writes that
timestamp, so the failed 5am cron looked like a recent success and the startup
fetch was skipped — the grid stayed stuck on 11/9. It now checks for the
existence of today's `wind_grid_data` row. Same commit also stops
`fetchWithRetry` burning 5 retries on a 429 (the earlier fix `f278aa7` was dead
code — both branches threw identically), routes the hourly wind endpoint through
`OPEN_METEO_URL` so it actually uses the API key, and widens tile spacing 3s→5s.

**Commits this session (2, NOT pushed):**
1. `2d6357e` — the three fixes above
2. `e4a5194` — `server/grid/` provider layer: contract, GRIB2 decoder, tiers 1 & 4

## The 4-tier design (approved)

| Tier | Source | Quality | Status |
|---|---|---|---|
| 1 | Open-Meteo REST API | 9 km ECMWF IFS HRES (baseline) | ✅ `openMeteoApi.ts` |
| 2 | Open-Meteo S3 `ecmwf_ifs` | **identical data, zero loss** | 🔄 in progress |
| 3 | Open-Meteo S3 `ncep_gfs013` | 0.1° GFS — model change | 🔄 in progress |
| 4 | NOAA NOMADS GFS 0.25° | 28 km, emergency only | ✅ `nomadsGfs.ts` |

Tier 1↔2 mix seamlessly (same model). Mixing GFS with ECMWF creates a visible
seam in the rendered field, so the orchestrator should prefer completing the
whole grid from one model and flag cross-model mixes in the admin panel.

**Key empirical finding that inverted the original plan:** ECMWF's *own* free
open data is the worst option — 0.25°, **no `boundary_layer_height` field at
all**, CCSDS/AEC packing needing native libaec, no server-side subsetting, and
`data.ecmwf.int` itself returns 429s. Open-Meteo's S3 archive carries the
identical 9 km `ecmwf_ifs` model *including* BLH. NOAA GFS proved easiest to
implement (simple packing + server-side bbox subsetting).

**Licence decision:** `@openmeteo/file-reader` is GPL-2.0-only. Accepted —
SkyHigh is hosted-only and never distributed as code/binaries, so the GPL
distribution obligation never triggers. Jon confirmed white-label is **no longer
a project goal**. Needs a DECISION entry in `wiki/03-decisions-log.md`.

## Currently in progress
- **Tier 2/3 S3 provider** (`server/grid/providers/openMeteoS3.ts`) — a background
  agent was building this when the session ended. Check whether the file exists
  and whether `@openmeteo/file-reader@0.0.18` got added to package.json.
  Constraints: read row-by-row (bulk reads OOM the WASM), parallelise ~P=20,
  reduced Gaussian grid O1280 with ~0.035° latitude approximation, retry on S3
  `SlowDown`.

## Next task to start
1. Finish/verify the S3 provider
2. **Orchestrator** — `server/grid/orchestrator.ts` (tier escalation + gap-fill
   merge + per-point provenance), plus `store.ts`, `tiles.ts`, `registry.ts`
3. Wire into `scheduledJobs.ts`; add provenance display to `AdminWeather.tsx`
4. **Rewrite `server/victoriaGrid.ts`** (909 lines, assessed patchy — duplicate
   cache-read logic, repeated upsert SQL, mutable module-level exports,
   asymmetric retry handling between fine and thermal) onto the new grid layer
5. Verify the three fixes in `2d6357e` actually hold in production
6. Record the GPL/hosted-only DECISION in the wiki

## Open questions / blockers
- **Jon asked to be reminded** of two cleanups when next choosing what to tackle:
  (a) update the intention notes — CLAUDE.md Section 0 and `wiki/00-overview.md`
  still claim "white-label ready", which is no longer true; (b) delete the
  alternative-site-design code.
- Still not pushed to Railway (now 22 commits ahead of origin/main).

## Quick context refresher
The wind/thermal grids are fetched daily from Open-Meteo and cached in
`wind_grid_data`. The single point of failure was that Open-Meteo rate-limits by
data volume, and when it throttled there was no fallback. Session 56 fixed the
startup logic that hid the failure, and is now building a provider abstraction
(`server/grid/`) with four tiered sources that gap-fill each other point by
point. Nothing is wired into `victoriaGrid.ts` yet — the new layer is additive
and inert until the orchestrator lands.
