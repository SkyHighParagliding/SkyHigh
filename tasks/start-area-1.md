We are starting a focused code review and fix cycle using the "Autonomous Hybrid-Model Workflow". 

Today, we are ONLY targeting **Area 1: Databases & Migrations** (`database/`, `server/migrations/`, `server/pg_migrations/`, `server/db.ts`).

Please take control and run Area 1 autonomously using this EXACT hybrid model workflow:
1.  **You (The Parent Manager):** Will use your current model to orchestrate.
2.  **The Worker:** Force it to use `deepseek/deepseek-chat`
3.  **The Scout, Planner, & Reviewers:** Force them to use `meta-llama/llama-3.3-70b-instruct`

### Execution Steps:
1. Read the `tasks/Area-1-Verification-Report.md` file to see the 4 known bugs.
2. Launch a `scout`. **CRITICAL INSTRUCTION FOR SCOUT:** You must physically read the code. Use `grep` to search `server/pg_migrations/` and `server/migrations/` for `pilot_sessions` and `search_logs` to prove the SQLite migrations are missing. Read `server/pgDb.ts` to see how `INSERT OR REPLACE`, `LIKE`, and `ON CONFLICT` are currently handled. Output exact file names and line numbers where the 4 bugs exist. Do not guess.
3. Launch a `planner`. Give the planner the scout's exact findings. The planner must write a fix plan that creates missing `.ts` or `.sql` files in `server/migrations/` to match Postgres, and dictates the exact code changes needed in `server/pgDb.ts` for the SQL conversion logic.
4. Launch a `worker` to apply the fixes. Handle any intercom chatter from the worker yourself.
5. Launch two `reviewer` agents in parallel to check Schema Parity and SQL Syntax.
6. Stop only when the Area is 100% verified and clean, then tell me it is complete.

**CRITICAL INSTRUCTION FOR ORCHESTRATOR:** 
DO NOT try to use custom agent names like `reviewer-schema`. You must use the built-in `pi-subagents` roles exactly as they are named: `scout`, `planner`, `worker`, and `reviewer`. 
DO NOT drop into a manual approach. You must use the `subagent({ chain: [...] })` tool to launch the team.