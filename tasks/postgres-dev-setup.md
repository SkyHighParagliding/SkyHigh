# TASK: Set up PostgreSQL for local development (Docker)

**Created:** 2026-05-26 (saved for next session)
**Estimated effort:** 60–90 minutes
**Why:** SQLite is too permissive and hides bugs that only appear on production
Postgres (Railway). Today alone: column case-folding (`photoUrl` → `photourl`),
multi-statement migration runner bug, base64 body parsing — all "worked in dev,
broke in prod". Running real Postgres locally would have caught every one.

See also: [memory/feedback.md](../memory/feedback.md) — recurring dev/prod
divergence pattern.

---

## Prerequisites checklist

- [ ] Docker Desktop installed and running on Windows
  - Download: https://www.docker.com/products/docker-desktop/
  - Verify with `docker --version` in PowerShell
- [ ] No port conflict on 5432 (run `Test-NetConnection localhost -Port 5432`
      — if it succeeds, something is already listening; pick 5433 instead)
- [ ] Current branch is clean (`git status`) before making infra changes

---

## Phase 1 — Docker Compose for local Postgres (15 min)

### Step 1.1: Create `docker-compose.dev.yml`

A separate file (not the default `docker-compose.yml`) so we don't accidentally
push it into the production deploy or interfere with any existing compose
config. Lives in repo root.

```yaml
# docker-compose.dev.yml — local dev only, not deployed
services:
  postgres:
    image: postgres:16-alpine    # match Railway's PG version (verify in Railway → Variables)
    container_name: skyhigh-pg-dev
    restart: unless-stopped
    environment:
      POSTGRES_USER: skyhigh
      POSTGRES_PASSWORD: skyhigh_dev
      POSTGRES_DB: skyhigh_dev
    ports:
      - "5432:5432"   # or "5433:5432" if 5432 is taken
    volumes:
      - skyhigh_pg_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U skyhigh -d skyhigh_dev"]
      interval: 5s
      timeout: 3s
      retries: 5

volumes:
  skyhigh_pg_data:
```

### Step 1.2: Start the container

```powershell
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps   # verify "healthy"
docker logs skyhigh-pg-dev --tail 20          # sanity check
```

### Step 1.3: Verify connection

```powershell
# Quick connection test from PowerShell
docker exec -it skyhigh-pg-dev psql -U skyhigh -d skyhigh_dev -c "SELECT version();"
```

Expected: PostgreSQL 16.x string. If it errors, the container's environment
vars didn't take effect — `docker compose down -v` (purges the volume) and
recreate.

### Step 1.4: Add `.gitignore` entries

Confirm `docker-compose.dev.yml` IS committed (the team should share the
config) but the volume data is NOT. The named volume `skyhigh_pg_data` lives
inside Docker, not in the repo, so nothing to ignore there.

---

## Phase 2 — Switch dev to use Postgres (15 min)

### Step 2.1: Create `.env.local` (or use existing `.env`)

The project adapter (`server/db.ts` line 13) checks `process.env.DATABASE_URL`.
If set → Postgres. If not → SQLite. So we just need the URL.

```
DATABASE_URL=postgresql://skyhigh:skyhigh_dev@localhost:5432/skyhigh_dev
```

Confirm `.env.local` (or whichever env file is loaded) is in `.gitignore`.
Check `.gitignore` first — do NOT commit credentials, even dev ones.

### Step 2.2: First boot — let migrations run

```powershell
npm run dev   # whatever the dev script is — check package.json
```

Watch the console. Expected sequence:
1. `[INFO] [database] DATABASE_URL detected — loading PostgreSQL adapter`
2. `[INFO] [database] PostgreSQL connection established`
3. `[INFO] [database] Running PostgreSQL migrations...`
4. Migration log lines for v1, v2, ... v32
5. `[INFO] [database] All PostgreSQL migrations completed successfully`

**If any migration fails:** STOP. That's a bug in the migration that
production has been silently tolerating or already ran in a different shape.
Don't push a fix without understanding it. Most likely candidates:
- 030, 031 had the unquoted-column bug — 032 cleans it up, so net result on
  a fresh PG should be correct, but verify the contacts table column names
  with `\d contacts`
- Earlier migrations may have PG-specific syntax already; if they fail, the
  adapter's `convertSchemaToSqlite` translations may need to be reviewed in
  reverse

### Step 2.3: Verify schema matches production

```powershell
docker exec -it skyhigh-pg-dev psql -U skyhigh -d skyhigh_dev
```

Then in psql:
```sql
\d contacts                          -- look for "photoUrl", "photoAuthorised", "fullNameDisplay"
SELECT version FROM schema_migrations ORDER BY version;
\q
```

All migrations 1–32 should be applied. Column names should be camelCase
(with quotes preserving case).

### Step 2.4: Seed dev data (optional)

If the project has a seed script, run it now. Otherwise import a subset of
production data via Railway's pg_dump → local restore (don't include real
member contact info if you want to share the dump):

```powershell
# From Railway dashboard → Postgres → Connect → copy the pg_dump command
# Then:
docker exec -i skyhigh-pg-dev psql -U skyhigh -d skyhigh_dev < dump.sql
```

---

## Phase 3 — Migration lint hook (15 min)

Prevent the bug class entirely with a pre-commit hook.

### Step 3.1: Add the lint script

Create `scripts/lint-migrations.mjs`:

```js
// Fail if any pg_migrations file has unquoted camelCase column names.
// Matches: ADD COLUMN photoUrl ...  or  RENAME COLUMN x TO photoUrl
// Misses (intentionally): quoted "photoUrl" and lowercase names.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = "server/pg_migrations";
const files = readdirSync(dir).filter(f => f.endsWith(".sql"));
const bad = [];

const camelUnquoted = /\b(ADD|RENAME)\s+(COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?)?([a-z][a-zA-Z0-9_]*[A-Z][a-zA-Z0-9_]*)\b/g;

for (const f of files) {
  const sql = readFileSync(join(dir, f), "utf8");
  // Strip block comments and -- line comments before matching
  const stripped = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  let m;
  while ((m = camelUnquoted.exec(stripped))) {
    bad.push(`${f}: unquoted camelCase identifier "${m[3]}" — wrap in double quotes`);
  }
}

if (bad.length) {
  console.error("Migration lint failed:");
  bad.forEach(b => console.error("  " + b));
  process.exit(1);
}
console.log(`✓ ${files.length} migrations clean.`);
```

### Step 3.2: Wire into pre-commit

Either via `husky` (if the project uses it — check `package.json`) or via a
plain `.git/hooks/pre-commit`. Plain hook is simpler for a one-person setup:

```bash
# .git/hooks/pre-commit
#!/bin/sh
node scripts/lint-migrations.mjs || exit 1
```

```powershell
chmod +x .git/hooks/pre-commit
```

### Step 3.3: Add npm script

In `package.json`:
```json
"scripts": {
  "lint:migrations": "node scripts/lint-migrations.mjs"
}
```

Run `npm run lint:migrations` to test. Should pass on the current state.

### Step 3.4: Sanity-test the lint

Temporarily add a broken statement to a throwaway file, confirm the hook
blocks the commit, remove it. Don't ship a hook you haven't seen fire.

---

## Phase 4 — CI step (20 min, optional but recommended)

If the project has GitHub Actions (check `.github/workflows/`):

### Step 4.1: Add a workflow that boots PG, runs migrations, runs tests

```yaml
# .github/workflows/test-postgres.yml
name: Test against Postgres
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: skyhigh
          POSTGRES_PASSWORD: skyhigh_dev
          POSTGRES_DB: skyhigh_dev
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U skyhigh"
          --health-interval 5s --health-timeout 3s --health-retries 5
    env:
      DATABASE_URL: postgresql://skyhigh:skyhigh_dev@localhost:5432/skyhigh_dev
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
      - run: npm run lint:migrations
      - run: npm run build      # if build exists
      - run: npm test           # if tests exist
```

This catches case-folding and multi-statement bugs in CI, before merge.

---

## Phase 5 — Update docs (10 min)

- [ ] Add a "Local development with Postgres" section to `wiki/06-deployment.md`
- [ ] Add the lesson to `memory/feedback.md`:
  > **Always use real Postgres in dev — never trust the SQLite fallback for
  > anything touching schema/migrations.** SQLite's case-insensitive column
  > handling and lenient error tolerance silently masks PG-only bugs.
- [ ] Note in `CLAUDE.md` Section 0 that dev now requires Docker + Postgres
- [ ] Update `RESUME_HERE.md` so the next session knows the new dev flow

---

## Verification checklist (do these all before declaring done)

- [ ] `docker compose -f docker-compose.dev.yml up -d` starts cleanly
- [ ] `npm run dev` connects to PG (not SQLite — log line confirms)
- [ ] All migrations 001–032 applied (`SELECT * FROM schema_migrations`)
- [ ] `\d contacts` shows camelCase column names (`photoUrl` not `photourl`)
- [ ] `npm run lint:migrations` passes
- [ ] A deliberately broken migration is caught by the lint hook
- [ ] If CI: a push triggers the Postgres workflow and it passes
- [ ] The admin contacts page loads with no 500 errors
- [ ] Photo upload works locally end-to-end (upload → DB → display on
      committee card)

---

## Open questions to resolve as we go

1. Which Postgres version does Railway run? Match it exactly. Check Railway
   dashboard → Postgres service → Settings, or `SELECT version()` in the
   Railway DB console.
2. Does the project already use `husky` or some other git-hook manager? If
   so, wire the lint there instead of raw `.git/hooks/`.
3. Is there an existing seed script? If yes, run it after migrations. If no,
   defer to a future task — not a blocker.
4. Should the SQLite fallback be kept as an option, or removed entirely once
   Docker PG is the dev default? Recommend keeping for now (lower friction
   for new contributors, fast smoke tests), but flag in docs that PG is the
   correct dev DB for anything migration-related.

---

## When this is done

The class of bugs we hit today (column case-folding, multi-statement
migrations, PG-specific syntax in migrations) will be caught locally in
seconds instead of after a Railway redeploy. The pre-commit hook is the
single highest-value step — even if Phases 4 and 5 are skipped, Phase 3
alone would have prevented today's `photoUrl` incident.
