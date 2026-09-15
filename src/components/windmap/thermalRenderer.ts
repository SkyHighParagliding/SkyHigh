import type { ZoomTransform } from 'd3-zoom';
import type { GeoProjection } from 'd3-geo';
import { getThermalAt, effectiveWstar } from './thermalInterpolation';
import type { ThermalGrid } from './thermalInterpolation';
import { isThermalLand } from './landMask';
import { drawRegistered } from './groundRegistration';

// ---------------------------------------------------------------------------
// Cloud-cover thresholds for overcast and cumulus density
// ---------------------------------------------------------------------------

/**
 * Below this low-cloud percentage the sky reads as effectively clear — the
 * cumulus glyph lattice is drawn at full density and no grey sheet appears.
 * 12 % is roughly one-eighth cover: isolated puffs rather than a broken deck,
 * consistent with BOM "few" (1–2 oktas ≈ 12.5–25 %).
 */
export const CU_CLOUD_MIN_PCT  = 12;  // % low cloud → below = blue, no glyphs

/**
 * At this low-cloud (or total-cover) percentage the grey overcast sheet begins
 * to appear. 70 % is "broken" (5–7 oktas ≈ 62–87 %) — the sky is more
 * covered than clear, and pilots on the ground would call it overcast.
 */
export const OVERCAST_MIN_PCT  = 70;  // % → sheet starts

/**
 * Above this the grey alpha saturates. 95 % is "overcast" (8 oktas minus a
 * thin gap) — essentially no direct sun. The ramp from 70 → 95 gives a smooth
 * visual transition rather than a hard cliff.
 */
export const OVERCAST_FULL_PCT = 95;  // % → sheet fully opaque

/**
 * Overcast strength (0–1, as written into `ThermalOverlayState.overcast`) above
 * which a cell counts as "under the sheet".
 *
 * This single value decides two things that must agree: where cumulusField.ts
 * draws the hatch, and where this file suppresses cumulus glyphs. They are the
 * same threshold on purpose — the map promises three states that each mean one
 * thing, and a cell that is both hatched and stippled reads as neither. Anything
 * that changes this must change both behaviours together, which is exactly what
 * sharing the constant enforces.
 *
 * 0.35 on the 70 → 95 % ramp works out at roughly 79 % low cloud: the point at
 * which a deck stops being "scattered cumulus" and starts being a sheet.
 */
export const HATCH_MIN = 0.35;

// ---------------------------------------------------------------------------
// Admin-tunable thermal parameters
// ---------------------------------------------------------------------------

/**
 * The subset of render constants exposed on the Admin → Forecast page. Every
 * field defaults to the hardcoded constant it replaces, so an unset (or absent)
 * setting reproduces today's map exactly — the tuning only diverges once an
 * admin deliberately changes a value. Read from settings in ThermalCanvas and
 * threaded into rebuildThermalOverlay; NOT read per-pixel.
 */
export interface ThermalTuning {
  /** % low cloud below which the sky reads clear (full cumulus lattice). Was CU_CLOUD_MIN_PCT. */
  clearSkyCloudPct: number;
  /** % cover at which the grey overcast sheet begins. Was OVERCAST_MIN_PCT. */
  overcastOnsetPct: number;
  /** % cover at which the grey sheet saturates. Was OVERCAST_FULL_PCT. */
  overcastFullPct: number;
  /** Minimum W* (m/s) at which heat colour is painted. Was the `ws >= 0.3` gate. */
  minWstar: number;
  /** CAPE (J/kg) floor below which overdevelopment risk is never flagged. Was the `cape < 500` gate. */
  stormCapeGate: number;
  /** Precip (mm/hr) at which the blue rain wash saturates. Lighter rain fades in below it. */
  rainOffMm: number;
}

export const DEFAULT_THERMAL_TUNING: ThermalTuning = {
  clearSkyCloudPct: CU_CLOUD_MIN_PCT,
  overcastOnsetPct: OVERCAST_MIN_PCT,
  overcastFullPct: OVERCAST_FULL_PCT,
  minWstar: 0.3,
  stormCapeGate: 500,
  rainOffMm: 1,
};

// Rain wash: a translucent blue over cells with meaningful precip. Fades in from
// this floor and saturates at tuning.rainOffMm, so light rain reads faint and
// real rain reads solid — and it composites over heat/grey/transparent alike.
const RAIN_WASH_MIN_MM = 0.1;
const RAIN_WASH_MAX_ALPHA = 0.5;
const RAIN_WASH_RGB = [56, 118, 209] as const;

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
 * The intended signal is LI + CAPE. LI is now available on both tier-1
 * (Open-Meteo REST API) and tier-2 (derived from ecmwf_ifs025 by
 * ecmwfLiftedIndex.ts), so rung 1 fires for the great majority of points.
 * The CIN and CAPE-only rungs are degraded fallbacks retained for tier-3
 * GFS-sourced points, where LI is also available (ncep_gfs025 carries it
 * directly), but kept for completeness in case the derivation fails.
 *
 *   Rung 1 (LI + CAPE gate — primary): Lifted Index is the most direct
 *     buoyancy measure aloft. LI < −2 °C means the parcel is substantially
 *     warmer than the environment at 500 hPa — vigorous deep convection is
 *     likely. LI < 0 °C is unstable but marginal. Available tier-1 and tier-2.
 *
 *   Rung 2 (CIN gate — degraded fallback): Convective inhibition measures the
 *     capping inversion. A weak cap (CIN < 50 J/kg) means the lid can be broken
 *     easily once CAPE is present. CIN is a weaker signal than LI — it measures
 *     whether convection can start rather than how violent it will be once going.
 *     Only fires when LI is absent. Available tier-1 + tier-2.
 *
 *   Rung 3 (CAPE only — last resort): 500 J/kg threshold already documented to
 *     pilots in the help modal. 800 J/kg is a blunt upper flag. Not equivalent
 *     to the upper rungs — kept only so the signal is never absent.
 */
export function computeOdRisk(cape: number, li?: number, cin?: number, capeGate = 500): OdRisk {
  // Below the CAPE gate (default 500 J/kg) the atmosphere does not have enough
  // energy for deep convection regardless of what the stability indices say.
  if (cape < capeGate) return 0;

  // Rung 1: Lifted Index (primary signal, tier-1 and tier-2).
  if (li != null && !Number.isNaN(li)) {
    if (li < -2) return 2;  // Strongly unstable — overdevelopment likely.
    if (li < 0)  return 1;  // Marginally unstable — watch.
    return 0;               // LI ≥ 0 means stable or neutral aloft.
  }

  // Rung 2: CIN available, LI was not (degraded fallback).
  if (cin != null && !Number.isNaN(cin)) {
    // A weak cap combined with meaningful CAPE means convection can break free.
    if (cin < 50) return 1;
    return 0;
  }

  // Rung 3: CAPE only — blunt, but better than silence.
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
   * day, overcast, or depth < 50 m). Read by cumulusField.ts without
   * re-running getThermalAt — that is why it lives here rather than in a
   * separate pass. Set to 0 under a heavy overcast sheet (overcast ≥ 1) so
   * cumulusField.ts needs no knowledge of the overcast rule.
   */
  cumulusDepth: Float32Array;
  /**
   * Overdevelopment risk for each overlay cell: 0 = none, 1 = watch, 2 = likely.
   * Populated in the same per-cell loop as cumulusDepth (no second pass), but
   * deliberately NOT behind the cumulus gate: a hot blue day with high CAPE has
   * no cumulus to mark and is exactly when a pilot is most easily caught out.
   * The OD triangle also fires under a grey overcast sheet — a loaded atmosphere
   * under stratus is the same trap, arguably worse because the sky looks benign.
   * Read by cumulusField.ts, which draws a separate warning triangle for it.
   */
  odRisk: Uint8Array;
  /**
   * Grey overcast strength 0–1 per overlay cell, pre-multiplied by edgeFade.
   * 0 = clear or pre-TASK-036 grid (degradation rule). Driven by the
   * cloudLow and cloud fields from ThermalCellValue; see OVERCAST_MIN_PCT /
   * OVERCAST_FULL_PCT for the ramp definition. Read by cumulusField.ts, which
   * draws a diagonal hatch pattern over cells where this exceeds 0.35.
   */
  overcast: Float32Array;
  /**
   * Cumulus areal coverage 0–1 per overlay cell, drives glyph density in
   * cumulusField.ts. Distinct from cumulusDepth, which is a vertical extent
   * (BLH − CCL) used for glyph SIZE; this field is a FRACTION OF SKY AREA
   * that glyphs should occupy. When cloudLow is undefined (pre-TASK-036 grid),
   * defaults to 1.0 so the full lattice is drawn — exactly today's behaviour.
   */
  cuCoverage: Float32Array;
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
    // Zero-initialised: 0 = no grey sheet. Cells not reached by the loop stay
    // 0, which cumulusField.ts treats as "not overcast".
    overcast: new Float32Array(overlayW * overlayH),
    // Filled to 1.0 during rebuildThermalOverlay for pre-TASK-036 grids (see
    // degradation rule): the fill happens before the loop and every cell that
    // gets real data overwrites it. Zero-init here; fill(1) is called below.
    cuCoverage: new Float32Array(overlayW * overlayH),
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
  drawRegistered(ctx, overlay.canvas, overlay.builtTransform, currentTransform, {
    smoothing: true,
    blurPx: 5,
    width: overlay.spanX,
    height: overlay.spanY,
  });
}

// Clamp a value to [0, 1].
function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function rebuildThermalOverlay(
  overlay: ThermalOverlayState,
  currentTransform: ZoomTransform,
  projection: GeoProjection,
  currentTime: number,
  grid: ThermalGrid,
  tuning: ThermalTuning = DEFAULT_THERMAL_TUNING,
) {
  const {
    width: overlayW, height: overlayH, pixels, ctx, imageData,
    cumulusDepth, odRisk, overcast: overcastArr, cuCoverage,
  } = overlay;

  // Zero thermal arrays up front; cells not written keep their zero.
  cumulusDepth.fill(0);
  odRisk.fill(0);
  overcastArr.fill(0);

  // Degradation rule: when cloud data is absent (pre-TASK-036 grids), every
  // cell should appear with the full cumulus lattice — exactly today's
  // behaviour. We default cuCoverage to 1 here; any cell with real cloudLow
  // data will overwrite it with the derived value below. On a pre-TASK-036
  // grid cloudLow is always undefined, so no cell ever overwrites 1.0, and
  // cumulusField.ts sees a uniform full-density lattice, unchanged from before.
  cuCoverage.fill(1);

  for (let oy = 0; oy < overlayH; oy++) {
    for (let ox = 0; ox < overlayW; ox++) {
      const px = ox * CELL + CELL / 2;
      const py = oy * CELL + CELL / 2;
      const inverted = currentTransform.invert([px, py]);
      const geo = projection.invert!(inverted);
      const idx = (oy * overlayW + ox) * 4;
      if (!geo) { pixels[idx + 3] = 0; continue; }
      if (!isThermalLand(geo[0], geo[1])) { pixels[idx + 3] = 0; continue; }

      const th = getThermalAt(geo[0], geo[1], currentTime, grid);
      // No thermal data at all — clear the pixel, leave all rasters at 0.
      if (!th) { pixels[idx + 3] = 0; continue; }

      // Fade alpha within 1° lon / 0.5° lat of grid boundary to avoid a hard
      // rectangular clip. Computed here (before the ws gate) because the grey
      // overcast sheet and cuCoverage also need it.
      const edgeFade = Math.min(
        (geo[0] - grid.lonMin) / 1.0,
        (grid.lonMax - geo[0]) / 1.0,
        (geo[1] - grid.latMin) / 0.5,
        (grid.latMax - geo[1]) / 0.5,
        1.0,
      );
      const fade = Math.max(0, edgeFade);

      // -----------------------------------------------------------------
      // Overcast sheet — computed for EVERY land cell with thermal data,
      // BEFORE the ws gate. This is the key restructure: overcast regions
      // commonly have low W* (the sun is blocked), so the old combined guard
      // `if (!th || ws < 0.3) continue` would have zeroed alpha and skipped
      // the grey, producing invisible sheets exactly where they most matter.
      //
      // Formula per the frozen contract:
      //   overcastPct = max(cloudLow ?? 0, cloud >= 90 ? cloud : 0)
      //
      // The second term handles total-overcast reported at a high level (e.g.
      // alto-stratus) that models don't always classify as "low" cloud — a
      // ≥ 90 % total cover is a blocking sheet regardless of height.
      //
      // cuCoverage drives glyph density (an areal fraction), not size.
      // When cloudLow is undefined the fill(1) above already gives 1.0, so
      // we only write when real data is available.
      // -----------------------------------------------------------------
      const cellIdx = oy * overlayW + ox;

      if (th.cloudLow !== undefined) {
        const overcastPct = Math.max(
          th.cloudLow,
          (th.cloud !== undefined && th.cloud >= 90) ? th.cloud : 0,
        );
        const overcastRaw = clamp01(
          (overcastPct - tuning.overcastOnsetPct) / (tuning.overcastFullPct - tuning.overcastOnsetPct),
        );
        overcastArr[cellIdx] = overcastRaw * fade;

        // cuCoverage: 0 below clearSkyCloudPct, 1 at overcastOnsetPct.
        // Uses cloudLow (the sky fraction where cumulus are actually forming)
        // rather than total cover, which lumps in high cirrus.
        cuCoverage[cellIdx] = clamp01(
          (th.cloudLow - tuning.clearSkyCloudPct) / (tuning.overcastOnsetPct - tuning.clearSkyCloudPct),
        ) * fade;
      }
      // If cloudLow is still undefined (pre-TASK-036 grid), cuCoverage[cellIdx]
      // keeps 1.0 from the fill above — degradation path, no change needed.

      const ws = effectiveWstar(th.wstar, th.cape);

      // -----------------------------------------------------------------
      // Heat colour: only written when W* is meaningful. Low W* cells
      // (sub-threshold, evening collapse, calm day) stay transparent for
      // the heat channel, but may still show grey via the overcast sheet
      // written above. This is the correct split: "grey + no heat" is a
      // valid and common state (overcast calm day).
      // -----------------------------------------------------------------
      if (ws >= tuning.minWstar) {
        // Named lutIdx, not li: `li` now means Lifted Index on the thermal
        // cell (see th.li below), and having both in one function invites a
        // misread.
        const lutIdx = wstarToLUTIndex(ws);
        const heatR = thermalLUT[lutIdx * 4];
        const heatG = thermalLUT[lutIdx * 4 + 1];
        const heatB = thermalLUT[lutIdx * 4 + 2];
        const heatA = thermalLUT[lutIdx * 4 + 3] * fade;

        // Overcast grey composite: rgb(150, 154, 160) blended over the LUT
        // colour at strength `overcastArr[cellIdx] * 0.75`.
        //
        // The blend factor 0.75 is chosen against the heat STOPS table.
        // The maximum LUT alpha is 232 (wstar ≥ 4) ≈ 0.91 coverage. At
        // OVERCAST_FULL_PCT = 95 % cloud the sheet should visibly dominate
        // the heat colour (it replaces solar input, after all), so 0.75
        // gives grey ≈ 75 % opacity at saturation, still leaving a faint
        // heat tint underneath — enough to tell pilots the boundary layer is
        // still loaded even if thermals are weak. Lower values (0.5) washed
        // out insufficiently; 1.0 erased the heat ramp entirely at high cloud.
        const greyBlend = overcastArr[cellIdx] * 0.75;
        const greyR = 150; const greyG = 154; const greyB = 160;

        pixels[idx]     = Math.round(heatR + (greyR - heatR) * greyBlend);
        pixels[idx + 1] = Math.round(heatG + (greyG - heatG) * greyBlend);
        pixels[idx + 2] = Math.round(heatB + (greyB - heatB) * greyBlend);

        // Alpha floor: the grey sheet must remain visible over pale basemaps
        // (Carto light is near-white in rural Victoria) even when the heat
        // ramp contributes little. The lowest non-zero heat stop is wstar=0.30
        // → a=70/255 ≈ 27 %. An alpha of 90 (35 %) is just opaque enough for
        // the grey to read as "something is here" without obscuring road labels.
        // It sits between the 0.30 stop (70) and 0.80 stop (125) of the heat
        // ramp, so it cannot be lower than anything the heat ramp would have
        // painted on its own at these cloud levels.
        const baseAlpha = Math.round(heatA);
        const sheetFloor = greyBlend > 0 ? 90 : 0;
        pixels[idx + 3] = Math.max(baseAlpha, sheetFloor);

        // Cumulus depth: only written when there is a cumulus signal (BLH −
        // CCL ≥ 50 m) AND the cell is not under the grey sheet. Under an
        // overcast deck real cumulus cannot form regardless of what BLH − CCL
        // says — the thermodynamic test is correct physics, but it cannot see
        // advected stratus — so glyphs are suppressed at source here, and
        // cumulusField.ts never needs to know the overcast rule.
        //
        // The threshold is HATCH_MIN, the same value that decides where the
        // hatch is drawn, and it is shared rather than duplicated for a reason:
        // glyphs and hatch must be mutually exclusive. The whole point of this
        // task is three states that each mean one thing. Two independent
        // thresholds would open a band where a cell is hatched AND stippled,
        // which reads as neither.
        //
        // An earlier revision used `< 1.0` — full saturation. That was wrong
        // twice over: it left glyphs drawing through the hatch across the
        // entire 70–95 % band, and because this raster is pre-multiplied by
        // `fade`, cells near the grid edge can never reach 1.0 at all, so
        // suppression would have silently never fired there.
        if (th.ccl != null && th.blh - th.ccl >= 50 && overcastArr[cellIdx] <= HATCH_MIN) {
          cumulusDepth[cellIdx] = (th.blh - th.ccl) * fade;
        }

        // OD risk is written for EVERY cell that survives the land + ws ≥ 0.3
        // gates — not just cells with cumulus, and NOT suppressed by overcast.
        //
        // Hard constraint 1: the triangle fires under a grey sheet. A loaded
        // atmosphere under stratus is identical to a clear-sky OD scenario in
        // its energy content; the visual difference is what makes it a trap.
        // ThermalHelpModal.tsx explicitly promises pilots the triangle fires there.
        //
        // No extra BLH floor is applied here. The ws < 0.3 gate already excludes
        // collapsed-BL cases: measured across the live grid it rejects 165 of 596
        // high-CAPE cells, and zero surviving cells had BLH below 300 m — a
        // separate BLH threshold would be dead code. edgeFade multiplication is
        // wrong for a categorical variable; zero-init and the continue statements
        // above already ensure edge cells read 0.
        odRisk[cellIdx] = computeOdRisk(th.cape, th.li, th.cin, tuning.stormCapeGate);
      } else {
        // ws < 0.3: no heat colour, but overcast sheet is already written.
        // Ensure the pixel alpha is nonzero if the grey sheet is visible so
        // the composited grey renders correctly.
        const sheetAlpha = overcastArr[cellIdx] > 0
          ? Math.round(overcastArr[cellIdx] * 0.75 * 255)
          : 0;

        if (sheetAlpha > 0) {
          // Paint pure grey (no heat tint to blend with).
          pixels[idx]     = 150;
          pixels[idx + 1] = 154;
          pixels[idx + 2] = 160;
          // Alpha floor of 90 applies here too — we want the sheet visible.
          pixels[idx + 3] = Math.max(sheetAlpha, 90);
        } else {
          pixels[idx + 3] = 0;
        }
      }

      // Rain wash — composited last so it sits over heat, grey, or bare basemap.
      // Applied regardless of the W* gate: rain usually means little/no lift, so
      // gating it on W* would hide it exactly where it matters most.
      if (th.precip !== undefined && th.precip >= RAIN_WASH_MIN_MM && fade > 0) {
        const span = Math.max(0.1, tuning.rainOffMm - RAIN_WASH_MIN_MM);
        const wash = clamp01((th.precip - RAIN_WASH_MIN_MM) / span);
        const a = wash * RAIN_WASH_MAX_ALPHA * fade;
        if (a > 0) {
          // Source-over: rain (straight-alpha `a`) over the current straight-alpha pixel.
          const curA = pixels[idx + 3] / 255;
          const outA = a + curA * (1 - a);
          if (outA > 0) {
            const k = curA * (1 - a);
            pixels[idx]     = Math.round((RAIN_WASH_RGB[0] * a + pixels[idx]     * k) / outA);
            pixels[idx + 1] = Math.round((RAIN_WASH_RGB[1] * a + pixels[idx + 1] * k) / outA);
            pixels[idx + 2] = Math.round((RAIN_WASH_RGB[2] * a + pixels[idx + 2] * k) / outA);
            pixels[idx + 3] = Math.round(outA * 255);
          }
        }
      }
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
  tuning: ThermalTuning = DEFAULT_THERMAL_TUNING,
) {
  // Fold the tuning into the cache key so a settings change forces a rebuild
  // (otherwise the map keeps the raster it baked with the old thresholds until
  // the next pan/zoom/time change).
  const tuningKey = `${tuning.clearSkyCloudPct}_${tuning.overcastOnsetPct}_${tuning.overcastFullPct}_${tuning.minWstar}_${tuning.stormCapeGate}_${tuning.rainOffMm}`;
  const transformKey = `${currentTransform.k.toFixed(1)}_${currentTransform.x.toFixed(0)}_${currentTransform.y.toFixed(0)}_${tuningKey}`;
  const curTime = currentTimeRef.current;
  if (transformKey !== overlay.cachedTransformKey || curTime !== overlay.cachedTime) {
    const now = performance.now();
    if (now - overlay.lastRebuild > REBUILD_MIN_INTERVAL) {
      rebuildThermalOverlay(overlay, currentTransform, projection, curTime, grid, tuning);
      overlay.cachedTransformKey = transformKey;
      overlay.cachedTime = curTime;
      overlay.lastRebuild = now;
      if (overlay.rebuildTimeout) { clearTimeout(overlay.rebuildTimeout); overlay.rebuildTimeout = null; }
    } else if (!overlay.rebuildTimeout) {
      overlay.rebuildTimeout = setTimeout(() => {
        rebuildThermalOverlay(overlay, transformRef.current, projection, currentTimeRef.current, grid, tuning);
        overlay.cachedTransformKey = `${transformRef.current.k.toFixed(1)}_${transformRef.current.x.toFixed(0)}_${transformRef.current.y.toFixed(0)}_${tuningKey}`;
        overlay.cachedTime = currentTimeRef.current;
        overlay.lastRebuild = performance.now();
        overlay.rebuildTimeout = null;
      }, REBUILD_MIN_INTERVAL);
    }
  }
}
