# SkyHigh Paragliding Club

## Overview
SkyHigh Paragliding Club is a comprehensive platform designed to enhance safety, information sharing, and management within the paragliding community. It provides pilots with essential site information, real-time weather data, and interactive tools, while offering club administrators robust capabilities for content management, member engagement, and operational oversight. The project aims to improve pilot safety, streamline club operations, and foster a thriving paragliding community through features like AI-powered site generation, dynamic content management, advanced weather forecasting, and integration with external club management systems.

## User Preferences
- Always update the Admin Manual (`src/pages/AdminManual.tsx`) as a final step after any feature change or addition. Bump the version number (e.g., v1.7 → v1.8) when updating.

## System Architecture
### Tech Stack
- **Frontend:** React 19, Vite 6, Tailwind CSS, Lucide Icons, Framer Motion, @tanstack/react-query
- **Backend:** Express.js, PostgreSQL (pg), bcryptjs
- **AI:** Google Gemini (text and image models with fallback chains)
- **Infrastructure:** Separate Vite and Express architecture with Vite acting as a proxy.

### Core Architectural Decisions & Features
- **Database:** PostgreSQL with a versioned migration system (`server/pg_migrations/`). The database wrapper (`server/pgDb.ts`) provides a SQLite-compatible API surface (synchronous `prepare()`, async `get/all/run()`) with automatic SQLite→PostgreSQL syntax conversion (INSERT OR IGNORE → ON CONFLICT DO NOTHING, datetime() → NOW()/INTERVAL, camelCase column auto-quoting, CASE WHEN → COALESCE/NULLIF with ::TEXT casts, named param deduplication). Supports AsyncLocalStorage-based transactions.
- **AI Integration:** Utilizes Google Gemini for AI site generation, structured site data creation, image enhancement, and a conversational AI Assistant.
- **Content Management System (CMS):** Manages news, events, custom pages, procedures manual with file attachments, and editable Safety & Rules page sections.
- **Safety Page:** Database-driven safety sections (emergency, rules, custom types) with admin CRUD, reordering, enable/disable, and optional link fields for connecting to related pages like Code of Conduct.
- **404 Handling / Slug Fallback:** Catch-all route that checks if a top-level slug matches a dynamic page (e.g., `/member-code-of-conduct` renders the same as `/page/member-code-of-conduct`), otherwise shows a proper 404 page.
- **Weather System:** Aggregates live weather data from multiple sources, provides 7-day forecasts, and a unified wind grid data system.
- **Typed API Layer:** Centralized fetch wrapper with `ApiError` class, typed error handling, and `api.get/post/put/delete` helpers. React Query is used for data caching and includes specific hooks for public and admin data. Toast notifications are integrated for all admin mutations.
- **Performance Optimizations:** Includes in-memory caching, image compression, lazy loading, vendor chunk splitting, and aggressive code-splitting for faster performance. Specific optimizations for iOS map performance have been implemented.
- **Server Route Architecture:** Organized routes for sites and demo functionalities, with `CrudRouter` mounted last for proper routing.
- **Mapping & Navigation:** Features an advanced Windy-style animated wind map, XC Maps with configurable distance rings, and OpenAIP airspace overlay. Includes GPS flight tracking with landing detection and proximity alerts. Map UI controls are rendered as React overlay buttons for consistency. Track-up map rotation uses hybrid compass/breadcrumb bearing strategy. Map rotation uses CSS-only transforms with WeakMap-cached wrapper div for performance.
- **Breadcrumb Memory Optimization:** Flight trail breadcrumbs use a split architecture: `fullTrailRef` holds the complete trail history (immutable array updates for React identity tracking), while state array is capped to `ftCrumbWindowSize` (default 200) and flushed every `ftCrumbFlushInterval` (default 3s). FlightTrail component receives the full trail for complete drawing while React re-renders are minimized.
- **Pilot Messaging:** Direct, ephemeral messaging between pilots/drivers on XC Maps with voice-to-text input and client-side retry queue.
- **Pilot Retrieval System:** Uber-style system for outlanded pilots, allowing drivers to claim, navigate, and mark pickups. Supports multi-tracker satellite fallback (Garmin inReach, SPOT, ZOLEO) and real-time updates via SSE. OSRM is used for server-side ETA calculations with caching.
- **User & Club Management:** Handles admin authentication, provides a unified contact directory with role-based access, and integrates with TidyHQ for member and event synchronization.
- **Branding & Theming:** Supports dual logo uploads for light/dark modes and uses a semantic CSS variable system.
- **Media Management:** Community image submission pipeline with NSFW checks, centralized image library, and various media display components. Photographer credit/watermark system auto-composites "© Name" overlay on all output images (hero, banner, sliders, content) using Sharp SVG compositing with luminance-based contrast detection and `text-anchor` positioning. Supports 6 positions (bottom-right/left/center, top-right/left/center) with configurable size (5–50% via slider, default 10%). The crop wizard shows a live watermark preview overlay. The watermark is applied at the final output step to prevent double-watermarking when crops are derived from the hero source.
- **Site Features:** Site listings with live weather, pilot check-ins, siteguide version tracking, AI bulk import, QR Code Field View, and FreeFlightWx integration.
- **Security:** Implements bcrypt-hashed passwords, secure session tokens, rate limiting, server-side API key security, and a global error handler. A development-only bypass for authentication is available.
- **Admin Form Hooks:** Shared hooks (`useAdminForm`, `useAdminList`) for consistent patterns in admin pages, including unsaved changes protection, save feedback, and list management.
- **UI/UX:** Emphasizes consistent UI components, unsaved changes protection in admin editors, and extended markdown for rich content.
- **Duty Pilot Dashboard:** A full-screen command dashboard for coordinators, displaying pilots, drivers, and retrieval requests on a map with integrated messaging and retrieval management.
- **Demo Mode:** A comprehensive simulation environment for testing pilot, driver, and duty pilot interactions using in-memory data.
- **Build Blueprint:** Comprehensive rebuild specification page (/build-blueprint) containing 13 phases and 40 ordered prompts to recreate the entire platform from scratch. Designed with branding-first architecture for white-labelling. Accessible from Admin Dashboard → Specifications.

## External Dependencies
- **Google Gemini API:** AI text and image generation.
- **Bureau of Meteorology (BOM):** Tide data.
- **Open-Meteo API:** ECMWF weather forecasts and elevation data.
- **WhereToFly (wheretofly.info):** Paragliding site data.
- **FreeFlightWx.com:** Live weather station data.
- **TidyHQ API:** Contact imports, event synchronization, and webhooks.
- **Resend API:** Email sending.
- **Overpass API:** Nearest emergency hospitals.
- **Google Drive API & Apps Script:** Document management.
- **YouTube API:** Video content.
- **Instagram Embeds:** Instagram content.
- **OSRM:** Server-side driving route calculations and ETA estimation.
- **Garmin MapShare KML Feed:** Satellite position tracking for Garmin inReach.
- **SPOT Tracker API:** Satellite position tracking for SPOT devices.
- **ZOLEO Developer API:** Satellite position tracking for ZOLEO communicators.
- **Siteguide.org.au:** XCTrack JSON zone data and OpenAir airspace.
- **OpenAIP:** Airspace data (GeoJSON) as a fallback source.
- **Sharp:** Server-side image resizing and processing.
- **D3.js & d3-tile:** Animated wind maps.
- **qrcode.react:** QR code generation.