/**
 * Pure helpers behind the live-station card and its 6 h chart.
 * Run: node --import tsx/esm src/components/windmap/stationCard.test.mjs
 */
import {
  windAtPoint, minutesAgo, fmtAgo, fmtObs, niceMax, hourTicks, fmtHourTick, splitRuns,
} from './StationHistoryChart.tsx';

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`); }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── minutesAgo / fmtAgo ──
const now = Date.parse('2026-11-13T05:00:00Z');
check('minutesAgo 12', minutesAgo('2026-11-13T04:48:00Z', now) === 12);
check('minutesAgo future clamps to 0', minutesAgo('2026-11-13T05:03:00Z', now) === 0);
check('minutesAgo bad', Number.isNaN(minutesAgo('nope', now)));
check('fmtAgo 0', fmtAgo(0) === 'just now');
check('fmtAgo 12', fmtAgo(12) === '12 min ago');
check('fmtAgo 60', fmtAgo(60) === '1 h ago');
check('fmtAgo 125', fmtAgo(125) === '2 h 5 min ago');
check('fmtAgo NaN', fmtAgo(NaN) === '');

// ── fmtObs ──
let o = fmtObs(9.2, 12.4, 'kt');
check('obs kt', o.speed === '9' && o.gust === '12' && !o.calm, o);
o = fmtObs(9, 9.3, 'kt');
check('gust equal to speed hidden', o.gust === null, o);
o = fmtObs(9, null, 'kt');
check('no gust', o.gust === null, o);
o = fmtObs(0.4, null, 'kt');
check('calm', o.calm === true, o);
o = fmtObs(0.4, 3, 'kt');
check('not calm when gusting', o.calm === false && o.gust === '3', o);
o = fmtObs(10, 20, 'kph');
check('kph', o.speed === '19' && o.gust === '37', o);
o = fmtObs(10, null, 'mph');
check('mph', o.speed === '12', o);

// ── niceMax ──
check('niceMax 0', niceMax(0) === 10);
check('niceMax 7', niceMax(7) === 10);
check('niceMax 12', niceMax(12) === 15);
check('niceMax 30', niceMax(30) === 30);
check('niceMax 31', niceMax(31) === 40);

// ── hourTicks / fmtHourTick ──
const start = Date.parse('2026-11-13T00:30:00Z'), end = start + 6 * 3600000;
const ticks = hourTicks(start, end);
check('6 h → 6 ticks', ticks.length === 6, ticks.length);
check('ticks on whole hours', ticks.every(t => t % 3600000 === 0));
// 2026-11-13T04:00Z = 3 pm AEDT (UTC+11).
const t3pm = Date.parse('2026-11-13T04:00:00Z');
check('12 h tick', fmtHourTick(t3pm, false) === '3pm', fmtHourTick(t3pm, false));
check('24 h tick', fmtHourTick(t3pm, true) === '15:00', fmtHourTick(t3pm, true));

// ── splitRuns ──
const runs = splitRuns([{ t: 0 }, { t: 30 * 60000 }, { t: 60 * 60000 }, { t: 200 * 60000 }]);
check('split at gap', runs.length === 2 && runs[0].length === 3 && runs[1].length === 1, runs.map(r => r.length));
check('splitRuns empty', splitRuns([]).length === 0);

// ── windAtPoint ──
// Uniform 2×2 grid, 2 times. Wind FROM the west at 10 kt: u = +S, v = 0.
const S = 10 * 0.514444;
const field = [[{ u: S, v: 0 }, { u: S, v: 0 }], [{ u: S, v: 0 }, { u: S, v: 0 }]];
const grid = {
  lonMin: 144, lonMax: 146, latMin: -39, latMax: -37, deltaLon: 2, deltaLat: 2, ni: 2, nj: 2,
  times: ['2026-11-13T00:00:00Z', '2026-11-13T06:00:00Z'],
  data: [field.flat(), field.flat()],
};
const mid = Date.parse('2026-11-13T03:00:00Z');
const w = windAtPoint(145, -38, mid, grid);
check('wind speed kt', w && near(w.speedKt, 10, 1e-3), w);
check('wind from west = 270', w && near(w.dirDeg, 270, 1e-6), w);
check('strict time outside grid → null', windAtPoint(145, -38, Date.parse('2026-11-14T00:00:00Z'), grid, true) === null);
check('non-strict clamps', windAtPoint(145, -38, Date.parse('2026-11-14T00:00:00Z'), grid) !== null);
check('outside area → null', windAtPoint(150, -38, mid, grid) === null);
check('no grid → null', windAtPoint(145, -38, mid, null) === null);

console.log(`stationCard: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
