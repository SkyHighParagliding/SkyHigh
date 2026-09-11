---
name: Architecture — Tech Stack, Patterns, and Structure
description: Full tech stack, architectural decisions, folder layout, dev vs production differences
type: wiki
---

# Architecture — Tech Stack, Patterns, and Structure

> Last updated: 2026-09-11

---

## Tech Stack

### Frontend
- **React 19** — via Vite 6.4.2
- **TypeScript** — strict mode throughout
- **Tailwind CSS v4** — utility-first styling
- **Shadcn/UI** — component library built on Radix primitives
- **Lucide React** — icon library
- **Leaflet 1.9.x** — base map (sites, grid bounds selector)
- **D3.js v7** — zoom/pan mathematics for wind map canvas
- **react-query** — server state management and caching
- **Canvas API** — wind map rendering (particles, speed heatmap, thermal overlay)
- **localStorage** — client-side persistence (wind map viewport, theme)

### Backend
- **Express 4.x** — HTTP server (port 3001)
- **TypeScript** — compiled via `tsx` (dev) / `esbuild` (prod)
- **PostgreSQL** — sole database (dev via Docker, prod via Railway managed Postgres)
- **node-postgres (`pg`)** — database driver with connection pooling
- **node-cron** — scheduled jobs (grid fetches, version checks, session cleanup)

### External Services
- **Open-Meteo API (ECMWF IFS model)** — all weather/wind data; free tier (IP-keyed) or customer tier (API key via `OPEN_METEO_API_KEY`)
- **Google Gemini API** — AI features: site guide scraping, image enhancement, moderation, smart search
- **TidyHQ API** — membership sync (webhooks + manual trigger)
- **Cloudflare R2** — S3-compatible object storage (production media)
- **Google Drive API** — document storage and search indexing

### Deployment
- **Railway** — production host (Node.js server + managed PostgreSQL + GitHub auto-deploy)
- **npm** — package management
- **GitHub** — version control, CI trigger for Railway deploys

---

## Architectural Decisions

| # | Decision | Choice | Why |
|---|---|---|---|
| 001 | Database | PostgreSQL everywhere (dev + prod) | SQLite removed session 23 — one DB engine eliminates divergence bugs |
| 002 | Storage | Cloudflare R2 (prod) + local `/uploads/` (dev) | S3-compatible, no egress fees, seamless abstraction via `server/storage.ts` |
| 003 | Weather grid | Daily pre-fetch, 7-day rolling DB cache | Avoids real-time API calls on wind map load; single daily batch keeps request count low |
| 004 | Wind map rendering | Canvas + D3 (not SVG or WebGL) | Fast for thousands of vectors, minimal deps, smooth at any resolution |
| 005 | AI | Google Gemini (multi-modal) | Generous free tier, handles images + text, supports long-context extraction |
| 006 | Hosting | Railway | Low ops overhead, committee can self-manage, auto-deploy on push |
| 007 | Cache bypass | Bypass cache if `?limit` / `?offset` present | Prevents stale paginated results |
| 008 | Scheduled closures | Per-site calendar dates in `site_closure_dates` table | Replaces manual banner entry; auto-banner 7 days before closure |
| 009 | Credentials | 1Password → `draw-env.ps1` → `.env` | Raw secrets never persist on disk between sessions |
| 010 | Weather source dispatch | Station ID prefix routing | Each source (BOM, Davis, FreeFlightWx, WDL, WU) identified by prefix; WU is catch-all |

---

## Folder Structure

```
SkyHigh/
├── server.ts                   # Express entry point
├── esbuild.server.mjs          # Production bundler
├── vite.config.ts              # Frontend build config
├── tsconfig.json
├── package.json
├── .env.template               # All required env vars documented
├── CLAUDE.md                   # Session instructions
├── RESUME_HERE.md              # Current state (updated each session end)
│
├── src/                        # Frontend (React + TypeScript)
├── server/                     # Backend (Express + TypeScript)
├── public/                     # Static assets
├── uploads/                    # Dev media storage (prod uses R2)
├── wiki/                       # Project documentation
└── memory/                     # Session memory (gitignored)
```

### `server/` (Backend)

```
server/
├── pg.ts                       # DB helper: query/queryOne/execute/transaction
├── db.ts                       # Migration runner: applies pg_migrations/ on startup
├── victoriaGrid.ts             # Fine + thermal grid fetch, cache, interpolation
├── extendedForecast.ts         # Extended 7-day forecast fetch + per-site extraction
├── weather.ts                  # Live weather scraper + scheduling
├── weather-utils.ts            # fetchWithRetry, degreesToDirection, station helpers
├── storage.ts                  # R2/local file abstraction
├── constants.ts                # Shared numeric constants
│
├── utils/
│   ├── scheduledJobs.ts        # All cron jobs: fine/thermal/extended grid, version check
│   ├── openMeteo.ts            # buildOpenMeteoParams / buildOpenMeteoBody
│   ├── gridTiles.ts            # buildColumnTiles / buildRectangularTiles
│   ├── asyncHandler.ts         # Express async error wrapper
│   ├── logger.ts               # Structured logger factory (createLogger)
│   ├── email.ts                # Email sending (admin notifications)
│   └── siteguideVersionCheck.ts# Siteguide content version diffing
│
├── routes/
│   ├── weather.ts              # /api/weather/* — grid fetch, live weather, bounds
│   ├── sites/                  # /api/sites — CRUD, closures, bulk ops
│   ├── flights/                # /api/flights — submit, list, GPX parse
│   ├── retrieval/              # /api/retrieval — SSE real-time chat
│   ├── admin/                  # /api/admin — dashboard, TidyHQ sync, settings
│   └── auth/                   # /api/auth — login, logout, session
│
├── middleware/
│   ├── auth.ts                 # requireAuth — session token verification
│   ├── csrf.ts                 # CSRF token generate + validate
│   └── errorHandler.ts         # Global Express error handler
│
├── services/real/              # Production implementations (Gemini, TidyHQ, etc.)
├── services/demo/              # Stubbed implementations (DEV_BYPASS_AUTH mode)
└── pg_migrations/              # SQL migration files (applied sequentially on startup)
```

### `src/` (Frontend)

```
src/
├── main.tsx                    # React entry point
├── App.tsx                     # Root router + global providers
│
├── pages/
│   ├── Home.tsx                # Sites list + closure banners
│   ├── SiteDetail.tsx          # Site weather, wind map, thermal overlay
│   ├── AdminWeather.tsx        # Grid fetch controls + live progress
│   ├── AdminSites.tsx          # Site CRUD
│   └── ...
│
├── components/
│   ├── windmap/
│   │   ├── WindCanvas.tsx          # Fine wind canvas (particles + speed heatmap)
│   │   ├── ThermalCanvas.tsx       # Thermal CAPE/BLH coloured overlay
│   │   ├── particleRenderer.ts     # Particle animation + speed overlay draw
│   │   ├── thermalRenderer.ts      # Thermal colour render (land-masked)
│   │   ├── windInterpolation.ts    # Bilinear wind interpolation + speed LUT
│   │   ├── thermalInterpolation.ts # Thermal bilinear (relaxed — null-corner fallback)
│   │   ├── windMapTypes.ts         # Shared types (ZoomSetpoints, etc.)
│   │   └── landMask.ts             # isOnLand() — used by thermal renderer only
│   ├── GridBoundsSelector.tsx      # Leaflet map for admin grid area config
│   └── ui/                         # Shadcn/UI + custom shared components
│
├── contexts/
│   ├── AuthContext.tsx          # Session token + admin flag
│   └── SettingsContext.tsx      # App settings (grid bounds, last run times, etc.)
│
├── hooks/                       # Custom React hooks (API calls, map state, etc.)
├── lib/
│   ├── apiClient.ts             # Typed fetch wrapper
│   ├── geomath.ts               # haversineKm / haversineMeters
│   ├── leafletIcons.ts          # Shared Leaflet icon factories
│   └── utils.ts                 # cn() and misc helpers
└── styles/                      # Global CSS + Tailwind config
```

---

## Data Model (Key Tables)

| Table | Purpose |
|---|---|
| `sites` | Flying site records (name, status, lat/lon, guide, images, wind range) |
| `wind_grid_data` | Fine + thermal grid blobs (key: `fine_grid_YYYY-MM-DD`, `thermal_grid_YYYY-MM-DD`); 7-day rolling |
| `extended_forecasts` | 8-day extended grid blobs (key: `extended_grid_YYYY-MM-DD`); 7-day rolling |
| `site_extended_forecasts` | Pre-extracted per-site 7-day outlook (bilinear interpolated from extended grid) |
| `settings` | Key-value config store — grid bounds, last run timestamps, progress keys, scraper schedule |
| `sessions` | Auth session tokens (24-hour TTL) |
| `contacts` | TidyHQ-synced member roster |
| `site_closure_dates` | Scheduled closure calendar; drives auto-banners 7 days before closure |
| `weather_forecasts` | Cached live weather observations per site |
| `news` | Site news items and alerts |

### Important `settings` keys (wind grid)

| Key | Type | Purpose |
|---|---|---|
| `gridFineLatMin/Max` | float | Fine/thermal/extended coverage bounds (overrides code defaults) |
| `gridFineLonMin/Max` | float | ditto |
| `fineGridLastRun` | ISO timestamp | Last successful fine grid fetch |
| `fineGridLastResult` | string | "ok" or error message |
| `fineGridProgress` | string | Live tile progress (polled by admin UI every 2s; blank when idle) |
| `thermalGridLastRun` | ISO timestamp | Last thermal grid fetch attempt |
| `thermalGridLastResult` | string | "ok", "partial — N tiles, retry X/4 in Ymin", or error |
| `thermalGridProgress` | string | Live tile progress |
| `thermalGridFailedTiles` | JSON array | Tile specs queued for next retry round; empty string when clear |
| `extendedForecastLastRun` | ISO timestamp | Last extended forecast fetch |
| `extendedForecastLastResult` | string | "ok" or error message |
| `extendedGridProgress` | string | Live tile progress |

---

## Dev vs Production

| Aspect | Development | Production |
|---|---|---|
| **Database** | PostgreSQL via Docker | PostgreSQL managed by Railway |
| **Storage** | Local `/uploads/` | Cloudflare R2 |
| **Server port** | 3001 | Auto-assigned by Railway |
| **Frontend** | Vite dev server (port 5173) | Bundled + served by Express |
| **Auth** | `DEV_BYPASS_AUTH=true` optional | Session token + CSRF required |
| **Open-Meteo** | Free tier (IP-keyed) | Customer tier via `OPEN_METEO_API_KEY` (higher rate limit) |
| **Gemini API** | Optional (demo mode if missing) | Required |
| **Logging** | Console | Railway logs dashboard (JSON) |
| **CORS** | Permissive (localhost) | Restricted to production domain |

---

## Key Architectural Patterns

### PostgreSQL Everywhere (DECISION-001)
SQLite was removed in session 23. Both dev and prod run PostgreSQL. Dev uses a Docker container; prod uses Railway's managed Postgres. `server/db.ts` runs SQL migration files from `server/pg_migrations/` on startup. `server/pg.ts` exposes `query()`, `queryOne()`, `execute()`, `transaction()` — all backend DB access goes through these.

### Three-Tier Wind Grid System (DECISION-003)
Wind data is pre-fetched once per day in three independent passes, each serving a different map layer:
1. **Fine grid** (0.15°, ~6,900 pts) — wind speed/direction/weather for the heatmap and particles
2. **Thermal grid** (0.09°, ~19,000 pts) — CAPE + BLH for the thermal colour overlay
3. **Extended forecast** (0.5°, ~700 pts) — 8-day outlook at 4 time slots/day, per-site extracted

See `wiki/12-wind-grid-workflow.md` for the full internal workflow of each fetch.

### Fire-and-Forget Admin Routes
All three manual fetch routes (`/api/weather/fine-grid/fetch-now`, `/thermal-grid/fetch-now`, `/extended-forecast/fetch-now`) respond to the browser **immediately** with `{success: true}`, then run the fetch in the background. The admin UI polls `fineGridProgress` / `thermalGridProgress` / `extendedGridProgress` from the `settings` table every 2 seconds to show live tile-by-tile progress.

### Canvas + D3 Wind Map (DECISION-004)
The wind map has three layers rendered independently:
- **Speed heatmap** — pixel-grid canvas (`CELL=5px`), coloured by interpolated wind speed via a pre-built LUT
- **Particles** — 2,400-particle system animating along wind vectors with age-based fade
- **Thermal overlay** — separate canvas, CAPE/BLH coloured with land mask applied; edge-faded at grid boundary

D3 handles zoom/pan math. Bilinear interpolation runs at render time from the cached grid.

### Thermal Retry Chain
After any thermal fetch that leaves failed tiles, the scheduler automatically retries up to 4 times at +5min, +15min, +40min, +90min. Each retry fetches only the failed tiles (not the full grid). The `thermalGridLastResult` setting reflects the current retry state. A 7:30am cron is the final backstop.

### Service Layer with Demo Mode
`server/services/real/` contains real implementations (Gemini, TidyHQ, etc.). `server/services/demo/` contains stubbed versions for dev without API keys. Selected via `DEV_BYPASS_AUTH` env var.

---

## Development Workflow

```powershell
npm run dev        # Start concurrent API (3001) + Vite client (5173)
npm run build      # Bundle server (esbuild) + frontend (Vite) → dist/
npm start          # Run production bundle
```

Push to GitHub → Railway auto-deploys. No manual build step needed for production.
