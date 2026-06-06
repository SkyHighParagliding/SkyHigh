import { useState, useRef, useEffect } from 'react';
import { CloudSun, Waves, type LucideIcon } from 'lucide-react';
import { cn, getWindStatus } from '@/lib/utils';
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

// Maps getWindStatus label → hex color for both apple and classic variants
const STATUS_COLOR: Record<string, string> = {
  Good: '#10b981',
  Light: '#eab308',
  Cross: '#f97316',
  'Blown Out': '#ef4444',
  'Not Flyable': '#ef4444',
};
const MUTED_COLOR = '#9ca3af';

function formatSlotTime(timeStr: string): string {
  let hour: number;
  if (timeStr.length > 19 || timeStr.includes('Z') || timeStr.includes('+')) {
    // UTC ISO string from weather_forecasts — convert to Melbourne local hour
    hour = parseInt(
      new Date(timeStr).toLocaleTimeString('en-AU', {
        hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne',
      })
    );
  } else {
    // Melbourne local time string "YYYY-MM-DDTHH:MM"
    hour = parseInt(timeStr.split('T')[1]?.slice(0, 2) ?? '0');
  }
  const ampm = hour < 12 ? 'am' : 'pm';
  const h12 = hour % 12 || 12;
  return `${h12}${ampm}`;
}

function getSlotHour(timeStr: string): number {
  if (timeStr.length > 19 || timeStr.includes('Z') || timeStr.includes('+')) {
    return parseInt(
      new Date(timeStr).toLocaleTimeString('en-AU', {
        hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne',
      })
    );
  }
  return parseInt(timeStr.split('T')[1]?.slice(0, 2) ?? '0');
}

export function ExtendedOutlookPanel({ site, hasExtended, extendedForecast, tideData, showTides, setShowTides, effectiveShowTides, forecastWindowStartMs, forecastWindowEndMs, variant, iconMap }: ExtendedOutlookPanelProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Keep last selected data so content stays visible during collapse animation
  const lastDayDataRef = useRef<any>(null);

  if (!hasExtended && !tideData) return null;

  const isApple = variant === 'apple';

  const selectedDayData = selectedDay
    ? extendedForecast?.days?.find((d: any) => d.date === selectedDay) ?? null
    : null;

  if (selectedDayData) lastDayDataRef.current = selectedDayData;
  const stripData = selectedDayData ?? lastDayDataRef.current;

  const handleSelectDay = (date: string) => {
    setSelectedDay(prev => prev === date ? null : date);
  };

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
    <div className="w-full mt-3 relative" style={{ overflow: "clip" }}>
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
              selectedDay={selectedDay}
              onSelectDay={handleSelectDay}
            />

            {/* Slot strip — expands below the day grid when a day is selected */}
            <div style={{
              display: 'grid',
              gridTemplateRows: selectedDay ? '1fr' : '0fr',
              transition: 'grid-template-rows 0.28s ease',
            }}>
              <div style={{ overflow: 'clip', minHeight: 0, minWidth: 0, width: '100%' }}>
                {stripData && (
                  <SlotStrip
                    day={stripData}
                    site={site}
                    iconMap={iconMap}
                    variant={variant}
                  />
                )}
              </div>
            </div>
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

// ─── DayGrid ────────────────────────────────────────────────────────────────

function DayGrid({ days, site, iconMap, variant, selectedDay, onSelectDay }: {
  days: any[];
  site: any;
  iconMap: Record<string, LucideIcon>;
  variant: 'apple' | 'classic';
  selectedDay: string | null;
  onSelectDay: (date: string) => void;
}) {
  const isApple = variant === 'apple';

  return (
    <div className={isApple ? "flex w-full" : "grid grid-cols-7 gap-1 sm:gap-1.5"}>
      {days.map((day: any, idx: number) => {
        const IconComp = iconMap[day.bestWeatherIcon] || CloudSun;
        const isToday = idx === 0;
        const isSelected = selectedDay === day.date;

        const closureDates: string[] = site?.upcomingClosureDates ?? [];
        const isClosureDay = closureDates.includes(day.date);

        if (isApple) {
          return (
            <button
              key={day.date}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelectDay(day.date); }}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1 rounded-lg flex-1 min-w-0 transition-all",
                isToday ? "bg-white/80" : "",
                isSelected ? "ring-2 ring-sky/60" : ""
              )}
            >
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
              {isClosureDay && (
                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wide">Closed</span>
              )}
            </button>
          );
        }

        return (
          <button
            key={day.date}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelectDay(day.date); }}
            className={cn(
              "flex flex-col items-center gap-0.5 sm:gap-1 py-1 sm:py-1.5 rounded-lg transition-all w-full",
              isToday ? "bg-sky/10" : "",
              isSelected ? "ring-2 ring-sky/50 bg-sky/5" : ""
            )}
          >
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
            {isClosureDay && (
              <span className="text-[7px] font-bold text-red-500 uppercase tracking-wide">Closed</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── SlotStrip ───────────────────────────────────────────────────────────────

const SLOT_WIDTH = 52;

function SlotStrip({ day, site, iconMap, variant }: {
  day: any;
  site: any;
  iconMap: Record<string, LucideIcon>;
  variant: 'apple' | 'classic';
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, scrollLeft: 0 });
  const isApple = variant === 'apple';
  const slots: any[] = day.slots ?? [];
  const useScroll = slots.length > 6;

  // Auto-scroll to current hour when today is selected; reset to start for other days
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !slots.length) return;

    const todayMelb = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });
    if (day.date !== todayMelb || !useScroll) {
      el.scrollLeft = 0;
      return;
    }

    const nowHour = parseInt(
      new Date().toLocaleTimeString('en-AU', { hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne' })
    );
    const targetIdx = slots.findIndex((s: any) => getSlotHour(s.time) >= nowHour);
    const scrollIdx = Math.max(0, targetIdx - 1);
    el.scrollLeft = scrollIdx * SLOT_WIDTH;
  }, [day.date]);

  const divider = isApple
    ? "mt-2 pt-2 border-t border-black/10"
    : "mt-3 pt-3 border-t border-navy/10";

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    dragOrigin.current = { x: e.clientX, scrollLeft: scrollRef.current.scrollLeft };
    e.preventDefault(); // prevents text selection while dragging
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging.current || !scrollRef.current) return;
    scrollRef.current.scrollLeft = dragOrigin.current.scrollLeft - (e.clientX - dragOrigin.current.x);
  };

  const stopDrag = () => { isDragging.current = false; };

  return (
    <div className={divider}>
      <div
        ref={scrollRef}
        className={cn("flex", useScroll ? "overflow-x-auto" : "w-full")}
        style={useScroll ? {
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          cursor: 'grab',
          userSelect: 'none',
        } as React.CSSProperties : undefined}
        onMouseDown={useScroll ? handleMouseDown : undefined}
        onMouseMove={useScroll ? handleMouseMove : undefined}
        onMouseUp={useScroll ? stopDrag : undefined}
        onMouseLeave={useScroll ? stopDrag : undefined}
      >
        {slots.map((slot: any, idx: number) => {
          const status = getWindStatus(slot.windSpeed, slot.windDirection, site);
          const IconComp = iconMap[slot.weatherIcon] || CloudSun;
          const dirColor = STATUS_COLOR[status.directionStatus.label] ?? MUTED_COLOR;
          const spdColor = STATUS_COLOR[status.speedStatus.label] ?? MUTED_COLOR;
          const timeLabel = formatSlotTime(slot.time);
          const hasGust = slot.windGust > 0;

          const slotStyle: React.CSSProperties = useScroll
            ? { minWidth: SLOT_WIDTH, maxWidth: SLOT_WIDTH, scrollSnapAlign: 'start', flexShrink: 0 }
            : { flex: 1, minWidth: 0 };

          if (isApple) {
            return (
              <div key={idx} style={slotStyle} className="flex flex-col items-center py-1 gap-[2px]">
                <span style={{ color: MUTED_COLOR, fontSize: 10, fontWeight: 600, lineHeight: 1.2 }}>
                  {timeLabel}
                </span>
                <IconComp style={{ color: MUTED_COLOR, width: 13, height: 13 }} />
                <span style={{ color: dirColor, fontSize: 11, fontWeight: 700, lineHeight: 1.2 }}>
                  {slot.windDirection}
                </span>
                <span style={{ color: spdColor, fontSize: 12, fontWeight: 800, lineHeight: 1.2 }}>
                  {slot.windSpeed}kt
                </span>
                {hasGust && (
                  <span style={{ color: MUTED_COLOR, fontSize: 10, lineHeight: 1.2 }}>
                    G{slot.windGust}
                  </span>
                )}
                <span style={{ color: MUTED_COLOR, fontSize: 10, lineHeight: 1.2 }}>
                  {Math.round(slot.temperature)}°
                </span>
              </div>
            );
          }

          return (
            <div key={idx} style={slotStyle} className="flex flex-col items-center py-1 gap-[2px]">
              <span className="text-[9px] font-bold text-muted-foreground leading-tight">
                {timeLabel}
              </span>
              <IconComp className="w-3.5 h-3.5 text-navy/50" />
              <span className="text-[10px] font-bold leading-tight" style={{ color: dirColor }}>
                {slot.windDirection}
              </span>
              <span className="text-[11px] font-black leading-tight" style={{ color: spdColor }}>
                {slot.windSpeed}kt
              </span>
              {hasGust && (
                <span className="text-[9px] text-muted-foreground leading-tight">
                  G{slot.windGust}
                </span>
              )}
              <span className="text-[9px] text-muted-foreground leading-tight">
                {Math.round(slot.temperature)}°
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
