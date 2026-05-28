# Type Safety Review — Cycle 5
**Date:** 2026-05-28
**Reviewer:** TypeScript Type Safety Agent (subagent)

## Methodology
- Read every flagged file: `apiClient.ts`, `useRetrievalMap.ts`, `useFlightTracker.ts`, `useXCMapState.ts`, `useHomeSettings.ts`, `useDataUsage.ts`, `useAdminForm.ts`, `useUnsavedChanges.ts`, `useRetrievalStatus.ts`, `useConnectionsConfig.ts`, `AdminSites.tsx`, `AdminContacts.tsx`, `PhotoSlider.tsx`, `PilotMarkers.tsx`, `WindCanvas.tsx`, `WindFieldLayer.tsx`, `WeatherCard.tsx`, `MarkdownRenderer.tsx`, `Layout.tsx`, `flightDb.ts`, `AuthContext.tsx`, `SettingsContext.tsx`, `DutyPilotMap.tsx`
- Cross-referenced against `tsc --noEmit` compile output (239 existing errors)
- Traced data flow for EACH `!`, `as`, and `any` finding to determine if runtime crash is possible
- Ignored patterns that are theoretically unsafe but guarded at runtime (e.g., `canvas!` after null check, `site!` after `enabled` guard)

## Key Finding About Config
**The tsconfig.json has NO strict mode.** No `strict: true`, no `strictNullChecks`, no `noImplicitAny`. TypeScript disallows `strictNullChecks: true` without `strict: true` (actually it IS settable independently, but the config lacks it entirely). This means `null` and `undefined` are silently assignable to every type in the project, making the entire `!` and `as` pattern noise — the code would compile without them.  

However, `tsc --noEmit` DOES report 239 type errors because the Vite/TypeScript moduleResolution= bundler path resolves @types/react 19's strict built-in types. The existing errors prove the codebase has **known type problems that are being ignored during builds**.

## Summary
- Total findings: 8
- CRITICAL: 2
- HIGH: 2
- MEDIUM: 2
- LOW: 2

---

## Finding T-001: `apiClient.ts` returns `undefined` disguised as `T` on empty response
- **Severity:** CRITICAL
- **Category:** unsafe as (Category 3)
- **File(s):** `src/lib/apiClient.ts`
- **Lines:** 100–101
- **Code:**
  ```typescript
  const text = await res.text();
  if (!text) return undefined as unknown as T;
  return JSON.parse(text) as T;
  ```
- **Bug:** When an API endpoint returns a 204 No Content response (or any response with an empty body), `res.text()` returns `""`. The `!text` guard returns `undefined` but asserts it as `T` via `as unknown as T`. Every consumer that calls `api.get<SomeType[]>(...)` and destructures or iterates on the result will crash at runtime. The type system is completely bypassed.
- **Crash path trace:**
  1. Server returns `204 No Content` (or empty body) from any endpoint
  2. `apiClient.request<T>()` returns `undefined` but the type says `T`
  3. Caller in `AdminSites.tsx:252` (or elsewhere) does: `api.get<Array<Record<string, unknown>>>('/api/external-sites').then(data => setExternalSites(data as unknown as ...))` — `data` is `undefined`
  4. `setExternalSites(undefined)` sets state to `undefined`
  5. Later rendering: `externalSites.map(s => s.stateAbbr)` → **`TypeError: Cannot read properties of undefined (reading 'map')`**
- **Impact:** Page crash on admin sites panel with `TypeError`. Any API endpoint returning empty body causes cascading crashes in all consumers.
- **Confidence:** **HIGH** (the code path is unconditional — any empty 2xx response triggers it)

---

## Finding T-002: `useRetrievalMap.ts` `Record<string, unknown>` assigned to typed array state
- **Severity:** CRITICAL
- **Category:** unsafe as (Category 3 / shared type drift Category 5)
- **File(s):** `src/hooks/useRetrievalMap.ts`
- **Lines:** 203–205, 248–253
- **Code:**
  ```typescript
  // Line 203-205
  const fetchLivePilots = useCallback(async () => {
    if (!token) return;
    try {
      const data = await api.get<Record<string, unknown>>(`${apiBase}/flights/live-pilots`, null, apiOpts());
      setLivePilots(data);  // TS2345: Record<string, unknown> not assignable to LivePilotData[]
    } catch {}
  ```

  ```typescript
  // Lines 248-253
  const [dp, ls] = await Promise.all([
    api.get<Record<string, unknown>>(`${apiBase}/retrievals/duty-pilot-position`, null, apiOpts()),
    api.get<Record<string, unknown>>(`${apiBase}/retrievals/launch-site`, null, apiOpts()),
  ]);
  setDutyPilotPos(dp?.available ? { lat: dp.lat, lon: dp.lon, name: dp.name } : null);
  // TS2345: lat: unknown, lon: unknown, name: unknown not assignable to number, number, string
  ```
- **Bug:** The API response type `Record<string, unknown>` means ALL property values are typed as `unknown`. At line 205, this unknown-typed object is passed to `setLivePilots()` which expects `LivePilotData[]`. TypeScript flags this (TS2345), but the build doesn't fail. At runtime, if the API returns `{ id: "abc", lat: 42.0 }` (a single object), it's stored as `LivePilotData[]` where `Array.isArray(data)` is false, and `data.filter()`, `data.find()`, `data.map()` all crash with **`data.filter is not a function`**.
  - At lines 252–253, `dp.lat`, `dp.lon`, `dp.name` are all typed `unknown`. If the API returns values with wrong types (e.g., `lat: "42.0"` as string), the numeric operations later (map rendering, haversine distance) silently produce `NaN` instead of crashing, causing **silent data corruption**.
- **Impact:** Hard crash (`filter is not a function`) when retrieval API returns a single object instead of array. Silent `NaN` propagation when coordinate types are wrong.
- **Confidence:** **HIGH** (TypeScript confirms the type mismatch; the crash path is deterministic when API shape doesn't match)

---

## Finding T-003: `AdminSites.tsx` pervasive `as unknown as` type erasure
- **Severity:** HIGH
- **Category:** unsafe as (Category 3)
- **File(s):** `src/pages/AdminSites.tsx`
- **Lines:** 252, 259, 297–298, 301, 326, 348, 371, 373, 388, 415–416, 435–436
- **Code (representative sample):**
  ```typescript
  // Line 252
  api.get<Array<Record<string, unknown>>>('/api/external-sites')
    .then(data => setExternalSites(data as unknown as {name: string, url: string, ...}[]))

  // Line 298
  api.get<{ data: Array<Record<string, unknown>> }>('/api/sites')
    .then(response => setSites(response.data as unknown as Site[]))
  ```
- **Bug:** The entire AdminSites.tsx page uses `as unknown as` to force API responses into domain types. This is NOT a type check — it's a type erasure that makes TypeScript completely blind to response shape mismatches. The intermediate type `Array<Record<string, unknown>>` already expresses "we don't know the shape", and then `as unknown as Site[]` forces it into `Site[]`. If the server changes its response format (which has happened — the codebase has evolved organically), undefined values silently propagate.
  - **Line 252 crash path:** API returns `[{ name: "SiteA" }]` without `stateAbbr` → `externalSites` has `stateAbbr: undefined` → `uniqueStates` filter removes `undefined` via `.filter(Boolean)` → works but silently missing data. If API returns `null` (possible from T-001), `externalSites` is `null` → `.map()` crashes.
- **Impact:** Silent data corruption when upstream API changes. Null propagation from T-001 causes page crash.
- **Confidence:** **HIGH** (compounded with T-001 — every `as unknown as` here turns `undefined` into a valid typed value)

---

## Finding T-004: `useRetrievalMap.ts` and `DutyPilotMap.tsx` `pilotLat!` / `pilotLon!` after filter
- **Severity:** HIGH
- **Category:** non-null assertion (Category 2)
- **File(s):** `src/hooks/useRetrievalMap.ts`, `src/pages/RetrievalMap.tsx`, `src/pages/DutyPilotMap.tsx`
- **Lines:** `useRetrievalMap.ts:544`, `RetrievalMap.tsx:151,185`, `DutyPilotMap.tsx:154,457–458`
- **Code:**
  ```typescript
  // useRetrievalMap.ts:544
  retrievals.filter(r => r.pilotLat != null && r.pilotLon != null)
    .forEach(r => points.push([r.pilotLat!, r.pilotLon!]));

  // RetrievalMap.tsx:185
  .map(r => [r.pilotLat!, r.pilotLon!] as [number, number]);

  // DutyPilotMap.tsx:457-458
  retrievals.filter(r => r.pilotLat != null && r.pilotLon != null)
    .forEach(r => points.push([r.pilotLat!, r.pilotLon!]));
  drivers.filter(d => d.lat != null && d.lon != null)
    .forEach(d => points.push([d.lat!, d.lon!]));
  ```
- **Bug:** TypeScript's control flow analysis does NOT narrow through `.filter()`. After `filter(r => r.pilotLat != null)`, the resulting array's elements still have `pilotLat: number | null`. The `!` assertions are used to suppress this. They are **safe when the filter does exactly what it says**, but if another code path mutates `retrievals` between the filter iteration (e.g., concurrent state update), the `!` would access `null`.
  - More critically at `DutyPilotMap.tsx:757`: `<Marker key={...} position={[d.lat!, d.lon!]} icon={driverIcon(d.name)}>` — this is a RENDER path, not inside a filter chain. The `d.lat!` is on a single element from `drivers` array without a preceding null filter. If `drivers` contains an entry where `lat` or `lon` is `null`, this renders `Marker` at `[null, null]` which Leaflet interprets as invalid coordinates, silently failing to display the marker.
- **Impact:** Invisible markers on retrieval/duty-pilot maps when driver position data has null lat/lon (race condition with SSE updates).
- **Confidence:** **MEDIUM** (requires concurrent state update to trigger, but DutyPilotMap.tsx:757 has no guard at all)

---

## Finding T-005: `useHomeSettings.ts` JSON parsed type annotation drift
- **Severity:** MEDIUM
- **Category:** shared type drift (Category 5)
- **File(s):** `src/hooks/useHomeSettings.ts`
- **Lines:** 195–199
- **Code:**
  ```typescript
  const parsedTags = settings.customWidgetTags ? JSON.parse(settings.customWidgetTags) : [];
  const migrated = parsedTags.map((t: { name: string; source: string; type?: string }) => ({
    name: t.name,
    source: t.source || "telegram",
    items: t.items || t.groupNames || [],  // TS2339: 'items' does not exist on type; 'groupNames' does not exist on type
  }));
  ```
- **Bug:** The type annotation `{ name: string; source: string; type?: string }` does not declare `items` or `groupNames`. At runtime, `JSON.parse` returns an untyped object. If the stored JSON has `items` or `groupNames`, JavaScript accesses them fine, but TypeScript flags this as an error (TS2339). More importantly, the type annotation promises a shape the code doesn't actually validate — if `parsedTags` contains a tag with `source: undefined`, it falls through to `"telegram"` (safe), but if it contains `name: undefined`, `t.name` produces `undefined` as the tag name (silent data corruption in the admin UI). The `.map()` callback has no runtime validation.
- **Impact:** Admin UI shows tags with `undefined` names when `customWidgetTags` JSON is malformed. No crash, but user-facing data corruption.
- **Confidence:** **MEDIUM** (requires malformed settings JSON, which is admin-only)

---

## Finding T-006: `AdminContacts.tsx` `(c as any)[roleFilter]` bypasses all type checking
- **Severity:** MEDIUM
- **Category:** unsafe as (Category 3)
- **File(s):** `src/pages/AdminContacts.tsx`
- **Lines:** 157, 553
- **Code:**
  ```typescript
  // Line 157
  const filtered = contacts.filter(c => {
    if (roleFilter !== "all") {
      if (!(c as any)[roleFilter]) return false;
    }
    ...
  });

  // Line 553
  const getContactRoles = (c: Contact): RoleKey[] => {
    return roleKeys.filter(key => (c as any)[key]);
  };
  ```
- **Bug:** `c as any` completely disables TypeScript's property existence checking. `roleFilter` is a string, so `(c as any)[roleFilter]` accesses ANY property name on the contact object. If `roleFilter` is `"admin"`, this correctly checks the admin role. But if `roleFilter` is `"__proto__"` or `"constructor"` (theoretical — it comes from a predefined set, but the type system doesn't enforce this), it accesses arbitrary Object prototype properties. The `as any` also means any property renaming or type changes to `Contact` won't be caught here — the code silently accesses `(c as any)["renamedProperty"]` and gets `undefined`.
- **Impact:** Missed filter results if contact property names change during refactoring. No crash, but incorrect filtering.
- **Confidence:** **MEDIUM** (requires property rename to trigger; the `roleFilter` string is constrained in practice)

---

## Finding T-007: `WindCanvas.tsx` `zoom as any` bypass — Leaflet zoom config invisible
- **Severity:** LOW
- **Category:** unsafe as (Category 3)
- **File(s):** `src/components/windmap/WindCanvas.tsx`
- **Lines:** 172–173
- **Code:**
  ```typescript
  d3Container.call(zoom as any);
  d3Container.call((zoom as any).transform, transformRef.current);
  ```
- **Bug:** The D3 zoom behavior is typed `d3.ZoomBehavior<SVGSVGElement, unknown>`, but `d3Container` is a `refObject<HTMLDivElement>`. The `as any` silently bypasses the type mismatch. If the zoom configuration is wrong (e.g., wrong scale extent, wrong translate extent), the canvas wind map will have no visible error — zoom just won't work correctly, or the map will render at the wrong position.
- **Impact:** Wind map zoom/pan silently broken in production, no console error. User sees partial or misaligned wind overlay.
- **Confidence:** **LOW** (the zoom config comes from a well-tested D3 pattern; type mismatch is cosmetic but masks future bugs)

---

## Finding T-008: `PilotMarkers.tsx` chain of non-null assertions on computed boolean
- **Severity:** LOW
- **Category:** non-null assertion (Category 2)
- **File(s):** `src/components/xcmap/PilotMarkers.tsx`
- **Lines:** 91–95
- **Code:**
  ```typescript
  const hasWind = windData && dirDeg !== null && windData.windSpeed !== null;
  const speed = hasWind ? Math.round(windData!.windSpeed!) : null;
  const gust = hasWind && windData!.windGust !== null ? Math.round(windData!.windGust!) : null;
  ...
  const windLabel = hasWind
    ? (gust !== null && gust > speed!) ? `${speed} G ${gust} kt ${dirLabel}` : `${speed} kt ${dirLabel}`
    : 'No live data';
  ```
- **Bug:** `hasWind` is a computed boolean that implies `windData != null` and `windData.windSpeed != null`. TypeScript cannot narrow through this variable. All three `!` assertions are **correct at runtime** because `hasWind` gates every access. However, `speed!` on line 95 is inside a ternary branch where `hasWind` is true, so `speed` IS non-null — the `!` is redundant but not dangerous. If `windData.windSpeed` is `0` (a valid value), `Math.round(0)` returns `0`, and `windLabel` shows `"0 kt ..."` — correct behavior.
  - The only risk: if someone refactors `hasWind` to not check `windData.windSpeed` but code still uses `windData!.windSpeed!`, the `!` silently allows `Math.round(null)` → `0` (since `Math.round(null)` returns `0` in JS), producing a wrong wind label.
- **Impact:** Silent wrong wind speed display if `hasWind` computation is modified without updating the guarded assertions. No crash.
- **Confidence:** **LOW** (requires code modification to trigger; current code is correct)

---

## Summary of Actionable Fixes

| Priority | Finding | Fix |
|----------|---------|-----|
| P0 | T-001: apiClient.ts empty response | Replace `if (!text) return undefined as unknown as T;` with proper error handling — either reject or return a strict `T \| undefined` and update all callers |
| P1 | T-002: `Record<string, unknown>` state mismatch | Fix API return types in `useRetrievalMap.ts` lines 203 and 248 — use `api.get<LivePilotData[]>` and `api.get<{ available: boolean; lat: number; lon: number; name: string; }>` |
| P2 | T-003: AdminSites.tsx `as unknown as` | Replace with proper response shape types and runtime validation (zod for the critical API responses) |
| P3 | T-004: DutyPilotMap.tsx:757 unguarded `d.lat!` | Add `d.lat != null && d.lon != null` filter before rendering markers |
| P4 | T-005: useHomeSettings.ts JSON parse types | Add `items` and `groupNames` to the parsed tag type annotation |
| P5 | T-006/T-007/T-008 | Low-priority; add proper Contact role types in AdminContacts, type the D3 zoom in WindCanvas, and remove redundant `!` in PilotMarkers |

## Anti-Hallucination Checklist Verification

| Finding | Read actual file? | Trace data flow? | Runtime crash path? | Checked surrounding code? | `any` masks crash? |
|---------|:---:|:---:|:---:|:---:|:---:|
| T-001 | ✅ apiClient.ts:100-101 | ✅ Server 204 → `!text` → `undefined as T` → consumer crash | ✅ `.map()` on undefined | ✅ | ✅ |
| T-002 | ✅ useRetrievalMap.ts:203-253 | ✅ API returns object → `setLivePilots(object)` → `.filter()` crash | ✅ `data.filter is not a function` | ✅ `catch {}` swallows error | ✅ |
| T-003 | ✅ AdminSites.tsx:241-436 | ✅ `as unknown as` preserves undefined → `.map()` crashes | ✅ With T-001 chain | ✅ | ✅ |
| T-004 | ✅ RetrievalMap.tsx:185, DutyPilotMap.tsx:757 | ✅ SSE race → null lat/lon → Leaflet invisible marker | ✅ Marker at invalid coords | ✅ Partial filter in some paths | N/A |
| T-005 | ✅ useHomeSettings.ts:195-199 | ✅ JSON.parse → type omission → TS2339 + undefined names | ✅ Admin UI shows undefined | ✅ `catch` returns `[]` | N/A |
| T-006 | ✅ AdminContacts.tsx:157,553 | ✅ `c as any` → no property checking → silent miss | ✅ Filter returns wrong results | ✅ | ✅ |
| T-007 | ✅ WindCanvas.tsx:172-173 | ✅ `zoom as any` → wrong config → silent render failure | ✅ Map renders wrong position | ✅ | ✅ |
| T-008 | ✅ PilotMarkers.tsx:91-95 | ✅ `hasWind` boolean → `windData!` → Math.round(null) if refactored | ✅ Wrong wind label | ✅ Current code correct | N/A |
