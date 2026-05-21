# RESUME_HERE — Last updated: 2026-05-21 (session 12, end)

## Project: SkyHigh
## Status: **LIVE** ✅ on Railway

## Where I left off

Session 12 added BOM (Bureau of Meteorology) as a 4th live weather source alongside Live-Wind, Weather Underground, and FreeFlightWx. Researched and planned the integration, then built and deployed it.

**All changes pushed and live (commit f08030c):**
- `server/bomWeather.ts` — New BOM fetch service with 97 Victorian stations (IDV60801 product), `fetchBomObservation()`, `parseBomStationId()`, `getBomStations()`. Converts Melbourne-local BOM timestamps to UTC. Falls back to static coords when JSON header lat/lon is empty.
- `server/weather.ts` — Added `bom-` prefix branch in `fetchStationData()`. Existing WU/Live-Wind/FreeFlightWx logic untouched.
- `server/routes/weather.ts` — BOM stations included in `/stations/nearby` search and `currentStationId` fallback handler.
- `src/pages/AdminSiteEdit.tsx` — Placeholder and hint text updated to document BOM station ID format.

**Station ID format:** `bom-{productCode}-{stationNum}` e.g. `bom-IDV60801-94846` (Aireys Inlet)  
**No DB migration required** — IDs stored in `sites.liveStationId` like all other sources.

## Last completed task
- BOM weather source integration — complete and deployed (2026-05-21)

## Currently in progress
- None

## Next task to start
- TASK-029: Harden DEFAULT_ADMINS for Production (env var docs + one-time setup script) — small task
- OR TASK-031: Pilot XC Flight History Export (CSV/GPX) — high user value

## Open questions / blockers
- None known

## Quick context refresher
BOM is now a selectable weather source in the Admin → Sites → Edit weather station dropdown. Admins pick from nearby BOM stations (97 Victorian stations seeded) or type `bom-IDV60801-{stationNum}` directly. BOM data is fetched on the existing 15–30 min weather scraper cycle. The feature is live on Railway — the placeholder hint text and dropdown now include BOM alongside the three other sources.
