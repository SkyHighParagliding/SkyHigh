# RESUME_HERE — Last updated: 2026-05-19

## Project: SkyHigh
## Status: **LIVE** ✅

## Current State

**The app is live at https://www.skyhighparagliding.org.au**

Go-live completed 2026-05-19. All smoke tests passed. DNS cutover, SSL, Resend domain verification, R2 CORS, and all environment variables are configured and working.

---

## What's Done (this session)

- ✅ **TideChart flat-line bug fixed** — Root cause: stale ECMWF fine grid → `extractSiteForecast` returned null silently → `weather_forecasts` stopped updating → stale May 17 timestamps passed to TideChart → chart window before all tide predictions → flat line. Two-layer fix:
  - `TideChart.tsx` (b2a0e76): detect stale forecast window, fall back to now-centred tide window
  - `victoriaGrid.ts` + `weather.ts` (a79add0): `extractSiteForecast` falls back to nearest available grid time instead of returning null; added grid age + forecast update count logging to weather scraper
- ✅ Confirmed working in production

---

## Known Issues / Backlog

- **mt-broughton-thistle-hill weather station** — External FreeFlightWx station returning bad JSON every cycle. Not our bug; station is down.
- **TASK-035** — `cross-env` installed via npx at runtime; should be added to package.json devDependencies
- **npm audit** — 11 vulnerabilities (8 moderate, 2 high, 1 critical) flagged at build time. Run `npm audit` locally to triage.
- **TASK-028** — CSRF Redis store deferred (single-instance Railway, not needed yet)
- **TASK-029** — DEFAULT_ADMINS hardening (partial — env var set, no setup script)
- **R2 custom domain** — Public dev URL (`pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev`) is rate-limited. For production scale, add a custom domain (e.g. `media.skyhighparagliding.org.au`) to the R2 bucket.
- **Fine grid staleness root cause** — Unknown why the fine grid stopped refreshing on May 17–19. The new logging will surface this in Railway logs if it recurs. Watch for `Weather scraper: Fine grid is Xmin old` warnings.

---

## Key Info

| Item | Value |
|---|---|
| Production URL | https://www.skyhighparagliding.org.au |
| Railway URL (backup) | https://skyhigh-production.up.railway.app |
| Admin login | jonpamment@gmail.com (password reset done) |
| GitHub repo | https://github.com/SkyHighParagliding/SkyHigh |
| Railway project | skyhigh (SkyHighParagliding org) |
| R2 bucket | skyhigh-media |
| R2 public URL | https://pub-971a295c84fe4582b888c39e86cdbd8c.r2.dev |
| DNS provider | Google Cloud DNS (Skyhigh DNS Service project) |
| TIDYHQ_CLUB_ID | skyhigh |
| Latest deploy | [FIX] Stale fine grid no longer silences weather_forecasts — commit a79add0 |

---

## Key Files

- `memory/project.md` — Full status, env var table
- `wiki/02-tasks.md` — Master task list across all phases
- `wiki/06-deployment.md` — Infrastructure, accounts, DNS, Railway setup details
- `wiki/07-credential-recovery.md` — All credentials and recovery procedures
- `.env` — All local credentials (mirrored to Railway Variables)
