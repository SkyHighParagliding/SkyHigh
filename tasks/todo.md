# Current Tasks — Last updated: 2026-09-15

> **No incomplete backlog tasks remain.** See wiki/02-tasks.md for the full log.
> Companion file: `RESUME_HERE.md` has the same info in a different format.

## ✅ Done

### TASK-030 — Siteguide Version Change Email Notification
- **Completed:** 2026-09-15. NOTE: an earlier "done session 47" mark was wrong — the
  cron/detection/DB-log/auto-import existed but the **email was never wired**.
  Added `notifySiteguideVersionChange()` (`server/utils/siteguideVersionCheck.ts`,
  called from `scheduledJobs.ts` change branch): emails admins + the
  `siteguideAlertRecipients` setting via Resend. Best-effort, never throws.

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

## ✅ Done (continued)

### TASK-SW-001 — Consolidate the two `/`-scope service workers
- **Completed:** 2026-09-15
- **What changed:** Merged `sw-tiles.js`'s tile-caching fetch handler into `public/sw.js` (now the single `/`-scope worker, registered once in `main.tsx`). Its activate handler preserves `skyhigh-offline-tiles` and only clears legacy caches (was wiping ALL caches — the real bug). Deleted `public/sw-tiles.js` and its `useXCMapState.ts` registration. CARTO-exclusion caveat preserved.

### TASK-REVIEW-F — useWindPlayback Hook Extraction
- **Completed:** already done in an earlier session (verified 2026-09-15). `src/hooks/useWindPlayback.ts` exists and both `WindMapProto.tsx` + `SitesWindMap.tsx` consume it; no duplication remains. The deferred note was stale.

---

