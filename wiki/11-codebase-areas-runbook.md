# Codebase Areas — Pipeline Runbook

Each area runs the same 5-agent pipeline: **scout → planner → worker → 2× parallel reviewers**, all using `deepseek/deepseek-v4-flash` via your direct DeepSeek API key.

**Task files location:** All `.md` instruction files live in `tasks/` — e.g. `tasks/run-area-1-robust.md`, `tasks/run-area-2-robust.md`, etc. The pipeline reads the exact JSON chain from these files.

**How to run any area:**
1. Open a **fresh PowerShell** window
2. `cd C:\Users\User\Documents\CodeFolder\SkyHigh`
3. Paste the one-liner command shown for that area
4. Wait for all 5 agents to complete (typically 5-12 minutes)
5. Review artifacts in the `worker/` folder

---

## 🤖 Automated Full Audit (Recommended)

Instead of running each area manually, use the **Master Orchestrator** — a single command that scouts, chunks, executes all areas in parallel batches, and compiles the final report:

```powershell
pi --model deepseek/deepseek-v4-flash "Read and execute ~/.pi/agent/tasks/master-orchestrator.md"
```

For a fresh run (ignore prior results):
```powershell
pi --model deepseek/deepseek-v4-flash "FRESH MODE - Read and execute ~/.pi/agent/tasks/master-orchestrator.md"
```

For auto-commit after each area:
```powershell
pi --model deepseek/deepseek-v4-flash "COMMIT MODE - Read and execute ~/.pi/agent/tasks/master-orchestrator.md"
```

**Latest automated results:** [09-automated-audit-results.md](09-automated-audit-results.md)

---

## Manual Area Commands (Legacy)

Use these if you need to run a single area independently.

---

## ✅ Area 1: Databases & Migrations *(DONE — 2 clean passes)*

**Scope:** `server/db.ts`, `server/pgDb.ts`, `server/sqliteDb.ts`, `server/migrations/`, `server/pg_migrations/`

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-1-robust.md."
```

**Artifacts:**
- `worker/scout-findings.md`
- `worker/fix-plan.md`
- `worker/worker-summary.md`
- `worker/review-schema.md`
- `worker/review-sql.md`

---

## 🟡 Area 2: API Routes

**Scope:** `server/routes/` — 33 files covering auth, check-ins, contacts, flights, documents, weather, pilots, demos, settings, sponsors, search, submissions, shop, tidyhq, retrieval, and admin routes.

**Focus:** Security (auth bypass, SQL injection, XSS), error handling (missing try/catch), input validation, correct status codes, parameterised queries vs string interpolation.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-2-robust.md."
```

**Artifacts:**
- `worker/scout-findings-area2.md`
- `worker/fix-plan-area2.md`
- `worker/worker-summary-area2.md`
- `worker/review-security-area2.md`
- `worker/review-errors-area2.md`

---

## 🟡 Area 3: Admin Pages

**Scope:** `src/pages/Admin*.tsx` — 26 admin dashboard pages (settings, sites, contacts, weather, images, documents, flights, safety, competitions, sponsors, XC, branding, connections, login, manual, scheduled tasks, etc.)

**Focus:** Type errors, prop mismatches, missing null/undefined handling, incorrect API call signatures, broken form state management.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-3-robust.md."
```

---

## 🟡 Area 4: Public Pages

**Scope:** Non-admin pages in `src/pages/` — Home, Sites, SiteDetail, SiteFieldView, CheckIn, Events, News, NewsDetail, Safety, Join, Shop, Sponsors, Airspace, XCMaps, XCMapsDemo, RetrievalMap, FlightHistory, BusinessDirectory, GroundHandling, ProceduresManual, ClubPhotos, InstaWall, VideoWall, BuildBlueprint, Features, TechSpec, ProductSpec, ResetPassword, WindMapLab, DutyPilotMap, Page.

**Focus:** Data fetching patterns, error states, loading states, type compatibility between page components and their hooks.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-4-robust.md."
```

---

## 🟡 Area 5: Shared Components

**Scope:** `src/components/` (excluding ui/, weather/, windmap/, xcmap/ subdirectories) — Layout, NavDropdown, WeatherCard, WindCompass, WindMap, WindFieldLayer, XCMap, PhotoSlider, HeroImagePicker, ContentWidgets, ContentImageToolbar, MarkdownRenderer, MapMessaging, PilotLoginModal, PilotProfileSettings, EmergencyMedicalCard, GoogleDocsPaste, TidesGauge, SponsorCard, SocialIcons, VoiceMicButton, UnsavedChangesModal, AIImageEnhancerModal, AISiteGeneratorModal, BulkUploadDialog, AdminSearchBox, PublicSearchBox, HomePageMapPopup, InfoCard, LazyMarkdown, FlightControls, FlightTrail, ErrorBoundary, LocationConsentBanner, MarkdownHelpLink and more.

**Focus:** Prop interface mismatches, missing key props in lists, incorrect event handler types, conditional rendering edge cases.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-5-robust.md."
```

---

## 🟡 Area 6: Hooks, Contexts & Lib

**Scope:** `src/hooks/`, `src/contexts/`, `src/lib/` — React hooks for data fetching, forms, maps, settings, image library, retrieval, proximity; contexts for auth, pilot auth, settings, templates; library utilities for API client, caching, dates, demo mode, filename validation, URL helpers, XC maps, wind grid cache, flight DB, tile cache.

**Focus:** Hook return type mismatches, stale closure bugs, missing dependency arrays in useEffect/useCallback, incorrect API response types, context provider value mismatches.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-6-robust.md."
```

---

## 🟡 Area 7: Server Utilities & Middleware

**Scope:** `server/utils/`, `server/services/`, `server/middleware/` — async handler, error handler, email, SQL builder, pagination, session tokens, site scraper, weather services, flight services, retrieval services, demo services, auth middleware, CSRF middleware, validation middleware, database maintenance, AI models, edge cases, health check, logger, migrations helper, search cache, security validation, tidyhq fetch, URL validator, watermark, garmin, spot, zoleo trackers, geometry, OSRM, scheduling, siteguide version check, siteguide zones, essential info, image fixer.

**Focus:** Unhandled promise rejections, missing error boundaries, incorrect type assertions, environment variable handling, edge cases in utility functions.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-7-robust.md."
```

---

## 🟡 Area 8: Maps & Weather UI

**Scope:** `src/components/windmap/` (WindCanvas, WindMapModeToggle, WindMapScrubberTray, particleRenderer, siteMarkerRenderer, windInterpolation), `src/components/xcmap/` (AirspaceLayer, BearingLabels, DistanceRingsOverlay, MapHelpers, PilotMarkers, SiteguideZoneLayer), `src/components/weather/` (ExtendedOutlookPanel, HourlyForecastStrip, TideChart, WeatherCardApple, WeatherCardClassic, WeatherCardRenderProps, WindCompass, types), `src/components/SitesWindMap.tsx`, `src/components/WindCompass.tsx`, `src/components/WindMap.tsx`, `src/components/WindFieldLayer.tsx`, `src/components/XCMap.tsx`, `src/components/TidesGauge.tsx`, `src/components/TidesPanelMockup.tsx`, `src/components/SOProximityDetector.tsx`.

**Focus:** Canvas rendering errors, WebGL compatibility, coordinate projection bugs, marker rendering, stale animation frame references, map event handling.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-8-robust.md."
```

---

## 🟡 Area 9: Server Integrations

**Scope:** `server/weather.ts`, `server/bomWeather.ts`, `server/freeflightwx.ts`, `server/tides.ts`, `server/victoriaGrid.ts`, `server/googleDrive.ts`, `server/seed.ts`, `server/storage.ts`, `server/wtf.ts`

**Focus:** API client error handling, rate limiting, response parsing, caching logic, timeout handling, credential management.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-9-robust.md."
```

---

## 🟡 Area 10: Types, Templates & Config

**Scope:** `src/types/api.ts`, `src/templates/registry.ts`, `src/templates/wonderful-white/` (WonderfulHeader, WonderfulFooter), `src/App.tsx`, `src/main.tsx`, `server/constants.ts`, `src/utils/`, `src/lib/demoConfig.ts`, `src/lib/demoInterceptor.ts`, `src/lib/demoSimulation.ts`

**Focus:** Type definition completeness, template rendering errors, demo mode simulation bugs, app-level routing and provider setup.

```powershell
pi --model deepseek/deepseek-v4-flash "Please read and execute the instructions in tasks/run-area-10-robust.md."
```

---

## ✅ Final Results: All 10 Areas Complete

Completed on 2026-05-25. Summary of findings across the entire codebase audit.

| Area | Scope | Files Changed | Status |
|---|---|---|---|
| **1** ✅ | Databases & Migrations | `pgDb.ts`, `db.ts`, 4 new migrations | Clean |
| **2** ✅ | API Routes | 8 route files hardened | Clean |
| **3** ✅ | Admin Pages | 6 admin pages fixed | Clean |
| **4** ✅ | Public Pages | 11 public pages fixed | Clean |
| **5** ✅ | Shared Components | 6 components fixed | Clean |
| **6** ✅ | Hooks, Contexts & Lib | 10 hook/lib files fixed | Clean |
| **7** ✅ | Server Utils & Middleware | 8 utility/service files fixed | Clean |
| **8** ✅ | Maps & Weather UI | 5 canvas/map files fixed | Clean |
| **9** ✅ | Server Integrations | 4 integration files fixed | Clean |
| **10** ✅ | Types, Templates & Config | 3 type/lib files fixed | Clean |

### 🔴 Critical/P0 Bugs Found & Fixed

| # | Area | Bug | Fix |
|---|---|---|---|
| 1 | 1 | `DATE('now')` produced invalid `CAST('now' AS DATE)` on PG | Added `CURRENT_DATE` special case |
| 2 | 1 | `ILIKE` missing from keyword list — crashed ALL LIKE queries on PG | Added `ILIKE` to keyword regex |
| 3 | 1 | `claimedAt` typed `TIMESTAMPTZ` but code writes integers | ALTER COLUMN to `BIGINT` |
| 4 | 1 | Seed data silently lost — bare `ON CONFLICT DO NOTHING` on `project_contacts` | Changed to `ON CONFLICT ("projectId","contactId") DO NOTHING` |
| 5 | 1 | `admin_sessions` PK wrong — used `sessionId` instead of `token` | Fixed in `tablePrimaryKeys` map |
| 6 | 1 | `datetime('now', '-X hours', 'start of day')` bad conversion | Uses `date_trunc('day', ...)` now |
| 7 | 2 | 6 route files had unhandled async rejections (no try/catch/asyncHandler) | Wrapped with `asyncHandler` |
| 8 | 2 | Missing input validation on weather route params | Added `isNaN` guard |
| 9 | 2 | Bulk import had no state whitelist | Added state validation |
| 10 | 3 | 3 stale closures in admin page debounce searches | Fixed dependency arrays |
| 11 | 3 | Race condition on rapid saves in AdminSafety | Added `savingRef` lock |
| 12 | 4 | ~24 TypeScript errors on `Home.tsx` — `EventItem` missing TidyHQ fields | Added missing fields to type |
| 13 | 5 | Stale closure in `MapMessaging.tsx` message queue | Merged setState + snapshot into single updater |
| 14 | 6 | Stale closures in `useFlightTracker`, `useImageLibrary` (4 locations) | Fixed dependency arrays + ref patterns |
| 15 | 6 | `useSiteForm` had 9 fields typed as `unknown` — lost null fields on save | Proper typing + null coalescing |
| 16 | 7 | 4 empty `catch {}` blocks swallowing errors | Added warning logs |
| 17 | 7 | `realRetrievalService.ts` started satellite polling on import (module side-effect) | Deferred to explicit `startPolling()` call |
| 18 | 8 | WindFieldLayer used `setTimeout` on mobile instead of `rAF` | Uses `requestAnimationFrame` |
| 19 | 8 | XCMap airspace flash animation broke on layer changes | Cleanup + re-init on layer change |
| 20 | 9 | Weather API parsed undefined wind speed as `NaN` | Default to 0 guard |
| 21 | 9 | Google Drive fetch could retry 5x on HTML error page (wasteful) | Content-Type check throws early |
| 22 | 9 | Tides API had no retry logic | Added `fetchWithRetry` |
| 23 | 10 | Duplicate type definitions across 20+ hook files | Added sync comments + canonical types in `api.ts` |

### 🟡 Warnings & Deferred Items (Not Fixed)

- `PgDatabase.transaction()` doesn't properly isolate queries (Area 1 — low risk)
- `extended_wind_grids` table created but never populated (Area 1 — harmless)
- `pilotUpdatedAt` / `driverUpdatedAt` as `INTEGER` exceeds 32-bit range (Area 1 — flagged)
- 3 stale `tablePrimaryKeys` entries (`flight_breadcrumbs`, `users`, `admin_sessions`) (Area 1 — dead code)
- `as any` casts on Express `req` / DB results ~30+ sites (Area 7 — needs structural refactor)
- Migration `catch {}` blocks ~30+ for "column already exists" (Area 7 — intentional)
- Duplicate type definitions — full refactor deferred (Area 10 — chose low-risk option)
- Double `fetch` patching risk demo interceptor + data usage (Area 10 — documented)
- Google Photos URL handling in `urlHelpers.ts` (Area 6 — no reliable pattern)
- `DATE()` regex can't handle nested parentheses like `DATE(MAX(x))` (Area 1 — no current usage)
- `ClubPhotos.tsx` API response shape assumed, not verified (Area 4 — documented risk)

### 📊 Totals

| Metric | Count |
|---|---|
| Bugs found | ~50+ |
| Bugs fixed | ~45+ |
| Warnings/deferred | 11 |
| Files changed | ~40+ |
| New migrations created | 4 (026–029) |
| Infrastructure bugs fixed | 3 (splitter, nested transaction, PG skips) |
| TypeScript errors eliminated | ~30+ |

*Every fix was reviewed by a parallel reviewer, all reviews passed, and the server starts clean with zero TypeScript errors.*
