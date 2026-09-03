import { memo, useMemo } from 'react';

interface HistoryPoint {
  timestamp: string;
  windSpeed: number | null;
  windGust: number | null;
  direction: string | null;
}

// 16-point compass → degrees. N=0 at top, clockwise to NNW=337.5 near bottom.
const COMPASS_DEG: Record<string, number> = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

// 8 major compass points shown as right-axis tick labels
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

const SVG_W  = 480;
const SVG_H  = 210;
const PAD_L  = 34;   // left: knot labels
const PAD_R  = 36;   // right: compass labels
const PAD_T  = 18;
const PAD_B  = 36;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;

export const WeatherHistoryChart = memo(function WeatherHistoryChart({ points }: { points: HistoryPoint[] }) {
  const now    = Date.now();
  const sixH   = 6 * 60 * 60 * 1000;
  const startMs = now - sixH;

  const toX = (ms: number) => PAD_L + ((ms - startMs) / sixH) * PLOT_W;
  const nowX = toX(now);

  // Left Y: wind knots
  const allSpeeds = points.flatMap(p => [p.windSpeed ?? 0, p.windGust ?? 0]);
  const rawMax = allSpeeds.length ? Math.max(...allSpeeds) : 20;
  const yMax   = Math.max(Math.ceil(rawMax * 1.25 / 5) * 5, 10);
  const toYWind = (v: number) => PAD_T + PLOT_H - (v / yMax) * PLOT_H;

  // Right Y: compass (0° N = top, 360° = bottom)
  const toYDir = (deg: number) => PAD_T + (deg / 360) * PLOT_H;

  // Hour tick marks for X axis
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

  // Left-axis knot grid lines
  const gridStep = yMax <= 20 ? 5 : yMax <= 40 ? 10 : 15;
  const knotLines: number[] = [];
  for (let v = 0; v <= yMax; v += gridStep) knotLines.push(v);

  // Wind speed path + area
  const speedPts = points.map((p, i) => {
    const x = toX(new Date(p.timestamp).getTime());
    const y = toYWind(p.windSpeed ?? 0);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const speedPath = speedPts.join(' ');
  const firstX = toX(new Date(points[0].timestamp).getTime());
  const lastX  = toX(new Date(points[points.length - 1].timestamp).getTime());
  const areaPath = `${speedPath} L${lastX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${firstX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  // Gust path
  const gustPath = points.map((p, i) => {
    const x = toX(new Date(p.timestamp).getTime());
    const y = toYWind(p.windGust ?? 0);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Direction line — break path at wrap-around (>270° jump between consecutive points)
  const dirSegments: string[][] = [[]];
  let prevDeg: number | null = null;
  points.forEach(p => {
    const deg = p.direction != null ? COMPASS_DEG[p.direction] : undefined;
    if (deg === undefined) return;
    const x = toX(new Date(p.timestamp).getTime());
    const y = toYDir(deg);
    const seg = dirSegments[dirSegments.length - 1];
    if (prevDeg !== null && Math.abs(deg - prevDeg) > 270) {
      dirSegments.push([`M${x.toFixed(1)},${y.toFixed(1)}`]);
    } else if (seg.length === 0) {
      seg.push(`M${x.toFixed(1)},${y.toFixed(1)}`);
    } else {
      seg.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
    }
    prevDeg = deg;
  });
  const dirPaths = dirSegments.filter(s => s.length > 0).map(s => s.join(' '));

  return (
    <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full" style={{ display: 'block' }}>

      {/* ── Left-axis knot grid lines + labels ──────────────────────── */}
      {knotLines.map(v => (
        <g key={v}>
          <line x1={PAD_L} y1={toYWind(v)} x2={PAD_L + PLOT_W} y2={toYWind(v)}
            stroke="#e5e7eb" strokeWidth={0.6} />
          <text x={PAD_L - 4} y={toYWind(v) + 4}
            textAnchor="end" fontSize={11} fill="#9ca3af" fontFamily="system-ui,sans-serif">
            {v}
          </text>
        </g>
      ))}

      {/* ── Right-axis compass labels + tick marks ───────────────────── */}
      {RIGHT_AXIS.map(({ label, deg }) => {
        const y = toYDir(deg);
        return (
          <g key={label}>
            <line x1={PAD_L + PLOT_W} y1={y} x2={PAD_L + PLOT_W + 5} y2={y}
              stroke="#c4b5fd" strokeWidth={0.8} />
            <text x={PAD_L + PLOT_W + 8} y={y + 4}
              textAnchor="start" fontSize={11} fill="#8b5cf6" fontFamily="system-ui,sans-serif">
              {label}
            </text>
          </g>
        );
      })}

      {/* Right axis border */}
      <line x1={PAD_L + PLOT_W} y1={PAD_T} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H}
        stroke="#ddd6fe" strokeWidth={0.8} />

      {/* Left axis border */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + PLOT_H}
        stroke="#e5e7eb" strokeWidth={0.6} />

      {/* Bottom axis */}
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H}
        stroke="#e5e7eb" strokeWidth={0.8} />

      {/* ── Hour tick marks + labels ─────────────────────────────────── */}
      {hourMarks.map(ms => {
        const x = toX(ms);
        const label = new Date(ms)
          .toLocaleTimeString([], { hour: 'numeric', hour12: true })
          .replace(' ', '').toLowerCase();
        return (
          <g key={ms}>
            <line x1={x} y1={PAD_T + PLOT_H} x2={x} y2={PAD_T + PLOT_H + 5}
              stroke="#d1d5db" strokeWidth={0.8} />
            <text x={x} y={PAD_T + PLOT_H + 16}
              textAnchor="middle" fontSize={11} fill="#9ca3af" fontFamily="system-ui,sans-serif">
              {label}
            </text>
          </g>
        );
      })}

      {/* ── Wind area fill ───────────────────────────────────────────── */}
      <path d={areaPath} fill="#0ea5e9" opacity={0.12} />

      {/* ── Wind speed line ──────────────────────────────────────────── */}
      <path d={speedPath} fill="none" stroke="#0ea5e9" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* ── Gust dashed line ─────────────────────────────────────────── */}
      <path d={gustPath} fill="none" stroke="#f97316" strokeWidth={1.5}
        strokeDasharray="4,3" strokeLinejoin="round" strokeLinecap="round" />

      {/* ── Direction line (split at wrap) ───────────────────────────── */}
      {dirPaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#8b5cf6" strokeWidth={1.8}
          strokeLinejoin="round" strokeLinecap="round" opacity={0.85} />
      ))}

      {/* ── Direction dots (one per data point) ──────────────────────── */}
      {points.map((p, i) => {
        const deg = p.direction != null ? COMPASS_DEG[p.direction] : undefined;
        if (deg === undefined) return null;
        return (
          <circle key={i}
            cx={toX(new Date(p.timestamp).getTime())}
            cy={toYDir(deg)}
            r={3} fill="#8b5cf6" opacity={0.85}
          >
            <title>{p.direction}</title>
          </circle>
        );
      })}

      {/* ── NOW marker ───────────────────────────────────────────────── */}
      <line x1={nowX} y1={PAD_T} x2={nowX} y2={PAD_T + PLOT_H}
        stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
      <text x={nowX} y={PAD_T - 4} textAnchor="middle" fontSize={10} fill="#94a3b8"
        fontFamily="system-ui,sans-serif">NOW</text>

    </svg>
  );
});
