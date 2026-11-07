import { formatInTimeZone } from 'date-fns-tz';

export function formatDisplayTime(timestamp: string | Date): string {
  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "Invalid time";
    return formatInTimeZone(date, 'Australia/Melbourne', 'h:mm a');
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid time";
  }
}

export function formatWindMapTime(unixMs: number, is7Day: boolean, use24h = false): string {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric', minute: 'numeric', hour12: !use24h, weekday: 'short', day: 'numeric',
  }).formatToParts(unixMs);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  const clock = `${get('hour')}:${get('minute')}${use24h ? '' : ` ${get('dayPeriod')}`}`;
  // 7-day: "Wed 11, 11:00 am" — the date (no month) tells next Sat from this Sat;
  // the comma keeps "11 11:00" from reading as one number. 3-day: "Sat 1:18 pm".
  return is7Day ? `${get('weekday')} ${get('day')}, ${clock}` : `${get('weekday')} ${clock}`;
}

/** Clock-only Melbourne time (no weekday) for compact labels like the radar frame. */
export function formatClockTime(unixMs: number, use24h = false): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric', minute: '2-digit', hour12: !use24h,
  }).format(unixMs);
}
