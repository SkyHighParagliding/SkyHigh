/** Time helpers for the camera pages. All times are shown in the camera site's own time zone. */

export function ymdInZone(when: Date | number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(when)
    .replace(/-/g, "");
}

export function shiftYmd(ymd: string, days: number): string {
  const t = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8) + days));
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, "0")}${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function minutesOfDay(when: Date | number, tz: string): number {
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(when)
    .forEach(x => { p[x.type] = x.value; });
  return (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10);
}

/** "2:05 pm" */
export function formatClock(when: Date | number | string, tz: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true })
    .format(new Date(when))
    .replace(/\s?([ap])m/i, (_, x: string) => ` ${x.toLowerCase()}m`);
}

/** "Thu 8 Oct" for a YYYYMMDD calendar day. */
export function formatDayShort(ymd: string): string {
  const d = new Date(Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6, 8)));
  const p: Record<string, string> = {};
  new Intl.DateTimeFormat("en-AU", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" })
    .formatToParts(d)
    .forEach(x => { p[x.type] = x.value; });
  return `${p.weekday} ${p.day} ${p.month}`;
}

/** "HHMM" in the site's time zone, used in shareable links. */
export function hhmmInZone(when: Date | number, tz: string): string {
  const m = minutesOfDay(when, tz);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(hhmm: string): number | null {
  if (!/^\d{4}$/.test(hhmm)) return null;
  const h = +hhmm.slice(0, 2), m = +hhmm.slice(2);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** "just now", "6 min ago", "2 h 10 min ago", "3 days ago" */
export function ageText(when: Date | number | string, nowMs: number): string {
  const diff = Math.max(0, nowMs - new Date(when).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return mins % 60 === 0 ? `${hours} h ago` : `${hours} h ${mins % 60} min ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/** Index of the item whose time is closest to targetMs, or -1 when none is within maxDiffMs. */
export function nearestIndex(times: number[], targetMs: number, maxDiffMs = Infinity): number {
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(times[i] - targetMs);
    if (diff < bestDiff) { best = i; bestDiff = diff; }
  }
  return bestDiff <= maxDiffMs ? best : -1;
}

/** Index of the item whose local time of day is closest to targetMinutes, or -1 when none is within maxDiffMin. */
export function nearestByMinuteOfDay(times: number[], tz: string, targetMinutes: number, maxDiffMin = Infinity): number {
  let best = -1;
  let bestDiff = Infinity;
  for (let i = 0; i < times.length; i++) {
    const diff = Math.abs(minutesOfDay(times[i], tz) - targetMinutes);
    if (diff < bestDiff) { best = i; bestDiff = diff; }
  }
  return bestDiff <= maxDiffMin ? best : -1;
}
