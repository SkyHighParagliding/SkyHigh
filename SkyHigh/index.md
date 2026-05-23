# SkyHigh Wiki

**Summary**: The central wiki for the SkyHigh paragliding club management platform.

---

## Project Documentation

- [[00-overview]]
- [[01-architecture]]
- [[02-tasks]]
- [[03-decisions-log]]
- [[04-glossary]]
- [[05-file-map]]
- [[06-deployment]]
- [[07-deployment-guide]]
- [[07-integrations]]

---

## SkyHigh Platform Build Wiki

This section is migrated from the `Claude_LLM_Wiki` and contains the complete, agent-optimized wiki for rebuilding the SkyHigh platform from scratch using parallel development workstreams.

**Purpose**: This wiki enables multiple Claude Code agents to independently develop, test, and verify 12 major system components in parallel, then integrate them into a production-ready platform.

**Last updated**: 2026-04-23

---

### Quick Start for Agents

#### First Time Here?

1. **Read [[skyhigh-parallel-workstreams]]** (5 min) — Understand parallelization, dependency graph, workstreams
2. **Read [[skyhigh-foundation]]** (15 min) — Tech stack, database schema, API patterns, authentication (read once, reference often)
3. **Read [[skyhigh-workstream-template]]** (5 min) — Understand structure of workstream documents
4. **Jump to your assigned workstream** (see Workstreams section below)

#### Already Know the Project?

Go straight to your workstream page (e.g., [[skyhigh-workstream-a1-auth]]).

---

### Core Architecture Documents

**Read all of these first. They're foundational and won't change.**

- **[[skyhigh-parallel-workstreams]]** — Dependency graph, 12 workstreams, parallelization schedule, contract definitions, workstream assignments
- **[[skyhigh-foundation]]** — Complete architectural reference (tech stack, database all 30+ tables, API patterns, auth system, branding, theming, environment setup)
- **[[skyhigh-workstream-template]]** — Template structure that every workstream follows (so you know what to expect)

---

### Workstreams by Tier

#### Foundation (Serial — Complete First)

**Status**: ⏳ Pending  
**Agent**: TBD  
**Estimated LOE**: 1 day

Core setup, database schema, API patterns, branding system.

#### Tier 1: Independent Systems (Parallel — Start After Foundation)

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

#### Tier 2: Single-Dependency Systems (Parallel — Start After Tier 1)

**Recommended**: 3 agents working simultaneously

1. **[[skyhigh-workstream-b1-sites]]** — Flying Sites Core  
   Sites CRUD, scraping/import, public directory, seed data (70 sites)

2. **[[skyhigh-workstream-b2-ai]]** — AI Integration & Smart Tools  
   Gemini setup, fallback chains, site generator, smart assistant

3. **[[skyhigh-workstream-b3-integrations]]** — External Integrations  
   TidyHQ sync, Google Drive, satellite tracker polling

#### Tier 3: Multi-Dependency Systems (Parallel — Start After Tier 1 + Tier 2)

**Recommended**: 2 agents working simultaneously

1. **[[skyhigh-workstream-c1-xc-flight]]** — XC Maps & Flight Tracking  
   GPS tracking, flight trails, interactive maps, history export

2. **[[skyhigh-workstream-c2-retrieval]]** — Retrieval & Real-Time Systems  
   Retrieval board, driver claims, real-time updates via SSE, messaging

#### Tier 4: Integration Layer (Sequential — Start After Tier 3)

**Recommended**: 1-2 agents

1. **[[skyhigh-workstream-d1-admin]]** — Admin Dashboard & Shared Patterns  
   Admin dashboard, navigation, reusable hooks, feature toggles

2. **[[skyhigh-workstream-d2-home]]** — Home Page & Public UI  
   Home page, navigation shell, footer, responsive layout, theme adaptation

---

### Reference & Support

**Use these to look up patterns, find components, understand data flows**

- **[[skyhigh-api-routes-registry]]** — All 50+ API endpoints (grouped by workstream, with full specs)
- **[[skyhigh-component-registry]]** — All React components (names, props, where they live)
- **[[skyhigh-database-mutations]]** — Which migration adds/modifies which tables
- **[[skyhigh-common-patterns]]** — Reusable hooks, utilities, error handlers (copy these across workstreams)
- **[[skyhigh-troubleshooting]]** — Known gotchas, edge cases, solutions
- **[[skyhigh_weather_apis]]** — Weather API research and documentation
