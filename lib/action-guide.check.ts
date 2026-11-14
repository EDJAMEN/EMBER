// Self-check: `npx tsx lib/action-guide.check.ts` — exits non-zero on failure.
import assert from "node:assert/strict";
import { buildGuide, heatIndexC, heatLevel } from "./action-guide";
import { clipToBoundary, contourAreas, gridDomain, heatColor, maxHeatIndex } from "./heat-grid";

assert.equal(Math.round(heatIndexC(32.22, 70)), 41, "matches NWS table (90°F / 70% → 106°F)");
assert.equal(heatLevel(26.4), "None");
assert.equal(heatLevel(41.4), "Extreme Caution");
assert.equal(heatLevel(42), "Danger");
assert.equal(heatLevel(55), "Extreme Danger");

const calm = buildGuide({ hotspots: [], tempC: 24, humidity: 60, windKmh: 5, usAqi: 30 });
assert.equal(calm.nearbyCount, 0);
assert.match(calm.todo[0]!, /No immediate action/);

const close = buildGuide({
  hotspots: [{ distanceKm: 3, highConfidence: true }, { distanceKm: 80, highConfidence: true }],
  tempC: 34,
  humidity: 65,
  windKmh: 25,
  usAqi: 160,
});
assert.equal(close.nearbyCount, 1, "hotspots beyond 25 km ignored");
assert.equal(close.nearestKm, 3);
assert.equal(close.heat, "Danger");
assert.ok(close.bring.some((b) => b.includes("N95")));
assert.ok(close.prepare.some((p) => p.includes("evacuation")));

const noFeed = buildGuide({ hotspots: null, tempC: null, humidity: null, windKmh: null, usAqi: null });
assert.match(noFeed.update[0]!, /unavailable/);
console.log("action-guide check passed");

// heat-grid helpers
assert.equal(heatColor(-3), "#ffffff");
assert.equal(heatColor(27), "#3cc83c", "27°C starts the green band");
assert.equal(heatColor(55), "#7f0a0a");
assert.equal(maxHeatIndex([25, 32.22, null], [60, 70, 50])?.toFixed(0), "41", "max over the day, nulls skipped");
assert.equal(maxHeatIndex([], []), null);
console.log("heat-grid check passed");

// contour areas: a west→east gradient 20..32°C on a 7×7 grid
const cells = Array.from({ length: 49 }, (_, k) => ({
  lat: 8 + Math.floor(k / 7) * 0.15,
  lng: 125 + (k % 7) * 0.15,
  tempC: 20 + (k % 7) * 2,
  maxHeatIndexC: null,
}));
assert.deepEqual(gridDomain(cells, "tempC"), [20, 32]);
assert.equal(gridDomain(cells, "maxHeatIndexC"), null);
const all = contourAreas(cells, "tempC", 20, 32);
assert.deepEqual(all.areas.features.map((f) => f.properties.label), ["20–27°C", "27–32°C"], "split at the 27°C scale edge");
assert.ok(all.coverage > 0.99);
const warm = contourAreas(cells, "tempC", 28, 32);
assert.ok(warm.coverage > 0.25 && warm.coverage < 0.45, `east third covered, got ${warm.coverage}`);
assert.equal(contourAreas(cells, "tempC", 40, 45).areas.features.length, 0, "no area outside the data");
console.log("contour check passed");

// clip to a place boundary: the east half of the test grid
const eastHalf = {
  type: "Polygon" as const,
  coordinates: [[[125.45, 8], [125.9, 8], [125.9, 8.9], [125.45, 8.9], [125.45, 8]]],
};
const clipped = clipToBoundary(all.areas, eastHalf);
const box = (f: (typeof clipped.areas.features)[number]) => f.geometry.coordinates.flat(2);
assert.ok(clipped.areas.features.length > 0, "something remains inside the boundary");
assert.ok(clipped.areas.features.every((f) => box(f).every(([x]) => x! >= 125.45 - 1e-9)), "nothing outside the boundary");
assert.ok(clipped.coverage > 0.95, `whole boundary covered when range = all, got ${clipped.coverage}`);
const warmInEast = clipToBoundary(contourAreas(cells, "tempC", 31, 32).areas, eastHalf);
assert.ok(warmInEast.coverage > 0 && warmInEast.coverage < 0.6, `partial coverage, got ${warmInEast.coverage}`);
const far = { type: "Polygon" as const, coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };
assert.equal(clipToBoundary(all.areas, far).areas.features.length, 0, "boundary elsewhere → nothing");
console.log("boundary clip check passed");
