---
name: Architecture — Tech Stack, Patterns, and Structure
description: Full tech stack with versions, architectural decisions, folder layout, dev vs production differences
type: wiki
---

# Architecture — Tech Stack, Patterns, and Structure

## Tech Stack (with versions as of 2026-05-06)

### Frontend
- **React 19** (latest, via Vite)
- **TypeScript** (strict mode)
- **Vite 6.4.2** — dev server + build tool
- **Tailwind CSS v4** — utility-first styling
- **Lucide React** — icon library
- **Leaflet 1.9.x** — base map library
- **D3.js (v7)** — zoom/pan mathematics for wind map
- **react-query** — server state management
- **localStorage** — persistent client settings (wind map viewport, theme)

### Backend
- **Express 4.x** — HTTP server
- **TypeScript** — strict, compiled via `tsx` (dev) and `esbuild` (prod)
- **SQLite** (development) — single-file database, zero setup
- **PostgreSQL** (production) — persistent database, managed via migration scripts
- **node-postgres (`pg`)** — PostgreSQL driver + connection pooling
- **node-sqlite3** — SQLite driver

### External Services
- **Google Gemini API** — AI features (scraping, enhancement, moderation)
- **Open-Meteo API** — auxiliary weather data (fallback/verification)
- **ECMWF** — continental wind grid data (fetched daily, cached in DB)
- **TidyHQ API** — membership sync (webhooks + manual trigger)
- **Cloudflare R2** — S3-compatible object storage (production media)
- **Google Drive API** — document storage and search indexing

### Deployment
- **Railway** — production hosting (Node.js + managed PostgreSQL + GitHub auto-deploy)
- **npm** — package management
- **git** — version control (GitHub)
- **Concurrently** — dev server (runs API + Vite client simultaneously)

---

## Architectural Decisions (brief; full reasoning in `03-decisions-log.md`)

| # | Decision | Choice | Why |
|---|---|---|---|
| 001 | Database strategy | SQLite dev / PostgreSQL prod, unified adapter | Zero dev setup, scales to production without code changes |
| 002 | Storage | Cloudflare R2 (production) + local `/uploads/` (dev) | S3-compatible, no egress fees, seamless abstraction |
| 003 | Weather grid caching | Continental pre-fetch, daily cycle, 7-day rolling DB storage | Balanced cost vs. freshness; avoids real-time API calls on every wind map load |
| 004 | Wind map rendering | Canvas + D3 zoom math (no SVG or WebGL) | Fast for thousands of vectors, minimal dependencies, smooth interaction |
| 005 | AI features | Google Gemini (multi-modal, chain-able) | Generous free tier, can handle images + text, fallback model support |
| 006 | Hosting | Railway | Low ops overhead, committee can manage, GitHub auto-deploy on push |
| 007 | Cache invalidation | Bypass cache if `?limit` or `?offset` parameters present | Prevent stale paginated results on custom pagination requests |

---

## Folder Structure

### Root
```
SkyHigh/
├── server.ts              # HTTP server entry point (port 3001)
├── esbuild.server.mjs     # Production bundler config
├── vite.config.ts         # Frontend build config (Vite, Tailwind)
├── tsconfig.json
├── package.json
├── .env.template          # Documentation of all required env vars
├── CLAUDE.md              # Codebase collaboration instructions
├── RESUME_HERE.md         # Current state (updated at session end)
├── wiki/                  # Project documentation (6 files)
├── memory/                # Session memory (gitignored)
├── src/                   # Frontend (React)
├── server/                # Backend (Express)
├── public/                # Static assets (icons, fonts)
├── uploads/               # Local dev media storage
└── db_backups/            # PostgreSQL backup snapshots
```

### `src/` (Frontend)

```
src/
├── main.tsx               # React entry point
├── App.tsx                # Root router + layout
├── index.css              # Tailwind imports
├── contexts/
│   ├── AuthContext.tsx    # Session token, admin check
│   ├── SettingsContext.tsx# Wind map zoom/center, theme
│   └── ...
├── components/
│   ├── windmap/
│   │   ├── WindMap.tsx            # Canvas + D3 render loop
│   │   ├── windmapUtils.ts        # Bilinear interpolation, particle animation
│   │   ├── handleZoom.ts          # D3 zoom event handlers
│   │   └── ...
│   ├── sites/
│   │   ├── SitesList.tsx          # Browse sites (public)
│   │   ├── SiteDetail.tsx         # Site info + wind overlay
│   │   ├── AdminSites.tsx         # CRUD sites (admin only)
│   │   └── ...
│   ├── retrieval/
│   │   ├── RetrievalChat.tsx      # SSE message display + input
│   │   ├── LocationShare.tsx      # Real-time location on map
│   │   └── ...
│   ├── flights/
│   │   ├── FlightSubmit.tsx       # File upload (Garmin/SPOT/manual)
│   │   ├── FlightHistory.tsx      # Search and view all flights
│   │   └── ...
│   └── ui/                        # Reusable UI components
├── utils/
│   ├── apiClient.ts       # Fetch wrapper with error handling
│   └── validation.ts      # Client-side form validation
└── styles/
    └── tailwind.config.js # Tailwind customization
```

### `server/` (Backend)

```
server/
├── db.ts                  # Unified SQLite/PostgreSQL adapter
├── pgDb.ts                # PostgreSQL implementation
├── victoriaGrid.ts        # Grid caching + interpolation
├── weather.ts             # Open-Meteo + scheduled jobs
├── storage.ts             # R2/local file abstraction
├── middleware/
│   ├── auth.ts            # Session token verification
│   ├── csrf.ts            # CSRF token generation + validation
│   ├── errorHandler.ts    # Global error handler
│   └── ...
├── routes/
│   ├── sites/
│   │   ├── index.ts       # GET /api/sites, list/fetch
│   │   └── crud.ts        # POST/PUT/DELETE site operations
│   ├── flights/
│   │   ├── index.ts       # Submit + list flights
│   │   └── gpx.ts         # Parse uploaded GPS files
│   ├── retrieval/
│   │   └── sse.ts         # SSE endpoint for real-time chat
│   ├── admin/
│   │   ├── dashboard.ts   # Admin stats + job status
│   │   ├── grid-fetch.ts  # Manual grid update trigger
│   │   └── sync-tidyhq.ts # Manual TidyHQ sync
│   └── auth/
│       └── login.ts       # Session token creation
├── services/
│   ├── real/              # Real implementations
│   │   ├── geminiService.ts       # Gemini API calls
│   │   ├── tidyhqService.ts       # TidyHQ webhook handler
│   │   └── ...
│   └── demo/              # Demo implementations (DEV_BYPASS_AUTH)
│       ├── geminiService.ts       # Stubbed responses
│       └── ...
├── utils/
│   ├── logging.ts         # Structured logging (JSON)
│   ├── validation.ts      # Zod schemas for request bodies
│   └── ...
├── pg_migrations/         # PostgreSQL schema migrations
│   ├── 0001_init.sql
│   ├── 0002_add_indexes.sql
│   └── ...
└── constants.ts           # Magic numbers, config defaults
```

---

## Dev vs Production

| Aspect | Development | Production |
|--------|---|---|
| **Database** | SQLite (`dev.db`) | PostgreSQL (managed by Railway) |
| **Storage** | Local `/uploads/` folder | Cloudflare R2 (S3-compatible) |
| **Server Port** | 3001 (localhost) | Auto-assigned by Railway |
| **Frontend Port** | 5173 (Vite dev server) | Served from Express at `/` |
| **Media URLs** | `http://localhost:3001/uploads/...` | `https://<r2-bucket>.r2.cloudflarestorage.com/...` |
| **Auth** | DEV_BYPASS_AUTH env var (optional) | Session token + CSRF token required |
| **ECMWF Grid** | Fetched from API, cached in SQLite | Fetched from API, cached in PostgreSQL |
| **Gemini API Key** | Optional (demo mode if missing) | Required (production operations) |
| **Logging** | Console output | JSON via Railway logs dashboard |
| **CORS** | Permissive (localhost) | Restricted to production domain |
| **Domain** | localhost:5173 / localhost:3001 | www.skyhighparagliding.org.au |

---

## Key Architectural Patterns

### Unified Database Adapter (DECISION-001)
Single codebase supports both SQLite and PostgreSQL through abstraction. `server/db.ts` detects `DATABASE_URL` env var; if missing, uses SQLite (development). In production (Railway), PostgreSQL connection string is auto-injected by Railway. Zero code changes needed for dev-to-prod migration.

### Grid Caching (DECISION-003)
ECMWF continental wind grids (Victoria 0.35°, Wide 2.0°) are fetched once per day and cached in database as 7-day rolling storage. Wind map requests interpolate from cached data instead of calling API in real-time. Balances freshness (daily updates) vs. cost (1 API call/day instead of 1000+).

### Server-Sent Events (SSE) for Retrieval
Real-time chat during pilot retrieval operations uses HTTP long-polling via SSE. No WebSocket dependency; works through Railway's proxy. Clients maintain connection; server pushes location updates, status changes, and messages.

### Service Layer with Demo Mode
`server/services/real/` and `server/services/demo/` allow swapping implementations without code changes. When `DEV_BYPASS_AUTH` is set, Gemini, TidyHQ, and storage services return stubbed data for testing without API calls.

### Canvas + D3 Wind Map
Wind vectors rendered to `<canvas>` with D3 handling zoom/pan math. Faster than SVG for thousands of vectors. Bilinear interpolation computes wind at arbitrary (lat, lon) from grid corners at render time.

---

## Development Workflow

1. **Local Dev:** `npm run dev` starts concurrent API (port 3001) + Vite client (port 5173)
2. **Database:** SQLite auto-created on first run at `dev.db`
3. **No migrations:** SQLite schema created automatically by `db.ts` on startup if not exists
4. **Demo Mode:** Set `DEV_BYPASS_AUTH=true` to stub Gemini, TidyHQ, and storage; no API keys needed
5. **Production Build:** `npm run build` bundles server with esbuild and frontend with Vite
6. **Deploy:** Push to GitHub; Railway auto-deploys and restarts server

---

Last updated: 2026-05-18 (Railway deployment)
