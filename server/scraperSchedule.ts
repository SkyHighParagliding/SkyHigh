/**
 * When the next live-weather poll for a source should run (pure, no I/O).
 *
 * Inside operating hours: a random gap between the source's min and max.
 * Outside them: one poll about every `nightIntervalMin` (random in the last
 * 5 minutes of it), but never later than the start of operating hours, so the
 * first daytime poll isn't up to an hour late. `nightIntervalMin` <= 0 means
 * overnight polling is off: the loop just wakes every min..max to re-check.
 */
export const DEFAULT_NIGHT_INTERVAL_MIN = 60;

export interface ScheduleInput {
  inHours: boolean;
  min: number;
  max: number;
  nightIntervalMin: number;
  /** Minutes from now until operating hours start (only used outside hours). */
  minutesToStart: number;
  random?: () => number;
}

function randBetween(lo: number, hi: number, random: () => number): number {
  if (hi < lo) hi = lo;
  return Math.floor(random() * (hi - lo + 1)) + lo;
}

export function nextPollMinutes(i: ScheduleInput): number {
  const random = i.random ?? Math.random;
  const min = Math.max(1, i.min || 1);
  const max = Math.max(min, i.max || min);
  if (i.inHours || !(i.nightIntervalMin > 0)) return randBetween(min, max, random);
  const night = randBetween(Math.max(1, i.nightIntervalMin - 5), i.nightIntervalMin, random);
  // Start-of-day poll lands 0-2 min after operating hours begin.
  const toStart = Math.max(1, i.minutesToStart + randBetween(0, 2, random));
  return Math.min(night, toStart);
}

/** Minutes from (hour, minute) until startHour:00 the same or next day. */
export function minutesUntilHour(hour: number, minute: number, startHour: number): number {
  const d = (startHour * 60 - (hour * 60 + minute)) % 1440;
  return d <= 0 ? d + 1440 : d;
}
