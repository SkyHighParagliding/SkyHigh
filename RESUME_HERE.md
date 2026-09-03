# RESUME_HERE — Last updated: 2026-09-03 (session 45)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 45 was a polish pass on the **Wind History panel** (introduced last session):

- **Multi-source history**: Sites with two live sources (e.g. Flinders Golf Club) now track
  each source independently. History query passes `?station=<name>` and switches automatically
  when the user swaps sources. The previous bug was that alt-source history wrote under
  `siteId='site:alt'` (never queried); fixed with `historySiteId` parameter in `saveObservation()`.

- **Chart text sizing**: Removed SVG `viewBox` entirely; switched to ResizeObserver so 1 SVG
  unit = 1 CSS px always. Font sizes now match the rest of the app.

- **Chart smoothing**: Lines (speed, gust, direction) use Catmull-Rom → cubic bezier smoothing
  (tension 0.3 for speed/gust, 0.2 for direction).

- **Matrix row reorder**: Avg Wind → Max Gust → Avg Dir (was Max Gust first).

- **Matrix colour coding**: Values now use site colour scheme (green/yellow/orange/red) via
  `getWindStatus`, matching ECMWF forecast slot colours exactly.

- **Wind History as default tab**: Live-weather sites now open with Wind History showing.
  Non-live sites still default to 7-Day Outlook (fixed `showOutlook` logic in
  `ExtendedOutlookPanel` to account for `!hasLiveWeather`).

- **"Last 15M" bucket**: Was "Last 10M" — changed to close the 10–15 min gap with the next bucket.

- **KTS axis label**: Added rotated label on left Y axis.

- **NOW label spacing**: Lifted to same vertical gap as N→NE compass spacing.

All changes deployed to Railway (commits 56589d1 → 2139447).

## Last completed task
- Session 45 (2026-09-03): Wind History panel polish (smoothing, colours, layout, default tab)

## Currently in progress
- Nothing

## Next task to start
- **Decide whether to repoint Craigie Rd, Mt Martha** from `livewind-94871` (Frankston Beach)
  to `davis-82c002b05de74cc5ab177b0ba2b73c80`. Deliberately NOT done — one-click in Admin → Site Edit.
- **Fix Smart Search manual-test issues** (Jon found issues — ask for his findings). Code is
  already deployed on Railway (commit 1455482 on origin/main).
- After Smart Search fixed: "Report bad answer" button for Smart Search chat
- Then: TASK-030 Siteguide Version Change Email Notification
- Future: Weather panel upgrades using WeatherWatcher API + BRYC data (Red Bluff panel)

## Open questions / blockers
- **⚠️ CORRECTION (session 44):** The Smart Search "do not push" blocker was wrong — commit
  `1455482` is already on `origin/main` and live on Railway. Jon's manual-test issues are
  live-site issues. Still need his findings to plan the fix.
- **MMYC coordinates** — registry uses `-38.2758, 145.0055` (derived by hand, no lat/lon in
  WeatherLink payload). Worth eyeballing; only affects distance ranking in picker.

## Quick context refresher
SkyHigh is the paragliding club platform on Railway. Live weather has five sources (BOM,
FreeFlightWx, Live-Wind, Weather Underground, Davis/WeatherLink). The Wind History panel is
now polished and deployed: colour-coded matrix, smooth chart, correct default tab. Smart Search
safety layer is deployed but has outstanding manual-test issues Jon found.
