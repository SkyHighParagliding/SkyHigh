---
name: Decisions Log — 7 Architectural Decisions
description: Documented architectural choices with context, options considered, rationale, and reversibility
type: wiki
---

# Decisions Log — 7 Architectural Decisions

All major architectural decisions documented using the Context → Options → Chosen → Rationale → Reversibility template.

---

## DECISION-001: Dual Database Strategy (SQLite dev, PostgreSQL prod)

**Date:** 2026-04-01  
**Owner:** Jon Pamment  
**Status:** Locked (in production use)

### Context
SkyHigh needed a development database that requires zero setup (no Docker, no local Postgres) but scales to production without code changes. Early iterations were SQLite-only; scaling to Postgres meant rewriting queries.

### Options Considered
1. **SQLite only** — Single database for dev and prod. Problems: SQLite lacks row-level locking, limited concurrent writes, no managed backups.
2. **Postgres only** — Developers run local Postgres. Problems: Setup friction (Docker or manual install), slower iteration.
3. **Unified adapter** (chosen) — SQLite in dev, Postgres in prod; same codebase via abstraction layer.

### Chosen
**Unified adapter:** `server/db.ts` detects `DATABASE_URL` env var. If present (production), uses PostgreSQL. If missing (development), falls back to SQLite.

Both databases receive identical SQL with bound parameters; queries automatically translated:
- Postgres: `$1, $2, ...` syntax
- SQLite: `?, ?, ...` syntax

### Rationale
- **Dev experience:** New developers don't install anything; `npm run dev` works immediately.
- **Confidence:** Code tested against same queries in dev that run in production.
- **Reversibility:** Easy to migrate fully to Postgres (remove SQLite driver) or stay SQLite-only if prod stays small.
- **Cost:** SQLite in dev is free; PostgreSQL in prod is managed and scaled.

### Implementation
- `server/db.ts` exports `query()` function that routes to SQLite or Postgres based on env var.
- `server/pgDb.ts` implements Postgres-specific pooling and connection logic.
- No ORM (no Prisma, TypeORM, or Sequelize) — raw SQL in parameterized queries keeps codebase lightweight.

### Reversibility
**High.** If Postgres becomes unmaintainable, revert to SQLite-only by removing `pgDb.ts` and falling back always to SQLite. If SQLite becomes a bottleneck, force Postgres by removing SQLite fallback. Zero breaking changes needed.

---

## DECISION-002: Cloudflare R2 for Production Storage

**Date:** 2026-04-05  
**Owner:** Jon Pamment  
**Status:** Locked (in production use)

### Context
Replit has an ephemeral filesystem that vanishes on restart. All media (site photos, uploaded flights, hero images) must persist outside the container. Need S3-like storage without AWS bills.

### Options Considered
1. **AWS S3** — Industry standard, expensive egress fees ($0.09/GB).
2. **Google Cloud Storage** — Flexible, pricing similar to S3.
3. **Cloudflare R2** (chosen) — S3-compatible API, zero egress fees, cheaper storage.
4. **Local disk + rsync to external drive** — Fraught with operational complexity.

### Chosen
**Cloudflare R2:** Media (images, GPX files, etc.) stored in R2 bucket with S3-compatible API.

In dev, images stored to `/uploads/` folder (local disk, good enough).  
In prod, `storage.ts` points to R2 bucket via credentials from `.env`.

### Rationale
- **Cost:** No egress fees (S3 charges per GB downloaded; R2 doesn't).
- **Compatibility:** S3 API compatibility means no vendor lock-in; code works unchanged with real S3 if needed.
- **Simplicity:** Single abstraction (`storage.ts`) hides R2 vs. local disk decision.
- **Reliability:** Managed storage with automatic backups and CDN integration.

### Implementation
- `server/storage.ts` exports `upload()` and `download()` functions.
- In dev, functions write to `/uploads/`. In prod, functions call R2 API.
- R2 bucket configured for public read (images visible on frontend).

### Reversibility
**Very high.** R2 API is S3-compatible; can swap implementations with zero code changes. Could migrate to S3, GCS, or local NAS tomorrow.

---

## DECISION-003: ECMWF Grid Caching (Pre-fetch, Daily Cycle, 7-Day Rolling Storage)

**Date:** 2026-04-10  
**Owner:** Jon Pamment  
**Status:** Locked (in production use)

### Context
Wind map needs real-time wind vectors for continental Australia. ECMWF API provides high-resolution grids but is expensive at scale (1 call per wind map load = thousands of dollars/month). Need to cache grids without stale data older than 7 days.

### Options Considered
1. **No caching** — Fetch from API on every wind map load. Problems: cost, latency (ECMWF API slow).
2. **Static cache** — Fetch once a week, serve same data. Problems: stale after 7 days; no daily refresh.
3. **Rolling 7-day cache** (chosen) — Fetch daily at fixed times; keep 7-day window in database.

### Chosen
**Daily pre-fetch with 7-day rolling cleanup:**
- Victoria grid fetched daily at **5:00am Melbourne time**
- Wide grid fetched daily at **5:13am Melbourne time**
- Data stored in `wind_grid_data` table with fetch timestamp
- Cleanup runs after each fetch: delete any grids > 7 days old
- Wind map interpolates from cached data at request time (no API call during user interaction)

### Rationale
- **Cost:** 2 API calls/day vs. 1000+ if fetching per user request.
- **Freshness:** Daily updates keep data current within 24 hours.
- **Rollback:** 7-day window means we can fall back to yesterday's data if today's fetch fails.
- **Offline:** If network down briefly, 7-day buffer absorbs disruption; still show stale data rather than nothing.

### Implementation
- `server/victoriaGrid.ts` handles fetch, caching, and cleanup.
- Scheduled job in `weather.ts` triggers at 5:00/5:13am Melbourne time.
- Startup checks if last fetch > 12 hours ago; if so, triggers fresh fetch.

### Reversibility
**High.** Can change fetch times, cache duration (7 → 14 days), or frequency (daily → every 6 hours) with config changes. Can disable caching (always fetch fresh) by commenting out storage code.

---

## DECISION-004: Canvas + D3 Wind Map Rendering (Not SVG or WebGL)

**Date:** 2026-04-15  
**Owner:** Jon Pamment  
**Status:** Locked (in production use)

### Context
Wind map displays thousands of wind vectors (arrows) across continental Australia. Options: SVG (scalable but slow at scale), WebGL (fast but complex), Canvas (fast and simple).

### Options Considered
1. **SVG** — Scalable, accessibility friendly. Problems: DOM bloat with 10000+ elements, poor performance at zoom.
2. **WebGL** — GPU-accelerated, extremely fast. Problems: steep learning curve, overkill for this use case, harder to debug.
3. **Canvas + D3** (chosen) — Single canvas element, D3 for zoom/pan math, custom render loop.

### Chosen
**Canvas-based rendering:**
- Single `<canvas>` element, redrawn on zoom/pan/update
- D3.js handles zoom transform math (translate, scale)
- Custom particle animation system for wind vectors
- Bilinear interpolation computes wind at any lat/lon from cached grid

### Rationale
- **Performance:** Thousands of vectors rendered in <50ms on modern hardware.
- **Simplicity:** No shader language, no GPU API complexity.
- **Debugging:** Canvas is just pixels; easier to inspect than WebGL.
- **Accessibility:** D3 zoom math is transparent; can add debugging overlays easily.
- **Dependencies:** D3 is lightweight and math-focused (not a full visualization framework).

### Implementation
- `src/components/windmap/WindMap.tsx` manages canvas and render loop
- `src/components/windmap/windmapUtils.ts` handles bilinear interpolation and particle animation
- `src/components/windmap/handleZoom.ts` maps D3 zoom events to canvas transforms

### Reversibility
**Moderate.** Canvas + D3 is fairly standard; swapping to SVG or WebGL would require rewriting render logic but not changing data structures. Bilinear interpolation logic is reusable in any rendering backend.

---

## DECISION-005: Google Gemini for All AI Features

**Date:** 2026-04-12  
**Owner:** Jon Pamment  
**Status:** Locked (in production use)

### Context
SkyHigh uses AI for site scraping (fetch and summarize external guides), image enhancement (captions), and content moderation. Need a provider that:
- Supports images + text (multimodal)
- Allows fallback to different models
- Has generous free tier for development
- Integrates easily

### Options Considered
1. **OpenAI GPT-4** — Powerful, expensive, image support. Problems: $0.03–0.06 per request, no free tier.
2. **Claude (Anthropic)** — Excellent, but similar cost.
3. **Google Gemini** (chosen) — Multimodal, configurable, free tier (1000 req/month).
4. **Open-source (Llama, Mistral)** — Free but requires self-hosting GPU.

### Chosen
**Google Gemini API:**
- Pro model for production features (site scraping, image captions)
- Flash model for rapid iteration (moderation, drafts)
- Free tier for dev (1000 queries/month)
- Fallback logic: if Gemini fails, use empty/safe default (don't hard-fail)

### Rationale
- **Cost:** Free tier covers all dev/testing. Production costs ~$0.001 per request, acceptable for club use.
- **Multimodal:** Handles images + text in single API call (scraping + image caption).
- **Flexibility:** Can configure model per task (expensive for scraping, cheap for moderation).
- **Fallback chain:** If Gemini down, gracefully degrade to stubs.

### Implementation
- `server/services/real/geminiService.ts` calls Gemini API
- `server/services/demo/geminiService.ts` stubs responses for testing
- All AI features wrapped in error handlers that fallback to safe defaults

### Reversibility
**High.** Gemini calls are isolated in service layer. Can swap to OpenAI, Claude, or open-source models by implementing `server/services/real/openaiService.ts` or similar and routing through abstraction.

---

## DECISION-006: Railway Hosting with Managed PostgreSQL (Replit → Railway Migration)

**Date:** 2026-04-08 (initial); **Updated:** 2026-05-13 (migration to Railway)  
**Owner:** Jon Pamment  
**Status:** 🚧 **Migration in progress** (Replit → Railway)

### Context
SkyHigh is operated by an Australian paragliding club committee. Ops overhead must be minimal — volunteers managing it, not full-time DevOps engineers. Replit provided simplicity but lacks production-grade infrastructure. Migration to Railway planned to improve reliability and give direct control over PostgreSQL.

### Options Considered (Original — 2026-04-08)
1. **AWS / GCP / Azure** — Full control, complex ops, expensive.
2. **Traditional VPS (DigitalOcean, Linode)** — Simple but still requires SSH, updates, monitoring.
3. **Vercel / Netlify** — Frontend-first, hard to run Express backend.
4. **Replit** (initially chosen) — Full-stack Node.js hosting, GitHub auto-deploy, managed PostgreSQL option.

### Chosen (Current — 2026-05-13)
**Railway with managed PostgreSQL:**
- Auto-deploy on push to GitHub (via Railway build pipeline)
- Managed PostgreSQL database (no SQLite fallback needed in production)
- Environment variables and secrets management
- Built-in monitoring, logging, and metrics
- Docker-friendly deployment (uses Dockerfile or auto-detects Node.js)

### Rationale (Updated)
- **Reliability:** Railway provides production-grade infrastructure with uptime guarantees and auto-scaling.
- **Database:** Managed PostgreSQL removes need for SQLite fallback; direct control over prod database.
- **Ops overhead:** Minimal — GitHub integration handles CI/CD. Committee can manage via Railway dashboard.
- **Cost:** Transparent, predictable pricing; estimated $10–50/month depending on traffic (comparable to Replit).
- **Simplicity:** No SSH or Docker complexity; Railway abstracts deployment details while allowing fine-grained control.
- **Debugging:** Railway console and logs accessible from web; database backups built-in.

### Implementation (Migration Path)
1. **Phase 1 (current):** Set up Railway project with PostgreSQL database.
2. **Phase 2:** Migrate existing Replit data to Railway PostgreSQL.
3. **Phase 3:** Update `server/db.ts` to remove SQLite fallback (PostgreSQL only in production).
4. **Phase 4:** Point DNS to Railway.
5. **Phase 5:** Decommission Replit.

**Current production status:** 🚧 **Still on Replit** — Railway migration in progress.

### Reversibility
**Moderate to High.** Railway uses standard Docker/Node.js deployment, no vendor lock-in. Code is portable to Heroku, DigitalOcean App Platform, or Fly.io. Database is PostgreSQL (standard). Switching hosts requires only environment variable updates and DNS change.

---

## Migration Notes (2026-05-13)
- **Why migrate from Replit?** Replit's pricing and infrastructure are geared toward education; production use benefits from managed hosting with better guarantees.
- **Why Railway?** Simple, developer-friendly, good pricing, managed Postgres, GitHub integration.
- **Impact on code:** Minimal. `server/db.ts` adapts based on `DATABASE_URL`. In production, always PostgreSQL (no SQLite fallback). Dev still uses SQLite.

---

## DECISION-007: Cache Pagination Bypass

**Date:** 2026-05-04  
**Owner:** Jon Pamment  
**Status:** Locked (in production use)

### Context
Public sites list endpoint (`GET /api/sites?public=true`) caches results for performance. Cache was keyed only by `isPublic=true`, so when `useSites` hook requested `?limit=500` (to show all sites), cache returned the default 50-site result, making 6+ sites disappear from the list.

### Options Considered
1. **Cache by (isPublic, limit, offset)** — Separate cache entries for each limit. Problems: cache fragmentation, memory overhead, complex invalidation.
2. **No caching** — Always fetch fresh. Problems: performance regression, higher database load.
3. **Bypass if custom pagination params present** (chosen) — Cache only for default `?limit=50&offset=0`. If `?limit` or `?offset` in request, skip cache.

### Chosen
**Bypass cache for custom pagination:**
```typescript
// server/routes/sites/index.ts
if (req.query.limit || req.query.offset) {
  // Custom pagination: always fetch fresh, bypass cache
  return db.query("SELECT * FROM sites WHERE public=true LIMIT ? OFFSET ?", ...);
}
// Default pagination: use cache (keyed by isPublic only)
return cachedSites[isPublic];
```

### Rationale
- **Simplicity:** No complex cache key logic; cache is only used for common case (no pagination params).
- **Correctness:** Custom pagination always reflects actual request, never stale.
- **Performance:** 90% of requests use default pagination and hit cache. Rest hit database (acceptable).
- **No fragmentation:** Cache stays small; no explosion of cache entries.

### Implementation
- Check in `server/routes/sites/index.ts` before returning cached result
- No changes to cache storage or invalidation logic
- Database query performance acceptable for custom pagination requests

### Reversibility
**Very high.** Can switch to multi-key caching by keying cache by `(isPublic, limit, offset)` tuple; code is additive, no breaking changes. Or disable caching entirely by removing cache lookup.

---

## Summary Table

| # | Title | Key Outcome | Date | Status |
|---|---|---|---|---|
| 001 | Dual DB strategy | SQLite dev / PostgreSQL prod via unified adapter | 2026-04-01 | ✅ Locked |
| 002 | Cloudflare R2 | S3-compatible, zero egress fees, transparent abstraction | 2026-04-05 | ✅ Locked |
| 003 | ECMWF grid caching | Continental pre-cache, daily fetch, 7-day rolling DB storage | 2026-04-10 | ✅ Locked |
| 004 | Canvas + D3 wind map | Canvas rendering + D3 zoom math only (not SVG/WebGL) | 2026-04-15 | ✅ Locked |
| 005 | Gemini for AI | Multi-modal, configurable model chain, generous free tier | 2026-04-12 | ✅ Locked |
| 006 | Railway hosting (Replit → migration) | Managed PostgreSQL, auto-deploy, better prod infrastructure | 2026-04-08 (updated 2026-05-13) | 🚧 In Progress |
| 007 | Cache pagination bypass | Bypass cache if non-default limit param present | 2026-05-04 | ✅ Locked |

---

Last updated: 2026-05-13
