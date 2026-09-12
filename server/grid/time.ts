/**
 * The grid's time axis, defined once.
 *
 * Every provider must label its values with the same Melbourne-local strings
 * starting at the same instant, because the orchestrator merges sources by
 * matching timestamp strings. A provider that starts its axis somewhere else
 * contributes points full of holes, and the merge then trims the whole grid to
 * the overlap — silently shedding forecast hours.
 */

const MELBOURNE_FMT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Melbourne",
  year:   "numeric",
  month:  "2-digit",
  day:    "2-digit",
  hour:   "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** The persisted timestamp format: Melbourne-local `YYYY-MM-DDTHH:mm`. */
export function toMelbourneLocal(epochSec: number): string {
  const parts = MELBOURNE_FMT.formatToParts(new Date(epochSec * 1000));
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Melbourne's UTC offset in seconds at a given instant. DST-aware. */
export function melbourneOffsetSec(epochSec: number): number {
  const parts = MELBOURNE_FMT.formatToParts(new Date(epochSec * 1000));
  const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) / 1000;
  return asUtc - Math.floor(epochSec / 60) * 60;
}

/**
 * Epoch seconds of midnight Melbourne-local on the day containing `epochSec`.
 *
 * This is the axis origin for every provider. Open-Meteo's REST API — tier 1,
 * and therefore the reference the others must match — defines `forecast_days`
 * as whole local days from midnight, so anything anchored to "now" drifts from
 * it by however far into the day it is.
 *
 * Computed twice because the offset at UTC-midnight can differ from the offset
 * at local midnight across a DST boundary.
 */
export function melbourneMidnightEpoch(epochSec: number): number {
  const day = toMelbourneLocal(epochSec).slice(0, 10);
  const utcGuess = Date.parse(`${day}T00:00:00Z`) / 1000;
  let midnight = utcGuess - melbourneOffsetSec(utcGuess);
  midnight = utcGuess - melbourneOffsetSec(midnight);
  return midnight;
}

/** The axis origin for a fetch happening now. */
export function currentAxisOrigin(): number {
  return melbourneMidnightEpoch(Math.floor(Date.now() / 1000));
}
