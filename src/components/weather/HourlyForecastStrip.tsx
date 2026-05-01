import { Map } from 'lucide-react';
import { getWindStatus, cn } from '@/lib/utils';

interface HourlyForecastStripProps {
  windowedForecasts: any[];
  site: any;
  forecastSubtitle?: string;
  variant: 'apple' | 'classic';
  onShowWindMap: () => void;
}

export function HourlyForecastStrip({ windowedForecasts, site, forecastSubtitle, variant, onShowWindMap }: HourlyForecastStripProps) {
  if (windowedForecasts.length === 0) return null;

  const showMapBtn = !!(site.lat && site.lon);

  if (variant === 'apple') {
    return (
      <div className="w-full mt-auto rounded-xl p-4" style={{ background: '#f5f5f7' }}>
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
            const fDirColor = fStatus.directionStatus.label === 'Good' ? '#10b981' : fStatus.directionStatus.label === 'Cross' ? '#ff6b35' : fStatus.directionStatus.label === 'Light' ? '#eab308' : '#ef4444';
            const fSpdColor = fStatus.speedStatus.label === 'Good' ? '#10b981' : fStatus.speedStatus.label === 'Light' ? '#eab308' : '#ef4444';
            return (
              <div key={idx} className="flex flex-col items-center flex-1">
                <span className={cn("text-[12px] font-medium mb-1", isCurrentHour ? "text-sky font-bold" : "")} style={!isCurrentHour ? { color: '#86868b' } : undefined}>{hourStr}</span>
                <span className="text-[14px] font-bold" style={{ color: fDirColor }}>{f.windDirection}</span>
                <span className="text-[14px] font-bold" style={{ color: fSpdColor }}>{Math.round(f.windSpeed)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mt-auto bg-sky/5 rounded-2xl p-4 sm:p-6 border border-sky/10">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex-1 text-center">
          <p className="text-[9px] sm:text-xs font-bold text-foreground-faint uppercase tracking-widest">
            ECMWF Forecast
          </p>
          {forecastSubtitle && (
            <p className="text-[8px] sm:text-[10px] text-muted-foreground font-medium">{forecastSubtitle}</p>
          )}
        </div>
        {showMapBtn && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onShowWindMap(); }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-semibold bg-navy text-white hover:bg-navy/90 transition-colors"
          >
            <Map className="w-3 h-3" />
            <span>Map</span>
          </button>
        )}
      </div>

      <div className="w-full -mx-1 px-1">
        <div className="flex gap-1 sm:gap-1.5">
          {windowedForecasts.map((f: any, idx: number) => {
            const fStatus = getWindStatus(f.windSpeed, f.windDirection, site);
            const date = new Date(f.timestamp);
            const timeStr = date.toLocaleTimeString([], { hour: 'numeric', hour12: true });
            return (
              <div key={idx} className="flex flex-col items-center min-w-0 flex-1">
                <span className="text-[8px] sm:text-[9px] text-muted-foreground mb-1.5 sm:mb-2 font-bold truncate w-full text-center">{timeStr}</span>
                <div className="flex flex-col w-full gap-0.5">
                  <span className={`w-full text-center py-0.5 sm:py-1 rounded-t-lg text-[8px] sm:text-[9px] font-black text-white shadow-sm ${fStatus.directionStatus.color}`} title={`Direction: ${fStatus.directionStatus.label}`}>
                    {f.windDirection}
                  </span>
                  <span className={`w-full text-center py-0.5 sm:py-1 rounded-b-lg text-[8px] sm:text-[9px] font-black text-white shadow-sm ${fStatus.speedStatus.color}`} title={`Speed: ${fStatus.speedStatus.label}`}>
                    {Math.round(f.windSpeed)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
