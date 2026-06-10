import type { Site } from '@/types/api';

export interface ClosureStatus {
  isClosedToday: boolean;
  upcomingDates: string[];
}

export const toMelbourneDate = (d: Date): string =>
  d.toLocaleDateString('en-CA', { timeZone: 'Australia/Melbourne' });

export function getClosureStatus(site: Site, today: Date = new Date()): ClosureStatus {
  const todayStr = toMelbourneDate(today);
  const dates = site.upcomingClosureDates ?? [];

  const isClosedToday = dates.includes(todayStr);

  const sevenDaysFromNow = new Date(today);
  sevenDaysFromNow.setDate(today.getDate() + 7);
  const sevenDaysStr = toMelbourneDate(sevenDaysFromNow);

  const upcoming = dates.filter(d => d > todayStr && d <= sevenDaysStr);

  return { isClosedToday, upcomingDates: upcoming };
}

export function formatClosureDateRange(dates: string[]): string {
  if (dates.length === 0) return '';
  const sorted = [...dates].sort();
  if (sorted.length === 1) return formatShortDate(sorted[0]);

  const isConsecutive = sorted.every((d, i) => {
    if (i === 0) return true;
    const prev = new Date(sorted[i - 1] + 'T12:00:00');
    const curr = new Date(d + 'T12:00:00');
    return (curr.getTime() - prev.getTime()) === 86400000;
  });

  if (isConsecutive) {
    return `${formatShortDate(sorted[0])} – ${formatShortDate(sorted[sorted.length - 1])}`;
  }
  return sorted.map(formatShortDate).join(', ');
}

function formatShortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

