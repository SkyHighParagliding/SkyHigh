/**
 * Camera archive tests — no network, no database, no storage.
 *
 * Run with:  node --import tsx/esm server/webcams/webcams.test.mjs
 *
 * Covers the parts that fail silently if wrong: skipping missing/unreadable
 * images from the operator's JSON, local-time to UTC conversion across the two
 * DST changes, pairing of north/south images (including a late arrival), the
 * live/overnight/stale decision, retention limits and storage keys.
 */

import { readFileSync } from "node:fs";
import { parseDayFrames, resolveImageUrl, assertJpeg } from "./airportweathercams.ts";
import { localToUtc, shiftYmd, ymdInZone, minutesOfDayInZone, isValidYmd } from "./timeUtil.ts";
import { pairByTime } from "./pairing.ts";
import { feedStatus } from "./status.ts";
import { clampRetention, retentionCutoff } from "./retention.ts";
import { frameKeyBase, variantKeys } from "./keys.ts";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.log(`  ✗ ${message}`);
    failed++;
  }
}

function throws(fn) {
  try { fn(); return false; } catch { return true; }
}

const TZ = "Australia/Melbourne";
const fixture = JSON.parse(readFileSync(new URL("./fixtures/airportweathercams-getFrames-20261008.json", import.meta.url), "utf8"));

console.log("parseDayFrames");
{
  const frames = parseDayFrames(fixture, "20261008", TZ);
  assert(Array.isArray(frames) && frames.length === 9, "fixture yields 9 usable images (3 full pairs + 3 single sides)");
  assert(frames.every(f => f.camera === "north" || f.camera === "south"), "cameras are north/south");
  assert(!frames.some(f => f.path.includes("P26100807420010")), "unreadable south image is skipped");
  assert(frames.filter(f => f.camera === "north").length === 4, "north: 4 usable (missing ones skipped)");
  assert(frames.filter(f => f.camera === "south").length === 5, "south: 5 usable");
  const first = frames[0];
  assert(first.capturedAt.toISOString() === "2026-10-07T19:00:00.000Z", "06:00:00 AEDT is 19:00:00Z the previous UTC day");
  assert(frames.every((f, i) => i === 0 || frames[i - 1].capturedAt <= f.capturedAt), "sorted oldest first");
  assert(parseDayFrames({}, "20261008", TZ) === null, "object without frames -> null");
  assert(parseDayFrames(null, "20261008", TZ) === null, "null -> null");
  assert(parseDayFrames({ frames: [] }, "20261008", TZ).length === 0, "empty day -> empty list");
  const wrongDay = { frames: [{ north: "Camera1/20261007/images/P26100706000010.jpg", north_time: "06:00:00", north_status: "ok" }] };
  assert(parseDayFrames(wrongDay, "20261008", TZ).length === 0, "path from another day is rejected");
  const bad = { frames: [{ north: "../../etc/passwd.jpg", north_time: "06:00:00", north_status: "ok" }, { north: "Camera1/20261008/images/x.php", north_time: "06:00:00", north_status: "ok" }] };
  assert(parseDayFrames(bad, "20261008", TZ).length === 0, "traversal and non-jpg paths are rejected");
  const dup = { frames: [fixture.frames[0], fixture.frames[0]] };
  assert(parseDayFrames(dup, "20261008", TZ).length === 2, "duplicate entries collapse to one image per camera");
}

console.log("resolveImageUrl / assertJpeg");
{
  const p = "Camera1/20261008/images/P26100806000010.jpg";
  assert(resolveImageUrl("https://au2.example.com/Flowerdale/", p) === "https://au2.example.com/Flowerdale/" + p, "joins base and path");
  assert(resolveImageUrl("https://au2.example.com/Flowerdale", p) === "https://au2.example.com/Flowerdale/" + p, "base without trailing slash");
  assert(throws(() => resolveImageUrl("https://au2.example.com/Flowerdale/", "//evil.com/a.jpg")), "protocol-relative path rejected");
  assert(throws(() => resolveImageUrl("https://au2.example.com/Flowerdale/", "Camera1/20261008/images/../../x.jpg")), "dot-dot rejected");
  const ok = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(20000, 1), Buffer.from([0xff, 0xd9])]);
  assert(!throws(() => assertJpeg(ok)), "well-formed jpeg accepted");
  assert(throws(() => assertJpeg(Buffer.alloc(500))), "tiny file rejected");
  assert(throws(() => assertJpeg(Buffer.concat([Buffer.from([0x89, 0x50]), Buffer.alloc(20000)]))), "non-jpeg rejected");
  assert(throws(() => assertJpeg(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(20000, 1)]))), "truncated jpeg rejected");
}

console.log("time helpers");
{
  assert(localToUtc("20261003", "06:00:00", TZ).toISOString() === "2026-10-02T20:00:00.000Z", "3 Oct 06:00 is AEST (+10)");
  assert(localToUtc("20261004", "06:00:00", TZ).toISOString() === "2026-10-03T19:00:00.000Z", "4 Oct 06:00 is AEDT (+11): DST has started");
  assert(localToUtc("20260404", "12:00:00", TZ).toISOString() === "2026-04-04T01:00:00.000Z", "4 Apr noon is still AEDT");
  assert(localToUtc("20260405", "12:00:00", TZ).toISOString() === "2026-04-05T02:00:00.000Z", "5 Apr noon is AEST: DST has ended");
  assert(ymdInZone(new Date("2026-10-07T19:30:00Z"), TZ) === "20261008", "19:30Z is already the next day in Melbourne");
  assert(minutesOfDayInZone(new Date("2026-10-07T19:30:00Z"), TZ) === 390, "06:30 local = 390 min");
  assert(minutesOfDayInZone(new Date("2026-10-07T13:00:00Z"), TZ) === 0, "midnight local = 0 min");
  assert(shiftYmd("20261001", -1) === "20260930", "month boundary");
  assert(shiftYmd("20260101", -1) === "20251231", "year boundary");
  assert(shiftYmd("20260228", 1) === "20260301", "non-leap Feb");
  assert(isValidYmd("20261008") && !isValidYmd("20261308") && !isValidYmd("2026-10-08") && !isValidYmd("20260230"), "ymd validation");
}

console.log("pairByTime");
{
  const mk = (camera, iso) => ({ camera, ts: new Date(iso).getTime() });
  const items = [
    mk("north", "2026-10-08T00:05:59Z"), mk("south", "2026-10-08T00:06:00Z"),
    mk("south", "2026-10-08T00:11:59Z"),
    mk("north", "2026-10-08T00:00:00Z"), mk("south", "2026-10-08T00:00:00Z"),
  ];
  const groups = pairByTime(items);
  assert(groups.length === 3, "three time slots");
  assert(groups[0].frames.north && groups[0].frames.south, "first slot has both");
  assert(groups[1].frames.north && groups[1].frames.south, "1-second offset still pairs");
  assert(!groups[2].frames.north && groups[2].frames.south, "south-only slot stays single");
  const late = pairByTime([...items, mk("north", "2026-10-08T00:12:00Z")]);
  assert(late.length === 3 && late[2].frames.north, "a late north image joins its slot");
  const far = pairByTime([mk("north", "2026-10-08T00:00:00Z"), mk("south", "2026-10-08T00:06:00Z")]);
  assert(far.length === 2, "six minutes apart do not pair");
  assert(pairByTime([]).length === 0, "empty input");
}

console.log("feedStatus");
{
  const base = { tz: TZ, expectFromMin: 360, expectToMin: 1100 };
  const at = (iso) => new Date(iso);
  assert(feedStatus({ ...base, newest: null, now: at("2026-10-08T02:00:00Z") }) === "offline", "no images -> offline");
  assert(feedStatus({ ...base, newest: at("2026-10-08T01:50:00Z"), now: at("2026-10-08T02:00:00Z") }) === "live", "10 min old -> live");
  assert(feedStatus({ ...base, newest: at("2026-10-08T00:00:00Z"), now: at("2026-10-08T02:00:00Z") }) === "stale", "2 h old at 13:00 local -> stale");
  assert(feedStatus({ ...base, newest: at("2026-10-07T07:00:00Z"), now: at("2026-10-07T16:00:00Z") }) === "overnight", "03:00 local, last image hours ago -> overnight");
  assert(feedStatus({ ...base, newest: at("2026-10-07T07:00:00Z"), now: at("2026-10-07T19:10:00Z") }) === "overnight", "06:10 local is inside the morning grace");
  assert(feedStatus({ ...base, newest: at("2026-10-07T07:00:00Z"), now: at("2026-10-07T19:40:00Z") }) === "stale", "06:40 local with no new image -> stale");
  assert(feedStatus({ ...base, newest: at("2026-10-05T07:00:00Z"), now: at("2026-10-08T16:00:00Z") }) === "stale", "days-old image at night -> stale, not overnight");
}

console.log("retention");
{
  assert(clampRetention(undefined) === 90 && clampRetention("abc") === 90 && clampRetention(null) === 90, "unset/invalid -> 90");
  assert(clampRetention(3) === 7 && clampRetention("0") === 7 && clampRetention(-5) === 7, "never below 7 days");
  assert(clampRetention("120") === 120 && clampRetention(45.9) === 45, "valid values kept (floored)");
  const now = new Date("2026-10-08T12:00:00Z");
  assert(retentionCutoff(now, 90).toISOString() === "2026-07-10T12:00:00.000Z", "90 days back");
  assert(retentionCutoff(now, 1).toISOString() === "2026-10-01T12:00:00.000Z", "a 1-day setting still keeps 7 days");
  const DAY = 24 * 60 * 60 * 1000;
  const cutoff90 = retentionCutoff(now, 90);
  const expired = d => new Date(now.getTime() - d * DAY) < cutoff90;
  assert(!expired(89) && !expired(90) && expired(91), "frames 89 and 90 days old are kept, 91 days old expires");
  assert(!(new Date(now.getTime() - 6 * DAY) < retentionCutoff(now, 0)), "6-day-old frames survive even a 0-day setting");
}

console.log("keys");
{
  const base = frameKeyBase("three-sisters-flowerdale", "20261008", "north", "06:05:59");
  assert(base === "webcams/three-sisters-flowerdale/20261008/north-060559", "key base format");
  const k = variantKeys(base);
  assert(k.thumb.endsWith("-thumb.jpg") && k.medium.endsWith("-medium.jpg") && k.original.endsWith("-orig.jpg"), "variant suffixes");
  assert(frameKeyBase("a/b ../c", "20261008", "south", "17:00:00") === "webcams/a_b____c/20261008/south-170000", "site id is sanitised");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
