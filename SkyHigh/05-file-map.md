---
name: File Map — Important Files and Their Roles
description: Curated navigation guide to key non-obvious files in the codebase
type: wiki
---

# File Map — Important Files and Their Roles

**What this is:** A guide to important files you'll touch or reference during development. Not an exhaustive file listing (that's not useful); instead, a curated map of non-obvious locations where important things happen.

**When to use it:** You're debugging a feature or want to know "where does X happen?" Check here first.

---

## Root Configuration & Entry

### `server.ts`
HTTP server entry point. Creates Express app, configures middleware (auth, CSRF, error handler), mounts routers, and starts listening on port 3001. **Read this first if debugging routes or middleware order.**

### `esbuild.server.mjs`
Production bundler config. Bundles `server.ts` and all dependencies into `dist/server.js` for Railway deployment. Modified for platform-specific builds if needed.

### `vite.config.ts`
Frontend build config. Configures Vite (dev server at 5173, build output, Tailwind integration). Frontend dev server auto-restarts on file changes.

### `tsconfig.json`
TypeScript compiler settings. Strict mode enabled. Paths aliased for cleaner imports (e.g., `@/components` → `src/components`).

### `package.json`
Dependencies and scripts. Key scripts: `npm run dev` (concurrent API + Vite), `npm run build` (esbuild + Vite), `npm start` (run prod bundle).

### `.env.template`
Documentation of all environment variables needed. Rename to `.env` and fill in for local dev. Committed to git (no secrets here).

---

## Server Core (`server/`)

### `server/db.ts`
**Unified database adapter.** Routes queries to SQLite (dev) or PostgreSQL (prod) based on `DATABASE_URL` env var. All backend database access goes through here. **Read this to understand DECISION-001.**

Exports: `query()`, `transaction()`, `pool` (for direct access if needed).

### `server/pgDb.ts`
PostgreSQL driver and pooling. Handles connection creation, pool config, and query execution for Postgres. Called by `db.ts` if `DATABASE_URL` set.

### `server/victoriaGrid.ts`
**ECMWF grid caching core.** Fetches Victoria (0.35°) and Wide (2.0°) grid data, stores to database, handles 7-day cleanup, and implements bilinear interpolation. **Read this to understand wind map data flow and DECISION-003.**

Key functions:
- `fetchAndCacheVictoriaGrid()` — fetch fresh grid, store, cleanup old
- `getWindAt(lat, lon)` — interpolate wind vector from cached grid
- `interpolateWind()` — bilinear interpolation math

### `server/weather.ts`
**Scheduled jobs orchestrator.** Cron-like scheduler checks every minute which tasks are due (grid fetch, TidyHQ sync, etc.). Stores last-run times in `settings` table. Melbourne timezone.

Key: On startup, checks `victoriaGridLastRun` and `wideGridLastRun` settings. If > 12 hours ago, triggers fresh fetch after delay.

### `server/storage.ts`
**Media storage abstraction.** Routes file uploads to local `/uploads/` (dev) or Cloudflare R2 (prod). **Read this to understand DECISION-002.**

Exports: `upload()`, `download()`, `delete()`, `getPublicUrl()`.

---

## Routes (`server/routes/`)

**Pattern:** Each feature (sites, flights, retrieval, admin) has a folder. `index.ts` handles GET/list endpoints; other files handle specific operations.

### `server/routes/sites/`

#### `index.ts`
`GET /api/sites` — list all sites, optionally filtered by `?public=true`. **Implements public sites cache with pagination bypass (DECISION-007).** If request has `?limit` or `?offset`, bypasses cache and fetches fresh.

#### `crud.ts`
`POST /api/sites` (create), `GET /api/sites/:id` (single site), `PUT /api/sites/:id` (update), `DELETE /api/sites/:id` (delete). Admin-only mutations, CSRF protected. Both GET endpoints include `upcomingClosureDates: string[]` (next 60 days).

#### `closures.ts`
Scheduled closure routes — registered **before** `crudRouter` in `index.ts` to prevent `/:id` matching `/closure-banners`:
- `GET /api/sites/closure-banners` — public; returns sites whose 7-day banner window is active
- `GET /api/sites/:id/closure-dates` — public; returns all future closure dates for one site
- `PUT /api/sites/:id/closure-dates` — admin-only; full-replace closure dates for a site

### `server/routes/flights/`

#### `index.ts`
`GET /api/flights` (list), `POST /api/flights` (submit). File upload handling for GPX, CSV formats.

#### `gpx.ts`
Parse GPX files (Garmin, generic). Extract lat/lon points, calculate distance, detect landing zone (where vertical speed becomes near-zero).

### `server/routes/retrieval/`

#### `sse.ts`
`GET /api/retrieval/:retrieval_id/sse` — Server-Sent Events endpoint for real-time chat. Client keeps connection open; server pushes messages and location updates. Stores conversation in database.

### `server/routes/admin/`

#### `dashboard.ts`
`GET /api/admin/dashboard` — Admin stats and scheduled job status (last grid fetch time, next scheduled fetch, TidyHQ sync status).

#### `grid-fetch.ts`
`POST /api/admin/grid-fetch-now` — Fire-and-forget manual grid fetch trigger. Returns immediately; fetch runs in background. **No blocking or infinite spinner.**

#### `sync-tidyhq.ts`
`POST /api/admin/sync-tidyhq` — Manual TidyHQ contact sync. Fetches contacts from TidyHQ API, upserts to `contacts` table, syncs role membership.

### `server/routes/auth/`

#### `login.ts`
`POST /api/auth/login` — Session token creation. Validates admin password (against `DEFAULT_ADMINS`), issues JWT or opaque token with 7-day TTL.

---

## Services (`server/services/`)

**Pattern:** `real/` folder contains actual implementations (calls Gemini API, TidyHQ webhooks, etc.). `demo/` folder contains stubbed implementations for testing without API keys. Selection via env var.

### `server/services/real/geminiService.ts`
Calls Google Gemini API. Functions:
- `scrapeAndSummarizeSiteGuide(url)` — fetch external guide, summarize
- `generateImageCaption(imageBuffer)` — caption user-submitted photo
- `moderateImage(imageBuffer)` — flag inappropriate content

Fallback to safe defaults if API fails (no throwing).

### `server/services/real/tidyhqService.ts`
Handles TidyHQ webhooks and API calls. Functions:
- `handleWebhook(payload)` — process incoming TidyHQ event (contact updated, role changed)
- `fetchContacts()` — poll TidyHQ API for all contacts

### `server/services/demo/`
Stubbed versions of `geminiService.ts`, `tidyhqService.ts`, etc. Used when `DEV_BYPASS_AUTH=true`. Return fake data; no API calls.

---

## Middleware & Utilities (`server/middleware/`, `server/utils/`)

### `server/middleware/auth.ts`
Verifies session token on protected endpoints. Extracts user_id and role from token. Aborts with 401 if missing/invalid.

### `server/middleware/csrf.ts`
CSRF token generation and validation. On first request (no session), generates token and returns in response header. On POST/PUT/DELETE, validates token from request header matches session token.

### `server/middleware/errorHandler.ts`
Global error handler. Catches exceptions, logs, and returns JSON error response (no HTML error pages).

### `server/utils/logging.ts`
Structured JSON logging. All server logs emit JSON with timestamp, level, component, message, and context (user_id, request_id). Used instead of `console.log`.

### `server/utils/validation.ts`
Zod schemas for request body validation. Applied to mutation endpoints to ensure data integrity before processing.

### `server/constants.ts`
Magic numbers and config defaults. Examples: `MAX_LIMIT` (500), `DEFAULT_LIMIT` (50), `GRID_CLEANUP_AGE_DAYS` (7), `RATE_LIMIT_WINDOW_MS` (60000). **Centralized for Phase 3 cleanup.**

---

## Database Migrations (`server/pg_migrations/`)

SQL migration files for PostgreSQL schema. Run on startup if `DATABASE_URL` set. Examples:
- `0001_init.sql` — initial schema (sites, flights, contacts, wind_grid_data, settings, sessions, etc.)
- `0002_add_indexes.sql` — add indexes for production (site cluster, flight date, etc.)

**Not used in SQLite dev** — schema created on-demand by `db.ts`.

---

## Frontend (`src/`)

### `src/main.tsx`
React entry point. Mounts `<App />` to DOM.

### `src/App.tsx`
Root router and layout. Defines routes:
- `/` — home page / sites list
- `/sites/:id` — site detail + wind overlay
- `/admin` — admin dashboard (protected)
- `/flights` — XC flight history
- `/retrieval/:id` — retrieval chat
- etc.

Provides global contexts (Auth, Settings, Theme).

### `src/index.css`
Tailwind CSS imports and custom CSS variables.

---

## Contexts (`src/contexts/`)

### `src/contexts/AuthContext.tsx`
Session token and admin status. Loaded from localStorage on app start. Used to protect admin routes.

### `src/contexts/SettingsContext.tsx`
**Persists wind map settings across reloads.** Stores:
- Wind map center (lat, lon)
- Zoom level
- Theme preference
- Fetches from API on startup; reads localStorage as fallback

Used by WindMap component to restore viewport on page load.

---

## Wind Map Components (`src/components/windmap/`)

### `src/components/windmap/WindMap.tsx`
Main wind map component. Creates `<canvas>`, sets up D3 zoom, runs animation loop (requestAnimationFrame). Fetches cached grid data from API, renders vectors.

### `src/components/windmap/windmapUtils.ts`
Core wind map math:
- `interpolateWind(lat, lon, gridData)` — bilinear interpolation
- `animateParticles()` — particle animation system (moves particles along wind vectors)
- `drawVector(ctx, lat, lon, u, v)` — draw single wind arrow on canvas

### `src/components/windmap/handleZoom.ts`
D3 zoom event handlers. Maps D3 zoom transform (translate, scale) to canvas transforms. Redraws wind map on zoom/pan.

---

## Sites Components (`src/components/sites/`)

### `src/components/sites/SitesList.tsx`
Public sites list (browse + search). Calls `GET /api/sites?public=true&limit=500` to fetch all sites. Uses pagination for display (front-end only, not API pagination).

### `src/components/sites/AdminSites.tsx`
Admin CRUD for sites. Calls `/api/sites` (POST to add, PUT to edit, DELETE to remove). Requires session token.

---

## Retrieval Components (`src/components/retrieval/`)

### `src/components/retrieval/RetrievalChat.tsx`
Real-time chat for pilot retrieval. Opens SSE connection to `GET /api/retrieval/:id/sse`. Displays messages as they arrive. Input field to send new messages.

### `src/components/retrieval/LocationShare.tsx`
Map showing pilot and retrieval team locations. Updates via SSE as team members move.

---

## Utilities (`src/utils/`)

### `src/utils/apiClient.ts`
Fetch wrapper with error handling. All API calls go through here. Adds session token to requests, parses JSON response, handles errors gracefully.

### `src/utils/validation.ts`
Client-side form validation (email format, required fields, etc.). Used in forms to provide instant feedback before submission.

### `src/utils/closureStatus.ts`
Shared closure logic used by Sites.tsx, SiteDetail.tsx, and ExtendedOutlookPanel.tsx:
- `getClosureStatus(site, today?)` — returns `{ isClosedToday, upcomingDates }` (upcomingDates = closure dates within next 7 days, not including today)
- `formatClosureDateRange(dates)` — formats date array as human string: single day "Fri 29 May", consecutive "Fri 29 – Sun 31 May", non-consecutive "Fri 29 May, Sun 31 May"
- `getBannerWindowStart(closureDates)` — returns the start of the 7-day banner window (first closure date − 7 days)

---

## UI Components (`src/components/ui/`)

### `src/components/ui/ClosureDatePicker.tsx`
Custom multi-date calendar picker for the admin site edit page. Built on date-fns (no additional dependencies):
- Month navigation with prev/next buttons
- Mon-first grid layout (using `(getDay(day) + 6) % 7` offset)
- Click to toggle individual dates on/off; selected dates highlighted in red
- Past dates greyed out and non-interactive; today highlighted with ring
- Shows "Closed: [formatted dates]" and "Banner window: [start] → [end]" summary below calendar
- "Clear all dates" button
- `disabled` prop greys entire component (used when "Permanently Closed" checkbox is checked)

Props: `selectedDates: string[]`, `onChange: (dates: string[]) => void`, `disabled?: boolean`

---

## Key File Dependencies

**Debugging wind map data stale on reload?** → Check:
1. `SettingsContext.tsx` (does it fetch from API?)
2. `weather.ts` (was grid fetch triggered on startup?)
3. `victoriaGrid.ts` (was fetch successful?)

**Debugging missing sites from list?** → Check:
1. `SitesList.tsx` (does it request `?limit=500`?)
2. `server/routes/sites/index.ts` (does cache-bypass check work?)
3. `db.ts` (does query return all rows?)

**Debugging admin mutation failing?** → Check:
1. `csrf.ts` (is CSRF token valid?)
2. `auth.ts` (is session token valid?)

**Debugging closure banners not appearing?** → Check:
1. `server/routes/sites/closures.ts` `GET /closure-banners` — is today within [firstDate-7, lastDate]?
2. `server/routes/sites/index.ts` — is `closuresRouter` registered before `crudRouter`? (prevents `/closure-banners` being matched by `/:id`)
3. `src/hooks/api/useClosureBanners.ts` — is the hook imported and called in `Home.tsx`?
3. `crud.ts` (does validation pass?)
4. `errorHandler.ts` (what's the actual error?)

---

Last updated: 2026-05-06
