# Codebase Review & Fix Roadmap

This document breaks down the SkyHigh codebase into logical, bite-sized areas for the Subagent Review & Fix Process. 
Work through this list sequentially to ensure foundational issues (like databases) are fixed before surface issues (like UI pages).

## Phase 1: The Foundation (Data & Config)
*Fixing these first prevents cascading errors later.*
- [ ] **Area 1: Databases & Migrations** (`database/`, `server/migrations/`, `server/pg_migrations/`, `server/db.ts`)
- [ ] **Area 2: Backend Core & Middleware** (`server/index.ts`, `server/middleware/`, `server/data/`, `server/utils/`)

## Phase 2: The Backend Logic
*Fixing the business logic and API endpoints.*
- [ ] **Area 3: Backend Services** (`server/services/`) - *Integrations like TidyHQ, Gemini, Open-Meteo.*
- [ ] **Area 4: Backend Routes** (`server/routes/`) - *The API endpoints. This is the largest backend folder.*

## Phase 3: Frontend Core & State
*Fixing the tools the frontend uses before fixing the visual pages.*
- [ ] **Area 5: Frontend Utilities & State** (`src/lib/`, `src/hooks/`, `src/contexts/`, `src/utils/`, `src/types/`)

## Phase 4: Frontend UI
*Fixing the visual components and pages.*
- [ ] **Area 6: Frontend Components** (`src/components/`) - *Reusable UI elements.*
- [ ] **Area 7: Frontend Pages & Routing** (`src/pages/`, `src/templates/`, `src/App.tsx`, `src/main.tsx`)

---
**How to use:**
When starting Step 1 of the review process, replace `server/routes/` with the current Area folder path you are working on. Once Step 4 is complete, check off the box here.