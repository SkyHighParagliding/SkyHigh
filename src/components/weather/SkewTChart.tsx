import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnits } from '@/hooks/useUnits';
import { getCompassDirection } from '@/components/windMapTypes';
import { lclPressureTemp, liftParcel, dryLiftParcel } from '../../../shared/parcel';

// ── Sounding types (mirror server/grid/pointSounding.ts) ────────────────────
export interface SoundingLevel { p: number; zAmsl: number; t: number; td: number; windSpd: number; windDir: number; }
export interface SoundingHour {
  time: string;
  surface: { pressure: number; t: number; td: number; windSpd: number; windDir: number; cape: number | null; cloud: number | null; weatherCode: number | null; };
  levels: SoundingLevel[];
}
export interface PointSounding { lat: number; lon: number; times: string[]; hours: SoundingHour[]; source: string; }

// ── Geometry ────────────────────────────────────────────────────────────────
const PAD_L = 46, PAD_R = 34, PAD_T = 10, PAD_B = 26;
const SVG_H = 440;
const P_TOP = 400;            // hPa at the top of the plot
const T_MIN = -45, T_MAX = 45; // °C domain at the bottom reference
const SKEW = 0.85;            // isotherm skew (px horizontal per px vertical)
const M_TO_FT = 3.280839895;

interface ProfilePt { p: number; t: number; td: number; z: number; ws: number; wd: number; }

/** Linear interpolation of a profile field at pressure p (log-p), pts descending in p. */
function interpAt(pts: ProfilePt[], p: number, key: 'z' | 't' | 'td' | 'ws' | 'wd'): number {
  if (p >= pts[0].p) return pts[0][key];
  if (p <= pts[pts.length - 1].p) return pts[pts.length - 1][key];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (p <= a.p && p >= b.p) {
      const f = (Math.log(a.p) - Math.log(p)) / (Math.log(a.p) - Math.log(b.p));
      return a[key] + f * (b[key] - a[key]);
    }
  }
  return pts[pts.length - 1][key];
}

export function SkewTChart({ hour, groundAmsl, onReadout }: {
  hour: SoundingHour;
  groundAmsl?: number;
  /** Emits the current derived glider figures for the surrounding data box. */
  onReadout?: (r: SkewTReadout) => void;
}) {
  const { units } = useUnits();
  const [svgW, setSvgW] = useState(360);
  const svgRef = useRef<SVGSVGElement>(null);
  const [triggerT, setTriggerT] = useState<number | null>(null); // null = follow forecast T2m
  const [cursorP, setCursorP] = useState<number | null>(null);
  const drag = useRef<null | 'trigger' | 'cursor'>(null);

  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const ro = new ResizeObserver(e => setSvgW(e[0].contentRect.width));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // Reset the dragged trigger temp when the hour changes.
  useEffect(() => { setTriggerT(null); setCursorP(null); }, [hour.time]);

  const sfc = hour.surface;
  const pBot = sfc.pressure;
  const ground = groundAmsl ?? 0;

  // Profile points, surface-first (descending pressure).
  const pts = useMemo<ProfilePt[]>(() => {
    const arr: ProfilePt[] = [{ p: sfc.pressure, t: sfc.t, td: sfc.td, z: ground, ws: sfc.windSpd, wd: sfc.windDir }];
    for (const l of hour.levels) if (l.p < sfc.pressure) arr.push({ p: l.p, t: l.t, td: l.td, z: l.zAmsl, ws: l.windSpd, wd: l.windDir });
    return arr;
  }, [hour, ground, sfc.pressure, sfc.t, sfc.td, sfc.windSpd, sfc.windDir]);

  const PLOT_W = svgW - PAD_L - PAD_R;
  const PLOT_H = SVG_H - PAD_T - PAD_B;
  const plotBot = PAD_T + PLOT_H;

  const yOf = (p: number) => PAD_T + (Math.log(p) - Math.log(P_TOP)) / (Math.log(pBot) - Math.log(P_TOP)) * PLOT_H;
  const xOf = (t: number, p: number) => PAD_L + ((t - T_MIN) / (T_MAX - T_MIN)) * PLOT_W + SKEW * (yOf(p) - PAD_T);
  const tFromX = (x: number, p: number) => T_MIN + ((x - PAD_L - SKEW * (yOf(p) - PAD_T)) / PLOT_W) * (T_MAX - T_MIN);
  const pFromY = (y: number) => Math.exp(Math.log(P_TOP) + (y - PAD_T) / PLOT_H * (Math.log(pBot) - Math.log(P_TOP)));

  const trigT = triggerT ?? sfc.t;

  // Parcel ascent + derived glider figures.
  const derived = useMemo(() => {
    const { pLcl } = lclPressureTemp(pBot, trigT, sfc.td);
    const lclZ = interpAt(pts, Math.min(pLcl, pBot), 'z');

    // Thermal top: first pressure above the surface where the parcel (dry→moist)
    // is no longer warmer than the environment.
    let topP = P_TOP, topZ = interpAt(pts, P_TOP, 'z');
    let prevP = pBot, prevDiff = trigT - sfc.t; // >0 at surface (parcel warmer)
    for (let p = pBot - 5; p >= P_TOP; p -= 5) {
      const par = liftParcel(pBot, trigT, sfc.td, p);
      const env = interpAt(pts, p, 't');
      const diff = par - env;
      if (diff <= 0) {
        const f = prevDiff / (prevDiff - diff);
        topP = prevP + f * (p - prevP);
        topZ = interpAt(pts, topP, 'z');
        break;
      }
      prevP = p; prevDiff = diff;
    }
    const cloud = pLcl > topP; // LCL below the top → cumulus; else "blue"
    return {
      pLcl, lclZ, topP, topZ, cloud,
      topWind: { s: interpAt(pts, topP, 'ws'), d: interpAt(pts, topP, 'wd') },
      baseWind: { s: interpAt(pts, pLcl, 'ws'), d: interpAt(pts, pLcl, 'wd') },
    };
  }, [pts, pBot, trigT, sfc.t, sfc.td]);

  // Emit the glider readout (parent renders the data box).
  useEffect(() => {
    onReadout?.({
      triggerT: trigT, forecastT: sfc.t, isTriggerCustom: triggerT !== null,
      thermalTopAmsl: derived.topZ, thermalTopAgl: derived.topZ - ground,
      cloud: derived.cloud, cloudbaseAmsl: derived.cloud ? derived.lclZ : null, cloudbaseAgl: derived.cloud ? derived.lclZ - ground : null,
      topWind: derived.topWind, baseWind: derived.baseWind,
      cape: sfc.cape,
      cursor: cursorP != null ? {
        p: cursorP, zAmsl: interpAt(pts, cursorP, 'z'), zAgl: interpAt(pts, cursorP, 'z') - ground,
        t: interpAt(pts, cursorP, 't'), td: interpAt(pts, cursorP, 'td'),
        ws: interpAt(pts, cursorP, 'ws'), wd: interpAt(pts, cursorP, 'wd'),
      } : null,
    });
  }, [derived, cursorP, trigT, sfc.t, sfc.cape, ground, triggerT, pts, onReadout]);

  // Parcel polyline (surface → top of plot).
  const parcelPath = useMemo(() => {
    const seg: string[] = [];
    for (let p = pBot; p >= P_TOP; p -= 10) {
      const t = liftParcel(pBot, trigT, sfc.td, p);
      seg.push(`${xOf(t, p).toFixed(1)},${yOf(p).toFixed(1)}`);
    }
    return 'M' + seg.join(' L');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pBot, trigT, sfc.td, svgW]);

  const line = (key: 't' | 'td') => 'M' + pts.map(pt => `${xOf(pt[key], pt.p).toFixed(1)},${yOf(pt.p).toFixed(1)}`).join(' L');

  // Pointer handling for the two draggable overlays.
  const onDown = (mode: 'trigger' | 'cursor') => (e: React.PointerEvent) => {
    e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = mode; move(e);
  };
  const move = (e: React.PointerEvent | { clientX: number; clientY: number }) => {
    const svg = svgRef.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = (e as any).clientX - r.left, y = (e as any).clientY - r.top;
    if (drag.current === 'trigger') {
      setTriggerT(Math.max(sfc.t - 6, Math.min(sfc.t + 20, tFromX(x, pBot))));
    } else if (drag.current === 'cursor') {
      setCursorP(Math.max(P_TOP, Math.min(pBot, pFromY(Math.max(PAD_T, Math.min(plotBot, y))))));
    }
  };
  const onUp = () => { drag.current = null; };

  const fmtAlt = (m: number) => units === 'imperial' ? `${Math.round(m * M_TO_FT).toLocaleString()}ft` : `${Math.round(m).toLocaleString()}m`;

  const isobars = [1000, 900, 800, 700, 600, 500, 400].filter(p => p <= pBot && p >= P_TOP);
  const isotherms: number[] = []; for (let t = T_MIN; t <= T_MAX; t += 10) isotherms.push(t);

  return (
    <svg ref={svgRef} width="100%" height={SVG_H} viewBox={`0 0 ${svgW} ${SVG_H}`}
      style={{ touchAction: 'none' }}
      onPointerMove={e => { if (drag.current) move(e); }} onPointerUp={onUp} onPointerLeave={onUp}>
      {/* Skewed isotherms (faint) */}
      {isotherms.map(t => (
        <line key={`it${t}`} x1={xOf(t, pBot)} y1={yOf(pBot)} x2={xOf(t, P_TOP)} y2={yOf(P_TOP)}
          stroke={t === 0 ? '#94a3b8' : '#e5e7eb'} strokeWidth={t === 0 ? 1 : 0.6} />
      ))}
      {/* Isobars — left axis labelled by altitude AGL (what pilots read); the
          faint hPa value sits just inside so the log-pressure scale is legible. */}
      {isobars.map(p => (
        <g key={`ib${p}`}>
          <line x1={PAD_L} y1={yOf(p)} x2={PAD_L + PLOT_W} y2={yOf(p)} stroke="#eceff3" strokeWidth={0.8} />
          <text x={PAD_L - 3} y={yOf(p) + 3} textAnchor="end" style={{ fontSize: 8, fill: '#64748b' }}>{fmtAlt(interpAt(pts, p, 'z') - ground)}</text>
          <text x={PAD_L + 2} y={yOf(p) - 2} style={{ fontSize: 7, fill: '#cbd5e1' }}>{p}</text>
        </g>
      ))}
      {/* Bottom temperature ticks */}
      {isotherms.filter(t => t % 20 === 0).map(t => (
        <text key={`tt${t}`} x={xOf(t, pBot)} y={plotBot + 12} textAnchor="middle" style={{ fontSize: 8, fill: '#94a3b8' }}>{t}°</text>
      ))}

      {/* Environment dewpoint + temperature */}
      <path d={line('td')} fill="none" stroke="#2f9e44" strokeWidth={2} />
      <path d={line('t')} fill="none" stroke="#e03131" strokeWidth={2} />
      {/* Parcel ascent */}
      <path d={parcelPath} fill="none" stroke="#f08c00" strokeWidth={1.6} strokeDasharray="4,3" />

      {/* Wind along the right margin: a stem pointing into the wind (FROM), the
          speed in knots beside it. Level points only (the surface wind is in the
          data box) so the marks don't pile up near the ground. */}
      {hour.levels.filter(l => l.p < sfc.pressure).map((l, i) => (
        <g key={`w${i}`} transform={`translate(${PAD_L + PLOT_W + 12},${yOf(l.p)})`}>
          <line x1={0} y1={0} x2={0} y2={-8} stroke="#475569" strokeWidth={1} transform={`rotate(${l.windDir})`} />
          <circle r={1.2} fill="#475569" />
          <text x={9} y={3} style={{ fontSize: 7, fill: '#64748b' }}>{Math.round(l.windSpd)}</text>
        </g>
      ))}

      {/* Cloudbase (LCL) + thermal-top markers */}
      {derived.cloud && (
        <g>
          <line x1={PAD_L} y1={yOf(derived.pLcl)} x2={PAD_L + PLOT_W} y2={yOf(derived.pLcl)} stroke="#1971c2" strokeWidth={1} strokeDasharray="2,2" />
          <text x={PAD_L + 3} y={yOf(derived.pLcl) - 2} style={{ fontSize: 8, fill: '#1971c2', fontWeight: 700 }}>Cloudbase</text>
        </g>
      )}
      <g>
        <line x1={PAD_L} y1={yOf(derived.topP)} x2={PAD_L + PLOT_W} y2={yOf(derived.topP)} stroke="#f08c00" strokeWidth={1} strokeDasharray="5,3" />
        <text x={PAD_L + PLOT_W - 3} y={yOf(derived.topP) - 2} textAnchor="end" style={{ fontSize: 8, fill: '#e8590c', fontWeight: 700 }}>Thermal top</text>
      </g>

      {/* Drag cursor (horizontal) */}
      {cursorP != null && (
        <line x1={PAD_L} y1={yOf(cursorP)} x2={PAD_L + PLOT_W} y2={yOf(cursorP)} stroke="#0b7285" strokeWidth={1} />
      )}
      {/* Interaction surface for the cursor (whole plot) */}
      <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} fill="transparent" onPointerDown={onDown('cursor')} style={{ cursor: 'ns-resize' }} />

      {/* Draggable trigger-temperature handle at the surface */}
      <g transform={`translate(${xOf(trigT, pBot)},${yOf(pBot)})`} onPointerDown={onDown('trigger')} style={{ cursor: 'ew-resize' }}>
        <circle r={7} fill="#f08c00" stroke="#fff" strokeWidth={2} />
        <text x={0} y={20} textAnchor="middle" style={{ fontSize: 9, fill: '#e8590c', fontWeight: 700 }}>{trigT.toFixed(1)}°</text>
      </g>
    </svg>
  );
}

export interface SkewTReadout {
  triggerT: number; forecastT: number; isTriggerCustom: boolean;
  thermalTopAmsl: number; thermalTopAgl: number;
  cloud: boolean; cloudbaseAmsl: number | null; cloudbaseAgl: number | null;
  topWind: { s: number; d: number }; baseWind: { s: number; d: number };
  cape: number | null;
  cursor: null | { p: number; zAmsl: number; zAgl: number; t: number; td: number; ws: number; wd: number };
}

export { getCompassDirection };
