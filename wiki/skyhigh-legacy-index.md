# SkyHigh Platform: Complete Build Wiki

**Summary**: A complete, agent-optimized wiki for rebuilding the SkyHigh paragliding club management platform from scratch using parallel development workstreams. Designed for 5-12 Claude agents working independently and simultaneously.

**Purpose**: This wiki enables multiple Claude Code agents to independently develop, test, and verify 12 major system components in parallel, then integrate them into a production-ready platform.

**Last updated**: 2026-04-23

---

## Quick Start for Agents

### First Time Here?

1. **Read [[skyhigh-parallel-workstreams]]** (5 min) — Understand parallelization, dependency graph, workstreams
2. **Read [[skyhigh-foundation]]** (15 min) — Tech stack, database schema, API patterns, authentication (read once, reference often)
3. **Read [[skyhigh-workstream-template]]** (5 min) — Understand structure of workstream documents
4. **Jump to your assigned workstream** (see Workstreams section below)

### Already Know the Project?

Go straight to your workstream page (e.g., [[skyhigh-workstream-a1-auth]]).

---

## Core Architecture Documents

**Read all of these first. They're foundational and won't change.**

- **[[skyhigh-parallel-workstreams]]** — Dependency graph, 12 workstreams, parallelization schedule, contract definitions, workstream assignments
- **[[skyhigh-foundation]]** — Complete architectural reference (tech stack, database all 30+ tables, API patterns, auth system, branding, theming, environment setup)
- **[[skyhigh-workstream-template]]** — Template structure that every workstream follows (so you know what to expect)

---

## Workstreams by Tier

### Foundation (Serial — Complete First)

**Status**: ⏳ Pending  
**Agent**: TBD  
**Estimated LOE**: 1 day

Core setup, database schema, API patterns, branding system.

### Tier 1: Independent Systems (Parallel — Start After Foundation)

**Recommended**: 5 agents working simultaneously

1. **[[skyhigh-workstream-a1-auth]]** — Authentication & User Management  
   Admin + pilot auth, sessions, contacts, roles, password reset

2. **[[skyhigh-workstream-a2-weather]]** — Weather & Wind Intelligence  
   Live weather scrapers, wind grids, 7-day forecasts, animated maps

3. **[[skyhigh-workstream-a3-images]]** — Image & Media System  
   Image library, multi-size generation, watermarking, community submissions

4. **[[skyhigh-workstream-a4-cms]]** — Content Management System  
   Pages, news, safety sections, procedures, file attachments

5. **[[skyhigh-workstream-a5-community]]** — Community Features  
   Check-in system, photo walls, business directory, sponsors

### Tier 2: Single-Dependency Systems (Parallel — Start After Tier 1)

**Recommended**: 3 agents working simultaneously

1. **[[skyhigh-workstream-b1-sites]]** — Flying Sites Core  
   Sites CRUD, scraping/import, public directory, seed data (70 sites)

2. **[[skyhigh-workstream-b2-ai]]** — AI Integration & Smart Tools  
   Gemini setup, fallback chains, site generator, smart assistant

3. **[[skyhigh-workstream-b3-integrations]]** — External Integrations  
   TidyHQ sync, Google Drive, satellite tracker polling

### Tier 3: Multi-Dependency Systems (Parallel — Start After Tier 1 + Tier 2)

**Recommended**: 2 agents working simultaneously

1. **[[skyhigh-workstream-c1-xc-flight]]** — XC Maps & Flight Tracking  
   GPS tracking, flight trails, interactive maps, history export

2. **[[skyhigh-workstream-c2-retrieval]]** — Retrieval & Real-Time Systems  
   Retrieval board, driver claims, real-time updates via SSE, messaging

### Tier 4: Integration Layer (Sequential — Start After Tier 3)

**Recommended**: 1-2 agents

1. **[[skyhigh-workstream-d1-admin]]** — Admin Dashboard & Shared Patterns  
   Admin dashboard, navigation, reusable hooks, feature toggles

2. **[[skyhigh-workstream-d2-home]]** — Home Page & Public UI  
   Home page, navigation shell, footer, responsive layout, theme adaptation

---

## Reference & Support

**Use these to look up patterns, find components, understand data flows**

- **[[skyhigh-api-routes-registry]]** — All 50+ API endpoints (grouped by workstream, with full specs)
- **[[skyhigh-component-registry]]** — All React components (names, props, where they live)
- **[[skyhigh-database-mutations]]** — Which migration adds/modifies which tables
- **[[skyhigh-common-patterns]]** — Reusable hooks, utilities, error handlers (copy these across workstreams)
- **[[skyhigh-troubleshooting]]** — Known gotchas, edge cases, solutions

---

## Parallelization Timeline

**With 5 agents assigned strategically**:

| Days | Phase | Work | Agents |
|------|-------|------|--------|
| Day 1 | Foundation | Project setup, database, API patterns | 1 |
| Days 2-4 | Tier 1 | A1-A5 (independent systems) | 5 parallel |
| Days 5-6 | Tier 2 | B1-B3 (single dependencies) | 3 parallel |
| Day 7 | Tier 3 | C1-C2 (multi dependencies) | 2 parallel |
| Days 8-9 | Tier 4 | D1-D2 (integration, polish) | 1-2 |
| Day 10 | Final | Testing, bug fixes, deployment | All |

**Total: 10 calendar days. 60 agent-days of work parallelized.**

---

## Workstream Progress Tracker

| Workstream | Status | Agent | Tests | Handoff | Notes |
|-----------|--------|-------|-------|---------|-------|
| **Foundation** | ⏳ Pending | — | — | — | Block: all others |
| **A1 - Auth** | ⏳ Pending | — | — | — | Start: Day 2 |
| **A2 - Weather** | ⏳ Pending | — | — | — | Start: Day 2 |
| **A3 - Images** | ⏳ Pending | — | — | — | Start: Day 2 |
| **A4 - CMS** | ⏳ Pending | — | — | — | Start: Day 2 |
| **A5 - Community** | ⏳ Pending | — | — | — | Start: Day 2 |
| **B1 - Sites** | ⏳ Pending | — | — | — | Start: Day 5 (needs A1) |
| **B2 - AI** | ⏳ Pending | — | — | — | Start: Day 5 |
| **B3 - Integrations** | ⏳ Pending | — | — | — | Start: Day 5 (needs A1) |
| **C1 - XC & Flight** | ⏳ Pending | — | — | — | Start: Day 7 (needs A1, A2, B1) |
| **C2 - Retrieval** | ⏳ Pending | — | — | — | Start: Day 7 (needs C1, A1, B1) |
| **D1 - Admin** | ⏳ Pending | — | — | — | Start: Day 8 (integrates all) |
| **D2 - Home & Public** | ⏳ Pending | — | — | — | Start: Day 8 (integrates all) |

---

## What You're Building

### Platform Overview

**SkyHigh** is a white-label club management system for Australian paragliding/hang gliding clubs.

**Features**:
- Live multi-source weather with wind grids and 7-day forecasts
- 70+ flying site guides with hazards, ratings, launch/landing info, tide charts
- Digital pilot check-in with safety acknowledgments
- Real-time GPS flight tracking with breadcrumb trails
- Interactive XC maps with airspace overlay and distance rings
- Uber-style retrieval system for outlanded pilots
- News, events, custom CMS pages with Markdown
- Photo/video walls, business directory, sponsor listings
- AI-powered site generator (scrape any URL) and smart assistant
- TidyHQ membership sync, Google Drive integration, satellite tracker fallback
- Complete admin suite with feature toggles and scheduled jobs
- White-label branding (no code changes needed to customize for any club)

### Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Frontend | React | 19.0.0 |
| Build Tool | Vite | 6.2.3 |
| Language | TypeScript | ~5.8.2 |
| Styling | Tailwind CSS | v4.1.14 |
| Routing | React Router DOM | 7.13.1 |
| Backend | Express.js | 4.21.2 |
| Runtime | Node.js | v20.20.0 |
| Database | PostgreSQL | pg 8.20.0 |
| Maps | Leaflet | 1.9.4 |
| Data Fetching | React Query | latest |
| Animations | Framer Motion | latest |
| Wind Animation | D3 | 7.9.0 |
| Image Processing | Sharp | 0.34.5 |
| AI | Google Gemini | latest |
| Weather | Open-Meteo, Weather Underground | public APIs |

### Scale

- **30+ database tables** with relationships
- **50+ API endpoints** across all features
- **100+ React components** (pages, admin, shared)
- **13 phases** of development (Foundation + 12 workstreams)
- **70 seed sites** pre-loaded
- **3000-4000 lines of code** total

---

## Key Principles for Agents

1. **Read Foundation Once**  
   All architectural decisions are in [[skyhigh-foundation]]. Reference it, don't re-derive.

2. **Work Independently**  
   Each workstream is self-contained. You don't need code from other agents, only their **contracts** (API routes, database tables, hooks).

3. **Contracts Before Code**  
   Contracts are defined upfront (see [[skyhigh-workstream-template]] Integration Contracts section). Implement to contract, not to other code.

4. **Verify Before Handoff**  
   Complete the verification checklist in your workstream. Provide proof: passing tests, handoff document, database migrations, API contracts satisfied.

5. **Integrate Late**  
   Don't wait for other agents. Work on your workstream. Integration happens in Tier 4 after everyone's done with their piece.

---

## How to Use This Wiki

### If You're an Agent

**First time?**
1. Read [[skyhigh-parallel-workstreams]] (dependency graph, assignments)
2. Read [[skyhigh-foundation]] (architecture, database, API patterns)
3. Read [[skyhigh-workstream-template]] (what to expect from workstream docs)
4. Go to your assigned workstream page (follow the template exactly)

**Need a pattern?**
- Check [[skyhigh-common-patterns]]

**Stuck on something?**
- Check [[skyhigh-troubleshooting]]

**Done with your workstream?**
1. Complete verification checklist (in your workstream)
2. Create handoff document (in your workstream)
3. Update this page's progress tracker (change status to ✅ Done, add agent name, link to handoff)
4. Notify orchestrator

### If You're the Orchestrator (Managing Multiple Agents)

**Day 1**: Spin up Foundation workstream (1 agent)

**Day 2**: When Foundation complete, assign Tier 1 workstreams
- Assign A1, A2, A3, A4, A5 to 5 agents
- Each agent reads Foundation, then works independently
- Check progress daily using Progress Tracker table

**Day 5**: When Tier 1 complete, assign Tier 2 workstreams
- Assign B1, B2, B3 to 3 agents
- They can now integrate with Tier 1 contracts

**Day 7**: When Tier 2 complete, assign Tier 3 workstreams
- Assign C1, C2 to 2 agents
- Full multi-workstream integration

**Day 9**: When Tier 3 complete, assign Tier 4 workstreams
- Assign D1, D2 to 1-2 agents
- Final integration, polish, deployment

**Day 10**: Convergence
- All agents available for final testing, bug fixes, deployment

---

## Success Criteria

The project is **complete** when:

- [ ] All 12 workstreams complete and passing tests
- [ ] All database migrations applied successfully
- [ ] All API routes responding with correct signatures
- [ ] All React components rendering without errors
- [ ] Integration tests pass (all systems talking to each other)
- [ ] Build succeeds: `npm run build`
- [ ] Production deployment: `NODE_ENV=production node dist/server.mjs`
- [ ] All features match PRD
- [ ] Responsive on mobile (375px), tablet (768px), desktop (1280px)
- [ ] Zero TypeScript errors
- [ ] Zero console errors in browser
- [ ] All tests passing: `npm test`
- [ ] Database backups working
- [ ] Scheduled jobs running
- [ ] Documentation complete

---

## Related Pages in This Wiki

**SkyHigh Architecture**:
- [[skyhigh-parallel-workstreams]] — Dependency graph, parallelization strategy
- [[skyhigh-foundation]] — Tech stack, database, API patterns, authentication, branding
- [[skyhigh-workstream-template]] — Template all workstreams follow

**All Workstreams**:
- A1-A5 (Tier 1) — Independent systems
- B1-B3 (Tier 2) — Single dependencies
- C1-C2 (Tier 3) — Multi dependencies
- D1-D2 (Tier 4) — Integration layer

**Reference**:
- [[skyhigh-api-routes-registry]]
- [[skyhigh-component-registry]]
- [[skyhigh-common-patterns]]
- [[skyhigh-troubleshooting]]

---

**Wiki maintained by**: Claude Code  
**Build wiki created**: 2026-04-23  
**For questions**: See [[skyhigh-troubleshooting]]
