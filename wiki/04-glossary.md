---
name: Glossary — Flying Domain, Technical Terms, and Admin System Terminology
description: ~35 defined terms organized into flying domain, tech/systems, and admin categories
type: wiki
---

# Glossary — 35 Key Terms

Reference guide for domain-specific and technical terminology used in SkyHigh codebase and operations.

---

## Flying Domain (Paragliding / Hang Gliding)

### XC (Cross-Country)
Flying away from the launch site towards a distance goal. Pilots aim for maximum distance, using thermals and ridge lift. In SkyHigh, XC flights are tracked via GPS upload.

### PG
Paragliding — foot-launched unpowered flight using a fabric wing (parachute-like). Pilot controls via brake lines. Most common in SkyHigh.

### HG
Hang Gliding — towed or foot-launched unpowered flight using a rigid triangular frame with fabric. Pilot hangs below wing in harness. Less common but supported.

### Launch
Takeoff point, typically a hill or ridge. Also called "ramp" (HG) or "hill" (PG). SkyHigh sites database includes launch information (elevation, aspect, wind requirements).

### LZ (Landing Zone)
Safe area to land. Can be beach, paddock, or designated field. Critical for retrieval coordination if pilot doesn't reach next launch.

### Top Landing
Landing on the hill (back at launch) instead of descending to LZ. Possible in strong ridge lift conditions.

### Thermal
Vertical column of rising warm air. Pilots circle in thermals to gain altitude. Wind map shows thermal locations via contour and wind patterns.

### Rotor
Rough, turbulent air on the downwind side of hills. Dangerous; pilots avoid. Indicated by wind patterns and rotational flow in wind map.

### Retrieval
Ground operation to pick up a pilot from landing zone. Coordinated via SkyHigh SSE chat; requires vehicle, driver, and navigation to LZ.

### Site Rating
Assessment of a site's difficulty and conditions. Not formally tracked in SkyHigh but documented in procedures manual and site guides.

### Aspect
Direction a slope faces (north-facing, south-facing, etc.). Affects solar heating and thermal activity. Visible on site map overlay.

### Sink
Descending air; opposite of thermal. Pilots avoid large sinks; unavoidable at end of flight. Not directly tracked but evident in GPS traces (continuous descent).

---

## Tech & Systems Terminology

### ECMWF
European Centre for Medium-Range Weather Forecasts. Provides high-resolution wind grid data globally. SkyHigh caches ECMWF continental Australia grids (Victoria 0.35°, Wide 2.0° spacing).

### Open-Meteo
Free weather API providing wind, temperature, and precipitation. Used as fallback if ECMWF cache misses. Optional paid API key for higher request limits.

### Victoria Grid
High-resolution continental wind grid covering Victoria (0.35° spacing ≈ 40km). Fetched daily 5:00am Melbourne time. More detailed than Wide grid.

### Wide Grid
Low-resolution continental wind grid covering all Australia (2.0° spacing ≈ 200km). Fetched daily 5:13am Melbourne time. Quick load for overview.

### Wind Grid Data
Database table storing cached ECMWF grids. Columns: grid_type (Victoria/Wide), data (GeoJSON), fetch_time, expiry (7-day rolling cleanup).

### Bilinear Interpolation
Method to compute wind vector at arbitrary (lat, lon) from surrounding grid corners. Used in wind map rendering to smooth vector field between grid points.

### TidyHQ
Membership management platform used by Australian clubs. SkyHigh syncs contacts (name, email, phone, roles) via TidyHQ webhooks or manual trigger.

### Siteguide.org.au
External database of Australian paragliding sites. SkyHigh links to guides and can scrape/summarize guides via Gemini.

### Garmin MapShare
Garmin GPS device tracking service. Pilots enable MapShare; SkyHigh fetches live location feed and imports completed tracks as XC flights.

### SPOT
Satellite GPS messenger. Sends location updates via satellite (no cell coverage). SkyHigh can import SPOT tracks and integrate with Zoleo.

### Zoleo
Satellite communicator and GPS tracker. Logs tracks; SkyHigh imports traces and displays on flight map.

### SSE (Server-Sent Events)
HTTP-based real-time communication. Client opens persistent connection; server pushes updates (messages, location, status). Used for retrieval chat without WebSocket complexity.

### Cloudflare R2
S3-compatible object storage. No egress fees. Stores media (images, GPX) in production. Dev uses local `/uploads/` folder.

### Gemini (Google Gemini API)
Multimodal AI API. Used for site guide scraping, image captions, content generation, and moderation. Fallback to safer defaults if API fails.

### freeflightwx.com.au
Australian free flight (paragliding/hang gliding) weather site. Manual reference; not integrated (future feature).

### BOM
Bureau of Meteorology (Australia). Official weather service. SkyHigh references BOM warnings; not yet integrated.

### Demo Mode
Development mode where `DEV_BYPASS_AUTH=true` stubs external API calls (Gemini, TidyHQ, storage). Allows testing without API keys or network.

### DEV_BYPASS_AUTH
Environment variable. If set, admin authentication bypassed and services use mock implementations. Never enable in production.

### Canvas (HTML5)
Drawing surface for wind map. Single `<canvas>` element; redrawn via D3 zoom/pan events. Faster than SVG for thousands of vectors.

### D3.js
JavaScript visualization library. SkyHigh uses D3 for zoom/pan math on wind map (not for data visualization per se, just transform calculations).

### Leaflet
JavaScript map library. Provides base map tiles (OpenStreetMap). Wind map layers rendered on top via Canvas + D3.

---

## Admin System Terminology

### Procedures Manual
Living document describing launch procedures, emergency contacts, site-specific rules, and safety protocols. Maintained in SkyHigh or linked externally.

### Safety Section
Subsection of site guide covering hazards, restrictions, weather minimums, and emergency procedures for specific site.

### Contact
Person associated with site: Site Warden, Safety Officer (SO), retrieval lead, emergency contact. Synced from TidyHQ; phone/email/role stored.

### Safety Officer (SO)
Club volunteer responsible for safety at a site or event. Often leads retrieval operations.

### Settings Table
Database table storing global configuration: admin default wind map viewport (center lat/lon, zoom), grid fetch status, API keys, feature flags.

### Default Admin
Admin account created on startup. Credentials from `DEFAULT_ADMINS` env var. Development-only; production admin created via setup script.

### Session Token
JWT or opaque token issued on login. Included in subsequent requests for authentication. 7-day TTL. Validated by auth middleware.

### CSRF Token
Cross-Site Request Forgery token. Generated per session; required in POST/PUT/DELETE requests to prevent unauthorized mutations. Stored in-memory (dev) or Redis (production).

### Rate Limiting
Per-IP request quota. Public endpoints limited to 100 req/min. Mutation endpoints (login, submit) limited to 10 req/min. Prevents abuse and DOS attacks.

### Club
Administrative grouping. Not fully multi-tenant yet (Phase 5 future). Single club per deployment; club name/logo customizable for white-labelling.

### RLS (Row-Level Security)
PostgreSQL feature (not yet implemented) to restrict data access by club or role. Future enhancement for multi-club support.

### Magic Numbers
Hardcoded numeric constants (e.g., grid cleanup age = 7 days, default pagination limit = 50). Being centralized in `constants.ts` (Phase 3, TASK-023).

### Migration
Database schema change script (SQL). Stored in `server/pg_migrations/`. Run on startup for PostgreSQL; SQLite creates tables on-demand in dev.

---

## Abbreviations & Acronyms Quick Reference

| Term | Expansion |
|---|---|
| XC | Cross-Country (flying) |
| PG | Paragliding |
| HG | Hang Gliding |
| LZ | Landing Zone |
| SO | Safety Officer |
| ECMWF | European Centre for Medium-Range Weather Forecasts |
| SSE | Server-Sent Events |
| R2 | Cloudflare R2 |
| CSRF | Cross-Site Request Forgery |
| SPOT | Satellite messaging device |
| BOM | Bureau of Meteorology (Australia) |
| GPS | Global Positioning System |
| API | Application Programming Interface |
| JWT | JSON Web Token |
| RLS | Row-Level Security |
| OWASP | Open Web Application Security Project |
| SQL | Structured Query Language |

---

Last updated: 2026-05-06
