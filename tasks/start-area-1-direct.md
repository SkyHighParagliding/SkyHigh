We are starting a focused code review and fix cycle for Area 1.

Because the Intercom broker crashed on the host machine, we are skipping the Scout and Planner. I have already gathered the exact fix plan.

Please take control and run Area 1 autonomously using this EXACT hybrid model workflow:
1.  **You (The Parent Manager):** Will use your current model to orchestrate.
2.  **The Worker:** Force it to use `deepseek/deepseek-chat`
3.  **The Reviewers:** Force them to use `meta-llama/llama-3.3-70b-instruct`

### Execution Steps:

**1. Launch a `worker` (using DeepSeek) and give it this exact prompt to execute:**
> You are the sole writer. Execute these 4 specific database bug fixes:
> 
> **Fix 1:** Missing SQLite tables. Read `server/pg_migrations/008_add_pilot_sessions.sql` and `server/pg_migrations/023_search_logs.sql`. Create matching SQLite migrations in `server/migrations/` using standard SQLite syntax (e.g., `054_pilot_sessions.ts` and `055_search_logs.ts` or `.sql`).
> **Fix 2:** INSERT OR REPLACE. In `server/pgDb.ts` around line 114, the conversion logic handles `INSERT OR REPLACE`. Ensure it correctly converts standard SQLite `INSERT OR REPLACE` into Postgres `ON CONFLICT` clauses for all tables.
> **Fix 3:** ILIKE. In `server/pgDb.ts`, add a regex replacement inside the `convertSQL` function that converts SQLite `LIKE` to Postgres `ILIKE` so pattern matching is case-insensitive in Postgres.
> **Fix 4:** NULL concatenation. In `server/pgDb.ts` inside `convertSQL`, add a regex replacement that converts SQLite's `||` concatenation operator to Postgres's `CONCAT()` function to safely handle NULLs.
> 
> When finished, write a summary to `worker/area1-fixes-applied.md` and run `npm run lint` locally. 

**2. Launch two `reviewer` agents in parallel (using Llama 70B):**
- Reviewer 1 must check the new files in `server/migrations/` for Schema Parity.
- Reviewer 2 must check `server/pgDb.ts` for SQL Syntax accuracy.

**CRITICAL RULE FOR REVIEWERS:** The intercom is broken. DO NOT use `contact_supervisor`, `intercom`, or try to talk to anyone. When you are finished reviewing, simply write your findings directly to a text file (e.g., `worker/area1-review-schema.md` and `worker/area1-review-sql.md`) and then STOP.

**CRITICAL INSTRUCTION FOR ORCHESTRATOR:** 
DO NOT invent custom agent names. You must use the `subagent({ chain: [...] })` tool to launch the `worker` and the two parallel `reviewer`s exactly as named. Do NOT use the intercom tool since the broker is down.