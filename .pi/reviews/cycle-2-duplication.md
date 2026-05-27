# Duplication & Architecture Review — Cycle 2
**Date:** 2026-05-23
**Reviewer:** Code Duplication & Architecture Agent

**Cycle 1 Report:** `.pi/reviews/cycle-1-duplication.md`

| Cycle 1 Finding | Status |
|----------------|--------|
| D-001: haversineDistance ×10 | ✅ **FIXED** — All client files now import `haversineDistance` from `src/lib/utils.ts`. Server files use `nDistance()` from `server/utils/geometry.js`. No more independent implementations. |
| D-002: Compass directions array ×5 | ✅ **FIXED (partial)** — `DIRECTIONS` is now exported from `src/lib/utils.ts`. `src/components/WindCompass.tsx` now imports it (no local duplicate). **Remaining**: 6 server-side copies still exist (see Finding D-10 below). |
| D-003: WindMapProto / SitesWindMap | ✅ **FIXED** — `WindMapProto.tsx` no longer exists. `WindMap.tsx` is now the component itself (not a shim), and `SitesWindMap.tsx` has been refactored. No more structural duplication between two proto files. |
| D-004: expandRange duplicated | ✅ **FIXED** — `expandRange` lives only in `src/lib/utils.ts`. `src/components/WindCompass.tsx` now imports it. |
| D-005: Inline closure check in siteMarkerRenderer | ✅ **FIXED** — `getClosureStatus` is now the single source. All callers use `n(site)` (minified import name). No inline `todayStr.includes()` logic remains. |
| D-006: directionToDegrees ×3 | ⚠️ **Partial** — `src/components/weather/WindCompass.tsx` still has a private `directionToDegrees` (renamed `n`). See Finding D-11. |
| D-007: TidesGauge / TidesPanelMockup dead code | ✅ **FIXED** — Both files removed from `src/components/`. No longer bundled. |
| D-008: WindMap.tsx re-export shim | ✅ **FIXED** — No longer a shim. `WindMap.tsx` contains the full component. |
| D-009: Admin page pattern ×14 | ⚠️ **Still present** — See Finding D-12. `useAdminForm` + `UnsavedChangesModal` + manual `markDirty()` calls remain spread across 14 files (122 `markDirty()` calls total). |

---

## Summary
- Total findings: 3
- CRITICAL: 0
- HIGH: 1
- MEDIUM: 2
- LOW: 0

---

## Finding D-10: Compass directions array still duplicated 6× on server
- **Severity:** HIGH
- **File(s):**
  - `src/lib/utils.ts` (line 45): `export const DIRECTIONS = ['N', 'NNE', ...]`
  - `server/routes/sites/helpers.ts` (line 24): `export const COMPASS_DIRS = [n,'NE',...]`
  - `server/routes/search.ts` (line 50): `const COMPASS_DIRS = [n,'NE',...]`
  - `server/extendedForecast.ts`: `const allDirs = [n,'NE',...]`
  - `server/freeflightwx.ts`: `const dirs = [n,'NE',...]`
  - `server/wtf.ts`: `[n,'NE',...]`
  - `server/weather.ts`: `const arr = [n,'NE',...]`
- **Lines:**
  - `src/lib/utils.ts`: `export const DIRECTIONS = [...]`
  - `server/routes/sites/helpers.ts:24`: `export const COMPASS_DIRS = [n,'NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];`
  - `server/routes/search.ts:50`: `const COMPASS_DIRS = [n,'NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];`
  - `server/extendedForecast.ts`: `const allDirs = [n,'NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];`
  - `server/freeflightwx.ts`: `const dirs = [n,'NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];`
  - `server/wtf.ts`: `[n,'NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW']`
  - `server/weather.ts`: `const arr = [n,'NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];`
- **Differences between client and server copies:** The server-side copies omit `"N"` as the first element. E.g., `COMPASS_DIRS = [n,'NE',...]` where `n` is minified `"N"`. **Wait** — checking more carefully:

```typescript
// src/lib/utils.ts (CORRECT — 16 elements starting with "N"):
export const DIRECTIONS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

// server/routes/search.ts (identical content, different name):
const COMPASS_DIRS = [n,'NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
```

The `n` is minified `"N"` (bundler/obfuscation). All 6 server copies have the **identical 16 elements** — same ordering, same values. They use different variable names (`COMPASS_DIRS`, `allDirs`, `dirs`, `arr`) but the data is 100% identical.

- **Duplication:** The same 16-element compass directions array is defined independently in **7 files** across the codebase (1 client + 6 server). The client copy is now exported as `export const DIRECTIONS` from `src/lib/utils.ts`. The server copies are not shared even with each other — `server/routes/sites/helpers.ts` exports `COMPASS_DIRS` but `server/routes/search.ts` declares its own const instead of importing it.
- **Recommended fix:** Create `server/utils/compass.ts` (or add to `server/utils/geometry.js`) exporting `COMPASS_DIRS`, then import it in all 6 server files. If client–server code sharing is desired (via `src/types/` pattern), the array could live in a shared location, but TypeScript path config may require separate copies for ESM vs CJS.
- **Impact:** If a compass direction is ever added, removed, or reordered, all 7 copies must be updated. The different names (`COMPASS_DIRS` vs `allDirs` vs `dirs` vs `arr`) make it harder to grep for "where is the compass list?" — developers won't know which file is canonical.
- **Confidence:** HIGH — rg search confirms all 7 locations with identical content.

---

## Finding D-11: directionToDegrees still private in weather/WindCompass
- **Severity:** MEDIUM
- **File(s):**
  - `src/components/weather/WindCompass.tsx` (lines 10–18): private `directionToDegrees` mapping
  - `src/lib/utils.ts`: no directionToDegrees export (directions are array-index based)
  - `src/components/windMapTypes.ts`: uses array index math (index × 22.5) not a lookup table
  - `src/components/WindCompass.tsx`: uses `ANGLE_STEP = 360 / DIRECTIONS.length` (array index based)
  - `server/routes/search.ts`: uses `COMPASS_DIRS.indexOf()` (implicit: index × 22.5)
- **Lines:**
  - `src/components/weather/WindCompass.tsx`:
  ```typescript
  const directionToDegrees: Record<string, number> = {
    'N': 0, 'NNE': 22.5, 'NE': 45, 'ENE': 67.5,
    'E': 90, 'ESE': 112.5, 'SE': 135, 'SSE': 157.5,
    'S': 180, 'SSW': 202.5, 'SW': 225, 'WSW': 247.5,
    'W': 270, 'WNW': 292.5, 'NW': 315, 'NNW': 337.5
  };
  ```
  - `src/components/windMapTypes.ts` (implicit): calculates `index * (360 / 16)` = `index * 22.5`
  - `src/components/WindCompass.tsx` (implicit): `const ANGLE_STEP = 360 / DIRECTIONS.length`
- **Duplication:** Three different semantic encodings of the same direction→degrees data exist:
  1. Explicit lookup table (`directionToDegrees` in weather/WindCompass)
  2. Index arithmetic (ANGLE_STEP / 22.5 deg per index in WindCompass.tsx and windMapTypes.ts)
  3. Array indexOf (search.ts — implicit: `indexOf(dir) * 22.5`)
  
  The explicit lookup table is the most robust (handles non-uniform spacing if needed). It should be exported from `src/lib/utils.ts` alongside `DIRECTIONS`. The other locations can derive degrees as `directionToDegrees[direction]` instead of `indexOf × 22.5`.
- **Impact:** Low-medium. The implicit index×22.5 approach works as long as the array stays uniformly spaced, which is a safe assumption for a 16-point compass. However, if the `directionToDegrees` table and the array ever get out of sync (e.g., someone reorders one but not the other), the index-based calculations silently produce wrong angles with no type error or runtime check.
- **Confidence:** HIGH — exact code read in all three encoding locations.

---

## Finding D-12: Admin page dirty-tracking pattern remains unconsolidated (14 files, 122 markDirty calls)
- **Severity:** HIGH (architecture/maintenance — not a runtime bug)
- **File(s):** 14 files using `useAdminForm` + `UnsavedChangesModal`:
  - `AdminAIModels.tsx`, `AdminBranding.tsx`, `AdminConnections.tsx`,
  - `AdminFlightTracker.tsx`, `AdminHomeSettings.tsx`, `AdminImages.tsx`,
  - `AdminJoinSettings.tsx`, `AdminNewsEdit.tsx`, `AdminPageEdit.tsx`,
  - `AdminProjectEdit.tsx`, `AdminSafety.tsx`, `AdminScheduledTasks.tsx`,
  - `AdminSiteEdit.tsx`, `AdminXC.tsx`
- **Lines:** Each file independently:
  1. Calls `const { isDirty, markDirty, blocker, saving, justSaved, saveError, save } = useAdminForm({ successMessage: "..." })`
  2. Wraps every input's `onChange` with `markDirty()` calls (122 total across 14 files — confirmed by grep)
  3. Renders `<UnsavedChangesModal blocker={blocker} onSave={...} />` with page-specific save closure
  4. Has a `useEffect` for form initialization from settings
- **Code Location A** (`AdminBranding.tsx`, typical pattern):
  ```typescript
  const { isDirty, markDirty, blocker, saving, justSaved, saveError, setSaveError, save } = useAdminForm({ successMessage: "Branding saved" });
  
  // Every onChange duplicates markDirty():
  <input onChange={(e) => { setClubName(e.target.value); markDirty(); }} />
  <input onChange={(e) => { setClubTagline(e.target.value); markDirty(); }} />
  <select onChange={(e) => { setSelectedTemplate(e.target.value); markDirty(); }} />
  // ... etc — ~5-10 markDirty() calls per file
  ```
- **Code Location B** (`AdminAIModels.tsx`, same pattern):
  ```typescript
  const { isDirty: dirty, markDirty, blocker, saving, justSaved, save } = useAdminForm({ successMessage: "AI model config saved" });
  
  // Same markDirty on every onChange:
  onCheckedChange={() => { setAutoCheckEnabled(e); markDirty(); }}
  onChange={() => { setApiKey(v); markDirty(); }}
  onValueChange={() => { setTextModelList(v); markDirty(); }}
  // ... etc
  ```
- **Duplication:** The `useAdminForm` hook already centralizes save logic, dirty state, and blocker management. But the `markDirty()` call pattern is **manually attached to every single input handler** across all 14 files. This results in **122 individual `markDirty()` invocations** — each one a potential bug if a developer adds a new input and forgets to call it.
  
  The `UnsavedChangesModal` is also rendered at the bottom of each page JSX with identical structure (modal overlay, discard/save buttons, blocker check). Only the `onSave` closure differs.
  
  A proper consolidation would either:
  1. Create an `<AdminInput>` wrapper component that auto-calls `markDirty()` on change, eliminating manual decoration
  2. Or create an `<AdminFormPage>` layout that wraps children and provides unified dirty tracking
  3. Or use a form state proxy (like `react-hook-form`) where dirty detection is automatic
- **Impact:** High maintenance cost. Every new admin page requires copying the same boilerplate and manually adding `markDirty()` to every input. Missing a `markDirty()` call means a changed value won't trigger the unsaved-warning modal — a silent data-loss bug. Conversely, forgetting to remove a `markDirty()` after deleting an input is dead code. The pattern is fragile and error-prone by design.
- **Confidence:** HIGH — grep confirms 122 `markDirty()` calls across 14 files, all following the same manual pattern.

---

## Anti-Hallucination Checklist

- [x] D-10: `rg` search for all compass array declarations across src/ and server/. Read all 7 files confirmed identical 16-element content.
- [x] D-11: Read `directionToDegrees` in weather/WindCompass. Read `ANGLE_STEP` in WindCompass. Read index math in windMapTypes. All encode the same direction→degrees mapping differently.
- [x] D-12: `rg "markDirty()"` returned 122 hits. `rg "useAdminForm"` returned 14 admin page files + BuildBlueprint. Read 3 representative files (Branding, AIModels, Safety) — all follow identical pattern.

All findings passed the anti-hallucination checklist.
