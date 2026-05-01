import { Link } from "react-router-dom";
import {
  ArrowLeft, Layers, Database, Globe, Palette, ShieldAlert, MapPin, Wind,
  Navigation, Image as ImageIcon, FileText, Newspaper, Users, Sparkles,
  Settings, Plug, Car, MessageCircle, BarChart3, Wrench, Rocket,
  FolderTree, Package, MonitorSmartphone, Server, Lock, BookOpen,
  Store, Handshake, Clock, Search, FileCode2, Cpu, Printer
} from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

interface Prompt {
  title: string;
  instruction: string;
  details: string[];
}

interface Phase {
  id: string;
  icon: React.ReactNode;
  title: string;
  summary: string;
  prompts: Prompt[];
}

const phases: Phase[] = [
  {
    id: "foundation",
    icon: <Layers className="w-5 h-5" />,
    title: "Phase 1 — Project Foundation & Branding System",
    summary: "Set up the monorepo, install core packages, and build a branding-first theming engine so every component adapts to any club's identity.",
    prompts: [
      {
        title: "1.1 — Scaffold the Project",
        instruction: "Create a React + Express + TypeScript full-stack project using Vite as the build tool. Use a single-repo structure with the frontend in src/ and backend in server/. Configure Vite to proxy /api/* requests to an Express server on a separate port. Use concurrently to run both servers with a single npm run dev command.",
        details: [
          "React 19, Vite 6, TypeScript (strict mode, ES2022 target)",
          "Express 4 with tsx for server-side TypeScript execution",
          "Tailwind CSS v4 with @theme directive for CSS variable tokens",
          "Vite proxy config: /api, /uploads, /health, /ping, /manifest.json → Express port 3001",
          "Path aliases: @ → src/, @assets → attached_assets/",
          "ESLint + TypeScript strict config",
        ],
      },
      {
        title: "1.2 — Install Core Packages",
        instruction: "Install the foundational packages for both frontend and backend. Prefer proven, lightweight libraries. Avoid redundancy — one library per concern.",
        details: [
          "Frontend: react-router-dom (routing), @tanstack/react-query (data fetching/caching), framer-motion (animations), lucide-react (icons), recharts (charts), clsx + tailwind-merge via cn() helper",
          "Backend: express, pg (PostgreSQL), bcryptjs (auth hashing), multer (file uploads), sharp (image processing), express-rate-limit, uuid",
          "Shared: zod (validation — use on both sides for type safety)",
          "AI: @google/genai (Gemini text + image models)",
          "UI primitives: @radix-ui/react-* (dialog, dropdown, select, tabs, accordion) — wrap in src/components/ui/ as shadcn-style components",
        ],
      },
      {
        title: "1.3 — Build the Branding & Theming Engine",
        instruction: "Create a dynamic theming system where all colours, logos, and club identity are driven by a settings table in the database and applied at runtime via CSS variables. This is the foundation for white-labelling — every visual element must reference theme tokens, never hard-coded colours.",
        details: [
          "Database: settings table (key TEXT PK, value TEXT) — stores clubName, clubTagline, clubPrimaryColor, logoLight, logoDark, faviconUrl, templateId",
          "CSS variable system: define semantic tokens in src/index.css using Tailwind @theme — --color-navy, --color-sky, --color-orange, --color-background, --color-foreground, --color-border, etc.",
          "Template registry (src/templates/registry.ts): define named themes (e.g. 'Classic', 'Wonderful White') each mapping --tmpl-header-bg, --tmpl-accent, --tmpl-footer-bg, --tmpl-logo-mode etc.",
          "TemplateContext provider: reads active templateId from settings, injects --tmpl-* tokens onto document root at runtime so entire UI re-skins instantly",
          "SettingsContext provider: wraps app, provides clubName, logos, colours to all components",
          "Logo system: on upload, auto-generate variants via sharp — nav (h=48), footer (h=64), favicon (32x32 + 192x192), splash (512x512). Store light/dark sets.",
          "Dynamic PWA manifest: GET /manifest.json returns JSON with current club name, colours, and icon URLs from settings",
          "Admin Branding page: club name, tagline, primary colour picker, logo uploads (light/dark), template selector with live preview",
        ],
      },
      {
        title: "1.4 — Database Layer & Migration System",
        instruction: "Create a PostgreSQL database wrapper with a versioned migration system. All schema changes go through numbered migration files that run automatically on server startup.",
        details: [
          "Database wrapper (server/pgDb.ts): connection pool via pg, provides .get(), .all(), .run() async methods",
          "Migration runner: reads server/pg_migrations/ directory, tracks applied migrations in schema_migrations table, runs pending migrations in order on boot",
          "Migration files: 001_full_schema.sql (base tables), subsequent numbered files for additions",
          "Support transactions via AsyncLocalStorage for multi-statement atomic operations",
          "Settings table seeded with default values on first run (clubName, templateId, etc.)",
        ],
      },
    ],
  },
  {
    id: "auth",
    icon: <Lock className="w-5 h-5" />,
    title: "Phase 2 — Authentication & User System",
    summary: "Admin login, pilot accounts, session management, and role-based access control.",
    prompts: [
      {
        title: "2.1 — Admin Authentication",
        instruction: "Build admin authentication with email/password login, bcrypt password hashing, secure session tokens stored in the database, and middleware for protecting admin routes. Include password reset via email.",
        details: [
          "Tables: admin_users (id, name, email UNIQUE, password), admin_sessions (token PK, userId, createdAt, expiresAt)",
          "POST /api/auth/login — validate credentials, create session token, return user + token",
          "POST /api/auth/logout — delete session",
          "GET /api/auth/me — validate token, return current user",
          "requireAuth middleware: checks Authorization header, loads user, attaches to req",
          "Password reset: POST /api/auth/request-password-reset sends email with time-limited token, POST /api/auth/reset-password validates token and updates password",
          "Frontend: AuthContext provider wrapping admin routes, persists token in localStorage, auto-redirects to /admin/login when expired",
          "Seed a default admin account on first run",
        ],
      },
      {
        title: "2.2 — Pilot Accounts & Public Auth",
        instruction: "Create a separate pilot authentication system for public users. Pilots can register, log in, and manage their profile including satellite tracker IDs. This is separate from admin auth.",
        details: [
          "Table: pilots (id, email UNIQUE, passwordHash, name, phone, garminMapshare, spotFeedId, zoleoImei, createdAt)",
          "POST /api/pilot-auth/register, /login, /logout, /me",
          "PilotAuthContext provider for public-facing pages",
          "Pilot profile page: edit name, phone, satellite tracker IDs",
          "Rate limiting on auth endpoints: 5 attempts per 15 minutes",
        ],
      },
      {
        title: "2.3 — Contact Directory & Roles",
        instruction: "Build a unified contact directory that supports multiple roles (Committee, Safety Officer, SSO, Admin) with visibility controls. Integrate with TidyHQ for member imports.",
        details: [
          "Table: contacts (id, name, surname, email, phone, role flags: isAdmin, isCommittee, isSO, isSSO, isSafetyCommittee, soAuthorised, display flags: displayCommittee, showPhone, showEmail)",
          "Admin CRUD at /api/contacts with role assignment UI",
          "Public endpoint: GET /api/contacts/public/committee — returns only visible committee members",
          "TidyHQ integration: fetch groups → map to local roles → import contacts",
          "Safety Officer proximity-based login: SO can authenticate by being near their designated site",
        ],
      },
    ],
  },
  {
    id: "sites",
    icon: <MapPin className="w-5 h-5" />,
    title: "Phase 3 — Flying Site Management",
    summary: "CRUD for site guides, weather station links, site scraping/import, and the public site directory with live weather.",
    prompts: [
      {
        title: "3.1 — Sites Table & CRUD API",
        instruction: "Create the core flying sites system. Each site has location, wind directions, pilot ratings, launch details, weather station links, and status flags. Build full admin CRUD with an edit page that has organized sections.",
        details: [
          "Table: sites (id, name, type [coastal/inland], status, lat, lon, windDir, windSpeed, pgRating, hgRating, launchHeight, description, hazards, navigateTo, siteguideUrl, temporarilyClosed, isTidal, tideStationId, isXCSite, useLiveWeather, liveStationId, weatherStationLink, weatherGaugeUrl, siteContact, siteContactPhone)",
          "GET/POST/PUT/DELETE /api/sites with requireAuth on mutations",
          "Admin site edit page: tabbed interface (Details, Weather, Media, Hazards)",
          "Site visibility toggle: allow hiding closed/seasonal sites globally",
        ],
      },
      {
        title: "3.2 — Site Scraping & Bulk Import",
        instruction: "Build a scraping system that can extract structured site data from external site guide URLs (e.g. siteguide.org.au). Include bulk import for entire regions, version tracking, and archive/restore for safe data updates.",
        details: [
          "Scraper utility (server/utils/siteScraper.ts): fetch URL → parse HTML → extract name, coordinates, wind directions, ratings, description, hazards",
          "AI-assisted parsing: send raw HTML to Gemini with structured extraction prompt",
          "Bulk import: fetch state listing → scrape each site → create/update local records",
          "Version tracking: store siteguide version hash, show change detection in admin",
          "Archive before import: save previous site data, allow diff view and restore",
          "External site listings table for tracking scraped URLs and last-scraped dates",
        ],
      },
      {
        title: "3.3 — Public Site Directory",
        instruction: "Build the public-facing site listing page and detailed site view. Show live weather, flyability status, and safety information for each site.",
        details: [
          "Sites listing page: filterable grid of sites with category tabs (Coastal/Inland), live wind indicator per site, search by name",
          "Site detail page: hero image, description, hazards panel, weather widget, wind compass, tide gauge (if tidal), pilot check-in list, launch directions",
          "Site Field View (/sites/:id/field): mobile-optimized view for use at the launch site with large wind compass and quick check-in",
          "QR code generation: each site gets a QR code linking to its field view",
        ],
      },
    ],
  },
  {
    id: "weather",
    icon: <Wind className="w-5 h-5" />,
    title: "Phase 4 — Weather & Wind Intelligence",
    summary: "Multi-source live weather, ECMWF forecasts, animated wind map, and tidal data.",
    prompts: [
      {
        title: "4.1 — Weather Data Aggregation",
        instruction: "Build a weather system that fetches live observations from multiple sources and caches them. Include scheduled scraping during flying hours and manual fetch triggers.",
        details: [
          "Sources: Live-Wind (live-wind.com.au), Weather Underground (PWS API with WU_API_KEY), FreeFlightWx (XML gauge data)",
          "Caching tables: weather_observations (siteId, data JSON, fetchedAt), weather_forecasts (siteId, data JSON, fetchedAt)",
          "Scheduled scraping via cron (server/utils/scheduledJobs.ts): every 15–30 min during flying hours (configurable times in Melbourne timezone)",
          "GET /api/weather/:siteId — returns cached observations + forecasts",
          "POST /api/weather/scrape-now — admin-only manual refresh",
          "Admin Weather page: show last scrape time, station status, manual fetch button",
        ],
      },
      {
        title: "4.2 — ECMWF Forecasts & Wind Grid",
        instruction: "Fetch high-resolution ECMWF forecast data from Open-Meteo and serve it as a wind grid for map visualisation and site-level flyability predictions.",
        details: [
          "Open-Meteo API: fetch ecmwf_ifs025 model data for a grid covering the relevant region (e.g. Victoria, Australia)",
          "Extended forecast: 7-day outlook using wider grid resolution",
          "GET /api/weather/:siteId/wind-grid — returns wind speed/direction arrays for each forecast hour",
          "GET /api/weather/extended-grid — wide-area forecast data for wind map",
          "Flyability calculation: compare forecast wind speed/direction against site's ideal conditions, return colour-coded status (green/amber/red)",
          "Cache grid data with configurable TTL",
        ],
      },
      {
        title: "4.3 — Animated Wind Map",
        instruction: "Build a D3-based animated wind particle map that visualises wind flow across the region. Particles follow wind vectors, coloured by speed. Include play/pause timeline controls and zoom-dependent particle density.",
        details: [
          "WindMap component: renders on Mapbox GL JS canvas overlay",
          "D3 particle system: spawn particles, advect along interpolated wind vectors, fade and respawn",
          "HSL colour coding: calm (blue) → moderate (green) → strong (orange/red)",
          "Admin-configurable: particle count, trail length, influence radius, opacity, speed scale",
          "Timeline scrubber: step through forecast hours with play/pause/speed controls",
          "Zoom-level interpolation: adjust particle density and trail length based on map zoom",
          "Admin preview: real-time wind map preview on the admin weather settings page",
        ],
      },
      {
        title: "4.4 — Wind Compass & Tide Gauge Components",
        instruction: "Create reusable weather display components: an animated wind compass showing current vs ideal wind, and a tide gauge for tidal sites.",
        details: [
          "WindCompass: SVG animated compass needle, ideal wind sectors as coloured arcs, current wind direction/speed readout, status ring (flyable/marginal/unflyable)",
          "TidesGauge: fetches BOM tide data, shows current tide level, high/low times, animated gauge",
          "WeatherCard: compact card showing temp, wind, humidity with Classic and Apple-style variants",
          "All components accept siteId prop and fetch their own data via React Query hooks",
        ],
      },
    ],
  },
  {
    id: "xc",
    icon: <Navigation className="w-5 h-5" />,
    title: "Phase 5 — XC Maps, Flight Tracking & Retrieval",
    summary: "Interactive flight maps, GPS tracking with satellite fallback, pilot messaging, and an Uber-style retrieval system for outlanded pilots.",
    prompts: [
      {
        title: "5.1 — XC Maps & Airspace Overlay",
        instruction: "Build an interactive cross-country map page with configurable distance rings, airspace overlays (from OpenAIP), and live pilot positions.",
        details: [
          "XCMap component: Mapbox GL JS with custom controls rendered as React overlays",
          "Distance rings: configurable radii (10km, 20km, etc.) drawn as circles from selected sites",
          "Airspace overlay: fetch and render airspace polygons from OpenAIP data",
          "Live wind overlay toggle: show/hide wind particles on the XC map",
          "Admin XC settings page: enable/disable map, configure rings, toggle overlay buttons, set page description",
          "Competition manager: CRUD for flying competitions (dates, location, registration URL, status)",
        ],
      },
      {
        title: "5.2 — GPS Flight Tracking",
        instruction: "Build a real-time flight tracking system that records GPS breadcrumbs, detects takeoff/landing, and displays flight trails on the map. Support three satellite tracker types as fallback position sources.",
        details: [
          "Tables: flights (id, pilotId, siteId, status, startedAt, endedAt, maxAltitude, maxSpeed, totalDistance), breadcrumbs (id, flightId, timestamp, lat, lon, altitude, speed, heading)",
          "Browser Geolocation API for primary tracking with configurable update intervals",
          "Satellite tracker fallback: poll Garmin MapShare (KML), SPOT (JSON feed), ZOLEO (REST API) every 2 min",
          "FlightTrail component: split architecture — fullTrailRef holds complete history (for drawing), state array capped to window size (default 200) for React performance, flushed every 3s",
          "Track-up map rotation: hybrid compass/breadcrumb bearing strategy, CSS-only transforms with WeakMap-cached wrapper div",
          "Landing detection: speed < threshold for configurable duration triggers auto-end",
          "Flight history page: list completed flights with stats, replay trail on map",
        ],
      },
      {
        title: "5.3 — Pilot Retrieval System",
        instruction: "Build an Uber-style retrieval system where outlanded pilots can request pickup, nearby drivers can claim and navigate, and a duty pilot dashboard coordinates everything.",
        details: [
          "Table: retrievals (id, pilotId, driverId, status [awaiting/claimed/active/completed], pilotLat, pilotLon, driverLat, driverLon, etaMinutes, createdAt)",
          "Pilot: tap 'Request Retrieval' → shares GPS location → enters waiting state",
          "Driver: sees nearby requests → claims one → gets navigation with ETA (OSRM for server-side routing calculations with caching)",
          "Real-time updates via Server-Sent Events (SSE): driver location, ETA updates, status changes",
          "Duty Pilot Dashboard: full-screen command view showing all pilots, drivers, and active retrievals on a single map with integrated messaging panel",
          "Map messaging (table: map_messages): ephemeral direct messages between pilots/drivers with voice-to-text input and client-side retry queue",
        ],
      },
    ],
  },
  {
    id: "media",
    icon: <ImageIcon className="w-5 h-5" />,
    title: "Phase 6 — Image Library & Media System",
    summary: "Centralised image management with AI enhancement, automatic multi-size generation, watermarking, and community photo submissions.",
    prompts: [
      {
        title: "6.1 — Image Library & Multi-Size Generation",
        instruction: "Build a centralised image library where uploading one photo automatically generates hero (1920x1080), banner (1920x600), and three slider sizes. Include a crop wizard for fine-tuning each output.",
        details: [
          "Upload flow: select image → optional AI enhancement → crop wizard (hero → banner → sliders) → save all variants",
          "Output sizes: hero (1920x1080), banner (1920x600), landscape-large (1200x800), landscape-small (800x533), portrait (600x900)",
          "Crop wizard: step-by-step UI showing each crop with drag handles, auto-fit option, and preview",
          "Three input methods: file upload with crop wizard, URL import (paste + download), and screenshot capture",
          "Category tagging: Coastal vs Inland per image, used for auto-assignment to new sites",
          "Slider carousel toggle: mark images for inclusion in home page photo carousel",
          "Storage: save images via server/storage.ts abstraction — Cloudflare R2 (primary, persistent across deployments) with local /uploads/ fallback for development. All routes call saveFile(buffer, key, contentType) and receive a public URL back. Required env vars: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL.",
          "AI Enhancement: 'Use Original' (resize only) or 'Smart Enhance' (Gemini image model for sunny atmosphere) with horizon levelling slider (±10 degrees)",
        ],
      },
      {
        title: "6.2 — Watermark System",
        instruction: "Build a photographer credit watermark system that composites a clean '© Name' text overlay on all output images. Use Sharp SVG compositing with luminance-based contrast detection (white text on dark areas, black on light). Support 6 positions and configurable size.",
        details: [
          "Utility: server/utils/watermark.ts — applyWatermark(imageBuffer, credit, sizePercent, position)",
          "Positions: bottom-right (default), bottom-left, bottom-center, top-right, top-left, top-center",
          "Size: slider 5%–50% (default 10%), font size = imageWidth * percent / 1000",
          "Contrast detection: sample pixels in the watermark region, calculate average luminance, choose white (dark bg, shadow at 0.5 opacity) or black (light bg, shadow at 0.35 opacity) text",
          "SVG text rendering: use text-anchor (end/start/middle) for correct alignment per position, font-weight 600, main text at 0.85 opacity with offset shadow",
          "Truncate long names with ellipsis, skip watermarking on images under 100px wide",
          "Live preview in crop wizard: CSS overlay showing watermark position/size in real-time during cropping",
          "Apply watermark at final output step (not on source) to prevent double-watermarking on derived crops",
        ],
      },
      {
        title: "6.3 — Community Photo Submissions & Gallery",
        instruction: "Allow the public to submit photos which go through an approval pipeline. Display all approved images on a public mosaic gallery page.",
        details: [
          "Table: image_submissions (id, storedFilename, status [pending/approved/rejected], submitterIp, photographerCredit, submittedAt)",
          "Public upload dialog: file picker + optional photographer name",
          "NSFW check: use AI to screen submissions before queuing for admin review",
          "Admin approval queue: grid of pending submissions with approve/reject actions",
          "Public Club Photos page (/club-photos): masonry mosaic layout, newest first, lightbox viewer with navigation",
          "Image Wall: cycles through Hero → Banner → Landscape Large → Landscape Small → Portrait slots until every unique image is used",
        ],
      },
    ],
  },
  {
    id: "cms",
    icon: <FileText className="w-5 h-5" />,
    title: "Phase 7 — Content Management System",
    summary: "News, events, custom pages with markdown, file attachments, procedures manual, and safety sections.",
    prompts: [
      {
        title: "7.1 — Custom Pages & Markdown Editor",
        instruction: "Build a page management system where admins can create any number of custom pages with rich markdown content, hero images, and downloadable file attachments. Support a special 'Google Docs Paste' mode for cleaning up pasted formatting.",
        details: [
          "Table: pages (slug PK, title, content TEXT, heroImage, sortOrder, isVisible, createdAt, updatedAt)",
          "Table: page_attachments (id, pageSlug FK, filename, originalName, mimeType, uploadedAt)",
          "Admin page editor: title, slug (auto-generated from title), markdown editor with toolbar (bold, italic, headings, links, images), hero image picker, file attachment upload/management",
          "MarkdownRenderer component: renders extended markdown with support for images, tables, code blocks, and embedded content",
          "Google Docs paste: detect pasted content from Docs, strip proprietary formatting, convert to clean markdown",
          "Public route: /page/:slug renders the page with hero, content, and attachment download links",
          "Catch-all slug fallback: top-level slugs (e.g. /about-us) check pages table before showing 404",
        ],
      },
      {
        title: "7.2 — News, Events & Announcements",
        instruction: "Build news and events management. News is created locally with a markdown editor. Events sync from TidyHQ with local caching.",
        details: [
          "Table: news (id, title, content, date, author, heroImage, isPublished, createdAt)",
          "Admin news editor: same markdown editor pattern as pages, with publish/draft toggle",
          "Public news listing with pagination, individual article view",
          "Events: sync from TidyHQ API, cache locally, display on public /events page with calendar view",
          "Home page integration: show latest 3 news items and next 3 upcoming events",
        ],
      },
      {
        title: "7.3 — Safety Page & Procedures Manual",
        instruction: "Build database-driven safety content sections (emergency procedures, flying rules, custom sections) with admin CRUD, drag-to-reorder, enable/disable, and a procedures manual with step-by-step checklists.",
        details: [
          "Safety sections: stored in database with type (emergency/rules/custom), title, content, sortOrder, isEnabled, optional link field",
          "Admin Safety page: CRUD editor with drag-reorder, toggle visibility, link to related pages (e.g. Code of Conduct)",
          "Public /safety page: renders enabled sections in order with appropriate formatting",
          "Procedures manual: table with title, steps (JSON array), sortOrder — admin CRUD with step editor",
          "Hazard acknowledgment: site-specific hazards shown during pilot check-in, must acknowledge before completing",
        ],
      },
    ],
  },
  {
    id: "ai",
    icon: <Sparkles className="w-5 h-5" />,
    title: "Phase 8 — AI Integration & Smart Tools",
    summary: "Google Gemini for site generation, image enhancement, and a public conversational assistant.",
    prompts: [
      {
        title: "8.1 — AI Model Configuration & Fallback Chains",
        instruction: "Set up Google Gemini integration with configurable model fallback chains for both text and image generation. Include an admin page for model selection and prompt customisation.",
        details: [
          "AI models utility (server/utils/aiModels.ts): wraps @google/genai, supports model list with priority order",
          "Text models: gemini-2.0-flash (primary), gemini-1.5-pro, gemini-1.5-flash (fallbacks)",
          "Image models: gemini-1.5-flash-image for AI image enhancement",
          "Fallback chain: try primary model, on failure try next in chain, log which model succeeded",
          "JSON parser utility (server/utils/aiJsonParser.ts): clean and parse LLM responses that may contain markdown code fences or malformed JSON",
          "Admin AI Models page: view/edit model priority lists, test generation, customise system prompts",
        ],
      },
      {
        title: "8.2 — Smart Site Generator",
        instruction: "Build an AI-powered site generator that can scrape any site guide URL and automatically structure the data into a complete site record. Include bulk import for processing entire regions at once.",
        details: [
          "Workflow: paste URL → scrape HTML → send to Gemini with structured extraction prompt → parse response into site fields → create/update site record",
          "Extraction prompt: instruct AI to return JSON with name, lat, lon, windDirections, pgRating, hgRating, description, hazards, accessNotes",
          "Bulk import: fetch regional listing page → extract site URLs → process each sequentially → show progress bar and results summary",
          "AI text generation: generate marketing descriptions, getting-there directions, and safety notes from raw site data",
        ],
      },
      {
        title: "8.3 — Public Smart Assistant",
        instruction: "Build an AI-powered conversational search on the home page. The assistant can answer questions about weather, sites, safety officers, and club information using live data from the database.",
        details: [
          "PublicSearchBox component: expandable search input on home page, conversation history below",
          "POST /api/search/public — accepts question + conversation history, augments with live data (weather, sites, forecasts, SO list), sends to Gemini, returns response",
          "System prompt: club-aware (uses clubName from settings), knows current conditions, links to relevant pages",
          "GET /api/search/public/default-prompt — returns the system instructions for transparency",
          "Rate limiting: 10 requests per minute per IP for public assistant",
        ],
      },
    ],
  },
  {
    id: "community",
    icon: <Users className="w-5 h-5" />,
    title: "Phase 9 — Community Features",
    summary: "Check-ins, video/photo walls, business directory, sponsors, and social content.",
    prompts: [
      {
        title: "9.1 — Pilot Check-In System",
        instruction: "Build a 3-step digital check-in process for pilots to record their flights and acknowledge site-specific hazards before flying.",
        details: [
          "Table: checkins (id, pilotId, siteId, pilotName, gearType, createdAt, acknowledgedHazards BOOLEAN)",
          "Step 1: select site (show current conditions), Step 2: acknowledge site-specific hazards, Step 3: confirm gear and submit",
          "Public page /check-in: mobile-friendly card-based wizard",
          "Site detail integration: show today's check-in count and list of checked-in pilots",
          "Admin view: check-in statistics, filter by site/date",
        ],
      },
      {
        title: "9.2 — Community Walls (Photos, Videos, Instagram)",
        instruction: "Build three community content pages: a photo mosaic wall, a YouTube video carousel wall, and an Instagram embed wall.",
        details: [
          "Club Photos (/club-photos): masonry grid from approved image library, lightbox viewer with prev/next navigation, newest first",
          "Video Wall (/video-wall): YouTube API integration for club channel videos, carousel display with video player",
          "Insta Wall (/insta-wall): embedded Instagram posts/feed from club account",
          "PhotoSlider component: reusable horizontal image carousel for home page and site pages",
          "YouTubeCarousel component: auto-fetches and displays latest videos",
        ],
      },
      {
        title: "9.3 — Business Directory, Sponsors & Shop",
        instruction: "Build a member business directory, sponsor management, and basic join/shop pages.",
        details: [
          "Business directory: admin CRUD for listings with name, description, category, contact, website. Public page with category filter.",
          "Sponsors: admin CRUD with logo upload, description, website URL, priority ordering. Display sponsor logos in footer or dedicated section.",
          "Join page: membership information with link to external registration (e.g. TidyHQ)",
          "Shop page: merchandise display with links to external store",
        ],
      },
    ],
  },
  {
    id: "integrations",
    icon: <Plug className="w-5 h-5" />,
    title: "Phase 10 — External Integrations",
    summary: "TidyHQ membership, Google Drive documents, email via Resend, and satellite tracker polling.",
    prompts: [
      {
        title: "10.1 — TidyHQ Membership Integration",
        instruction: "Integrate with TidyHQ for member management. Sync contacts, groups, and event data. Support webhook-triggered updates.",
        details: [
          "TidyHQ fetch utility (server/utils/tidyhqFetch.ts): authenticated API calls to api.tidyhq.com/v1",
          "Contact import: fetch TidyHQ groups → map to local roles (Committee, SO, etc.) → create/update local contacts",
          "Group mapping table: tidyhq_group_mappings (tidyhqGroupId, localRole)",
          "Event sync: fetch upcoming events, cache locally for /events page",
          "Member email cache: periodically refresh list of current member emails for access control",
          "Admin Connections page: configure TidyHQ API token, trigger manual sync, view sync status",
        ],
      },
      {
        title: "10.2 — Google Drive & Email",
        instruction: "Integrate Google Drive for document management and Resend for transactional email.",
        details: [
          "Google Drive (server/googleDrive.ts): list folders, upload files, manage club documents. Uses Google Drive API + Apps Script bridge as fallback.",
          "Documents table: track Drive file metadata locally (id, driveFileId, name, mimeType, category)",
          "Projects system: link documents to club projects with coordinators and related sites",
          "Resend email (server/utils/email.ts): send notifications (submission alerts, password resets, membership updates) via api.resend.com",
          "Admin scheduled task for Drive sync at configurable intervals",
        ],
      },
      {
        title: "10.3 — Satellite Tracker Polling",
        instruction: "Build a polling system for three satellite tracker types used by pilots for remote position reporting. Poll every 2 minutes and merge positions into the flight tracking system.",
        details: [
          "Garmin MapShare (server/utils/garminMapshare.ts): fetch KML from share.garmin.com, parse coordinates + timestamp",
          "SPOT Tracker (server/utils/spotTracker.ts): fetch JSON from SPOT Public Feed API, extract latest position",
          "ZOLEO (server/utils/zoleoTracker.ts): fetch from ZOLEO Device Location API using IMEI",
          "Unified polling loop: runs every 2 min, checks all pilots with configured tracker IDs, updates flight breadcrumbs",
          "Fallback logic: prefer browser GPS, fall back to satellite position if browser is offline",
        ],
      },
    ],
  },
  {
    id: "home",
    icon: <MonitorSmartphone className="w-5 h-5" />,
    title: "Phase 11 — Home Page & Navigation",
    summary: "Dynamic home page, responsive navigation with mobile menu, and the public layout shell.",
    prompts: [
      {
        title: "11.1 — Layout Shell & Navigation",
        instruction: "Build the main layout component with a responsive header, mobile hamburger menu, footer, and route-based page rendering. The header and footer must adapt to the active template and club branding.",
        details: [
          "Layout component: header, main content (Outlet), footer — all theme-aware via CSS variables",
          "Template-specific headers: swap between Classic header and variant headers (e.g. WonderfulHeader) based on active templateId",
          "Navigation: desktop horizontal nav with dropdown groups (Sites, XC, Community), mobile slide-out menu",
          "NavDropdown component: reusable dropdown with hover/click support and animated transitions",
          "Footer: club name, logo (light/dark variant), sponsor logos, quick links",
          "Dynamic head management: update document.title, favicon, theme-color meta tag from settings",
          "ErrorBoundary: catch and display UI crashes with retry option",
        ],
      },
      {
        title: "11.2 — Dynamic Home Page",
        instruction: "Build the home page with rotating hero images, smart assistant search, quick action cards, upcoming events, news preview, and a photo carousel. All content should pull from the database.",
        details: [
          "Hero section: rotating hero images from image library with crossfade animation, club name and tagline overlay",
          "Smart Assistant: prominent search box that opens the AI conversational assistant",
          "Quick action cards: Sites, Safety, Community — with icons and descriptions",
          "Events strip: next 3 upcoming events with date, title, and link",
          "News preview: latest 3 news articles with thumbnail, title, date",
          "Photo carousel: PhotoSlider component showing images marked for slider inclusion",
          "Weather status: compact weather widget for featured/primary sites",
          "Admin Home Settings page: configure which sites to feature, hero image rotation speed, section visibility",
        ],
      },
    ],
  },
  {
    id: "admin",
    icon: <Settings className="w-5 h-5" />,
    title: "Phase 12 — Admin Dashboard & Shared Patterns",
    summary: "Admin dashboard, reusable form hooks, page view analytics, scheduled tasks, and the admin manual.",
    prompts: [
      {
        title: "12.1 — Admin Dashboard & Search",
        instruction: "Build the admin dashboard as a categorised grid of cards linking to all management sections. Include a search box that filters across all admin pages and a sign-out button.",
        details: [
          "Categorised sections: Content (Sites, News, Pages, Safety), Media (Images), Community (Contacts, Sponsors, Business Directory, Check-ins), Configuration (Branding, Home Settings, Weather, XC, AI Models, Connections, Scheduled Tasks), Specifications (Features, Tech Spec, Build Blueprint, Admin Manual)",
          "Each card: icon, title, description — linking to the relevant admin page",
          "AdminSearchBox: searches across all admin page titles and descriptions for quick navigation",
          "Welcome message using admin user name and club name from settings",
        ],
      },
      {
        title: "12.2 — Shared Admin Hooks & Patterns",
        instruction: "Create reusable hooks and patterns for all admin pages to ensure consistency: unsaved changes protection, save feedback, list management (add/remove/reorder), and API mutation patterns.",
        details: [
          "useAdminForm hook: tracks dirty state, shows 'Unsaved changes' warning, handles save with loading/success/error states, confirms navigation away",
          "useAdminList hook: manages array state with add/remove/reorder helpers, integrates with useAdminForm for dirty tracking",
          "UnsavedChangesModal component: consistent modal for blocking navigation when form has changes",
          "React Query mutation pattern: useMutation with onSuccess toast notification, onError toast, and query invalidation",
          "Consistent page layout: back button, page title, save button in header — content below",
        ],
      },
      {
        title: "12.3 — Analytics, Scheduled Tasks & Admin Manual",
        instruction: "Build page view tracking, configurable scheduled tasks for background jobs, and a comprehensive admin manual.",
        details: [
          "usePageView hook: sends anonymous page view event on route change",
          "Admin Page Views: bar/line charts of traffic over time, top pages table, filter by date range",
          "Scheduled tasks admin page: configure timing for weather fetches, Drive sync, notification sends — all using Melbourne timezone",
          "Background jobs via cron (server/utils/scheduledJobs.ts): hourly cron checks all configurable task times",
          "Admin Manual: comprehensive how-to guide for every admin feature, versioned (bump on every feature change), organised by section with hash-link navigation",
        ],
      },
    ],
  },
  {
    id: "performance",
    icon: <Rocket className="w-5 h-5" />,
    title: "Phase 13 — Performance, Security & Polish",
    summary: "Optimisation, security hardening, PWA support, and final polish for production readiness.",
    prompts: [
      {
        title: "13.1 — Performance Optimisation",
        instruction: "Apply performance optimisations across the full stack: code splitting, lazy loading, caching, image compression, and vendor chunk splitting.",
        details: [
          "Route-level code splitting: React.lazy() + Suspense for every page component",
          "Vendor chunk splitting in Vite config: separate chunks for react, mapbox, recharts, framer-motion",
          "In-memory server caching for weather data, wind grids, and API responses with configurable TTL",
          "Image compression: sharp pipeline for all uploaded images — resize, quality optimise, strip metadata",
          "Map tile caching (tileCache.ts): cache downloaded map tiles in memory/IndexedDB for offline support",
          "Wind grid caching (windGridCache.ts): cache computed wind grids to avoid re-fetching",
          "iOS-specific map performance: disable unnecessary features on Safari/iOS for smoother map rendering",
        ],
      },
      {
        title: "13.2 — Security Hardening",
        instruction: "Apply security best practices: rate limiting, input validation, CSRF protection, secure headers, and IP banning.",
        details: [
          "Rate limiting: express-rate-limit on all auth endpoints and public API endpoints",
          "Input validation: zod schemas on all POST/PUT request bodies (server-side, never trust the client)",
          "Secure password storage: bcrypt with salt rounds >= 12",
          "Session tokens: crypto.randomBytes(32), stored hashed in database, expire after 24h",
          "File upload validation: check mime type and file size before processing",
          "IP banning table (banned_ips): block repeated abuse, admin UI to manage bans",
          "Server-side API key security: all external API keys stored in environment variables, never sent to client",
          "Global error handler: catch unhandled errors, log securely, return generic 500 to client",
          "NSFW image screening: AI-based check on all public image submissions before admin review",
        ],
      },
      {
        title: "13.3 — PWA & Final Polish",
        instruction: "Ensure the app works well as a Progressive Web App with proper manifest, icons, and offline fallback. Polish all UI transitions and responsive breakpoints.",
        details: [
          "Dynamic manifest.json generated from club branding settings (name, colours, icons)",
          "Responsive design: test all pages at mobile (375px), tablet (768px), and desktop (1280px) breakpoints",
          "Consistent animations: Framer Motion for page transitions, component mount/unmount",
          "Loading states: skeleton loaders for data-fetching pages, spinner for mutations",
          "Error states: friendly error messages with retry buttons, never raw error dumps",
          "Print styles: clean print output for tech spec, admin manual, and site guides",
          "Location consent banner: request geolocation permission once, persist choice, show clear explanation",
          "SOProximityDetector: background component that detects pilot proximity to sites and triggers relevant actions",
        ],
      },
    ],
  },
];

export function BuildBlueprint() {
  const { settings } = useSettings();
  const clubName = settings.clubName || "SkyHigh";

  return (
    <div className="bg-background min-h-screen py-12 print:py-4">
      <div className="no-print fixed top-20 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg shadow-lg hover:bg-navy-light transition-colors text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8 print:mb-4">
          <Link to="/admin" className="text-sm text-foreground-secondary hover:text-navy transition-colors flex items-center">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
          <div className="flex items-center gap-2 text-navy font-bold">
            <FolderTree className="w-5 h-5" />
            <span>Build Blueprint v1.0</span>
          </div>
        </div>

        <div className="text-center mb-12 print:mb-6">
          <h1 className="text-3xl font-extrabold text-navy mb-3 print:text-2xl">Build Blueprint</h1>
          <p className="text-foreground-secondary max-w-2xl mx-auto">
            A complete, ordered set of prompts to recreate the {clubName} platform from scratch.
            Designed as a white-label system — branding is the foundation, so any club can make it their own.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-sky/10 rounded-full text-sm text-sky font-medium">
            <Cpu className="w-4 h-4" />
            {phases.length} Phases — {phases.reduce((sum, p) => sum + p.prompts.length, 0)} Prompts
          </div>
        </div>

        <div className="mb-8 bg-card border border-border-faint rounded-xl p-6 print:p-4">
          <h2 className="text-sm font-semibold text-foreground-faint uppercase tracking-wider mb-4">Quick Navigation</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {phases.map((phase, idx) => (
              <a
                key={phase.id}
                href={`#${phase.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-sky/5 transition-colors text-sm"
              >
                <span className="text-sky font-bold mr-1">{idx + 1}.</span>
                <span className="text-navy font-medium">{phase.title.replace(`Phase ${idx + 1} — `, "")}</span>
              </a>
            ))}
          </div>
        </div>

        <div className="mb-8 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 print:p-4">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-200 uppercase tracking-wider mb-3">Architecture Principles</h2>
          <ul className="space-y-2 text-sm text-amber-900 dark:text-amber-100">
            <li className="flex items-start gap-2"><span className="text-amber-600 mt-1 flex-shrink-0">1.</span><span><strong>Branding-first:</strong> Every colour, logo, and text label comes from the settings database. Hard-coded club names or colours are never acceptable.</span></li>
            <li className="flex items-start gap-2"><span className="text-amber-600 mt-1 flex-shrink-0">2.</span><span><strong>One library per concern:</strong> React Query for data, Framer Motion for animation, Sharp for images. No redundant packages.</span></li>
            <li className="flex items-start gap-2"><span className="text-amber-600 mt-1 flex-shrink-0">3.</span><span><strong>Shared hooks over repeated code:</strong> useAdminForm, useAdminList, useUnsavedChanges — every admin page uses the same patterns.</span></li>
            <li className="flex items-start gap-2"><span className="text-amber-600 mt-1 flex-shrink-0">4.</span><span><strong>Server-side validation always:</strong> Zod schemas on every endpoint. Client validation is convenience, server validation is security.</span></li>
            <li className="flex items-start gap-2"><span className="text-amber-600 mt-1 flex-shrink-0">5.</span><span><strong>Typed API layer:</strong> Centralised fetch wrapper with ApiError class, typed error handling, React Query hooks for every endpoint.</span></li>
            <li className="flex items-start gap-2"><span className="text-amber-600 mt-1 flex-shrink-0">6.</span><span><strong>Progressive enhancement:</strong> Core features work without JavaScript. Maps, AI, and real-time features enhance the base experience.</span></li>
            <li className="flex items-start gap-2"><span className="text-amber-600 mt-1 flex-shrink-0">7.</span><span><strong>Migration-based schema:</strong> Never modify the database directly. Every change goes through a numbered migration file.</span></li>
          </ul>
        </div>

        <div className="border-t border-border-faint" />

        {phases.map((phase, phaseIdx) => (
          <section key={phase.id} id={phase.id} className={`py-8 print:py-4 ${phaseIdx > 0 ? "border-t border-border-faint" : ""}`}>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl font-black text-sky/20 print:text-xl">{String(phaseIdx + 1).padStart(2, "0")}</span>
              <div className="w-8 h-8 rounded-lg bg-sky/10 flex items-center justify-center flex-shrink-0 text-sky">
                {phase.icon}
              </div>
              <h2 className="text-xl font-bold text-navy print:text-lg">{phase.title}</h2>
            </div>
            <p className="text-sm text-foreground-secondary ml-[68px] mb-6 print:mb-3">{phase.summary}</p>

            <div className="space-y-4 print:space-y-3">
              {phase.prompts.map((prompt, pIdx) => (
                <div
                  key={pIdx}
                  className="border border-border-faint rounded-lg overflow-hidden hover:border-sky/30 transition-all print:border-border-subtle"
                >
                  <div className="bg-gradient-to-r from-sky/5 to-transparent px-4 py-3 print:py-2 border-b border-border-faint">
                    <h3 className="font-bold text-navy print:text-sm">{prompt.title}</h3>
                  </div>
                  <div className="p-4 print:p-3">
                    <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 print:p-3 mb-3 border border-slate-200 dark:border-slate-700">
                      <p className="text-sm text-foreground leading-relaxed italic">{prompt.instruction}</p>
                    </div>
                    <ul className="space-y-1.5">
                      {prompt.details.map((d, dIdx) => (
                        <li key={dIdx} className="text-sm text-foreground-secondary print:text-xs flex items-start gap-2">
                          <span className="text-sky mt-1 flex-shrink-0">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="mt-12 border-t border-border-faint pt-8 print:mt-6 print:pt-4">
          <div className="bg-card border border-border-faint rounded-xl p-6 text-center">
            <h2 className="text-lg font-bold text-navy mb-2">Rebuild Summary</h2>
            <p className="text-sm text-foreground-secondary mb-4">
              {phases.length} phases, {phases.reduce((sum, p) => sum + p.prompts.length, 0)} prompts covering the complete {clubName} platform.
              Execute in order — each phase builds on the previous. The branding system in Phase 1 ensures the entire app
              is white-label ready from the first line of code.
            </p>
            <div className="flex flex-wrap justify-center gap-4 text-xs text-foreground-faint">
              <span>React 19 + Vite 6</span>
              <span>•</span>
              <span>Express 4 + PostgreSQL</span>
              <span>•</span>
              <span>Tailwind CSS v4</span>
              <span>•</span>
              <span>Google Gemini AI</span>
              <span>•</span>
              <span>Mapbox GL JS</span>
              <span>•</span>
              <span>Sharp Image Processing</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
