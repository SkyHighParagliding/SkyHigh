# SkyHigh: Parallel Workstream Architecture

**Summary**: The SkyHigh platform decomposed into independent workstreams that can be developed, tested, and verified in parallel by multiple agents. Each workstream is self-contained with explicit dependencies and integration contracts.

**Last updated**: 2026-04-23

---

## Dependency Graph

```
FOUNDATION (Serial - must complete first)
├── Project Setup & Architecture
├── Database Schema
├── API Patterns & Error Handling
└── Environment & Secrets

TIER 1 - Independent Systems (Parallel - start after Foundation)
├── A1. Authentication & User Management
├── A2. Weather & Wind Intelligence
├── A3. Image & Media System
├── A4. Content Management System
└── A5. Community Features (Check-in, Walls, Directories)

TIER 2 - Single-Dependency Systems (Parallel - after Tier 1)
├── B1. Flying Sites Core (depends on: A1)
├── B2. AI Integration & Smart Tools (depends on: Foundation)
└── B3. External Integrations (depends on: A1)

TIER 3 - Multi-Dependency Systems (Parallel - after Tier 1 + Tier 2)
├── C1. XC Maps & Flight Tracking (depends on: B1, A2, A1)
└── C2. Retrieval & Real-Time Systems (depends on: C1, B1, A1)

TIER 4 - Integration Layer (Sequential after Tier 3)
├── D1. Admin Dashboard & Shared Patterns
└── D2. Home Page & Public UI

```

---

## Workstream Assignments (Recommended)

### Serial Phase (1 agent)
- **Foundation Team**: Project setup, database, API contracts

### Parallel Phase 1 (5 agents recommended)
- **Agent A1**: Authentication & User Management
- **Agent A2**: Weather & Wind Intelligence
- **Agent A3**: Image & Media System
- **Agent A4**: Content Management System
- **Agent A5**: Community Features

### Parallel Phase 2 (3 agents recommended)
- **Agent B1**: Flying Sites Core
- **Agent B2**: AI Integration & Smart Tools
- **Agent B3**: External Integrations

### Parallel Phase 3 (2 agents recommended)
- **Agent C1**: XC Maps & Flight Tracking
- **Agent C2**: Retrieval & Real-Time Systems

### Serial Phase 4 (1-2 agents)
- **Agent D1**: Admin Dashboard & Shared Patterns
- **Agent D2**: Home Page & Public UI

**Total typical deployment: 5 agents in parallel → 3 agents → 2 agents → final integration**

---

## Workstream Overview

| Workstream | Agent | Dependencies | Deliverables | Tests | LOE |
|-----------|-------|--------------|--------------|-------|-----|
| A1 - Auth | Agent A1 | Foundation | Login, roles, sessions | Auth flow, token expiry | 1 day |
| A2 - Weather | Agent A2 | Foundation, B1* | Live data, grids, caching | Data fetch, interpolation | 2 days |
| A3 - Images | Agent A3 | Foundation | Library, resizing, watermark | Upload, size check, R2 | 1.5 days |
| A4 - CMS | Agent A4 | Foundation, A3* | Pages, news, safety, procedures | Editor, markdown render | 2 days |
| A5 - Community | Agent A5 | Foundation, A1* | Check-in, walls, directory | Check-in flow, gallery | 1 day |
| B1 - Sites | Agent B1 | Foundation, A1 | Sites CRUD, scraping, seed | CRUD ops, seed load | 1.5 days |
| B2 - AI | Agent B2 | Foundation, B1* | Gemini setup, site gen, assistant | AI response, fallback | 1 day |
| B3 - Integrations | Agent B3 | Foundation, A1 | TidyHQ, Drive, satellites | Sync, polling, auth | 2 days |
| C1 - XC & Flight | Agent C1 | A1, A2, B1 | GPS tracking, maps, trails | Record, retrieve, export | 2.5 days |
| C2 - Retrieval | Agent C2 | C1, A1, B1 | Retrieval board, SSE, routing | Claim, navigate, update | 2 days |
| D1 - Admin | Agent D1 | All Tiers 1-3 | Dashboard, patterns, nav | Navigation, feature toggles | 2 days |
| D2 - Home & Public | Agent D2 | All Tiers 1-3 | Home, footer, responsive | Page load, responsive test | 1.5 days |

*Optional dependency (can work without, integrates better with)

---

## Contract Definitions

Each workstream produces **integration contracts** that other workstreams depend on:

### Foundation Contracts
- **Database schema**: All table definitions, field types, relationships
- **API error format**: `{ error, code, statusCode }`
- **Auth pattern**: Bearer token in Authorization header
- **Storage abstraction**: `saveFile(buffer, key, contentType) → publicUrl`

### A1 - Auth Contracts
- **Tables**: `admin_users`, `pilot_accounts`, `admin_sessions`
- **Routes**: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Context**: `AuthContext` exposes `user`, `token`, `isAuthenticated`, `login()`, `logout()`

### A2 - Weather Contracts
- **Tables**: `weather_observations`, `weather_forecasts`, `wind_grid_data`
- **Routes**: `GET /api/weather/:siteId`, `GET /api/weather/:siteId/wind-grid`
- **Hooks**: `useWeather(siteId)`, `useWindGrid(siteId, forecastHour)`
- **Format**: Wind speed (m/s), direction (degrees), temp (°C)

### A3 - Image Contracts
- **Tables**: `image_library`
- **Routes**: `POST /api/images/upload`, `POST /api/images/generate-sliders/:imageId`
- **Sizes**: hero (1920×1080), banner (1920×600), landscape-lg (1200×800), landscape-sm (800×533), portrait (600×900)
- **Storage**: All via `saveFile()` abstraction

### A4 - CMS Contracts
- **Tables**: `pages`, `news`, `safety_sections`, `procedures`
- **Routes**: `GET /api/pages/:slug`, `POST /api/news`, `PUT /api/pages/:slug`
- **Components**: `MarkdownRenderer`, `ContentImageToolbar`
- **Hooks**: `usePages()`, `useNews()`

### A5 - Community Contracts
- **Tables**: `checkins`, `contacts`, `image_submissions`
- **Routes**: `POST /api/checkins`, `GET /api/contacts/public/committee`, `POST /api/images/submit`
- **Components**: `CheckinWizard`, `PhotoWall`, `DirectoryCard`

### B1 - Sites Contracts
- **Tables**: `sites`, `external_site_listings`, `site_archives`
- **Routes**: `GET /api/sites`, `POST /api/sites`, `PUT /api/sites/:id`, `DELETE /api/sites/:id`
- **Seed data**: 70 sites in `scraped_sites.json` (used by B1, C1)
- **Hook**: `useSite(siteId)`, `useSites(filter)`

### B2 - AI Contracts
- **Routes**: `POST /api/ai/generate`, `POST /api/ai/enhance-image`, `GET /api/ai/models`
- **Fallback chain**: gemini-2.5-flash → gemini-2.5-pro → gemini-2.0-flash
- **Context available to**: sites, weather, forecasts, safety officers, documents

### B3 - Integration Contracts
- **Routes**: `POST /api/integrations/tidyhq/sync`, `GET /api/integrations/status`
- **Tables**: Contact sync via webhooks, satellite positions in flight breadcrumbs
- **Env vars**: `TIDYHQ_ACCESS_TOKEN`, Google Drive URL, satellite tracker credentials

### C1 - XC & Flight Contracts
- **Tables**: `flights`, `breadcrumbs`
- **Routes**: `POST /api/flights/start`, `POST /api/flights/:id/track`, `GET /api/flights/:id/trail`
- **Components**: `XCMap`, `FlightTrail`, `WindCompass`
- **Hooks**: `useFlightTracking()`, `useFlightHistory()`

### C2 - Retrieval Contracts
- **Tables**: `retrievals`, `map_messages`
- **Routes**: `POST /api/retrievals`, `POST /api/retrievals/:id/claim`, `GET /api/retrievals/sse`
- **SSE stream**: Real-time driver position, ETA, status
- **Components**: `RetrievalBoard`, `DriverMap`, `PilotPanel`

### D1 - Admin Dashboard Contracts
- **Routes**: All admin CRUD routes for all systems
- **Hooks**: `useAdminForm()`, `useAdminList()`
- **Components**: `AdminRoute`, `AdminLayout`, `NavCard`
- **Patterns**: Unsaved changes modal, save feedback (toast), loading states

### D2 - Home & Public Contracts
- **Components**: `Layout`, `Header`, `Footer`, `Navigation`
- **Routing**: All public routes (/, /sites, /news, /page/:slug, etc.)
- **Theme**: Active template from settings, CSS variables applied

---

## Workstream Isolation

**Golden Rule**: Each workstream must be **testable and deployable independently** (except Tier 4).

### Test Isolation
- A1 tests auth without needing sites
- A2 tests weather without needing flight tracking
- A3 tests image resizing without needing content management
- B1 loads seed sites and verifies CRUD without needing admin dashboard
- C1 records fake flights without needing the retrieval system

### API Isolation
- Each workstream's routes are independently testable
- Mock data fixtures in each workstream's test suite
- No database state required from other workstreams (except foreign key references)

### Component Isolation
- Shared components in `src/components/ui/` (Foundation provides these)
- Workstream-specific components in own directories
- All components accept `data` prop, no direct API calls from presentational components
- Data fetching via React Query hooks (defined in workstream)

---

## Verification Checklist Template

Each workstream provides a verification checklist:

```markdown
## Verification (Agent MUST complete these before handoff)

- [ ] npm run dev loads without errors
- [ ] All database tables created (check schema migrations)
- [ ] All API routes respond with correct shape
- [ ] All React components render (check Storybook if available)
- [ ] All tests pass: npm test -- [workstream]
- [ ] No TypeScript errors in workstream files
- [ ] Environment variables documented in README
- [ ] Seed data loads if applicable (npm run seed)
- [ ] Integration contracts satisfied (see Integration Contracts section)
- [ ] No hardcoded URLs/credentials
```

---

## Handoff Protocol

When a workstream agent completes, they produce:

1. **Codebase**: All source files committed
2. **Contracts**: Documentation of API routes, tables, hooks provided
3. **Tests**: Full test suite, all passing
4. **Seed data**: Any data needed for dependent workstreams (in JSON files)
5. **README**: Setup instructions specific to this workstream
6. **Blockers**: Any issues found in Foundation that prevent completion

Dependent agents **never** wait for "perfect" code—they wait for **contracts to be satisfied**.

---

## Parallelization Example

**Scenario**: All agents start after Foundation is complete (Day 2).

```
Day 2-3: Tier 1 agents work in parallel
  - A1 builds login/logout/session system
  - A2 fetches live weather, builds wind grids
  - A3 uploads images, generates 5 sizes, applies watermarks
  - A4 creates pages editor, news CRUD, safety sections
  - A5 builds check-in wizard, photo walls, directories

Day 4: Tier 1 agents finish, Tier 2 starts
  - B1 creates sites CRUD, imports seed data
  - B2 sets up Gemini, tests site generation
  - B3 syncs TidyHQ contacts, polls satellite trackers

  (Note: A1, A2, A3 agents can start writing integration tests for Tier 2)

Day 5: Tier 2 complete, Tier 3 starts
  - C1 records GPS flights, displays trails on map
  - C2 builds retrieval board, real-time driver tracking

Day 6-7: Tier 3 complete, Tier 4 starts
  - D1 wires up all admin pages, feature toggles
  - D2 builds home page, footer, responsive layout

Day 8: All agents converge on integration & polish
```

This schedule assumes 5 agents in parallel, each working ~1.5-2.5 days per workstream.

---

## Related Pages

- [[skyhigh-foundation]] — Project setup, database, API patterns
- [[skyhigh-workstream-a1-auth]] — Authentication & User Management
- [[skyhigh-workstream-a2-weather]] — Weather & Wind Intelligence
- [[skyhigh-workstream-a3-images]] — Image & Media System
- [[skyhigh-workstream-a4-cms]] — Content Management System
- [[skyhigh-workstream-a5-community]] — Community Features
- [[skyhigh-workstream-b1-sites]] — Flying Sites Core
- [[skyhigh-workstream-b2-ai]] — AI Integration & Smart Tools
- [[skyhigh-workstream-b3-integrations]] — External Integrations
- [[skyhigh-workstream-c1-xc-flight]] — XC Maps & Flight Tracking
- [[skyhigh-workstream-c2-retrieval]] — Retrieval & Real-Time Systems
- [[skyhigh-workstream-d1-admin]] — Admin Dashboard & Shared Patterns
- [[skyhigh-workstream-d2-home]] — Home Page & Public UI
