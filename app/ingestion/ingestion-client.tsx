"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmberShell } from "@/components/ember-shell";
import { SATELLITES, SYNC_LOGS } from "@/lib/hotspots";

const STEPS = [
  {
    step: "STEP 01",
    title: "FIRMS polling",
    body: "Ingests rolling 24h & 48h CSV/JSON feeds.",
    color: "var(--primary)",
  },
  {
    step: "STEP 02",
    title: "Coordinate ordering",
    body: "Flips [Lat, Lon] into POINT(Lon Lat), SRID 4326.",
    color: "var(--ember-amber)",
  },
  {
    step: "STEP 03",
    title: "Confidence normalization",
    body: "Maps MODIS 0–100% and VIIRS l/n/h to low/medium/high.",
    color: "var(--ember-green)",
  },
  {
    step: "STEP 04",
    title: "Spatial deduplication",
    body: "Consolidates overlapping MODIS (1km) & VIIRS (375m) signals.",
    color: "var(--ember-sky)",
  },
  {
    step: "STEP 05",
    title: "Idempotent upsert",
    body: "ON CONFLICT skip; no duplicate records on repeat pulls.",
    color: "var(--ember-coral)",
  },
];

export function IngestionPage() {
  const [logs, setLogs] = useState<string[]>(SYNC_LOGS);
  const [syncing, setSyncing] = useState(false);

  // shortcut: simulated run, no backend. Wire to a sync endpoint when connected.
  const triggerSync = () => {
    setSyncing(true);
    setTimeout(() => {
      const now = new Date().toISOString().substring(11, 19);
      setLogs((prev) => [
        `[${now} UTC] [MANUAL_SYNC] Simulated FIRMS poll for bounding box [7.3, 124.5, 8.6, 125.5] (Bukidnon)...`,
        `[${now} UTC] [DB_STATUS] 0 new duplicates skipped, 6 new hotspots staged (sample).`,
        ...prev,
      ]);
      setSyncing(false);
    }, 1200);
  };

  return (
    <EmberShell active="ingestion" title="Ingestion">
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> PIPELINE SIMULATION
          </div>
          <h1>
            NASA FIRMS ingestion<span>.</span>
          </h1>
          <p>Raw FIRMS payloads are transformed, deduplicated, and stored in PostGIS.</p>
        </div>
        <div className="ember-page-actions">
          <Button
            variant="outline"
            className="ember-export-button"
            onClick={triggerSync}
            disabled={syncing}
          >
            {syncing ? "Syncing..." : "Trigger manual ingest"}
          </Button>
        </div>
      </section>

      <section className="ember-stat-grid" aria-label="Satellite feeds">
        {SATELLITES.map((sat) => (
          <article className="ember-stat" key={sat.name}>
            <div className="ember-stat-top">
              <span>{sat.name}</span>
              <span className="ember-pulse-dot" />
            </div>
            <div style={{ fontSize: "12px", fontWeight: 700 }}>{sat.sensor}</div>
            <div className="ember-stat-foot">
              <span>Spatial res: {sat.resolution}</span>
              <span>Synced: {sat.lastSync}</span>
            </div>
          </article>
        ))}
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Harmonization pipeline</h2>
            <p>How raw FIRMS payloads are transformed before storage</p>
          </div>
        </div>
        <div className="ember-panel">
          <div
            style={{
              display: "grid",
              gap: "10px",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            }}
          >
            {STEPS.map((s) => (
              <div key={s.step}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "9px",
                    fontWeight: 700,
                    color: s.color,
                  }}
                >
                  {s.step}
                </span>
                <h4 style={{ fontSize: "12px", fontWeight: 650, margin: "4px 0" }}>{s.title}</h4>
                <p style={{ fontSize: "10px", color: "var(--muted-foreground)" }}>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Ingestion log stream</h2>
            <p>Daemon output</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ember-layer-button"
            onClick={() => setLogs([])}
          >
            Clear
          </Button>
        </div>
        <div className="ember-panel">
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "10px",
              display: "grid",
              gap: "6px",
              maxHeight: "280px",
              overflowY: "auto",
            }}
          >
            {logs.map((log, index) => (
              <div
                key={index}
                style={{
                  color:
                    log.includes("POSTGIS") || log.includes("COMPLETE")
                      ? "var(--ember-green)"
                      : log.includes("HARMONIZER")
                        ? "var(--ember-amber)"
                        : "var(--muted-foreground)",
                }}
              >
                {log}
              </div>
            ))}
            {logs.length === 0 && (
              <span style={{ color: "var(--muted-foreground)" }}>
                Log cleared. Trigger a sync to generate entries.
              </span>
            )}
          </div>
        </div>
      </section>
    </EmberShell>
  );
}
