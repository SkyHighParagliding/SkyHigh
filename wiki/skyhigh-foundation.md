# SkyHigh Foundation: Read-Once Reference

**Summary**: Complete architectural foundation for SkyHigh. Read this ONCE at the start, then reference specific sections as needed during implementation.

**Last updated**: 2026-04-23

---

## Project Identity

**SkyHigh** is a white-label club management platform for Australian paragliding and hang gliding clubs.

**Purpose**: Consolidate fragmented club infrastructure (weather, site guides, safety, content, pilot tracking) into a single hosted platform that any club can customize via admin UI without code changes.

**Target**: Club administrators, active pilots, visiting pilots, duty pilots, retrieval drivers, safety officers, general public.

**Success**: Platform is deployed, fully functional, every feature works as specified in PRD, all tests pass.

---

## Tech Stack (Non-Negotiable)

**Frontend**
- React 19.0.0 with react-dom 19.0.0
- Vite 6.2.3 (build tool & dev server)
- TypeScript ~5.8.2 (strict mode, ES2022 target)
- Tailwind CSS v4.1.14 (@theme directive, no tailwind.config.js)
- React Router DOM v7.13.1 (client-side routing)

**Backend**
- Node.js v20.20.0
- Express.js v4.21.2
- TypeScript (tsx v4.21.0 for execution)
- PostgreSQL 16 via pg (node-postgres) v8.20.0

**External Services**
- Google Gemini API (GEMINI_API_KEY, primary + fallback chain)
- Weather Underground API (WU_API_KEY)
- Open-Meteo ECMWF (free, no key)
- Cloudflare R2 (image storage)
- TidyHQ API (optional, membership management)
- Google Drive API (optional, document management)

**Key Libraries**
- React Query (@tanstack/react-query) — data fetching & caching
- Framer Motion — animations
- Leaflet + react-leaflet — interactive maps
- D3 + d3-tile — wind particle animation
- Sharp — image processing
- bcryptjs — password hashing
- zod — validation (client & server)
- express-rate-limit — API throttling

---

## Database: PostgreSQL 16

**Setup**: PostgreSQL is provisioned by Railway. DATABASE_URL environment variable is injected automatically.

**Connection**: pg driver (node-postgres) v8.20.0 with connection pooling
- Max 20 connections
- 30-second idle timeout
- 5-second connection timeout
- AsyncLocalStorage-based transaction context for nested calls

**Migrations**: 
- Live in `server/pg_migrations/` as 8 numbered SQL files (001_init.sql through 008_auth.sql)
- Tracked in `schema_migrations` table
- Run automatically on server startup
- Each migration runs exactly once
- Never modify schema directly—always add a migration

**SQLite Compatibility Layer**: server/pgDb.ts auto-translates SQLite datetime functions to PostgreSQL equivalents:
- `datetime('now')` → `NOW()`
- `datetime('now', 'start of day')` → `DATE(NOW())`
- `datetime('now', '-N hours')` → `NOW() - INTERVAL 'N hours'`

**Transaction Support**: AsyncLocalStorage context propagates PG client through nested function calls, enabling proper transaction isolation

**Integrity**: Server validates connectivity on startup and exits if database is unreachable (production-safe behavior)

---

## Database Schema (All Tables)

### Core Tables

**admin_users** (authentication)
- id (PK), email (UNIQUE), password (bcrypt), name, createdAt

**pilot_accounts** (public flight tracking)
- id (PK), email (UNIQUE), password (bcrypt), name, phone, garminMapshare, spotFeedId, zoleoImei

**admin_sessions** (session tokens)
- token (PK), userId (FK), createdAt, expiresAt (24h TTL)

**pilot_sessions** (pilot tokens)
- token (PK), pilotId (FK), createdAt, expiresAt (30d TTL)

**settings** (key-value config)
- key (PK TEXT), value (TEXT)
- Examples: clubName, clubTagline, clubPrimaryColor, clubLogo*, templateId, photoSliderEnabled, etc.

**contacts** (committee, safety officers, contractors, Parks Vic)
- id (PK), name, surname, email, phone, notes, roles (isAdmin, isCommittee, isSafetyCommittee, isContractor, isParksVic), display flags, position

**sites** (flying sites, 37+ fields)
- id (PK), name, type (coastal/inland), status (open/closed), lat, lon, windDir, windSpeed, pgRating, hgRating, launchHeight, launchHeightHigh, launchHeight2, landingHeight2, description, hazards, navigateTo, siteContact, siteContactPhone, useLiveWeather, liveStationId, liveStationIdAlt, weatherStationLink, weatherGaugeUrl, what3words, what3wordsAlt, tideStationId, isTidal, isXCSite, createdAt, updatedAt

### Content Tables

**pages** (CMS pages)
- slug (PK), title, content (TEXT), heroImage, sortOrder, isVisible, createdAt, updatedAt

**news** (news articles)
- id (PK), title, content (TEXT), heroImage, date, author, isPublished, createdAt

**safety_sections** (safety & rules pages)
- id (PK), type (emergency/rules/custom), title, content (TEXT), isVisible, sortOrder, link

**procedures** (procedures manual)
- id (PK), title, icon, steps (JSON array), sortOrder

**image_library** (all uploaded images)
- id (PK), filename, category (hero/banner/landscape-lg/landscape-sm/portrait), isInSlider, createdAt

**page_attachments** (files attached to pages)
- id (PK), pageSlug (FK), filename, originalName, mimeType, uploadedAt

### Flight & Retrieval Tables

**flights** (recorded flight sessions)
- id (PK), pilotId (FK), siteId (FK), status (active/landed), startedAt, endedAt, maxAltitude, maxSpeed, totalDistance, createdAt

**breadcrumbs** (GPS points)
- id (PK), flightId (FK), timestamp, lat, lon, altitude, speed, verticalSpeed

**retrievals** (retrieval board)
- id (PK), pilotId (FK), driverId (FK), status (awaiting/claimed/active/completed), pilotLat, pilotLon, driverLat, driverLon, etaMinutes, createdAt

**map_messages** (pilot-to-pilot messages)
- id (PK), senderPilotId (FK), recipientPilotId (FK), message (TEXT), createdAt, expiresAt (24h)

### Weather Tables

**weather_observations** (live station data)
- siteId + timestamp (PK), windSpeed, windGust, direction, temperature, humidity, dewPoint, stationName

**weather_forecasts** (ECMWF forecasts)
- siteId + forecastHour (PK), temperature, windSpeed, windDirection, icon, forecastJson (JSON)

**wind_grid_data** (interpolated wind field)
- siteId + timestamp (PK), gridJson (JSON containing u/v wind vectors)

**extended_forecasts** (7-day extended grid)
- id (PK), forecastDate, gridJson (JSON)

### Admin Tables

**page_views** (analytics)
- path (PK), viewCount, lastViewed

**checkins** (pilot check-in events)
- id (PK), siteId (FK), pilotName, timestamp

**image_submissions** (community photo uploads)
- id (PK), uploadedFilename, status (pending/approved/rejected), photographerCredit, submittedAt

**external_site_listings** (scraped URLs)
- id (PK), name, url, state, region, lastScrapeDate

**site_archives** (version snapshots)
- siteguideVersion (PK), archivedAt, siteCount, siteDataJson (JSON)

**schema_migrations** (tracks applied migrations)
- version (PK), appliedAt

---

## File Structure

```
C:\users\user\Claude_LLM_Wiki\[project-folder]\
├── src/                          # Frontend (React)
│   ├── App.tsx                   # Root router
│   ├── index.css                 # Tailwind v4 with @theme directives
│   ├── pages/                    # Page components (public + admin)
│   │   ├── Home.tsx
│   │   ├── admin/
│   │   │   ├── AdminDashboard.tsx
│   │   │   ├── AdminSites.tsx
│   │   │   └── [AdminXxxx.tsx...]
│   │   └── [Sites.tsx, Safety.tsx, etc.]
│   ├── components/
│   │   ├── ui/                   # Shadcn/radix primitives (badge, button, input, etc.)
│   │   ├── [WorkstreamFeatures]/ # Feature-specific components (WeatherCard, CheckinWizard, etc.)
│   │   └── shared/               # Reusable (Layout, Navigation, Footer, etc.)
│   ├── hooks/                    # React hooks (useWeather, useAdminForm, etc.)
│   ├── contexts/                 # React Context (AuthContext, SettingsContext, TemplateContext)
│   ├── lib/                      # Utilities (urlHelpers, formatters, etc.)
│   └── templates/                # Theme system (registry.ts, CSS tokens)
├── server/                       # Backend (Express + TypeScript)
│   ├── server.ts                 # Express app entry point
│   ├── db.ts                     # Database init + migration runner
│   ├── routes/                   # Route handlers (sites.ts, auth.ts, weather.ts, etc.)
│   ├── utils/                    # Server utilities (weather.ts, aiModels.ts, storage.ts, etc.)
│   ├── middleware/               # Express middleware (auth.ts, errorHandler.ts)
│   └── migrations/               # SQL migration files (001_init.sql, etc.)
├── public/                       # Static files (manifest.json, favicon, etc.)
├── sites.db                      # SQLite database (NEVER commit)
├── db_backups/                   # Auto-backups of database
├── scraped_sites.json            # Seed data (70 sites)
├── seed_*.json                   # Seed data (contacts, news, pages, etc.)
├── package.json                  # Dependencies + scripts
├── vite.config.ts                # Vite configuration (proxy rules, plugins)
├── tsconfig.json                 # TypeScript config (strict mode)
└── .env.local                    # Environment secrets (NEVER commit)
```

**Naming Convention**:
- Files: kebab-case (admin-sites.tsx, use-admin-form.ts)
- Components: PascalCase
- Hooks: camelCase with `use` prefix
- Routes: kebab-case paths

---

## API Patterns

### All Routes Follow This Contract

```
Request:
{
  method: GET | POST | PUT | DELETE,
  path: /api/[resource]/[id]?[query],
  headers: { Authorization: "Bearer [token]" },
  body?: JSON
}

Response (Success):
{
  statusCode: 200 | 201,
  data: { ... }
}

Response (Error):
{
  statusCode: 400 | 401 | 404 | 500,
  error: "Human-readable message",
  code: "MACHINE_CODE" (optional, for specific errors)
}
```

### Authentication

- **Admin routes**: Require `Authorization: Bearer [admin_token]` header
- **Pilot routes**: Require `Authorization: Bearer [pilot_token]` header
- **Public routes**: No auth required
- **Middleware**: `requireAuth` middleware in server/middleware/auth.ts checks token validity

### Validation

- **Server-side**: ALL POST/PUT routes validate with Zod schemas
- **Client-side**: React Hook Form for UX, never trust client validation for security
- **Format**: `import { z } from "zod"; const CreateSiteSchema = z.object({ ... })`

### Error Handling

```typescript
// Server pattern
try {
  // logic
} catch (err) {
  return res.status(500).json({
    statusCode: 500,
    error: "Internal server error",
    code: "INTERNAL_ERROR"
  });
}

// Client pattern
const { mutate, isPending, error } = useMutation({
  mutationFn: async (data) => {
    const res = await fetch('/api/sites', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  onError: (error) => toast.error(error.message),
  onSuccess: () => { toast.success("Created!"); queryClient.invalidateQueries(...); }
});
```

### Rate Limiting

- Auth endpoints: 5 attempts per 15 minutes per IP
- Public API: 10 requests per minute per IP
- Admin API: 100 requests per minute (authenticated)

---

## Branding & Theming System (White-Label)

**Core Principle**: Every color, logo, and text label comes from the `settings` table. Zero hard-coded club names.

### CSS Variable System

In `src/index.css`:
```css
@theme {
  --color-navy: #1a2b3c;
  --color-sky: #00a8e8;
  --color-orange: #ff6b35;
  --color-sand: #f4f1ea;
  --tmpl-header-bg: var(--color-navy);
  --tmpl-accent: var(--color-sky);
  --tmpl-footer-bg: var(--color-navy);
}
```

### Template Registry

In `src/templates/registry.ts`:
```typescript
export const templates = {
  'classic': {
    name: 'Classic',
    tokens: {
      headerBg: 'var(--color-navy)',
      accent: 'var(--color-sky)',
      footerBg: 'var(--color-navy)',
      logoMode: 'dark'
    }
  },
  'wonderful-white': {
    name: 'Wonderful White',
    tokens: { ... }
  }
};
```

### Dynamic Brand Application

In `src/contexts/TemplateContext.tsx`:
```typescript
export function TemplateProvider({ children }) {
  const [activeTemplate, setActiveTemplate] = useState(settings.templateId);
  
  useEffect(() => {
    const template = templates[activeTemplate];
    Object.entries(template.tokens).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--tmpl-${key}`, value);
    });
  }, [activeTemplate]);
  
  return <TemplateContext.Provider value={{ ... }}>{children}</TemplateContext.Provider>;
}
```

### What Gets Branded

- **Text**: `clubName`, `clubTagline` from settings
- **Colors**: Primary color from `clubPrimaryColor` setting
- **Logos**: Light/dark variants stored in `image_library`, resolved at runtime
- **Template**: Hero section, header/footer variants, form styling

**Golden Rule**: If you hardcoded it, remove it and move it to settings.

---

## Environment Variables

Required (.env.local):
```
GEMINI_API_KEY=sk-...
WU_API_KEY=weather-underground-key
NODE_ENV=development
LOG_LEVEL=debug
```

Optional:
```
USER_GEMINI_API_KEY=sk-... (overrides primary)
TIDYHQ_ACCESS_TOKEN=tidyhq-token
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=skyhigh
R2_PUBLIC_URL=https://images.example.com
```

**Never commit secrets**. Use `.env.local` and add to `.gitignore`.

---

## Image Storage: Cloudflare R2 or Local

### Storage Abstraction (server/storage.ts)

All image operations use this module:
```typescript
export async function saveFile(buffer: Buffer, key: string, contentType: string): Promise<string>
export async function readFile(urlOrPath: string): Promise<Buffer>
export async function deleteFile(urlOrPath: string): Promise<void>
export async function fileExists(urlOrPath: string): Promise<boolean>
export function keyFromUrl(publicUrl: string): string
```

### Behavior

- **If R2 env vars set**: Images stored in Cloudflare R2 (production)
- **If R2 env vars absent**: Images stored in `/uploads/` directory (development)
- **All routes use abstraction**: Routes never directly reference R2 or filesystem
- **URLs are public**: `https://images.example.com/sites/123.jpg` or `http://localhost:5000/uploads/sites/123.jpg`

### Image Processing (Sharp)

All uploaded images processed in-memory:
```typescript
const resized = await sharp(buffer)
  .resize(1920, 1080, { fit: 'cover', position: 'center' })
  .jpeg({ quality: 85 })
  .toBuffer();

const public Url = await saveFile(resized, `sites/${siteId}.jpg`, 'image/jpeg');
```

No temp files on disk. Watermarks applied via SVG compositing.

---

## Authentication System

### Admin Auth Flow

1. User submits email + password to `POST /api/auth/login`
2. Server: hash password with bcrypt, compare to stored hash
3. If match: generate token via `crypto.randomBytes(32)`, store in `admin_sessions` table with 24h expiry
4. Return token to client
5. Client: store token in localStorage as `adminToken`
6. All admin routes: check Authorization header for valid token
7. Session expires: client redirects to `/admin/login`

### Pilot Auth Flow

Same as admin but:
- Stored in `pilot_sessions` table, 30-day TTL
- Separate token storage as `pilotToken`
- Public routes accept pilot token (no admin privileges)

### Password Reset

1. User requests reset: `POST /api/auth/request-password-reset` with email
2. Server: generate token, send email with reset link (production only)
3. User clicks link, submits new password: `POST /api/auth/reset-password` with token + password
4. Server: validate token expiry (15 min), update password hash

---

## API Data Fetching Pattern (React Query)

All data fetching uses React Query:

```typescript
// Custom hook
export function useSites() {
  return useQuery({
    queryKey: ['sites'],
    queryFn: async () => {
      const res = await fetch('/api/sites');
      if (!res.ok) throw new Error('Failed to fetch sites');
      return res.json();
    },
    staleTime: 5 * 60 * 1000 // 5 min cache
  });
}

// In component
export function SitesPage() {
  const { data: sites, isLoading, error } = useSites();
  
  if (isLoading) return <Skeleton />;
  if (error) return <Error message={error.message} />;
  return <SitesList sites={sites} />;
}
```

**Why**: Automatic caching, refetching, background updates, no manual state management.

---

## Server-Side Caching

Weather data, wind grids, and API responses cached in-memory:

```typescript
const cache = new Map<string, { data: any; expiresAt: number }>();

export function getFromCache(key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache(key: string, data: any, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}
```

TTLs:
- Live weather: 15-30 min
- Wind grids: 1 hour
- Extended forecasts: 24 hours
- Hospital lookups: 48 hours

---

## Testing Strategy

Each workstream includes:
- **Unit tests** for utilities (formatters, validators)
- **Integration tests** for API routes (create, read, update, delete)
- **Component tests** for UI (render, interactions)
- **E2E tests** optional (for critical flows like flight tracking)

Run: `npm test` (all tests), `npm test -- [workstream]` (single workstream)

---

## Deployment & Local Development

### Local Development

```bash
npm install
npm run dev        # Vite + Express on ports 5000 + 3001
npm run seed       # Load seed data
npm test           # Run tests
```

### Production Deployment (Railway)

```bash
npm run build      # Vite + esbuild
NODE_ENV=production node dist/server.mjs
```

**Environment**: Set all secrets in Railway environment variables, never in code.

---

## Scheduled Jobs

Background tasks run via cron in `server/utils/scheduledJobs.ts`:

- **Weather fetch**: Every 15-30 min during flying hours (7 AM - 8 PM Melbourne time)
- **Extended forecast**: Daily at ~5:30 AM Melbourne time
- **Siteguide version check**: Daily at 5 AM Melbourne time (triggers auto-import if changed)
- **Satellite tracker polling**: Every 2 min when pilots in retrieval state
- **Session cleanup**: Hourly (delete expired admin_sessions, pilot_sessions)

All times in Melbourne timezone (AEDT/AEST).

---

## No Code Beyond This Foundation

All 12 workstreams reference this document. Nothing else is foundational. Everything else is feature-specific and belongs in workstream documents.

---

## Related Pages

- [[skyhigh-parallel-workstreams]] — Workstream overview, dependency graph, parallelization strategy
