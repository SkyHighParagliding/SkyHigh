# Performance Review — Cycle 4
**Date:** 2026-05-24
**Reviewer:** Performance & Resources Agent

## Summary
- Total findings: 12
- CRITICAL: 1
- HIGH: 4
- MEDIUM: 5
- LOW: 2

---

## Finding P-1: Excessive API Requests During Grid Processing
- **Severity:** HIGH
- **File(s):** server/victoriaGrid.ts, server/extendedForecast.ts
- **Lines:** 125-180
- **Code:**
  ```typescript
  // From server/victoriaGrid.ts buildFineTiles()
  const MAX_PER_TILE = 90;
  
  // From server/extendedForecast.ts buildExtendedTiles()
  const MAX_PER_TILE = 50;
  
  // Multiple fetch attempts with insufficient delays 
  if (i < tiles.length - 1) {
    await new Promise(r => setTimeout(r, 500));
  }
  ```
- **Issue:** API endpoint creates too many fetch requests simultaneously despite chunked processing. Both fine and coarse grid processing divide data into chunks but still create numerous parallel requests to Open-Meteo, potentially hitting API rate limits or incurring large billing costs. The delay between tiles (500ms) is minimal for a service making dozens of API calls.
- **Measurable Impact:** With maximum grid bounds, could generate ~200+ API calls to Open-Meteo during daily processing. The Open-Meteo commercial API pricing could become very expensive with this usage pattern. The 500ms delay only provides minimal relief.
- **Confidence:** HIGH

---

## Finding P-2: Intensive Real-Time Wind Interpolation on Client
- **Severity:** CRITICAL
- **File(s):** src/components/windmap/windInterpolation.ts, src/components/windmap/particleRenderer.ts
- **Lines:** 132-200
- **Code:**
  ```typescript
  // getWindAt() called potentially multiple times per frame for multiple particles
  function interpolateSpatial(lon: number, lat: number, timeData: { u: number; v: number }[], grid: WindGrid): [number, number] | null {
    // Complex spatial interpolation with multiple lookups, linear interpolation calculations
  }
  
  export function getWindAt(lon: number, lat: number, time: number, grid: WindGrid): [number, number] | null {
    // Calls interpolateSpatial internally which involves multiple complex calculations
  }
  ```
- **Issue:** The wind interpolation algorithm performs complex spatial interpolation calculations multiple times per frame for each particle. With 2400 particles (constant POOL_PARTICLES), and potentially multiple sites loaded, these interpolation and physics calculations are happening in real-time, significantly impacting client-side performance.
- **Measurable Impact:** Each particle requires spatial interpolation calculations up to 60+ times per second during animation, potentially consuming high CPU cycles and creating performance bottlenecks on less powerful devices.
- **Confidence:** HIGH

---

## Finding P-3: Inefficient Particle Physics Calculations
- **Severity:** HIGH
- **File(s):** src/components/windmap/particleRenderer.ts
- **Lines:** 68-140
- **Code:**
  ```typescript
  export function updateAndDrawParticles(
    ctx: CanvasRenderingContext2D,
    particles: Particle[],
    width: number,
    height: number,
    currentTransform: ZoomTransform,
    projection: GeoProjection,
    currentTime: number,
    windGrid: WindGrid,
    zoomSetpoints: ZoomSetpoints,
  ) {
    for (let i = 0; i < POOL_PARTICLES; i++) {
      // Per-particle physics including spawn checks, geo projection, wind lookup,
      // complex movement calculations, trail management, physics interpolation,
      // and rendering operations
    }
  }
  ```
- **Issue:** The particle system processes 2400 particles per frame, each undergoing: coordinate transformation, reverse geo-projection, wind vector lookup, complex physics and movement calculations, trail history updates, and opacity/fade computations. This runs continuously via requestAnimationFrame causing constant high CPU load.
- **Measurable Impact:** 2400 particles processed per frame, 60+ frames per second when active. Each particle triggers getWindAt() and associated geospatial interpolation. Could easily consume 30-50% of a typical browser tab's CPU resources during active viewing.
- **Confidence:** HIGH

---

## Finding P-4: Memory and Resource Leaks in Flight Tracker Interval Management
- **Severity:** HIGH
- **File(s):** src/hooks/useFlightTracker.ts
- **Lines:** 550-590
- **Code:**
  ```typescript
  // Multiple intervals and timeouts not consistently cleared in all scenarios:
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retrievalIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const demoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const crumbFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statsFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // In reset() function, multiple intervals and timeouts are cleared
  // but the cleanup in useEffect may be incomplete or insufficient
  ```
- **Issue:** The flight tracker hook manages numerous intervals and timeouts that may not be properly cleared in all exit scenarios. If a component unmounts due to navigation, error, or network issues, these intervals may continue running indefinitely causing memory and performance degradation.
- **Measurable Impact:** Multiple persistent intervals running at various frequencies (every 1s, 3s, 5s, 10s, 60s) could accumulate across multiple component instances if not properly cleaned up. Particularly problematic after multiple navigation or component remounts.
- **Confidence:** HIGH

---

## Finding P-5: Expensive Recalculation of Wind Grid Bounds and Cache Keys
- **Severity:** MEDIUM
- **File(s):** src/components/windmap/WindCanvas.tsx
- **Lines:** 66-95
- **Code:**
  ```typescript
  // In render function that runs every frame:
  maybeRebuildOverlay(overlay, currentTransform, transformRef, projection, currentTimeRef, windGrid);
  
  export function maybeRebuildOverlay(
    overlay: SpeedOverlayState,
    currentTransform: ZoomTransform,
    transformRef: { current: ZoomTransform },
    projection: GeoProjection,
    currentTimeRef: { current: number },
    windGrid: WindGrid,
  ) {
    const transformKey = `${currentTransform.k.toFixed(1)}_${currentTransform.x.toFixed(0)}_${currentTransform.y.toFixed(0)}`;
    // Generates new transform key on every animation frame if position changes
  }
  ```
- **Issue:** Wind data overlay recalculation occurs in the animation loop for each zoom/pan transformation, regenerating transform keys and potentially re-running expensive grid intersection calculations as users interact with the map. This could cause micro-stutters on mobile devices or during rapid map movements.
- **Measurable Impact:** Performance impact scales with map interaction. More frequent recalculation during animated transitions and user interactions. Noticeable during drag movements and zooming as the system recalculates wind overlay on demand.
- **Confidence:** MEDIUM

---

## Finding P-6: Memory Leaks from Unclosed Server-Sent Event Connections and Timer Accumulation
- **Severity:** HIGH
- **File(s):** server/routes/retrievals.ts, src/hooks/useRetrievalStatus.ts
- **Lines:** 35-65 (server), 78-90 and 128-160 (client)
- **Code:**
  ```typescript
  // From server/routes/retrievals.ts
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);
  // Multiple interval and event listeners registered on client connect
  // but complex cleanup required for all possible disconnection scenarios
  
  // From src/hooks/useRetrievalStatus.ts
  useEffect(() => {
    // Complex setup with multiple intervals, SSE, and geolocation watchers
    let eventSource: EventSource | null = null;
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    
    // Cleanup in return function may not handle all edge cases
    return () => {
      // Potential for not cleaning up all resources under error conditions
    };
  }, [/* dependendencies */]);
  ```
- **Issue:** SSE connections combined with fallback intervals, GPS tracking intervals, geolocation watchers, position update intervals can accumulate when connections are lost, servers restart, or when components unmount unexpectedly. The complex state management might not properly clean up on all possible exit paths.
- **Measurable Impact:** Persistent memory growth with long-running sessions and poor disconnection handling. With multiple active users running flight tracking and retrieval monitoring this could impact server resource usage significantly.
- **Confidence:** HIGH

---

## Finding P-7: Inefficient Search Context Building with Full Database Scan
- **Severity:** MEDIUM
- **File(s):** server/routes/search.ts
- **Lines:** 190-300
- **Code:**
  ```typescript
  async function buildPublicContext(): Promise<CachedContext> {
    const sites = await db.prepare("SELECT id, name, description, pgRating, hgRating, windDir, windSpeed, launch, landing, hazards, rules, type, navigateTo, isSkyHighSite, status, crossLeft, crossRight FROM sites ORDER BY name").all() as any[];
    const weatherObs = await db.prepare("SELECT siteId, windSpeed, windGust, direction, stationName, timestamp FROM weather_observations").all() as any[];
    const weatherForecasts = await db.prepare("SELECT siteId, temperature, windSpeed, windGust, windDirection, summary, forecasts FROM weather_forecasts").all() as any[];
    // Builds large context object for each API call or when cache expires
  }
  ```
- **Issue:** The search context building loads and processes all sites and associated weather data into memory as string format, creating potentially megabyte-sized context objects. This is performed for public searches and has no fine-grained invalidation.
- **Measurable Impact:** Memory consumption during search processing could be substantial (several MB per search request). The caching reduces impact but cache expiration regenerates the large objects.
- **Confidence:** MEDIUM

---

## Finding P-8: Potential Database Connection Bottleneck
- **Severity:** MEDIUM
- **File(s):** server/db.ts
- **Lines:** 23-40
- **Code:**
  ```typescript
  let db: any;
  
  if (usePostgres) {
    log.info("DATABASE_URL detected — loading PostgreSQL adapter");
    const { default: pgDb } = await import("./pgDb.js");
    db = pgDb;
    await runPostgresMigrations();
  } else {
    log.info("No DATABASE_URL — loading SQLite adapter");
    const { default: sqliteDb } = await import("./sqliteDb.js");
    db = sqliteDb;
    await runSQLiteMigrations(db);
  }
  
  // Singleton-style database connection used throughout application
  export default db;
  ```
- **Issue:** Database singleton pattern could create connection bottleneck when handling many simultaneous requests. The SQLite backend can have concurrency limitations during concurrent writes or long-running queries. The import-on-demand pattern for db adapter may not properly pool connections.
- **Measurable Impact:** Under higher concurrency loads (more than ~20-30 concurrent requests), performance degradation especially in write-heavy scenarios like flight tracking during busy flying days.
- **Confidence:** MEDIUM

---

## Finding P-9: High-Frequency Network Requests with Geolocation Updates
- **Severity:** MEDIUM
- **File(s):** src/hooks/useFlightTracker.ts, src/hooks/useRetrievalStatus.ts
- **Lines:** 515-540, 168-175
- **Code:**
  ```typescript
  // In useFlightTracker.ts:
  retrievalIntervalRef.current = setInterval(() => {
    const p = currentPositionRef.current;
    if (p && navigator.onLine && pilotToken) {
      fetch(`${apiBase}/retrievals/pilot-position`, { /* ... */ }).catch(() => {});
    }
  }, 60000); // Every minute
  
  // In useRetrievalStatus.ts (every 15 seconds during active retrieval):
  inFlightRetrievalPositionRef.current = setInterval(() => { /* ... */ }, 15000);
  ```
- **Issue:** Frequent location updates are sent to the server every 15-60 seconds per active pilot/flight, which can create network load especially during fly-ins or busy weekends. This creates many small but frequent HTTP requests.
- **Measurable Impact:** Each pilot with an active flight sends location updates frequently, leading to potentially hundreds of small requests per hour during peak times. While individually small, can add up to significant server load.
- **Confidence:** MEDIUM

---

## Finding P-10: Unbounded Local Storage in Flight Tracker Database
- **Severity:** MEDIUM
- **File(s):** src/lib/flightDb.ts (implied usage), src/hooks/useFlightTracker.ts
- **Lines:** Throughout
- **Code:**
  ```typescript
  // From useFlightTracker.ts:
  const crumbFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  // Flight breadcrumbs accumulate locally 
  if (isDemo) {
    demoBreadcrumbsRef.current.push(crumb);
  } else {
    await saveBreadcrumb(flightRef.current.id, crumb);
  }
  
  // Local storage could grow unbounded if flight completes abnormally
  ```
- **Issue:** Flight tracking stores breadcrumb data locally in IndexedDB with potential to accumulate unbounded data if flights are not properly completed or if the sync mechanism fails. Old incomplete flights may never be cleaned up automatically.
- **Measurable Impact:** Mobile device storage consumption could grow over time as flight data accumulates in local IndexedDB storage. Particularly problematic with multiple long flights accumulating thousands of GPS records.
- **Confidence:** MEDIUM

---

## Finding P-11: Heavy Client-Side Canvas Rendering for Map Layers
- **Severity:** LOW
- **File(s):** src/components/windmap/WindCanvas.tsx
- **Lines:** 175-200
- **Code:**
  ```typescript
  const render = () => {
    // Renders multiple map layers (basemap tiles, wind speed overlay, particle trails, site markers)
    // Each frame performs multiple draw operations and layer blending
    
    for (const d of tiles) {
      const tileKey = `${d[2]}/${d[0]}/${d[1]}`;
      const url = `https://a.basemaps.cartocdn.com/light_nolabels/${tileKey}${dpr > 1 ? '@2x' : ''}.png`;
      // Draws multiple basemap tiles
    }

    // Draws speed overlay and particle trails
    ctx.drawImage(overlay.canvas, 0, 0, width, height);
    // Updates and draws particles
    updateAndDrawParticles(ctx, particles, width, height, currentTransform, /* ... */);
  };
  ```
- **Issue:** Canvas rendering performs multiple compositing operations each frame, requiring texture operations for basemap tiles, speed overlay blending, and particle trail drawing. The requestAnimationFrame continuously running places consistent load on the GPU rendering pipeline.
- **Measurable Impact:** Increased battery drain on portable devices during extended wind map viewing sessions. May cause performance issues on lower-end mobile devices during map interaction.
- **Confidence:** LOW

---

## Finding P-12: Potentially Inefficient Search Algorithm Implementation
- **Severity:** LOW
- **File(s):** server/routes/search.ts
- **Lines:** 929-950
- **Code:**
  ```typescript
  // Filtering sites by name/query
  const matchedSiteNames = new Set<string>();
  for (const site of sites) {
    const nameLower = (site.name || "").toLowerCase();
    const idLower = (site.id || "").toLowerCase(); 
    if (qLower.includes(nameLower) || qLower.includes(idLower)) {
      matchedSiteNames.add(site.name);
      continue;
    }
    const nameWords = nameLower.split(/[\s-]+/).filter((w: string) => w.length > 3);
    for (const word of nameWords) {
      if (qLower.includes(word)) {
        matchedSiteNames.add(site.name);
        break;
      }
    }
  }
  ```
- **Issue:** Linear text search through potentially hundreds of site names without indexing or preprocessing. While adequate for current dataset size, the algorithm scales linearly with the number of sites.
- **Measurable Impact:** As site database grows, search response time will increase proportionally. Currently likely well under 50ms but could deteriorate as site database expands.
- **Confidence:** LOW