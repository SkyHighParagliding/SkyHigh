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

### Smart Search — "Report bad answer" button + reason field
- **Completed:** 2026-09-15
- **What changed:** The ThumbsDown "Report incorrect response" button already existed. Added an optional free-text **reason** field: clicking the button now opens an inline textarea ("what was wrong with this answer?") with Submit/Cancel. Reason (≤1000 chars) is POSTed to `/api/search-logs/flag` and stored in the new `search_logs.flag_reason` column (migration `046`). Admin log view (Admin → API Settings → Smart Assistant → Search Query Logging) shows the reason under flagged entries. Files: `PublicSearchBox.tsx`, `searchLogs.ts`, `useConnectionsConfig.ts`, `AdminConnections.tsx`, `046_search_logs_flag_reason.sql`.

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

## 🔵 Low Priority / Deferred

### TASK-REVIEW-F — useWindPlayback Hook Extraction
- **Effort:** M (2–3 hours)
- **What:** Extract shared playback state from `WindMapProto.tsx` and `SitesWindMap.tsx` into `src/hooks/useWindPlayback.ts`
- **Shared state:** `isPlaying`, `playSpeed`, `currentTime`, `playIntervalRef` with `setInterval` effect, `cycleSpeed()` using `nextSpeed()`, `formatWindMapTime()`
- **Non-critical:** ~30–40 lines duplicated. Review tasks A–E already addressed perf concerns.
- **Pick up when:** Touching wind map code — refactor as you go.
- **Files:** `src/components/WindMapProto.tsx`, `src/components/SitesWindMap.tsx`, new `src/hooks/useWindPlayback.ts`

---

