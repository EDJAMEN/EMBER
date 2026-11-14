import { addDaysIso, diffDaysIso } from "./historical-fires";
import type { Hotspot } from "./hotspots";

export type QuickRange = "today" | "24h" | "3d" | "7d";
export type Granularity = "daily" | "subdaily";
export type SpanDays = 1 | 3 | 7 | 30;

export interface TimelineStep {
  index: number;
  date: string; // YYYY-MM-DD (UTC)
  dayOffset: number; // relative to window end (0 = end of window)
  hourStart: number;
  hourEnd: number;
  shortLabel: string;
  displayLabel: string;
  overpassHint: string;
  spreadHours: number;
}

const SPREAD_STAGES = [0.7, 1.5, 2.5, 3.0, 4.0, 5.0, 5.5, 6.0] as const;

function overpassForHour(hour: number): string {
  if (hour < 3) return "Terra Night";
  if (hour < 6) return "Aqua · NOAA-20/21";
  if (hour < 9) return "NOAA-20 · S-NPP AM";
  if (hour < 12) return "Mid-Morning Gap";
  if (hour < 15) return "Terra AM Overpass";
  if (hour < 18) return "Aqua · NOAA-21";
  if (hour < 21) return "NOAA-20 PM Pass";
  return "Late UTC Pass";
}

function formatMonthDay(isoDate: string): string {
  const ms = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export function computeDateWindow(params: {
  todayStr: string;
  historicalDate: string | null;
  spanDays: SpanDays;
}): { startDate: string; endDate: string; dayCount: number; isHistorical: boolean } {
  const { todayStr, historicalDate, spanDays } = params;
  const isHistorical = Boolean(historicalDate && historicalDate < todayStr);
  if (!isHistorical) {
    const startDate = addDaysIso(todayStr, -(spanDays - 1));
    return { startDate, endDate: todayStr, dayCount: spanDays, isHistorical: false };
  }
  const startDate = historicalDate!;
  const rawEnd = addDaysIso(startDate, spanDays - 1);
  const endDate = rawEnd > todayStr ? todayStr : rawEnd;
  const dayCount = Math.max(1, diffDaysIso(endDate, startDate) + 1);
  return { startDate, endDate, dayCount, isHistorical: true };
}

export function buildTimelineSteps(params: {
  todayStr: string;
  historicalDate: string | null;
  spanDays: SpanDays;
  granularity: Granularity;
  quickRange: QuickRange | null;
}): {
  steps: TimelineStep[];
  startDate: string;
  endDate: string;
  isHistorical: boolean;
  startLabel: string;
  endLabel: string;
} {
  const { todayStr, historicalDate, spanDays, granularity, quickRange } = params;
  const { startDate, endDate, dayCount, isHistorical } = computeDateWindow({
    todayStr,
    historicalDate,
    spanDays,
  });

  const steps: TimelineStep[] = [];

  if (granularity === "daily") {
    if (dayCount === 1) {
      const md = formatMonthDay(endDate);
      const isTodayPreset = !isHistorical && quickRange === "today";
      steps.push(
        {
          index: 0,
          date: isHistorical || isTodayPreset ? endDate : addDaysIso(endDate, -1),
          dayOffset: isHistorical || isTodayPreset ? 0 : -1,
          hourStart: 0,
          hourEnd: 11,
          shortLabel: isHistorical ? "AM" : isTodayPreset ? "00Z" : "-24h",
          displayLabel: isHistorical
            ? `${md} · Early Pass (00–12 UTC)`
            : isTodayPreset
              ? `Today (${md}) · Early Passes (00–12 UTC)`
              : "-24h window · Yesterday Passes",
          overpassHint: "Morning / Night pass",
          spreadHours: 1,
        },
        {
          index: 1,
          date: endDate,
          dayOffset: 0,
          hourStart: 0,
          hourEnd: 23,
          shortLabel: isHistorical ? md : "Now",
          displayLabel: isHistorical
            ? `${md} · Full 24h`
            : quickRange === "24h"
              ? "~24hrs · Rolling 24-Hour Detections"
              : `Today (${md}) · Current UTC Day`,
          overpassHint: "Full composite",
          spreadHours: 3,
        },
      );
    } else {
      const startMd = formatMonthDay(startDate);
      for (let d = 0; d < dayCount; d++) {
        const date = addDaysIso(startDate, d);
        const dayOffset = -(dayCount - 1 - d);
        const md = formatMonthDay(date);
        steps.push({
          index: d,
          date,
          dayOffset,
          hourStart: 0,
          hourEnd: 23,
          shortLabel: !isHistorical && dayOffset === 0 ? "Now" : !isHistorical && d === 0 ? `${dayOffset}d` : md,
          displayLabel:
            !isHistorical && dayOffset === 0
              ? `${dayCount} days (${startMd} – ${md}) · Cumulative`
              : `${md} (${dayOffset === 0 ? "Full Window" : `${Math.abs(dayOffset)}d prior`})`,
          overpassHint: "Daily 24h window",
          spreadHours: 3,
        });
      }
    }
  } else {
    const hourStep = dayCount > 7 ? 6 : 3;
    let idx = 0;
    for (let d = 0; d < dayCount; d++) {
      const date = addDaysIso(startDate, d);
      const dayOffset = -(dayCount - 1 - d);
      const md = formatMonthDay(date);
      for (let h = 0; h < 24; h += hourStep) {
        const hourEnd = Math.min(23, h + hourStep - 1);
        const hhStart = String(h).padStart(2, "0");
        const hhEnd = String(hourEnd).padStart(2, "0");
        const hint = overpassForHour(h);
        const spreadIdx = Math.min(SPREAD_STAGES.length - 1, Math.floor((h / 24) * SPREAD_STAGES.length));
        steps.push({
          index: idx++,
          date,
          dayOffset,
          hourStart: h,
          hourEnd,
          shortLabel: `${hhStart}Z`,
          displayLabel: `${md} · ${hhStart}:00–${hhEnd}:59 UTC (${hint})`,
          overpassHint: hint,
          spreadHours: SPREAD_STAGES[spreadIdx]!,
        });
      }
    }
  }

  const first = steps[0]!;
  const last = steps[steps.length - 1]!;
  const startLabel = isHistorical
    ? `${formatMonthDay(startDate)}${granularity === "subdaily" ? " 00Z" : ""}`
    : spanDays === 1
      ? granularity === "subdaily"
        ? "00:00 UTC"
        : quickRange === "today"
          ? "00:00 UTC"
          : "-24h"
      : `-${spanDays - 1}d`;
  const endLabel = isHistorical
    ? `${formatMonthDay(endDate)}${granularity === "subdaily" ? " 21Z" : ""}`
    : granularity === "subdaily"
      ? `${last.shortLabel} UTC`
      : "Now";

  void first;
  return { steps, startDate, endDate, isHistorical, startLabel, endLabel };
}

export function parseAcqUtcHour(acqTime: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(acqTime.trim());
  if (!m) return null;
  const h = Number.parseInt(m[1]!, 10);
  return Number.isFinite(h) ? Math.max(0, Math.min(23, h)) : null;
}

/**
 * Checks if a hotspot detection belongs to the active scrubber slice in DAILY or SUB-DAILY mode.
 * Matches NASA FIRMS horizon behavior:
 * - Today: current UTC day only (dayOffset === 0)
 * - ~24hrs: rolling 24-hour window (dayOffset in [-1, 0])
 * - 3 days / 7 days / MONTH: cumulative window [-(spanDays - 1) .. step.dayOffset] in DAILY mode,
 *   so at "Now" (step.dayOffset === 0) all 3d or 7d detections are shown and scrubbing steps day-by-day.
 */
export function hotspotMatchesStep(params: {
  hotspot: Hotspot;
  step: TimelineStep;
  granularity: Granularity;
  isHistorical: boolean;
  isSingleDayWindow: boolean;
  quickRange?: QuickRange | null;
  spanDays?: SpanDays;
}): boolean {
  const {
    hotspot,
    step,
    granularity,
    isHistorical,
    isSingleDayWindow,
    quickRange = null,
    spanDays = 1,
  } = params;

  if (isHistorical) {
    if (granularity === "daily") {
      if (isSingleDayWindow) {
        if (hotspot.acqDate && hotspot.acqDate !== step.date) return false;
        if (step.index === 0) {
          const hr = parseAcqUtcHour(hotspot.acqTime);
          if (hr !== null && hr >= 12) return false;
        }
        return true;
      }
      // Multi-day historical archive: when at end of window show full cumulative span, or up to scrubbed date
      if (hotspot.acqDate) {
        return step.dayOffset === 0
          ? hotspot.acqDate <= step.date
          : hotspot.acqDate === step.date;
      }
      return hotspot.dayOffset <= step.dayOffset;
    }
    if (hotspot.acqDate && hotspot.acqDate !== step.date) return false;
  } else if (granularity === "daily") {
    if (isSingleDayWindow) {
      if (quickRange === "today") {
        // NASA FIRMS "Today": only detections acquired on the current UTC day (dayOffset === 0)
        if (hotspot.dayOffset !== 0) return false;
        if (step.index === 0) {
          const hr = parseAcqUtcHour(hotspot.acqTime);
          if (hr !== null && hr >= 12) return false;
        }
        return true;
      }
      // NASA FIRMS "~24hrs": rolling 24h (dayOffset -1 and 0)
      if (step.index === 0) {
        return hotspot.dayOffset === -1;
      }
      return hotspot.dayOffset >= -1 && hotspot.dayOffset <= 0;
    }
    // Multi-day window (3 days, 7 days, MONTH): cumulative from start of horizon up to active step
    const minOffset = -(spanDays - 1);
    return hotspot.dayOffset >= minOffset && hotspot.dayOffset <= step.dayOffset;
  } else {
    // Live SUB-DAILY mode: match the step's day (or rolling -1..0 on single-day ~24hrs)
    if (isSingleDayWindow && quickRange === "24h") {
      if (hotspot.dayOffset < -1 || hotspot.dayOffset > 0) return false;
    } else if (hotspot.dayOffset !== step.dayOffset) {
      return false;
    }
  }

  if (granularity === "subdaily") {
    const hr = parseAcqUtcHour(hotspot.acqTime);
    if (hr === null) return true;
    // Allow +-1h around overpass slot so orbital granules straddling bin edges stay visible cleanly
    return hr >= Math.max(0, step.hourStart - 1) && hr <= Math.min(23, step.hourEnd + 1);
  }

  return true;
}
