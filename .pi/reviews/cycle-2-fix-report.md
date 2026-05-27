# Fix Report — Cycle 2
**Date:** 2026-05-24  
**Fixer:** Review Fix Agent

## Summary
- Plan items processed: **11** (P0 through core P1/P2)
- **Fixed: 11** (7 freshly applied in this session + 4 already present from prior session work)
- **Errors: 0**
- **TypeScript compilation:** ✅ **141 errors** (baseline: 141 — **zero regressions**)
- **Files changed: 8** (server: 6, client: 2)

---

## Fix Log

### P-001: `datetime` → `::date` type mismatch [P0 ⭐ CRITICAL]
**Status:** ✅ FIXED  
**File:** `server/pgDb.ts`  
**Change:** Added chained 3-arg datetime converter:
```
datetime('now', '-10 hours', 'start of day')
→ (CURRENT_TIMESTAMP - interval '10 hours')  -- TIMESTAMPTZ, no ::date
```
**Verification:** Node test: `WHERE createdAt >= datetime('now', '-10 hours', 'start of day')` → `WHERE createdAt >= (CURRENT_TIMESTAMP - interval '10 hours')` ✅  
**Revert:** `git checkout server/pgDb.ts`

### P-002: Settings GET missing await on pgDb `.get()` [P0 ⭐ CRITICAL]  
**Status:** ✅ FIXED  
**File:** `server/routes/settings.ts`  
**Change:** Added `await` to 3 `db.prepare(...).get()` calls (fine, coarse, extended wind grids)  
**Verification:** All 3 rows now use `await db.prepare(...).get()` ✅  
**Revert:** `git checkout server/routes/settings.ts`

### P-003: `pilot_sessions` query selects non-existent columns [P0 ⭐ CRITICAL]
**Status:** ✅ FIXED  
**File:** `server/services/realFlightService.ts`  
**Change:** Replaced `SELECT firstName, lastName FROM pilot_sessions` → `SELECT name FROM pilots WHERE id = ?`  
**Verification:** Query targets correct table + column ✅  
**Revert:** `git checkout server/services/realFlightService.ts`

### P-004: CSRF middleware crashes when only `pilot` is authenticated [P0 ⭐ CRITICAL]
**Status:** ✅ FIXED  
**File:** `server/middleware/csrf.ts`  
**Change:**
- Added `const userId = user?.id ?? pilot?.id;`
- Replaced `user.id` references in `validateCSRFToken()` and log messages with `userId`
**Revert:** `git checkout server/middleware/csrf.ts`

### P-005: `DATE()` function has no pgDb converter [P0 ⭐ CRITICAL]
**Status:** ✅ FIXED  
**File:** `server/pgDb.ts`  
**Change:** Added converter: `DATE(expr)` → `CAST(expr AS DATE)`  
**Verification:** Node test: `DATE(timestamp) = DATE('now')` → `CAST(timestamp AS DATE) = CAST('now' AS DATE)` ✅  
**Revert:** `git checkout server/pgDb.ts`

### P-006: SSE heartbeat missing error handler [P1]
**Status:** ✅ FIXED  
**File:** `server/routes/retrievals.ts`  
**Change:** Added `req.on('end')` + `res.on('error')` handlers alongside existing `req.on('close')`  
**Verification:** `res.on('error', () => { clearInterval(heartbeat); svc.removeSseClient(client); })` present ✅  
**Revert:** `git checkout server/routes/retrievals.ts`

### P-007: Closure banner timezone bug [P1]  
**Status:** ✅ FIXED  
**File:** `server/routes/sites/closures.ts`  
**Change:** Replaced `new Date().toISOString().split('T')[0]` + `T12:00:00` hack with `toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' })`  
**Verification:** Both `todayStr` and `bannerStartStr` use Melbourne TZ ✅  
**Revert:** `git checkout server/routes/sites/closures.ts`

### P-008: SO proximity check spoofable — document known limitation [P1]
**Status:** ✅ FIXED  
**File:** `server/routes/auth.ts`  
**Change:** Added SECURITY NOTE comment documenting that proximity check uses client-supplied coordinates and is not verifiable  
**Revert:** `git checkout server/routes/auth.ts`

### P-009: rehype-raw + style allows CSS overlay attacks [P1]
**Status:** ✅ FIXED  
**File:** `src/components/MarkdownRenderer.tsx`  
**Change:** Removed `style` from allowed attributes on `div` and `span` in `sanitizeSchema`  
**Revert:** `git checkout src/components/MarkdownRenderer.tsx`

### P-013: No explicit error for mixed `?`/`@param` placeholders [P2]
**Status:** ✅ FIXED  
**File:** `server/pgDb.ts`  
**Change:** Added guard in `toPostgresParams`:
```typescript
const hasQ = /\?/.test(sql);
const hasAt = /@[a-zA-Z_]/.test(sql);
if (hasQ && hasAt) {
  throw new Error(`SQL query mixes ? and @param placeholders: ${sql.substring(0, 100)}`);
}
```
**Revert:** `git checkout server/pgDb.ts`

### P-019: User enumeration in password reset [P2]
**Status:** ✅ FIXED  
**File:** `server/routes/auth.ts`  
**Change:** Removed `mode === "first-time"` 404 branch that revealed whether email exists  
**Revert:** `git checkout server/routes/auth.ts`

---

## Skipped Items (not in scope)

| # | Title | Priority | Reason |
|---|-------|----------|--------|
| P-010 | Compass array dedup (3 files) | P2 | `COMPASS_DIRS` refactor — type issues with `as const`; low-priority cleanup |
| P-011 | `directionToDegrees` hardcoded in WindCompass | P2 | Minor client dedup |
| P-012 | Admin page dirty-tracking boilerplate | P2 | Requires 3-5h architecture refactor — standalone ticket |
| P-014-024 | Remaining backlog | P2-P3 | Performance optimizations, minor quality improvements |

---

## Files Changed

```
 server/middleware/csrf.ts            | 12 ++++++++----
 server/pgDb.ts                       | 13 ++++++++++++-
 server/routes/auth.ts                |  7 ++++---
 server/routes/retrievals.ts          |  8 ++++++++
 server/routes/settings.ts            |  6 +++---
 server/routes/sites/closures.ts      | 13 +++++++------
 server/services/realFlightService.ts |  4 ++--
 src/components/MarkdownRenderer.tsx  |  3 +--
 8 files changed, 45 insertions(+), 21 deletions(-)
```

## Unrelated Issues Noticed
- `server/pgDb.ts` HEAD had duplicate `days?` regex on one line — fixed as part of P-001
- `server/pgDb.ts` CRLF line endings cause the `edit` tool to fail — Node.js scripts work reliably
- `server/utils/geometry.ts` (untracked new file from Cycle 1) — should be committed
- `server/pg_migrations/024_add_retrievals_claimedAt.sql` (untracked new file from Cycle 1) — should be committed
