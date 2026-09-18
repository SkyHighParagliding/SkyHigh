import { useState, useRef, useEffect } from "react";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  addMonths, subMonths, getDay, startOfDay, isBefore,
} from "date-fns";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";

/**
 * Shared single-date picker: a compact styled trigger that opens a month-grid
 * popover (same calendar look as ClosureDatePicker). No typing — pick a day.
 * Value is an ISO "yyyy-MM-dd" string (or "" when unset), matching how the date
 * fields are stored. Use this for every single-date field so they look identical.
 */
interface DatePickerProps {
  value: string;                      // "yyyy-MM-dd" or ""
  onChange: (date: string) => void;
  placeholder?: string;
  /** Earliest selectable date ("yyyy-MM-dd"). Days before it are disabled. */
  min?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
}

const DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const parseISO = (s: string) => (s ? new Date(s + "T12:00:00") : null);

export function DatePicker({ value, onChange, placeholder = "Select date", min, clearable = false, disabled = false, className = "" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState<Date>(() => parseISO(value) ?? startOfMonth(new Date()));
  const ref = useRef<HTMLDivElement>(null);

  // Keep the visible month in step with the value when it changes externally.
  useEffect(() => { const d = parseISO(value); if (d) setViewMonth(startOfMonth(d)); }, [value]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const monthStart = startOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: endOfMonth(viewMonth) });
  const startOffset = (getDay(monthStart) + 6) % 7; // Mon-first
  const minDate = min ? startOfDay(new Date(min + "T12:00:00")) : null;
  const selected = value;

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-input rounded-md px-3 py-1.5 text-sm bg-background hover:border-accent transition-colors disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-accent min-w-[9.5rem]"
      >
        <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className={selected ? "text-foreground" : "text-muted-foreground"}>
          {selected ? format(parseISO(selected)!, "EEE d MMM yyyy") : placeholder}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            aria-label="Clear date"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="ml-auto text-muted-foreground/60 hover:text-muted-foreground"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-64 bg-white border border-border rounded-lg shadow-xl p-3">
          <div className="flex items-center justify-between select-none mb-2">
            <button type="button" onClick={() => setViewMonth(p => subMonths(p, 1))} className="p-1 rounded hover:bg-gray-100"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-sm font-semibold">{format(viewMonth, "MMMM yyyy")}</span>
            <button type="button" onClick={() => setViewMonth(p => addMonths(p, 1))} className="p-1 rounded hover:bg-gray-100"><ChevronRight className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {DAY_HEADERS.map(h => <div key={h} className="text-center text-[10px] font-medium text-muted-foreground py-1 select-none">{h}</div>)}
            {Array.from({ length: startOffset }).map((_, i) => <div key={`pad-${i}`} />)}
            {days.map(day => {
              const dateStr = format(day, "yyyy-MM-dd");
              const isDisabled = minDate ? isBefore(day, minDate) : false;
              const isSelected = dateStr === selected;
              return (
                <button
                  key={dateStr}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => { onChange(dateStr); setOpen(false); }}
                  className={[
                    "text-center text-xs py-1.5 rounded transition-colors leading-none",
                    isDisabled ? "text-gray-300 cursor-not-allowed" : "cursor-pointer hover:bg-accent/10",
                    isSelected ? "bg-accent text-white hover:bg-accent font-bold" : "",
                  ].filter(Boolean).join(" ")}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
