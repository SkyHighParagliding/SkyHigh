# Code Review Remediation Plan
**Date:** 2026-05-03  
**Total Recommendations:** 54  
**Priority Tiers:** IMMEDIATE (7), SHORT TERM (7), MEDIUM TERM (6), OTHER (34)

---

## IMMEDIATE FIXES (Before Production)
These must be done first as they represent critical security and data integrity issues.

### STEP 1: Fix SQL Injection in contacts.ts:157
**Category:** Logic Errors / Security (CRITICAL)  
**Status:** ✅ COMPLETED

**What Was Done:**
1. Created `server/utils/sqlBuilder.ts` with `buildSafeUpdateClauses()` function
   - Validates column names against a whitelist before use
   - Throws error if any column is not in the whitelist
   - Returns properly parameterized SQL and params array

2. Updated `server/routes/contacts.ts` (tidyhq-import-group endpoint)
   - Changed from building SQL strings with `updates.join(", ")`
   - Now uses `buildSafeUpdateClauses()` with explicit allowedColumns whitelist
   - All 8 dynamic column flags are whitelisted: ["name", "surname", "phone", "organisation", "isCommittee", "isSafetyCommittee", "isContractor", "isParksVic", "isAdmin", "position"]

3. Updated `server/routes/pilotAuth.ts` (profile update endpoint)
   - Applied same pattern for consistency
   - Whitelisted columns: ["garminMapshare", "spotFeedId", "zoleoImei"]

**Verification Completed:**
- ✅ No string interpolation of user-controlled data in SQL queries
- ✅ All parameters use proper placeholder syntax (?)
- ✅ Column names validated against whitelist before use
- ✅ Invalid columns will throw an error at runtime
- ✅ Code compiles without new TypeScript errors

**SQL Injection Test Case:**
If someone tried to modify `validRoleFlags` or `groupName` to include `"name; DROP TABLE contacts; --"`, the `buildSafeUpdateClauses()` function would throw an error: `Column "name; DROP TABLE contacts; --" is not allowed.`

---

### STEP 2: Remove Plaintext Password Storage/Comparison
**Category:** Security (CRITICAL)  
**File:** `server/routes/auth.ts:84-93`  
**Validation Steps:**
1. Read auth.ts to understand current password hashing logic
2. Find where plaintext comparison happens (`password === user.password`)
3. Identify all places where passwords are stored (database schema)
4. Check if any existing users have plaintext passwords

**What Will Change:**
- Remove the plaintext password comparison fallback
- Force users with plaintext passwords to reset on first login
- Add `passwordHashVersion` field to track password hashing iterations
- Implement a migration to mark old plaintext passwords as needing reset

**Verification:**
- All new passwords are bcrypt hashed (10+ rounds)
- Plaintext comparison code is removed
- Tests confirm old plaintext password users get forced reset

**Status:** ⏳ WAITING FOR OK

---

### STEP 3: Add CSRF Token Validation
**Category:** Security (CRITICAL)  
**File:** `server.ts` (global middleware)  
**Validation Steps:**
1. Review `server.ts` to understand current middleware setup
2. Identify all state-changing endpoints (POST, PUT, DELETE)
3. Check if `express-csurf` or similar is installed
4. Verify frontend sends CSRF tokens in forms

**What Will Change:**
- Install/configure CSRF middleware (e.g., `csurf`)
- Add CSRF token generation on GET requests
- Validate CSRF token on all state-changing requests
- Update frontend to include CSRF tokens in forms and API calls

**Verification:**
- CSRF token present in session/response
- POST/PUT/DELETE without valid CSRF token returns 403
- Frontend tests confirm tokens are sent

**Status:** ⏳ WAITING FOR OK

---

### STEP 4: Validate External URLs (SSRF Prevention)
**Category:** Security (CRITICAL)  
**File:** `server/routes/sites/media.ts:53, 69`  
**Validation Steps:**
1. Read media.ts YouTube scraping code
2. Identify all places where `channelUrl` or user-provided URLs are fetched
3. Check for URL validation logic
4. Test with localhost, 127.0.0.1, internal IPs

**What Will Change:**
- Add URL validation function that rejects:
  - localhost/127.0.0.1/internal IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - file://, data://, javascript:// protocols
  - URLs with auth in them (user:pass@host)
- Apply validation to all external URL fetches
- Add timeout to fetch calls (8s already exists in weather.ts, apply globally)

**Verification:**
- Attempt to scrape localhost:8000 → rejected
- Attempt to scrape 192.168.1.1 → rejected
- Valid YouTube URLs still work

**Status:** ⏳ WAITING FOR OK

---

### STEP 5: Remove Hardcoded Admin Credentials
**Category:** Security (CRITICAL)  
**File:** `server/routes/auth.ts:62-65`  
**Validation Steps:**
1. Read auth.ts lines 62-65 to find hardcoded emails
2. Search codebase for any other hardcoded credentials
3. Check `.env.template` for required admin setup variables
4. Verify `ensureDefaultAdmin` function creates users idempotently

**What Will Change:**
- Remove hardcoded "Jon" and "Admin" user initialization
- Move to environment variables: `ADMIN_NAMES`, `ADMIN_EMAILS`
- Update `.env.template` with required admin setup vars
- Add startup check to ensure at least one admin exists (warn if not)
- Create migration script for initial admin setup instead

**Verification:**
- No hardcoded emails in source code
- Admins can be set via environment variables
- Default admin setup is documented in README

**Status:** ⏳ WAITING FOR OK

---

### STEP 6: Add Rate Limiting to All State-Changing Endpoints
**Category:** Security (HIGH)  
**File:** `server.ts:58-86`  
**Validation Steps:**
1. Read server.ts rate limiting setup (currently only `/api/auth/login`)
2. Identify all POST, PUT, DELETE endpoints
3. Check rate limiter configuration (in-memory, persistent?)
4. Test rate limiter behavior on restart

**What Will Change:**
- Apply rate limiting to all POST/PUT/DELETE endpoints (not just login)
- Use persistent rate limiter (Redis or database-backed) instead of in-memory
- Set sensible limits: 100 requests/hour for authenticated users, 10/hour for public
- Add rate limit headers to responses

**Verification:**
- POST /api/sites after 100 requests in hour returns 429
- Rate limits persist across server restart
- Authenticated users have higher limits than anonymous

**Status:** ⏳ WAITING FOR OK

---

### STEP 7: Configure PostgreSQL Connection Pool for Production
**Category:** Performance / Production (HIGH)  
**File:** `server/pgDb.ts:7-13`  
**Validation Steps:**
1. Read pgDb.ts pool configuration
2. Check environment variable handling
3. Review current pool limits and timeouts
4. Test with concurrent requests

**What Will Change:**
- Update pool config to be environment-aware:
  - `max`: 20 (was 10) - configurable via `DB_POOL_MAX`
  - `idleTimeoutMillis`: 60000 (was 30000)
  - `connectionTimeoutMillis`: 10000 (was 5000)
- Add statement timeout: 30s
- Add connection retry strategy
- Add pool exhaustion logging

**Verification:**
- Pool accepts 20 simultaneous connections
- Long-running queries timeout after 30s
- Pool metrics are logged

**Status:** ⏳ WAITING FOR OK

---

## IMMEDIATE SUMMARY
After these 7 steps, the codebase will have addressed critical security vulnerabilities and basic production readiness.

**Next Section:** SHORT TERM (7 items to do next sprint)

