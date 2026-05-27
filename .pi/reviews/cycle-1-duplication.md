# Duplication & Architecture Review — Cycle 1
**Date:** 2026-05-24
**Reviewer:** Code Duplication & Architecture Agent

## Summary
- Total findings: 8
- CRITICAL: 1
- HIGH: 3
- MEDIUM: 4
- LOW: 0

---

## Finding D-1: Wind Compass Component Duplication
- **Severity:** CRITICAL
- **File(s):** `src/components/WindCompass.tsx`, `src/components/weather/WindCompass.tsx`
- **Lines:** ~1-140 (first), ~1-188 (second)
- **Code Location A:**
  ```typescript
  interface WindCompassProps {
    value: string;
    onChange: (value: string) => void;
    crossLeft?: boolean;
    crossRight?: boolean;
  }

  function expandRange(startDir: string, endDir: string): string[] {
    const startIdx = DIRECTIONS.indexOf(startDir);
    const endIdx = DIRECTIONS.indexOf(endDir);
    if (startIdx === -1 || endIdx === -1) return [];
    const result: string[] = [];
    const dist = (endIdx - startIdx + 16) % 16;
    const revDist = (startIdx - endIdx + 16) % 16;
    const steps = dist <= revDist ? dist : -revDist;
    const count = Math.abs(steps);
    const dir = steps >= 0 ? 1 : -1;
    for (let i = 0; i <= count; i++) {
      result.push(DIRECTIONS[(startIdx + i * dir + 16) % 16]);
    }
    return result;
  }
  ```
- **Code Location B:**
  ```typescript
  function getCrossHalves(idealDirs: string[], crossLeft: boolean, crossRight: boolean): Array<{dir: string; side: 'left' | 'right'}> {
    const halves: Array<{dir: string; side: 'left' | 'right'}> = [];
    const idealSet = new Set(idealDirs);
    if (idealSet.size === 0) return halves;

    for (let i = 0; i < ALL_DIRS.length; i++) {
      if (!idealSet.has(ALL_DIRS[i])) continue;

      if (crossRight) {
        const nextIdx = (i + 1) % 16;
        if (!idealSet.has(ALL_DIRS[nextIdx])) {
          halves.push({ dir: ALL_DIRS[nextIdx], side: 'left' });
        }
      }

      if (crossLeft) {
        const prevIdx = (i - 1 + 16) % 16;
        if (!idealSet.has(ALL_DIRS[prevIdx])) {
          halves.push({ dir: ALL_DIRS[prevIdx], side: 'right' });
        }
      }
    }
    return halves;
  }
  ```
- **Duplication:** Both components implement similar compass navigation logic with almost identical direction calculations (16 cardinal directions: N, NNE, NE, etc.). Both handle cross wind directions and similar segment drawing logic, but serve different purposes (one is an input control, the other a display component). The direction constants and calculation methods are essentially the same. Could consolidate common utilities.
- **Impact:** Maintenance risk - changes to wind direction logic would need to be applied in multiple places. Code bloat due to repeated direction calculations.
- **Confidence:** HIGH

---

## Finding D-2: WindMap Component Code Duplication with Different Structures
- **Severity:** HIGH
- **File(s):** `src/components/WindMapProto.tsx`, `src/components/SitesWindMap.tsx`, `src/components/WindCanvas.tsx`
- **Lines:** All files throughout
- **Code Location A:**
  ```typescript
  export default function WindMapProto({ siteId, siteLat, siteLon, siteName, fullscreen = false }: WindMapProps) {
    // Contains extensive map visualization logic including:
    // - Canvas-based wind visualization
    // - Scrubber trays with similar playback controls
    // - Zoom functionality
    // - Time sliders and controls  
    // - Legend displays
  }
  ```
- **Code Location B:**
  ```typescript
  export function SitesWindMapProto({ sites, isAuthenticated, zoomSetpoints }: SitesWindMapProps) {
    // Also contains same extensive map visualization logic
    // Uses same WindCanvas component internally
    // Has similar time sliders, legends, scrubber panels
    // Many similar display elements and controls
  }
  ```
- **Duplication:** Both files implement very similar map-based wind visualization systems with identical components and functionality, including playback controls (play/pause/scrubbing), wind legends, and similar visual elements. They share core logic through WindCanvas but duplicate the higher-level orchestration of controls and UI.
- **Impact:** High maintenance overhead - UI changes must be applied in multiple components. Code bloat with duplicate UI controls that could be extracted.
- **Confidence:** HIGH

---

## Finding D-3: Admin Page CRUD Functional Duplication
- **Severity:** HIGH
- **File(s):** `src/pages/AdminSites.tsx`, `src/pages/AdminContacts.tsx`, `src/pages/AdminDocuments.tsx`, `src/pages/AdminProjectEdit.tsx`
- **Lines:** Various
- **Code Location A:**
  ```typescript
  // From AdminSites.tsx - Contains CRUD operations, modals, forms, searches
  export function AdminSites() {
    const [sites, setSites] = useState<any[]>([]);
    const [siteToDelete, setSiteToDelete] = useState<string | null>(null);
    // ...
    
    const navigateToEdit = (siteId: string) => {
      sessionStorage.setItem("adminSiteList", JSON.stringify(getVisibleSiteIds()));
      navigate(`/admin/sites/${siteId}/edit`);
    };
  }
  ```
- **Code Location B:**
  ```typescript
  // From AdminContacts.tsx - Similar patterns
  export function AdminContacts() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
    // ...
    
    // Modal dialogs, CRUD operations, search functionality, etc.
  }
  ```
- **Duplication:** Admin pages follow very similar patterns: lists with search/filtering, modal forms for editing with consistent layouts, delete confirmations with similar styling, bulk actions, and standard CRUD patterns. Each page reimplements similar logic (search inputs with icons, edit/delete buttons, modal forms, etc.).
- **Impact:** Significant bloat and maintenance burden - UI changes must be replicated across dozens of admin component
- **Confidence:** HIGH

---

## Finding D-4: Duplicated Form Pattern with Consistent Validation Logic
- **Severity:** MEDIUM
- **File(s):** `src/pages/AdminContacts.tsx`, `src/pages/AdminSponsors.tsx`, `src/pages/AdminBranding.tsx`, `src/components/AIImageEnhancerModal.tsx`
- **Lines:** Various form sections
- **Code Location A:**
  ```typescript
  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");
    if (!form.name.trim()) {
      setFormError("Name is required");
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/contacts/${editingId}` : "/api/contacts";
      const method = editingId ? "PUT" : "POST";
      const body: any = { ...form };
      if (!body.password) delete body.password;
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save contact");
      setShowModal(false);
      fetchContacts();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };
  ```
- **Code Location B:**
  ```typescript
  // Similar form validation and handling in other admin pages
  // Pattern: set error state -> validate -> show saving state -> API call -> handle response/errors
  ```
- **Duplication:** The same pattern for form handling repeats across many admin pages with similar structures (validation logic, API call patterns with auth header, error handling, loading states, success handling).
- **Impact:** Repetitive code that can be standardized in reusable form helpers.
- **Confidence:** MEDIUM

---

## Finding D-5: API Fetch Pattern Duplication Across Components
- **Severity:** MEDIUM
- **File(s):** `src/lib/apiClient.ts`, various component files using direct fetch
- **Lines:** Various
- **Code Location A:**
  ```typescript
  // From apiClient.ts - standard API wrapper
  async function request<T>(url: string, opts: RequestOptions = {}): Promise<T> {
    const { method = 'GET', headers = {}, body, signal } = opts;

    const fetchHeaders: Record<string, string> = { ...headers };
    const isFormData = body instanceof FormData;

    if (body !== undefined && !isFormData) {
      fetchHeaders['Content-Type'] = 'application/json';
    }

    // Add CSRF token to state-changing requests
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = await getCSRFToken();
      if (csrfToken) {
        fetchHeaders['X-CSRF-Token'] = csrfToken;
      }
    }
    // ... rest of implementation
  }
  ```
- **Code Location B:**
  ```typescript
  // Direct fetch implementations scattered throughout components like:
  // src/components/AdminSearchBox.tsx has multiple fetch calls
  const res = await fetch("/api/search/admin", {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
    credentials: 'include'
  });
  ```
- **Duplication:** The apiClient wraps fetch with centralized auth, CSRF, and error handling, but many components still implement similar direct fetch logic with redundant auth tokens, content-type headers, and credential management.
- **Impact:** Some components may not benefit from centralized CSRF protection, auth management, or other common functionality that the apiClient provides.
- **Confidence:** MEDIUM

---

## Finding D-6: Repeated Modal Dialog Structure With Identical UI Elements
- **Severity:** MEDIUM
- **File(s):** `src/pages/AdminSites.tsx`, `src/pages/AdminContacts.tsx`, `src/pages/AdminDocuments.tsx`, etc.
- **Lines:** Modal dialog sections
- **Code Location A:**
  ```typescript
  // From AdminSites.tsx
  {siteToDelete && (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-card p-6 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold text-navy">Confirm Deletion</h3>
          <button onClick={() => setSiteToDelete(null)} className="p-2 hover:bg-muted rounded-lg">
            <X className="w-4 h-4 text-foreground-faint" />
          </button>
        </div>
        <p className="text-foreground-secondary mb-6">Are you sure you want to delete this site?</p>
        {deleteError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{deleteError}</div>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => setSiteToDelete(null)}>Cancel</Button>
          <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={confirmDelete}>Delete Site</Button>
        </div>
      </div>
    </div>
  )}
  ```
- **Code Location B:**
  ```typescript
  // Very similar structure repeated with minor text changes
  // Modal backdrop, card structure, headers, action buttons, error handling 
  // All look practically identical across different admin pages
  ```
- **Duplication:** Confirm dialog modals have nearly identical UI structure (backdrop, card, header with close button, centered text, horizontal action buttons) with only text differences. Could use shared Modal component with props.
- **Impact:** UI inconsistency risks if changes aren't propagated, and extra maintenance burden.
- **Confidence:** MEDIUM

---

## Finding D-7: Repeated Search Input Patterns with Icon
- **Severity:** MEDIUM
- **File(s):** `src/components/AdminSearchBox.tsx`, `src/components/PublicSearchBox.tsx`, `src/pages/AdminSites.tsx`, `src/pages/AdminContacts.tsx`, etc.
- **Lines:** Search components
- **Code Location A:**
  ```typescript
  // Search box implementations throughout the UI
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground-faint" />
    <input
      type="text"
      placeholder="Search sites..."
      value={search}
      onChange={e => setSearch(e.target.value)}
      className="w-full pl-9 pr-4 py-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
    />
  </div>
  ```
- **Code Location B:**
  ```typescript
  // Identical structure used with different placeholder text
  // Same layout pattern: absolute Search icon, padded input to accommodate it
  ```
- **Duplication:** All search inputs follow the same layout pattern with an absolute positioned Lucide Search icon on the left and padded input field to make room for it. The only difference is placeholder text and the state variable it binds to.
- **Impact:** Maintenance - changing search input appearance would require changes in multiple places, minor but consistent pattern could be wrapped in component.
- **Confidence:** MEDIUM

---

## Finding D-8: Server Route CRUD Endpoint Duplication
- **Severity:** HIGH
- **File(s):** `server/routes/sites/crud.ts`, `server/routes/contacts.ts`, `server/routes/projects.ts`
- **Lines:** Various throughout
- **Code Location A:**
  ```typescript
  router.get("/:id", async (req, res) => {
    try {
      const site = await db.prepare("SELECT * FROM sites WHERE id = ?").get(req.params.id) as any;
      if (site) {
        res.json({
            ...site,
            hazards: safeJsonParse(site.hazards),
            rules: safeJsonParse(site.rules),
        });
      } else {
        res.status(404).json({ error: "Site not found" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  ```
- **Code Location B:**
  ```typescript
  router.get("/:id", async (req, res) => {
    try {
      const contact = await db.prepare("SELECT * FROM contacts WHERE id = ?").get(req.params.id);
      if (contact) {
        res.json(contact);
      } else {
        res.status(404).json({ error: "Contact not found" });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });
  ```
- **Duplication:** Standard CRUD endpoints across route modules implement similar patterns for database operations, error handling (try/catch with 500 responses), authentication checks with middleware, JSON responses, field normalization, and cache invalidation after writes. Same basic structure repeated for different entity types.
- **Impact:** High maintenance if all entities need changes to authentication scheme, error handling, caching, etc. Template could be created for different entity types.
- **Confidence:** HIGH