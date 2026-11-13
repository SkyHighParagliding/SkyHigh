---
title: Live stations overlay: build decisions for review
date: 2026-11-13
tags: [windmap, stations, decisions]
---

# Live stations overlay: decisions for Jon to review

These are the judgement calls made while building tasks 1–4 of [[station-overlay-plan]]. Jon asked for best-judgement decisions, with a stop only for critical ones. Each one is easy to change unless marked otherwise.

## Coordinator (overall shape)
- **One shared contract file, `shared/stations.ts`:** server and client import the same `LiveStation` type, so their field names can't drift apart.
- **Speeds are knots everywhere in the data:** the client converts using the map's existing kt/mph/kph setting (as before).
- **BOM direction is a 16-point compass only (22.5° steps):** BOM's JSON doesn't give degrees. WeatherWatcher shows degrees, but we chose BOM direct, so box angles snap to 16 directions. That's fine for a map glance.
- **Polling only runs while people are looking:** the server polls BOM only while someone has requested the overlay in the last 30 minutes. 100 stations every 10 minutes around the clock would be ~14,000 requests a day to BOM for nothing.
- **Our own site stations within 0.5 km of a BOM station are left out:** many LiveWind stations are BOM stations under another name, so showing both would draw two boxes on the same spot.
- **The BOM station list stays in `server/bomWeather.ts`:** that file already has it (100 VIC stations), so it isn't moved or copied.
- **Stations router is mounted before the weather router:** otherwise `/api/weather/:siteId/history` would swallow `/api/weather/stations/history`.
- **Station tap is handled before the map pin:** tapping a box opens the station card and does not drop the forecast pin. Tapping anywhere else on the map goes back to the normal card.

## Server (`server/stations/`, `server/routes/stations.ts`)
- **BOM coordinates come from our static list (2 decimals):** BOM's own files only give 1 decimal place, which is about 10 km out.
- **No elevation:** BOM's JSON doesn't include it.
- **Calm (0 kt) → no direction.** Unknown direction strings → no direction, but the speed is kept. Readings with no speed are skipped.
- **Gust is shown as BOM reports it:** not clamped when it's below the speed. The box drops the `G` part in that case.
- **Pressure:** QNH first, then MSL, then station pressure.
- **History is the 6 h before the station's newest reading:** a station that has gone quiet still shows its last 6 hours.
- **Fetching:** 2 attempts, 10 s timeout, 6 at a time. A full refresh of 100 stations took about 6.5 s. In the first run 9 failed; the log names them.
- **Polling:** starts on the first request, refreshes every 10 min, and stops after 30 min with no requests. Refreshes never overlap.
- **First request after a quiet spell:** waits up to 10 s for the first fill, then returns whatever is ready.
- **Site stations:** only live-enabled sites with a reading under 6 h old, alt stations included. A station shared by two sites appears once. Position is the station's own coordinates, or the site's if it has none. The list is read from the DB and cached for 2 min.
- **Attribution labels:** `wdl-`/`wport-` are shown as "Weather Display Live". Any id without a known prefix is shown as Weather Underground.
- **Site-station history is sparse:** we only save a reading every few minutes while the scraper runs. In dev, a station can have only 1–2 points, and the chart copes with that.
- **Both endpoints cache for 2 min** (`Cache-Control: public, max-age=120`).
- **Cache is in memory only:** a restart empties it, and polling restarts on the next request.

## Map boxes (`src/components/windmap/stationMarkerRenderer.ts`)
- **The station is at the flat tail of the box, marked with a small white dot:** the box streams downwind from it, the same way the particles move. The point isn't put on the station, because that would read as "wind arriving here".
- **Text flips when the point faces left:** so it never reads upside down. Boxes pointing straight up or down read along their length.
- **Calm is judged after converting to your unit:** 0.3 kt shows `0` in kt but `1` in kph. A calm box, or one with no direction, is a round pill centred on the station, with no point.
- **Fill is the same speed colour scale as the wind particles:** text is white or near-black, whichever reads better on that colour. Each box has a white halo plus a thin dark line, so it reads on both the dark wind map and the light thermal/radar map.
- **Old readings (over 90 min):** grey fill with a dashed outline. **Selected station:** thick white outline. **Map time not on "now":** boxes faded to 35%.
- **When boxes overlap:** keep the selected station first, then our site stations, then the stronger wind. The overlap test uses each box's square bounds, so diagonal boxes clear slightly more room than they strictly need.
- **Font is 11px:** 1px larger than the site labels, so the numbers read easily.
- **Finger slop:** a tap within 6 px of a box counts as a hit. If two boxes match, the nearest one wins.
- **A station tap never drops the forecast pin**, on any layer.

## Card, chart and switch (`StationCard.tsx`, `StationHistoryChart.tsx`, `useLiveStations.ts`, `SitesWindMap.tsx`)
- **Tapping a station clears the forecast pin:** the pin stays put on screen while the map pans, so without clearing it a pan couldn't be told apart from a new tap. Any map tap after that returns to the normal card. The cost is that the pilot's pin is lost when they tap a station.
- **Half a second's grace after a station tap:** stops the last canvas frame from closing the card the moment it opens.
- **The station card keeps the time pills** (forecast or radar), so the layout matches style guide §6 and the dotted forecast line follows the map time.
- **Map time not on "now":** the forecast line shows "at <map time>", the card says "Observed: now · the map shows a forecast time", and the switch shows "· Observed: now". Radar always counts as now.
- **Site guide link:** matched by site name, otherwise any site within 1 km.
- **Attribution goes at the very bottom of the card,** the same place as "© RainViewer".
- **Card fills in this order:** headline (name, time and "N min ago", Stale tag, `Obs 9 G12 kt / NNW`, `Fcst 7 kt / N`), then details, then the chart. Speeds are whole numbers. "Calm" shows when speed and gust both round to 0.
- **Chart:**
  - Always covers the last 6 hours.
  - Lines break where readings are more than 60 min apart.
  - Hour labels on every other tick, in the shared 12/24 h style.
  - Direction arrows at least 14 px apart.
  - The y-axis tops out at 10 or more, rounded up to the next 5 (or 10 above 30).
  - The dotted forecast line only covers times the forecast has data for.
  - A small Wind / Gust / Forecast legend sits underneath.
- **Switch:** green when on. A spinner shows only on the first load; on an error, a red dot and a tooltip. It shares a row with the layer pill and wraps on narrow screens.
- **Speed-unit code moved:** it now lives in `StationHistoryChart.tsx` and the map imports it, so there's still only one copy.
- **The selected station's card refreshes** with each 5-minute update.

## After review and browser check (13 Nov)
- **Site markers take a tap before station boxes:** our site stations often sit right on their site (FreeFlightWx has no coordinates of its own), so a box there was stealing the site tap. A box still wins anywhere outside the 12 px site-marker radius.
- **Faded boxes are 60%, not 35%:** the Flying Sites page opens on its set default hour, not "now", so the boxes start faded. At 35% they were too washed out to read. The "· Observed: now" note on the switch explains the fade.
- **"Possibly stuck" instead of stale for feeds with no per-station time (Jon's idea):** LiveWind gives one time for its whole feed, so a dead mast never goes stale. For our site stations the server now checks the saved readings: if speed, gust and direction haven't changed for **75 min or more over at least 4 readings, with wind above 0**, the station gets `unchangedSince`. The box gets an amber dashed outline, and the card gets an "Unchanged" tag plus "Same reading since 1:10 pm: the station may be stuck". Calm is never flagged (a calm night really does read 0 for hours). Stale wins over stuck. The threshold came from 48 h of prod data to 13 Nov: healthy LiveWind stations repeated a reading for at most ~45 min (Aireys Inlet once 60), while Sandringham YC (99 min), Fawkner Beacon (95) and Mt Elliot FFWX (85) looked stuck. It applies to every site-station source, not just LiveWind. It can't catch a dead station that reports calm.
- **A station-id change on a site can briefly show the old reading under the new id:** readings are saved per site. It clears with the next scrape. Accepted.
- **New LiveWind stations show a near-empty chart at first:** we only hold what our scraper has saved (a point every few minutes). BOM stations have the full 6 h.
- **Close button has an aria-label** ("Close station").
