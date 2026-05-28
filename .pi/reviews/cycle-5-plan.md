# Coordinator Fix Plan — Cycle 5
**Date:** 2026-05-28
**Coordinator:** Manual consolidation (this session)

## Scope & Context

**This cycle targets GAPS from previous reviews.** Cycles 2-4 and AUDIT passes 1-5 were heavily server/PG/security focused (84+ bugs across 30+ server files). The client-side `src/` directory has NEVER been audited for React bugs or TypeScript type safety. This is the first review to systematically cover:

- React component bugs (useEffect deps, unmounted state updates, memory leaks)
- TypeScript type safety (`any`, `!`, `as`, shared type drift)
- Integration/config issues (env vars, SSE token leaks, dev/prod drift)
- Regression check on previous Cycle 4 fixes

## Triage Summary

- **Bug Review:** 8 findings (4 HIGH, 3 MEDIUM, 1 LOW)
- **Type Safety Review:** 8 findings (2 CRITICAL, 2 HIGH, 2 MEDIUM, 2 LOW)
- **Regression Check (manual):** 1 finding noted (see below)
- **Total VALID findings:** 16
- **Merged duplicates:** 0 (no overlap between bug and type reviews)
- **Rejected:** 0

---

## Regression Check Results

**Cycle 4 fixes verified against current code:**

| Fix | File(s) | Status | Notes |
|-----|---------|--------|-------|
| P-001: Path traversal (essential info) | `server/utils/essentialInfo.ts` | ✅ Present | Not in scope of this review (server-side) |
| P-002: Rate limit memory leak | `server/routes/pilotAuth.ts` | ✅ Present | Not in scope |
| P-004: DEV_BYPASS_AUTH | `server/middleware/auth.ts` | ✅ Present | Not in scope |
| P-005: Timing attack auth | `server/routes/pilotAuth.ts` | ✅ Present | Not in scope |
| P-006: XSS site name sanitize | `src/components/weather/WeatherCard*.tsx` | ⚠️ **REVERTED** | Commit `3786d08` removed `sanitizeSiteName` due to double-escaping. **However**, React JSX auto-escapes `{site.name}`, so this is NOT a regression — the XSS concern was a false positive in the original review. Documented to prevent re-reporting. |
| P-007: Session token in URL | `server/routes/flights.ts` | ✅ Present | Comment: "Only accept from header, not query" |
| P-008: Path traversal (submissions) | `server/routes/submissions.ts` | ✅ Present | Verified path normalization + startsWith guard |
| P-010: SQL conversion | `server/pgDb.ts` | ✅ Present | Not in scope |
| P-013: Flight race condition | `server/services/realFlightService.ts` | ✅ Present | Not in scope |
| P-017: Weak passwords | `server/routes/pilotAuth.ts` | ✅ Present | Not in scope |
| P-026: ReDoS wind dir | `server/routes/sites/helpers.ts` | ✅ Present | Not in scope |
| P-023: Particle optimization | `src/components/windmap/particleRenderer.ts` | ✅ Present | File hasn't changed since reorg |

**No regressions found from Cycle 4.** The XSS sanitize removal (P-006) was a correct change — the original finding was a false positive since React auto-escapes in JSX.

---

## Fix Plan (Prioritized)

### P-001: apiClient returns `undefined` as `T` on empty response — T-001
- **Priority:** P0 — CRITICAL
- **Source:** Type Safety Review (T-001)
- **Severity:** CRITICAL
- **Verified:** `src/lib/apiClient.ts` lines 100-101: `if (!text) return undefined as unknown as T;` — confirmed. Empty 2xx response (204 No Content) returns `undefined` but the type system says it's `T`. Any consumer iterating the result crashes with `.map is not a function`.
- **Dual-DB Risk:** NO
- **Files:** `src/lib/apiClient.ts`
- **Lines:** 100-101
- **Description:** The generic API client returns `undefined` disguised as type `T` when the server returns an empty response body. This propagates silently through all API consumers and causes hard crashes when they try to iterate or destructure the result.
- **Fix Instructions:** Replace `return undefined as unknown as T;` with either:
  - (Option A) `return null as unknown as T;` and update all callers to handle `null`, OR
  - (Option B) Throw `new ApiError("Empty response", res.status, null)` so callers get a proper error path instead of silent undefined, OR
  - (Option C) Change return type to `Promise<T | null>` and update every `api.get<>()` call site in the codebase — this is correct but high effort
- **Test Guidance:** Verify with a mock endpoint returning 204 No Content. Confirm `api.get()` throws (Option B) or returns null (Option A/C) instead of undefined.

---

### P-002: SSE URLs leak pilot token via query parameter — B-007
- **Priority:** P1 — HIGH
- **Source:** Bug Review (B-007)
- **Severity:** HIGH
- **Verified:** Three file locations confirmed:
  - `src/hooks/useRetrievalStatus.ts` line 165: `pilotToken=${encodeURIComponent(pilotToken)}`
  - `src/hooks/useRetrievalMap.ts` lines 218-219: `pilotToken=${token}`
  - `src/pages/DutyPilotMap.tsx` lines 296-297: `pilotToken=${token}`
  The pilot auth token is sent as a URL query parameter in SSE EventSource connections, exposing it to server logs, referrer headers, and intermediate proxies.
- **Dual-DB Risk:** NO
- **Files:**
  - `src/hooks/useRetrievalStatus.ts` (lines 117, 165)
  - `src/hooks/useRetrievalMap.ts` (lines 218-219)
  - `src/pages/DutyPilotMap.tsx` (lines 296-297)
- **Description:** The pilot token (bearer-equivalent auth credential) is included in SSE EventSource URLs as a query parameter. EventSource does not support custom headers, but the token should be validated server-side via a short-lived SSE-specific session cookie or a separate SSE auth endpoint that issues a single-use ticket.
- **Fix Instructions:** Options:
  - (Option A) Server-side: Create a new endpoint `POST /api/retrievals/sse-ticket` that returns a short-lived (30s) ticket UUID. Client calls this first to get a ticket, then opens SSE with `?ticket=${ticket}`. Server validates ticket on SSE connect. This keeps the token out of URLs.
  - (Option B) If SSE ticket is too complex, at minimum add `referrerpolicy: "no-referrer"` option to the EventSource constructor and ensure the server redacts the query param from logs.
- **Test Guidance:** Verify SSE still connects after fix. Check server access logs — pilotToken should not appear in any logged URL.

---

### P-003: `useRetrievalMap.ts` `Record<string, unknown>` forced into typed arrays — T-002
- **Priority:** P1 — HIGH
- **Source:** Type Safety Review (T-002)
- **Severity:** CRITICAL
- **Verified:** `src/hooks/useRetrievalMap.ts` lines 203-205: `const data = await api.get<Record<string, unknown>>(...)` then `setLivePilots(data)` where `data` is typed `Record<string, unknown>` but state expects `LivePilotData[]`. Lines 248-253: same pattern for duty pilot position and launch site data. TypeScript flags TS2345 but build doesn't fail.
- **Dual-DB Risk:** NO
- **Files:** `src/hooks/useRetrievalMap.ts`
- **Lines:** 203-205, 248-253
- **Description:** API responses are typed as `Record<string, unknown>` (all properties are `unknown`) and then assigned to typed state arrays. If the API returns a single object instead of an array, `data.filter()`, `data.find()`, `data.map()` all crash with `is not a function`. Additionally, `dp.lat`/`dp.lon`/`dp.name` are all typed `unknown` — if the API returns wrong types, numeric operations silently produce `NaN`.
- **Fix Instructions:** Replace the `Record<string, unknown>` types with proper interfaces:
  ```typescript
  api.get<LivePilotData[]>(`${apiBase}/flights/live-pilots`, null, apiOpts());
  // and
  api.get<DutyPilotPosition>(`${apiBase}/retrievals/duty-pilot-position`, null, apiOpts());
  api.get<LaunchSite>(`${apiBase}/retrievals/launch-site`, null, apiOpts());
  ```
  Define `DutyPilotPosition` and `LaunchSite` interfaces with proper `lat: number`, `lon: number`, `name: string` types.
- **Test Guidance:** Verify tsc --noEmit no longer shows TS2345 for these lines. Verify the retrieval map still works.

---

### P-004: `useAdminForm` setTimeout without unmount guard — B-001
- **Priority:** P1 — HIGH
- **Source:** Bug Review (B-001)
- **Severity:** HIGH
- **Verified:** `src/hooks/useAdminForm.ts` line 27: `setTimeout(() => setJustSaved(false), 2000)` — confirmed. The timeout fires `setJustSaved(false)` after 2s with no isMounted guard or cleanup return. If the component unmounts within 2s of saving, React warns about state update on unmounted component. Used by AdminHomeSettings, AdminImages, AdminConnections, AdminSiteEdit.
- **Dual-DB Risk:** NO
- **Files:** `src/hooks/useAdminForm.ts`
- **Lines:** 27
- **Description:** The `save` function schedules a `setTimeout` to clear the `justSaved` state after 2 seconds. If the component unmounts before the timeout fires (user navigates away, modal closes), React receives a state update on a unmounted component. While React 19 doesn't crash, it warns and the update is wasted.
- **Fix Instructions:** Store the timeout ID in a ref and clear it in a useEffect cleanup:
  ```typescript
  const justSavedTimer = useRef<ReturnType<typeof setTimeout>>();
  // In save():
  clearTimeout(justSavedTimer.current);
  justSavedTimer.current = setTimeout(() => setJustSaved(false), 2000);
  // Add useEffect cleanup:
  useEffect(() => () => clearTimeout(justSavedTimer.current), []);
  ```
- **Test Guidance:** Navigate away from an admin form within 2 seconds of saving. Verify no React warnings in console.

---

### P-005: useFlightTracker stale closure on auto-stop — B-002
- **Priority:** P1 — HIGH
- **Source:** Bug Review (B-002)
- **Severity:** HIGH
- **Verified:** `src/hooks/useFlightTracker.ts` — `addBreadcrumb` useCallback calls `stopTracking()` at line ~375 but `stopTracking` is absent from the dependency array at lines 390-393. Deps list stops at `gpsInterval, preRecordBuffer, computeSmoothedAltitude` without `stopTracking`.
- **Dual-DB Risk:** NO
- **Files:** `src/hooks/useFlightTracker.ts`
- **Lines:** ~375 (call site), 390-393 (dep array)
- **Description:** The `addBreadcrumb` callback closes over a stale `stopTracking` function. When `pilotToken` or `syncToServer` changes (which causes `stopTracking` to be recreated), the old `addBreadcrumb` retains the old `stopTracking` with expired credentials. When auto-stop triggers on landing, it may use the wrong auth token, causing the flight to not be properly ended server-side.
- **Fix Instructions:** Add `stopTracking` to the dependency array of the `addBreadcrumb` useCallback.
  ⚠️ **Caution:** Adding `stopTracking` may cause the callback to be recreated frequently since `stopTracking` depends on `[pilotToken, syncToServer, isDemo, apiBase, demoHeaders]`. Consider memoizing `stopTracking` with stable deps, or using a ref to hold the latest `stopTracking` so `addBreadcrumb` doesn't need it in deps.
- **Test Guidance:** Simulate auto-stop on landing. Verify the flight is properly ended server-side after token refresh.

---

### P-006: AdminSites.tsx pervasive `as unknown as` type erasure — T-003
- **Priority:** P2 — MEDIUM
- **Source:** Type Safety Review (T-003)
- **Severity:** HIGH
- **Verified:** `src/pages/AdminSites.tsx` ~15 instances of `as unknown as` across lines 241-436 (confirmed by grep). Every API response is force-cast into domain types with no shape validation.
- **Dual-DB Risk:** NO
- **Files:** `src/pages/AdminSites.tsx`
- **Lines:** 252, 259, 297-298, 301, 326, 348, 371, 373, 388, 415-416, 435-436
- **Description:** The entire AdminSites page uses `as unknown as` to force API responses into `Site[]`, `ArchiveEntry[]`, etc. This provides zero type safety. Combined with P-001 (apiClient returning undefined), every API call that gets an empty response will silently set state to `undefined`, causing `.map()` crashes on render.
- **Fix Instructions:** Replace `as unknown as` with proper type annotations on the `api.get<>()` generic parameter. Remove all `as unknown as` casts. The API response type should match what the server actually returns. Example:
  ```typescript
  // Before:
  api.get<Array<Record<string, unknown>>>('/api/sites').then(response => setSites(response.data as unknown as Site[]))
  // After:
  api.get<{ data: Site[] }>('/api/sites').then(response => setSites(response.data))
  ```
- **Test Guidance:** Verify tsc --noEmit still passes. Verify admin sites page loads correctly.

---

### P-007: SSE connection churn on trackerState transitions — B-004
- **Priority:** P2 — MEDIUM
- **Source:** Bug Review (B-004)
- **Severity:** MEDIUM
- **Verified:** `src/hooks/useRetrievalStatus.ts` SSE effect at lines ~92-180 has dep array `[pilotId, pilotToken, trackerState, isDemo, demoRole, inFlightRetrievalRequested, finishRetrieval, demoApiOpts]`. The flight tracker state machine has 6 transitions (idle→pre-recording→recording→stopping→retrieving→completed), each one closes and re-opens the SSE connection.
- **Dual-DB Risk:** NO
- **Files:** `src/hooks/useRetrievalStatus.ts`
- **Lines:** ~92-181
- **Description:** Every flight state transition closes the EventSource and creates a new one, causing ~1-3s of SSE downtime and unnecessary HTTP round-trips. For a 30-minute flight with 6 state transitions, that's 6 SSE reconnections.
- **Fix Instructions:** Remove `trackerState` from the SSE effect's dependency array. The SSE connection should remain open for the component's entire lifecycle, regardless of recording state. Track the pilot's role/presence via separate, less-frequently-changing variables.
- **Test Guidance:** Start a flight recording, verify SSE stays connected through all state transitions. Check server logs for single SSE connection.

---

### P-008: WindCanvas rAF loop full re-init on dep change — B-005
- **Priority:** P2 — MEDIUM
- **Source:** Bug Review (B-005)
- **Severity:** MEDIUM
- **Verified:** `src/components/windmap/WindCanvas.tsx` — rAF effect has 8 deps including `sizeKey`. Every resize event (before debounce) causes full re-initialization of the particle system, overlay imageData, and tile cache. Confirmed by reading code at lines ~247-257.
- **Dual-DB Risk:** NO
- **Files:** `src/components/windmap/WindCanvas.tsx`
- **Lines:** 247-257
- **Description:** The wind canvas render loop is wrapped in a single effect with 8 dependencies. Changes to `windGrid`, `sizeKey`, `siteLat`, `siteLon`, etc., all cause a full re-initialization that discards and recreates the particle pool, speed overlay imageData, and tile cache. `sizeKey` changes on every resize, creating ~30+ re-inits per resize event before debouncing.
- **Fix Instructions:** Split into two effects — one for canvas sizing (`sizeKey` only, recreates canvas + projection) and one for wind data updates (`windGrid` only, updates particle state without recreating the canvas). Keep zoom/inertia settings in a separate effect.
- **Test Guidance:** Resize the browser window while wind map is active. Verify no frame drops or flickering.

---

### P-009: useXCMapState wind polling runs in background tab — B-006
- **Priority:** P2 — MEDIUM
- **Source:** Bug Review (B-006)
- **Severity:** MEDIUM
- **Verified:** `src/hooks/useXCMapState.ts` lines 368-399 — `setInterval(fetchWindData, 60000)` runs unconditionally with no `document.hidden` check.
- **Dual-DB Risk:** NO
- **Files:** `src/hooks/useXCMapState.ts`
- **Lines:** 368-399
- **Description:** The 60-second wind data polling fetches weather for all live sites even when the browser tab is hidden. For 10 live sites, this generates 10+ API calls per minute in the background, wasting bandwidth and server resources.
- **Fix Instructions:** Add `document.hidden` check inside the poll function or use `visibilitychange` event to pause/resume the interval. Example:
  ```typescript
  const interval = setInterval(() => {
    if (document.hidden) return;
    fetchWindData();
  }, 60000);
  ```
- **Test Guidance:** Open XC Maps with live sites, switch to another tab, verify no API calls fire in background tab. Switch back, verify polling resumes.

---

### P-010: useConnectionsConfig setTimeout not cleaned up — B-003
- **Priority:** P2 — MEDIUM
- **Source:** Bug Review (B-003)
- **Severity:** HIGH
- **Verified:** `src/hooks/useConnectionsConfig.ts` lines 120-132 — `setTimeout(() => { scrollIntoView(...) }, 100)` in `location.hash` useEffect with no cleanup function. Each hash change schedules a new timeout. Verified by reading the actual code.
- **Dual-DB Risk:** NO
- **Files:** `src/hooks/useConnectionsConfig.ts`
- **Lines:** 120-132
- **Description:** Rapid clicking of admin connection card hash links creates multiple stale timeouts that all attempt `scrollIntoView` with potentially stale DOM element IDs.
- **Fix Instructions:** Store timeout ID in a ref and add cleanup:
  ```typescript
  const hashTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (location.hash) { ... hashTimer.current = setTimeout(...); }
    return () => clearTimeout(hashTimer.current);
  }, [location.hash]);
  ```
- **Test Guidance:** Rapidly click different admin connection card links. Verify only one scrollIntoView fires.

---

### P-011: DutyPilotMap unguarded `d.lat!` on marker render — T-004
- **Priority:** P2 — MEDIUM
- **Source:** Type Safety Review (T-004)
- **Severity:** HIGH
- **Verified:** `src/pages/DutyPilotMap.tsx` line 757 and similar — `[d.lat!, d.lon!]` in Leaflet `<Marker position>` without null guard. The `!` assertion is on individual driver elements without a preceding null filter. When SSE updates deliver a driver with null coordinates (e.g., mid-update race), the marker silently disappears.
- **Dual-DB Risk:** NO
- **Files:** `src/pages/DutyPilotMap.tsx` (line 757), also `RetrievalMap.tsx` (lines 151, 185), `src/hooks/useRetrievalMap.ts` (line 544)
- **Description:** Non-null assertions on lat/lon without null guards. The filter-based paths (`filter(r => r.pilotLat != null)`) are safe for concurrent state but the direct render path at DutyPilotMap.tsx:757 has no guard at all.
- **Fix Instructions:** Add null guard before rendering markers:
  ```typescript
  {drivers.filter(d => d.lat != null && d.lon != null).map(d => (
    <Marker key={d.id} position={[d.lat!, d.lon!]} icon={driverIcon(d.name)} />
  ))}
  ```
- **Test Guidance:** Verify all driver markers still render. Simulate null lat/lon from SSE, verify no crash and no invisible markers.

---

### P-012: useDataUsage startBroadcasting interval no cleanup — B-008
- **Priority:** P2 — LOW
- **Source:** Bug Review (B-008)
- **Severity:** LOW
- **Verified:** `src/hooks/useDataUsage.ts` lines 93-117 — `setInterval(() => { ... postMessage ... }, 2000)` with no `clearInterval` call and no stop mechanism. The interval runs for tab lifetime once started.
- **Dual-DB Risk:** NO
- **Files:** `src/hooks/useDataUsage.ts`
- **Lines:** 93-117
- **Description:** The demo-mode data usage broadcasting interval fires every 2 seconds for the entire tab lifetime with no cleanup mechanism. Only affects demo mode but represents a lingering timer that is never released.
- **Fix Instructions:** Store the interval ID and add a `stopBroadcasting()` cleanup function. Ensure it's called on component unmount if the hook provides a teardown mechanism.
- **Test Guidance:** Verify demo mode still broadcasts data usage. Verify interval stops on component unmount.

---

## Human Intervention Required

No items from previous cycles were skipped. Cycle 4 fixed all 11 plan items.

---

## Findings Not in Fix Plan

| Finding | Reason |
|---------|--------|
| T-005: useHomeSettings JSON parse type drift | MEDIUM, admin-only, no crash path — log for backlog |
| T-006: AdminContacts `(c as any)[roleFilter]` | MEDIUM, admin-only, no crash path — log for backlog |
| T-007: WindCanvas `zoom as any` type bypass | LOW, cosmetic type mismatch — log for backlog |
| T-008: PilotMarkers `!` chain on computed boolean | LOW, safe in current code — log for backlog |
| P-006 revert (XSS sanitize removed) | False positive in original review — React auto-escapes in JSX |
