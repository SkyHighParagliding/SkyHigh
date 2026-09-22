# XC Flight Tracking, Retrieval & Media/Images — Site Logic

---

## Flight Tracker — Auto-start / Auto-stop Gates

### Auto-start: speed threshold
- **What it is:** The tracker transitions from `pre-recording` to `recording` when GPS speed exceeds a configurable km/h value. The pilot sees this as tracking starting automatically as they fly.
- **Why (the decisions):** [inferred] Avoids recording ground handling or walking. The threshold is admin-configurable rather than hard-coded because take-off speeds differ between paragliders and hang gliders.
- **How (the mechanism):** Default `15 km/h`, read from `settings.ftAutoStartSpeed`. Check: `crumb.speed >= autoStartSpeed` in `src/hooks/useFlightTracker.ts:309`.
- **Principles:** Decisions stay with the human; deliberate, explained differences.

### Auto-start: altitude change threshold
- **What it is:** A second trigger for `pre-recording → recording`: a raw altitude change of ≥ N metres from the first buffered fix.
- **Why (the decisions):** [inferred] Catches tow/ridge launches where horizontal speed may be low but the pilot is clearly airborne.
- **How (the mechanism):** Default `20 m`, read from `settings.ftAutoStartAltitude`. Check: `altChange >= autoStartAltitude` (`src/hooks/useFlightTracker.ts:311`). Either speed OR altitude exceeding their threshold triggers start.
- **Principles:** Decisions stay with the human; assume safest reading (better to start late than miss a flight).

### Auto-stop: speed + vertical-speed gate
- **What it is:** Recording stops automatically when both speed and vertical speed are below their thresholds for a sustained duration.
- **Why (the decisions):** [inferred] Prevents runaway recordings after landing; also lets the post-flight retrieval flow start automatically.
- **How (the mechanism):** Defaults: `ftAutoStopSpeed = 3 km/h`, `ftAutoStopVerticalSpeed = 0.5 m/s`. An accumulator (`autoStopCounterRef`) increments by `gpsInterval` each GPS tick where both conditions hold; resets to zero on any movement. Stop fires when counter reaches `ftAutoStopDuration` (default `30 s`). Code: `src/hooks/useFlightTracker.ts:442–448`.
- **Principles:** Decisions stay with the human; refuse rather than improvise (stop cleanly rather than drift on forever).

### Pre-record buffer window
- **What it is:** GPS fixes recorded before the auto-start trigger are kept in a rolling buffer and prepended to the flight once recording begins.
- **Why (the decisions):** [inferred] Ensures the flight track begins at the true launch position, not the moment the speed threshold is crossed mid-launch.
- **How (the mechanism):** Default `15 s`, read from `settings.ftPreRecordBuffer`. Buffer is pruned to `Date.now() - preRecordBuffer * 1000` on every fix (`src/hooks/useFlightTracker.ts:306`).
- **Principles:** Surface, don't hide; assume safest reading (capture full launch geometry).

---

## Flight Tracker — Altitude Smoothing & Barometer Fusion

### EMA alpha for smoothed altitude
- **What it is:** An exponential moving average applied to the fused GPS+barometer altitude before computing vertical speed.
- **Why (the decisions):** [inferred] Raw GPS altitude is noisy; EMA reduces jitter at the cost of some lag. Admin-tunable so different devices (which have different GPS noise floors) can be optimised.
- **How (the mechanism):** Default `0.3` (30% new reading, 70% history). Read from `settings.ftEmaAlpha`. Applied in `computeSmoothedAltitude`: `emaAlpha * fusedAlt + (1 - emaAlpha) * prev` (`src/hooks/useFlightTracker.ts:276–277`).
- **Principles:** Decisions stay with the human; compute in code.

### Vertical-speed EMA alpha
- **What it is:** A second (slower) EMA applied to the instantaneous vertical speed before display.
- **Why (the decisions):** [inferred] Vertical speed is the derivative of altitude and therefore especially noisy; a tighter filter (lower alpha) reduces false positive climb/sink readouts.
- **How (the mechanism):** Default `0.2`. Read from `settings.ftVspeedAlpha`. Applied in `computeSmoothedAltitude`: `vspeedAlpha * rawVspeed + (1 - vspeedAlpha) * prev` (`src/hooks/useFlightTracker.ts:282`). dt values outside `0 < dt < 30 s` are skipped to avoid wild values from GPS gaps.
- **Principles:** Compute in code; assume safest reading.

### Barometer calibration sample count
- **What it is:** The number of matched GPS+barometer reading pairs required before baro fusion is activated.
- **Why (the decisions):** [inferred] A single-sample calibration offset would be noisy; averaging several samples before committing avoids a poor initial offset poisoning all subsequent readings.
- **How (the mechanism):** Default `5 samples`. Read from `settings.ftBaroCalibSamples`. Accumulation in `barometerCalibCountRef` / `barometerCalibSumRef`; offset = mean difference (`src/hooks/useFlightTracker.ts:251–256`). Barometer sensor sampled at `2 Hz` (`src/hooks/useFlightTracker.ts:219`).
- **Principles:** Assume safest reading; refuse rather than improvise (don't fuse until calibration is solid).

### Barometer max divergence gate
- **What it is:** If corrected baro altitude diverges from GPS altitude by more than N metres, baro fusion is suspended and the GPS reading is used alone.
- **Why (the decisions):** [inferred] A large divergence usually means the barometer offset has drifted (e.g., rapid weather change, device moved indoors). It is safer to fall back to GPS than to silently apply a stale offset.
- **How (the mechanism):** Default `120 m`. Read from `settings.ftBaroMaxDivergence`. Guard in `computeSmoothedAltitude`: if `divergence >= baroMaxDivergence`, baro flag is cleared and `fusedAlt = rawGpsAltitude` (`src/hooks/useFlightTracker.ts:263–268`).
- **Principles:** Refuse rather than improvise at the edges; surface, don't hide.

### Barometer fusion weight
- **What it is:** The weighting of the corrected baro reading versus the GPS reading in the fused altitude: `weight * baro + (1 - weight) * gps`.
- **Why (the decisions):** [inferred] Barometers are more accurate for short-term altitude change (lower noise) but GPS is more accurate for absolute altitude; a 70/30 blend favours baro continuity while anchoring to GPS.
- **How (the mechanism):** Default `0.7`. Read from `settings.ftBaroFusionWeight`. Applied only when calibrated and within divergence gate (`src/hooks/useFlightTracker.ts:264`).
- **Principles:** Decisions stay with the human; compute in code.

### Barometric sea-level reference pressure
- **What it is:** The ISA standard atmosphere sea-level pressure used to derive pressure altitude from the device barometer.
- **Why (the decisions):** [inferred] Using a fixed ISA constant rather than a live QNH keeps the implementation offline-capable; the GPS offset calibration corrects for local pressure deviations at launch.
- **How (the mechanism):** Hardcoded `1013.25 hPa` (`src/hooks/useFlightTracker.ts:177`). Formula: `44330 * (1 - (P/1013.25)^(1/5.255))` (`src/hooks/useFlightTracker.ts:223`).
- **Principles:** One source of truth per rule; compute in code.

---

## Flight Tracker — GPS & Sync Intervals

### GPS watchPosition interval
- **What it is:** The `maximumAge` hint passed to the browser's `watchPosition` API — effectively the minimum GPS refresh interval.
- **Why (the decisions):** [inferred] Shorter intervals increase battery drain and data volume; 3 s is a common flight-instrument refresh rate that provides smooth tracks without excessive resource use.
- **How (the mechanism):** Default `3 s`, read from `settings.ftGpsInterval`. Used as `maximumAge: gpsInterval * 1000` and `timeout: 10000` (`src/hooks/useFlightTracker.ts:593–598`).
- **Principles:** Decisions stay with the human.

### Server sync interval
- **What it is:** How often the client batches unsent breadcrumbs and pushes them to `/api/flights/:id/breadcrumbs`.
- **Why (the decisions):** [inferred] Continuous sync would flood the server and drain battery; 10 s provides near-real-time live tracking for other pilots without excessive overhead.
- **How (the mechanism):** Fixed `10 s` (`setInterval(syncToServer, 10000)`) — `src/hooks/useFlightTracker.ts:603`. An additional sync fires immediately on any `online` event after an offline period (`src/hooks/useFlightTracker.ts:911–914`).
- **Principles:** One source of truth per rule; surface, don't hide (sync on reconnect).

### Live-stats UI flush interval
- **What it is:** The rate at which live altitude/speed/distance values are pushed into React state (and therefore re-rendered on screen).
- **Why (the decisions):** [inferred] React state updates trigger a re-render; updating on every GPS fix (every 3 s) would be fine but a dedicated 3 s stats timer ensures the elapsed-time counter stays accurate even in GPS gaps.
- **How (the mechanism):** Fixed `3 s` stats interval (`src/hooks/useFlightTracker.ts:605–613`). Breadcrumb batches are flushed via a separate `crumbFlushInterval` (default `3 s`, read from `settings.ftCrumbFlushInterval`, minimum 1 s).
- **Principles:** Compute in code.

### Breadcrumb UI window size
- **What it is:** The maximum number of breadcrumbs held in React state for map rendering; older crumbs are dropped from the window when it fills.
- **Why (the decisions):** [inferred] Keeping every crumb in React state for a long flight would cause unbounded memory growth; the full trail is stored separately in `fullTrailRef` for statistics and export. The map only needs a recent window.
- **How (the mechanism):** Default `200`, minimum `20`. Read from `settings.ftCrumbWindowSize`. Applied in the flush callback: `combined.slice(combined.length - crumbWindowSize)` (`src/hooks/useFlightTracker.ts:388–391`).
- **Principles:** Separate facts from judgements (full trail for export; windowed trail for display).

### Live-pilot position broadcast interval
- **What it is:** How often a recording pilot posts their position to `/api/flights/position` and fetches the positions of other live pilots.
- **Why (the decisions):** [inferred] 5 s keeps the live-pilot map overlay responsive (close to real-time) without saturating the server during a busy flying day.
- **How (the mechanism):** Fixed `5 s` (`setInterval(tick, 5000)`) — `src/hooks/useFlightTracker.ts:883`.
- **Principles:** One source of truth per rule.

---

## Flight Tracker — Live-Pilot Position TTL (Server Side)

### Active pilot stale timeout
- **What it is:** How long a pilot's in-memory position entry survives without an update before it is removed from the live-pilots map shown to other pilots.
- **Why (the decisions):** [inferred] Removes pilots who crashed or went offline without signalling. The client broadcasts every 5 s so any value >5 s is safe; 60 s provides generous tolerance for brief connectivity loss.
- **How (the mechanism):** Default `60 s`, read from `getSettingNum("ftActiveTtl", 60) * 1000`. Check in `pruneStalePositions()` — `server/services/realFlightService.ts:13–14`. Pruning runs on every `getLivePilots()` call.
- **Principles:** Assume safest reading; refuse rather than improvise.

### Landed-pilot stale timeout
- **What it is:** How long a landed pilot's marker stays visible on other pilots' maps after they signal landing.
- **Why (the decisions):** [inferred] Landed pilots are relevant to the retrieval board; keeping them visible for ~8 hours covers the full flying day without manual cleanup.
- **How (the mechanism):** Default `480 min` (8 h), read from `getSettingNum("ftLandedTtl", 480) * 60 * 1000` — `server/services/realFlightService.ts:14`. The `markLanded()` method sets `landed = true` and `landedAt = Date.now()`.
- **Principles:** Decisions stay with the human; surface, don't hide.

### Flight list query cap
- **What it is:** Maximum number of flights returned per pilot when listing or exporting flight history.
- **Why (the decisions):** [inferred] Prevents unbounded query results for prolific pilots or corrupted sessions.
- **How (the mechanism):** Hard-coded `LIMIT 500` in `listFlights()` and `listFlightsWithLanding()` — `server/services/realFlightService.ts:188, 204, 213`.
- **Principles:** Refuse rather than improvise at the edges.

### GPX export minimum breadcrumb count
- **What it is:** A flight track is omitted from the GPX export if it has fewer than 2 breadcrumbs.
- **Why (the decisions):** [inferred] A single-point track is not a valid GPX `trkseg` and would confuse GPS software.
- **How (the mechanism):** Guard `if (crumbs.length < 2) continue` in the GPX serialiser — `server/routes/flights.ts:253`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Retrieval System — Scope & Lifecycle

### Same-day scope for retrievals
- **What it is:** All retrieval queries (read, claim, complete, broadcast) are scoped to the current calendar day (`date_trunc('day', NOW())`). Yesterday's retrievals are invisible to drivers.
- **Why (the decisions):** [inferred] Retrieval is a same-day service; surfacing old retrievals would confuse drivers and pollute the board. Old open retrievals are auto-completed when a new one is created for the same pilot.
- **How (the mechanism):** Constant `TODAY_SCOPE = "AND \"createdAt\" >= date_trunc('day', NOW())"` appended to every retrieval SQL query — `server/services/realRetrievalService.ts:14`. Old retrievals of the same pilot are force-completed at `requestRetrieval` and `createRetrievalForPilot`.
- **Principles:** One source of truth per rule; deliberate, explained differences.

### Duplicate retrieval guard
- **What it is:** A pilot cannot create a second active retrieval if one is already `awaiting` or `claimed` today.
- **Why (the decisions):** [inferred] Without this guard a pilot could flood the board with duplicate requests, confusing drivers.
- **How (the mechanism):** Transactional check — `SELECT id FROM retrievals WHERE "pilotId" = $1 AND status IN ('awaiting', 'claimed') AND createdAt >= date_trunc('day', NOW())` — before any `INSERT`; returns `{ alreadyExists: true }` if hit (`server/services/realRetrievalService.ts:213–219`).
- **Principles:** Refuse rather than improvise; one source of truth.

### Unclaim restriction: driver-only
- **What it is:** Only the driver who claimed a retrieval can unclaim it; other drivers receive a 403.
- **Why (the decisions):** [inferred] Prevents a race condition where driver B unclaims a retrieval that driver A is en route to collect.
- **How (the mechanism):** `if (existing.driverId !== caller.id) return { ok: false, … status: 403 }` — `server/services/realRetrievalService.ts:310–312`.
- **Principles:** Decisions stay with the human; refuse rather than improvise at the edges.

### ETA recalc throttle
- **What it is:** OSRM ETAs for a driver's claimed pilots are only recalculated at most once every 15 seconds, regardless of how often the driver updates their position.
- **Why (the decisions):** [inferred] Each ETA recalc fires N sequential OSRM HTTP requests (one per claimed pilot). Throttling prevents an active driver from triggering hundreds of expensive routing calls per minute.
- **How (the mechanism):** `driverEtaLastCalc` map tracks last recalc timestamp per driver. Guard: `if (Date.now() - lastCalc > 15000)` — `server/services/realRetrievalService.ts:381–384`. An `activeRecalcs` set prevents concurrent recalcs for the same driver.
- **Principles:** Refuse rather than improvise (rate-limit external calls).

### In-flight pilot position update interval
- **What it is:** During active retrieval (pilot has landed and requested pickup), the client sends its GPS position to `/api/retrievals/pilot-position` every 60 seconds.
- **Why (the decisions):** [inferred] The driver needs reasonably fresh position data to route to the pilot; 60 s is coarse enough to be battery-friendly but frequent enough to notice if the pilot walked to a different pickup point.
- **How (the mechanism):** `setInterval(sendRetrievalPos, 60000)` — `src/hooks/useFlightTracker.ts:754`. An identical 60 s interval is used in `useRetrievalStatus` for the non-tracker path (`src/hooks/useRetrievalStatus.ts:235`). During active flight with in-flight retrieval requested, position is sent every `15 s` (`src/hooks/useRetrievalStatus.ts:68`).
- **Principles:** Decisions stay with the human; surface, don't hide.

### Driver position in-memory TTL
- **What it is:** How long a driver's live position entry (used for the real-time driver-on-map feature) survives in the server's in-memory map without an update.
- **Why (the decisions):** [inferred] A driver who closes the app should not appear indefinitely on pilots' maps. 8 hours covers a full flying day.
- **How (the mechanism):** `DRIVER_POS_TTL_MS = 8 * 60 * 60 * 1000` — `server/services/realRetrievalService.ts:17`. Filter applied in `getDriverPositions()` and `getDutyPilotPosition()` (`lines 396, 453`).
- **Principles:** Assume safest reading; surface, don't hide.

---

## Retrieval SSE / Fallback Polling

### SSE ticket TTL
- **What it is:** A one-time short-lived token used to authenticate the EventSource connection without putting a bearer token in the URL query string.
- **Why (the decisions):** Bearer tokens in URLs are logged by servers and proxies; tickets are exchanged over an authenticated POST, then consumed on first use, avoiding persistent exposure.
- **How (the mechanism):** `TICKET_TTL_MS = 30_000` (30 s) — `server/routes/retrievals.ts:22`. Tickets are single-use (deleted on redemption, line 81). A cleanup interval runs every 15 s to expire unclaimed tickets (`lines 34–39`).
- **Principles:** Assume safest reading; refuse rather than improvise (expired tickets are rejected, not accepted).

### SSE heartbeat interval
- **What it is:** A comment-only SSE frame sent to every connected client to prevent proxy and load-balancer timeouts.
- **Why (the decisions):** [inferred] Many reverse proxies close idle HTTP connections after 30–60 s; regular heartbeats keep the SSE stream alive.
- **How (the mechanism):** `setInterval(() => res.write(': heartbeat\n\n'), 30000)` — `server/routes/retrievals.ts:111`.
- **Principles:** Refuse rather than improvise at the edges.

### SSE broadcast debounce
- **What it is:** Multiple rapid state changes (e.g., claim + ETA recalc) are coalesced into a single broadcast 250 ms after the last change.
- **Why (the decisions):** [inferred] Without debounce, a single driver position update could trigger two sequential DB reads and two fan-outs to all SSE clients.
- **How (the mechanism):** `broadcastUpdate()` sets a 250 ms `setTimeout`; if called again before it fires the existing timer is reused — `server/services/realRetrievalService.ts:558–562`.
- **Principles:** Compute in code; one source of truth per rule.

### SSE fallback polling intervals
- **What it is:** If the SSE connection fails, the client falls back to polling the retrieval status endpoint.
- **Why (the decisions):** [inferred] SSE can fail behind certain corporate proxies or intermittently. A polling fallback ensures pilots always know their retrieval status.
- **How (the mechanism):** Demo path: `setInterval(fetchStatus, 3000)`. Real-user path: `setInterval(fetchStatus, 5000)` — `src/hooks/useRetrievalStatus.ts:162–167, 200–205`. Demo path is faster because demo sessions are more likely to face connectivity quirks.
- **Principles:** Assume safest reading; surface, don't hide.

---

## Retrieval — Satellite Tracker Integration

### Satellite poll interval
- **What it is:** How often the server queries Garmin/SPOT/ZOLEO APIs for pilots whose phone position is stale.
- **Why (the decisions):** [inferred] Satellite trackers typically update every 2–5 minutes; polling more often wastes API quota. Polling less often risks stale positions on the retrieval board.
- **How (the mechanism):** `SAT_POLL_INTERVAL_MS = 120_000` (2 min) — `server/services/realRetrievalService.ts:109`. A `satPollRunning` flag prevents overlapping polls.
- **Principles:** One source of truth per rule.

### Phone-staleness threshold before satellite fallback
- **What it is:** The minimum age of a pilot's last phone-position update before the satellite tracker is consulted.
- **Why (the decisions):** [inferred] If the phone is actively reporting, there is no need to call external tracker APIs; the satellite path is only needed when the phone goes silent (out of mobile coverage, battery dead, etc.).
- **How (the mechanism):** Default `90 s`, read from `getSettingNum("ftPhoneStaleThreshold", 90) * 1000` — `server/services/realRetrievalService.ts:146`. If `timeSinceUpdate < phoneStaleMs` AND position source is not already `'satellite'`, the pilot is skipped.
- **Principles:** Decisions stay with the human; assume safest reading.

### Satellite fix maximum age
- **What it is:** A satellite fix older than N minutes is rejected and not written to the retrieval record.
- **Why (the decisions):** [inferred] An old fix (e.g., from before the pilot launched) could show the pilot at the wrong location; the threshold ensures only recent GPS data is trusted.
- **How (the mechanism):** Default `15 min`, read from `getSettingNum("ftSatMaxFixAge", 15) * 60_000` — `server/services/realRetrievalService.ts:162`. Fix timestamp is also compared to the existing `pilotUpdatedAt`; a fix older than the current record is discarded (`line 165`).
- **Principles:** Assume safest reading; refuse rather than improvise.

### Best-fix selection (multi-device)
- **What it is:** If a pilot has multiple satellite trackers configured, all are fetched in parallel and the most recent valid fix wins.
- **Why (the decisions):** [inferred] Some pilots carry both a SPOT and a Garmin; the most recent fix is the most accurate regardless of source.
- **How (the mechanism):** `Promise.allSettled` across all configured trackers; iterate results and keep the fix with the highest `timestampMs` — `server/services/realRetrievalService.ts:97–107`.
- **Principles:** Assume safest reading; surface, don't hide.

### SPOT feed fetch timeout
- **What it is:** HTTP request timeout for calls to the SPOT findmespot.com API.
- **Why (the decisions):** [inferred] External API calls must not block indefinitely; 15 s is generous enough for slow connections without hanging the satellite-poll loop.
- **How (the mechanism):** `FETCH_TIMEOUT_MS = 15000` — `server/utils/spotTracker.ts:20`. Implemented via `AbortController` (`lines 35–40`). On `AbortError` the fetch returns `null` (safe default — no position update).
- **Principles:** Refuse rather than improvise at the edges.

### SPOT emergency message types
- **What it is:** Two SPOT message types are treated as emergency signals and set `inEmergency: true` on the parsed position.
- **Why (the decisions):** [inferred] The SPOT API does not expose a dedicated emergency flag; `SOS` and `NEWMOVEMENT` are the closest equivalents in the feed's `messageType` field.
- **How (the mechanism):** `inEmergency: messageType === "SOS" || messageType === "NEWMOVEMENT"` — `server/utils/spotTracker.ts:92`.
- **Principles:** Assume safest reading; surface, don't hide.

---

## Retrieval — OSRM Routing

### OSRM public endpoint
- **What it is:** The routing server used for ETA calculations. No private instance is run.
- **Why (the decisions):** [inferred] Running a local OSRM instance requires significant infrastructure; the public demo server is free and adequate for the low request rate of a single club. No fallback is attempted if it fails — the caller receives `null` and the previous ETA is kept.
- **How (the mechanism):** `https://router.project-osrm.org/route/v1/driving/...` — `server/utils/osrm.ts:60`. `overview=false` reduces response size (no geometry needed, only distance/duration).
- **Principles:** Refuse rather than improvise (return null on failure rather than invent an ETA).

### OSRM request timeout
- **What it is:** HTTP timeout for routing requests.
- **Why (the mechanisms):** [inferred] Prevents the ETA recalc loop from stalling for long if the public OSRM server is slow.
- **How (the mechanism):** `setTimeout(() => controller.abort(), 10000)` — `server/utils/osrm.ts:58`. Slow-response warning logged above `2000 ms` (`line 79`).
- **Principles:** Refuse rather than improvise at the edges.

### OSRM route cache TTL and size cap
- **What it is:** Route results are cached in memory for 30 s; the cache is capped at 200 entries.
- **Why (the decisions):** [inferred] A driver moving between position updates will re-request routes for nearby pilot positions repeatedly. Short-term caching de-duplicates these within a position update cycle. 30 s is short enough to avoid serving stale routes after a driver moves significantly.
- **How (the mechanism):** `CACHE_TTL_MS = 30_000` — `server/utils/osrm.ts:12`. On every write, `pruneCache()` removes expired entries and LRU-evicts down to 200 if necessary (`lines 18–29`).
- **Principles:** One source of truth per rule; compute in code.

### OSRM coordinate precision for cache key
- **What it is:** Route cache keys are rounded to 4 decimal places (≈11 m precision) for both origin and destination.
- **Why (the decisions):** [inferred] Exact float equality would produce cache misses for every tiny GPS jitter. 4 decimal places is below typical GPS error so cache hits are maximised without meaningful route-accuracy loss.
- **How (the mechanism):** `from.lat.toFixed(4)` etc. in `cacheKey()` — `server/utils/osrm.ts:15`.
- **Principles:** Compute in code; deliberate, explained differences.

### Sequential ETA accumulation + haversine fallback
- **What it is:** ETAs for multiple claimed pilots are computed as a cumulative sum (pick up pilot 1, then drive to pilot 2, etc.). If OSRM fails for a segment, a haversine fallback assumes 60 km/h straight-line.
- **Why (the decisions):** [inferred] Sequential routing reflects real pickup logistics. The haversine fallback at 60 km/h ensures an ETA is always shown rather than blank, even if OSRM is unavailable.
- **How (the mechanism):** `calculateSequentialETAs()` — `server/utils/osrm.ts:97–126`. On null route result: `distKm / 60 * 60` minutes (`line 120`).
- **Principles:** Assume safest reading (show an approximate ETA rather than nothing); surface, don't hide.

---

## Airspace Proximity Alerts

### Proximity alert threshold options
- **What it is:** The set of altitude buffers (in feet) that a pilot can cycle between for airspace proximity warnings. The selected value is persisted per pilot.
- **Why (the decisions):** [inferred] Different pilots want different warning distances; allowing a small fixed set avoids UI complexity while covering the common range (50–250 ft inside a boundary).
- **How (the mechanism):** `THRESHOLD_OPTIONS = [50, 100, 150, 200, 250]` (feet) — `src/hooks/useProximityAlerts.ts:3`. Default on first use is `250 ft` (`line 37`). Persisted in `localStorage` keyed by pilot ID.
- **Principles:** Decisions stay with the human; one source of truth per rule.

### Alert cooldown period
- **What it is:** After an airspace-proximity beep + haptic fires, further beeps are suppressed for 5 seconds (even if the pilot re-enters another sector).
- **Why (the decisions):** [inferred] Rapid-fire alerts during boundary hugging would be distracting and dangerous in flight; 5 s is long enough to avoid repetition without masking a genuine new boundary.
- **How (the mechanism):** `proximityAlertCooldownRef` set true on alert; reset via `setTimeout(..., 5000)` — `src/hooks/useProximityAlerts.ts:65–68`.
- **Principles:** Assume safest reading; surface, don't hide (alert once, let pilot respond).

### Alert audio parameters
- **What it is:** The frequency and duration of the proximity warning beep.
- **Why (the decisions):** [inferred] 880 Hz is the A5 note — audible over wind noise without being excessively harsh. 0.15 s is short enough not to interrupt radio calls.
- **How (the mechanism):** `ALERT_BEEP_FREQ = 880 Hz`, `ALERT_BEEP_DURATION = 0.15 s` — `src/hooks/useProximityAlerts.ts:4–5`. Gain ramps to 0.01 via `exponentialRampToValueAtTime` to avoid click artefacts.
- **Principles:** Deliberate, explained differences.

### Default disabled airspace types
- **What it is:** Several airspace categories are hidden by default when the pilot first opens the XC map.
- **Why (the decisions):** [inferred] Types like FIR, OCA, GLIDING_SECTOR and WARNING cover enormous areas and are not operationally relevant to low-level free-flight. Showing them by default would fill the map with irrelevant boundaries.
- **How (the mechanism):** `DEFAULT_DISABLED_AIRSPACE = new Set(['RESTRICTED', 'DANGER', 'PROHIBITED', 'OTHER', 'ALERT', 'WARNING', 'GLIDING_SECTOR', 'WAVE_WINDOW', 'FIR', 'OCA', 'PROTECTED', 'TIZ'])` — `src/hooks/useXCMapState.ts:21–25`.
- **Principles:** Decisions stay with the human; assume safest reading.

### Altitude slider range
- **What it is:** The altitude filter for airspace layer visibility spans 0 to 10,000 feet in 500-foot steps.
- **Why (the decisions):** [inferred] Australian free-flight sites rarely go above 10,000 ft; 500 ft steps give adequate resolution without overwhelming the slider.
- **How (the mechanism):** `ALT_MIN = 0`, `ALT_MAX = 10000`, `ALT_STEP = 500` (feet) — `src/pages/XCMaps.tsx:18–20`.
- **Principles:** Decisions stay with the human.

---

## Offline Tile Caching

### Default tile cache radius, zoom range, and layers
- **What it is:** When a pilot selects a site with flight tracking enabled, tiles are proactively fetched and stored in the Cache API for offline use.
- **Why (the decisions):** [inferred] XC sites are often in areas with poor mobile coverage; pre-caching tiles ensures the map works after take-off.
- **How (the mechanism):** Defaults: radius `50 km`, zoom min `8`, zoom max `13`, layers `["streets"]` — `src/hooks/useXCMapState.ts:281–285`. All four values are admin-overridable via `settings.ftOfflineTileRadius`, `ftOfflineZoomMin`, `ftOfflineZoomMax`, `ftOfflineLayers`. Caching is triggered on every `selectedSite` change (not once per session).
- **Principles:** Decisions stay with the human; assume safest reading (pre-cache generously).

### Tile fetch concurrency
- **What it is:** Tile pre-fetches are batched 6 at a time to avoid overwhelming the tile server or the browser's connection pool.
- **Why (the decisions):** [inferred] Browsers typically allow 6 concurrent requests per origin; batching at 6 saturates the connection pool without exceeding it.
- **How (the mechanism):** `BATCH_SIZE = 6` — `src/lib/tileCache.ts:110`. Already-cached tiles are skipped via `cache.match(url)` before fetching.
- **Principles:** Refuse rather than improvise (don't flood external tile servers).

---

## Map Messages

### Message purge window
- **What it is:** Map messages (pilot-to-pilot in-flight messages) are automatically deleted from the database 24 hours after they are created.
- **Why (the decisions):** [inferred] Map messages are tactical, same-day communications; retaining them indefinitely would grow the table without purpose and could be a privacy concern.
- **How (the mechanism):** `DELETE FROM map_messages WHERE "createdAt" < NOW() - INTERVAL '24 hours'` — `server/services/realMessageService.ts:11`. Purge runs at the start of every `getInbox()` call.
- **Principles:** One source of truth per rule; assume safest reading (auto-expire rather than accumulate).

### Message length limit
- **What it is:** Messages are capped at 500 characters.
- **Why (the decisions):** [inferred] These are in-flight position/status messages; brevity is a safety feature. Long messages would delay reading in the cockpit.
- **How (the mechanism):** `MAX_MESSAGE_LENGTH = 500` in `server/constants.ts:26`. Enforced server-side in `sendMessage()` (`server/services/realMessageService.ts:28–30`). Error message includes the limit.
- **Principles:** Refuse rather than improvise at the edges; one source of truth per rule.

### Inbox query cap
- **What it is:** The inbox query returns at most 50 unread messages and 20 thumbs-up/down acknowledgements.
- **Why (the decisions):** [inferred] A pilot who accumulates dozens of unread messages during a flight would be overwhelmed; 50 is a practical upper bound for in-flight use.
- **How (the mechanism):** `LIMIT 50` for messages, `LIMIT 20` for thumbs — `server/services/realMessageService.ts:70, 79`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Image Processing — Variants & Size Constraints

### Hero/wide image target size
- **What it is:** All uploaded hero and site images are resized to 1920×1080 px with a 550 KB target file size.
- **Why (the decisions):** [inferred] 1920×1080 is the standard HD display resolution. 550 KB keeps page load times reasonable for users on mobile data.
- **How (the mechanism):** `resizeAndCompress(buffer, 1920, 1080, 550)` — `server/routes/ai.ts:506, 591, 804`. Initial JPEG quality is 90; decremented by 10 per iteration while `length > maxSizeKB * 1024 && quality > 20` (`ai.ts:452–458`).
- **Principles:** Deliberate, explained differences; compute in code.

### Site banner image target size
- **What it is:** Banner images (site headers) are cropped to 1920×600 px and capped at 550 KB.
- **Why (the decisions):** [inferred] Wide-format banners at 600 px height are a standard web CMS convention. The 550 KB limit matches the hero limit for consistent network budgets.
- **How (the mechanism):** `resize(1920, 600, { fit: "fill" })` + quality loop down to floor 20 — `server/routes/ai.ts:638–648`. Crop top is constrained to `imgHeight - 600` to prevent negative extraction.
- **Principles:** Deliberate, explained differences.

### Slider image variants
- **What it is:** Each gallery image generates three fixed-size variants: 600×400 (landscape large), 450×300 (landscape small), 267×400 (portrait).
- **Why (the decisions):** [inferred] Different layout contexts (wide slider, thumbnail grid, portrait mobile) require different aspect ratios; generating all three at upload time avoids on-the-fly resizing at serve time.
- **How (the mechanism):** `SLIDER_SIZES` constant — `server/routes/ai.ts:463–467`. Each variant is capped at 120 KB via `resizeAndCompress`. Watermark is applied to each variant separately.
- **Principles:** Deliberate, explained differences; one source of truth per rule.

### Content image target size
- **What it is:** Rich-text embedded images are resized to 1200×800 px, capped at 300 KB.
- **Why (the decisions):** [inferred] Content images appear within article text columns; 1200 px is wide enough for any column width, 800 px provides adequate height. The 300 KB limit is tighter than hero images because content pages may embed multiple images.
- **How (the mechanism):** `resizeAndCompress(buffer, 1200, 800, 300)` — `server/routes/ai.ts:769, 786`. `StorageKey.content(filename)` routes to `images/content/`.
- **Principles:** Deliberate, explained differences.

### Contact photo size
- **What it is:** Committee/officer contact photos are cropped to a 300×300 px square.
- **Why (the decisions):** [inferred] Profile thumbnails are always rendered as small squares; forcing a square at upload ensures no aspect-ratio distortion in the UI.
- **How (the mechanism):** `resize(300, 300, { fit: "cover", position: "center" })` at `quality: 90` — `server/services/photoService.ts:16–17`. EXIF data is stripped automatically by Sharp's `.rotate()` call.
- **Principles:** Deliberate, explained differences.

### Crop minimum dimension guard
- **What it is:** A crop region is silently ignored if either the resulting width or height would be ≤ 10 px.
- **Why (the decisions):** [inferred] Sub-10 px crops are almost certainly a client rounding error; applying them would produce unusable images. Sharp would likely throw an error.
- **How (the mechanism):** `if (width > 10 && height > 10)` before every `.extract()` call — `server/routes/ai.ts:439, 706`.
- **Principles:** Refuse rather than improvise at the edges.

### Crop-single target dimension guard
- **What it is:** The `/crop-single` route validates that requested output dimensions are between 10 and 4000 px in each axis.
- **Why (the decisions):** [inferred] Without bounds, a caller could request a 1×1 or 100000×100000 output; the lower bound prevents unusable images, the upper bound prevents memory exhaustion.
- **How (the mechanism):** `if (!isFinite(tw) || !isFinite(th) || tw < 10 || th < 10 || tw > 4000 || th > 4000)` — `server/routes/ai.ts:685`.
- **Principles:** Refuse rather than improvise at the edges.

### Adaptive max KB for crop-single
- **What it is:** The file-size budget for `/crop-single` scales with the requested output dimensions.
- **Why (the decisions):** [inferred] A 500×500 thumbnail and a 1920×1080 hero need different size budgets; using the hero budget for thumbnails would waste storage, and using the thumbnail budget for heroes would under-compress.
- **How (the mechanism):** `maxKB = (tw <= 500 && th <= 500) ? 120 : (tw <= 1000 ? 300 : 550)` — `server/routes/ai.ts:711`.
- **Principles:** Compute in code; deliberate, explained differences.

### Screenshot compress-to-fit
- **What it is:** Screenshots (e.g., from the XC map) are compressed at quality 90, stepping down by 10 per iteration until the file is below 800 KB or quality hits the floor of 30.
- **Why (the decisions):** [inferred] Screenshots are variable-size; a fixed resolution would lose the original dimensions. The 800 KB cap prevents huge PNGs from being stored. Floor 30 avoids visually unacceptable artefacts.
- **How (the mechanism):** `while (result.length > 800 * 1024 && quality > 30) { quality -= 10 }` — `server/routes/ai.ts:552–555`.
- **Principles:** Compute in code; refuse rather than improvise at the edges.

### Bulk upload limit
- **What it is:** The maximum number of hero images that can be uploaded in a single batch operation.
- **Why (the decisions):** [inferred] Without a cap a single request could upload hundreds of images, exhausting server memory (all files are buffered in memory via `multer.memoryStorage()`). The limit is admin-configurable to accommodate club photography days.
- **How (the mechanism):** Default `20`, read from `settings.bulkUploadLimit`, clamped `Math.min(999, Math.max(1, parseInt(...) || 20))` — `server/routes/ai.ts:820–823`. Hard upper bound in multer: `upload.array("images", 999)` (`line 813`).
- **Principles:** Decisions stay with the human; refuse rather than improvise at the edges.

### Allowed image prefixes for crop-single
- **What it is:** The `prefix` parameter in `/crop-single` is validated against a whitelist before being used to derive the storage path.
- **Why (the decisions):** [inferred] Without validation a caller could supply an arbitrary path prefix, potentially writing files to unexpected storage locations.
- **How (the mechanism):** `ALLOWED_PREFIXES = ["banner", "slider-lg", "slider-sm", "slider-portrait", "hero", "content"]` — `server/routes/ai.ts:673`. Returns 400 if prefix is not in the list.
- **Principles:** Refuse rather than improvise at the edges; one source of truth per rule.

### Multer upload size limit (AI routes)
- **What it is:** The per-request file size cap for image enhancement uploads.
- **Why (the decisions):** [inferred] Gemini image generation can handle large inputs but memory buffering of very large uploads risks OOM. 20 MB covers RAW-converted JPEGs from modern phones while excluding absurdly large files.
- **How (the mechanism):** `multer({ limits: { fileSize: 20 * 1024 * 1024 } })` — `server/routes/ai.ts:68`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Image Processing — Watermarking

### Default watermark position
- **What it is:** When no position is specified or an unrecognised position string is passed, the watermark defaults to `"bottom-right"`.
- **Why (the decisions):** [inferred] Bottom-right is the conventional photographer credit location and avoids obscuring the main subject.
- **How (the mechanism):** `normalizePosition()` returns `"bottom-right"` for any unrecognised input — `server/utils/watermark.ts:18–23`.
- **Principles:** Assume safest reading; one source of truth per rule.

### Default watermark size (percent)
- **What it is:** The default text size as a percentage of image width.
- **Why (the decisions):** [inferred] 10% of width scales proportionally across both thumbnails and large images, keeping the watermark legible without being obtrusive.
- **How (the mechanism):** `DEFAULT_SIZE_PERCENT = 10` — `server/utils/watermark.ts:3`. Clamped to `Math.max(5, Math.min(50, sizePercent))` so callers cannot specify a value outside 5–50% (`line 44`).
- **Principles:** Decisions stay with the human; refuse rather than improvise at the edges.

### Watermark minimum image dimensions
- **What it is:** Images smaller than 100×60 px receive no watermark.
- **Why (the decisions):** [inferred] Tiny images (e.g., icons) have no room for readable text; applying a watermark would produce noise.
- **How (the mechanism):** `if (imgW < 100 || imgH < 60) return imageBuffer` — `server/utils/watermark.ts:40–42`.
- **Principles:** Refuse rather than improvise at the edges.

### Watermark luminance-adaptive colour
- **What it is:** The text and shadow colours automatically switch between white-on-dark and black-on-light based on the average luminance of the image region where the watermark will be placed.
- **Why (the decisions):** [inferred] A white watermark on a pale sky and a black watermark on dark terrain would both be invisible; adaptive contrast ensures readability.
- **How (the mechanism):** A 40% wide × 20% tall sample region at the watermark corner is extracted, its average luminance computed as `0.299R + 0.587G + 0.114B` per pixel. Threshold `avgLuminance < 128` → white text, dark shadow; ≥128 → black text, light shadow (`server/utils/watermark.ts:54–79`).
- **Principles:** Compute in code; deliberate, explained differences.

### Watermark text opacity
- **What it is:** The watermark text is rendered at 85% opacity (not 100%).
- **Why (the decisions):** [inferred] Full opacity can be jarring; 85% softens the overlay without compromising legibility.
- **How (the mechanism):** `fill-opacity="0.85"` on the SVG text element — `server/utils/watermark.ts:121`. Shadow opacity is 50% for dark backgrounds, 35% for light backgrounds (`lines 79–80`).
- **Principles:** Deliberate, explained differences.

### Rotate-and-crop JPEG quality
- **What it is:** When an image is rotated before enhancement or processing, the intermediate JPEG is recompressed at quality 95.
- **Why (the decisions):** [inferred] 95 is high enough to preserve detail through re-encoding while still producing a valid JPEG. Lossless rotation is not used because the crop step requires re-encoding anyway.
- **How (the mechanism):** `.jpeg({ quality: 95 })` in `rotateAndCrop()` — `server/routes/ai.ts:63`.
- **Principles:** Assume safest reading (prefer quality over file size in an intermediate step).

---

## Image Submissions (Public Upload)

### Submission max file size
- **What it is:** Public (unauthenticated) image submissions are capped at 15 MB per file.
- **Why (the decisions):** [inferred] Larger than the AI route (20 MB) because submissions are original files; however a hard cap is needed to prevent DoS via huge uploads.
- **How (the mechanism):** `MAX_FILE_SIZE = 15 * 1024 * 1024` — `server/routes/submissions.ts:43`. Enforced in multer `limits.fileSize`. Batch cap: `files: 10` per request.
- **Principles:** Refuse rather than improvise at the edges.

### Submission storage target (1 MB)
- **What it is:** Submitted images are recompressed to under 1 MB before storage; images already under 1 MB that don't need resizing are stored as-is.
- **Why (the decisions):** [inferred] Storing original 15 MB files would consume R2 quota rapidly for a public submission flow; 1 MB is a practical cap that preserves sufficient quality for display.
- **How (the mechanism):** `MAX_IMAGE_BYTES = 1024 * 1024` (`server/constants.ts:25`). Compression loop: `quality = 85`, step down by 10 while `length > MAX_IMAGE_BYTES && quality > 30`, using mozjpeg — `server/routes/submissions.ts:88–97`. Images are also downsampled if either dimension exceeds 3840 px (`server/routes/submissions.ts:75–85`).
- **Principles:** Refuse rather than improvise at the edges; one source of truth per rule.

### Magic-bytes content type verification
- **What it is:** Uploaded files are validated against known image file signatures (magic bytes), not just the MIME type reported by the browser.
- **Why (the decisions):** Browsers report the MIME type from the file extension; a renamed `.exe` would pass a MIME-only check. Magic-byte validation confirms the actual file format.
- **How (the mechanism):** `detectImageType()` checks leading bytes for JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`52 49 46 46`), and HEIC/HEIF (`66 74 79 70` at offset 4) — `server/routes/submissions.ts:61–70`. Mismatches are rejected before any processing.
- **Principles:** Refuse rather than improvise at the edges; assume safest reading.

### AI content-safety fallback to quarantine
- **What it is:** If Gemini is unavailable or returns an error during content moderation, the submitted image is quarantined for manual review rather than being accepted or rejected.
- **Why (the decisions):** Accepting potentially unsafe content because the moderation API is down would be worse than a false rejection; quarantine is the conservative path.
- **How (the mechanism):** Both "no API key" and "safety check exception" paths return `{ safe: false, flag: "review", note: "..." }` — `server/routes/submissions.ts:118, 156–159`. Quarantined images are stored at `submissions/quarantine/` and status is set to `'quarantine'` in the database.
- **Principles:** Assume safest reading; refuse rather than improvise at the edges.

---

## Storage — R2 / Local Fallback

### R2 retry policy
- **What it is:** Failed R2 upload/delete operations are retried up to 3 times with exponential back-off (1 s, 2 s, 4 s).
- **Why (the decisions):** [inferred] Transient network blips and R2 5xx errors are common in distributed storage; retrying avoids surfacing transient failures as user-visible errors.
- **How (the mechanism):** `withRetryR2(fn, context, retries = 3)` — `server/storage.ts:35–49`. 4xx errors (except 429) are not retried: `if (httpStatusCode < 500 && httpStatusCode !== 429) throw err` (`line 42`).
- **Principles:** Assume safest reading; refuse rather than improvise (no retry on client errors).

### R2 file fetch retry policy
- **What it is:** HTTP fetches of R2-hosted files (e.g., re-watermarking an existing image) are retried up to 3 times with the same exponential back-off.
- **Why (the decisions):** [inferred] Same reasoning as upload retries; R2 object downloads can fail transiently.
- **How (the mechanism):** 3 attempts with `1000 * 2^attempt` ms delay inside `readFile()` — `server/storage.ts:114–129`. `AbortSignal.timeout(15000)` limits each attempt.
- **Principles:** Assume safest reading.

### R2 request/connection timeouts
- **What it is:** The S3 client is configured with 15 s request timeout and 10 s connection timeout.
- **Why (the decisions):** [inferred] Railway's egress to Cloudflare R2 is typically sub-second; generous timeouts allow for occasional congestion without letting a single upload stall indefinitely.
- **How (the mechanism):** `requestHandler: { requestTimeout: 15000, connectionTimeout: 10000 }` — `server/storage.ts:26–28`.
- **Principles:** Refuse rather than improvise at the edges.

### R2 cache-control header
- **What it is:** Every file saved to R2 is given `Cache-Control: public, max-age=604800, immutable` (7 days).
- **Why (the decisions):** [inferred] Images are content-addressed (filenames include IDs or hashes) so they are truly immutable; aggressive browser and CDN caching reduces R2 egress costs and page load times.
- **How (the mechanism):** `CacheControl: "public, max-age=604800, immutable"` in `PutObjectCommand` — `server/storage.ts:96`.
- **Principles:** One source of truth per rule; deliberate, explained differences.

---

## Stale Image Repair

### Stale image detection patterns
- **What it is:** A site image is classified as stale (and replaced) if it is null/empty or if its URL contains one of a hardcoded set of substring markers.
- **Why (the decisions):** [inferred] During development and data migrations, placeholder IDs (e.g., `site-709b3754dba7e1c8`) were used for images that were never properly set. The pattern list encodes the known artefacts.
- **How (the mechanism):** `stalePhrases = ["site-709b3754dba7e1c8", "placeholder", "broken", "404"]` — `server/utils/fixStaleImages.ts:45–52`. Case-insensitive substring match.
- **Principles:** One source of truth per rule; surface, don't hide.

### Stale image replacement: category matching
- **What it is:** Replacement images are drawn from the club's image library, preferring images tagged with a category that matches the site type (`inland` vs `coastal`).
- **Why (the decisions):** [inferred] Showing a coastal beach image as the banner for an inland mountain site would be misleading; category matching improves visual relevance.
- **How (the mechanism):** Site type string is scanned for keywords `inland`, `mountain`, `ridge`, `tow` → category `inland`; otherwise `coastal`. First tries `matched` pool; falls back to full `banner`-having pool if empty — `server/utils/fixStaleImages.ts:24–33`.
- **Principles:** Assume safest reading; deliberate, explained differences.
