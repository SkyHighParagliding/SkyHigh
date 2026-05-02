import {
  Server, Database, Globe, Key, Package, FileCode2, Cpu, Layers, Shield, HardDrive,
  Network, Plug, Cloud, Eye, Palette, Type, FolderTree, GitBranch, Terminal,
  Printer, Settings, Lock, Code2, MonitorSmartphone, Boxes, Workflow, FileJson, Cog, Wrench, Search
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
    id: "stack",
    title: "Core Technology Stack",
    items: [
      {
        icon: <Cpu className="w-5 h-5" />,
        title: "Runtime & Language",
        details: [
          "Node.js v20.20.0",
          "TypeScript ~5.8.2 (strict mode, ES2022 target)",
          "tsx v4.21.0 (TypeScript execution for server)",
          "Module system: ESNext with bundler resolution",
        ],
      },
      {
        icon: <MonitorSmartphone className="w-5 h-5" />,
        title: "Frontend Framework",
        details: [
          "React v19.0.0 with react-dom v19.0.0",
          "Vite v6.2.3 (build tool & dev server)",
          "@vitejs/plugin-react v5.0.4",
          "React Router DOM v7.13.1 (client-side routing)",
        ],
      },
      {
        icon: <Server className="w-5 h-5" />,
        title: "Backend Framework",
        details: [
          "Express.js v4.21.2",
          "express-rate-limit v8.3.0 (API throttling)",
          "multer v2.1.1 (file upload handling)",
          "concurrently v9.2.1 (parallel dev server startup)",
        ],
      },
      {
        icon: <Database className="w-5 h-5" />,
        title: "Database",
        details: [
          "PostgreSQL 16 via pg (node-postgres) v8.20.0",
          "Connection: DATABASE_URL environment variable (Replit managed PostgreSQL instance)",
          "Connection pool: max 20 connections, 30s idle timeout, 5s connection timeout",
          "Versioned migration system: 8 sequential SQL migration files in server/pg_migrations/",
          "schema_migrations table tracks applied migrations; each file runs exactly once on startup",
          "Transaction support: AsyncLocalStorage-based context in server/pgDb.ts propagates PG client through nested calls",
          "SQLite datetime() compatibility layer: pgDb.ts auto-translates datetime('now'), datetime('now', 'start of day'), datetime('now', '-N hours') to PostgreSQL equivalents",
        ],
      },
    ],
  },
  {
    id: "infra",
    title: "Infrastructure & Networking",
    items: [
      {
        icon: <Network className="w-5 h-5" />,
        title: "Development Server Architecture",
        details: [
          "Vite dev server: port 5000 (external-facing, serves frontend)",
          "Express API server: port 3001 (internal, API only)",
          "Vite proxies /api/*, /health, /ping, /uploads → Express on port 3001",
          "Both started via concurrently in npm run dev",
          "HMR: WebSocket over WSS (port 443) in Replit environment",
        ],
      },
      {
        icon: <Globe className="w-5 h-5" />,
        title: "Production / Deployment",
        details: [
          "Vite builds client assets to dist/public/",
          "esbuild bundles server to dist/server.mjs",
          "Express serves API routes + static files from dist/public/ on port 5000",
          "Deployment: autoscale with NODE_ENV=production node dist/server.mjs",
          "publicDir: dist/public for CDN static file serving",
        ],
      },
      {
        icon: <HardDrive className="w-5 h-5" />,
        title: "File Storage",
        details: [
          "Cloudflare R2 (primary): All uploaded images, branding logos, and page attachments are stored in R2 object storage when configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL env vars set). Files survive deployments permanently.",
          "Local fallback: When R2 env vars are absent, files write to the /uploads/ directory (served by Express). Used in development without credentials.",
          "server/storage.ts: Unified storage abstraction — saveFile(buffer, key, contentType), readFile(urlOrPath), deleteFile(urlOrPath), fileExists(urlOrPath), keyFromUrl(urlOrPath). All upload routes use this module exclusively.",
          "sharp v0.34.5 for image processing (resize, crop, watermark, format conversion). All processing happens in memory before calling saveFile().",
          "Seed data: JSON files in workspace root (scraped_sites.json, seed_*.json)",
        ],
      },
      {
        icon: <Shield className="w-5 h-5" />,
        title: "Security & Rate Limiting",
        details: [
          "express-rate-limit on all API endpoints",
          "bcryptjs v3.0.3 for password hashing",
          "Session-based auth with 24-hour token TTL",
          "Auto-migration of plain-text passwords on first login",
          "Periodic expired session cleanup",
          "URL protocol allowlisting (http/https only) on user-submitted links",
        ],
      },
    ],
  },
  {
    id: "secrets",
    title: "Environment Variables & Secrets",
    items: [
      {
        icon: <Key className="w-5 h-5" />,
        title: "Required API Keys",
        details: [
          "GEMINI_API_KEY — Google Gemini AI (primary, used for all AI features)",
          "WU_API_KEY — Weather Underground (live weather station data)",
        ],
      },
      {
        icon: <Lock className="w-5 h-5" />,
        title: "Optional API Keys",
        details: [
          "USER_GEMINI_API_KEY — User-provided Gemini key (overrides primary)",
          "TIDYHQ_ACCESS_TOKEN — TidyHQ integration (events proxy, contact import)",
        ],
      },
      {
        icon: <Settings className="w-5 h-5" />,
        title: "System Environment",
        details: [
          "NODE_ENV — 'production' or 'development' (controls build, error handling, DB safety)",
          "LOG_LEVEL — Logging verbosity (debug, info, warn, error)",
        ],
      },
    ],
  },
  {
    id: "deps",
    title: "Package Dependencies",
    items: [
      {
        icon: <Package className="w-5 h-5" />,
        title: "UI & Styling",
        details: [
          "tailwindcss v4.1.14 + @tailwindcss/vite v4.1.14 (utility-first CSS)",
          "lucide-react v0.546.0 (icon library)",
          "motion v12.23.24 (Framer Motion animations)",
          "class-variance-authority v0.7.1 + clsx v2.1.1 + tailwind-merge v3.5.0 (className utilities)",
          "@radix-ui/react-label v2.1.8 + @radix-ui/react-select v2.2.6 (accessible primitives)",
          "Fonts: Montserrat (headings), Roboto (body) via Google Fonts",
        ],
      },
      {
        icon: <Layers className="w-5 h-5" />,
        title: "Data Visualisation & Maps",
        details: [
          "d3 v7.9.0 + d3-tile v1.0.0 (wind map particle animation)",
          "leaflet v1.9.4 + react-leaflet v5.0.0 (interactive maps)",
          "qrcode.react v4.2.0 (QR code generation for site cards)",
        ],
      },
      {
        icon: <FileCode2 className="w-5 h-5" />,
        title: "Content & Parsing",
        details: [
          "react-markdown v10.1.0 (Markdown rendering in CMS)",
          "rehype-raw v7.0.0 + rehype-sanitize v6.0.0 (HTML in Markdown with XSS protection)",
          "cheerio v1.2.0 (server-side HTML scraping for site guide import)",
          "date-fns v4.1.0 + date-fns-tz v3.2.0 (date formatting with timezone support)",
        ],
      },
      {
        icon: <Cloud className="w-5 h-5" />,
        title: "AI & External Services",
        details: [
          "@google/genai v1.29.0 (Google Gemini SDK)",
          "AI text model: configurable fallback chain (default: gemini-2.5-flash → gemini-2.5-pro → gemini-2.0-flash)",
          "AI image model: configurable fallback chain (default: gemini-2.5-flash-image → gemini-3.1-flash-image-preview → gemini-3-pro-image-preview)",
          "Admin UI to search available Google models, test connectivity, reorder/add/remove models in each chain",
          "dotenv v17.2.3 (environment variable loading)",
        ],
      },
      {
        icon: <Wrench className="w-5 h-5" />,
        title: "Dev Dependencies",
        details: [
          "@types/express v4.17.21, @types/node v22.14.0",
          "@types/react v19.2.14, @types/react-dom v19.2.3",
          "@types/leaflet v1.9.21, @types/d3 v7.4.3",
          "@types/bcryptjs v2.4.6, @types/multer v2.0.0",
          "autoprefixer v10.4.21",
        ],
      },
    ],
  },
  {
    id: "db",
    title: "Database Schema",
    items: [
      {
        icon: <Database className="w-5 h-5" />,
        title: "Core Tables",
        details: [
          "sites — 37+ columns: id, name, type, status, lat/lon, pgRating, hgRating, windDir, windSpeed, images, contacts, what3words, weather links, launchHeight, launchHeightHigh, launchHeight2, landingHeight2 (four independent AMSL height fields for launch/landing pairs). Wind calculations derive min/max speed and ideal directions from the windSpeed and windDir text fields (single source of truth).",
          "settings — key/value store for all app configuration",
          "pages — CMS pages (slug, title, content, lastUpdated)",
          "news — articles (id, title, content, date, author)",
          "contacts — unified directory with role flags (isAdmin, isCommittee, isSafetyCommittee, isContractor, isParksVic, password)",
          "schema_migrations — versioned migration tracking",
        ],
      },
      {
        icon: <Boxes className="w-5 h-5" />,
        title: "Feature Tables",
        details: [
          "procedures — procedures manual sections (title, icon, steps JSON, sortOrder)",
          "projects — site works management (status, stakeholders, Parks Vic, budget, insurance)",
          "project_contacts — many-to-many project↔contact links with role",
          "project_documents — many-to-many project↔document links (includes 'linked' flag to distinguish Drive-linked files)",
          "documents — file management (driveFileId, category, mimeType, webViewLink)",
          "external_site_listings — scraped siteguide.org.au listing index (name, url, state, region)",
          "site_archives — version-keyed site snapshots (siteguideVersion UNIQUE, archivedAt, siteCount, siteData JSON). Max 10 retained.",
        ],
      },
      {
        icon: <Cloud className="w-5 h-5" />,
        title: "Weather & Analytics Tables",
        details: [
          "weather_observations — live station data (windSpeed, windGust, direction, stationName). Alt station obs stored with siteId format 'siteId:alt'",
          "weather_forecasts — ECMWF forecast data (temperature, wind, icon, forecasts JSON)",
          "wind_grid_data — cached Open-Meteo grid data per site",
          "extended_forecasts — 7-day extended grid data (days 3–7 at 4-hour intervals, fetched daily at ~5:30am Melbourne time)",
          "site_extended_forecasts — per-site 7-day outlook combining days 1–2 hourly + days 3–7 extended data",
          "checkins — pilot check-in records (siteId, pilotName, timestamp)",
          "page_views — analytics tracking (path, views count, lastViewed)",
        ],
      },
      {
        icon: <Lock className="w-5 h-5" />,
        title: "Auth Tables (Legacy)",
        details: [
          "admin_users — legacy table; data unified into contacts table (isAdmin flag) in SQLite migration era. Empty in PostgreSQL schema.",
          "admin_sessions — active admin login tokens (token, userId, createdAt)",
          "safety_officers — legacy table; data unified into contacts table (isSafetyCommittee flag) in SQLite migration era. Empty in PostgreSQL schema.",
          "pilot_sessions — active pilot login tokens (token, pilotId FK, createdAt). Added in PG migration 008.",
        ],
      },
    ],
  },
  {
    id: "api",
    title: "API Routes",
    items: [
      {
        icon: <Globe className="w-5 h-5" />,
        title: "/api/sites — Flying Sites",
        details: [
          "GET / — List all sites (public)",
          "GET /slider-photos — Returns array of {src, variant} objects for enabled slider images from the image library. Variants: landscape-lg (600×400), landscape-sm (450×300), portrait (267×400). Used by PhotoSlider component.",
          "GET /:id — Get site detail (public)",
          "GET /:id/weather-gauge — Proxy weather gauge data (derived from liveStationId)",
          "GET /weather-gauge/fetch — Fetch gauge by URL",
          "GET /siteguide-version — Fetch current siteguide.org.au database version from About page (auth, 5-min cache)",
          "GET /bulk-import/progress — SSE progress stream for bulk import",
          "POST / — Create site (auth)",
          "POST /bulk-import — Bulk import from siteguide.org.au (auth). Archives current sites before importing. Sites with skipBulkImport='true' are skipped entirely (status 'skipped'). Admin-configured fields (windDir, windSpeed, pgRating, hgRating, status, live weather, image, cross-wind, isSkyHighSite) are COALESCE-protected — only populated if existing value is null/empty. unassignedText is protected via CASE — only overwritten if new value is non-empty. Siteguide content (description, hazards, rules, essential info, etc.) is always refreshed. AI temperature pinned to 0 for deterministic output. Saves lastImportedState setting for auto-import.",
          "POST /scrape-urls — Scrape external site listing URLs (auth)",
          "POST /:id/scrape-essential-info — AI-scrape essential info images (auth, legacy)",
          "GET /archives — List all site archives with version, date, site count (auth)",
          "GET /archives/:version/diff — Compare archived sites against current sites. Returns added, removed, modified sites with field-level diffs. The UI categorises each field change as 'Added' (null→value), 'Removed' (value→null), or 'Changed' (A→B). Optional ?siteId= filter for single-site comparison (auth)",
          "POST /archives/:version/restore — Bulk restore all sites from a version archive (auth). Archives current sites before restoring.",
          "POST /archives/:version/restore/:siteId — Restore a single site from a version archive (auth). Updates existing or re-creates deleted site.",
          "PUT /:id — Update site (auth)",
          "PUT /:id/essential-info — Save essential info images & text (auth)",
          "PATCH /:id/image — Update site hero image (auth)",
          "DELETE /:id — Delete site (auth)",
        ],
      },
      {
        icon: <Cloud className="w-5 h-5" />,
        title: "/api/weather — Weather Data",
        details: [
          "GET /:siteId — Get weather observation + forecast for site",
          "GET /:siteId/wind-grid — Get cached wind grid data",
          "GET /:siteId/wind-particles — Get wind particle data for animation",
          "GET /:siteId/extended-forecast — Get 7-day extended forecast for site",
          "GET /extended-grid/data — Get full extended grid data (days 3-7)",
          "GET /extended-grid/wind-overlay — Extended grid converted to U/V WindGrid format for 7-day wind map overlay",
          "GET /stations/nearby — Find nearby weather stations by lat/lon",
          "GET /wind-overlay/full — Full Victoria + wide grid overlay data",
          "POST /scrape-now — Force immediate weather scrape cycle",
          "POST /extended-forecast/fetch-now — Trigger manual extended forecast fetch",
        ],
      },
      {
        icon: <Cpu className="w-5 h-5" />,
        title: "/api/ai — AI Generation",
        details: [
          "GET /test — Test AI connectivity",
          "GET /prompt — Get site generation prompt",
          "GET /image-prompt — Get image generation prompt",
          "GET /rating-prompt — Get rating parsing prompt",
          "GET /generate — Generate site data from URL via AI",
          "PUT /prompt — Update site generation prompt (auth)",
          "PUT /image-prompt — Update image prompt (auth)",
          "PUT /rating-prompt — Update rating prompt (auth)",
          "POST /generate — Generate AI content (auth)",
          "POST /parse-rating — Parse rating string via AI (auth)",
          "POST /process-image — Process/enhance image via AI (auth)",
          "POST /process-image-url — Process image from URL (auth)",
          "POST /process-content-image — Process content image (auth)",
          "POST /enhance-image — Upload + enhance image (auth, multipart)",
          "POST /crop-banner — Crop image to banner dimensions (auth)",
          "POST /generate-slider-images — Generate 3 slider sizes (600×400, 450×300, 267×400) from an existing hero image (auth). Used to backfill slider images for existing library entries.",
          "POST /upload-hero-image — Upload hero image (auth, multipart)",
          "POST /upload-content-image — Upload content image (auth, multipart)",
          "GET /models — List all available models from Google Gemini API (auth)",
          "GET /models/config — Get current text and image model fallback chains (auth)",
          "PUT /models/config — Update text and/or image model chains (auth)",
          "POST /models/test — Test a specific model by name and type (auth)",
        ],
      },
      {
        icon: <FileCode2 className="w-5 h-5" />,
        title: "/api/pages, /api/news, /api/settings",
        details: [
          "Pages: GET /, GET /:slug, POST /, PUT /:slug, DELETE /:slug",
          "News: GET /, GET /:id, POST /, PUT /:id, DELETE /:id",
          "Settings: GET / (public), PUT / (auth) — key/value store for all config",
        ],
      },
      {
        icon: <Shield className="w-5 h-5" />,
        title: "/api/auth, /api/safety-officers, /api/checkins",
        details: [
          "Auth: POST /login, POST /logout, GET /me, GET /users, POST /users, DELETE /users/:id, POST /send-password-reset, GET /validate-reset-token, POST /reset-password",
          "Officers: GET /, POST /, PUT /:id, DELETE /:id (queries contacts table isSafetyCommittee flag)",
          "Checkins: GET /, GET /stats, POST /",
        ],
      },
      {
        icon: <Plug className="w-5 h-5" />,
        title: "/api/events, /api/contacts, /api/search",
        details: [
          "Events: GET / (all), GET /upcoming (TidyHQ proxy)",
          "Contacts: GET /, GET /:id, GET /search, GET /tidyhq-search, GET /public/committee, POST /, PUT /:id, DELETE /:id",
          "Search: POST /public (SSE streaming flyability analysis — gemini-2.5-flash primary, context caching, query-aware site filtering, document context from 09_Public Reference only), POST /admin (all-content search with full document index context from all 10 folders, returns markdown summary + typed results), GET /*/default-prompt",
        ],
      },
      {
        icon: <FolderTree className="w-5 h-5" />,
        title: "/api/documents, /api/projects, /api/procedures, /api/pageviews",
        details: [
          "Documents: GET /categories, GET /category/:code, GET /search, GET /drive-search, GET /status, POST /upload, DELETE /:id",
          "Projects: GET /, GET /:id, POST /, PUT /:id, DELETE /:id, POST /:id/contacts, DELETE /:id/contacts/:contactId, POST /:id/documents/upload, POST /:id/documents/link, DELETE /:id/documents/:docId, GET /:id/documents/drive (lists project files from Drive via Apps Script, with 5-minute in-memory cache), GET+PUT /settings/parks-vic-defaults",
          "Procedures: GET /, GET /:id, POST /, PUT /:id, DELETE /:id",
          "Pageviews: GET /, POST /track, POST /reset/:path, POST /reset-all",
        ],
      },
    ],
  },
  {
    id: "frontend",
    title: "Frontend Architecture",
    items: [
      {
        icon: <FolderTree className="w-5 h-5" />,
        title: "Project Structure",
        details: [
          "src/App.tsx — Root router with all route definitions",
          "src/index.css — Tailwind v4 theme (custom colours: navy, sky, orange, sand)",
          "src/contexts/ — AuthContext.tsx (login state), SettingsContext.tsx (app config)",
          "src/lib/utils.ts — Shared utilities (formatDisplayTime, getWeatherIcon, getWindStatus)",
          "src/lib/urlHelpers.ts — URL construction helpers",
          "src/components/ui/ — Shadcn/ui primitives (badge, button, card, input, label, select, textarea)",
        ],
      },
      {
        icon: <Eye className="w-5 h-5" />,
        title: "Public Pages (16)",
        details: [
          "Home.tsx — Hero with rotating images, CTA buttons, featured site, weather previews",
          "Sites.tsx — Site directory grid with coastal/inland filter",
          "SiteDetail.tsx — Full site guide with weather, hazards, maps, info cards",
          "SiteFieldView.tsx — Compact mobile field view for QR code access",
          "News.tsx / NewsDetail.tsx — News listing and article view",
          "Events.tsx — TidyHQ events integration",
          "Safety.tsx — Safety officers directory",
          "CheckIn.tsx — Pilot check-in form",
          "Page.tsx — Dynamic CMS page renderer",
          "Features.tsx — Platform overview (printable)",
          "TechSpec.tsx — Technical specification (printable, this page)",
          "ClubPhotos.tsx — SkyHigh Image Wall mosaic page cycling through all Image Library categories (hero, banner, landscape-lg, landscape-sm, portrait) in repeating pattern with justified row layout",
          "VideoWall.tsx — SkyHigh Video Wall mosaic of YouTube video thumbnails in 4 size variants (wide, standard, medium, compact), newest first, click-through to YouTube",
          "ProceduresManual.tsx — Club procedures (public read-only)",
        ],
      },
      {
        icon: <Settings className="w-5 h-5" />,
        title: "Admin Pages (17)",
        details: [
          "AdminDashboard.tsx — Main admin hub with nav cards and toggles",
          "AdminLogin.tsx — Authentication form",
          "AdminSites.tsx / AdminSiteEdit.tsx — Site CRUD with AI generation",
          "AdminHomeSettings.tsx — Home page content management",
          "AdminImages.tsx — Hero/banner image library with lightbox",
          "AdminPages.tsx / AdminPageEdit.tsx — CMS page editor",
          "AdminNewsEdit.tsx — News article editor",
          "AdminWeather.tsx — Weather scraper config and wind map settings",
          "AdminAIModels.tsx — AI model fallback chain configuration with live Google model search, in-place model replacement, per-model testing, trait badges (speed/thinking/cost/vision/image-gen/context/legacy/experimental), and clickable trait filters that re-sort the model list by best match with score indicators",
          "AdminCheckins.tsx — Check-in analytics",
          "AdminPageViews.tsx — Page view analytics",
          "AdminDocuments.tsx — Document filing system with subfolder browsing. Categories show subfolder grid (amber folder icons, file counts) above loose files. Breadcrumb navigation (Documents > Category > Subfolder). 'New Folder' button creates subfolders in Google Drive. Upload modal includes subfolder picker dropdown with 'Create new folder' option. For category 07 (Marketing & Photos), new folder input auto-suggests site names from the database via HTML datalist. File actions via ⋮ dropdown menu: Download (fetches file via Apps Script base64 encoding), Move to (relocates file to different category/subfolder), Copy to (duplicates file to different category/subfolder), Delete. Move/Copy modal has drill-down folder browser with breadcrumb navigation for nested folder selection. Nested folder support: unlimited depth folder navigation with path-based API (navigateToFolder helper in Apps Script walks slash-separated paths). Breadcrumb trail shows full path with clickable segments. 'New Folder' button works at any depth. Mobile-responsive: card layout for files on small screens, bottom-sheet style upload modal. API: GET /category/:code/subfolders?path=, POST /category/:code/subfolders (body: name, parentPath), GET /category/:code/subfolder/:name (subfolder param supports slash paths), POST /move, POST /copy, GET /download/:fileId, GET /sites/names. Apps Script actions: listSubfolders (with subfolder path param), createSubfolder (with parentPath param), moveFile, copyFile, downloadFile, navigateToFolder helper for path traversal.",
          "AdminConnections.tsx — API Settings hub: central page to manage all external service integrations (Google Drive, Google Sheets, Open-Meteo, Weather Underground, AI Models, TidyHQ) and Smart Assistant settings (disclaimer, CTA, prompt, committee link). Shows status, cost, connection method, setup instructions, and configuration fields. Each configurable card has a 'Script' button that opens a popup modal with the full Apps Script code and a copy-to-clipboard button. Scripts: drive-bridge-appscript.gs (Drive bridge with PDF text extraction and recursive sub-folder indexing) and asset-register-appscript.gs (Asset Register search API — reads all tabs: Asset Register, Loan Register, Condition Ratings, Inspection Frequencies). Google Sheets card includes: Test Connection button (fetches asset_appscript_url, reports row/tab counts, detects misconfigured Drive bridge URL), CSV tab template downloads (4 files: template-asset-register.csv, template-loan-register.csv, template-condition-ratings.csv, template-inspection-frequencies.csv). Drive Folder Setup: 'Setup Folders' button calls action=setup to create all 10 category folders (01–10) plus sub-folders (YYYY_Meetings, Receipts_YYYY, Completed, '1 Important DO NOT CHANGE FOLDER STRUCTURE' in root/09/10). Disconnect Drive: clears drive_appscript_url setting and document_index, does NOT delete Drive files. Document Index: 'Sync Documents' triggers indexAll (recursive) via Apps Script, caches extracted text in document_index table (PostgreSQL). Sync detects PDF extraction failures and returns pdfErrors[] with per-file error messages; frontend shows 'PDF — enable Drive API' badge and warning. Smart Assistant card: editable publicSearchDisclaimer (appended bold to all search replies), CTA message/frequency, committee contact link, AI prompt. Supports hash-based deep linking (#google-drive, #google-sheets, #smart-assistant, etc.)",
          "AdminProjects.tsx / AdminProjectEdit.tsx — Project management",
          "AdminContacts.tsx — Contact directory management",
          "AdminUsers.tsx — Admin user management",
          "AdminManual.tsx — Built-in admin how-to guide",
          "WindMapLab.tsx — Wind map particle tuning sandbox",
        ],
      },
      {
        icon: <Boxes className="w-5 h-5" />,
        title: "Shared Components (15)",
        details: [
          "Layout.tsx — App shell with nav, footer, admin link",
          "AdminRoute.tsx — Auth-gated route wrapper",
          "PhotoSlider.tsx — Full-width auto-scrolling photo strip on home page. Fetches slider images from the image library (3 sizes per image: 600×400, 450×300, 267×400 — generated on upload or via 'Generate Slider Images' bulk action). Each image can be toggled on/off in the Image Library. Draggable with 2px gaps, auto-resumes after 2s pause. Tripled track for seamless infinite loop. Toggled via photoSliderEnabled setting.",
          "WeatherCard.tsx — Live weather display with compass, forecast, and integrated tide chart toggle for coastal sites. 7-Day Outlook and Tides panels swap in the same space with animated transitions.",
          "WindCompass.tsx — Animated wind direction compass with sector ring",
          "WindMapProto.tsx — D3 particle wind map (production version). Uses windGridCache for client-side caching + background prefetch on page load. TODAY/7 DAYS toggle switches between hourly and extended (4h-interval) ECMWF data. Timestamp-aware interpolation handles irregular time spacing.",
          "WindMap.tsx — Legacy wind map component",
          "InfoCard.tsx — Dynamic layout card (vertical/horizontal/stacked based on text length)",
          "AIImageEnhancerModal.tsx — Smart image enhancer with crop selector",
          "AISiteGeneratorModal.tsx — AI site data generator from URL",
          "ContentImageToolbar.tsx — Image insertion toolbar for content editors (news articles, pages). Three modes: Library (tabbed picker for all 5 categories — Hero, Banner, Landscape Large, Landscape Small, Portrait — displayed as a scrollable 3-column grid of fixed-height thumbnails, each showing one image clearly), Paste URL, and Screenshot Tags. Click any thumbnail to insert it at the cursor position. Includes 'Upload/Create/Manage Images' link.",
          "ContentWidgets.tsx — Markdown content widget renderer",
          "AdminSearchBox.tsx / PublicSearchBox.tsx — AI-powered search. Public version uses SSE streaming (progressive token display), request deduplication (AbortController), and supports periodic CTA messages (configurable frequency 0-5, extended markdown: bold, italic, links, ->center<-, ->>right<<-, ^^^large^^^, ::caption::, line breaks, amber-styled bubbles). Settings: publicSearchCtaMessage, publicSearchCtaFrequency.",
          "VoiceMicButton.tsx — Voice input for search",
          "UnsavedChangesModal.tsx — Navigation guard for unsaved edits",
        ],
      },
    ],
  },
  {
    id: "server",
    title: "Server Architecture",
    items: [
      {
        icon: <Server className="w-5 h-5" />,
        title: "Core Server Files",
        details: [
          "server.ts — Entry point: Express app, route mounting, rate limiters, error handler, session cleanup",
          "server/pgDb.ts — PostgreSQL pool (pg v8.20.0), AsyncLocalStorage transaction context, SQLite datetime() auto-translation layer, migration runner (8 SQL files in server/pg_migrations/), startup connectivity check",
          "server/seed.ts — Seed data loader from 9 JSON files, fallback hardcoded data",
        ],
      },
      {
        icon: <Cloud className="w-5 h-5" />,
        title: "Weather System",
        details: [
          "server/weather.ts — Multi-source scraper: Live-Wind, Weather Underground, FreeFlightWx. Dual station support: primary (liveStationId) + optional alternate (liveStationIdAlt). Alt obs stored with ':alt' suffix key. WeatherCard shows swap button when alt data present.",
          "server/tides.ts — Astronomical tide predictions for coastal sites. Auto-detects nearest tide station from site coordinates. Caches predictions with 30-min TTL. Integrated into WeatherCard via GET /api/sites/:id/tides endpoint.",
          "server/victoriaGrid.ts — Open-Meteo ECMWF grid fetcher (Victoria + wide), tile-based with retry. Stores full 36-hour range for days 1-2. Per-site forecast extracts 8am–8pm (13 hourly slots) for weather cards.",
          "server/extendedForecast.ts — Daily extended forecast fetcher for days 3-7. Fetches 7-day ECMWF data from Open-Meteo, filters to 4-hour intervals (7am/11am/3pm/7pm) for days 3-7. Runs once daily at ~5:30am Melbourne time. Extracts per-site 7-day outlook combining hourly (days 1-2) and extended (days 3-7) data. Best-slot selection picks the most flyable hour per day (scores direction match +2, speed in range +2, light +1) instead of blindly using the middle slot.",
          "server/freeflightwx.ts — FreeFlightWx station data parser",
          "server/wtf.ts — WhereToFly (wheretofly.info) wind data utilities. Manual-only — provides fetch/match/compare functions used by the 'Update WTF Wind Data' UI on Manage Sites. NOT called automatically during imports or scrapes. API: POST /api/sites/wtf-compare (fetch + match + diff), POST /api/sites/wtf-apply (update selected sites).",
          "Scrape interval: configurable 15-30 min during flying hours (7am-8pm)",
        ],
      },
      {
        icon: <Wrench className="w-5 h-5" />,
        title: "Middleware & Utilities",
        details: [
          "server/middleware/auth.ts — requireAuth middleware, Bearer token validation, 24h TTL, session cleanup",
          "server/utils/asyncHandler.ts — Async route error forwarding wrapper",
          "server/utils/aiModels.ts — DB-backed model chain management (getTextModels, getImageModels, generateTextWithFallback) with admin UI",
          "server/utils/aiJsonParser.ts — AI response JSON cleanup (strips markdown, fixes syntax)",
          "server/utils/logger.ts — Structured logger with levels, timestamps, context tags",
          "server/googleDrive.ts — Google Drive helper (offline-ready, graceful nulls when disconnected)",
        ],
      },
      {
        icon: <Search className="w-5 h-5" />,
        title: "Document Search Pipeline — PDF Text Extraction & AI Knowledge Base",
        details: [
          "Architecture: Website ↔ Express API ↔ Google Apps Script (deployed as web app) ↔ Google Drive API + DocumentApp. No OAuth client needed — the Apps Script runs as the deploying user and the website calls it via its public web app URL.",
          "Apps Script: public/assets/drive-bridge-appscript.gs — deployed to Google Apps Script by the admin. Handles all Drive operations: browse, upload (with optional subfolder param for project folders), search, folder management, document indexing with text extraction. Project-specific actions: createProjectFolder (creates named subfolder inside 08_Projects), listProjectFiles (lists files in a project subfolder). Upload uses subfolder param to auto-create project folders in 08_Projects when uploading project documents. Requires two setup steps: (1) Drive Advanced Service enabled (identifier 'Drive', v2 or v3), (2) _authoriseScopes function run once to grant DocumentApp permissions.",
          "PDF Text Extraction Pipeline: (1) Apps Script fetches PDF blob via DriveApp.getFileById().getBlob(). (2) Converts PDF to Google Doc using Drive.Files.create (v3) or Drive.Files.insert (v2) with mimeType 'application/vnd.google-apps.document' — Google's server performs OCR/text extraction during conversion. (3) Reads converted doc text via DocumentApp.openById().getBody().getText() — returns clean plain text with proper paragraph/line structure. (4) Trashes the temporary converted Google Doc. Supports both Drive API v2 and v3 automatically (v3 uses Files.create, v2 uses Files.insert with convert+ocr flags).",
          "Document Indexing: 'Sync Documents' calls Apps Script action=indexAll. Script recursively scans all 10 category folders (max depth 5, max 500 files). For each file, calls readFileContent() which routes by mimeType: Google Docs → DocumentApp.openById(), Sheets → SpreadsheetApp.openById() with row/column extraction, plain text/HTML/CSV → getBlob().getDataAsString(), PDFs → extractTextFromPdf() pipeline above. Text truncated to MAX_TEXT_LENGTH (500,000 chars). Returns JSON array of {id, name, mimeType, category, text, readable, url, dates}.",
          "Server-side Storage: POST /api/documents/index/sync receives indexed documents, stores in document_index table (PostgreSQL). Fields: driveFileId, name, category, mimeType, driveUrl, textContent, charCount, readable, indexedAt, lastModified. Detects PDF extraction failures (text starting with '[PDF text extraction') — stores empty text, marks unreadable, collects per-file errors in pdfErrors[] array returned to frontend.",
          "AI Search Context: getIndexedDocumentsContext() (admin search — all 10 folders) and getPublicDocumentsContext() (public search — 09_Public Reference only). Each builds a text context string with document headers and content. Dynamic per-document limit: min(80,000 chars, 400,000 / docCount) — ensures total context stays within AI model limits while maximising content per document. Context is injected into the AI search prompt alongside site data, procedures, and other content.",
          "Admin Search: POST /api/search/admin sends query + full content context to AI model. Prompt instructs AI to give comprehensive markdown-formatted answers with document citations (name + version/date). Response JSON: {summary, results[]}. Frontend AdminSearchBox.tsx renders summary via react-markdown with prose styling. Results section shows 'Related Documents & Links' with type badges (DOCUMENT, PROCEDURE, PAGE, SEARCH-TERM).",
          "Public vs Admin Search Privacy: Public search only receives documents from 09_Public Reference folder via getPublicDocumentsContext(). Admin search receives all folders via getIndexedDocumentsContext(). This prevents internal governance, financial, and membership documents from leaking to public users.",
          "Error Handling: Script returns structured error strings '[PDF text extraction failed: ...]' or '[PDF text extraction unavailable: ...]'. Server detects these, excludes from index, logs warnings, returns pdfErrors[] in sync response. Frontend shows per-file badges ('PDF — enable Drive API') and sync result message with actual error text for diagnostics.",
        ],
      },
      {
        icon: <FileJson className="w-5 h-5" />,
        title: "Seed Data Files",
        details: [
          "scraped_sites.json — 70 sites with all fields (287KB)",
          "seed_settings.json — 65 app settings (16KB)",
          "seed_pages.json — 3 CMS pages",
          "seed_contacts.json — 8 contacts (admins, SOs, SSOs)",
          "seed_procedures.json — 23 procedure sections (107KB)",
          "seed_news.json — 1 news article",
          "seed_projects.json — 2 projects",
          "seed_project_contacts.json — 2 project-contact links",
          "seed_external_listings.json — 244 external site listings (58KB)",
        ],
      },
    ],
  },
  {
    id: "config",
    title: "Configuration Files",
    items: [
      {
        icon: <Cog className="w-5 h-5" />,
        title: "Build & Tooling",
        details: [
          "package.json — Scripts: dev, dev:api, dev:client, build, start",
          "vite.config.ts — Vite 6 config: React plugin, Tailwind plugin, proxy rules, path aliases (@/ → src/)",
          "tsconfig.json — ES2022 target, bundler resolution, JSX react-jsx, path mapping",
          ".replit — Nix modules: nodejs-20, web, postgresql-16; channel: stable-25_05",
        ],
      },
      {
        icon: <Palette className="w-5 h-5" />,
        title: "Theme & Design System",
        details: [
          "Tailwind v4 with @theme directive in src/index.css (no tailwind.config.js)",
          "Custom colours: navy (#1a2b3c), sky (#00a8e8), orange (#ff6b35), sand (#f4f1ea)",
          "Hazard colours: low (#10b981), medium (#f59e0b), high (#ef4444)",
          "Fonts: Montserrat (headings, font-sans), Roboto (body, font-body)",
          "Input pattern: border border-border with focus:ring-1 focus:ring-sky focus:border-sky",
          "White-label template system: two templates (Classic navy/orange, Wonderful White Apple-inspired)",
          "Template tokens use --tmpl-* CSS custom properties applied to :root via TemplateContext",
          "src/templates/registry.ts — defines TemplateDefinition interface and token sets per template",
          "src/contexts/TemplateContext.tsx — reads activeTemplate from settings, applies CSS vars, exposes isWonderfulWhite/isClassic flags",
          "Branding settings: clubName, clubTagline, clubPrimaryColor, clubLogo* (5 light variants), clubLogoDark* (5 dark variants), logoMode_<templateId> (per-template light/dark assignment)",
          "Dual logo upload pipeline: POST /api/branding/logo (light) and POST /api/branding/logo-dark — multer (5MB max) + sharp Lanczos3 → nav, footer, favicon, splash, original stored in /uploads/branding/. resolveActiveLogos() in SettingsContext resolves active set based on current template with dark→light fallback. Context-aware logo swap in Wonderful White: lightLogos (header over hero/dark backgrounds), darkLogos (footer over white backgrounds). Classic template uses activeLogos for both (dark navy header + footer).",
          "{{clubName}} token in CMS page content and hero settings resolved at render time by Page.tsx and Home.tsx",
        ],
      },
      {
        icon: <GitBranch className="w-5 h-5" />,
        title: "Authentication System",
        details: [
          "Default admin accounts auto-created in seed (change passwords immediately)",
          "Passwords hashed with bcrypt on creation and login",
          "Session tokens stored in localStorage as 'adminToken'",
          "24-hour token TTL with automatic session cleanup",
        ],
      },
    ],
  },
  {
    id: "setup",
    title: "Manual Setup Guide",
    items: [
      {
        icon: <Terminal className="w-5 h-5" />,
        title: "Step 1: Environment Setup",
        details: [
          "Install Node.js v20.x (v20.20.0 tested)",
          "Clone repository and cd into project root",
          "Run: npm install",
          "Create .env file with GEMINI_API_KEY and WU_API_KEY",
          "Optional: Add TIDYHQ_ACCESS_TOKEN for events integration",
        ],
      },
      {
        icon: <Database className="w-5 h-5" />,
        title: "Step 2: Database Initialisation",
        details: [
          "PostgreSQL is provisioned automatically by Replit — DATABASE_URL is injected as an environment variable",
          "On startup, server/pgDb.ts connects to the pool, checks connectivity, then runs any pending SQL migrations from server/pg_migrations/ in order",
          "8 SQL migration files (001–008) are applied sequentially; schema_migrations tracks which have run",
          "Seed data loads automatically from JSON files in project root (scraped_sites.json, seed_*.json) if the sites table is empty",
          "If JSON files are missing, falls back to minimal hardcoded seed data",
          "Default admin users auto-created with plain-text passwords (hashed on first login)",
        ],
      },
      {
        icon: <Workflow className="w-5 h-5" />,
        title: "Step 3: Run Development",
        details: [
          "Run: npm run dev",
          "This starts concurrently: Vite on port 5000, Express on port 3001",
          "Vite proxies /api/*, /health, /ping, /uploads to Express",
          "Access site at http://localhost:5000",
          "Admin panel at http://localhost:5000/admin",
        ],
      },
      {
        icon: <Globe className="w-5 h-5" />,
        title: "Step 4: Build for Production",
        details: [
          "Run: npm run build (builds client to dist/public/, bundles server to dist/server.mjs)",
          "Run: NODE_ENV=production node dist/server.mjs",
          "Express serves both API and static files on port 5000",
          "Set all required environment variables in production environment",
        ],
      },
      {
        icon: <FolderTree className="w-5 h-5" />,
        title: "Step 5: Verify Installation",
        details: [
          "Homepage loads with hero image and site cards",
          "Login at /admin with default admin credentials (change password immediately)",
          "Weather data populates within first scrape cycle (15-30 min)",
          "AI features require valid GEMINI_API_KEY",
          "Wind map requires weather grid data (auto-fetched from Open-Meteo)",
        ],
      },
    ],
  },
];

const totalItems = categories.reduce((sum, cat) => sum + cat.items.length, 0);

export function TechSpec() {
  const { settings } = useSettings();
  const clubName = settings.clubName || 'SkyHigh';
  return (
    <div className="bg-card min-h-screen">
      <style>{`
        @media print {
          nav, footer, .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .spec-card { break-inside: avoid; }
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
            Technical Specification
          </div>
          <h1 className="text-3xl font-black text-navy mb-2 print:text-2xl">{clubName}</h1>
          <p className="text-muted-foreground max-w-xl mx-auto print:text-sm">
            Complete technical reference for manual recreation, maintenance, and disaster recovery of the platform.
          </p>
          <p className="text-xs text-foreground-faint mt-2">{categories.length} sections · {totalItems} specification items · Last updated March 2026</p>
        </div>

        <div className="mb-8 print:mb-4">
          <div className="flex flex-wrap justify-center gap-2 print:gap-1">
            {categories.map((cat, idx) => (
              <a
                key={cat.id}
                href={`#${cat.id}`}
                className="px-3 py-1.5 rounded-full bg-background hover:bg-sky/5 transition-colors text-sm text-navy font-medium no-print"
              >
                <span className="text-sky font-bold mr-1">{idx + 1}.</span>
                {cat.title}
              </a>
            ))}
          </div>
        </div>

        <div className="border-t border-border-faint" />

        {categories.map((category, catIdx) => (
          <section key={category.id} id={category.id} className={`py-8 print:py-4 ${catIdx > 0 ? "spec-section border-t border-border-faint" : ""}`}>
            <div className="flex items-baseline gap-3 mb-6 print:mb-3">
              <span className="text-2xl font-black text-sky/20 print:text-xl">{String(catIdx + 1).padStart(2, "0")}</span>
              <h2 className="text-xl font-bold text-navy print:text-lg">{category.title}</h2>
            </div>

            <div className="space-y-4 print:space-y-3">
              {category.items.map((item, iIdx) => (
                <div
                  key={iIdx}
                  className="spec-card border border-border-faint rounded-lg p-4 print:p-3 hover:border-sky/30 transition-all print:border-border-subtle"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-sky/10 flex items-center justify-center flex-shrink-0 text-sky">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-navy mb-1.5 print:text-sm">{item.title}</h3>
                      <ul className="space-y-1">
                        {item.details.map((d, dIdx) => (
                          <li key={dIdx} className="text-sm text-foreground-secondary print:text-xs flex items-start gap-2">
                            <span className="text-sky mt-1.5 flex-shrink-0">•</span>
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
