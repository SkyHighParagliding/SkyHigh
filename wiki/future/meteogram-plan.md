---
title: SkyHigh Meteogram — Build Plan & Stage Tracker
tags: [meteogram, thermal, forecast, future]
status: Stage 1 in progress (local, behind featureMeteogram flag)
updated: 2026-09-15
---

# SkyHigh Meteogram

A per-site time×altitude **chart** (the "when / how high") complementing the existing
thermal **map** overlay (the "where"). Both read the same daily ECMWF grids.

> **STANDING RULE:** no stage ships to production without Jon's explicit review.
> Everything is gated behind the `featureMeteogram` setting (default off).

## Decisions locked (2026-09-15)
- **Placement (Q1-A):** a `[Map] / [Chart]` toggle *inside* the existing site
  thermal panel (`SiteThermalPanel.tsx`) — not a new weather-card tab. Smallest
  blast radius; the map and chart are two lenses on one dataset.
- **Phase-1 data (Q2-A):** one endpoint `GET /api/weather/:siteId/meteogram`
  bundling thermal-grid series (ceiling/band/cloud) + fine-grid wind/precip.

## Data architecture
The thermal band must match the map's colours, so both feed
`getThermalStrength(effectiveWstar(wstar, cape))`.

| Series | Source | Notes |
|---|---|---|
| blh, cape, wstar, ccl, li, cloud, cloudLow | thermal grid (`extractThermalGrid`, nearest cell) | same overlay the map renders |
| wind_speed_10m, wind_direction_10m, precipitation, precipitation_probability | fine grid (`findNearestPoint`) | thermal grid lacks W* inputs? No — fine grid lacks W* inputs, so W* comes from the thermal grid |
| launch elevation | `sites.launchHeight` | ceiling AMSL = blh + launchHeight; also the launch reference line |

No new fetch: both grids are already cached for the wind/thermal map.
Server module: `server/grid/siteMeteogram.ts`. Route in `server/routes/weather.ts`.

## Stage 1 — chart on existing data ✅ COMMITTED (reviewed on-device 2026-09-15)
- ✅ `GET /api/weather/:siteId/meteogram` (`buildSiteMeteogram`). Parses the
  `launchHeight` display string ("798m / 2618'") to metres for the AMSL axis.
- ✅ `SiteMeteogramChart.tsx` (SVG): **BL Top line + Cu Base line** (Cu Base drawn
  only where CCL < BL Top = cumulus hours), per-hour W* band (same colours as the
  map), launch reference line, sky-icon row (☁/▨/🌧/·), wind row (speed over
  compass), crosshair, **metric/imperial toggle** via `useUnits`. 10am–8pm window.
- ✅ `[Map]/[Chart]` toggle in `SiteThermalPanel` (chart data fetched lazily) +
  chart-variant `ThermalHelpModal` explainer.
- ✅ `featureMeteogram` flag in Admin → Forecast (default off). NOTE: also had to
  add the key to `SettingsContext.buildSettings` — it uses an allow-list, and
  omitting a key silently drops it on the client (that hid the toggle first try).
- Review notes: unit toggle, Cu Base line, and edge-column band-clamp overlap all
  fixed live with Jon. "Above launch" tooltip row removed as redundant with the
  ceiling line + visible launch line.

## Stage 1b — round out Phase 1 (not started)
Flying-window highlight bar, novice-mode plain-English labels, tap-to-explain,
7-day thumbnail strip, mobile collapsed key-stats strip. Admin threshold keys for
cumulus/overdev/rain already exist in Admin → Forecast.

## Stage 2 — pressure-level soundings (new data)
Daily per-site fetch of temp/dewpoint/wind/geopotential-height at ~10 levels
(1000→600 hPa) into a new `site_soundings` table + schedule settings. Unlocks the
full 2D stability background (lapse-rate colours) + wind barbs at altitude.

## Stage 3 — advanced / XC
Skew-T panel + CAPE parcel trace + LCL cloudbase, behind `featureSkewT`.
Use ECMWF native CAPE, not our own (see parcel-ascent-validation memory).

## Verification discipline
Render to PNG and compare against a real RASP meteogram; measure band/texture
contrast before shipping; confirm the decoded values, not just that it "looks plotted".
