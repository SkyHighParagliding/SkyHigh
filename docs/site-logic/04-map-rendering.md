# Wind & Thermal Map Rendering — Decisions, Thresholds, and Defaults

---

## Zoom Floor and Pan Bounds

### Zoom floor = COVER, not contain
- **What it is:** The minimum zoom scale `k` is computed as `Math.max(width/extW, height/extH)` (COVER), not `Math.min` (contain). The user can never zoom out past the edge of the data grid — no blank basemap margin appears on any viewport shape.
- **Why (the decisions):** [inferred from code comment] "Contain" is intuitive but wrong in practice: on a portrait phone against a wide, short grid rectangle (12.7° × 6.4° on 375 × 733 px) it leaves ~60% of the screen height showing empty basemap above and below the data band. COVER ensures the binding axis always reaches the data edge and the slack axis is reached by panning.
- **How (the mechanism):** `coverScale(extW, extH, w, h) = Math.max(w / extW, h / extH)` in `src/components/windmap/mapExtent.ts:66`. Called as `floorK` in `MapCanvas.tsx:255`. The ceiling is `256 * 2^20`; a cap at `maxK` prevents `scaleExtent` from inverting when a pathologically small grid asks for a floor above the ceiling (`MapCanvas.tsx:254`). Floor is recomputed on every `ResizeObserver` event so portrait→landscape rotation doesn't leave the floor stale (`MapCanvas.tsx:400`).
- **Principles:** Decisions stay with the human; Refuse rather than improvise at the edges; Deliberate, explained differences; Traceable to code

### Cover-centre from projected midpoint, not geographic midpoint
- **What it is:** The default pan centre at minimum zoom is the midpoint of the projected world-space bounding box, not `projection([midLon, midLat])`.
- **Why (the decisions):** [inferred from code comment] Mercator is non-linear in latitude. The geographic mid-latitude projects *above* the projected box midpoint — by 0.07° on the production rectangle, and a full degree on tall rectangles. At the zoom floor there is zero slack on the binding axis, so that offset leaves a sliver of blank basemap on one side.
- **How (the mechanism):** `gridWorldCenter(projection, bounds)` in `src/components/windmap/mapExtent.ts:81-87`: `[(tl[0]+br[0])/2, (tl[1]+br[1])/2]` in projected world coordinates. Used in `MapCanvas.tsx:278-284` as the initial pan centre.
- **Principles:** One source of truth per rule; Deliberate, explained differences

### Maximum zoom ceiling: z20
- **What it is:** The d3-zoom scale is capped at `256 * 2^20`.
- **Why (the decisions):** [inferred] Standard web tile ceiling. Prevents the zoom from escaping the translate extent, which is computed in projected space and would wrap around or produce nonsense beyond this.
- **How (the mechanism):** `const maxK = 256 * Math.pow(2, 20)` in `MapCanvas.tsx:251`. Passed to `d3Zoom.scaleExtent([minK, maxK])`.
- **Principles:** Refuse rather than improvise at the edges

### Single-site default zoom: z9
- **What it is:** When the map is opened in single-site mode (0 or 1 marker), the initial zoom is zoom level 9 (`256 * 2^9`).
- **Why (the decisions):** [inferred] Shows enough geographic context (several km radius) for a single site without the entire state. Multi-site mode uses the admin-saved zoom or the grid cover floor.
- **How (the mechanism):** `singleSiteZoom={9}` in `WindCanvas.tsx:187` and `ThermalCanvas.tsx:335`. Clamped through `clampK` before use (`MapCanvas.tsx:266`).
- **Principles:** Deliberate, explained differences

---

## CARTO Basemap

### CARTO tile source: `light_nolabels`
- **What it is:** The basemap tiles are CARTO's `rastertiles/light_nolabels` style — near-white with faint grey road/river linework, no place-name text.
- **Why (the decisions):** [inferred from code comment and DECISION-015] A near-white basemap maximises contrast for the warm-coloured thermal and speed overlays. Labels are excluded from this layer so they can be drawn *on top* of the overlay as a separate toggle, keeping them legible at any overlay intensity.
- **How (the mechanism):** URL template in `MapCanvas.tsx:450`: `https://basemaps.cartocdn.com/rastertiles/light_nolabels/${z}/${x}/${y}[@2x].png?key=VITE_CARTO_API_KEY`. Retina tiles are requested when `devicePixelRatio > 1`.
- **Principles:** Separate facts from judgements; Surface, don't hide

### In-memory tile cache: 200 tiles (LRU by insertion order)
- **What it is:** MapCanvas holds a `Map<string, HTMLImageElement>` capped at 200 entries. When a new tile is added and the map is at capacity, the oldest-inserted key is evicted (Map insertion-order LRU, no re-insertion on access).
- **Why (the decisions):** [inferred] CARTO tiles cannot be intercepted by the service worker (CORS blocks `Sec-Fetch-Dest: empty` requests; only native `<img>` elements work). An in-memory cache is the only option. 200 tiles covers many viewport states without unbounded growth; the eviction strategy is insertion-order (simpler than LRU re-insertion) because CARTO tiles are cheap network fetches and the eviction rate under normal panning is very low.
- **How (the mechanism):** `const TILE_CACHE_MAX = 200` in `MapCanvas.tsx:12`. Eviction in `loadTile` at `MapCanvas.tsx:305-308`: `tileCache.delete(tileCache.keys().next().value!)`.
- **Principles:** One source of truth per rule; Refuse rather than improvise at the edges

### CARTO excluded from service-worker tile cache
- **What it is:** The service worker (`public/sw.js`) does NOT intercept CARTO CDN requests, even though it caches OSM/OpenTopoMap/ArcGIS and terrarium elevation tiles.
- **Why (the decisions):** CARTO's CORS policy blocks requests fetched via the Fetch API (`Sec-Fetch-Dest: empty`). Only native `<img>` elements load them (`Sec-Fetch-Dest: image`). Intercepting them in the SW would cause every CARTO tile to return a CORS error.
- **How (the mechanism):** The `TILE_DOMAINS` predicate in `public/sw.js:29-33` and `isTerrainTile` function `sw.js:43-48` are deliberately narrow and exclude `basemaps.cartocdn.com`. Comment at line 15-21 explains the caveat explicitly.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide

### Town-name labels: separate `light_only_labels` tile layer, drawn on top
- **What it is:** When the pilot enables town names, CARTO's `light_only_labels` tiles (text-only, ~1 KB each) are drawn *after* the overlay and *after* the multiply re-pass so place names float on top of all data layers.
- **Why (the decisions):** Drawing names before the overlay would bury them under the heat/speed colours. Sharing cache keys with basemap tiles (`"L" + tileKey`) avoids a second 200-tile slot for what are essentially the same tile coordinates.
- **How (the mechanism):** `showLabelsRef` ref checked per frame in `MapCanvas.tsx:480-491`. URL pattern: `rastertiles/light_only_labels/...`. Cache key prefixed `"L"` to avoid collision with the basemap entries. Toggle persisted to `localStorage('skyhigh.showMapLabels')` in `SitesWindMap.tsx:108`.
- **Principles:** Surface, don't hide; Deliberate, explained differences

---

## Base-Map Detail Slider (Multiply Re-pass)

### Basemap re-drawn with `multiply` composite to darken linework back in
- **What it is:** After the overlay layers are painted, if the pilot's "base map detail" slider is above zero, the CARTO basemap tiles are drawn a second time with `globalCompositeOperation = 'multiply'` and `globalAlpha = basemapIntensity`. This darkens roads/rivers/borders back in over the colour without dimming the overlay colours.
- **Why (the decisions):** The near-white basemap linework is washed out by the translucent overlay. `multiply` blending multiplies the destination pixel by the source pixel, leaving near-white background almost unchanged (multiplying by ~1) while reinforcing the dark map lines (multiplying by ~0.3). Fading the overlay was rejected (DECISION-015) because it dims the weather data.
- **How (the mechanism):** Tiles collected during the first pass into `drawnTiles[]` (`MapCanvas.tsx:456`). Second pass at `MapCanvas.tsx:469-475`: `ctx.globalCompositeOperation = 'multiply'`, `ctx.globalAlpha = basemapIntensity`. `basemapIntensity` is a ref so slider drag updates the running frame loop without a React re-render.
- **Principles:** Separate facts from judgements; Surface, don't hide; Traceable to code

### Admin floor/ceiling band per map — constrains slider range
- **What it is:** Admins can set a `[floor%, ceil%]` band independently for the wind and thermal maps (Admin → Forecast → "Base-map detail range"). The pilot's 0–1 slider position is mapped into that band: `effective = floor + position * (ceil - floor)`.
- **Why (the decisions):** The two overlays bury the basemap by different amounts — the wind map's opaque speed ramp covers more than the thermal map's warm translucent heat field. A single global slider range cannot suit both. The floor ensures a minimum of detail is always visible without requiring the pilot to hunt for the right position; the ceiling caps it for maps where more detail is never needed.
- **How (the mechanism):** Settings keys `windBasemapDetailFloorPct`, `windBasemapDetailCeilPct`, `thermalBasemapDetailFloorPct`, `thermalBasemapDetailCeilPct` defined in `src/pages/AdminForecast.tsx:45-48` (defaults: 0 / 100). Mapped in `SitesWindMap.tsx:93-100`: `basemapIntensityRef.current = lo + pos * (hi - lo)`. State persisted to `localStorage('skyhigh.basemapIntensity')`.
- **Principles:** Decisions stay with the human; One source of truth per rule; Deliberate, explained differences

---

## Thermal Colour Scale

### W* colour stops: concentrated in 0.8–2.4 m/s, LUT size 512, max 5 m/s
- **What it is:** The thermal heat ramp runs from pale yellow (W* ~0.3) through gold/orange to dark crimson (W* 4+), with colour stops dense between 0.8 and 2.4 m/s. Encoded as a 512-entry LUT (look-up table) covering 0–5 m/s.
- **Why (the decisions):** [from code comment] The large majority of cells on a normal day fall between p25≈1.4 and p75≈2.0 m/s. An evenly-spaced ramp across 0–4 wastes most of its range on values that essentially never occur and flattens the part pilots actually read. The LUT of 512 entries quantises to ~0.01 m/s steps, which is negligible against the ~0.1 m/s accuracy of the forecast.
- **How (the mechanism):** `STOPS[]` array in `thermalRenderer.ts:172-182`; `const LUT_SIZE = 512; const LUT_MAX_WSTAR = 5.0` at `thermalRenderer.ts:184-185`; LUT built at `thermalRenderer.ts:189-204`. `wstarToLUTIndex` at `thermalRenderer.ts:206-208`.
- **Principles:** Separate facts from judgements; Deliberate, explained differences

### Minimum W* gate: 0.3 m/s (admin-tunable)
- **What it is:** Heat colour is only painted when `effectiveWstar >= tuning.minWstar`. Below this threshold the pixel alpha is either zero (clear sky) or shows the grey overcast sheet if cloud is present.
- **Why (the decisions):** [inferred] Sub-0.3 m/s thermals are too weak to be significant for glider pilots and are often numerical noise. Suppressing them keeps the map clear on calm days without creating grey noise at the colour floor.
- **How (the mechanism):** `if (ws >= tuning.minWstar)` guard in `thermalRenderer.ts:450`. Default `minWstar: 0.3` in `DEFAULT_THERMAL_TUNING` at `thermalRenderer.ts:90`. Overridable via `settings.thermalMinWstar` in `ThermalCanvas.tsx:98`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences; One source of truth per rule

### Legend max W*: 3.0 m/s (not the LUT max of 5.0)
- **What it is:** The legend bar is normalised to 3.0 m/s so the full hue travel is visible across the bar's width, rather than 4.0+ which would compress all the colour into the left ~75%.
- **Why (the decisions):** [from code comment] The legend is for orientation — pilots need to read relative strength quickly. Showing the full range to 5 m/s collapses the readable range to one corner.
- **How (the mechanism):** `export const LEGEND_MAX_WSTAR = 3.0` in `thermalRenderer.ts:213`. Used in `THERMAL_LEGEND_CSS` gradient at `thermalRenderer.ts:216-223`.
- **Principles:** Surface, don't hide; Deliberate, explained differences

### Thermal raster sample grid: every 6 px (CELL = 6)
- **What it is:** The thermal heatmap is rasterised by sampling one geographic point per 6×6 px block, then upscaled to fill the viewport.
- **Why (the decisions):** [inferred from code comment on CELL] 6 px gives a smooth heatmap at lower computational cost than 1-px sampling. Finer would be invisible after the blur (blurPx=5 in `drawThermalOverlay`); coarser would show visible block artefacts at pilot zoom levels.
- **How (the mechanism):** `export const CELL = 6` in `thermalRenderer.ts:163`. Overlay dimensions are `Math.ceil(width/CELL) × Math.ceil(height/CELL)` in `createThermalOverlay:290`. Exported for use by `cumulusField.ts`.
- **Principles:** Deliberate, explained differences

### Thermal overlay rebuild throttle: 50 ms minimum interval
- **What it is:** The thermal raster is rebuilt at most once every 50 ms. A pending rebuild is also deferred by exactly 50 ms and fires when the interval clears.
- **Why (the decisions):** [inferred] The full rebuild iterates every overlay cell (~25,000 for a 1200×800 viewport) and calls `getThermalAt` per cell. Rebuilding on every animation frame (16 ms) would keep one CPU core at 100% during panning. 50 ms is ~20 fps — smooth enough that the raster re-registers quickly after a pan ends.
- **How (the mechanism):** `const REBUILD_MIN_INTERVAL = 50` in `thermalRenderer.ts:164`. Enforced in `maybeRebuildThermalOverlay:590-603` with `performance.now() - overlay.lastRebuild > REBUILD_MIN_INTERVAL`.
- **Principles:** Deliberate, explained differences

### Thermal overlay blur: 5 px Gaussian
- **What it is:** The thermal raster is drawn with a `blur(5px)` CSS filter, softening the 6-px cell boundaries into a smooth gradient.
- **Why (the decisions):** [inferred] The per-cell step size of 6 px creates visible block boundaries at pilot zoom levels. A 5 px blur is large enough to hide them while small enough that spatial structure (a narrow thermal column) remains visible.
- **How (the mechanism):** `blurPx: 5` option passed to `drawRegistered` in `thermalRenderer.ts:342`. Applied via `ctx.filter = 'blur(5px)'` in `groundRegistration.ts:69`.
- **Principles:** Deliberate, explained differences

### Grid edge fade: 1° longitude / 0.5° latitude
- **What it is:** Thermal pixels within 1° of the east/west grid edges and 0.5° of the north/south edges have their alpha multiplied by an `edgeFade` ramp (0 at the edge → 1 inside). All per-cell quantities (heat alpha, overcast strength, cumulus depth) are premultiplied by this fade.
- **Why (the decisions):** [inferred from code comment] Without a fade the overlay has a hard rectangular clip at the grid boundary, which reads as an artefact rather than a data limit, especially when the grid is cropped against the screen. The asymmetric 1°/0.5° values match the typical aspect ratio of the grid (wider than tall).
- **How (the mechanism):** `edgeFade` computed in `thermalRenderer.ts:392-399`; multiplied into `overcastArr`, `cumulusDepth`, and `heatA` before use.
- **Principles:** Surface, don't hide; Assume the safest reading when context is missing

---

## Wind Speed Overlay

### Wind speed colour stops: 0–30 kt range, LUT size 256, max 50 kt
- **What it is:** The wind speed heatmap maps speed in knots to colour through 10 stops (purple-blue-green-yellow-orange-red) across 0–30 kt. The LUT covers 0–50 kt, leaving the top 20 kt in the dark red-purple range reserved for severe conditions.
- **Why (the decisions):** [inferred] The 0–30 kt range covers the flying-condition window for glider pilots. Stop density is highest in the 9–20 kt band where the transition from flyable to marginal matters most. Values beyond 30 kt are uniformly "unflygable" and sharing one colour reduces alarm fatigue.
- **How (the mechanism):** `SPEED_COLOR_STOPS[]` in `windInterpolation.ts:130-141`; `const SPEED_LUT_SIZE = 256; const SPEED_LUT_MAX_KTS = 50` at `windInterpolation.ts:143-144`. Legend gradient normalised to 20 kt (`windMapTypes.ts:55-59`).
- **Principles:** Deliberate, explained differences; Separate facts from judgements

### Wind overlay alpha: 0.5 constant
- **What it is:** The speed heatmap raster is composited over the basemap at 50% alpha (`globalAlpha = 0.5`).
- **Why (the decisions):** [inferred] Lets the CARTO basemap show through for geographic orientation, while making the colour signal strong enough to read at a glance.
- **How (the mechanism):** `alpha: 0.5` in `drawSpeedOverlay`'s call to `drawRegistered` at `particleRenderer.ts:266-271`. Wind overlay sample grid is 5 px (`CELL = 5` at `particleRenderer.ts:186`).
- **Principles:** Deliberate, explained differences

### Wind overlay rebuild throttle: 80 ms minimum interval
- **What it is:** The wind speed raster is rebuilt at most once every 80 ms (vs 50 ms for thermal).
- **Why (the decisions):** [inferred] The wind raster is simpler per-cell (no cloud/overcast/rain compositing) so 80 ms is still responsive. A longer throttle reduces CPU use during panning.
- **How (the mechanism):** `const OVERLAY_REBUILD_MIN_INTERVAL = 80` in `particleRenderer.ts:187`. Same deferred-rebuild pattern as thermal.
- **Principles:** Deliberate, explained differences

### Wind canvas sample grid: every 5 px (CELL = 5)
- **What it is:** The wind heatmap samples one point per 5×5 px block (vs thermal's 6 px).
- **Why (the decisions):** [inferred] The wind overlay does not apply blur, so finer sampling is needed to avoid visible blocks.
- **How (the mechanism):** `const CELL = 5` in `particleRenderer.ts:186`.
- **Principles:** Deliberate, explained differences

---

## Wind Particle Trails

### Particle pool: 2400 particles, trail length 60 frames
- **What it is:** The particle system pre-allocates a pool of 2400 particles, each storing a trail of up to 60 screen-position history frames. Active count and trail length both taper with zoom via the setpoints curve.
- **Why (the decisions):** [inferred] 2400 is the pool ceiling — the z10 setpoint uses all 2400; lower zoom levels use fewer to prevent crowding at the larger geographic scale. 60 trail frames is the maximum; shorter trails are selected at low zoom to reduce clutter.
- **How (the mechanism):** `const POOL_PARTICLES = 2400; const POOL_TRAIL = 60` in `particleRenderer.ts:18-19`. Active count capped with `Math.min(POOL_PARTICLES, sp.particleCount)` at line 74.
- **Principles:** Deliberate, explained differences; One source of truth per rule

### Particle zoom setpoints: z0 / z5 / z10 with linear interpolation
- **What it is:** Particle speed, trail length, count, line width, and opacity are defined at three zoom anchor points (display levels 0, 5, 10) and linearly interpolated in between.
- **Why (the decisions):** [inferred] At low zoom the map covers hundreds of km; many particles at full trail length make a dense texture that hides geographic features. At high zoom fewer particles with shorter trails makes individual wind vectors readable.
- **How (the mechanism):** `DEFAULT_ZOOM_SETPOINTS` in `windMapTypes.ts:15-19`; `interpolateSetpoint` in `windInterpolation.ts:167-186`; `zoomKToDisplaySmooth` converts d3 `k` to a 0–10 display level at `windInterpolation.ts:188-191`.
- **Principles:** Deliberate, explained differences; Surface, don't hide

### Particle stall guard: squared-speed threshold 0.0001 (= 0.01 m/s)²
- **What it is:** Particles with `u²+v² < 0.0001` (wind speed below 0.01 m/s) are skipped rather than advancing — they would not visibly move and dividing by speed to get the unit direction vector would give NaN or infinity.
- **Why (the decisions):** [inferred from comment] Avoids a `0/0` division. Comparing squared values avoids the `Math.sqrt` call for particles that will be skipped anyway.
- **How (the mechanism):** `if (speedMsSq < 0.0001) continue` in `particleRenderer.ts:118`. Comment explains the squared comparison.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing

### Particle speed cap: 2.5× the normalised scale
- **What it is:** The per-step move distance is `sp.speed * p.speedMultiplier * Math.min(speedMs / 3.0, 2.5)`. The `Math.min(speedMs/3.0, 2.5)` term caps the contribution of raw wind speed at 2.5× (equivalent to ~7.5 m/s).
- **Why (the decisions):** [inferred] Without a cap, extreme wind speeds (>7.5 m/s) would produce trail streaks long enough to cross the viewport in a single frame, making the flow unreadable.
- **How (the mechanism):** `Math.min(speedMs / 3.0, 2.5)` in `particleRenderer.ts:124`.
- **Principles:** Refuse rather than improvise at the edges; Deliberate, explained differences

### Thermal-map wind trails: dark navy, 0.55 opacity scale
- **What it is:** When wind trails are shown on the thermal map, they are dark navy (`rgb(15, 23, 42)`) at 55% the normal opacity, rather than the white used on the wind map's dark basemap.
- **Why (the decisions):** [from code comment] White trails are invisible against the pale grey CARTO basemap and warm-orange heat raster. Dark near-navy reads against both extremes; reduced opacity keeps the flow legible without competing with the heat field pilots are actually reading.
- **How (the mechanism):** `const THERMAL_WIND_TRAIL_STYLE = { rgb: '15, 23, 42', opacityScale: 0.55 }` in `ThermalCanvas.tsx:27`. Passed to `updateAndDrawParticles` as the `style` argument.
- **Principles:** Deliberate, explained differences; Surface, don't hide

### Particle MARGIN: 80 px beyond viewport edge
- **What it is:** Particles are spawned and allowed to travel up to 80 px outside the canvas boundary before being despawned.
- **Why (the decisions):** [inferred] Prevents a visible "birth ring" of new particles appearing at the viewport edge when the user is stationary. Particles originating slightly off-screen enter the view mid-trail.
- **How (the mechanism):** `const MARGIN = 80` in `particleRenderer.ts:20`. Used in `spawnRandom` bounds and the despawn condition at `particleRenderer.ts:91`.
- **Principles:** Surface, don't hide

### Wind info readout throttle: 100 ms (10 fps)
- **What it is:** The tapped-point wind info (speed, direction, ground elevation) is emitted to the parent at most once per 100 ms.
- **Why (the decisions):** [inferred from code comment in WindCanvas] The readout runs inside the rAF loop (60 fps). Emitting parent state at 60 fps would re-render the UI 60 times/second for a value pilots cannot read faster than a few Hz.
- **How (the mechanism):** `if (now - lastWindInfoUpdateRef.current > 100)` in `WindCanvas.tsx:126`. Same `<= 100` check in `ThermalCanvas.tsx:266`.
- **Principles:** Deliberate, explained differences; One source of truth per rule

---

## High/Low Resolution Wind Grid Blend Zone

### Blend zone: 8× the fine-grid cell size, linear taper
- **What it is:** When a fine (high-resolution) and wide (low-resolution) grid are both present, wind values blend linearly from the fine grid (inner region) to the wide grid (outside) over a transition band of `8 * max(deltaLon, deltaLat)` degrees.
- **Why (the decisions):** [inferred] A hard boundary between grids would produce a visible seam in both the speed heatmap and particle trails. The blend distance of 8 cells provides a smooth transition without wasting the fine-grid data too far from the edge.
- **How (the mechanism):** `const blendDeg = Math.max(grid.deltaLon, grid.deltaLat) * 8` in `windInterpolation.ts:106`. Blend weight `t = dEdge / blendDeg` clamped 0–1 at `windInterpolation.ts:115`. Fine grid used exclusively when `dEdge >= blendDeg` (`windInterpolation.ts:113`).
- **Principles:** Deliberate, explained differences; One source of truth per rule

---

## Cloud and Overcast Rendering

### Clear-sky gate: 12% low cloud (CU_CLOUD_MIN_PCT)
- **What it is:** Below 12% low-cloud cover the sky reads as effectively clear — the cumulus glyph lattice is drawn at full density and no grey sheet appears. This threshold corresponds to BOM "few" (1–2 oktas, ~12.5–25%).
- **Why (the decisions):** [from code comment] 12% is roughly one-eighth cover: isolated puffs rather than a broken deck. Below this the sky looks clear to a pilot.
- **How (the mechanism):** `export const CU_CLOUD_MIN_PCT = 12` in `thermalRenderer.ts:18`. Used as the lower bound of `cuCoverage` ramp at `thermalRenderer.ts:435`.
- **Principles:** Deliberate, explained differences; One source of truth per rule

### Overcast onset: 70% low cloud (OVERCAST_MIN_PCT)
- **What it is:** The grey overcast wash begins appearing at 70% low-cloud cover (BOM "broken", 5–7 oktas, ~62–87%).
- **Why (the decisions):** [from code comment] 70% is "broken" — the sky is more covered than clear, and pilots on the ground would call it overcast.
- **How (the mechanism):** `export const OVERCAST_MIN_PCT = 70` in `thermalRenderer.ts:25`. Used in `rebuildThermalOverlay:427` as `tuning.overcastOnsetPct`.
- **Principles:** Deliberate, explained differences; One source of truth per rule; Assume the safest reading when context is missing

### Overcast saturation: 95% low cloud (OVERCAST_FULL_PCT)
- **What it is:** Above 95% low-cloud cover the grey sheet is fully opaque (before the opacity multiplier). The ramp from 70→95% gives a smooth transition rather than a hard cliff.
- **Why (the decisions):** [from code comment] 95% is "overcast" (8 oktas minus a thin gap) — essentially no direct sun.
- **How (the mechanism):** `export const OVERCAST_FULL_PCT = 95` in `thermalRenderer.ts:33`. Ramp formula: `clamp01((overcastPct - onset) / (full - onset))` in `thermalRenderer.ts:427`.
- **Principles:** Deliberate, explained differences; One source of truth per rule

### Overcast suppression gate: 0.35 normalised strength (OVERCAST_SUPPRESS_MIN)
- **What it is:** A cell with normalised overcast strength ≥ 0.35 (roughly 79% low cloud on the 70→95% ramp) is considered a solid grey sheet. Cumulus glyphs are suppressed; the readout labels the state "suppressed" rather than "reduced".
- **Why (the decisions):** [from code comment] Below this the deck is "scattered cumulus" — above it is a solid sheet. Real cumulus cannot form under an advected stratus deck. Using the `< 1.0` threshold (full saturation) was wrong: edge cells premultiplied by `edgeFade` can never reach 1.0, so suppression would have silently never fired near the grid boundary.
- **How (the mechanism):** `export const OVERCAST_SUPPRESS_MIN = 0.35` in `thermalRenderer.ts:54`. Checked at `thermalRenderer.ts:506` (heat branch) and in `cumulusField.ts:297` (glyph gate).
- **Principles:** Refuse rather than improvise at the edges; Deliberate, explained differences; One source of truth per rule

### Overcast grey RGB: (150, 154, 160)
- **What it is:** The overcast sheet is painted in this specific near-neutral grey.
- **Why (the decisions):** [inferred] The tone sits between white (basemap) and mid-grey (overcast sky), distinguishable from both the heat ramp colours and the basemap background. A bluer grey would read as sky; a yellower grey would read as thermal. Neutral reads as "cloud cover".
- **How (the mechanism):** `const greyR = 150; const greyG = 154; const greyB = 160` in `thermalRenderer.ts:472`. Also used in the ws < 0.3 branch at `thermalRenderer.ts:534-536`.
- **Principles:** Deliberate, explained differences

### Overcast grey blend factor: 0.75 of heat colour (admin-tunable overcastOpacity)
- **What it is:** At full saturation, the grey sheet blends 75% over the heat colour (not 100%), leaving a faint heat tint visible. Default is 0.75; admin-tunable.
- **Why (the decisions):** [from code comment] At 0.5 the grey washed out insufficiently; at 1.0 the heat ramp was entirely erased at high cloud. 0.75 gives grey dominance (visually it replaces solar input) while still allowing pilots to see that the boundary layer is loaded even with weak thermals.
- **How (the mechanism):** `const greyBlend = overcastArr[cellIdx] * tuning.overcastOpacity` in `thermalRenderer.ts:471`. Default `overcastOpacity: 0.75` in `DEFAULT_THERMAL_TUNING` at `thermalRenderer.ts:93`. Admin-tunable via `settings.thermalOvercastOpacity`.
- **Principles:** Deliberate, explained differences; Decisions stay with the human

### Overcast sheet alpha floor: 115 / 255 ≈ 45% (OVERCAST_SHEET_ALPHA_FLOOR)
- **What it is:** When a grey overcast sheet is present, the pixel alpha is clamped to at least 115 (45%) regardless of the heat ramp's contribution, so the grey reads on pale basemaps.
- **Why (the decisions):** [from code comment] Raised from 90 (35%) to 115 after the near-onset grey was imperceptible. The lowest non-zero heat stop is W*=0.3 → alpha=70 (27%), so a floor of 115 sits above it: the grey can never be less opaque than the heat ramp would have been on its own at these cloud levels. Capped below the 0.80 heat stop alpha (125) so the floor doesn't out-paint the heat ramp.
- **How (the mechanism):** `export const OVERCAST_SHEET_ALPHA_FLOOR = 115` in `thermalRenderer.ts:41`. Applied with `Math.max(baseAlpha, sheetFloor)` at `thermalRenderer.ts:488` and `Math.max(sheetAlpha, OVERCAST_SHEET_ALPHA_FLOOR)` at `thermalRenderer.ts:539`.
- **Principles:** Surface, don't hide; Deliberate, explained differences; Refuse rather than improvise at the edges

### Total cloud ≥ 90% triggers overcast sheet even if `cloudLow` is low
- **What it is:** The overcast percentage used for the grey sheet is `max(cloudLow, totalCloud >= 90 ? totalCloud : 0)`. High-level altostratus (≥90% total cover) triggers the sheet regardless of what `cloudLow` reports.
- **Why (the decisions):** [from code comment] Models don't always classify blocking sheets as "low cloud". A ≥90% total cover is a blocking sheet regardless of height; the formula catches it without lowering the cloudLow threshold, which would flood the map with grey on days with high cirrus.
- **How (the mechanism):** `Math.max(th.cloudLow, (th.cloud !== undefined && th.cloud >= 90) ? th.cloud : 0)` in `thermalRenderer.ts:422-425`. Mirrored in `SitesWindMap.tsx:64-66`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges; One source of truth per rule

### Pre-TASK-036 grid degradation: cuCoverage defaults to 1.0
- **What it is:** When a grid was cached before TASK-036 (cloud fields absent), `cuCoverage` is filled to `1.0` for every cell, drawing the full cumulus lattice at maximum density — exactly the pre-TASK-036 behaviour.
- **Why (the decisions):** [from code comment] New grid fields must not change the map's appearance on existing cached data. Degradation lives in the values (a uniform `1.0` coverage) rather than in conditional branches in the drawing code.
- **How (the mechanism):** `cuCoverage.fill(1)` before the cell loop in `thermalRenderer.ts:373`. Cells with real `cloudLow` data overwrite this; cells without do not. `cumulusField.ts:323-324` notes the degradation path.
- **Principles:** One source of truth per rule; Refuse rather than improvise at the edges

---

## Cumulus Glyph Lattice

### Screen-space lattice pitch: ~23.1 px horizontal, ~10.3 px vertical
- **What it is:** The cumulus cloud marks are drawn on a fixed screen-space lattice, not anchored to geographic coordinates. Horizontal pitch is `2.7 * CU_R_NOM ≈ 23.1 px`; vertical pitch is `1.2 * CU_R_NOM ≈ 10.3 px`.
- **Why (the decisions):** [from code comment] An earlier version anchored the lattice geographically; at lower zoom levels spacing became coarse and the field read as sparse dots. Fixed screen pitch keeps the field equally dense at every zoom — the texture reads as cloud cover, not a grid. The asymmetric pitches match the cumulus glyph's own asymmetry (2.7r wide, 1.2r tall).
- **How (the mechanism):** `const CU_R_NOM = 3.8 * CU_SIZE; const GLYPH_X_SPACING = 2.7 * CU_R_NOM; const GLYPH_Y_SPACING = 1.2 * CU_R_NOM` in `cumulusField.ts:83-85`.
- **Principles:** Deliberate, explained differences; Surface, don't hide

### Brick (hex) row stagger: half X-pitch on odd rows
- **What it is:** Every second row is offset right by half the horizontal pitch, preventing the glyphs from reading as aligned columns.
- **Why (the decisions):** [from code comment] Aligned columns make the stipple look like a data grid rather than cloud texture. Brick packing matches the idiom Windy uses for its cumulus marks.
- **How (the mechanism):** `const stagger = ((j % 2) + 2) % 2 === 1 ? GLYPH_X_SPACING / 2 : 0` in `cumulusField.ts:279`. The `((j%2)+2)%2` expression handles negative lattice indices correctly (standard non-negative modulo).
- **Principles:** Deliberate, explained differences; Traceable to code

### Glyph density draw probability: p = 0.2 + 0.8 × meanCoverage
- **What it is:** Each lattice point is drawn with probability `p = 0.2 + 0.8 * meanCoverage`, where `meanCoverage` is the block-MEAN of `cuCoverage` over the lattice cell. A deterministic hash of the absolute lattice indices decides each glyph.
- **Why (the decisions):** [from code comment] Before TASK-036 scattered and solid cumulus were indistinguishable. The 0.2 floor ensures even marginal cumulus areas always show some glyphs (a completely blank region looks like blue sky, which is wrong when there IS some cloud). MEAN rather than MAX because coverage is an areal fraction — a mostly-sparse block should draw as sparse. The deterministic hash keyed on `(i, j)` means the same glyphs survive a pan without shimmering.
- **How (the mechanism):** `const drawProb = 0.2 + 0.8 * Math.min(1, Math.max(0, meanCoverage))` in `cumulusField.ts:336`. `latticeHash(i, j)` at `cumulusField.ts:182-191` (MurmurHash3 finalise step). `>>> 0` forces unsigned before division — mandatory for negative indices.
- **Principles:** Surface, don't hide; Deliberate, explained differences; Refuse rather than improvise at the edges

### Cumulus depth sample: block-MAX over lattice cell
- **What it is:** Whether a glyph is drawn at all is determined by the maximum `cumulusDepth` value within the overlay cells covered by the lattice cell, not the centre cell or the mean.
- **Why (the decisions):** [from code comment] Depth is a "don't miss a small patch" signal: one overlay cell with non-zero depth means real cloud is present in the block. The right error for a hazard signal is to show it. Contrast with coverage, where the mean is used because "50% coverage block" should draw as 50% dense.
- **How (the mechanism):** Block-MAX loop at `cumulusField.ts:307-313`. Compared with `depth <= 0` guard at line 314.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences

### Cumulus glyph size and opacity ramp: saturates at 600 m depth
- **What it is:** Glyph radius is `(2.0 + t * 1.8) * CU_SIZE` and opacity is `0.6 + t * 0.35`, where `t = min(1, depth / 600)`. Depth is BLH − CCL in metres.
- **Why (the decisions):** [from code comment] The earlier 1200 m cap crushed the typical 100–400 m range into a ~1 px size change that read as no change at all. Saturating at 600 m spreads the ordinary range across most of the size/opacity ramp so depth is actually visible. Days with depth > 600 m simply top out.
- **How (the mechanism):** `const t = Math.min(1, depth / 600)` at `cumulusField.ts:347`. Radius/alpha computed at lines 348-349.
- **Principles:** Surface, don't hide; Deliberate, explained differences

### Cumulus depth gate: ≥ 50 m (BLH − CCL)
- **What it is:** A cell only contributes to the cumulus depth array (and thus can show glyphs) when `blh − ccl >= 50 m`.
- **Why (the decisions):** [inferred from code comment about BLH−CCL meaning] A cloud layer shallower than 50 m is sub-model-resolution and likely numerical noise. Requiring 50 m eliminates spurious glyph noise while keeping real shallow cumulus visible.
- **How (the mechanism):** `if (th.ccl != null && th.blh - th.ccl >= 50 && overcastArr[cellIdx] <= OVERCAST_SUPPRESS_MIN)` in `thermalRenderer.ts:506`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing

### No diagonal hatch for overcast — removed
- **What it is:** There is no diagonal hatch texture for overcast cells. Only the grey colour ramp conveys overcast.
- **Why (the decisions):** [from code comment in cumulusField.ts:94-98] A screen-space hatch drifted under pan and added artefacts for no extra information the grey ramp did not already carry. The grey ramp and cumulus suppression together fully encode the three-state sky model (clear / cumulus / overcast).
- **How (the mechanism):** Comment at `cumulusField.ts:94-98` explicitly records the removal decision.
- **Principles:** Deliberate, explained differences; Surface, don't hide

---

## OD (Overdevelopment) Warning Triangles

### CAPE gate for OD: 500 J/kg (admin-tunable stormCapeGate)
- **What it is:** No OD risk is flagged unless CAPE ≥ 500 J/kg, regardless of LI or CIN values.
- **Why (the decisions):** [from code comment] Below this CAPE threshold the atmosphere does not have enough energy for deep convection regardless of what the stability indices say. 500 J/kg is the threshold documented to pilots in the help modal.
- **How (the mechanism):** `if (cape < capeGate) return 0` in `computeOdRisk:143`. Default `stormCapeGate: 500` in `DEFAULT_THERMAL_TUNING:89`. Admin-tunable via `settings.thermalStormCapeGate`.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule; Decisions stay with the human

### OD risk levels: LI → CIN → CAPE-only, in priority order
- **What it is:** Three-rung ladder: (1) if LI is available, use LI < −2 → risk=2, LI < 0 → risk=1; (2) if only CIN is available, CIN < 50 J/kg → risk=1; (3) CAPE > 800 J/kg → risk=1 as last resort.
- **Why (the decisions):** [from code comment] LI is the most direct buoyancy measure aloft and is available on tier-1 and tier-2 grids. CIN measures whether convection can start (weaker signal). CAPE-only is a blunt signal kept only so the warning is never absent when nothing better is available.
- **How (the mechanism):** `computeOdRisk` function in `thermalRenderer.ts:139-161`. CIN threshold 50 J/kg at line 154; CAPE-only threshold 800 J/kg at line 159.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences; Surface, don't hide

### OD triangles fire under grey overcast (not suppressed)
- **What it is:** OD warning triangles are drawn even inside grey overcast regions. The grey glyph suppression that applies to cumulus marks does NOT apply to OD triangles.
- **Why (the decisions):** [from code comment] A loaded atmosphere under stratus is the same OD trap as clear-sky OD — arguably worse because the grey sky suppresses pilot awareness. `ThermalHelpModal.tsx` explicitly promises pilots the triangle fires there.
- **How (the mechanism):** `odRisk[cellIdx] = computeOdRisk(...)` is written for every cell that survives `ws >= minWstar`, with no overcast gate (`thermalRenderer.ts:524`). Pass 2 in `cumulusField.ts:363-366` explicitly states "Hard constraint: triangles must still render INSIDE a grey overcast region."
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide; Refuse rather than improvise at the edges

### OD triangle lattice: 54 px (coarser than cumulus 23.1 px)
- **What it is:** OD warning triangles are drawn on an independent square lattice of 54 px pitch.
- **Why (the decisions):** [from code comment] 54 px is deliberately NOT tied to the cumulus pitch. A widespread OD region at the denser cumulus pitch would become a solid wall of triangles. 54 px keeps it legible as a caution layer rather than a texture.
- **How (the mechanism):** `const OD_SPACING = 54` in `cumulusField.ts:92`. Used for both i/j index ranges and screen-position calculation at lines 373-376.
- **Principles:** Deliberate, explained differences; Surface, don't hide

### OD triangle block sample: block-MAX risk
- **What it is:** The OD risk sampled for each triangle lattice point is the maximum risk value within the overlay block, not the centre cell.
- **Why (the decisions):** [from code comment] At a typical zoom one 0.09° grid cell is ~13 px across while the lattice step is 54 px, so an isolated OD cell has only ~6% chance of containing the centre sample point. Block MAX guarantees any OD cell raises a triangle — the right bias for a hazard signal.
- **How (the mechanism):** Block-MAX loop in `cumulusField.ts:402-408`. Short-circuits at risk=2.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences

---

## Rain Wash

### Rain wash threshold: ≥ 0.1 mm/hr onset, admin-tunable saturation
- **What it is:** A translucent blue wash appears on cells with precipitation ≥ 0.1 mm/hr. It fades in to full strength at `tuning.rainOffMm` (default 1 mm/hr), then stays at the max opacity.
- **Why (the decisions):** [inferred from code comment] Rain usually means little/no lift, so the wash is shown regardless of W*. A 0.1 mm/hr floor excludes drizzle noise and model micro-amounts; 1 mm/hr is where pilots would feel real rain.
- **How (the mechanism):** `const RAIN_WASH_MIN_MM = 0.1` in `thermalRenderer.ts:100`. Wash intensity: `clamp01((precip - 0.1) / max(0.1, rainOffMm - 0.1))` in `thermalRenderer.ts:549`. Default `rainOffMm: 1` and `rainWashOpacity: 0.5` in `DEFAULT_THERMAL_TUNING:90-92`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences; One source of truth per rule

### Rain wash colour: rgb(56, 118, 209) — medium blue
- **What it is:** The rain wash is this specific medium blue, composited source-over the existing pixel (heat/grey/transparent).
- **Why (the decisions):** [inferred] Blue is the conventional weather map colour for precipitation. The specific shade reads as "rain" without being so dark it obscures the heat field underneath.
- **How (the mechanism):** `const RAIN_WASH_RGB = [56, 118, 209]` in `thermalRenderer.ts:101`. Composited with straight-alpha source-over at `thermalRenderer.ts:552-562`.
- **Principles:** Deliberate, explained differences

---

## Land Mask and Coastline

### Client land mask: generated raster from GA GEODATA COAST 100K
- **What it is:** The thermal overlay clips to a baked raster land mask generated from the Geoscience Australia GEODATA COAST 100K 2004 dataset, replacing two independent hand-traced polygon rings that had drifted.
- **Why (the decisions):** [from DECISION-013 / code comment] The old client ring had drifted to trace the Victorian state border, fetching and discarding columns from SA and NSW. Political borders are not weather boundaries. Baked from one authoritative source makes the drift structurally impossible. Also captures Western Port, French Island, Phillip Island, and Wilsons Promontory as real shapes.
- **How (the mechanism):** `import { isOnLand } from "../../../shared/landMask.generated"` in `landMask.ts:30`. `isThermalLand` at `landMask.ts:62` calls `isOnLand` first, then the erosion ring check.
- **Principles:** One source of truth per rule; Deliberate, explained differences; Traceable to code

### Thermal paint inset: 1.5 km erosion from Mean-High-Water coastline
- **What it is:** The thermal overlay's paint boundary is inset ~1.5 km inland from the exact coastline. A cell is paintable only if it and 8 points on a 1.5 km circle around it are all classified as land.
- **Why (the decisions):** [from code comment] Open water has no daytime surface heating; sea breeze suppresses thermals in the coastal strip so W* there is meaningless. Two effects push the visible heat edge seaward: the 5 px render blur smears ~5 px into the water, and a shoreline cell rounds to land at 0.01°. The 1.5 km inset cancels both so heat lands on or just inside the coast.
- **How (the mechanism):** `const THERMAL_INSET_KM = 1.5` in `landMask.ts:53`. Eight-point ring at `landMask.ts:57-60`. `isThermalLand` at `landMask.ts:62-70`.
- **Principles:** Assume the safest reading when context is missing; Deliberate, explained differences; Refuse rather than improvise at the edges

---

## Terrain Tile Elevation Sampling

### Terrain tile zoom: z12 (fixed)
- **What it is:** Elevation is always sampled from z12 terrarium tiles (~30 m/px at Victorian latitudes).
- **Why (the decisions):** [from code comment] z12 provides ~30 m resolution against SRTM source accuracy of ~10 m. Coarser tiles would misreport ridge elevations at flying sites; finer tiles would add bandwidth cost with no accuracy gain against the source.
- **How (the mechanism):** `const ZOOM = 12` in `terrainTiles.ts:33`. Baked into tile URLs and all coordinate transformations.
- **Principles:** Deliberate, explained differences; One source of truth per rule

### Terrain LRU cache: 64 tiles (~8 MB)
- **What it is:** Decoded elevation tiles (Int16Array, 256×256) are cached in a 64-entry LRU using Map re-insertion ordering.
- **Why (the decisions):** [from code comment] 64 tiles covers many viewport states without unbounded growth. LRU via Map re-insertion (same strategy as the server module) is simple and allocation-free. Each tile is 131 KB, so 64 tiles ≈ 8 MB — within a typical browser tab memory budget.
- **How (the mechanism):** `const LRU_MAX = 64` in `terrainTiles.ts:37`. `lruGet` / `lruSet` at `terrainTiles.ts:65-82`. Re-insertion on `lruGet` marks most-recently-used; `lruSet` evicts oldest with `lruCache.keys().next().value`.
- **Principles:** One source of truth per rule; Refuse rather than improvise at the edges

### Terrain tile retry: 3 attempts, exponential backoff from 500 ms
- **What it is:** Failed tile fetches are retried up to 3 times with backoff of 500 ms, 1000 ms, 2000 ms. 404 responses are NOT retried — they are recorded as permanently absent.
- **Why (the decisions):** [from code comment] The distinction between "absent" (a fact about the dataset — ocean tiles, edge-of-coverage tiles) and "failed" (a transient network error) is load-bearing. Retrying a 404 wastes bandwidth and silently reports a neighbouring tile's elevation — up to 9 km away — instead of showing nothing. Failed tiles stay in neither cache so the next tap retries.
- **How (the mechanism):** `const RETRY_MAX = 3; const RETRY_BASE_MS = 500` in `terrainTiles.ts:38-39`. `fetchAndDecodeTile` at `terrainTiles.ts:247-275`: 404 → `{status: "absent"}`, network errors → retry, `failed` status is NOT put in `absentTiles`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges; One source of truth per rule

### Terrain NODATA sentinel: −32768
- **What it is:** Terrarium tiles encode "no elevation data" as all-zero RGB, which decodes to −32768 under the formula `R*256 + G + B/256 − 32768`. This value is treated as nodata, not a real elevation.
- **Why (the decisions):** [from code comment] Ocean tiles return 200 OK with all-zero RGB (0 m decoded as the ocean floor), but "outside dataset" tiles return 404. Distinguishing the two requires checking the HTTP status, not the decoded value.
- **How (the mechanism):** `const NODATA = -32768` in `terrainTiles.ts:35`. Checked alongside `null` at `terrainTiles.ts:444`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule

### Terrain relaxed bilinear: nearest-valid-corner substitution for NODATA
- **What it is:** Bilinear interpolation uses four surrounding pixel corners. If one or more corners are NODATA (−32768) or absent (null), the missing corner is substituted from the nearest valid corner rather than including −32768 in the average.
- **Why (the decisions):** [from code comment] Averaging in −32768 would produce a wildly wrong result that still looks like a plausible elevation. The relaxed bilinear returns null only when all four corners are nodata, which is the only honest "no data here" state.
- **How (the mechanism):** `c00 = s00 ?? s10 ?? s01 ?? s11!` etc. in `terrainTiles.ts:456-459`. Matches the server module exactly (`elevationPoint.ts`).
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges; One source of truth per rule

### Terrain colour-space decode: `colorSpaceConversion: 'none'`, `premultiplyAlpha: 'none'`
- **What it is:** When decoding terrarium PNG blobs, the browser is explicitly told to skip colour management and not pre-multiply alpha. The canvas is created with `colorSpace: 'srgb'` and `willReadFrequently: true`.
- **Why (the decisions):** [from code comment] Terrarium encodes elevation as raw integers in RGB bytes. Any browser colour management (sRGB transfer curve, ICC profile, wide-gamut conversion) would alter those bytes and produce plausible-looking but numerically wrong elevations. Pre-multiply would scale RGB channels by alpha, corrupting the encoded data.
- **How (the mechanism):** `createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" })` in `terrainTiles.ts:172-176`. Context options at `terrainTiles.ts:177-182`.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges

### Terrain prefetch: 3×3 tile block, debounced 300 ms after pan/zoom
- **What it is:** After every pan or zoom event, MapCanvas debounces a 300 ms timer, then prefetches the 3×3 block of z12 terrain tiles centred on the current map centre. This warms the elevation cache before a user tap.
- **Why (the decisions):** [from code comment] One z12 tile ≈ 9.6 × 7.5 km, so a 3×3 block covers ~29 × 22 km — more than any site-level view shows. 9 tiles × ~20 KB ≈ 180 KB per pan/zoom settle. Debounced so a fast pan sequence only triggers one batch.
- **How (the mechanism):** `schedulePrefetch` in `MapCanvas.tsx:324-343`: `setTimeout(..., 300)`. Loop `for dx/dy in -1..1` calling `prefetchTile(cx+dx, cy+dy)` at `MapCanvas.tsx:338-342`.
- **Principles:** Surface, don't hide; Deliberate, explained differences

---

## Service Worker Tile Caching

### SW cache name: `skyhigh-offline-tiles` (singular, preserved across activations)
- **What it is:** One named cache holds all offline tiles (OSM, OpenTopoMap, ArcGIS, terrarium). On activate, every other cache (including the legacy `carto-tiles-v1`) is deleted, but this cache is preserved.
- **Why (the decisions):** [from code comment] A previous setup had two workers registered at the same "/" scope fighting each other — the no-fetch-handler worker would wipe the offline tile cache on activate. They were consolidated into one. The cache name is stable so a SW update does not discard the prefetched tile set.
- **How (the mechanism):** `const TILE_CACHE = "skyhigh-offline-tiles"; const KEEP_CACHES = [TILE_CACHE]` in `public/sw.js:23-27`. Cleanup loop in `activate` at `sw.js:52-59`.
- **Principles:** One source of truth per rule; Deliberate, explained differences

### SW terrain tile predicate: specific S3 bucket path, not the full `s3.amazonaws.com` domain
- **What it is:** Terrarium elevation tile URLs are matched by `hostname === "s3.amazonaws.com" && pathname.startsWith("/elevation-tiles-prod/")`, not by adding `s3.amazonaws.com` to the domain list.
- **Why (the decisions):** [from code comment] Adding `s3.amazonaws.com` would intercept all S3 traffic (images, documents, other apps on the same domain). The specific bucket path is the minimal predicate that captures only terrarium tiles.
- **How (the mechanism):** `isTerrainTile` function in `public/sw.js:43-48`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing

### SW terrain tile cache: unbounded (known deliberate follow-up)
- **What it is:** The SW tile cache has no eviction strategy. Terrarium tiles accumulate without limit.
- **Why (the decisions):** [from code comment] "NOTE: this cache is currently unbounded. Eviction strategy is a known, deliberate follow-up — do not add one here." The decision to defer is explicit; adding eviction here without understanding the full offline-prefetch flow (src/lib/tileCache.ts) could silently break offline functionality.
- **How (the mechanism):** No cache size check in the SW fetch handler (`sw.js:62-83`). Comment at `sw.js:46`.
- **Principles:** Decisions stay with the human; Deliberate, explained differences

### SW cache strategy: cache-first with network fallback, 503 on offline
- **What it is:** Tile requests check the cache first. If not found, the network is tried; a successful response is also stored. If the network fails (offline), a 503 response is returned rather than no response.
- **Why (the decisions):** [inferred] Cache-first ensures offline viewing works without network calls for tiles already loaded. The 503 response lets the application distinguish "offline" from a genuine tile-missing state.
- **How (the mechanism):** `cache.match → fetch → cache.put` pattern in `sw.js:68-81`. `return new Response("", { status: 503, statusText: "Offline" })` at line 79.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges

---

## Ground Registration (Stale-Raster Affine Correction)

### Stale overlay re-registration: affine scale + translate, no re-sample
- **What it is:** All rasterised layers (thermal heat, cumulus stipple, wind speed heatmap) store the zoom transform they were built under. When drawn under a newer transform, they are corrected via `scale = k_current/k_baked` and `translate = (t_current − scale * t_baked)`, keeping them registered to the geographic ground while rebuilds are throttled.
- **Why (the decisions):** [from code comment in groundRegistration.ts] Drawing at 1:1 would let the stale raster slide out of register with the basemap during a pan or pinch. The affine correction is derived from the same projected coordinate space both transforms share. The raster goes soft during a gesture, then sharpens when the rebuild lands — better than sliding off the map entirely.
- **How (the mechanism):** `drawRegistered` in `src/components/windmap/groundRegistration.ts:51-78`. Previously duplicated in three independent copies; consolidated into one function with cosmetic options to eliminate three independent opportunities to get the algebra wrong.
- **Principles:** One source of truth per rule; Deliberate, explained differences; Traceable to code

### Cumulus stipple: no blur, natural size (crisp)
- **What it is:** The cumulus glyph canvas is drawn without blur and without explicit `width`/`height` override. This is a deliberate difference from the thermal heat raster which uses `blur(5px)` and explicit dimensions.
- **Why (the decisions):** [from code comment in cumulusField.ts:452] "No blur and no forced smoothing — the stipple must stay crisp; blur is only for the heat ramp."
- **How (the mechanism):** `drawRegistered(ctx, field.canvas, field.builtTransform, currentTransform)` in `cumulusField.ts:453` — no `opts` argument, so no `alpha`, `blurPx`, `smoothing`, or `width`/`height`.
- **Principles:** Deliberate, explained differences
