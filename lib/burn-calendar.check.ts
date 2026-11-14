// Self-check: `npx tsx lib/burn-calendar.check.ts` — exits non-zero on failure.
import assert from "node:assert/strict";
import { activityLevel, addDays, anomaly, climatology, daysBetween, meanStd, rangeStats, sameDatesOtherYears, shiftYears, monthTakeaway, monthlyTotals, otherYears, peakSeason, sampleDailyCounts, vsNormal } from "./burn-calendar";

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

// Warm 4-step scale and plain-English phrasing.
assert.deepEqual([0, 10, 30, 60, 100].map((v) => activityLevel(v, 100)), [0, 0, 1, 2, 3]);
assert.equal(activityLevel(5, 0), 0, "no data → quiet");
assert.equal(vsNormal(42, 21), "2x higher than normal");
assert.equal(vsNormal(10, 30), "3x lower than normal");
assert.equal(vsNormal(10.5, 10), "about normal");
assert.equal(vsNormal(80, 58), "38% higher than normal", "matches the takeaway banner wording");
assert.equal(vsNormal(8, 10), "20% lower than normal");

const octDays = [
  ...[2021, 2022, 2023, 2024, 2025].map((y, i) => ({ date: `${y}-10-01`, count: [50, 55, 60, 62, 63][i]! })),
  { date: "2025-10-20", count: 100 }, // late in the month: excluded from a month-to-date comparison
  { date: "2026-10-01", count: 80 },
];
assert.deepEqual(otherYears(octDays, 2026, 9, 13), [50, 55, 60, 62, 63], "same days only");
assert.deepEqual(otherYears(octDays, 2026, 9), [50, 55, 60, 62, 163], "full months");
assert.deepEqual(meanStd([2, 4]), { mean: 3, std: 1 });
const others = otherYears(octDays, 2026, 9, 13);
assert.equal(monthTakeaway(80, others, 2026, 9), "October 2026 had more heat spots (80) than any October in the last 5 years (average: 58).");
assert.match(monthTakeaway(50, [55, 60], 2021, 9), /^October 2021 had fewer heat spots \(50\) than any October in the last 2 years/);
assert.match(monthTakeaway(80, others, 2026, 9, true), /has had more heat spots \(80\) so far/);
assert.match(monthTakeaway(60, [50, 70], 2026, 9), /about as many heat spots \(60\) as a typical October/);

// Date ranges.
assert.equal(addDays("2024-02-28", 2), "2024-03-01");
assert.equal(daysBetween("2026-03-01", "2026-03-31"), 31);
assert.equal(shiftYears("2024-02-29", 1), "2025-02-28", "leap day falls back");
assert.equal(shiftYears("2025-12-31", -2), "2023-12-31");
const idx = new Map([
  ["2025-03-01", 4], ["2025-03-02", 9], ["2025-03-03", 1],
  ["2026-03-01", 6], ["2026-03-02", 2], ["2026-03-03", 8],
  ["2024-03-02", 5], // 2024 lacks Mar 1 → doesn't fully cover the span, so it's left out
]);
assert.deepEqual(rangeStats(idx, "2026-03-01", "2026-03-03"), { total: 16, days: 3, busiest: { date: "2026-03-03", count: 8 } });
assert.deepEqual(rangeStats(idx, "2026-04-01", "2026-04-02"), { total: 0, days: 0, busiest: null });
assert.deepEqual(sameDatesOtherYears(idx, "2026-03-01", "2026-03-03", [2024, 2025, 2026]), [14]);

const sample = monthlyTotals(sampleDailyCounts());
assert.deepEqual(peakSeason(climatology(sample).mean), [2, 3, 4], "sample peak season is Mar–May");
assert.equal(sample.get(2026)![11], null, "no sample data after the end date");
console.log("burn-calendar check passed");
