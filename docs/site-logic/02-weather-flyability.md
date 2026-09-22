# Weather Ingestion & Flyability Labels

> Area 2 of the SkyHigh site-logic documentation series.
> All file paths are relative to the repo root.

---

## Flyability Status Buckets

### Overall verdict priority order
- **What it is:** The overall flyability badge the pilot sees is composed from three sub-statuses (speed, direction, gust) merged under a strict priority chain: Blown Out > Not Flyable > Cross > Light. Gust is explicitly excluded from the overall verdict.
- **Why (the decisions):** [inferred from code comment] Gust is treated as advisory, not a hard stop, because a high gust peak in a forecast or average observation period does not necessarily mean the site is unlaunchable. The chain puts the most dangerous states first so a Blown Out speed can never be hidden by a Cross direction.
- **How (the mechanism):** `getWindStatus` in `src/lib/utils.ts:202–211`. If `speedStatus === "Blown Out"` that wins; else if `directionStatus === "Not Flyable"` that wins; else if `directionStatus === "Cross"` that wins; else if `speedStatus === "Light"` that wins; else "Good".
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide; Decisions stay with the human.

### Speed: "Blown Out" hard-stop
- **What it is:** `windSpeed > site.windSpeed.max` (i.e. above the top of the site's published ideal range) assigns label "Blown Out" and a red badge.
- **Why (the decisions):** Above-range wind is unambiguously dangerous for launching. No pilot discretion threshold exists here; the label is a hard stop, not a caution.
- **How (the mechanism):** `src/lib/utils.ts:174–175`. `roundedSpeed > maxSpeed` → `{ label: "Blown Out", color: "bg-red-500" }`.
- **Principles:** Assume the safest reading; Refuse rather than improvise at the edges; Deliberate, explained differences.

### Speed: "Light" soft-caution
- **What it is:** Wind speed below the site minimum gives a "Light" label (yellow) — a soft advisory, not a red stop.
- **Why (the decisions):** Below-range wind means thermal or soaring flight may be weak/impossible, but it is not dangerous. The colour difference (yellow vs red) communicates the asymmetry: too little wind is an inconvenience; too much is a safety issue.
- **How (the mechanism):** `src/lib/utils.ts:177–178`. `roundedSpeed < minSpeed` → `{ label: "Light", color: "bg-yellow-500" }`.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### Direction: "Not Flyable" hard-stop
- **What it is:** Wind from a direction that is neither in the site's ideal arc nor in the configured cross-left/cross-right adjacency gives label "Not Flyable" (red).
- **Why (the decisions):** A completely off-axis wind means the launch will not be soarable and the pilot is likely to fly into the hill. No tolerance band is applied — anything outside the explicitly good and cross ranges is hard-stopped.
- **How (the mechanism):** `src/lib/utils.ts:199`. Any direction not in `idealDirs` and not in `crossDirs` → `{ label: "Not Flyable", color: "bg-red-500" }`.
- **Principles:** Assume the safest reading; Refuse rather than improvise at the edges.

### Direction: "Cross" caution arc (±1 compass point)
- **What it is:** Each edge of the ideal direction arc can optionally extend by exactly one 22.5° compass step (one step left, one step right) as a "Cross" zone (orange). Per-site flags `crossLeft` / `crossRight` enable each side independently.
- **Why (the decisions):** [inferred] Many sites have a shallow arc where the flanking directions are safely launchable with care. The ±1-step granularity matches the 16-point compass resolution used throughout (no sub-step tolerance). The admin sets which sides apply, keeping the decision with the club.
- **How (the mechanism):** `getCrossDirections` in `src/lib/utils.ts:118–139`: steps one index in `directions[]` past each edge of `idealSet`, conditional on `crossLeft`/`crossRight`. `directionStatus → { label: "Cross", color: "bg-accent" }` at `src/lib/utils.ts:196–197`.
- **Principles:** Decisions stay with the human; Deliberate, explained differences; One source of truth per rule.

### Gust: caution-only, never hard-stop
- **What it is:** If the gust exceeds the gust ceiling (`top-of-range + allowance × mean`), a GUSTY badge appears in orange alongside the DIR and SPD badges. It never downgrades the overall verdict.
- **Why (the decisions):** Code comment at `src/lib/utils.ts:180–182` states explicitly: "Gust is a caution, never a hard-stop: it flags but never downgrades the overall verdict." Gusts are short-duration events; the mean wind decides launchability, while the gust reading informs pilot vigilance. A separate badge surfaces the concern without overriding the directional/speed assessment.
- **How (the mechanism):** `getWindStatus` in `src/lib/utils.ts:183–186`. `gustStatus.label = "Caution"` when `gust > computeGustCeiling(minSpeed, maxSpeed)` (default allowance 0.25). Badge rendered at `src/components/weather/WeatherCardApple.tsx:111–115`.
- **Principles:** Separate facts from judgements; Surface, don't hide; Decisions stay with the human.

---

## Gust Ceiling

### Rating-dependent allowance: 0.25 (low-PG) vs 0.50 (PG4+)
- **What it is:** The gust ceiling formula is `maxSpeed + allowance × mean`, where `mean = (minSpeed + maxSpeed) / 2`. The allowance is 0.25 for the conservative low-PG (PG2/PG3) band and 0.50 for PG4+. The public map has no rating context so it defaults to 0.25.
- **Why (the decisions):** Code comment at `src/lib/utils.ts:141–146` attributes this to an SSO-confirmed formula: a gust up to top-of-range plus a fraction of mean is tolerable. Higher-rated pilots can handle a larger gust ratio above mean (0.50 vs 0.25) because they have more skill and stronger equipment.
- **How (the mechanism):** `computeGustCeiling(minSpeed, maxSpeed, allowance = 0.25)` at `src/lib/utils.ts:147–150`. Called with default allowance from `getWindStatus` (public map context). Smart Search passes the pilot's band explicitly.
- **Principles:** Decisions stay with the human; Deliberate, explained differences; Assume the safest reading when context is missing.

---

## N/A Fallback When Site Data Is Incomplete

### "N/A" status when site has no wind spec
- **What it is:** If `parseWindSpeed` fails on both `site.windSpeed` and `site.windDir`, or `idealDirs` is empty, all statuses return `{ label: "N/A", color: "bg-gray-400" }` (grey). The GUSTY label is suppressed; the overall verdict is grey-N/A.
- **Why (the decisions):** [inferred] A site with no wind spec cannot be evaluated. Grey signals "no data" rather than "looks good" — preventing a false positive. The exception: `gustStatus` defaults to `"Good"` rather than "N/A" in this path (`src/lib/utils.ts:166`) but the overall verdict stays N/A.
- **How (the mechanism):** `src/lib/utils.ts:160–168`. Guard on `minSpeed == null || maxSpeed == null || idealDirs.length === 0`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

---

## Colour Coding

### Status-to-colour mapping (consistent across all weather components)
- **What it is:** Five status labels map to four colours shared across every weather UI component (cards, strips, matrix, compass, day-grid dots). Good = emerald `#10b981`, Light = yellow `#eab308`, Cross = orange `#f97316`, Blown Out/Not Flyable = red `#ef4444`, N/A = grey `#9ca3af`.
- **Why (the decisions):** [inferred] Green/yellow/orange/red follows aviation colour conventions (safe/caution/marginal/danger). Each component defines its own local `STATUS_COLOR` map but all share the same hex values, providing a consistent visual language.
- **How (the mechanism):** `WeatherCardApple.tsx:13–21`, `WeatherHistoryMatrix.tsx:11–17`, `ExtendedOutlookPanel.tsx:47–54`, `WindCompass.tsx:41–48`, `HourlyForecastStrip.tsx:41–42`.
- **Principles:** One source of truth per rule (values are consistent even though the map is duplicated); Surface, don't hide.

### Gust colour on the live card: simple threshold vs site max
- **What it is:** On the WeatherCardApple readout the gust number's text colour turns red (`#ef4444`) when `windGust > maxIdealSpeed`. It stays dark (`#1d1d1f`) otherwise.
- **Why (the decisions):** [inferred] A simpler check than `computeGustCeiling` — the card only shows current gust, and exceeding the site's published top speed is a plain danger signal a pilot can read at a glance.
- **How (the mechanism):** `src/components/weather/WeatherCardApple.tsx:16–17`. `gustBlownOut = maxIdealSpeed != null && activeWeather.windGust > maxIdealSpeed`.
- **Principles:** Surface, don't hide; Deliberate, explained differences.

---

## Forecast Windowed Strip

### 7-slot sliding window on the ECMWF forecast strip
- **What it is:** The HourlyForecastStrip shows only 7 consecutive hourly slots, auto-advancing so the current hour is always visible.
- **Why (the decisions):** [inferred] A full 24-hour strip would be unreadable on mobile. 7 slots cover the typical flying window (~6–7 hours). The window anchors at the current hour rather than always starting at midnight so the pilot sees relevant hours, not past ones.
- **How (the mechanism):** `src/components/WeatherCard.tsx:153`. `const WINDOW_SIZE = 7`. Window start computed at `src/components/WeatherCard.tsx:165–178` by finding the floor of `Date.now()` in the forecast timestamp array.
- **Principles:** Surface, don't hide; Decisions stay with the human.

### Extended forecast slots: 4 per day (7, 11, 15, 19 local)
- **What it is:** The 7-day outlook strips hourly data down to four representative slots per day: 7am, 11am, 3pm, 7pm Melbourne local time.
- **Why (the decisions):** [inferred] Morning/late-morning/early-afternoon/evening covers the full flying day without overwhelming the UI. Skipping today (days from tomorrow onward) avoids overlap with the live/forecast primary strip. 8-day forecast data is fetched so days 3–7 have extended data and days 0–1 are handled by the fine grid.
- **How (the mechanism):** `server/extendedForecast.ts:108–120`. `targetHours = [7, 11, 15, 19]`; any slot with date < tomorrow is skipped.
- **Principles:** Decisions stay with the human; Surface, don't hide.

### "Best slot" selection for the day-grid summary
- **What it is:** Each day's summary card (speed + direction pill) shows the single slot most consistent with the site's wind window. Scoring: direction match +2, speed-in-range +2, speed below minimum (too light but not dangerous) +1.
- **Why (the decisions):** [inferred] Showing the middle slot (fallback if no site info) would often land on a time when the site is calm or outside ideal conditions. The score function ensures the displayed slot genuinely represents the best expected flying moment, not just noon.
- **How (the mechanism):** `server/extendedForecast.ts:357–415`, `pickBestSlotIdx`. Speed range read from `site.windSpeed` or `site.windDir`; ideal directions parsed from same. A direction match earns the same weight as a speed-in-range match; below-minimum penalised 1 vs 2 (still shows it as best available). Tie-broken by earliest index.
- **Principles:** Decisions stay with the human; Compute in code, phrase with the model; Deliberate, explained differences.

### Extended forecast minimum point threshold (50%)
- **What it is:** If fewer than 50% of expected grid points return data from Open-Meteo, the extended forecast fetch is aborted and the DB is not updated.
- **Why (the decisions):** Code comment at `server/extendedForecast.ts:251–253` notes this guards against silent partial failure: a rate-limited fetch returning 0 points previously wrote "ok" to the result log. The 50% threshold allows for a few failed tiles while rejecting a mostly-empty run.
- **How (the mechanism):** `server/extendedForecast.ts:251–253`. `allPoints.length < totalPoints * 0.5` → throws.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Extended forecast: today's slots replaced with live ECMWF data
- **What it is:** When serving a site's extended forecast, today's slot strip is always overwritten with the live `weather_forecasts` row (the hourly ECMWF fine-grid data) rather than the baked extended-grid snapshot.
- **Why (the decisions):** Code comment at `server/extendedForecast.ts:763–764`: "Replace today's slots with live data from weather_forecasts so the slot strip always matches the ECMWF Forecast strip above it." The baked extended data is fetched once daily; intra-day it diverges from the fine grid the hourly strip uses.
- **How (the mechanism):** `server/extendedForecast.ts:765–803`. Replaces `forecast.days[0]` when `todaySlots.length >= 3`. Minimum 3 slots required to trust the replacement.
- **Principles:** One source of truth per rule; Surface, don't hide; Refuse rather than improvise at the edges.

---

## Live Observation Staleness

### 6-hour observation staleness window
- **What it is:** A live weather observation older than 6 hours is treated as absent; the server falls back to the forecast row instead.
- **Why (the decisions):** [inferred] A 6-hour-old live observation is stale enough that it could reflect an entirely different weather system. Showing it as "live" would mislead pilots. 6 hours is conservative (scrapers run every 2–15 minutes) so this window is only hit if the upstream station went offline.
- **How (the mechanism):** `MAX_OBS_AGE = 6 * 60 * 60 * 1000` at `server/routes/weather.ts:478` (bulk) and `server/routes/weather.ts:656` (single). If `obsAge >= MAX_OBS_AGE` the observation is ignored and the forecast row is served instead.
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

### History retention: 48 hours
- **What it is:** `weather_history` rows older than 48 hours are deleted after each observation write.
- **Why (the decisions):** [inferred] The history panel shows only the last 6 hours. Retaining 48 hours provides a safety buffer (e.g. if scraper is down for a day), while an unbounded table would grow without limit.
- **How (the mechanism):** `server/weather.ts:14`. `const HISTORY_RETENTION_HOURS = 48`. `DELETE FROM weather_history … timestamp < NOW() - INTERVAL '48 hours'` at `server/weather.ts:42–45`.
- **Principles:** One source of truth per rule.

### History deduplication: minimum 2-minute gap between rows
- **What it is:** A new history row is inserted only if the previous row for the same site+station is more than 2 minutes old.
- **Why (the decisions):** [inferred] Some scraper cycles re-poll the same station within seconds (e.g. during manual "Scrape Now"). Without this guard, duplicate timestamps would create zero-width Bezier segments in the history chart that render as visual artefacts. Code comment at `server/routes/weather.ts:908`.
- **How (the mechanism):** `server/weather.ts:13`. `const TWO_MIN_MS = 2 * 60 * 1000`. Guard at `server/weather.ts:37`.
- **Principles:** Surface, don't hide; One source of truth per rule.

### History query window: last 6 hours
- **What it is:** The `/api/weather/:siteId/history` endpoint fetches only the last 6 hours of `weather_history` rows.
- **Why (the decisions):** [inferred] The history panel's x-axis spans 6 hours. Loading more would waste bandwidth and memory without any UI benefit.
- **How (the mechanism):** `server/routes/weather.ts:896–904`. `timestamp >= NOW() - INTERVAL '6 hours'`.
- **Principles:** One source of truth per rule.

### History time buckets: 0–15m, 15–30m, 30–60m, 60–120m, Day
- **What it is:** The matrix below the history chart aggregates observations into five buckets. The first four are rolling windows relative to now; "Day" covers the full Melbourne calendar day.
- **Why (the decisions):** [inferred] The short buckets (0–15m, 15–30m) track current trend; the hourly buckets show longer context; "Day" gives an all-day max-gust and average.
- **How (the mechanism):** `server/routes/weather.ts:963–968`. Each bucket is computed from `dedupedRows` filtered by age. "Day" uses a separate `dayRows` query anchored to Melbourne midnight (`DATE_TRUNC('day', NOW() AT TIME ZONE 'Australia/Melbourne')`).
- **Principles:** Surface, don't hide.

---

## Cache TTLs & Staleness Windows

### Elevation endpoint cache: 1 week (success) / no-store (failure)
- **What it is:** A successful `/api/weather/elevation-at` response is cached for 7 days (`max-age=604800, immutable`). A null result (tile fetch failed) is `no-store`.
- **Why (the decisions):** Code comment at `server/routes/weather.ts:604–609`: terrain elevation is static, so a real answer can be cached almost indefinitely. A null result must not be cached because it reflects a transient upstream failure, not a real "no elevation here".
- **How (the mechanism):** `server/routes/weather.ts:607–610`. Conditional `Cache-Control` on whether `elevation !== null`.
- **Principles:** Refuse rather than improvise at the edges; Separate facts from judgements.

### Elevation endpoint: constrained to configured grid box
- **What it is:** `/api/weather/elevation-at` rejects coordinates outside the admin-configured grid bounds with a 400 error.
- **Why (the decisions):** Code comment at `server/routes/weather.ts:593–595`: "this endpoint is not a general-purpose worldwide DEM proxy." The guard prevents the public endpoint from being used as an arbitrary terrain lookup service.
- **How (the mechanism):** `server/routes/weather.ts:595–600`. Checks `rawLat/rawLon` against `bounds.fineLatMin/fineLatMax/fineLonMin/fineLonMax`.
- **Principles:** Refuse rather than improvise at the edges.

### Thermal/wind overlay cache: no-cache + ETag
- **What it is:** `/api/weather/thermal-overlay` and `/api/weather/wind-overlay/full` use `Cache-Control: no-cache`. This forces revalidation on every request but allows ETags to return a cheap 304 when data is unchanged.
- **Why (the decisions):** Code comment at `server/routes/weather.ts:629–635`: "Without revalidation, a schema change (e.g. new fields added in TASK-036) would be pinned into every client cache for up to 30 minutes with no server-side escape hatch." Unlike the static elevation endpoint, the overlay payload schema can grow.
- **How (the mechanism):** `server/routes/weather.ts:634`. `res.setHeader('Cache-Control', 'no-cache')`.
- **Principles:** One source of truth per rule; Surface, don't hide.

### Extended grid / wind particles: 30-minute public cache
- **What it is:** `/api/weather/extended-grid`, `/api/weather/:siteId/wind-particles`, and `/api/weather/wind-overlay/full` return `Cache-Control: public, max-age=1800`.
- **Why (the decisions):** [inferred] These grids are regenerated daily so a 30-minute client cache is safe and reduces server load. The overlay uses `no-cache` instead (see above) because its schema can change.
- **How (the mechanism):** `server/routes/weather.ts:428, 438, 869, 887`. `res.setHeader('Cache-Control', 'public, max-age=1800')`.
- **Principles:** One source of truth per rule.

### Extended site forecast: 5-minute public cache
- **What it is:** `/api/weather/:siteId/extended-forecast` returns `Cache-Control: public, max-age=300`.
- **Why (the decisions):** [inferred] 5 minutes is short enough that today's slot replacement (which uses live data) stays roughly fresh without hammering the DB on every card render.
- **How (the mechanism):** `server/routes/weather.ts:979`. `res.setHeader('Cache-Control', 'public, max-age=300')`.
- **Principles:** One source of truth per rule.

### Extended forecast client stale time: 15 minutes
- **What it is:** The `WeatherCard` react-query hook for extended forecasts sets `staleTime: 15 * 60 * 1000`, meaning a cached response is reused for up to 15 minutes without a network call.
- **Why (the decisions):** [inferred] Extended forecasts change once daily; 15 minutes balances freshness with redundant fetch avoidance.
- **How (the mechanism):** `src/components/WeatherCard.tsx:45`. `staleTime: 15 * 60 * 1000`.
- **Principles:** One source of truth per rule.

### FreeFlightWx in-process cache TTL: configurable, default 30s
- **What it is:** Fetched gauge data from freeflightwx.com is cached in a server-side `Map` with a TTL read from the `cacheFreeFlightWxTtl` settings row (seconds). The default is 30 seconds.
- **Why (the decisions):** [inferred] FreeFlightWx limits are unclear; the cache prevents hammering the upstream on every scraper cycle. 30 seconds matches typical scraper re-poll intervals while ensuring data is never more than ~30s stale for live-wind sites.
- **How (the mechanism):** `server/freeflightwx.ts:25–29` (TTL read); `server/freeflightwx.ts:235–240` (eviction + set). Cache entries are also capped at 50 entries (FIFO eviction at `server/freeflightwx.ts:120, 234–237`).
- **Principles:** One source of truth per rule.

### FreeFlightWx speed smoothing: 10-record (~2 minute) rolling average
- **What it is:** The "current" wind speed returned by `fetchFreeFlightWxData` is the mean of the last 10 records, not the instantaneous latest reading. Gust is the peak of the same window; lull is the minimum.
- **Why (the decisions):** Code comment at `server/freeflightwx.ts:215–217`: "smooth out momentary calm spikes that would otherwise produce misleading 0kt readings." Freeflightwx sensors can briefly report 0kt; averaging removes single-record dropouts.
- **How (the mechanism):** `server/freeflightwx.ts:213–222`. `window = sorted.slice(-10)`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### Wind grid (fine) per-site sub-cache: 30-minute TTL + grid-size match
- **What it is:** The `/api/weather/:siteId/wind-grid` endpoint caches the computed grid in the DB. A cached result is returned only if it is less than 30 minutes old AND has the same `gridSize` and `gridSpacing` as the request.
- **Why (the decisions):** [inferred] The per-site wind-grid is derived from the shared fine-grid cache; re-computing it on every request is wasteful. The 30-minute window matches the wind-particles/overlay TTL.
- **How (the mechanism):** `server/routes/weather.ts:711–718`. `age < 30 * 60 * 1000 && cached.gridSize === gridSize && Math.abs(cached.gridSpacing - gridSpacing) < 0.001`.
- **Principles:** One source of truth per rule.

### Extended wind grid: 24-hour in-memory TTL
- **What it is:** The server-side `cachedWindGrid` variable (computed from the extended grid) is considered valid for 24 hours (`WIND_GRID_TTL_MS = 24 * 60 * 60 * 1000`).
- **Why (the decisions):** [inferred] The extended grid is fetched once daily; recomputing the wind grid from it on every request is expensive (bilinear interpolation over all grid points). A 24-hour TTL aligns with the underlying data refresh cycle.
- **How (the mechanism):** `server/constants.ts:16`. `WIND_GRID_TTL_MS = 24 * 60 * 60 * 1000`. Check at `server/extendedForecast.ts:712`.
- **Principles:** One source of truth per rule.

---

## Scraper Operating Schedule

### Per-source scraper cadence (min–max interval, randomised)
- **What it is:** Each of the seven scraper sources (freeflightwx, wu, livewind, bom, davis, wdl, wport) runs independently on a random interval drawn from a configurable `[min, max]` range in minutes. The defaults are:
  - freeflightwx: 2–3 min
  - wu: 14–15 min
  - livewind: 5–10 min
  - bom: 10–20 min
  - davis: 5–10 min
  - wdl: 5–10 min
  - wport: 5–10 min
- **Why (the decisions):** [inferred] Each source has different data-freshness characteristics and upstream rate limits. FreeFlightWx sensors update roughly every 1–2 minutes so a 2–3 min poll makes sense. WU and BOM have heavier rate limits and slower data turnover so longer windows apply. Randomisation staggers concurrent hits on the same upstream.
- **How (the mechanism):** `server/weather.ts:53–61` (`SOURCE_DEFAULTS`). `scheduleSourceFetch` at `server/weather.ts:117–124`. Admin-overridable via `weatherScraper_<key>_min`/`_max` settings rows.
- **Principles:** Decisions stay with the human; Deliberate, explained differences; One source of truth per rule.

### Scraper operating hours: 7am–8pm Melbourne, configurable
- **What it is:** Each scraper loop checks whether the current Melbourne hour is within `[weatherScraperStartHour, weatherScraperEndHour)`. Outside those hours it skips the fetch and reschedules. Default window: 7am–20:00 (8pm).
- **Why (the decisions):** [inferred] Flying sites are only used during daylight. Polling weather stations all night wastes upstream quota and generates history data no one reads.
- **How (the mechanism):** `server/weather.ts:176–179`. `hour < startHour || hour >= endHour` → skip. Defaults at `server/weather.ts:111–112`: `startHour` fallback `'7'`, `endHour` fallback `'20'`. Overridable via `weatherScraperRunContinuously = 'true'` to disable the window check.
- **Principles:** Decisions stay with the human; One source of truth per rule.

### Scraper yields to active grid fetch
- **What it is:** If an ECMWF fine-grid or thermal-grid fetch is in progress when a scraper tick fires, the scraper skips that cycle and reschedules.
- **Why (the decisions):** [inferred] Grid fetches are large, CPU/network-intensive operations. Running scrapers simultaneously competes for bandwidth and DB connections. Yielding ensures the morning grid pre-fetch completes cleanly.
- **How (the mechanism):** `server/weather.ts:182–185`. `isGridFetchActive()` imported from `grid/pipeline.js`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

---

## Daily Grid Pre-fetch Schedule

### Fine grid default: 5:00am Melbourne
- **What it is:** The ECMWF fine (wind) grid is fetched once daily at 5:00am Melbourne time (configurable via Admin → Scheduled Tasks).
- **Why (the decisions):** Code comment at `server/utils/scheduledJobs.ts:339–341`. 5:00am precedes typical flying hours and is well within ECMWF's daily model run update window.
- **How (the mechanism):** `server/utils/scheduledJobs.ts:341`. `scheduleDailyFromSettings("Fine grid", "schedFineGridHour", "schedFineGridMinute", 5, 0, fetchFineGridDaily)`.
- **Principles:** Decisions stay with the human; One source of truth per rule.

### Thermal grid default: 5:26am Melbourne + retry chain (30m, 1h, 2h, 4h)
- **What it is:** The thermal grid is fetched at 5:26am (default). If any grid points are missing (partial provider coverage), retries are scheduled at 30m, 1h, 2h, 4h intervals. A final backstop cron runs at 7:30am if points are still missing.
- **Why (the decisions):** Code comment at `server/utils/scheduledJobs.ts:176–177`: "spaced to avoid free-tier rate limit resets." The thermal grid uses a 4-tier provider chain; tier 1 can be rate-limited (Open-Meteo free) and gaps need time for the quota to reset. 7:30am is the final backstop after all auto-retries.
- **How (the mechanism):** `server/utils/scheduledJobs.ts:177`. `THERMAL_RETRY_DELAYS_MS = [30 * 60_000, 60 * 60_000, 120 * 60_000, 240 * 60_000]`. Cron backstop at `server/utils/scheduledJobs.ts:346`: `cron.schedule("30 7 * * *", ...)`. Default scheduled at `server/utils/scheduledJobs.ts:344`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Startup catch-up if no today's grid row
- **What it is:** On server startup, if no `wind_grid_data` row exists for today (`fine_grid_YYYY-MM-DD` or `thermal_grid_YYYY-MM-DD`), a catch-up fetch is triggered after a short delay (fine: 60s, thermal: 3min).
- **Why (the decisions):** Code comment at `server/utils/scheduledJobs.ts:297–299`: handles the case where the server started after the scheduled 5am window (e.g. a Railway restart at 6am would miss the daily fetch).
- **How (the mechanism):** `server/utils/scheduledJobs.ts:305–330`. `setTimeout(() => fetchFineGridDaily(), 60_000)` / `setTimeout(() => fetchThermalGridDaily(0), 3 * 60_000)`.
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

### Extended forecast default: 5:30am Melbourne
- **What it is:** The 7-day extended forecast grid (days 3–7) is fetched at 5:30am Melbourne time by default.
- **Why (the decisions):** Code comment at `server/utils/scheduledJobs.ts:337–338`: all three daily grid fetches are settings-driven and controlled from one place (Admin → Scheduled Tasks). 5:30am staggers after the fine (5:00) and thermal (5:26) fetches.
- **How (the mechanism):** `server/extendedForecast.ts` schedules itself via `scheduleExtendedForecast()`, called from `server/weather.ts:397`. Default key `schedExtendedForecastHour`/`Minute` with fallback 5:30.
- **Principles:** Decisions stay with the human; One source of truth per rule.

---

## Open-Meteo API Selection

### Customer URL vs free URL based on API key presence
- **What it is:** If `OPEN_METEO_API_KEY` is set, requests go to `customer-api.open-meteo.com`; otherwise the free `api.open-meteo.com` is used.
- **Why (the decisions):** [inferred] The customer API is rate-limit-free (paid). Without a key the free tier applies and may 429-rate-limit on large grid fetches. The model is consistent: the same builder functions produce the same parameters; only the base URL changes.
- **How (the mechanism):** `server/utils/openMeteo.ts:6–9`. Ternary on `OPEN_METEO_API_KEY`.
- **Principles:** One source of truth per rule; Decisions stay with the human.

### Model: `ecmwf_ifs` (all grids)
- **What it is:** All Open-Meteo forecast requests use model `ecmwf_ifs`. Wind speed unit is always `kn`. Timezone is always `Australia/Melbourne`.
- **Why (the decisions):** [inferred from DECISION-003 reference in CLAUDE.md]: ECMWF IFS was chosen over GFS for quality over the southern Australian region. Using a single model ensures forecast consistency between the fine grid, thermal grid, and extended forecast.
- **How (the mechanism):** `server/utils/openMeteo.ts:36–40` (GET builder); `server/utils/openMeteo.ts:65–70` (POST builder). `models: 'ecmwf_ifs'`.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

---

## `fetchWithRetry` Network Gate

### Retry policy: 5 attempts, exponential backoff from 1s, no retry on 4xx
- **What it is:** All upstream fetches use `fetchWithRetry` which retries up to 5 times with exponential backoff (`1000 * 2^i` ms). 4xx responses are not retried — only transient failures (5xx, network error, timeout).
- **Why (the decisions):** Code comment at `server/weather-utils.ts:33–37`: "4xx means the request itself is wrong — retrying sends the identical bad request again." 429 (rate limit) is treated the same as other 4xx: retrying immediately would only waste quota faster; the grid's retry chain handles 429 at a higher level.
- **How (the mechanism):** `server/weather-utils.ts:6–42`. `retries = 5`, `backoff = 1000`. `if (lastStatusCode >= 400 && lastStatusCode < 500) throw err` (no retry).
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Per-request timeout: 10 seconds
- **What it is:** Every individual fetch attempt within `fetchWithRetry` aborts after 10 seconds via `AbortController`.
- **Why (the decisions):** [inferred] Hung upstream connections would stall a scraper loop indefinitely. 10 seconds is generous enough for normal API responses but caps worst-case wait per attempt at 10s × 5 retries = 50s.
- **How (the mechanism):** `server/weather-utils.ts:9`. `setTimeout(() => controller.abort(), 10000)`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Davis WeatherLink Station Source Selection

### summaryData preferred over getData; gust fallback = speed
- **What it is:** Davis WeatherLink observations prefer the `summaryData` endpoint (sensor type 85 = 10-min high wind = current gust). If `summaryData` fails, `getData` is used as a fallback but its gust field (daily maximum) is replaced with the current wind speed as a conservative fallback.
- **Why (the decisions):** Code comments at `server/davisWeather.ts:70–72` and `server/davisWeather.ts:197`: `getData` only exposes the daily maximum gust, which "stays stuck for the rest of the day." Using `summaryData` sensor 85 gives the current-observation gust. When the fallback is needed, setting gust = speed is conservative (underestimates peak gust) rather than misleading (showing a stale daily max from earlier in the day).
- **How (the mechanism):** `server/davisWeather.ts:96–165` (`fetchDavisObservation`); `server/davisWeather.ts:170–207` (`fetchDavisObservationFallback`). Sensor IDs: WIND_SPEED=72, WIND_DIR=73, 10MIN_AVG=82, 10MIN_HIGH=85.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### Davis: speed sensor fallback to 10-min average
- **What it is:** If sensor type 72 (current wind speed) is absent from `summaryData`, sensor type 82 (10-min average) is tried as a secondary source within the same endpoint.
- **Why (the decisions):** [inferred] Some station configurations may not expose a current-instant speed sensor but do expose an averaged value. The fallback keeps the reading available rather than falling through to the whole-endpoint fallback.
- **How (the mechanism):** `server/davisWeather.ts:113`. `findSensor(cv, SENSOR_WIND_SPEED) ?? findSensor(cv, SENSOR_10MIN_AVG)`.
- **Principles:** Assume the safest reading when context is missing.

### Davis: unit conversion with unknown-units gate
- **What it is:** Wind speed is converted to knots by looking up the unit label in a conversion table. If the unit label is unrecognised, the function returns `null` and falls through to `fetchDavisObservationFallback` rather than guessing.
- **Why (the decisions):** Code comment at `server/davisWeather.ts:47`: "windUnits is a per-station display preference, so the payload's units vary by station." An unknown unit label would produce a silently wrong speed if a conversion factor were assumed.
- **How (the mechanism):** `server/davisWeather.ts:48–65`. `TO_KNOTS` map. `toKnots` returns `null` on miss → caller falls to fallback at `server/davisWeather.ts:131–133`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

---

## Station Source Identification

### WU as catch-all (any ID without a known prefix)
- **What it is:** A live weather station ID that does not start with any of the known prefixes (`livewind-`, `freeflightwx-`, `bom-`, `davis-`) is treated as a Weather Underground (WU) station ID.
- **Why (the decisions):** Code comment at `server/weather-utils.ts:68–71`: "Adding a new source means adding its prefix here, or WU will try to fetch it." WU was the original source and used non-prefixed IDs; all later sources adopted explicit prefixes.
- **How (the mechanism):** `server/weather-utils.ts:72`. `NON_WU_STATION_PREFIXES`. `isWuStationId` returns `true` if none of the prefixes match. Note: `wdl-` and `wport-` prefixes are NOT in `NON_WU_STATION_PREFIXES` but are handled earlier in `stationMatchesType` inside the scraper loop (`server/weather.ts:197–204`).
- **Principles:** One source of truth per rule; Surface, don't hide.

### Bulk weather endpoint: cap at 50 site IDs
- **What it is:** The `/api/weather/bulk` endpoint accepts at most 50 site IDs per request.
- **Why (the decisions):** [inferred] The bulk query is a multi-join that grows linearly with site count. Uncapped, a single request could lock the DB or exhaust memory.
- **How (the mechanism):** `server/routes/weather.ts:449`. `const ids = siteIds.slice(0, 50)`.
- **Principles:** Refuse rather than improvise at the edges.

### Fine grid point cap: 10,000 points
- **What it is:** Admin-configurable grid bounds are rejected if the resulting fine-grid point count exceeds 10,000.
- **Why (the decisions):** [inferred] Each grid point results in an Open-Meteo hourly request. At 0.15° spacing, 10,000 points covers a large area (e.g. all of Victoria) without overflowing URL length limits or Open-Meteo's free-tier batching limits.
- **How (the mechanism):** `server/routes/weather.ts:556–561`. `FINE_MAX_POINTS = 10000`. `finePts > FINE_MAX_POINTS` → 400 error.
- **Principles:** Refuse rather than improvise at the edges; Decisions stay with the human.
