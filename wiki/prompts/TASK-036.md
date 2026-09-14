# TASK-036: Thermal map — distinguish overcast from cumulus

- **Status:** 🔄 IN PROGRESS
- **Prerequisites:** None
- **Estimated effort:** L
- **Owner:** Opus (planning/verification) + 4 Sonnet subagents (implementation)

---

## Problem

The thermal map's cumulus glyph is gated on one test (`thermalRenderer.ts:267`):

```ts
if (th.ccl != null && th.blh - th.ccl >= 50) {
  cumulusDepth[oy * overlayW + ox] = (th.blh - th.ccl) * Math.max(0, edgeFade);
}
```

That is a purely thermodynamic *"would a surface parcel condense before the
inversion?"* test. It is correct physics for the blue-vs-cumulus question and it
stays. But it is being used to answer two questions it cannot see:

1. **It cannot see cloud the thermals did not make.** Stratiform overcast is
   advected, often above the boundary layer entirely. No arrangement of BLH and
   CCL detects it.
2. **Its failure mode is correlated, not random.** `ccl = (T − Td) × 125`. On a
   humid overcast day the dewpoint spread collapses → `ccl` low → `blh − ccl`
   large → and since glyph size and alpha both ramp with that depth
   (`cumulusField.ts:203-205`), we draw our **biggest, brightest** cumulus
   exactly where the sky is solid grey.

Consequences today:

- **Glyph** means "real cumulus" *or* "overcast misread as cumulus".
- **Plain** means "blue day" *or* "solid overcast".
- Density is fixed by the lattice, so "scattered cu" and "solid cu" are
  indistinguishable — hence "CU's almost everywhere".
- `ThermalHelpModal.tsx:78` currently tells pilots *"Plain areas are typically
  blue days"*. That statement is false in the field.

Root cause of the data gap: `cloud_cover` / `cloud_cover_low` are **not fetched
for the thermal grid** (`thermalGrid.ts:48-58`). The fine/wind grid does fetch
them (`fineGrid.ts:26-27`) but `gridToWindData` only emits `{u, v}`, so they
reach no client. Both fields are supported on tier 1 (Open-Meteo REST) and
tier 2 (ECMWF S3) — `openMeteoS3.ts:296-297` — which are the only tiers the
thermal grid can use anyway. Same 9 km ECMWF source, same points, same request.

## What we are NOT changing

- `blh − ccl` remains the blue/cumulus discriminator and keeps driving glyph
  **size and alpha** (cloud depth — a signal Windy does not show).
- `computeWstar` already consumes cloud-attenuated `shortwave_radiation`
  (`extract.ts:399-400`), so the heat ramp is already honest under overcast.
- The OD warning triangle. See the hard constraint below.

---

## Contract (FROZEN — all agents code against this)

### Client thermal cell (`thermalInterpolation.ts`)

Two new optional fields. Names deliberately avoid collision with the existing
`ccl` (condensation level):

```ts
/** Total cloud cover, %. Undefined on grids cached before TASK-036. */
cloud?: number;
/** Low cloud cover, %. Undefined on grids cached before TASK-036. */
cloudLow?: number;
```

### Derived quantities (computed in `thermalRenderer.ts`)

```ts
export const CU_CLOUD_MIN_PCT   = 12;  // below this low cloud → blue, no glyphs
export const OVERCAST_MIN_PCT   = 70;  // at/above → grey sheet, glyphs suppressed
export const OVERCAST_FULL_PCT  = 95;  // grey alpha saturates here
```

```
overcastPct = max(cloudLow ?? 0, (cloud ?? 0) >= 90 ? cloud : 0)
```

Rationale for the second term: low cloud is the sheet that shades the ground,
but a total cover of 90 %+ is a sheet whatever level the model puts it at.

```
overcast   = clamp01((overcastPct - OVERCAST_MIN_PCT) / (OVERCAST_FULL_PCT - OVERCAST_MIN_PCT))
cuCoverage = clamp01((cloudLow - CU_CLOUD_MIN_PCT) / (OVERCAST_MIN_PCT - CU_CLOUD_MIN_PCT))
```

### Two new rasters on `ThermalOverlayState`

```ts
/** Grey overcast strength 0–1 per overlay cell, edge-faded. 0 = no sheet. */
overcast: Float32Array;
/** Cumulus areal coverage 0–1 per overlay cell, drives glyph density.
 *  1.0 when cloud data is absent (pre-TASK-036 grids) — see degradation rule. */
cuCoverage: Float32Array;
```

### Degradation rule (CRITICAL)

Production's cached thermal grid has **no cloud fields until the next 5:26 am
fetch**. When `cloudLow === undefined`:

- `cuCoverage = 1` (full lattice, today's behaviour)
- `overcast = 0` (no grey)

The map must look and behave **exactly as it does today** on a pre-TASK-036
grid. No blank regions, no missing glyphs.

---

## Hard constraints

1. **The OD warning triangle is never suppressed by overcast.** A loaded
   atmosphere under a grey sheet is the same trap, arguably worse — and
   `thermalRenderer.ts:157` plus `ThermalHelpModal.tsx:79` both already commit
   to the triangle firing when there is no visible cloud to warn you.
2. **`GridPoint` / `ThermalPoint` in `bounds.ts` are a PERSISTED SHAPE.** New
   fields must be **optional** (`cloud_cover?: number[]`). Never rename, remove
   or nest existing fields — production `wind_grid_data` rows depend on it.
3. Both new variables go in `THERMAL_OPTIONAL`, never `THERMAL_REQUIRED`. A run
   of NaN must not veto or shorten the forecast axis.
4. NaN → `undefined` at the extract boundary. `NaN != null` is `true`, which
   silently breaks every `!= null` guard downstream (existing precedent:
   `extract.ts:508-512`).
5. Do not modify anything under `spike/`.
6. Do not run any git command that changes state. Do not commit.

---

## Work split

| Agent | Files (disjoint) |
|---|---|
| **1 — Data plumbing** | `server/grid/thermalGrid.ts`, `server/grid/bounds.ts`, `server/grid/extract.ts`, `src/components/windmap/thermalInterpolation.ts` |
| **2 — Raster + heat ramp** | `src/components/windmap/thermalRenderer.ts` |
| **3 — Glyph field + hatch** | `src/components/windmap/cumulusField.ts` |
| **4 — Copy & legend** | `src/components/windmap/ThermalHelpModal.tsx` + whichever component renders `THERMAL_LEGEND_CSS` |

Wave 1: agents 1 and 4 (parallel). Wave 2: agents 2 and 3 (parallel), once the
types from agent 1 exist.

---

### Agent 1 — Data plumbing

1. `thermalGrid.ts`: add `"cloud_cover"`, `"cloud_cover_low"` to
   `THERMAL_VARIABLES` **and** to `THERMAL_OPTIONAL`. Extend `buildThermalPoint`
   with `seriesOf(p, "cloud_cover", n, gaps("cloud_cover"))` and the low
   equivalent. Update the module doc-comment to explain why they are optional.
2. `bounds.ts`: add `cloud_cover?: number[]; cloud_cover_low?: number[];` to
   `ThermalPoint.hourly`. **Optional** — see hard constraint 2.
3. `extract.ts`: add `cloud?: number; cloudLow?: number` to `ThermalCell` with
   doc comments, and populate them in the `timeStepData.push({...})` block,
   applying the same NaN→undefined normalisation as `li`/`cin`.
4. `thermalInterpolation.ts`: add both fields to all three cell type literals
   (lines 11, 26, 28, 86) and interpolate them with the existing
   `hasCcl`-style all-four-corners guard, plus the two-time-step guard in
   `getThermalAt`.

Consider extracting the repeated inline cell type into a named exported type if
it reduces duplication — four copies of an eight-field literal is getting silly.
Your call; do not let it balloon the diff.

### Agent 2 — Raster + heat ramp

1. Add `overcast` and `cuCoverage` to `ThermalOverlayState` and allocate both in
   `createThermalOverlay` (`Float32Array(overlayW * overlayH)`). Document them in
   the same style as `cumulusDepth`.
2. In `rebuildThermalOverlay`, `.fill(0)` both alongside the existing two.
3. **Restructure the `ws < 0.3` early-continue.** This is the subtle part.
   Today `if (!th || ws < 0.3) { pixels[idx+3] = 0; continue; }`. Overcast
   regions frequently have low w*, so under the current control flow the grey
   would write alpha 0 and never be visible — the exact cells we most need to
   mark. Restructure so that a cell with `th` present still computes `overcast`
   and gets grey even when `ws < 0.3`; only the *heat colour* is skipped.
   `!th` still continues.
4. Compute `overcast` and `cuCoverage` per the frozen contract, both multiplied
   by `Math.max(0, edgeFade)` exactly as `cumulusDepth` is.
5. Blend grey into the pixel: composite `rgb(150,154,160)` over the LUT colour
   with alpha `overcast * 0.75`, and raise the pixel's alpha so the sheet is
   visible over a pale basemap even where the heat ramp contributes nothing.
   Pick the floor by eye against the existing STOPS alphas and justify it in a
   comment.
6. Suppress cumulus at source: leave `cumulusDepth` at 0 where `overcast` is
   high, so `cumulusField.ts` needs no knowledge of the rule. Do **not** touch
   `odRisk` — hard constraint 1.

### Agent 3 — Glyph field + hatch

1. **Hatch pass, drawn FIRST** (before the cumulus pass, so glyphs at the soft
   boundary sit on top). Build a `Path2D` of the overcast region by adding one
   `CELL`-sized rect per overlay cell where `overlay.overcast[...] > 0.35`, in
   screen coordinates (`cx * CELL`, `cy * CELL`, `CELL`, `CELL`). Then
   `ctx.save(); ctx.clip(path);` → stroke 45° diagonal lines across the full
   viewport → `ctx.restore()`.
   - The blocky 6 px clip edge is acceptable: the grey underneath it is smooth
     and drawn with a 5 px blur, and the hatch is texture, not a boundary.
   - Constant line alpha. The smooth grey ramp already conveys intensity;
     a second intensity channel would just be noise.
   - Tune spacing and weight so it reads as "cloud sheet", not as a fill
     pattern. Start around 7–9 px spacing, ~1 px, white at low alpha, and adjust.
2. **Density thinning in the cumulus pass.** Take the block **MEAN** of
   `overlay.cuCoverage` over the lattice cell (mean, not max — it is an areal
   fraction; contrast the block-MAX used for `cumulusDepth`, which is a
   "don't miss a patch" rule). Then:

   ```
   p = 0.2 + 0.8 * meanCoverage
   ```

   Draw the glyph only when `hash(i, j) < p`, where `i`/`j` are the **absolute
   lattice indices** already computed in the loop. Those indices are phase-locked
   to `currentTransform.x/y` (see the geometry comment at the top of the file),
   so they are geographically stable under pan — hashing on them means glyphs do
   not shimmer or pop while panning. Do **not** hash on screen position.
   - `hash` must be a pure, deterministic 32-bit integer mix returning `[0,1)`,
     handling negative `i`/`j` correctly. Use `>>> 0` to force unsigned.
   - The 0.2 floor keeps a marginal cumulus area visible rather than empty.
3. Update the file's header comment block to describe the new density channel.
4. Do not change the OD triangle pass.

### Agent 4 — Copy & legend

1. `ThermalHelpModal.tsx:78` currently claims *"Plain areas are typically blue
   days"*. Rewrite that paragraph for the three-state map: plain = genuinely
   blue; white cloud marks = cumulus, with **density now meaning how much of the
   sky they cover** and size/brightness still meaning cloud depth (`BLH − CCL`);
   grey hatch = overcast sheet, thermals shaded out, no usable cumulus marking.
2. Keep the existing paragraph at line 79 about the OD triangle firing on blue
   days, and extend it: the triangle also fires **under a grey sheet**, and that
   is deliberate.
3. Find whichever component renders `THERMAL_LEGEND_CSS` and add legend entries
   for the cumulus glyph and the grey hatch, matching the existing visual style.
4. Match the surrounding tone — plain English, pilot-facing, no jargon that
   isn't already defined on screen. Read the whole modal before editing so the
   voice is consistent.

---

## Verification (Opus, after integration)

1. `npx tsc --noEmit` clean.
2. Force a thermal grid fetch so cloud fields are present, then screenshot
   `/sites` thermal at the forecast hour from the user's comparison and check
   the Melbourne/Geelong region reads grey, not cumulus.
3. Confirm the degradation path: with cloud fields stripped, the map is
   pixel-equivalent to today.
4. Confirm OD triangles still render inside a grey region.
