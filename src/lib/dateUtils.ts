import { formatInTimeZone } from 'date-fns-tz';

export function formatDisplayTime(timestamp: string | Date): string {
  try {
    const date = new Date(timestamp);
    return formatInTimeZone(date, 'Australia/Melbourne', 'h:mm a');
  } catch (error) {
    console.error("Error formatting date:", error);
    return "Invalid time";
  }
}

export function formatWindMapTime(unixMs: number, is7Day: boolean): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    hour: 'numeric', minute: 'numeric', hour12: true, weekday: 'short',
    ...(is7Day ? { day: 'numeric', month: 'short' } : {}),
  }).format(unixMs);
}
