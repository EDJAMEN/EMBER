"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmberShell } from "@/components/ember-shell";
import { ALERTS, type AlertItem } from "@/lib/hotspots";

type Level = "all" | AlertItem["threatLevel"];

export function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>(ALERTS);
  const [filter, setFilter] = useState<Level>("all");
  const [activeModal, setActiveModal] = useState<AlertItem | null>(null);

  const toggleDispatch = (id: string) =>
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, dispatched: !a.dispatched } : a)));

  const filtered = alerts.filter((a) => filter === "all" || a.threatLevel === filter);
  const countOf = (level: AlertItem["threatLevel"]) =>
    alerts.filter((a) => a.threatLevel === level).length;

  return (
    <EmberShell active="alerts" title="Alerts">
      <section className="ember-page-heading">
        <div>
          <div className="ember-eyebrow">
            <span /> DRRMC EARLY RESPONSE <span className="ember-eyebrow-date">/ BUKIDNON</span>
          </div>
          <h1>
            Settlement proximity alerts<span>.</span>
          </h1>
          <p>Sample proximity tiers computed against populated zones.</p>
        </div>
        <Button
          variant="outline"
          className="ember-export-button"
          onClick={() => setAlerts((prev) => prev.map((a) => ({ ...a, dispatched: true })))}
        >
          Broadcast bulletin
        </Button>
      </section>

      <section className="ember-stat-grid" aria-label="Threat tiers">
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>CRITICAL (&lt; 3 KM)</span>
            <span className="ember-pulse-dot" />
          </div>
          <div className="ember-stat-number">{countOf("CRITICAL")}</div>
          <div className="ember-stat-foot">
            <span>Immediate dispatch required</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>ELEVATED (3 – 6 KM)</span>
          </div>
          <div className="ember-stat-number">{countOf("ELEVATED")}</div>
          <div className="ember-stat-foot">
            <span>Containment unit on standby</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>ADVISORY (6 – 10 KM)</span>
          </div>
          <div className="ember-stat-number">{countOf("ADVISORY")}</div>
          <div className="ember-stat-foot">
            <span>Situational advisory active</span>
          </div>
        </article>
        <article className="ember-stat">
          <div className="ember-stat-top">
            <span>DISPATCHED</span>
          </div>
          <div className="ember-stat-number">{alerts.filter((a) => a.dispatched).length}</div>
          <div className="ember-stat-foot">
            <span>Units confirmed out</span>
          </div>
        </article>
      </section>

      <section className="ember-map-section">
        <div className="ember-section-heading">
          <div>
            <h2>Active alerts</h2>
            <p>Sample data · live feed not connected</p>
          </div>
          <div className="ember-window-selector" aria-label="Threat filter">
            {(["all", "CRITICAL", "ELEVATED", "ADVISORY"] as Level[]).map((level) => (
              <button
                type="button"
                key={level}
                aria-pressed={filter === level}
                className={filter === level ? "selected" : ""}
                onClick={() => setFilter(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gap: "12px",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
          }}
        >
          {filtered.map((alertItem) => (
            <article key={alertItem.id} className="ember-selected-detail" style={{ margin: 0 }}>
              <div className="ember-detail-kicker">
                <span>{alertItem.threatLevel}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)" }}>
                  {alertItem.id}
                </span>
              </div>
              <div className="ember-detail-title">{alertItem.settlement}</div>
              <p>
                {alertItem.municipality} · {alertItem.distanceKm.toFixed(1)} km from hotspot #
                {alertItem.hotspotId}
              </p>
              <div className="ember-detail-stats">
                <span>Detected {alertItem.timestamp}</span>
                <span>
                  {alertItem.source} · {alertItem.brightness} K
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <Button
                  variant="outline"
                  size="sm"
                  className="ember-layer-button"
                  onClick={() => setActiveModal(alertItem)}
                >
                  Details
                </Button>
                <Button
                  variant={alertItem.dispatched ? "secondary" : "default"}
                  size="sm"
                  onClick={() => toggleDispatch(alertItem.id)}
                >
                  {alertItem.dispatched ? "✓ Dispatched" : "Dispatch unit"}
                </Button>
              </div>
            </article>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="ember-no-results">No alerts at this threat level.</div>
        )}
      </section>

      {activeModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            display: "grid",
            placeItems: "center",
            background: "color-mix(in oklab, var(--foreground) 45%, transparent)",
            padding: "16px",
          }}
          onClick={() => setActiveModal(null)}
        >
          <div
            className="ember-layer-popover"
            style={{ position: "static", width: "min(480px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div>
              <b>DRRMC Dispatch Bulletin — {activeModal.id}</b>
              <button aria-label="Close" onClick={() => setActiveModal(null)}>
                ✕
              </button>
            </div>
            <p style={{ fontSize: "11px", fontFamily: "var(--font-mono)" }}>
              TARGET: {activeModal.settlement} ({activeModal.municipality})<br />
              PROXIMITY: {activeModal.distanceKm} km
              <br />
              SENSOR: NASA {activeModal.source} | CONFIDENCE: {activeModal.confidence}
              <br />
              THERMAL: {activeModal.brightness} Kelvin
            </p>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "10px" }}
            >
              <Button variant="outline" size="sm" onClick={() => setActiveModal(null)}>
                Close
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  toggleDispatch(activeModal.id);
                  setActiveModal(null);
                }}
              >
                Confirm dispatch
              </Button>
            </div>
          </div>
        </div>
      )}
    </EmberShell>
  );
}
