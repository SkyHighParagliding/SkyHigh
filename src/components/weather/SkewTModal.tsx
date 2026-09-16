import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Info, Wind as WindIcon } from 'lucide-react';
import { useUnits } from '@/hooks/useUnits';
import { getCompassDirection } from '@/components/windMapTypes';
import { ThermalHelpModal } from '../windmap/ThermalHelpModal';
import { SkewTChart, type PointSounding, type SkewTReadout } from './SkewTChart';

interface SkewTModalProps {
  lat: number;
  lon: number;
  groundAmsl?: number;
  /** Scrubber time (Unix ms) — the sounding hour is picked to match. */
  time: number;
  onClose: () => void;
}

/** Melbourne wall-clock key "YYYY-MM-DDTHH" for a Unix ms, to match the sounding's local times. */
function melbHourKey(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: 'Australia/Melbourne' }).replace(' ', 'T').slice(0, 13);
}
function fmtMelb(iso: string): string {
  const h = parseInt(new Date(`${iso}:00+10:00`).toLocaleTimeString('en-AU', { hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' }));
  const day = new Date(`${iso}:00+10:00`).toLocaleDateString('en-AU', { weekday: 'short', timeZone: 'Australia/Melbourne' });
  return `${day} ${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
}

/**
 * Full-screen interactive SkewT for a tapped point + time. Drag the orange
 * trigger-temperature handle to project thermal top / cloudbase; drag anywhere
 * on the plot for a level readout. The data box below shows what a pilot needs.
 */
export function SkewTModal({ lat, lon, groundAmsl, time, onClose }: SkewTModalProps) {
  const { units, formatAltitude } = useUnits();
  const [data, setData] = useState<PointSounding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [readout, setReadout] = useState<SkewTReadout | null>(null);

  useEffect(() => {
    setLoading(true); setError(null);
    const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    fetch(`/api/weather/sounding/point?${q}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: PointSounding) => { setData(d); setLoading(false); })
      .catch(e => { setError(String(e)); setLoading(false); });
  }, [lat, lon]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const hour = useMemo(() => {
    if (!data?.hours.length) return null;
    const key = melbHourKey(time);
    return data.hours.find(h => h.time.slice(0, 13) === key) ?? data.hours[0];
  }, [data, time]);

  const alt = (m: number | null) => (m == null ? '—' : formatAltitude(m, 1));
  const wind = (w: { s: number; d: number }) => `${Math.round(w.s)}kt ${getCompassDirection(w.d)}`;

  return createPortal(
    <div className="fixed inset-0 z-[10001] h-[100dvh] w-screen bg-white flex flex-col" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/10 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <WindIcon className="w-4 h-4 text-amber-500 shrink-0" />
          <span className="text-[13px] font-semibold text-ink truncate">SkewT sounding{hour ? ` · ${fmtMelb(hour.time)}` : ''}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowHelp(true)} className="text-muted-foreground/60 hover:text-muted-foreground p-1" title="What do these mean?"><Info className="w-4 h-4" /></button>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-ink" title="Close"><X className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-amber-500 mb-1" /><span className="text-xs text-gray-500">Loading sounding…</span></div>
        ) : error || !hour ? (
          <div className="h-full flex items-center justify-center"><span className="text-xs text-red-500">Sounding unavailable</span></div>
        ) : (
          <div className="max-w-2xl mx-auto p-3 flex flex-col gap-3">
            <SkewTChart hour={hour} groundAmsl={groundAmsl} onReadout={setReadout} />

            {readout && (
              <div className="rounded-xl p-3 text-[12px]" style={{ background: '#f5f5f7' }}>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Thermal top</div>
                    <div className="font-semibold text-ink">{alt(readout.thermalTopAgl)} <span className="text-muted-foreground font-normal">AGL · {alt(readout.thermalTopAmsl)} AMSL</span></div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Wind {wind(readout.topWind)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Cloudbase</div>
                    {readout.cloud
                      ? <><div className="font-semibold text-sky-600">{alt(readout.cloudbaseAgl)} <span className="text-muted-foreground font-normal">AGL · {alt(readout.cloudbaseAmsl)} AMSL</span></div>
                         <div className="text-[11px] text-muted-foreground mt-0.5">Wind {wind(readout.baseWind)}</div></>
                      : <div className="font-semibold text-amber-600">Blue — no cloud</div>}
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Trigger temp</div>
                    <div className="font-semibold text-orange-600">{readout.triggerT.toFixed(1)}°C</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">{readout.isTriggerCustom ? `forecast ${readout.forecastT.toFixed(1)}° · drag ↔ to explore` : 'drag the orange dot ↔'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CAPE</div>
                    <div className="font-semibold text-ink">{readout.cape != null ? `${Math.round(readout.cape)} J/kg` : '—'}</div>
                  </div>
                </div>
                {readout.cursor && (
                  <div className="mt-2 pt-2 border-t border-black/10 text-[11px] text-ink">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-2">At cursor</span>
                    {alt(readout.cursor.zAgl)} AGL · {readout.cursor.t.toFixed(1)}° / {readout.cursor.td.toFixed(1)}°dp · {wind({ s: readout.cursor.ws, d: readout.cursor.wd })}
                  </div>
                )}
                <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span><span className="inline-block w-3 border-t-2 border-red-500 align-middle mr-1" />Temp</span>
                  <span><span className="inline-block w-3 border-t-2 border-green-600 align-middle mr-1" />Dewpoint</span>
                  <span><span className="inline-block w-3 border-t-2 border-dashed border-orange-500 align-middle mr-1" />Parcel</span>
                  <span className="ml-auto">{units === 'imperial' ? 'ft' : 'm'} · tap altitude to switch</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {showHelp && <ThermalHelpModal onClose={() => setShowHelp(false)} variant="chart" />}
    </div>,
    document.body,
  );
}
