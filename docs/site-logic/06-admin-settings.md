# Admin CMS — Settings & Feature Flags

Settings live in a single PostgreSQL `settings` table (key/value strings).
The server route `server/routes/settings.ts` exposes them; `src/contexts/SettingsContext.tsx`
fetches, hydrates, and distributes them to all clients via React context.
`src/pages/AdminForecast.tsx` and `src/pages/AdminScheduledTasks.tsx` are the two
deepest admin surfaces for tuning thresholds and schedules.

---

## Settings API — access & caching

### GET /api/settings — short public cache
- **What it is:** The settings endpoint serves all settings to every client (including unauthenticated pages) and sets `Cache-Control: public, max-age=10, stale-while-revalidate=30`.
- **Why (the decisions):** Settings change rarely but must not lag more than a few seconds (feature flags, alert banners). 10 s is a deliberate trade-off: PWA tabs and CDN edges can hold a stale copy for up to 10 s, then serve it for 30 more while revalidating silently. [inferred] The `stale-while-revalidate` window was chosen to eliminate blocking waits on slow connections without letting flags drift for more than 40 s in the worst case.
- **How (the mechanism):** `res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30')` in `server/routes/settings.ts:48`.
- **Principles:** Surface, don't hide; One source of truth per rule.

### PUT /api/settings — open key space, auth required
- **What it is:** Any key can be written by any admin in a single upsert loop; there is no server-side allow-list.
- **Why (the decisions):** The allow-list lives entirely on the client side (`SettingsContext` `buildSettings`). The server trusts any authenticated caller. [inferred] This keeps the server thin and makes adding a new setting a front-end-only change. The trade-off is that a compromised admin token can write arbitrary keys.
- **How (the mechanism):** `server/routes/settings.ts:74–92` — iterates `req.body` and issues `INSERT … ON CONFLICT DO UPDATE`. Protected by `requireAuth` middleware.
- **Principles:** Traceable to code; Decisions stay with the human.

### GET /api/settings/site-logic — no-store, editable flag
- **What it is:** Returns the Site Logic markdown document from `docs/site-logic.md` plus an `editable: boolean` field. In production `editable` is always `false`.
- **Why (the decisions):** The document is the canonical source (`SITE_LOGIC_PATH = process.cwd()/docs/site-logic.md`). Editing it in-browser only works when the dev server is running against the actual repo file; Railway's ephemeral filesystem is not the repo, so writes there would vanish on the next deploy. The `no-store` header prevents any cached version of the edit gate from showing stale.
- **How (the mechanism):** `server/routes/settings.ts:13–19` — `isProd = process.env.NODE_ENV === "production"`; `server/routes/settings.ts:57` — `res.set("Cache-Control", "no-store"); res.json({ markdown, editable: !isProd })`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide; One source of truth per rule.

### PUT /api/settings/site-logic — production hard block
- **What it is:** Saving the Site Logic document via the UI is refused with HTTP 403 in production; local/dev only.
- **Why (the decisions):** Railway's filesystem is ephemeral; a save there would overwrite nothing in the real repo and would be lost on the next deploy. The error message explicitly directs the user to edit the file and commit instead.
- **How (the mechanism):** `server/routes/settings.ts:62–65` — `if (isProd) return res.status(403).json({ error: "… edit docs/site-logic.md in the repo and commit." })`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### `hideClosedSites` — site-list cache invalidation trigger
- **What it is:** Changing this one setting key additionally calls `invalidateSitesCache()`, flushing the in-memory public site list. No other setting triggers this.
- **Why (the decisions):** [inferred] Filtering closed sites out of the public list is the most visibility-sensitive setting — a stale cache would immediately show/hide sites incorrectly. Other settings only affect rendering, not what data is returned.
- **How (the mechanism):** `server/routes/settings.ts:88–90` — `if ('hideClosedSites' in settings) invalidateSitesCache()`.
- **Principles:** One source of truth per rule; Surface, don't hide.

---

## SettingsContext — client hydration

### `"undefined"` string sanitisation
- **What it is:** String fields that were previously saved as the literal string `"undefined"` are silently converted to `""` on read.
- **Why (the decisions):** An early version of the settings writer serialised `undefined` JS values to the string `"undefined"` instead of `""`. Rather than a migration, the reader strips it on the way in. [inferred] This avoids displaying "undefined" in text fields for existing installs.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:236` — `const cleanString = (val: any) => val === "undefined" ? "" : val;`, applied to ~30 fields in `buildSettings`.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule.

### Dark logo fallback chain
- **What it is:** Dark-mode logo variants fall back to the matching light-mode variant when unset. nav → footer → favicon → splash each have an independent fallback.
- **Why (the decisions):** Clubs may upload only a single logo set. Rather than showing broken images in dark mode, the app silently reuses the light variant. [inferred]
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:179–186` — `resolveDarkLogos` returns `s.clubLogoDarkNav || s.clubLogoNav || ""` for each slot.
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

### Default club name fallback
- **What it is:** If `clubName` is absent or blank, `"SkyHigh"` is used as the hard-coded fallback.
- **Why (the decisions):** [inferred] Prevents blank club names on new installs before the admin sets the value.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:324` — `clubName: cleanString(data.clubName) || "SkyHigh"`.
- **Principles:** Assume the safest reading when context is missing.

### Boolean defaults: features default OFF, sat tracker defaults ON
- **What it is:** All opt-in features (`flightTrackerEnabled`, `xcMapsEnabled`, `xcAirspaceEnabled`, `xcCompetitionsEnabled`, `joinPageEnabled`, `groundHandlingEnabled`, `businessDirectoryEnabled`, `photoSliderEnabled`, `youtubeCarouselEnabled`, `alertBannerEnabled`, `homeCardsCycle`) default to `false`. Satellite tracker providers (`satTrackerGarminVisible`, `satTrackerSpotVisible`, `satTrackerZoleoVisible`) and online check-in default to `true`. Featured site defaults to `true` (enabled).
- **Why (the decisions):** Optional or potentially disruptive features should be inert on a fresh install. Satellite tracker visibility is display-only and defaults visible so pilots see all data sources unless the club deliberately hides one. Check-in and featured site are core club-management features assumed always wanted.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:203–223` — `defaultSettings` object; `satTrackerGarminVisible: data.satTrackerGarminVisible !== "false"` pattern (truthy-unless-explicitly-false) at lines 349–351.
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### `publicSearchEnabled` and `soProximityPromptEnabled` — default ON
- **What it is:** Both settings default to `"true"` when absent from the database.
- **Why (the decisions):** [inferred] The AI public search and SO proximity prompt are core features; a missing DB row (e.g. on an older install) should not silently disable them.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:313–314` — `data.publicSearchEnabled || "true"` and `data.soProximityPromptEnabled || "true"`.
- **Principles:** Assume the safest reading when context is missing.

### `qrCodeMode` default — `"off"`
- **What it is:** QR code site cards default to `"off"` when absent.
- **Why (the decisions):** [inferred] Generating and displaying QR codes requires physical setup (printed signs at sites). An opt-in default prevents confusion on installs that haven't set up site signs.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:321` — `data.qrCodeMode || "off"`.
- **Principles:** Assume the safest reading when context is missing.

### `publicSearchCtaFrequency` default — `"2"`
- **What it is:** The public AI search CTA message shows every 2 searches by default.
- **Why (the decisions):** [inferred] A frequency of 2 is a middle ground: 1 would feel intrusive (every search), 0 or blank would silently disable the CTA.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:320` — `data.publicSearchCtaFrequency || "2"`.
- **Principles:** Assume the safest reading when context is missing.

---

## Feature Flags (Forecast)

### `featureThermalMap` — default OFF
- **What it is:** Admin toggle (Admin → Forecast → "Enable the thermal map") that gates the [Thermal] mode toggle on all site wind maps. When `"false"` or absent, only the wind map is available.
- **Why (the decisions):** The thermal grid is a heavy, daily-cached dataset. Enabling the overlay for all users before the admin has verified the grid data is current and correct would expose pilots to stale or missing thermal forecasts. Default OFF ensures the admin consciously activates it.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:389` passes `data.featureThermalMap` through unmodified (no `|| "true"` fallback, so absent = falsy). Gated in `src/components/SitesWindMap.tsx:49` — `const isThermalEnabled = settings.featureThermalMap === 'true'`. Toggled in `src/pages/AdminForecast.tsx:95–107`.
- **Principles:** Decisions stay with the human; Refuse rather than improvise at the edges.

### `featureMeteogram` — default OFF
- **What it is:** Admin toggle (Admin → Forecast → "Enable the meteogram chart") that gates the [Chart] view inside the site thermal panel.
- **Why (the decisions):** The meteogram is a more experimental surface built after the thermal map. Keeping it off by default lets admins verify it against real data before exposing it. The flag was introduced in commit `a41d532` (stage 1 build) specifically to allow gradual rollout.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:390` passes `data.featureMeteogram` unmodified. Gated in `src/components/SitesWindMap.tsx:50` and `src/components/weather/SiteThermalPanel.tsx:69`. Toggled in `src/pages/AdminForecast.tsx:109–121`.
- **Principles:** Decisions stay with the human; Refuse rather than improvise at the edges.

### `featureSkewT` — default OFF
- **What it is:** Admin toggle (Admin → Forecast → "Enable the interactive SkewT") that gates the [SkewT] action in the thermal tapped-point box. SkewT fetches a per-point ECMWF sounding on demand.
- **Why (the decisions):** Unlike the map and chart, SkewT makes a live per-user per-point API call to ECMWF. Default OFF prevents unexpected per-request costs and load before the feature is validated.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:391` passes `data.featureSkewT` unmodified. Gated in `src/components/SitesWindMap.tsx:51` and `src/components/weather/SiteThermalPanel.tsx:70`. Toggled in `src/pages/AdminForecast.tsx:122–135`.
- **Principles:** Decisions stay with the human; Refuse rather than improvise at the edges.

---

## Thermal Map Thresholds (Admin → Forecast)

All eight thresholds are admin-tunable in `src/pages/AdminForecast.tsx` (THRESHOLD_FIELDS array) and mirror hardcoded constants in `src/components/windmap/thermalRenderer.ts` (DEFAULT_THERMAL_TUNING). An absent or unset value causes the renderer to use the hardcoded default, so the admin UI and the renderer have a single shared default and leaving the field unchanged is a true no-op.

### Clear-sky cloud limit — 12 %
- **What it is:** Low-cloud percentage below which the sky reads as clear (full cumulus glyph density, no grey sheet). User-visible as the point where overcast greys disappear from the thermal map.
- **Why (the decisions):** 12 % ≈ one-eighth sky cover, which BOM calls "few" (1–2 oktas ≈ 12.5–25 %). Below this threshold isolated puffs exist but the sky is effectively open; above it a broken deck begins to matter for thermal strength. Code comment in `thermalRenderer.ts:17–18` explains the BOM okta mapping explicitly.
- **How (the mechanism):** `export const CU_CLOUD_MIN_PCT = 12` in `src/components/windmap/thermalRenderer.ts:18`. Tunable range 0–40 %, step 1 (`src/pages/AdminForecast.tsx:30`).
- **Principles:** Deliberate, explained differences; Traceable to code.

### Overcast onset — 70 %
- **What it is:** Cloud percentage at which the grey overcast wash begins to appear (cumulus glyphs fade out). Marks the start of the 70 → 95 % ramp.
- **Why (the decisions):** 70 % is mid-"broken" (5–7 oktas). The code comment states: "the sky is more covered than clear, and pilots on the ground would call it overcast." The ramp provides a smooth visual transition rather than a hard cliff.
- **How (the mechanism):** `export const OVERCAST_MIN_PCT = 70` in `src/components/windmap/thermalRenderer.ts:25`. Tunable range 40–90 %, step 1 (`AdminForecast.tsx:31`).
- **Principles:** Deliberate, explained differences; Traceable to code.

### Full overcast — 95 %
- **What it is:** Cloud percentage at which the grey wash saturates. Above this the map reads as maximum overcast.
- **Why (the decisions):** 95 % ≈ "overcast" (8 oktas minus a thin gap, per code comment `thermalRenderer.ts:29–31`). The choice avoids saturating at 100 %, which would require a completely solid forecast — the ramp reaches full coverage a fraction below that.
- **How (the mechanism):** `export const OVERCAST_FULL_PCT = 95` in `src/components/windmap/thermalRenderer.ts:32`. Tunable range 70–100 %, step 1 (`AdminForecast.tsx:32`).
- **Principles:** Deliberate, explained differences; Traceable to code.

### Overcast glyph suppression threshold — 0.35
- **What it is:** Overcast strength (0–1 on the 70–95 % ramp) above which cumulus glyphs are withheld entirely. Not admin-tunable.
- **Why (the decisions):** 0.35 on the 70–95 % ramp is roughly 79 % low cloud — the point where a scattered deck becomes a sheet and real cumulus cannot form under it. Suppressing at the full-overcast value (1.0) was a previous bug that left glyphs drawing across the entire onset band; the current threshold separates "grey + glyphs" from "grey only" cleanly. Code comment `thermalRenderer.ts:42–54` documents both the old bug and the physics rationale.
- **How (the mechanism):** `export const OVERCAST_SUPPRESS_MIN = 0.35` in `src/components/windmap/thermalRenderer.ts:54`. Used at `thermalRenderer.ts:506`.
- **Principles:** Deliberate, explained differences; Traceable to code.

### Overcast sheet alpha floor — 115 (≈ 45 %)
- **What it is:** Minimum alpha painted for any visible overcast sheet, so near-onset grey is perceptible over pale basemaps. Not admin-tunable.
- **Why (the decisions):** Raised from 90 (35 %) to 115 (45 %) after Jon found near-onset grey imperceptible in testing (`thermalRenderer.ts:38–40`). The ceiling is the 0.80 heat stop (alpha 125), so grey never out-paints heat colour.
- **How (the mechanism):** `export const OVERCAST_SHEET_ALPHA_FLOOR = 115` in `src/components/windmap/thermalRenderer.ts:41`. Applied at `thermalRenderer.ts:488`.
- **Principles:** Deliberate, explained differences; Traceable to code.

### Minimum thermal strength shown (W*) — 0.3 m/s
- **What it is:** W* (updraft velocity) below which no heat colour is painted. Cells below this threshold can still show grey if overcast.
- **Why (the decisions):** Below 0.3 m/s thermals are too weak to be useful for paragliding or hang gliding; painting heat colour there would suggest flyable conditions when none exist. The code comment notes that 0.3 m/s rejects 165 of 596 high-CAPE cells measured across the live grid, and zero surviving cells had BLH below 300 m.
- **How (the mechanism):** `DEFAULT_THERMAL_TUNING.minWstar = 0.3` in `src/components/windmap/thermalRenderer.ts:90`. The gate `ws >= 0.3` is evaluated per pixel. Tunable range 0–2 m/s, step 0.1 (`AdminForecast.tsx:33`).
- **Principles:** Deliberate, explained differences; Traceable to code.

### Storm-risk CAPE gate — 500 J/kg
- **What it is:** CAPE (convective available potential energy) floor below which the overdevelopment (OD) risk triangle never appears, regardless of Lifted Index or CIN.
- **Why (the decisions):** 500 J/kg is documented in the help modal as the published OD-risk threshold shown to pilots. Below this the atmosphere does not have enough stored energy for deep convection regardless of stability indices; surfacing the triangle there would train pilots to ignore it. Code comment `thermalRenderer.ts:139–142` is explicit about this gating logic.
- **How (the mechanism):** `DEFAULT_THERMAL_TUNING.stormCapeGate = 500` in `src/components/windmap/thermalRenderer.ts:91`. Applied in `computeOdRisk()` at `thermalRenderer.ts:142`. Tunable range 100–2000 J/kg, step 50 (`AdminForecast.tsx:34`).
- **Principles:** Deliberate, explained differences; Refuse rather than improvise at the edges; Traceable to code.

### OD risk — Lifted Index thresholds (−2, 0 °C) and CIN fallback (50 J/kg)
- **What it is:** A three-rung cascade for classifying overdevelopment risk. Rung 1: LI < −2 °C = "likely" (OdRisk 2); LI < 0 °C = "watch" (OdRisk 1). Rung 2 (degraded fallback): CIN < 50 J/kg = "watch". Rung 3 (last resort): CAPE > 800 J/kg = "watch". Not admin-tunable.
- **Why (the decisions):** LI is the primary signal because it directly measures buoyancy aloft (−2 °C = vigorous deep convection likely per NOAA convention). CIN is a weaker proxy — it measures whether convection can start, not how violent it will be. CAPE-only is kept only so the signal is never absent when both upper indicators are unavailable. The cascade is explicitly labelled tier-1/tier-2/tier-3 matching the four-tier data provider chain. Code comments `thermalRenderer.ts:122–161` document every choice.
- **How (the mechanism):** `computeOdRisk()` in `src/components/windmap/thermalRenderer.ts:139–161`.
- **Principles:** Deliberate, explained differences; Separate facts from judgements; Traceable to code.

### Rain no-fly threshold — 1 mm/hr
- **What it is:** Precipitation at or above which an hour is marked NOT flyable on the meteogram fly bar, and where the blue rain wash saturates on the thermal map. Lighter rain (≥ 0.1 mm/hr) fades in as a watch colour below this threshold.
- **Why (the decisions):** [inferred] 1 mm/hr is a generally accepted light-rain boundary that makes ground conditions wet and reduces visibility; it maps to the admin label "no-fly". The 0.1 mm/hr floor (`RAIN_WASH_MIN_MM`) ensures trace precipitation is still shown, but at low opacity that doesn't alarm pilots.
- **How (the mechanism):** `DEFAULT_THERMAL_TUNING.rainOffMm = 1` in `src/components/windmap/thermalRenderer.ts:92`. `const RAIN_WASH_MIN_MM = 0.1` at `thermalRenderer.ts:100`. Tunable range 0.1–5 mm/hr, step 0.1 (`AdminForecast.tsx:35`).
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### Overcast grey opacity — 0.75 (max alpha)
- **What it is:** Maximum opacity (0–1) of the grey overcast wash at full cloud. Admin-tunable.
- **Why (the decisions):** 0.75 is strong enough to visually suppress heat colour underneath a solid overcast, without fully blocking the base map. [inferred] Pilot feedback drove the initial value; the admin can raise it for heavy visual contrast or lower it for lighter maps.
- **How (the mechanism):** `DEFAULT_THERMAL_TUNING.overcastOpacity = 0.75` in `src/components/windmap/thermalRenderer.ts:93`. Tunable range 0–1, step 0.05 (`AdminForecast.tsx:36`).
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

### Rain wash opacity — 0.5 (max alpha)
- **What it is:** Maximum opacity (0–1) of the blue rain wash at the no-fly rain rate. Admin-tunable.
- **Why (the decisions):** [inferred] 0.5 is half-transparent, compositing visibly over heat/grey/transparent alike without fully obscuring the base. A lower default than the overcast wash (0.75) because rain is typically a narrower geographic signal and lighter visual weight is appropriate.
- **How (the mechanism):** `DEFAULT_THERMAL_TUNING.rainWashOpacity = 0.5` in `src/components/windmap/thermalRenderer.ts:94`. Tunable range 0–1, step 0.05 (`AdminForecast.tsx:37`).
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

### Cumulus depth gate — 50 m minimum (BLH − CCL)
- **What it is:** The vertical depth of the convective zone (boundary layer height minus cloud condensation level) must be at least 50 m before a cumulus glyph is drawn. Not admin-tunable.
- **Why (the decisions):** [inferred] A 50 m band is the minimum meaningful cloud depth for visible cumulus formation. Below 50 m the CCL is so close to the BLH that the thermals cannot produce a proper cumulus top, and showing glyphs there would mislead pilots.
- **How (the mechanism):** `if (th.ccl != null && th.blh - th.ccl >= 50 …)` in `src/components/windmap/thermalRenderer.ts:506`.
- **Principles:** Deliberate, explained differences; Refuse rather than improvise at the edges.

### W* colour ramp — stops concentrated 0.8–2.4 m/s
- **What it is:** The heat-colour LUT (512-entry, pale yellow → crimson) has its stops concentrated in the 0.8–2.4 m/s band rather than distributed evenly across 0–5 m/s.
- **Why (the decisions):** Code comment `thermalRenderer.ts:167–171` states: p25 ≈ 1.4 m/s and p75 ≈ 2.0 m/s for typical flight days. An evenly-spaced ramp across 0–4 would waste most of its range on values that essentially never occur and flatten the part of the map pilots actually read. The full LUT extends to 5 m/s (`LUT_MAX_WSTAR`) but stops above 4 m/s are beyond all recorded data.
- **How (the mechanism):** `const STOPS` array in `src/components/windmap/thermalRenderer.ts:172–182`. LUT built at lines 187–204.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### Thermal legend scale — capped at 3.0 m/s
- **What it is:** The legend bar normalises to 3.0 m/s (`LEGEND_MAX_WSTAR`) rather than the LUT maximum (5.0 m/s), so the full hue travel is visible in the legend.
- **Why (the decisions):** Code comment `thermalRenderer.ts:212–214`: normalising to 4.0 m/s would compress all the colour into the left ~75 % of the bar because values above 3 m/s are rare. 3.0 m/s represents the practical ceiling pilots encounter on a strong day.
- **How (the mechanism):** `export const LEGEND_MAX_WSTAR = 3.0` in `src/components/windmap/thermalRenderer.ts:213`.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

### Thermal rebuild throttle — 50 ms minimum interval
- **What it is:** The per-pixel thermal overlay rebuild is rate-limited to no more than one rebuild every 50 ms.
- **Why (the decisions):** [inferred] Rebuilding the overlay is expensive (full pixel loop over the viewport). The 50 ms floor prevents back-to-back rebuilds during rapid pan/zoom or slider scrubbing from starving the render loop.
- **How (the mechanism):** `const REBUILD_MIN_INTERVAL = 50` in `src/components/windmap/thermalRenderer.ts:164`.
- **Principles:** Refuse rather than improvise at the edges.

---

## Base-Map Detail Slider Range (Admin → Forecast)

### Per-map floor/ceiling band — default 0–100 %
- **What it is:** Four admin-tunable settings (`windBasemapDetailFloorPct`, `windBasemapDetailCeilPct`, `thermalBasemapDetailFloorPct`, `thermalBasemapDetailCeilPct`) that constrain the pilot's "base-map detail" slider on each map. The slider scrubs between floor and ceiling, not 0–100 % directly.
- **Why (the decisions):** The wind speed overlay and the thermal heat ramp cover the base map to different degrees. A single 0–100 range would let pilots set the wind map detail so high that speed colours disappear, or the thermal detail so low that roads vanish entirely. Per-map bands let the admin tune a safe operating range for each map type. Default 0/100 = full range (DECISION-015, commit `7c7f04d`). Code comment `AdminForecast.tsx:40–43` is explicit about the rationale.
- **How (the mechanism):** `BASEMAP_FIELDS` array in `src/pages/AdminForecast.tsx:44–49`. Stored as four settings keys. Tunable 0–100 %, step 5. The pilot's chosen position within the band is persisted on their device (not in settings).
- **Principles:** Decisions stay with the human; Deliberate, explained differences.

### Base-map darkening via `multiply` blending
- **What it is:** When base-map detail intensity > 0, the base tiles are re-composited over the overlay using Canvas `multiply` blend mode, darkening roads/rivers/borders back in without washing out the heat/speed colours.
- **Why (the decisions):** [inferred] An additive or normal re-draw would lighten or completely cover the overlay. Multiply only darkens pixels that are already dark in the base (roads, borders), leaving the bright overlay colours largely intact while making map features legible again (DECISION-015).
- **How (the mechanism):** `ctx.globalCompositeOperation = 'multiply'` in `src/components/windmap/MapCanvas.tsx:471`. The intensity value is held in a ref (`basemapIntensityRef`) to allow the slider to drive the frame loop without React re-renders (`MapCanvas.tsx:90–94`).
- **Principles:** Deliberate, explained differences; Traceable to code.

---

## Thermal Map Display

### Default map time — 12:00 (noon)
- **What it is:** When a site forecast map first opens, the time slider starts at noon (hour 12) unless the admin changes it. Admin-tunable in Admin → Forecast → Display (range 07:00–20:00).
- **Why (the decisions):** [inferred] Noon is the most common peak-flying time for Australian paragliding and hang gliding; it puts the initial view in the middle of the thermal day rather than at dawn (where thermals are absent) or near the end of the forecast window.
- **How (the mechanism):** `const THERMAL_DEFAULT_HOUR = 12` in `src/pages/AdminForecast.tsx:51`. Stored as `thermalMapDefaultHour`. Input clamped to `minHour=7, maxHour=20` via `HourInput` (`AdminForecast.tsx:401–408`).
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

---

## Scheduled Closure Calendar

### 7-day banner lead time
- **What it is:** A site closure banner is shown on the home page starting 7 days before the first closure date. The banner is not shown once the first closure date has passed.
- **Why (the decisions):** 7 days gives pilots enough notice to plan alternative flying, without showing the warning so far in advance that it becomes background noise. The logic excludes sites that are already permanently `closed` or `restricted` — they have their own status display and adding a banner would be redundant. Commit `e853fd5` message: "Home page auto-generates blue banners 7 days before first closure."
- **How (the mechanism):** `server/routes/sites/closures.ts:28–32` — `bannerStart.setDate(bannerStart.getDate() - 7)` then `todayStr >= bannerStartStr`. All date calculations use Melbourne timezone (`toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })`). Sites with `status IN ('closed', 'restricted')` are excluded from the banner query at line 22.
- **Principles:** Surface, don't hide; Deliberate, explained differences; Decisions stay with the human.

### Closure date window returned to clients — next 60 days
- **What it is:** The public per-site closure dates endpoint returns only dates from today up to 60 days out.
- **Why (the decisions):** [inferred] Returning all future dates would expose potentially years of planned closures in a public API response. 60 days covers the foreseeable planning horizon for most pilots while keeping the payload small.
- **How (the mechanism):** `server/routes/sites/crud.ts:50–58` — `sixtyDaysOut.setDate(sixtyDaysOut.getDate() + 60)` used as a query bound. The `GET /:id/closure-dates` endpoint at `closures.ts:47–57` also limits to `closure_date >= today` (no ceiling).
- **Principles:** Assume the safest reading when context is missing; Refuse rather than improvise at the edges.

### `hideClosedSites` filter — closed site override
- **What it is:** When `hideClosedSites` is `"true"`, permanently closed sites are filtered from the public site list. A site can opt back in via `overrideHideClosed = "true"` or remain visible if `temporarilyClosed = 1`.
- **Why (the decisions):** [inferred] Clubs may want to suppress long-term closed sites from the public list (reduces clutter) but still show them when temporarily closed (pilots need to see the temporary status) or when explicitly overridden (e.g. a site closed but kept for historical reference).
- **How (the mechanism):** `server/routes/sites/crud.ts:36–39` — `sites.filter(s => s.status !== "closed" || s.overrideHideClosed === "true" || s.temporarilyClosed === 1)`.
- **Principles:** Decisions stay with the human; Surface, don't hide.

---

## Scheduled Tasks & Cache TTLs

### Grid fetch schedule defaults
- **What it is:** Wind (fine) grid: 05:00 AEST/AEDT; Thermal grid: 05:26; 7-Day (extended): 05:30. All daily, Melbourne time.
- **Why (the decisions):** Staggered by 26 and 30 minutes from the fine grid to prevent concurrent heavy DB writes and API bursts. The 26-minute gap for the thermal grid is the original committed default (`schedThermalGridMinute: "26"` in DEFAULTS). DECISION-003 established the 5:00 AM window to use fresh overnight model runs before pilots check conditions in the morning. Commit `ab9e05e` corrects the 7-Day schedule from an earlier drift (was noted as 5:30 in MEMORY but 5:40 in old DB).
- **How (the mechanism):** `DEFAULTS` object in `src/pages/AdminScheduledTasks.tsx:54–64`. All three times are admin-tunable and stored in settings.
- **Principles:** Deliberate, explained differences; One source of truth per rule.

### Weather scraper operating window — 07:00–20:00 Melbourne
- **What it is:** Live weather scrapers only run between 07:00 and 20:00 Melbourne time by default. Outside this window all scrapers sleep. A "run continuously" override ignores the window.
- **Why (the decisions):** Weather data outside flying hours has no operational value; scraping through the night wastes API quota and generates noise in logs. The window covers all realistic pre-flight and in-flight hours for Australian paragliding. The `runContinuously` override is explicitly for edge cases (competitions, monitoring).
- **How (the mechanism):** `DEFAULTS.weatherScraperStartHour: "7"` and `DEFAULTS.weatherScraperEndHour: "20"` in `src/pages/AdminScheduledTasks.tsx:65–66`. Read in `src/pages/AdminWeather.tsx:299–301`. Admin-tunable.
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

### Per-source scraper intervals (randomised)
- **What it is:** Each weather source has its own min/max interval (minutes) randomised per cycle to spread load. Defaults: FreeFlightWx 2–3 min; Weather Underground 14–15 min; Live-Wind 5–10 min; BOM 10–20 min; Davis 5–10 min.
- **Why (the decisions):** Weather Underground is on a ~1,500 calls/day free tier (noted in the UI). Spreading calls over a random window prevents predictable API patterns that could trigger rate limiting. FreeFlightWx has no documented rate limit so a tighter 2–3 min interval is safe. BOM and WU have longer intervals reflecting their tier constraints.
- **How (the mechanism):** `DEFAULTS` fields `weatherScraper_*_min/max` in `src/pages/AdminScheduledTasks.tsx:69–78`. All admin-tunable, range 1–120 min depending on source.
- **Principles:** Deliberate, explained differences; Refuse rather than improvise at the edges.

### Admin session TTL — 24 hours
- **What it is:** Admin login sessions expire after 24 hours by default. Admin-tunable (range 1–72 hours).
- **Why (the decisions):** [inferred] 24 hours covers a full working day without requiring repeated logins, while limiting the window of exposure from a stolen or forgotten session.
- **How (the mechanism):** `DEFAULTS.cacheAdminSessionTtl: "24"` in `src/pages/AdminScheduledTasks.tsx:83`. Stored as `cacheAdminSessionTtl`.
- **Principles:** Assume the safest reading when context is missing; Decisions stay with the human.

### TidyHQ member cache — 15 minutes
- **What it is:** The TidyHQ member email list is cached for 15 minutes before refreshing.
- **Why (the decisions):** [inferred] Membership changes are infrequent (new sign-ups, lapses); 15 minutes ensures auth decisions are current within a reasonable window without hammering the TidyHQ API on every request.
- **How (the mechanism):** `DEFAULTS.cacheTidyHqMemberTtl: "15"` (minutes) in `AdminScheduledTasks.tsx:84`. Range 1–1440 min.
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

### Cache TTL defaults (remaining)
- **What it is:** BOM tide: 6 h; Astronomical tide: 30 min; TidyHQ events: 5 min; Search context: 5 min; Asset register: 10 min; FreeFlightWx: 30 s.
- **Why (the decisions):** BOM tide predictions change rarely (published daily), hence a 6-hour cache. Astronomical tides are computed deterministically but can be calculated in bulk, hence 30 minutes. Events and search context need to stay close to live (5 min), as new events or site changes should propagate quickly. FreeFlightWx is a live station feed — 30 s is the shortest meaningful poll interval that avoids hammering the source.
- **How (the mechanism):** `CACHE_TIMERS` array in `src/pages/AdminScheduledTasks.tsx:102–110`. All admin-tunable.
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

---

## Wind Map Particle Defaults

### Particle count — 1200
- **What it is:** Default number of animated wind particles on the wind map. Admin-tunable.
- **Why (the decisions):** [inferred] 1200 is a balance between visual density (enough particles to fill a viewport at typical zoom levels) and render cost (canvas particle simulation scales linearly). Lower would look sparse; higher risks frame drops on mobile.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:375` — `data.wfParticleCount || "1200"`.
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

### IDW power — 2
- **What it is:** Inverse Distance Weighting exponent used to interpolate wind speed/direction at particle positions between forecast grid points. Admin-tunable.
- **Why (the decisions):** [inferred] Power of 2 is the standard IDW default: close points dominate, distant points contribute less, smooth interpolation without over-fitting to any single grid point.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:379` — `data.wfIdwPower || "2"`.
- **Principles:** Deliberate, explained differences.

### Max influence radius — 120 km; fade start — 80 km
- **What it is:** A grid point's wind reading influences particles up to 120 km away and fades out starting at 80 km.
- **Why (the decisions):** [inferred] The fine grid spacing is ~0.15° ≈ 14 km; 120 km is about 8 grid spacings — enough to cover sparse grid regions near the edge of the domain. The 80 km fade start gives a 40 km soft transition, preventing hard edges at grid boundaries.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:377–378` — `data.wfMaxInfluenceKm || "120"` and `data.wfFadeStartKm || "80"`.
- **Principles:** Deliberate, explained differences.

---

## Bulk Image Upload Limit

### Default limit — 20 images per batch; hard clamp 1–999
- **What it is:** The bulk hero image uploader accepts at most 20 images per batch by default. The server-side clamp refuses values outside 1–999.
- **Why (the decisions):** [inferred] 20 images per batch prevents accidental mass uploads that could saturate R2 bandwidth or exhaust Cloudflare quotas. The hard clamp 1–999 is a server-side guard that can't be bypassed even by sending a crafted payload. The upper ceiling of 999 is permissive enough to never block a real use case while preventing nonsensical values.
- **How (the mechanism):** `src/contexts/SettingsContext.tsx:388` — `data.bulkUploadLimit || "20"`. Server-side clamp in `src/hooks/useConnectionsConfig.ts:213` — `Math.min(999, Math.max(1, bulkUploadLimitDraft || 20))`. Applied at `src/pages/AdminImages.tsx:1380`.
- **Principles:** Refuse rather than improvise at the edges; Decisions stay with the human.

---

## SO Proximity Prompt

### 500 m geofence — auto-prompt trigger and server-side enforcement
- **What it is:** The Safety Officer proximity login prompt fires automatically when a user is within 500 m of any flying site. The same 500 m radius is verified server-side when an SO logs in via the proximity path, regardless of whether the auto-prompt was suppressed.
- **Why (the decisions):** 500 m is the field perimeter for most Australian hill-launch sites — close enough that the person is almost certainly at the site. The server-side check exists as a separate enforcement layer: turning off the auto-prompt (a UX choice for clubs that prefer manual login) does not relax the location requirement for SO login. Admin Manual `src/pages/AdminManual.tsx:522` documents this explicitly.
- **How (the mechanism):** `src/pages/AdminSiteOptions.tsx:74` — description text states the 500 m rule. `src/pages/AdminManual.tsx:517, 522` — documents both the prompt and the server-side enforcement. Setting `soProximityPromptEnabled` only controls the auto-popup; the geofence check is always active.
- **Principles:** Refuse rather than improvise at the edges; Decisions stay with the human; Surface, don't hide.
