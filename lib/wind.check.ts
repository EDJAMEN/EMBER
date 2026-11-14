// Self-check: npx tsx lib/wind.check.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeGrib2 } from "./grib2";
import { WIND_SCALE, keepBox, sampleWind, spreadEllipse, windRgb, windVector } from "./wind";

// A westerly (from 270°) blows toward the east.
const w = windVector(20, 270);
assert.ok(w.u > 19.9 && Math.abs(w.v) < 1e-9, "westerly → +u");

// Fire under a 20 km/h westerly: head ends up east of it, ~2 km after 1 h (10 % rule), longer than wide.
const e = spreadEllipse(8, 125, [{ speedKmh: 20, dirFrom: 270 }], 1)!;
assert.ok(e.head[0] > 125 && Math.abs(e.head[1] - 8) < 1e-6, "head downwind (east)");
assert.ok(Math.abs(e.headKm - 2) < 1e-9, "head = 10 % of wind × hours");
assert.ok(Math.round(e.towardDeg) === 90, "toward east");
const lngs = e.polygon.coordinates[0]!.map((p) => p[0]!);
assert.ok(Math.min(...lngs) < 125, "a little back-spread upwind");

// A wind turning from northerly to southerly over 2 h cancels out: almost no push.
const calm = spreadEllipse(8, 125, [{ speedKmh: 20, dirFrom: 0 }, { speedKmh: 20, dirFrom: 180 }], 2)!;
assert.ok(calm.meanSpeed < 1e-9, "opposite winds average to calm");

// Global field: bilinear, wraps across the dateline (lng 359.5 sits between columns 359 and 0).
const ni = 360, nj = 3;
const u = new Float32Array(ni * nj).fill(0), v = new Float32Array(ni * nj).fill(0);
for (let y = 0; y < nj; y++) { u[y * ni + 359] = 10; u[y * ni + 0] = 20; }
const field = { ni, nj, lat1: 1, lng1: 0, step: 1, u, v };
assert.ok(Math.abs(sampleWind(field, 0, 359.5).u - 15 * 3.6) < 1e-6, "wraps at the dateline");
assert.ok(Math.abs(sampleWind(field, 0, -0.5).u - 15 * 3.6) < 1e-6, "negative longitudes too");
// Legend colours blend smoothly between stops and clamp at the top.
assert.deepEqual(windRgb(0), [0x3b, 0x4c, 0xc0]);
const mid = windRgb(5);
assert.ok(mid[0] === Math.round((0x3b + 0x3a) / 2) && mid[2] === Math.round((0xc0 + 0xd0) / 2), "halfway blend");
assert.deepEqual(windRgb(500), windRgb(WIND_SCALE[WIND_SCALE.length - 1]![0]));
console.log("wind checks passed");

// GRIB2 decoder against a real NOAA GFS 1° file (10 m U/V), when one is provided: npx tsx lib/wind.check.ts file.grb
const grb = process.argv[2];
if (grb) {
  const [gu, gv] = decodeGrib2(new Uint8Array(readFileSync(grb)));
  assert.equal(gu!.values.length, 65160);
  assert.ok(gu!.values.every((x) => Math.abs(x) < 80) && gv!.values.every((x) => Math.abs(x) < 80), "plausible m/s");
  console.log("grib2 decode checks passed");
}

const loaded: [number, number, number, number] = [7, 124, 9, 126];
assert.ok(keepBox(loaded, [7.5, 124.5, 8.5, 125.5], 0.25), "zoom in a little → keep");
assert.ok(!keepBox(loaded, [7.9, 124.9, 8.0, 125.0], 0.25), "deep zoom → finer grid");
assert.ok(keepBox(loaded, [7.9, 124.9, 8.0, 125.0]), "fires: any zoom-in keeps the box");
assert.ok(!keepBox(loaded, [6, 123, 10, 127]), "zoom out → refetch");
console.log("keepBox checks passed");
