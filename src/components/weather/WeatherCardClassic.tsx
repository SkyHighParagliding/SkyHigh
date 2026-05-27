import { ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
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

export function WeatherCardClassic({ site, activeWeather, weather, distance, hasAlt, showAlt, setShowAlt, direction, windStatus, idealDirs, isDirectionIdeal, windowedForecasts, forecastSubtitle, forecastWindowStartMs, forecastWindowEndMs, hasExtended, extendedForecast, tideData, showTides, setShowTides, effectiveShowTides, setShowWindMap, windMapPortal, IconComponent, WEATHER_ICON_MAP: iconMap }: WeatherCardRenderProps) {
  return (
    <div className="border rounded-3xl p-5 sm:p-8 flex flex-col items-center hover:shadow-xl transition-all bg-card border-sky/10 h-full">
      <div className="flex items-center justify-between w-full mb-5 px-1 gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="font-bold text-navy truncate text-xl sm:text-2xl">{sanitizeSiteName(site.name)}</h3>
          {(site.status === 'closed' || getClosureStatus(site).isClosedToday) ? (
            <Badge variant="destructive" className="shadow-sm text-[10px] py-0 px-1.5 h-5 shrink-0">Closed</Badge>
          ) : site.status === 'restricted' ? (
            <Badge className="bg-amber-500 text-white shadow-sm text-[10px] py-0 px-1.5 h-5 shrink-0">Restricted</Badge>
          ) : (
            <Badge variant="default" className="bg-emerald-500 shadow-sm text-[10px] py-0 px-1.5 h-5 shrink-0">Open</Badge>
          )}
        </div>
        {IconComponent && <IconComponent className="h-6 w-6 sm:h-8 sm:w-8 text-sky shrink-0" />}
      </div>

      <div className="w-full flex flex-col mb-5">
        <div className={`w-full py-2 rounded-t-2xl text-center text-[10px] sm:text-sm font-black text-white uppercase tracking-widest shadow-sm ${activeWeather.type === 'live' ? 'bg-sky' : 'bg-gray-400'}`}>
          {activeWeather.type === 'live' ? 'Live Observation' : 'Site Forecast'}
        </div>
        <div className="flex items-center justify-between w-full gap-2 sm:gap-6 p-3 sm:p-6 bg-sky/5 rounded-b-2xl border-x border-b border-sky/10 shadow-sm">
          <div className="flex-1 flex flex-col items-center justify-center h-28 sm:h-40 gap-1 min-w-[80px] sm:min-w-[100px]">
            <div className={cn(
              "w-full flex-1 flex flex-col items-center justify-center rounded-t-xl sm:rounded-t-3xl shadow-sm text-white px-2",
              windStatus.directionStatus.color
            )}>
              <span className="text-2xl sm:text-4xl font-black leading-none tracking-tighter">{direction}</span>
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-[0.2em] mt-0.5 sm:mt-1 opacity-90 text-center leading-tight">
                {windStatus.directionStatus.label}
              </span>
            </div>
            
            <div className={cn(
              "w-full flex-1 flex flex-col items-center justify-center rounded-b-xl sm:rounded-b-3xl shadow-sm text-white px-2",
              windStatus.speedStatus.color
            )}>
              <div className="flex items-baseline gap-0.5 sm:gap-1">
                <span className="text-2xl sm:text-4xl font-black leading-none tracking-tighter">{Math.round(activeWeather.windSpeed)}</span>
                <span className="text-[8px] sm:text-[10px] font-bold uppercase opacity-80">kts</span>
              </div>
              <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-wider sm:tracking-[0.2em] mt-0.5 sm:mt-1 opacity-90 text-center leading-tight">
                {windStatus.speedStatus.label}
              </span>
            </div>
            
            <p className="text-[9px] sm:text-[10px] text-foreground-faint font-black uppercase tracking-widest mt-1">
              Gusts {Math.round(activeWeather.windGust)}
            </p>
          </div>

          <div className="shrink-0 flex items-center justify-center min-h-[100px] sm:min-h-[140px]">
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
        </div>
      </div>

      <div className="w-full flex items-center justify-between text-[11px] sm:text-sm text-muted-foreground mb-5 px-3 sm:px-4 py-2 sm:py-3 bg-background rounded-2xl border border-border-faint">
        <div className="flex items-center gap-2 sm:gap-3 truncate">
          <span className={`px-2 sm:px-3 py-0.5 sm:py-1 rounded-lg font-black text-[9px] sm:text-xs text-white uppercase shrink-0 shadow-sm ${activeWeather.type === 'live' ? 'bg-sky' : 'bg-gray-400'}`}>
            {activeWeather.type === 'live' ? 'LIVE' : 'FCST'}
          </span>
          <span className="truncate font-medium text-foreground-secondary">
            {activeWeather.stationName ? `Obs: ${activeWeather.stationName}` : `Fcst: ${sanitizeSiteName(site.name)}`}
            {distance && ` • ${distance}km`}
          </span>
          {hasAlt && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowAlt(!showAlt); }}
              className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] sm:text-[10px] font-bold bg-sky/10 text-sky hover:bg-sky/20 transition-colors"
              title={showAlt ? `Switch to ${weather.stationName}` : `Switch to ${weather.altObservation.stationName}`}
            >
              <ArrowLeftRight className="w-3 h-3" />
              <span className="hidden sm:inline">{showAlt ? weather.stationName?.split(' (')[0] || 'Primary' : weather.altObservation.stationName?.split(' (')[0] || 'Alt'}</span>
            </button>
          )}
        </div>
        <span className="shrink-0 font-bold text-navy opacity-80">
          {formatDisplayTime(activeWeather.timestamp)}
        </span>
      </div>
      
      <HourlyForecastStrip
        windowedForecasts={windowedForecasts}
        site={site}
        forecastSubtitle={forecastSubtitle}
        variant="classic"
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
        variant="classic"
        iconMap={iconMap}
      />

      {windMapPortal}
    </div>
  );
}
