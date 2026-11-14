"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmberShell } from "@/components/ember-shell";
import { HOTSPOTS, type Confidence, type SensorSource } from "@/lib/hotspots";

function toCsv() {
  const header = "id,source,confidence,brightness,acquired,lat,lng,settlement,distance_km";
  const rows = HOTSPOTS.map((h) =>
    [
      h.id,
      h.source,
      h.confidence,
      h.brightness,
      `${h.acqDate} ${h.acqTime}`,
      h.lat,
      h.lng,
      `"${h.settlement}"`,
      h.proximityKm,
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

export function DetectionsPage() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"all" | SensorSource>("all");
  const [confidence, setConfidence] = useState<"all" | Confidence>("all");

  const filtered = useMemo(
    () =>
      HOTSPOTS.filter((h) => {
        const query = search.toLowerCase();
        const matchSearch =
          !query ||
          `${h.settlement} ${h.municipality} ${h.id} ${h.lat} ${h.lng}`
            .toLowerCase()
            .includes(query);
        return (
          matchSearch &&
          (source === "all" || h.source === source) &&
          (confidence === "all" || h.confidence === confidence)
        );
      }),
    [search, source, confidence],
  );

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv()], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ember-bukidnon-detections.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <EmberShell active="detections" title="Detections">
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> HARMONIZED FEED
          </div>
          <h1>
            Thermal hotspot detections<span>.</span>
          </h1>
          <p>NASA MODIS &amp; VIIRS telemetry normalized for spatial analysis.</p>
        </div>
        <div className="ember-page-actions">
          <Button variant="outline" className="ember-export-button" asChild>
            <Link href="/">View on live map</Link>
          </Button>
          <Button variant="outline" className="ember-export-button" onClick={exportCsv}>
            <Download size={15} /> Export CSV
          </Button>
        </div>
      </section>

      <section className="ember-stat-grid" aria-label="Detection metrics">
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>TOTAL HOTSPOTS</span>
          </div>
          <div className="ember-stat-number">{filtered.length}</div>
          <div className="ember-stat-foot">
            <span>Across active filters</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>HIGH SEVERITY</span>
          </div>
          <div className="ember-stat-number">
            {filtered.filter((d) => d.confidence === "high").length}
          </div>
          <div className="ember-stat-foot">
            <span>≥ 80% / &apos;h&apos; normalized</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>SETTLEMENT THREAT (&lt;3KM)</span>
          </div>
          <div className="ember-stat-number">
            {filtered.filter((d) => d.proximityKm < 3).length}
          </div>
          <div className="ember-stat-foot">
            <span>Requires DRRMC alert</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>MAX TEMPERATURE</span>
          </div>
          <div className="ember-stat-number">
            352.0<span className="ember-stat-unit"> K</span>
          </div>
          <div className="ember-stat-foot">
            <span>Kelvin brightness</span>
          </div>
        </article>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div
            className="ember-map-search"
            style={{ position: "static", width: "min(340px, 100%)" }}
          >
            <input
              aria-label="Search detections"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search settlement, record #, coords..."
            />
          </div>
          <div className="ember-map-heading-actions">
            <div className="ember-window-selector" aria-label="Source filter">
              {(["all", "VIIRS", "MODIS"] as const).map((s) => (
                <button
                  type="button"
                  key={s}
                  aria-pressed={source === s}
                  className={source === s ? "selected" : ""}
                  onClick={() => setSource(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="ember-window-selector" aria-label="Confidence filter">
              {(["all", "high", "medium", "low"] as const).map((c) => (
                <button
                  type="button"
                  key={c}
                  aria-pressed={confidence === c}
                  className={confidence === c ? "selected" : ""}
                  onClick={() => setConfidence(c)}
                  style={{ textTransform: "capitalize" }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="ember-panel">
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
                  <th style={{ padding: "10px 12px" }}>ID</th>
                  <th style={{ padding: "10px 12px" }}>Sensor</th>
                  <th style={{ padding: "10px 12px" }}>Confidence</th>
                  <th style={{ padding: "10px 12px" }}>Brightness</th>
                  <th style={{ padding: "10px 12px" }}>Acquired</th>
                  <th style={{ padding: "10px 12px" }}>Point (Lon, Lat)</th>
                  <th style={{ padding: "10px 12px" }}>Settlement proximity</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700 }}>#{item.id}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span
                        className={
                          item.confidence === "high" ? "confidence-high" : "confidence-nominal"
                        }
                        style={{
                          borderRadius: "var(--radius-chip)",
                          padding: "3px 6px",
                          fontFamily: "var(--font-mono)",
                          fontSize: "9px",
                          fontWeight: 700,
                        }}
                      >
                        {item.source}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textTransform: "capitalize" }}>
                      {item.confidence}{" "}
                      <span style={{ color: "var(--muted-foreground)" }}>
                        ({item.rawConfidence})
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }}>{item.brightness} K</td>
                    <td style={{ padding: "10px 12px", color: "var(--muted-foreground)" }}>
                      {item.acqDate} {item.acqTime}
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)" }}>
                      POINT({item.lng} {item.lat})
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {item.settlement} · <b>{item.proximityKm.toFixed(1)} km</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="ember-no-results">No detections match the selected filters.</div>
            )}
          </div>
        </div>
      </section>
    </EmberShell>
  );
}
