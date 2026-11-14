// Self-check: npx tsx lib/fire-history.check.ts
import assert from "node:assert/strict";
import { chunks, localDate, parseFirmsCsv, solarOffset, staticSources, tallyDaily } from "./fire-history";

// Archive rows (with type) and an NRT-style file (no type column), as FIRMS returns them.
const sp = parseFirmsCsv(
  [
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type",
    "8.10,125.10,330,0.4,0.4,2025-03-01,0530,N20,VIIRS,n,2,290,3,D,0", // vegetation, 13:30 local
    "8.10,125.10,330,0.4,0.4,2025-03-01,1730,N20,VIIRS,h,2,290,3,N,0", // 01:30 local NEXT day
    "8.20,125.20,330,0.4,0.4,2025-03-01,0530,N20,VIIRS,n,2,290,3,D,2", // factory
    "8.10,125.10,330,0.4,0.4,2025-03-01,0530,N20,VIIRS,l,2,290,3,D,0", // low confidence
    "9.90,125.10,330,0.4,0.4,2025-03-01,0530,N20,VIIRS,n,2,290,3,D,0", // outside the area
    "bad,row",
  ].join("\n"),
);
assert.equal(sp.length, 5, "malformed rows skipped");
assert.equal(sp[0]!.type, 0);

const nrt = parseFirmsCsv(
  [
    "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight",
    "8.2010,125.2010,330,0.4,0.4,2026-11-01,0530,N20,VIIRS,n,2.0NRT,290,3,D", // at the factory → removed
    "8.30,125.30,330,0.4,0.4,2026-11-01,0530,N20,VIIRS,n,2.0NRT,290,3,D", // real fire
  ].join("\n"),
);
assert.equal(nrt[0]!.type, null, "NRT rows have no type");

assert.equal(solarOffset(125.1), 8);
assert.equal(solarOffset(-99), -7);
assert.equal(localDate("2025-03-01", "1730", 8), "2025-03-02", "night overpass belongs to the next local day");
assert.equal(localDate("2025-03-01", "0300", -7), "2025-02-28");

const inside = (lng: number, lat: number) => lat < 9; // the "area"
const statics = staticSources([...sp, ...nrt]);
const t = tallyDaily([...sp, ...nrt], inside, 8, statics);
assert.deepEqual(Object.fromEntries(t.counts), { "2025-03-01": 1, "2025-03-02": 1, "2026-11-01": 1 });
assert.deepEqual(t.removed, { notVegetation: 2, lowConfidence: 1 });

assert.deepEqual(chunks("2026-01-01", "2026-01-12"), [
  { start: "2026-01-01", days: 5 },
  { start: "2026-01-06", days: 5 },
  { start: "2026-01-11", days: 2 },
]);
assert.equal(chunks("2026-01-01", "2026-12-31").reduce((a, c) => a + c.days, 0), 365);

console.log("fire-history checks passed");
