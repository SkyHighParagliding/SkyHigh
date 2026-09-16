import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X, Info, LineChart } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext';
import { SiteMeteogramChart, type MeteogramHour } from './SiteMeteogramChart';
import { ThermalHelpModal } from '../windmap/ThermalHelpModal';

/** Parse a string setting to a finite number, else the default (handles 0 correctly). */
function numSetting(v: unknown, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? n : d;
}

interface PointMeteogramModalProps {
  lat: number;
  lon: number;
  /** Ground elevation at the point, m AMSL — sets the ceiling (AMSL) axis. */
  groundAmsl?: number;
  onClose: () => void;
}

/**
 * Full-screen meteogram for an arbitrary tapped point (the launch is just a
 * point). Opened from the thermal map's tapped-point box; the point + scrubber
 * context is what the pilot cares about, so the chart is point-aware.
 */
export function PointMeteogramModal({ lat, lon, groundAmsl, onClose }: PointMeteogramModalProps) {
  const { settings } = useSettings();
  const [data, setData] = useState<{ hours: MeteogramHour[]; launchElevation: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    if (typeof groundAmsl === 'number') q.set('ground', String(Math.round(groundAmsl)));
    fetch(`/api/weather/meteogram/point?${q}`)
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then((d: { hours: MeteogramHour[]; launchElevation: number | null }) => { setData(d); setLoading(false); })
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
          <LineChart className="w-4 h-4 text-amber-500" />
          <span className="text-[13px] font-semibold text-ink">Thermal Forecast</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowHelp(true)} className="text-muted-foreground/60 hover:text-muted-foreground p-1" title="What do these readings mean?">
            <Info className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-ink" title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-3">
        {loading ? (
          <div className="h-full flex flex-col items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500 mb-1" />
            <span className="text-xs text-gray-500">Loading meteogram…</span>
          </div>
        ) : error || !data ? (
          <div className="h-full flex items-center justify-center">
            <span className="text-xs text-red-500">Failed to load meteogram</span>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto">
            <SiteMeteogramChart
              hours={data.hours}
              launchElevation={data.launchElevation}
              groundLabel="Ground"
              thresholds={{
                clearSkyPct: numSetting(settings.thermalClearSkyCloudPct, 12),
                overcastPct: numSetting(settings.thermalOvercastOnsetPct, 70),
                stormCape: numSetting(settings.thermalStormCapeGate, 500),
                minWstar: numSetting(settings.thermalMinWstar, 0.3),
                rainOffMm: numSetting(settings.thermalRainOffMm, 1),
              }}
            />
          </div>
        )}
      </div>
      {showHelp && <ThermalHelpModal onClose={() => setShowHelp(false)} variant="chart" />}
    </div>,
    document.body,
  );
}
