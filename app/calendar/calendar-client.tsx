"use client";

import { useMemo, useState } from "react";
import { EmberShell } from "@/components/ember-shell";
import {
  ANOMALY_LABEL,
  MONTHS,
  VIRIDIS,
  anomaly,
  climatology,
  monthlyTotals,
  peakSeason,
  sampleDailyCounts,
  viridis,
} from "@/lib/burn-calendar";

const DAYS = sampleDailyCounts();
const MONTHLY = monthlyTotals(DAYS);
const YEARS = [...MONTHLY.keys()].sort((a, b) => a - b);
const LAST_DATE = DAYS[DAYS.length - 1]!.date;
const LAST_YEAR = Number(LAST_DATE.slice(0, 4));
const LAST_MONTH = Number(LAST_DATE.slice(5, 7)) - 1;
const PEAK = peakSeason(climatology(MONTHLY).mean);
const MAX_MONTH = Math.max(...[...MONTHLY.values()].flat().map((v) => v ?? 0));

const mono = { fontFamily: "var(--font-mono)", fontSize: "9px", color: "var(--muted-foreground)" } as const;

export function CalendarPage() {
  const [year, setYear] = useState(LAST_YEAR);
  const [month, setMonth] = useState(year === LAST_YEAR ? LAST_MONTH - 1 : 3);

  const yearDays = useMemo(() => DAYS.filter((d) => d.date.startsWith(`${year}-`)), [year]);
  const maxDay = Math.max(1, ...yearDays.map((d) => d.count));
  const leadingBlanks = new Date(`${year}-01-01T00:00:00Z`).getUTCDay();

  const row = MONTHLY.get(year)!;
  const total = row.reduce<number>((a, v) => a + (v ?? 0), 0);
  const busiest = row.reduce<number>((best, v, m) => ((v ?? -1) > (row[best] ?? -1) ? m : best), 0);
  const baseline = climatology(MONTHLY, year); // compare against the other years only
  const value = row[month];
  const partial = year === LAST_YEAR && month === LAST_MONTH;
  const result = value !== null ? anomaly(value, baseline.mean[month]!, baseline.std[month]!) : null;

  return (
    <EmberShell active="calendar" title="Burn calendar">
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> SEASONALITY <span className="ember-eyebrow-date">/ BUKIDNON</span>
          </div>
          <h1>
            Burning calendar<span>.</span>
          </h1>
          <p>Illustrative sample data: daily and monthly detection frequency, peak burn season, and how this period compares with past years.</p>
        </div>
        <div className="ember-window-selector" aria-label="Year">
          {YEARS.map((y) => (
            <button
              type="button"
              key={y}
              aria-pressed={year === y}
              className={year === y ? "selected" : ""}
              onClick={() => {
                setYear(y);
                if (MONTHLY.get(y)![month] === null) setMonth(LAST_MONTH);
              }}
            >
              {y}
            </button>
          ))}
        </div>
      </section>

      <section className="ember-stat-grid" aria-label="Calendar summary">
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>DETECTIONS IN {year}</span>
          </div>
          <div className="ember-stat-number">{total.toLocaleString()}</div>
          <div className="ember-stat-foot">
            <span>{year === LAST_YEAR ? `Through ${LAST_DATE}` : "Full year"}</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>BUSIEST MONTH</span>
          </div>
          <div className="ember-stat-number">{MONTHS[busiest]}</div>
          <div className="ember-stat-foot">
            <span>{row[busiest]?.toLocaleString()} detections</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>TYPICAL PEAK SEASON</span>
          </div>
          <div className="ember-stat-number">
            {/* shortcut: assumes the peak months are contiguous, true for a single dry season */}
            {PEAK.length ? `${MONTHS[PEAK[0]!]}–${MONTHS[PEAK[PEAK.length - 1]!]}` : "—"}
          </div>
          <div className="ember-stat-foot">
            <span>Months at ≥ 50% of the busiest month, all years</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>
              {MONTHS[month]} {year} VS PAST YEARS
            </span>
          </div>
          <div className="ember-stat-number">{result ? ANOMALY_LABEL[result.level] : "No data"}</div>
          <div className="ember-stat-foot">
            <span>
              {result
                ? `${value} vs avg ${Math.round(baseline.mean[month]!)} (${result.pct >= 0 ? "+" : ""}${result.pct}%)${partial ? " · month in progress" : ""}`
                : "Select a month with data"}
            </span>
          </div>
        </article>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Daily fire frequency · {year}</h2>
            <p>Each square is one day; brighter means more detections</p>
          </div>
        </div>
        <div className="ember-map-layout" style={{ display: "block", padding: "20px", minHeight: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <div
              role="img"
              aria-label={`Daily detection heatmap for ${year}; busiest month ${MONTHS[busiest]}`}
              style={{ display: "grid", gridTemplateRows: "repeat(7, 11px)", gridAutoFlow: "column", gridAutoColumns: "11px", gap: "3px", width: "max-content" }}
            >
              {Array.from({ length: leadingBlanks }, (_, i) => (
                <span key={`b${i}`} />
              ))}
              {yearDays.map((d) => (
                <span
                  key={d.date}
                  title={`${d.date}: ${d.count} detections`}
                  style={{ background: viridis(d.count, maxDay), borderRadius: "2px" }}
                />
              ))}
            </div>
          </div>
          <Legend />
        </div>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Monthly fire frequency · all years</h2>
            <p>Select a month to compare it with the same month in other years. Peak season columns are marked ▲.</p>
          </div>
        </div>
        <div className="ember-map-layout" style={{ display: "block", padding: "20px", minHeight: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "separate", borderSpacing: "3px", fontSize: "10px" }}>
              <thead>
                <tr>
                  <th />
                  {MONTHS.map((m, i) => (
                    <th key={m} scope="col" style={{ ...mono, fontWeight: PEAK.includes(i) ? 700 : 400, color: PEAK.includes(i) ? "var(--foreground)" : mono.color }}>
                      {m}
                      {PEAK.includes(i) ? " ▲" : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {YEARS.map((y) => (
                  <tr key={y}>
                    <th scope="row" style={{ ...mono, paddingRight: "6px", fontWeight: y === year ? 700 : 400 }}>
                      {y}
                    </th>
                    {MONTHLY.get(y)!.map((v, m) => {
                      const selected = y === year && m === month;
                      return (
                        <td key={m} style={{ padding: 0 }}>
                          <button
                            type="button"
                            disabled={v === null}
                            aria-pressed={selected}
                            aria-label={`${MONTHS[m]} ${y}: ${v ?? "no"} detections`}
                            onClick={() => {
                              setYear(y);
                              setMonth(m);
                            }}
                            style={{
                              width: "44px",
                              height: "28px",
                              borderRadius: "3px",
                              background: v === null ? "transparent" : viridis(v, MAX_MONTH),
                              color: v !== null && v / MAX_MONTH >= 4 / VIRIDIS.length ? "#111" : "#fff",
                              outline: selected ? "2px solid var(--foreground)" : "none",
                              outlineOffset: "1px",
                              border: v === null ? "1px dashed var(--border)" : "none",
                              fontFamily: "var(--font-mono)",
                              fontSize: "9px",
                              cursor: v === null ? "default" : "pointer",
                            }}
                          >
                            {v ?? ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Legend />
          <p style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "10px" }}>
            Satellite detections are thermal anomalies, not confirmed fires. Counts depend on cloud cover and overpass timing.
          </p>
        </div>
      </section>
    </EmberShell>
  );
}

function Legend() {
  return (
    <div style={{ ...mono, display: "flex", alignItems: "center", gap: "4px", marginTop: "12px" }}>
      <span>Fewer</span>
      <span style={{ width: "11px", height: "11px", borderRadius: "2px", background: "var(--muted)" }} />
      {VIRIDIS.map((c) => (
        <span key={c} style={{ width: "11px", height: "11px", borderRadius: "2px", background: c }} />
      ))}
      <span>More</span>
    </div>
  );
}
