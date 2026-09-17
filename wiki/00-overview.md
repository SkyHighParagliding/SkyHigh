---
name: Overview — What is SkyHigh?
description: Project mission, goals, scope, what it is and is not, and current feature set
type: wiki
---

# Overview — What is SkyHigh?

> Last updated: 2026-09-17 — rewritten to match the shipped feature set. The
> canonical in-app feature catalogue is `src/pages/ProductSpec.tsx` (PRD) and
> `src/pages/Features.tsx` (Platform Overview); this file is the wiki summary.

## Mission

SkyHigh is a **club management platform for a single Australian paragliding /
hang gliding club**. It brings the club's fragmented infrastructure — flying
sites, live and derived weather, GPS flight tracking, pilot retrieval, safety,
membership, documents, and public web presence — into one hosted, mobile-first
platform that a non-technical committee can run entirely from the admin UI.

Built primarily for **club committees and their pilots**: committees manage
content, sites, safety, contacts and documents; pilots use the maps, weather,
check-in, flight tracker and retrieval board; the public browse sites, news,
events and how to join.

## Primary Pillars

### 1. Flying Sites Directory
- Browse launch/landing sites (Coastal / Inland) with open/closed status and scheduled-closure banners.
- Site detail: launch/landing heights (AMSL), wind direction/speed range, PG/HG ratings, contacts, coordinates, Google Maps link, rules and hazards (imported from siteguide.org.au or edited in-app).
- Interactive wind compass, live weather card, 7-day forecast strip, tide chart (coastal), Emergency Medical card (nearest hospitals ≤100 km), and a compact field view for QR scanning.

### 2. Weather — live + ECMWF-derived forecast tools
This is now a **substantial weather suite**, not a display-only wind readout:
- **Live station weather** from multiple networks (Weather Underground, BOM, Davis WeatherLink, FreeFlightWx/WDL, BRYC), polled during flying hours.
- **Animated wind map** — continental fine grid rendered as a Canvas particle field + speed heatmap (D3 zoom/pan), with a timeline scrubber (Today / 7-day).
- **Thermal map overlay** — a derived thermal-strength (W\*) / boundary-layer-height / cloud-base / CAPE / cloud-cover layer, colour-mapped and land-masked, scrubbable across all ~3 forecast days of flying hours.
- **Ground / altitude readout** — tap any point for terrain elevation (AMSL, from client-side terrarium tiles), plus boundary-layer top and cloud base shown both AGL and AMSL, with airspace-conflict detection at those altitudes.
- **7-day + extended outlook** — per-site daily flyability derived from ECMWF, plus an 8-day extended grid.
- **Point Meteogram ("Chart")** — a time-series thermal/wind forecast for a tapped point *(feature-flagged, rolling out)*.
- **Interactive SkewT sounding** — a vertical sounding built from ECMWF pressure levels + validated parcel physics, with a draggable trigger-temperature handle that projects thermal top and cloudbase live *(feature-flagged, rolling out)*.

SkyHigh does **not run its own numerical weather model** — it consumes ECMWF/Open-Meteo and BOM/station data and derives glider-relevant products (thermal strength, cloudbase, soundings) from it.

### 3. XC Maps & GPS Flight Tracking
- Full-screen Leaflet XC map (street/satellite/topo) with distance rings, bearing lines, distance-sorted site selector, live weather-station markers, an IDW wind-field overlay, OpenAIP airspace overlay with altitude filtering, offline tile download, QR deep-links, fullscreen and track-up modes.
- GPS flight tracker (separate pilot accounts): live breadcrumb recording with barometer/GPS fusion, auto start/stop detection, live stats, a live pilot map, and pilot-to-pilot messaging.
- Flight history (up to 500 flights/pilot) with track maps and **export to IGC / GPX / KML**.

### 4. Retrieval & Duty-Pilot Coordination
- Retrieval board: auto-entry on flight end or in-flight request; driver map, claim/navigate flow, live driver-position broadcast, picked-up confirmation, same-day scope.
- **Satellite-tracker fallback** (Garmin inReach / SPOT / ZOLEO) polled when a pilot loses mobile signal.
- Duty-pilot map showing all active pilots; a demo mode with synthetic GPS for training.
- Airspace safety tools: dedicated airspace page, in-flight proximity alerts (flash + beep + haptic) with configurable buffer.

### 5. Safety, Check-in & Community
- Safety & Rules page, auto-populated Safety Officer directory, optional online check-in flow with per-site stats.
- News, Events (TidyHQ), dynamic CMS pages, Club Photos / Video Wall / Instagram Wall, community photo submissions, Sponsors, Business Directory, Ground Handling, Shop, and a configurable Join page.

### 6. Admin CMS & Operations
- Session-authenticated admin dashboard with an AI smart-search bar (deep-links into edit dialogs).
- Site management (siteguide import with archive/restore, WTF wind compare, Smart Site Generator), content editors (news, pages, safety, 22-section Procedures Manual, competitions, home/join settings), image library with AI enhancement + watermarking + variant generation, document/project management, contact directory, and analytics.
- Scheduled-tasks control panel for all cron jobs and cache TTLs.

### 7. Integrations & AI
- **TidyHQ** (events, contact import, webhook role sync), **Google Drive/Sheets** via Apps Script bridge (documents + AI-search indexing), **Cloudflare R2** media storage, **Google Gemini** for all AI (site scraping, image enhancement, admin search, public smart assistant), **AWS terrain tiles**, **OpenAIP**, **OSM/Overpass**.

---

## What SkyHigh IS

✅ A **single-club management platform** — operated by one club's committee (one deployment = one club).
✅ **Configurable identity** — club name, logo, tagline, colour set through admin settings; no code changes.
✅ A **weather tool for pilots** — live station data plus ECMWF-derived thermal, cloudbase, sounding and forecast products (it surfaces/derives forecasts; it does not run its own weather model).
✅ **Real-time** — live map tracking, retrieval board, pilot messaging, live weather polling.
✅ **Mobile-first & installable** — responsive, PWA, offline map-tile caching for use in the field.
✅ **AI-assisted** — Gemini for content and search, as an aid to (not a replacement for) human judgment.
✅ **Data-persistent** — sites, flights, retrievals, contacts and content stored permanently.

---

## What SkyHigh IS NOT

❌ A **public social network** — pilot accounts exist for tracking/retrieval and there is direct pilot-to-pilot messaging, but there are no public profiles, feeds, follows, comments or ratings.
❌ A **booking system** — no launch-slot or tandem reservations.
❌ A **full personal logbook** — it records GPS flights and exports IGC/GPX/KML, but pilots keep their primary logbook (e.g. XContest) externally.
❌ An **e-commerce platform** — the Shop page is links/merch only; membership and payments are handled by TidyHQ.
❌ A **numerical weather model** — it derives thermal/sounding/forecast products from ECMWF/Open-Meteo and station feeds; it does not generate its own NWP forecast.
❌ **Multi-tenant SaaS** — one deployment serves one club.
❌ An **external alerting system** — no SMS/email push to pilots; alerts are in-app (retrieval board, airspace proximity beep/haptic, live map).
❌ A **compliance/enforcement system** — the Procedures Manual and safety tools aid creation and distribution but do not enforce compliance.

---

## Out-of-Scope Features

Explicitly decided **not** to build:
- Public pilot profiles / social feeds / follows / comments.
- Booking / slot-reservation systems.
- Payments, memberships or donations in-app (TidyHQ owns membership).
- SMS / email push notifications to pilots (in-app + SSE/live only).
- Automatic emergency escalation (retrieval and alerts are human-triggered).
- A self-hosted numerical weather model (SkyHigh consumes and derives from ECMWF/BOM).
- Multi-tenant / multi-club hosting.

---

## Domain Context

**Paragliding (PG) / Hang Gliding (HG)** are unpowered sports where pilots launch
from hills or tow systems and ride thermal and ridge lift to gain altitude. **XC
(cross-country) flying** means flying away from launch toward distance goals.
**Retrieval** is the logistics of collecting a pilot from where they land out.
Because thermals, cloudbase and airspace all matter, the ECMWF-derived thermal
and sounding tools exist to help pilots judge *how high and how strong* the day
will be over the ground they will actually fly.

**Australian clubs** are volunteer-run, typically 20–100 active members, with
committee roles (President, Treasurer, Safety Officer, Site Warden). Reliable,
mobile-accessible information — conditions, site details, emergency procedures
and flight/retrieval coordination — is the core need SkyHigh serves.
