import { useRef, useEffect } from 'react';
import { CloudSun, type LucideIcon } from 'lucide-react';
import { cn, getWindStatus } from '@/lib/utils';

// Maps getWindStatus label → hex color
const STATUS_COLOR: Record<string, string> = {
  Good: '#10b981',
  Light: '#eab308',
  Cross: '#f97316',
  'Blown Out': '#ef4444',
  'Not Flyable': '#ef4444',
};
const MUTED_COLOR = '#9ca3af';

export function formatSlotTime(timeStr: string): string {
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

export function getSlotHour(timeStr: string): number {
  if (timeStr.length > 19 || timeStr.includes('Z') || timeStr.includes('+')) {
    return parseInt(
      new Date(timeStr).toLocaleTimeString('en-AU', {
        hour: '2-digit', hour12: false, timeZone: 'Australia/Melbourne',
      })
    );
  }
  return parseInt(timeStr.split('T')[1]?.slice(0, 2) ?? '0');
}

const SLOT_WIDTH = 52;

/**
 * Horizontally scrollable / drag-pannable strip of hourly slots — time, weather
 * icon, wind direction/speed, gust, and temperature. Shared by the 7-Day
 * expansion (day.slots) and the ECMWF Forecast strip (today's hourly forecast).
 *
 * Each slot needs: { time, weatherIcon, windDirection, windSpeed, windGust,
 * temperature }. `time` may be a UTC ISO string or a "YYYY-MM-DDTHH:MM" local
 * string — both are handled by formatSlotTime/getSlotHour. The strip auto-scrolls
 * to the current hour when `day.date` is today; other days start at hour 0.
 */
export function SlotStrip({ day, site, iconMap }: {
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
