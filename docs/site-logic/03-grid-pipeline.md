# Wind/Thermal Grid Data Pipeline — Decisions & Thresholds

## Provider Chain & Tier Ordering

### Four-tier provider fallback order
- **What it is:** Four data sources ranked 1–4; the orchestrator tries them in order, using the lowest-available tier first. The user sees this indirectly — a tier-4 fallback triggers an alert email and shows a degraded label in the admin panel.
- **Why (the decisions):** The REST API (tier 1) is the freshest and richest source but is rate-limited by data volume. The S3 archive (tier 2) is the same ECMWF 9 km model served via static files — same quality, higher throughput. Tier 3 (GFS via S3) is a different model and lower resolution; tier 4 (NOMADS GFS) is the absolute last resort. The ordering ensures quality degrades only as needed, and that degradation is auditable.
- **How (the mechanism):** `server/grid/providers/registry.ts:21–26` — `PROVIDERS` array is `[openMeteoApiProvider (tier 1), openMeteoS3EcmwfProvider (tier 2), openMeteoS3GfsProvider (tier 3), nomadsGfsProvider (tier 4)]`. Each provider has `tier: number` and `modelFamily: "ecmwf" | "gfs"`. The orchestrator groups by family and walks families in tier order: `server/grid/orchestrator.ts:218–236`.
- **Principles:** Decisions stay with the human; Surface, don't hide; Deliberate, explained differences.

### ECMWF vs GFS model family separation
- **What it is:** Tiers 1–2 share the `"ecmwf"` model family; tiers 3–4 share `"gfs"`. Mixing families produces a visible seam on the rendered map.
- **Why (the decisions):** ECMWF IFS HRES runs at 9 km; NCEP GFS at ~28 km. They use different dynamics and parameterisations, so blending their wind fields at the boundary of their coverage produces a discontinuity. Within ECMWF tiers (1↔2) the fields are identical models at the same resolution — mixing is seamless.
- **How (the mechanism):** `server/grid/orchestrator.ts:320–328` — after each family is exhausted, coverage is checked against `FAMILY_COMPLETE_THRESHOLD (0.98)`. If met, the loop breaks and the next (different) family is never contacted. `server/grid/health.ts:49–58` — any contribution from a non-ECMWF source elevates severity to `"degraded"` or `"critical"`. The admin panel and email alerts surface this.
- **Principles:** Surface, don't hide; Deliberate, explained differences; Traceable to code.

### Family completeness threshold — 98%
- **What it is:** When a model family has filled ≥ 98% of requested points, the orchestrator stops and does not pull in the next (different) family.
- **Why (the decisions):** The 2% ragged edge is coastal/corner points that fall outside the model's coverage — they are invisible in practice. A cross-family seam through the middle of the map is clearly visible to pilots. The threshold is the trade-off point where a small hole is less harmful than an artefact spanning the whole map.
- **How (the mechanism):** `server/grid/orchestrator.ts:47` — `const FAMILY_COMPLETE_THRESHOLD = 0.98;`, evaluated at `orchestrator.ts:321` — `if (coverage >= FAMILY_COMPLETE_THRESHOLD) { break; }`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### 429 rate-limit handling — immediate tier escalation
- **What it is:** A `429 Too Many Requests` response from a provider stops that provider immediately and moves to the next tier. No retry within the same provider.
- **Why (the decisions):** Open-Meteo rate-limits by data volume, not request count. Retrying after a 429 would consume quota uselessly. The correct response is to hand off to the next source.
- **How (the mechanism):** `server/grid/orchestrator.ts:53–55` — `isRateLimit` detects `"429"` in the error message. `orchestrator.ts:276–282` — on rate limit, the provider is skipped with a note and the loop continues. `server/grid/providers/openMeteoApi.ts:220–228` — the API provider itself stops further tile fetches on 429 and returns whatever was collected (partial is better than nothing).
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Tier-4 completeness — completeness threshold 80%
- **What it is:** If the merged grid covers fewer than 80% of requested points, the pipeline keeps the previous day's cache rather than publishing a sparse grid.
- **Why (the decisions):** A day-old full grid renders better than today's grid with 20%+ holes in it. Holes in the wind field read as dead calm (wind u/v default to 0), which is a dangerous false signal for a tool pilots use to decide whether to fly.
- **How (the mechanism):** `server/grid/pipeline.ts:40–41` — `const COMPLETENESS_THRESHOLD = 0.8;`, checked at `pipeline.ts:352–365`. If below threshold, `loadPrevious()` is called and returned; only if there is no previous cache is the sparse grid stored.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

---

## Time Axis & Midnight Anchoring

### Melbourne-local midnight as the universal axis origin
- **What it is:** Every provider anchors its time axis to midnight Melbourne local time, not to the current UTC instant. All timestamps are stored and matched as `YYYY-MM-DDTHH:mm` strings in Melbourne local time.
- **Why (the decisions):** Open-Meteo's REST API defines `forecast_days` as whole Melbourne local days from midnight. If any other provider starts its axis at "now" instead of local midnight, its timestamps drift from the canonical axis by hours, and the orchestrator's string-match re-indexing produces NaN-filled leading hours. The first provider to return data sets the canonical axis; all later providers must be aligned to the same origin or lose coverage.
- **How (the mechanism):** `server/grid/time.ts:47–58` — `melbourneMidnightEpoch()` computes twice (once to get the UTC offset at UTC midnight, once to correct for DST). `currentAxisOrigin()` wraps this for all providers. `toMelbourneLocal()` formats epoch seconds as `YYYY-MM-DDTHH:mm` in the `Australia/Melbourne` timezone. Every provider calls `currentAxisOrigin()` at `openMeteoS3.ts:413`, `nomadsGfs.ts:299`.
- **Principles:** One source of truth per rule; Separate facts from judgements.

### DST-safe double computation of midnight
- **What it is:** `melbourneMidnightEpoch` applies `melbourneOffsetSec` twice — once using the UTC-midnight offset, once using the approximate local-midnight offset — to correctly handle days where the UTC-midnight offset differs from the local-midnight offset across a DST transition.
- **Why (the decisions):** Melbourne uses AEST/AEDT (+10/+11). On DST changeover nights, the UTC offset at midnight UTC differs from the offset at local midnight. A single-pass computation can be off by one hour on those two nights per year, which would corrupt the axis for the entire 3-day grid.
- **How (the mechanism):** `server/grid/time.ts:47–53` — `let midnight = utcGuess - melbourneOffsetSec(utcGuess); midnight = utcGuess - melbourneOffsetSec(midnight);`.
- **Principles:** Deliberate, explained differences; Assume the safest reading when context is missing.

### Canonical time axis set by first provider; re-indexing by string match
- **What it is:** The first provider to return data establishes the canonical array of timestamp strings. All later providers have their series re-indexed onto this array by matching timestamp strings, writing NaN where they have no value for a given hour.
- **Why (the decisions):** Positional alignment would silently shift all values by 1–N hours if two providers disagree on axis start or step. String matching is slow but immune to this: a value lands at the right hour even if the provider started later or used a longer step.
- **How (the mechanism):** `server/grid/orchestrator.ts:74–100` — `reindexOntoCanonical()` builds a `Map<string, number>` from provider timestamps, then fills the canonical array positionally using string lookups. NaN written for any unmatched hour. Applied at `orchestrator.ts:305`.
- **Principles:** Separate facts from judgements; Refuse rather than improvise at the edges.

### Forecast horizon — 3 days
- **What it is:** Both grids (fine and thermal) fetch 3 Melbourne local days of forecast data (`FORECAST_DAYS = 3`). The map slider and client overlays expose the full stored window.
- **Why (the decisions):** Open-Meteo is rate-limited by data volume; more days multiplies request volume linearly. The map slider is bounded by whatever the grid holds, so 3 days is the only lever — 7 days would triple API volume. Pilots plan day-of, occasionally the next day; 3 days is sufficient for practical use.
- **How (the mechanism):** `server/grid/pipeline.ts:49` — `export const FORECAST_DAYS = 3;`, passed as `forecastDays: FORECAST_DAYS` in `runFetch()` at `pipeline.ts:313`. Both `extract.ts:20` and `getTimeWindow()` derive their window from this constant.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

---

## Grid Geometry & Resolution

### Fine (wind) grid — 0.15° spacing, full rectangle
- **What it is:** The wind/particle overlay uses a 0.15° uniform grid over the full bounding rectangle, with no land clipping. The user sees it as the wind animation on the wind map.
- **Why (the decisions):** The particle renderer interpolates across the entire viewport. A clipped grid would leave dead zones where particles enter from the ocean side of the coast — blank black patches at sea. Wind blows over water; the data is needed even there. 0.15° (~11 km at Victorian latitudes) is coarser than the thermal grid because more variables are fetched per point and the API rate budget matters.
- **How (the mechanism):** `server/grid/bounds.ts:35–36` — `FINE_DELTA = 0.15`. `server/grid/fineGrid.ts:7–8` — comment explains no clipping. `server/grid/gridTiles.ts:37–54` — `buildRectangularTiles()` fetches every cell in the bbox.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### Thermal grid — 0.09° spacing, land-clipped
- **What it is:** The thermal overlay uses a 0.09° grid (~7 km) clipped to land plus a 0.2° offshore buffer. Thermals only exist over land, so this roughly halves the fetch volume versus a full rectangle.
- **Why (the decisions):** 0.09° is the native ECMWF IFS HRES spacing — using it avoids sub-grid interpolation artefacts. Land clipping is possible here (unlike the wind grid) because the thermal renderer interpolates over land cells only; the baked coastline mask is the ground truth.
- **How (the mechanism):** `server/grid/bounds.ts:38–39` — `THERMAL_DELTA = 0.09`. `server/grid/thermalGrid.ts:103–111` — `buildLandTiles()` is called, which consults the baked `isCovered()` mask. `server/utils/gridTiles.ts:80–106` — each lattice point is accepted only if `isCovered(lon, lat)` returns true.
- **Principles:** Deliberate, explained differences; One source of truth per rule.

### Default bounding box — SE Australia
- **What it is:** The default grid bounds are lat −43.7 to −33.9, lon 140.0 to 151.0, covering Victoria, Tasmania, ACT, eastern SA, and the NSW coast.
- **Why (the decisions):** The northern edge −33.9 was chosen to include the full Mallee and Sunraysia (previously −35.0 cut off Mildura). The southern edge −43.7 reaches past South East Cape to include all of Tasmania. The eastern bound 151.0 is tight to avoid fetching hundreds of kilometres of Tasman Sea that the land clip discards anyway. All bounds are admin-overridable.
- **How (the mechanism):** `server/grid/bounds.ts:29–55` — constants `FINE_LAT_MIN/MAX`, `FINE_LON_MIN/MAX`, with comment explaining the lattice-snap rationale. `getGridBounds()` reads admin overrides from the `settings` table, falling back to defaults on any error.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### Open-Meteo batch limit — 1000 points per tile
- **What it is:** Each API POST request is capped at 1000 points. Larger point sets are chunked before sending.
- **Why (the decisions):** The Open-Meteo API returns an error above this limit. Chunking is the mandatory accommodation.
- **How (the mechanism):** `server/grid/bounds.ts:41` — `MAX_POINTS_PER_TILE = 1000`. `server/grid/providers/openMeteoApi.ts:24` — `const MAX_POINTS_PER_TILE = 1000` (local constant with the same value). Chunking loop at `openMeteoApi.ts:153–158`.
- **Principles:** Refuse rather than improvise at the edges.

### Lattice origin anchored to absolute 0 — not to bbox min
- **What it is:** Every grid point is generated as `round(j * delta)` from a zero-origin lattice, not as a cumulative `latMin + j * delta`. The renderer derives cell indices from `(lon - lonMin) / delta`, which requires every point to sit exactly on the lattice.
- **Why (the decisions):** Per-column origins in the old scheme drifted off the lattice and shifted the thermal overlay by up to 0.27° (~24 km) east at each column seam. A coordinate-string lookup (instead of round-index lookup) also failed when a stored latitude was on-lattice but the reconstructed `lonMin` was not — blanking ~90% of the overlay.
- **How (the mechanism):** `server/utils/gridTiles.ts:86–96` — `j0 = ceil(latMin/delta)`, points generated as `j * delta`. `server/grid/extract.ts:484–485` — `iOf(lon) = round(lon/delta)`, `jOf(lat) = round(lat/delta)`, used for all cell lookups.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

---

## Coverage Rules: Required vs Optional Variables

### Required variables gate provider eligibility
- **What it is:** Each grid kind declares `required` variables that every provider must supply. A provider missing any required variable is skipped entirely, not used for partial coverage.
- **Why (the decisions):** Wind grid: no wind data = no wind map, so `wind_speed_10m` and `wind_direction_10m` are required. Thermal grid: no CAPE or BLH = no thermal forecast. Accepting a provider for unrelated variables while it lacks the core ones would produce a grid that silently passes completeness checks but cannot render.
- **How (the mechanism):** `server/grid/fineGrid.ts:42` — `FINE_REQUIRED: Variable[] = ["wind_speed_10m", "wind_direction_10m"]`. `server/grid/thermalGrid.ts:77` — `THERMAL_REQUIRED: Variable[] = ["cape", "boundary_layer_height"]`. Eligibility checked at `server/grid/orchestrator.ts:203–209`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

### Optional variables — gap-tolerant, never veto the axis
- **What it is:** Variables listed in `THERMAL_OPTIONAL` (LI, CIN, cloud cover, precipitation, weather code) are allowed to contain NaN. They are excluded from the axis-coverage check so a run of NaN in an optional field cannot shorten or destroy the forecast.
- **Why (the decisions):** Before commit `1a39e47`, `coveredWindow()` checked every variable a point carried — if `convective_inhibition` was NaN on any hour for any point, that hour was cut from the entire grid. CIN is non-finite on ~33–65% of Victoria points in the ECMWF bucket, so it was vetoing most grid runs. The fix separates provider eligibility (`required`) from per-axis hole tolerance (`optional`): optional variables are best-effort by contract.
- **How (the mechanism):** `server/grid/thermalGrid.ts:94–101` — `THERMAL_OPTIONAL` list. `server/grid/orchestrator.ts:365–368` — optional vars excluded from `coverageVars`. `server/grid/pipeline.ts:417–446` — `seriesOf()` with `allowGaps=true` writes NaN rather than throwing. `server/grid/extract.ts:553–563` — NaN normalised to `undefined` at the client boundary.
- **Principles:** Separate facts from judgements; Assume the safest reading when context is missing; One source of truth per rule.

### Fine grid — no gap-tolerant variables declared
- **What it is:** The fine/wind grid declares no `optional` list. Every variable must be complete or the axis is trimmed.
- **Why (the decisions):** `extract.ts` coerces missing gusts to 0 with `?? 0`, which would render as dead calm — a dangerous lie in a tool pilots use to decide whether to fly. The only honest policy is to require completeness; if the axis is trimmed, the user sees a shorter forecast, not an invented one.
- **How (the mechanism):** `server/grid/fineGrid.ts:36–42` — comment explains the rationale. `server/grid/pipeline.ts:313` — `optional: kind.optional ?? []` — evaluates to empty for FINE_GRID.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### Longest contiguous covered window — no zero-fill for gaps
- **What it is:** Instead of padding NaN holes with zeroes, the orchestrator trims the time axis to the longest contiguous window where all gap-intolerant variables are finite across all points.
- **Why (the decisions):** A gap at hour 36 in one provider's data would leave NaN at that position for every point that came from that provider. A NaN that reaches the client as 0 renders as dead calm — an invented reading. Trimming the axis gives a shorter honest forecast rather than a longer lying one.
- **How (the mechanism):** `server/grid/orchestrator.ts:130–169` — `coveredWindow()` function. Returns `[bestStart, bestStart + bestLen]` as the longest run of hours where `ok[i]` is true for all gap-intolerant variables across all points. Applied at `orchestrator.ts:368–405`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Zero-coverage throw with diagnostic
- **What it is:** If no single hour is covered by every point after trimming, the orchestrator throws with a per-variable breakdown of how many points are incomplete and how many hours each variable vetoed.
- **Why (the decisions):** A throw here forces the caller to fall back to the previous day's cache. The diagnostic is included in the error message so the admin panel (which surfaces the error) can identify which variable caused the failure — otherwise it would be invisible.
- **How (the mechanism):** `server/grid/orchestrator.ts:369–394` — `if (to === 0)` block builds `varStats` and throws `"refusing to emit a grid with holes"`.
- **Principles:** Surface, don't hide; Refuse rather than improvise at the edges.

---

## Caching & Staleness

### Grid cache expiry — 26 hours
- **What it is:** A stored grid is reused for 26 hours (24 h + 2 h buffer) from its write time. A request that arrives after the grid has expired triggers a fresh fetch.
- **Why (the decisions):** The scheduled fetch runs at 5:00 am Melbourne time, so a grid stored at 05:10 is 25 h and 10 min old when the next run starts. 26 h gives a 50-minute safety margin so a slightly delayed cron still serves cached data rather than triggering a redundant fetch during the same morning.
- **How (the mechanism):** `server/grid/pipeline.ts:30` — `const GRID_CACHE_EXPIRY_MS = 26 * 60 * 60 * 1000;`. Checked at `pipeline.ts:224` — if `Date.now() - cached.updatedAt.getTime() < GRID_CACHE_EXPIRY_MS`, return the cached grid.
- **Principles:** Deliberate, explained differences; One source of truth per rule.

### In-process memory cache TTL — 30 minutes
- **What it is:** Once a grid is loaded from the database into memory, it is kept for 30 minutes before being re-read from the database.
- **Why (the decisions):** Database reads are cheap but not free. Hot requests (multiple clients loading the map within minutes of each other) should all be served from the same in-memory object. 30 minutes bounds how stale an in-memory hit can be — a fresh fetch or admin force-refresh will evict it.
- **How (the mechanism):** `server/grid/pipeline.ts:33` — `const MEM_CACHE_TTL_MS = 30 * 60 * 1000;`. Checked at `pipeline.ts:195` — `if (state.memGrid && Date.now() - state.memGridAt < MEM_CACHE_TTL_MS)`.
- **Principles:** Deliberate, explained differences.

### Grid history retention — 7 days
- **What it is:** The `wind_grid_data` table retains grids for 7 Melbourne local days. Older rows are deleted by `cleanupOldGrids`.
- **Why (the decisions):** The "keep previous cache" fallback needs at least one day's history. Seven days provides a safety margin (e.g. if fetches fail for a few days) and keeps database size bounded.
- **How (the mechanism):** `server/grid/pipeline.ts:44` — `const RETAIN_DAYS = 7;`. `server/grid/store.ts:135–158` — `cleanupOldGrids()` deletes rows with `siteId < ${baseKey}_${cutoffDate}`.
- **Principles:** Deliberate, explained differences; One source of truth per rule.

### S3 provider availability cache — 3 minutes
- **What it is:** The `available()` probe result for each S3 provider is cached for 3 minutes per process. The NOMADS provider always does a live HEAD on `available()`.
- **Why (the decisions):** A cold HEAD request on each orchestrator call is pointless noise — the S3 bucket does not go down and come back up minute-by-minute. Three minutes is short enough that a real outage is detected quickly; long enough to avoid hammering S3 on every grid request.
- **How (the mechanism):** `server/grid/providers/openMeteoS3.ts:49` — `const AVAILABILITY_CACHE_MS = 3 * 60 * 1000;`. `availCache` map checked at `openMeteoS3.ts:842–857`.
- **Principles:** Deliberate, explained differences.

### In-flight fetch de-duplication
- **What it is:** If a fetch is already running for a grid kind (e.g. the 5:00 am cron is in progress), any additional non-forced caller joins the existing promise rather than starting a second fetch.
- **Why (the decisions):** Multiple clients or HTTP requests arriving while the morning fetch is in progress should not each start independent fetches against the same API — that would multiply quota consumption. One fetch, many waiters.
- **How (the mechanism):** `server/grid/pipeline.ts:236–243` — `if (state.inflight) { if (!force) { return state.inflight; } }`. A forced fetch (`force=true`) cancels the running fetch and starts fresh.
- **Principles:** One source of truth per rule; Refuse rather than improvise at the edges.

---

## Open-Meteo API Provider Specifics

### Inter-tile pause — 5 seconds
- **What it is:** After each 1000-point batch POST to the Open-Meteo API, the provider waits 5 seconds before sending the next tile.
- **Why (the decisions):** Open-Meteo rate-limits by total data volume per unit time, not by request count. A burst of tiles without pausing triggers a 429 even when each tile is individually within limits. 5 s was tuned against the rate limits empirically.
- **How (the mechanism):** `server/grid/providers/openMeteoApi.ts:19` — `const TILE_DELAY_MS = 5000;`. Applied at `openMeteoApi.ts:234–241`.
- **Principles:** Deliberate, explained differences; Refuse rather than improvise at the edges.

### `available()` always returns true
- **What it is:** The Open-Meteo API provider's `available()` probe unconditionally returns `true` without making a network call.
- **Why (the decisions):** A probe request to the Open-Meteo API costs the same data-volume quota as a real fetch — it is not a free liveness check. Burning quota on a probe that can't distinguish "API down" from "API rate-limited" provides no benefit; real failures surface immediately in `fetch()`.
- **How (the mechanism):** `server/grid/providers/openMeteoApi.ts:141–145` — comment explains the rationale; returns `true` unconditionally.
- **Principles:** Deliberate, explained differences.

### Tile fetch partial result on 429
- **What it is:** If a 429 arrives mid-way through a batch of tiles, the API provider stops and returns whatever was collected before the rate limit, rather than throwing.
- **Why (the decisions):** Any points already fetched are good data. Throwing would discard them and force the orchestrator to fall back to tier 2 for all points. Returning a partial result lets the orchestrator fill the gaps from a lower tier — a better outcome.
- **How (the mechanism):** `server/grid/providers/openMeteoApi.ts:222–228` — if `collected.length > 0`, return partial result; only throw if nothing was collected at all.
- **Principles:** Assume the safest reading when context is missing.

---

## S3 `.om` File Read Shapes

### Row-by-row reads for ECMWF IFS 9 km (OOM prevention)
- **What it is:** The S3 ECMWF provider reads one latitude row at a time (a 1×N×T slice), not the entire spatial dimension at once.
- **Why (the decisions):** Bulk reads (requesting the full spatial dimension in one call) cause the WASM `@openmeteo/file-reader` module to run out of memory. This was discovered empirically in the spike. Row-by-row reads are slower but keep memory bounded.
- **How (the mechanism):** `server/grid/providers/openMeteoS3.ts:286–312` — `ecmwfReadRow()` calls `reader.read()` with `ranges: [{ start: 0, end: 1 }, { start: spatStart, end: spatEnd }, { start: tStart, end: tEnd }]`. A fresh `OmFileReader` is created per read and disposed after, to prevent WASM state accumulation.
- **Principles:** Deliberate, explained differences; Refuse rather than improvise at the edges.

### Rectangle reads for ECMWF IFS025 (LI derivation) — 39× speedup
- **What it is:** The `ecmwfLiftedIndex` provider reads the entire area-of-interest as a 3D rectangle `[latRange × lonRange × timeRange]`, not cell by cell.
- **Why (the decisions):** The `.om` files are chunk-compressed; neighbouring cells share the same on-disk chunk. Per-cell reads re-fetch and re-decode that chunk once per cell, while one rectangular read fetches each chunk once. Measured empirically: one box read takes ~27 s where 920 per-cell reads take ~18 min — a 39× saving, with bit-identical results.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:148–228` — `readIfs025Box()` uses 3-D ranges for the whole tile. `TILE_MAX = 64` cells per side bounds memory; the Victoria box fits in one tile so one read per variable per chunk is typical.
- **Principles:** Deliberate, explained differences.

### S3 parallelism cap — 20 concurrent reads
- **What it is:** A semaphore limits concurrent S3 range requests to 20 across all providers reading from S3.
- **Why (the decisions):** S3 returns `SlowDown` throttling errors under burst traffic. The spike found P=20 is safe under normal load. Higher parallelism would be faster but risks SlowDown errors that then require retry/backoff, yielding no net speed gain.
- **How (the mechanism):** `server/grid/providers/s3ReadCommon.ts:17` — `export const READ_PARALLELISM = 20;`. `makeSemaphore()` at `s3ReadCommon.ts:24–40` is shared across all S3 reads within a provider fetch.
- **Principles:** Deliberate, explained differences.

### S3 HTTP reader tuning — 512 KB / 128 KB
- **What it is:** HTTP range requests to S3 are capped at 512 KB each (`IO_SIZE_MAX`); adjacent chunks within 128 KB of each other are merged into one request (`IO_SIZE_MERGE`).
- **Why (the decisions):** These values were tuned in the empirical spike (`spike/prove.mjs`) to balance round-trip count against per-request size. The merge threshold reduces request count for closely-packed data without inflating request size.
- **How (the mechanism):** `server/grid/providers/s3ReadCommon.ts:20–21` — `IO_SIZE_MAX = BigInt(512 * 1024)`, `IO_SIZE_MERGE = BigInt(128 * 1024)`. Both must be `BigInt` (not `number`) per the WASM API contract. Passed to every `reader.read()` call.
- **Principles:** Deliberate, explained differences.

### SlowDown retry — exponential backoff, 4 attempts max
- **What it is:** S3 `SlowDown` errors are retried up to 4 times with exponential backoff starting at 500 ms, plus jitter. `AbortError` is not retried.
- **Why (the decisions):** SlowDown is transient; retrying almost always succeeds within a few seconds. Aborting on `AbortError` prevents a cancelled grid fetch from continuing to make network calls.
- **How (the mechanism):** `server/grid/providers/s3ReadCommon.ts:44–62` — `withSlowDownRetry()`. Delay sequence: 500 ms, 1000 ms, 2000 ms (×2 each attempt), plus `Math.random() * 200` jitter.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### S3 retry on transient read failures — one retry at 250 ms
- **What it is:** A single row/cell read failure is retried once after 250 ms before being marked as dropped. A dropped read logs a warning but does not fail the whole fetch.
- **Why (the decisions):** A transient S3 read failure otherwise costs the entire latitude row (ECMWF) or grid cell (GFS) — rendering as a blank stripe or blank point on the map. A single retry catches most transient errors. A second failure is logged as dropped and the orchestrator fills the gap from the next tier.
- **How (the mechanism):** `server/grid/providers/openMeteoS3.ts:488–503` (ECMWF), `openMeteoS3.ts:724–733` (GFS) — `try/catch` with `setTimeout(r, 250)` before the second attempt. `droppedReads` array accumulated per chunk.
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

### GFS chunk layout probe — 3D vs flat detection at runtime
- **What it is:** Before reading each GFS chunk, the provider probes the file's `getDimensions()` to determine whether it is a 3D `[lat, lon, time]` layout or a legacy flat `[spatial, time]` layout.
- **Why (the decisions):** The GFS S3 archive migrated to 3D chunks at an unknown chunk boundary. Hard-coding a threshold would require manual updates as new archives are published. The runtime probe makes both layouts transparent without any maintenance.
- **How (the mechanism):** `server/grid/providers/openMeteoS3.ts:692–706` — `OmFileReader.create()` followed by `probeReader.getDimensions()`. `is3D = dims.length === 3`.
- **Principles:** Deliberate, explained differences; Traceable to code.

### ECMWF IFS025 chunk stride — 312 hours (3-hourly × 104 steps)
- **What it is:** The `ecmwf_ifs025` pressure-level bucket (used for LI derivation) organises time in 312-hour chunks (104 steps × 3 h/step). Reading the current forecast requires slicing the right time range from the current chunk.
- **Why (the decisions):** Reading from index 0 would return data from weeks ago, silently labelled with today's timestamps. The time slice must be computed from `(epochSec - chunkStart) / 3600` and the result must not exceed the chunk bounds.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:49–65` — `IFS025_STEP_H = 3`, `IFS025_NSTEPS = 104`, `IFS025_CHUNK_H = 312`. `tStart`/`tEnd` computed at `ecmwfLiftedIndex.ts:316–317`, with ±1 step padding so interpolation always has bracketing anchor points.
- **Principles:** Deliberate, explained differences; Assume the safest reading when context is missing.

### ECMWF IFS025 surface pressure — derived, not read
- **What it is:** Surface pressure for lifted index derivation is computed from `pressure_msl + HSURF` via the ISA barometric formula, not read from the `surface_pressure` field in the S3 bucket.
- **Why (the decisions):** The `surface_pressure` field in the `ecmwf_ifs025` bucket is stale — frozen at chunk 1555 (~May 2025) while the temperature fields continue to update. Reading it would mix archival pressure with current temperatures, producing incorrect LI values.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:240–244` — `deriveSurfP(pMsl, t2m, z) = pMsl * (1 - 0.0065*z/(T+0.0065*z))^5.257`. Guard at `ecmwfLiftedIndex.ts:500` — `pSurf < 400 || pSurf > 1100` rejected as bad values.
- **Principles:** Separate facts from judgements; Refuse rather than improvise at the edges.

### HSURF ocean sentinel — treat -999 as 0 m elevation
- **What it is:** The ECMWF model orography file (`HSURF.om`) uses the value −999 (or any value < −100) as a missing/ocean sentinel. This is substituted with 0 m (sea level) rather than propagating into the barometric formula.
- **Why (the decisions):** Plugging −999 m into the ISA formula gives nonsense surface pressure — and therefore nonsense LI. Coastal points over shallow water should use 0 m (sea level), which gives a sensible result.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:136` — `hsurfCache.set(cellKey(a, o), z < -100 ? 0 : z)`.
- **Principles:** Assume the safest reading when context is missing.

### ECMWF IFS025 lat direction — south-first (opposite of GFS)
- **What it is:** The `ecmwf_ifs025` bucket stores latitudes south-first: `iLat = round((lat + 90) / 0.25)`, where row 0 = South Pole. The standard GFS convention and the 9 km ECMWF S3 bucket are north-first.
- **Why (the decisions):** This is an undocumented property of the archive that was confirmed empirically. Using the wrong direction maps every point to the wrong hemisphere, producing wildly incorrect LI values.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:54–55` — `ifs025ILat(lat) = round((lat + 90) / 0.25)`. The comment "OPPOSITE of GFS convention" is the explicit flag that this is deliberate.
- **Principles:** Deliberate, explained differences; Traceable to code.

---

## NOMADS GFS Provider Specifics

### GFS publication lag — 5 hours
- **What it is:** NOAA typically publishes a GFS model cycle ~4–5 hours after its reference time. When selecting which cycle to use, the provider subtracts this lag to avoid requesting a cycle that hasn't been published yet.
- **Why (the decisions):** Requesting a not-yet-published cycle returns a 404. Falling back to the previous cycle is the correct degradation; the code formalises the empirical publication lag as a named constant rather than a magic number.
- **How (the mechanism):** `server/grid/providers/nomadsGfs.ts:94` — `const PUB_LAG_HOURS = 5;`. Used in `latestCycle()` at `nomadsGfs.ts:175` — `fractionalHour >= cycle + PUB_LAG_HOURS`.
- **Principles:** Deliberate, explained differences; Assume the safest reading when context is missing.

### NOMADS cycle resolution — up to 3 step-backs
- **What it is:** If the resolved GFS cycle file is not available (404 or network error), the provider steps back to the previous 6-hourly cycle. It retries at most 3 times before throwing.
- **Why (the decisions):** Publication lag estimation (`PUB_LAG_HOURS = 5`) is approximate; a retry cycle handles edge cases where the file is delayed slightly longer. Three attempts cover up to 18 hours of cycle step-back — beyond that the data would be too stale to be useful.
- **How (the mechanism):** `server/grid/providers/nomadsGfs.ts:324–343` — loop `for (let attempt = 0; attempt < 3; attempt++)` with `previousCycle()` on each fail.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### NOMADS bbox margin — 0.5°
- **What it is:** The bounding box sent to the NOMADS filter server is expanded by 0.5° on each side beyond the extremes of the requested points.
- **Why (the decisions):** 0.5° ≥ 2 grid cells at 0.25° resolution, ensuring NOMADS returns at least one row/column of data outside the extreme points. Without the margin, a point exactly at the grid edge might fall in an empty area.
- **How (the mechanism):** `server/grid/providers/nomadsGfs.ts:225` — `const GRID_MARGIN_DEG = 0.5;`. Applied in `computeBbox()` at `nomadsGfs.ts:240–245`.
- **Principles:** Deliberate, explained differences; Assume the safest reading when context is missing.

### NOMADS download concurrency — 4
- **What it is:** GRIB2 file downloads from NOMADS are fetched with bounded concurrency of 4 simultaneous requests.
- **Why (the decisions):** NOMADS is a US government service with rate limits. Higher concurrency risks throttling. Four concurrent downloads is a conservative safe value that still gives reasonable throughput for the 3-day forecast window.
- **How (the mechanism):** `server/grid/providers/nomadsGfs.ts:358` — `const sem = makeSemaphore(4);`.
- **Principles:** Deliberate, explained differences.

---

## Parcel Ascent & Lifted Index

### LI derivation scope — LCL and LI only; EL and CAPE excluded
- **What it is:** The parcel ascent routines compute LCL (lifting condensation level) and lifted index. EL (equilibrium level) and project-derived CAPE are deliberately excluded.
- **Why (the decisions):** EL showed standard deviation ≈ 1010 m when validated against GFS at ECMWF's sparse pressure levels — too noisy for operational use. Project-derived CAPE showed r=0.49 vs GFS CAPE and a median of 0 — unacceptably poor. ECMWF's native CAPE field is used instead. LCL and LI are safe: validation showed r=0.9962, residual SD=0.170 °C (n=160).
- **How (the mechanism):** `shared/parcel.ts:13–18` — explicit "Deliberately EXCLUDED" comment with reasons. `liftParcel()` and `lclPressureTemp()` are the only exported non-trivial functions.
- **Principles:** Separate facts from judgements; Deliberate, explained differences; Refuse rather than improvise at the edges.

### RK4 integration step — 1 hPa
- **What it is:** The moist pseudoadiabat from the LCL to 500 hPa is integrated with Runge-Kutta 4th order at a step of −1 hPa per iteration.
- **Why (the decisions):** The formulations are copied exactly from the validated spike (`spike/parcel.mts`). The validation was performed on these specific equations and step size; changing the step or formulation would invalidate the r=0.9962 guarantee.
- **How (the mechanism):** `shared/parcel.ts:122` — `const step = -1.0; // hPa per integration step`. A final partial step lands exactly at `targetP_hPa` to avoid accumulation error.
- **Principles:** Deliberate, explained differences; Traceable to code.

### LI sign convention — positive = stable
- **What it is:** `li = T_env_500 − T_parcel_500`. Positive means the environment at 500 hPa is warmer than the lifted parcel — stable. Negative means the parcel is warmer — buoyant/unstable.
- **Why (the decisions):** This is the canonical definition used by GFS's published field and confirmed in the validation against GFS. An inverted sign would make the OD (overdevelopment) indicator fire in exactly the wrong conditions.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:493–495` — `const li = s.t500 - tParcel;` with a comment explicitly stating the sign convention.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

### LI guard — reject surface pressure outside 400–1100 hPa
- **What it is:** Derived surface pressures outside the range 400–1100 hPa are treated as bad values and the point is omitted from LI output.
- **Why (the decisions):** The barometric formula can produce implausible results for extreme or erroneous HSURF values (e.g. mountains encoded incorrectly, or ocean sentinel mis-applied). 400–1100 hPa is the physically valid range for surface pressure on Earth; outside it the LI computation would produce nonsense.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:500` — `if (!isFinite(pSurf) || pSurf < 400 || pSurf > 1100) continue;`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### LI temporal interpolation — linear, no extrapolation
- **What it is:** LI is derived at 3-hourly ECMWF steps then linearly interpolated onto the 1-hourly forecast axis. Hours outside the available data window emit NaN — no extrapolation.
- **Why (the decisions):** LI is a slowly-varying upper-air field — linear interpolation is acceptable in a way it would not be for rapidly-changing surface variables like wind speed. Refusing to extrapolate is the safe choice: a NaN is surfaced as "unavailable" on the client rather than as an invented value.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:518–540` — binary-search bracket, linear `frac` interpolation. `hourlyLI.push(NaN)` for hours before/after the data window.
- **Principles:** Separate facts from judgements; Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### LI failure handling — omit rather than zero-fill
- **What it is:** If a point's LI read or derivation fails (missing HSURF, fewer than 2 anchor points, WASM read failure), that point is omitted from the LI result map. The fetch still succeeds; the point gets no LI value.
- **Why (the decisions):** A zero LI reads as "neutral stability" — the boundary between safe and dangerous. Emitting zero for a point where data is absent would produce a false neutral signal; omitting the point is the honest alternative.
- **How (the mechanism):** `server/grid/providers/ecmwfLiftedIndex.ts:484–510` — `if (z === undefined || steps.length === 0) { failedPoints++; continue; }`. `if (liSteps.length < 2) { failedPoints++; continue; }`. LI derivation failure is also non-fatal to the whole S3 ECMWF fetch — caught at `openMeteoS3.ts:635–639`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

---

## W* (Deardorff Convective Velocity Scale)

### MIN_USABLE_BLH — 300 m
- **What it is:** Boundary layers shallower than 300 m are classified as not supporting usable convection; `computeWstar()` returns 0.
- **Why (the decisions):** Without this guard, a 60 m nocturnal layer under weak sun still produces a non-zero w* from the flux arithmetic — painting colour on the map before sunrise. 300 m is the practical minimum for glider-usable thermals.
- **How (the mechanism):** `server/grid/extract.ts:416` — `const MIN_USABLE_BLH = 300;`. `extract.ts:438` — `if (blh! < MIN_USABLE_BLH) return 0;`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences.

### LAND_ALBEDO — 0.20 (fixed)
- **What it is:** Net shortwave radiation at the surface uses a fixed broadleaf/pasture albedo of 0.20 rather than the ECMWF model's own albedo field.
- **Why (the decisions):** ECMWF's `albedo` field is in the S3 archive but returns null from the tier-1 REST API. Using the model albedo would leave ~1000-point holes in any grid area where tier 1 supplied points. A fixed value for typical Australian agriculture is a deliberate simplification with known bounded error.
- **How (the mechanism):** `server/grid/extract.ts:396–397` — `const LAND_ALBEDO = 0.20;` with comment.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### NET_LONGWAVE_LOSS — 90 W/m²
- **What it is:** A fixed representative daytime net longwave emission loss. Subtracted from net shortwave to get net radiation.
- **Why (the decisions):** Open-Meteo's sensible heat flux field is only served for GFS — ECMWF returns null. The entire W* derivation uses only fields ECMWF serves on both tiers 1 and 2. This constant substitutes for a field that cannot be used without creating cross-family seam artefacts.
- **How (the mechanism):** `server/grid/extract.ts:399` — `const NET_LONGWAVE_LOSS = 90;`. Applied at `extract.ts:441`.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### BOWEN_DRY / BOWEN_WET — 5.0 / 0.3
- **What it is:** The Bowen ratio (sensible/latent heat) is interpolated between 5.0 (parched ground) and 0.3 (saturated ground) based on volumetric soil moisture.
- **Why (the decisions):** A wet paddock after rain evaporates most of its net radiation into latent heat and barely thermals even in full sun. A dry paddock under the same sun generates strong thermals. The Bowen ratio is the mechanism that encodes this. Endpoints 5.0 and 0.3 are empirically consistent with standard MOST/ML literature for Australian conditions.
- **How (the mechanism):** `server/grid/extract.ts:404–405` — constants. `extract.ts:443–449` — `wetness = clamp(soilMoisture / SOIL_SATURATION, 0, 1)`, then `bowen = BOWEN_DRY + (BOWEN_WET - BOWEN_DRY) * wetness`.
- **Principles:** Deliberate, explained differences; Separate facts from judgements.

### SOIL_SATURATION — 0.35 m³/m³
- **What it is:** Soil moisture at or above 0.35 m³/m³ is treated as "fully wet" (Bowen ratio → `BOWEN_WET`).
- **Why (the decisions):** 0.35 m³/m³ is typical field capacity for clay-loam soils common in SE Australia. Values above field capacity represent waterlogging where additional moisture does not further reduce the Bowen ratio.
- **How (the mechanism):** `server/grid/extract.ts:402` — `const SOIL_SATURATION = 0.35;`. `extract.ts:443` — `wetness = Math.max(0, Math.min(1, soilMoisture / SOIL_SATURATION))`.
- **Principles:** Deliberate, explained differences.

---

## Baked Land Mask

### Single generated raster replaces two hand-traced rings
- **What it is:** The land mask is a single baked raster artifact (`shared/landMask.generated.ts`), consumed by both the server (to choose which points to fetch) and the client (to clip rendered pixels). Previously two hand-traced polygon rings existed in separate files and had drifted apart.
- **Why (the decisions):** The client copy had drifted into tracing the Victorian state border — straight verticals at lon 140.96 and 149.98, with a straight lat −33.98 "Murray" — erasing ten columns of South Australia and seven columns of NSW coast that the server had already fetched. One generated artifact with a build-time correctness check makes drift impossible. See commit `92b49b2`.
- **How (the mechanism):** `scripts/bake-land-mask.mjs:552` — `const OUT = new URL('../shared/landMask.generated.ts', ...)`. `shared/landMask.generated.ts` exports `isOnLand()` and `isCovered()`.
- **Principles:** One source of truth per rule; Traceable to code.

### Land mask source — GEODATA COAST 100K 2004 (GA, CC BY 4.0)
- **What it is:** The coastline geometry is derived from Geoscience Australia's GEODATA COAST 100K 2004 dataset, licensed CC BY 4.0. Only polygons with `FEAT_CODE = 'mainland'` or `'island'` are included; `'sea'` polygons are excluded.
- **Why (the decisions):** The dataset provides actual Mean High Water coastline, including islands that the hand-traced ring omitted entirely (Wilsons Promontory was a single vertex; Western Port, French Island, Phillip Island, Corner Inlet did not exist). The CC BY 4.0 licence requires attribution, which is present in `ThermalHelpModal.tsx`.
- **How (the mechanism):** `scripts/bake-land-mask.mjs:248–250` — `feat = dbf.record(poly.index).FEAT_CODE; if (feat !== 'mainland' && feat !== 'island') return;`.
- **Principles:** One source of truth per rule; Surface, don't hide.

### Land mask resolution — 0.01° cells (~1.1 km)
- **What it is:** The raster is computed at 0.01° per cell (~1.1 km at Victorian latitudes). The mask extent is 139–151.5° lon, −44 to −33° lat.
- **Why (the decisions):** 0.01° is 10× finer than the coarsest grid spacing (0.15° wind grid), so every grid lattice point maps to a distinct mask cell. The extent is deliberately wider than the default bounding box so the 0.2° offshore buffer and any future admin widening stay inside the baked area.
- **How (the mechanism):** `scripts/bake-land-mask.mjs:232` — `const MASK = { lonMin: 139.0, lonMax: 151.5, latMin: -44.0, latMax: -33.0, res: 0.01 };`.
- **Principles:** Deliberate, explained differences.

### Offshore buffer — 0.2° true distance, baked in
- **What it is:** The `isCovered()` function returns true for any point within 0.2° of a coastline (measured in true distance, not raw degrees). This buffer is baked into the mask — it is not a runtime parameter.
- **Why (the decisions):** Coastal flying sites need grid neighbours on their seaward side for interpolation to work. The 0.2° value was the `buffer` default both old callers of `buildLandTiles` always used; baking it makes the server fetch-set check a simple raster lookup (O(1)) rather than a runtime distance query, and removes the opportunity for callers to use different values.
- **How (the mechanism):** `scripts/bake-land-mask.mjs:330` — `const BUFFER_DEG = 0.2;`. Distance transform uses anisotropic scaling: `LON_SCALE = cos(38.5° × π/180)` so a degree of longitude is correctly weighted against a degree of latitude at `bake-land-mask.mjs:333`.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

### EDT anisotropic scaling — standard parallel cos(38.5°)
- **What it is:** The distance transform uses `LON_SCALE = cos(38.5° × π/180) ≈ 0.78` to scale longitude differences, so the 0.2° buffer is isotropic in true distance rather than in raw degrees (which would over-buffer east-west by 28%).
- **Why (the decisions):** Without this correction, a point 0.2° west of the coast would be included in the fetch set even though it is only ~0.156° true distance away, while a point 0.2° north would be correctly at the boundary. The standard parallel 38.5° is the midpoint of the Victoria/Tasmania coverage.
- **How (the mechanism):** `scripts/bake-land-mask.mjs:333` — `const LON_SCALE = Math.cos((38.5 * Math.PI) / 180);`. Applied in `edt1d` invocations at `bake-land-mask.mjs:397–400`.
- **Principles:** Deliberate, explained differences.

### Land mask two variants — `isOnLand` vs `isCovered`
- **What it is:** Two functions are exported: `isOnLand()` returns true only for cells that are actual land (exact coastline); `isCovered()` returns true for land or within 0.2° of the coast. Each is decoded lazily on first use — the server never calls `isOnLand`, the client never calls `isCovered`.
- **Why (the decisions):** The server needs the buffered set to ensure coastal sites have grid neighbours. The client needs the tight coastline to draw the visible coast correctly — `interpolateSpatial` is a relaxed bilinear that bleeds ~10 km offshore from the nearest land point; `isOnLand` is what stops the bleed.
- **How (the mechanism):** `shared/landMask.generated.ts` (generated) — `isOnLand` decodes `LAND_RLE` lazily; `isCovered` decodes `COVERAGE_RLE` lazily.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

---

## Elevation Tiles

### Zoom level 12 for elevation tiles (~30 m/px)
- **What it is:** Ground elevation is sampled from AWS terrarium tiles at zoom level 12 (~30 m/pixel at Victorian latitudes).
- **Why (the decisions):** Zoom 12 keeps tile count manageable while providing elevation error < 10 m (verified against OpenTopoData SRTM 30m). Lower zoom would be coarser than needed for pilot briefings; higher zoom would multiply tile count without meaningful accuracy gain given the SRTM 30m source.
- **How (the mechanism):** `server/grid/elevationPoint.ts:29` — `const ZOOM = 12;`. Comment: "nearest-pixel error < 10 m".
- **Principles:** Deliberate, explained differences.

### Elevation tile LRU cache — 128 tiles (~17 MB)
- **What it is:** Decoded elevation tiles are cached in an in-process LRU map capped at 128 tiles.
- **Why (the decisions):** 128 tiles at 256×256 × 2 bytes (Int16) = ~16.8 MB — a reasonable memory commitment. The LRU eviction ensures the most-recently-used tiles stay warm for bilinear sampling (which fetches 4 adjacent tiles per query).
- **How (the mechanism):** `server/grid/elevationPoint.ts:35` — `const LRU_MAX = 128;`. `lruSet()` evicts the first (least-recently-used) Map entry when the cap is exceeded.
- **Principles:** Deliberate, explained differences.

### Elevation tile retry — 3 attempts, exponential backoff from 500 ms
- **What it is:** Failed tile fetches are retried up to 3 times with exponential backoff starting at 500 ms.
- **Why (the decisions):** Terrarium tiles are served from a public S3 bucket. Transient failures are common. The function never throws to the caller — it returns null after all retries fail. Null is propagated back to the caller as "elevation unavailable" rather than a crash.
- **How (the mechanism):** `server/grid/elevationPoint.ts:37–39` — `RETRY_MAX = 3`, `RETRY_BASE_MS = 500`. `fetchTile()` loop at `elevationPoint.ts:119–158`. Returns null on exhaustion.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### NODATA sentinel substitution — relaxed bilinear for ocean pixels
- **What it is:** The terrarium nodata sentinel (−32768, an all-zero RGB pixel) is excluded from the bilinear interpolation. If a corner pixel is NODATA, it is substituted with the nearest valid corner's value rather than blending in −32768.
- **Why (the decisions):** Blending even a single −32768 corner into the bilinear average would produce a wildly negative result that still looks like a plausible number. Coastal sites have tiles that straddle the coastline — their seaward pixels are NODATA. The substitution is the same relaxed-bilinear approach used in `extract.ts` for the thermal grid.
- **How (the mechanism):** `server/grid/elevationPoint.ts:258–270` — `s00 = v00 === NODATA ? null : v00; ... c00 = s00 ?? s10 ?? s01 ?? s11!;`. All-null returns null.
- **Principles:** Assume the safest reading when context is missing.

---

## Health Alerting

### Health severity levels — ok / degraded / critical
- **What it is:** Each completed grid run is classified into one of three severity levels: `ok` (all ECMWF), `degraded` (any GFS-family contribution), `critical` (NOAA NOMADS contributed).
- **Why (the decisions):** The provider chain degrades silently by design — the grid renders regardless of which tier supplied it. Silent degradation requires a loud voice: admins need to know when a grid served entirely from 28 km GFS data is standing in for 9 km ECMWF. Two levels of loudness: the admin panel always shows current state; email only fires for critical.
- **How (the mechanism):** `server/grid/health.ts:42–65` — `classifyGridHealth()`. `server/utils/gridAlerts.ts:140–150` — `severity === "ok"` returns early; `severity !== "critical"` skips email.
- **Principles:** Surface, don't hide; Deliberate, explained differences.

### Critical alert rate limit — once per Melbourne day per grid
- **What it is:** Critical fallback alert emails are sent at most once per Melbourne local day per grid kind (fine or thermal).
- **Why (the decisions):** The thermal retry chain can run five times in a morning. Without this guard, five consecutive NOMADS runs would send five emails. The email is the durable record; the settings flag is a live reading that a later healthy run clears.
- **How (the mechanism):** `server/utils/gridAlerts.ts:144–149` — `sentKey = gridAlertLastEmailed:${healthKey}`. Compared to `melbourneToday()` before sending. The sent-day is only written if at least one recipient received the email successfully.
- **Principles:** Deliberate, explained differences; Assume the safest reading when context is missing.

### Alert sent-day gate — only written on successful delivery
- **What it is:** The "already emailed today" flag is only written to the database if at least one recipient successfully received the alert email.
- **Why (the decisions):** A transient email outage must not silently suppress all further alerts for the day. If the email delivery fails, the system should try again on the next run.
- **How (the mechanism):** `server/utils/gridAlerts.ts:169–173` — `if (results.some(Boolean)) { await setSetting(sentKey, today); }`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

---

## Thermal Overlay Extraction

### W*/CCL isolation fill — N/S neighbour interpolation
- **What it is:** When a thermal overlay cell has `wstar` or `ccl` undefined (because a provider dropped an entire latitude row for `temperature_2m`) but both its north and south neighbours have valid values, the cell is filled with their mean.
- **Why (the decisions):** A missing temperature row renders as a pale horizontal band on the thermal map — a visually obvious artefact. These fields are spatially smooth; the mean of two adjacent rows is a faithful fill for an isolated gap. Only adjacent-both-neighbours fills are performed; a large hole is left as null.
- **How (the mechanism):** `server/grid/extract.ts:579–594` — N/S neighbour check using `layer[(j-1)*ni+i]` and `layer[(j+1)*ni+i]`. Applied once at overlay build time (the overlay is cached, so this runs once per grid load).
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

### Forecast display window origin — 05:00 Melbourne
- **What it is:** The render window shown to users starts at 05:00 Melbourne local time on the current day, not at the grid's start time or at "now".
- **Why (the decisions):** Pilots plan their day from pre-dawn. Starting at 05:00 gives context for the morning cycle (sunrise, pre-flight) without going back to midnight. The window start is always 05:00 regardless of when the page is loaded — consistent with how pilots think about flying days.
- **How (the mechanism):** `server/grid/extract.ts:61–62` — `const todayStr = ...T05:00`. `getTimeWindow()` finds the first index `>= todayStr`, falling back to index 0 for stale grids.
- **Principles:** Deliberate, explained differences.

### Site forecast window — 08:00–20:00 (13 hours)
- **What it is:** The per-site hourly forecast shown in the site weather panel spans 08:00–20:00 Melbourne local time (13 hours), falling back to the next 6 hours when the grid does not contain 08:00 (stale data).
- **Why (the decisions):** 08:00–20:00 is the practical flying window for paragliding/hang gliding in SE Australia. The fixed window makes the forecast consistent and comparable day-to-day; the 6-hour fallback ensures something is shown even for stale grids.
- **How (the mechanism):** `server/grid/extract.ts:162–167` — `const dayStart = nearest.hourly.time.indexOf(...T08:00)`. `windowLength = dayStart !== -1 ? 13 : 6`.
- **Principles:** Deliberate, explained differences; Assume the safest reading when context is missing.

### weather_code default — no `?? 0` fallback
- **What it is:** The `weather_code` field for the site forecast current hour is read without a `?? 0` fallback — an absent code falls through to "Unknown" rather than "Clear sky" (code 0).
- **Why (the decisions):** Code 0 is "Clear sky", and fallback tiers (GFS S3, NOMADS) do not supply `weather_code` at all. A default of 0 would show a sun icon for a point with no sky observation — a misleading display. "Unknown" is the honest answer.
- **How (the mechanism):** `server/grid/extract.ts:154–156` — comment: "No `?? 0` here: 0 is 'Clear sky', and the fallback tiers do not carry weather_code at all."
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### CCL formula — 125 m per °C of T−Td spread
- **What it is:** Convective Condensation Level is estimated as `max(0, T2m − Td2m) × 125` metres AGL.
- **Why (the decisions):** The 125 m/°C approximation is the standard empirical lift condensation level rule-of-thumb, well-established in aviation meteorology. Both T2m and Td2m must be real numbers — a previous version defaulted to 15/10 °C, manufacturing a confident 625 m cloud base for points with no temperature data.
- **How (the mechanism):** `server/grid/extract.ts:369–370` — `export function computeCCL(t2m, td2m) { return Math.max(0, t2m - td2m) * 125; }`. Called only when `hasTd` is true (both values finite) at `extract.ts:524–552`.
- **Principles:** Deliberate, explained differences; Assume the safest reading when context is missing.
