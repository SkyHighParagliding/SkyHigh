# RESUME_HERE — Last updated: 2026-09-26 (session 68)

## Project: SkyHigh
## Status: Active — on `main` (== origin/main). Two fixes shipped + prod-verified this session.

```
branch: main   (== origin/main; Railway auto-deploys main)
```

## Session 68 (2026-09-26) — weather-icon "sun over rain" fix + ECMWF strip enhancement

**Both shipped to prod, both prod-verified.**

**1. Weather-icon fix (`653eba4`).** Jon reported Portsea showing sun/cloud while
Windy (same ECMWF) showed rain all morning. Root cause (proven, not guessed): the
forecast icon was derived *solely* from `weather_code`. The S3 grid mirror doesn't
carry `weather_code`; it's restored by a REST-API **field top-up** that runs *after*
the pipeline's cancellation gate (`pipeline.ts:348` throws, `:354` tops up) — so a
force-cancelled fine-grid run (today's 5am cron was cancelled, `fineGridLastResult`)
leaves it absent grid-wide → `getWeatherCodeSummary(undefined)` = `{"Unknown","CloudSun"}`
for every hour of every site, even though `precipitation`+`cloud_cover` ARE present.
Proven on Portsea: grid carried 0.1–8 mm precip + 100% cloud, served forecast was all
CloudSun/Unknown.
- Fix: new `deriveWeatherCode(precip,cloud)` + `deriveWeatherPresentation(code,precip,cloud)`
  in `server/weather-utils.ts` (defers to a real code, else derives one — all through
  `getWeatherCodeSummary`). `fineGrid.ts` `buildFinePoint` now fills `weather_code` from
  precip+cloud wherever the top-up left it absent (same pattern as the `lifted_index`
  derivation). `extract.ts` (×2) + `extendedForecast.ts` (×2) icon calls use the helper.
- Verified vs authoritative Open-Meteo `weather_code`: wet morning now drizzle/rain,
  overcast afternoon Cloudy, clearing evening — zero 2-step errors. **7-day TODAY icon
  now CloudDrizzle (was CloudSun).**
- Honest limit: derived code is coarse (can't tell fog/thunder/snow — needs vis/CAPE/temp);
  the real top-up still adds value when it runs. Optional follow-up: nudge the drizzle→rain
  threshold up (currently ≥0.3 mm→light rain; ECMWF treats ≤0.5 mm as drizzle).

**2. ECMWF Forecast strip enhancement (`62f2a9c`).** The strip (above 7-Day) showed only
wind dir+speed for a fixed 7-hour window. Now shows the same rich hourly data as the 7-Day
"Today" expansion — **weather icon + dir + speed + gust (G##) + temp** — and scrolls/
drag-pans across the **full day** (auto-scrolls to current hour). Implementation: extracted
the existing `SlotStrip` (was private to `ExtendedOutlookPanel`) into
`src/components/weather/SlotStrip.tsx` and reused it for `HourlyForecastStrip`, fed the full
`forecasts` array (already carried icon/gust/temp — old strip just didn't render them).
Threaded `forecasts`+`iconMap` props. No backend/data change. Playwright-verified on prod.

**Ops facts learned this session (see memory):**
- `/health` `uptime` is **milliseconds** (`Date.now()-startTime`); a reset to a small value
  = deploy swapped in. Reliable deploy-detection signal.
- **Railway auto-deploy stalled ~1 hr** on the first push (didn't fire until Jon nudged the
  dashboard); the second push deployed in <1 min. Prod memory 95–97% "unhealthy" (memory
  check fails → `/health` 503) — the known Sept-22 incident; worth watching re: whether it
  interferes with deploy healthchecks.
- `POST /api/weather/scrape-now` is **unauthenticated** and forces `fetchFineGrid(true)` +
  forecast rebuild — a remote lever to force a grid rebuild.
- Portsea site id = `portsea`; `/api/sites` returns 50 by default, use `?limit=500`.
- `railway` CLI is installed but **not authenticated** (needs interactive `railway login`);
  no token in `.env`. `gh` not installed in the bash env.

### Open / next (session 68)
- Optional: tune `deriveWeatherCode` drizzle↔rain threshold to hug ECMWF's convention.
- The auto-deploy stall + prod memory pressure (95–97%) are worth a dedicated look.

## Session 67 (2026-09-22) — prod outage recovery + Site Logic + weather-card features

**Production incident (resolved):** Railway app crash-looped — the **500 MB Postgres
volume was 99% full** (`could not write init file: No space left on device`) during the
~5am grid write. Fixed: Jon upgraded to Pro, I **live-resized the volume 500 MB → 5 GB**
and restarted. Second symptom: **Open-Meteo free-tier daily quota exhausted (429)** →
SkewT soundings down (self-heals at daily reset). Diagnosed via Playwright on the Railway
dashboard. Full write-up: `memory/prod-volume-and-openmeteo-incident.md`.

**Shipped to prod this session (all pushed, all verified):**
- **Grid S3-mirror-primary + fine-grid API top-up** (`fix/grid-mirror-primary`, commit
  d88d1b2) — bulk grid now off the rate-limited API onto the unlimited S3 mirror; the two
  fields S3 lacks (weather_code, precip_probability) restored via a best-effort API top-up
  that degrades to absent-not-zero. Prod-verified: 3784/3784 from S3, top-up applied.
- **DB-volume email alert** (a5cbe06) — `checkDatabaseVolume` warns admins once when
  pg_database_size crosses `dbSizeAlertMb` (default 3500 MB ≈ 68% of 5 GB). Dormant now (~500 MB).
- **Gust caution pill** (`⚠ GUSTY`, c391663) — rating-scaled gust ceiling on the weather cards.
- **Site Logic doc + 474-entry catalogue + admin page** (6295be5) — `docs/site-logic.md`
  (principles/template/catalogue) + `docs/site-logic/`, `AGENTS.md`, `/admin/site-logic`.
- **Tapped-point card: forecast time line** (73af678) + **nearest live-station wind**
  (d7da584, labels `Fcst`/`Live`, b6e01f6) — `Wind Fcst 3kt N | Live 6kt NW` when the
  scrubber is at "now" and within `LIVE_WIND_RADIUS_KM` (5 km) of a live site. Prod-verified
  by Playwright at Mystic (inside → Live shows; outside → forecast only).
- **Grid Fetch-Now double-click guard** (92ef829).

## Open / not done (optional, non-urgent)
- Open-Meteo **API key** (`OPEN_METEO_API_KEY`, code already supports it) would make the
  fine-grid top-up reliably complete instead of best-effort. Jon: no paid key for now.
- **Startup-fetch guard** — deemed unnecessary (S3-primary already removes the crash-loop→API drain).
- Smart Search re-eval **build** (from session 66) still not started — design ruleset is in
  `memory/smart-search-reeval-decisions.md` + `docs/site-logic.md`.

## Session 66 (2026-09-19) — public Smart Search re-evaluation (DESIGN ONLY)

Re-examined the public Smart Search for answer safety, driven by re-reading the full
135-entry July-2026 query log (`SkyHigh — Smart Search Log.pdf` at repo root). **No code
changed this session** — output is a closed design ruleset in memory:
`memory/smart-search-reeval-decisions.md` + `memory/gust-tolerance-rule.md`.

**All decisions confirmed by Jon. Nothing built yet.** Key rulings:
- **Philosophy:** assistant builds a coarse shortlist + names what to watch; never makes
  the go/no-go call. Eligibility = hard fact; weather = options + caveats, decision to the
  pilot + the site's hourly tools.
- **Weather buckets:** hard-stop (drops the day) = wrong wind direction · sustained blown-out.
  Caution (surface, flag, never drops) = precipitation · gusts over ceiling · light wind.
- **Gust ceiling (SSO-confirmed, rating-keyed):** `top-of-range + allowance×mean`, mean =
  (low+high)/2, PG4+ 0.50 / PG2-3 0.25. Portsea 10-14 → 20 / 17 kn. Over-ceiling = strong
  "launch-in-the-lulls" caution, NOT exclusion. Compute in TS; makes RATING-FIRST a prerequisite.
- **Answer to the asker's rating; never authorise** — supervised clearance is the supervisor's call.
- **Fixed gates:** Type F flight-technique how-to → refuse/redirect to instructor; HG pilot →
  "no HG data, see an instructor" (triggers on asker's HG rating); emergency → existing `safetyGate.ts`.
- **Taxonomy:** 10 question types (A–J); each of the 135 log entries → a labelled eval case.

**Next: the build, in this order (prompt depends on the module's tag format):**
1. Gust/weather module — parse site wind range → low/high, compute per-rating ceiling,
   classify each day hard-stop/caution/ideal, emit pre-computed reasoned tags
   (extend `conditionQualifications.ts` or new module). Verify site `windSpeed` is parseable.
2. Rework the public prompt in `server/routes/search.ts` (`getDefaultPublicPrompt` +
   `getDefaultEligibilityRules`, ~line 818) around the eligibility-fact / weather-option
   split; wire Type F + HG gates alongside the emergency gate.
3. 135 labelled eval cases → `scripts/eval-smart-search-units.ts`.
Also owed: a DECISION record in `wiki/03-decisions-log.md` + tasks in `wiki/02-tasks.md`.
Open scope point: whether HG refusal is blanket (incl. plain HG facts) — Jon leaning yes.

## Session 65 (2026-09-19) — base-map legibility on the wind/thermal maps

The CARTO base map washed out under the heat/wind overlay, costing pilots their
orientation. Added two ref-driven levers in `MapCanvas` (no React re-render/frame)
plus an admin control. See DECISION-015 and `wiki/12-map-ui-style-guide.md` rule 11.

- **Base-map detail slider** (readout, both maps) — after the overlay draws, the same
  base tiles are re-composited with `multiply` at an alpha, darkening the base's
  roads/rivers/borders back in without dimming the overlay colours. Measured ~2.6×
  line↔bg contrast at full, bg moves ~2%.
- **Town-names toggle** (the map icon in front of the slider) — CARTO
  `light_only_labels` transparent tiles drawn **last, on top** of the overlay so
  names stay legible (`L<key>` cache key, ~1 KB/tile).
- Both shared by wind + thermal, remembered per browser (`skyhigh.basemapIntensity`,
  `skyhigh.showMapLabels`). **Committed + pushed `e64b02f`.**
- **Admin per-map band** (Admin → Forecast → "Base-map detail range"): the pilot's
  slider is a *position*; effective alpha = `floor + position×(ceiling−floor)`, with
  floor/ceiling set separately for Wind and Thermal (`wind*/thermal*BasemapDetailFloor
  /CeilPct`, defaults 0/100 = no-op). Fields in `AdminForecast.tsx` (existing threshold
  pattern, no migration); remap lives in `SitesWindMap.tsx`. **Committed + pushed
  `7c7f04d`.** Verified end-to-end: admin save persists to `/api/settings`, and a 30%
  wind floor darkened the base at slider-0 on the live map.
- **All work this session is committed + pushed** (`e64b02f`, `7c7f04d`, docs `88124f9`);
  `main == origin/main`. Railway auto-deploys.
- Docs updated: `wiki/12-map-ui-style-guide.md` (rule 11 + readout row),
  `wiki/03-decisions-log.md` (DECISION-015 + table), `RESUME_HERE.md`, `CLAUDE.md`
  Section 0, `AdminManual/ProductSpec/TechSpec.tsx`. New future notes:
  `wiki/future/vector-basemaps.md` and `wiki/future/3d-flight-replay.md` (cross-linked;
  both share an "adopt MapLibre GL" foundation but are independent). Memory: `carto-basemap`.

## Next / open items (session 65)
- Nothing outstanding from this session — base-map legibility + admin band shipped.
- **Optional follow-ups Jon mentioned/deferred:** admin default for the town-names
  toggle (currently a pure pilot preference); label contrast — using `light_only_labels`
  (dark text); `dark_only_labels` + a halo would read better over dark/purple overlay
  regions if names ever get lost.
- **Future candidates (noted, not scheduled):** CARTO vector basemaps (MapLibre) and a
  3D GPX flight replay — see the two `wiki/future/` notes above.

## Session 64 (2026-09-16) — thermal-map / site-panel cleanup (pushed)

All in `SiteThermalPanel` + the thermal renderer, reviewed on-device:
- Removed the pinch-to-zoom hint; legend is now a tap-to-toggle **"Key"** pill
  that expands to a readable panel and matches the map: SVG cumulus glyph (port
  of `traceCumulus`), grey swatch = overcast, blue swatch = rain, drawn hollow/
  solid OD triangles.
- Tapped-point ✕ now **fully dismisses** — added `clearPinRef` (MapCanvas) +
  `dismissRef` (ThermalCanvas) so the ✕ clears the pin, not just the box (the
  render loop was repainting it). Tapped-point box shows a **Rain** line with
  drizzle/rain/showers typing (`src/lib/precip.ts`, weather_code).
- New **Admin → Forecast** opacity knobs: `thermalHatchOpacity` (0 hides the
  screen-space hatch that "walks" on pan), `thermalOvercastOpacity`,
  `thermalRainWashOpacity` — all in `ThermalTuning`.
- Cumulus glyph **depth cap 1200 m → 600 m** so size/brightness visibly track
  cloud depth in the normal 100–400 m band (was ~1 px, imperceptible).
- Admin `admin@example.com` dev password reset to `devadmin` (dev DB only).

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
