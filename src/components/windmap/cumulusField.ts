import type { ZoomTransform } from 'd3-zoom';
import { CELL, HATCH_MIN } from './thermalRenderer';
import type { ThermalOverlayState } from './thermalRenderer';
import { drawRegistered } from './groundRegistration';

// ── Cumulus glyph lattice geometry ───────────────────────────────────────────
//
// The lattice PITCH is in screen pixels, not in degrees of lat/lon. An earlier
// version anchored it geographically so the glyphs would stay welded to the
// ground during a pan; that made spacing a function of zoom, which went coarse
// enough to read as a sparse grid of marks. At a fixed screen pitch the field
// stays equally dense at every zoom, which is what makes it read as cloud
// texture rather than as a grid.
//
// The lattice PHASE is anchored to the d3-zoom transform translation. Lattice
// points are computed as absolute indices relative to currentTransform.x/y so
// that the same integer index always maps to the same geographic position at a
// given zoom level. Under a pure pan from t to t′, the affine correction in
// drawCumulusField carries any baked glyph exactly to the position a fresh
// rebuild at t′ would place it — so pan produces no snap. Under a zoom, k
// changes and the glyphs necessarily redistribute; that is inherent to a fixed
// screen pitch and is accepted.
//
// Tangent packing: pitch is derived from the glyph's own dimensions at the
// nominal (max-depth) radius so neighbouring glyphs just touch.
//
// The cumulus shape traced by `traceCumulus` is approximately 2.7·r wide but
// only about 1.2·r tall — a flat base with a domed top. This asymmetry
// demands an asymmetric pitch: the horizontal step must clear the full cloud
// width while the vertical step only needs to clear the cloud height. Using a
// single square pitch equal to the cloud width leaves a wide vertical gap and
// makes the field read as scattered dots; using a square pitch equal to the
// cloud height merges the glyphs into horizontal ridges. The two independent
// pitches below are the correct solution to that geometry.
//
// Staggering every second row by half the X pitch (brick / hex packing) stops
// the glyphs reading as aligned columns while maintaining the tangent density.
//
// ── Density channel (TASK-036) ────────────────────────────────────────────────
//
// Before TASK-036 every lattice point in a cumulus region always drew a glyph.
// That made "scattered cu" and "solid cu" indistinguishable — the lattice
// looked equally full whether 20 % or 90 % of the sky was covered.
//
// The density channel encodes areal coverage from `overlay.cuCoverage` (a
// Float32Array written by thermalRenderer.ts). The block MEAN of cuCoverage
// over the lattice cell is converted to a draw probability:
//
//   p = 0.2 + 0.8 * meanCoverage
//
// A glyph is drawn only when a deterministic hash of the absolute lattice index
// (i, j) falls below p. The 0.2 floor keeps marginal cumulus areas from going
// completely blank (a scattered patch should always be visible). On pre-TASK-036
// grids cuCoverage defaults to 1.0, so p = 1.0 and all glyphs draw — no change
// in behaviour.
//
// Why MEAN for cuCoverage but MAX for cumulusDepth?
//   cumulusDepth is a "don't miss a small patch" signal: a single overlay cell
//   with non-zero depth means there is a real cloud somewhere in the block —
//   the right error is to show it, so we take the maximum. cuCoverage is an
//   areal fraction: a block that is 20 % covered in most cells and 90 % in one
//   corner should draw as sparse, not dense. The mean accurately represents the
//   typical coverage in the block; the max would bias the density estimate high.
//
// ── Hash stability ────────────────────────────────────────────────────────────
//
// The hash is keyed on the ABSOLUTE LATTICE INDICES (i, j) — the same integers
// used for screen position. Because the lattice phase is welded to
// currentTransform.x/y (see above), a given (i, j) maps to the same geographic
// position at a given zoom. Hashing on (i, j) therefore means the same glyphs
// survive a pan: no shimmer, no pop. Hashing on screen position would rehash
// every frame as the transform changes.
//
// i and j CAN BE NEGATIVE (the loop starts below the visible origin so the
// phase boundary is never on-screen). JavaScript's bitwise operators work on
// signed 32-bit integers, which gives the correct mix arithmetic for negative
// inputs, but the final `>>> 0` is mandatory to force unsigned before the
// division — without it a negative hash would produce a negative float in
// [−1, 0), which is always < p and would draw glyphs even where p is near zero.
// The same negative-modulo trap that demands `((j % 2) + 2) % 2` for the stagger
// also applies here; `>>> 0` is the definitive fix for the division case.
const CU_SIZE = 2.25;                        // overall glyph size multiplier (~2.25× the original 2–3.8 px range)
const CU_R_NOM = 3.8 * CU_SIZE;              // radius at max depth — the lattice is sized to this (~8.6 px)
const GLYPH_X_SPACING = 2.7 * CU_R_NOM;     // ~23.1 px — cloud width so horizontal neighbours are tangent
const GLYPH_Y_SPACING = 1.2 * CU_R_NOM;     // ~10.3 px — cloud height so vertical neighbours are tangent

// OD warning triangles are drawn on a coarser, independent lattice.
// 54 px is deliberately NOT tied to the cumulus pitch: the OD layer is a
// caution signal that must stay clearly readable as discrete symbols, and a
// widespread OD region at the denser cumulus spacing would become a solid wall
// of triangles. 54 px keeps it legible as a caution layer rather than a texture.
const OD_SPACING = 54; // px

// ── Hatch parameters ──────────────────────────────────────────────────────────
//
// 45° diagonal lines in the overcast region convey "cloud sheet" — a different
// visual language from the dot stipple of the cumulus glyphs. The grey heat
// ramp underneath already expresses overcast intensity continuously; a second
// intensity channel on the hatch would double-code the same signal and add
// visual noise. Constant alpha is correct here.
//
// 8 px spacing and 1 px line weight reads as texture at arm's length. Too wide
// (>12 px) becomes a grid pattern rather than cloud texture; too narrow (<5 px)
// fills the region as a solid tone.
//
// The stroke is DARK, not white. The first revision used rgba(255,255,255,0.18),
// which measured 1.15:1 against the fully-overcast sheet colour rgb(181,185,191)
// — a 6× contrast stretch was needed to see the lines at all in a screenshot,
// which means a pilot outdoors would never see them. White is the wrong family
// anyway: the sheet is pale and the basemap is Carto Light, so lightening on
// light has nowhere to go. HATCH_RGB at HATCH_ALPHA gives ~1.44:1 — legible as
// shading without competing with the white cumulus glyphs, which keep lightness
// as their exclusive channel.
//
// Hatch and glyphs never overlap: thermalRenderer.ts suppresses cumulus at the
// same HATCH_MIN threshold used here, so a cell is hatched or stippled, never
// both. The constant is imported rather than redeclared so the two cannot drift.
//
// The clip region is built from 6-px-wide CELL rects, so the edge is blocky.
// That is accepted: the grey blur underneath is smooth and drawn with a 5 px
// gaussian blur; the hatch adds texture inside a region already defined
// visually by the colour ramp.
const HATCH_SPACING   = 8;                     // px between parallel diagonal lines
const HATCH_LINE_WIDTH = 1;                    // px stroke weight
const HATCH_RGB       = '90,96,106';           // slate grey — darker than the sheet
const HATCH_ALPHA     = 0.35;                  // constant — see note above

export interface CumulusFieldState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;   // CSS px, viewport-sized
  height: number;
  /** Transform in force when the cumulus canvas was last built. Null until first build. */
  builtTransform: ZoomTransform | null;
  /**
   * Key derived from the thermal overlay state — rebuilt whenever it changes.
   * Format: `${overlay.cachedTransformKey}|${overlay.cachedTime}`.
   */
  cachedKey: string;
}

export function createCumulusField(width: number, height: number): CumulusFieldState {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return {
    canvas, ctx,
    width, height,
    builtTransform: null,
    cachedKey: '',
  };
}

/**
 * Traces a small cumulus: three overlapping domes on a flat base, as one path
 * so the fill reads as a single cloud rather than three bubbles. At these sizes
 * the lobes are barely resolvable, but the flat base against a domed top is
 * what makes the mark legible as cloud instead of a dot.
 */
function traceCumulus(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x - 0.75 * r, y, 0.62 * r, Math.PI, 0);
  ctx.arc(x, y - 0.4 * r, 0.8 * r, Math.PI, 0);
  ctx.arc(x + 0.8 * r, y - 0.05 * r, 0.55 * r, Math.PI, 0);
  ctx.lineTo(x - 0.75 * r - 0.62 * r, y);
  ctx.closePath();
}

/**
 * Traces an apex-up equilateral triangle centred at (x, y) with the given
 * half-height `size`. Caller is responsible for fill and/or stroke.
 */
function traceWarningTriangle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  // The apex is `size` above centre; the two base corners are `size` below,
  // offset horizontally so the triangle is equilateral.
  // For total height 2·size the side is 4·size/√3, so half-base = 2·size/√3.
  const bx = size * 1.155;
  ctx.beginPath();
  ctx.moveTo(x,        y - size);       // apex (top)
  ctx.lineTo(x + bx,  y + size);       // bottom-right
  ctx.lineTo(x - bx,  y + size);       // bottom-left
  ctx.closePath();
}

// ── Deterministic hash ────────────────────────────────────────────────────────
//
// Maps any (i, j) integer pair — including negatives — to a value in [0, 1).
// Uses a standard 32-bit integer mixing chain (the "finalise" step from
// MurmurHash3) applied to i XOR'd with a shifted j. The chain is:
//
//   h  = i ^ (j * 2654435761)   — blend j using the golden-ratio multiplier
//   h ^= h >>> 16
//   h  = Math.imul(h, 0x85ebca6b)
//   h ^= h >>> 13
//   h  = Math.imul(h, 0xc2b2ae35)
//   h ^= h >>> 16
//   h >>> 0                      — MANDATORY: forces unsigned 32-bit
//
// Why Math.imul: JS's `*` on 32-bit ints spills into float territory for large
// values; Math.imul is the 32-bit truncating multiply that the algorithm
// requires. Both inputs to Math.imul must be 32-bit integers; j * 2654435761
// is fine because the golden-ratio multiplier is a 32-bit constant and JS
// bitwise coerces before Math.imul anyway.
//
// The `>>> 0` before the division is the definitive fix for negative indices:
// bitwise XOR leaves a signed 32-bit result, which divided by 2^32 gives a
// value in [−1, 0) for negative h. `>>> 0` reinterprets the bits as an
// unsigned 32-bit integer before we divide, producing [0, 1) unconditionally.
function latticeHash(i: number, j: number): number {
  // Blend j into a single 32-bit seed, then avalanche.
  let h = (i ^ Math.imul(j, 2654435761)) | 0;
  h ^= h >>> 16;
  h  = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h  = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;  // >>> 0 forces unsigned; then [0, 1)
}

// ─── rebuild (called once per thermal overlay rebuild) ────────────────────────

/**
 * Redraws the cumulus canvas from `overlay.cumulusDepth`, `overlay.cuCoverage`,
 * and `overlay.overcast`.
 *
 * Pass order:
 *   1. Hatch pass — diagonal-line texture clipped to the overcast region, drawn
 *      first so cumulus glyphs at the soft boundary sit on top.
 *   2. Cumulus glyph pass — density-thinned by cuCoverage so areal coverage is
 *      visually expressed as lattice density, not just glyph brightness.
 *   3. OD warning triangle pass — drawn last so triangles sit above both layers.
 *
 * This is intentionally cheap: it only reads Float32Arrays (no getThermalAt
 * calls) and traces small paths into an offscreen canvas. The heavy work
 * (spatial interpolation) already happened inside rebuildThermalOverlay — we
 * piggy-back on its result rather than paying for a second full pass.
 *
 * Because it is cheap it does not need its own throttle; it simply syncs to
 * the thermal overlay via `cachedKey`.
 */
export function rebuildCumulusField(
  field: CumulusFieldState,
  overlay: ThermalOverlayState,
  currentTransform: ZoomTransform,
): void {
  // Only rebuild when the thermal overlay has actually changed.
  const newKey = `${overlay.cachedTransformKey}|${overlay.cachedTime}`;
  if (newKey === field.cachedKey) return;
  field.cachedKey = newKey;

  const { ctx, width, height } = field;
  ctx.clearRect(0, 0, width, height);

  const { cumulusDepth, odRisk, width: overlayW, height: overlayH } = overlay;

  // ── Pass 1: Hatch — drawn FIRST, under the cumulus glyphs ─────────────────
  //
  // Build a Path2D clip region from every overlay cell whose overcast strength
  // exceeds the threshold. Each cell contributes one CELL×CELL axis-aligned
  // rectangle in screen coordinates — `cx * CELL, cy * CELL` for cell (cx, cy).
  //
  // The blocky clip edge is accepted; the smooth grey ramp underneath already
  // defines the overcast boundary cleanly, and the hatch is texture, not a border.
  //
  // `overcast` is a raster allocated by createThermalOverlay, so it is present
  // on every overlay regardless of how old the underlying grid is. A grid cached
  // before TASK-036 carries no cloud fields, but that degrades to an all-zero
  // raster — no cell clears OVERCAST_THRESHOLD, hatchCellCount stays 0, and the
  // pass below is skipped. Absence of cloud data is handled by the values, not
  // by the raster going missing.
  const hatchPath = new Path2D();
  let hatchCellCount = 0;

  for (let cy = 0; cy < overlayH; cy++) {
    for (let cx = 0; cx < overlayW; cx++) {
      if (overlay.overcast[cy * overlayW + cx] > HATCH_MIN) {
        hatchPath.rect(cx * CELL, cy * CELL, CELL, CELL);
        hatchCellCount++;
      }
    }
  }

  if (hatchCellCount > 0) {
    ctx.save();
    ctx.clip(hatchPath);

    // Stroke 45° diagonal lines across the FULL viewport. The clip region
    // restricts where ink lands; the lines themselves can be computed against
    // the viewport bounding box, which is simpler and avoids edge gaps at the
    // clip boundary.
    //
    // Parameterisation: lines of the form  y = x + c, where c ranges from
    // -(height) to width. Stepping c by HATCH_SPACING * √2 puts the lines
    // HATCH_SPACING apart measured perpendicularly, which is the spacing the
    // eye actually reads — stepping c by HATCH_SPACING directly would leave
    // them a factor of √2 too close.
    const step = HATCH_SPACING * Math.SQRT2;

    ctx.strokeStyle = `rgba(${HATCH_RGB},${HATCH_ALPHA})`;
    ctx.lineWidth   = HATCH_LINE_WIDTH;
    ctx.beginPath();
    for (let c = -height; c <= width + step; c += step) {
      ctx.moveTo(0,     c);
      ctx.lineTo(width, c + width);
    }
    ctx.stroke();

    ctx.restore();
  }

  // Absolute lattice indices covering the viewport, derived from the transform so
  // the lattice phase is welded to the ground. See the geometry comment at the
  // top of the file for the full derivation.
  const i0 = Math.floor((0      - currentTransform.x) / GLYPH_X_SPACING) - 1;
  const i1 = Math.floor((width  - currentTransform.x) / GLYPH_X_SPACING) + 1;
  const j0 = Math.floor((0      - currentTransform.y) / GLYPH_Y_SPACING) - 1;
  const j1 = Math.floor((height - currentTransform.y) / GLYPH_Y_SPACING) + 1;

  // Number of overlay cells spanned by one cumulus lattice step.
  // Used for both the block-MAX depth sample (existing) and the block-MEAN
  // coverage sample (new — see density channel notes in the header).
  const cuXBlock = Math.max(1, Math.round(GLYPH_X_SPACING / CELL));
  const cuYBlock = Math.max(1, Math.round(GLYPH_Y_SPACING / CELL));

  // ── Pass 2: Cumulus glyph pass ────────────────────────────────────────────
  //
  // Glyphs are always white. The old `depth > 3000 m` proxy for OD colouring
  // has been removed; CAPE + LI/CIN signal is now shown as a separate triangle
  // glyph below rather than as a colour on the cloud mark.
  //
  // Why the old depth proxy was dropped: `blh − ccl` measures cloud depth
  // INSIDE the dry boundary layer. Real overdevelopment grows above the BL top
  // via latent heat release, which that formula cannot see. Across 269,856
  // cell-hours of the live grid the maximum depth was 1293 m; not a single
  // cell ever reached the 3000 m threshold — the branch was dead code.
  // CAPE + LI/CIN can see the deep instability directly, and the signal now
  // also fires on blue days (no cumulus), which the old proxy never could.
  //
  // Density thinning: each lattice point is drawn with probability
  //   p = 0.2 + 0.8 * meanCoverage
  // where meanCoverage is the block MEAN of overlay.cuCoverage over the lattice
  // cell. MEAN (not MAX) because cuCoverage is an areal fraction: a block that
  // is mostly sparse but has one dense cell should draw as sparse, not dense.
  // Contrast with cumulusDepth, which takes block MAX because that is a
  // "don't miss a small patch" rule — one cell with cloud depth means there IS
  // cloud somewhere in the block; the right error for a hazard signal is to
  // show it. Coverage is different: the right representation for 30 % sky
  // coverage is 30 % density, not 90 % density because one corner was dense.
  //
  // The draw decision is deterministic: hash(i, j) < p. The hash is keyed on
  // the absolute lattice indices so the same glyphs survive a pan without
  // shimmering. See the hash notes in the header and the latticeHash() comment.
  //
  for (let j = j0; j <= j1; j++) {
    // Brick / hex packing: stagger every second row right by half the X pitch.
    // This stops the glyphs reading as aligned columns (Windy uses the same
    // idiom) while preserving the tangent horizontal density on each row.
    //
    // IMPORTANT: j can be negative (phase-locked indices span below zero), and
    // JavaScript's % operator returns negative results for negative operands.
    // Using `j % 2` directly would flip the stagger sign for negative j,
    // producing a visible seam at the origin row. The `((j % 2) + 2) % 2`
    // expression is the standard non-negative modulo that is safe for all j.
    const stagger = ((j % 2) + 2) % 2 === 1 ? GLYPH_X_SPACING / 2 : 0;

    for (let i = i0; i <= i1; i++) {
      const sx = i * GLYPH_X_SPACING + currentTransform.x + stagger;
      const sy = j * GLYPH_Y_SPACING + currentTransform.y;

      if (sx < -GLYPH_X_SPACING || sx > width  + GLYPH_X_SPACING) continue;
      if (sy < -GLYPH_Y_SPACING || sy > height + GLYPH_Y_SPACING) continue;

      const cx = Math.floor(sx / CELL);
      const cy = Math.floor(sy / CELL);
      if (cx < 0 || cx >= overlayW || cy < 0 || cy >= overlayH) continue;

      // Block sample bounds — shared by both the depth and coverage passes.
      const x0 = Math.max(0, cx - (cuXBlock >> 1)), x1 = Math.min(overlayW - 1, cx + (cuXBlock >> 1));
      const y0 = Math.max(0, cy - (cuYBlock >> 1)), y1 = Math.min(overlayH - 1, cy + (cuYBlock >> 1));

      // Block-MAXIMUM cumulus depth over the lattice cell.
      // MAX because depth is a "don't miss a patch" signal: any cell with
      // non-zero depth means real cloud is present in the block — we should
      // draw a glyph to represent it.
      let depth = 0;
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const v = cumulusDepth[by * overlayW + bx];
          if (v > depth) depth = v;
        }
      }
      if (depth <= 0) continue;

      // Block-MEAN cuCoverage over the lattice cell — controls glyph density.
      // MEAN because coverage is an areal fraction: a mostly-sparse block should
      // draw as sparse even if one cell peaks high. See density channel notes.
      //
      // No absence check is needed. On a grid cached before TASK-036 the cloud
      // fields are undefined, and thermalRenderer.ts fills this raster with 1.0
      // for exactly that case — so the mean is 1, p is 1, and every glyph draws
      // as it did before. Degradation lives in the values, not in a guard here.
      let coverageSum = 0;
      let coverageCount = 0;
      for (let by = y0; by <= y1; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          coverageSum += overlay.cuCoverage[by * overlayW + bx];
          coverageCount++;
        }
      }
      const meanCoverage = coverageCount > 0 ? coverageSum / coverageCount : 1.0;
      // 0.2 floor: even marginal cumulus areas should always show at least
      // a few glyphs — a completely blank region would look like blue sky,
      // which is wrong when there IS some cloud cover.
      const drawProb = 0.2 + 0.8 * Math.min(1, Math.max(0, meanCoverage));

      // Deterministic draw decision: hash the absolute lattice indices (i, j).
      // See latticeHash() and header notes for why (i, j), not screen position.
      if (latticeHash(i, j) >= drawProb) continue;

      // Size and opacity both ramp with cloud depth, saturating at 1200 m.
      // Typical depths here run 100–400 m, so scaling against a rare 3000 m
      // case would crush every ordinary day into the bottom of the range.
      const t = Math.min(1, depth / 1200);
      const r = (2.0 + t * 1.8) * CU_SIZE;
      const alpha = 0.6 + t * 0.35;

      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      traceCumulus(ctx, sx, sy, r);
      ctx.fill();
    }
  }

  // ── Pass 3: OD warning triangle pass ─────────────────────────────────────
  //
  // Drawn AFTER all cumulus glyphs and the hatch so the triangles sit on top.
  // Hard constraint: triangles must still render INSIDE a grey overcast region.
  // A loaded atmosphere under a grey sheet is the same OD trap — arguably worse,
  // because the grey sky suppresses pilot awareness. Do NOT gate triangles on
  // the overcast raster.
  //
  // Uses the coarser OD_SPACING lattice so a widespread OD region reads as
  // a caution layer rather than a solid wall of symbols.
  // Draws into the same canvas, so the stale-transform affine correction
  // applied in drawCumulusField covers both passes for free.

  // Absolute lattice indices for the OD triangle pass, phase-locked to the
  // transform translation by the same derivation as the cumulus pass above.
  // OD_SPACING is a square lattice — no stagger, no asymmetric pitch.
  const odI0 = Math.floor((0      - currentTransform.x) / OD_SPACING) - 1;
  const odI1 = Math.floor((width  - currentTransform.x) / OD_SPACING) + 1;
  const odJ0 = Math.floor((0      - currentTransform.y) / OD_SPACING) - 1;
  const odJ1 = Math.floor((height - currentTransform.y) / OD_SPACING) + 1;

  // Number of overlay cells spanned by one lattice step, used to take the block
  // maximum below.
  const odBlock = Math.max(1, Math.round(OD_SPACING / CELL));

  for (let j = odJ0; j <= odJ1; j++) {
    for (let i = odI0; i <= odI1; i++) {
      const sx = i * OD_SPACING + currentTransform.x;
      const sy = j * OD_SPACING + currentTransform.y;

      if (sx < -OD_SPACING || sx > width  + OD_SPACING) continue;
      if (sy < -OD_SPACING || sy > height + OD_SPACING) continue;

      const cx = Math.floor(sx / CELL);
      const cy = Math.floor(sy / CELL);
      if (cx < 0 || cx >= overlayW || cy < 0 || cy >= overlayH) continue;

      // Take the MAXIMUM risk over the whole lattice block rather than sampling
      // the single centre cell. Sampling the centre silently loses small OD
      // patches: at a typical zoom one 0.09° grid cell is ~13 px across while
      // the lattice step is 54 px, so an isolated OD cell has only about a
      // (13/54)² ≈ 6% chance of containing the sample point. Taking the block
      // maximum guarantees any OD cell in the block raises a triangle, and
      // biases toward showing the warning — the right way to err for a hazard.
      let risk = 0;
      const x0 = Math.max(0, cx - (odBlock >> 1)), x1 = Math.min(overlayW - 1, cx + (odBlock >> 1));
      const y0 = Math.max(0, cy - (odBlock >> 1)), y1 = Math.min(overlayH - 1, cy + (odBlock >> 1));
      for (let by = y0; by <= y1 && risk < 2; by++) {
        for (let bx = x0; bx <= x1; bx++) {
          const v = odRisk[by * overlayW + bx];
          if (v > risk) { risk = v; if (risk === 2) break; }
        }
      }
      if (risk === 0) continue;

      if (risk === 2) {
        // OD likely: filled dark triangle, white outline so it stays legible
        // against the dark red end of the heat ramp.
        traceWarningTriangle(ctx, sx, sy, 6.5);
        ctx.fillStyle = 'rgba(28,31,40,0.92)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        // OD watch (risk === 1): hollow dark triangle — unobtrusive but present.
        traceWarningTriangle(ctx, sx, sy, 5);
        ctx.strokeStyle = 'rgba(38,42,54,0.85)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
      // Reset lineWidth so it doesn't leak into other draw calls.
      ctx.lineWidth = 1;
    }
  }

  field.builtTransform = currentTransform;
}

// ─── per-frame draw ───────────────────────────────────────────────────────────

/**
 * Composites the pre-built cumulus canvas onto `ctx`.
 *
 * Applies the same affine stale-transform correction as drawThermalOverlay:
 * if the map has panned or zoomed since the last rebuild the glyphs are
 * re-registered to the ground by scaling and translating, so they stay pinned
 * between rebuilds rather than sliding off. No blur — glyphs must stay crisp.
 */
export function drawCumulusField(
  ctx: CanvasRenderingContext2D,
  field: CumulusFieldState,
  currentTransform: ZoomTransform,
): void {
  // No blur and no forced smoothing — the stipple must stay crisp; blur is only
  // for the heat ramp. Natural size, so no width/height.
  drawRegistered(ctx, field.canvas, field.builtTransform, currentTransform);
}
