# RESUME_HERE — Last updated: 2026-08-30 (session 44)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 44 added **Davis / WeatherLink** as a fifth live weather source, alongside BOM,
FreeFlightWx, Live-Wind and Weather Underground. Seeded with the **Mount Martha Yacht Club**
station, which sits 3.3 km from the Craigie Rd, Mt Martha site (vs 14.5 km for the Frankston
Beach station that site currently uses).

Uses the club's **public WeatherLink embeddable page** endpoint —
`weatherlink.com/embeddablePage/getData/{token}` — which returns JSON with no authentication.
The official WeatherLink v2 API was rejected because its key + secret are issued per *account*,
so it would require MMYC to hand over credentials. See DECISION-010.

New file `server/davisWeather.ts`; station IDs are `davis-{32-char-hex-token}`. Adding another
Davis club station later is a one-line append to `DAVIS_STATIONS`.

**Also fixed a latent bug found while doing this:** Weather Underground is the catch-all branch
in two separate places, and each hardcoded its own list of "not WU" prefixes. The copy in
`server/routes/weather.ts` had never been updated for BOM — so an assigned-but-out-of-radius
`bom-` station silently failed to resolve in the admin station picker (verified: Wilsons
Promontory at 198 km returned nothing, now returns correctly). Both call sites now share
`isWuStationId()` / `NON_WU_STATION_PREFIXES` in `server/weather-utils.ts`.

Verified end to end: typecheck clean; parsed values match the raw feed exactly (8.8kt→9,
13.8→14, 274°→W, timestamp exact); `davis` scraper loop starts; station appears at 3.27 km in
the picker; a temporary alt-station assignment wrote a correct `weather_observations` row and
was reverted. No WU errors on `davis-` IDs.

## Last completed task
- Session 44 (2026-08-30): Davis/WeatherLink live weather source + WU catch-all prefix fix

## Currently in progress
- Nothing

## Next task to start
- **Decide whether to repoint Craigie Rd, Mt Martha** from `livewind-94871` (Frankston Beach)
  to `davis-82c002b05de74cc5ab177b0ba2b73c80`. Deliberately NOT done — it's a live data change
  and needs Jon's call. It's a one-click change in Admin → Site Edit. Arthurs Seat may benefit too.
- **Fix Smart Search manual-test issues** (Jon found issues at end of session 40 — ask Jon for his
  findings; commit `1455482` is local-only and must NOT be pushed until fixed)
- After Smart Search fixed: "Report bad answer" button for Smart Search chat
- Then: TASK-030 Siteguide Version Change Email Notification
- Future: Weather panel upgrades using WeatherWatcher API (history trend tab) + BRYC data (Red Bluff panel)

## Open questions / blockers
- **BLOCKER (carried from session 40):** Jon's manual test of Smart Search safety layer found
  issues — do not push/deploy commit `1455482` until he describes them and they're fixed
- **Confirm MMYC coordinates.** Registry uses `-38.2758, 145.0055` (Esplanade clubhouse), derived
  by hand — the WeatherLink payload carries no lat/lon. Worth eyeballing on the map; it only
  affects distance ranking in the picker, not the readings.

## Quick context refresher
SkyHigh is the paragliding club platform on Railway. Live weather now comes from five sources,
each on its own randomised scrape interval configurable in Admin → Scheduled Tasks. Davis is the
newest and needs no API key. Smart Search safety layer (session 40, commit `1455482`) remains
local-only pending Jon's manual-test issue list.
