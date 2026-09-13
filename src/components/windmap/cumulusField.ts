import type { ZoomTransform } from 'd3-zoom';
import { CELL } from './thermalRenderer';
import type { ThermalOverlayState } from './thermalRenderer';

// Screen-space spacing of the glyph lattice, matched to Windy's thermals layer.
//
// The lattice is deliberately regular and anchored to SCREEN space, not to
// degrees of lat/lon. An earlier version anchored it geographically so the
// glyphs would stay welded to the ground during a pan; that made spacing a
// function of zoom, which went coarse enough to read as a sparse grid of marks.
// At a fixed ~18 px the field stays equally dense at every zoom, which is what
// makes it read as cloud texture rather than as a grid.
const GLYPH_SPACING = 18; // px

// OD warning triangles are drawn on a coarser lattice — every 3rd cumulus point.
// At the 18 px cumulus spacing a widespread OD region would become a solid wall
// of symbols if triangles used the same density; 54 px keeps it clearly readable
// as a caution layer rather than a texture.
const OD_SPACING = GLYPH_SPACING * 3; // 54 px

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

// ─── rebuild (called once per thermal overlay rebuild) ────────────────────────

/**
 * Redraws the cumulus canvas from `overlay.cumulusDepth`.
 *
 * This is intentionally cheap: it only reads a Float32Array (no getThermalAt
 * calls) and traces small glyphs into an offscreen canvas. The heavy work
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

  const cols = Math.ceil(width  / GLYPH_SPACING);
  const rows = Math.ceil(height / GLYPH_SPACING);

  // Half-step inset so the lattice doesn't hug the canvas edge on one side.
  const inset = GLYPH_SPACING / 2;

  // ── Cumulus glyph pass ────────────────────────────────────────────────────
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
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const sx = inset + i * GLYPH_SPACING;
      const sy = inset + j * GLYPH_SPACING;

      const cx = Math.floor(sx / CELL);
      const cy = Math.floor(sy / CELL);
      if (cx < 0 || cx >= overlayW || cy < 0 || cy >= overlayH) continue;

      const depth = cumulusDepth[cy * overlayW + cx];
      if (depth <= 0) continue;

      // Size and opacity both ramp with cloud depth, saturating at 1200 m.
      // Typical depths here run 100–400 m, so scaling against a rare 3000 m
      // case would crush every ordinary day into the bottom of the range.
      const t = Math.min(1, depth / 1200);
      const r = 2.0 + t * 1.8;
      const alpha = 0.6 + t * 0.35;

      ctx.fillStyle = `rgba(255,255,255,${alpha.toFixed(2)})`;
      traceCumulus(ctx, sx, sy, r);
      ctx.fill();
    }
  }

  // ── OD warning triangle pass ──────────────────────────────────────────────
  // Drawn AFTER all cumulus glyphs so the triangles sit on top.
  // Uses the coarser OD_SPACING lattice so a widespread OD region reads as
  // a caution layer rather than a solid wall of symbols.
  // Draws into the same canvas, so the stale-transform affine correction
  // applied in drawCumulusField covers both passes for free.
  const odCols = Math.ceil(width  / OD_SPACING);
  const odRows = Math.ceil(height / OD_SPACING);
  const odInset = OD_SPACING / 2;

  // Number of overlay cells spanned by one lattice step, used to take the block
  // maximum below.
  const odBlock = Math.max(1, Math.round(OD_SPACING / CELL));

  for (let j = 0; j <= odRows; j++) {
    for (let i = 0; i <= odCols; i++) {
      const sx = odInset + i * OD_SPACING;
      const sy = odInset + j * OD_SPACING;

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
  const built = field.builtTransform;
  if (!built) return;

  // Affine correction: same derivation as in drawThermalOverlay.
  // A projected point p lands at k_b*p + t_b in the baked canvas and
  // k_c*p + t_c on screen now.  Eliminating p:
  //   screen_now = (k_c/k_b) * baked + (t_c - (k_c/k_b)*t_b)
  const s  = currentTransform.k / built.k;
  const dx = currentTransform.x - s * built.x;
  const dy = currentTransform.y - s * built.y;

  ctx.save();
  // No blur filter — the stipple must stay crisp; blur is only for the heat ramp.
  ctx.translate(dx, dy);
  ctx.scale(s, s);
  ctx.drawImage(field.canvas, 0, 0);
  ctx.restore();
}
