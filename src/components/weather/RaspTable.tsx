import type { ReactNode } from 'react';
import { ArrowDown } from 'lucide-react';
import { useUnits } from '@/hooks/useUnits';
import { metresToFeet } from '@/lib/units';
import { windAtAltitude } from '@/lib/spline';
import { effectiveWstar } from '../windmap/thermalInterpolation';
import { WSTAR_BANDS, raspDaySlots, type RaspHour } from './RaspChart';

/**
 * Hour-by-hour numbers under the RASP chart (same columns as the chart):
 * soarable height, thermal strength, cloud, surface temp/dewpoint, surface wind
 * and gusts, and the wind at the soarable height.
 *
 * Soarable height = the BL top, capped by the Cu base when cumulus forms below
 * it (you can't climb into cloud). It shows "–" when thermals are below the
 * weakest W* grade, so dawn/dusk hours don't show a usable-looking number.
 */
export function RaspTable({ hours, launchElevation }: { hours: RaspHour[]; launchElevation: number | null }) {
  const { units } = useUnits();
  const slots = raspDaySlots(hours);
  if (slots.length < 2) return null;

  const ground = launchElevation ?? 0;
  const altUnit = units === 'imperial' ? 'ft' : 'm';
  const alt = (m: number) => Math.round(units === 'imperial' ? metresToFeet(m) : m);
  const minUsable = WSTAR_BANDS[0].min;

  const cols = slots.map(s => {
    const w = s.ceilingAmsl !== null && s.ceilingAmsl > ground ? effectiveWstar(s.wstar ?? undefined, s.cape ?? 0) : 0;
    const cuBase = s.ccl !== null ? s.ccl + ground : null;
    const top = s.ceilingAmsl !== null && w >= minUsable
      ? (cuBase !== null && cuBase < s.ceilingAmsl ? cuBase : s.ceilingAmsl)
      : null;
    const band = [...WSTAR_BANDS].reverse().find(b => w >= b.min) ?? null;
    return {
      time: s.time,
      soarMsl: top,
      soarAgl: top !== null ? Math.max(0, top - ground) : null,
      cuCapped: top !== null && cuBase !== null && cuBase < (s.ceilingAmsl ?? 0),
      w,
      band,
      cloud: s.cloud,
      temp: s.temp ?? null,
      dew: s.dewPoint ?? null,
      wind: s.windSpeed ?? null,
      dir: s.windDir ?? null,
      gust: s.windGust ?? null,
      topWind: top !== null ? windAtAltitude(s.levels, top, 250) : null,
    };
  });

  const dash = <span className="text-slate-300">–</span>;
  const hourLabel = (iso: string) => { const h = parseInt(iso.slice(11, 13), 10); return `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`; };
  const arrow = (dir: number | null) => dir === null ? null : (
    <ArrowDown className="w-3 h-3 mx-auto text-slate-600" style={{ transform: `rotate(${dir}deg)` }} aria-label={`from ${Math.round(dir)}°`} />
  );

  const rows: { label: ReactNode; cell: (c: typeof cols[number]) => ReactNode; bg?: (c: typeof cols[number]) => string | undefined }[] = [
    {
      label: <>Soarable height <span className="text-slate-400">AMSL ({altUnit})</span></>,
      cell: c => c.soarMsl !== null ? <span className={c.cuCapped ? 'text-sky-600' : undefined}>{alt(c.soarMsl)}</span> : dash,
    },
    {
      label: <>Soarable height <span className="text-slate-400">AGL ({altUnit})</span></>,
      cell: c => c.soarAgl !== null ? alt(c.soarAgl) : dash,
    },
    {
      label: <>Thermal strength <span className="text-slate-400">W* (m/s)</span></>,
      cell: c => c.w >= minUsable ? c.w.toFixed(1) : dash,
      bg: c => c.band ? `${c.band.color}33` : undefined,
    },
    { label: <>Cloud cover <span className="text-slate-400">(%)</span></>, cell: c => c.cloud !== null ? Math.round(c.cloud) : dash },
    { label: <>Surface temp <span className="text-slate-400">(°C)</span></>, cell: c => c.temp !== null ? <span className="text-red-500">{Math.round(c.temp)}</span> : dash },
    { label: <>Surface dewpoint <span className="text-slate-400">(°C)</span></>, cell: c => c.dew !== null ? <span className="text-sky-600">{Math.round(c.dew)}</span> : dash },
    {
      label: <>Surface wind <span className="text-slate-400">(kt)</span></>,
      cell: c => c.wind !== null ? <div className="leading-tight">{arrow(c.dir)}{Math.round(c.wind)}{c.dir !== null && <div className="text-[9px] text-slate-400">{Math.round(c.dir)}°</div>}</div> : dash,
    },
    { label: <>Gusts <span className="text-slate-400">(kt)</span></>, cell: c => c.gust !== null ? <span className="font-semibold">{Math.round(c.gust)}</span> : dash },
    {
      label: <>Wind at soarable height <span className="text-slate-400">(kt)</span></>,
      cell: c => c.topWind ? <div className="leading-tight">{arrow(c.topWind.dir)}{Math.round(c.topWind.spd)}<div className="text-[9px] text-slate-400">{Math.round(c.topWind.dir)}°</div></div> : dash,
    },
  ];

  return (
    <div className="mt-3">
      <div className="overflow-x-auto rounded-lg border border-black/10">
        <table className="w-full border-collapse text-[11px] tabular-nums">
          <thead>
            <tr className="bg-slate-50">
              <th className="sticky left-0 z-10 bg-slate-50 text-left font-semibold text-slate-600 px-2 py-1.5 border-b border-black/10 min-w-[128px]">Time</th>
              {cols.map(c => (
                <th key={c.time} className="font-semibold text-slate-600 px-1.5 py-1.5 border-b border-l border-black/5 text-center whitespace-nowrap">{hourLabel(c.time)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-black/5 last:border-b-0">
                <th className="sticky left-0 z-10 bg-white text-left font-medium text-slate-700 px-2 py-1.5 leading-tight">{r.label}</th>
                {cols.map(c => (
                  <td key={c.time} className="text-center text-slate-800 px-1.5 py-1.5 border-l border-black/5 min-w-[40px]" style={{ background: r.bg?.(c) }}>
                    {r.cell(c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
        Soarable height is the BL top, or the Cu base when cloud forms lower (shown in blue). “–” means thermals too weak to use.
        Arrows point the way the wind blows.
      </p>
    </div>
  );
}
