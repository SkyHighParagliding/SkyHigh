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
