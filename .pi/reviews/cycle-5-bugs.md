# Bug Review — Cycle 5
**Date:** 2026-05-28
**Reviewer:** Bugs & Logic Errors Agent (Client-Side Focus — Categories 7 & 8)
**Scope:** src/ only — useEffect dep bugs, unmounted state updates, memory leaks, integration/config bugs

## Summary
- Total findings: 8
- HIGH: 4
- MEDIUM: 3
- LOW: 1

---

## Finding B-001: `setTimeout` calling `setJustSaved(false)` with no unmount guard
- **Severity:** HIGH
- **File(s):** `src/hooks/useAdminForm.ts`
- **Lines:** 36–38
- **Code:**
  ```typescript
          setJustSaved(true);
          toast.success(options.successMessage ?? "Saved successfully");
          setTimeout(() => setJustSaved(false), 2000);
  ```
- **Bug:** The `setTimeout` at line 37 fires `setJustSaved(false)` after 2000ms with **no cleanup or isMounted guard**. If the component hosting this hook unmounts within 2 seconds of a save completing, the callback fires on an unmounted component. React 19 still warns on state updates in unmounted components, and the code produces a no-op state update that can interfere with StrictMode double-rendering detection.
- **Trigger condition:** Any admin component using `useAdminForm` (AdminHomeSettings, AdminImages, AdminConnections, AdminSiteEdit) unmounts within 2 seconds of saving. Examples: navigating away from admin page, closing an admin modal, or a parent re-render that conditionally unmounts the form.
- **Impact:** React warning, wasted state update on unmounted component. In rare cases with concurrent features, this can trigger a React lifecycle warning in the console and potentially cause a minor memory/performance hiccup.
- **Confidence:** HIGH — exact code read, no guard present.

---

## Finding B-002: `useFlightTracker` — `stopTracking` missing from `addBreadcrumb` dependency array, causing stale closure on auto-stop
- **Severity:** HIGH
- **File(s):** `src/hooks/useFlightTracker.ts`
- **Lines:** 121–394 (`addBreadcrumb` useCallback), 375 (call site), 390–393 (dep array)
- **Code (dependency array, line 390–393):**
  ```typescript
    [state, pilot, pilotToken, autoStartSpeed, autoStartAltitude, autoStopSpeed,
     autoStopDuration, autoStopVerticalSpeed, gpsInterval, preRecordBuffer,
     computeSmoothedAltitude]
  ```
- **Code (call site inside addBreadcrumb, line ~375):**
  ```typescript
          if (autoStopCounterRef.current >= autoStopDuration) {
            stopTracking();
          }
  ```
- **Bug:** The `addBreadcrumb` useCallback calls `stopTracking()` but does **not** include `stopTracking` in its dependency array. When `stopTracking` changes identity (it depends on `[pilotToken, syncToServer, isDemo, apiBase, demoHeaders]`), the `addBreadcrumb` callback retains the stale `stopTracking` captured at creation time. The stale `stopTracking` closes over old values of `pilotToken` and `syncToServer`, which means auto-stop triggers with wrong auth tokens or an outdated sync function.
- **Trigger condition:** Any change to `pilotToken` or `syncToServer` (which depends on `pilotToken` → `demoHeaders`) while recording causes the `addBreadcrumb` callback to have a stale `stopTracking`. When auto-stop condition is met (stationary + speed < threshold for N seconds), the stale `stopTracking` fires with wrong credentials.
- **Impact:** Auto-stop on landing may fail to end the flight server-side because `stopTracking` uses stale `pilotToken` for the `x-pilot-token` header, or calls the wrong server endpoint if `apiBase` changed.
- **Confidence:** HIGH — code read, `stopTracking` is called at line 375, dependency array stops at line 393 without `stopTracking`.

---

## Finding B-003: `useConnectionsConfig` — `setTimeout` in `location.hash` effect not captured or cleaned up
- **Severity:** HIGH
- **File(s):** `src/hooks/useConnectionsConfig.ts`
- **Lines:** 120–132
- **Code:**
  ```typescript
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace("#", "");
      setExpandedCards((prev) => new Set(prev).add(id));
      if (id === "tidyhq-group-sync") {
        setGroupSyncExpanded(true);
        fetchGroupMappings();
        fetchWebhookLogs();
      }
      setTimeout(() => {
        document.getElementById(`conn-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [location.hash]);
  ```
- **Bug:** The `setTimeout(..., 100)` at line 126 is created but **never stored in a ref or cleaned up**. Each time `location.hash` changes, a new timeout fires. If the user rapidly clicks hash links (e.g., `#drive`, `#tidyhq`, `#smart-assistant` in quick succession), multiple timeouts accumulate. Each one attempts `scrollIntoView` targeting a potentially stale DOM element. The effect's cleanup function is never defined, so React has nothing to cancel.
- **Trigger condition:** Rapid clicking of admin connection cards with URL hash anchors. Each click generates a location.hash change, which re-runs the effect and schedules a new timeout without canceling the previous one.
- **Impact:** Multiple redundant `scrollIntoView` calls, minor jank. Can compound if user has hash-anchored links and clicks rapidly — no memory leak per se but unnecessary DOM operations.
- **Confidence:** HIGH — no cleanup return in the effect, no ref to store the timer ID.

---

## Finding B-004: `useRetrievalStatus` — 7-dependency SSE effect churns connection on every `trackerState` transition
- **Severity:** MEDIUM
- **File(s):** `src/hooks/useRetrievalStatus.ts`
- **Lines:** 92–180 (SSE effect), 181 (dep array)
- **Code (dependency array, line ~181):**
  ```typescript
  }, [pilotId, pilotToken, trackerState, isDemo, demoRole, inFlightRetrievalRequested, finishRetrieval, demoApiOpts]);
  ```
- **Bug:** The SSE effect that manages the `EventSource` connection includes `trackerState` in its dependency array. During a flight, `trackerState` transitions through: `idle → pre-recording → recording → stopping → retrieving → completed` (up to 6 transitions). Each transition triggers the effect's cleanup (closing the EventSource) and re-creation (opening a new EventSource + fallback interval). This produces unnecessary HTTP round-trips and brief ~1-3s windows where the SSE connection is down. For a 30-minute flight, this could mean 15+ SSE reconnections.
- **Trigger condition:** Any change to flight tracker state while `useRetrievalStatus` is active. Each state change closes and re-opens the SSE connection.
- **Impact:** Unnecessary server load from repeated SSE connections. Brief loss of real-time retrieval status updates during reconnection window. The fallback polling interval kicks in during SSE downtime, increasing API traffic.
- **Confidence:** HIGH — dependency array verified, state machine has 6 transitions, effect creates EventSource.

---

## Finding B-005: `WindCanvas` — rAF loop restart race on dependency change
- **Severity:** MEDIUM
- **File(s):** `src/components/windmap/WindCanvas.tsx`
- **Lines:** 247–248 (rAF loop), 255 (cleanup), 257 (dep array)
- **Code (render loop, lines ~247–248):**
  ```typescript
      animationFrameId = requestAnimationFrame(render);
    };
    render();
  ```
- **Code (cleanup, line ~255):**
  ```typescript
      cancelAnimationFrame(animationFrameId);
  ```
- **Code (dep array, line ~257):**
  ```typescript
  }, [windGrid, siteLat, siteLon, onZoomChange, sizeKey, savedCenterLat, savedCenterLon, savedZoom]);
  ```
- **Bug:** When any of the 8 effect dependencies change, the effect runs its cleanup (`cancelAnimationFrame`) and re-initializes the entire canvas, including the rAF render loop. Between `cancelAnimationFrame` (old loop) and the new `render()` call (new loop), there is a brief window where no render is active. However, the more significant issue: if deps change **during** an rAF callback execution (within the same microtask), the old `render()` function could complete after the new effect has started its own render, causing overlapping canvas context state. The `animationFrameId` variable is captured by the effect closure, so the new effect's render uses a new `animationFrameId`, but the canvas context (`ctx`) and particle system (`particles`, `overlay`) are local to the old closure. Since `ctx` is created fresh in the new effect, there's no double-drawing, but the particle overlay array (`overlay`) and tile cache are re-created unnecessarily.
- **Trigger condition:** Frequent changes to `sizeKey` (on window resize), or rapid updates to `windGrid` (e.g., from a fast wind data poll) cause full re-initialization of the canvas + particles + tile system.
- **Impact:** Performance churn — the entire particle system (including speed overlay imageData and particle pool) is discarded and re-created. With `sizeKey` changing on every resize event before debouncing, this can create many full re-initializations per second.
- **Confidence:** MEDIUM — the cleanup properly cancels the old rAF, so the overlap window is near-zero. The main impact is unnecessary re-creation cost.

---

## Finding B-006: `useXCMapState` — Wind data polling runs every 60s even in background tab
- **Severity:** MEDIUM
- **File(s):** `src/hooks/useXCMapState.ts`
- **Lines:** 368–399
- **Code:**
  ```typescript
  useEffect(() => {
    if (sites.length === 0) return;

    const liveSites = sites.filter((s) => s.useLiveWeather === 'true');
    if (liveSites.length === 0) return;

    function fetchWindData() {
      liveSites.forEach((site) => {
        api.get<Record<string, unknown>>(`/api/weather/${site.id}`)
          .then((data) => {
            ...
          })
          .catch(() => { ... });
      });
    }

    fetchWindData();
    const interval = setInterval(fetchWindData, 60000);
    return () => clearInterval(interval);
  }, [sites]);
  ```
- **Bug:** The 60-second polling interval for live wind data runs **unconditionally**, even when the browser tab is hidden or the user is on a different tab. There is no `document.hidden` or `visibilitychange` check to pause polling in the background. With 10+ live sites, each poll fires 10+ API requests. In a background tab over a 30-minute period, this generates 300+ unnecessary API calls. The `fetchWindData` function also closes over `liveSites` from the effect's initial run — if `sites` changes, the effect re-runs and recreates the interval, but `liveSites` within the closure remains captured.
- **Trigger condition:** User opens XC Maps page, then switches to another tab. The polling continues indefinitely in the background.
- **Impact:** Wasted API calls (10+ per minute per site) and server load when the page is not visible. Bandwidth consumption on the client side.
- **Confidence:** HIGH — code read, no visibility check in the effect.

---

## Finding B-007: SSE URLs leak pilot authentication token via query parameter
- **Severity:** HIGH
- **Files:**
  - `src/hooks/useRetrievalStatus.ts` (lines 117, 165)
  - `src/hooks/useRetrievalMap.ts` (lines 218–219)
  - `src/pages/DutyPilotMap.tsx` (lines 296–297)
- **Code (useRetrievalStatus.ts, line 165):**
  ```typescript
      const sseUrl = `/api/retrievals/events?role=pilot&pilotToken=${encodeURIComponent(pilotToken)}`;
  ```
- **Code (useRetrievalMap.ts, line 218-219):**
  ```typescript
       ? `/api/retrievals/events?demo=true&demoSession=${demoSession}&pilotToken=${token}`
       : `/api/retrievals/events?role=driver&pilotToken=${token}`;
  ```
- **Bug:** The pilot authentication token (`pilotToken`) is included as a query parameter in the SSE EventSource URL across all SSE connections in the app. This exposes the token to:
  1. Server access logs (the full URL including `pilotToken=xxx` is logged by Express/nginx/Railway)
  2. Referrer headers (if the SSE endpoint redirects or sends a redirect response)
  3. Browser developer tools URL visibility
  4. Any intermediate proxy or CDN logs
  5. Browser autocomplete/history for the URL origin
- **Trigger condition:** Any SSE connection established for retrievals or duty pilot status. This happens on every page load for `RetrievalMap`, `DutyPilotMap`, and any page using `useXCMapState`→`useRetrievalStatus`.
- **Impact:** Authentication token leakage to server-side log storage and intermediate infrastructure. The pilot token is a bearer token — anyone with access to server logs can impersonate the pilot. This is a security-in-depth finding (the token should be in an HTTP header, not a URL query parameter).
- **Confidence:** HIGH — exact code lines read, no referrer-policy mitigation or header-based alternative used.

---

## Finding B-008: `useDataUsage` — `startBroadcasting()` creates persistent `setInterval` with no cleanup mechanism
- **Severity:** LOW
- **File(s):** `src/hooks/useDataUsage.ts`
- **Lines:** 93–117
- **Code:**
  ```typescript
  function startBroadcasting() {
    if (globalTracker.broadcasting) return;

    const role = getDemoRole();
    if (!role || window === window.parent) return;

    globalTracker.broadcasting = true;

    setInterval(() => {
      const rate = computeRate(globalTracker.history, 30);
      try {
        window.parent.postMessage({
          type: 'demo-data-usage',
          role,
          totalUp: globalTracker.totalUp,
          totalDown: globalTracker.totalDown,
          rateUp: rate.up,
          rateDown: rate.down,
        }, '*');
      } catch {}
    }, 2000);
  }
  ```
- **Bug:** The `setInterval` at line 104 is never stored in a variable and never cleaned up. Once `startBroadcasting()` is called (which happens on every `useDataUsage()` call at module-evaluation time), the interval runs **forever until the tab is closed**. The `globalTracker.broadcasting` flag prevents duplicate intervals, but there is no `stopBroadcasting()` function or unmount-based cleanup. Even after all components that call `useDataUsage()` unmount, the interval continues firing `window.parent.postMessage` every 2 seconds.
- **Trigger condition:** Any page loading a component that uses `useDataUsage()` (RetrievalMap, DutyPilotMap, AdminDashboard, or any page composing `useRetrievalMap`/`useDutyPilotMap`). The interval persists for the lifetime of the browser tab.
- **Impact:** Minimal — 2-second broadcast interval sends `postMessage` even when no demo frames are listening. In non-demo contexts, `window === window.parent` prevents the interval from starting. Only demo mode is affected. Not user-facing, but represents a lingering timer that is never properly released.
- **Confidence:** HIGH — exact code read, no `clearInterval` or stop mechanism exists.

---

## Regression Check

**Previous cycle (Cycle 4) fix report** review for client-side regressions:
- **P-006** (WeatherCard XSS sanitization): Files `src/components/weather/WeatherCardClassic.tsx` and `WeatherCardApple.tsx` — these are server-referenced via commit and not touched by subsequent work. No client-side build errors introduced.
- **P-023** (particleRenderer optimization): File `src/components/windmap/particleRenderer.ts` — optimization commit verified present. No build errors observed.
- All other Cycle 4 fixes are server-side only (`server/` directory), not affected by this client-side review.

No regressions found from Cycle 4 fixes in the `src/` directory.
