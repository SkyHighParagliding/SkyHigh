import { useState } from 'react';
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, getDay, isBefore, startOfDay,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ClosureDatePickerProps {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
  disabled?: boolean;
}

const DAY_HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function ClosureDatePicker({ selectedDates, onChange, disabled = false }: ClosureDatePickerProps) {
  const today = startOfDay(new Date());
  const todayStr = format(today, 'yyyy-MM-dd');

  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const future = [...selectedDates].filter(d => d >= todayStr).sort();
    return future.length > 0 ? startOfMonth(new Date(future[0] + 'T12:00:00')) : startOfMonth(today);
  });

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  // Mon-first offset: Sun=0 in getDay → offset 6, Mon=1 → offset 0, etc.
  const startOffset = (getDay(monthStart) + 6) % 7;

  const selectedSet = new Set(selectedDates);

  const toggleDate = (dateStr: string) => {
    if (disabled) return;
    if (selectedSet.has(dateStr)) {
      onChange(selectedDates.filter(d => d !== dateStr));
    } else {
      onChange([...selectedDates, dateStr].sort());
    }
  };

  const sortedSelected = [...selectedDates].sort();
  const bannerPreview = (() => {
    if (sortedSelected.length === 0) return null;
    const first = new Date(sortedSelected[0] + 'T12:00:00');
    const bannerStart = new Date(first);
    bannerStart.setDate(first.getDate() - 7);
    const last = new Date(sortedSelected[sortedSelected.length - 1] + 'T12:00:00');
    return `${format(bannerStart, 'EEE d MMM')} → ${format(last, 'EEE d MMM yyyy')}`;
  })();

  const selectedSummary = sortedSelected.map(d => {
    const dt = new Date(d + 'T12:00:00');
    return format(dt, 'EEE d MMM');
  }).join(', ');

  return (
    <div className={`space-y-3 ${disabled ? 'opacity-40 pointer-events-none select-none' : ''}`}>
      {/* Month navigation header */}
      <div className="flex items-center justify-between select-none">
        <button
          type="button"
          onClick={() => setViewMonth(prev => subMonths(prev, 1))}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold">{format(viewMonth, 'MMMM yyyy')}</span>
        <button
          type="button"
          onClick={() => setViewMonth(prev => addMonths(prev, 1))}
          className="p-1 rounded hover:bg-gray-100 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {DAY_HEADERS.map(h => (
          <div key={h} className="text-center text-[10px] font-medium text-muted-foreground py-1 select-none">{h}</div>
        ))}

        {Array.from({ length: startOffset }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}

        {days.map(day => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isPast = isBefore(day, today);
          const isSelected = selectedSet.has(dateStr);
          const isToday = dateStr === todayStr;

          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => !isPast && toggleDate(dateStr)}
              disabled={isPast}
              className={[
                'text-center text-xs py-1.5 rounded transition-colors leading-none',
                isPast
                  ? 'text-gray-300 cursor-not-allowed'
                  : 'cursor-pointer hover:bg-red-100',
                isSelected
                  ? 'bg-red-500 text-white hover:bg-red-600 font-bold'
                  : '',
                isToday && !isSelected
                  ? 'ring-1 ring-sky font-semibold'
                  : '',
              ].filter(Boolean).join(' ')}
            >
              {format(day, 'd')}
            </button>
          );
        })}
      </div>

      {/* Summary + banner preview */}
      {sortedSelected.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t border-border-faint">
          <p><span className="font-medium text-foreground">Closed: </span>{selectedSummary}</p>
          {bannerPreview && (
            <p><span className="font-medium text-foreground">Banner window: </span>{bannerPreview}</p>
          )}
        </div>
      )}

      {/* Clear all */}
      {sortedSelected.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-red-500 hover:text-red-700 underline transition-colors"
        >
          Clear all dates
        </button>
      )}
    </div>
  );
}
