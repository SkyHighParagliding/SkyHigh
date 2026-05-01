import { CloudSun, Waves, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TideChart } from './TideChart';
import { DayOutlookStatus } from './WindCompass';
import type { TideData } from './types';

interface ExtendedOutlookPanelProps {
  site: any;
  hasExtended: boolean;
  extendedForecast: any;
  tideData: TideData | null;
  showTides: boolean;
  setShowTides: (v: boolean) => void;
  effectiveShowTides: boolean;
  forecastWindowStartMs?: number;
  forecastWindowEndMs?: number;
  variant: 'apple' | 'classic';
  iconMap: Record<string, LucideIcon>;
}

const TOGGLE_SHOW_STYLE = {
  opacity: 1,
  transform: "translateY(0)",
  transition: "all 0.3s ease",
  pointerEvents: "auto" as const,
  position: "relative" as const,
  width: "100%",
};

const TOGGLE_HIDE_STYLE = {
  opacity: 0,
  transition: "all 0.3s ease",
  pointerEvents: "none" as const,
  position: "absolute" as const,
  width: "100%",
};

export function ExtendedOutlookPanel({ site, hasExtended, extendedForecast, tideData, showTides, setShowTides, effectiveShowTides, forecastWindowStartMs, forecastWindowEndMs, variant, iconMap }: ExtendedOutlookPanelProps) {
  if (!hasExtended && !tideData) return null;

  const isApple = variant === 'apple';

  const outlookHideTransform = "translateY(-8px)";
  const tideHideTransform = "translateY(8px)";

  const panelClass = isApple ? "rounded-xl p-3" : "bg-navy/5 rounded-2xl p-3 sm:p-4 border border-navy/10";
  const panelStyle = isApple ? { background: '#f5f5f7' } : undefined;
  const headerClass = isApple
    ? "text-[9px] font-semibold uppercase tracking-widest"
    : "text-[8px] sm:text-[10px] font-bold text-foreground-faint uppercase tracking-widest";
  const headerStyle = isApple ? { color: '#86868b' } : undefined;
  const tidesBtnClass = isApple
    ? "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors hover:opacity-80"
    : "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-semibold bg-navy text-white hover:bg-navy/90 transition-colors";
  const tidesBtnStyle = isApple ? { background: '#0071e3', color: '#fff' } : undefined;

  const tidePanelClass = isApple ? "rounded-xl p-4" : "bg-navy/5 rounded-2xl p-4 sm:p-6 border border-navy/10";
  const tidePanelStyle = isApple ? { background: '#f5f5f7' } : undefined;
  const tideLabelClass = isApple
    ? "text-[10px] font-semibold uppercase tracking-widest"
    : "text-[8px] sm:text-[10px] font-bold text-foreground-faint uppercase tracking-widest";
  const tideLabelStyle = isApple ? { color: '#86868b' } : undefined;

  return (
    <div className="w-full mt-3 relative" style={{ overflow: "hidden" }}>
      {hasExtended && (
        <div style={effectiveShowTides
          ? { ...TOGGLE_HIDE_STYLE, transform: outlookHideTransform }
          : TOGGLE_SHOW_STYLE
        }>
          <div className={panelClass} style={panelStyle}>
            <div className={cn("flex items-center justify-between", isApple ? "mb-2" : "mb-2 sm:mb-3")}>
              <span className={headerClass} style={headerStyle}>
                7-Day Outlook
              </span>
              {tideData && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTides(true); }}
                  className={tidesBtnClass}
                  style={tidesBtnStyle}
                >
                  <Waves className="w-3 h-3" />
                  <span>Tides</span>
                </button>
              )}
            </div>
            <DayGrid
              days={extendedForecast.days}
              site={site}
              iconMap={iconMap}
              variant={variant}
            />
          </div>
        </div>
      )}

      {tideData && (
        <div style={effectiveShowTides
          ? TOGGLE_SHOW_STYLE
          : { ...TOGGLE_HIDE_STYLE, transform: tideHideTransform, top: 0 }
        }>
          <div className={tidePanelClass} style={tidePanelStyle}>
            <div className="flex items-center justify-between mb-1">
              <span className={tideLabelClass} style={tideLabelStyle}>
                Tides — {tideData.stationName}
              </span>
              {hasExtended && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowTides(false); }}
                  className={tidesBtnClass}
                  style={tidesBtnStyle}
                >
                  <span>7-Day</span>
                </button>
              )}
            </div>
            <TideChart tideData={tideData} forecastStartMs={forecastWindowStartMs} forecastEndMs={forecastWindowEndMs} />
          </div>
        </div>
      )}
    </div>
  );
}

function DayGrid({ days, site, iconMap, variant }: { days: any[]; site: any; iconMap: Record<string, LucideIcon>; variant: 'apple' | 'classic' }) {
  const isApple = variant === 'apple';

  return (
    <div className={isApple ? "flex w-full" : "grid grid-cols-7 gap-1 sm:gap-1.5"}>
      {days.map((day: any, idx: number) => {
        const IconComp = iconMap[day.bestWeatherIcon] || CloudSun;
        const isToday = idx === 0;

        if (isApple) {
          return (
            <div key={day.date} className={cn(
              "flex flex-col items-center gap-0.5 py-1 rounded-lg flex-1 min-w-0",
              isToday ? "bg-white/80" : ""
            )}>
              <span className={cn(
                "text-[12px] font-bold uppercase",
                isToday ? "text-sky" : ""
              )} style={!isToday ? { color: '#86868b' } : undefined}>
                {isToday ? 'Today' : day.dayName}
              </span>
              <IconComp className="w-5 h-5" style={{ color: '#86868b' }} />
              <span className="text-[14px] font-bold" style={{ color: '#1d1d1f' }}>
                {day.bestSpeed}kt
              </span>
              <span className="text-[12px] font-medium" style={{ color: '#86868b' }}>
                {day.bestDirection}
              </span>
              <DayOutlookStatus speed={day.bestSpeed} direction={day.bestDirection} site={site} />
            </div>
          );
        }

        return (
          <div key={day.date} className={cn(
            "flex flex-col items-center gap-0.5 sm:gap-1 py-1 sm:py-1.5 rounded-lg",
            isToday ? "bg-sky/10" : ""
          )}>
            <span className={cn(
              "text-[8px] sm:text-[10px] font-bold uppercase",
              isToday ? "text-sky" : "text-muted-foreground"
            )}>
              {isToday ? 'Today' : day.dayName}
            </span>
            <IconComp className="w-3 h-3 sm:w-4 sm:h-4 text-navy/60" />
            <span className="text-[8px] sm:text-[10px] font-black text-navy">
              {day.bestSpeed}kt
            </span>
            <span className="text-[7px] sm:text-[9px] font-semibold text-muted-foreground">
              {day.bestDirection}
            </span>
            <DayOutlookStatus speed={day.bestSpeed} direction={day.bestDirection} site={site} />
          </div>
        );
      })}
    </div>
  );
}
