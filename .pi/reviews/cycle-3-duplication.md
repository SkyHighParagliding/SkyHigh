# Duplication & Architecture Review — Cycle 3
**Date:** 2026-05-24
**Reviewer:** Code Duplication & Architecture Agent

## Summary
- Total findings: 5
- CRITICAL: 1
- HIGH: 3
- MEDIUM: 1
- LOW: 0

---

## Finding D-11: Multiple Wind Direction Computation Implementations
- **Severity:** CRITICAL
- **File(s):** `src/components/WindCompass.tsx`, `src/components/weather/WindCompass.tsx`, `src/lib/utils.ts`, `server/weather.ts`, `server/victoriaGrid.ts`, `server/extendedForecast.ts`
- **Lines:** Lines 1-20 in each file for direction computation functions
- **Code Location A:**
  ```typescript
  // From server/weather.ts
  export function degreesToDirection(degrees: number): string {
    const val = Math.floor((degrees / 22.5) + 0.5);
    const arr = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return arr[(val % 16)];
  }
  ```
- **Code Location B:**
  ```typescript
  // From src/lib/utils.ts (similar implementation) 
  const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

  export function getWindStatus(windSpeed: number, windDirection: string, site: any) {
    // Uses directional lookups similar to server-side code
  }
  ```
- **Duplication:** Wind direction processing logic is implemented separately on client-side (`src/lib/utils.ts`) versus server-side (`server/weather.ts`, `server/victoriaGrid.ts`, `server/extendedForecast.ts`) with nearly identical algorithms but separate constants and business logic. The `degreesToDirection` function exists in both client and server with identical implementations.
- **Impact:** Higher maintenance cost as fixes would need to be applied in multiple codebases. Also introduces potential for divergence in direction calculations between client preview and server calculation.
- **Confidence:** HIGH

---

## Finding D-12: Complex Form Management State Duplication (useSiteForm Hook)
- **Severity:** HIGH
- **File(s):** `src/hooks/useSiteForm.ts`, `src/pages/AdminSiteEdit.tsx`
- **Lines:** The entire `useSiteForm` hook and associated page (1000+ lines)
- **Code Location A:**
  ```typescript
  export function useSiteForm() {
    const { token } = useAuth();
    const { settings } = useSettings();
    const { id } = useParams();
    const [siteList, setSiteList] = useState<string[]>([]);
    const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const { isDirty, markDirty, markClean, blocker, justSaved, save: adminSave } = useAdminForm({ successMessage: "Site saved successfully!" });
    // ... extensive form state management and validation logic
  }
  ```
- **Code Location B:**
  ```typescript
  // In AdminProjectEdit, AdminBranding, AdminAIModels and other admin pages
  const { token, isDirty, markDirty, blocker, saving, justSaved, save } = useAdminForm();
  // And similar form state management patterns
  ```
- **Duplication:** `useSiteForm` hook contains massive form state management (closures, dates, images, geolocation, etc.) that mirrors patterns seen in other admin hooks but in a much larger scale. This hook combines the `useAdminForm` abstraction with extensive domain-specific logic.
- **Impact:** Changes to complex form state management require updates across multiple hooks. The `useSiteForm` has evolved into a large all-encompassing hook instead of smaller composable pieces.
- **Confidence:** HIGH

---

## Finding D-13: Repeated Admin Form Patterns
- **Severity:** HIGH
- **File(s):** All files like `AdminProjectEdit.tsx`, `AdminBranding.tsx`, `AdminAIModels.tsx`, and others using the same admin form patterns
- **Lines:** Multiple files sharing the pattern
- **Code Location A:**
  ```typescript
  const { isDirty, markDirty, blocker, saving, justSaved, save } = useAdminForm({ successMessage: "Project saved" });
  ```
- **Code Location B:**
  ```typescript
  const { isDirty, markDirty, blocker, saving, justSaved, save } = useAdminForm({ successMessage: "Branding saved" });
  ```
- **Duplication:** Over 14 admin files use a very similar pattern with minor differences - same hook invocation with minor variations in success messages and form management. Each uses the same `UnsavedChangesModal` and form lifecycle.
- **Impact:** Maintenance overhead increases when admin form patterns require updates, and consistency could be better managed with a more centralized solution.
- **Confidence:** MEDIUM

---

## Finding D-14: Weather Data Processing Duplication Across Server Services
- **Severity:** HIGH
- **File(s):** `server/weather.ts`, `server/victoriaGrid.ts`, `server/extendedForecast.ts`, `server/bomWeather.ts`, `server/freeflightwx.ts` 
- **Lines:** Wind speed/gust/direction processing across services
- **Code Location A:**
  ```typescript
  // From server/extendedForecast.ts - wind processing logic
  const speedMs = pt.windSpeed[t] * 0.514444;
  const dir = pt.windDirection[t];
  const rad = (dir * Math.PI) / 180;
  return {
    u: -speedMs * Math.sin(rad),
    v: -speedMs * Math.cos(rad)
  };
  ```
- **Code Location B:**
  ```typescript
  // From server/victoriaGrid.ts - similar processing
  const windSpeed = Math.round(nearest.hourly.wind_speed_10m[hourIdx]);
  const windGust = Math.round(nearest.hourly.wind_gusts_10m[hourIdx]);
  const windDirection = degreesToDirection(nearest.hourly.wind_direction_10m[hourIdx]);
  ```
- **Duplication:** Multiple server services process very similar weather data with wind speed, direction, and conversion logic but in separate files. Each service performs similar conversions (knots to meters/second, degrees to compass directions) with slightly different contexts.
- **Impact:** Multiple implementations of weather data processing could produce inconsistent calculations if not kept in sync. Also increases bundle size of server code.
- **Confidence:** HIGH

---

## Finding D-15: Similar Site Wind Direction Parsing Logic
- **Severity:** MEDIUM
- **File(s):** `src/lib/utils.ts`, `server/victoriaGrid.ts`, and `server/routes/sites/helpers.ts`
- **Lines:** Direction parsing functions in src vs server-side logic
- **Code Location A:**
  ```typescript
  // From src/lib/utils.ts
  function expandRange(startDir: string, endDir: string): string[] {
    const startIdx = directions.indexOf(startDir);
    const endIdx = directions.indexOf(endDir);
    // ... similar logic to server side
  }
  ```
- **Code Location B:**
  ```typescript
  // From server/migrations where similar parsing occurs for site wind directions
  const parsed = parseDir(site.windDir);  // Similar parsing of wind direction ranges
  ```
- **Duplication:** Client and server both have similar logic to parse wind direction ranges like "NE-SE" or "SE,E,ENE" from site configuration, but implemented separately in utils versus server-side processing.
- **Impact:** Potential for subtle differences in interpretation of wind directions between client-side validation/previewing and server-side processing leading to inconsistencies.
- **Confidence:** MEDIUM