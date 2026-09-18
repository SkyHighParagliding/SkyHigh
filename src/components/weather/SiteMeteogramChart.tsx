import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { getThermalStrength, effectiveWstar } from '../windmap/thermalInterpolation';
import { useUnits } from '@/hooks/useUnits';
import { metresToFeet } from '@/lib/units';
import { precipDescription } from '@/lib/precip';
import { airspaceLabel, type AirspaceSector } from '@/lib/airspaceConflict';

const M_TO_FT = 3.280839895;
// Warning red for a busted airspace floor. Distinct from the dashed BL Top
// (dark) and Cu Base (sky-blue) lines.
const AIRSPACE_RED = '#dc2626';
// Ignore low ground obstacles (powerlines/towers labelled DANGER at 0–100 ft) —
// mirrors airspaceConflict.ts. Real controlled/restricted airspace sits higher.
const MIN_AIRSPACE_CEILING_FT = 500;

// One hour of the per-site meteogram, as returned by GET /api/weather/:id/meteogram.
export interface MeteogramHour {
  time: string;
  blh: number | null;
  ceilingAmsl: number | null;
  cape: number | null;
  wstar: number | null;
  ccl: number | null;
  li: number | null;
  cloud: number | null;
  cloudLow: number | null;
  windSpeed: number | null;
  windDir: number | null;
  precip: number | null;
  precipProb: number | null;
  weatherCode: number | null;
}

// Flying window in Melbourne local hours — matches SiteThermalPanel's slider.
const FLYING_HOUR_START = 10;
const FLYING_HOUR_END = 20;

// A rain glyph shows on the sky row from this trace amount; whole-hour "no-fly"
// uses the Admin-tunable rainOffMm instead (trace drizzle shouldn't ground you).
const LIGHT_RAIN_MM = 0.1;
const RAIN_PROB_MARGINAL = 50; // precip probability (%) that flags showery/marginal
const CU_COLOR = '#38bdf8'; // Cu Base (cloud base) line — sky blue, distinct from BL Top + launch

// Flying-window working-height cutoffs (m above launch). Hardcoded defaults for
// Stage 1b; candidates for their own Admin keys later.
const FLY_OFF_BELOW = 250;
const FLY_GOOD_ABOVE = 600;

// Tunables, from Admin → Forecast (fall back to the map's defaults). Reusing the
// map's keys keeps the chart and map consistent.
export interface MeteogramThresholds {
  clearSkyPct: number;   // low-cloud % below which sky reads clear
  overcastPct: number;   // low-cloud % at/above which it's an overcast sheet
  stormCape: number;     // CAPE (J/kg) at/above which overdevelopment risk flags
  minWstar: number;      // W* below which there is no usable lift
  rainOffMm: number;     // precip (mm/hr) at/above which the hour is no-fly
}
const DEFAULT_THRESHOLDS: MeteogramThresholds = { clearSkyPct: 12, overcastPct: 70, stormCape: 500, minWstar: 0.3, rainOffMm: 1 };

type FlyState = 'good' | 'marginal' | 'off';
const FLY_COLOR: Record<FlyState, string> = { good: '#22c55e', marginal: '#f59e0b', off: '#cbd5e1' };

/** Classify how flyable an hour is, for the flying-window bar. */
function flyState(s: MeteogramHour, thr: MeteogramThresholds): FlyState {
  const precip = s.precip ?? 0;
  if (precip >= thr.rainOffMm) return 'off';                             // real rain
  if (effectiveWstar(s.wstar ?? undefined, s.cape ?? 0) < thr.minWstar) return 'off'; // no lift
  const blh = s.blh ?? 0;
  // Cumulus caps the climb: effective working height is the lower of BL top and Cu base.
  const workingHeight = (s.ccl !== null && s.ccl < blh) ? s.ccl : blh;
  if (workingHeight < FLY_OFF_BELOW) return 'off';
  const overcast = s.cloudLow !== null && s.cloudLow >= thr.overcastPct;
  const storm = s.cape !== null && s.cape >= thr.stormCape;
  const showery = precip >= LIGHT_RAIN_MM || (s.precipProb ?? 0) >= RAIN_PROB_MARGINAL;
  if (overcast || storm || showery || workingHeight < FLY_GOOD_ABOVE) return 'marginal';
  return 'good';
}

// Layout, CSS px (no viewBox — 1 SVG unit = 1 px). Rows top→bottom:
// altitude plot · sky-icon strip · wind strip · time labels.
const PAD_L = 44;
const PAD_R = 16;
const PAD_T = 34;   // room for the flying-window bar + unit label above the plot
const SVG_H = 324;
const PAD_B = 22;   // time labels
const WIND_H = 26;  // surface wind strip
const SKY_H = 16;   // cloud / rain icon strip
const FLY_Y = 6;    // flying-window bar top
const FLY_H = 6;    // flying-window bar height

function getMelbHour(iso: string): number {
  return parseInt(
    new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' })
  );
}
function fmtMelbTime(iso: string): string {
  const h = getMelbHour(iso);
  return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
}
function niceCeil(v: number, step: number): number {
  return Math.ceil(v / step) * step;
}
/** Compact axis label for a value already in the display unit, e.g. 2500 → "2.5k". */
function fmtAxis(v: number): string {
  if (v >= 1000) return `${+(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** Meteorological degrees (FROM) → 16-point compass label. */
function degToCompass(deg: number): string {
  return COMPASS_16[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16];
}

export const SiteMeteogramChart = memo(function SiteMeteogramChart({
  hours,
  launchElevation,
  thresholds = DEFAULT_THRESHOLDS,
  groundLabel = 'Launch',
  airspace = [],
}: {
  hours: MeteogramHour[];
  launchElevation: number | null;
  thresholds?: MeteogramThresholds;
  /** Label for the ground reference line — "Launch" at a site, "Ground" for an arbitrary point. */
  groundLabel?: string;
  /** Vertical airspace stack at the point (airspacesAt). Any sector the day's
   *  BL Top / Cu Base busts is drawn as a red floor line + tapered strip. */
  airspace?: AirspaceSector[];
}) {
  const { units, toggleUnits, formatAltitude } = useUnits();
  const [svgW, setSvgW] = useState(480);
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isDown = useRef(false);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setSvgW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const dismiss = (e: PointerEvent) => {
      if (crosshairX !== null && !svgRef.current?.contains(e.target as Node)) setCrosshairX(null);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [crosshairX]);

  // Today's flying window only (first date in the series, 10am–8pm).
  const slots = useMemo(() => {
    if (!hours.length) return [];
    const firstDate = hours[0].time.slice(0, 10);
    return hours.filter(h => {
      if (h.time.slice(0, 10) !== firstDate) return false;
      const mh = getMelbHour(h.time);
      return mh >= FLYING_HOUR_START && mh <= FLYING_HOUR_END;
    });
  }, [hours]);

  const PLOT_W = svgW - PAD_L - PAD_R;
  // Inset the hourly columns from the plot edges so the first/last column's
  // centred marks (cloud icon, wind speed, compass) clear the Y-axis labels.
  const INNER_X = 16;
  const spanW = Math.max(1, PLOT_W - INNER_X * 2);
  const windTop = SVG_H - PAD_B - WIND_H;
  const skyTop = windTop - SKY_H - 6;
  const plotTop = PAD_T;
  const plotBot = skyTop - 6;
  const PLOT_H = plotBot - plotTop;

  // Altitude domain, in metres, then projected to the display unit.
  const groundAmsl = launchElevation ?? 0;
  const useAmsl = launchElevation !== null;
  const toDisp = (m: number) => (units === 'imperial' ? metresToFeet(m) : m);
  const ceilVals = slots
    .map(s => (useAmsl ? s.ceilingAmsl : s.blh))
    .filter((v): v is number => v !== null);
  const rawCeilMax = ceilVals.length ? Math.max(...ceilVals) : 3000;
  const yTopM = niceCeil(Math.max(rawCeilMax * 1.15, groundAmsl + 800), 500);
  const yBotM = useAmsl ? Math.floor(groundAmsl / 500) * 500 : 0;
  const dispTop = toDisp(yTopM);
  const dispBot = toDisp(yBotM);

  const n = slots.length;
  const toX = (i: number) => PAD_L + INNER_X + (n <= 1 ? spanW / 2 : (i / (n - 1)) * spanW);
  const toY = (m: number) => plotTop + PLOT_H - ((toDisp(m) - dispBot) / (dispTop - dispBot)) * PLOT_H;

  const ceilingXY = slots
    .map((s, i) => {
      const v = useAmsl ? s.ceilingAmsl : s.blh;
      return v !== null ? ([toX(i), toY(v)] as [number, number]) : null;
    })
    .filter((p): p is [number, number] => p !== null);
  const ceilingPath = ceilingXY.length
    ? 'M' + ceilingXY.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')
    : '';

  // Altitude gridlines, chosen in the display unit so labels are tidy.
  const range = dispTop - dispBot;
  const stepDisp = units === 'imperial'
    ? (range > 13000 ? 2000 : range > 6000 ? 1000 : 500)
    : (range > 4000 ? 1000 : 500);
  const yLines: number[] = [];
  for (let v = Math.ceil(dispBot / stepDisp) * stepDisp; v <= dispTop; v += stepDisp) yLines.push(v);
  const toYDisp = (v: number) => plotTop + PLOT_H - ((v - dispBot) / (dispTop - dispBot)) * PLOT_H;

  const handleDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < PAD_L || x > PAD_L + PLOT_W) { setCrosshairX(null); return; }
    isDown.current = true;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setCrosshairX(Math.max(PAD_L, Math.min(PAD_L + PLOT_W, x)));
  };
  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDown.current) return;
    const rect = svgRef.current!.getBoundingClientRect();
    setCrosshairX(Math.max(PAD_L, Math.min(PAD_L + PLOT_W, e.clientX - rect.left)));
  };
  const handleUp = () => { isDown.current = false; };

  const crossIdx = crosshairX !== null && n > 1
    ? Math.max(0, Math.min(n - 1, Math.round(((crosshairX - PAD_L - INNER_X) / spanW) * (n - 1))))
    : null;
  const crossSlot = crossIdx !== null ? slots[Math.max(0, Math.min(n - 1, crossIdx))] : null;

  if (slots.length < 2) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground italic">
        No thermal forecast available for today's flying window.
      </div>
    );
  }

  const axisStyle = { fontSize: '10px', fontWeight: 600, fontFamily: 'system-ui,sans-serif', fill: '#86868b' } as const;

  return (
    <svg
      ref={svgRef}
      width="100%"
      height={SVG_H}
      style={{ display: 'block', overflow: 'visible', cursor: 'crosshair', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
    >
      {/* Altitude gridlines + labels (display unit) */}
      {yLines.map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={toYDisp(v)} x2={PAD_L + PLOT_W} y2={toYDisp(v)} stroke="#e5e7eb" strokeWidth={0.6} />
          <text x={PAD_L - 5} y={toYDisp(v)} textAnchor="end" dominantBaseline="middle" style={axisStyle}>
            {fmtAxis(v)}
          </text>
        </g>
      ))}

      {/* Unit label — tap to toggle metric/imperial, like <Altitude> elsewhere */}
      <text
        x={PAD_L - 5}
        y={plotTop - 6}
        textAnchor="end"
        onPointerDown={(e) => { e.stopPropagation(); toggleUnits(); }}
        style={{ ...axisStyle, fontSize: '9px', cursor: 'pointer', textDecoration: 'underline' }}
      >
        {units === 'imperial' ? 'ft AMSL' : 'm AMSL'}
      </text>

      {/* Flying-window bar — per-hour flyability across the top. */}
      <text x={PAD_L - 5} y={FLY_Y + FLY_H} textAnchor="end" style={{ ...axisStyle, fontSize: '8px' }}>fly</text>
      {slots.map((s, i) => {
        const half = spanW / (n - 1) / 2;
        const left = Math.max(PAD_L, toX(i) - half);
        const right = Math.min(PAD_L + PLOT_W, toX(i) + half);
        return (
          <rect key={`fly-${i}`} x={left} y={FLY_Y} width={Math.max(0, right - left)} height={FLY_H}
            fill={FLY_COLOR[flyState(s, thresholds)]} opacity={0.9} />
        );
      })}

      {/* Thermal-strength band: per-hour column ground→ceiling, coloured by W*
          (identical mapping to the thermal map). */}
      {slots.map((s, i) => {
        const ceil = useAmsl ? s.ceilingAmsl : s.blh;
        if (ceil === null) return null;
        const strength = getThermalStrength(effectiveWstar(s.wstar ?? undefined, s.cape ?? 0));
        const half = spanW / (n - 1) / 2;
        // Clamp BOTH edges to the plot so edge columns never spill into a neighbour.
        const left = Math.max(PAD_L, toX(i) - half);
        const right = Math.min(PAD_L + PLOT_W, toX(i) + half);
        const top = toY(ceil);
        return (
          <rect
            key={`band-${i}`}
            x={left}
            y={top}
            width={Math.max(0, right - left)}
            height={Math.max(0, plotBot - top)}
            fill={strength.color}
            opacity={0.28}
          />
        );
      })}

      {/* Airspace conflict overlay (AMSL axis only). For each sector the day's
          thermals bust — floor above ground and at/below the peak BL Top / Cu
          Base — draw a red floor line, an upward-tapering strip up to the
          sector's own ceiling (the airspace is ABOVE its floor), and a label
          with the sector name + its min/max altitude. Drawn before the BL Top /
          Cu Base lines so those stay legible on top. */}
      {useAmsl && airspace.length > 0 && (() => {
        // Peak height the day's forecast reaches (AMSL, m): the higher of BL Top
        // and Cu Base. Both count unconditionally — matching the tapped-point
        // readout, which flags a Cu Base conflict from CCL even on a blue day
        // where cloudbase sits above BL Top. A floor above this is never bust.
        let peakM = groundAmsl;
        for (const s of slots) {
          if (s.ceilingAmsl !== null) peakM = Math.max(peakM, s.ceilingAmsl);
          if (s.ccl !== null && s.ccl > 0) peakM = Math.max(peakM, s.ccl + groundAmsl);
        }

        const unitSuffix = units === 'imperial' ? 'ft' : 'm';
        const ftToDisp = (ft: number) => units === 'imperial' ? Math.round(ft) : Math.round(ft / M_TO_FT);
        // Range end as a display string; SFC/UNL carry no number.
        const endStr = (ft: number, ref: number) =>
          ft >= 99999 ? 'UNL' : (ft <= 0 && ref === 0) ? 'SFC' : String(ftToDisp(ft));
        // Floor / ceiling of a sector as AMSL metres, honouring an AGL/SFC datum.
        const floorAmslM = (sec: AirspaceSector) =>
          sec.lowerRef === 0 ? groundAmsl + Math.max(0, sec.lowerFt) / M_TO_FT : sec.lowerFt / M_TO_FT;
        const ceilAmslM = (sec: AirspaceSector) =>
          sec.upperFt >= 99999 ? yTopM : (sec.upperRef === 0 ? groundAmsl + sec.upperFt / M_TO_FT : sec.upperFt / M_TO_FT);

        const seen = new Set<number>();
        const drawn = airspace
          .filter(sec => (sec.upperFt ?? 0) >= MIN_AIRSPACE_CEILING_FT)
          .map(sec => ({ sec, floorM: floorAmslM(sec), ceilM: ceilAmslM(sec) }))
          .filter(({ floorM }) => floorM > groundAmsl + 1 && floorM <= peakM && floorM < yTopM)
          .sort((a, b) => a.floorM - b.floorM)
          .filter(({ floorM }) => { const k = Math.round(floorM); if (seen.has(k)) return false; seen.add(k); return true; });

        if (!drawn.length) return null;

        return (
          <g>
            <defs>
              {drawn.map(({ floorM, ceilM }, i) => (
                <linearGradient key={i} id={`asp-grad-${i}`} gradientUnits="userSpaceOnUse"
                  x1={0} y1={toY(floorM)} x2={0} y2={Math.max(plotTop, toY(Math.min(ceilM, yTopM)))}>
                  <stop offset="0" stopColor={AIRSPACE_RED} stopOpacity={0.22} />
                  <stop offset="1" stopColor={AIRSPACE_RED} stopOpacity={0} />
                </linearGradient>
              ))}
            </defs>
            {drawn.map(({ sec, floorM, ceilM }, i) => {
              const yF = toY(floorM);
              const yC = Math.max(plotTop, toY(Math.min(ceilM, yTopM)));
              const label = `${airspaceLabel(sec)} · ${endStr(sec.lowerFt, sec.lowerRef)}–${endStr(sec.upperFt, sec.upperRef)} ${unitSuffix}`;
              // Label above the line normally; below when the floor sits near the plot top.
              const labelY = yF < plotTop + 14 ? yF + 11 : yF - 4;
              return (
                <g key={i}>
                  <rect x={PAD_L} y={yC} width={PLOT_W} height={Math.max(0, yF - yC)} fill={`url(#asp-grad-${i})`} />
                  <line x1={PAD_L} y1={yF} x2={PAD_L + PLOT_W} y2={yF} stroke={AIRSPACE_RED} strokeWidth={1.5} opacity={0.9} />
                  <text x={PAD_L + 3} y={labelY} style={{ fontSize: '8px', fontWeight: 700, fill: AIRSPACE_RED, fontFamily: 'system-ui' }}>{label}</text>
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* Launch reference line (AMSL axis only) */}
      {useAmsl && (
        <>
          <line x1={PAD_L} y1={toY(groundAmsl)} x2={PAD_L + PLOT_W} y2={toY(groundAmsl)}
            stroke="#0071e3" strokeWidth={1} strokeDasharray="6,3" opacity={0.7} />
          <text x={PAD_L + 2} y={toY(groundAmsl) - 3} style={{ ...axisStyle, fill: '#0071e3', fontWeight: 700 }}>
            {groundLabel}
          </text>
        </>
      )}

      {/* Cu Base (cloud base) — drawn only where cumulus form (CCL below BL Top).
          On a blue day CCL sits above BL Top and is omitted. When present below
          BL Top it is your effective ceiling: thermals top out at cloudbase. */}
      {(() => {
        const runs: [number, number][][] = [];
        let cur: [number, number][] = [];
        slots.forEach((s, i) => {
          if (s.ccl !== null && s.blh !== null && s.ccl < s.blh) {
            cur.push([toX(i), toY(useAmsl ? s.ccl + groundAmsl : s.ccl)]);
          } else if (cur.length) { runs.push(cur); cur = []; }
        });
        if (cur.length) runs.push(cur);
        if (!runs.length) return null;
        const first = runs[0][0];
        return (
          <>
            {runs.map((run, ri) => run.length === 1
              ? <line key={`cu-${ri}`} x1={run[0][0] - 4} y1={run[0][1]} x2={run[0][0] + 4} y2={run[0][1]} stroke={CU_COLOR} strokeWidth={1.5} strokeDasharray="4,3" />
              : <path key={`cu-${ri}`} d={'M' + run.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} fill="none" stroke={CU_COLOR} strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" />
            )}
            <text x={first[0] + 4} y={first[1] + 10} style={{ fontSize: '8px', fontWeight: 700, fill: CU_COLOR, fontFamily: 'system-ui' }}>Cu Base</text>
          </>
        );
      })()}

      {/* Ceiling line (boundary-layer top) */}
      {ceilingPath && ceilingXY.length > 0 && (
        <>
          <path d={ceilingPath} fill="none" stroke="#1f2937" strokeWidth={2} strokeDasharray="7,4" strokeLinecap="round" />
          <text x={ceilingXY[0][0] + 4} y={ceilingXY[0][1] - 4} style={{ fontSize: '8px', fontWeight: 700, fill: '#1f2937', fontFamily: 'system-ui' }}>BL Top</text>
        </>
      )}

      {/* Sky strip — cloud / rain icons on their own labelled row (NOT the altitude scale) */}
      <line x1={PAD_L} y1={skyTop} x2={PAD_L + PLOT_W} y2={skyTop} stroke="#f1f1f4" strokeWidth={0.6} />
      <text x={PAD_L - 5} y={skyTop + SKY_H / 2} textAnchor="end" dominantBaseline="middle" style={{ ...axisStyle, fontSize: '9px' }}>
        sky
      </text>
      {slots.map((s, i) => {
        const x = toX(i);
        const rain = s.precip !== null && s.precip >= LIGHT_RAIN_MM;
        const overcast = s.cloudLow !== null && s.cloudLow >= thresholds.overcastPct;
        const cumulus = !overcast && s.cloudLow !== null && s.cloudLow >= thresholds.clearSkyPct;
        const glyph = rain ? '🌧' : overcast ? '▨' : cumulus ? '☁' : '·';
        return (
          <text key={`sky-${i}`} x={x} y={skyTop + SKY_H - 3} textAnchor="middle"
            style={{ fontSize: rain ? '11px' : '10px', fill: rain ? '#2563eb' : overcast ? '#6b7280' : cumulus ? '#9ca3af' : '#d1d5db' }}>
            {glyph}
          </text>
        );
      })}

      {/* Surface wind strip: speed (kt) over compass direction, per hour. */}
      <line x1={PAD_L} y1={windTop} x2={PAD_L + PLOT_W} y2={windTop} stroke="#e5e7eb" strokeWidth={0.6} />
      <text x={PAD_L - 5} y={windTop + WIND_H / 2} textAnchor="end" dominantBaseline="middle" style={{ ...axisStyle, fontSize: '9px' }}>
        wind
      </text>
      {slots.map((s, i) => {
        if (s.windSpeed === null) return null;
        const x = toX(i);
        return (
          <g key={`wind-${i}`}>
            <text x={x} y={windTop + 11} textAnchor="middle" style={{ fontSize: '9px', fontWeight: 600, fill: '#334155', fontFamily: 'system-ui' }}>
              {Math.round(s.windSpeed)}
            </text>
            {s.windDir !== null && (
              <text x={x} y={windTop + 21} textAnchor="middle" style={{ fontSize: '8px', fill: '#64748b', fontFamily: 'system-ui' }}>
                {degToCompass(s.windDir)}
              </text>
            )}
          </g>
        );
      })}

      {/* Time axis labels (every other slot to avoid crowding) */}
      {slots.map((s, i) => (
        i % 2 === 0 ? (
          <text key={`t-${i}`} x={toX(i)} y={SVG_H - 6} textAnchor="middle"
            style={{ fontSize: '10px', fill: '#86868b', fontFamily: 'system-ui' }}>
            {fmtMelbTime(s.time)}
          </text>
        ) : null
      ))}

      {/* Crosshair */}
      {crosshairX !== null && crossSlot && (() => {
        const x = toX(Math.max(0, Math.min(n - 1, crossIdx!)));
        const ceilM = useAmsl ? crossSlot.ceilingAmsl : crossSlot.blh;
        const strength = getThermalStrength(effectiveWstar(crossSlot.wstar ?? undefined, crossSlot.cape ?? 0));
        const rows: Array<[string, string, string]> = [
          ['Time', fmtMelbTime(crossSlot.time), '#334155'],
          ['Ceiling', ceilM !== null ? formatAltitude(ceilM, 100) : '—', '#1f2937'],
          ['Thermal', strength?.label ?? '—', strength?.color ?? '#94a3b8'],
          ['Wind/Dir', crossSlot.windSpeed !== null
            ? `${Math.round(crossSlot.windSpeed)} kt${crossSlot.windDir !== null ? ` / ${degToCompass(crossSlot.windDir)}` : ''}`
            : '—', '#334155'],
        ];
        if (crossSlot.ccl !== null && crossSlot.blh !== null && crossSlot.ccl < crossSlot.blh) {
          rows.splice(2, 0, ['Cu base', formatAltitude(useAmsl ? crossSlot.ccl + groundAmsl : crossSlot.ccl, 100), CU_COLOR]);
        }
        if (crossSlot.precip !== null && crossSlot.precip >= LIGHT_RAIN_MM) {
          rows.push(['Rain', precipDescription(crossSlot.precip, crossSlot.weatherCode), '#38bdf8']);
        }
        // Size to content — the rain description can be long ("Moderate showers · …").
        const maxValLen = Math.max(...rows.map(r => r[1].length));
        const tipW = Math.max(158, Math.round(80 + maxValLen * 5.6));
        const tipX = x > PAD_L + PLOT_W - tipW - 8 ? x - tipW - 6 : x + 6;
        const tipH = rows.length * 15 + 8;
        return (
          <g style={{ pointerEvents: 'none' }}>
            <line x1={x} y1={plotTop} x2={x} y2={windTop} stroke="#475569" strokeWidth={1} strokeDasharray="3,2" opacity={0.65} />
            <rect x={tipX} y={plotTop + 2} width={tipW} height={tipH} fill="white" fillOpacity={0.97} stroke="#cbd5e1" strokeWidth={1} rx={5} />
            {rows.map(([label, val, colour], li) => (
              <g key={label}>
                <text x={tipX + 8} y={plotTop + 15 + li * 15} style={{ fontSize: '10px', fontWeight: 700, fill: '#64748b', fontFamily: 'system-ui' }}>{label}</text>
                <text x={tipX + 72} y={plotTop + 15 + li * 15} style={{ fontSize: '10px', fontWeight: 600, fill: colour, fontFamily: 'system-ui' }}>{val}</text>
              </g>
            ))}
          </g>
        );
      })()}
    </svg>
  );
});
