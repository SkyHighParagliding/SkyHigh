# Current Tasks — Last updated: 2026-09-05

> **1 incomplete task remain.** Pick from this list when resuming.
> Companion file: `RESUME_HERE.md` has the same info in a different format.

## ✅ Done

### TASK-030 — Siteguide Version Change Email Notification
- **Completed:** 2026-09-05 (session 47)

### Smart Search manual-test issues — Fixed
- **Completed:** 2026-09-05 (session 47)

### Craigie Rd, Mt Martha — Repointed to Davis station
- **Completed:** 2026-09-05 (session 47)

### TASK-031 — Pilot XC Flight History Export (CSV/GPX)
- **Completed:** 2026-06-03
- **What changed:** Added `GET /api/flights/export?format=csv|gpx` endpoint in `server/routes/flights.ts`. Implemented database queries to resolve sites landing zones and bulk flight breadcrumbs. Added "Export All" dropdown menu to `src/pages/FlightHistory.tsx` list view. Download logic uses secure fetch with authorization headers.

### TASK-SQLITE-REMOVAL — Complete SQLite → PostgreSQL migration
- **Completed:** 2026-05-27
- **What changed:** Removed `better-sqlite3` entirely. Converted all server code to use
  `query`/`queryOne`/`execute`/`transaction` from `server/pg.ts`. Deleted 28 migration files,
  4 dead utility files, `sqliteDb.ts`, `pgDb.ts`, `migrate_storage.ts`, `api.test.ts`.
  Stripped `server/db.ts` to PG-only. Zero `db.prepare` / `import db from` references remain.

### TASK-035 — Add cross-env to package.json
- **Completed:** 2026-05-20
- **What changed:** Added `cross-env: ^7.0.3` to devDependencies. Both `npx cross-env` → `cross-env` in start + analyze scripts.

---

## 🔴 Quick Wins (start here)

### Smart Search — "Report bad answer" button
- **Effort:** S
- **What:** Add a "Report bad answer" button to the public Smart Search chat UI (`src/components/PublicSearchBox.tsx`) so pilots can flag wrong/unsafe responses.
- **Why:** The July 2026 query-log audit found serious errors only because an admin manually reviewed 135 logged entries. A report button surfaces bad answers immediately.
- **Sketch:** Button on each assistant message → POST flags the matching `search_logs` row (add `flagged` column or reuse the log insert) → admin log view (Admin → API Settings → Smart Assistant → Search Query Logging) filters/shows flagged entries; optional email notify like the existing log-size warning.
- **Pairs with:** the new safety layer shipped 2026-07-03 (safetyGate / eligibility / responseEnforcement) — flagged entries become new eval cases in `scripts/eval-smart-search-units.ts`.

---

## 🔵 Low Priority / Deferred

### TASK-REVIEW-F — useWindPlayback Hook Extraction
- **Effort:** M (2–3 hours)
- **What:** Extract shared playback state from `WindMapProto.tsx` and `SitesWindMap.tsx` into `src/hooks/useWindPlayback.ts`
- **Shared state:** `isPlaying`, `playSpeed`, `currentTime`, `playIntervalRef` with `setInterval` effect, `cycleSpeed()` using `nextSpeed()`, `formatWindMapTime()`
- **Non-critical:** ~30–40 lines duplicated. Review tasks A–E already addressed perf concerns.
- **Pick up when:** Touching wind map code — refactor as you go.
- **Files:** `src/components/WindMapProto.tsx`, `src/components/SitesWindMap.tsx`, new `src/hooks/useWindPlayback.ts`

---

## 🟣 Large / Strategic

### TASK-032 — Multi-Club White-Label Test
- **Effort:** L (1–2 days)
- **What:** Deploy second independent instance for a different club; prove white-labellability
- **Infrastructure exists:** Branding engine (`server/routes/branding.ts`, `SettingsContext.tsx`), admin panel for club name/logo/colors, custom home page, wind map viewport
- **Needs:**
  1. Second Railway project + PostgreSQL database
  2. Same codebase, different `DATABASE_URL` + club name
  3. Customize branding through admin panel
  4. Different domain (e.g., `anotherclub.org.au`)
  5. Verify no data leakage between deployments
- **Risk:** May be hardcoded "SkyHigh" references that should pull from settings
- **Files:** Multiple — full codebase audit for hardcoded strings
