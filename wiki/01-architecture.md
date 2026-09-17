---
name: Architecture — Tech Stack, Patterns, and Structure
description: Full tech stack, architectural decisions, folder layout, dev vs production differences
type: wiki
---

# Architecture — Tech Stack, Patterns, and Structure

> Last updated: 2026-09-17 — resynced with the code after grid refactor
> (`server/grid/*` + provider chain), `shared/` split, and the thermal/meteogram/
> SkewT weather tools. For the exhaustive feature/table catalogue see the in-app
> `src/pages/ProductSpec.tsx` (PRD) and `src/pages/TechSpec.tsx`.

---

## Tech Stack

### Frontend
- **React 19** via **Vite 6** — strict-mode **TypeScript** throughout
- **Tailwind CSS v4** + **Shadcn/UI** (Radix) + **Lucide** icons
- **Leaflet 1.9** — XC maps, retrieval/duty-pilot maps, grid-bounds selector
- **D3 v7** — zoom/pan maths for the Canvas wind/thermal maps
- **Canvas API** — wind particles, speed heatmap, thermal overlay; **SVG** for the meteogram + SkewT charts
- **react-query** — server state/caching; **localStorage** for viewport/unit/theme
- **PWA** — `public/sw.js` service worker caches map tiles (OSM/OpenTopo/ArcGIS + AWS terrarium); app shell is *not* SW-cached

### Backend
- **Express 4** (`server.ts` at repo root is the entry point) — **TypeScript** run via **`tsx`** in both dev and prod; **esbuild** (`esbuild.server.mjs`) bundles for `build`
- **PostgreSQL** — sole database (dev via Docker, prod via Railway managed Postgres); **node-postgres (`pg`)** with pooling
- **node-cron** — scheduled grid fetches, weather scraping, siteguide checks, session cleanup

### External Services
- **Weather grids:** Open-Meteo REST (ECMWF IFS HRES) + Open-Meteo S3 archive (ECMWF & GFS) + NOAA NOMADS GFS — a 4-tier provider chain (see below)
- **Live station weather:** Weather Underground, BOM, Davis WeatherLink, FreeFlightWx/WDL, BRYC — dispatched by station-ID prefix
- **Google Gemini** — all AI (site scraping, image enhancement/moderation, admin smart search, public assistant)
- **TidyHQ** — membership/events sync (webhooks + manual)
- **Cloudflare R2** — S3-compatible media storage (prod); local `/uploads/` in dev
- **Google Drive/Sheets** — documents + AI-search index, via an Apps Script bridge (not a googleapis client)
- **AWS Open Data terrain tiles**, **OpenAIP** (airspace), **OSM/Overpass** (hospital lookup), **OSRM** (routing), satellite trackers (Garmin inReach / SPOT / ZOLEO)

### Deployment
- **Railway** (Node server + managed PostgreSQL + GitHub auto-deploy). **npm** + **GitHub**.

---

## Architectural Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| 001 | Database | PostgreSQL everywhere (dev + prod) | SQLite removed session 23 — one engine, no divergence bugs |
| 002 | Storage | Cloudflare R2 (prod) + local `/uploads/` (dev) | S3-compatible, no egress fees; abstracted in `server/storage.ts` |
| 003 | Weather grid | Daily pre-fetch, 7-day rolling DB cache | Avoids real-time API calls on map load; one daily batch |
| 004 | Map rendering | Canvas + D3 (not SVG/WebGL) | Fast for thousands of vectors, minimal deps |
| 005 | AI | Google Gemini (multi-modal, model chains) | Generous free tier, images + long-context text |
| 006 | Hosting | Railway | Low ops, committee-manageable, auto-deploy on push |
| 007 | Cache bypass | Bypass when `?limit`/`?offset` present | Prevents stale paginated results |
| 008 | Scheduled closures | `site_closure_dates` table + unified calendar | Auto-banners 7 days before closure |
| 009 | Credentials | 1Password → `draw-env.ps1` → `.env`, wiped on exit | Raw secrets never persist on disk between sessions |
| 010 | Live weather dispatch | Station-ID prefix routing | Each source identified by prefix; WU is catch-all |
| 011 | Terrain elevation | Client-side terrarium-tile sampling (server route as fallback) | No API key, ~0.2 ms vs ~465 ms; GA CC BY 4.0 attribution required |
| 012 | `@openmeteo/file-reader` (GPL-2.0-only) | Accepted — hosted-only, never distributed | Any future source release must revisit first |
| 013 | Land mask | One baked raster (`shared/landMask.generated.ts`) | Replaces two drifted hand-traced rings; regenerated via `npm run bake:landmask` |
| 014 | White-label | Dropped — native single-club (Wonderful White) | Template engine removed; revert tag `pre-debrand-2026-09-15` |

Full records: `wiki/03-decisions-log.md`.

---

## Folder Structure

```
SkyHigh/
├── server.ts                   # Express entry point (run via tsx)
├── esbuild.server.mjs          # Production server bundler
├── vite.config.ts              # Frontend build config
├── scripts/                    # bake-land-mask, lint-migrations, eval-smart-search, …
├── shared/                     # Code imported by BOTH client and server
│   ├── parcel.ts               # Validated parcel physics (LCL, lift, dewpoint)
│   └── landMask.generated.ts   # Baked land/coast raster (DECISION-013)
│
├── src/                        # Frontend (React + TS)
├── server/                     # Backend (Express + TS)
├── public/                     # Static assets + sw.js (PWA tile cache)
├── uploads/                    # Dev media (prod uses R2)
├── wiki/  memory/              # Docs / session memory (memory gitignored)
```

### `server/` (Backend)

```
server/
├── db.ts / pg.ts / seed.ts     # Migration runner / query helper / seed
├── storage.ts  constants.ts    # R2-or-local file abstraction; shared constants
├── weather.ts  weather-utils.ts# Live station scraper + scheduling; fetch helpers
├── extendedForecast.ts         # 8-day extended grid fetch + per-site extraction
├── tides.ts  wtf.ts            # Tide predictions; WhereToFly wind compare
├── bomWeather.ts  wdlWeather.ts  freeflightwx.ts   # Live-weather source adapters
│
├── grid/                       # Wind/thermal grid engine (replaces old victoriaGrid.ts)
│   ├── orchestrator.ts         # Walks the provider chain, assembles a grid
│   ├── pipeline.ts  fineGrid.ts  thermalGrid.ts     # Build passes per product
│   ├── extract.ts              # Per-point/site extraction + NaN neighbour fill
│   ├── store.ts  bounds.ts  time.ts                 # DB cache; coverage; local-midnight anchor
│   ├── parcel.ts               # Re-export shim → shared/parcel.ts
│   ├── pointSounding.ts  siteMeteogram.ts           # SkewT sounding + meteogram data
│   ├── elevationPoint.ts  grib2.ts  health.ts  types.ts
│   └── providers/              # provider.ts, registry.ts, openMeteoApi.ts,
│                               #   openMeteoS3.ts, nomadsGfs.ts, s3ReadCommon.ts,
│                               #   ecmwfLiftedIndex.ts
│
├── routes/                     # weather, sites/*, flights, retrievals, pilotAuth,
│                               #   auth, ai, search, documents, projects, contacts,
│                               #   news, pages, safety, procedures, events, shop,
│                               #   sponsors, branding, competitions, businessDirectory,
│                               #   checkins, mapMessages, submissions, pageviews,
│                               #   searchLogs, tidyhq, settings, demo/*, admin/*
├── middleware/                 # auth.ts (session), csrf.ts, validation.ts
├── services/                   # real*/demo* pairs (flat files): realFlightService +
│                               #   demoFlightService, real/demoMessageService,
│                               #   realRetrievalService, photoService, index.ts, types.ts
├── utils/                      # scheduledJobs, openMeteo, logger, email, watermark,
│                               #   garminMapshare/spotTracker/zoleoTracker, siteScraper,
│                               #   aiModels, gridAlerts, siteResolver, eligibility, …
└── pg_migrations/              # 47 sequential SQL migrations (applied on startup)
```

### `src/` (Frontend)

```
src/
├── main.tsx  App.tsx           # Entry; registers sw.js; router + providers
├── pages/                      # ~60 pages: Home, Sites, SiteDetail, SiteFieldView,
│                               #   XCMaps, FlightHistory, RetrievalMap, DutyPilotMap,
│                               #   Airspace, News/Events/Join/Shop/Sponsors/…,
│                               #   Admin* (site/content/weather/forecast/XC/…),
│                               #   ProductSpec/TechSpec/Features/BuildBlueprint (specs)
├── components/
│   ├── weather/                # SiteThermalPanel, SkewTChart, SkewTModal,
│   │                           #   SiteMeteogramChart, PointMeteogramModal,
│   │                           #   ExtendedOutlookPanel, WeatherCardApple,
│   │                           #   WeatherHistoryChart, TideChart, WindCompass
│   ├── windmap/                # WindCanvas, ThermalCanvas, MapCanvas, particleRenderer,
│   │                           #   thermalRenderer, windInterpolation, thermalInterpolation,
│   │                           #   cumulusField, terrainTiles, elevationPoint, landMask.ts,
│   │                           #   ModeSwitchPill, WindMapModeToggle, WindMapScrubberTray,
│   │                           #   MapScaleBar, ThermalHelpModal, siteMarkerRenderer,
│   │                           #   groundRegistration, mapExtent
│   ├── xcmap/                  # AirspaceLayer, PilotMarkers, DistanceRingsOverlay,
│   │                           #   BearingLabels, SiteguideZoneLayer, MapHelpers
│   ├── map/                    # leafletHelpers
│   ├── SitesWindMap.tsx  WindMapProto.tsx  XCMap.tsx  WindFieldLayer.tsx
│   ├── Altitude.tsx  AirspaceRange.tsx  MapMessaging.tsx  FlightTrail.tsx …
│   └── ui/                     # Shadcn/UI + custom shared components
├── contexts/                   # AuthContext, PilotAuthContext, SettingsContext
├── hooks/  lib/  styles/       # API hooks; apiClient/geomath/units/utils; global CSS
```

---

## Data Model

PostgreSQL, ~47 migrations. Broad categories (full list: `ProductSpec.tsx` → Data Model):

| Group | Tables (representative) |
|---|---|
| **Sites & content** | `sites`, `site_closure_dates`, `news`, `pages`, `page_attachments`, `safety_sections`, `procedures`, `sponsors`, `business_directory`, `competitions`, `image_submissions` |
| **Pilots & flights** | `pilots`, `pilot_sessions`, `flights`, `breadcrumbs`, `retrievals`, `map_messages`, `checkins` |
| **Members & auth** | `contacts`, `admin_sessions`, `settings` (key-value config) |
| **Weather & ops** | `weather_forecasts`/observations, `extended_forecasts`, `site_extended_forecasts`, `wind_grid_data` (fine + thermal blobs, 7-day rolling), `emergency_hospitals_cache`, `siteguide_version_checks`, `search_logs` |
| **Documents** | `documents` / document index (Google Drive AI-search) |

### Important `settings` keys (wind grid)

| Key | Purpose |
|---|---|
| `gridFineLatMin/Max`, `gridFineLonMin/Max` | Fine/thermal/extended coverage bounds (override code defaults) |
| `fineGridLastRun` / `fineGridLastResult` / `fineGridProgress` | Fine grid status + live tile progress (polled every 2 s) |
| `thermalGridLastRun` / `thermalGridLastResult` / `thermalGridProgress` / `thermalGridFailedTiles` | Thermal grid status, retry state, failed-tile queue |
| `extendedForecastLastRun` / `extendedForecastLastResult` / `extendedGridProgress` | Extended forecast status |
| `feature*` (e.g. `featureThermalMap`, `featureMeteogram`, `featureSkewT`) | Feature flags; **must** be in the `SettingsContext` allow-list or they're silently dropped client-side |

---

## Dev vs Production

| Aspect | Development | Production |
|---|---|---|
| **Database** | PostgreSQL via Docker | Railway managed PostgreSQL |
| **Storage** | Local `/uploads/` | Cloudflare R2 |
| **Server** | `tsx server.ts` (port 3001) | `tsx server.ts`, `NODE_ENV=production`, port from Railway |
| **Frontend** | Vite dev server (5173) | `vite build` bundle served by Express |
| **Build** | — | `npm run build` = `vite build` + `esbuild.server.mjs` |
| **Auth** | `DEV_BYPASS_AUTH=true` optional | Session token + CSRF required |
| **Open-Meteo** | Free tier (IP-keyed) | Customer tier via `OPEN_METEO_API_KEY` |
| **Gemini** | Optional (demo mode if missing) | Required |
| **CORS** | Permissive (localhost) | Restricted to production domain |

---

## Key Architectural Patterns

### PostgreSQL everywhere (DECISION-001)
`server/db.ts` applies `server/pg_migrations/*.sql` on startup; `server/pg.ts` exposes `query/queryOne/execute/transaction` — all backend DB access goes through these.

### Grid products + 4-tier provider chain (DECISION-003)
Three grid **products** are pre-fetched daily, each serving a map layer:
1. **Fine grid** — wind speed/direction/weather for heatmap + particles
2. **Thermal grid** — CAPE/BLH/W\*/cloud for the thermal overlay
3. **Extended forecast** — 8-day outlook, per-site extracted

Each product is assembled by `server/grid/orchestrator.ts`, which walks the provider **chain** (`providers/registry.ts`): **① Open-Meteo REST (ECMWF IFS)** → **② Open-Meteo S3 (ECMWF)** → **③ Open-Meteo S3 (GFS)** → **④ NOAA NOMADS GFS**. Tiers 1–2 (ECMWF family) mix seamlessly; falling to the GFS family (3–4) is a last resort and can seam. Every provider anchors time to local midnight via `grid/time.ts`. See `wiki/12-wind-grid-workflow.md`.

### Fire-and-forget admin fetches
Manual fetch routes respond immediately (`{success:true}`) then run in the background; the admin UI polls `*Progress` settings every 2 s for live tile-by-tile progress. After a partial thermal fetch, the scheduler retries failed tiles at +5/+15/+40/+90 min, with a 7:30am cron backstop.

### Shared parcel physics + derived sounding tools
`shared/parcel.ts` (LCL, lift, dewpoint) is imported by **both** the server (`grid/pointSounding.ts`, `grid/siteMeteogram.ts`) and the client SkewT (`components/weather/SkewTChart.tsx`), so the draggable trigger-temperature re-runs the same validated ascent client-side. `server/grid/parcel.ts` is a re-export shim for existing callers.

### Canvas + D3 maps, baked land mask (DECISION-004, 013)
Speed heatmap (pixel grid + LUT), a particle system, and a land-masked thermal overlay render as independent Canvas layers; D3 does zoom/pan. The land mask is one baked raster (`shared/landMask.generated.ts`), regenerated via `npm run bake:landmask`.

### Client-side terrain sampling (DECISION-011)
`components/windmap/terrainTiles.ts` fetches AWS terrarium z12 tiles and decodes RGB→metres AMSL (LRU cache of 64); `elevationPoint.ts` tries the tile cache first, falling back to `GET /api/weather/elevation-at`. Both canvases prefetch a 3×3 tile block around centre. GA CC BY 4.0 attribution is a licence obligation — do not remove it.

### Service layer with demo mode
`server/services/` holds `real*`/`demo*` pairs (flat files) selected via `DEV_BYPASS_AUTH`, injected by `services/index.ts` — lets dev run without external API keys.

### Test suite
`npm test` runs the grid/mask/geometry suites: `landmask`, `mapextent`, `extended`, `extract`, `pipeline`, `health`, `orchestrator` (plus `grib2`). Migrations are linted via `npm run lint:migrations`; type-check via `npm run lint` (`tsc --noEmit`).

---

## Development Workflow

```powershell
npm run dev        # concurrently: API (tsx server.ts :3001) + Vite client (:5173)
npm run build      # vite build + esbuild.server.mjs → dist/
npm start          # tsx server.ts with NODE_ENV=production
npm test           # grid/mask/geometry regression suites
npm run lint       # tsc --noEmit
```

Push to GitHub → Railway auto-deploys.
