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
    cachedTransformKey: '',
    cachedTime: 0,
    rebuildTimeout: null,
    lastRebuild: 0,
  };
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
      pixels[idx + 3] = thermalLUT[li * 4 + 3];
    }
  }
  ctx.putImageData(imageData, 0, 0);
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
