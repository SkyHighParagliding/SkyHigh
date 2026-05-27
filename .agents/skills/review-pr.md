# Review PR — How-To Reference

This is a manual workflow checklist (not an invokable slash command). Open it when you want to review a PR or completed task systematically.

**How to use:** Read this file before starting a review. The checklist below covers security, logic, tests, and code quality in priority order.

---

## Workflow

When invoked with PR context:

### 1. Understand the Change
- What feature or fix is this?
- What files were changed?
- What's the intent of the PR?
- Read the test files to understand expected behavior

### 2. Security Review (Priority 1)
- [ ] **SQL Injection** — parameterized queries, no string interpolation
- [ ] **XSS** — user input sanitized before rendering
- [ ] **Auth** — access control enforced, unauthenticated users blocked
- [ ] **Data exposure** — no secrets, API keys, passwords in code
- [ ] **Validation** — all external input validated and typed
- [ ] **Dependencies** — check for known vulnerabilities

### 3. Logic Review (Priority 2)
- [ ] **Correctness** — does the code do what it claims?
- [ ] **Edge cases** — null, empty, boundary values handled?
- [ ] **Error handling** — failures caught and handled gracefully?
- [ ] **Performance** — no obvious inefficiencies (N+1 queries, etc.)?

### 4. Test Coverage (Priority 3)
- [ ] **Coverage** — adequate tests for the feature (aim 80%+)?
- [ ] **Happy path** — main scenario tested?
- [ ] **Error cases** — failure scenarios tested?
- [ ] **Integration** — tested with real dependencies, not just mocks?

### 5. Code Quality (Priority 4)
- [ ] **Readability** — clear variable names, understandable logic?
- [ ] **Consistency** — follows project patterns and conventions?
- [ ] **DRY** — no unnecessary duplication?
- [ ] **Comments** — necessary explanations present (but not clutter)?

### 6. Produce Scored Report

```
## Code Review — [PR Title]

**Files Changed:** [list]  
**Lines Changed:** [approx]  
**Test Coverage:** [%]  

### Security (CRITICAL)
✅ SQL queries are parameterized
❌ XSS risk in line 42 — user input not escaped
⚠️ Auth check missing on admin endpoint

### Logic & Correctness
✅ Feature logic matches spec
⚠️ Null handling missing in error case

### Test Coverage
⚠️ 62% — should be 80%+. Missing error case tests.

### Code Quality
✅ Readable and consistent with project patterns

### Verdict
**Status:** REQUEST CHANGES  
**Blockers:** XSS risk, missing auth check, low test coverage  
**Nice to have:** Null handling, add error tests  

**Recommendations:**
1. Fix XSS risk in comments.tsx:42 by escaping output
2. Add auth check to /api/admin endpoint
3. Add tests for error cases (aim for 80%+ coverage)
4. Consider null-safe chaining in users.ts

**Approved when:** All blockers fixed and coverage ≥80%
```

### 7. Flag Issues Clearly
- **CRITICAL** (blocks approval) — security, logic, crashes
- **MAJOR** (should fix) — missing tests, performance issues
- **MINOR** (nice to have) — style, clarity, refactoring

---

## Scoring

**Verdict Options:**
- **✅ APPROVED** — code is ready to merge
- **⚠️ APPROVED WITH COMMENTS** — approved but has suggestions
- **❌ REQUEST CHANGES** — blockers must be fixed before approval
- **🔍 NEEDS INVESTIGATION** — unclear intent or needs more context

**Typical threshold:** Approved when critical issues are zero, test coverage ≥80%.

---

## Example

```
## Code Review — Implement Password Reset

**Files:** auth.ts, email.ts, auth.test.ts  
**Lines:** 180 changed  
**Coverage:** 85%

### Security ✅
✅ No SQL injection (parameterized queries)
✅ Emails validated against regex
✅ Reset tokens are random and expire in 1 hour
✅ Rate-limited to 3 attempts per hour

### Logic ✅
✅ Token generation is secure
✅ Expiry check works correctly
✅ Email sending handles failures gracefully

### Tests ✅
✅ 85% coverage
✅ Happy path: request reset → check email → reset password ✓
✅ Error cases: invalid email, expired token, rate limit ✓

### Quality ✅
✅ Clear, readable code
✅ Consistent with project patterns

### Verdict
**✅ APPROVED**

All security checks pass. Good test coverage. Logic is sound. Ready to merge.
```

---

## Rules

- **Start with security** — all other issues are secondary
- **Be specific** — point to exact lines and explain the issue
- **Provide solutions** — don't just complain
- **Focus on impact** — major issues first
- **Don't approve unsafe code** — err on the side of caution

---

See `../../CLAUDE.md` Section 17 for context on how-to references.
