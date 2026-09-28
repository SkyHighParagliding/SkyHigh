import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Wind } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { RaspChart, WSTAR_BANDS, type RaspHour } from './RaspChart';
import { ScaleToggle } from './ScaleToggle';
import type { MeteogramHour } from './SiteMeteogramChart';
import type { PointSounding } from './SkewTChart';

interface RaspModalProps {
  lat: number;
  lon: number;
  groundAmsl?: number;
  /** true = full profile altitude scale; false = PG working band. */
  fullScale?: boolean;
  /** Flip the shared PG/Full scale — enables the on-display toggle. */
  onToggleScale?: () => void;
  onClose: () => void;
}

function numSetting(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? n : d;
}

/**
 * RASP-style time × altitude chart for a tapped point: wind barbs at every level,
 * a W* thermal-strength heatmap, BL Top / Cu Base lines and cloud shading. Joins
 * the meteogram (BL Top / W* / cloud per hour) with the pressure-level sounding
 * (winds aloft) — the same two endpoints the Chart and SkewT already use.
 */
export function RaspModal({ lat, lon, groundAmsl, fullScale = false, onToggleScale, onClose }: RaspModalProps) {
  const { settings } = useSettings();
  const [hours, setHours] = useState<RaspHour[] | null>(null);
  const [launch, setLaunch] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null); setHours(null);
    const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (typeof groundAmsl === 'number') q.set('ground', String(Math.round(groundAmsl)));
    const qs = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    Promise.all([
      fetch(`/api/weather/meteogram/point?${q}`).then(r => r.ok ? r.json() : Promise.reject(`meteogram ${r.status}`)),
      fetch(`/api/weather/sounding/point?${qs}`).then(r => r.ok ? r.json() : null).catch(() => null),
    ])
      .then(([mg, snd]: [{ hours: MeteogramHour[]; launchElevation: number | null }, PointSounding | null]) => {
        const byKey = new Map<string, PointSounding['hours'][number]>();
        snd?.hours?.forEach(h => byKey.set(h.time.slice(0, 13), h));
        const joined: RaspHour[] = mg.hours.map(h => ({
          time: h.time,
          ceilingAmsl: h.ceilingAmsl,
          ccl: h.ccl,
          wstar: h.wstar,
          cape: h.cape,
          cloud: h.cloud,
          cloudLow: h.cloudLow,
          levels: byKey.get(h.time.slice(0, 13))?.levels ?? [],
        }));
        setHours(joined);
        setLaunch(mg.launchElevation);
        setLoading(false);
      })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [lat, lon, groundAmsl]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[10001] h-[100dvh] w-screen bg-white flex flex-col" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/10 shrink-0">
        <div className="flex items-center gap-2">
          <Wind className="w-4 h-4 text-amber-500" />
          <span className="text-[13px] font-semibold text-ink">RASP · winds &amp; thermals aloft</span>
        </div>
        <div className="flex items-center gap-1.5">
          {onToggleScale && <ScaleToggle fullScale={fullScale} onToggle={onToggleScale} />}
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-ink" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500 mb-1" />
            <span className="text-xs text-gray-500">Loading RASP…</span>
          </div>
        ) : error || !hours ? (
          <div className="h-full flex items-center justify-center"><span className="text-xs text-red-500">Failed to load RASP</span></div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <RaspChart
              hours={hours}
              launchElevation={launch}
              fullScale={fullScale}
              overcastPct={numSetting(settings.thermalOvercastOnsetPct, 70)}
            />
            <div className="mt-3 flex flex-col items-center gap-2">
              <div className="flex items-center gap-4 text-[10px] text-slate-500 flex-wrap justify-center">
                <span className="flex items-center">
                  <span className="font-semibold uppercase tracking-wide text-slate-600 mr-2">Thermal W* (m/s)</span>
                  {WSTAR_BANDS.map((b, i) => (
                    <span key={b.min} className="flex items-center" title={b.label}>
                      <span className="inline-block w-7 h-3" style={{ background: b.color }} />
                      <span className="mx-1 tabular-nums">{b.min}{i === WSTAR_BANDS.length - 1 ? '+' : ''}</span>
                    </span>
                  ))}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-4 h-2.5 rounded-sm" style={{ background: '#94a3b8', opacity: 0.5 }} />
                  cloud cover
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground text-center max-w-md">
                Wind barbs show direction &amp; speed at each level (half-barb 5&nbsp;kt, full 10&nbsp;kt, pennant 50&nbsp;kt).
                Toggle PG / Full altitude scale up top.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
