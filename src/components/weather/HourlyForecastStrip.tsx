import { Map, type LucideIcon } from 'lucide-react';
import { SlotStrip } from './SlotStrip';

interface HourlyForecastStripProps {
  /** Full hourly forecast for the day (weather_forecasts.forecasts), not the
   *  7-slot window — the strip scrolls to show every available hour. */
  forecasts: any[];
  site: any;
  iconMap: Record<string, LucideIcon>;
  onShowWindMap: () => void;
}

export function HourlyForecastStrip({ forecasts, site, iconMap, onShowWindMap }: HourlyForecastStripProps) {
  if (!forecasts || forecasts.length === 0) return null;

  const showMapBtn = !!(site.lat && site.lon);

  // Reshape weather_forecasts hours into the slot shape SlotStrip renders. The
  // per-hour icon/gust/temp are already present in the payload — the old strip
  // simply didn't show them. `time` uses the ISO timestamp so SlotStrip's
  // Melbourne-hour parsing and auto-scroll-to-now work.
  const todayMelb = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
  const day = {
    date: todayMelb,
    slots: forecasts.map((f: any) => ({
      time: f.timestamp,
      weatherIcon: f.icon,
      windDirection: f.windDirection,
      windSpeed: f.windSpeed,
      windGust: f.windGust,
      temperature: f.temperature,
    })),
  };

  return (
    <div className="w-full mt-3 rounded-xl p-4" style={{ background: '#f5f5f7' }}>
      <div className="flex items-center justify-between">
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
      <SlotStrip day={day} site={site} iconMap={iconMap} />
    </div>
  );
}
