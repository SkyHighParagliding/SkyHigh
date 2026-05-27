import { Navigation, ArrowLeftRight, type LucideIcon } from 'lucide-react';
import { parseWindSpeed } from '@/lib/utils';
import { formatDisplayTime } from '@/lib/dateUtils';
import { Badge } from "@/components/ui/badge";
import { WindCompass } from './WindCompass';
import { HourlyForecastStrip } from './HourlyForecastStrip';
import { ExtendedOutlookPanel } from './ExtendedOutlookPanel';
import type { WeatherCardRenderProps } from './WeatherCardRenderProps';
import { getClosureStatus } from '@/utils/closureStatus';

function sanitizeSiteName(name: string): string {
  // Basic sanitization to escape known dangerous characters
  return name
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

export function WeatherCardApple({ site, activeWeather, weather, distance, hasAlt, showAlt, setShowAlt, direction, windStatus, idealDirs, isDirectionIdeal, windowedForecasts, forecastSubtitle, forecastWindowStartMs, forecastWindowEndMs, hasExtended, extendedForecast, tideData, showTides, setShowTides, effectiveShowTides, setShowWindMap, windMapPortal, WEATHER_ICON_MAP: iconMap }: WeatherCardRenderProps) {
  const dirTextColor = windStatus.directionStatus.label === 'Good' ? '#10b981' : windStatus.directionStatus.label === 'Light' ? '#eab308' : windStatus.directionStatus.label === 'Cross' ? '#ff6b35' : windStatus.directionStatus.label === 'Blown Out' || windStatus.directionStatus.label === 'Not Flyable' ? '#ef4444' : '#1d1d1f';
  const parsedSpeed = parseWindSpeed(site.windSpeed) || parseWindSpeed(site.windDir);
  const maxIdealSpeed = parsedSpeed?.max ?? null;
  const gustBlownOut = maxIdealSpeed != null && activeWeather.windGust > maxIdealSpeed;
  const gustColor = gustBlownOut ? '#ef4444' : '#1d1d1f';

  const dirBadgeColor = windStatus.directionStatus.label === 'Good' ? '#10b981' : windStatus.directionStatus.label === 'Light' ? '#eab308' : windStatus.directionStatus.label === 'Cross' ? '#ff6b35' : '#ef4444';
  const spdBadgeColor = windStatus.speedStatus.label === 'Good' ? '#10b981' : windStatus.speedStatus.label === 'Light' ? '#eab308' : windStatus.speedStatus.label === 'Blown Out' || windStatus.speedStatus.label === 'Not Flyable' ? '#ef4444' : windStatus.speedStatus.label === 'Strong' ? '#ef4444' : '#9ca3af';

  return (
    <div className="rounded-2xl p-6 sm:p-8 flex flex-col h-full" style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 30px rgba(0,0,0,0.07)' }}>
      <div className="flex items-start justify-between w-full mb-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-semibold truncate text-2xl" style={{ color: '#1d1d1f' }}>{sanitizeSiteName(site.name)}</h3>
        </div>
        {(site.status === 'closed' || getClosureStatus(site).isClosedToday) ? (
          <Badge variant="destructive" className="shadow-sm text-[10px] py-0 px-2 h-5 shrink-0">Closed</Badge>
        ) : site.status === 'restricted' ? (
          <Badge className="bg-amber-500 text-white shadow-sm text-[10px] py-0 px-2 h-5 shrink-0">Restricted</Badge>
        ) : (
          <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white" style={{ background: '#22c55e' }}>Open</span>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-[12px] mb-5" style={{ color: '#86868b' }}>
        <Navigation className="w-3 h-3" />
        <span>{activeWeather.type === 'live' ? 'Live' : 'Forecast'} - {activeWeather.stationName || sanitizeSiteName(site.name)}</span>
        {distance && <span>· {distance}km</span>}
        <span>· {formatDisplayTime(activeWeather.timestamp)}</span>
        {hasAlt && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAlt(!showAlt); }}
            className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold hover:bg-black/5 transition-colors"
            style={{ color: '#0071e3' }}
            title={showAlt ? `Switch to ${weather.stationName}` : `Switch to ${weather.altObservation.stationName}`}
          >
            <ArrowLeftRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-6 sm:gap-8 mb-6">
        <div className="shrink-0">
          <WindCompass
            currentDir={direction}
            idealDirs={idealDirs}
            directionStatus={windStatus.directionStatus.label}
            speedStatus={windStatus.speedStatus.label}
            siteId={site.id}
            isDirectionIdeal={isDirectionIdeal}
            crossLeft={site.crossLeft === "true" || site.crossLeft === true}
            crossRight={site.crossRight === "true" || site.crossRight === true}
          />
        </div>

        <div className="flex-1 flex flex-col gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1" style={{ color: '#86868b' }}>Wind</p>
            <div className="flex items-baseline gap-1">
              <span className="text-5xl font-bold leading-none" style={{ color: '#1d1d1f' }}>{Math.round(activeWeather.windSpeed)}</span>
              <span className="text-lg font-medium" style={{ color: '#86868b' }}>kt</span>
              {activeWeather.windGust > 0 && (
                <span className="text-2xl font-bold leading-none ml-1" style={{ color: gustColor }}>G{Math.round(activeWeather.windGust)}</span>
              )}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: '#86868b' }}>Direction</p>
            <span className="text-2xl font-bold" style={{ color: dirTextColor }}>{direction}</span>
          </div>

          <div className="flex gap-2">
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold text-white" style={{ background: dirBadgeColor }}>
              DIR {windStatus.directionStatus.label.toUpperCase()}
            </span>
            <span className="px-2.5 py-1 rounded-md text-[10px] font-bold text-white" style={{ background: spdBadgeColor }}>
              SPD {windStatus.speedStatus.label.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <HourlyForecastStrip
        windowedForecasts={windowedForecasts}
        site={site}
        variant="apple"
        onShowWindMap={() => setShowWindMap(true)}
      />

      <ExtendedOutlookPanel
        site={site}
        hasExtended={hasExtended}
        extendedForecast={extendedForecast}
        tideData={tideData}
        showTides={showTides}
        setShowTides={setShowTides}
        effectiveShowTides={effectiveShowTides}
        forecastWindowStartMs={forecastWindowStartMs}
        forecastWindowEndMs={forecastWindowEndMs}
        variant="apple"
        iconMap={iconMap}
      />

      {windMapPortal}
    </div>
  );
}
