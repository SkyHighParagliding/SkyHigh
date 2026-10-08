import { minutesOfDayInZone } from "./timeUtil.js";

export type FeedStatus = "live" | "overnight" | "stale" | "offline";

const FRESH_MS = 20 * 60 * 1000;
const GRACE_MIN = 20;
const LONG_GAP_MS = 36 * 60 * 60 * 1000;

/**
 * live       — newest image is recent
 * overnight  — outside the hours the cameras capture, so no new image is expected
 * stale      — images are expected right now but the newest one is old
 * offline    — nothing archived yet
 */
export function feedStatus(opts: {
  newest: Date | null;
  now: Date;
  tz: string;
  expectFromMin: number;
  expectToMin: number;
}): FeedStatus {
  const { newest, now, tz, expectFromMin, expectToMin } = opts;
  if (!newest) return "offline";
  const age = now.getTime() - newest.getTime();
  if (age <= FRESH_MS) return "live";
  if (age > LONG_GAP_MS) return "stale";
  const minutes = minutesOfDayInZone(now, tz);
  if (minutes < expectFromMin + GRACE_MIN || minutes > expectToMin) return "overnight";
  return "stale";
}
