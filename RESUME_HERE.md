# RESUME_HERE — Last updated: 2026-09-14 (session 60)

## Project: SkyHigh
## Status: Active

## Where I left off

Session 60 shipped **TASK-036 — the thermal map now distinguishes an overcast
sheet from cumulus** (commit `3389874`, local only). `origin/main` is **2 commits
behind**: `3389874` and this session's `[SESSION-SUMMARY]`. (Session 59's notes
below claimed `1b5bd4e`, `737cab0` and `92b49b2` were unpushed — they have since
been pushed; `git log origin/main..main` is the authority, not the prose.)

**The defect Jon spotted.** Side by side with Windy at the same forecast hour,
our map claimed cumulus almost everywhere on a day that was largely overcast.
Root cause: the cumulus gate was purely thermodynamic — `ccl != null && blh -
ccl >= 50` — which answers "if thermals are the cloud-maker, will they mark?"
and is blind to advected stratiform cloud. The failure mode is **inverted, not
random**: with `ccl = (T - Td) * 125`, humid overcast gives a small dewpoint
spread, a low CCL, a large `blh - ccl`, and therefore the *biggest and
brightest* glyphs exactly where the sky is solid grey. Cloud cover was absent at
every layer — not fetched, not in `ThermalCell`, not in the client grid — even
though it is free on the tiers the thermal grid already uses.

**What shipped.** `cloud_cover` and `cloud_cover_low` are fetched into the
thermal grid (registered THERMAL_OPTIONAL so a NaN run cannot veto the forecast
axis; added as *optional* fields on `ThermalPoint` per the persisted-shape
rule). Two new overlay rasters (`overcast`, `cuCoverage`) drive three mutually
exclusive states where there were two:

| state | meaning |
|---|---|
| plain | genuinely blue |
| white glyphs | cumulus — **density** = areal coverage, **size/brightness** = `blh - ccl` depth |
| dark diagonal hatch | stratiform sheet |

This *builds on* the earlier BLH-vs-CCL call rather than replacing it: `blh -
ccl` is still the blue-vs-cumulus discriminator and still sets glyph size. What
was missing was the third question — "is the sky covered by something thermals
didn't make?" W* needed no change; `computeWstar` already consumes model
`shortwave_radiation`, which is cloud-attenuated.

**Three things in there are load-bearing.**
- Glyphs and hatch share one exported `HATCH_MIN`. A cell that is both hatched
  and stippled reads as neither, so the two behaviours must move together —
  sharing the constant is what enforces that.
- OD triangles are **deliberately not suppressed** by overcast. A storm building
  behind a grey sheet is precisely when the warning matters. Verified at the
  code level: the OD pass reads only `odRisk`, never `overcast`/`cuCoverage`.
- Degradation lives in the **values**, not in a presence guard. Both rasters are
  allocated unconditionally by `createThermalOverlay`; a grid with no cloud
  fields leaves `overcast` all-zero and `cuCoverage` filled to 1.0, which is
  pixel-identical to the old map.

**Two agent mistakes I caught and fixed.** (1) Suppression was written as
`overcast < 1.0` — wrong twice over: the raster is pre-multiplied by `fade`, so
cells near the grid edge can *never* reach 1.0 and suppression would silently
never fire there; and it left a whole 70–95 % band both hatched and stippled.
(2) An agent added `(overlay as {overcast?: Float32Array})` casts guarded by `if
(raster)`, reasoning that old grids might lack the raster — dead code that
defeated type checking, since the rasters are always allocated.

**The hatch needed a second pass.** White at α 0.18 measured **1.15:1** against
the fully-overcast sheet colour `rgb(181,185,191)` — it took a 6× contrast
stretch to see the lines in a screenshot at all, which means a pilot outdoors
never would. Lightening on light had nowhere to go. Now slate `90,96,106` at
α 0.35 (~1.44:1) and clearly legible.

**Verified against real data, not synthetic.** The 05:26 cron had already run
with the new fields, so the live grid carried real cloud cover: at 2026-09-14
13:00 Melbourne, 1523 clear / 3240 cumulus / 2733 sheet cells. Hatch with zero
glyphs confirmed over the East Gippsland sheet at native resolution.
`tsc --noEmit` clean.

Note TASK-031 was **already taken** ("Pilot XC Flight History Export"), so this
work is TASK-036 throughout — spec at `wiki/prompts/TASK-036.md`.

---

Session 59 replaced the **two hand-traced coastline polygons with one baked raster
land mask** (commit `92b49b2`). Three commits are unpushed: `1b5bd4e`, `737cab0`,
`92b49b2`.

**The problem.** `interpolateSpatial` in `thermalInterpolation.ts` is *relaxed*
bilinear — it returns a value if ANY of four corners is non-null, so the thermal
field bleeds ~10 km offshore. The client mask is therefore load-bearing: it **is**
the visible coastline. The old masks were two hand-traced rings (a 17-vertex
Tasmania, a mainland ring that drifted inland along the Victorian state border),
duplicated independently on client and server.

**What replaced them.** `scripts/bake-land-mask.mjs` reads GEODATA COAST 100K 2004
(Geoscience Australia, CC BY 4.0, `data/ga-coast/`, gitignored) with a hand-rolled
`.shp`/`.dbf` reader, rasterises by even-odd scanline at 0.01° over
139–151.5E / 44–33S (1250×1100), and emits `shared/landMask.generated.ts` —
LEB128-varint RLE, base64, lazily decoded. One module, both trees. A second
**coverage** mask is the land mask dilated 0.2° by exact Euclidean distance
transform, so the server's fetch-point buffer is baked rather than a parameter.

**Measured, not assumed.** Thermal fetch points 7,496 → 7,653 (+2.1%); fine
2,722 → 2,788; extended 250 → 259. **Tile counts unchanged at 8/3/1, so the
Open-Meteo request count is identical.** 211 points dropped, all water, zero land
lost; 24 of the 112 gained are real land the old Tasmania ring cut off in the
south-west. Bundle: the land mask ships only in the lazily-loaded `thermalRenderer`
chunk (29,104 B raw / 11,369 B gzipped) and the coverage mask is tree-shaken out of
the browser entirely.

**Two bugs worth remembering.**
- The bake failed one check on "Corner Inlet (water)" at (146.55, −38.78). The
  *check* was wrong, not the mask — that point is inside SNAKE ISLAND (.shp record
  7635). Both points are now in the table so the distinction stays documented.
- `edt1d` dropped the spacing term from the parabola intersection, comparing a term
  of order 1e-4 against one of order 1e6. Symptom: one-cell-wide vertical streaks of
  spurious buffer trailing off the coast. **Only the PNG render caught it** — the
  20-point spot-check table could not, and neither would random sampling. The
  verifier was restructured to brute-force *every* one of the 105,420 band cells.

Verification: 39/39 landmask assertions against the decoded artifact, exhaustive
dilation check, `tsc --noEmit` clean, extendedForecast 12/12, gridPipeline 31,
health 17, orchestrator 56, `npm run build` green. See **DECISION-013**.

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
- TASK-036 (thermal overcast vs cumulus), commit `3389874` — completed 2026-09-14.
- Baked raster land mask (DECISION-013), commit `92b49b2` — completed 2026-09-14.
- Wind/thermal map consolidation, steps 1–4 — completed 2026-09-14.
- TASK-TERRAIN-001/002/003 (wiki/02-tasks.md Phase 11) — Ground readout, client-side
  sampling, CC BY 4.0 attribution — completed 2026-09-13.

## Currently in progress
None. Clean tree apart from two long-standing unrelated modifications to
`server/data/siteguide_airspace.txt` and `server/data/siteguide_zones.json`
(deliberately excluded from every commit this session — decide what to do with them).

## Next task to start
**Decide whether to push** — `origin/main` is 2 commits behind (`3389874` and the
session summary). Pushing `main` deploys to Railway production. Note the 7-day fix only reaches production once deployed,
and after deploy the stale extended-forecast rows need
`POST /api/weather/extended-forecast/fetch-now` (requireAuth — Jon triggers it, or
wait for the 05:30 Melbourne cron).

**Three files I could not delete** (the tool classifier blocks deletion; Jon to
remove or grant permission): `tmp/gridTilesOld.ts`, `scripts/probe-coastline.tmp.mjs`,
and the duplicate `.ga-coast/` directory (a full ~22 MB copy of `data/ga-coast/`).

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
