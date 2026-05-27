# Coordinator Fix Plan — Cycle 4
**Date:** 2026-05-24
**Coordinator:** Review Coordination Agent

## Triage Summary
- Total findings across all 5 reviewers: 44
  - Bugs: 14 findings (10 VALID, 4 REJECTED)
  - Duplication: 8 findings (7 VALID, 1 REJECTED) 
  - Security: 4 findings (4 VALID)
  - Performance: 12 findings (11 VALID, 1 REJECTED)
  - Database (Dual-DB): 6 findings (6 VALID)
- VALID: 38
- REJECTED: 5 (with reasons listed below)
- Merged duplicates: 3 pairs

---

## REJECTED Findings
| Finding | Reviewer | Reason |
|---------|----------|--------|
| B-1 | Bugs | While dynamic ORDER BY could be risky, the specific cited line uses static parameters only - the code in server/routes/sites/crud.ts does not construct the ORDER BY clause from user inputs |
| DB-9 | Database | String concatenation patterns like the hypothetical example do exist but weren't actually found in real code. No concrete examples identified. |
| P-12 | Performance | The search algorithm implementation is acceptable for current dataset size and performs well with caching |
| D-23 | Duplication | Environment variable handling is appropriately distributed with sensible fallbacks - the pattern follows best practices |
| P-5 | Performance | The transform key calculation occurs in animation loop but the performance impact is minimal on reasonable hardware |

---

## Borderline Findings (Optional)
| Finding | Reviewer | Why Borderline |
|---------|----------|----------------|
| P-2 | Performance | The wind interpolation complexity is high but may be necessary for visual quality |
| P-3 | Performance | Particle physics calculations are intensive but user-controlled via UI settings |

---

## Fix Plan (Prioritized)

### P-001: Path Traversal in Essential Info Image Download — S-1, DB-1
- **Priority:** P0
- **Source Reviewers:** Security, Database
- **Original Severity:** CRITICAL
- **Verified:** Confirmed in server/utils/essentialInfo.ts lines 34-39, filename uses unsanitized siteId parameter
- **Dual-DB Risk:** YES — The vulnerability affects file storage which may behave differently across SQLite vs PostgreSQL environments
- **Files:** server/utils/essentialInfo.ts
- **Lines:** 34-39
- **Description:** The filename for essential info images incorporates unsanitized siteId from route parameters, allowing path traversal in development mode and potentially compromising R2 storage in production
- **Fix Instructions:** Implement robust file name validation and sanitization using path.normalize and ensuring the resolved path stays within the intended directory. Use only alphanumeric characters and hyphens in filenames
- **Test Guidance:** Test file access with malicious site IDs like "../../../etc/passwd" and verify they're properly sanitized

### P-002: Race Condition in Rate Limiting Memory Management — B-4
- **Priority:** P0
- **Source Reviewers:** Bugs
- **Original Severity:** CRITICAL
- **Verified:** Confirmed in server/routes/pilotAuth.ts lines 21-34, Map never cleared of expired entries leading to perpetual memory accumulation
- **Dual-DB Risk:** NO
- **Files:** server/routes/pilotAuth.ts
- **Lines:** 21-34
- **Description:** The pilotRateLimitMap in pilotAuth.ts never cleans up expired entries properly, causing indefinite memory expansion
- **Fix Instructions:** Add periodic cleanup mechanism (e.g., a setInterval that clears entries older than the window period every 10-30 seconds, and/or remove entries proactively during access)
- **Test Guidance:** Should reduce memory growth over time and clear old entries proactively

### P-003: IDOR Vulnerability in Flight Tracking — B-3
- **Priority:** P0
- **Source Reviewers:** Bugs
- **Original Severity:** CRITICAL  
- **Verified:** Confirmed in server/routes/flights.ts lines 74-91 and server/services/realFlightService.ts lines 135-150, lacks sufficient access controls when using session tokens
- **Dual-DB Risk:** NO
- **Files:** server/routes/flights.ts, server/services/realFlightService.ts
- **Lines:** 74-91 (routes), 135-150 (services)
- **Description:** Users with valid session tokens can potentially access other flights by manipulating route parameters with insufficient ownership verification
- **Fix Instructions:** Add explicit flight ownership check within the getFlightWithBreadcrumbs method to ensure session token is authorized to access the requested flight ID
- **Test Guidance:** Verify only users authorized for a specific flight can retrieve that flight's data with session token

### P-004: Insecure DEV_BYPASS_AUTH Setting — S-2
- **Priority:** P0
- **Source Reviewers:** Security
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/middleware/auth.ts lines 7-8, development bypass grants admin access when enabled
- **Dual-DB Risk:** NO
- **Files:** server/middleware/auth.ts
- **Lines:** 7-8
- **Description:** The DEV_BYPASS_AUTH flag grants full admin access and poses risk if deployed accidentally to non-development environments
- **Fix Instructions:** Add additional checks to ensure this bypass is only active in development environments by verifying NODE_ENV or a specific DEVELOPMENT environment flag
- **Test Guidance:** Verify bypass only activates when in development environment with appropriate safeguards

### P-005: Timing Attack on Authentication Endpoints — B-5
- **Priority:** P1
- **Source Reviewers:** Bugs
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/routes/pilotAuth.ts lines 48-72, code returns early when email not found, avoiding bcrypt comparison
- **Dual-DB Risk:** NO
- **Files:** server/routes/pilotAuth.ts
- **Lines:** 48-72
- **Description:** Authentication endpoint reveals account existence through timing difference when bcrypt.compare is skipped for nonexistent emails
- **Fix Instructions:** Always execute bcrypt.compare even for nonexistent emails by comparing against a dummy hashed password to maintain consistent timing
- **Test Guidance:** Ensure response times remain consistent regardless of email validity

### P-006: Stored XSS in Site Data Display — B-2
- **Priority:** P1
- **Source Reviewers:** Bugs
- **Original Severity:** CRITICAL
- **Verified:** Confirmed in src/components/weather/WeatherCardClassic.tsx line 12 and src/components/weather/WeatherCardApple.tsx line 27, direct rendering of site.name without sanitization
- **Dual-DB Risk:** NO
- **Files:** src/components/weather/WeatherCardClassic.tsx, src/components/weather/WeatherCardApple.tsx
- **Lines:** 12 (Classic), 27 (Apple)
- **Description:** Site names are rendered directly as HTML, enabling stored XSS when site managers inject malicious scripts
- **Fix Instructions:** Sanitize site name using DOMPurify or similar before displaying, and encode HTML entities to prevent script execution
- **Test Guidance:** Attempt to enter script in site name and verify it does not execute

### P-007: Session Token in URL — B-8  
- **Priority:** P1
- **Source Reviewers:** Bugs
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/routes/flights.ts line 78 and server/services/realFlightService.ts line 136, accepting sessionToken via URL query parameters
- **Dual-DB Risk:** NO
- **Files:** server/routes/flights.ts, server/services/realFlightService.ts
- **Lines:** 78 (routes), 136 (services)
- **Description:** Session tokens are accepted in URL parameters, exposing them in logs, browser history, and referrer headers
- **Fix Instructions:** Enforce that session tokens are only accepted through secure HTTP headers, rejecting query parameter versions
- **Test Guidance:** Verify URL tokens are rejected while header tokens remain functional

### P-008: Path Traversal in Image Serving — B-6
- **Priority:** P1
- **Source Reviewers:** Bugs  
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/routes/submissions.ts lines 273-287, incomplete path traversal sanitization in resolveSubmissionPath function
- **Dual-DB Risk:** NO
- **Files:** server/routes/submissions.ts
- **Lines:** 273-287
- **Description:** Path traversal sequences like '/../' may persist in file paths despite basic slash removal
- **Fix Instructions:** Implement thorough path sanitization using path.resolve and ensuring resolved path remains within intended root directory
- **Test Guidance:** Test with malicious file paths containing traversal sequences and verify they're blocked

### P-009: Incomplete JSON Type Handling — DB-6
- **Priority:** P1
- **Source Reviewers:** Database
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/services/realFlightService.ts and server/routes/sites/crud.ts, JSON strings handled inconsistently across backends
- **Dual-DB Risk:** YES — PostgreSQL has native JSON handling while SQLite treats as text
- **Files:** server/services/realFlightService.ts, server/routes/sites/crud.ts
- **Lines:** Multiple
- **Description:** JSON fields handled differently between SQLite and PostgreSQL backends, leading to potential serialization differences
- **Fix Instructions:** Implement consistent JSON parsing/sanitization at the domain level before database operations, with appropriate type conversion for both backends
- **Test Guidance:** Verify JSON fields maintain consistent format and validation across both database platforms

### P-010: Critical SQL Conversion Flaws in Dual DB System — DB-7, DB-11
- **Priority:** P1
- **Source Reviewers:** Database
- **Original Severity:** HIGH, CRITICAL
- **Verified:** Confirmed in server/pgDb.ts lines 169-253, complex query conversion issues may cause different behavior in production
- **Dual-DB Risk:** YES — This is specifically about dual DB inconsistency
- **Files:** server/pgDb.ts
- **Lines:** 169-253 (conversion logic)
- **Description:** INSERT OR REPLACE queries may not translate correctly, and TIMESTAMP conversions could differ between SQLite and PostgreSQL
- **Fix Instructions:** Enhance the conversion logic to properly handle all INSERT OR clauses for known table structures, and improve datetime function mapping
- **Test Guidance:** Run queries against both database engines and verify consistent behavior

### P-011: Parameter Binding Type Issues — DB-10
- **Priority:** P1
- **Source Reviewers:** Database
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/pgDb.ts parameter binding logic, potential issues with complex queries
- **Dual-DB Risk:** YES — Different paramaterization approaches between SQLite and PostgreSQL
- **Files:** server/pgDb.ts
- **Lines:** Parameter handling in toPostgresParams function
- **Description:** Parameter substitution may not handle complex SQL queries correctly, leading to binding index issues
- **Fix Instructions:** Improve parameter parsing to properly handle complex nested query structures and maintain parameter order consistency
- **Test Guidance:** Test parameter binding with complex queries and verify consistent behavior across platforms

### P-012: Memory Leaks from Flight Tracker Interval Management — P-8
- **Priority:** P1
- **Source Reviewers:** Performance
- **Original Severity:** HIGH
- **Verified:** Confirmed in src/hooks/useFlightTracker.ts lines 550-590, improper interval cleanup during component unmount
- **Dual-DB Risk:** NO
- **Files:** src/hooks/useFlightTracker.ts
- **Lines:** 550-590
- **Description:** Multiple timers and intervals not consistently cleared on component unmount leading to memory leaks
- **Fix Instructions:** Review the cleanup function in useEffect to ensure all timer and interval references are cleared during cleanup
- **Test Guidance:** Monitor component unmount and verify intervals are properly cleared from memory

### P-013: Critical Race Condition in Flight Updates — B-7
- **Priority:** P1
- **Source Reviewers:** Bugs
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/services/realFlightService.ts lines 66-91, race condition between read and verification of flight ownership
- **Dual-DB Risk:** NO
- **Files:** server/services/realFlightService.ts
- **Lines:** 66-91
- **Description:** Between reading flight data and verifying ownership, another request could alter flight state
- **Fix Instructions:** Consolidate read and verification check into a single atomic operation or use database locking to prevent race conditions
- **Test Guidance:** Ensure flight data changes only occur when requester still owns the flight

### P-014: Excessive Geolocation Updates and Network Load — P-9
- **Priority:** P-2
- **Source Reviewers:** Performance
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in src/hooks/useFlightTracker.ts and src/hooks/useRetrievalStatus.ts, location updates every 15-60 seconds creating significant network traffic
- **Dual-DB Risk:** NO
- **Files:** src/hooks/useFlightTracker.ts, src/hooks/useRetrievalStatus.ts
- **Lines:** 515-540 (tracker), 168-175 (status)
- **Description:** Frequent location updates generate numerous small HTTP requests creating server load during peak times
- **Fix Instructions:** Implement batching of location updates or increase update intervals during periods of low movement
- **Test Guidance:** Reduce network requests without degrading location tracking accuracy significantly

### P-015: Database Connection Bottleneck — P-8
- **Priority:** P-2
- **Source Reviewers:** Performance
- **Original Severity:** MEDIUM  
- **Verified:** Confirmed in server/db.ts lines 23-40, singleton pattern creating potential bottleneck for high-traffic scenarios
- **Dual-DB Risk:** YES — Different connection handling for SQLite vs PostgreSQL
- **Files:** server/db.ts
- **Lines:** 23-40
- **Description:** Database singleton could cause performance bottlenecks under high concurrent load
- **Fix Instructions:** Enhance connection pooling and consider implementing separate connection pools for read versus write operations
- **Test Guidance:** Stress test with concurrent requests across both database engines

### P-016: Inefficient Search Context Building Leading to Memory Issues — P-7
- **Priority:** P-2
- **Source Reviewers:** Performance
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in server/routes/search.ts lines 190-300, loading all sites into single large context object
- **Dual-DB Risk:** NO
- **Files:** server/routes/search.ts
- **Lines:** 190-300
- **Description:** Builds full site and weather data context for each search, creating large objects in memory
- **Fix Instructions:** Implement more targeted search data fetch and use pagination/indexing to reduce memory footprint of results
- **Test Guidance:** Optimize memory usage during heavy search workload

### P-017: Weak Password Requirements — B-10
- **Priority:** P-2
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in server/routes/pilotAuth.ts lines 32-36, only 6 character minimum with no complexity requirements
- **Dual-DB Risk:** NO
- **Files:** server/routes/pilotAuth.ts
- **Lines:** 32-36
- **Description:** Minimum password requirement of only 6 characters increases vulnerability to brute force attacks  
- **Fix Instructions:** Increase minimum to 8-12 characters and add complexity requirements (uppercase, lowercase, numbers, symbols)
- **Test Guidance:** Verify enhanced password validation works and prevents weak passwords

### P-018: Unbounded Local Storage for Flight Tracking — P-10
- **Priority:** P-2
- **Source Reviewers:** Performance
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in src/hooks/useFlightTracker.ts, local IndexedDB storage could accumulate indefinitely for abandoned flights
- **Dual-DB Risk:** NO
- **Files:** src/hooks/useFlightTracker.ts
- **Lines:** Throughout
- **Description:** Flight breadcrumbs store locally with no automatic expiry for incomplete or abandoned flights
- **Fix Instructions:** Implement automatic cleanup for local flight data older than reasonable timeframe (perhaps 3-7 days)
- **Test Guidance:** Verify old local flight data gets cleaned up automatically while preserving ongoing flights

### P-019: Open Redirect Vulnerability — B-13
- **Priority:** P-2
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM  
- **Verified:** Confirmed in server/routes/pages.ts lines 117-129, URL redirection from user-controllable stored references
- **Dual-DB Risk:** NO
- **Files:** server/routes/pages.ts
- **Lines:** 117-129
- **Description:** File download handler performs unsafe redirects when stored references are external URLs
- **Fix Instructions:** Whitelist allowed redirect destinations or eliminate the redirect functionality
- **Test Guidance:** Verify no external redirects occur from user-controlled input

### P-020: Inadequate Input Validation on Site Name Sanitization — S-3
- **Priority:** P-2
- **Source Reviewers:** Security
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in server/routes/sites/bulkImport.ts lines 203-204, insufficient sanitization for external site name data that becomes site ID
- **Dual-DB Risk:** NO
- **Files:** server/routes/sites/bulkImport.ts
- **Lines:** 203-204
- **Description:** Sanitization process in bulk import may allow path traversal if external names are crafted maliciously
- **Fix Instructions:** Enhance sanitization to strictly validate resulting site IDs and ensure they conform to safe, predictable format
- **Test Guidance:** Validate that crafted external site names do not produce harmful site identifiers

### P-021: Inconsistent Form Validation Logic — D-20
- **Priority:** P-2
- **Source Reviewers:** Duplication
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in multiple admin form components using scattered validation logic with inconsistent patterns
- **Dual-DB Risk:** NO
- **Files:** src/pages/AdminSiteEdit.tsx, src/pages/AdminProjectEdit.tsx, src/pages/AdminDocumentEdit.tsx, src/pages/AdminNewsEdit.tsx
- **Lines:** Individual validation logic per form
- **Description:** Each admin form has custom validation logic that duplicates basic rules and leads to inconsistency
- **Fix Instructions:** Create shared validation utility or hook with reusable validation rules, and refactor forms to use centralized validators
- **Test Guidance:** Update all forms consistently and verify uniform validation behavior across all admin interfaces

### P-022: Unnecessary Image Processing Duplication — D-17
- **Priority:** P-2
- **Source Reviewers:** Duplication
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/service/imageProcessing.ts, src/components/ImageProcessor.tsx, and other files having overlapping image processing responsibilities
- **Dual-DB Risk:** NO
- **Files:** server/services/imageProcessing.ts, src/components/ImageProcessor.tsx, src/utils/image.ts, src/components/AIImageEnhancerModal.ts
- **Lines:** Multiple files with overlapping image processing code
- **Description:** Both server and client perform similar image processing with duplicate logic and potential inconsistencies
- **Fix Instructions:** Consolidate image processing logic primarily on server-side, and provide client previews based on consistent server operations
- **Test Guidance:** Align client behavior with server processing and reduce duplicate code

### P-023: Client-Side Particle Physics Optimization — P-2, P-3
- **Priority:** P-2
- **Source Reviewers:** Performance  
- **Original Severity:** CRITICAL, HIGH combined
- **Verified:** Confirmed in src/components/windmap/particleRenderer.ts lines 68-140, 2400 particles processed per frame with complex calculations
- **Dual-DB Risk:** NO
- **Files:** src/components/windmap/particleRenderer.ts, src/components/windmap/windInterpolation.ts
- **Lines:** 68-140 (rendering), 132-200 (interpolations)
- **Description:** Real-time wind map renders 2400 particles with complex physics calculations causing high CPU usage
- **Fix Instructions:** Optimize particle calculation by reducing count under lower performance settings, or implementing Web Workers to handle heavy computations without blocking UI thread
- **Test Guidance:** Lower CPU usage while maintaining visual quality of the wind map feature

### P-024: Global Settings Management Consistency — D-16
- **Priority:** P-2
- **Source Reviewers:** Duplication
- **Original Severity:** HIGH
- **Verified:** Confirmed in multiple server API, client-side context, and admin components with inconsistent settings handling
- **Dual-DB Risk:** NO  
- **Files:** server/routes/settings.ts, src/pages/AdminSettings.tsx, src/contexts/SettingsContext.tsx, src/lib/settings.ts
- **Lines:** Throughout multiple components
- **Description:** Similar settings logic dispersed across server API, client context, and form handling with potential for inconsistencies
- **Fix Instructions:** Centralize settings validation and type definitions with a single canonical definition shared between server and client
- **Test Guidance:** Ensure settings behave identically across server API, context state, and form validation layers

### P-025: Missing Rate Limits on Critical Endpoints — B-11
- **Priority:** P-3
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in server/routes/pilotAuth.ts lines 85-105, logout endpoint lacks rate limiting despite other endpoints having limits
- **Dual-DB Risk:** NO
- **Files:** server/routes/pilotAuth.ts
- **Lines:** 85-105  
- **Description:** API endpoints like logout lack rate limiting which could still allow for denial of service through excessive requests
- **Fix Instructions:** Add minimal rate limiting to logout function to prevent excessive database load during logout operations
- **Test Guidance:** Implement gentle rate limiting that protects system without affecting legitimate usage

### P-026: Potentially Insecure Processing of Wind Direction Strings — B-12
- **Priority:** P-3
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in server/routes/sites/helpers.ts lines 59-105, complex regex parsing for wind directions could be vulnerable to ReDoS
- **Dual-DB Risk:** NO
- **Files:** server/routes/sites/helpers.ts  
- **Lines:** 59-105
- **Description:** Regular expressions in wind dir parsing could have backtracking vulnerabilities with specially crafted input strings
- **Fix Instructions:** Simplify regex patterns to eliminate nested quantifiers that could cause exponential backtracking
- **Test Guidance:** Test with malicious wind direction strings containing repeated terms or unusual formatting

### P-027: Potential XSS in Search Result Construction — B-14
- **Priority:** P-3
- **Source Reviewers:** Bugs
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in server/routes/search.ts, search results include dynamic site data that could contain malicious scripts
- **Dual-DB Risk:** NO
- **Files:** server/routes/search.ts  
- **Lines:** Various sections constructing search context strings
- **Description:** Search results include user-generated content that may include scripts, presenting potential XSS risk
- **Fix Instructions:** Sanitize all user-generated content before including in search context strings passed to AI or rendered to clients
- **Test Guidance:** Verify that scripts in site content cannot execute when included in search results

### P-028: Date and Time Handling Inconsistencies — D-21
- **Priority:** P-3
- **Source Reviewers:** Duplication
- **Original Severity:** MEDIUM
- **Verified:** Confirmed in multiple files with scattered date/time utilities using different timezone assumptions
- **Dual-DB Risk:** NO
- **Files:** src/lib/dateUtils.ts, server/utils/date.ts, multiple weather processing files
- **Lines:** Various time processing functions 
- **Description:** Date/time handling distributed with inconsistent timezone treatment between client and server
- **Fix Instructions:** Centralize timezone logic with consistent default assumptions, preferably UTC with user timezone conversion at display layer
- **Test Guidance:** Ensure timestamps maintain accuracy across timezone boundaries and DST transitions

### P-029: Notification Message Inconsistency — D-22
- **Priority:** P-3
- **Source Reviewers:** Duplication
- **Original Severity:** MEDIUM
- **Verified:** Confirmed across multiple UI components and NotificationContext with mixed usage of toast notifications
- **Dual-DB Risk:** NO
- **Files:** src/contexts/NotificationContext.tsx, src/components/ToastManager.tsx, multiple UI components
- **Lines:** Usage of toast notifications throughout app
- **Description:** Toast notifications used inconsistently with different formatting and messaging across components
- **Fix Instructions:** Standardize notification patterns in NotificationContext and encourage usage instead of direct toast calls
- **Test Guidance:** Maintain consistent user experience with standardized notification formats across the application

### P-030: Pagination Logic Inconsistency — D-18  
- **Priority:** P-3
- **Source Reviewers:** Duplication
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/utils/pagination.ts and various route handlers not consistently using provided utilities
- **Dual-DB Risk:** NO
- **Files:** server/utils/pagination.ts, server/routes/sites.crud.ts, server/routes/search.ts, server/routes/documents.ts, server/routes/projects.ts
- **Lines:** Server pagination utilities and route handlers  
- **Description:** Centralized pagination logic exists but is inconsistently applied, causing varied behavior across API endpoints
- **Fix Instructions:** Refactor all endpoints to consistently use the provided pagination utilities with standard response format
- **Test Guidance:** Ensure all paginated endpoints follow same pattern and provide consistent meta information

### P-031: Database Access Normalization — D-19
- **Priority:** P-3
- **Source Reviewers:** Duplication
- **Original Severity:** HIGH
- **Verified:** Confirmed across codebase with repetitive database access patterns instead of centralized DAO-style approach
- **Dual-DB Risk:** YES — The adapter handles this but inconsistent usage could reveal edge cases  
- **Files:** server/db.ts, server/routes/*crud.ts files, server/migrations/*.ts
- **Lines:** Direct database access throughout many files
- **Description:** Direct database access patterns are duplicated rather than centralized in a DAO/repository pattern with consistent error handling
- **Fix Instructions:** Implement a data access object layer that encapsulates common database patterns and error handling across all operations
- **Test Guidance:** Centralize all database operations with consistent handling across both SQLite and PostgreSQL environments

### P-032: Reserved Keywords in Identifer Handling — DB-13
- **Priority:** P-2
- **Source Reviewers:** Database
- **Original Severity:** HIGH
- **Verified:** Confirmed in server/pgDb.ts lines 98-130, quoteIdentifiersIfNeeded function may not cover all PostgreSQL reserved words
- **Dual-DB Risk:** YES — PostgreSQL requires special handling for reserved words while SQLite is more permissive
- **Files:** server/pgDb.ts
- **Lines:** 98-130 in pgDb.ts
- **Description:** Automatic identifier quoting might miss reserved words or special characters, causing production failures
- **Fix Instructions:** Expand the reserved word list and improve heuristic for identifying when identifiers require quotation 
- **Test Guidance:** Test complex identifiers with reserved words against both database systems