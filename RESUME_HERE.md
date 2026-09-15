# RESUME_HERE — Last updated: 2026-09-15 (session 63)

## Project: SkyHigh
## Status: Active — on `main`, everything below is deployed to production

```
branch: main   (== origin/main; Railway auto-deploys main)
```

Session 63 was a **fallow-driven dead-code cleanup**. PR #1 (branch
`cleanup/dead-code-session63`, now deleted) was merged to `main` (`dc809fc`)
and Railway is auto-deploying. Started at 160 fallow issues; the only
remainder is ~33 cosmetic "drop the `export` keyword" items that are NOT dead
code (see "Deferred, by choice" below).

## What shipped this session (all merged to main → deploying)

- **High-confidence dead-code removal** — deleted 3 orphaned files
  (`useAdmin.ts`, `useAdminData.ts`, `tilePrefetch.ts`), verified-dead exports
  (`parseDavisEmbedUrl`, `computeCCL` re-export), 5 dead duplicate types in
  `src/types/api.ts`, 2 dead class members. The 66 `Demo*`/`Real*` service
  methods fallow flagged were **false positives** (interface-dispatched via
  `req.services.*`) — kept.
- **Removed the dead Google Drive googleapis fallback**, kept the live Apps
  Script bridge. Drive listing/upload/etc. run entirely through
  `getAppScriptUrl()` + HTTP to the bridge (the `drive_appscript_url` setting).
  The googleapis-client half (`registerDriveClient`/`getClient`/`listFiles`…)
  was unreachable — never wired, `googleapis` not even a dependency — so it and
  the unreachable `else` branches in `documents.ts`/`projects.ts`/`ai.ts` were
  removed. **Bridge path untouched.** See [[drive-appscript-bridge]].
- **Removed 4 unused hooks** (`useFlight`, `useBulkWeather`, `useTideStations`,
  `useAdminNews`) + dead key factories; deleted 2 hand-run dev scripts
  (`check-thermal-db.mjs`, `clear-thermal-cache.mjs`).
- **Broke the `openMeteoS3 ↔ ecmwfLiftedIndex` circular dependency** by
  extracting the shared S3 read primitives (`READ_PARALLELISM`, `IO_SIZE_MAX/
  MERGE`, `makeSemaphore`, `withSlowDownRetry`) into a new leaf module
  `server/grid/providers/s3ReadCommon.ts`. Pure move, no behaviour change.
- **Wired 6 grid regression tests into `npm test`** (they were real regression
  tests, not debug throwaways; `grib2` kept separate as it hits the network).
  Wiring caught and fixed a stale assertion (`ThermalPoint.hourly` was missing
  the legitimately-added `cloud_cover`/`cloud_cover_low`).
- **Committed the siteguide airspace/zone cache refresh** (v869 → v876,
  published 2026-09-10) directly to `main` — backs the XC airspace overlay.
  This resolves the long-standing "undecided uncommitted edit" from session 62.

## Next / open items

- **Prod smoke test (Jon):** when the deploy is live, verify **Admin →
  Documents** — categories list, open a category (file listing), one upload +
  delete. That exercises the Apps Script bridge, the one live path the Drive
  refactor sat next to. Everything else is covered by `tsc` + `npm test`.
- **Deferred, by choice (from the cleanup):**
  - **DO (small):** `nomadsGfs.ts` has its own local `makeSemaphore` duplicate —
    now that `s3ReadCommon.ts` exists it should import from there. Verified
    identical; ~5-line dedup. Worth doing to close the loop.
  - **SKIP (accepted):** ~33 fallow "unused-export" items are symbols used only
    inside their own file — removing the `export` keyword is pure cosmetics, not
    dead code. Deliberately not doing a blanket sweep (git-blame noise, mild
    risk, some intentional). Consciously accepted, not a TODO.
- Carried smaller items (unchanged): `TASK-036` is a **duplicate ID** in
  `wiki/02-tasks.md` (thermal work vs "Site Scheduled Closure Calendar") — pick
  one and rename; `GridBoundsSelector.tsx` still says "Fine 0.15°" after the
  Fine→Wind rename; TASK-SW-001 (consolidate the two `/`-scope service workers);
  deferred R2 terrain-tile mirror.
- **Never authenticate to production using `DEFAULT_ADMINS`** from the local
  `.env`. Jon performs privileged prod actions himself via the admin UI.

## Revert points (historical — de-brand, session 62)

`pre-debrand-2026-09-15` tag, `backup/pre-debrand-2026-09-15` branch. Keep until
the de-brand has soaked in prod.

## Quick context refresher

SkyHigh is permanently one club's site (native single-club — the template engine
is gone). The wind/thermal map covers 3 days with a day-labelled slider and
admin-tunable thermal thresholds (Admin → Forecast). Google Drive document
management works via the Apps Script **bridge** (`drive_appscript_url` setting),
not a googleapis client. The CC BY 4.0 Geoscience Australia attribution is a
licence obligation — do not remove it. `.env` is drawn from 1Password at session
start and wiped at end.
