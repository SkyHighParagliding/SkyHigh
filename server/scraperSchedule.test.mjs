/**
 * Live-weather poll schedule tests (pure, no I/O).
 * Run with:  node --import tsx/esm server/scraperSchedule.test.mjs
 */
import { nextPollMinutes, minutesUntilHour, DEFAULT_NIGHT_INTERVAL_MIN } from "./scraperSchedule.ts";

let passed = 0;
let failed = 0;
function assert(c, m) { if (c) { console.log(`  ok ${m}`); passed++; } else { console.log(`  FAIL ${m}`); failed++; } }

const lo = () => 0;          // random() at its lowest
const hi = () => 0.999999;   // random() at its highest
const base = { min: 14, max: 15, nightIntervalMin: 60, minutesToStart: 300 };

console.log("Daytime");
assert(nextPollMinutes({ ...base, inHours: true, random: lo }) === 14, "in hours: min");
assert(nextPollMinutes({ ...base, inHours: true, random: hi }) === 15, "in hours: max");
assert(nextPollMinutes({ ...base, inHours: true, min: 1, max: 2, random: hi }) === 2, "FFWX 1-2 min");

console.log("Overnight");
assert(DEFAULT_NIGHT_INTERVAL_MIN === 60, "default overnight interval is 60 min");
assert(nextPollMinutes({ ...base, inHours: false, random: lo }) === 55, "overnight: 55 at the low end");
assert(nextPollMinutes({ ...base, inHours: false, random: hi }) === 60, "overnight: 60 at the high end");
assert(nextPollMinutes({ ...base, inHours: false, minutesToStart: 20, random: lo }) === 20, "capped at the start of operating hours");
assert(nextPollMinutes({ ...base, inHours: false, minutesToStart: 20, random: hi }) === 22, "start-of-day poll 0-2 min after the start hour");
assert(nextPollMinutes({ ...base, inHours: false, minutesToStart: 0, random: lo }) >= 1, "never 0 minutes");
assert(nextPollMinutes({ ...base, inHours: false, nightIntervalMin: 3, random: lo }) === 1, "tiny overnight interval stays >= 1");

console.log("Overnight off");
assert(nextPollMinutes({ ...base, inHours: false, nightIntervalMin: 0, random: hi }) === 15, "0 = off: wakes at the daytime gap to re-check");
assert(nextPollMinutes({ ...base, inHours: false, nightIntervalMin: NaN, random: lo }) === 14, "NaN treated as off");

console.log("Bad min/max");
assert(nextPollMinutes({ ...base, inHours: true, min: 10, max: 5, random: hi }) === 10, "max below min uses min");
assert(nextPollMinutes({ ...base, inHours: true, min: 0, max: 0, random: hi }) === 1, "zero min/max -> 1 minute");

console.log("minutesUntilHour");
assert(minutesUntilHour(4, 40, 5) === 20, "04:40 -> 05:00 is 20 min");
assert(minutesUntilHour(21, 0, 5) === 480, "21:00 -> 05:00 is 8 h");
assert(minutesUntilHour(23, 59, 5) === 301, "23:59 -> 05:00 wraps midnight");
assert(minutesUntilHour(0, 0, 5) === 300, "00:00 -> 05:00");
assert(minutesUntilHour(5, 0, 5) === 1440, "exactly at the start hour -> next day");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
