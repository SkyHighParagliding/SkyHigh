import type { ZoomTransform } from 'd3-zoom';
import type { GeoProjection } from 'd3-geo';
import { getThermalAt, effectiveWstar } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import { isOnLand } from './landMask';

const REBUILD_MIN_INTERVAL = 50; // ms — matches thermalRenderer.ts
const MAX_GLYPHS = 600;         // hard cap to bound per-frame draw cost
// Target spacing between glyph centres. At ~34 px a phone-sized map carries
// roughly 10x9 glyphs, which reads as a field of cloud rather than a handful of
// scattered marks, while still leaving the heat ramp underneath visible. An
// earlier 48 px floor combined with the coarse rung ladder below snapped Victoria
// to a 0.5° lattice — 20 sample points for the whole viewport, of which one
// survived the filters.
const MIN_GLYPH_SPACING_PX = 34;
const CANVAS_MARGIN = 20;       // px outside the viewport edge where we still draw

// Lattice steps in degrees. Quantising to a fixed ladder (rather than deriving a
// step from the viewport) keeps the lattice absolute, so glyphs stay pinned to
// the same ground as you pan. The rungs are close-spaced so the jump between
// zoom levels is a modest density change, not a 2x one.
const LON_RUNGS = [0.02, 0.03, 0.05, 0.075, 0.1, 0.15, 0.2, 0.3, 0.5, 1, 2] as const;

export interface CumulusGlyph {
  x: number;  // screen px at the time of the last rebuild
  y: number;
  depth: number; // blh - ccl in metres
}

export interface CumulusGlyphState {
  glyphs: CumulusGlyph[];
  /** Transform the glyphs were built against. Null until first build. */
  builtTransform: ZoomTransform | null;
  cachedTransformKey: string;
  cachedTime: number;
  rebuildTimeout: ReturnType<typeof setTimeout> | null;
  lastRebuild: number;
}

export function createCumulusGlyphState(): CumulusGlyphState {
  return {
    glyphs: [],
    builtTransform: null,
    cachedTransformKey: '',
    cachedTime: 0,
    rebuildTimeout: null,
    lastRebuild: 0,
  };
}

// ─── lattice builder ──────────────────────────────────────────────────────────

function rebuildCumulusGlyphs(
  state: CumulusGlyphState,
  currentTransform: ZoomTransform,
  projection: GeoProjection,
  currentTime: number,
  grid: ThermalGrid,
  width: number,
  height: number,
): void {
  const inv = (s: [number, number]) => {
    const geo = projection.invert!(currentTransform.invert(s));
    return geo ?? null;
  };

  // Invert the four viewport corners to get the visible lon/lat bounding box.
  const tl = inv([0, 0]);
  const tr = inv([width, 0]);
  const bl = inv([0, height]);
  const br = inv([width, height]);
  if (!tl || !tr || !bl || !br) { state.glyphs = []; state.builtTransform = currentTransform; return; }

  const lonMin = Math.min(tl[0], tr[0], bl[0], br[0]);
  const lonMax = Math.max(tl[0], tr[0], bl[0], br[0]);
  const latMin = Math.min(tl[1], tr[1], bl[1], br[1]);
  const latMax = Math.max(tl[1], tr[1], bl[1], br[1]);
  const centreLat = (latMin + latMax) / 2;

  // Choose the lon step: smallest rung whose pixel width ≥ MIN_GLYPH_SPACING_PX.
  // `currentTransform.k` is the screen pixels per "unit" in Mercator projected
  // space, and 1° of longitude maps to 1/360 units, so pixel width per degree
  // = k / 360.
  let lonStep = LON_RUNGS[LON_RUNGS.length - 1];
  for (const rung of LON_RUNGS) {
    if ((rung * currentTransform.k) / 360 >= MIN_GLYPH_SPACING_PX) {
      lonStep = rung;
      break;
    }
  }

  // In Mercator a degree of latitude is taller on screen than a degree of
  // longitude by roughly 1/cos(lat), so the lat step has to be smaller to keep
  // the lattice visually square. Pick it off the same rung ladder rather than
  // computing `lonStep * cos(centreLat)` directly: centreLat moves continuously
  // as you pan, which would make the step — and therefore every snapped lattice
  // point — drift a little on every rebuild, and the glyphs would visibly crawl
  // over the ground. Off the ladder the step only changes at rung boundaries.
  const pxPerDegLat = (currentTransform.k / 360) / Math.cos((centreLat * Math.PI) / 180);
  let latStep = LON_RUNGS[LON_RUNGS.length - 1];
  for (const rung of LON_RUNGS) {
    if (rung * pxPerDegLat >= MIN_GLYPH_SPACING_PX) {
      latStep = rung;
      break;
    }
  }

  // Snap bbox to multiples of the step so the lattice is ABSOLUTE (not relative
  // to the viewport corner). This prevents glyphs from shifting during a pan.
  const lonStart = Math.ceil(lonMin / lonStep) * lonStep;
  const latStart = Math.ceil(latMin / latStep) * latStep;

  const glyphs: CumulusGlyph[] = [];

  outer: for (let lon = lonStart; lon <= lonMax + lonStep * 0.01; lon += lonStep) {
    for (let lat = latStart; lat <= latMax + latStep * 0.01; lat += latStep) {
      if (!isOnLand(lon, lat)) continue;

      const th = getThermalAt(lon, lat, currentTime, grid);
      if (!th) continue;

      // Threshold must match the raster cut-off in thermalRenderer.ts (ws < 0.3)
      // so that cloud symbols never appear where the heat overlay shows nothing.
      const ws = effectiveWstar(th.wstar, th.cape);
      if (ws < 0.3) continue;

      if (th.ccl == null) continue;

      // Blue day: thermals top out before reaching condensation — no cumulus.
      if (th.ccl >= th.blh) continue;

      const depth = th.blh - th.ccl;
      // Below ~50 m of depth the CCL and BL top are within the noise of each
      // other and calling it cloud would be overreading the forecast. Above it,
      // shallow cumulus is still real cumulus and worth marking — a 100 m floor
      // was tried first and threw away nearly half the cumulus cells on a normal
      // spring day, when depths typically run 100-300 m.
      if (depth < 50) continue;

      // Project the geographic point to screen space under the current transform.
      const projected = projection([lon, lat]);
      if (!projected) continue;
      const screen = currentTransform.apply(projected as [number, number]);
      const [sx, sy] = screen;

      // Skip if the glyph centre falls outside the canvas (with a small margin
      // so edge-crossing glyphs are not abruptly clipped).
      if (sx < -CANVAS_MARGIN || sx > width + CANVAS_MARGIN) continue;
      if (sy < -CANVAS_MARGIN || sy > height + CANVAS_MARGIN) continue;

      glyphs.push({ x: sx, y: sy, depth });
      if (glyphs.length >= MAX_GLYPHS) break outer;
    }
  }

  state.glyphs = glyphs;
  state.builtTransform = currentTransform;
}

// ─── throttled recompute (mirrors maybeRebuildThermalOverlay) ─────────────────

export function maybeRebuildCumulusGlyphs(
  state: CumulusGlyphState,
  currentTransform: ZoomTransform,
  transformRef: { current: ZoomTransform },
  projection: GeoProjection,
  currentTimeRef: { current: number },
  grid: ThermalGrid,
  width: number,
  height: number,
): void {
  const transformKey =
    `${currentTransform.k.toFixed(1)}_${currentTransform.x.toFixed(0)}_${currentTransform.y.toFixed(0)}`;
  const curTime = currentTimeRef.current;

  if (transformKey !== state.cachedTransformKey || curTime !== state.cachedTime) {
    const now = performance.now();
    if (now - state.lastRebuild > REBUILD_MIN_INTERVAL) {
      rebuildCumulusGlyphs(state, currentTransform, projection, curTime, grid, width, height);
      state.cachedTransformKey = transformKey;
      state.cachedTime = curTime;
      state.lastRebuild = now;
      if (state.rebuildTimeout) { clearTimeout(state.rebuildTimeout); state.rebuildTimeout = null; }
    } else if (!state.rebuildTimeout) {
      state.rebuildTimeout = setTimeout(() => {
        const t = transformRef.current;
        rebuildCumulusGlyphs(state, t, projection, currentTimeRef.current, grid, width, height);
        state.cachedTransformKey =
          `${t.k.toFixed(1)}_${t.x.toFixed(0)}_${t.y.toFixed(0)}`;
        state.cachedTime = currentTimeRef.current;
        state.lastRebuild = performance.now();
        state.rebuildTimeout = null;
      }, REBUILD_MIN_INTERVAL);
    }
  }
}

// ─── per-frame draw ───────────────────────────────────────────────────────────

/**
 * Draws cumulus puff glyphs onto `ctx`.
 *
 * Applies the same affine stale-raster correction as drawThermalOverlay: when
 * the map has panned/zoomed since the last rebuild the glyphs are re-registered
 * to the ground by scaling and translating rather than sliding off.  No blur
 * filter — these are crisp symbols, unlike the heat raster.
 */
export function drawCumulusGlyphs(
  ctx: CanvasRenderingContext2D,
  state: CumulusGlyphState,
  currentTransform: ZoomTransform,
): void {
  const built = state.builtTransform;
  if (!built || state.glyphs.length === 0) return;

  // Affine correction: map from the coordinate space used at build time to the
  // coordinate space in force now.  Both transforms share the same projected
  // space, so a point p lands at k_b*p + t_b when baked and k_c*p + t_c now.
  // Eliminating p: screen_now = (k_c/k_b) * baked + (t_c - (k_c/k_b)*t_b).
  const s = currentTransform.k / built.k;
  const dx = currentTransform.x - s * built.x;
  const dy = currentTransform.y - s * built.y;

  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(s, s);

  for (const { x, y, depth } of state.glyphs) {
    // Radius scales with cloud depth: 3 px for a shallow wisp up to 8 px for a
    // deep cloud. The ramp saturates at 1200 m because typical depths here run
    // 100-400 m — scaling against the rare 3000 m case would leave every normal
    // day rendered at the bottom of the range and visually indistinguishable.
    const r = 3 + Math.min(1, depth / 1200) * 5;

    // Overdevelopment warning: deep cumulus (> 3000 m thick) means storm/Cu-nim
    // risk — a worse day, not a better one.  Show it in dark grey so pilots
    // read it as a caution, matching the CAPE > 500 J/kg note in the help text.
    const isDark = depth > 3000;
    const fillColor = isDark ? 'rgba(120,128,140,0.92)' : 'rgba(255,255,255,0.92)';

    // Single path so the fill reads as one puff, not three separate bubbles.
    // Three overlapping arcs arranged left, top-centre, right with a flat base.
    ctx.beginPath();
    // Left lobe
    ctx.arc(x - 0.75 * r, y, 0.62 * r, Math.PI, 0);
    // Top-centre dome (largest, gives the characteristic puffy crown)
    ctx.arc(x,             y - 0.4 * r, 0.8 * r, Math.PI, 0);
    // Right lobe
    ctx.arc(x + 0.8 * r,  y - 0.05 * r, 0.55 * r, Math.PI, 0);
    // Flat base: line back to the left starting point
    ctx.lineTo(x - 0.75 * r - 0.62 * r, y);
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,80,95,0.55)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  ctx.restore();
}
