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
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric', minute: 'numeric', hour12: !use24h, weekday: 'short',
    ...(is7Day ? { day: 'numeric', month: 'short' } : {}),
  }).format(unixMs);
}

/** Clock-only Melbourne time (no weekday) for compact labels like the radar frame. */
export function formatClockTime(unixMs: number, use24h = false): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric', minute: '2-digit', hour12: !use24h,
  }).format(unixMs);
}
