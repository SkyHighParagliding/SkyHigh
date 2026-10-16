import { fromZonedTime } from "date-fns-tz";

/** Calendar date (YYYYMMDD) of an instant in the given IANA time zone. */
export function ymdInZone(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d)
    .replace(/-/g, "");
}

/** Whole-day calendar arithmetic on a YYYYMMDD string (no time zone involved). */
export function shiftYmd(ymd: string, days: number): string {
  const t = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + days));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function isValidYmd(s: string): boolean {
  if (!/^\d{8}$/.test(s)) return false;
  const y = +s.slice(0, 4), m = +s.slice(4, 6), d = +s.slice(6, 8);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * Station wall-clock time (YYYYMMDD + HH:MM:SS) to a UTC instant. DST-aware by
 * default; with ignoreDst the clock is read at the zone's standard offset all
 * year (for a camera whose clock is never moved for daylight saving).
 */
export function localToUtc(ymd: string, hms: string, tz: string, ignoreDst = false): Date {
  const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}T${hms}`;
  if (!ignoreDst) return fromZonedTime(iso, tz);
  const year = +ymd.slice(0, 4);
  return new Date(Date.parse(`${iso}Z`) - standardOffsetMs(year, tz));
}

/** The zone's standard (non-DST) UTC offset: the smaller of its January and July offsets. */
function standardOffsetMs(year: number, tz: string): number {
  const offsetAt = (mm: string) => Date.parse(`${year}-${mm}-01T12:00:00Z`) - fromZonedTime(`${year}-${mm}-01T12:00:00`, tz).getTime();
  return Math.min(offsetAt("01"), offsetAt("07"));
}

/** Minutes since local midnight of an instant in the given time zone. */
export function minutesOfDayInZone(d: Date, tz: string): number {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(d)
    .forEach(x => { p[x.type] = x.value; });
  return (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10);
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-AU", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
