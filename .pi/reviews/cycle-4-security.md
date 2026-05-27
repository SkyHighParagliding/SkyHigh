# Security Review — Cycle 4
**Date:** 2026-05-24
**Reviewer:** Security & Safety Agent

## Summary
- Total findings: 4
- CRITICAL: 1
- HIGH: 1
- MEDIUM: 2
- LOW: 0

---

## Finding S-1: Path Traversal in Site Map Image Download from External Sources
- **Severity:** CRITICAL
- **File(s):** `server/utils/essentialInfo.ts`
- **Lines:** Lines 34-39
- **Code:**
```typescript
const filename = `essential-${siteId}-${i + 1}.${ext}`;
const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
const savedUrl = await saveFile(buf, StorageKey.essential(filename), contentType);
```
- **Vulnerability:** When downloading images from external sites (siteguide.org.au), the filename is constructed using user-controlled `siteId` parameter concatenated directly without proper validation or sanitization. The `siteId` originates from the route parameter in the calling code and passes through `POST /api/sites/:id/scrape-essential-info`, meaning an attacker with site edit privileges could potentially control the `siteId` which is used to construct the filename.
- **Attack Path:** 1) Attacker gains access to site editing capabilities (either legitimately or through another compromise) 2) They create or modify a site with an ID that contains path traversal characters (e.g., `../../../../important-system-file`) 3) They submit a request to trigger the essential info scraping 4) The resulting filename will contain the traversal path, allowing writing to sensitive locations on the local filesystem when saved in development mode (local storage mode) 5) On cloud deployment, it could still potentially affect how objects are stored in R2.
- **Impact:** Ability to write files to arbitrary locations on the filesystem in development mode, potentially overwriting critical configuration files, environment files, or application code. Even in production with R2, malicious filenames could corrupt the storage structure.
- **Confidence:** HIGH

---

## Finding S-2: Insecure Processing of User-Agents for Admin Authentication Bypass
- **Severity:** HIGH
- **File(s):** `server/middleware/auth.ts`
- **Lines:** Lines 7-8
- **Code:**
```typescript
export function isDevBypassActive(): boolean {
  return process.env.DEV_BYPASS_AUTH?.toLowerCase() === "true";
}
```
- **Vulnerability:** The codebase has a development authentication bypass that when enabled (DEV_BYPASS_AUTH=true) grants administrative access to all users making requests to the system. While this is supposed to be limited to development, there's risk of accidental deployment to staging or production with this setting enabled, providing instant administrative access to any user.
- **Attack Path:** 1) Configuration management error or deployment automation that sets DEV_BYPASS_AUTH=true in non-dev environments 2) Any attacker sending requests to the server gains immediate full admin access without authentication 3) Complete database compromise, modification of club information, flight records, member data.
- **Impact:** Complete bypass of access control mechanisms resulting in full administrative access to the system without authentication, enabling full data manipulation and deletion.
- **Confidence:** HIGH

---

## Finding S-3: Inadequate Input Validation in Site ID Generation During Bulk Import
- **Severity:** MEDIUM
- **File(s):** `server/routes/sites/bulkImport.ts`
- **Lines:** Lines 203-204
- **Code:**
```typescript
const siteId = (aiData.name || externalSite.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
```
- **Vulnerability:** During the bulk import process, site IDs are generated from external data (from siteguide.org.au) but the sanitization is insufficient. While the current sanitization replaces non-alphanumeric characters with hyphens, it could still result in site IDs that have unexpected behavior. More critically, the sanitized ID is then used in file names when fetching essential info images (through the `siteId` parameter in essentialInfo.ts), creating a potential path traversal.
- **Attack Path:** 1) Attacker modifies data on siteguide.org.au that gets scraped during the bulk import process to contain crafted site names 2) The sanitized site name could produce problematic file paths if external data contains specific malicious character sequences 3) When images are downloaded and stored with the generated site ID, this could lead to improper filesystem access.
- **Impact:** Potential path traversal in bulk import feature if the sanitization is inadequate to protect against maliciously crafted external site names that pass through the `/[^a-z0-9]+/g` replacement.
- **Confidence:** MEDIUM

---

## Finding S-4: Sensitive Information in Application Logs
- **Severity:** MEDIUM
- **File(s):** `server/routes/auth.ts`
- **Lines:** Lines 76, 479
- **Code:**
```typescript
log.warn(`PLAINTEXT PASSWORD ALLOWED (DEV MODE): Migrated password to bcrypt for user: email_hash:${Buffer.from(email).toString('base64').substring(0, 10)}`);
log.info(`User logged in: email_hash:${Buffer.from(email).toString('base64').substring(0, 10)}${boundSiteId ? `(SO session for site: ${boundSiteId})` : ''}`);
```
- **Vulnerability:** The application logs include email information (even partially obscured) in warning and debug statements. While using a hash or base64 of the email reduces exposure, this still discloses partial user information in logs, and in production systems logs should be safeguarded from leaking sensitive information like user identities.
- **Attack Path:** 1) Attacker gains access to application logs through system compromise, misconfigured log aggregation or exposed log files 2) Gather information about user activity and partial email addresses 3) Use this information for reconnaissance for further attacks or privacy violations
- **Impact:** Exposure of partial personal information about user login patterns and email addresses in application logs
- **Confidence:** HIGH - The code clearly implements logging with email-derived information

---