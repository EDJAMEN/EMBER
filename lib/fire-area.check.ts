// Self-check: npx tsx lib/fire-area.check.ts
import assert from "node:assert/strict";
import { booleanPointInPolygon, pointToPolygonDistance } from "@turf/turf";
import type { MultiPolygon, Polygon } from "geojson";
import { NEARBY_KM, splitByBorder } from "./fire-area";

// A 0.2° square "city" around (8, 125); 1° of latitude ≈ 111 km.
const city: Polygon = { type: "Polygon", coordinates: [[[124.9, 7.9], [125.1, 7.9], [125.1, 8.1], [124.9, 8.1], [124.9, 7.9]]] };
const inside = { lat: 8, lng: 125 };
const near = { lat: 8.1 + 10 / 111, lng: 125 }; // 10 km north of the border
const far = { lat: 8.1 + 60 / 111, lng: 125 }; // 60 km north

const split = (fires: { lat: number; lng: number }[], area: Polygon | MultiPolygon = city) =>
  splitByBorder(fires, area, booleanPointInPolygon, pointToPolygonDistance);

assert.deepEqual(split([inside, near, far]), { fires: [inside], nearby: false }, "inside wins when there are any");
assert.deepEqual(split([near, far]), { fires: [near], nearby: true }, "none inside → only those within NEARBY_KM");
assert.deepEqual(split([far]), { fires: [], nearby: false }, "nothing close → empty, not 'nearby'");

// Works for multi-part areas (islands, provinces with exclaves) too.
const multi: MultiPolygon = { type: "MultiPolygon", coordinates: [city.coordinates, [[[126, 7], [126.1, 7], [126.1, 7.1], [126, 7.1], [126, 7]]]] };
assert.deepEqual(split([near, far], multi), { fires: [near], nearby: true }, "MultiPolygon border");
assert.ok(NEARBY_KM >= 10, "near point is within the buffer");

console.log("fire-area checks passed");
