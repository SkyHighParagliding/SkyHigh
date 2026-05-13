# SkyHigh Weather APIs & Data Sources

**Source Document**: Tech Stack SkyHigh Paragliding Website (March 2026)  
**Purpose**: External services used for weather data collection and forecasting  
**Status**: Reference for your paragliding app development

---

## Primary Weather Data Sources

### 1. Weather Underground (WU_API_KEY)
- **Purpose**: Live weather station observations
- **Data Type**: Real-time wind speed, gust, direction, station name
- **Integration**: Environment variable `WU_API_KEY` required
- **Used In**: weather_observations table, live station data display
- **Notes**: Primary source for live conditions at flying sites

### 2. Open-Meteo (ECMWF)
- **Purpose**: Weather forecasts and grid data
- **Data Type**: Temperature, wind, precipitation, icon/code, hourly forecasts
- **Coverage**: Victoria + wider region grid-based data
- **Integration**: No API key required (free service)
- **Used In**:
  - weather_forecasts table (ECMWF forecast data)
  - wind_grid_data table (cached grid data per site)
  - extended_forecasts table (7-day extended data, days 3-7 at 4-hour intervals)
  - site_extended_forecasts (per-site 7-day outlook combining hourly + extended)
- **Fetch Schedule**: Daily at ~5:30am Melbourne time for extended forecasts
- **Notes**: Primary source for grid-based weather mapping

### 3. Live-Wind
- **Purpose**: Live weather station data scraper
- **Data Type**: Wind observations from weather stations
- **Integration**: Multi-source scraper in server/weather.ts
- **Used In**: Weather observations pipeline

### 4. FreeFlightWx
- **Purpose**: Paragliding-specific weather station data
- **Data Type**: Station observations parsed from FreeFlightWx format
- **Integration**: Server-side parser in server/freeflightwx.ts
- **Notes**: Specialized for paragliding community data

### 5. WhereToFly (wheretofly.info)
- **Purpose**: Wind direction and speed reference data
- **Data Type**: Site-specific wind characteristics and etiquette
- **Integration**: Manual-only utility functions (NOT automatic scraping)
- **API Methods**: fetch/match/compare functions available
- **UI**: "Update WTF Wind Data" button in Manage Sites admin panel
- **Used In**: Optional manual wind data updates via POST /api/sites/wtf-compare and POST /api/sites/wtf-apply

---

## Secondary Data Sources

### 6. Astronomical Tide Predictions
- **Purpose**: Coastal site tide forecasting (integrated into WeatherCard)
- **Auto-detection**: Nearest tide station determined from site coordinates
- **Cache TTL**: 30 minutes
- **Endpoint**: GET /api/sites/:id/tides
- **Coverage**: Coastal Victoria sites only

---

## Weather Scraping Configuration

**Scrape Interval**: Configurable 15-30 minutes during flying hours (7am-8pm)

**Data Pipeline**:
1. Live-Wind + Weather Underground + FreeFlightWx scrape concurrently
2. Results stored in weather_observations table
3. Dual station support: primary (liveStationId) + optional alternate (liveStationIdAlt)
4. Alternate observations stored with ':alt' suffix key in database
5. WeatherCard shows swap button when alternate data available

---

## Other External Integrations (Non-Weather)

### AI & Content Generation
- **Google Gemini API** (GEMINI_API_KEY) — site data generation, image processing
- **Configurable fallback chain** for text models: gemini-2.5-flash → gemini-2.5-pro → gemini-2.0-flash
- **Image models**: gemini-2.5-flash-image → gemini-3.1-flash-image-preview → gemini-3-pro-image-preview

### File & Cloud Storage
- **Google Drive API** — document management, PDF extraction with OCR
- **Google Sheets API** — asset register, loan register, condition ratings (via Apps Script)
- **Cloudflare R2** — permanent image/logo storage (with local fallback)

### Events & Community
- **TidyHQ** (TIDYHQ_ACCESS_TOKEN) — events proxy, contact import, community management

---

## API Architecture Notes

- **Rate Limiting**: express-rate-limit on all API endpoints
- **Error Handling**: Graceful fallback to cached data if external APIs fail
- **Caching**: Wind grid data cached client-side (windGridCache)
- **Offline Support**: App works with stale weather data when online connectivity lost

---

## For Your Paragliding App (Sky Operations Hub)

Based on SkyHigh's implementation, recommended integrations for Phase 2+:

**MVP (Phase 1)**:
- OpenWeatherMap API (1,000 calls/day free tier is sufficient)

**Enhanced Weather (Phase 2)**:
- Weather Underground API (if live station data needed)
- Open-Meteo (grid forecasts, no API key required)
- FreeFlightWx parser (if supporting flyable conditions analysis)

**Advanced (Phase 3+)**:
- Tide predictions (for coastal sites)
- WhereToFly integration (manual wind reference updates)

---

## Environment Variables Required

```
GEMINI_API_KEY           # For AI content generation
WU_API_KEY               # Weather Underground (optional, for enhanced stations)
TIDYHQ_ACCESS_TOKEN      # TidyHQ integration (optional)
```

Open-Meteo requires NO API key (free tier, rate-limited at ~10k/day).

