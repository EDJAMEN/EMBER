// Burning Calendar: seasonality + anomaly math over daily detection counts.
// Pure functions so the sample series can be swapped for real daily counts (e.g. a
// GROUP BY acq_date over wildfire_hotspots) without touching the UI.

export interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Warm fire scale, quiet → high. `ink` is the text colour that keeps ≥ 4.5:1 contrast on that fill.
export const ACTIVITY = [
  { label: "Quiet", color: "#e7dfd2", ink: "#3b3328" },
  { label: "Low", color: "#f6cf4a", ink: "#3b2a00" },
  { label: "Moderate", color: "#ee8a26", ink: "#2b1400" },
  { label: "High", color: "#a8231b", ink: "#ffffff" },
] as const;

/** 0 Quiet · 1 Low · 2 Moderate · 3 High, relative to the busiest value on the same scale. */
export function activityLevel(value: number, max: number): 0 | 1 | 2 | 3 {
  const r = max > 0 ? value / max : 0;
  return r < 0.15 ? 0 : r < 0.4 ? 1 : r < 0.7 ? 2 : 3;
}

/** "2x higher than normal" / "about normal" / "3x lower than normal" for a value against its typical value. */
export function vsNormal(value: number, normal: number): string {
  if (normal <= 0) return value > 0 ? "unusual for this time of year" : "about normal";
  const ratio = value / normal;
  const x = (r: number) => `${r >= 10 ? Math.round(r) : Math.round(r * 10) / 10}x`;
  if (ratio >= 1.5) return `${x(ratio)} higher than normal`;
  if (ratio > 0 && ratio <= 2 / 3) return `${x(1 / ratio)} lower than normal`;
  if (ratio === 0) return "none, usually some";
  const pct = Math.round((ratio - 1) * 100); // same 10% "about" band as monthTakeaway, so both agree
  return Math.abs(pct) < 10 ? "about normal" : `${Math.abs(pct)}% ${pct > 0 ? "higher" : "lower"} than normal`;
}

/**
 * Totals of `month` in every year except `year`, counting only days 1..uptoDay when given — so a month still in
 * progress is compared with the same days of other years, not with their full months.
 */
export function otherYears(days: DailyCount[], year: number, month: number, uptoDay = 31): number[] {
  const mm = String(month + 1).padStart(2, "0");
  const sums = new Map<number, number>();
  for (const { date, count } of days) {
    const y = Number(date.slice(0, 4));
    if (y === year || date.slice(5, 7) !== mm || Number(date.slice(8, 10)) > uptoDay) continue;
    sums.set(y, (sums.get(y) ?? 0) + count);
  }
  return [...sums.values()];
}

export function meanStd(values: number[]): { mean: number; std: number } {
  if (!values.length) return { mean: 0, std: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean, std: Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length) };
}

/**
 * Plain-English comparison of one month with the same month in other years (`others`, see otherYears), e.g.
 * "October 2026 had more heat spots (80) than any October in the last 5 years (average: 58)."
 */
export function monthTakeaway(value: number, others: number[], year: number, month: number, partial = false): string {
  const name = `${MONTH_NAMES[month]} ${year}`;
  const verb = partial ? "has had" : "had";
  const so = partial ? " so far" : "";
  if (!others.length) return `${name} ${verb} ${value} heat spots${so}.`;
  const avg = Math.round(others.reduce((a, b) => a + b, 0) / others.length);
  const span = `${MONTH_NAMES[month]} in the last ${others.length} year${others.length === 1 ? "" : "s"} (average: ${avg})`;
  if (value > Math.max(...others)) return `${name} ${verb} more heat spots (${value})${so} than any ${span}.`;
  if (value < Math.min(...others)) return `${name} ${verb} fewer heat spots (${value})${so} than any ${span}.`;
  const pct = avg > 0 ? Math.round(((value - avg) / avg) * 100) : 0;
  if (Math.abs(pct) < 10) return `${name} ${verb} about as many heat spots (${value})${so} as a typical ${span}.`;
  return `${name} ${verb} ${Math.abs(pct)}% ${pct > 0 ? "more" : "fewer"} heat spots (${value})${so} than a typical ${span}.`;
}

/** year → 12 monthly totals; null where the month has no data at all (e.g. the future). */
export function monthlyTotals(days: DailyCount[]): Map<number, (number | null)[]> {
  const out = new Map<number, (number | null)[]>();
  for (const { date, count } of days) {
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7)) - 1;
    const row = out.get(year) ?? Array<number | null>(12).fill(null);
    row[month] = (row[month] ?? 0) + count;
    out.set(year, row);
  }
  return out;
}

/** Per-month mean and standard deviation across years, optionally leaving one year out. */
export function climatology(monthly: Map<number, (number | null)[]>, excludeYear?: number) {
  const mean: number[] = [];
  const std: number[] = [];
  for (let m = 0; m < 12; m++) {
    const values = [...monthly]
      .filter(([year]) => year !== excludeYear)
      .map(([, row]) => row[m])
      .filter((v): v is number => v !== null);
    const mu = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const variance = values.length ? values.reduce((a, v) => a + (v - mu) ** 2, 0) / values.length : 0;
    mean.push(mu);
    std.push(Math.sqrt(variance));
  }
  return { mean, std };
}

/** Peak burn season: months whose typical count is at least half the busiest month's. */
export function peakSeason(mean: number[]): number[] {
  const max = Math.max(...mean);
  return max > 0 ? mean.flatMap((v, m) => (v >= max / 2 ? [m] : [])) : [];
}

export type AnomalyLevel = "well-above" | "above" | "normal" | "below";

// Plain-English status for non-technical readers.
export const STATUS_LABEL: Record<AnomalyLevel, string> = {
  "well-above": "Much Higher Than Usual",
  above: "Higher Than Usual",
  normal: "Normal for This Time of Year",
  below: "Quieter Than Usual",
};

export function anomaly(value: number, mean: number, std: number): { z: number; level: AnomalyLevel; pct: number } {
  const z = std > 0 ? (value - mean) / std : 0;
  const pct = mean > 0 ? Math.round(((value - mean) / mean) * 100) : 0;
  const level: AnomalyLevel = z >= 1.5 ? "well-above" : z >= 0.5 ? "above" : z <= -0.5 ? "below" : "normal";
  return { z, level, pct };
}

// --- Date ranges (ISO YYYY-MM-DD strings, UTC) ---
const DAY_MS = 86_400_000;
export const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;

/** Same calendar date `dy` years later; Feb 29 becomes Feb 28 in non-leap years. */
export function shiftYears(iso: string, dy: number): string {
  const y = Number(iso.slice(0, 4)) + dy;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const md = iso.slice(4) === "-02-29" && !leap ? "-02-28" : iso.slice(4);
  return `${String(y).padStart(4, "0")}${md}`;
}

/** Totals over [from, to] (inclusive) from a date → count index; days without data are skipped. */
export function rangeStats(index: Map<string, number>, from: string, to: string) {
  let total = 0, days = 0;
  let busiest: { date: string; count: number } | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const c = index.get(d);
    if (c === undefined) continue;
    total += c;
    days++;
    if (!busiest || c > busiest.count) busiest = { date: d, count: c };
  }
  return { total, days, busiest };
}

/** Totals for the same dates in each other year whose data fully covers them (for "compared with past years"). */
export function sameDatesOtherYears(index: Map<string, number>, from: string, to: string, years: number[]): number[] {
  const y0 = Number(from.slice(0, 4));
  return years.flatMap((y) => {
    if (y === y0) return [];
    const f = shiftYears(from, y - y0), t = shiftYears(to, y - y0);
    if (!index.has(f) || !index.has(t)) return []; // that year's data doesn't cover the whole span
    return [rangeStats(index, f, t).total];
  });
}

// --- Illustrative sample series (Bukidnon-like dry-season peak, Mar–Apr) ---
// shortcut: synthetic data, replace with real daily counts once detections are persisted.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const YEAR_FACTOR: Record<number, number> = { 2021: 0.9, 2022: 0.8, 2023: 1.0, 2024: 1.6, 2025: 0.95, 2026: 1.25 };

export function sampleDailyCounts(start = "2021-01-01", end = "2026-11-13"): DailyCount[] {
  const rand = mulberry32(42);
  const out: DailyCount[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t);
    const doy = (t - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
    const seasonal = 1.5 + 22 * Math.exp(-((doy - 95) ** 2) / (2 * 35 ** 2)) + 4 * Math.exp(-((doy - 240) ** 2) / (2 * 20 ** 2));
    const factor = YEAR_FACTOR[d.getUTCFullYear()] ?? 1;
    out.push({ date: d.toISOString().slice(0, 10), count: Math.round(seasonal * factor * (0.4 + rand() * 1.2)) });
  }
  return out;
}
