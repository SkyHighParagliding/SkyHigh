import React, { memo, useMemo, useRef, useState, useEffect } from 'react';
import { getIdealDirections, parseWindSpeed } from '@/lib/utils';
import type { TideData } from './types';

interface HistoryPoint {
  timestamp: string;
  windSpeed: number | null;
  windGust: number | null;
  direction: string | null;
}

const ALL_DIRS_16 = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

const IDEAL_COLOR   = '#10b981';
const CROSS_COLOR   = '#f97316';
const NEUTRAL_COLOR = '#ef4444';

function buildDirSets(site: any) {
  const idealDirs = getIdealDirections(site ?? {});
  const idealSet = new Set(idealDirs);
  const crossLeft  = site?.crossLeft  === 'true' || site?.crossLeft  === true;
  const crossRight = site?.crossRight === 'true' || site?.crossRight === true;
  const crossSet = new Set<string>();
  if (idealSet.size > 0) {
    for (let i = 0; i < ALL_DIRS_16.length; i++) {
      if (!idealSet.has(ALL_DIRS_16[i])) continue;
      if (crossRight) crossSet.add(ALL_DIRS_16[(i + 1) % 16]);
      if (crossLeft)  crossSet.add(ALL_DIRS_16[(i - 1 + 16) % 16]);
    }
    for (const d of idealSet) crossSet.delete(d);
  }
  return { idealSet, crossSet };
}

function dirColor(dir: string, idealSet: Set<string>, crossSet: Set<string>): string {
  if (idealSet.has(dir)) return IDEAL_COLOR;
  if (crossSet.has(dir)) return CROSS_COLOR;
  return NEUTRAL_COLOR;
}

function spdColor(speed: number, min: number | null, max: number | null): string {
  if (min === null || max === null) return '#0ea5e9';
  if (speed > max)  return '#ef4444'; // blown out
  if (speed < min)  return '#eab308'; // light
  return '#10b981';                   // good
}

function circularMean(degrees: number[]): number {
  if (degrees.length === 0) return 180;
  const sinSum = degrees.reduce((s, d) => s + Math.sin(d * Math.PI / 180), 0);
  const cosSum = degrees.reduce((s, d) => s + Math.cos(d * Math.PI / 180), 0);
  return ((Math.atan2(sinSum, cosSum) * 180 / Math.PI) + 360) % 360;
}

function normDiff(diff: number): number {
  while (diff > 180)  diff -= 360;
  while (diff <= -180) diff += 360;
  return diff;
}


const COMPASS_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

const RIGHT_AXIS = [
  { label: 'N',   deg: 0     },
  { label: 'NNE', deg: 22.5  },
  { label: 'NE',  deg: 45    },
  { label: 'ENE', deg: 67.5  },
  { label: 'E',   deg: 90    },
  { label: 'ESE', deg: 112.5 },
  { label: 'SE',  deg: 135   },
  { label: 'SSE', deg: 157.5 },
  { label: 'S',   deg: 180   },
  { label: 'SSW', deg: 202.5 },
  { label: 'SW',  deg: 225   },
  { label: 'WSW', deg: 247.5 },
  { label: 'W',   deg: 270   },
  { label: 'WNW', deg: 292.5 },
  { label: 'NW',  deg: 315   },
  { label: 'NNW', deg: 337.5 },
];

// All padding in real CSS pixels — no viewBox, so 1 SVG unit = 1 CSS px.
const PAD_L = 40;
const PAD_R = 56;
const PAD_T = 20;
const PAD_B = 28;
const SVG_H = 280;
const TIDE_H = 32;   // height of the tide strip
const TIDE_PAD = 6;  // gap between wind plot bottom and tide strip top

export const WeatherHistoryChart = memo(function WeatherHistoryChart({ points, site, tideData }: { points: HistoryPoint[]; site?: any; tideData?: TideData | null }) {
  const { idealSet, crossSet } = useMemo(() => buildDirSets(site), [site]);

  const { minSpeed, maxSpeed } = useMemo(() => {
    const range = parseWindSpeed(site?.windSpeed) || parseWindSpeed(site?.windDir);
    return { minSpeed: range?.min ?? null, maxSpeed: range?.max ?? null };
  }, [site]);
  const [svgW, setSvgW] = useState(480);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setSvgW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const PLOT_W = svgW - PAD_L - PAD_R;
  const PLOT_H = SVG_H - PAD_T - PAD_B;

  const now     = Date.now();
  const sixH    = 6 * 60 * 60 * 1000;
  const startMs = now - sixH;

  const toX     = (ms: number) => PAD_L + ((ms - startMs) / sixH) * PLOT_W;
  const nowX    = toX(now);

  const allSpeeds = points.flatMap(p => [p.windSpeed ?? 0, p.windGust ?? 0]);
  const rawMax  = allSpeeds.length ? Math.max(...allSpeeds) : 20;
  const yMax    = Math.max(Math.ceil(rawMax * 1.25 / 5) * 5, 10);
  const toYWind = (v: number) => PAD_T + PLOT_H - (v / yMax) * PLOT_H;

  // Dynamic direction axis: anchor the circular mean of ideal directions
  // to the midpoint of the ideal speed zone so green aligns with green.
  const idealDegs = Array.from(idealSet)
    .map(d => COMPASS_DEG[d])
    .filter((d): d is number => d !== undefined);
  const hasDynDir = idealDegs.length > 0 && minSpeed !== null && maxSpeed !== null;
  // Anchor ideal-direction centre exactly to the ideal speed zone midpoint.
  // Compass labels / dots outside the plot bounds are hidden rather than clamping.
  const dirCenterY   = hasDynDir
    ? (toYWind(minSpeed!) + toYWind(maxSpeed!)) / 2
    : PAD_T + PLOT_H / 2;
  const dirCenterDeg = hasDynDir ? circularMean(idealDegs) : 180;
  const rawYDir = (deg: number) =>
    dirCenterY + normDiff(deg - dirCenterDeg) * (PLOT_H / 360);
  const toYDir = (deg: number) => {
    const rel = rawYDir(deg) - PAD_T;
    return PAD_T + ((rel % PLOT_H) + PLOT_H) % PLOT_H;
  };

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const h = new Date(startMs);
    h.setMinutes(0, 0, 0);
    h.setHours(h.getHours() + 1);
    let t = h.getTime();
    while (t < now) { marks.push(t); t += 3600_000; }
    return marks;
  }, [startMs]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-36 text-sm text-muted-foreground italic">
        Not enough data yet — check back once observations accumulate
      </div>
    );
  }

  const gridStep = yMax <= 20 ? 5 : yMax <= 40 ? 10 : 15;
  const knotLines: number[] = [];
  for (let v = 0; v <= yMax; v += gridStep) knotLines.push(v);

  // Catmull-Rom → cubic bezier smooth path
  function smooth(pts: [number, number][], tension = 0.3): string {
    if (pts.length < 2) return '';
    if (pts.length === 2)
      return `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} L${pts[1][0].toFixed(1)},${pts[1][1].toFixed(1)}`;
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      // Clamp X to [p1, p2] to prevent backward loops when Y jumps are large
      const cp1x = Math.min(Math.max(p1[0] + (p2[0] - p0[0]) * tension, p1[0]), p2[0]);
      const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      const cp2x = Math.min(Math.max(p2[0] - (p3[0] - p1[0]) * tension, p1[0]), p2[0]);
      const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  const chartId = site?.id ?? 'chart';

  const speedXY = points.map(p => [toX(new Date(p.timestamp).getTime()), toYWind(p.windSpeed ?? 0)] as [number, number]);
  const gustXY  = points.map(p => [toX(new Date(p.timestamp).getTime()), toYWind(p.windGust  ?? 0)] as [number, number]);

  const speedPath = smooth(speedXY);
  const firstX = speedXY[0][0];
  const lastX  = speedXY[speedXY.length - 1][0];
  const areaPath = `${speedPath} L${lastX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${firstX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;
  const gustPath  = smooth(gustXY);

  // ── Direction colour zones + wrap-aware path (for clipPath rendering) ──
  const BOT_D = PAD_T + PLOT_H;
  const halfBandRaw = PLOT_H / 32; // half a compass step (11.25°) in raw pixels
  const dirZoneRects: Record<string, { y: number; h: number }[]> = {
    [IDEAL_COLOR]: [], [CROSS_COLOR]: [], [NEUTRAL_COLOR]: [],
  };
  for (const dir of ALL_DIRS_16) {
    const c = dirColor(dir, idealSet, crossSet);
    const rawCenter = rawYDir(COMPASS_DEG[dir]);
    const r0 = rawCenter - halfBandRaw;
    const r1 = rawCenter + halfBandRaw;
    const addR = (v0: number, v1: number) => {
      const top = Math.max(PAD_T, Math.min(BOT_D, Math.min(v0, v1)));
      const bot = Math.max(PAD_T, Math.min(BOT_D, Math.max(v0, v1)));
      if (bot > top) dirZoneRects[c].push({ y: top, h: bot - top });
    };
    if      (r0 >= PAD_T && r1 <= BOT_D)    addR(r0, r1);
    else if (r0 >= BOT_D)                    addR(r0 - PLOT_H, r1 - PLOT_H);
    else if (r1 <= PAD_T)                    addR(r0 + PLOT_H, r1 + PLOT_H);
    else if (r0 < BOT_D && r1 > BOT_D)    { addR(r0, BOT_D); addR(PAD_T, r1 - PLOT_H); }
    else if (r0 < PAD_T && r1 > PAD_T)    { addR(r0 + PLOT_H, BOT_D); addR(PAD_T, r1); }
  }
  const dirSegPts: [number, number][][] = [];
  {
    let seg: [number, number][] = [];
    let prevRaw: number | null = null;
    let prevX: number | null = null;
    for (const p of points) {
      const deg = p.direction != null ? COMPASS_DEG[p.direction] : undefined;
      if (deg === undefined) {
        if (seg.length >= 2) dirSegPts.push(seg);
        seg = []; prevRaw = null; prevX = null; continue;
      }
      const x = toX(new Date(p.timestamp).getTime());
      const y = toYDir(deg);
      const raw = rawYDir(deg);
      if (prevRaw !== null && prevX !== null) {
        const lo = Math.min(prevRaw, raw), hi = Math.max(prevRaw, raw);
        const cBot = lo < BOT_D && hi > BOT_D;
        const cTop = lo < PAD_T && hi > PAD_T;
        if (cBot || cTop) {
          const br = cBot ? BOT_D : PAD_T;
          const t = (br - prevRaw) / (raw - prevRaw);
          const xC = prevX + t * (x - prevX);
          let exitY: number, enterY: number;
          if (cBot) { if (prevRaw < raw) { exitY = BOT_D; enterY = PAD_T; } else { exitY = PAD_T; enterY = BOT_D; } }
          else       { if (prevRaw > raw) { exitY = PAD_T; enterY = BOT_D; } else { exitY = BOT_D; enterY = PAD_T; } }
          seg.push([xC, exitY]);
          dirSegPts.push(seg);
          seg = [[xC, enterY], [x, y]];
        } else {
          seg.push([x, y]);
        }
      } else {
        seg.push([x, y]);
      }
      prevRaw = raw; prevX = x;
    }
    if (seg.length >= 2) dirSegPts.push(seg);
  }
  const dirPathD = dirSegPts.map(s => smooth(s)).join(' ');

  // ── Tide strip (coastal sites only) ─────────────────────────────────────
  const tidePreds = useMemo(() => {
    if (!tideData || tideData.predictions.length < 2) return null;
    return [...tideData.predictions]
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  }, [tideData]);

  const hasTide = !!tidePreds;
  const tideOffset = hasTide ? TIDE_PAD + TIDE_H : 0;
  const totalSvgH = SVG_H + tideOffset;
  const bottomY = PAD_T + PLOT_H + tideOffset; // Y where ticks and labels sit

  const TIDE_TOP = PAD_T + PLOT_H + TIDE_PAD;
  const TIDE_BOT = TIDE_TOP + TIDE_H;

  const tideScale = useMemo(() => {
    if (!tidePreds) return null;
    const allH = tidePreds.map(p => p.height);
    const tMinH = Math.min(...allH);
    const tMaxH = Math.max(...allH);
    const tRange = tMaxH - tMinH || 1;
    return { tMinH, tRange, toYT: (h: number) => TIDE_BOT - ((h - tMinH) / tRange) * TIDE_H };
  }, [tidePreds, TIDE_BOT]);

  const tidePath = useMemo(() => {
    if (!tidePreds || !tideScale) return '';
    const { toYT } = tideScale;
    const interp = (ms: number): number => {
      for (let i = 0; i < tidePreds.length - 1; i++) {
        const t0 = new Date(tidePreds[i].time).getTime();
        const t1 = new Date(tidePreds[i + 1].time).getTime();
        if (ms >= t0 && ms <= t1) {
          const p = (ms - t0) / (t1 - t0);
          return tidePreds[i].height + (tidePreds[i + 1].height - tidePreds[i].height) * ((1 - Math.cos(p * Math.PI)) / 2);
        }
      }
      return ms < new Date(tidePreds[0].time).getTime() ? tidePreds[0].height : tidePreds[tidePreds.length - 1].height;
    };
    const pts: string[] = [];
    for (let i = 0; i <= 200; i++) {
      const ms = startMs + (i / 200) * sixH;
      pts.push(`${i === 0 ? 'M' : 'L'}${toX(ms).toFixed(1)},${toYT(interp(ms)).toFixed(1)}`);
    }
    return pts.join(' ');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tidePreds, tideScale, startMs, sixH, PLOT_W]);

  const tideMarkers = useMemo(() => {
    if (!tidePreds || !tideScale) return [];
    const endMs = startMs + sixH;
    return tidePreds
      .filter(p => { const t = new Date(p.time).getTime(); return t >= startMs && t <= endMs; })
      .map(p => ({
        x: PAD_L + ((new Date(p.time).getTime() - startMs) / sixH) * PLOT_W,
        y: tideScale.toYT(p.height),
        type: p.type,
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tidePreds, tideScale, startMs, sixH, PLOT_W]);

  const lastPoint = points[points.length - 1];
  const lastReadingLabel = new Date(lastPoint.timestamp).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // Shared text style constants — CSS px, genuinely absolute (no viewBox to scale them).
  const axisStyle  = { fontSize: '10px', fontWeight: 600, fontFamily: 'system-ui,sans-serif', fill: '#86868b' } as const;
  const hourStyle  = { fontSize: '12px', fontWeight: 500, fontFamily: 'system-ui,sans-serif', fill: '#86868b' } as const;

  return (
    <svg ref={svgRef} width="100%" height={totalSvgH} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <clipPath id={`${chartId}-plot`}>
          <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} />
        </clipPath>
        {minSpeed !== null && maxSpeed !== null && <>
          <clipPath id={`${chartId}-zone-high`}>
            <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={Math.max(0, toYWind(maxSpeed) - PAD_T)} />
          </clipPath>
          <clipPath id={`${chartId}-zone-good`}>
            <rect x={PAD_L} y={toYWind(maxSpeed)} width={PLOT_W} height={Math.max(0, toYWind(minSpeed) - toYWind(maxSpeed))} />
          </clipPath>
          <clipPath id={`${chartId}-zone-low`}>
            <rect x={PAD_L} y={toYWind(minSpeed)} width={PLOT_W} height={Math.max(0, PAD_T + PLOT_H - toYWind(minSpeed))} />
          </clipPath>
        </>}
        <clipPath id={`${chartId}-dir-ideal`}>
          {dirZoneRects[IDEAL_COLOR].map((r, i) => <rect key={i} x={PAD_L} y={r.y} width={PLOT_W} height={r.h} />)}
        </clipPath>
        <clipPath id={`${chartId}-dir-cross`}>
          {dirZoneRects[CROSS_COLOR].map((r, i) => <rect key={i} x={PAD_L} y={r.y} width={PLOT_W} height={r.h} />)}
        </clipPath>
        <clipPath id={`${chartId}-dir-neutral`}>
          {dirZoneRects[NEUTRAL_COLOR].map((r, i) => <rect key={i} x={PAD_L} y={r.y} width={PLOT_W} height={r.h} />)}
        </clipPath>
      </defs>

      {/* ── Left-axis knot grid lines + labels (skip ideal zone boundaries) ── */}
      {knotLines.filter(v => v !== minSpeed && v !== maxSpeed).map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={toYWind(v)} x2={PAD_L + PLOT_W} y2={toYWind(v)}
            stroke="#e5e7eb" strokeWidth={0.6} />
          <text x={PAD_L - 5} y={toYWind(v)}
            textAnchor="end" dominantBaseline="middle" style={axisStyle}>
            {v}
          </text>
        </g>
      ))}

      {/* ── Ideal zone boundary lines + green labels ── */}
      {minSpeed !== null && <>
        <line x1={PAD_L} y1={toYWind(minSpeed)} x2={PAD_L + PLOT_W} y2={toYWind(minSpeed)}
          stroke="#10b981" strokeWidth={0.8} strokeDasharray="8,4" opacity={0.7} />
        <text x={PAD_L - 5} y={toYWind(minSpeed)} textAnchor="end" dominantBaseline="middle"
          style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'system-ui,sans-serif', fill: '#10b981' }}>
          {minSpeed}
        </text>
      </>}
      {maxSpeed !== null && <>
        <line x1={PAD_L} y1={toYWind(maxSpeed)} x2={PAD_L + PLOT_W} y2={toYWind(maxSpeed)}
          stroke="#10b981" strokeWidth={0.8} strokeDasharray="8,4" opacity={0.7} />
        <text x={PAD_L - 5} y={toYWind(maxSpeed)} textAnchor="end" dominantBaseline="middle"
          style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'system-ui,sans-serif', fill: '#10b981' }}>
          {maxSpeed}
        </text>
      </>}

      {/* ── Right-axis compass labels + ticks ── */}
      {RIGHT_AXIS.map(({ label, deg }) => {
        const y = toYDir(deg);
        const c = dirColor(label, idealSet, crossSet);
        return (
          <g key={label}>
            <line x1={PAD_L + PLOT_W} y1={y} x2={PAD_L + PLOT_W + 4} y2={y}
              stroke={c} strokeWidth={0.8} />
            <text x={PAD_L + PLOT_W + 7} y={y}
              textAnchor="start" dominantBaseline="middle"
              style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'system-ui,sans-serif', fill: c }}>
              {label}
            </text>
          </g>
        );
      })}

      {/* ── Left axis KTS label (rotated) ── */}
      <text
        x={8}
        y={PAD_T + PLOT_H / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(-90, 8, ${PAD_T + PLOT_H / 2})`}
        style={axisStyle}
      >
        KTS
      </text>

      {/* ── Speed zone colour bar (overlaid on left axis line) ── */}
      {minSpeed !== null && maxSpeed !== null ? (
        <>
          <rect x={PAD_L - 2} y={PAD_T} width={4} height={Math.max(0, toYWind(maxSpeed) - PAD_T)}
            fill="#ef4444" opacity={0.75} rx={1} />
          <rect x={PAD_L - 2} y={toYWind(maxSpeed)} width={4} height={Math.max(0, toYWind(minSpeed) - toYWind(maxSpeed))}
            fill="#10b981" opacity={0.75} rx={1} />
          <rect x={PAD_L - 2} y={toYWind(minSpeed)} width={4} height={Math.max(0, PAD_T + PLOT_H - toYWind(minSpeed))}
            fill="#eab308" opacity={0.75} rx={1} />
        </>
      ) : (
        <rect x={PAD_L - 2} y={PAD_T} width={4} height={PLOT_H} fill="#9ca3af" opacity={0.3} rx={1} />
      )}

      {/* Axis borders */}
      <line x1={PAD_L + PLOT_W} y1={PAD_T} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H}
        stroke="#ddd6fe" strokeWidth={0.8} />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H}
        stroke="#e5e7eb" strokeWidth={0.6} />
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H}
        stroke="#e5e7eb" strokeWidth={0.8} />

      {/* ── Hour tick marks + labels (suppressed if too close to last reading label) ── */}
      {hourMarks.map(ms => {
        const x = toX(ms);
        const label = new Date(ms)
          .toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
        const tooClose = Math.abs(x - nowX) < 36;
        return (
          <g key={ms}>
            <line x1={x} y1={bottomY} x2={x} y2={bottomY + 4}
              stroke="#d1d5db" strokeWidth={0.8} />
            {!tooClose && (
              <text x={x} y={bottomY + 7}
                textAnchor="middle" dominantBaseline="hanging" style={hourStyle}>
                {label}
              </text>
            )}
          </g>
        );
      })}

      {/* ── Wind area (neutral fill for shape context) ── */}
      <path d={areaPath} fill="#94a3b8" opacity={0.08} />

      {/* ── Gust line (smooth bezier, clipped per zone) + dots ── */}
      {minSpeed !== null && maxSpeed !== null ? (<>
        <path d={gustPath} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="8,4" strokeLinecap="round" opacity={0.85} clipPath={`url(#${chartId}-zone-high)`} />
        <path d={gustPath} fill="none" stroke="#10b981" strokeWidth={1.5} strokeDasharray="8,4" strokeLinecap="round" opacity={0.85} clipPath={`url(#${chartId}-zone-good)`} />
        <path d={gustPath} fill="none" stroke="#eab308" strokeWidth={1.5} strokeDasharray="8,4" strokeLinecap="round" opacity={0.85} clipPath={`url(#${chartId}-zone-low)`} />
      </>) : (
        <path d={gustPath} fill="none" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="8,4" strokeLinecap="round" opacity={0.85} />
      )}

      {/* ── Speed line (smooth bezier, clipped per zone) + dots ── */}
      {minSpeed !== null && maxSpeed !== null ? (<>
        <path d={speedPath} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" clipPath={`url(#${chartId}-zone-high)`} />
        <path d={speedPath} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" clipPath={`url(#${chartId}-zone-good)`} />
        <path d={speedPath} fill="none" stroke="#eab308" strokeWidth={2} strokeLinecap="round" clipPath={`url(#${chartId}-zone-low)`} />
      </>) : (
        <path d={speedPath} fill="none" stroke="#0ea5e9" strokeWidth={2} strokeLinecap="round" />
      )}

      {/* ── Direction connecting line (smooth bezier, colour zones via clipPath) ── */}
      {dirPathD && <>
        <path d={dirPathD} fill="none" stroke={NEUTRAL_COLOR} strokeWidth={2} strokeLinecap="round" strokeDasharray="1,4" opacity={0.6} clipPath={`url(#${chartId}-dir-neutral)`} />
        <path d={dirPathD} fill="none" stroke={CROSS_COLOR}   strokeWidth={2} strokeLinecap="round" strokeDasharray="1,4" opacity={0.6} clipPath={`url(#${chartId}-dir-cross)`} />
        <path d={dirPathD} fill="none" stroke={IDEAL_COLOR}   strokeWidth={2} strokeLinecap="round" strokeDasharray="1,4" opacity={0.6} clipPath={`url(#${chartId}-dir-ideal)`} />
      </>}


      {/* ── NOW marker + last reading time label ── */}
      <line x1={nowX} y1={PAD_T} x2={nowX} y2={bottomY}
        stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
      <text x={nowX} y={bottomY + 7}
        textAnchor="middle" dominantBaseline="hanging" style={hourStyle}>
        {lastReadingLabel}
      </text>

      {/* ── Tide strip ── */}
      {hasTide && tidePath && (() => {
        const fmtT = (t: string) => new Date(t).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
        const tideAxisStyle = { fontSize: '10px', fontWeight: 700, fontFamily: 'system-ui,sans-serif', fill: '#0071e3' } as const;
        return <>
          <line x1={PAD_L} y1={TIDE_TOP} x2={PAD_L + PLOT_W} y2={TIDE_TOP}
            stroke="#e5e7eb" strokeWidth={0.6} />
          <path
            d={`${tidePath} L${toX(startMs + sixH).toFixed(1)},${TIDE_BOT} L${toX(startMs).toFixed(1)},${TIDE_BOT} Z`}
            fill="#0071e3" opacity={0.08} />
          <path d={tidePath} fill="none" stroke="#0071e3" strokeWidth={1.5} strokeLinecap="round" />

          {/* Hi/Lo markers on the tide curve */}
          {tideMarkers.map((m, i) => {
            const s = 4;
            return m.type === 'high'
              ? <polygon key={i} points={`${m.x},${m.y - s} ${m.x - s},${m.y + s * 0.5} ${m.x + s},${m.y + s * 0.5}`} fill="#0071e3" />
              : <polygon key={i} points={`${m.x},${m.y + s} ${m.x - s},${m.y - s * 0.5} ${m.x + s},${m.y - s * 0.5}`} fill="#0071e3" />;
          })}

          <line x1={PAD_L} y1={TIDE_BOT} x2={PAD_L + PLOT_W} y2={TIDE_BOT}
            stroke="#e5e7eb" strokeWidth={0.6} />

          {/* TIDE rotated label — left axis, aligned with KTS */}
          <text x={8} y={TIDE_TOP + TIDE_H / 2} textAnchor="middle" dominantBaseline="middle"
            transform={`rotate(-90, 8, ${TIDE_TOP + TIDE_H / 2})`} style={axisStyle}>
            TIDE
          </text>

          {/* Next High / Next Low — right axis, aligned with compass labels */}
          {tideData?.nextHigh && (() => {
            const rx = PAD_L + PLOT_W + 7; const ry = TIDE_TOP + 9;
            return <g>
              {/* right triangle */}
              <polygon points={`${rx},${ry - 3} ${rx},${ry + 3} ${rx + 5},${ry}`} fill="#0071e3" />
              {/* up triangle — centroid at ry */}
              <polygon points={`${rx + 9},${ry + 2} ${rx + 14},${ry + 2} ${rx + 11.5},${ry - 3}`} fill="#0071e3" />
              <text x={rx + 17} y={ry} dominantBaseline="middle" style={tideAxisStyle}>{fmtT(tideData!.nextHigh!.time)}</text>
            </g>;
          })()}
          {tideData?.nextLow && (() => {
            const rx = PAD_L + PLOT_W + 7; const ry = TIDE_BOT - 9;
            return <g>
              {/* right triangle */}
              <polygon points={`${rx},${ry - 3} ${rx},${ry + 3} ${rx + 5},${ry}`} fill="#0071e3" />
              {/* down triangle — centroid at ry */}
              <polygon points={`${rx + 9},${ry - 2} ${rx + 14},${ry - 2} ${rx + 11.5},${ry + 3}`} fill="#0071e3" />
              <text x={rx + 17} y={ry} dominantBaseline="middle" style={tideAxisStyle}>{fmtT(tideData!.nextLow!.time)}</text>
            </g>;
          })()}
        </>;
      })()}

    </svg>
  );
});
