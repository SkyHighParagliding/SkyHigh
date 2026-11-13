/**
 * Live stations tests: no network, no database.
 * Run with:  node --import tsx/esm server/stations/stations.test.mjs
 */
import { readFileSync } from "node:fs";
import { parseBomStation } from "./bomParse.ts";
import { keepSiteStation, haversineKm, siteAttribution, unchangedSince } from "./siteStations.ts";

let passed = 0;
let failed = 0;
function assert(c, m) { if (c) { console.log(`  ok ${m}`); passed++; } else { console.log(`  FAIL ${m}`); failed++; } }

const json = JSON.parse(readFileSync(new URL("./fixtures/IDV60801.94860.json", import.meta.url), "utf8"));
const first = json.observations.data[0];

console.log("BOM parser (Kilmore Gap fixture)");
const p = parseBomStation(json);
assert(p && p.name === "Kilmore Gap", "name from header");
assert(p.lat === -37.4 && p.lon === 145.0, "lat/lon from data row");
assert(p.latest.t === "2026-11-13T02:30:00.000Z", "latest timestamp: 13:30 AEDT -> 02:30Z");
assert(p.latest.speedKt === first.wind_spd_kt && p.latest.gustKt === 15, "latest speed/gust");
assert(p.latest.pressureHpa === 1016.2, "QNH preferred");
assert(p.latest.tempC === 13.1 && p.latest.humidityPct === 98, "temp + humidity");
assert(p.history.length > 6 && p.history.length < json.observations.data.length, "history trimmed to 6 h");
const span = Date.parse(p.history.at(-1).t) - Date.parse(p.history[0].t);
assert(span <= 6 * 3600_000 && span > 5 * 3600_000, "history spans about 6 h");
assert(p.history.every((x, i, a) => i === 0 || Date.parse(x.t) > Date.parse(a[i - 1].t)), "history oldest first, no duplicates");
assert(p.history.at(-1).t === p.latest.t, "history ends at latest");

console.log("Calm / gust null / junk");
const calm = parseBomStation({ observations: { header: [{ name: "X" }], data: [
  { local_date_time_full: "20261113133000", wind_spd_kt: 0, gust_kt: null, wind_dir: "CALM", lat: -37, lon: 145 },
  { local_date_time_full: "20261113130000", wind_spd_kt: null, wind_dir: "-" },
] } });
assert(calm.latest.speedKt === 0 && calm.latest.dirDeg === null, "calm -> speed 0, dir null");
assert(calm.latest.gustKt === null, "missing gust -> null");
assert(calm.history.length === 1, "row with null speed skipped");
assert(parseBomStation({ observations: { data: [] } }) === null, "empty data -> null");
assert(parseBomStation({}) === null, "garbage -> null");
const nodir = parseBomStation({ observations: { data: [{ local_date_time_full: "20261113133000", wind_spd_kt: 5, wind_dir: "-" }] } });
assert(nodir.latest.dirDeg === null && nodir.latest.speedKt === 5, "unknown dir with wind -> null dir");
const sw = parseBomStation({ observations: { data: [{ local_date_time_full: "20261113133000", wind_spd_kt: 5, wind_dir: "SSW" }] } });
assert(sw.latest.dirDeg === 202.5, "SSW -> 202.5");

console.log("Site station dedupe");
const bom = [{ lat: -37.4, lon: 145.0 }];
assert(haversineKm(-37.4, 145.0, -37.4, 145.0) === 0, "haversine zero");
assert(Math.abs(haversineKm(-37.0, 145.0, -38.0, 145.0) - 111.2) < 0.5, "haversine 1 degree lat ~111 km");
assert(keepSiteStation({ id: "livewind-1", lat: -37.4, lon: 145.001 }, bom) === false, "~90 m from BOM dropped");
assert(keepSiteStation({ id: "livewind-1", lat: -37.4, lon: 145.01 }, bom) === true, "~900 m from BOM kept");
assert(keepSiteStation({ id: "bom-IDV60801-94860", lat: -30, lon: 140 }, bom) === false, "bom- prefix dropped");
assert(keepSiteStation({ id: "livewind-94853", lat: -30, lon: 140 }, [{ lat: -38.3, lon: 144.8, stationNum: "94853" }]) === false, "livewind copy of a BOM station dropped by number");
assert(keepSiteStation({ id: "livewind-2010", lat: -30, lon: 140 }, [{ lat: -38.3, lon: 144.8, stationNum: "94853" }]) === true, "livewind non-BOM station kept");
assert(siteAttribution("livewind-9") === "LiveWind" && siteAttribution("IFLINDER3") === "Weather Underground", "attribution by prefix");

console.log("Unchanged (possibly stuck) readings");
const M = 60_000, T0 = Date.parse("2026-11-13T03:00:00Z");
// Newest first, one reading every 20 min.
const run = (vals) => vals.map((v, i) => ({ t: T0 - i * 20 * M, speed: v[0], gust: v[1], dir: v[2] }));
const W = [9, 12, "NW"];
assert(unchangedSince(run([W, W, W, W, [7, 10, "NW"]])) === null, "4 same over 60 min: not flagged");
assert(unchangedSince(run([W, W, W, W, W, [7, 10, "NW"]])) === T0 - 80 * M, "5 same over 80 min: flagged from the oldest same reading");
assert(unchangedSince(run([[0, 0, "N"], [0, 0, "N"], [0, 0, "N"], [0, 0, "N"], [0, 0, "N"], [0, 0, "N"]])) === null, "calm never flagged");
assert(unchangedSince(run([W, [9, 13, "NW"], W, W, W, W])) === null, "gust change breaks the run");
assert(unchangedSince(run([W, [9, 12, "WNW"], W, W, W, W])) === null, "direction change breaks the run");
assert(unchangedSince(run([["9.0", "12", "NW"], W, W, W, W])) === T0 - 80 * M, "numeric strings from PG compare as numbers");
assert(unchangedSince([{ t: T0, speed: 9, gust: 12, dir: "NW" }, { t: T0 - 200 * M, speed: 9, gust: 12, dir: "NW" }]) === null, "2 readings over a long gap: too few");
assert(unchangedSince([]) === null, "no readings");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
