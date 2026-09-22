# Site Logic — Instance Catalogue

This catalogue documents every distinct decision, threshold, gate, and default found by scanning the whole SkyHigh codebase, using the principles and template in `../site-logic.md`. The inventory spans 474 individual entries across 107 domain groups, organized by 8 functional areas.

## [Smart Search & AI Safety](01-smart-search-ai-safety.md)

58 entries, 11 groups:
- Emergency Circuit-Breaker (4)
- Eligibility Engine — Rating-First Rule (10)
- Context Filtering — Hard Exclusion of Unflyable / Ineligible Sites (9)
- Conditions Qualifications — Mandatory Hazard Opening (5)
- Post-Generation Response Enforcement (3)
- Site Name Resolution (6)
- Caching (7)
- AI Model Configuration (4)
- Search Query Logging (4)
- AI JSON Parsing Fallbacks (2)
- Client-Side Decisions (4)

## [Weather Ingestion & Flyability Labels](02-weather-flyability.md)

47 entries, 13 groups:
- Flyability Status Buckets (6)
- Gust Ceiling (1)
- N/A Fallback When Site Data Is Incomplete (1)
- Colour Coding (2)
- Forecast Windowed Strip (5)
- Live Observation Staleness (5)
- Cache TTLs & Staleness Windows (10)
- Scraper Operating Schedule (3)
- Daily Grid Pre-fetch Schedule (4)
- Open-Meteo API Selection (2)
- `fetchWithRetry` Network Gate (2)
- Davis WeatherLink Station Source Selection (3)
- Station Source Identification (3)

## [Wind/Thermal Grid Data Pipeline](03-grid-pipeline.md)

71 entries, 14 groups:
- Provider Chain & Tier Ordering (5)
- Time Axis & Midnight Anchoring (4)
- Grid Geometry & Resolution (5)
- Coverage Rules: Required vs Optional Variables (5)
- Caching & Staleness (5)
- Open-Meteo API Provider Specifics (3)
- S3 `.om` File Read Shapes (11)
- NOMADS GFS Provider Specifics (4)
- Parcel Ascent & Lifted Index (6)
- W* (Deardorff Convective Velocity Scale) (5)
- Baked Land Mask (6)
- Elevation Tiles (4)
- Health Alerting (3)
- Thermal Overlay Extraction (5)

## [Wind & Thermal Map Rendering](04-map-rendering.md)

67 entries, 15 groups:
- Zoom Floor and Pan Bounds (4)
- CARTO Basemap (4)
- Base-Map Detail Slider (Multiply Re-pass) (2)
- Thermal Colour Scale (7)
- Wind Speed Overlay (4)
- Wind Particle Trails (7)
- High/Low Resolution Wind Grid Blend Zone (1)
- Cloud and Overcast Rendering (9)
- Cumulus Glyph Lattice (7)
- OD (Overdevelopment) Warning Triangles (5)
- Rain Wash (2)
- Land Mask and Coastline (2)
- Terrain Tile Elevation Sampling (7)
- Service Worker Tile Caching (4)
- Ground Registration (Stale-Raster Affine Correction) (2)

## [Authentication, Sessions & Security](05-auth-security.md)

54 entries, 17 groups:
- Admin session management (5)
- Pilot session management (3)
- Pilot password requirements (3)
- Password hashing (3)
- Password reset tokens (5)
- Last-admin guard (1)
- SO proximity enforcement (5)
- Rate limiting (9)
- CSRF protection (6)
- SSRF prevention (2)
- SQL injection prevention (1)
- Input sanitisation (4)
- Markdown sanitisation (1)
- Security response headers (3)
- Admin route access control (client-side) (1)
- Pagination caps (1)
- Dev bypass (1)

## [Admin CMS — Settings & Feature Flags](06-admin-settings.md)

47 entries, 11 groups:
- Settings API — access & caching (5)
- SettingsContext — client hydration (7)
- Feature Flags (Forecast) (3)
- Thermal Map Thresholds (Admin → Forecast) (15)
- Base-Map Detail Slider Range (Admin → Forecast) (2)
- Thermal Map Display (1)
- Scheduled Closure Calendar (3)
- Scheduled Tasks & Cache TTLs (6)
- Wind Map Particle Defaults (3)
- Bulk Image Upload Limit (1)
- SO Proximity Prompt (1)

## [External Integrations & Scheduling](07-integrations-scheduling.md)

52 entries, 10 groups:
- Scheduled Grid Fetches (12)
- TidyHQ Integration (9)
- Gemini AI Configuration (4)
- Storage: R2 vs Local Fallback (5)
- Google Drive — Apps Script Bridge (3)
- Satellite Trackers (6)
- Search Cache (4)
- Weather API Cache Headers (3)
- Admin Sessions (2)
- Siteguide Version Check (4)

## [XC Flight Tracking, Retrieval & Media/Images](08-xc-tracking-media.md)

78 entries, 16 groups:
- Flight Tracker — Auto-start / Auto-stop Gates (4)
- Flight Tracker — Altitude Smoothing & Barometer Fusion (6)
- Flight Tracker — GPS & Sync Intervals (5)
- Flight Tracker — Live-Pilot Position TTL (Server Side) (4)
- Retrieval System — Scope & Lifecycle (6)
- Retrieval SSE / Fallback Polling (4)
- Retrieval — Satellite Tracker Integration (6)
- Retrieval — OSRM Routing (5)
- Airspace Proximity Alerts (5)
- Offline Tile Caching (2)
- Map Messages (3)
- Image Processing — Variants & Size Constraints (12)
- Image Processing — Watermarking (6)
- Image Submissions (Public Upload) (4)
- Storage — R2 / Local Fallback (4)
- Stale Image Repair (2)

## Cross-domain overlaps

The following topics appear in multiple files. The file listed first is the canonical primary home for each topic:

- **Cache TTLs, staleness windows, and expiry policies**: 
  - Primary: `02-weather-flyability.md` (Cache TTLs & Staleness Windows)
  - Also in: `03-grid-pipeline.md` (Caching & Staleness), `06-admin-settings.md` (Scheduled Tasks & Cache TTLs), `07-integrations-scheduling.md` (Weather API Cache Headers), `01-smart-search-ai-safety.md` (Caching)

- **Gust thresholds and gust ceiling constraints**:
  - Primary: `02-weather-flyability.md` (Gust Ceiling, Flyability Status Buckets)
  - Also in: `05-auth-security.md` (mentioned in rate-limit context)

- **Scheduled fetch operations and grid pre-fetch timing**:
  - Primary: `07-integrations-scheduling.md` (Scheduled Grid Fetches)
  - Also in: `02-weather-flyability.md` (Daily Grid Pre-fetch Schedule), `06-admin-settings.md` (Scheduled Tasks & Cache TTLs)

- **Base-map detail slider and legibility controls**:
  - Primary: `04-map-rendering.md` (Base-Map Detail Slider)
  - Also in: `06-admin-settings.md` (Base-Map Detail Slider Range)

- **Tile caching (CARTO, terrain, service-worker offline)**:
  - Primary: `04-map-rendering.md` (CARTO Basemap, Terrain Tile Elevation Sampling, Service Worker Tile Caching)
  - Also in: `08-xc-tracking-media.md` (Offline Tile Caching)

- **Settings access, caching, and context hydration**:
  - Primary: `06-admin-settings.md` (Settings API — access & caching, SettingsContext)
  - Also in: `07-integrations-scheduling.md` (Admin Sessions), `05-auth-security.md` (Session management)

- **SO (Site Owner) proximity enforcement and prompt**:
  - Primary: `05-auth-security.md` (SO proximity enforcement)
  - Also in: `06-admin-settings.md` (SO Proximity Prompt)

- **Retry policy, network timeouts, and backoff logic**:
  - Primary: `02-weather-flyability.md` (`fetchWithRetry` Network Gate)
  - Also in: `03-grid-pipeline.md` (S3 `.om` File Read Shapes, NOMADS GFS Provider), `07-integrations-scheduling.md` (TidyHQ Integration), `08-xc-tracking-media.md` (Satellite Trackers)

- **Rate limiting and request caps**:
  - Primary: `05-auth-security.md` (Rate limiting)
  - Also in: `03-grid-pipeline.md` (429 rate-limit handling, Open-Meteo batch limits), `02-weather-flyability.md` (Bulk weather endpoint caps)

- **Storage fallback (R2 vs local) and cloud media handling**:
  - Primary: `07-integrations-scheduling.md` (Storage: R2 vs Local Fallback)
  - Also in: `08-xc-tracking-media.md` (Storage — R2 / Local Fallback)
