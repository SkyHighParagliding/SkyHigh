/**
 * Live-station markers: a label box ("9 G12") with one pointed end, turned to
 * lie along the wind with the point facing DOWNWIND (dirDeg is where the wind
 * comes FROM, so the point aims at dirDeg + 180). Text stays upright.
 *
 * The station's true position is the box's TAIL (flat end, small dot): the box
 * then streams away from the station like a wind vector, matching the particle
 * flow, and the exact spot is never hidden under the label.
 *
 * Plan: wiki/future/station-overlay-plan.md. Drawn in CSS pixels (no DPR scale).
 */
import type { LiveStation } from '../../../shared/stations';
import { SPEED_COLOR_STOPS } from './windInterpolation';

export type SpeedUnit = 'kt' | 'mph' | 'kph';

const UNIT_FACTOR: Record<SpeedUnit, number> = { kt: 1, mph: 1.15078, kph: 1.852 };

// ---------------------------------------------------------------------------
// Pure helpers (unit tested)
// ---------------------------------------------------------------------------

/**
 * Box rotation for a wind FROM `dirDeg`. `angleRad` is the canvas rotation that
 * makes the box's +x axis (the pointed end) face downwind (canvas: 0 = east,
 * clockwise positive since y is down). `flipText` is true when the point faces
 * left, so the text must be turned 180 degrees to stay readable; the point
 * stays on the downwind end either way. Straight up/down keeps the text
 * un-flipped (reads bottom-to-top / top-to-bottom).
 */
export function stationAngles(dirDeg: number): { angleRad: number; flipText: boolean } {
  const bearing = (((dirDeg + 180) % 360) + 360) % 360; // where the wind goes, from north
  const angleRad = ((bearing - 90) * Math.PI) / 180;
  return { angleRad, flipText: Math.cos(angleRad) < -1e-9 };
}

/** "9 G12" in the chosen unit. Gust omitted when null or not above the speed. */
export function stationLabel(speedKt: number, gustKt: number | null, unit: SpeedUnit): string {
  const f = UNIT_FACTOR[unit];
  const s = Math.round(speedKt * f);
  if (gustKt == null) return String(s);
  const g = Math.round(gustKt * f);
  return g > s ? `${s} G${g}` : String(s);
}

/** True when the box should be a plain round pill: no direction, or calm. */
export function isCalmMarker(speedKt: number, dirDeg: number | null, unit: SpeedUnit): boolean {
  return dirDeg == null || Math.round(speedKt * UNIT_FACTOR[unit]) === 0;
}

/** Wind-overlay colour for a speed in knots (same stops as the particles). */
export function speedColorRgb(kt: number): [number, number, number] {
  const st = SPEED_COLOR_STOPS;
  if (kt <= st[0].kts) return st[0].color;
  for (let i = 0; i < st.length - 1; i++) {
    if (kt <= st[i + 1].kts) {
      const t = (kt - st[i].kts) / (st[i + 1].kts - st[i].kts);
      const a = st[i].color, b = st[i + 1].color;
      return [0, 1, 2].map(k => Math.round(a[k] + (b[k] - a[k]) * t)) as [number, number, number];
    }
  }
  return st[st.length - 1].color;
}

/** Dark text on light fills, white on dark (WCAG-style relative luminance). */
export function textColorFor(rgb: [number, number, number]): string {
  const lin = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  return L > 0.3 ? '#111827' : '#ffffff';
}

export interface DeclutterItem {
  id: string;
  x0: number; y0: number; x1: number; y1: number;
  selected: boolean;
  /** source === 'site': our own station at a flying site. */
  site: boolean;
  speedKt: number;
}

/** Greedy keep-by-priority: selected, then site stations, then stronger wind.
 *  Returns the ids to draw. Boxes closer than `pad` px count as overlapping. */
export function declutter(items: DeclutterItem[], pad = 2): Set<string> {
  const order = [...items].sort((a, b) =>
    (Number(b.selected) - Number(a.selected)) ||
    (Number(b.site) - Number(a.site)) ||
    (b.speedKt - a.speedKt) ||
    (a.id < b.id ? -1 : 1));
  const kept: DeclutterItem[] = [];
  for (const it of order) {
    const clash = kept.some(k =>
      it.x0 < k.x1 + pad && it.x1 > k.x0 - pad && it.y0 < k.y1 + pad && it.y1 > k.y0 - pad);
    if (!clash) kept.push(it);
  }
  return new Set(kept.map(k => k.id));
}

// ---------------------------------------------------------------------------
// Drawn geometry (kept from the last frame for hit testing)
// ---------------------------------------------------------------------------

export interface StationBox {
  station: LiveStation;
  /** Station position on screen (the box's tail / pill centre). */
  x: number; y: number;
  angleRad: number;
  /** Local-frame extent along the box axis, and half-height. */
  lx0: number; lx1: number; halfH: number;
  /** Screen axis-aligned bounds. */
  x0: number; y0: number; x1: number; y1: number;
}

/** Station under (px, py), with `slop` px of finger tolerance. */
export function hitTestStation(boxes: StationBox[], px: number, py: number, slop = 6): LiveStation | null {
  let best: StationBox | null = null;
  let bestD = Infinity;
  for (const b of boxes) {
    if (px < b.x0 - slop || px > b.x1 + slop || py < b.y0 - slop || py > b.y1 + slop) continue;
    const dx = px - b.x, dy = py - b.y;
    const c = Math.cos(b.angleRad), s = Math.sin(b.angleRad);
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (lx < b.lx0 - slop || lx > b.lx1 + slop || Math.abs(ly) > b.halfH + slop) continue;
    // Prefer the box whose centre is nearest (they never overlap after declutter).
    const d = Math.hypot(lx - (b.lx0 + b.lx1) / 2, ly);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best ? best.station : null;
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

const FONT = '600 11px system-ui, sans-serif';
const H = 18;          // box height
const TIP = 8;         // arrow tip length
const PAD_L = 9;       // room for the station dot at the tail
const PAD_R = 5;
const R = 4;           // tail corner radius
const STALE_FILL = '#9ca3af';
const DARK = 'rgba(15,23,42,0.9)';
/** Outline for a "possibly stuck" reading (same value for 75+ min). */
const STUCK_LINE = '#f59e0b';

export interface DrawStationOptions {
  unit: SpeedUnit;
  selectedId: string | null;
  faded: boolean;
  width: number;
  height: number;
}

export function drawStationMarkers(
  ctx: CanvasRenderingContext2D,
  stations: LiveStation[],
  project: (lon: number, lat: number) => [number, number] | null,
  opts: DrawStationOptions,
): StationBox[] {
  const { unit, selectedId, faded, width, height } = opts;
  ctx.save();
  ctx.font = FONT;

  interface Cand { box: StationBox; label: string; calm: boolean; flip: boolean }
  const cands: Cand[] = [];
  for (const st of stations) {
    const p = project(st.lon, st.lat);
    if (!p || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
    const [x, y] = p;
    if (x < -60 || y < -60 || x > width + 60 || y > height + 60) continue;
    const label = stationLabel(st.speedKt, st.gustKt, unit);
    const tw = ctx.measureText(label).width;
    const calm = isCalmMarker(st.speedKt, st.dirDeg, unit);
    let angleRad = 0, flip = false, lx0: number, lx1: number;
    if (calm) {
      const w = Math.max(H, tw + 10);
      lx0 = -w / 2; lx1 = w / 2;
    } else {
      ({ angleRad, flipText: flip } = stationAngles(st.dirDeg as number));
      lx0 = 0; lx1 = PAD_L + tw + PAD_R + TIP;
    }
    const halfH = H / 2;
    const c = Math.cos(angleRad), s = Math.sin(angleRad);
    const xs: number[] = [], ys: number[] = [];
    for (const [ax, ay] of [[lx0, -halfH], [lx1, -halfH], [lx1, halfH], [lx0, halfH]]) {
      xs.push(x + ax * c - ay * s); ys.push(y + ax * s + ay * c);
    }
    cands.push({
      box: { station: st, x, y, angleRad, lx0, lx1, halfH,
        x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) },
      label, calm, flip,
    });
  }

  const keep = declutter(cands.map(({ box }) => ({
    id: box.station.id, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1,
    selected: box.station.id === selectedId,
    site: box.station.source === 'site',
    speedKt: box.station.speedKt,
  })));
  const shown = cands.filter(c => keep.has(c.box.station.id));
  // Selected last so its thick outline is never overpainted.
  shown.sort((a, b) => Number(a.box.station.id === selectedId) - Number(b.box.station.id === selectedId));

  ctx.globalAlpha = faded ? 0.6 : 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  for (const { box, label, calm, flip } of shown) {
    const st = box.station;
    const selected = st.id === selectedId;
    const rgb = speedColorRgb(st.speedKt);
    const fill = st.stale ? STALE_FILL : `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    const textColor = st.stale ? '#111827' : textColorFor(rgb);

    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.rotate(box.angleRad);
    ctx.beginPath();
    const h2 = box.halfH;
    if (calm) {
      ctx.roundRect(box.lx0, -h2, box.lx1 - box.lx0, H, h2);
    } else {
      const bodyEnd = box.lx1 - TIP;
      ctx.moveTo(R, -h2);
      ctx.lineTo(bodyEnd, -h2);
      ctx.lineTo(box.lx1, 0);
      ctx.lineTo(bodyEnd, h2);
      ctx.lineTo(R, h2);
      ctx.arcTo(0, h2, 0, h2 - R, R);
      ctx.lineTo(0, -h2 + R);
      ctx.arcTo(0, -h2, R, -h2, R);
      ctx.closePath();
    }
    ctx.fillStyle = fill;
    ctx.fill();
    // Light halo under a dark line: reads on the dark wind map and the pale basemap.
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // Stale wins over "possibly stuck" (grey says more than amber).
    const stuck = !st.stale && !!st.unchangedSince;
    ctx.strokeStyle = stuck ? STUCK_LINE : DARK;
    ctx.lineWidth = stuck ? 2.5 : 1.25;
    if (stuck) ctx.setLineDash([4, 2]);
    else if (st.stale) ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    if (selected) {
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 4.5;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    // Text, centred in the body (not the tip). Flipped 180 about its own centre.
    const tcx = calm ? 0 : (PAD_L + (box.lx1 - TIP - PAD_R)) / 2;
    ctx.save();
    ctx.translate(tcx, 0.5);
    if (flip) ctx.rotate(Math.PI);
    ctx.fillStyle = textColor;
    ctx.fillText(label, 0, 0);
    ctx.restore();

    // True station location: dot at the tail (the pill is centred on it instead).
    if (!calm) {
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = DARK;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.restore();
  return shown.map(s => s.box);
}
