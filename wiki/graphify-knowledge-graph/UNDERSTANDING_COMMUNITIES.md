# Understanding SkyHigh Communities

## The Real Answer to "Why Is Everything Labeled Community?"

**Short answer:** Graphify automatically detects clusters of related code but doesn't assign semantic names. We've now mapped all 121 communities to **11 functional areas** that actually mean something.

---

## Your Codebase Architecture (By the Numbers)

The knowledge graph reveals the natural structure of your code:

### Primary Areas (43% of code)
**Backend Auth & Routes** (916 nodes across 43 communities)
- All Express route handlers (`/routes/*.ts`)
- Authentication & session management
- API endpoints for sites, flights, searches, etc.
- **Why so many communities?** Each route file is slightly different; routes cluster by domain

### Secondary Areas (20% of code)
**UI Modals & Dialogs** (387 nodes across 18 communities)
- React modal components (AISiteGeneratorModal, BulkUploadDialog, etc.)
- Form dialogs and property editors
- Layout containers and page headers
- **Why so many?** Each modal is independent; many don't reference each other

**Wind Visualization** (252 nodes across 10 communities)
- WindCanvas, WindMapProto, SitesWindMap components
- Wind field layers and compass displays
- Playback controls and animation state
- **Why separate?** Wind visualization is a complete sub-system with distinct concerns

**XC Flight Tracking** (228 nodes across 7 communities)
- Flight submission and tracking
- Breadcrumb tracking and retrieval coordination
- Pilot data and session management
- **Why separate?** Flights are a distinct domain

### Tertiary Areas (8-10% each)
- **React Data Hooks** (135 nodes): useQuery, useMutation, useSettings, useAuth, etc.
- **Photo Management** (115 nodes): Photo upload, variants, watermarking
- **Weather & Forecasts** (106 nodes): Weather APIs, forecast cards, slot strips
- **Admin Dashboard** (59 nodes): Admin-only pages and settings panels
- **File Upload & Storage** (45 nodes): Bulk uploads, R2 storage handling
- **Search & Discovery** (34 nodes): Smart search, logs, cache invalidation

---

## What Does "Community" Actually Mean?

In graph theory, a **community** is a group of nodes with:
- More edges to each other than to outside nodes
- Natural functional boundaries
- Shared purpose or data flow

Example: **Community 2 (Wind Visualization)**
- Nodes: WindCanvas, WindMapProto, nextSpeed(), formatWindMapTime(), playback state hooks, etc.
- Internal edges: HIGH (these functions call each other frequently)
- External edges: LOW (few outside modules use wind-specific functions)
- Result: Automatically detected as one community

---

## How to Use This Information

### In Claude Code
Query communities by semantic function:
```bash
/graphify query "What components handle file upload?"
# Gets: Community 14 (File Upload & Storage)

/graphify query "Show me all weather-related code"
# Gets: Communities 18, 24, 28, etc. (Weather & Forecasts)

/graphify path "PhotoSlider" "resizeAndCompress"
# Shows: Both in Community 4 (Photo Management) - direct neighbors
```

### In Obsidian
1. Open `wiki/` as a vault in Obsidian
2. Press Ctrl+G for graph view
3. Nodes are now **colored by community** (Obsidian's graph coloring)
4. Related code appears in the same color cluster
5. Read `COMMUNITY_INDEX.md` to understand what each color represents

### For Architecture Decisions
- **Refactoring?** Pick a community with < 100 nodes (easy extraction)
- **Code review?** Focus on a single community (high cohesion, fewer surprises)
- **Bug investigation?** Start with the affected community (tight connections = easier tracing)

---

## Community Statistics

| Category | Count | Nodes | Avg Size | Purpose |
|----------|-------|-------|----------|---------|
| Backend Auth & Routes | 43 | 916 | 21 | API endpoints, middleware |
| UI Modals & Dialogs | 18 | 387 | 21 | React component dialogs |
| Wind Visualization | 10 | 252 | 25 | Wind map rendering & control |
| XC Flight Tracking | 7 | 228 | 33 | Flight submissions & tracking |
| React Data Hooks | 8 | 135 | 17 | State management hooks |
| Photo Management | 3 | 115 | 38 | Image upload & processing |
| Weather & Forecasts | 7 | 106 | 15 | Weather data & display |
| Admin Dashboard | 3 | 59 | 20 | Admin-only UI |
| File Upload & Storage | 2 | 45 | 22 | File handling & R2 |
| Search & Discovery | 1 | 34 | 34 | Smart search system |
| Code Utilities | 26 | 62 | 2 | Misc helpers & types |

**Total:** 128 communities, 2,339 nodes, 0 import cycles

---

## Key Insights

### 1. Backend is Largest
43 communities for routes (916 nodes) means your API surface is broad. This is normal for a full-stack app. Consider these signals:
- High modularity (many small files) = easy to change
- Low connectivity between route files = good separation
- Mixed patterns (some files reference multiple others) = some cross-cutting concerns

### 2. Wind Visualization is a Subsystem
10 separate communities for wind code suggests:
- Multiple specialized components (Canvas, Proto, Compass, etc.)
- Distinct layers (rendering, controls, data fetching)
- Tight internal coupling = good encapsulation, hard to extract

### 3. UI Modals are Loosely Connected
18 communities for modals (387 nodes) means:
- Modals don't reference each other
- Each is self-contained
- Easy to delete or modify without breaking others

### 4. Zero Import Cycles = Clean Architecture
Your graph has **0 circular dependencies** — this is excellent. It means:
- Code can be arranged in layers
- Possible to build import graphs (for dead-code analysis)
- No "untangling" needed before refactoring

---

## Next Steps

1. **Read COMMUNITY_INDEX.md** — see all 121 communities mapped by function
2. **Run `/graphify query`** in Claude Code to explore specific areas
3. **Open in Obsidian** — visualize the graph by community color
4. **Use for refactoring** — pick a small community to extract or optimize

The semantic labels are saved in `graphify-out/.graphify_semantic_map.json` and automatically applied whenever you regenerate the graph with `graphify --update`.
