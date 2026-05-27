# Fix Bug — How-To Reference

This is a manual workflow checklist (not an invokable slash command). Open it when you have a bug to work through; follow the steps below.

**How to use:** Read through this file when you start on a bug. The "Workflow" section is the structured approach; tweak it to fit the specific bug.

---

## Workflow

When invoked with bug context:

### 1. Read the Issue
- Bug description: what's happening?
- Expected behavior: what should happen instead?
- Reproduction steps: how to trigger the bug?
- Error logs or stack traces: what's the exact error?

### 2. Diagnose Root Cause
- Read relevant code
- Set breakpoints mentally or in logs
- Trace the execution path
- Identify where the logic breaks
- Point to the exact issue and why it's happening

### 3. Create a Branch
```bash
git checkout -b fix/bug-name-TICKET-123
```

### 4. Implement the Fix
- Fix the root cause, not a symptom
- Keep the fix minimal — only change what's necessary
- Don't refactor or "improve" surrounding code

### 5. Write a Test
```javascript
// Test that reproduces the bug and verifies the fix
test('bug: [description] — should [expected behavior]', () => {
  // Setup
  // Reproduce the bug condition
  // Assert the fix works
})
```

### 6. Verify the Fix
- [ ] The test passes
- [ ] The original bug is fixed (manual test if possible)
- [ ] Existing tests still pass
- [ ] No new warnings in logs

### 7. Commit
```bash
git commit -m "[BUG-FIX] Brief description

Fixes: #ISSUE_NUMBER
Root cause: [one sentence explaining why this happened]
Solution: [one sentence explaining the fix]"
```

### 8. Update RESUME_HERE.md
Note what was fixed and whether any follow-up is needed.

---

## Example

**Bug Context:**
```
Issue #42: User login fails with "Cannot read property 'email' of undefined"
Error log: auth.ts:156 — const userEmail = user.email

Reproduction:
1. Go to /login
2. Enter a valid email that doesn't exist in database
3. Click "Sign up" (should create account, but crashes instead)
```

**Diagnosis:**
```
The code assumes `user` object always exists after database query,
but the query returns null for non-existent users. Line 156 tries to
access user.email without null-checking first.
```

**Fix:**
```typescript
// Before
const userEmail = user.email;

// After
const userEmail = user?.email;
if (!userEmail) {
  return res.status(400).json({ error: 'User not found' });
}
```

**Test:**
```typescript
test('bug #42: signup should handle non-existent user gracefully', () => {
  const response = POST('/auth/signup', { email: 'newuser@example.com' });
  expect(response.status).toBe(400);
  expect(response.body.error).toBe('User not found');
})
```

---

## Rules

- **Fix the root cause** — don't band-aid symptoms
- **Write a test** — document what was broken and verify it's fixed
- **Keep it small** — one commit per bug fix
- **Don't refactor** — fix the bug, don't improve surrounding code
- **Verify thoroughly** — test the happy path AND edge cases

---

See `../../CLAUDE.md` Section 17 for context on how-to references.
