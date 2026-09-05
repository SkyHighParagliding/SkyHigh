import { memo, useMemo, useRef, useState, useEffect } from 'react';
import { getIdealDirections, parseWindSpeed } from '@/lib/utils';

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
const PAD_L = 36;
const PAD_R = 38;
const PAD_T = 20;
const PAD_B = 28;
const SVG_H = 280;

export const WeatherHistoryChart = memo(function WeatherHistoryChart({ points, site }: { points: HistoryPoint[]; site?: any }) {
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

  const chartId = site?.id ?? 'chart';

  const speedXY = points.map(p => [toX(new Date(p.timestamp).getTime()), toYWind(p.windSpeed ?? 0)] as [number, number]);
  const gustXY  = points.map(p => [toX(new Date(p.timestamp).getTime()), toYWind(p.windGust  ?? 0)] as [number, number]);

  const speedPath = smooth(speedXY);
  const firstX = speedXY[0][0];
  const lastX  = speedXY[speedXY.length - 1][0];
  const areaPath = `${speedPath} L${lastX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} L${firstX.toFixed(1)},${(PAD_T + PLOT_H).toFixed(1)} Z`;
  const gustPath  = smooth(gustXY);

  const lastPoint = points[points.length - 1];
  const lastReadingLabel = new Date(lastPoint.timestamp).toLocaleTimeString('en-AU', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // Shared text style constants — CSS px, genuinely absolute (no viewBox to scale them).
  const axisStyle  = { fontSize: '10px', fontWeight: 600, fontFamily: 'system-ui,sans-serif', fill: '#86868b' } as const;
  const hourStyle  = { fontSize: '12px', fontWeight: 500, fontFamily: 'system-ui,sans-serif', fill: '#86868b' } as const;

  return (
    <svg ref={svgRef} width="100%" height={SVG_H} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
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
          stroke="#10b981" strokeWidth={0.8} strokeDasharray="4,3" opacity={0.7} />
        <text x={PAD_L - 5} y={toYWind(minSpeed)} textAnchor="end" dominantBaseline="middle"
          style={{ fontSize: '10px', fontWeight: 700, fontFamily: 'system-ui,sans-serif', fill: '#10b981' }}>
          {minSpeed}
        </text>
      </>}
      {maxSpeed !== null && <>
        <line x1={PAD_L} y1={toYWind(maxSpeed)} x2={PAD_L + PLOT_W} y2={toYWind(maxSpeed)}
          stroke="#10b981" strokeWidth={0.8} strokeDasharray="4,3" opacity={0.7} />
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
          .toLocaleTimeString([], { hour: 'numeric', hour12: true })
          .replace(' ', '').toUpperCase();
        const tooClose = Math.abs(x - nowX) < 36;
        return (
          <g key={ms}>
            <line x1={x} y1={PAD_T + PLOT_H} x2={x} y2={PAD_T + PLOT_H + 4}
              stroke="#d1d5db" strokeWidth={0.8} />
            {!tooClose && (
              <text x={x} y={PAD_T + PLOT_H + 7}
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
        <path d={gustPath} fill="none" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" opacity={0.85} clipPath={`url(#${chartId}-zone-high)`} />
        <path d={gustPath} fill="none" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" opacity={0.85} clipPath={`url(#${chartId}-zone-good)`} />
        <path d={gustPath} fill="none" stroke="#eab308" strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" opacity={0.85} clipPath={`url(#${chartId}-zone-low)`} />
      </>) : (
        <path d={gustPath} fill="none" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="4,3" strokeLinecap="round" opacity={0.85} />
      )}
      {points.map((p, i) => (
        <circle key={`gd${i}`}
          cx={toX(new Date(p.timestamp).getTime())} cy={toYWind(p.windGust ?? 0)}
          r={2} fill={spdColor(p.windGust ?? 0, minSpeed, maxSpeed)} opacity={0.85} />
      ))}

      {/* ── Speed line (smooth bezier, clipped per zone) + dots ── */}
      {minSpeed !== null && maxSpeed !== null ? (<>
        <path d={speedPath} fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" clipPath={`url(#${chartId}-zone-high)`} />
        <path d={speedPath} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" clipPath={`url(#${chartId}-zone-good)`} />
        <path d={speedPath} fill="none" stroke="#eab308" strokeWidth={2} strokeLinecap="round" clipPath={`url(#${chartId}-zone-low)`} />
      </>) : (
        <path d={speedPath} fill="none" stroke="#0ea5e9" strokeWidth={2} strokeLinecap="round" />
      )}
      {points.map((p, i) => (
        <circle key={`sd${i}`}
          cx={toX(new Date(p.timestamp).getTime())} cy={toYWind(p.windSpeed ?? 0)}
          r={2.5} fill={spdColor(p.windSpeed ?? 0, minSpeed, maxSpeed)} />
      ))}

      {/* ── Direction dots (no connecting line) ── */}
      {points.map((p, i) => {
        const deg = p.direction != null ? COMPASS_DEG[p.direction] : undefined;
        if (deg === undefined) return null;
        const c = dirColor(p.direction!, idealSet, crossSet);
        return (
          <circle key={i}
            cx={toX(new Date(p.timestamp).getTime())}
            cy={toYDir(deg)}
            r={3} fill={c} opacity={0.9}>
            <title>{p.direction}</title>
          </circle>
        );
      })}

      {/* ── NOW marker + last reading time label ── */}
      <line x1={nowX} y1={PAD_T} x2={nowX} y2={PAD_T + PLOT_H}
        stroke="#94a3b8" strokeWidth={1} strokeDasharray="3,3" />
      <text x={nowX} y={PAD_T + PLOT_H + 7}
        textAnchor="middle" dominantBaseline="hanging" style={hourStyle}>
        {lastReadingLabel}
      </text>

    </svg>
  );
});
