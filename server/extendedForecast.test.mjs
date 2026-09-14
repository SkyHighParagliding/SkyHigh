/**
 * Extended (7-day) site outlook tests — no network, no database.
 *
 * Run with:  node --import tsx/esm server/extendedForecast.test.mjs
 *
 * Regression cover for the bug that silently reduced the site page's "7-Day
 * Outlook" to three days. buildSiteExtendedForecast read
 * `vicNearestPoint.hourly.lifted_index[idx]` off a point from the *fine* (wind)
 * grid, which has carried no lifted index since 1815fb7. Every site threw, the
 * per-site catch in extractAllSiteExtendedForecasts logged and continued,
 * site_extended_forecasts was never written, and the stale rows then decayed one
 * day at a time as getSiteExtendedForecast filtered out past days.
 *
 * The important assertion is therefore not "seven days" — it is "a fine grid
 * that declares no lifted index does not throw".
 */

import { buildSiteExtendedForecast } from "./extendedForecast.ts";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
  }
}

const SITE_LAT = -37.2;
const SITE_LON = 143.2;

function melbDate(offset) {
  const now = new Date();
  const melb = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
  melb.setDate(melb.getDate() + offset);
  const y = melb.getFullYear();
  const m = String(melb.getMonth() + 1).padStart(2, "0");
  const d = String(melb.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * An extended grid in the shape fetchExtendedForecast stores: four slots a day
 * (07/11/15/19), starting tomorrow, running seven days out.
 */
function makeExtendedGrid() {
  const times = [];
  for (let day = 1; day <= 7; day++) {
    for (const hour of [7, 11, 15, 19]) {
      times.push(`${melbDate(day)}T${String(hour).padStart(2, "0")}:00`);
    }
  }
  const n = times.length;
  const fill = (v) => new Array(n).fill(v);
  return {
    latMin: -43.7, latMax: -33.9, lonMin: 140.0, lonMax: 151.0, delta: 0.5,
    fetchedAt: Date.now(),
    points: [{
      lat: SITE_LAT, lon: SITE_LON, times,
      windSpeed: fill(15), windGust: fill(22), windDirection: fill(270),
      temperature: fill(18), weatherCode: fill(1),
      precipitation: fill(0), precipitationProbability: fill(10),
      cloudCover: fill(30), cloudCoverLow: fill(10), visibility: fill(24000),
      cape: fill(200), liftedIndex: fill(-1), boundaryLayerHeight: fill(1400),
    }],
  };
}

/**
 * The fine (wind) grid exactly as grid/fineGrid.ts builds it — note the absence
 * of lifted_index. Hours are hourly across today and tomorrow so getTimeWindow
 * has a window to select from.
 */
function makeFineGrid() {
  const time = [];
  for (let day = 0; day <= 1; day++) {
    for (let hour = 0; hour < 24; hour++) {
      time.push(`${melbDate(day)}T${String(hour).padStart(2, "0")}:00`);
    }
  }
  const n = time.length;
  const fill = (v) => new Array(n).fill(v);
  return {
    latMin: -43.7, latMax: -33.9, lonMin: 140.0, lonMax: 151.0, delta: 0.15,
    fetchedAt: Date.now(),
    points: [{
      lat: SITE_LAT, lon: SITE_LON,
      hourly: {
        time,
        wind_speed_10m: fill(14), wind_gusts_10m: fill(20), wind_direction_10m: fill(280),
        temperature_2m: fill(17), weather_code: fill(2),
        precipitation: fill(0), precipitation_probability: fill(5),
        cloud_cover: fill(40), cloud_cover_low: fill(15), visibility: fill(24000),
        cape: fill(150), boundary_layer_height: fill(1200),
        // Deliberately no lifted_index — this is the whole point of the test.
      },
    }],
  };
}

console.log("\nExtended forecast — site outlook assembly\n");

// ─── 1. The regression itself ─────────────────────────────────────────────────
let forecast = null;
let threw = null;
try {
  forecast = buildSiteExtendedForecast(
    "test-site", SITE_LAT, SITE_LON, makeExtendedGrid(),
    undefined, makeFineGrid(), { windSpeed: "10-20", windDir: "W-NW" },
  );
} catch (e) {
  threw = e;
}

assert(threw === null, `a fine grid without lifted_index does not throw (${threw?.message ?? "no throw"})`);
assert(forecast !== null, "a forecast is returned");

// ─── 2. The symptom the user saw ──────────────────────────────────────────────
if (forecast) {
  assert(forecast.days.length === 7, `seven days are assembled, not three (got ${forecast.days.length})`);

  const dates = forecast.days.map(d => d.date);
  const sorted = [...dates].sort();
  assert(JSON.stringify(dates) === JSON.stringify(sorted), "days are in ascending date order");
  assert(new Set(dates).size === dates.length, "no duplicate days");
  assert(dates[0] === melbDate(0), `the first day is today (${dates[0]} vs ${melbDate(0)})`);
  assert(dates[6] === melbDate(6), `the last day is today+6 (${dates[6]} vs ${melbDate(6)})`);

  const today = forecast.days[0];
  assert(today.slots.length > 0, "today has slots sourced from the fine grid");
  assert(
    today.slots.every(s => s.liftedIndex === 0),
    "fine-grid slots report liftedIndex 0 rather than undefined",
  );
  assert(
    forecast.days[1].slots.every(s => Number.isFinite(s.windSpeed)),
    "tomorrow's wind speeds are finite numbers",
  );
}

// ─── 3. No fine grid at all ───────────────────────────────────────────────────
// The extended grid alone starts at tomorrow, so this is the degraded path that
// must still produce days rather than throwing on a null grid.
let noVic = null;
threw = null;
try {
  noVic = buildSiteExtendedForecast(
    "test-site", SITE_LAT, SITE_LON, makeExtendedGrid(), undefined, null, undefined,
  );
} catch (e) {
  threw = e;
}
assert(threw === null, `a null fine grid does not throw (${threw?.message ?? "no throw"})`);
assert(noVic !== null && noVic.days.length === 7, `seven days without a fine grid (got ${noVic?.days.length})`);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
