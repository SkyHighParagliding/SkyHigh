/**
 * Camera page time helpers — no network.
 *
 * Run with:  node --import tsx/esm src/lib/webcamTime.test.mjs
 */

import {
  ymdInZone, shiftYmd, minutesOfDay, formatClock, formatDayShort, hhmmInZone, hhmmToMinutes,
  ageText, nearestIndex, nearestByMinuteOfDay,
} from "./webcamTime.ts";

let passed = 0;
let failed = 0;
function assert(condition, message) {
  if (condition) { console.log(`  ✓ ${message}`); passed++; }
  else { console.log(`  ✗ ${message}`); failed++; }
}

const TZ = "Australia/Melbourne";
const at = (iso) => new Date(iso).getTime();

console.log("calendar and clock");
assert(ymdInZone(at("2026-10-07T19:30:00Z"), TZ) === "20261008", "19:30Z is the next day in Melbourne");
assert(shiftYmd("20261001", -1) === "20260930" && shiftYmd("20260101", -1) === "20251231", "shiftYmd month/year");
assert(minutesOfDay(at("2026-10-07T19:30:00Z"), TZ) === 390, "minutes of day");
assert(formatClock(at("2026-10-08T04:05:00Z"), TZ) === "3:05 pm", "formatClock afternoon");
assert(formatClock(at("2026-10-07T19:00:00Z"), TZ) === "6:00 am", "formatClock morning");
assert(formatDayShort("20261008") === "Thu 8 Oct", "formatDayShort");
assert(hhmmInZone(at("2026-10-08T04:05:00Z"), TZ) === "1505", "hhmm");
assert(hhmmToMinutes("1505") === 905 && hhmmToMinutes("2460") === null && hhmmToMinutes("15:05") === null, "hhmmToMinutes");

console.log("ageText");
const now = at("2026-10-08T05:00:00Z");
assert(ageText(now - 30_000, now) === "just now", "under 2 min");
assert(ageText(now - 6 * 60_000, now) === "6 min ago", "minutes");
assert(ageText(now - 130 * 60_000, now) === "2 h 10 min ago", "hours and minutes");
assert(ageText(now - 120 * 60_000, now) === "2 h ago", "whole hours");
assert(ageText(now - 30 * 3600_000, now) === "yesterday", "yesterday");
assert(ageText(now - 3 * 24 * 3600_000, now) === "3 days ago", "days");

console.log("nearest");
const times = [at("2026-10-08T00:00:00Z"), at("2026-10-08T00:06:00Z"), at("2026-10-08T00:12:00Z")];
assert(nearestIndex(times, at("2026-10-08T00:07:00Z")) === 1, "closest by instant");
assert(nearestIndex(times, at("2026-10-08T03:00:00Z"), 45 * 60_000) === -1, "too far -> -1");
assert(nearestIndex([], 0) === -1, "empty -> -1");
const yesterday = [at("2026-10-06T20:00:00Z"), at("2026-10-07T04:00:00Z"), at("2026-10-07T06:00:00Z")];
assert(nearestByMinuteOfDay(yesterday, TZ, 15 * 60, 45) === 1, "same local time of day on another date (15:00)");
assert(nearestByMinuteOfDay(yesterday, TZ, 3 * 60, 45) === -1, "nothing near 03:00");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
