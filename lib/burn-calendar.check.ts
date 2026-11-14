// Self-check: `npx tsx lib/burn-calendar.check.ts` — exits non-zero on failure.
import assert from "node:assert/strict";
import { anomaly, climatology, monthlyTotals, peakSeason, sampleDailyCounts } from "./burn-calendar";

const monthly = monthlyTotals([
  { date: "2024-03-01", count: 5 },
  { date: "2024-03-02", count: 7 },
  { date: "2025-03-10", count: 2 },
]);
assert.equal(monthly.get(2024)![2], 12);
assert.equal(monthly.get(2024)![3], null, "months without data stay null");

const { mean, std } = climatology(monthly, 2024);
assert.equal(mean[2], 2, "excluded year is left out of the baseline");
assert.equal(std[2], 0);

assert.deepEqual(peakSeason([1, 2, 10, 8, 4, 0, 0, 0, 0, 0, 0, 0]), [2, 3]);
assert.equal(anomaly(20, 10, 5).level, "well-above");
assert.equal(anomaly(10, 10, 5).level, "normal");
assert.equal(anomaly(5, 10, 5).level, "below");

const sample = monthlyTotals(sampleDailyCounts());
assert.deepEqual(peakSeason(climatology(sample).mean), [2, 3, 4], "sample peak season is Mar–May");
assert.equal(sample.get(2026)![11], null, "no sample data after the end date");
console.log("burn-calendar check passed");
