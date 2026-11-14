"use client";

import { useState } from "react";
import { Calendar, History, Info, Pause, Play, Radio, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/historical-fires";
import type { Granularity, QuickRange, SpanDays, TimelineStep } from "@/lib/timeline";

const QUICK_PILLS: readonly { key: QuickRange; label: string; title: string }[] = [
  { key: "today", label: "Today", title: "Current UTC operational day" },
  { key: "24h", label: "~24hrs", title: "Rolling 24-hour ultra-real-time / NRT detections" },
  { key: "3d", label: "3 days", title: "Past 3 days of MODIS + VIIRS detections" },
  { key: "7d", label: "7 days", title: "Past 7 days of MODIS + VIIRS detections" },
];

const SPAN_OPTIONS: readonly { days: SpanDays; label: string }[] = [
  { days: 1, label: "DAY" },
  { days: 3, label: "3 DAYS" },
  { days: 7, label: "WEEK" },
  { days: 30, label: "MONTH" },
];

const SPAN_TAG: Record<SpanDays, string> = {
  1: "DAY",
  3: "3 DAYS",
  7: "WEEK",
  30: "MONTH",
};

interface HistoricalFireNavigatorProps {
  todayStr: string;
  quickRange: QuickRange | null;
  granularity: Granularity;
  historicalDate: string | null;
  spanDays: SpanDays;
  steps: TimelineStep[];
  scrubIndex: number;
  startLabel: string;
  endLabel: string;
  isHistorical: boolean;
  isModisEraOnly: boolean;
  playing: boolean;
  spreadOn: boolean;
  loadingArchive?: boolean;
  onSelectQuickRange: (range: QuickRange) => void;
  onChangeGranularity: (granularity: Granularity) => void;
  onSelectHistoricalDate: (date: string) => void;
  onChangeSpanDays: (days: SpanDays) => void;
  onBackToLive: () => void;
  onScrubChange: (index: number) => void;
  onTogglePlay: () => void;
}

export function HistoricalFireNavigator({
  todayStr,
  quickRange,
  granularity,
  historicalDate,
  spanDays,
  steps,
  scrubIndex,
  startLabel,
  endLabel,
  isHistorical,
  isModisEraOnly,
  playing,
  spreadOn,
  loadingArchive = false,
  onSelectQuickRange,
  onChangeGranularity,
  onSelectHistoricalDate,
  onChangeSpanDays,
  onBackToLive,
  onScrubChange,
  onTogglePlay,
}: HistoricalFireNavigatorProps) {
  const [infoOpen, setInfoOpen] = useState(false);

  const safeMax = Math.max(0, steps.length - 1);
  const clampedIdx = Math.max(0, Math.min(safeMax, scrubIndex));
  const activeStep = steps[clampedIdx] ?? steps[0];
  const progressPct = safeMax > 0 ? Math.round((clampedIdx / safeMax) * 100) : 100;

  // Sample up to 7 evenly distributed tick marks so daily or 56-step sub-daily scales stay crisp.
  const tickIndices: number[] = [];
  if (steps.length > 1) {
    const maxTicks = 7;
    const stride = Math.max(1, Math.ceil((steps.length - 1) / (maxTicks - 1)));
    for (let i = 0; i < steps.length; i += stride) tickIndices.push(i);
    if (tickIndices[tickIndices.length - 1] !== safeMax) tickIndices.push(safeMax);
  }

  return (
    <div className="ember-timeline-nav" role="region" aria-label="Historical Fire Map Navigator">
      {/* Tier 1: Top Control Strip */}
      <div className="ember-nav-top">
        <div className="ember-nav-group">
          <span className="ember-nav-kicker">
            <span className={`ember-timeline-live ${isHistorical ? "historical" : ""}`} />
            {isHistorical ? "ARCHIVE WINDOW" : "FIRE TIMELINE"}
          </span>
          <div className="ember-horizon-pills" role="group" aria-label="Quick horizon presets">
            {QUICK_PILLS.map((pill) => {
              const active = !isHistorical && quickRange === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  title={pill.title}
                  aria-pressed={active}
                  className={active ? "active" : ""}
                  onClick={() => onSelectQuickRange(pill.key)}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>
          <div className="ember-info-wrap">
            <button
              type="button"
              className="ember-info-btn"
              aria-label="Satellite overpass and archive coverage info"
              aria-expanded={infoOpen}
              title="Satellite overpass latency & MODIS/VIIRS historical archive coverage"
              onClick={() => setInfoOpen((v) => !v)}
            >
              <Info size={13} />
            </button>
            {infoOpen && (
              <div className="ember-info-popover" role="tooltip">
                <strong>FIRMS Overpass &amp; Archive Coverage</strong>
                <p>
                  NRT passes appear within ~3 hours of acquisition.{" "}
                  <b>MODIS (Terra/Aqua, 1 km)</b> spans Nov 2000–present;{" "}
                  <b>VIIRS (S-NPP, NOAA-20/21, 375 m)</b> begins Jan 2012.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="ember-nav-granularity" role="radiogroup" aria-label="Timeline granularity">
          {(
            [
              ["daily", "DAILY"],
              ["subdaily", "SUB-DAILY"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={granularity === key}
              className={granularity === key ? "active" : ""}
              title={
                key === "daily"
                  ? "Step in 24-hour daily increments"
                  : "Step in 3-hour satellite overpass increments (syncs with wind spread cone)"
              }
              onClick={() => onChangeGranularity(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ember-nav-archive-controls">
          <label className="ember-date-picker-label" title="Pick historical date (2000-11-01 to present)">
            <Calendar size={13} className="ember-cal-icon" />
            <span className="ember-date-formatted">
              {formatShortDate(historicalDate ?? todayStr)}
            </span>
            <input
              type="date"
              min="2000-11-01"
              max={todayStr}
              value={historicalDate ?? todayStr}
              aria-label="Historical fire map date"
              onChange={(e) => {
                if (e.target.value) onSelectHistoricalDate(e.target.value);
              }}
            />
          </label>

          <label className="ember-span-select-wrap" title="Time window span">
            <History size={12} className="ember-cal-icon" />
            <select
              aria-label="Time window span"
              value={spanDays}
              onChange={(e) => onChangeSpanDays(Number(e.target.value) as SpanDays)}
            >
              {SPAN_OPTIONS.map((opt) => (
                <option key={opt.days} value={opt.days}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* Status & Era Context Strip (shown cleanly when historical or MODIS-only era active) */}
      {(isHistorical || isModisEraOnly) && (
        <div className="ember-nav-banners">
          {isHistorical && historicalDate && (
            <div className="ember-historical-badge" role="status">
              <span className="ember-pulse-amber" aria-hidden />
              <span>
                HISTORICAL ARCHIVE · {formatShortDate(historicalDate)} ({SPAN_TAG[spanDays]})
                {loadingArchive ? " · Syncing…" : ""}
              </span>
              <button type="button" className="ember-back-live-btn" onClick={onBackToLive}>
                <RotateCcw size={11} /> Back to Live
              </button>
            </div>
          )}
          {isModisEraOnly && (
            <div className="ember-era-badge" title="VIIRS launched in 2012 (Suomi NPP); earlier dates use harmonized 1km MODIS">
              <Radio size={11} /> MODIS Era Only (1km) · Harmonized to VIIRS-equivalent scale
            </div>
          )}
        </div>
      )}

      {/* Tier 2: Interactive Scrubber Strip */}
      <div className="ember-nav-scrubber">
        <div className="ember-scrubber-meta">
          <span className="ember-scrubber-active-label">
            {activeStep?.displayLabel ?? "Today"}
          </span>
          {granularity === "subdaily" && activeStep && (
            <span className="ember-scrubber-pass-badge">
              {spreadOn ? `+${activeStep.spreadHours.toFixed(1)}h cone · ` : ""}
              {activeStep.overpassHint}
            </span>
          )}
        </div>

        <div className="ember-scrubber-row">
          <span className="ember-time-mark">{startLabel}</span>
          <div className="ember-scrubber-track-wrap">
            <input
              type="range"
              min={0}
              max={safeMax}
              step={1}
              value={clampedIdx}
              onChange={(e) => onScrubChange(Number(e.target.value))}
              aria-label="Historical timeline scrubber"
              className="ember-scrubber-input"
              style={{
                background: `linear-gradient(to right, #EA580C 0%, #EA580C ${progressPct}%, rgba(234, 88, 12, 0.18) ${progressPct}%, rgba(234, 88, 12, 0.18) 100%)`,
              }}
            />
            {tickIndices.length > 0 && (
              <div className="ember-scrubber-ticks" aria-hidden>
                {tickIndices.map((idx) => {
                  const pct = safeMax > 0 ? (idx / safeMax) * 100 : 0;
                  const step = steps[idx];
                  if (!step) return null;
                  return (
                    <span
                      key={idx}
                      className={`ember-scrubber-tick ${idx === clampedIdx ? "current" : ""}`}
                      style={{ left: `${pct}%` }}
                    >
                      <i />
                      <b>{step.shortLabel}</b>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <span className="ember-time-mark ember-time-mark-end">{endLabel}</span>

          <Button
            variant="outline"
            size="icon"
            className="ember-play-button ember-play-terracotta"
            aria-label={playing ? "Pause timeline" : "Play timeline"}
            onClick={onTogglePlay}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
