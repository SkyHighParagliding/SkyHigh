import { Map } from 'lucide-react';
import { getWindStatus, cn } from '@/lib/utils';

interface HourlyForecastStripProps {
  windowedForecasts: any[];
  site: any;
  onShowWindMap: () => void;
}

export function HourlyForecastStrip({ windowedForecasts, site, onShowWindMap }: HourlyForecastStripProps) {
  if (windowedForecasts.length === 0) return null;

  const showMapBtn = !!(site.lat && site.lon);

  return (
    <div className="w-full mt-3 rounded-xl p-4" style={{ background: '#f5f5f7' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: '#86868b' }}>
            ECMWF Forecast
          </p>
        </div>
        {showMapBtn && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShowWindMap(); }}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors hover:opacity-80"
            style={{ background: '#0071e3', color: '#fff' }}
          >
            <Map className="w-3 h-3" />
            <span>Map</span>
          </button>
        )}
      </div>
      <div className="flex w-full">
        {windowedForecasts.map((f: any, idx: number) => {
          const fStatus = getWindStatus(f.windSpeed, f.windDirection, site);
          const date = new Date(f.timestamp);
          const hourStr = date.toLocaleTimeString([], { hour: 'numeric', hour12: true }).toUpperCase();
          const now = new Date();
          const isCurrentHour = date.getHours() === now.getHours() && date.toDateString() === now.toDateString();
          const fDirColor = fStatus.directionStatus.label === 'Good' ? '#10b981' : fStatus.directionStatus.label === 'Cross' ? '#f97316' : fStatus.directionStatus.label === 'Light' ? '#eab308' : '#ef4444';
          const fSpdColor = fStatus.speedStatus.label === 'Good' ? '#10b981' : fStatus.speedStatus.label === 'Light' ? '#eab308' : '#ef4444';
          return (
            <div key={idx} className="flex flex-col items-center flex-1">
              <span className={cn("text-[12px] font-medium mb-1", isCurrentHour ? "text-accent font-bold" : "")} style={!isCurrentHour ? { color: '#86868b' } : undefined}>{hourStr}</span>
              <span className="text-[14px] font-bold" style={{ color: fDirColor }}>{f.windDirection}</span>
              <span className="text-[14px] font-bold" style={{ color: fSpdColor }}>{Math.round(f.windSpeed)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
