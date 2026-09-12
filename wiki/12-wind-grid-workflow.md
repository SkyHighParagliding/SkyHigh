---
name: Wind Grid Workflow — Internal Fetch, Cache, and Retry Logic
description: Complete workflow map for all three grid fetches (fine, thermal, extended) — how they work, what they fetch, where data goes, and how failures are handled
type: wiki
---

# Wind Grid Workflow

> Last updated: 2026-09-11

---

## Overview

The wind map is powered by three independent pre-fetched grids, each serving a different visual layer. All data comes from the **Open-Meteo ECMWF IFS model**. There are no real-time API calls when a user views the wind map — everything is pre-cached daily.

```
Open-Meteo API (ECMWF IFS)
        │
        ├──► Fine Grid (0.15°)      ──► Wind heatmap + particle animation
        ├──► Thermal Grid (0.09°)   ──► CAPE/BLH colour overlay
        └──► Extended Grid (0.5°)   ──► 7-day site outlook cards
```

> **Ground readout is not part of the daily grid fetch.** The terrain elevation AMSL shown when a user taps the map comes from AWS Open Data terrarium tiles sampled directly in the browser (`src/components/windmap/terrainTiles.ts`). It has no fetch schedule, no database entry, and no admin control in this workflow. See `wiki/01-architecture.md` — "Client-Side Terrain Elevation Sampling" for details.

---

## Coverage Area

All three grids share the same geographic bounds, configurable by an admin via **Admin → Weather → Configure Grid Areas**.

**Default bounds:**
```
South:  -44.5°S  (covers all of Tasmania)
North:  -35.0°S  (covers ACT / Canberra region)
West:   139.0°E  (Riverland / Mallee, ~140km into SA)
East:   155.0°E  (NSW coast — Sydney approaches)
```

Bounds are stored in the `settings` table (`gridFineLatMin/Max`, `gridFineLonMin/Max`) and override the code defaults when present. All three grids read these same four settings.

---

## Fetch Schedule (Daily Cron — Melbourne Time)

| Time | Fetch | File |
|---|---|---|
| 5:00 am | Fine grid | `server/utils/scheduledJobs.ts` → `fetchFineGridDaily()` |
| 5:26 am | Thermal grid | `server/utils/scheduledJobs.ts` → `fetchThermalGridDaily()` |
| 5:40 am | Extended forecast | `server/utils/scheduledJobs.ts` → `scheduleExtendedForecast()` |
| 7:30 am | Thermal retry backstop | `server/utils/scheduledJobs.ts` → `retryThermalFailedTiles()` (only if tiles still queued) |

**On server startup:** `startupGridCheck()` runs and triggers a fine + thermal fetch if the last run was more than 22 hours ago (or if thermal has pending failed tiles).

---

## 1. Fine Grid

**What it does:** Fetches 2-day hourly wind, temperature, and weather data across the full coverage area at 0.15° resolution. This feeds the speed colour heatmap, particle animation, and site weather cards.

### Specification

| Property | Value |
|---|---|
| Resolution | 0.15° (~17km) |
| Coverage | Full configured bounds (default: ~6,900 points) |
| Tiling method | `buildRectangularTiles` — full rectangular bounding box, 200 pts/tile GET |
| Tile count | ~35 tiles at default bounds |
| Tile delay | 3,000ms between tiles |
| Estimated fetch time | ~105 seconds |
| Forecast days | 2 |
| Retry on tile failure | None — failed tiles reduce completeness only |
| Completeness threshold | 80% — below this, previous cache is kept |
| DB storage | `wind_grid_data`, key `fine_grid_YYYY-MM-DD` |
| Memory cache TTL | 30 minutes |
| Rolling cleanup | 7 days |
| Progress key | `settings.fineGridProgress` |

**Fields fetched:**
```
wind_speed_10m, wind_gusts_10m, wind_direction_10m,
temperature_2m, weather_code,
precipitation, precipitation_probability,
cloud_cover, cloud_cover_low, visibility,
cape, boundary_layer_height
```

### Workflow

```
fetchFineGridDaily() [scheduledJobs.ts]
    │
    ▼
fetchFineGrid(force=true) [victoriaGrid.ts]
    │
    ├── inflightFetch guard (deduplicates concurrent calls)
    ▼
doFetchFineGrid()
    │
    ├── Read admin bounds from settings table (or use code defaults)
    ├── buildRectangularTiles(bounds, delta=0.15, maxPerTile=200)
    │       → Full bounding box, chunked into ~35 tiles of ≤200 points each
    │       → No clipping — includes ocean, NSW, SA, Tasmania
    │
    ├── setFineProgress("Starting · 35 tiles · 6912 pts")
    │
    ├── FOR EACH TILE (i = 0..34):
    │   ├── Build Open-Meteo GET URL (buildOpenMeteoParams)
    │   ├── fetchWithRetry(url)         [5 retries, 10s timeout, exponential backoff]
    │   │   ├── SUCCESS → parse hourly arrays, push to allPoints[]
    │   │   └── FAILURE → failedCount++  (no tile-level retry queue)
    │   ├── setFineProgress("Tile 5/35 · 14% · 1000/6912 pts · ok")
    │   └── await 3000ms delay (rate limit buffer)
    │
    ├── setFineProgress('')   [clears progress key]
    │
    ├── completeness = allPoints.length / expectedPoints
    │   ├── < 80%:  log warning, return previous cached grid (no DB write)
    │   │           throws if completeness = 0 (all tiles failed)
    │   └── ≥ 80%:  write new grid to DB
    │
    ├── DB write: INSERT/UPDATE wind_grid_data WHERE siteId = 'fine_grid_YYYY-MM-DD'
    │   (stores full JSON blob: ~15–25MB uncompressed)
    │
    ├── cleanupOldGridData() — DELETE rows older than 7 days
    │
    └── Update memFineGrid (30-min in-memory cache)

scheduledJobs: write fineGridLastRun + fineGridLastResult to settings
```

### Consumers

- **Wind map speed heatmap** (`particleRenderer.ts` → `rebuildSpeedOverlay`): reads interpolated U/V at each 5×5px screen cell
- **Wind particles** (`particleRenderer.ts` → `updateAndDrawParticles`): moves 2,400 particles along interpolated wind vectors
- **Site weather cards**: bilinear interpolation at site lat/lon for current hour
- **Weather scraper** (`weather.ts`): calls `fetchFineGrid()` (cached) before each scrape cycle to get grid-based wind estimates

---

## 2. Thermal Grid

**What it does:** Fetches 2-day hourly CAPE (Convective Available Potential Energy) and BLH (Boundary Layer Height) across Victoria at 0.09° resolution. This feeds the coloured thermal overlay on the wind map. Clipped to coastline polygons so thermal data is land-focused — thermals do not form over water.

### Specification

| Property | Value |
|---|---|
| Resolution | 0.09° (~10km) |
| Coverage | Same configured bounds, clipped to land (mainland SE Australia, Tasmania, King/Flinders Is) + 0.2° buffer — 6,276 points |
| Tiling method | `buildLandTiles` — coastline point-in-polygon + 0.2 deg buffer, 300 pts/tile |
| Estimated tile count | ~21 tiles |
| Tile delay | 3,000ms between tiles |
| Estimated fetch time | ~3–5 minutes (full grid) |
| Forecast days | 2 |
| Retry on tile failure | YES — failed tiles queued to `thermalGridFailedTiles` setting |
| Completeness threshold | 80% — below this, partial result saved to DB; failed tiles queued for retry |
| Auto-retry rounds | Up to 4 automatic retries at +5/15/40/90 min |
| DB storage | `wind_grid_data`, key `thermal_grid_YYYY-MM-DD` (upsert — retries add to same row) |
| Memory cache TTL | 30 minutes |
| Rolling cleanup | 7 days (only after ≥80% completeness) |
| Progress key | `settings.thermalGridProgress` |

**Fields fetched:**
```
cape, boundary_layer_height, temperature_2m, dew_point_2m
```
CCL (Cloud Condensation Level) is computed server-side: `CCL = (T2m - Td2m) × 125m`

### Workflow

```
fetchThermalGridDaily(retryRound=0) [scheduledJobs.ts]
    │
    ▼
fetchThermalGrid(force=true) [victoriaGrid.ts]
    │
    ├── inflightThermalFetch guard
    ▼
doFetchThermalGrid()
    │
    ├── Read bounds from settings
    ├── buildLandTiles(bounds, delta=0.09, maxPerTile=300)
    │       → 0-origin lattice, keeps points on land or within 0.2° of a coast
    │
    ├── CHECK thermalGridFailedTiles in settings:
    │   ├── EMPTY → fresh fetch: tilesToFetch = allTiles, basePoints = []
    │   └── HAS TILES → retry mode:
    │           tilesToFetch = failedTiles (only)
    │           basePoints = load existing partial grid from today's DB row
    │           isRetry = true
    │
    ├── setThermalProgress("0 / N tiles [retry]")
    │
    ├── FOR EACH TILE (with early-exit guard):
    │   │
    │   ├── Early exit check:
    │   │   maxAchievable = basePoints + newPoints + remainingPoints
    │   │   if maxAchievable / totalPoints < 0.8 → abort, push rest to newFailedTiles
    │   │
    │   ├── fetchWithRetry(url)         [5 retries, 10s timeout each]
    │   │   ├── SUCCESS → push to newPoints[]
    │   │   └── FAILURE (429 rate limit or other):
    │   │           push tile spec to newFailedTiles[]
    │   │           rateLimitedCount++ or failedCount++
    │   │
    │   ├── setThermalProgress("N / M tiles (2 rate limited)")
    │   └── await 3000ms delay
    │
    ├── allPoints = [...basePoints, ...newPoints]
    │   (partial is merged with existing data from previous retry rounds)
    │
    ├── ALWAYS write allPoints to DB if any exist:
    │   INSERT/UPDATE wind_grid_data WHERE siteId = 'thermal_grid_YYYY-MM-DD'
    │   (replaces previous partial — each retry improves the stored grid)
    │
    ├── Write thermalGridFailedTiles:
    │   ├── newFailedTiles.length > 0 → store JSON of failed tile specs
    │   └── 0 failed → store '' (clears the queue)
    │
    └── setThermalProgress('')  [clears progress key]

Back in fetchThermalGridDaily(retryRound):
    │
    ├── Read thermalGridFailedTiles
    │
    ├── failedCount > 0 AND retryRound < 4:
    │   ├── Delay schedule:
    │   │   Round 0→1: +5 min
    │   │   Round 1→2: +15 min
    │   │   Round 2→3: +40 min
    │   │   Round 3→4: +90 min
    │   ├── Write thermalGridLastResult = "partial — N tiles, retry X/4 in Ymin"
    │   └── setTimeout(() => fetchThermalGridDaily(retryRound+1), delayMs)
    │
    ├── failedCount > 0 AND retryRound = 4 (exhausted):
    │   └── Write thermalGridLastResult = "partial — N tiles unresolved after 4 retries"
    │       (7:30am backstop cron will attempt one more time next day)
    │
    └── failedCount = 0 (complete):
        └── Write thermalGridLastResult = "ok"
            cleanupOldGridData() — delete rows older than 7 days
```

### Retry State in Admin UI

After each retry round, `thermalGridLastResult` updates so the admin panel shows the current state:

```
Round 0 complete with 8 failed:  "partial — 8 tiles, retry 1/4 in 5min"
Round 1 complete with 3 failed:  "partial — 3 tiles, retry 2/4 in 15min"
Round 2 complete with 0 failed:  "ok"
```

### Consumers

- **Thermal canvas** (`ThermalCanvas.tsx`): reads CAPE/BLH at each grid point, renders coloured cells with land mask applied (`isOnLand()`)
- **Thermal interpolation** (`thermalInterpolation.ts`): bilinear interpolation with relaxed null-corner handling (uses nearest non-null neighbour instead of returning null — eliminates seam artifacts at column boundaries)
- **Thermal renderer** (`thermalRenderer.ts`): edge fade within 1°lon / 0.5°lat of grid boundary; land-masked via `isOnLand()`

---

## 3. Extended Forecast

**What it does:** Fetches 8 days of hourly weather data at 0.5° resolution across the coverage area. Days 1-2 are discarded (covered by the fine grid); days 3-8 are kept at 4 time slots per day (07:00, 11:00, 15:00, 19:00 Melbourne time). Per-site 7-day outlooks are extracted and stored individually.

### Specification

| Property | Value |
|---|---|
| Resolution | 0.5° (~55km) |
| Coverage | Same configured bounds, land-clipped |
| Tiling method | `buildLandTiles`, 50 pts/tile |
| Tile delay | 500ms between tiles (shorter — smaller payload per tile) |
| Forecast days fetched | 8 |
| Days kept | Days 3–8 (tomorrow+1 onwards) |
| Time slots kept | 07:00, 11:00, 15:00, 19:00 Melbourne time |
| Completeness threshold | 50% — below this, error thrown, nothing saved |
| Retry on tile failure | None — relies on daily cron or manual retry |
| DB storage — grid | `extended_forecasts`, key `extended_grid_YYYY-MM-DD` |
| DB storage — per site | `site_extended_forecasts`, key = site ID (upsert) |
| Rolling cleanup | 7 days |
| Progress key | `settings.extendedGridProgress` |

**Fields fetched:**
```
wind_speed_10m, wind_gusts_10m, wind_direction_10m,
temperature_2m, weather_code,
precipitation, precipitation_probability,
cloud_cover, cloud_cover_low, visibility,
cape, lifted_index, boundary_layer_height
```

### Workflow

```
scheduleExtendedForecast() [extendedForecast.ts, called by scheduledJobs]
    │
    ▼
fetchExtendedForecast()
    │
    ├── extendedFetchInProgress guard (deduplicates)
    │
    ├── Read bounds from settings (shared with fine/thermal)
    ├── buildLandTiles(bounds, delta=0.5, maxPerTile=50)
    │
    ├── setExtProgress("0 / N tiles")
    │
    ├── FOR EACH TILE:
    │   ├── fetchWithRetry(url, forecastDays=8)
    │   │   └── filterToExtendedSlots():
    │   │           Discard time slots before tomorrow+1
    │   │           Keep only hours 07, 11, 15, 19
    │   │           → Each point has ~24 slots (6 days × 4 times)
    │   │
    │   ├── setExtProgress("N / M tiles")
    │   └── await 500ms delay
    │
    ├── Completeness check: < 50% → throw error (nothing saved)
    │
    ├── Build ExtendedGrid object (in-memory)
    │
    ├── DB write: INSERT/UPDATE extended_forecasts (id = 'extended_grid_YYYY-MM-DD')
    │
    ├── cleanupOldExtendedForecasts() — delete rows older than 7 days
    │
    ├── extractAllSiteExtendedForecasts(grid):
    │   FOR EACH site with lat/lon:
    │       ├── findNearestExtendedPoint() — nearest 0.5° grid point
    │       ├── buildSiteExtendedForecast():
    │       │       Groups slots by date into Day objects
    │       │       Picks "best" representative slot per day
    │       │       (based on site's configured wind speed/direction preference)
    │       └── INSERT/UPDATE site_extended_forecasts (siteId)
    │
    └── computeExtendedWindGrid(grid):
            Builds wind-only grid for the wind map's extended-range particle layer
            Cached in memory (24h TTL) as `extendedWindGrid`

scheduledJobs: write extendedForecastLastRun + extendedForecastLastResult to settings
```

### Consumers

- **Site detail page** — "7-day outlook" panel shows per-site forecast cards (weather icon, wind, temp, precipitation per 4-hour slot)
- **Extended wind grid** — used by the wind map's extended time slider when enabled (shows forecasted wind further into the future than the fine 2-day grid)

---

## Admin Panel — Fetch Controls

File: `src/pages/AdminWeather.tsx`

All three fetches can be triggered manually from **Admin → Weather → Wind Grid Data**.

### Button layout

```
[ Wind Grid ]    [ Thermal Grid ]    [ 7-Day ]

  ↕ Consolidated status panel appears when any fetch is active ↕
  [spinner] Wind Grid — Tile 5/7 · 71% · 5000/6912 pts · ok    0:18

Wind Grid      ✓ 11/9/2026, 11:36 am
Thermal Grid   ✗ 11/9/2026, 11:35 am — partial — 8 tiles, retry 1/4 in 30min
7-Day          ✓ 11/9/2026, 5:30 am
```

### Behaviour

1. **Click any Fetch Now button** — the other two dim to 40% opacity; all three disabled
2. **HTTP response arrives immediately** (fire-and-forget — all three routes respond before the fetch starts)
3. **Admin UI polls** `fineGridProgress` / `thermalGridProgress` / `extendedGridProgress` every 2 seconds
4. **Status panel** shows: active fetch name + live progress message + elapsed mm:ss
5. **Completion detected** when the progress key clears (DB → blank)
6. **Result shown for 5 seconds** (from `thermalGridLastResult` etc.) then status panel hides
7. **Last run summary** always visible below buttons, updates after each fetch

### Fire-and-forget route pattern

```
POST /api/weather/fine-grid/fetch-now
    │
    ├── res.json({ success: true, message: "Fine grid fetch started" })   ← responds immediately
    │
    └── [background, no await]:
        fetchFineGrid(true) → updates fineGridProgress, fineGridLastRun, fineGridLastResult
```

### Thermal vs Fine/Extended — key difference

| | Wind Grid | Thermal Grid | 7-Day |
|---|---|---|---|
| **Tile-level retry** | ✗ | ✓ (4 rounds, auto-scheduled) | ✗ |
| **Partial save** | ✗ (keeps previous) | ✓ (saves partial, improves on retry) | ✗ |
| **Progress granularity** | tile N/M + pt count | tile N/M + fail type | tile N/M |
| **Manual trigger** | `fetchFineGrid(true)` | `runThermalGridFetch(0)` | `fetchExtendedForecast()` |

---

## fetchWithRetry — Shared HTTP Utility

File: `server/weather-utils.ts`

Used by all three fetches for every individual API call to Open-Meteo.

```
fetchWithRetry(url, options?)
    │
    ├── Max retries: 5
    ├── Timeout per attempt: 10 seconds
    ├── Backoff: 1s → 2s → 4s → 8s → 16s (exponential, capped at 16s)
    │
    ├── Attempt 1 → success → return data
    ├── Attempt 1 → 429 or timeout:
    │       wait 1s → attempt 2
    │       wait 2s → attempt 3
    │       wait 4s → attempt 4
    │       wait 8s → attempt 5
    │       wait 16s → throw Error("All retries failed: ...")
    │
    └── Caller handles the throw:
        Fine grid:    failedCount++, continue
        Thermal grid: push tile to newFailedTiles[], schedule auto-retry
        Extended:     failedCount++, continue
```

Maximum per-tile time on consistent failure: ~1s + 2s + 4s + 8s + 16s + 5×10s = ~81 seconds.

---

## Open-Meteo API Configuration

File: `server/utils/openMeteo.ts`

```typescript
// Free tier (default — IP keyed, ~10,000 req/day)
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

// Customer tier (if OPEN_METEO_API_KEY set — higher limits)
OPEN_METEO_URL = "https://customer-api.open-meteo.com/v1/forecast"
```

All requests use:
- `models: ecmwf_ifs` (ECMWF Integrated Forecasting System)
- `wind_speed_unit: kn` (knots)
- `timezone: Australia/Melbourne`

**Note:** Open-Meteo rejects HTTP POST on the free tier. All fetches use GET with comma-separated lat/lon arrays (URL-encoded). The `buildOpenMeteoBody()` function exists for future use with a paid tier that may support POST for larger batches.

---

## Grid Tiling Methods

File: `server/utils/gridTiles.ts`

### `buildRectangularTiles` (Fine grid only)
Full bounding box — every lat/lon cell in the rectangle, chunked to `maxPerTile` points. No geographic clipping. Includes ocean, NSW, SA, Tasmania. Wind particles interpolate across the whole viewport, so a clipped grid would leave dead zones.

### `buildLandTiles` (Thermal + Extended)
Point-in-polygon clip against coastline rings (mainland SE Australia, Tasmania, King and Flinders Islands) plus a 0.2° buffer. Points are generated from step indices off a 0-origin lattice, so every point is an exact multiple of `delta`. Thermal drops from 10,710 to 6,276 points (−41%).

Replaced `buildColumnTiles` on 2026-09-12. That function split the box into four longitude columns and clipped each one independently to whichever Victoria border vertices fell inside it. Two consequences:

- Victoria's northern border is the Murray, which dips ~1.5° south in the centre-east, so adjacent columns stopped at different latitudes and left **hard-edged rectangular voids** in the overlay — most visibly at lon 147–151, lat −35.7 to −34.9.
- The "no border vertices in this column" case fell back to the *full bounding box*, so the easternmost column fetched 4,860 points of open Tasman Sea (45% of the thermal budget) while **Tasmania had no thermal data at all**.

Each column also started its longitudes at its own fractional origin, off the `delta` lattice the renderer assumes, shifting the overlay by up to 0.27° (~24 km) east of each seam.

---

## Debugging Checklist

**Wind heatmap shows no colour / all grey:**
1. Check `settings.fineGridLastResult` — is it "ok"?
2. Check Railway logs for `Fine grid:` entries around 5:00am today
3. Admin → Weather → Fine Grid → Fetch Now and watch progress

**Thermal overlay missing:**
1. Check `settings.thermalGridLastResult` — is it "ok" or "partial"?
2. Check `settings.thermalGridFailedTiles` — does it have tiles? Auto-retry should handle
3. If stuck after 4 retries: Admin → Weather → Thermal → Fetch Now

**7-day outlook cards blank on site page:**
1. Check `settings.extendedForecastLastResult`
2. Check `site_extended_forecasts` table has a row for that site
3. Admin → Weather → Extended → Fetch Now

**Progress bar appears then immediately disappears (fetch already done):**
Normal behaviour — if you click Fetch Now and the previous grid is still valid today, `fetchFineGrid(force=true)` still completes quickly from the DB cache (not a full re-fetch). Check `fineGridLastRun` timestamp.

**"partial — N tiles unresolved after 4 retries":**
Open-Meteo was persistently rate-limiting or erroring on those specific tiles. The 7:30am cron will retry. If this repeats across multiple days, consider reducing `TILE_DELAY_MS` or check if those lat/lon coordinates are genuinely problematic (offshore tiles sometimes have sparse ECMWF data).
