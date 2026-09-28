import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useUnits } from '@/hooks/useUnits';
import { metresToFeet } from '@/lib/units';
import { effectiveWstar } from '../windmap/thermalInterpolation';
import { smoothLine, monotoneSegments, closedSpline, windAtAltitude } from '@/lib/spline';

/** W* thermal-strength grades (m/s) with the colours the contour bands + legend
 *  share. `min` is the lower bound of the grade; drawn low→high so the darker
 *  cores nest on top. Colours match getThermalStrength(). */
export const WSTAR_BANDS: { min: number; color: string; label: string }[] = [
  { min: 0.3, color: '#d4a843', label: 'Weak' },
  { min: 0.8, color: '#dc821e', label: 'Moderate' },
  { min: 1.5, color: '#d45a14', label: 'Good' },
  { min: 2.5, color: '#c03210', label: 'Strong' },
  { min: 3.5, color: '#b41414', label: 'Extreme' },
];

/** One hour of joined meteogram + sounding data for the RASP grid. */
export interface RaspHour {
  time: string; // Melbourne-local ISO "YYYY-MM-DDTHH:mm"
  ceilingAmsl: number | null; // BL Top (AMSL m)
  ccl: number | null;         // cloud condensation level (AGL m); Cu base = ccl + ground
  wstar: number | null;
  cape: number | null;
  cloud: number | null;       // total cloud %
  cloudLow: number | null;
  levels: { zAmsl: number; windSpd: number; windDir: number }[];
}

const M_TO_FT = 3.280839895;
const SVG_H = 360;
const PAD_L = 52, PAD_R = 14, PAD_T = 14, PAD_B = 24;

const getMelbHour = (iso: string) => parseInt(iso.slice(11, 13), 10);
const fmtMelbTime = (iso: string) => {
  const h = getMelbHour(iso);
  return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
};
function niceCeil(v: number, step: number) { return Math.ceil(v / step) * step; }

/** A wind barb pointing FROM the wind direction (rotate the <g> by windDir).
 *  Feathers: pennant = 50 kt, full = 10 kt, half = 5 kt. */
function BarbGlyph({ speed }: { speed: number }) {
  const s = Math.round(speed / 5) * 5;
  const stroke = '#1f2937';
  if (s < 2.5) return <circle r={2.2} fill="none" stroke={stroke} strokeWidth={0.8} />;
  const L = 17, tick = 6.5, gap = 3.4;
  let rem = s;
  const pennants = Math.floor(rem / 50); rem -= pennants * 50;
  const full = Math.floor(rem / 10); rem -= full * 10;
  const half = Math.floor(rem / 5);
  const els: ReactNode[] = [<line key="staff" x1={0} y1={0} x2={0} y2={-L} stroke={stroke} strokeWidth={0.9} />];
  let y = -L; let k = 0;
  for (let i = 0; i < pennants; i++) { els.push(<path key={`p${k++}`} d={`M0,${y.toFixed(1)} L${-tick},${(y + gap).toFixed(1)} L0,${(y + gap * 2).toFixed(1)} Z`} fill={stroke} />); y += gap * 2.1; }
  for (let i = 0; i < full; i++) { els.push(<line key={`f${k++}`} x1={0} y1={y} x2={-tick} y2={y - tick * 0.5} stroke={stroke} strokeWidth={0.9} />); y += gap; }
  for (let i = 0; i < half; i++) { els.push(<line key={`h${k++}`} x1={0} y1={y} x2={-tick * 0.5} y2={y - tick * 0.25} stroke={stroke} strokeWidth={0.9} />); y += gap; }
  return <>{els}</>;
}

export function RaspChart({
  hours, launchElevation, fullScale = false, overcastPct = 70,
}: {
  hours: RaspHour[];
  launchElevation: number | null;
  fullScale?: boolean;
  overcastPct?: number;
}) {
  const { units, toggleUnits } = useUnits();
  const [svgW, setSvgW] = useState(520);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const ro = new ResizeObserver(e => setSvgW(e[0].contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  // Today's daytime window.
  const slots = hours.length
    ? hours.filter(h => h.time.slice(0, 10) === hours[0].time.slice(0, 10) && getMelbHour(h.time) >= 8 && getMelbHour(h.time) <= 20)
    : [];

  if (slots.length < 2) {
    return <div className="flex items-center justify-center h-48 text-sm text-muted-foreground italic">No RASP data for today.</div>;
  }

  const groundAmsl = launchElevation ?? 0;
  const toDisp = (m: number) => (units === 'imperial' ? metresToFeet(m) : m);

  const ceilVals = slots.map(s => s.ceilingAmsl).filter((v): v is number => v !== null);
  const blhMax = ceilVals.length ? Math.max(...ceilVals) : groundAmsl + 2000;
  const soundingMaxZ = slots.reduce((mx, s) => s.levels.reduce((m, l) => Math.max(m, l.zAmsl), mx), 0);
  const yTopM = fullScale
    ? niceCeil(Math.max(soundingMaxZ || 6000, groundAmsl + 800), 500)
    : niceCeil(Math.max(blhMax * 1.15, groundAmsl + 800), 500);
  const yBotM = Math.floor(groundAmsl / 500) * 500;
  const dispTop = toDisp(yTopM), dispBot = toDisp(yBotM);

  const RIGHT_LEGEND_W = 56; // right-hand wind-barb key column
  const PLOT_W = svgW - PAD_L - PAD_R - RIGHT_LEGEND_W;
  const PLOT_H = SVG_H - PAD_T - PAD_B;
  const plotTop = PAD_T, plotBot = PAD_T + PLOT_H;
  const INNER_X = 8;
  const spanW = Math.max(1, PLOT_W - INNER_X * 2);
  const n = slots.length;
  const toX = (i: number) => PAD_L + INNER_X + (n <= 1 ? spanW / 2 : (i / (n - 1)) * spanW);
  const toY = (m: number) => plotTop + PLOT_H - ((toDisp(m) - dispBot) / (dispTop - dispBot)) * PLOT_H;
  const half = spanW / (n - 1) / 2;

  // Altitude gridlines (tidy in the display unit).
  const range = dispTop - dispBot;
  const stepDisp = units === 'imperial' ? (range > 13000 ? 4000 : range > 6000 ? 2000 : 1000) : (range > 4000 ? 1000 : 500);
  const yLines: number[] = [];
  for (let v = Math.ceil(dispBot / stepDisp) * stepDisp; v <= dispTop; v += stepDisp) yLines.push(v);
  const toYDisp = (v: number) => plotTop + PLOT_H - ((v - dispBot) / (dispTop - dispBot)) * PLOT_H;

  // Thermal-strength contour bands. For grade threshold t, the region {W >= t}
  // spans an altitude interval each hour (the updraft profile peaks mid-BL). We
  // solve that interval per hour, then spline the upper + lower boundaries into a
  // smooth closed blob and clip the colour to it — nested darkest-on-top.
  const peakOf = (s: RaspHour) => (s.ceilingAmsl !== null && s.ceilingAmsl > groundAmsl ? effectiveWstar(s.wstar ?? undefined, s.cape ?? 0) : 0);
  const info = slots.map(s => ({ blTop: s.ceilingAmsl, peak: peakOf(s) }));
  function contourRuns(t: number): { top: [number, number][]; bot: [number, number][] }[] {
    const runs: { top: [number, number][]; bot: [number, number][] }[] = [];
    let top: [number, number][] = [], bot: [number, number][] = [];
    const flush = () => { if (top.length) { runs.push({ top, bot }); top = []; bot = []; } };
    // Taper point where strength crosses the grade between hours i-1 and i:
    // the region pinches to a point at the peak-f altitude. Makes ends organic.
    const taper = (a: number, b: number) => {
      const A = info[a], B = info[b];
      if (A.blTop === null || B.blTop === null) return;
      const denom = B.peak - A.peak;
      const f = denom !== 0 ? Math.max(0, Math.min(1, (t - A.peak) / denom)) : 0;
      const xC = toX(a) + f * (toX(b) - toX(a));
      const blC = A.blTop + f * (B.blTop - A.blTop);
      const y = toY(groundAmsl + 0.4 * (blC - groundAmsl));
      top.push([xC, y]); bot.push([xC, y]);
    };
    slots.forEach((s, i) => {
      const { blTop, peak } = info[i];
      const inRun = blTop !== null && peak > t;
      const prevIn = i > 0 && info[i - 1].blTop !== null && info[i - 1].peak > t;
      if (!inRun) { if (prevIn) taper(i - 1, i); flush(); return; }
      if (!prevIn && i > 0) taper(i - 1, i);        // entering: taper in from the left
      const r = Math.min(1, t / peak);              // wShape value at the contour
      const halfF = 0.55 * Math.sqrt(Math.max(0, 1 - r)); // invert wShape → half-width in f
      const depth = blTop! - groundAmsl;
      const fHi = Math.min(1, 0.4 + halfF), fLo = Math.max(0, 0.4 - halfF);
      top.push([toX(i), toY(groundAmsl + fHi * depth)]);
      bot.push([toX(i), toY(groundAmsl + fLo * depth)]);
      if (i === slots.length - 1) flush();
    });
    flush();
    return runs;
  }
  const contourFills: ReactNode[] = [];
  WSTAR_BANDS.forEach((band, bi) => {
    contourRuns(band.min).forEach((run, ri) => {
      let d: string;
      if (run.top.length === 1) {
        const [x, ty] = run.top[0]; const by = run.bot[0][1];
        d = `M${(x - half).toFixed(1)},${ty.toFixed(1)} L${(x + half).toFixed(1)},${ty.toFixed(1)} L${(x + half).toFixed(1)},${by.toFixed(1)} L${(x - half).toFixed(1)},${by.toFixed(1)} Z`;
      } else {
        // Walk the blob as ONE closed loop — top edge left→right, bottom edge
        // right→left — dropping the shared tip points where the ends taper to a
        // single vertex, so closedSpline rounds those tips tangentially instead
        // of leaving the sharp corner two separate splines used to make.
        const same = (a: [number, number], b: [number, number]) => Math.abs(a[0] - b[0]) < 0.05 && Math.abs(a[1] - b[1]) < 0.05;
        const botRev = [...run.bot].reverse();
        const loop: [number, number][] = [...run.top];
        const lo = same(botRev[0], run.top[run.top.length - 1]) ? 1 : 0;
        const hi = same(botRev[botRev.length - 1], run.top[0]) ? botRev.length - 1 : botRev.length;
        for (let j = lo; j < hi; j++) loop.push(botRev[j]);
        d = closedSpline(loop);
      }
      contourFills.push(<path key={`ct${bi}-${ri}`} d={d} fill={band.color} />);
    });
  });

  // Cloud-cover shading: a smooth grey region hanging from the top of the chart,
  // its splined lower edge dipping deeper where there's more cloud, tapering to
  // nothing where the sky clears. Same organic treatment as the thermal bands.
  const cloudPct = slots.map(s => s.cloud ?? 0);
  const cloudDepth = (c: number) => (Math.min(100, c) / 100) * PLOT_H * 0.42;
  function cloudRuns(minPct: number): [number, number][][] {
    const runs: [number, number][][] = [];
    let pts: [number, number][] = [];
    const flush = () => { if (pts.length) { runs.push(pts); pts = []; } };
    const taper = (a: number, b: number) => {
      const denom = cloudPct[b] - cloudPct[a];
      const f = denom !== 0 ? Math.max(0, Math.min(1, (minPct - cloudPct[a]) / denom)) : 0;
      pts.push([toX(a) + f * (toX(b) - toX(a)), plotTop]); // converge to the top (zero depth)
    };
    slots.forEach((_, i) => {
      const inRun = cloudPct[i] >= minPct;
      const prevIn = i > 0 && cloudPct[i - 1] >= minPct;
      if (!inRun) { if (prevIn) taper(i - 1, i); flush(); return; }
      if (!prevIn && i > 0) taper(i - 1, i);
      pts.push([toX(i), plotTop + cloudDepth(cloudPct[i])]);
      if (i === slots.length - 1) flush();
    });
    flush();
    return runs;
  }
  const cloudArea = (pts: [number, number][]): string => {
    const rev = [...pts].reverse();
    return `M${pts[0][0].toFixed(1)},${plotTop.toFixed(1)} L${pts[pts.length - 1][0].toFixed(1)},${plotTop.toFixed(1)} `
      + `L${rev[0][0].toFixed(1)},${rev[0][1].toFixed(1)} ${monotoneSegments(rev)} Z`;
  };
  const clouds: ReactNode[] = [
    ...cloudRuns(8).map((pts, i) => pts.length >= 2 ? <path key={`cl${i}`} d={cloudArea(pts)} fill="#94a3b8" opacity={0.22} /> : null),
    ...cloudRuns(overcastPct).map((pts, i) => pts.length >= 2 ? <path key={`clo${i}`} d={cloudArea(pts)} fill="#94a3b8" opacity={0.28} /> : null),
  ];

  // BL Top + Cu Base smooth lines.
  const blXY = slots.map((s, i) => (s.ceilingAmsl !== null ? [toX(i), toY(s.ceilingAmsl)] as [number, number] : null)).filter((p): p is [number, number] => !!p);
  const cuXY = slots.map((s, i) => (s.ccl !== null && s.ceilingAmsl !== null && s.ccl + groundAmsl < s.ceilingAmsl ? [toX(i), toY(s.ccl + groundAmsl)] as [number, number] : null)).filter((p): p is [number, number] => !!p);

  // Wind barbs on a regular altitude lattice, interpolated per hour.
  const nRows = Math.max(6, Math.min(13, Math.round(PLOT_H / 26)));
  const barbAlts: number[] = [];
  for (let r = 1; r <= nRows; r++) barbAlts.push(yBotM + (r / (nRows + 1)) * (yTopM - yBotM));
  const barbs: ReactNode[] = [];
  slots.forEach((s, i) => {
    barbAlts.forEach((z, r) => {
      if (z < groundAmsl) return;
      const w = windAtAltitude(s.levels, z, 250);
      if (!w) return;
      barbs.push(
        <g key={`b${i}-${r}`} transform={`translate(${toX(i).toFixed(1)},${toY(z).toFixed(1)}) rotate(${w.dir.toFixed(0)})`}>
          <BarbGlyph speed={w.spd} />
        </g>,
      );
    });
  });

  const axisStyle = { fill: '#86868b', fontFamily: 'system-ui,sans-serif' } as const;
  const LINE_LABEL = { fontSize: '9px', fontWeight: 700, fontFamily: 'system-ui,sans-serif' } as const;

  return (
    <svg ref={svgRef} viewBox={`0 0 ${svgW} ${SVG_H}`} width="100%" height={SVG_H} style={{ touchAction: 'none', userSelect: 'none' }}>
      {/* Plot background */}
      <rect x={PAD_L} y={plotTop} width={PLOT_W} height={PLOT_H} fill="#eff6ff" />

      {/* Cloud shading (under everything else so lines/barbs read on top) */}
      {clouds}

      {/* W* thermal-strength contour bands */}
      {contourFills}

      {/* Altitude gridlines + labels */}
      <text x={PAD_L - 5} y={plotTop - 4} textAnchor="end" onPointerDown={(e) => { e.stopPropagation(); toggleUnits(); }}
        style={{ ...axisStyle, fontSize: '9px', cursor: 'pointer', textDecoration: 'underline' }}>
        {units === 'imperial' ? 'ft AMSL' : 'm AMSL'}
      </text>
      {yLines.map(v => (
        <g key={`y${v}`}>
          <line x1={PAD_L} y1={toYDisp(v)} x2={PAD_L + PLOT_W} y2={toYDisp(v)} stroke="#cbd5e1" strokeWidth={0.4} opacity={0.6} />
          <text x={PAD_L - 5} y={toYDisp(v) + 3} textAnchor="end" style={{ ...axisStyle, fontSize: '9px' }}>
            {units === 'imperial' ? `${Math.round(v / 1000)}k` : `${v >= 1000 ? (v / 1000) + 'k' : v}`}
          </text>
        </g>
      ))}

      {/* Cloud / condensation (Cu base) line */}
      {cuXY.length > 0 && (
        <>
          <path d={smoothLine(cuXY)} fill="none" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" />
          <text x={cuXY[0][0] + 4} y={cuXY[0][1] + 11} style={{ ...LINE_LABEL, fill: '#0ea5e9' }}>Cu Base</text>
        </>
      )}

      {/* BL Top line */}
      {blXY.length > 0 && (
        <>
          <path d={smoothLine(blXY)} fill="none" stroke="#111827" strokeWidth={2} strokeLinecap="round" />
          <text x={blXY[0][0] + 4} y={blXY[0][1] - 4} style={{ ...LINE_LABEL, fill: '#111827' }}>BL Top</text>
        </>
      )}

      {/* Ground reference */}
      <line x1={PAD_L} y1={toY(groundAmsl)} x2={PAD_L + PLOT_W} y2={toY(groundAmsl)} stroke="#64748b" strokeWidth={1} strokeDasharray="2,3" opacity={0.7} />

      {/* Wind barbs */}
      {barbs}

      {/* Wind-barb key — right-hand column: speed samples, then two direction
          samples (barb points FROM the wind direction). */}
      {(() => {
        const cx = PAD_L + PLOT_W + RIGHT_LEGEND_W / 2;
        const speed: { s: number; l: string }[] = [
          { s: 0, l: 'calm' }, { s: 5, l: '5' }, { s: 10, l: '10' }, { s: 25, l: '25' }, { s: 50, l: '50' },
        ];
        const dirs: { d: number; l: string }[] = [{ d: 315, l: 'NW' }, { d: 45, l: 'NE' }];
        const nRows = speed.length + 1 + dirs.length; // +1 for the "from" sub-header
        const y0 = plotTop + 26, step = Math.min(38, (PLOT_H - 30) / nRows);
        return (
          <g>
            <line x1={PAD_L + PLOT_W} y1={plotTop} x2={PAD_L + PLOT_W} y2={plotBot} stroke="#e5e7eb" strokeWidth={0.6} />
            <text x={cx} y={plotTop + 9} textAnchor="middle" style={{ ...axisStyle, fontSize: '9px', fontWeight: 700 }}>Wind kt</text>
            {speed.map((sm, i) => {
              const y = y0 + i * step;
              return (
                <g key={`bs${sm.s}`}>
                  <g transform={`translate(${cx.toFixed(1)},${y.toFixed(1)})`}><BarbGlyph speed={sm.s} /></g>
                  <text x={cx} y={y + 12} textAnchor="middle" style={{ ...axisStyle, fontSize: '9px' }}>{sm.l}</text>
                </g>
              );
            })}
            <text x={cx} y={y0 + speed.length * step + 4} textAnchor="middle" style={{ ...axisStyle, fontSize: '8px', fontWeight: 700 }}>dir (from)</text>
            {dirs.map((dd, i) => {
              const y = y0 + (speed.length + 1 + i) * step;
              return (
                <g key={`bd${dd.l}`}>
                  <g transform={`translate(${cx.toFixed(1)},${y.toFixed(1)}) rotate(${dd.d})`}><BarbGlyph speed={15} /></g>
                  <text x={cx} y={y + 12} textAnchor="middle" style={{ ...axisStyle, fontSize: '9px' }}>{dd.l}</text>
                </g>
              );
            })}
          </g>
        );
      })()}

      {/* Time axis */}
      {slots.map((s, i) => (i % 2 === 0 ? (
        <text key={`t${i}`} x={toX(i)} y={SVG_H - 6} textAnchor="middle" style={{ ...axisStyle, fontSize: '10px' }}>{fmtMelbTime(s.time)}</text>
      ) : null))}
    </svg>
  );
}
