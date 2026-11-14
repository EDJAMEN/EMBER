// Self-check: `npx tsx lib/harmonization.check.ts` — exits non-zero on failure.
import assert from "node:assert/strict";
import { harmonizeHotspots } from "./harmonization";
import type { Hotspot } from "./hotspots";

const base = { name: "t", settlement: "s", municipality: "m", proximityKm: 2, count: 1, brightness: 330 };
const input: Hotspot[] = [
  { ...base, id: 1, source: "VIIRS", rawConfidence: "n", confidence: "medium", lat: 8.0, lng: 125.0, acqDate: "2026-11-12", acqTime: "05:00 UTC", dayOffset: -1, frp: 4 },
  { ...base, id: 2, source: "MODIS", rawConfidence: "70", confidence: "medium", lat: 8.003, lng: 125.002, acqDate: "2026-11-13", acqTime: "02:00 UTC", dayOffset: 0, frp: 6 },
  { ...base, id: 3, source: "VIIRS", rawConfidence: "h", confidence: "high", lat: 8.5, lng: 125.5, acqDate: "2026-11-13", acqTime: "05:00 UTC", dayOffset: 0 },
];

const out = harmonizeHotspots(input);
assert.equal(out.length, 2, "overlapping MODIS+VIIRS pair fuses into one cluster");
const pair = out.find((c) => c.isMultiSensor)!;
assert.deepEqual(pair.sources.sort(), ["MODIS", "VIIRS"]);
assert.ok(pair.fusedConfidencePercent >= 96, "dual-sensor consensus boosts confidence");
assert.equal(pair.acqDate, "2026-11-13", "cluster stamped with newest detection");
assert.equal(pair.dayOffset, 0);
assert.equal(pair.totalFrp, 10);
assert.deepEqual(pair.detections.map((d) => d.id).sort(), [1, 2], "originals retained");
console.log("harmonization check passed");
