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

  const { cumulusDepth, width: overlayW, height: overlayH } = overlay;

  const cols = Math.ceil(width  / GLYPH_SPACING);
  const rows = Math.ceil(height / GLYPH_SPACING);

  // Half-step inset so the lattice doesn't hug the canvas edge on one side.
  const inset = GLYPH_SPACING / 2;

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
      // Typical depths here run 100-400 m, so scaling against the rare 3000 m
      // case would render every ordinary day at the bottom of the range.
      const t = Math.min(1, depth / 1200);
      const r = 2.0 + t * 1.8;
      const alpha = 0.6 + t * 0.35;

      // Deep cumulus (> 3000 m thick) signals overdevelopment / Cu-nim risk —
      // a worse day for flying, not a better one. Render in grey so pilots read
      // it as a caution rather than an abundance of lift.
      ctx.fillStyle = depth > 3000
        ? `rgba(105,112,126,${alpha.toFixed(2)})`
        : `rgba(255,255,255,${alpha.toFixed(2)})`;

      traceCumulus(ctx, sx, sy, r);
      ctx.fill();
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
