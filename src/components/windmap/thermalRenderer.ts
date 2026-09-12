import type { ZoomTransform } from 'd3-zoom';
import type { GeoProjection } from 'd3-geo';
import { getThermalAt, effectiveWstar } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import { isOnLand } from './landMask';

const CELL = 6; // sample every 6px for a smooth heatmap
const REBUILD_MIN_INTERVAL = 50; // ms

// W*-based colour stops (warm ramp: transparent → amber → orange → red)
const STOPS: { wstar: number; r: number; g: number; b: number; a: number }[] = [
  { wstar: 0.0,  r: 210, g: 150, b:  50, a:   0 },
  { wstar: 0.3,  r: 210, g: 160, b:  60, a:  90 },
  { wstar: 0.8,  r: 220, g: 130, b:  30, a: 155 },
  { wstar: 1.5,  r: 215, g:  90, b:  20, a: 185 },
  { wstar: 2.5,  r: 200, g:  55, b:  20, a: 205 },
  { wstar: 4.0,  r: 185, g:  20, b:  20, a: 220 },
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

// CSS gradient for the legend bar
export const THERMAL_LEGEND_CSS = (() => {
  const pts: string[] = [];
  for (const s of STOPS) {
    const pct = Math.min(100, (s.wstar / 4.0) * 100);
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
  const { width: overlayW, height: overlayH, pixels, ctx, imageData } = overlay;
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
      const li = wstarToLUTIndex(ws);
      pixels[idx]     = thermalLUT[li * 4];
      pixels[idx + 1] = thermalLUT[li * 4 + 1];
      pixels[idx + 2] = thermalLUT[li * 4 + 2];
      // Fade alpha within 1° lon / 0.5° lat of grid boundary to avoid hard rectangular clip
      const edgeFade = Math.min(
        (geo[0] - grid.lonMin) / 1.0,
        (grid.lonMax - geo[0]) / 1.0,
        (geo[1] - grid.latMin) / 0.5,
        (grid.latMax - geo[1]) / 0.5,
        1.0,
      );
      pixels[idx + 3] = Math.round(thermalLUT[li * 4 + 3] * Math.max(0, edgeFade));
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
