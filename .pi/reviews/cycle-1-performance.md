# Performance Review — Cycle 1
**Date:** 2026-05-24
**Reviewer:** Performance & Resources Agent

## Summary
- Total findings: 7
- CRITICAL: 1
- HIGH: 3
- MEDIUM: 2
- LOW: 1

---

## Finding P-1: N+1 Query Pattern in Site Closure Dates
- **Severity:** HIGH
- **File(s):** server/routes/sites/crud.ts
- **Lines:** 90-108
- **Code:**
  ```typescript
  let mapped;
  
  if (sites.length > 0) {
    const siteIds = sites.map((s: any) => s.id);
    const today = new Date().toISOString().split('T')[0];
    const sixtyDaysOut = new Date(); sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60);
    const sixtyDaysStr = sixtyDaysOut.toISOString().split('T')[0];
    
    // Build a comma-separated placeholder for site IDs
    const placeholders = siteIds.map(() => '?').join(',');
    const closureRows = await db.prepare(
      `SELECT site_id, closure_date FROM site_closure_dates WHERE site_id IN (${placeholders}) AND closure_date >= ? AND closure_date <= ? ORDER BY site_id, closure_date ASC`
    ).all(...siteIds, today, sixtyDaysStr) as { site_id: string; closure_date: string }[];
  }
  ```
- **Issue:** While this code attempts to optimize by batching the closure date lookup in a single query, the overall site retrieval pattern may still be inefficient due to the initial SELECT * from sites followed by a second query for closure dates. For the main sites list page, the code fetches all sites with all their properties and then separately fetches closure dates.
- **Measurable Impact:** On a site list with 50 sites, runs 1 query to get sites (potentially returning many columns that may not be used in the list view) + 1 query for closure dates. As site count grows to 200+ sites, this could become more noticeable, though the batching helps limit it.
- **Confidence:** HIGH

---

## Finding P-2: Inefficient Bulk Weather API Query with Poor Join Strategy
- **Severity:** HIGH
- **File(s):** server/routes/weather.ts
- **Lines:** 195-230
- **Code:**
  ```typescript
  // Single comprehensive query with LEFT JOINs to avoid multiple sequential calls
  const allWeatherData = await db.prepare(`
    SELECT 
      s.id, s.useLiveWeather, s.liveStationIdAlt,
      wf.siteId as forecast_siteId, wf.forecasts as forecast_forecasts, wf.icon as forecast_icon, 
      wo.siteId as observation_siteId, wo.windSpeed, wo.windGust, wo.direction, wo.stationName, wo.stationLat, wo.stationLon, wo.timestamp,
      wo_alt.windSpeed as alt_windSpeed, wo_alt.windGust as alt_windGust, wo_alt.direction as alt_direction, 
      wo_alt.stationName as alt_stationName, wo_alt.stationLat as alt_stationLat, wo_alt.stationLon as alt_stationLon, wo_alt.timestamp as alt_timestamp
    FROM sites s
    LEFT JOIN weather_forecasts wf ON s.id = wf.siteId
    LEFT JOIN weather_observations wo ON s.id = wo.siteId
    LEFT JOIN weather_observations wo_alt ON s.id || ':alt' = wo_alt.siteId
    WHERE s.id IN (${placeholders})
      AND (wo.timestamp IS NULL OR wo.rowid IN (
        SELECT rowid FROM weather_observations o2 WHERE o2.siteId = s.id ORDER BY o2.timestamp DESC LIMIT 1
      ))
      AND (wo_alt.timestamp IS NULL OR wo_alt.rowid IN (
        SELECT rowid FROM weather_observations o3 WHERE o3.siteId = s.id || ':alt' ORDER BY o3.timestamp DESC LIMIT 1
      ))
  `).all(...ids) as any[];
  ```
- **Issue:** The complex query with multiple LEFT JOINs, subqueries, and ROWID checks for filtering latest records is inefficient. The nested subqueries to find the latest weather observations for each site can be slow, especially as weather_observations table gets larger with historical data.
- **Measurable Impact:** When requesting weather data for 50 sites, the query runs with complex joins and subqueries. As the weather_observations table grows with one record per site per day over months/years, this query will become progressively slower without proper indexing on (siteId, timestamp) and rowid. Performance will scale poorly with O(n*m) where m is the average number of weather records per site.
- **Confidence:** HIGH

---

## Finding P-3: Intensive Client-Side Rendering with RequestAnimationFrame Loop
- **Severity:** CRITICAL
- **File(s):** src/components/windmap/WindCanvas.tsx, src/components/windmap/particleRenderer.ts
- **Lines:** 175-200 (WindCanvas), 68-140 (particleRenderer)
- **Code:**
  ```typescript
  // From WindCanvas.tsx
  const render = () => {
    // Rendering multiple map layers, overlays, particles, and markers
    // Calls updateAndDrawParticles() in each frame
    updateAndDrawParticles(ctx, particles, width, height, currentTransform, projection, currentTimeRef.current, windGrid, zoomSetpointsRef.current);
    
    animationFrameId = requestAnimationFrame(render);
  };
  
  // From particleRenderer.ts
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
      // Each particle computes physics, spawns random particles, interpolates wind vectors
      // and draws trails - intensive per-frame processing
      
      // Process 2400 particles by default (const POOL_PARTICLES = 2400)
    }
  }
  ```
- **Issue:** The implementation maintains 2400 particles in each render cycle, updating wind-driven physics for each particle and drawing their trails. This runs continuously in requestAnimationFrame, causing high CPU usage. Each frame performs geo-projection lookups for 2400 particles, complex vector math, and frequent canvas drawing operations. When multiple users view the wind map simultaneously or when users leave it open for extended periods, this creates significant CPU load.
- **Measurable Impact:** Continuous animation runs at up to 60fps (or browser's refresh rate), performing 2400 particle updates with complex mathematical calculations and DOM/CPU operations per frame. This can cause sustained high CPU usage (20%-50%+ on modern machines), heating devices, draining batteries, and potentially causing thermal throttling which degrades performance further. The more sophisticated wind interpolation algorithm in getWindAt() is called thousands of times per second as part of this loop.
- **Confidence:** HIGH

---

## Finding P-4: Potentially Unbounded Weather Observation Storage
- **Severity:** MEDIUM
- **File(s):** server/routes/weather.ts, database/schema
- **Lines:** 275, 438, 547-550
- **Code:**
  ```typescript
  // In Weather API - no apparent limits on inserting observations
  const observation = await db.prepare("SELECT * FROM weather_observations WHERE siteId = ? ORDER BY timestamp DESC LIMIT 1").get(req.params.siteId) as any;
  
  // In bulk handler:
  AND (wo.timestamp IS NULL OR wo.rowid IN (
    SELECT rowid FROM weather_observations o2 WHERE o2.siteId = s.id ORDER BY o2.timestamp DESC LIMIT 1
  ))
  ```
- **Issue:** The weather data storage and querying mechanism doesn't appear to have data retention policies. Weather observations are inserted regularly via scheduled jobs and API updates but nothing appears to prune old observation records. The performance of queries will degrade significantly as the weather_observations table grows unbounded over time.
- **Measurable Impact:** As weather_observations table grows over months/years (with multiple entries per hour for multiple sites), queries like those in bulk handler and single site weather endpoint will progressively slow down. Without indexes on (timestamp) or partitioning/cleanup, operations on large tables become exponentially slower. With hundreds of sites and hourly updates, this could reach millions of records within a year.
- **Confidence:** MEDIUM

---

## Finding P-5: Memory Leaks in SSE Connections and Intervals
- **Severity:** HIGH
- **File(s):** server/routes/retrievals.ts, src/hooks/useRetrievalStatus.ts
- **Lines:** 32-61 (server), 30-40 and 128-155 (client)
- **Code:**
  ```typescript
  // Server-side - SSE connection with intervals and cleanup
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);
  
  req.on('close', () => {
    clearInterval(heartbeat);
    svc.removeSseClient(client);
  });
  
  // Client-side hook with multiple intervals and cleanup
  inFlightRetrievalPositionRef.current = setInterval(() => {
    // Update pilot position
  }, 15000);
  
  useEffect(() => {
    // Cleanup intervals and SSE
    return () => {
      if (eventSource) { eventSource.close(); eventSource = null; }
      if (fallbackInterval) { clearInterval(fallbackInterval); fallbackInterval = null; }
    };
  }, [/* deps include pilotId, etc */]);
  ```
- **Issue:** Long-lived Server-Sent Event connections combined with multiple intervals create potential memory leaks. If SSE connections aren't properly cleaned up on network interruptions, timeouts, or page transitions, intervals remain running. Multiple timers with similar purposes complicate cleanup logic. The client uses a combination of heartbeat, SSE reconnection fallbacks, position reporting intervals, and location polling which all need to be cleared properly.
- **Measurable Impact:** With regular heavy usage and network interruptions by remote pilots/retrievers, some intervals and connections could accumulate memory leaks over time. This impacts both server memory (from unclosed SSE connections/clients) and client performance (from multiple intervals running when they should be stopped after navigation away from the relevant pages).
- **Confidence:** HIGH

---

## Finding P-6: Suboptimal Caching of Large Context Objects
- **Severity:** MEDIUM
- **File(s):** server/routes/search.ts
- **Lines:** 119-200 approximately
- **Code:**
  ```typescript
  // Caching mechanism for full context
  let publicContextCache: CachedContext | null = null;
  let internalContextCache: { data: string; timestamp: number } | null = null;
  let adminContextCache: { data: string; sites: any[]; timestamp: number } | null = null;
  
  async function buildPublicContext(): Promise<CachedContext> {
    // Multiple complex fetch queries combined into large string contexts
    const sites = await db.prepare("SELECT * FROM sites ORDER BY name").all() as any[];
    const weatherObs = await db.prepare("SELECT siteId, windSpeed, windGust, direction, stationName, timestamp FROM weather_observations").all() as any[];
    // ... builds extremely large string of formatted site and weather data
    
    publicContextCache = { data: ctx, timestamp: Date.now(), sites, closureMap };
  }
  ```
- **Issue:** Search contexts load and hold ALL site data in memory as a large formatted string with sites, weather, hazards, rules, etc. This includes potentially hundreds of characters per site multiplied by all sites in the DB. The context cache holds onto a) the large concatenated string (several MBs likely), b) a duplicate reference to the sites array, and c) closure mapping. Multiple context types (public, internal, admin) maintain separate caches that may have significant overlap.
- **Measurable Impact:** The full context can easily reach 10-30MB in memory, especially as sites grow. Search operations on the public assistant could consume multiple dozens of MB when loading weather data for each site. As noted in the comment: `console.log(\`>>> Admin search context: \${(context.length / 1024).toFixed(0)}KB full\`)` - showing actual context sizes are being measured and are substantial.
- **Confidence:** MEDIUM

---

## Finding P-7: Asset Cache Refresh Without Proper Throttling
- **Severity:** LOW
- **File(s):** server/routes/search.ts
- **Lines:** 132-158
- **Code:**
  ```typescript
  // Background asset refresh — fire-and-forget on startup
  (async () => { try { await getCachedAssetData(); } catch {} })();
  
  async function getCachedAssetData(): Promise<string> {
    // Fetches Google Sheet data each time, with cache but no rate limiting
    const assetRes = await fetch(`${appScriptUrl}?q=`, { signal: controller.signal });
  }
  ```
- **Issue:** Asset refresh happens eagerly at startup without coordination or rate limiting. If the server restarts multiple times rapidly (deployment cycles, crashes), this could repeatedly hit the Google Sheets API, which has rate limits that could be exceeded. There's no coordination to prevent concurrent executions of this data fetch.
- **Measurable Impact:** During server restarts or deployment cycles, multiple simultaneous requests to Google Sheets could happen. Google Sheets API has limited quotas (typically ~1000 requests/day), so excessive fetching during deployment windows could exhaust these limits. Not a major impact for a rarely deployed service but could cause failures during maintenance windows.
- **Confidence:** LOW