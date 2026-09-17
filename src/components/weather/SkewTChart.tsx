import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnits } from '@/hooks/useUnits';
import { getCompassDirection } from '@/components/windMapTypes';
import { lclPressureTemp, liftParcel } from '../../../shared/parcel';

// ── Sounding types (mirror server/grid/pointSounding.ts) ────────────────────
export interface SoundingLevel { p: number; zAmsl: number; t: number; td: number; windSpd: number; windDir: number; }
export interface SoundingHour {
  time: string;
  surface: { pressure: number; t: number; td: number; windSpd: number; windDir: number; cape: number | null; cloud: number | null; weatherCode: number | null; };
  levels: SoundingLevel[];
}
export interface PointSounding { lat: number; lon: number; times: string[]; hours: SoundingHour[]; source: string; }

// ── Geometry ────────────────────────────────────────────────────────────────
const PAD_L = 58, PAD_R = 34, PAD_T = 12, PAD_B = 26;
const SVG_H = 440;
const P_SCAN_TOP = 400;        // parcel/thermal-top search goes to here regardless of the view
const T_MIN = -30, T_MAX = 40; // °C domain
const SKEW_FRAC = 0.5;         // isotherms lean this fraction of the plot width over the full height
const M_TO_FT = 3.280839895;

interface ProfilePt { p: number; t: number; td: number; z: number; ws: number; wd: number; }

/** Linear (log-p) interpolation of a profile field, pts descending in p. */
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
/** Pressure at an altitude (m AMSL), interpolating the profile's z↔p. */
function pAtZ(pts: ProfilePt[], z: number): number {
  if (z <= pts[0].z) return pts[0].p;
  if (z >= pts[pts.length - 1].z) return pts[pts.length - 1].p;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (z >= a.z && z <= b.z) {
      const f = (z - a.z) / (b.z - a.z);
      return Math.exp(Math.log(a.p) + f * (Math.log(b.p) - Math.log(a.p)));
    }
  }
  return pts[pts.length - 1].p;
}

export function SkewTChart({ hour, groundAmsl, onReadout }: {
  hour: SoundingHour;
  groundAmsl?: number;
  onReadout?: (r: SkewTReadout) => void;
}) {
  const { units, toggleUnits } = useUnits();
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
  useEffect(() => { setTriggerT(null); setCursorP(null); }, [hour.time]);

  const sfc = hour.surface;
  const pBot = sfc.pressure;
  const ground = groundAmsl ?? 0;

  const pts = useMemo<ProfilePt[]>(() => {
    const arr: ProfilePt[] = [{ p: sfc.pressure, t: sfc.t, td: sfc.td, z: ground, ws: sfc.windSpd, wd: sfc.windDir }];
    for (const l of hour.levels) if (l.p < sfc.pressure) arr.push({ p: l.p, t: l.t, td: l.td, z: l.zAmsl, ws: l.windSpd, wd: l.windDir });
    return arr;
  }, [hour, ground, sfc.pressure, sfc.t, sfc.td, sfc.windSpd, sfc.windDir]);

  const trigT = triggerT ?? sfc.t;

  /** Parcel ascent from the surface at temperature `trig` → thermal top + LCL. */
  const scanTop = (trig: number) => {
    const { pLcl } = lclPressureTemp(pBot, trig, sfc.td);
    let topP = P_SCAN_TOP, topZ = interpAt(pts, P_SCAN_TOP, 'z');
    let prevP = pBot, prevDiff = trig - sfc.t;
    for (let p = pBot - 5; p >= P_SCAN_TOP; p -= 5) {
      const par = liftParcel(pBot, trig, sfc.td, p);
      const diff = par - interpAt(pts, p, 't');
      if (diff <= 0) {
        const f = prevDiff / (prevDiff - diff);
        topP = prevP + f * (p - prevP);
        topZ = interpAt(pts, topP, 'z');
        break;
      }
      prevP = p; prevDiff = diff;
    }
    return { pLcl, lclZ: interpAt(pts, Math.min(pLcl, pBot), 'z'), topP, topZ, cloud: pLcl > topP };
  };

  const derived = useMemo(() => scanTop(trigT), [pts, pBot, trigT, sfc.t, sfc.td]); // eslint-disable-line react-hooks/exhaustive-deps
  const forecast = useMemo(() => scanTop(sfc.t), [pts, pBot, sfc.t, sfc.td]);        // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the view on the flyable band: surface → a bit above the forecast top /
  // cloudbase, capped near a paraglider's ceiling. Stable while dragging.
  const maxLevelZ = pts[pts.length - 1].z;
  const pTop = useMemo(() => {
    // Anchor the view to the paraglider's world (~11,500 ft AMSL); only extend
    // above that if the cloudbase / thermal top is higher (rare, above the ceiling
    // anyway). Never collapses on weak/night soundings.
    const axisTopZ = Math.min(maxLevelZ, Math.max(3505, forecast.topZ + 300, forecast.cloud ? forecast.lclZ + 300 : 0));
    return Math.max(P_SCAN_TOP, Math.min(pBot - 20, pAtZ(pts, axisTopZ)));
  }, [pts, forecast, maxLevelZ, pBot]);

  const PLOT_W = svgW - PAD_L - PAD_R;
  const PLOT_H = SVG_H - PAD_T - PAD_B;
  const plotBot = PAD_T + PLOT_H;

  const skewPx = SKEW_FRAC * PLOT_W;
  const baseW = PLOT_W - skewPx; // temperature axis occupies the un-skewed remainder
  const yOf = (p: number) => PAD_T + (Math.log(p) - Math.log(pTop)) / (Math.log(pBot) - Math.log(pTop)) * PLOT_H;
  const xOf = (t: number, p: number) => PAD_L + ((t - T_MIN) / (T_MAX - T_MIN)) * baseW + skewPx * ((yOf(p) - PAD_T) / PLOT_H);
  const tFromX = (x: number, p: number) => T_MIN + ((x - PAD_L - skewPx * ((yOf(p) - PAD_T) / PLOT_H)) / baseW) * (T_MAX - T_MIN);
  const pFromY = (y: number) => Math.exp(Math.log(pTop) + (y - PAD_T) / PLOT_H * (Math.log(pBot) - Math.log(pTop)));

  useEffect(() => {
    onReadout?.({
      triggerT: trigT, forecastT: sfc.t, isTriggerCustom: triggerT !== null,
      thermalTopAmsl: derived.topZ, thermalTopAgl: derived.topZ - ground,
      cloud: derived.cloud, cloudbaseAmsl: derived.cloud ? derived.lclZ : null, cloudbaseAgl: derived.cloud ? derived.lclZ - ground : null,
      topWind: { s: interpAt(pts, derived.topP, 'ws'), d: interpAt(pts, derived.topP, 'wd') },
      baseWind: { s: interpAt(pts, derived.pLcl, 'ws'), d: interpAt(pts, derived.pLcl, 'wd') },
      cape: sfc.cape,
      cursor: cursorP != null ? {
        p: cursorP, zAmsl: interpAt(pts, cursorP, 'z'), zAgl: interpAt(pts, cursorP, 'z') - ground,
        t: interpAt(pts, cursorP, 't'), td: interpAt(pts, cursorP, 'td'),
        ws: interpAt(pts, cursorP, 'ws'), wd: interpAt(pts, cursorP, 'wd'),
      } : null,
    });
  }, [derived, cursorP, trigT, sfc.t, sfc.cape, ground, triggerT, pts, onReadout]);

  // Parcel polyline, clipped to the visible band.
  const parcelPath = useMemo(() => {
    const seg: string[] = [];
    for (let p = pBot; p >= pTop; p -= 6) seg.push(`${xOf(p === pBot ? trigT : liftParcel(pBot, trigT, sfc.td, p), p).toFixed(1)},${yOf(p).toFixed(1)}`);
    return 'M' + seg.join(' L');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pBot, pTop, trigT, sfc.td, svgW]);

  const line = (key: 't' | 'td') => 'M' + pts.map(pt => `${xOf(pt[key], pt.p).toFixed(1)},${yOf(pt.p).toFixed(1)}`).join(' L');

  const onDown = (mode: 'trigger' | 'cursor') => (e: React.PointerEvent) => {
    e.stopPropagation(); (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = mode; move(e);
  };
  const move = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current; if (!svg) return;
    const r = svg.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (drag.current === 'trigger') setTriggerT(Math.max(sfc.t - 6, Math.min(sfc.t + 22, tFromX(x, pBot))));
    else if (drag.current === 'cursor') setCursorP(Math.max(pTop, Math.min(pBot, pFromY(Math.max(PAD_T, Math.min(plotBot, y))))));
  };
  const onUp = () => { drag.current = null; };

  const fmtAlt = (m: number) => units === 'imperial' ? `${Math.round(m * M_TO_FT).toLocaleString()}ft` : `${Math.round(m).toLocaleString()}m`;

  // Round-number altitude gridlines within the band (AGL), every 2000 ft / 500 m.
  const stepM = units === 'imperial' ? 2000 / M_TO_FT : 500;
  const gridAlts: number[] = [];
  for (let z = Math.ceil(ground / stepM) * stepM; z <= interpAt(pts, pTop, 'z'); z += stepM) gridAlts.push(z);
  const isotherms: number[] = []; for (let t = T_MIN; t <= T_MAX; t += 10) isotherms.push(t);
  const clipId = 'skewt-clip';

  return (
    <svg ref={svgRef} width="100%" height={SVG_H} viewBox={`0 0 ${svgW} ${SVG_H}`}
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onPointerMove={e => { if (drag.current) move(e); }} onPointerUp={onUp} onPointerLeave={onUp}>
      <defs><clipPath id={clipId}><rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} /></clipPath></defs>

      {/* Skewed isotherms (faint), clipped to the plot */}
      <g clipPath={`url(#${clipId})`}>
        {isotherms.map(t => (
          <line key={`it${t}`} x1={xOf(t, pBot)} y1={yOf(pBot)} x2={xOf(t, pTop)} y2={yOf(pTop)}
            stroke={t === 0 ? '#94a3b8' : '#eef1f5'} strokeWidth={t === 0 ? 1 : 0.6} />
        ))}
      </g>

      {/* Altitude gridlines + labels (AGL primary; AMSL small) */}
      {gridAlts.map(z => {
        const p = pAtZ(pts, z);
        return (
          <g key={`g${Math.round(z)}`}>
            <line x1={PAD_L} y1={yOf(p)} x2={PAD_L + PLOT_W} y2={yOf(p)} stroke="#eceff3" strokeWidth={0.8} />
            <text x={PAD_L - 3} y={yOf(p) + 3} textAnchor="end" style={{ fontSize: 8.5, fill: '#334155', fontWeight: 600 }}>{fmtAlt(z - ground)} AGL</text>
            <text x={PAD_L - 3} y={yOf(p) + 12} textAnchor="end" style={{ fontSize: 6.5, fill: '#a3adba' }}>{fmtAlt(z)} AMSL</text>
          </g>
        );
      })}
      {/* Tap the altitude gutter to flip m ⇄ ft (consistent with the rest of the app) */}
      <rect x={0} y={PAD_T} width={PAD_L} height={PLOT_H} fill="transparent"
        onPointerDown={e => { e.stopPropagation(); toggleUnits(); }} style={{ cursor: 'pointer' }}>
        <title>Tap to switch {units === 'imperial' ? 'to metres' : 'to feet'}</title>
      </rect>
      {/* Bottom temperature ticks */}
      {isotherms.filter(t => t % 10 === 0 && t >= T_MIN && t <= T_MAX).map(t => {
        const x = xOf(t, pBot);
        return x > PAD_L && x < PAD_L + PLOT_W ? <text key={`tt${t}`} x={x} y={plotBot + 12} textAnchor="middle" style={{ fontSize: 8, fill: '#94a3b8' }}>{t}°</text> : null;
      })}

      <g clipPath={`url(#${clipId})`}>
        {/* Cloudbase (LCL) + thermal-top bands */}
        {derived.cloud && derived.pLcl >= pTop && (
          <line x1={PAD_L} y1={yOf(derived.pLcl)} x2={PAD_L + PLOT_W} y2={yOf(derived.pLcl)} stroke="#1971c2" strokeWidth={1.2} strokeDasharray="2,2" />
        )}
        <line x1={PAD_L} y1={yOf(Math.max(derived.topP, pTop))} x2={PAD_L + PLOT_W} y2={yOf(Math.max(derived.topP, pTop))} stroke="#f08c00" strokeWidth={1.2} strokeDasharray="5,3" />
        {/* Environment dewpoint + temperature, parcel ascent */}
        <path d={line('td')} fill="none" stroke="#2f9e44" strokeWidth={2} />
        <path d={line('t')} fill="none" stroke="#e03131" strokeWidth={2} />
        <path d={parcelPath} fill="none" stroke="#f08c00" strokeWidth={1.8} strokeDasharray="4,3" />
        {/* Drag cursor */}
        {cursorP != null && <line x1={PAD_L} y1={yOf(cursorP)} x2={PAD_L + PLOT_W} y2={yOf(cursorP)} stroke="#0b7285" strokeWidth={1} />}
      </g>
      {/* marker labels (outside clip so they aren't cut) */}
      {derived.cloud && derived.pLcl >= pTop && <text x={PAD_L + 3} y={yOf(derived.pLcl) - 2} style={{ fontSize: 8, fill: '#1971c2', fontWeight: 700 }}>Cloudbase</text>}
      <text x={PAD_L + PLOT_W - 3} y={yOf(Math.max(derived.topP, pTop)) - 2} textAnchor="end" style={{ fontSize: 8, fill: '#e8590c', fontWeight: 700 }}>Thermal top</text>

      {/* Wind (level points only) on the right margin */}
      {hour.levels.filter(l => l.p < sfc.pressure && l.p >= pTop).map((l, i) => (
        <g key={`w${i}`} transform={`translate(${PAD_L + PLOT_W + 12},${yOf(l.p)})`}>
          <line x1={0} y1={0} x2={0} y2={-8} stroke="#475569" strokeWidth={1} transform={`rotate(${l.windDir})`} />
          <circle r={1.2} fill="#475569" />
          <text x={9} y={3} style={{ fontSize: 7, fill: '#64748b' }}>{Math.round(l.windSpd)}</text>
        </g>
      ))}

      {/* Cursor interaction surface */}
      <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H - 18} fill="transparent" onPointerDown={onDown('cursor')} style={{ cursor: 'ns-resize' }} />

      {/* Draggable trigger-temperature handle at the surface — prominent + labelled */}
      <g transform={`translate(${xOf(trigT, pBot)},${yOf(pBot)})`} onPointerDown={onDown('trigger')} style={{ cursor: 'ew-resize' }}>
        <line x1={-40} y1={0} x2={40} y2={0} stroke="#f08c00" strokeWidth={0} />
        <circle r={9} fill="#f08c00" stroke="#fff" strokeWidth={2.5} />
        <path d="M-3.5 -0.5 L-6.5 2.5 L-3.5 5.5 M3.5 -0.5 L6.5 2.5 L3.5 5.5" transform="translate(0,-2.5)" stroke="#fff" strokeWidth={1.2} fill="none" />
        <rect x={-42} y={-23} width={84} height={15} rx={7.5} fill="#fff" stroke="#f08c00" strokeWidth={1} />
        <text x={0} y={-12.5} textAnchor="middle" style={{ fontSize: 9, fill: '#e8590c', fontWeight: 700 }}>{trigT.toFixed(0)}° ⟵ drag ⟶</text>
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
