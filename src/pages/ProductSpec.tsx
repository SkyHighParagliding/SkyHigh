import {
  Target, Users, Globe, MapPin, Wind, Sparkles, Image as ImageIcon, ShieldAlert,
  Newspaper, Settings, Lock, FolderOpen, Briefcase, Contact2, BarChart2,
  Cloud, Car, Compass, FileText, Plug, Palette, Clock, Search, Trophy,
  Building2, LogIn, Printer, BookOpen, Monitor, Navigation, Camera, Wifi,
  Satellite, MessageCircle, Activity, CreditCard, Video, Instagram,
} from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";

interface SpecItem {
  icon: React.ReactNode;
  title: string;
  details: string[];
}

interface SpecCategory {
  id: string;
  title: string;
  items: SpecItem[];
}

const categories: SpecCategory[] = [
  {
    id: "vision",
    title: "Product Vision & Goals",
    items: [
      {
        icon: <Target className="w-5 h-5" />,
        title: "Product Purpose",
        details: [
          "A white-label club management platform built specifically for Australian free-flight clubs (paragliding and hang gliding).",
          "Solves the problem of fragmented club infrastructure — weather, site guides, safety, content management, pilot tracking, and administration in a single hosted platform.",
          "Designed for non-technical club administrators: all configuration is through the admin UI; no code changes are needed to brand, customise, or operate the platform.",
          "Open enough to support any free-flight club in any Australian state or territory via the white-label branding system.",
        ],
      },
      {
        icon: <Users className="w-5 h-5" />,
        title: "Target Audience",
        details: [
          "Club Administrators — manage content, sites, safety, contacts, documents, and settings via the admin dashboard.",
          "Active Pilots — use the XC Maps, live weather, check-in, flight tracker, retrieval system, and safety information.",
          "Visiting Pilots — browse site guides, conditions, and hazards without an account.",
          "Retrieval Drivers — use the dedicated driver map to navigate to outlanded pilots.",
          "Duty Pilots — monitor all active pilot positions via the duty pilot map.",
          "Public Visitors — view club news, events, the Join page, and sponsor information.",
          "Schools & Training Providers — listed on the home page and embedded in CMS pages via widget tags.",
        ],
      },
      {
        icon: <Globe className="w-5 h-5" />,
        title: "Platform Scope",
        details: [
          "Fully responsive web application optimised for mobile use in the field.",
          "Progressive Web App (PWA): pilots can install to their phone home screen for native-app feel.",
          "Real-time features: live weather polling, GPS flight tracking, pilot messaging, and retrieval board.",
          "Offline capability: map tiles can be downloaded for use in areas without mobile reception.",
          "White-label ready from foundation: all club identity (name, logo, tagline, colour, template) is controlled from admin settings with no code changes.",
          "Self-contained: runs on a single Replit deployment with PostgreSQL, Cloudflare R2, and all integrations configured via environment secrets.",
        ],
      },
    ],
  },
  {
    id: "public",
    title: "Public Website Requirements",
    items: [
      {
        icon: <Globe className="w-5 h-5" />,
        title: "Home Page",
        details: [
          "Hero section with configurable title, subtitle, CTA buttons, and background image gallery (static or random rotation).",
          "Alert banner: dismissible, club-wide urgent notification with configurable text and colour.",
          "Live weather cards: current conditions for selected sites with wind speed, direction, temperature, and flyability status.",
          "Featured site card: single highlighted site with current conditions.",
          "Quick action cards: 3 configurable cards with title, description, and link. Supports cycling mode. Events card auto-pulls from TidyHQ.",
          "Photo carousel: scrolling strip of images from the library with auto-scroll and direction options.",
          "YouTube carousel: video thumbnails in alternating large/small sizes with auto-scroll.",
          "Paragliding schools section: randomised card buttons linking to school URLs. Embeddable in CMS pages via {{schools}} tag.",
          "Telegram groups section: group invite buttons. Embeddable via {{telegram}} tag.",
          "Public Smart Assistant: conversational AI widget with access to live weather, sites, forecasts, safety officers, and club documents.",
          "Social media footer links: icons shown only for platforms with a configured URL.",
        ],
      },
      {
        icon: <MapPin className="w-5 h-5" />,
        title: "Flying Sites Directory",
        details: [
          "Full site listing with name, type (Coastal/Inland), and open/closed status.",
          "Site detail page: launch/landing heights (AMSL), wind direction, wind speed range, PG/HG ratings, site contact, Google Maps link, coordinates.",
          "Interactive wind compass: animated needle, colour-coded status ring for ideal/cross/wrong conditions.",
          "Live weather card: current station reading with wind speed, direction, temperature, humidity, dew point.",
          "7-Day forecast strip: daily conditions with flyability dots derived from ECMWF model data.",
          "Tide chart: interactive tidal prediction for coastal sites, auto-detected from coordinates.",
          "Site rules and hazards: formatted content sections imported from siteguide.org.au or manually edited.",
          "Emergency Medical card: nearest hospital emergency departments within 100km, mapped with distances.",
          "QR codes: Info Page (links to site detail) and XC Maps (links to map centred on site) variants.",
          "Compact Field View (/sites/:id/field): stripped-down mobile page for field QR code scanning, showing essential safety info.",
          "Animated wind map: particle animation across the state, colour-coded by wind speed with timeline controls.",
        ],
      },
      {
        icon: <ShieldAlert className="w-5 h-5" />,
        title: "Safety & Check-in",
        details: [
          "Safety & Rules page: emergency procedures, club rules, hazard summaries. Sections typed as Emergency, Rules, or Custom with optional link navigation.",
          "Safety Officer Directory: auto-populated from contacts with 'Safety Committee' role. Contact details obfuscated (revealed on tap).",
          "Online Check-in: optional 3-step flow — select site, review hazards, confirm flight intention. Admin-toggled on/off site-wide.",
          "Check-in confirmation shows site rules summary and safety officer contact.",
          "Admin can view check-in statistics (daily counts, total, per-site breakdown).",
        ],
      },
      {
        icon: <Newspaper className="w-5 h-5" />,
        title: "News, Events & Community",
        details: [
          "News feed: admin-authored posts with Markdown content, images, publication date, and author.",
          "Events page: pulls from TidyHQ events API when configured; shows date, title, description, and registration link.",
          "Dynamic CMS pages (/page/:slug): custom pages authored in Markdown with image insertion, widget tags, and Google Docs import.",
          "Club Photos (/club-photos): mosaic image wall from the library, newest first, cycling through all size variants.",
          "Video Wall (/video-wall): mosaic of YouTube thumbnails, newest first, linking to YouTube videos.",
          "Instagram Wall (/insta-wall): Instagram feed embed.",
          "Community photo submissions: public upload form for pilots to contribute site photos.",
          "Sponsors page: logo grid with business name, description, and website link.",
          "Business Directory (/business-directory): member-owned business listings with contact details and website links.",
          "Ground Handling page: ground handling site listings with description and location.",
          "Shop page: club merchandise or links.",
          "Join page (/join): configurable hero, TidyHQ signup link, membership tier cards, and FAQ accordion.",
        ],
      },
    ],
  },
  {
    id: "pilot",
    title: "Pilot Portal Requirements (XC & Flight)",
    items: [
      {
        icon: <Compass className="w-5 h-5" />,
        title: "XC Maps",
        details: [
          "Full-screen Leaflet map with street, satellite, and topo basemaps.",
          "Distance rings: configurable rings centred on the selected site.",
          "Bearing lines: visual compass bearings from launch.",
          "XC site selector: sorted by distance from pilot's GPS position, closest first.",
          "Weather station markers: wind arrows at each XC site, coloured by flyability. Refreshes every 60 seconds.",
          "Wind Field overlay: animated streamlines using IDW interpolation from all live stations. Configurable particle count, trail length, speed, opacity, lifespan, and influence radius.",
          "Airspace overlay (OpenAIP): toggleable CTA, CTR, Prohibited, Restricted, Danger, and other sector types. Altitude slider filters by floor height. Sector colours: blue (CTA), red (CTR), dark red (Prohibited), orange (Restricted), yellow (Danger).",
          "Zones overlay: site-defined ground reference zones.",
          "Offline map tiles: download button caches tiles for selected area at configured zoom levels.",
          "QR deep-link: generate XC Maps QR in Site Editor — scanning opens the map centred on that site.",
          "Fullscreen mode: expands map to cover the full browser viewport.",
          "Track-up mode: rotates map to match pilot heading using device compass (permission required).",
          "Mobile site selector: full-height bottom sheet on phones.",
        ],
      },
      {
        icon: <Navigation className="w-5 h-5" />,
        title: "GPS Flight Tracker",
        details: [
          "Pilot sign-in: email/password authentication with registration and password reset via email.",
          "Record button: starts GPS breadcrumb trail, published to live map for all viewers.",
          "Barometer fusion: device barometric altitude fused with GPS using configurable EMA weight and divergence guard.",
          "Live stats: current altitude, speed, vertical speed, distance from launch, flight duration.",
          "Auto-start detection: configurable speed and altitude thresholds trigger recording automatically.",
          "Auto-stop detection: requires both ground speed AND vertical speed below thresholds for configured duration (prevents false landings while thermalling).",
          "Live pilot map: all active pilots visible to other pilots and duty pilot with position, name, and stats.",
          "Pilot-to-pilot messaging: compose, send, and receive direct messages with voice-to-text option. Auto-retry with exponential backoff. Messages purged after 24 hours.",
          "All signal processing parameters configurable from admin: EMA alpha, baro fusion weight, calibration samples, max divergence, auto-start/stop thresholds, active TTL, landed TTL, satellite polling interval.",
        ],
      },
      {
        icon: <Car className="w-5 h-5" />,
        title: "Pilot Retrieval System",
        details: [
          "Auto-entry on flight end: outlanded pilot automatically enters retrieval board with last known GPS position.",
          "In-flight retrieval request: pilot can request pickup before landing.",
          "Driver board (/xc/retrieval): street map with all awaiting pilots as orange markers. Authenticated pilots can act as drivers.",
          "Claim flow: driver claims a pilot, gets a 'Navigate' button that opens native maps with turn-by-turn directions.",
          "Driver GPS tracking: driver position broadcast every 60 seconds to waiting pilot.",
          "Pilot status panel: shows whether awaiting, who claimed them, driver live position on map.",
          "Cancel/unclaim: any driver can release a pilot back to the pool.",
          "Picked up confirmation: both parties updated immediately.",
          "Same-day filter: board shows only today's entries.",
          "Satellite tracker fallback: when pilot loses mobile signal, server polls Garmin inReach (MapShare), SPOT (XML Feed), or ZOLEO (IMEI + Developer API) every 2 minutes. Freshest valid position used. Satellite positions marked with 'SAT' badge.",
          "Offline maps reminder: shown on driver sign-in page.",
        ],
      },
      {
        icon: <Activity className="w-5 h-5" />,
        title: "Flight History & Export",
        details: [
          "Flight list: up to 500 flights per pilot with site name, date, duration, distance, max altitude, max speed.",
          "Flight detail: track map with launch/landing markers, full stats grid, GPS point count.",
          "Export formats: IGC (XContest compatible), GPX, KML (Google Earth).",
          "Delete flights: from list view (hover to reveal) or detail view. Removes all GPS breadcrumb data.",
        ],
      },
      {
        icon: <Monitor className="w-5 h-5" />,
        title: "Duty Pilot Map",
        details: [
          "Dedicated map view for a designated duty pilot or ground observer.",
          "Shows all active pilots, their positions, names, and live stats.",
          "Accessible at /xc/duty-pilot — no account required to view.",
          "Demo mode: /xc/maps/demo simulates pilot and driver roles with synthetic GPS data for training and demonstration.",
        ],
      },
      {
        icon: <Satellite className="w-5 h-5" />,
        title: "Airspace & Safety Tools",
        details: [
          "Dedicated airspace page (/xc/airspace): full-screen airspace overlay with altitude filtering.",
          "Proximity alerts: when GPS track enters an airspace sector, the sector flashes, an 880 Hz beep sounds, and haptic vibration triggers (5-second cooldown).",
          "Dismiss alerts: mute flashing/audio/haptic for current sectors via a Dismiss button. Alerts auto-rearm on exit and re-entry.",
          "Configurable proximity threshold: 50, 100, 150, 200, or 250 ft buffer, cycled via shield icon. Saved per pilot.",
          "Competitions listing (/xc/competitions): upcoming, open, closed, and completed events with registration links.",
        ],
      },
    ],
  },
  {
    id: "admin",
    title: "Admin Portal Requirements",
    items: [
      {
        icon: <Settings className="w-5 h-5" />,
        title: "Admin Dashboard",
        details: [
          "Secured by session-based authentication with bcrypt password hashing.",
          "Smart search bar: AI-powered search across admin features, procedures, sites, news, pages, and Google Drive documents. Returns summarised answer with source citations.",
          "Navigation cards organised by category: Content Management, Governance, Management, Settings, Specifications.",
          "Site Features toggles: Online Check-in, Featured Site, Photo Carousel, YouTube Carousel, QR Code mode, XC Maps, Flight Tracker.",
          "XC Maps and Flight Tracker are separate toggles: XC Maps enables the map/airspace/weather UI; Flight Tracker adds pilot sign-in, GPS recording, and live tracking controls.",
          "Specifications section: links to Platform Overview, Technical Specification, Build Blueprint, and PRD (this document).",
        ],
      },
      {
        icon: <MapPin className="w-5 h-5" />,
        title: "Site Management",
        details: [
          "Manage Sites page: site list with search, type/status filter, and hide-closed option.",
          "Import from siteguide.org.au: select state, run import with progress bar. Creates, updates, archives existing. Results show created/updated/unchanged/skipped/errors.",
          "Automated daily import: checks siteguide version at 5 AM Melbourne time; auto-imports for states previously imported manually.",
          "Siteguide version banner: colour-coded (green = current, orange = changed). Manual check available.",
          "WTF wind data compare: fetch wind speeds from wheretofly.info, compare with stored values, selectively apply.",
          "Restore from archive: up to 10 version archives with field-by-field diff view before restoring.",
          "Site Editor: full editing of all site fields — name, type, status, ratings, heights, contact, coordinates, Google Maps link, weather stations (primary + alternate), tide station, wind directions, wind speed, XC toggle, QR type.",
          "Smart Site Generator: auto-populate site fields from a siteguide URL using AI extraction.",
          "Add New Site: blank site form for manual entry.",
        ],
      },
      {
        icon: <Newspaper className="w-5 h-5" />,
        title: "Content Management",
        details: [
          "News editor: create/edit/delete news items with Markdown content, image toolbar (library, URL, enhance), publication date, author.",
          "Dynamic pages editor: create custom pages with unique slug, Markdown content, image toolbar, Google Docs paste import.",
          "Safety & Rules editor: add/edit/delete/reorder sections. Types: Emergency, Rules, Custom. Toggle visibility. Add navigation links.",
          "Procedures Manual: 22 editable sections covering club operations. Each section has a title, Markdown content, and ordered steps. Full CRUD via the admin.",
          "Business Directory: add/edit/delete member business listings with name, category, contact, logo, description.",
          "Competitions: add/edit/delete competitions with dates, status, rating requirement, registration URL, rules/scoring.",
          "Join Page Settings: configure hero text, TidyHQ URL, membership tier pricing cards, and FAQ accordion.",
          "Home Page Settings: hero content, background images, featured site, weather site selection, quick action cards, schools, Telegram groups, custom widget tags, social media links.",
          "Google Docs import: paste content from Google Docs into any Markdown editor — headings, bold, italic, lists, tables, links auto-converted.",
        ],
      },
      {
        icon: <ImageIcon className="w-5 h-5" />,
        title: "Image Library",
        details: [
          "Dual upload flow: Hero & Banner modal uploads create hero (1920×1080), banner (1920×600), and three slider sizes (Landscape Large 600×400, Landscape Small 450×300, Portrait 267×400) automatically.",
          "Smart Enhance: AI-powered processing adds sunny sky and optimised atmosphere to source image before resizing.",
          "Use Original: resize only without AI enhancement.",
          "Horizon levelling: ±10° rotation slider in crop wizard before processing.",
          "Photographer credit & watermark: configurable text, size (5–50%), and position (6 options). Live preview in crop wizard. Applied to all output sizes.",
          "URL import: paste image URL to download and add to library.",
          "Category tagging: Coastal or Inland tag on each hero image.",
          "Slider carousel toggle: enable/disable individual slider images for the home page carousel.",
          "Generate Missing Sliders: repair button that appears when any hero image is missing slider crops.",
          "SkyHigh Image Wall: all library images displayed on /club-photos, newest first.",
          "Community submissions: public photo upload with photographer credit, reviewed by admin.",
          "Permanent cloud storage: all images stored in Cloudflare R2, survive code deployments.",
        ],
      },
      {
        icon: <FolderOpen className="w-5 h-5" />,
        title: "Document & Project Management",
        details: [
          "Google Drive filing system: 10 category folders (01–10) aligned with Procedures Manual. Nested folder support to any depth.",
          "File operations: upload (drag-and-drop or picker), download, move, copy, delete. Breadcrumb navigation.",
          "Document search: find files by name across all folders.",
          "Document indexing: 'Sync Documents' indexes all Drive files for AI search. PDFs text-extracted via Google conversion.",
          "Project Management: track site works, stakeholder relationships, land management. Fields: name, status, linked site, works required, contractor/landowner/other notes, costing, approval details.",
          "Parks Victoria projects: special checkbox reveals PV-specific fields — liaison contact and expectations notice.",
          "Project documents: attach files (upload or link from Drive), auto-organised into project subfolder.",
          "Project contacts: link contacts from the directory with specific roles per project.",
        ],
      },
      {
        icon: <Contact2 className="w-5 h-5" />,
        title: "Contact Directory",
        details: [
          "Admin Contacts: full directory for committee, safety, contractors, Parks Vic, and admin users. Fields: name, organisation, phone, email, notes, roles, position.",
          "Admin role grants login access to the admin dashboard (requires password).",
          "Safety Committee role auto-populates the Safety Officer Directory on the public safety page.",
          "Display toggles: 'Display on Committee' and 'Display on Safety' — set automatically by TidyHQ webhook sync, overridable manually.",
          "Position field: set automatically from TidyHQ position groups (e.g. President, Treasurer). Shown on committee widget.",
          "Password Reset: 'Send Reset Email' button on any admin or committee contact.",
          "TidyHQ import: pre-fill contact details from TidyHQ member records.",
          "Public Contacts (Pilot Accounts): manage pilot accounts for flight tracker. Create, edit, delete. Send password reset emails. Delete also removes all flights and sessions.",
        ],
      },
      {
        icon: <BarChart2 className="w-5 h-5" />,
        title: "Analytics & Monitoring",
        details: [
          "Page View Analytics: every visited page logged with view count. Admin pages highlighted with orange badge.",
          "Reset individual or all counters.",
          "Online Check-ins admin: view recent check-in activity, daily count, total count per site.",
          "Scheduled Tasks: central control for all automated jobs — weather fetch, extended forecast, siteguide check, document sync. Configure times, enable/disable, view cache TTLs.",
          "Scheduled Tasks run on Melbourne time (AEDT/AEST). Hourly cron checks all configurable task times.",
        ],
      },
    ],
  },
  {
    id: "integrations",
    title: "External Integration Requirements",
    items: [
      {
        icon: <Plug className="w-5 h-5" />,
        title: "TidyHQ",
        details: [
          "Events API: pull upcoming events from TidyHQ for the public events page.",
          "Contact import: pre-fill admin contact records from TidyHQ member data.",
          "Group sync via webhook: map TidyHQ groups to website roles (Committee, Safety Committee, Position Title, Contractor, Parks Vic). Role assignments update automatically when group membership changes.",
          "Webhook log: admin view of recent sync events.",
          "Configurable via TIDYHQ_ACCESS_TOKEN secret. Status card in API Settings.",
        ],
      },
      {
        icon: <FolderOpen className="w-5 h-5" />,
        title: "Google Drive & Sheets",
        details: [
          "Google Drive via Apps Script bridge: all document operations (list, upload, download, move, copy, delete, create folder) proxied through a club-deployed Apps Script.",
          "Folder structure: 10 top-level category folders created automatically via 'Setup Folders'.",
          "PDF text extraction: enable Drive API in Apps Script, run _authoriseScopes, redeploy.",
          "Migration path: disconnect, redeploy fresh script, setup folders, move files, sync documents.",
          "Google Sheets asset register: separate Apps Script URL for spreadsheet data (inventory, asset lists).",
          "Both services configured via Apps Script URLs in API Settings. Test connection available.",
        ],
      },
      {
        icon: <Wind className="w-5 h-5" />,
        title: "Weather Data Sources",
        details: [
          "Weather Underground: live station data polled every 15–30 minutes during flying hours (7 AM–8 PM Melbourne time). Requires WU_API_KEY.",
          "Live-Wind / IFLinder: alternative station network, configured per-site with station ID.",
          "Open-Meteo / ECMWF: 7-day hourly forecast (days 1–2) and 4-hour interval forecast (days 3–7). Fetched daily at ~5:30 AM. No API key required.",
          "WhereToFly (WTF): optional wind speed comparison tool. Fetch and compare with stored site values, selectively apply.",
          "Siteguide.org.au: site data import source. Daily version check at 5 AM triggers auto-import on version change.",
          "OpenAIP: airspace sector data for XC Maps overlay. No API key required.",
          "OpenStreetMap / Overpass API: hospital lookup for Emergency Medical card within 100km of site coordinates.",
        ],
      },
      {
        icon: <Sparkles className="w-5 h-5" />,
        title: "AI (Google Gemini)",
        details: [
          "All AI features use Google Gemini via GEMINI_API_KEY. User can override with USER_GEMINI_API_KEY.",
          "Configurable model chains: text model chain (default: gemini-2.5-flash → gemini-2.5-pro → gemini-2.0-flash) and image model chain, each with fallback on failure.",
          "Admin UI: search available Google models, test connectivity, reorder/add/remove models in each chain.",
          "Smart Site Generator: extract structured site data from siteguide.org.au URL.",
          "Smart Image Enhancer: generate sunny-atmosphere enhanced version of uploaded site photos.",
          "Slider image generation: generate crop sizes from existing hero images.",
          "Admin Search: AI-summarised search across all admin content, procedures, sites, news, pages, and Drive documents.",
          "Public Smart Assistant: conversational AI on the home page with access to live weather, site data, forecasts, safety officers, and club documents.",
        ],
      },
      {
        icon: <Cloud className="w-5 h-5" />,
        title: "Cloudflare R2 Object Storage",
        details: [
          "All uploaded images (hero, banner, sliders, content, logos, PWA icons) stored in R2 when configured.",
          "Configured via R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL secrets.",
          "Fallback to local /uploads/ directory when R2 secrets are absent (development only).",
          "Files referenced by public URL — survive code deployments and server restarts permanently.",
          "Storage abstraction in server/storage.ts: saveFile, readFile, deleteFile, fileExists, keyFromUrl — all upload routes use this module exclusively.",
        ],
      },
    ],
  },
  {
    id: "branding",
    title: "White-Label & Branding Requirements",
    items: [
      {
        icon: <Palette className="w-5 h-5" />,
        title: "Club Identity",
        details: [
          "Club name and tagline configurable from Admin > Branding. Used throughout the site via {{clubName}} template tag.",
          "Light logo and dark logo: separate uploads for use on light and dark backgrounds. Five size variants auto-generated.",
          "PWA icon: custom home screen icon (512×512px recommended), separate from the main logo.",
          "Primary colour override: hex code or colour picker overrides the template accent colour.",
          "Template selection: 'Classic' (navy & orange) or 'Wonderful White' (Apple-inspired frosted glass). Each template assigns logo variant automatically.",
        ],
      },
      {
        icon: <FileText className="w-5 h-5" />,
        title: "Content Customisation",
        details: [
          "All hero text, descriptions, and CTA labels are editable from admin settings — no code changes required.",
          "XC Maps title and description configurable from Admin > XC.",
          "Home page hero, quick action cards, schools, Telegram groups, and social links all configurable.",
          "Procedures Manual: all 22 sections editable by admins for club-specific content.",
          "Custom dynamic pages: create any page at /page/your-slug with full Markdown content.",
          "Custom widget tags: create filtered subsets of schools or Telegram groups for use on specific pages.",
        ],
      },
    ],
  },
  {
    id: "nonfunc",
    title: "Non-Functional Requirements",
    items: [
      {
        icon: <Wifi className="w-5 h-5" />,
        title: "Mobile & Offline",
        details: [
          "Mobile-first design: all pages optimised for phone use in the field.",
          "PWA: installable to home screen with custom icon, full-screen launch, offline page caching.",
          "Offline map tiles: pilots can pre-download tiles for any area at configurable zoom levels before flying.",
          "Touch targets: all interactive elements meet 44×44px minimum for reliable field use with gloves or in turbulence.",
          "Safe-area insets: UI elements respect notch/home-bar areas on modern iPhones.",
          "Bottom-sheet pattern: mobile site selector and drawers use bottom-anchored panels with drag handles.",
        ],
      },
      {
        icon: <Lock className="w-5 h-5" />,
        title: "Security",
        details: [
          "Admin auth: bcrypt password hashing, session tokens, 24-hour TTL, expired session cleanup.",
          "Pilot auth: separate session system with 30-day TTL. Pilot sessions table in PostgreSQL.",
          "Rate limiting: express-rate-limit on all API endpoints. Pilot auth routes have 10 attempts per 15-minute window.",
          "URL allowlisting: only http/https protocol on user-submitted links.",
          "IP ban list: admin-managed banned IPs blocked at request level.",
          "Markdown content: rehype-sanitize prevents XSS in rendered CMS content.",
          "Environment secrets: all API keys stored as Replit secrets, never committed to code.",
        ],
      },
      {
        icon: <Activity className="w-5 h-5" />,
        title: "Performance & Reliability",
        details: [
          "Weather cache: live station data cached with 15-30 minute TTL. Emergency hospital results cached 48 hours.",
          "AI search context cached to reduce repeat AI calls for similar queries.",
          "Flight breadcrumbs stored in PostgreSQL. GPS polling interval and batch size configurable.",
          "Satellite tracker polling every 2 minutes as fallback — respects rate limits of Garmin/SPOT/ZOLEO APIs.",
          "Image processing in memory before writing to R2 — no temp files on disk.",
          "Auto-retry with exponential backoff on all real-time pilot messages.",
          "Overpass API (hospital lookup) uses two fallback servers with 30-second timeout.",
        ],
      },
      {
        icon: <Clock className="w-5 h-5" />,
        title: "Automation & Scheduled Jobs",
        details: [
          "Weather fetch: every 15–30 minutes during flying hours (7 AM–8 PM Melbourne time). Configurable.",
          "Extended forecast: daily at 5:30 AM Melbourne time. Configurable.",
          "Siteguide version check: daily at 5 AM Melbourne time. Triggers auto-import on version change.",
          "Satellite tracker polling: every 2 minutes when active pilots are in retrieval state.",
          "TidyHQ webhook: real-time group sync on membership change events.",
          "Pilot session cleanup: expired sessions purged periodically.",
          "Tile cache management: configurable zoom range, tile radius, and layer selection.",
        ],
      },
      {
        icon: <BookOpen className="w-5 h-5" />,
        title: "Documentation & Handover",
        details: [
          "Admin Manual (v13.6): built-in how-to guide covering every admin page and feature. Searchable by feature name.",
          "Procedures Manual: 22 operational sections covering club management procedures, officer handover, and member communications.",
          "Platform Overview (Features.tsx): feature categories and highlights for non-technical stakeholders.",
          "Technical Specification (TechSpec.tsx): complete reference covering stack, schema, packages, API patterns, environment setup.",
          "Build Blueprint: ordered prompts for recreating the entire platform from scratch across 13 phases.",
          "PRD (this document): product requirements covering vision, user roles, functional and non-functional requirements.",
        ],
      },
    ],
  },
  {
    id: "data",
    title: "Data Model Requirements",
    items: [
      {
        icon: <FolderOpen className="w-5 h-5" />,
        title: "Core Data Entities",
        details: [
          "sites — flying site records: all location, conditions, ratings, weather stations, heights, content. 37+ fields.",
          "pilots — pilot accounts for flight tracker and retrieval. Email, password hash, satellite tracker IDs.",
          "pilot_sessions — active pilot login tokens with TTL.",
          "flights — recorded flight sessions: pilot, site, duration, distance, max altitude, max speed, status.",
          "breadcrumbs — GPS breadcrumb points per flight: lat, lon, altitude, speed, vertical speed, timestamp.",
          "retrievals — retrieval board entries: pilot, driver, positions, status, timestamps.",
          "contacts — admin contacts: committee, safety officers, contractors, Parks Vic. Roles control visibility and access.",
          "admin_sessions — admin login tokens.",
          "settings — global platform configuration as key-value pairs.",
        ],
      },
      {
        icon: <FileText className="w-5 h-5" />,
        title: "Content & Media Data",
        details: [
          "news — news items with Markdown content, author, date.",
          "pages — dynamic CMS pages with slug, title, Markdown content.",
          "page_attachments — images attached to CMS pages.",
          "safety_sections — safety/rules page sections with type, content, visibility, sort order.",
          "procedures — procedures manual sections with steps (JSON-encoded).",
          "sponsors — sponsor records with logo, name, URL, description.",
          "business_directory — member business listings.",
          "competitions — paragliding competition records.",
          "image_submissions — community photo uploads pending admin review.",
          "documents — Google Drive document index for AI search.",
          "document_index — full-text search index of Drive documents.",
        ],
      },
      {
        icon: <Cloud className="w-5 h-5" />,
        title: "Weather & Operational Data",
        details: [
          "weather_observations — live station readings per site with timestamp.",
          "weather_forecasts — 7-day forecast data per site.",
          "extended_forecasts — ECMWF extended forecast data.",
          "site_extended_forecasts — extended forecast per site.",
          "wind_grid_data — interpolated wind field data for animated overlay.",
          "checkins — pilot check-in events per site with timestamp.",
          "map_messages — ephemeral pilot-to-pilot messages (purged after 24 hours).",
          "retrievals — retrieval board entries (same-day scope).",
          "emergency_hospitals_cache — hospital lookup results per site, cached 48 hours.",
          "siteguide_version_checks — siteguide.org.au version poll history.",
          "schema_migrations — applied migration version tracking.",
        ],
      },
    ],
  },
];

export function ProductSpec() {
  const { settings } = useSettings();
  const clubName = settings.clubName || "SkyHigh";
  const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);

  return (
    <div className="bg-card min-h-screen">
      <style>{`
        @media print {
          nav, footer, .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .spec-item { break-inside: avoid; }
          .spec-section { break-before: page; }
          .spec-section:first-of-type { break-before: avoid; }
        }
      `}</style>

      <div className="no-print fixed top-20 right-4 z-50">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg shadow-lg hover:bg-navy-light transition-colors text-sm font-medium"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-12 print:py-6">
        <div className="text-center mb-10 print:mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-navy/10 text-navy rounded-full text-xs font-bold uppercase tracking-widest mb-4">
            Product Requirements Document
          </div>
          <h1 className="text-3xl font-black text-navy mb-2 print:text-2xl">{clubName}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto print:text-sm">
            Complete product requirements — vision, user roles, functional features, integrations, and non-functional standards.
          </p>
          <p className="text-xs text-foreground-faint mt-2">{categories.length} sections &middot; {totalItems} requirement areas</p>
        </div>

        <div className="mb-8 print:mb-4">
          <div className="flex flex-wrap justify-center gap-2 print:gap-1">
            {categories.map((cat, idx) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="px-3 py-1.5 rounded-full bg-background hover:bg-navy/5 transition-colors text-sm text-navy font-medium no-print"
              >
                <span className="text-navy/40 font-bold mr-1">{idx + 1}.</span>
                {cat.title}
              </a>
            ))}
          </div>
        </div>

        <div className="border-t border-border-faint" />

        {categories.map((category, catIdx) => (
          <section
            key={category.id}
            id={category.id}
            className={`py-8 print:py-4 ${catIdx > 0 ? "spec-section border-t border-border-faint" : ""}`}
          >
            <div className="flex items-baseline gap-3 mb-6 print:mb-3">
              <span className="text-2xl font-black text-navy/20 print:text-xl">
                {String(catIdx + 1).padStart(2, "0")}
              </span>
              <h2 className="text-xl font-bold text-navy print:text-lg">{category.title}</h2>
            </div>

            <div className="space-y-4 print:space-y-3">
              {category.items.map((item, iIdx) => (
                <div
                  key={iIdx}
                  className="spec-item border border-border-faint rounded-lg p-4 print:p-3 hover:border-navy/30 transition-all print:border-border-subtle"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-navy/10 flex items-center justify-center flex-shrink-0 text-navy">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-navy mb-1.5 print:text-sm">{item.title}</h3>
                      <ul className="space-y-1">
                        {item.details.map((d, dIdx) => (
                          <li
                            key={dIdx}
                            className="text-sm text-foreground-secondary print:text-xs flex items-start gap-2"
                          >
                            <span className="text-navy/50 mt-1.5 flex-shrink-0">•</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
