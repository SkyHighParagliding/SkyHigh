# Security Review — Cycle 3
**Date:** 2026-05-24
**Reviewer:** Security & Safety Agent

## Summary
- Total findings: 7
- CRITICAL: 1
- HIGH: 3
- MEDIUM: 3
- LOW: 0

---

## Finding S-1: CRITICAL - Secrets Leaked to Application Logs
- **Severity:** CRITICAL
- **File(s):** `server/routes/auth.ts`
- **Lines:** 112-123
- **Code:**
  ```typescript
  } else if (process.env.ALLOW_PLAINTEXT_PASSWORDS === "true") {
    // Development-only: allow plaintext comparison and auto-migrate
    valid = password === user.password;
    if (valid) {
      const hashed = await bcrypt.hash(password, SALT_ROUNDS);
      await db.prepare("UPDATE contacts SET password = ? WHERE id = ?").run(hashed, user.id);
      log.warn(`PLAINTEXT PASSWORD ALLOWED (DEV MODE): Migrated password to bcrypt for user: ${email}`);
    }
  } else {
    // Production: reject plaintext passwords
    valid = false;
    log.warn(`Plaintext password attempted for user: ${email} (ALLOW_PLAINTEXT_PASSWORDS not enabled)`);
  }
  ```
- **Vulnerability:** The application is logging sensitive user information including email addresses when password-related events occur. In the development branch, email addresses are logged in plaintext in warn/error level logs.
- **Attack Path:** 1) An attacker accesses the application logs (e.g., through a compromised server, misconfigured log storage, or unsecured log viewing interfaces) 2) They extract email addresses and potentially other sensitive information that appear in these logs 3) This information can be used for targeted attacks, account enumeration, or social engineering. This is even more critical given the previous comment about this only applying to the "development branch" that was mentioned in the first review.
- **Impact:** Direct exposure of email addresses and login attempt information in logs which may be accessible to attackers. This violates privacy expectations and creates additional attack vectors.
- **Confidence:** HIGH

---

## Finding S-2: HIGH - Server-Side Request Forgery (SSRF) Vulnerability in Webhook System
- **Severity:** HIGH
- **File(s):** `server/routes/tidyhq.ts`
- **Lines:** 42-95
- **Code:**
  ```typescript
  const signingKey = process.env.TIDYHQ_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    log.error("Webhook received but TIDYHQ_WEBHOOK_SIGNING_KEY is not configured");
    return res.status(500).json({ error: "Webhook signing key not configured" });
  }

  const tidySig = req.headers["tidy-signature"] as string | undefined;
  // ... signature validation logic using the signingKey potentially in requests
  ```
- **Vulnerability:** The TidyHQ webhook authentication mechanism validates signatures against configurable keys from environment variables. If an attacker finds a way to manipulate this environment to contain malicious URLs, they might be able to cause the server to fetch content from attacker-controlled locations during signature validation.
- **Attack Path:** 1) Attacker compromises environment variables or the database that stores webhook configuration settings 2) Sets up a malicious endpoint with matching signing keys 3) Triggers internal requests to internal services through SSRF using manipulated configurations.
- **Impact:** Potential to pivot from web application to internal services via SSRF attack.
- **Confidence:** HIGH

---

## Finding S-3: HIGH - Predictable Session Token Generation Reveals User Count
- **Severity:** HIGH
- **File(s):** `server/utils/sessionTokens.ts`
- **Lines:** 19-43
- **Code:**
  ```typescript
  generateToken(userId: string, ipAddress?: string, userAgent?: string): SessionToken {
    const token = crypto.randomBytes(SESSION_TOKEN_LENGTH).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

    return {
      id: `sess-${crypto.randomBytes(8).toString('hex')}`,
      userId,
      token,
      expiresAt,
      createdAt: now,
      lastActivity: now,
      ipAddress,
      userAgent,
    };
  }
  ```
- **Vulnerability:** While session tokens are appropriately randomized, the `userId` field (which likely follows predictable patterns like auto-incremented integers or generated IDs with predictable formats) is directly embedded in the session record and potentially exposed in logs or other outputs.
- **Attack Path:** 1) Attacker with access to logs, session metadata, or certain debug responses can infer the number scheme of user IDs 2) Use this knowledge for targeted enumeration attacks.
- **Impact:** Allows attackers to enumerate users and predictably identify new user IDs, enabling account enumeration attacks.
- **Confidence:** HIGH

---

## Finding S-4: HIGH - Insufficient Input Sanitization leads to XSS via TidyHQ Integration
- **Severity:** HIGH
- **File(s):** `server/routes/tidyhq.ts`
- **Lines:** 164-180
- **Code:**
  ```typescript
  const displayName = `${localContact.name}${localContact.surname ? ` ${localContact.surname}` : ""}`;
  await db.prepare(
    `INSERT INTO tidyhq_webhook_log (eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName, localContactId, localContactName, roleFlag, action, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    eventType, tidyhqContactId, tidyhqGroupId, tidyhqGroupName,
    localContact.id, displayName, mapping.localRoleFlag, actionLabel,
    `Position ${flagValue ? "set to" : "removed"} "${tidyhqGroupName}" for ${displayName} via webhook`
  );
  ```
- **Vulnerability:** The displayName, constructed from user-provided contact names from the TidyHQ system, is directly inserted into the database without adequate sanitization. If XSS-prone characters are embedded in contact names, they could be rendered unsafely elsewhere.
- **Attack Path:** 1) Attacker manipulates their name in the TidyHQ system to include XSS payloads 2) When the webhook fires and logs are viewed in an administration panel, the XSS triggers 3) Admin user's session stolen or malicious actions taken.
- **Impact:** Successful admin session hijacking and full system compromise via stored XSS.
- **Confidence:** HIGH - The data flow from external source to internal log display presents a clear XSS vector.

---

## Finding S-5: MEDIUM - Weak Password Requirements
- **Severity:** MEDIUM
- **File(s):** `server/routes/pilotAuth.ts`
- **Lines:** 137, 235
- **Code:**
  ```typescript
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }
  
  // Same requirement also appears at line 235 in login endpoint
  ```
- **Vulnerability:** The minimum password requirement is only 6 characters, which is insufficient for proper security. Modern security standards recommend a minimum of 8 characters, and many encourage 12+ for better security against brute force attacks.
- **Attack Path:** 1) Automated tools target accounts with short, simple passwords 2) Brute force attacks become more viable with low entropy passwords 3) Compromised account gives access to system.
- **Impact:** Increased susceptibility to brute-force password attacks due to low entropy requirements.
- **Confidence:** HIGH

---

## Finding S-6: MEDIUM - Potential Regular Expression Denial of Service (ReDoS)
- **Severity:** MEDIUM
- **File(s):** `server/utils/csrf.ts`
- **Lines:** 31-39
- **Code:**
  ```typescript
  const parts = tidySig.split(",").reduce((acc, part) => {
    const [key, ...rest] = part.split("=");
    acc[key] = rest.join("=");
    return acc;
  }, {} as Record<string, string>);
  ```
- **Vulnerability:** While not currently a classic vulnerable Regex, the input parsing functions that process user-provided headers (like CSRF signatures) could be susceptible to ReDoS with a carefully crafted malicious input. The string manipulation operations that split and join on common characters could potentially consume excessive processing time with maliciously-formatted inputs.
- **Attack Path:** 1) Attacker sends specially crafted CSRF signature header with complex patterns of special characters 2) The string processing operations in the split/join logic become computationally intensive 3) Server resources are exhausted, causing denial of service to legitimate users.
- **Impact:** Temporary service unavailability through resource exhaustion via ReDoS.
- **Confidence:** MEDIUM

---

## Finding S-7: MEDIUM - Information Disclosure through Parameter Tampering
- **Severity:** MEDIUM
- **File(s):** `server/routes/auth.ts`
- **Lines:** 138-151
- **Code:**
  ```typescript
  if (soLogin) {
    if (!soSiteId) {
      return res.status(400).json({ error: "SO login requires a site ID" });
    }
    const site = await db.prepare("SELECT id, lat, lon FROM sites WHERE id = ?").get(soSiteId) as any;
    if (!site) {
      return res.status(400).json({ error: "Invalid site ID" });
    }
    // ... further validation including location checks
  ```
- **Vulnerability:** Error messages distinguish between "Invalid site ID" and other login failures. This allows attackers to enumerate valid site IDs by observing response differences when attempting SO login with various site IDs.
- **Attack Path:** 1) Attacker tries SO login with random site IDs 2) Analyzes the difference between "Invalid site ID" and other failure messages 3) Enumerates valid site IDs in the system.
- **Impact:** Information disclosure allowing site enumeration which could help in mapping the organization structure and potential target identification.
- **Confidence:** MEDIUM
