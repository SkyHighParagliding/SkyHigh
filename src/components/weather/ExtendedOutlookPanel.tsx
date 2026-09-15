import { useState, useRef, useEffect, lazy, Suspense } from 'react';
import { CloudSun, Waves, ChartLine, Thermometer, type LucideIcon } from 'lucide-react';
import { SiteThermalPanel } from './SiteThermalPanel';
import { cn, getWindStatus } from '@/lib/utils';
import { TideChart } from './TideChart';
import { WeatherHistoryChart } from './WeatherHistoryChart';
import { WeatherHistoryMatrix } from './WeatherHistoryMatrix';
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
  hasLiveWeather: boolean;
  activePanel: 'history' | 'outlook' | 'thermal';
  setActivePanel: (v: 'history' | 'outlook' | 'thermal') => void;
  historyData: { points: any[]; buckets: any[] } | null;
  nextReadingMs?: number | null;
  forecastWindowStartMs?: number;
  forecastWindowEndMs?: number;
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

// Maps getWindStatus label → hex color
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

export function ExtendedOutlookPanel({ site, hasExtended, extendedForecast, tideData, showTides, setShowTides, effectiveShowTides, hasLiveWeather, activePanel, setActivePanel, historyData, nextReadingMs, forecastWindowStartMs, forecastWindowEndMs, iconMap }: ExtendedOutlookPanelProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  // Keep last selected data so content stays visible during collapse animation
  const lastDayDataRef = useRef<any>(null);

  const isInland = (site?.type || '').toLowerCase().includes('inland');

  if (!hasExtended && !tideData && !hasLiveWeather && !isInland) return null;

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
  const historyHideTransform = "translateY(8px)";

  // When history is the default but there's no live weather, fall back to outlook
  const effectivePanel = (activePanel === 'history' && !hasLiveWeather) ? 'outlook' : activePanel;
  const showOutlook = !effectiveShowTides && effectivePanel === 'outlook';
  const showHistory = !effectiveShowTides && effectivePanel === 'history';
  const showThermal = !effectiveShowTides && effectivePanel === 'thermal';

  const panelClass = "rounded-xl p-3";
  const panelStyle = { background: '#f5f5f7' };
  const headerClass = "text-[10px] font-semibold uppercase tracking-widest";
  const headerStyle = { color: '#86868b' };
  const tidesBtnClass = "flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors hover:opacity-80";
  const tidesBtnStyle = { background: '#0071e3', color: '#fff' };

  const tidePanelClass = "rounded-xl p-4";
  const tidePanelStyle = { background: '#f5f5f7' };
  const tideLabelClass = "text-[10px] font-semibold uppercase tracking-widest";
  const tideLabelStyle = { color: '#86868b' };

  return (
    <div className="w-full mt-3 relative" style={{ overflow: "clip" }}>
      {/* ── 7-Day Outlook panel ─────────────────────────────────────── */}
      {hasExtended && (
        <div style={showOutlook ? TOGGLE_SHOW_STYLE : { ...TOGGLE_HIDE_STYLE, transform: outlookHideTransform }}>
          <div className={panelClass} style={panelStyle}>
            <div className="flex items-center justify-between mb-2">
              <span className={headerClass} style={headerStyle}>
                7-Day Outlook
              </span>
              <div className="flex items-center gap-1.5">
                {hasLiveWeather && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel('history'); }}
                    className={tidesBtnClass}
                    style={tidesBtnStyle}
                  >
                    <ChartLine className="w-3 h-3" />
                    <span>History</span>
                  </button>
                )}
                {isInland && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel('thermal'); }}
                    className={tidesBtnClass}
                    style={tidesBtnStyle}
                  >
                    <Thermometer className="w-3 h-3" />
                    <span>Thermal</span>
                  </button>
                )}
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
            </div>

            <DayGrid
              days={extendedForecast.days}
              site={site}
              iconMap={iconMap}
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
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tides panel ─────────────────────────────────────────────── */}
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
              <div className="flex items-center gap-1.5">
                {hasLiveWeather && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel('history'); setShowTides(false); }}
                    className={tidesBtnClass}
                    style={tidesBtnStyle}
                  >
                    <ChartLine className="w-3 h-3" />
                    <span>History</span>
                  </button>
                )}
                {hasExtended && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel('outlook'); setShowTides(false); }}
                    className={tidesBtnClass}
                    style={tidesBtnStyle}
                  >
                    <span>7-Day</span>
                  </button>
                )}
              </div>
            </div>
            <TideChart tideData={tideData} forecastStartMs={forecastWindowStartMs} forecastEndMs={forecastWindowEndMs} />
          </div>
        </div>
      )}

      {/* ── History panel ────────────────────────────────────────────── */}
      {hasLiveWeather && (
        <div style={showHistory
          ? TOGGLE_SHOW_STYLE
          : { ...TOGGLE_HIDE_STYLE, transform: historyHideTransform, top: 0 }
        }>
          <div className={panelClass} style={panelStyle}>
            <div className="flex items-center justify-between mb-2">
              <span className={headerClass} style={headerStyle}>
                Wind History — last 6h
              </span>
              <div className="flex items-center gap-1.5">
                {tideData && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel('outlook'); setShowTides(true); }}
                    className={tidesBtnClass}
                    style={tidesBtnStyle}
                  >
                    <Waves className="w-3 h-3" />
                    <span>Tides</span>
                  </button>
                )}
                {isInland && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel('thermal'); }}
                    className={tidesBtnClass}
                    style={tidesBtnStyle}
                  >
                    <Thermometer className="w-3 h-3" />
                    <span>Thermal</span>
                  </button>
                )}
                {hasExtended && (
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setActivePanel('outlook'); }}
                    className={tidesBtnClass}
                    style={tidesBtnStyle}
                  >
                    <span>7-Day</span>
                  </button>
                )}
              </div>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1">
                <svg width="28" height="6" style={{ display: 'block' }}>
                  <line x1="0" y1="3" x2="28" y2="3" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span className="text-[9px] text-muted-foreground font-medium">Wind Spd</span>
              </div>
              <div className="flex items-center gap-1">
                <svg width="28" height="6" style={{ display: 'block' }}>
                  <line x1="0" y1="3" x2="28" y2="3" stroke="#10b981" strokeWidth="1.5" strokeDasharray="8,4" strokeLinecap="round" />
                </svg>
                <span className="text-[9px] text-muted-foreground font-medium">Gust</span>
              </div>
              <div className="flex items-center gap-1">
                <svg width="28" height="6" style={{ display: 'block' }}>
                  <line x1="0" y1="3" x2="28" y2="3" stroke="#10b981" strokeWidth="2" strokeDasharray="1,4" strokeLinecap="round" />
                </svg>
                <span className="text-[9px] text-muted-foreground font-medium">Wind Dir</span>
              </div>
              <div className="flex flex-col items-end ml-auto" style={{ gap: '1px' }}>
                {historyData && historyData.points.length > 0 && (() => {
                  const last = historyData.points[historyData.points.length - 1];
                  const t = new Date(last.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
                  return (
                    <span className="text-[9px] text-muted-foreground font-medium">
                      Last reading {t}
                    </span>
                  );
                })()}
                {nextReadingMs != null && (() => {
                  const minsLeft = Math.max(0, Math.ceil((nextReadingMs - Date.now()) / 60000));
                  return (
                    <span className="text-[9px] text-muted-foreground font-medium">
                      Next reading in {minsLeft <= 0 ? '< 1m' : `${minsLeft}m`}
                    </span>
                  );
                })()}
              </div>
            </div>

            {historyData ? (
              <>
                <WeatherHistoryChart points={historyData.points} site={site} tideData={tideData} />
                <WeatherHistoryMatrix buckets={historyData.buckets} site={site} />
              </>
            ) : (
              <div className="flex items-center justify-center h-24">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-accent" />
              </div>
            )}
          </div>
        </div>
      )}
      {/* ── Thermal panel ────────────────────────────────────────────── */}
      {isInland && (
        <div style={showThermal
          ? TOGGLE_SHOW_STYLE
          : { ...TOGGLE_HIDE_STYLE, transform: historyHideTransform, top: 0 }
        }>
          <SiteThermalPanel
            site={site}
            onBack={(target) => setActivePanel(target)}
            hasExtended={hasExtended}
            hasLiveWeather={hasLiveWeather}
          />
        </div>
      )}
    </div>
  );
}

// ─── DayGrid ────────────────────────────────────────────────────────────────

function DayGrid({ days, site, iconMap, selectedDay, onSelectDay }: {
  days: any[];
  site: any;
  iconMap: Record<string, LucideIcon>;
  selectedDay: string | null;
  onSelectDay: (date: string) => void;
}) {
  // Compare against the real Melbourne date — stale/fallback forecast data can
  // start on an earlier day, which must not be presented as "Today".
  const todayMelb = new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

  return (
    <div className="flex w-full">
      {days.map((day: any) => {
        const IconComp = iconMap[day.bestWeatherIcon] || CloudSun;
        const isToday = day.date === todayMelb;
        const isSelected = selectedDay === day.date;

        const closureDates: string[] = site?.upcomingClosureDates ?? [];
        const isClosureDay = closureDates.includes(day.date);

        return (
          <button
            key={day.date}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelectDay(day.date); }}
            className={cn(
              "flex flex-col items-center gap-0.5 py-1 rounded-lg flex-1 min-w-0 transition-all",
              isToday ? "bg-white/80" : "",
              isSelected ? "ring-2 ring-accent/60" : ""
            )}
          >
            <span className={cn(
              "text-[12px] font-bold uppercase",
              isToday ? "text-accent" : ""
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
      })}
    </div>
  );
}

// ─── SlotStrip ───────────────────────────────────────────────────────────────

const SLOT_WIDTH = 52;

function SlotStrip({ day, site, iconMap }: {
  day: any;
  site: any;
  iconMap: Record<string, LucideIcon>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ x: 0, scrollLeft: 0 });
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
    <div className="mt-2 pt-2 border-t border-black/10">
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
        })}
      </div>
    </div>
  );
}
