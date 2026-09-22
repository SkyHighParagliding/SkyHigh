# External Integrations & Scheduling — Decisions, Thresholds & Defaults

---

## Scheduled Grid Fetches

### Fine (wind) grid default fetch time — 5:00 AM Melbourne
- **What it is:** The daily wind-grid fetch fires at 5:00 AM Melbourne time by default. The admin can override the hour and minute via Admin → Scheduled Tasks.
- **Why (the decisions):** [inferred] 5:00 AM is early enough to be ready when pilots start checking conditions at dawn, while sitting in a low-traffic window that avoids Open-Meteo rate pressure. Chosen as the first in a sequenced chain: Wind (5:00) → Thermal (5:26) → 7-Day (5:30), so each depends on the previous completing cleanly.
- **How (the mechanism):** Keys `schedFineGridHour` (default `5`) and `schedFineGridMinute` (default `0`) read from the `settings` table at each scheduling event via `scheduleDailyFromSettings`. The scheduler converts the target wall-clock time to UTC using `date-fns-tz/fromZonedTime` and fires a single `setTimeout`. After the job completes it reschedules itself from the then-current settings, so an admin edit takes effect the next morning without a server restart. Code: `server/utils/scheduledJobs.ts:341`, `server/seed.ts:142–143`.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

### Thermal grid default fetch time — 5:26 AM Melbourne
- **What it is:** The daily thermal-grid fetch defaults to 5:26 AM Melbourne time, 26 minutes after the wind grid.
- **Why (the decisions):** [inferred] The 26-minute offset staggers requests on the shared Open-Meteo quota. If both grids fired together, the burst would exhaust the per-minute batch allowance and force both into retries. The thermal grid has more points (0.09° vs 0.15° spacing) and fetches different variables, so running it second also avoids contending for the same tile-request quota.
- **How (the mechanism):** Keys `schedThermalGridHour` (default `5`) and `schedThermalGridMinute` (default `26`) via `scheduleDailyFromSettings`. Code: `server/utils/scheduledJobs.ts:344`, `server/seed.ts:144–145`.
- **Principles:** Deliberate, explained differences; One source of truth per rule.

### 7-Day (extended forecast) default fetch time — 5:30 AM Melbourne
- **What it is:** The extended forecast fetch defaults to 5:30 AM Melbourne time.
- **Why (the decisions):** Positioned after both grids (5:00 and 5:26) so all three sources are available together when pilots open the app in the morning. The seed comment explicitly corrects a prior stale default of 4 AM that disagreed with production.
- **How (the mechanism):** Keys `schedExtendedForecastHour` (default `5`) and `schedExtendedForecastMinute` (default `30`) read in `extendedForecast.ts` (same `scheduleDailyFromSettings` pattern). Seed: `server/seed.ts:147–149`.
- **Principles:** Deliberate, explained differences; One source of truth per rule.

### Thermal grid retry chain — 30 min / 1 h / 2 h / 4 h
- **What it is:** When a thermal fetch leaves any grid points unresolved, it re-tries up to four times at increasing delays (30 min, 1 h, 2 h, 4 h) before giving up.
- **Why (the decisions):** The original delays (5/15/40/90 min) were shortened and piled up all retries within the same rate-limit window, wasting quota. The new schedule spaces retries to land in fresh rate-limit windows. Commit `a6fecb2` message: "spaced so each retry lands in a fresh rate-limit window rather than piling on the same hour's quota."
- **How (the mechanism):** `THERMAL_RETRY_DELAYS_MS = [30*60_000, 60*60_000, 120*60_000, 240*60_000]` at `server/utils/scheduledJobs.ts:177`. Each retry clears the previous `thermalRetryTimer` before scheduling, so manual "Fetch Now" clicks don't accumulate ghost chains (`server/utils/scheduledJobs.ts:216–219`).
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Thermal grid 7:30 AM backstop cron
- **What it is:** A hard cron at 7:30 AM Melbourne time re-runs the thermal fetch if the auto-retry chain still shows missing points.
- **Why (the decisions):** [inferred] The retry chain spreads across up to 7.5 h (5:26 + 4 h = 9:26 at latest). The backstop provides a final safety net well within the morning flying window without waiting for the chain to exhaust itself. It is a no-op when `thermalGridMissingPoints` is 0, so it adds no overhead on a clean day.
- **How (the mechanism):** `cron.schedule("30 7 * * *", () => retryThermalGaps(), { timezone: "Australia/Melbourne" })` at `server/utils/scheduledJobs.ts:346`. `retryThermalGaps()` reads `THERMAL_GAP_KEY` from settings and returns immediately if 0.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Startup grid catch-up — 60 s delay (fine grid) / 3 min delay (thermal grid)
- **What it is:** When the server starts and today's grid row is absent from the DB, both grids are fetched after a short startup delay instead of waiting until the next scheduled window.
- **Why (the decisions):** The server may be restarted after the 5:00/5:26 AM window (e.g. Railway deployment, crash restart). Without a startup check, pilots would see stale data all day. The delays (60 s for wind, 3 min for thermal) avoid hammering the API before the process is fully initialised.
- **How (the mechanism):** `startupGridCheck()` in `server/utils/scheduledJobs.ts:296–331`. Existence is checked by a `SELECT siteId FROM wind_grid_data WHERE siteId = 'fine_grid_YYYY-MM-DD'` row, not by timestamp, so a failed run that still wrote a timestamp doesn't masquerade as success. `setTimeout(..., 60_000)` for fine, `setTimeout(..., 3 * 60_000)` for thermal.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Thermal gap count — single settings-table key
- **What it is:** The count of unresolved grid points from the last thermal fetch is persisted as `thermalGridMissingPoints` in the `settings` table.
- **Why (the decisions):** Code comment (`server/utils/scheduledJobs.ts:186–194`): replaces an old list of failed tiles. The orchestrator now gap-fills across providers, so only points missing from the merged result (not individual provider failures) warrant a retry. One integer is the minimal sufficient signal for both the admin panel and the startup check.
- **How (the mechanism):** `setThermalGapCount(count)` / `getThermalGapCount()` at `server/utils/scheduledJobs.ts:198–209`. Written after every fetch attempt; read on startup and before the 7:30 AM backstop.
- **Principles:** One source of truth per rule; Surface, don't hide.

### Siteguide version check schedule — default 5:00 AM Melbourne
- **What it is:** A daily check against `siteguide.org.au/About` for a new version string, defaulting to 5:00 AM Melbourne time.
- **Why (the decisions):** [inferred] Running at the same time as the wind grid avoids adding a dedicated scheduling slot. The version check is cheap (single HTTP GET) and its side-effects (zone data download + bulk re-import) are deferrable, so 5:00 AM is an acceptable default.
- **How (the mechanism):** Keys `schedSiteguideHour` (default `5`) and `schedSiteguideMinute` (default `0`), polled inside the hourly cron at `server/utils/scheduledJobs.ts:353–357`. Seed: `server/seed.ts:139–140`.
- **Principles:** One source of truth per rule.

### Siteguide auto-download and auto-import gates
- **What it is:** Two separate boolean flags control whether a version change automatically downloads zone data (`autoDownloadZoneData`, default `true`) and re-imports sites (`autoImportEnabled`, default `true`). A third guard (`lastImportedState`) prevents auto-import until an admin has run a manual import first.
- **Why (the decisions):** An admin must establish what "last imported state" is before the automation can repeat it — otherwise the system would have no state to re-import. Defaults-on for both download and import reflect the expected production behaviour (hands-off updates), while the `lastImportedState` guard ensures the first run is always human-supervised. Code comment at `server/utils/scheduledJobs.ts:389–392`.
- **How (the mechanism):** `getSetting("autoDownloadZoneData", "true")` at `server/utils/scheduledJobs.ts:369`; `autoImportEnabled` at line 386; `lastImportedState` guard at line 388.
- **Principles:** Decisions stay with the human; Assume the safest reading when context is missing.

### Image submission notification — default 7:00 PM Melbourne
- **What it is:** Pending image submissions are notified to `isSocialMedia` contacts once daily at 7:00 PM Melbourne time by default.
- **Why (the decisions):** [inferred] 7 PM captures submissions from the day while reaching social-media committee members at a time they're likely to act. The "watermark" (lastSubmissionNotification) ensures only genuinely new submissions since the last send are counted.
- **How (the mechanism):** Key `submissionNotifyHour` (default `19`), checked inside the hourly cron at `server/utils/scheduledJobs.ts:417–420`. Gate key `submissionNotifyEnabled` (default `"true"`). Seed: `server/seed.ts:150–151`.
- **Principles:** Surface, don't hide; Decisions stay with the human.

### Drive document sync — default 4:00 AM Melbourne, disabled by default
- **What it is:** Automatic Google Drive document index sync fires at 4:00 AM Melbourne time when enabled, but defaults to disabled (`driveSyncEnabled = false`).
- **Why (the decisions):** [inferred] Defaults to off because Drive sync requires the Apps Script bridge URL to be configured first — enabling it without that would silently no-op on every run. 4:00 AM is before the grid fetches to avoid competing for server resources.
- **How (the mechanism):** `schedDriveSyncHour` (default `4`), `schedDriveSyncMinute` (default `0`), gate `driveSyncEnabled` checked at `server/utils/scheduledJobs.ts:424–427`. Seed: `server/seed.ts:152–154`.
- **Principles:** Decisions stay with the human; Refuse rather than improvise at the edges.

### Admin session cleanup — 3:00 AM Melbourne, fixed cron
- **What it is:** Expired admin sessions are purged daily at 3:00 AM Melbourne time. This is a fixed cron, not settings-driven.
- **Why (the decisions):** Code comment (`server/utils/scheduledJobs.ts:433–435`): "sweeps rows that were never explicitly logged out and whose TTL has elapsed, preventing unbounded table growth." 3 AM precedes all grid and version-check jobs, ensuring a clean DB state.
- **How (the mechanism):** `cron.schedule("0 3 * * *", cleanExpiredSessions, { timezone: "Australia/Melbourne" })` at `server/utils/scheduledJobs.ts:436–443`.
- **Principles:** One source of truth per rule.

---

## TidyHQ Integration

### TidyHQ 401 → query-string fallback
- **What it is:** If the TidyHQ API returns HTTP 401 on a Bearer-header request, `tidyhqFetch` retries the same URL with `?access_token=…` appended as a query-string parameter.
- **Why (the decisions):** [inferred] TidyHQ supports both `Authorization: Bearer` and query-string tokens. Some endpoints or token types appear to reject the header form while accepting the query form. The fallback recovers transparently without surfacing the error to callers.
- **How (the mechanism):** `server/utils/tidyhqFetch.ts:17–24`. On `r.status === 401` the URL is rebuilt with the token appended and a second `fetch` is fired. No retries beyond that — a second 401 propagates as-is.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### TidyHQ Current Members group ID — 135716 (hardcoded)
- **What it is:** The TidyHQ group whose members are treated as "current financial members" is hard-coded as group ID `135716`.
- **Why (the decisions):** [inferred] TidyHQ group IDs are stable for a given organisation; the group is a fundamental membership concept that does not vary per deployment. Hardcoding avoids an admin misconfiguration that would silently open the member filter to everyone.
- **How (the mechanism):** `const CURRENT_MEMBERS_GROUP_ID = 135716` at `server/utils/tidyhqMemberFilter.ts:7`. Used in the GET `/groups/135716/contacts` call.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule.

### TidyHQ member cache TTL — default 15 minutes
- **What it is:** The in-process cache of "current members" email addresses is refreshed at most once every 15 minutes.
- **Why (the decisions):** [inferred] TidyHQ membership changes are infrequent (webhooks handle real-time role changes); polling on every request would risk rate-limiting the token. 15 minutes balances freshness against API overhead. The default is admin-configurable via `cacheTidyHqMemberTtl`.
- **How (the mechanism):** `getCacheTtlMs()` reads from settings, defaulting to `"15"` minutes at `server/utils/tidyhqMemberFilter.ts:10–12`. Module-level `cachedEmails` / `cacheTimestamp` at lines 15–16; stale check at line 44.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

### TidyHQ member filter — pass-through when token absent or empty group
- **What it is:** If `TIDYHQ_ACCESS_TOKEN` is not set, or the fetched member set is empty, `filterByCurrentMembers` returns all contacts unchanged rather than refusing.
- **Why (the decisions):** [inferred] A missing token means TidyHQ is not configured for this deployment; treating that as "zero members allowed" would break a site that hasn't set up the integration. An empty group (API call failed, returned no rows) is similarly treated as "data unavailable" rather than "no members exist."
- **How (the mechanism):** Two early-return guards in `server/utils/tidyhqMemberFilter.ts:56–63`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### TidyHQ webhook timestamp tolerance — ±300 seconds (5 minutes)
- **What it is:** Webhook requests with a `tidy-signature` timestamp more than 300 seconds old (or future) are rejected with 401.
- **Why (the decisions):** [inferred] Standard replay-attack window. 5 minutes accommodates reasonable clock skew between TidyHQ's servers and Railway without opening a wide replay window.
- **How (the mechanism):** `Math.abs(nowSec - tsNum) > 300` at `server/routes/tidyhq.ts:44`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### TidyHQ webhook signature — multi-strategy brute-force verification
- **What it is:** The signature is verified against 6 combinations (2 key forms × 3 payload forms) rather than a single canonical form, using constant-time comparison.
- **Why (the decisions):** [inferred] TidyHQ's signature documentation is ambiguous about whether the key should be raw or base64-decoded, and whether the webhook ID prefix is included in the payload. The 6-combination loop avoids a fragile match to undocumented behaviour while still rejecting anything that fails all variants.
- **How (the mechanism):** `server/routes/tidyhq.ts:54–76`. `crypto.timingSafeEqual` used throughout to prevent timing attacks.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### TidyHQ webhook — group ID drift auto-heal
- **What it is:** If a webhook carries a group ID that doesn't match any mapping, the handler falls back to matching by group name. When a name match succeeds and the stored ID is different, the DB is updated to the webhook's ID.
- **Why (the decisions):** TidyHQ group IDs can drift (e.g. group recreated) while names stay stable. Silently updating the stored ID keeps the mapping live without admin intervention.
- **How (the mechanism):** `server/routes/tidyhq.ts:103–119`. Name-match fallback at line 103; auto-update `UPDATE tidyhq_group_mappings SET "tidyhqGroupId" = $1` at line 111.
- **Principles:** Surface, don't hide; One source of truth per rule.

### TidyHQ `isCommittee` → `isAdmin` and position cascade
- **What it is:** When a webhook sets `isCommittee = 1`, it also sets `isAdmin = 1` and, if position is empty, sets it to `"Committee"`. When `isCommittee` is cleared, if the position was only `"Committee"`, it is nulled.
- **Why (the decisions):** [inferred] Committee membership is the primary admin-access gate in this app; they are intentionally coupled. The position default and cleanup prevent orphaned position strings from lingering after a member leaves.
- **How (the mechanism):** `server/routes/tidyhq.ts:247–297`.
- **Principles:** Decisions stay with the human (mapping is admin-configured); One source of truth per rule.

### TidyHQ webhook log cap — max 200 entries per API call
- **What it is:** The webhook log API endpoint accepts a `limit` query param but caps it at 200.
- **How (the mechanism):** `Math.min(parseInt(req.query.limit) || 50, 200)` at `server/routes/tidyhq.ts:422`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Gemini AI Configuration

### API key precedence — `USER_GEMINI_API_KEY` over `GEMINI_API_KEY`
- **What it is:** Every Gemini AI call resolves the key as `process.env.USER_GEMINI_API_KEY || process.env.GEMINI_API_KEY`. For the `parse-rating` endpoint only, a third fallback reads `geminiApiKey` from the settings table.
- **Why (the decisions):** [inferred] `USER_GEMINI_API_KEY` is the per-user/per-deployment key (billing attributed to the operator); `GEMINI_API_KEY` is the default/shared key. The precedence lets an operator override the default without touching the shared key. The DB fallback on `parse-rating` allows the key to be entered via the admin UI during initial setup before Railway secrets are configured.
- **How (the mechanism):** `server/routes/search.ts:981`, `server/routes/ai.ts:205–212` (includes the DB fallback), `server/routes/submissions.ts:115`.
- **Principles:** Decisions stay with the human; One source of truth per rule.

### Gemini model fallback chain — text models
- **What it is:** Text generation tries models in order: `gemini-2.5-flash` → `gemini-2.5-pro` → `gemini-2.0-flash`. On any error the next model is tried; all three failing throws the last error.
- **Why (the decisions):** [inferred] `2.5-flash` is fastest and cheapest; `2.5-pro` is the quality backstop; `2.0-flash` is the compatibility tail for quota exhaustion on newer models. The list is admin-overridable via the `aiTextModels` settings key, allowing hot-swap without a deployment.
- **How (the mechanism):** `DEFAULT_TEXT_MODELS` at `server/utils/aiModels.ts:7–11`. `generateTextWithFallback()` iterates them at lines 65–83. DB override read in `getTextModels()`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

### Gemini model fallback chain — image models
- **What it is:** Image generation tries: `gemini-2.5-flash-image` → `gemini-3.1-flash-image-preview` → `gemini-3-pro-image-preview`.
- **Why (the decisions):** [inferred] Same pattern as text models — cheapest/fastest first, quality backstops after. Overridable via `aiImageModels` in settings.
- **How (the mechanism):** `DEFAULT_IMAGE_MODELS` at `server/utils/aiModels.ts:13–17`. `getImageModels()` at lines 32–43.
- **Principles:** One source of truth per rule.

### Gemini temperature fixed at 0 for all text generation
- **What it is:** All `generateTextWithFallback` calls force `temperature: 0` in the config, overriding any caller-supplied value.
- **Why (the decisions):** [inferred] Deterministic output is critical for safety-critical use cases (eligibility verdicts, flyability ratings). Zero temperature prevents the model from hallucinating different values across calls.
- **How (the mechanism):** `config: { ...(options.config || {}), temperature: 0 }` at `server/utils/aiModels.ts:72`.
- **Principles:** Assume the safest reading when context is missing; Decisions stay with the human.

---

## Storage: R2 vs Local Fallback

### R2 activation — all five env vars must be present
- **What it is:** R2 (Cloudflare) is only activated if all five variables are non-empty: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`. If any is missing, every file operation falls back to `./uploads/`.
- **Why (the decisions):** [inferred] Partial configuration would silently write files to R2 with no public URL, or build a broken S3 client. The all-or-nothing gate ensures a coherent storage environment on every call.
- **How (the mechanism):** `isR2Configured()` at `server/storage.ts:11–13`. Called at the top of `saveFile()`, `deleteFile()`, and `readFile()`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### R2 uploaded files — `Cache-Control: public, max-age=604800, immutable`
- **What it is:** Every file written to R2 receives a 7-day, immutable cache header.
- **Why (the decisions):** [inferred] Media files (hero images, site photos, AI-enhanced images) are content-addressed by filename hash and never updated in-place — old keys are deleted and new keys are created. Immutable + 7-day TTL allows CDN and browser caches to serve aggressively without stale-content risk.
- **How (the mechanism):** `CacheControl: "public, max-age=604800, immutable"` in `PutObjectCommand` at `server/storage.ts:95`.
- **Principles:** Deliberate, explained differences.

### R2 operations — up to 3 retries with exponential back-off (1 s, 2 s base)
- **What it is:** R2 S3 API calls are retried up to 3 times on 5xx or network errors, with delays of 1 s then 2 s (2^attempt × 1000 ms).
- **Why (the decisions):** [inferred] Cloudflare R2 can return transient 5xx errors. 4xx errors (except 429) are not retried because they indicate a client-side mistake (wrong key, wrong bucket) that retrying cannot fix. The comment at `server/storage.ts:41` explicitly documents the 4xx exclusion.
- **How (the mechanism):** `withRetryR2()` at `server/storage.ts:35–49`. `attempt < 3` loop; `wait = 1000 * Math.pow(2, attempt)`.
- **Principles:** Refuse rather than improvise at the edges.

### HTTP file reads — 3 retries, 15 s timeout per attempt
- **What it is:** Reading a file from an `https://` URL (R2 public URL) retries up to 3 times with a 15-second abort signal per attempt.
- **How (the mechanism):** `server/storage.ts:113–125`. `AbortSignal.timeout(15000)`; `attempt === 2` breaks loop.
- **Principles:** Refuse rather than improvise at the edges.

### Elevation tile — 1-week cache if hit, no-store if miss
- **What it is:** The `/weather/elevation-point` API response is cached `public, max-age=604800, immutable` when elevation data is available, and `no-store` when the tile fetch returned null.
- **Why (the decisions):** Code comment (`server/routes/weather.ts:604–606`): "Terrain is static, so a real answer caches for a week. A null means a tile fetch failed — that must NOT be cached, or a transient upstream blip would pin 'no elevation' into every client cache for seven days."
- **How (the mechanism):** `server/routes/weather.ts:607–610`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

---

## Google Drive — Apps Script Bridge

### Drive client implementation — Apps Script bridge only, no googleapis client
- **What it is:** All Google Drive operations (list, upload, delete, search, index sync) go through the Apps Script bridge URL stored in `drive_appscript_url`. The googleapis client was removed entirely.
- **Why (the decisions):** Commit `cf58646` message: "The googleapis-client half was unreachable — its entry point `registerDriveClient()` was never called, `googleapis` isn't even a dependency, so `getClient()` always returned null and every fallback silently no-op'd. Long-standing legacy from the old Replit sync." The bridge is the only path that production uses; keeping dead code created confusion. Corresponds to DECISION-014 in the wiki.
- **How (the mechanism):** `getAppScriptUrl()` in `server/googleDrive.ts:18–27`. Returns `""` (no-op) if the setting is absent or the URL's hostname doesn't end with `script.google.com` or `script.googleusercontent.com`.
- **Principles:** One source of truth per rule; Surface, don't hide.

### Apps Script URL — domain allowlist enforced on every read
- **What it is:** `getAppScriptUrl()` validates the stored URL against an allowlist of two domains (`script.google.com`, `script.googleusercontent.com`) before returning it. An invalid domain silently returns `""`.
- **Why (the decisions):** [inferred] The URL is stored in the DB and editable by admins. A typo or SSRF payload in that field should not cause the server to make unauthenticated fetch requests to arbitrary hosts.
- **How (the mechanism):** `allowedDomains.some(d => new URL(url).hostname.endsWith(d))` at `server/googleDrive.ts:22–26`. Same pattern is applied independently for the asset register URL at `server/routes/search.ts:178–184`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### Asset register Apps Script fetch — 5 s timeout, max 50 items cached
- **What it is:** The asset register context for Smart Search is fetched with a 5-second abort timeout and the result is sliced to at most 50 items before caching.
- **Why (the decisions):** [inferred] The asset register is a secondary data source injected into AI context; a slow sheet response should not block a search request. 50 items caps context size to keep token usage predictable for the Gemini prompt.
- **How (the mechanism):** `AbortSignal.timeout(5000)` and `assetJson.results.slice(0, 50)` at `server/routes/search.ts:189–197`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Satellite Trackers

### Tracker fetch timeout — 15 seconds for all three providers
- **What it is:** Garmin MapShare, SPOT, and ZOLEO fetches are each aborted after 15 seconds.
- **Why (the decisions):** [inferred] Tracker APIs are external and can hang. 15 seconds is long enough for a satellite-relay API (which may involve a polling back-end) but short enough not to hold a server response indefinitely.
- **How (the mechanism):** `const FETCH_TIMEOUT_MS = 15000` in each of `server/utils/garminMapshare.ts:18`, `server/utils/spotTracker.ts:20`, `server/utils/zoleoTracker.ts:17`. Each uses an `AbortController` set by `setTimeout`.
- **Principles:** Refuse rather than improvise at the edges.

### ZOLEO — hard refuse when API key absent
- **What it is:** `fetchZoleoPosition` returns `null` immediately if no `apiKey` is provided, without attempting the request.
- **Why (the decisions):** [inferred] ZOLEO requires authentication on every request. An unauthenticated call would return a 401 and expose the device IMEI in a request that cannot succeed. Failing fast is safer than letting an error propagate.
- **How (the mechanism):** `if (!apiKey) { return null; }` at `server/utils/zoleoTracker.ts:24–26`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### ZOLEO timestamp rejection — missing or invalid timestamps rejected
- **What it is:** A ZOLEO position is rejected (returns `null`) if the response lacks a valid timestamp.
- **Why (the decisions):** Code comment at `server/utils/zoleoTracker.ts:77`: "ZOLEO response missing valid timestamp — rejecting fix." A location without a known fix time cannot be meaningfully displayed on a flight tracker.
- **How (the mechanism):** `if (!ts || isNaN(ts)) { log.info("..."); return null; }` at `server/utils/zoleoTracker.ts:76–79`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### SPOT emergency detection — `SOS` or `NEWMOVEMENT` message types
- **What it is:** A SPOT position is flagged `inEmergency = true` if `messageType === "SOS"` or `messageType === "NEWMOVEMENT"`.
- **Why (the decisions):** [inferred] Both message types indicate a distress signal in the SPOT API protocol. `NEWMOVEMENT` is an old SPOT Gen1/Gen2 activation message sometimes used during initial panic activations.
- **How (the mechanism):** `inEmergency: messageType === "SOS" || messageType === "NEWMOVEMENT"` at `server/utils/spotTracker.ts:91`.
- **Principles:** Assume the safest reading when context is missing.

### Garmin validFix default — true when field absent
- **What it is:** If the Garmin KML response lacks an explicit `Valid GPS Fix` extended-data field, the parsed position defaults `validFix: true`.
- **Why (the decisions):** [inferred] Older Garmin firmware versions do not include this field but the position is still valid. Defaulting to `true` preserves tracking for older devices; the field is only set `false` when the API explicitly signals an invalid fix.
- **How (the mechanism):** `validFix: validFix ? validFix.toLowerCase() !== "false" : true` at `server/utils/garminMapshare.ts:116`.
- **Principles:** Assume the safest reading when context is missing.

### Garmin — latest position selected by maximum timestamp
- **What it is:** The KML feed may contain multiple `<Placemark>` entries. The parser picks the one with the greatest `Time UTC` value.
- **Why (the decisions):** [inferred] Garmin's MapShare feed returns the last N breadcrumbs, not just the most recent fix. Displaying any position other than the latest would show the tracker as if it were further behind than it is.
- **How (the mechanism):** `if (ts >= latestTs || !latest)` pattern across all placemarks in `server/utils/garminMapshare.ts:106–120`.
- **Principles:** Assume the safest reading when context is missing.

---

## Search Cache

### Search context cache TTL — default 5 minutes
- **What it is:** The AI search context (sites, weather, closures) is cached in memory and served stale for up to 5 minutes before being rebuilt.
- **Why (the decisions):** [inferred] Building the context requires multiple DB queries plus weather joins. At peak query volume (multiple concurrent users) rebuilding on every request would be expensive. 5 minutes is short enough that weather observations are not materially stale.
- **How (the mechanism):** `getContextTtl()` reads `cacheSearchContextTtl` from settings, defaulting to `"5"` at `server/routes/search.ts:144–147`. Three separate caches: `publicContextCache`, `internalContextCache`, `adminContextCache`. Seed: `server/seed.ts:165`.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

### Asset register cache TTL — default 10 minutes
- **What it is:** The asset register data fetched from the Apps Script is cached for 10 minutes.
- **Why (the decisions):** [inferred] The asset register changes less often than site weather; 10 minutes avoids re-fetching the Sheet on every search call. Also cached separately from the main context so it can be invalidated independently.
- **How (the mechanism):** `getAssetTtl()` reads `cacheAssetRegisterTtl`, defaulting to `"10"` at `server/routes/search.ts:153–156`. Seed: `server/seed.ts:166`.
- **Principles:** One source of truth per rule.

### Search cache invalidation — dispatcher pattern (cycle-break)
- **What it is:** Any module that mutates site or settings data calls `invalidateSearchCaches()` from `server/utils/searchCacheInvalidation.ts`, which dispatches to the real cache-clearer registered by `routes/search.ts`.
- **Why (the decisions):** Code comment at `server/utils/searchCacheInvalidation.ts:10–13`: "The indirection lets modules invalidate the search caches without importing (and cycling through) search.ts." `search.ts` is a large module; a direct import from, e.g., `sites/crud.ts` would create a circular dependency.
- **How (the mechanism):** `registerSearchCacheInvalidator(fn)` called once at module load in `search.ts:168`; `invalidateSearchCaches()` in `searchCacheInvalidation.ts:13` calls the registered `fn`.
- **Principles:** One source of truth per rule.

### Search log size warning — default 10 MB threshold, one-shot email
- **What it is:** After each logged public search query, if the total size of `search_logs` exceeds the configured threshold (default 10 MB), an email is sent to the admin and a `searchLogWarningSent` flag is set so the email fires only once.
- **Why (the decisions):** [inferred] Search logs accumulate unboundedly without a retention policy; a size warning prompts the admin to review and clear before storage becomes a cost or performance concern. The one-shot flag prevents repeated emails on every subsequent query after the threshold is crossed.
- **How (the mechanism):** `warnMb = parseFloat(warnMbRow?.value || "10")` at `server/routes/search.ts:33`. Size computed by `SUM(LENGTH(query) + LENGTH(response))` / 1 048 576. Flag key `searchLogWarningSent` set at line 45.
- **Principles:** Surface, don't hide; Decisions stay with the human.

---

## Weather API Cache Headers

### Extended forecast / wind overlay — 30 min HTTP cache (`max-age=1800`)
- **What it is:** The `/weather/extended-grid` and `/weather/extended-grid/wind-overlay` endpoints respond with `Cache-Control: public, max-age=1800`.
- **Why (the decisions):** [inferred] The extended forecast is rebuilt once daily; a 30-minute client/CDN cache is long enough to reduce server load without risk of showing day-old data (the daily grid fetch happens at 5:30 AM, well before pilots start checking).
- **How (the mechanism):** `res.setHeader('Cache-Control', 'public, max-age=1800')` at `server/routes/weather.ts:428, 439, 869, 886`.
- **Principles:** Deliberate, explained differences.

### Grid tile overlay — 5-minute HTTP cache (`max-age=300`)
- **What it is:** The fine-grid wind overlay tile endpoint responds with a 5-minute cache header.
- **Why (the decisions):** [inferred] Wind tiles are derived from the daily grid but are more frequently requested and smaller; 5 minutes balances client load with the expectation that data is refreshed daily.
- **How (the mechanism):** `res.setHeader('Cache-Control', 'public, max-age=300')` at `server/routes/weather.ts:979`.
- **Principles:** Deliberate, explained differences.

### Settings API — 10 s cache with 30 s stale-while-revalidate
- **What it is:** The `/api/settings` endpoint (public, no auth) returns `Cache-Control: public, max-age=10, stale-while-revalidate=30`.
- **Why (the decisions):** [inferred] Settings are queried on every client page load but change rarely. A short TTL with stale-while-revalidate means the client never waits more than 10 s for a refresh while a background revalidation runs asynchronously.
- **How (the mechanism):** `res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30')` at `server/routes/settings.ts:48`.
- **Principles:** Deliberate, explained differences.

---

## Admin Sessions

### Admin session TTL — default 24 hours
- **What it is:** Admin sessions expire after 24 hours by default, configurable via `cacheAdminSessionTtl` (hours).
- **Why (the decisions):** [inferred] 24 hours matches a typical working day; an admin who leaves the panel open overnight stays logged in for the next morning without re-authenticating. Shorter TTLs would be more secure but create friction.
- **How (the mechanism):** `parseInt(row?.value || "24", 10) * 60 * 60 * 1000` at `server/middleware/auth.ts:7–10`. Cleanup cron sweeps expired rows daily.
- **Principles:** Decisions stay with the human; One source of truth per rule.

### Dev bypass — requires both `NODE_ENV=development` AND `DEV_BYPASS_AUTH=true`
- **What it is:** The auth middleware allows an unauthenticated dev admin only when both `NODE_ENV === 'development'` AND `DEV_BYPASS_AUTH === 'true'` are set.
- **Why (the decisions):** [inferred] Requiring both flags prevents a production deployment from accidentally gaining bypass access if only `NODE_ENV` is misconfigured. The double-gate makes the bypass deliberate.
- **How (the mechanism):** `isDevBypassActive()` at `server/middleware/auth.ts:13–15`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

---

## Siteguide Version Check

### Version detection — regex on About page content
- **What it is:** The siteguide version is detected by scraping `https://siteguide.org.au/About` and matching `/v(\d+)\s*\(/` in the HTML.
- **Why (the decisions):** [inferred] Siteguide.org.au does not expose a machine-readable version API. The About page is the authoritative version display; the regex captures the version number preceding a parenthesis, which is the observed format.
- **How (the mechanism):** `html.match(/v(\d+)\s*\(/)` at `server/utils/siteguideVersionCheck.ts:101`. Throws if no match.
- **Principles:** Surface, don't hide.

### Version check "changed" logic — null-safe strict inequality
- **What it is:** A version change is only flagged if both `detectedVersion` and `previousVersion` are non-null and differ. A fresh install (no previous version on record) is never treated as a change.
- **Why (the decisions):** [inferred] On first run there is no stored previous version. Treating null → v1 as a "change" would trigger an unwanted auto-import on a fresh deployment.
- **How (the mechanism):** `const changed = detectedVersion !== null && previousVersion !== null && detectedVersion !== previousVersion` at `server/utils/siteguideVersionCheck.ts:164`.
- **Principles:** Assume the safest reading when context is missing.

### Siteguide alert recipients — admins + configurable extra list, with default fallback
- **What it is:** Version-change emails go to all `isAdmin` contacts plus a comma-separated extra list from `siteguideAlertRecipients` settings key, defaulting to `jonpamment@gmail.com`.
- **Why (the decisions):** Code comment at `server/utils/siteguideVersionCheck.ts:9–12`: "Whoever curates the site data still gets these if they stop being admin." The default hardcoded email ensures at least one recipient even if neither the admin list nor the setting is configured.
- **How (the mechanism):** `const DEFAULT_ALERT_RECIPIENTS = "jonpamment@gmail.com"` at `server/utils/siteguideVersionCheck.ts:11`. `resolveAlertRecipients()` deduplicates by lowercase email.
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

### Siteguide fetch timeout — 15 seconds
- **What it is:** The HTTP fetch of `siteguide.org.au/About` times out after 15 seconds.
- **How (the mechanism):** `AbortSignal.timeout(15000)` at `server/utils/siteguideVersionCheck.ts:97`.
- **Principles:** Refuse rather than improvise at the edges.
