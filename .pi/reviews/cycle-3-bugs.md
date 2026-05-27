# Bug Review — Cycle 3
**Date:** 2026-05-24
**Reviewer:** Bugs & Logic Errors Agent

## Summary
- Total findings: 9
- CRITICAL: 1
- HIGH: 3
- MEDIUM: 4
- LOW: 1

---

## Finding B-1: XSS via Unsafe HTML Output in Events Page
- **Severity:** CRITICAL
- **File(s):** src/pages/Events.tsx
- **Lines:** 74
- **Code:**
```typescript
<div 
  className="text-foreground-secondary text-sm line-clamp-3 prose prose-sm max-w-none"
  dangerouslySetInnerHTML={{ __html: event.body }}
/>
```
- **Bug:** The Events page uses `dangerouslySetInnerHTML` with un-sanitized event.body content. TidyHQ events could potentially contain malicious JavaScript that gets executed when the page loads. The `__html` property directly injects content into the DOM without santization.
- **Impact:** Persistent XSS vulnerability that affects all users who view the Events page. Attackers could potentially inject malicious scripts via compromised TidyHQ events, leading to account takeover, data theft, or defacement. 
- **Confidence:** HIGH

---

## Finding B-2: Client-Side HTML Escape Function Vulnerability
- **Severity:** HIGH
- **File(s):** src/pages/DutyPilotMap.tsx, src/pages/RetrievalMap.tsx
- **Lines:** 15-19 in both files
- **Code:**
```typescript
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```
- **Bug:** The custom escapeHtml function is placed on the client side but relies on DOM manipulation. If the text string contains certain HTML entities or edge cases, this custom function might not provide the same level of protection as proven libraries. More importantly, this is a client-side solution to data that may have come from an untrusted source.
- **Impact:** Potential DOM-based XSS in pilot names or other user-generated data rendered in retrieval and duty maps. Even though the function creates the element in memory, if the resulting HTML isn't as expected, it may still inject malicious content.
- **Confidence:** HIGH

---

## Finding B-3: Improper Handling of User Input in SQL Query Construction
- **Severity:** HIGH
- **File(s):** server/routes/searchLogs.ts
- **Lines:** 16-23
- **Code:**
```typescript
let dataQuery = "SELECT id, search_type, query, response, created_at FROM search_logs";

  if (type !== "all") {
    countQuery += " WHERE search_type = ?";
    dataQuery += " WHERE search_type = ?";
    const countRow = await db.prepare(countQuery).get(type) as { total: number | string };
    const rows = await db.prepare(dataQuery + " ORDER BY created_at DESC LIMIT ? OFFSET ?").all(type, limit, offset);
```
- **Bug:** There is a SQL construction vulnerability where the `dataQuery` variable concatenates additional clauses. However, the constructed `dataQuery` string is combined with additional SQL text (`" ORDER BY created_at DESC LIMIT ? OFFSET ?"`) after the conditional WHERE clause is added. The resulting variable is then directly incorporated into query construction without being parameterized appropriately in all cases.
- **Impact:** If the SQL query construction is manipulated or if other portions of the code reuse `dataQuery` without careful parameterization, this could lead to SQL injection. More critically, user-provided search queries in the "search_logs" might expose sensitive data if crafted maliciously in combination with other vulnerabilities.
- **Confidence:** MEDIUM

---

## Finding B-4: SQL Injection in Dynamic Queries with IN Clause 
- **Severity:** HIGH
- **File(s):** server/routes/search.ts
- **Lines:** 1456-1457
- **Code:**
```typescript
const featureSettings = await db.prepare(`SELECT key, value FROM settings WHERE key IN (${featureKeys.map(() => "?").join(",")})`).all(...featureKeys) as SettingRow[];
```
- **Bug:** The featureKeys is a hardcoded array but any user-controlled modification to this area would be susceptible to injection. Though currently the featureKeys array is static, patterns like this in the code create future risks if the code is expanded with user inputs inadvertently flowing into key arrays. Additionally, settings queries generally should validate the requested keys more carefully.
- **Impact:** If featureKeys or similar arrays were to somehow incorporate user input in maintenance, this would create opportunity for injection. While the current implementation uses parameterization via the spread operator, the pattern of building queries this way is risky.
- **Confidence:** MEDIUM

---

## Finding B-5: Potential Regex Denial of Service in Date Parsing
- **Severity:** MEDIUM
- **File(s):** server/routes/search.ts
- **Lines:** 210-212
- **Code:**
```typescript
const MONTH_PAT = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const mdMatch = q.match(new RegExp(`\\b(${MONTH_PAT})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`));
const mRaw = mdMatch ? mdMatch[1] : (dmMatch ? dmMatch[2] : null);
```
- **Bug:** The date parsing regex uses nested optional groups and alternations, which can potentially exhibit catastrophic backtracking behaviors on specially crafted input strings designed to exploit the pattern.
- **Impact:** Attackers could craft search queries containing sequences designed to exploit the complex regex and cause the server to spend excessive CPU cycling in the regex engine, potentially leading to DoS.
- **Confidence:** MEDIUM

---

## Finding B-6: Inadequate Input Sanitization of Admin Session Binding Location Coordinates
- **Severity:** MEDIUM
- **File(s):** server/routes/auth.ts
- **Lines:** 116-117 and 135-138
- **Code:**
```typescript
const dist = haversineDistanceM(latitude, longitude, parseFloat(site.lat), parseFloat(site.lon));
```
- **Bug:** Although coordinates are validated via the haversine distance check, the admin binding process accepts client-side latitude/longitude values without server validation they are genuine coordinates. An attacker could potentially spoof their location by sending legitimate-looking but false coordinates with known location data they have collected or guessed.
- **Impact:** Allows unauthorized safety officers to bind to sites they are not physically at, potentially compromising safety controls that depend on physical presence validation. However, the proximity check does offer some protection.
- **Confidence:** HIGH

---

## Finding B-7: Insufficient Error Handling Could Lead to Data Exposure in Settings 
- **Severity:** MEDIUM
- **File(s):** server/routes/settings.ts
- **Lines:** 34-35
- **Code:**
```typescript
for (const [key, value] of Object.entries(settings)) {
  await update.run({ key, value: String(value) });
}
```
- **Bug:** The settings update loop does not validate individual keys or values during the transaction, potentially allowing invalid or harmful settings to be saved, particularly if the settings object contains unexpected or malicious key names. 
- **Impact:** Invalid settings could lead to system misconfigurations or expose sensitive configurations if malicious keys are allowed. The broad settings update may also allow overwriting of important system parameters with improper data.
- **Confidence:** MEDIUM

---

## Finding B-8: Potential Path Traversal in SQLite Migration Runner
- **Severity:** MEDIUM
- **File(s):** server/db.ts
- **Lines:** 75-80
- **Code:**
```typescript
const files = fs.readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
```
- **Bug:** When reading migrations from the filesystem, while the extension is filtered to .sql, there is no explicit sanitization to ensure files don't use relative path tricks like '../' to access unintended files outside the expected migration directory.
- **Impact:** If an attacker could place maliciously named files in the migration directory with traversal paths, they could potentially influence which migration scripts run. Although the filter helps, the fundamental path resolution could still be an attack vector.
- **Confidence:** LOW

---

## Finding B-9: Potential Security Issue with Dev-Mode Bypass Persistence  
- **Severity:** LOW
- **File(s):** src/contexts/PilotAuthContext.tsx
- **Lines:** 86-87
- **Code:**
```typescript
sessionStorage.removeItem("devBypassLoggedOut");
```
- **Bug:** The dev bypass logic has multiple paths that could allow persistence of developer bypass mechanisms in production environments if misconfigured. These are primarily intended for development but their presence in production code is a minor security concern.
- **Impact:** Developer features might accidentally be deployed to production, allowing unauthorized access bypass. Though the server has protections, client-server interactions might have subtle flaws related to bypass logic persistence.
- **Confidence:** LOW