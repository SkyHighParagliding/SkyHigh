# RESUME_HERE — Last updated: 2026-05-22 (session 13, end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway

## Where I left off

Session 13 was a significant production bugfix session. Three production issues were found and fixed:

1. **pgDb.ts ON CONFLICT DO NOTHING bug** — all `INSERT OR REPLACE` statements for any table not explicitly listed in `convertSQL()` fell through to `ON CONFLICT DO NOTHING`. This silently swallowed every update after the initial insert. The 74/74 "updated" log count was misleading — `.run()` doesn't throw on DO NOTHING. Fixed for 6 tables total across two commits.

2. **Smart search server-side advisory exclusion** — AI was ignoring `[LIGHT WINDS — do not recommend]` and similar advisory tags in context, recommending those sites with caveats instead of omitting them. Fixed by adding `filterContextByAdvisoryExclusions()` which strips the LIVE/FCST lines carrying exclusion tags before the AI ever sees them.

**All changes pushed and live (commits 81daacb, 6be44be, 1869a0a).**

## Last completed task
- Session 13 production bugfixes — all deployed (2026-05-22)

## Recently fixed production bugs (session 13)

### pgDb.ts — site_extended_forecasts (commit 81daacb)
- `INSERT OR REPLACE INTO site_extended_forecasts` fell through to catch-all `ON CONFLICT DO NOTHING`
- `site_extended_forecasts` uses `siteId` as PK (not `id` or `key`), so every update after first insert was silently discarded
- Symptom: Manny's 7-day outlook showed Tuesday data on Friday (row stuck since May 17)
- Fix: added explicit `ON CONFLICT ("siteId") DO UPDATE SET "forecastData" = EXCLUDED."forecastData", "updatedAt" = EXCLUDED."updatedAt"`

### pgDb.ts — 5 more tables (commit 6be44be)
Same ON CONFLICT DO NOTHING bug affected 5 additional tables. All now have explicit DO UPDATE SET:
- `weather_forecasts` (siteId PK) — live weather frozen since first deployment ← CRITICAL
- `wind_grid_data` (siteId PK) — wind grid stuck from first fetch ← CRITICAL  
- `extended_forecasts` (id PK) — raw ECMWF blob never updated
- `document_index` (driveFileId PK) — Drive docs never re-indexed after first sync
- `emergency_hospitals_cache` (siteId PK) — hospital cache never refreshed

### Smart search advisory tag filter (commit 1869a0a)
- AI was seeing `[LIGHT WINDS — do not recommend]` on LIVE/FCST lines but including those sites anyway with caveats
- Added `filterContextByAdvisoryExclusions()` in filter chain — strips LIVE/FCST lines with exclusion tags before context reaches AI
- Extended forecast already filtered bad days server-side (line 338 in search.ts) — LIVE/FCST now consistent

## Currently in progress
- None

## Next task to start
- TASK-029: Harden DEFAULT_ADMINS for Production (env var docs + one-time setup script) — small task
- OR TASK-031: Pilot XC Flight History Export (CSV/GPX) — high user value

## Open questions / blockers
- After the `weather_forecasts` fix lands, the next Open-Meteo poll will write fresh data. If live weather on site pages looked stale prior to this session, it should now auto-correct. No manual action needed.
- Wind grid was similarly frozen — will refresh at next 5am scheduled run (or manual trigger from admin).

## Quick context refresher
SkyHigh had a latent PostgreSQL bug since initial deployment: the `pgDb.ts` SQL translation layer had a catch-all `ON CONFLICT DO NOTHING` that silently swallowed all updates for any table not listed explicitly. This affected live weather, wind grids, extended forecasts, document indexing, and hospital cache. The bug was found when investigating Manny's 7-day showing Tuesday data on Friday. All 6 tables are now fixed with correct EXCLUDED column mappings.

The smart search filter chain is now fully server-side for hard exclusions: calendar closures strip site sections, advisory tag exclusions strip LIVE/FCST lines, HG/PG type mismatches strip site sections, and the extended forecast already filters bad-condition days. The AI prompt rules remain as belt-and-suspenders but are no longer the primary enforcement mechanism.
