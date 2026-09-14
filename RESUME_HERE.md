# RESUME_HERE — Last updated: 2026-09-14 (session 58)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 58 consolidated the **wind map and thermal map onto one shared shell**.
They were two near-duplicate canvases (~430 and ~374 lines) that had each grown
their own copy of the projection, zoom, basemap tiling and rAF loop. All four
approved steps are complete and committed. **`origin/main` is 4 commits behind —
nothing is pushed yet.**

| Commit | What |
|---|---|
| `d8cc85d` | **Step 1** — hold the map viewport across the wind/thermal toggle |
| `ff9d64e` | **Step 2** — extract the ground-registration affine into one helper (`groundRegistration.ts`) |
| `8df04f9` | **Step 3** — extract the shared shell into a layered `MapCanvas` |
| `a0474e7` | **Step 4** — optional wind flow overlay on the thermal map |

**The architecture.** `MapCanvas.tsx` (new, ~420 lines) owns the projection, zoom,
tile cache, prefetch, resize, crosshair/pin plumbing and the rAF loop. It takes an
ordered `MapLayer[]`, each with `create(w,h) / dispose(res) / draw(ctx, res)`.
`WindCanvas` dropped 432 → 187 lines (4 layers: speed raster, particles, markers,
readout); `ThermalCanvas` 374 → 153 (heat+cumulus combined, optional wind, markers).
Public props on both are unchanged, so no consumer needed editing.

Two things in there are load-bearing and look like tidy-up bait:
- `MapLayer`'s members are declared with **method syntax**, not property-arrow
  syntax, so `MapLayer<SpeedOverlayState>` stays assignable to `MapLayer<any>`
  under `strictFunctionTypes` (method params are checked bivariantly).
- Consumers must `useMemo` the `layers` array. Changing its identity re-runs the
  setup effect and re-creates every layer resource. It does *not* jump the viewport
  because `initialTransformApplied` is a ref reset only by the `sizeKey` effect —
  that is exactly what lets the wind toggle flip layers mid-pan.

**How step 3 was proved.** A "no behaviour change" refactor needs a noise floor, so
every pixel diff was run against a control (new code vs new code):

| | control | test A | test B |
|---|---|---|---|
| Wind | 1.1930 | 1.2251 | 1.2423 |
| Thermal | 0.0675 | 0.1312 | 0.0823 |

Both test values sit inside the control band and the spread *between* the two test
runs exceeds the gap to control — async tile loading and the time-dependent thermal
field, not a regression. Plus live interaction: pan, pin + readout
(`8.2 KTS | 256° WSW | Ground 100m`), and the wind↔thermal toggle with the scale
bar reading 50 km on both sides.

**One thing I got wrong and corrected.** I saw the thermal wind overlay looking ~5×
sparser than the wind map and blamed `DEFAULT_ZOOM_SETPOINTS` hardcoding. Measured
it: 18080 vs 18082 darkened pixels — *identical*. The cause is contrast, not
density (trails cover 9.91% of both maps; mean darkening is only 24/255 against the
orange stipple). The setpoints wiring was kept as correct coupling, not as a fix.

## Last completed task
- Wind/thermal map consolidation, steps 1–4 — completed 2026-09-14.
- TASK-TERRAIN-001/002/003 (wiki/02-tasks.md Phase 11) — Ground readout, client-side
  sampling, CC BY 4.0 attribution — completed 2026-09-13.

## Currently in progress
None. Clean tree apart from two long-standing unrelated modifications to
`server/data/siteguide_airspace.txt` and `server/data/siteguide_zones.json`
(deliberately excluded from every commit this session — decide what to do with them).

## Next task to start
**Decide whether to push the 4 commits** — nothing has gone to `origin/main` yet.

One judgement call is waiting on Jon: the wind flow reads faintly over the thermal
heat field. The dial is `THERMAL_WIND_TRAIL_STYLE.opacityScale` in
`ThermalCanvas.tsx` (currently `0.55`); the colour is `rgb: '15, 23, 42'`.

After that, Jon's stated next item is **TASK-030 (Siteguide Version Change Email
Notification)**. Two smaller things are queued and ready if he'd rather clear the decks:

1. **TASK-SW-001 — consolidate the two service workers.** `public/sw.js`
   (registered by `src/main.tsx`) and `public/sw-tiles.js` (registered by
   `src/hooks/useXCMapState.ts`) both claim scope `/`. Only one can own it, and
   `sw.js` has **no fetch handler** *and* deletes every cache on activate. So the
   terrain caching added to `sw-tiles.js` only takes effect on the XC map, and
   terrain tiles re-download once per session elsewhere. Harmless today (the
   in-memory LRU + prefetch already remove the tap latency) but it's real.
   Caveat is documented in a comment at the top of `public/sw-tiles.js`.
2. **R2 mirror of the z12 terrain pyramid** — 18,288 tiles ≈ 0.37 GB, inside the
   10 GB free tier, served with `Cache-Control: immutable` behind the existing
   `VITE_TERRAIN_TILE_URL` env var. Needs bucket setup + a bulk upload, which is
   infrastructure Jon may prefer to drive himself. Not required for correctness.

## Open questions / blockers

- **Jon asked to be reminded** of these cleanups (still outstanding, do not action silently):
  - `CLAUDE.md` Section 0 and `wiki/00-overview.md` still claim **"white-label ready"**,
    which is no longer true and now actively contradicts DECISION-012.
  - Delete the alternative-site-design code.
  - `GridBoundsSelector.tsx` still says "Fine 0.15°" despite the Fine → Wind rename.
  - ~180 untracked debugging PNGs sitting in the repo root, plus `cumulus-preview.html`,
    `th.json`, `th-prod.json`, `idx.json`, `force-thermal.mts`.
- **Unanswered from the thermal work:** `FORECAST_DAYS = 2` conflicts with the
  "7-Day" naming and `RETAIN_DAYS = 7`; and `convective_inhibition` is missing on a
  large fraction of ECMWF points while `lifted_index` is now fully present, so the
  overdevelopment weighting may be leaning on the weaker of the two variables.
- **Never authenticate to production using `DEFAULT_ADMINS` from the local `.env`.**
  Jon performs privileged production actions himself via the admin UI.

## Quick context refresher

Ground elevation is now sampled **in the browser**. `terrainTiles.ts` fetches AWS
Open Data terrarium tiles (z12, ~30 m/px, no API key) and decodes them with the same
bilinear maths as `server/grid/elevationPoint.ts`; `elevationPoint.ts` (client) is a
two-tier facade that tries the local tile first and falls back to
`GET /api/weather/elevation-at` only when the tile isn't resident, firing a
background tile warm so the next tap is local. Both canvases prefetch the 3×3 z12
block around the map centre, debounced 300 ms.

Two things in there are load-bearing and look like tidy-up bait:
- `sampleElevationSync` is **three-valued** — `undefined` = tile not resident,
  `null` = authoritative no-data (ocean), `number` = metres. Tier 1 must
  short-circuit on **both** `number` and `null`, or every ocean tap goes to the API forever.
- The background tile warm is **deliberately not awaited**. AWS tile latency from
  Australia is 730–940 ms vs ~465 ms for the API, so awaiting it would make cold
  taps *slower*.

The CC BY 4.0 attribution in `ThermalHelpModal.tsx` and the wind map legend is a
**licence obligation** for the Geoscience Australia data — don't remove it.
