// Burning Calendar: seasonality + anomaly math over daily detection counts.
// Pure functions so the sample series can be swapped for real daily counts (e.g. a
// GROUP BY acq_date over wildfire_hotspots) without touching the UI.

export interface DailyCount {
  date: string; // YYYY-MM-DD
  count: number;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Colorblind-safe Viridis steps (README §5), low → high.
export const VIRIDIS = ["#440154", "#414487", "#2a788e", "#22a884", "#7ad151", "#fde725"];

export function viridis(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "var(--muted)";
  return VIRIDIS[Math.min(VIRIDIS.length - 1, Math.floor((value / max) * VIRIDIS.length))]!;
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

export const ANOMALY_LABEL: Record<AnomalyLevel, string> = {
  "well-above": "Unusually high",
  above: "Above normal",
  normal: "Normal",
  below: "Below normal",
};

export function anomaly(value: number, mean: number, std: number): { z: number; level: AnomalyLevel; pct: number } {
  const z = std > 0 ? (value - mean) / std : 0;
  const pct = mean > 0 ? Math.round(((value - mean) / mean) * 100) : 0;
  const level: AnomalyLevel = z >= 1.5 ? "well-above" : z >= 0.5 ? "above" : z <= -0.5 ? "below" : "normal";
  return { z, level, pct };
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
