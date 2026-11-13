/** Run: node --import tsx/esm src/components/windmap/stationMarkerRenderer.test.mjs */
import assert from 'node:assert/strict';
import {
  stationAngles, stationLabel, isCalmMarker, declutter, hitTestStation, speedColorRgb, textColorFor,
} from './stationMarkerRenderer.ts';

const deg = r => Math.round(((r * 180 / Math.PI) % 360 + 360) % 360);

// dirDeg (wind FROM) -> point heading (canvas deg, 0 = east, clockwise) and flip.
// The point aims at FROM + 180.
const cases = [
  [0, 90, false], [45, 135, true], [90, 180, true], [135, 225, true],
  [180, 270, false], [225, 315, false], [270, 0, false], [315, 45, false],
];
for (const [from, canvasDeg, flip] of cases) {
  const a = stationAngles(from);
  assert.equal(deg(a.angleRad), canvasDeg, `angle for ${from}`);
  assert.equal(a.flipText, flip, `flip for ${from}`);
  // Text must never end up upside down.
  const textRot = a.angleRad + (a.flipText ? Math.PI : 0);
  assert.ok(Math.cos(textRot) > -1e-9, `upright for ${from}`);
}
assert.equal(deg(stationAngles(360).angleRad), deg(stationAngles(0).angleRad));
assert.equal(deg(stationAngles(-90).angleRad), deg(stationAngles(270).angleRad));

assert.equal(stationLabel(9.2, 12.4, 'kt'), '9 G12');
assert.equal(stationLabel(9.2, null, 'kt'), '9');
assert.equal(stationLabel(9.4, 9.4, 'kt'), '9');
assert.equal(stationLabel(9.4, 9.45, 'kt'), '9', 'gust rounding to speed is omitted');
assert.equal(stationLabel(10, 15, 'mph'), '12 G17');
assert.equal(stationLabel(10, 15, 'kph'), '19 G28');
assert.equal(stationLabel(0, null, 'kt'), '0');

assert.ok(isCalmMarker(0.3, 90, 'kt'));
assert.ok(!isCalmMarker(0.3, 90, 'kph'), '0.3 kt = 1 kph is not calm');
assert.ok(isCalmMarker(8, null, 'kt'));
assert.ok(!isCalmMarker(8, 90, 'kt'));

assert.deepEqual(speedColorRgb(0), [58, 40, 130]);
assert.deepEqual(speedColorRgb(99), [140, 20, 80]);
assert.equal(textColorFor(speedColorRgb(0)), '#ffffff');
assert.equal(textColorFor(speedColorRgb(14)), '#111827');

// Declutter: selected > site > speed; non-overlapping all kept.
const b = (id, x, extra = {}) => ({ id, x0: x, y0: 0, x1: x + 40, y1: 18, selected: false, site: false, speedKt: 5, ...extra });
let keep = declutter([b('a', 0, { speedKt: 20 }), b('b', 10, { site: true }), b('c', 20, { selected: true }), b('d', 200)]);
assert.deepEqual([...keep].sort(), ['c', 'd']);
keep = declutter([b('a', 0, { speedKt: 20 }), b('b', 10, { site: true })]);
assert.deepEqual([...keep], ['b'], 'site beats speed');
keep = declutter([b('a', 0, { speedKt: 5 }), b('b', 10, { speedKt: 12 })]);
assert.deepEqual([...keep], ['b'], 'speed breaks ties');
assert.equal(declutter([b('a', 0), b('b', 100), b('c', 200)]).size, 3);

// Hit test: box pointing down from (100,100), length 50.
const st = { id: 'x' };
const box = { station: st, x: 100, y: 100, angleRad: Math.PI / 2, lx0: 0, lx1: 50, halfH: 9, x0: 91, x1: 109, y0: 100, y1: 150 };
assert.equal(hitTestStation([box], 100, 125), st);
assert.equal(hitTestStation([box], 100, 70), null);
assert.equal(hitTestStation([box], 100, 153), st, 'slop');
assert.equal(hitTestStation([box], 125, 125), null);
console.log('stationMarkerRenderer tests passed');
