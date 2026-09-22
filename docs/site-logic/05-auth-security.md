# Authentication, Sessions & Security — Decision Inventory

## Admin session management

### Session TTL — configurable default of 24 hours
- **What it is:** Admin sessions expire after a database-configured TTL; the user is rejected and the session row deleted. Admins encounter this as a 401 "Session expired" response.
- **Why (the decisions):** [inferred] A hard-coded TTL would be inconvenient for clubs whose committees rarely meet; making it admin-tunable via `settings.cacheAdminSessionTtl` allows the default to be conservative (24 h) without permanently locking out occasional users. Defaults to 24 h if the row is missing, which is the safest reading.
- **How (the mechanism):** `getSessionTtlMs()` reads `settings.cacheAdminSessionTtl` (hours), converts to ms with `parseInt(row?.value || "24", 10) * 3600000`. Every `requireAuth`/`requireSOOrAdmin` call compares `Date.now() - session.createdAt` against this. Expired sessions are deleted on-the-spot. A `setInterval` sweeps all expired rows every hour. `server/middleware/auth.ts:4–11`, `server.ts:365–367`.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule.

### SO-session blocks admin endpoints
- **What it is:** A session that has `soSiteId` set (a Safety Officer proximity session bound to a site) is refused entry to admin-only endpoints with HTTP 403.
- **Why (the decisions):** SO mode is intentionally reduced-privilege: the SO can only act on their bound site. Letting the same token reach full admin routes would collapse the privilege separation the SO system exists to provide.
- **How (the mechanism):** `requireAuth` checks `session.soSiteId` after the session lookup: if truthy → `return res.status(403).json({ error: "SO-restricted session cannot access admin endpoints. Use Admin Duties to switch." })`. `requireSOOrAdmin` skips this check — it is the lower-privilege gate used for SO-accessible routes. `server/middleware/auth.ts:43–45`.
- **Principles:** Refuse rather than improvise at the edges; Deliberate, explained differences.

### SO session is single-binding — no re-binding without re-login
- **What it is:** Once an admin session has `soSiteId` set, the `/auth/bind-so-session` endpoint refuses to overwrite it and requires the user to log out.
- **Why (the decisions):** Allowing silent re-binding would let an attacker who controls an existing token pivot to any site without the proximity re-check. Making re-login mandatory re-asserts GPS proximity for the new site.
- **How (the mechanism):** `/bind-so-session` route: `if (user.soSiteId) return res.status(400).json({ error: "SO session already bound to a site. Log out and re-authenticate to change sites." })`. `server/routes/auth.ts:218–219`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### SO elevation to admin clears soSiteId
- **What it is:** An SO who is also a full admin can "elevate" their session back to admin mode by NULLing `soSiteId` in the DB without re-logging in.
- **Why (the decisions):** [inferred] Prevents the case where an admin who logged in via the SO proximity flow is permanently locked out of admin routes for the rest of the day because they happened to be near a site.
- **How (the mechanism):** `/elevate-to-admin` route verifies `user.isAdmin`, then `UPDATE admin_sessions SET "soSiteId" = NULL WHERE token = $1`. `server/routes/auth.ts:252–263`.
- **Principles:** Deliberate, explained differences; Decisions stay with the human.

### Session cleanup interval — 1 hour
- **What it is:** A `setInterval` sweeps the `admin_sessions` table for rows older than the configured TTL, deleting them silently.
- **Why (the decisions):** [inferred] Session expiry is also enforced per-request, so the sweep is hygiene not security. One-hour granularity is a balance between DB churn and table bloat.
- **How (the mechanism):** `setInterval(() => cleanExpiredSessions(), 60 * 60 * 1000)` in `server.ts:365–367`. `cleanExpiredSessions` computes the cutoff timestamp and runs a single `DELETE` from `server/middleware/auth.ts:109–113`.
- **Principles:** One source of truth per rule.

---

## Pilot session management

### Pilot session TTL — 30 days
- **What it is:** Pilot (member) sessions expire after 30 days. The pilot sees a 401 "Session expired" on their next request.
- **Why (the decisions):** [inferred] Pilots submit flights and check retrievals from mobile devices where re-authentication is friction. 30 days matches common consumer app norms and is acceptable risk given pilots have no admin capability.
- **How (the mechanism):** `PILOT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000` in `server/constants.ts:22`. Checked in `requirePilotAuth`, `optionalPilotAuth`, and the `/pilot-auth/me` route. `server/routes/pilotAuth.ts:197–200, 243–246`.
- **Principles:** Deliberate, explained differences.

### Pilot pilot session cleanup — in-process on access
- **What it is:** Expired pilot sessions are deleted when encountered; there is no separate sweep, unlike admin sessions.
- **Why (the decisions):** [inferred] Pilot sessions accumulate from mobile apps and are accessed infrequently; lazy cleanup avoids a separate sweep without meaningful table bloat difference.
- **How (the mechanism):** `optionalPilotAuth` silently fires `execute("DELETE FROM pilot_sessions WHERE token = $1")` (fire-and-forget) when age > TTL. `server/routes/pilotAuth.ts:274–276`.
- **Principles:** One source of truth per rule.

### Pilot token accepted only from headers, not query string
- **What it is:** `requirePilotAuth` reads the pilot token from `x-pilot-token` header or `Authorization: Bearer`, never from URL query parameters.
- **Why (the decisions):** Tokens in query strings appear in server logs, browser history, and Referer headers. Header-only delivery is standard bearer-token hygiene.
- **How (the mechanism):** `const token = req.headers["x-pilot-token"] || req.headers.authorization?.replace("Bearer ", ""); // Only accept from headers, not query`. `server/routes/pilotAuth.ts:224`.
- **Principles:** Assume the safest reading when context is missing; Traceable to code.

---

## Pilot password requirements

### Pilot password minimum length — 8 characters
- **What it is:** Registration is refused if the password is shorter than 8 characters.
- **Why (the decisions):** [inferred] 8 characters is the minimum that makes brute-force impractical for bcrypt cost 10; NIST SP 800-63B recommends at least 8 for user-chosen passwords.
- **How (the mechanism):** `if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" })`. `server/routes/pilotAuth.ts:83–85`.
- **Principles:** Assume the safest reading when context is missing.

### Pilot password complexity rule — mixed-case + digit + special character
- **What it is:** Pilot registration rejects passwords lacking at least one uppercase, one lowercase, one digit, and one of `@$!%*?&`.
- **Why (the decisions):** [inferred] Paragliding clubs often attract non-technical members; this rule provides a baseline of entropy that simple dictionary words would fail.
- **How (the mechanism):** `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/` tested before the bcrypt write. `server/routes/pilotAuth.ts:87–89`.
- **Principles:** Assume the safest reading when context is missing.

### Admin (contact) password minimum length — 6 characters
- **What it is:** Password-reset submissions for admin/contact accounts are rejected if the new password is fewer than 6 characters.
- **Why (the decisions):** [inferred] The lower bar (6 vs 8 for pilots) was set for the admin path, which uses email-token-gated reset rather than open registration. No complexity regex is enforced here — a different deliberate choice.
- **How (the mechanism):** `if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" })`. `server/routes/auth.ts:607–609`.
- **Principles:** Deliberate, explained differences.

---

## Password hashing

### bcrypt cost factor — 10
- **What it is:** All passwords are hashed with bcrypt at cost 10 before storage.
- **Why (the decisions):** [inferred] Cost 10 is bcrypt's own default and is broadly accepted as the minimum production-safe value; it runs in ~100 ms on 2020s hardware, making offline brute-force infeasible without being so slow it noticeably degrades login.
- **How (the mechanism):** `const SALT_ROUNDS = 10;` used in `bcrypt.hash(password, SALT_ROUNDS)` for both admin and pilot paths. `server/routes/auth.ts:46`, pilot: `server/routes/pilotAuth.ts:101`.
- **Principles:** One source of truth per rule; Assume the safest reading when context is missing.

### Plaintext password migration — dev-only auto-migration
- **What it is:** If `ALLOW_PLAINTEXT_PASSWORDS=true` (dev env var), a login with a matching plaintext password succeeds and immediately re-hashes the password to bcrypt. In production this env var must be absent; the attempt is logged and rejected.
- **Why (the decisions):** Migration path for bootstrapped dev databases that pre-date bcrypt; the production path is a hard block with a warning so plaintext credentials can never quietly pass in prod.
- **How (the mechanism):** `isHashed()` checks for `$2a$`/`$2b$` prefix. If false and `ALLOW_PLAINTEXT_PASSWORDS !== "true"`, `valid = false` and a SHA-256 log of the email is emitted. `server/routes/auth.ts:118–135`.
- **Principles:** Refuse rather than improvise at the edges; Surface, don't hide.

### Pilot login timing-safe against user enumeration
- **What it is:** When a pilot login is attempted for a non-existent email, bcrypt is still called with a dummy hash to consume the same time as a real failed comparison.
- **Why (the decisions):** Without this, a slightly faster response for "email not found" leaks which emails are registered — a common enumeration vector.
- **How (the mechanism):** `const valid = pilot ? await bcrypt.compare(password, pilot.passwordHash) : await bcrypt.compare(password, "$2a$10$NQzL…")`. The dummy hash is a valid bcrypt string so the comparison always takes full time. `server/routes/pilotAuth.ts:146–149`.
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

---

## Password reset tokens

### Reset token expiry — 24 hours
- **What it is:** Password-reset tokens expire 24 hours after creation; attempting to use a stale token returns "This reset link is invalid, already used, or expired".
- **Why (the decisions):** 24 h is long enough for a member to check email the next morning and short enough to limit exposure if an email is forwarded or intercepted.
- **How (the mechanism):** `RESET_TOKEN_EXPIRY_HOURS = 24`; expiry stored as `new Date(Date.now() + 24*3600*1000).toISOString()`. The `reset-password` endpoint atomically claims the token with `WHERE "usedAt" IS NULL AND "expiresAt" > $now` inside a transaction. `server/routes/auth.ts:13, 346, 619–626`.
- **Principles:** Assume the safest reading when context is missing; One source of truth per rule.

### Reset token — atomic revoke-and-replace in a transaction
- **What it is:** Sending a new reset email first deletes any existing unused tokens for that account, then inserts the new one — in a single transaction.
- **Why (the decisions):** Without a transaction, a crash between DELETE and INSERT leaves the user with no valid token. Two concurrent requests could also delete each other's freshly inserted tokens. The comment in the code states this explicitly.
- **How (the mechanism):** `transaction(async (client) => { DELETE old unused tokens; INSERT new token; })`. `server/routes/auth.ts:350–361`.
- **Principles:** One source of truth per rule; Refuse rather than improvise at the edges.

### Reset token — used-once enforcement
- **What it is:** A token that has been successfully used (its `usedAt` is non-NULL) returns "This reset link has already been used" when presented again.
- **Why (the decisions):** Prevents replay of a captured reset link.
- **How (the mechanism):** `WHERE "usedAt" IS NULL AND "expiresAt" > $3` in the atomic UPDATE inside the reset transaction. If `rowCount === 0`, `TokenInvalidError` is thrown and caught to return HTTP 400. `server/routes/auth.ts:620–626, 657–660`.
- **Principles:** Refuse rather than improvise at the edges.

### Reset-on-success invalidates all active sessions
- **What it is:** When a password reset completes, all existing sessions for that user (admin sessions or pilot sessions) are deleted.
- **Why (the decisions):** A password is typically reset because of a suspected compromise; active sessions from the old credential must be invalidated.
- **How (the mechanism):** Inside the same transaction as the password update: `DELETE FROM admin_sessions WHERE "userId" = $1` (or `pilot_sessions` for pilots). `server/routes/auth.ts:651–654`.
- **Principles:** Assume the safest reading when context is missing.

### Password reset — same response for found and not-found accounts
- **What it is:** `request-password-reset` returns the same success message whether or not the email matches an account.
- **Why (the decisions):** Standard user-enumeration prevention. The comment in the code ("If an account exists with that email") makes the intent explicit.
- **How (the mechanism):** Early-return `res.json({ success: true, message: "If an account exists with that email, a password reset link has been sent." })` when no contact is found. `server/routes/auth.ts:452–454`.
- **Principles:** Assume the safest reading when context is missing; Surface, don't hide.

---

## Last-admin guard

### Deleting the last admin user is blocked
- **What it is:** Attempting to remove the only remaining admin contact returns HTTP 400 "Cannot delete the last admin user".
- **Why (the decisions):** Allows recovery; a club that accidentally deletes all admin accounts would be locked out permanently.
- **How (the mechanism):** The delete route opens a transaction, takes a `FOR UPDATE` row-lock on all admin rows, counts them, and aborts if `count <= 1` before running the DELETE. Locking prevents two concurrent deletes from both seeing `count = 2` and racing to delete both. `server/routes/auth.ts:300–331`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

---

## SO proximity enforcement

### Proximity threshold — 500 m (Haversine)
- **What it is:** SO login and session-binding are refused unless the submitted GPS coordinates place the user within 500 m of the site's stored lat/lon (Haversine formula, Earth radius 6 371 000 m).
- **Why (the decisions):** The threshold must be large enough to tolerate consumer GPS error (~10–20 m) and a Safety Officer standing at the car park rather than the launch pad, but small enough to be site-specific and not allow an SO to "be at" an adjacent site. 500 m covers all club sites' parking-to-launch distances while still being meaningfully site-scoped.
- **How (the mechanism):** `SO_PROXIMITY_THRESHOLD_M = 500` (server); client mirrors this as `PROXIMITY_THRESHOLD_M = 500`. Both use the same Haversine function. If `dist > 500` → HTTP 403. `server/routes/auth.ts:43, 165–167, 240–241`. `src/components/SOProximityDetector.tsx:12`.
- **Principles:** One source of truth per rule (duplicated client/server — a known gap); Assume the safest reading when context is missing.

### Proximity check uses client-supplied coordinates (acknowledged limitation)
- **What it is:** The server trusts the `latitude`/`longitude` values in the request body for the proximity check; it does not independently verify GPS location.
- **Why (the decisions):** Full GPS attestation would require platform-native signed-location APIs that are not available via browser. The comment in `auth.ts` states this explicitly: "This is a known limitation — the proximity check is a safety control, not a strict security boundary." The safety value is that it stops casual non-SO users from logging in; it does not stop a determined attacker.
- **How (the mechanism):** `const { latitude, longitude } = req.body;` — no HMAC or signed-location header. Site coordinates are also public, so spoofing is trivial. `server/routes/auth.ts:156–168`.
- **Principles:** Surface, don't hide; Separate facts from judgements.

### SO proximity prompt is admin-toggleable
- **What it is:** The geolocation-triggered SO login prompt can be disabled globally by setting `soProximityPromptEnabled = "false"` in admin settings.
- **Why (the decisions):** [inferred] Allows the club to suppress the prompt during development, testing, or if it causes confusion for non-SO members.
- **How (the mechanism):** `if (settings.soProximityPromptEnabled === "false") return null;` at the top of the `SOProximityDetector` render. Default is `"true"`. `src/components/SOProximityDetector.tsx:167`. `src/contexts/SettingsContext.tsx:314`.
- **Principles:** Decisions stay with the human.

### SO test mode — Portsea fixed coordinates
- **What it is:** A developer/admin can activate `?so_test=true` in the URL to simulate being at Portsea (lat -38.3167, lon 144.7167) without real GPS, persisted in `localStorage`.
- **Why (the decisions):** Without a way to test the proximity flow from a non-field environment, changes to the SO flow could only be verified on-site.
- **How (the mechanism):** `PORTSEA_LAT = -38.3167`, `PORTSEA_LON = 144.7167` constants. If `testMode` is true, `checkProximity` is called with these coordinates instead of real GPS. `src/components/SOProximityDetector.tsx:10–11, 99–101`.
- **Principles:** Deliberate, explained differences.

### GPS timeout for proximity check — 10 seconds
- **What it is:** The browser's geolocation request for the SO proximity check is given a 10-second timeout before being silently abandoned.
- **Why (the decisions):** [inferred] A hard timeout prevents the UI from hanging indefinitely if the user denies location or is indoors. Failure is silent — the prompt is not shown, which is the right fallback.
- **How (the mechanism):** `getCachedLocation(callback, () => {}, { timeout: 10000 })`. `src/components/SOProximityDetector.tsx:104–111`.
- **Principles:** Assume the safest reading when context is missing.

---

## Rate limiting

### Login rate limit — 10 attempts per 15 minutes per IP (`express-rate-limit`)
- **What it is:** More than 10 POST requests to `/api/auth/login` from the same IP in a 15-minute window returns HTTP 429 "Too many login attempts."
- **Why (the decisions):** Mitigates credential-stuffing and brute-force attacks against admin passwords. 15 minutes / 10 attempts is a widely-used threshold: tight enough to slow attacks, loose enough not to inconvenience legitimate users who mistype.
- **How (the mechanism):** `loginLimiter = rateLimit({ windowMs: 15*60*1000, max: 10, … })` applied as `app.use("/api/auth/login", loginLimiter)`. `server.ts:67–73, 213`.
- **Principles:** Refuse rather than improvise at the edges.

### Search rate limit — 20 requests per minute per IP
- **What it is:** More than 20 search API calls per minute returns HTTP 429.
- **Why (the decisions):** [inferred] Smart Search calls an AI model; a very tight limit prevents cost abuse. 20/min is generous for human use but constrains scrapers.
- **How (the mechanism):** `searchLimiter = rateLimit({ windowMs: 60*1000, max: 20 })` applied to both `/api/search/public` and `/api/search/admin`. `server.ts:75–81, 214–215`.
- **Principles:** Refuse rather than improvise at the edges.

### Submission (upload) rate limit — admin-configurable default of 100 per hour
- **What it is:** More than N image submissions per IP per hour returns HTTP 429. N is read live from `settings.submissionRateLimit`, clamped to `(0, 500]`, defaulting to 100.
- **Why (the decisions):** The club needs to tune this: high during a fly-in where dozens of photos are submitted, low normally. Clamping to ≤500 prevents the DB value from effectively disabling the limit.
- **How (the mechanism):** `submissionLimiter` uses `max: async () => { … parseInt(row.value) … }`. Clamp: `(val > 0 && val <= 500) ? val : 100`. `server.ts:83–95`.
- **Principles:** Decisions stay with the human; One source of truth per rule.

### State-change rate limit — 100 per hour, keyed by user ID then IP
- **What it is:** All POST/PUT/DELETE/PATCH requests to `/api/` are limited to 100 per authenticated user (or IP for unauthenticated) per hour. GET/HEAD/OPTIONS are exempt.
- **Why (the decisions):** Blanket protection for all mutating endpoints; keying by user ID means one user can't burn another user's quota by spoofing their IP.
- **How (the mechanism):** `stateChangeLimiter` with `keyGenerator: req => req.user?.id || ipKeyGenerator(req)` and `skip: req => ["GET","HEAD","OPTIONS"].includes(req.method)`. `server.ts:97–114`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

### Bulk-delete rate limit — 20 per hour
- **What it is:** `/api/contacts/bulk-delete` is limited to 20 requests per hour per user/IP.
- **Why (the decisions):** [inferred] Bulk deletes have large blast radius; a tighter cap limits accidental or malicious mass-deletion.
- **How (the mechanism):** `bulkOperationLimiter = rateLimit({ windowMs: 60*60*1000, max: 20 })`. `server.ts:117–127`.
- **Principles:** Refuse rather than improvise at the edges.

### Public registration rate limit — 3 per hour per IP
- **What it is:** Provider (XC retrieval) account registration via `/api/auth/register-provider` is limited to 3 per IP per hour.
- **Why (the decisions):** [inferred] Prevents automated account creation spam; legitimate use rarely exceeds 1 registration per session.
- **How (the mechanism):** `publicRegistrationLimiter = rateLimit({ windowMs: 60*60*1000, max: 3 })`. `server.ts:129–136, 230`.
- **Principles:** Refuse rather than improvise at the edges.

### Password-reset rate limit — 5 per hour per IP (express-rate-limit layer)
- **What it is:** `/api/auth/request-password-reset` and `/api/auth/request-pilot-password-reset` are limited to 5 requests per IP per hour.
- **Why (the decisions):** Each reset attempt sends an email; unlimited requests would allow email-bombing victims.
- **How (the mechanism):** `passwordResetLimiter = rateLimit({ windowMs: 60*60*1000, max: 5 })`. `server.ts:138–145, 232–234`.
- **Principles:** Refuse rather than improvise at the edges.

### Password-reset in-process rate limit — 5 per 15 minutes per email (Map-based)
- **What it is:** A second, application-level rate limiter (in-memory Map) applies to the public `request-password-reset` route, keyed on `reset:{email}` — 5 attempts per 15-minute window.
- **Why (the decisions):** The express-rate-limit layer is keyed by IP; the Map layer is keyed by email. Together they protect against both IP-distributed attacks (targeting one account from many IPs) and IP-based attacks.
- **How (the mechanism):** `checkRateLimit("reset:" + normalizedEmail)` where `RATE_LIMIT_MAX = 5` and window = `RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000`. `server/routes/auth.ts:15–30, 443`.
- **Principles:** Refuse rather than improvise at the edges.

### Pilot login/registration rate limit — 10 per 15 minutes per IP (Map-based)
- **What it is:** Pilot login and registration endpoints use an in-process Map limiter: 10 requests per IP per 15-minute window.
- **Why (the decisions):** [inferred] Same principle as admin login — brute-force mitigation. The higher limit (10 vs 5 for reset) reflects that pilots may legitimately retry login a few times.
- **How (the mechanism):** `PILOT_RATE_LIMIT_MAX = 10`, window = `PILOT_RATE_LIMIT_WINDOW_MS = 15*60*1000`. Map entries are swept every 30 seconds. `server/routes/pilotAuth.ts:43–67`.
- **Principles:** Refuse rather than improvise at the edges.

---

## CSRF protection

### CSRF token expiry — 24 hours, reusable within window
- **What it is:** Each logged-in user gets a single CSRF token valid for 24 hours. The same token can be sent on multiple requests until it expires, at which point a new one is generated on next access.
- **Why (the decisions):** Single-use tokens require a token-refresh round trip after every state-changing call, which is complex and breaks multi-tab use. 24 h aligns with the session TTL so the token and session expire together.
- **How (the mechanism):** `CSRF_TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000`. `validateCSRFToken` does not delete the entry on valid use — comment: "Token is valid, but don't delete it - it can be reused until expiry." `server/utils/csrf.ts:39`. `server/constants.ts:11`.
- **Principles:** One source of truth per rule; Deliberate, explained differences.

### CSRF token cleanup — every 1 hour
- **What it is:** An interval sweeps the in-memory CSRF token store and removes expired entries every hour.
- **Why (the mechanisms):** Prevents unbounded memory growth on a server with many authenticated users.
- **How (the mechanism):** `setInterval(cleanupExpiredTokens, CSRF_CLEANUP_INTERVAL_MS)` where `CSRF_CLEANUP_INTERVAL_MS = 60 * 60 * 1000`. `server/utils/csrf.ts:67`. `server/constants.ts:12`.
- **Principles:** One source of truth per rule.

### CSRF in-memory store (not Redis)
- **What it is:** CSRF tokens are stored in a process-local `Map`, not in the database or Redis.
- **Why (the decisions):** Comment in `csrf.ts` commit message (61ab995): "Tokens stored server-side (in-memory), can migrate to Redis for production." Single-process Railway deployment makes this safe for now; a multi-instance deployment would lose tokens on round-robin.
- **How (the mechanism):** `const tokenStore = new Map<string, CSRFToken>()`. `server/utils/csrf.ts:15`.
- **Principles:** Surface, don't hide; Deliberate, explained differences.

### CSRF validation skips GET/HEAD/OPTIONS and unauthenticated requests
- **What it is:** The CSRF validator middleware passes through safe HTTP methods and requests that carry no authenticated identity (neither `req.user` nor `req.pilot`).
- **Why (the decisions):** GET/HEAD/OPTIONS cannot mutate state. Unauthenticated requests are already blocked by `requireAuth`; adding CSRF validation before auth would require a token before the user has a session, which is circular.
- **How (the mechanism):** `if (["GET","HEAD","OPTIONS"].includes(req.method)) return next()`. `if ((!user || !user.id) && (!pilot || !pilot.id)) return next()`. `server/middleware/csrf.ts:33–44`.
- **Principles:** One source of truth per rule.

### CSRF token delivery — response header `X-CSRF-Token`
- **What it is:** After every authenticated response, the server attaches the current CSRF token in the `X-CSRF-Token` header. The frontend reads it from there and sends it as `X-CSRF-Token` on subsequent mutations.
- **Why (the decisions):** [inferred] Embedding in the header (rather than requiring a dedicated fetch) means the token is refreshed on any page load or API read, without an extra round trip.
- **How (the mechanism):** `csrfTokenProvider` middleware: `res.setHeader("X-CSRF-Token", token)`. Applied to all `/api/` responses after auth. `server/middleware/csrf.ts:14–18`.
- **Principles:** One source of truth per rule.

### CSRF timing-safe comparison
- **What it is:** Token validation uses `crypto.timingSafeEqual` to prevent timing-based token oracle attacks.
- **Why (the decisions):** A naive `===` comparison short-circuits on the first differing byte, leaking how many characters of the token the attacker got right.
- **How (the mechanism):** `crypto.timingSafeEqual(Buffer.from(stored.token), Buffer.from(token))`. `server/utils/csrf.ts:41`.
- **Principles:** Assume the safest reading when context is missing.

---

## SSRF prevention

### URL allowlist — HTTP/HTTPS only; private IPs and credentials blocked
- **What it is:** Any server-side URL fetch (site guide scraping, YouTube metadata) is validated via `validateURLSafety()` before the request is made. Non-HTTP protocols, URLs with embedded credentials, localhost, private RFC-1918 addresses, IPv6 link-local/ULA, and cloud metadata endpoints are all rejected.
- **Why (the decisions):** Commit `9d2dcbc` states: "Prevents SSRF attacks on /api/sites/youtube-scrape and /api/ai endpoints." Without this, an admin could instruct the server to fetch internal Railway/AWS metadata APIs or internal services.
- **How (the mechanism):** Protocol allowlist `["http:", "https:"]`; `url.username || url.password` check; patterns for `127.x`, `10.x`, `172.16–31.x`, `192.168.x`, `169.254.x`, IPv6 `fc00::/7` and `fe80::/10`; explicit blocklist for `metadata.google.internal`, `169.254.169.254`, `0.0.0.0`, `255.255.255.255`. `server/utils/urlValidator.ts:17–91`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### SSRF localhost bypass — `DEV_ALLOW_LOCALHOST_URLS=true`
- **What it is:** In development, setting `DEV_ALLOW_LOCALHOST_URLS=true` allows fetching from localhost/private IPs with a debug log. In production the env var must be absent; the request is blocked and logged.
- **Why (the decisions):** Developers may need to test scraping against local mock servers. The explicit env var name and the log entry preserve the audit trail.
- **How (the mechanism):** `const allowLocalhostInDev = process.env.DEV_ALLOW_LOCALHOST_URLS === "true"`. `server/utils/urlValidator.ts:68–75`.
- **Principles:** Deliberate, explained differences; Surface, don't hide.

---

## SQL injection prevention

### Dynamic UPDATE columns must pass a whitelist (`buildSafeUpdateClauses`)
- **What it is:** Any route that builds a `SET` clause from user-supplied field names must pass them through `buildSafeUpdateClauses()`, which throws if any column name is not in the provided allowlist. Used for pilot profile updates and the TidyHQ contact import.
- **Why (the decisions):** Commit `6a8343a`: "Invalid column names now throw error at runtime instead of risking injection." Dynamic SQL with unvalidated column names cannot be fully parameterised by PostgreSQL — only values can be bound with `$N`, not identifiers.
- **How (the mechanism):** `allowedSet = new Set(allowedColumns); if (!allowedSet.has(clause.column)) throw new Error(…)`. Column names are also double-quoted in the output SQL. `server/utils/sqlBuilder.ts:20–40`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

---

## Input sanitisation

### General string fields capped at 1000 characters, angle brackets stripped
- **What it is:** The `validationMiddleware` applied globally strips `<` and `>` from all common string fields (`name`, `title`, `description`, `surname`, `organisation`, `position`, `notes`) and truncates them to 1000 characters before they reach any route handler.
- **Why (the decisions):** [inferred] Provides a coarse XSS pre-filter and prevents DB column overflow. The chosen fields are display-rendered; others (e.g., JSON blobs, IDs) are intentionally excluded and validated per-endpoint.
- **How (the mechanism):** `sanitizeString(str)` = `.replace(/[<>]/g, '').trim().substring(0, 1000)`. Applied via `app.use(validationMiddleware)`. `server/middleware/validation.ts:6–37`. `server.ts:192`.
- **Principles:** Assume the safest reading when context is missing.

### JSON request body hard-capped at 20 MB
- **What it is:** `express.json({ limit: '20mb' })` is the global body-parser limit. Large uploads use multipart (multer) routes which have their own per-route caps.
- **Why (the decisions):** [inferred] 20 MB accommodates large admin operations (bulk imports, base64-encoded images in JSON) while preventing trivially large payloads from crashing the server.
- **How (the mechanism):** `app.use(express.json({ limit: '20mb', … }))`. `server.ts:184`.
- **Principles:** Refuse rather than improvise at the edges.

### `/uploads/submissions` path hard-blocked
- **What it is:** Any direct HTTP request to `/uploads/submissions` returns HTTP 403, even though `/uploads` is otherwise served as static files.
- **Why (the decisions):** [inferred] Submissions (user-uploaded images pending moderation) must not be publicly accessible by URL — they have not been approved and may contain private content.
- **How (the mechanism):** `app.use("/uploads/submissions", (_req, res) => res.status(403).json({ error: "Access denied" }))` — registered before the `/uploads` static handler so it takes precedence. `server.ts:193–195`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

### Submission image target size — 1 MB, quality floor 30%
- **What it is:** Uploaded submission images are JPEG-recompressed until they are ≤1 MB; if quality reaches 30% and the file is still larger, it is stored at that quality floor.
- **Why (the decisions):** [inferred] 1 MB balances storage cost against visible quality; the 30% floor prevents producing unusable images when compressing very large originals.
- **How (the mechanism):** `MAX_IMAGE_BYTES = 1024 * 1024`; loop: `while (result.length > MAX_IMAGE_BYTES && quality > 30)`. `server/constants.ts:25`. `server/routes/submissions.ts:78, 91`.
- **Principles:** One source of truth per rule.

---

## Markdown sanitisation

### `style` attribute omitted from `rehype-sanitize` schema
- **What it is:** The `MarkdownRenderer` `sanitized` variant extends `rehype-sanitize`'s default schema to allow `div` and `span` tags, but deliberately does not add `style` to the attributes allowlist.
- **Why (the decisions):** Comment in source: "style intentionally omitted — rehype-raw + inline styles allow CSS overlay attacks." Inline CSS can be used to exfiltrate data (via CSS-based attribute selectors triggering background image fetches) and to visually spoof content (covering other UI elements).
- **How (the mechanism):** `attributes: { ...defaultSchema.attributes /* style omitted */ }`. The `sanitized` variant uses `[rehypeRaw, [rehypeSanitize, sanitizeSchema]]`. The `raw` variant uses `[rehypeRaw, rehypeSanitize]` (default schema, no `div`/`span`). The `plain` variant uses no rehype plugins. `src/components/MarkdownRenderer.tsx:6–31`.
- **Principles:** Refuse rather than improvise at the edges; Assume the safest reading when context is missing.

---

## Security response headers

### HTTP security headers applied to every response
- **What it is:** All API and HTML responses carry: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `X-XSS-Protection: 1; mode=block`, `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), microphone=(), camera=()`, and a `Content-Security-Policy`.
- **Why (the decisions):** Commit `5981d7e`: the headers were written during the hardening sprint but never imported; this commit inlines them so they actually ship. The geolocation policy is `(self)` rather than `()` because the SO proximity detector and map features require it on the club's own origin.
- **How (the mechanism):** Global middleware using `res.setHeader(…)` before any route handler. `server.ts:154–183`.
- **Principles:** Surface, don't hide; Assume the safest reading when context is missing.

### CSP `unsafe-inline` retained for script/style — known gap
- **What it is:** The Content-Security-Policy allows `'unsafe-inline'` for both `script-src` and `style-src`, neutralising CSP's XSS protection for inline code.
- **Why (the decisions):** Comment in the CSP: "unsafe-inline needed for React/Vite — replace with nonces when feasible." Vite's dev server injects inline scripts; the production build also produces inline style tags via Tailwind. Nonce-based CSP requires server-side render coordination not yet in place.
- **How (the mechanism):** `"script-src 'self' 'unsafe-inline'"`, `"style-src 'self' 'unsafe-inline'"` in the CSP array. `server.ts:166–167`.
- **Principles:** Surface, don't hide; Deliberate, explained differences.

### `frame-ancestors 'none'` — clickjacking prevention
- **What it is:** The CSP `frame-ancestors 'none'` directive (and the separate `X-Frame-Options: DENY` header) prevents any other origin from embedding the app in an `<iframe>`.
- **Why (the decisions):** [inferred] Clickjacking attacks load the target site invisibly inside a frame; `frame-ancestors 'none'` is the modern, CSP-based enforcement of this restriction.
- **How (the mechanism):** `"frame-ancestors 'none'"` in the CSP array plus `res.setHeader('X-Frame-Options', 'DENY')`. `server.ts:155, 179`.
- **Principles:** Assume the safest reading when context is missing.

---

## Admin route access control (client-side)

### SO sessions redirected away from the admin area at the route guard
- **What it is:** `AdminRoute` redirects an authenticated SO session to `/sites/:soSiteId` instead of rendering the admin UI.
- **Why (the decisions):** An SO user who navigates to `/admin` while in SO mode must not see the admin dashboard — their session token would be refused by the server anyway (see "SO-session blocks admin endpoints"), but the redirect provides a cleaner UX than a bare 403 and prevents confusion.
- **How (the mechanism):** `if (isSoSession) return <Navigate to={/sites/${soSiteId}} replace />`. `src/components/AdminRoute.tsx:22–24`.
- **Principles:** Surface, don't hide; Refuse rather than improvise at the edges.

---

## Pagination caps

### Default page size — 50; hard cap — 500
- **What it is:** List endpoints default to 50 results per page. Callers may request up to 500 but no more; values outside `[1, 500]` are clamped.
- **Why (the decisions):** An unbounded `LIMIT` on a large table (contacts, flights) would block the DB and produce arbitrarily large JSON payloads. 500 is generous enough for admin bulk operations (the expected high-end caller) without allowing full-table dumps in one call.
- **How (the mechanism):** `DEFAULT_LIMIT = 50`, `MAX_LIMIT = 500` in `server/constants.ts:7–8`. `getPaginationParams`: `limit = Math.max(1, Math.min(limit, MAX_LIMIT))`. `server/utils/pagination.ts:17–25`.
- **Principles:** Refuse rather than improvise at the edges; One source of truth per rule.

---

## Dev bypass

### `DEV_BYPASS_AUTH` disables all authentication server-side and client-side
- **What it is:** When `NODE_ENV=development` and `DEV_BYPASS_AUTH=true`, `requireAuth` and `requireSOOrAdmin` skip all checks and inject a synthetic "Dev Admin" user. The client-side `AuthContext` detects this via `/api/dev-mode` and auto-populates the same identity.
- **Why (the decisions):** Allows rapid front-end iteration without maintaining real credentials in dev. The bypass is explicitly gated on `NODE_ENV !== 'production'`; the server logs a loud warning if it fires.
- **How (the mechanism):** `isDevBypassActive() = process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH?.toLowerCase() === "true"`. `DEV_ADMIN_USER = { id: 0, name: "Dev Admin", …, isAdmin: true, isSafetyCommittee: false, soAuthorised: false }`. `server/middleware/auth.ts:13–17`. `src/contexts/AuthContext.tsx:53–61`.
- **Principles:** Deliberate, explained differences; Surface, don't hide.
