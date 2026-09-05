import * as SunCalc from 'suncalc';

export interface CivilTwilight {
  dawn: string; // "06:10" local 24h
  dusk: string; // "18:28" local 24h
}

const TZ = 'Australia/Melbourne';

function fmt(date: Date): string {
  return date.toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  });
}

export function getCivilTwilight(lat: number, lon: number, date = new Date()): CivilTwilight | null {
  if (!lat || !lon) return null;
  const t = SunCalc.getTimes(date, lat, lon);
  if (isNaN(t.dawn.getTime()) || isNaN(t.dusk.getTime())) return null;
  return { dawn: fmt(t.dawn), dusk: fmt(t.dusk) };
}
