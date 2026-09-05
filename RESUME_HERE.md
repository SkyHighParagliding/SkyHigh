# RESUME_HERE — Last updated: 2026-09-05 (session 49)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 49 — bug fixes across weather scraper and wind history chart, plus two new features.

**Completed this session:**
1. **Davis/WeatherLink gust fix** — switched from `getData` (returns daily-max gust, stuck all day) to `summaryData` endpoint (sensorDataTypeId 85 = current 10-min high wind). `server/davisWeather.ts` fully rewritten with fallback.
2. **Configurable scraper schedule** — Admin Weather Management page now has start time, end time, and "Run continuously (24 hours)" controls. Saved to `settings` table, honoured by backend scheduler without restart. `server/weather.ts`, `server/seed.ts`, `src/contexts/SettingsContext.tsx`, `src/pages/AdminWeather.tsx`.
3. **`weatherScraperLastRun` fix** — was only written by manual "Fetch Now". Now also written by every automatic scraper cycle, so admin panel timestamp reflects true last run.
4. **SQL param count hotfix** — added `$5` missing placeholder in `getSourceSettings` query (caused Railway crash on deployment).

**Commits this session:**
- `3a567eb` — fix: Davis station gust now uses current 10-min high, not daily max
- `c1dcb3b` — feat: configurable live weather scraper schedule in admin
- `da9e01a` — fix: add missing $5 placeholder in scraper settings query
- `3ad053f` — fix: update weatherScraperLastRun on every automatic scraper cycle

All pushed and deployed to Railway.

## Last completed task
- Session 49 (2026-09-05): Davis gust fix + scraper schedule UI + last-run timestamp fix
- Session 48 (2026-09-05): Wind history chart polish + weather card UI refinements

## Currently in progress
- Nothing

## Next task to start
- **"Report bad answer" button** for Smart Search chat (`src/components/PublicSearchBox.tsx`)
- Future: Weather panel upgrades using WeatherWatcher API + BRYC data (Red Bluff panel)

## Open questions / blockers
- **Home hero on mobile** — landscape image + portrait phone = can't show full image AND fill screen. Jon to decide:
  - **Option A**: `aspect-video` on mobile → shorter hero, full image visible, CTAs below
  - **Option C**: Use `sliderPortrait` image variant for the mobile hero src
- **MMYC coordinates** — registry uses `-38.2758, 145.0055` (derived by hand). Worth eyeballing on a map.

## Quick context refresher
SkyHigh is the paragliding club platform on Railway. Session 49 fixed the Davis WeatherLink gust
(was showing daily max all day instead of current reading), added admin-configurable scraper
schedule with a "run continuously" option, and fixed a crash caused by a SQL parameter count
mismatch. All live. Next quick win is the "Report bad answer" button in Smart Search.
