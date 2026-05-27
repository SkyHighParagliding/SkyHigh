# Security Review — Cycle 1
**Date:** 2026-05-24
**Reviewer:** Security & Safety Agent

## Summary
- Total findings: 7
- CRITICAL: 2
- HIGH: 3
- MEDIUM: 2
- LOW: 0

---

## Finding S-1: Client-Supplied Location Data for Physical Access Control
- **Severity:** CRITICAL
- **File(s):** `server/routes/auth.ts`
- **Lines:** Lines 127-146
- **Code:**
  ```typescript
  const dist = haversineDistanceM(latitude, longitude, parseFloat(site.lat), parseFloat(site.lon));
  if (dist > SO_PROXIMITY_THRESHOLD_M) {
    return res.status(403).json({ error: "You must be within proximity of the site to log in as SO" });
  }
  
  const token = req.headers.authorization?.replace("Bearer ", "");
  await db.prepare("UPDATE admin_sessions SET soSiteId = ? WHERE token = ?").run(site.id, token);
  ```
- **Vulnerability:** The Safety Officer (SO) login mechanism relies solely on client-supplied latitude and longitude data for geographic verification, allowing a remote attacker to gain SO privileges by specifying any desired coordinates.
- **Attack Path:** An attacker can call the endpoint with valid login credentials and fabricated coordinates that match a target site's coordinates to bypass the proximity check, then gain SO-bound session tokens without being physically present.
- **Impact:** Critical safety risks due to unauthorized SO access. Attackers gain site operator privileges for paragliding sites (ability to mark as open/closed, access to site management), representing a direct safety threat to flyers. The SO role includes safety-sensitive controls that should only be available on-site.
- **Confidence:** HIGH

---

## Finding S-2: Insufficient Rate Limiting on Admin Login Endpoint
- **Severity:** HIGH
- **File(s):** `server/index.ts`, `server/routes/auth.ts`
- **Lines:** `server/index.ts` lines 183-185, `server/routes/auth.ts` lines 61-82
- **Code:**
  ```typescript
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Too many login attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Applied in server.ts:
  app.use("/api/auth/login", loginLimiter);

  // In auth.ts login handler:
  router.post("/login", asyncHandler(async (req, res) => {
    const { email, password, soLogin, soSiteId } = req.body;
    // ... validation
    let user: any;
    if (soLogin) {
      user = await db.prepare("SELECT * FROM contacts WHERE email = ? AND soAuthorised = 1 AND isSafetyCommittee = 1").get(email);
    } else {
      user = await db.prepare("SELECT * FROM contacts WHERE email = ? AND isAdmin = 1").get(email);
    }
  }));
  ```
- **Vulnerability:** The login endpoint has insufficient rate limiting (10 attempts per 15 minutes), and may only apply to the primary login path but not to pilot authentication.
- **Attack Path:** An attacker can perform brute-force attempts against admin or SO accounts with limited rate limiting, making credential enumeration feasible.
- **Impact:** Potential for unauthorized admin or SO access through credential guessing, leading to site control or sensitive data exposure.
- **Confidence:** HIGH

---

## Finding S-3: Missing Server-Side Validation of SO Authorization
- **Severity:** HIGH
- **File(s):** `server/routes/auth.ts`
- **Lines:** Lines 100-117
- **Code:**
  ```typescript
  // Only checks for SO auth and safety committee but not that
  // the user is actually authorized for the specified site
  if (soLogin) {
    user = await db.prepare("SELECT * FROM contacts WHERE email = ? AND soAuthorised = 1 AND isSafetyCommittee = 1").get(email);
  }
  
  // But no validation that this user is authorized for the particular site requested
  if (soLogin) {
    // Use a generic error message to prevent site ID enumeration
    if (!soSiteId) {
      return res.status(400).json({ error: "Missing or invalid site ID for SO login" });
    }
  }
  ```
- **Vulnerability:** The SO login does not validate that the user is authorized specifically for the requested site - only that they have general SO permissions. The code comment indicates awareness of this as it prevents site ID enumeration but doesn't verify relationship between user and site.
- **Attack Path:** A Safety Officer certified for one site could potentially access another site's control through SO login functionality.
- **Impact:** Cross-site SO elevation where users authorized for one site can act as SO for others where they lack appropriate authorization.
- **Confidence:** MEDIUM

---

## Finding S-4: Path Traversal Risk in Google Drive Integration
- **Severity:** MEDIUM
- **File(s):** `server/routes/documents.ts`, `server/googleDrive.ts`
- **Lines:** `server/routes/documents.ts` lines 179-193
- **Code:**
  ```typescript
  const subfolder = req.body.subfolder || "";
  
  const folderName = CATEGORY_FOLDERS.find(c => c.code === category)?.name || category;
  try {
    const base64Data = req.file.buffer.toString("base64");
    const subParam = subfolder ? `&subfolder=${encodeURIComponent(subfolder)}` : "";
    const response = await fetch(
      `${appScriptUrl}?action=upload&folder=${encodeURIComponent(folderName)}&name=${encodeURIComponent(req.file.originalname)}&mimeType=${encodeURIComponent(req.file.mimetype)}${subParam}`,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: base64Data,
      }
    );
  }
  ```
- **Vulnerability:** The subfolder parameter could allow path traversal in the Google Drive integration when used in constructing parameters for an external Google Apps Script service.
- **Attack Path:** By providing path traversal sequences in the subfolder field (../), an attacker could potentially upload to or access other Google Drive subdirectories.
- **Impact:** Unauthorized access to other Google Drive folders used by the club, potentially affecting document security.
- **Confidence:** MEDIUM

---

## Finding S-5: Information Disclosure Through Error Timing
- **Severity:** MEDIUM
- **File(s):** `server/routes/auth.ts`
- **Lines:** Lines 84-86
- **Code:**
  ```typescript
  let valid = false;
  if (isHashed(user.password)) {
    valid = await bcrypt.compare(password, user.password);
  } else if (process.env.ALLOW_PLAINTEXT_PASSWORDS === "true") {
    // ... further code with different timing characteristics
  }
  
  if (!valid) {
    return res.status(401).json({ error: "Invalid email or password" });
  }
  ```
- **Vulnerability:** Different timing characteristics between different password validation paths could reveal information about whether a password is properly hashed in the first place.
- **Attack Path:** An attacker could use timing-based attacks to differentiate between emails that exist and those that don't, especially in conjunction with the plaintext password allowance in dev mode.
- **Impact:** Account enumeration through blind timing attacks.
- **Confidence:** MEDIUM

---

## Finding S-6: Potential XSS via Markdown Content Rendering
- **Severity:** CRITICAL
- **File(s):** `src/components/ContentWidgets.tsx`, `src/components/MarkdownRenderer.tsx`, `src/pages/AdminPageEdit.tsx`, `server/routes/pages.ts`
- **Lines:** `ContentWidgets.tsx` lines 52-367
- **Code:**
  ```typescript
  const chunks: { type: "markdown" | "schools" | "telegram" | "committee" | "custom"; lines: string[]; tagName?: string }[] = [];
  // ... processing chunks from content in markdown field
  
  // In the screenshot replacement function:
  return `<div class="my-4"><img src="${entry.imagePath}" alt="${entry.name}" style="max-width:100%;border-radius:0.75rem;box-shadow:0 4px 6px -1px rgb(0 0 0 / 0.1)" /></div>`;
  
  // In processStyleSyntax function:
  result.push(`<div style="text-align:center;font-size:0.85rem;color:var(--color-caption);margin-top:-0.5rem;margin-bottom:1.5rem">${captionText}</div>`);
  
  // In buildCallout function:
  return `<div style="${styles[type] || styles.highlight}">
\n
${content}\n
\n</div>`;
  ```
- **Vulnerability:** The `ContentWidgets` component constructs HTML elements by string concatenation rather than DOM-safe methods. Content comes from markdown fields from admin users which are trusted but could still be misused maliciously. Inline style attribute values are inserted without adequate sanitization. The code manually constructs HTML with dynamic user values and embeds them directly into the DOM. The `escapeHtml()` function in line 241 is applied in certain scenarios but not consistently across all dynamic data flows.
- **Attack Path:** If an admin account is compromised, malicious HTML/JS could be embedded into dynamic pages or other content areas that use the `ContentWidgets` renderer. More seriously, if admin accounts enter malicious style content or if the settings contain unexpected content, it could allow script injection through style attributes (e.g. style="background:url(javascript:alert())") though this would largely be mitigated by `react-markdown` with `rehype-sanitize` that has limited style support. However, the XSS risk remains for specially formatted content through the callout, caption, and screenshot replacement features.
- **Impact:** Cross-site scripting when vulnerable content is viewed by other users with potential to steal credentials, modify data unexpectedly or deface the site. Given this affects page content and settings, it impacts all site visitors.
- **Confidence:** HIGH

---

## Finding S-7: CSRF Token Validation Gap
- **Severity:** HIGH
- **File(s):** `server/middleware/csrf.ts`, `server/index.ts`
- **Lines:** `server/middleware/csrf.ts` lines 28-47
- **Code:**
  ```typescript
  export function csrfTokenValidator(req: Request, res: Response, next: NextFunction) {
    // Skip validation for safe HTTP methods
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }
  
    const user = (req as any).user;
    const pilot = (req as any).pilot;
    
    // Unauthenticated requests don't need CSRF validation (handled by requireAuth)
    // Pilot-authenticated routes still need CSRF.
    if ((!user || !user.id) && (!pilot || !pilot.id)) {
      return next();
    }
  
    // Get CSRF token from request (try multiple locations)
    const tokenFromHeader = req.headers["x-csrf-token"] as string;
    const tokenFromBody = (req.body as any)?.csrfToken as string;
    const token = tokenFromHeader || tokenFromBody;
  
    const userId = user?.id ?? pilot?.id;
  
    if (!token) {
      log.warn(`Missing CSRF token from ${userId} on ${req.method} ${req.path}`);
      return res.status(403).json({ error: "CSRF token required" });
    }
  
    if (!validateCSRFToken(userId, token)) {
      log.warn(`Invalid CSRF token from ${userId} on ${req.method} ${req.path}`);
      return res.status(403).json({ error: "Invalid CSRF token" });
    }
  
    next();
  }
  ```
- **Vulnerability:** The CSRF middleware correctly validates tokens on state-changing requests, but it relies on auth middleware to run first. If routes have misordered middleware or if there are any public endpoints that accept state changes, they could bypass CSRF protections. More concerning, if a route has an auth bypass in development mode (`isDevBypassActive()`), CSRF validation is skipped implicitly since the user becomes authenticated without needing to provide a token.
- **Attack Path:** An attacker could leverage the DEV_BYPASS_AUTH functionality in development environments to bypass CSRF protections when modifying resources. Furthermore, any unauthenticated endpoint that accepts modifications after the CSRF middleware could be exploited.
- **Impact:** State changes without CSRF verification, leading to potential forced actions on behalf of authenticated users if in a real scenario where auth bypass wasn't present.
- **Confidence:** MEDIUM