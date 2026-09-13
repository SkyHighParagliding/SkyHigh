import type { ZoomTransform } from 'd3-zoom';
import type { GeoProjection } from 'd3-geo';
import { getThermalAt, effectiveWstar } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import { isOnLand } from './landMask';

// ---------------------------------------------------------------------------
// Overdevelopment risk signal
// ---------------------------------------------------------------------------

/** Categorical OD risk, ascending severity.
 *    0 = no signal (CAPE too low to matter)
 *    1 = watch (some indicators present; check sounding)
 *    2 = likely (multiple indicators agree; avoid or give extra margin)
 */
export type OdRisk = 0 | 1 | 2;

/**
 * Derives an overdevelopment risk category from convective parameters.
 *
 * The three rungs exist so the signal degrades with provider tier rather than
 * disappearing entirely when a field is missing:
 *
 *   Rung 1 (LI gate): Lifted Index is the most direct buoyancy measure aloft.
 *     LI < −2 °C means the parcel is substantially warmer than the environment
 *     at 500 hPa — vigorous deep convection is likely. LI < 0 °C is unstable
 *     but marginal. LI is tier-1 only (Open-Meteo REST API); the ECMWF S3
 *     archive does not carry it, so tier-2 points fall through to rung 2.
 *
 *   Rung 2 (CIN gate): Convective inhibition measures the capping inversion —
 *     the lid that keeps thermals from punching through to free convection.
 *     A weak cap (CIN < 50 J/kg) means the lid can be broken easily once CAPE
 *     is present; CIN is a weaker signal than LI because it measures whether
 *     convection can start rather than how violent it will be once going.
 *     Empirically corr(CAPE, LI) ≈ −0.43 vs corr(CAPE, CIN) ≈ 0.20, so CIN
 *     adds information but is not a substitute for LI. Available tier-1 + tier-2.
 *
 *   Rung 3 (CAPE only): Last resort when neither LI nor CIN is available.
 *     500 J/kg is the threshold already documented to pilots in the help modal
 *     as the OD watch level, and 800 J/kg is a blunt upper-tier flag. Not
 *     equivalent to the upper rungs — kept only so the signal is never absent.
 */
export function computeOdRisk(cape: number, li?: number, cin?: number): OdRisk {
  // Below 500 J/kg CAPE the atmosphere simply does not have enough energy for
  // deep convection regardless of what the stability indices say.
  if (cape < 500) return 0;

  // Rung 1: Lifted Index is available (tier-1 only).
  if (li != null && !Number.isNaN(li)) {
    if (li < -2) return 2;  // Strongly unstable — overdevelopment likely.
    if (li < 0)  return 1;  // Marginally unstable — watch.
    return 0;               // LI ≥ 0 means stable or neutral aloft.
  }

  // Rung 2: CIN available (tier-1 + tier-2), LI was not.
  if (cin != null && !Number.isNaN(cin)) {
    // A weak cap combined with meaningful CAPE means convection can break free.
    if (cin < 50) return 1;
    return 0;
  }

  // Rung 3: CAPE only. Blunt, but better than silence.
  if (cape > 800) return 1;
  return 0;
}

export const CELL = 6; // sample every 6px for a smooth heatmap — exported for cumulusField.ts
const REBUILD_MIN_INTERVAL = 50; // ms

// W*-based colour stops (pale yellow → gold → orange → red → crimson).
// Stops are concentrated between 0.8 and 2.4 because that is where the
// large majority of cells fall on a normal day (p25≈1.4, p75≈2.0).
// An evenly-spaced ramp across 0–4 wastes most of its range on values
// that essentially never occur and flattens the part of the map pilots
// actually read.
const STOPS: { wstar: number; r: number; g: number; b: number; a: number }[] = [
  { wstar: 0.00, r: 250, g: 245, b: 200, a:   0 },
  { wstar: 0.30, r: 250, g: 240, b: 170, a:  70 },
  { wstar: 0.80, r: 250, g: 215, b: 110, a: 125 },
  { wstar: 1.20, r: 250, g: 185, b:  70, a: 160 },
  { wstar: 1.60, r: 245, g: 140, b:  45, a: 185 },
  { wstar: 2.00, r: 232, g:  95, b:  30, a: 200 },
  { wstar: 2.40, r: 205, g:  50, b:  25, a: 212 },
  { wstar: 3.00, r: 165, g:  20, b:  35, a: 222 },
  { wstar: 4.00, r: 120, g:  10, b:  60, a: 232 },
];

const LUT_SIZE = 512;
const LUT_MAX_WSTAR = 5.0;

const thermalLUT = new Uint8Array(LUT_SIZE * 4);
(() => {
  for (let i = 0; i < LUT_SIZE; i++) {
    const wstar = (i / (LUT_SIZE - 1)) * LUT_MAX_WSTAR;
    let s0 = STOPS[0];
    let s1 = STOPS[STOPS.length - 1];
    for (let s = 0; s < STOPS.length - 1; s++) {
      if (wstar >= STOPS[s].wstar && wstar <= STOPS[s + 1].wstar) {
        s0 = STOPS[s]; s1 = STOPS[s + 1]; break;
      }
    }
    const t = s1.wstar === s0.wstar ? 1 : (wstar - s0.wstar) / (s1.wstar - s0.wstar);
    thermalLUT[i * 4]     = Math.round(s0.r + (s1.r - s0.r) * t);
    thermalLUT[i * 4 + 1] = Math.round(s0.g + (s1.g - s0.g) * t);
    thermalLUT[i * 4 + 2] = Math.round(s0.b + (s1.b - s0.b) * t);
    thermalLUT[i * 4 + 3] = Math.round(s0.a + (s1.a - s0.a) * t);
  }
})();

function wstarToLUTIndex(wstar: number): number {
  return Math.min(LUT_SIZE - 1, Math.max(0, Math.round((wstar / LUT_MAX_WSTAR) * (LUT_SIZE - 1))));
}

// The legend bar represents the range pilots actually encounter — normalise
// to 3.0 m/s so the full hue travel is visible, rather than 4.0 which
// would compress all the colour into the left ~75% of the bar.
export const LEGEND_MAX_WSTAR = 3.0;

// CSS gradient for the legend bar
export const THERMAL_LEGEND_CSS = (() => {
  const pts: string[] = [];
  for (const s of STOPS) {
    const pct = Math.min(100, (s.wstar / LEGEND_MAX_WSTAR) * 100);
    pts.push(`rgba(${s.r},${s.g},${s.b},${(s.a / 255).toFixed(2)}) ${pct.toFixed(0)}%`);
  }
  return `linear-gradient(to right, ${pts.join(', ')})`;
})();

export interface ThermalOverlayState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageData: ImageData;
  pixels: Uint8ClampedArray;
  width: number;
  height: number;
  /**
   * Screen-space extent the raster covers, in CSS px. Not the same as the
   * canvas the raster is drawn onto: `width` is rounded up, so the samples
   * span `width * CELL`, which overshoots the viewport by up to CELL-1 px.
   * Drawing the raster across the viewport instead of across its own span
   * squeezed it by that margin and shifted every cell slightly west.
   */
  spanX: number;
  spanY: number;
  /**
   * Cumulus depth (blh − ccl) in metres for each overlay cell, pre-multiplied
   * by the edge-fade factor so the stipple follows the same soft boundary as
   * the heat ramp. Zero for any cell that is skipped (water, no data, blue
   * day, or depth < 50 m). Read by cumulusField.ts without re-running
   * getThermalAt — that is why it lives here rather than in a separate pass.
   */
  cumulusDepth: Float32Array;
  /**
   * Overdevelopment risk for each overlay cell: 0 = none, 1 = watch, 2 = likely.
   * Populated in the same per-cell loop as cumulusDepth (no second pass), but
   * deliberately NOT behind the cumulus gate: a hot blue day with high CAPE has
   * no cumulus to mark and is exactly when a pilot is most easily caught out.
   * Read by cumulusField.ts, which draws a separate warning triangle for it.
   */
  odRisk: Uint8Array;
  /**
   * The transform in force when the raster was built. The raster is baked in
   * screen space, so it is only valid for this transform; drawing it under any
   * other one misplaces it. Null until the first build completes.
   */
  builtTransform: ZoomTransform | null;
  cachedTransformKey: string;
  cachedTime: number;
  rebuildTimeout: ReturnType<typeof setTimeout> | null;
  lastRebuild: number;
}

export function createThermalOverlay(width: number, height: number): ThermalOverlayState {
  const overlayW = Math.ceil(width / CELL);
  const overlayH = Math.ceil(height / CELL);
  const canvas = document.createElement('canvas');
  canvas.width = overlayW;
  canvas.height = overlayH;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(overlayW, overlayH);
  return {
    canvas, ctx, imageData,
    pixels: imageData.data,
    width: overlayW, height: overlayH,
    spanX: overlayW * CELL, spanY: overlayH * CELL,
    builtTransform: null,
    cachedTransformKey: '',
    cachedTime: 0,
    rebuildTimeout: null,
    lastRebuild: 0,
    // Zero-initialised: any cell not reached by the loop (or skipped by continue)
    // stays 0, which cumulusField.ts treats as "no cumulus here".
    cumulusDepth: new Float32Array(overlayW * overlayH),
    // Zero-initialised likewise: 0 = no OD risk, matching the type invariant.
    odRisk: new Uint8Array(overlayW * overlayH),
  };
}

/**
 * Draws the raster, compensating for any drift between the transform it was
 * baked against and the one in force now.
 *
 * Both transforms share the same projected coordinate space, so a projected
 * point p lands at `k_b * p + t_b` in the raster and `k_c * p + t_c` on screen.
 * Eliminating p gives an affine map from raster space to screen space: scale by
 * `k_c / k_b`, then translate. Applying it keeps a stale raster pinned to the
 * ground it was computed for — it goes soft during a pan or pinch, then sharpens
 * when the throttled rebuild lands, rather than sliding off the map.
 */
export function drawThermalOverlay(
  ctx: CanvasRenderingContext2D,
  overlay: ThermalOverlayState,
  currentTransform: ZoomTransform,
) {
  const built = overlay.builtTransform;
  if (!built) return; // Nothing rasterised yet — drawing garbage is worse than drawing nothing.

  const s = currentTransform.k / built.k;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = 'blur(5px)';
  ctx.translate(currentTransform.x - s * built.x, currentTransform.y - s * built.y);
  ctx.scale(s, s);
  ctx.drawImage(overlay.canvas, 0, 0, overlay.spanX, overlay.spanY);
  ctx.restore();
}

function rebuildThermalOverlay(
  overlay: ThermalOverlayState,
  currentTransform: ZoomTransform,
  projection: GeoProjection,
  currentTime: number,
  grid: ThermalGrid,
) {
  const { width: overlayW, height: overlayH, pixels, ctx, imageData, cumulusDepth, odRisk } = overlay;
  // Zero both arrays up front; only cells with data and sufficient edgeFade are
  // written below, so every skipped cell (water, no data, outside edge) stays 0.
  cumulusDepth.fill(0);
  odRisk.fill(0);
  for (let oy = 0; oy < overlayH; oy++) {
    for (let ox = 0; ox < overlayW; ox++) {
      const px = ox * CELL + CELL / 2;
      const py = oy * CELL + CELL / 2;
      const inverted = currentTransform.invert([px, py]);
      const geo = projection.invert!(inverted);
      const idx = (oy * overlayW + ox) * 4;
      if (!geo) { pixels[idx + 3] = 0; continue; }
      if (!isOnLand(geo[0], geo[1])) { pixels[idx + 3] = 0; continue; }
      const th = getThermalAt(geo[0], geo[1], currentTime, grid);
      const ws = th ? effectiveWstar(th.wstar, th.cape) : 0;
      if (!th || ws < 0.3) { pixels[idx + 3] = 0; continue; }
      // Named lutIdx, not li: `li` now means Lifted Index on the thermal cell
      // (see th.li below), and having both in one function invites a misread.
      const lutIdx = wstarToLUTIndex(ws);
      pixels[idx]     = thermalLUT[lutIdx * 4];
      pixels[idx + 1] = thermalLUT[lutIdx * 4 + 1];
      pixels[idx + 2] = thermalLUT[lutIdx * 4 + 2];
      // Fade alpha within 1° lon / 0.5° lat of grid boundary to avoid hard rectangular clip
      const edgeFade = Math.min(
        (geo[0] - grid.lonMin) / 1.0,
        (grid.lonMax - geo[0]) / 1.0,
        (geo[1] - grid.latMin) / 0.5,
        (grid.latMax - geo[1]) / 0.5,
        1.0,
      );
      pixels[idx + 3] = Math.round(thermalLUT[lutIdx * 4 + 3] * Math.max(0, edgeFade));

      // Cumulus depth and OD risk: both piggy-back on the existing getThermalAt
      // result so we pay for the interpolation only once per cell.
      // edgeFade gating is identical: no marks outside the grid footprint.
      if (th.ccl != null && th.blh - th.ccl >= 50) {
        cumulusDepth[oy * overlayW + ox] = (th.blh - th.ccl) * Math.max(0, edgeFade);
      }

      // OD risk is written for EVERY cell that survives the land + ws + edgeFade
      // gates — not just the ones with a cumulus glyph. This recovers the "hot
      // blue day" case: high CAPE, healthy boundary layer, but CCL above BLH so
      // no cumulus forms. Measured against the live grid those cells represent
      // ~207 additional OD warnings that would otherwise be silently dropped.
      //
      // No extra boundary-layer floor is applied here. The ws < 0.3 gate above
      // already excludes collapsed-BL cases (evening elevated instability, etc.):
      // measured across the live grid it rejects 165 of 596 high-CAPE cells, and
      // zero surviving cells had BLH below 300 m — a separate BLH threshold
      // would be dead code. OD risk is also categorical (0/1/2), not a magnitude,
      // so edgeFade multiplication would be wrong; zero-initialisation and the
      // continue statements above already ensure edge cells read 0.
      odRisk[oy * overlayW + ox] = computeOdRisk(th.cape, th.li, th.cin);
    }
  }
  ctx.putImageData(imageData, 0, 0);
  // Record the transform the raster was baked against so drawThermalOverlay can
  // re-register it if the map has moved on since.
  overlay.builtTransform = currentTransform;
}

export function maybeRebuildThermalOverlay(
  overlay: ThermalOverlayState,
  currentTransform: ZoomTransform,
  transformRef: { current: ZoomTransform },
  projection: GeoProjection,
  currentTimeRef: { current: number },
  grid: ThermalGrid,
) {
  const transformKey = `${currentTransform.k.toFixed(1)}_${currentTransform.x.toFixed(0)}_${currentTransform.y.toFixed(0)}`;
  const curTime = currentTimeRef.current;
  if (transformKey !== overlay.cachedTransformKey || curTime !== overlay.cachedTime) {
    const now = performance.now();
    if (now - overlay.lastRebuild > REBUILD_MIN_INTERVAL) {
      rebuildThermalOverlay(overlay, currentTransform, projection, curTime, grid);
      overlay.cachedTransformKey = transformKey;
      overlay.cachedTime = curTime;
      overlay.lastRebuild = now;
      if (overlay.rebuildTimeout) { clearTimeout(overlay.rebuildTimeout); overlay.rebuildTimeout = null; }
    } else if (!overlay.rebuildTimeout) {
      overlay.rebuildTimeout = setTimeout(() => {
        rebuildThermalOverlay(overlay, transformRef.current, projection, currentTimeRef.current, grid);
        overlay.cachedTransformKey = `${transformRef.current.k.toFixed(1)}_${transformRef.current.x.toFixed(0)}_${transformRef.current.y.toFixed(0)}`;
        overlay.cachedTime = currentTimeRef.current;
        overlay.lastRebuild = performance.now();
        overlay.rebuildTimeout = null;
      }, REBUILD_MIN_INTERVAL);
    }
  }
}
