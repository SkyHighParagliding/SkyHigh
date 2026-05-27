# Duplication & Architecture Review — Cycle 4
**Date:** 2026-05-24
**Reviewer:** Code Duplication & Architecture Agent

## Summary
- Total findings: 8
- CRITICAL: 0
- HIGH: 4
- MEDIUM: 4
- LOW: 0

---

## Finding D-16: Global Settings Management Duplication
- **Severity:** HIGH
- **File(s):** `server/routes/settings.ts`, `src/pages/AdminSettings.tsx`, `src/contexts/SettingsContext.tsx`, `src/lib/settings.ts`
- **Lines:** Various throughout each file
- **Code Location A:**
  ```typescript
  // server/routes/settings.ts contains API handlers for setting updates
  router.get("/", (req, res) => {
    const settings = db.prepare("SELECT key, value FROM settings").all();
    res.json(settings.reduce((acc, s) => ({ ...acc, [s.key]: s.value }), {}));
  });

  router.post("/", requireAuth, (req, res) => {
    // Updates multiple keys in database
  });
  ```
- **Code Location B:**
  ```typescript
  // src/contexts/SettingsContext.tsx contains client-side caching
  export function SettingsProvider({ children }: { children: React.ReactNode }) {
    const [settings, setSettings] = useState<Record<string, string>>({});
    // Handles fetching and updating settings with optimistic updates
  }
  ```
- **Code Location C:**
  ```typescript
  // src/pages/AdminSettings.tsx manages all possible settings keys with form validation
  const handleSave = () => {
    // Processes settings in multiple categories
  }
  ```
- **Duplication:** Similar logic for settings management exists across server API, client-side context, and admin form handling. Each contains validation, special handling for certain keys, and business logic for how settings interact. While separated by client/server, there's duplicate knowledge about what settings exist, their validations, and their types.
- **Impact:** Risk of inconsistency between server validation and client expectations. Adding new settings requires touching multiple files across the app with possibility of misconfiguration.
- **Confidence:** HIGH

---

## Finding D-17: Duplicate Image Processing Utilities
- **Severity:** HIGH
- **File(s):** `server/services/imageProcessing.ts`, `src/components/ImageProcessor.tsx`, `src/utils/image.ts`, `src/components/AIImageEnhancerModal.ts`
- **Lines:** Image processing, resizing, optimization logic
- **Code Location A:**
  ```typescript
  // server/services/imageProcessing.ts - Handles multer processing, sharp transformation, variants creation
  export async function processUploadedImage(filePath: string, options: ImageProcessingOptions) {
    const variants = await createImageVariants(filePath, options);
    await generateWatermarks(variants);
    const hash = await calculateImageHash(filePath);
    return { variants, hash };
  }
  ```
- **Code Location B:**
  ```typescript
  // src/components/AIImageEnhancerModal.ts - Client-side canvas manipulation, preview generation
  const processPreview = (imageUrl: string) => {
    // Client-side image manipulation with canvas
  }
  ```
- **Duplication:** Both server and client perform image processing with potentially overlapping functionality. Server handles full pipeline of uploading, transforming, optimizing, watermarking, and creating web/responsive variants. Client handles preview, enhancement suggestions, and some validation that duplicates server-side logic.
- **Impact:** Code redundancy, potential for discrepancies between client-side previews and server transformations, increased maintenance overhead for image processing features.
- **Confidence:** HIGH

---

## Finding D-18: Pagination Pattern Duplication Across Multiple Routes
- **Severity:** HIGH
- **File(s):** `server/utils/pagination.ts`, `server/routes/sites.crud.ts`, `server/routes/search.ts`, `server/routes/documents.ts`, `server/routes/projects.ts`
- **Lines:** `server/utils/pagination.ts` (whole file), various route handlers
- **Code Location A:**
  ```typescript
  // server/utils/pagination.ts - Generic pagination utilities
  export function getPaginationParams(query: any) {
    return {
      limit: Math.min(500, Math.max(1, parseInt(query.limit) || 10)),
      offset: Math.max(0, parseInt(query.offset) || 0),
    };
  }

  export function createPaginatedResponse(data: any[], total: number, limit: number, offset: number) {
    return { ... };
  }
  ```
- **Code Location B:**
  ```typescript
  // server/routes/sites.crud.ts - Still has inline pagination logic in addition to imported utilities
  router.get("/", async (req, res) => {
    const { limit, offset } = getPaginationParams(req.query);
    let sites = await db.prepare("SELECT * FROM sites ORDER BY name ASC LIMIT ? OFFSET ?").all(limit, offset) as any[];
    // Additional pagination logic
    res.set('X-Total-Count', String(countResult.count));
  });
  ```
- **Code Location C:**
  ```typescript
  // server/routes/search.ts - Custom pagination with additional complexity
  const paginatedResults = await db.prepare(query).all(...params, limit, offset);
  // Custom headers logic
  ```
- **Duplication:** While there's a `server/utils/pagination.ts` with generic pagination functions, they're not consistently used across all endpoint handlers. Each route adds custom header settings, count queries, and specific logic that should be centralized.
- **Impact:** Inconsistent pagination behavior across API endpoints, increased likelihood of bugs in paginated responses, difficult to apply pagination improvements across whole API.
- **Confidence:** HIGH

---

## Finding D-19: Database Connection Pooling Patterns Not Centralized
- **Severity:** HIGH
- **File(s):** `server/db.ts`, `server/migrations/*.ts`, most route files
- **Lines:** Various database connections throughout application
- **Code Location A:**
  ```typescript
  // server/db.ts - Primary export for DB connection
  const database = new Database(DATABASE_PATH);
  database.pragma('journal_mode = WAL');
  database.pragma('synchronous = NORMAL');
  export default database;
  ```
- **Code Location B:**
  ```typescript
  // server/routes/*/crud.ts files
  import db from "../db.js";  // Import singleton instance
  const result = await db.prepare(sql).run(params);
  ```
- **Code Location C:**
  ```typescript
  // server/migrations files
  import db from "../db.js";  // Use same singleton
  db.exec(`ALTER TABLE sites...`)
  ```
- **Duplication:** While a singleton pattern exists, the same database access patterns (prepare/run/all statements, transaction handling, error catching) are repeated across all route handlers. There are many instances of `await db.prepare().all()` or `.run()` which could be centralized in a proper DAO/Repository pattern.
- **Impact:** Makes it difficult to add cross-cutting concerns like logging, metrics, or transaction management without modifying every route. Inconsistent error handling between different SQL calls.
- **Confidence:** HIGH

---

## Finding D-20: Form Field Validation Logic Scattered Across Components
- **Severity:** MEDIUM
- **File(s):** `src/components/ValidationRules.ts`, `src/pages/AdminSiteEdit.tsx`, `src/pages/AdminProjectEdit.tsx`, `src/pages/AdminDocumentEdit.tsx`, `src/pages/AdminNewsEdit.tsx`
- **Lines:** Individual validation logic
- **Code Location A:**
  ```typescript
  // From AdminSiteEdit.tsx - form validation
  const validate = () => {
    if (!form.name?.trim()) return "Name is required";
    if (form.lat && (form.lat < -45 || form.lat > -10)) return "Latitude must be between -45 and -10";
    if (form.lon && (form.lon < 110 || form.lon > 160)) return "Longitude must be between 110 and 160";
    // ... more validations
  }
  ```
- **Code Location B:**
  ```typescript
  // From AdminProjectEdit.tsx - different but similar validation logic
  const validate = () => {
    if (!form.title?.trim()) return "Title is required";
    if (form.startTime && form.endTime && form.startTime > form.endTime) return "End time must be after start time";
    // ... project-specific validations mixed with generic ones
  }
  ```
- **Duplication:** Each admin form contains its own validation logic mixed with business logic. While each form has domain-specific rules, many have overlapping common validations (required fields, number ranges, URL formats, date comparisons) expressed in different ways.
- **Impact:** Changes in validation requirements require updates to multiple files. Increases chance of validation inconsistencies across different forms.
- **Confidence:** MEDIUM

---

## Finding D-21: Date and Time Parsing Logic Duplication
- **Severity:** MEDIUM
- **File(s):** `src/lib/dateUtils.ts`, `server/utils/date.ts`, multiple weather-related server files, `src/utils/time.ts`
- **Lines:** Various date/time formatting and processing functions
- **Code Location A:**
  ```typescript
  // src/lib/dateUtils.ts - client timezone-aware formatting
  export function formatDateWithTz(dateString: string, tz: string = 'Australia/Melbourne'): string {
    const date = parseISO(dateString);
    return formatInTimeZone(date, tz, 'dd/MM/yyyy HH:mm');
  }
  ```
- **Code Location B:**
  ```typescript
  // server/utils/date.ts - server-side parsing 
  export function parseServerDateTime(dateString: string): Date {
    // Server assumes different timezone logic
  }
  ```
- **Code Location C:**
  ```typescript
  // Multiple server weather files handle timestamps differently
  const ageMinutes = Math.floor((Date.now() - new Date(obs.timestamp).getTime()) / 60000);
  ```
- **Duplication:** Date/time handling is distributed across the codebase with different assumptions about timezones, particularly between client-facing displays (Melbourne time) and server processing. Weather forecast timestamp processing is handled separately in multiple server files.
- **Impact:** Potential for timestamp inconsistencies where client shows different time than server processes, difficult to maintain correct timezone awareness especially around daylight saving time transitions.
- **Confidence:** MEDIUM

---

## Finding D-22: Notification and Toast Message Patterns
- **Severity:** MEDIUM
- **File(s):** `src/contexts/NotificationContext.tsx`, `src/components/ToastManager.tsx`, multiple UI components using `toast`
- **Lines:** Various notification handling
- **Code Location A:**
  ```typescript
  // Using sonner toast directly in multiple components with similar patterns
  import { toast } from "sonner";
  
  // Several places use similar pattern:
  toast.success("Operation completed successfully");
  toast.error("Operation failed: " + errorMsg);
  toast.warning("Warning message");
  ```
- **Code Location B:**
  ```typescript
  // Context provider tries to centralize but individual components still call toast directly
  // Multiple error patterns: generic "failed" vs detailed "operation failed due to..."
  ```
- **Duplication:** Sonner toast notifications are called directly from many individual components following similar patterns but with inconsistent messaging and formatting. The NotificationContext exists but doesn't seem to be utilized consistently across all components.
- **Impact:** Inconsistent user experience with error messages, difficulty controlling notification presentation globally, potential internationalization issues if different components translate messages differently.
- **Confidence:** MEDIUM

---

## Finding D-23: Environment Variable Handling in Multiple Places
- **Severity:** MEDIUM
- **File(s):** `server/.env.ts`, `src/env.d.ts`, many individual module files reading from `process.env`
- **Lines:** Multiple environment variable access patterns
- **Code Location A:**
  ```typescript
  // server/.env.ts
  export const DATABASE_PATH = process.env.DATABASE_PATH || "./skyhigh.db";
  export const SERVER_PORT = parseInt(process.env.SERVER_PORT || "3001");
  ```
- **Code Location B:**
  ```typescript
  // Many individual files directly access environment variables
  const apiKey = process.env.GOOGLE_API_KEY;
  const isProd = process.env.NODE_ENV === 'production';
  // etc.
  ```
- **Code Location C:**
  ```typescript
  // src/env.d.ts - Declaration of expected env variables for TypeScript
  declare global {
    namespace NodeJS {
      interface ProcessEnv {
        VITE_API_BASE_URL: string;
        // ...
      }
    }
  }
  ```
- **Duplication:** Environment variable access patterns are spread across multiple files with inconsistent error handling when mandatory variables are missing. Some modules have fallback values, others don't, leading to runtime failures in some configurations.
- **Impact:** Difficulty ensuring environment completeness across different deployment environments. Harder to validate configuration and provide meaningful error messages for missing configuration.
- **Confidence:** MEDIUM