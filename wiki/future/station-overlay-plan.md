---
title: Live stations overlay for the Flying Sites map (plan)
status: proposed
date: 2026-11-13
tags: [windmap, stations, plan]
---

# Live stations overlay: plan

Goal: an optional overlay on the Flying Sites map (`SitesWindMap.tsx`) that shows observed wind at weather stations, like weatherwatcher.com.au, on top of the Wind, Thermal or Radar forecast so pilots can compare forecast with what's actually blowing.

## Decisions so far (Jon, 2026-11-13)
- **Stations:** BOM stations + SkyHigh's own site stations (LiveWind, FreeFlightWx, WU, Davis) + WeatherWatcher's community ("adhoc") stations.
- **BOM data comes from BOM directly**, not WeatherWatcher's API.
- **On/off toggle over any layer**, not a 4th peer layer in the Wind | Thermal | Radar pill (DECISION-016 stays as is).
- **Tap a station:** the standard tapped-point card plus a 6 h wind/gust history chart.
- **Marker:** a note box reading `9 G12` (speed, then gust), with one end pointed. The whole box turns to line up with the wind direction.

## What was checked (13 Nov)
- BOM per-station JSON (`reg.bom.gov.au/fwo/IDV60801/IDV60801.<wmo>.json`) still works and is what `server/bomWeather.ts` already uses. Each file carries ~72 h of half-hourly readings (speed, gust, direction, temp, pressure), so the history chart needs no extra source.
- WeatherWatcher's adhoc list (`/anonymous/urls` → signed `adhocstations.json`) has 32 VIC stations. Each entry includes its **original source URL** (Weather.com PWS, WeatherDisplay `clientraw.txt`, WeatherLink, Cumulus, VicPorts, a few one-off club sites). Counts: VicPorts 9, WeatherCom PWS 6, WDL 5, WeatherLink 5, Cumulus 2, weatherview32 2, one-offs 4.
- Those Weather.com entries embed **WeatherWatcher's own API key. We must not use it.** WU/PWS stations go through our existing WU fetcher and key.

## Design

### Server
1. **`server/stations/` module, one station list:** `{ id, name, lat, lon, elevation, source }`. IDs use the existing prefix scheme (`bom-…`, `livewind-…`, bare WU, and so on). Any new prefix goes in `NON_WU_STATION_PREFIXES`.
2. **Sources:**
   - BOM: the `BOM_VIC_STATIONS` list already in `bomWeather.ts` (move it into the new module; it isn't duplicated).
   - Ours: every station linked to a site (already fetched for weather cards).
   - Adhoc: fetch the WeatherWatcher adhoc list **once a day** as a directory only (name, position, source type, source URL). Then read each station **from its original source** with our own parsers. Build parsers in order of payoff: WDL `clientraw.txt` (BRYC notes exist) → WU/PWS (our key) → WeatherLink → Cumulus → VicPorts → one-offs. Skip any station with no parser yet; it just doesn't show.
   - **Fallback (approved):** for adhoc stations we can't parse yet, use WeatherWatcher's `station/current` and `history` endpoints.
3. **Polling:** one background job every 10 min (BOM updates every 10–30 min), with requests spread across the window, roughly 80 BOM + ~30 adhoc fetches. Latest reading + 6 h history kept in memory; nothing new in the DB. Startup fills the cache straight away. Fetching only in the background means user traffic never reaches BOM or the club sites.
4. **API:**
   - `GET /api/weather/stations/live` → `[{ id, name, lat, lon, speedKt, gustKt, dirDeg, tempC?, qfe?, obsTime, source }]`. Cached 2 min; `Cache-Control` matches.
   - `GET /api/weather/stations/:id/history?hours=6` → `[{ t, speedKt, gustKt, dirDeg }]`.
   - Speeds are stored in **knots**; the client converts with the existing kt/mph/kph unit switch.
   - Readings older than 90 min are flagged `stale`, not dropped.

### Client
1. **Toggle:** a "Stations" switch next to the `LayerSelector` pill. Remembered per browser (localStorage, wrapped in try/catch). Off by default.
2. **Marker renderer** (`windmap/stationMarkerRenderer.ts`, drawn on the canvas like `siteMarkerRenderer.ts`, not as DOM markers):
   - Rounded box with one pointed end, rotated so the point faces **downwind** (direction + 180°).
   - Text `9 G12` in the user's speed unit. Gust is left out when there's no gust reading or gust ≤ speed.
   - **Text stays upright.** If the box is turned more than 90°, the text is drawn the other way round so it never reads upside down.
   - Box fill coloured by speed, using the same scale as the wind overlay, so a box matches the particles under it. Stale readings are greyed and dashed.
   - Calm (< 1 kt): a small round box reading `0` with no point.
3. **Clutter control:** at low zoom, overlapping boxes are thinned on screen (keep the station nearest a flying site, then the strongest wind). Every station shows once zoomed in.
4. **Units (tap to change):** the station card uses the map's existing unit state (`speedUnit` / `cycleSpeedUnit` in `SitesWindMap.tsx`, remembered per browser). Tapping a speed or gust cycles kt → mph → kph; tapping the direction toggles compass ↔ degrees. It's one shared setting, so the box labels, the card, the chart axis and the forecast card all change together. The chart's y-axis label shows the unit.
5. **Tap:** reuses the tapped-point card (style guide §6). Headline: name, obs time, `9 G12 kt NNW`, then temp/pressure when present, distance from the nearest site, source + attribution, then a 6 h chart. The chart has a speed line, a shaded gust band, direction arrows along the bottom, and a dotted line for the forecast wind at that point so you can compare them.
6. **Refresh:** react-query, 5 min `refetchInterval` while the toggle is on and the tab is visible.
7. **Map time:** the overlay always shows *now*. When the map's time scrubber is off "now", boxes fade and the toggle shows "Observed: now" so nobody reads them as forecast.

### Attribution
- BOM: "Observations © Commonwealth of Australia, Bureau of Meteorology" in the card and legend.
- Adhoc stations: owner name + link from the card ("Data: Rye Yacht Club"). Credit WeatherWatcher in the legend as the station directory.

## Tasks
| # | Task | Size |
|---|------|------|
| 1 | Station registry + BOM poller + `/stations/live` + `/history` (BOM + our site stations) | M |
| 2 | Arrow-box canvas renderer + toggle + upright text + speed colours + stale state | M |
| 3 | Clutter control | S |
| 4 | Tapped-point station card + 6 h chart with forecast line | M |
| 5 | Adhoc directory (daily) + WDL `clientraw` and WU parsers | M |
| 6 | WeatherLink, Cumulus, VicPorts parsers (+ WW fallback if approved) | M |
| 7 | Attribution, wiki (`12-map-ui-style-guide.md`, `05-file-map.md`, decision record), phone check at 390×844 | S |

Tasks 1–4 make a usable first release (BOM + our stations). Tasks 5–6 add the community stations.

## Verification
- Unit tests: BOM JSON parser, each adhoc parser (saved sample files), upright-text angle maths, clutter thinning.
- Compare 5 stations with weatherwatcher.com.au at the same time: speed, gust and direction should match within one reading.
- Headless phone + desktop screenshots (playwright-core / msedge) with the overlay on over each of Wind, Thermal and Radar, plus a box at every 45° to check the point and the text.
- Prod: watch the poller logs for 24 h for failure counts by source.

## Answered (Jon, 2026-11-13)
1. **Point faces downwind** (where the wind is going), matching the particle flow on the map.
2. **WeatherWatcher fallback approved:** adhoc stations without our own parser read from WW's `station/current` + `history` endpoints until a parser exists. Cache as for everything else; fetch only from the background job.
3. **Victoria only.**
