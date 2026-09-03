import { memo, useMemo } from 'react';

interface HistoryPoint {
  timestamp: string;
  windSpeed: number | null;
  windGust: number | null;
  direction: string | null;
}

interface WeatherHistoryChartProps {
  points: HistoryPoint[];
}

const DIR_COLOR: Record<string, string> = {
  N: '#3b82f6', NNE: '#3b82f6', NE: '#3b82f6', ENE: '#3b82f6',
  E: '#8b5cf6', ESE: '#8b5cf6', SE: '#8b5cf6', SSE: '#8b5cf6',
  S: '#10b981', SSW: '#10b981', SW: '#10b981', WSW: '#10b981',
  W: '#f59e0b', WNW: '#f59e0b', NW: '#f59e0b', NNW: '#f59e0b',
};

const SVG_W = 460;
const SVG_H = 120;
const PAD_L = 28;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 32;
const PLOT_W = SVG_W - PAD_L - PAD_R;
const PLOT_H = SVG_H - PAD_T - PAD_B;
const DIR_ROW_H = 14; // height of the direction dot row below the chart
const TOTAL_H = SVG_H + DIR_ROW_H;

export const WeatherHistoryChart = memo(function WeatherHistoryChart({ points }: WeatherHistoryChartProps) {
  const now = Date.now();
  const windowMs = 6 * 60 * 60 * 1000;
  const startMs = now - windowMs;

  const toX = (ms: number) => PAD_L + ((ms - startMs) / windowMs) * PLOT_W;
  const nowX = toX(now);

  const speeds = points.map(p => p.windSpeed ?? 0);
  const gusts = points.map(p => p.windGust ?? 0);
  const allVals = [...speeds, ...gusts];
  const maxVal = allVals.length ? Math.max(...allVals) : 20;
  const yMax = Math.max(Math.ceil(maxVal * 1.25 / 5) * 5, 10);
  const toY = (v: number) => PAD_T + PLOT_H - (v / yMax) * PLOT_H;

  const hourMarks = useMemo(() => {
    const marks: number[] = [];
    const startHour = new Date(startMs);
    startHour.setMinutes(0, 0, 0);
    startHour.setHours(startHour.getHours() + 1);
    let t = startHour.getTime();
    while (t < now) { marks.push(t); t += 3600000; }
    return marks;
  }, [startMs]);

  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center h-24 text-[11px] text-muted-foreground italic">
        Not enough data yet — check back once observations accumulate
      </div>
    );
  }

  const speedPath = points.map((p, i) => {
    const x = toX(new Date(p.timestamp).getTime());
    const y = toY(p.windSpeed ?? 0);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const areaPath = speedPath
    + ` L${toX(new Date(points[points.length - 1].timestamp).getTime()).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)}`
    + ` L${toX(new Date(points[0].timestamp).getTime()).toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;

  const gustPath = points.map((p, i) => {
    const x = toX(new Date(p.timestamp).getTime());
    const y = toY(p.windGust ?? 0);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  // Y-axis grid lines
  const gridLines: number[] = [];
  const step = yMax <= 20 ? 5 : yMax <= 40 ? 10 : 15;
  for (let v = 0; v <= yMax; v += step) gridLines.push(v);

  return (
    <svg
      viewBox={`0 0 ${SVG_W} ${TOTAL_H}`}
      className="w-full"
      style={{ display: 'block' }}
    >
      {/* Grid lines */}
      {gridLines.map(v => (
        <g key={v}>
          <line
            x1={PAD_L} y1={toY(v)} x2={PAD_L + PLOT_W} y2={toY(v)}
            stroke="#e5e7eb" strokeWidth={0.5}
          />
          <text
            x={PAD_L - 3} y={toY(v) + 3}
            textAnchor="end" fontSize={8} fill="#9ca3af" fontFamily="system-ui, sans-serif"
          >{v}</text>
        </g>
      ))}

      {/* Hour tick marks */}
      {hourMarks.map(ms => {
        const x = toX(ms);
        const label = new Date(ms).toLocaleTimeString([], { hour: 'numeric', hour12: true }).replace(' ', '').toLowerCase();
        return (
          <g key={ms}>
            <line x1={x} y1={PAD_T + PLOT_H} x2={x} y2={PAD_T + PLOT_H + 4} stroke="#d1d5db" strokeWidth={0.8} />
            <text x={x} y={PAD_T + PLOT_H + 13} textAnchor="middle" fontSize={8} fill="#9ca3af" fontFamily="system-ui, sans-serif">
              {label}
            </text>
          </g>
        );
      })}

      {/* Wind area fill */}
      <path d={areaPath} fill="#0ea5e9" opacity={0.12} />

      {/* Wind speed line */}
      <path d={speedPath} fill="none" stroke="#0ea5e9" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />

      {/* Gust line */}
      <path d={gustPath} fill="none" stroke="#f97316" strokeWidth={1.2} strokeDasharray="3,2" strokeLinejoin="round" strokeLinecap="round" />

      {/* NOW marker */}
      <line x1={nowX} y1={PAD_T} x2={nowX} y2={PAD_T + PLOT_H} stroke="#94a3b8" strokeWidth={0.8} strokeDasharray="2,2" />
      <text x={nowX} y={PAD_T - 2} textAnchor="middle" fontSize={7} fill="#94a3b8" fontFamily="system-ui, sans-serif">NOW</text>

      {/* Direction dots */}
      {points.map((p, i) => {
        const x = toX(new Date(p.timestamp).getTime());
        const color = p.direction ? (DIR_COLOR[p.direction] ?? '#9ca3af') : '#9ca3af';
        return (
          <circle
            key={i}
            cx={x} cy={SVG_H + DIR_ROW_H / 2}
            r={3.5} fill={color} opacity={0.7}
          >
            <title>{p.direction ?? '?'}</title>
          </circle>
        );
      })}

      {/* Axis bottom line */}
      <line x1={PAD_L} y1={PAD_T + PLOT_H} x2={PAD_L + PLOT_W} y2={PAD_T + PLOT_H} stroke="#e5e7eb" strokeWidth={0.8} />
    </svg>
  );
});
