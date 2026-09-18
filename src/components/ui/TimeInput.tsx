/**
 * Shared no-typing time pickers for the admin. Native <select> dropdowns (a wheel
 * picker on mobile) so you pick, never type. Use `TimeInput` for hour+minute and
 * `HourInput` for hour-only. `formatTime`/`formatHour` are the single source of
 * truth for the "5:30 AM" / "5 AM" labels — no more per-page copies.
 */

const selectCls =
  "border border-input rounded-md px-2 py-1.5 text-sm bg-background cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent";

const toInt = (v: string | number): number =>
  (typeof v === "number" ? v : parseInt(v, 10)) || 0;

/** "5:30 AM" from hour + minute. */
export function formatTime(hour: string | number, minute: string | number = 0): string {
  const h = toInt(hour), m = toInt(minute);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "5 AM" hour-only label. */
export function formatHour(hour: string | number): string {
  const h = toInt(hour);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

export function TimeInput({ hour, minute, onChange, className = "" }: {
  hour: string | number;
  minute: string | number;
  onChange: (hour: string, minute: string) => void;
  className?: string;
}) {
  const h = String(toInt(hour)), m = String(toInt(minute));
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select className={selectCls} value={h} onChange={(e) => onChange(e.target.value, m)} aria-label="Hour">
        {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}</option>)}
      </select>
      <span className="text-muted-foreground">:</span>
      <select className={selectCls} value={m} onChange={(e) => onChange(h, e.target.value)} aria-label="Minute">
        {Array.from({ length: 60 }, (_, i) => <option key={i} value={i}>{String(i).padStart(2, "0")}</option>)}
      </select>
      <span className="text-sm text-muted-foreground ml-1">{formatTime(h, m)}</span>
    </div>
  );
}

export function HourInput({ hour, onChange, showLabel = true, minHour = 0, maxHour = 23, className = "" }: {
  hour: string | number;
  onChange: (hour: string) => void;
  showLabel?: boolean;
  /** Restrict the selectable range (e.g. flying hours 7–20). Defaults to 0–23. */
  minHour?: number;
  maxHour?: number;
  className?: string;
}) {
  const h = String(toInt(hour));
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <select className={selectCls} value={h} onChange={(e) => onChange(e.target.value)} aria-label="Hour">
        {Array.from({ length: maxHour - minHour + 1 }, (_, i) => i + minHour).map(i => (
          <option key={i} value={i}>{String(i).padStart(2, "0")}</option>
        ))}
      </select>
      {showLabel && <span className="text-sm text-muted-foreground ml-1">{formatHour(h)}</span>}
    </div>
  );
}
