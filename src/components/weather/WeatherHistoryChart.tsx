import { memo, useMemo, useRef, useState, useEffect } from 'react';

interface HistoryPoint {
  timestamp: string;
  windSpeed: number | null;
  windGust: number | null;
  direction: string | null;
}

const COMPASS_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

const RIGHT_AXIS = [
  { label: 'N',  deg: 0   },
  { label: 'NE', deg: 45  },
  { label: 'E',  deg: 90  },
  { label: 'SE', deg: 135 },
  { label: 'S',  deg: 180 },
  { label: 'SW', deg: 225 },
  { label: 'W',  deg: 270 },
  { label: 'NW', deg: 315 },
];

// All padding in real CSS pixels — no viewBox, so 1 SVG unit = 1 CSS px.
const PAD_L = 36;
const PAD_R = 38;
const PAD_T = 20;
const PAD_B = 28;
const SVG_H = 180;

export const WeatherHistoryChart = memo(function WeatherHistoryChart({ points }: { points: HistoryPoint[] }) {
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
  const toYDir  = (deg: number) => PAD_T + (deg / 360) * PLOT_H;

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
      const cp1x = p1[0] + (p2[0] - p0[0]) * tension;
      const cp1y = p1[1] + (p2[1] - p0[1]) * tension;
      const cp2x = p2[0] - (p3[0] - p1[0]) * tension;
      const cp2y = p2[1] - (p3[1] - p1[1]) * tension;
      d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d;
  }

  const speedXY = points.map(p => [toX(new Date(p.timestamp).getTime()), toYWind(p.windSpeed ?? 0)] as [number, number]);
  const gustXY  = points.map(p => [toX(new Date(p.timestamp).getTime()), toYWind(p.windGust  ?? 0)] as [number, number]);

  const speedPath = smooth(speedXY);
  const firstX = speedXY[0][0];
  const lastX  = speedXY[speedXY.length - 1][0];
  const areaPath = `${speedPath} L${lastX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${firstX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;
  const gustPath  = smooth(gustXY);

  // Vertical gap between adjacent compass labels (N→NE = 45°/360° of PLOT_H).
  // Used to position NOW the same distance above N as N sits above NE.
  const dirSpacing = (45 / 360) * PLOT_H;

  const dirSegmentPts: [number, number][][] = [[]];
  let prevDeg: number | null = null;
  points.forEach(p => {
    const deg = p.direction != null ? COMPASS_DEG[p.direction] : undefined;
    if (deg === undefined) return;
    const x = toX(new Date(p.timestamp).getTime());
    const y = toYDir(deg);
    const seg = dirSegmentPts[dirSegmentPts.length - 1];
    if (prevDeg !== null && Math.abs(deg - prevDeg) > 270) {
      dirSegmentPts.push([[x, y]]);
    } else {
      seg.push([x, y]);
    }
    prevDeg = deg;
  });
  const dirPaths = dirSegmentPts.filter(s => s.length > 0).map(s => smooth(s, 0.2));

  // Shared text style constants — CSS px, genuinely absolute (no viewBox to scale them).
  const axisStyle  = { fontSize: '10px', fontWeight: 600, fontFamily: 'system-ui,sans-serif', fill: '#86868b' } as const;
  const compassStyle = { fontSize: '10px', fontWeight: 600, fontFamily: 'system-ui,sans-serif', fill: '#8b5cf6' } as const;
  const hourStyle  = { fontSize: '12px', fontWeight: 500, fontFamily: 'system-ui,sans-serif', fill: '#86868b' } as const;
  const nowStyle   = { fontSize: '10px', fontWeight: 500, fontFamily: 'system-ui,sans-serif', fill: '#94a3b8' } as const;

  return (
    <svg ref={svgRef} width="100%" height={SVG_H} style={{ display: 'block', overflow: 'visible' }}>

      {/* ── Left-axis knot grid lines + labels ── */}
      {knotLines.map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={toYWind(v)} x2={PAD_L + PLOT_W} y2={toYWind(v)}
            stroke="#e5e7eb" strokeWidth={0.6} />
          <text x={PAD_L - 5} y={toYWind(v)}
            textAnchor="end" dominantBaseline="middle" style={axisStyle}>
            {v}
          </text>
        </g>
      ))}

      {/* ── Right-axis compass labels + ticks ── */}
      {RIGHT_AXIS.map(({ label, deg }) => {
        const y = toYDir(deg);
        return (
          <g key={label}>
            <line x1={PAD_L + PLOT_W} y1={y} x2={PAD_L + PLOT_W + 4} y2={y}
              stroke="#c4b5fd" strokeWidth={0.8} />
            <text x={PAD_L + PLOT_W + 7} y={y}
              textAnchor="start" dominantBaseline="middle" style={compassStyle}>
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

      {/* Axis borders */}
      <line x1={PAD_L + PLOT_W} y1={PAD_T} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H}
        stroke="#ddd6fe" strokeWidth={0.8} />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H}
        stroke="#e5e7eb" strokeWidth={0.6} />
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H}
        stroke="#e5e7eb" strokeWidth={0.8} />

      {/* ── Hour tick marks + labels ── */}
      {hourMarks.map(ms => {
        const x = toX(ms);
        const label = new Date(ms)
          .toLocaleTimeString([], { hour: 'numeric', hour12: true })
          .replace(' ', '').toUpperCase();
        return (
          <g key={ms}>
            <line x1={x} y1={PAD_T + PLOT_H} x2={x} y2={PAD_T + PLOT_H + 4}
              stroke="#d1d5db" strokeWidth={0.8} />
            <text x={x} y={PAD_T + PLOT_H + 7}
              textAnchor="middle" dominantBaseline="hanging" style={hourStyle}>
              {label}
            </text>
          </g>
        );
      })}

      {/* ── Wind area + lines ── */}
      <path d={areaPath} fill="#0ea5e9" opacity={0.12} />
      <path d={speedPath} fill="none" stroke="#0ea5e9" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />
      <path d={gustPath} fill="none" stroke="#f97316" strokeWidth={1.5}
        strokeDasharray="4,3" strokeLinejoin="round" strokeLinecap="round" />

      {/* ── Direction line + dots ── */}
      {dirPaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#8b5cf6" strokeWidth={1.8}
          strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      ))}
      {points.map((p, i) => {
        const deg = p.direction != null ? COMPASS_DEG[p.direction] : undefined;
        if (deg === undefined) return null;
        return (
          <circle key={i}
            cx={toX(new Date(p.timestamp).getTime())}
            cy={toYDir(deg)}
            r={3} fill="#8b5cf6" opacity={0.85}>
            <title>{p.direction}</title>
          </circle>
        );
      })}

      {/* ── NOW marker ── */}
      <line x1={nowX} y1={PAD_T} x2={nowX} y2={PAD_T + PLOT_H}
        stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
      <text x={nowX} y={PAD_T - dirSpacing}
        textAnchor="middle" dominantBaseline="middle" style={nowStyle}>
        NOW
      </text>

    </svg>
  );
});
