import { getWindAt, type WindGrid } from './windInterpolation';
import type { StationHistoryPoint } from '../../../shared/stations';

// 6 h observed-wind chart for the station card (live stations overlay). Plain
// inline SVG: shaded gust band (speed→gust), solid speed line, a dotted forecast
// line sampled from the wind grid at the station, and downwind arrows along the
// bottom matching the map's station boxes. The pure helpers below are exported
// for stationCard.test.mjs and shared with StationCard.tsx.

// ── Units (shared with SitesWindMap so the map, card and chart agree) ────────
export type SpeedUnit = 'kt' | 'mph' | 'kph';
export const SPEED_FACTOR: Record<SpeedUnit, number> = { kt: 1, mph: 1.15078, kph: 1.852 };

const KT_PER_MS = 1 / 0.514444;

/** Forecast surface wind at a point and time from the wind grid, in knots and
 *  degrees FROM. `strictTime` returns null outside the grid's time range rather
 *  than clamping to its first/last step (getWindAt clamps). */
export function windAtPoint(
  lon: number, lat: number, t: number, grid: WindGrid | null | undefined, strictTime = false,
): { speedKt: number; dirDeg: number } | null {
  if (!grid || !grid.times?.length) return null;
  if (strictTime) {
    const first = Date.parse(grid.times[0]);
    const last = Date.parse(grid.times[grid.times.length - 1]);
    if (!(t >= first && t <= last)) return null;
  }
  const uv = getWindAt(lon, lat, t, grid);
  if (!uv) return null;
  const [u, v] = uv;
  // u/v were built as u=-S·sin(dir), v=-S·cos(dir) (dir = FROM), so atan2(-u,-v)=dir.
  return { speedKt: Math.hypot(u, v) * KT_PER_MS, dirDeg: (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360 };
}

/** Whole minutes since an ISO time (never negative). NaN for a bad time. */
export function minutesAgo(iso: string, now: number): number {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return NaN;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/** "just now" / "12 min ago" / "1 h ago" / "2 h 5 min ago". */
export function fmtAgo(min: number): string {
  if (!Number.isFinite(min)) return '';
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min ago` : `${h} h ago`;
}

/** Observed wind as display strings in `unit`, whole numbers. Calm when the speed
 *  rounds to 0. Gust only when reported and stronger than the (rounded) speed. */
export function fmtObs(speedKt: number, gustKt: number | null | undefined, unit: SpeedUnit) {
  const f = SPEED_FACTOR[unit];
  const s = Math.round(speedKt * f);
  const g = gustKt != null && Number.isFinite(gustKt) ? Math.round(gustKt * f) : null;
  return { calm: s === 0 && (g == null || g === 0), speed: String(s), gust: g != null && g > s ? String(g) : null };
}

/** Y-axis top: at least 10, rounded up to 5 (≤30) or 10 above that. */
export function niceMax(v: number): number {
  if (!(v > 0)) return 10;
  const step = v > 30 ? 10 : 5;
  return Math.max(10, Math.ceil(v / step) * step);
}

/** Whole hours (epoch ms) inside [start, end]. Melbourne is a whole-hour offset
 *  from UTC, so UTC hours are local hours too. */
export function hourTicks(start: number, end: number): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(start / 3600000) * 3600000; t <= end; t += 3600000) out.push(t);
  return out;
}

/** Hour tick label in the map's clock style: "3pm" (12 h) or "15:00" (24 h). */
export function fmtHourTick(ms: number, use24h: boolean): string {
  const s = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne', hour: 'numeric', ...(use24h ? { minute: '2-digit' } : {}), hour12: !use24h,
  }).format(ms);
  return s.replace(/\s/g, '').toLowerCase();
}

/** Split points into runs with no gap longer than `maxGapMs` so lines don't
 *  bridge a station outage. */
export function splitRuns<T extends { t: number }>(pts: T[], maxGapMs = 60 * 60 * 1000): T[][] {
  const runs: T[][] = [];
  for (const p of pts) {
    const run = runs[runs.length - 1];
    if (run && p.t - run[run.length - 1].t <= maxGapMs) run.push(p);
    else runs.push([p]);
  }
  return runs;
}

// ── Chart ────────────────────────────────────────────────────────────────────
const W = 232, H = 110;
const PAD_L = 20, PAD_R = 4, PLOT_T = 4, PLOT_B = 72, ARROW_Y = 83, TICK_Y = 102;
const SPEED_COLOR = '#38bdf8'; // sky-400
const FCST_COLOR = '#fcd34d';  // amber-300

interface StationHistoryChartProps {
  points: StationHistoryPoint[] | undefined;
  loading?: boolean;
  error?: boolean;
  unit: SpeedUnit;
  use24h: boolean;
  /** For the dotted forecast line. */
  lat: number;
  lon: number;
  windGrid?: WindGrid | null;
  hours?: number;
  now?: number;
}

export function StationHistoryChart({ points, loading, error, unit, use24h, lat, lon, windGrid, hours = 6, now = Date.now() }: StationHistoryChartProps) {
  const end = now, start = end - hours * 3600000;
  const f = SPEED_FACTOR[unit];
  const obs = (points ?? [])
    .map(p => ({ ...p, t: Date.parse(p.t) }))
    .filter(p => Number.isFinite(p.t) && p.t >= start && p.t <= end && Number.isFinite(p.speedKt))
    .sort((a, b) => a.t - b.t);

  if (!obs.length) {
    return (
      <div className="h-[60px] flex items-center justify-center text-[10px] text-white/50" data-station-chart>
        {loading ? 'Loading history…' : error ? 'History unavailable' : 'No history'}
      </div>
    );
  }

  const fcst = obs
    .map(p => { const w = windAtPoint(lon, lat, p.t, windGrid, true); return w ? { t: p.t, v: w.speedKt * f } : null; })
    .filter((x): x is { t: number; v: number } => !!x);

  const top = niceMax(Math.max(
    ...obs.map(p => Math.max(p.speedKt, p.gustKt ?? 0) * f),
    ...fcst.map(p => p.v),
  ));
  const x = (t: number) => PAD_L + ((t - start) / (end - start)) * (W - PAD_L - PAD_R);
  const y = (v: number) => PLOT_B - (Math.min(v, top) / top) * (PLOT_B - PLOT_T);
  const xy = (t: number, v: number) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`;

  const runs = splitRuns(obs);
  const fcstRuns = splitRuns(fcst);
  const yTicks = [0, top / 2, top];
  const ticks = hourTicks(start, end);
  // Label every other hour so a 6 h axis stays legible at 232 px.
  const labelEvery = ticks.length > 4 ? 2 : 1;

  // Arrows: thin to ≥ 14 px apart, newest kept.
  const arrows: typeof obs = [];
  for (let i = obs.length - 1; i >= 0; i--) {
    const last = arrows[arrows.length - 1];
    if (!last || x(last.t) - x(obs[i].t) >= 14) arrows.push(obs[i]);
  }

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`Observed wind, last ${hours} hours`} data-station-chart>
      {/* grid + y labels */}
      {yTicks.map(v => (
        <g key={v}>
          <line x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          <text x={PAD_L - 3} y={y(v) + 3} textAnchor="end" fontSize={9} fill="rgba(255,255,255,0.6)">{Math.round(v)}</text>
        </g>
      ))}
      <text x={PAD_L + 3} y={PLOT_T + 8} fontSize={9} fill="rgba(255,255,255,0.6)">{unit}</text>
      {/* hour ticks */}
      {ticks.map((t, i) => (
        <g key={t}>
          <line x1={x(t)} x2={x(t)} y1={PLOT_B} y2={PLOT_B + 3} stroke="rgba(255,255,255,0.3)" strokeWidth={1} />
          {i % labelEvery === (ticks.length - 1) % labelEvery && (
            <text x={Math.min(Math.max(x(t), PAD_L + 10), W - 14)} y={TICK_Y} textAnchor="middle" fontSize={9} fill="rgba(255,255,255,0.6)">{fmtHourTick(t, use24h)}</text>
          )}
        </g>
      ))}
      {/* gust band, speed line */}
      {runs.map((r, i) => {
        const upper = r.map(p => xy(p.t, Math.max(p.speedKt, p.gustKt ?? p.speedKt) * f));
        const lower = [...r].reverse().map(p => xy(p.t, p.speedKt * f));
        return (
          <g key={i}>
            {r.length > 1 && <polygon points={[...upper, ...lower].join(' ')} fill={SPEED_COLOR} fillOpacity={0.22} />}
            {r.length > 1
              ? <polyline points={r.map(p => xy(p.t, p.speedKt * f)).join(' ')} fill="none" stroke={SPEED_COLOR} strokeWidth={1.75} strokeLinejoin="round" />
              : <circle cx={x(r[0].t)} cy={y(r[0].speedKt * f)} r={1.75} fill={SPEED_COLOR} />}
          </g>
        );
      })}
      {/* forecast */}
      {fcstRuns.filter(r => r.length > 1).map((r, i) => (
        <polyline key={i} points={r.map(p => xy(p.t, p.v)).join(' ')} fill="none" stroke={FCST_COLOR} strokeWidth={1.25} strokeDasharray="2 2.5" />
      ))}
      {/* downwind arrows (point = where the wind is going, like the map boxes) */}
      {arrows.map(p => p.dirDeg == null
        ? <circle key={p.t} cx={x(p.t)} cy={ARROW_Y} r={1.5} fill="rgba(255,255,255,0.5)" />
        : <path key={p.t} d="M0,-5 L3.5,3.5 L0,1.5 L-3.5,3.5 Z" fill="rgba(255,255,255,0.75)" transform={`translate(${x(p.t).toFixed(1)},${ARROW_Y}) rotate(${(p.dirDeg + 180) % 360})`} />)}
    </svg>
  );
}
