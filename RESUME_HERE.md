# RESUME_HERE — Last updated: 2026-09-15 (session 63)

## Project: SkyHigh
## Status: Active — on `main`. Meteogram Stage 1 committed (flag-gated, review OK)

```
branch: main   (== origin/main; Railway auto-deploys main)
```

## ✅ Meteogram Stage 1 — committed, flag-gated (default OFF)

Reviewed with Jon on-device 2026-09-15 (dev server over LAN) and committed. Inert
in prod until `featureMeteogram` is enabled in Admin → Forecast. Full spec:
`wiki/future/meteogram-plan.md`.

- `server/grid/siteMeteogram.ts` — `buildSiteMeteogram`: thermal-grid
  ceiling/Cu-base/band + fine-grid wind/precip, no new fetch.
- `server/routes/weather.ts` — `GET /:siteId/meteogram` (parses `launchHeight`
  display string like "798m / 2618'" to metres).
- `src/components/weather/SiteMeteogramChart.tsx` — SVG chart: BL Top + Cu Base
  lines, per-hour W* band (matches map), launch line, sky-icon row, wind row
  (speed/compass), crosshair, unit toggle (m/ft via useUnits).
- `SiteThermalPanel.tsx` — `[Map]/[Chart]` toggle + chart-variant help modal.
- `ThermalHelpModal.tsx` — `variant='chart'` explainer.
- `AdminForecast.tsx` — `featureMeteogram` switch. `SettingsContext.tsx` — expose
  the key (it uses an allow-list; forgetting this silently hides the toggle).

### Stage 1b (partial) + rain awareness — shipped to prod 2026-09-15

- **Flying-window bar** on the chart (green/amber/grey per hour) + wired the
  cumulus/overcast/storm thresholds to the existing Admin → Forecast keys.
- **Rain, chart:** softened the fly-bar rain gate — real rain (≥ `thermalRainOffMm`,
  new admin key, default 1 mm/hr) = grey; light/showery rain or high precip
  probability = amber. Trace drizzle no longer greys a good hour.
- **Rain, MAP (NOT flag-gated — live on the thermal map):** added `precipitation`
  to the **thermal grid** (thermalGrid/bounds/extract/thermalInterpolation, same
  optional-field pattern as the TASK-036 cloud fields) and a translucent blue
  **rain wash** in `thermalRenderer.ts` (fades in from 0.1 mm/hr, saturates at
  `thermalRainOffMm`). Degrades to no-wash until the thermal grid refetches.
  **⚠️ Requires a Thermal grid refetch to populate precip** (cron 5:26am or manual
  "Fetch now"). Only the thermal grid changed; wind/7-day grids untouched.

Still TODO in 1b: novice mode, tap-to-explain, 7-day strip, mobile key-stats.
Then Stage 2 (pressure-level soundings → 2D stability background + wind barbs).

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

- **Prod smoke test — DONE (Jon, 2026-09-15):** Admin → Documents verified
  working on production after deploy. The Drive refactor (Apps Script bridge,
  googleapis half removed) is confirmed live. Nothing outstanding from the
  cleanup.
- **Resolved 2026-09-15 (three small wins):**
  - `nomadsGfs.ts` `makeSemaphore` dedup was **already done** (commit `2df34da`)
    — it imports from `s3ReadCommon.js`, no local duplicate remains. Verified.
  - `TASK-036` **duplicate ID** fixed: the Closure Calendar task renamed to
    `TASK-032` (the free ID); thermal-map `TASK-036` kept its ID (memory +
    `wiki/prompts/TASK-036.md` + code comments all reference it).
  - `GridBoundsSelector.tsx` stale label fixed: "Fine 0.15°" → "Wind 0.15°".
- **SKIP (accepted):** ~33 fallow "unused-export" items are symbols used only
  inside their own file — removing the `export` keyword is pure cosmetics, not
  dead code. Deliberately not doing a blanket sweep (git-blame noise, mild
  risk, some intentional). Consciously accepted, not a TODO.
- **TASK-SW-001 DONE 2026-09-15:** consolidated the two `/`-scope service
  workers into a single `public/sw.js` (merged the tile-caching fetch handler;
  activate now preserves `skyhigh-offline-tiles` instead of wiping all caches;
  deleted `public/sw-tiles.js` and its `useXCMapState.ts` registration). The
  real bug was `sw.js`'s activate wiping the prefetched offline tile cache on
  every non-XC page. CARTO-exclusion caveat preserved.
- **TASK-REVIEW-F DONE (already):** `useWindPlayback.ts` was already extracted
  and consumed by both wind-map components — the deferred note was stale. Marked
  done in wiki, no code change needed.
- **TASK-030 DONE 2026-09-15:** siteguide version-change email. Everything but
  the email already existed (daily cron, change detection, DB log surfaced at
  `GET /api/sites/siteguide-version-check/status`, auto zone-download + import).
  Added `notifySiteguideVersionChange()` in `siteguideVersionCheck.ts` — emails
  admins + the `siteguideAlertRecipients` setting (default jonpamment@gmail.com)
  via Resend, called from the scheduled change branch. Best-effort, never
  throws. Not runtime-verified (needs `RESEND_API_KEY` + a real version bump).
- Also reconciled stale doc state: Tasks 031 (XC export) and 032 (closure
  calendar) were already implemented but still marked Backlog — now marked done.
  The backlog is empty.
- Carried smaller items (unchanged): deferred R2 terrain-tile mirror. Larger
  candidate: SkyHigh RASP meteogram (Phase 1 buildable now).
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
