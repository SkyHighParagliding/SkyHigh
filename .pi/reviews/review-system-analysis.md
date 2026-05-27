# Analysis of the Code Review System

Based on a deep analysis of the review reports (Cycles 1-4) and the `.pi/skills/` prompts, here is the hard, focused truth about why the codebase doesn't seem to be improving and why the error count isn't dropping.

## 1. Why the Error Count Isn't Dropping (The Reality)
You are not seeing the same bugs repeat; you are seeing **new bugs** being discovered every cycle. 
- In Cycle 3, the system found XSS in the Events Page and a Path Traversal in the Migration Runner. 
- In Cycle 4, it found an entirely different set of 14 bugs (e.g., SQL Injection in ORDER BY, XSS in Site Data).
- **The LLM Limitation:** The prompts for Cycle 2+ instruct the agents to "read the entire codebase." An AI cannot physically read hundreds of files in a single pass due to context limits. Instead, it randomly samples files or uses search tools. Because it looks at different files every cycle, it finds *new* bugs every cycle. 

## 2. Why Some Errors *Do* Repeat
While most bugs are new, a few specific issues keep reappearing (like missing database tables and duplicated compass logic).
- **The Fixer is Skipping Hard Tasks:** The `review-fixer` agent is instructed to make the "smallest change possible." When it encounters a bug that requires a new npm package (like `sanitize-html` for XSS) or a complex database migration, it skips it.
- **System Amnesia:** The Reviewers and the Coordinator do not read the previous cycle's `fix-report.md`. Because they don't know the Fixer skipped an issue, they just find it and report it again in the next cycle.

## 3. Fixes Are Introducing Regressions
Because the Fixer operates blindly without testing the live application, some fixes break other things. 
- **Example:** In Cycle 1, the Fixer changed a `datetime` query to fix a Melbourne timezone bug (P-024). In Cycle 2, the Database Reviewer immediately flagged that this exact fix caused a hard crash in PostgreSQL (B-001). 

---

## Recommendations for the `.pi/skills/` Prompts

To make this system actually improve the codebase, you need to change how the agents operate. **(No files were modified; these are suggestions for you to implement in the `skills` folder).**

### For the Reviewer Agents (`review-bugs`, `review-security`, etc.)
- **Stop asking them to read the whole codebase:** Change the prompts for Cycle 2+ to take a specific target area. (e.g., "Focus exclusively on `server/routes/` this cycle"). This forces a deep, complete scan of a small area rather than a shallow, random scan of the whole app.
- **Add a Regression Check:** Add an instruction: *"Before scanning, read the previous cycle's `fix-report.md`. Verify that the fixes applied last time actually worked and didn't introduce new bugs."*

### For the Coordinator Agent (`review-coordinator`)
- **Implement Cross-Cycle Memory:** Add an instruction: *"Read the previous cycle's `fix-report.md`. If an issue was marked SKIPPED by the fixer, do not put it back in the standard fix plan. Instead, create a 'Human Intervention Required' section."* This stops the endless loop of reporting unfixable bugs.

### For the Fixer Agent (`review-fixer`)
- **Allow Package Installs:** Update Rule 3 / Rule 6 to explicitly allow the agent to run `npm install <package>` if a security fix requires it (e.g., sanitizing HTML).
- **Require Database Migration Files:** For dual-DB issues, explicitly instruct the fixer that it is allowed to create new `.sql` migration files in both the SQLite and PostgreSQL folders, rather than just skipping missing tables.
- **Better Verification:** Running `tsc --noEmit` (Rule 4) only checks for typos. Instruct the Fixer to write a basic test or use a more rigorous check for database queries to prevent regressions like the Cycle 1 PostgreSQL crash.