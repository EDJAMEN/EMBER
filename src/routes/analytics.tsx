import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { EmberShell } from "@/components/ember-shell";
import { DAILY_TREND, MUNICIPALITIES } from "@/lib/hotspots";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [{ title: "Analytics | EMBER" }],
  }),
  component: AnalyticsPage,
});

const BREAKDOWN = [
  {
    label: "HIGH CONFIDENCE (≥80% / 'h')",
    value: "38% (284)",
    width: "38%",
    color: "var(--ember-coral)",
  },
  {
    label: "MEDIUM CONFIDENCE (30–79% / 'n')",
    value: "46% (344)",
    width: "46%",
    color: "var(--ember-amber)",
  },
  {
    label: "LOW CONFIDENCE (<30% / 'l')",
    value: "16% (119)",
    width: "16%",
    color: "var(--muted-foreground)",
  },
];

function AnalyticsPage() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const max = Math.max(...DAILY_TREND.map((d) => d.viirs + d.modis));

  return (
    <EmberShell active="analytics" title="Analytics">
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> TELEMETRY INTELLIGENCE <span className="ember-eyebrow-date">/ BUKIDNON</span>
          </div>
          <h1>
            Burn-zone analytics<span>.</span>
          </h1>
          <p>Sample ingestion trends, severity mix, and settlement risk index.</p>
        </div>
        <div className="ember-window-selector" aria-label="Time range">
          {(["24h", "7d", "30d"] as const).map((r) => (
            <button
              type="button"
              key={r}
              aria-pressed={range === r}
              className={range === r ? "selected" : ""}
              onClick={() => setRange(r)}
            >
              {r}
            </button>
          ))}
        </div>
      </section>

      <section className="ember-stat-grid" aria-label="Analytics metrics">
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>TOTAL HOTSPOTS ({range.toUpperCase()})</span>
          </div>
          <div className="ember-stat-number">747</div>
          <div className="ember-stat-foot">
            <span className="ember-change ember-up">▲ +12%</span>
            <span>from previous window</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>EST. BURN SCAR AREA</span>
          </div>
          <div className="ember-stat-number">
            3,420<span className="ember-stat-unit"> ha</span>
          </div>
          <div className="ember-stat-foot">
            <span>VIIRS 375m polygon perimeter</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>PEAK RADIATIVE POWER</span>
          </div>
          <div className="ember-stat-number">
            84.6<span className="ember-stat-unit"> MW</span>
          </div>
          <div className="ember-stat-foot">
            <span>Max recorded FRP intensity</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>SETTLEMENTS AT RISK</span>
          </div>
          <div className="ember-stat-number">
            5<span className="ember-stat-unit"> towns</span>
          </div>
          <div className="ember-stat-foot">
            <span>Within 3 km of thermal cluster</span>
          </div>
        </article>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Daily ingestion volume</h2>
            <p>VIIRS 375m vs MODIS 1km detection counts</p>
          </div>
        </div>
        <div className="ember-map-layout" style={{ display: "block", padding: "20px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: "12px", height: "220px" }}>
            {DAILY_TREND.map((d) => {
              const total = d.viirs + d.modis;
              return (
                <div
                  key={d.day}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                    height: "100%",
                    justifyContent: "flex-end",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {total}
                  </span>
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "44px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "2px",
                    }}
                  >
                    <div
                      style={{
                        height: `${(d.viirs / max) * 140}px`,
                        background: "var(--ember-sky)",
                        borderRadius: "3px 3px 0 0",
                      }}
                      title={`VIIRS ${d.viirs}`}
                    />
                    <div
                      style={{
                        height: `${(d.modis / max) * 140}px`,
                        background: "var(--ember-amber)",
                        borderRadius: "0 0 3px 3px",
                      }}
                      title={`MODIS ${d.modis}`}
                    />
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "9px",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {d.day}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Confidence severity breakdown</h2>
            <p>Normalized telemetry across burn zones</p>
          </div>
        </div>
        <div className="ember-map-layout" style={{ display: "block", padding: "20px" }}>
          {BREAKDOWN.map((row) => (
            <div key={row.label} style={{ marginBottom: "14px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "var(--font-mono)",
                  fontSize: "9px",
                  marginBottom: "5px",
                }}
              >
                <span style={{ fontWeight: 700 }}>{row.label}</span>
                <span>{row.value}</span>
              </div>
              <div
                style={{
                  height: "8px",
                  background: "var(--muted)",
                  borderRadius: "99px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: row.width,
                    background: row.color,
                    borderRadius: "99px",
                  }}
                />
              </div>
            </div>
          ))}
          <p style={{ fontSize: "10px", color: "var(--muted-foreground)", marginTop: "6px" }}>
            De-duplication: <b>312 overlapping signals</b> consolidated, preventing redundant
            dispatches.
          </p>
        </div>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Vulnerable settlement risk index</h2>
            <p>Ranked by clusters within 10 km</p>
          </div>
        </div>
        <div className="ember-map-layout" style={{ display: "block", minHeight: 0 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", textAlign: "left", fontSize: "11px" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    color: "var(--muted-foreground)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    textTransform: "uppercase",
                  }}
                >
                  <th style={{ padding: "10px 12px" }}>Municipality</th>
                  <th style={{ padding: "10px 12px" }}>Active clusters</th>
                  <th style={{ padding: "10px 12px" }}>Peak brightness</th>
                  <th style={{ padding: "10px 12px" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {MUNICIPALITIES.map((m) => (
                  <tr key={m.name} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 650 }}>{m.name}</td>
                    <td style={{ padding: "10px 12px", color: "var(--primary)", fontWeight: 700 }}>
                      {m.activeFires} clusters
                    </td>
                    <td style={{ padding: "10px 12px" }}>{m.highestBrightness}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        className={m.risk === "CRITICAL" ? "confidence-high" : "confidence-nominal"}
                        style={{
                          borderRadius: "3px",
                          padding: "3px 6px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          fontWeight: 700,
                        }}
                      >
                        {m.risk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </EmberShell>
  );
}
